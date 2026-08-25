# Agent Note: Tổ chức lại các nhóm packages/ theo cụm đã đo lường thực tế

Status: implemented

[English](2026-07-29-package-regrouping.md) | Tiếng Việt

## Vấn đề

Cấu trúc phân cấp hai tầng `packages/<group>/<pkg>` ([quyết định gốc](../../archived/architecture/2026-06-20-package-hierarchy.md)) đã bị lệch kể từ tháng 6: khi đó có 167 package nằm trong 42 nhóm, một số ranh giới nhóm đã không còn khớp với cụm thực tế của các package đó.

- `ui/` trộn lẫn bốn mặt phẳng không liên quan tới nhau: kênh terminal của con người (`tui`), nửa server JSON-RPC của SDK (`jsonrpc`, dependency ngang hàng (peer dependency) của nó với `dsh-sdk-protocol` trói nó vào stack giao tiếp của SDK), seam tương tác người-máy (`user-questions`, `user-approval`, `permission`, `tool-ask-user`, `commands`), và keo boot không liên quan tới kênh nào (`app-boot`). README của chính nó chỉ có thể liệt kê từng cái trong mớ hỗn tạp này, chứ không nói ra được một trách nhiệm thống nhất nào.
- Họ session bị chia cắt trong năm nhóm — `session-persistence/`, `session-projection/`, `session-query/`, `session-title/` và `telemetry/` — trong khi cạnh dependency đo được thực tế lại nối chúng thành một khối (query → persistence, title → projection, projection → persistence; xem [docs/module-graph.md](../../../../docs/module-graph.md)).
- Nhóm `timeout/` dùng cho guard tool call trùng tên với tool promise dùng chung `util/timeout`.
- `cordis/` lấy tên framework mà mọi package đều dựa vào để đặt tên cho nhóm của chính nó, nên cái tên này hoàn toàn không có tính phân biệt; package duy nhất trong nhóm, `tool-cordis`, là bộ công cụ tự sửa đổi (self-modification) runtime.

Nguyên tắc chỉ đạo cho việc tổ chức lại nhóm lần này: **các package có cụm chặt chẽ thì ở chung một nhóm.** Việc phân cụm dựa trên số liệu đo lường thực tế (cạnh dependency ngang hàng và co-change), chứ không phải theo chủ đề. Một họ seam đơn lẻ có thể tự thành một nhóm nhỏ; hình thái thất bại cần tránh là một nhóm tạp nham mà cái tên không khái quát được một trách nhiệm duy nhất nào.

## Quyết định

Năm quyết định tổ chức lại vẫn còn hiệu lực; mọi nhóm còn lại đều giữ nguyên ranh giới và nội dung trước đó (phân tích dependency xác nhận từng họ năng lực — `shell/`, `terminal/`, `code-runtime/`, `sandbox/`, `subprocess/`, `fs/`, `lsp/`, `web/`, `skill/` và các nhóm còn lại — vốn dĩ đã được chia đúng). Quyết định thứ sáu ban đầu đã gom bộ khởi tạo dự án SDK, tool launcher và package JSON-RPC runtime vào `scaffold/`; quyết định [gỡ bỏ bộ công cụ chưa phát hành này](../simplification/2026-08-11-remove-sdk-project-toolchain.md) đã xóa tool dự án, và chuyển ba package runtime còn lại sang `sdk/`. [Quy ước đặt tên repo](2026-08-11-repository-naming-contract-and-rename-ledger.md) sau này chịu trách nhiệm về tên nhóm `shell/`, `terminal/` và `extensions/`, cùng hai tên package mà quyết định này từng hoãn lại.

| Nhóm | Thành viên (tên thư mục) | Nguồn gốc |
|---|---|---|
| `session/` | session-persistence, session-persistence-jsonl, session-persistence-sqlite, session-checkpoint-policy, session-projection, session-projection-cache, session-title, session-title-llm, session-title-first-prompt-llm, session-title-all-prompts-llm, session-telemetry, session-telemetry-otel | `session-persistence/` + `session-projection/` + `session-title/` + `telemetry/` |
| `interaction/` | user-questions, user-approval, permission-presets, tool-ask-user, commands, tui | `ui/` |
| `boot/` | app-boot | `ui/` |
| `guard/` | repeat-tool-reminder, timeout-policy | `guard/` + `timeout/` |
| `extensions/` | tool-cordis | `cordis/` |

