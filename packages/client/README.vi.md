# client/ — Phía trình duyệt của web GUI

[English](README.md) | Tiếng Việt

Phía trình duyệt của dsh web GUI: khởi động shell, giao tiếp giữa trình duyệt và host, các service UI dùng chung và plugin tính năng. Quy tắc viết xem tại [AGENTS.md](AGENTS.md); nửa host là [`host/`](../host/README.md). Ngoại trừ `test-runtime`, tất cả đều là gói **sản phẩm** tên `@deepseek-ai/dsh-client-<name>`.

| Gói | Mục đích |
|---|---|
| [`web/`](web/README.md) | Khởi động shell trình duyệt từ sơ đồ entry client. |
| [`modules/`](modules/README.md) | Tải các module client phía trình duyệt. |
| [`web-react/`](web-react/README.md) | Kết nối runtime shell với việc render React. |
| [`connection/`](connection/README.md) | Duy trì giao tiếp RPC và truyền sự kiện giữa trình duyệt và host. |
| [`runtime/`](runtime/README.md) | Cung cấp các service client dùng chung cho session, workspace và tổ hợp UI. |
| [`hmr/`](hmr/README.md) | Làm mới plugin client trong quá trình phát triển. |
| [`locale/`](locale/README.md) | Cung cấp tùy chọn bản địa hóa và từ điển thông báo. |
| [`schema-form/`](schema-form/README.md) | Cung cấp xử lý bản nháp theo schema cho trình chỉnh sửa settings. |
| [`test-runtime/`](../test-support/client-runtime/README.md) | Cung cấp hỗ trợ kiểm thử chung trong repo cho các gói tính năng client. |
| [`ui-slots/`](ui-slots/README.md) | Định nghĩa cách đăng ký tính năng UI và các slot mở rộng tổ hợp. |
| [`ui-theme/`](ui-theme/README.md) | Áp dụng chủ đề màu đã chọn. |
| [`ui-primitives/`](ui-primitives/README.md) | Cung cấp các control React, icon và bộ render nội dung dùng chung. |
| [`ui-attachment/`](ui-attachment/README.md) | Cung cấp các thành phần nguyên tử hiển thị đính kèm: thanh hình ảnh bản nháp, gallery tin nhắn và lightbox. |
| [`ui-layout/`](ui-layout/README.md) | Sắp xếp các khu vực chính của ứng dụng. |
| [`ui-sidebar/`](ui-sidebar/README.md) | Hiển thị điều hướng workspace và session. |
| [`ui-workspace/`](ui-workspace/README.md) | Cung cấp giao diện chọn và tạo workspace. |
| [`ui-conversation/`](ui-conversation/README.md) | Hiển thị cuộc hội thoại hiện tại và giao diện nhập của nó. |
| [`ui-tool/`](ui-tool/README.md) | Điều phối cây tool call và các view theo khóa công cụ. |
| [`ui-workflow-run/`](ui-workflow-run/README.md) | Phát lại các lần chạy workflow bền vững thành mục thu gọn lồng trong Chat, và chỉ cung cấp điều hướng cho Session con thời gian thực. |
| [`ui-goal/`](ui-goal/README.md) | Hiển thị và quản lý mục tiêu hiện tại. |
| [`ui-trajectory/`](ui-trajectory/README.md) | Cung cấp thêm view khác cho hoạt động của agent (tác tử). |
| [`ui-commands/`](ui-commands/README.md) | Cung cấp khám phá và phân phối lệnh nhận biết session. |
| [`ui-input-trigger/`](ui-input-trigger/README.md) | Điều phối lệnh nội tuyến và gợi ý tham chiếu. |
| [`ui-skill/`](ui-skill/README.md) | Thêm tham chiếu skill (kỹ năng) vào gợi ý nội tuyến. |
| [`ui-subagent/`](ui-subagent/README.md) | Cung cấp điều hướng subagent (agent con), trạng thái transcript (bản ghi văn bản) con và tham chiếu nội tuyến. |
| [`ui-jobs/`](ui-jobs/README.md) | Liệt kê tác vụ nền của session hiện tại trên thanh tiêu đề session. |
| [`ui-model-selection/`](ui-model-selection/README.md) | Cung cấp lựa chọn model trong giao diện hội thoại. |
| [`ui-permission/`](ui-permission-presets/README.md) | Cấu hình quyền mặc định và chuyển đổi chế độ truy cập của session hiện tại. |
| [`ui-plan/`](ui-plan/README.md) | Hiển thị trạng thái plan mode đang hiệu lực và control thoát của nó. |
| [`ui-settings-plugins/`](ui-settings-plugins/README.md) | Sở hữu phần cài đặt "Plugin", điểm mở rộng tab của nó, và card plugin cấp host plane có thể cấu hình. |
| [`ui-user-questions/`](ui-user-questions/README.md) | Hiển thị các câu hỏi tương tác mà agent yêu cầu. |
| [`ui-agent-preset/`](ui-agent-preset/README.md) | Chọn agent preset cho session, và biên soạn tổ hợp preset. |
| [`ui-settings/`](ui-settings/README.md) | Chứa giao diện settings và các khu vực mở rộng của nó. |
| [`ui-settings-general/`](ui-settings-general/README.md) | Cung cấp phần settings chung. |
| [`ui-settings-models/`](ui-settings-models/README.md) | Cung cấp cấu hình model provider và hướng dẫn cấu hình DeepSeek. |
| [`ui-settings-plugin-inventory/`](ui-settings-plugin-inventory/README.md) | Đóng góp tab manifest Host Loader chỉ đọc vào phần settings "Plugin". |

Mỗi tài liệu con chịu trách nhiệm về quy ước và hành vi chi tiết của chính nó. [Chuẩn hệ thống slot](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) và [Agent Note kiến trúc Web client](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) chịu trách nhiệm về các quyết định tổ hợp và tải liên gói.

Tài liệu tham khảo subsystem là [client-modules.md](../../docs/subsystems/client-modules.md); [chuẩn hệ thống slot](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) là mô hình slot chính thức, [Agent Note kiến trúc web client](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) sở hữu chuỗi tải và tầng đối tượng.
