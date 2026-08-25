# Agent Note: Tổ chức lại package thành cấu trúc phân cấp theo module

Status: implemented
Archived: 2026-07-27

[English](2026-06-20-package-hierarchy.md) | 中文

[Loại bỏ agent dư thừa](../simplification/2026-07-20-remove-stdio-and-echo-agents.md) xóa thẳng interface `support/ui-stdio` ban đầu thay vì migrate nó; [Quyết định ACP chỉ hướng tới tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) đặt ACP dưới `packages/acp/acp`, thay vì nhóm UI hướng tới con người. Quyết định được sở hữu ở đây vẫn là độ sâu thư mục hai cấp thống nhất.

## Vấn đề

`packages/` trước đây phẳng: cả 18 package đều nằm ở `packages/<name>/`, không thể nhìn ra từ đường dẫn liệu một package thuộc về API sản phẩm cốt lõi, một capability seam có thể thay thế, một adapter provider, một tích hợp sản phẩm, hay hạ tầng hỗ trợ ví dụ/test. README của các package mang `FIXME(package-hierarchy)`, `scripts/publint-all.ts` mang `TODO(package-inventory)`, đúng là đánh dấu vấn đề này. Package cốt lõi, tích hợp provider, capability seam, hạ tầng hỗ trợ UI ví dụ, và hạ tầng hỗ trợ replay chỉ dùng cho snapshot đều trông có vẻ cơ bản như nhau.

Đây không chỉ là vấn đề bề ngoài. Vì mỗi package cấp cao nhất trông như thuộc cùng một giao diện công khai, việc loại bỏ trong tương lai trở nên khó khăn hơn, và các script publish/lint/doc buộc phải mã hóa ý định qua chú thích hoặc danh sách tĩnh bảo trì thủ công, thay vì đọc trực tiếp từ bố cục.

## Quyết định

Nhóm các package theo vai trò module, thống nhất ở độ sâu `packages/<group>/<pkg>/`. Thư mục nhóm là container thuần túy (không có `package.json`); mỗi package giữ nguyên tên `@deepseek-ai/dsh-<pkg>` — đây là điều chỉnh về cấu trúc repo và chiến lược bảo trì, không phải đổi tên package.

```text
packages/
  core/                  (product API spine)
    session/
    system-prompt/
    tools/
    agent/
    agent-loop/
  llm/                   (product — capability family)
    llm/
    llm-deepseek/
    llm-pi-ai/
  bash/                  (product — capability family)
    bash/
    bash-local/
    tool-bash/
  session-persistence/   (product — capability family)
    session-persistence/
    session-persistence-jsonl/
    session-persistence-sqlite/
  acp/                   (product automation integration)
    acp/
  ui/                    (human interaction and presentation)
  support/               (dev/test/example infrastructure)
    invariants/
    ui-stdio/
    llm-replay/
```

### Các quyết định vị trí

- **Họ capability dùng lồng cùng tên.** Package interface của một họ nằm ở `packages/<group>/<group>/` (`llm/llm`, `bash/bash`, `session-persistence/session-persistence`), implementation và consumer đứng song song dạng phẳng bên cạnh. Không thêm tầng con `adapters/`/`impls/` — mỗi package nằm đúng ở độ sâu 2, giúp workspace glob giữ được dạng `packages/*/*` gọn gàng, và một wildcard tsconfig `@deepseek-ai/dsh-*` duy nhất có thể resolve mọi package (tên thư mục duy nhất khiến quy tắc first-on-disk-wins không mơ hồ).
- **`session` giữ trong `core/`; persistence tách thành một họ riêng.** Log phiên là API sản phẩm cốt lõi. Backend lưu trữ của nó tạo thành một họ capability song song (`session-persistence/`), đối xứng với `llm/` và `bash/`, thay vì lồng dưới `core/session/`.
- **`agent-loop` nằm trong `core/`.** Nó là implementation cụ thể duy nhất của seam `agent`, nhưng được bàn giao như vòng lặp sản phẩm mặc định của harness, nên nằm cùng chỗ với bộ khung cốt lõi. Plugin vẫn phụ thuộc vào từ vựng của `agent`, không bao giờ phụ thuộc vào `agent-loop`, nên loop vẫn có thể thay thế.
- **Tự động hóa sản phẩm và UI hướng tới con người là hai nhóm tách biệt.** `acp` là tầng vận chuyển sản phẩm nằm dưới `acp/`, còn command, approval, tương tác và adapter trình bày nằm dưới `ui/`. Hạ tầng invariants và replay chỉ dùng cho dev vẫn ở trong `support/`.