- **`session/`** là mặt phẳng dữ liệu session bền vững: seam persistence cùng các backend và chính sách checkpoint của nó, phần chiếu (projection) gấp (fold) giá trị đầy đủ từ log đó ra và cung cấp ra ngoài, tiêu đề dựa trên log, cùng việc báo cáo OTel. Bản thân việc gấp tiêu đề là một cấu kiện chịu lực ở phía đọc (`session-query` khai báo dependency ngang hàng với `dsh-session-title`), nên tiêu đề thuộc về mặt phẳng dữ liệu, chứ không phải một khu phụ thuộc kiểu "service dẫn xuất". Việc dùng cái tên đơn giản này là có chủ đích (tên phải giống như tên do con người đặt); package `core/session` bên cạnh vẫn là service thời gian thực nằm thường trực trong bộ nhớ, còn nhóm này là họ persistence xoay quanh nó. `session-query/` vẫn giữ là một nhóm độc lập: mặt đọc/tool này tự mang theo model tool và backend SQLite FTS riêng, việc tiêu thụ nó không phụ thuộc vào chi tiết nội bộ của persistence.
- **`interaction/`** là mặt phẳng cộng tác người-máy cộng với kênh terminal đáp ứng nó: seam hỏi/duyệt, preset quyền, tool `ask_user_question` hướng tới model, registry lệnh của con người (`plan-mode` và `command-goal` đã tiêu thụ `commands` cùng các seam tương tác chung với nhau), và `tui` — kênh tương tác này là provider/consumer giàu chức năng nhất của mặt phẳng đó (có cạnh dependency ngang hàng với cả `commands` lẫn `user-questions`), trong khi một nhóm `tui/` chỉ có một package sẽ tiêu tốn một cái tên cấp cao nhất cho đúng một plugin.
- **`boot/`** là một nhóm chỉ có một package nhưng vai trò đầy đủ: keo boot bin dùng chung, không thuộc về bất kỳ kênh hay lắp ráp nào (được tiêu thụ bởi `apps/cli` và các bin demo của `examples/`).
- **`guard/`** giữ nguyên vai trò đã được ghi lại trong tài liệu của nó (guard vệ sinh vòng lặp), và tiếp nhận thêm package cưỡng chế thực thi timeout tool call; nhóm chỉ có một package `timeout/` từng trùng tên với `util/timeout` theo đó bị giải thể.
- **`extensions/`** nói ra vai trò mà `cordis/` đã che khuất: đó là bộ công cụ để agent (tác nhân) kiểm tra và mount plugin trong chính runtime hiện tại của nó, cũng là nơi đáp xuống cho các package tự sửa đổi trong tương lai.

42 nhóm trở thành 39 nhóm; lợi ích nằm ở việc phân cụm đúng và tên khớp với thực chất, không nằm ở việc tăng giảm số lượng.

## Quyết định đặt tên tiếp theo

[Quy ước đặt tên repo](2026-08-11-repository-naming-contract-and-rename-ledger.md) đã giải quyết hai cái tên mà lần di chuyển này cố ý hoãn lại. `@deepseek-ai/dsh-sdk-jsonrpc-server` biểu thị nửa server JSON-RPC của giao thức SDK runtime. `@deepseek-ai/dsh-tool-call-timeout-policy` biểu thị chính xác thao tác mà chính sách này giới hạn, đồng thời giữ nguyên việc nó thuộc về `guard/timeout-policy/`. Các lần đổi tên này sẽ đồng thời gỡ bỏ luôn nhãn `FIXME` chặn phát hành.

## Việc di chuyển đã đụng chạm tới những gì

Việc di chuyển được thực hiện thuần túy bằng `git mv`, lịch sử được lưu giữ nhờ cơ chế phát hiện đổi tên. Việc di chuyển nhóm đã đụng chạm tới: `references` tương đối trong `tsconfig.json` của package bị di chuyển và mục tương ứng ở mỗi bên phụ thuộc (bao gồm cả project references của `apps/cli`); việc gộp tsconfig và ánh xạ đường dẫn; README của từng nhóm; bảng cấu trúc phân cấp trong [packages/README.md](../../../../packages/README.md); sơ đồ bố cục trong `AGENTS.md` gốc; sản phẩm được sinh lại (`docs/module-graph.md`, danh mục có đường dẫn nhúng, và key importer trong lockfile); cùng các tham chiếu `packages/...` lấy gốc repo làm chuẩn trong văn xuôi và script cổng kiểm tra. Mọi tham chiếu đường dẫn nhóm còn lại (cấu hình workspace, glob test, key lint) đều được cổng kiểm tra nghiệm thu tìm ra một cách máy móc thông qua việc báo lỗi lớn tiếng — đây chính là quy tắc "cấu hình sai phải báo lỗi lớn tiếng" của chính repo này.

