# Agent Note: Tách ứng dụng ví dụ thành các package độc lập

Status: implemented
Archived: 2026-07-26

[English](2026-06-20-extract-example-app-packages.md) | 中文

## Vấn đề

Thư mục ví dụ đáng lẽ phải *gọn nhẹ* — chỉ chứa phần đấu nối có thể thay đổi của bản demo, chứ không phải hạ tầng của bản demo. Trước thay đổi này, nó lại cồng kềnh. Mỗi ví dụ mang theo một `start.ts` khởi động viết tay, một đoạn hạ tầng mở đầu (`timer`, cùng `logger` + `hmr` (hot module replacement) cần cho demo stdio), ba tham chiếu lồng nhau tới các đoạn YAML dùng chung (`base.yml` / `base-core.yml` / `acp-agent/acp-tail.yml`), và cấu hình `agent-loop`/persistence/system prompt riêng của từng ví dụ. Ứng dụng thực sự — bộ khung dịch vụ mà mỗi agent (tác nhân) cần — bị rải rác trong các file cấu hình lá (leaf config) và những include đó.

Cấu hình lá cũng có phần đầu vào (front door) bị ràng buộc chặt. ACP (Agent Client Protocol) yêu cầu stdout sạch và tạo agent qua `session/new`; còn ứng dụng terminal và Headless thì tạo `main` sẵn từ trước, nhưng契 hợp đồng I/O tiến trình lại khác nhau. Rào chắn duy nhất ngăn tổ hợp sai là cảnh báo bằng chữ trong tài liệu, trong khi ba file `start.ts` lặp lại logic khởi động Loader và vòng đời.

## Quyết định

Mỗi ví dụ giờ **chủ yếu là một lệnh gọi tới một package ứng dụng**, tách theo [seam interface / implementation / consumer](2026-06-13-capability-seams.md) đã có sẵn: **package ứng dụng sở hữu việc kết hợp (composition)**, còn `cordis.yml` lá chỉ sở hữu **các lựa chọn có thể thay thế** (adapter LLM (mô hình ngôn ngữ lớn) nào, bộ thực thi bash nào, model, prompt, thư mục gốc persistence).

- **`@deepseek-ai/dsh-agent-spine-demo`** ([packages/examples/agent-spine-demo](../../../../packages/examples/agent-spine-demo)) kết hợp bộ khung không chứa provider, không chứa bộ thực thi, không chứa UI, và chuyển tiếp cấu hình danh sách agent của agent loop (vòng lặp agent). Việc nó phụ thuộc vào một loop cụ thể là có chủ đích, vì package này kết hợp bộ khung chứ không phải mở rộng bộ khung; thay loop nghĩa là cung cấp một bundle khác.
- **`@deepseek-ai/dsh-tui-demo`**, **`@deepseek-ai/dsh-cli-demo`** và **`@deepseek-ai/dsh-acp-demo`** mỗi cái tự tích hợp vai trò tiến trình của mình. TUI bao gồm UI toàn màn hình và `main` được tạo sẵn; Headless bao gồm driver one-shot và `main` được tạo sẵn; ACP bao gồm bridge và không tạo agent sẵn. Cả ba đều bao gồm persistence JSONL và bỏ qua logger stdout.
- **`start.ts` đã bị loại bỏ.** Mỗi package ứng dụng đều phơi ra một bin; các script `demo:*` gọi nó. Logic khởi động Loader, tải `.env` và guard fail-fast nằm trong package dùng chung [`@deepseek-ai/dsh-app-boot`](../../../../packages/ui/app-boot) (có unit test dưới cổng kiểm coverage theo từng file — xem [Chia sẻ logic khởi động app bin](../simplification/2026-07-04-share-app-bin-boot-glue.md)); entry point tự thực thi gọn nhẹ được kiểm chứng bởi test đường dẫn Loader keyless.
- **Mỗi `cordis.yml` lá được rút gọn** còn backend, công cụ sản phẩm tùy chọn, và một mục app mang cấu hình ứng dụng. TUI và Headless định tuyến lựa chọn model/session tới agent đã tạo sẵn; ACP định tuyến provider/model ban đầu tới bridge.
- **`base.yml`, `base-core.yml` và `acp-agent/acp-tail.yml` đã bị退役 (nghỉ hưu)** — bộ khung dùng chung của chúng giờ nằm trong `dsh-agent-spine-demo`.

`bash-local` và adapter LLM vẫn là **lựa chọn ở lá**: bundle cung cấp `tool-bash` (schema consumer), lá chọn cách triển khai bộ thực thi, nên bộ thực thi sandbox hoặc adapter replay có thể được thay thế mà không cần đụng vào ứng dụng.

### Sửa đổi khi triển khai: `hmr` vẫn là mục ở lá

