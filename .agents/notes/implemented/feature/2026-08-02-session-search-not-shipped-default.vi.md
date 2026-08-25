# Agent Note: Tool tìm kiếm session không phải là mặc định được ship

Status: implemented

[English](2026-08-02-session-search-not-shipped-default.md) | Tiếng Việt

## Vấn đề

[Quyết định về bảng kê được ship](2026-07-31-even-out-shipped-tool-rosters.md) đã đặt `tool-session-query` thành dòng mặc định của [`cordis.patch.yml`](../../../../packages/bundle/base/cordis.patch.yml) dùng chung, khiến TUI và surface Web được ship phơi năm tool tìm kiếm session này (`session_search`, `session_event_search`, `session_trace`, `session_event_trace`, `session_event_read`) ra cho model. Điều đó mâu thuẫn với [quyết định về tool truy vấn session hướng model](2026-07-24-model-facing-session-query-tools.md), vốn giữ lập trường phải bật tường minh, và README của package ghi lại điều đó là «shipped host compositions do not mount it by default». Mặc định này còn ship kèm một đoạn prompt dạy model một quy trình tìm kiếm công việc đã qua mà không người dùng nào yêu cầu.

## Quyết định

Các surface TUI, Web và headless được ship đều không gắn `@deepseek-ai/dsh-tool-session-query`, và các agent preset được ship cũng không chứa nó. Bên tiêu thụ này vẫn ở dạng opt-in, đúng như quyết định về tool truy vấn session hướng model đã nêu: [`session-query.cordis.yml`](../../../../examples/acp-agent/session-query.cordis.yml) của ví dụ ACP (Agent Client Protocol) cùng file snapshot đối ứng của nó vẫn là tham chiếu để gắn, và các tổ hợp tùy chỉnh cũng có thể gắn package này kèm theo policy timeout và spill.

Bản thân service `ctx.sessionQuery` vẫn được gắn. `session-query-sqlite` vẫn là một dòng của base, và `session-reference` của TUI tiêu thụ nó để hiện thực `/resume`; chỉ mục toàn văn của nó mặc định tắt (`openAt: never`, xem [quyết định opt-in tìm kiếm nội dung](../architecture/2026-08-13-session-content-search-opt-in.md)), còn overlay Web giữ lại lựa chọn chỉ mục trong bộ nhớ cho các bản triển khai có bật tìm kiếm nội dung. Thứ duy nhất bị gỡ bỏ là bên tiêu thụ hướng model.

## Các phương án thay thế đã cân nhắc

- **Gỡ luôn cả chỉ mục `session-query-sqlite`** — bác bỏ, vì `/resume` và ô tìm kiếm nội dung của Web tiêu thụ trực tiếp `ctx.sessionQuery`; chúng là tính năng của host, không phải tool của model, nên gỡ provider sẽ làm hỏng chúng.
- **Giữ dòng đó, nhưng tắt nó trong từng overlay** — bác bỏ, vì một dòng base bị tắt vẫn ship kèm dependency, và chỉ một dòng là có thể bật lại dễ dàng; lập trường opt-in đã được ghi lại đòi hỏi bên tiêu thụ không xuất hiện trên các surface được ship, lấy ví dụ ACP làm tham chiếu để gắn.
- **Chỉ gắn trên TUI** — bác bỏ, vì base dùng chung là một tập dòng chung cho mọi surface; việc gắn riêng theo surface sẽ tái lập lại sự phân mảnh bảng kê mà quyết định về bảng kê được ship đã xóa bỏ.

## Hệ quả

Cả hai surface quay về đúng hai mươi tool vô điều kiện như nhau (cộng thêm `glob`/`grep` khi có ripgrep), và năm schema tìm kiếm session cùng đoạn prompt của chúng cũng rời khỏi request mặc định. Test tổ hợp được ship trên cả hai surface đều cố định danh mục nhỏ hơn này, nên việc thêm lại tìm kiếm session làm mặc định sẽ chạm đúng những test đó. Người dùng muốn có tìm kiếm session thì gắn bên tiêu thụ này từ overlay cá nhân hoặc từ ví dụ ACP, và thêm dependency ngay tại nơi gắn.