Việc di chuyển nhóm không đụng chạm tới: tên package npm, import, cấu hình `cordis.yml`, fixture snapshot (dữ liệu chuẩn bị trước cho test), glob của `pnpm-workspace.yaml` và `tsdown` (đều là `packages/*/*`), và manifest (danh sách metadata) runtime Python — tất cả những thứ này đều tham chiếu package theo tên npm.

`client/` và `host/` không nằm trong phạm vi lần này, giữ nguyên không đổi.

## Các phương án thay thế đã từng cân nhắc

**Thùng domain thô** (`exec/` = subprocess+sandbox+bash+pty+code-runtime, `workspace/` = fs+lsp+workspace, `orchestration/` = subagent+workflow+tasks, `knowledge/` = web+skill, `collab/` = plan+todo+goal; khoảng 16 nhóm). Không chấp nhận: đồ thị dependency đo được thực tế mâu thuẫn với các lần gộp này. `sandbox` và `subprocess` là hạ tầng dùng chung được tiêu thụ xuyên các họ khác nhau (có cạnh dependency với bash ×5, fs ×5, pty, lsp, mcp và subagent), giữa `web` ↔ `skill` không có cạnh dependency nào, và các thùng lớn sẽ chỉ tái diễn kiểu tạp nham của `ui/` ở quy mô lớn hơn.

**Tên tầng trừu tượng** (`capability/`, `policy/`, `extension/`, `provider/`). Không chấp nhận: những cái tên này đều tương đương nhau ở chỗ không truyền đạt được ý nghĩa cho từng plugin, và một thùng `capability/` sẽ chứa khoảng 50 package.

**Một lượt đổi tên npm toàn bộ** (mỗi package đổi thành `dsh-<group>-<pkg>`). Không chấp nhận: tên package npm là phẳng, thêm tiền tố nhóm chỉ tạo ra thay đổi giữa import, cấu hình và fixture, mà không đổi lại được lợi ích khử nhập nhằng nào; việc đổi tên có mục tiêu cụ thể được theo dõi bằng FIXME là đủ để bao phủ những trường hợp trùng tên thực sự.

**Hoàn thành luôn việc đổi tên bị hoãn lại bên trong lần tổ chức lại này.** Không chấp nhận: việc đổi tên sẽ khuếch đại xung đột của các PR đang mở lên gấp bội, và phá vỡ tính chất review "chỉ di chuyển thuần túy". Các nhãn FIXME còn lại giữ cho những lần đổi tên này ở dạng mục chặn phát hành có thể nhìn thấy được, để giải quyết dần từng cái bằng các PR nhỏ tiếp theo.

**Chia đôi session** (`session-core/` + `session-utils/`). Không chấp nhận: đặt query vào bên nào cũng không sạch sẽ, hơn nữa `session-core` dễ bị nhầm với `core/session` (cái sau là `dsh-session`, service thời gian thực nằm thường trực trong bộ nhớ, ở lại `core/` không đổi).

**Chia ba session** (`session-store/` + `session-query/` + `session-utils/`). Không chấp nhận: `session-utils/` là một khu phụ thuộc được khoanh vùng bằng điều kiện phủ định ("dẫn xuất, không có cấu kiện chịu lực nào phụ thuộc vào nó") — chính là hình thái tạp nham mà nguyên tắc chỉ đạo cấm, và về mặt sự thật cũng không đứng vững (`session-query` khai báo dependency ngang hàng với `dsh-session-title`). Cái tên ghép bịa ra cũng đọc không giống tên do con người đặt; một nhóm `session/` đơn giản nói đúng cái mà con người sẽ nói. Dù sao thì query vẫn giữ độc lập: đó là mặt đọc được tiêu thụ độc lập, tự mang theo bộ tool và backend riêng.

**Tổ chức lại `ui/` thành một nhóm `channels/` duy nhất** (tui + jsonrpc + acp + seam tương tác + boot). Không chấp nhận: chẳng qua chỉ là cùng một mớ tạp nham đổi tên khác đi — các package này phục vụ bốn mặt phẳng khác nhau, cụm đo được thực tế của `jsonrpc` thuộc về stack giao tiếp SDK, còn `acp/` là kênh transport tự động hóa, không phải kênh của con người.