### Loại bỏ trùng lặp danh sách package

Danh sách package trước đây được liệt kê trùng lặp ở năm nơi. Bố cục độ sâu 2 thống nhất giúp phần lớn có thể được suy luận ra:

- `tsconfig.base.json` ánh xạ mọi package qua một wildcard `paths` duy nhất `@deepseek-ai/dsh-*` (mỗi nhóm liệt kê một ứng viên), thay cho các mục liệt kê từng package. Cấu hình tổng hợp (`tsconfig.host.json`, `tsconfig.client.json`) tái sử dụng ánh xạ nguồn đó, và mang theo project references tường minh để giữ ranh giới kiểm tra kiểu giữa package/vendor nguyên vẹn. (Ở đây có một chi tiết đáng chú ý: ứng viên path chứa `/*/`, một bộ dò/loại bỏ comment bằng regex ngây thơ sẽ nhầm nó là block comment — đó chính là lý do `scripts/doc-typecheck.ts` đọc cấu hình JSONC qua parser của TypeScript, thay vì tự tay loại bỏ comment.)
- `scripts/publint-all.ts` suy ra danh sách bằng cách đọc cấu trúc phân cấp (`packages/<group>/<pkg>`), giải quyết `TODO(package-inventory)`.
- Trường `references` của project trong cấu hình tổng hợp vẫn là danh sách tường minh — TypeScript project references không có dạng wildcard. Việc sinh các reference này từ manifest (danh sách metadata) được để lại cho công việc sau (xem [Lấy danh mục package qua cơ chế khám phá](../../proposed/process/2026-06-20-discover-package-inventory.md)).

### Rào chắn mới được thêm

Hai cổng kiểm doc-sync/hygiene đảm bảo cấu trúc và các tham chiếu tới nó luôn đúng, khiến việc kiểm tra thủ công cần thiết cho lần tổ chức lại này không phải lặp lại về sau:

- `scripts/verify-package-paths.ts` đánh dấu các tham chiếu `packages/<path>` trong Markdown hoặc comment/chuỗi `.ts`, nếu tham chiếu đó không thể resolve **và** một đoạn đường dẫn nào đó đặt tên một package thực sự tồn tại, tức là nó trỏ tới đường dẫn cũ của một package đã di chuyển. Nếu package được đặt tên trong đường dẫn không tồn tại ở bất kỳ đâu (đề xuất mang tính tiên liệu), thì không bị đánh dấu, nên cổng kiểm này áp dụng thống nhất trên proposed/implemented/rejected.
- `scripts/check-workspace-constraints.ts` khẳng định hình dạng `packages/<group>/<pkg>`: thư mục nhóm không mang `package.json`, và không có package nào nằm phẳng ở gốc hoặc lồng sâu hơn. Tên nhóm vẫn mở — thêm nhóm mới không cần sửa cổng kiểm; chỉ hình dạng độ sâu 2 là cố định.

## Phương án thay thế đã cân nhắc

- **Thêm tầng thứ ba (mỗi họ có `adapters/`/`impls/` riêng)**: bị bác bỏ. Độ sâu 2 thống nhất giúp workspace glob giữ được dạng `packages/*/*` gọn gàng, và một wildcard tsconfig `@deepseek-ai/dsh-*` duy nhất có thể resolve mọi package.
- **Lồng persistence dưới `core/session/`**: bị bác bỏ. Backend lưu trữ tạo thành một họ capability song song, đối xứng với `llm/` và `bash/`, trong khi bản thân log phiên thuộc về API sản phẩm cốt lõi.
- **Đặt `ui-stdio` dưới `ui/`**: bị bác bỏ. Nó từng là hạ tầng hỗ trợ phát triển gắn chặt với ví dụ, không phải giao diện sản phẩm.

## Hậu quả

Lần tổ chức lại này khuấy động import, workspace glob, liên kết tài liệu, tham chiếu build và đường dẫn package trong một thay đổi phối hợp. Sự xáo trộn này được chấp nhận trước khi phát hành (theo lập trường "nền tảng ưu tiên hơn bán kính ảnh hưởng" trong AGENTS.md), vì nó ngăn bố cục phẳng cố định hóa các package hỗ trợ thành hợp đồng sản phẩm, và đây là chi phí một lần: `paths` dạng wildcard, danh sách publint suy ra từ glob, và các cổng kiểm hình dạng nghĩa là thêm một package mới không cần chỉnh sửa cấu trúc bổ sung.