Đề xuất ban đầu xếp `hmr` vào cụm front door tích hợp sẵn của ứng dụng tương tác. Sau khi đối chiếu với code để xác minh, phát hiện việc tích hợp `hmr` vào package ứng dụng sẽ xung đột với Cordis ở hai điểm, nên được chuyển thành bàn giao dưới dạng **mục `cordis.yml` ở lá**:

1. `@cordisjs/plugin-hmr` là một plugin chỉ dành cho môi trường dev, chỉ chạy trong Loader, chỉ chạy trong tiến trình con — nó cần dịch vụ `loader` đang hoạt động và quyền truy cập module nội bộ của nó, nên chỉ có thể chạy trong tiến trình con `demo:*`/bin thực sự, không thể chạy ở tầng test unit/coverage trong tiến trình.
2. Tầng test trong tiến trình (vitest) thậm chí không thể *import* module `hmr` đã vendor (dạng class-decorator `@Inject` của nó thất bại dưới phép biến đổi (transform) của Vite), nên bất kỳ `apply` nào import tĩnh package đó sẽ không bao giờ thỏa mãn cổng kiểm coverage 100% theo từng file cho hàm main của nó.

Điểm mấu chốt là `hmr` không phải là nguy cơ gây ô nhiễm stdout: việc lỡ thêm mục này vào cấu hình ACP sẽ không phá vỡ khung JSON-RPC. Tất cả ứng dụng đã bàn giao đều bỏ qua console logger stdout; stdout chỉ thuộc về ứng dụng hoặc driver giao thức.

## Phương án thay thế đã cân nhắc

### Vì sao không tiếp tục dùng YAML include dùng chung để quản lý việc đấu nối?

Các include `base*.yml`/`acp-tail.yml` cũ đã loại bỏ trùng lặp *cấu hình*, nhưng YAML include không thể **đóng gói (encapsulate)** sự ràng buộc ở front door — nó chỉ có thể mô tả bằng chú thích và tin tưởng mỗi lá tuân thủ. Nó cũng không thể sở hữu `bin`, nên logic khởi động cứ lặp lại trong ba file `start.ts`. Package đã biến "ứng dụng ACP tuyệt đối không ghi log ra stdout" từ một cảnh báo bằng chữ thành một thuộc tính của sản phẩm bàn giao: không tồn tại mục logger nào ở lá có thể bị ghi sai.

## Xác minh

- Thư mục ví dụ chỉ còn chứa cấu hình, README và test: `start.ts`, phần mở đầu hạ tầng và YAML include dùng chung đã bị loại bỏ.
- `demo:tui`, `demo:headless` và `demo:acp` gọi bin của package ứng dụng.
- Mỗi package mới đều có README và coverage 100% theo từng file; mỗi package ứng dụng còn có một test smoke bin keyless theo đường dẫn Loader thật, để bắt lỗi hỏng hình dạng export được mô tả trong [Postmortem 0001](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md).
- Bộ test replay ACP được khởi động qua bin của package ứng dụng, nên cả việc đấu nối giao thức lẫn hành vi backend đã lắp ráp đều vượt qua ranh giới Loader thật.

## Hậu quả

- **Tính giáo dục của cây plugin trần.** Bộ khung giờ ẩn sau bundle, muốn xem toàn bộ cây nghĩa là phải mở `dsh-agent-spine-demo`. README của package ứng dụng gánh vác trách nhiệm giáo dục này.
- **Thêm một tầng gián tiếp.** "Bản demo này tải những gì?" giờ chuyển từ quét một file YAML đơn lẻ thành đọc một package.

## Liên quan

- Thay thế [Làm cho cấu hình gốc ví dụ dùng chung độc lập với provider](../../rejected/architecture/2026-06-20-providerless-example-base.md): một khi bộ khung được chuyển vào `dsh-agent-spine-demo` và các file `base*.yml` bị xóa, việc đổi tên `base.yml` thành lõi không có provider không còn ý nghĩa.
- Dựa trên cách tách interface/implementation/consumer theo [capability seam](2026-06-13-capability-seams.md) — backend và tầng trình bày vẫn là lựa chọn ở lá; bộ khung là bundle dùng chung.
- Bổ sung cho [Tổ chức lại package thành cấu trúc phân cấp theo module](2026-06-20-package-hierarchy.md): các package app/core mới được xếp vào các nhóm hiện có theo cấu trúc phân cấp đó (`core` chứa bundle bộ khung có thể tái sử dụng, `ui` chứa front door đặc thù của ứng dụng).
- [Loại bỏ agent dư thừa](../simplification/2026-07-20-remove-stdio-and-echo-agents.md) sau đó sở hữu việc tách TUI/Headless cuối cùng, và loại bỏ các lá dạng dòng lệnh và chỉ-mock.