**Nhóm `tui/` độc lập chỉ có một package.** Không chấp nhận: `tui` là provider/consumer chủ yếu của mặt phẳng tương tác (có cạnh dependency ngang hàng với `commands`, `user-questions`), tiêu tốn một cái tên cấp cao nhất cho đúng một plugin chỉ thêm nhóm chứ không thêm thông tin; nó được gấp vào `interaction/`.

**Chuyển `app-boot` sang `apps/`.** Không chấp nhận: `apps/` là tầng lắp ráp nằm trên tầng package, còn `dsh-app-boot` là một thư viện thuộc tầng package — đưa nó vào `apps/` sẽ đảo lộn phân cấp, và đặt một thư viện workspace ra ngoài glob build `packages/*/*`. Nó vẫn là một package; `boot/` là ngôi nhà với vai trò đầy đủ dành cho nó.

**Chuyển `tool-cordis` vào `core/`.** Không chấp nhận: tự sửa đổi (self-modification) là một seam sản phẩm độc lập, dự kiến sẽ còn phát triển thêm; trunk giữ tinh gọn. Nhóm này ban đầu được đặt tên `self-evolve/`; tên cuối cùng chốt lại thành `extensions/` giản dị hơn.

**Đổi tên `context/` thành `request-context/`.** Không chấp nhận: trong cây thư mục này, nhóm đó nhìn tại chỗ không hề mơ hồ; chi phí cho thay đổi này không đáng.

## Hệ quả

- Năm họ tổ chức lại vẫn còn hiệu lực nắm giữ các thành viên đã liệt kê; các nhóm `ui/`, `telemetry/`, `timeout/`, `cordis/`, `session-persistence/`, `session-projection/`, `session-title/` không còn tồn tại. Bản thân việc tổ chức lại không thay đổi tên npm. Quyết định gỡ bỏ bộ công cụ SDK sau này cố ý thay đổi tập package, và khôi phục `sdk/` làm nơi thuộc về chính xác của ba package SDK runtime. Hai nhãn FIXME ghim lại những lần đổi tên bị hoãn còn sót lại; sau này nếu một nhãn FIXME nào đó được chứng minh là sai, phải gỡ bỏ nó một cách tường minh kèm theo lý do, tuyệt đối không được để nó biến mất âm thầm.
- Kết quả được ghim lại bởi các kiểm tra sau: `pnpm run typecheck`, bộ unit test của mỗi nhóm bị di chuyển, `verify-package-paths`, `verify-md-links` và cặp bản dịch toàn ngữ liệu đều pass trên cây sau khi di chuyển; glob test được khoanh vùng theo nhóm trong `vitest.snapshot.config.ts` được viết lại cùng với việc di chuyển, bộ test thu thập đúng những file test giống hệt như trước khi di chuyển (nếu glob khớp rỗng sẽ âm thầm làm mất độ bao phủ).
- Mỗi PR đang mở có đụng chạm tới file bị di chuyển đều thực hiện một lần rebase vượt qua lần di chuyển này; cơ chế phát hiện đổi tên có thể giải quyết một cách máy móc phần lớn các khối thay đổi.
- Các nhóm chỉ có một package vẫn còn tồn tại (`boot/`, `extensions/`, cùng với các nhóm một package đã có từ trước như `acp/`). Đây là điều được chấp nhận có chủ đích: mỗi nhóm đều là một chỉnh thể có vai trò đầy đủ chứ không phải mảnh vỡ của một họ nào đó, một nhóm nhỏ tên khớp với thực chất còn tốt hơn một lần gộp chỉ có danh mà không có thực.
- Các thư mục vai trò của `sdk/` được ánh xạ tường minh tới tên npm tương ứng của chúng trong `tsconfig.base.json`; trước khi `dsh-sdk-jsonrpc-server` hoàn tất việc đổi tên, ánh xạ của `server/` vẫn mang tính chuyển tiếp.
- **Thay đổi lần này đã đánh đổi những gì:** không mất mát gì về chức năng — thay đổi chỉ liên quan tới việc điều hướng. Thói quen (muscle memory) và các liên kết bên ngoài trỏ tới đường dẫn GitHub cũ sẽ bị hỏng; trong bối cảnh pre-release, chưa có bên tiêu thụ bên ngoài nào, điều này có thể chấp nhận được.
