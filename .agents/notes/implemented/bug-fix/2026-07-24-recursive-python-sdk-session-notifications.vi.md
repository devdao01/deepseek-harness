# Agent Note: Thông báo phiên đệ quy của Python SDK

Status: implemented

[English](2026-07-24-recursive-python-sdk-session-notifications.md) | 中文

## Vấn đề

Trước đây, Python SDK lọc thông báo lượt bằng cách so sánh trực tiếp payload của mỗi thông báo với root session ID. Thông báo vòng đời của sub agent trực tiếp lọt qua được vì parent ID trỏ tới root session, nhưng thông báo vòng đời của cháu (grandchild) và mọi `session.event` của thế hệ sau đều bị từ chối. JSON-RPC server vẫn phát ra các thông báo này, do đó chúng tích tụ trong hàng đợi toàn cục cấp thấp, còn bên tiêu thụ cấp cao sẽ mất đi quan hệ và trạng thái kết thúc của quỹ đạo lồng nhau.

## Quyết định

`HarnessClient` sẽ ghi lại quan hệ child-to-parent (con-tới-cha) chứa trong mỗi `subagent.started` hợp lệ trước khi phân phối thông báo. `subagent.finished` sau đó định tuyến dựa trên parent ID bất biến của chính nó, nhưng không ghi đè quan hệ tổ tiên hiện tại, do đó một run cũ ngay cả khi kết thúc sau khi child ID của nó đã được tái sử dụng cũng không thể ghi đè lên session mới đã thay thế nó. Các thông báo session khác sẽ truy ngược session ID của chính chúng theo đồ thị quan hệ tổ tiên được lưu trong suốt vòng đời client, để xác định chúng có thuộc về root session được yêu cầu hay không. Đồ thị quan hệ này được giữ lại xuyên suốt các lượt đăng ký liên tiếp, do đó một thế hệ sau ngay cả khi vẫn tồn tại sau khi một `Session.run()` kết thúc, khi phát thông báo trong các lượt sau vẫn được quy đúng chỗ; client sẽ đặt lại đồ thị khi khởi động tiến trình runtime mới.

`Session.run()` cung cấp toàn bộ luồng thông báo của cây session đã phát hiện qua `TurnResult.notifications` và `on_notification`. Chỉ những `session.event` có `sessionId` bằng root session được yêu cầu mới đi vào `TurnResult.events` hoặc tham gia vào việc tái tạo phản hồi cuối cùng. Do đó bên gọi có thể quan sát sự kiện của thế hệ sau, trong khi phản hồi của sub session không ghi đè lên phản hồi của root session.

## Các phương án đã cân nhắc

**Thêm root session ID vào mỗi thông báo JSON-RPC.** Server đã cung cấp sẵn quan hệ cha-con trực tiếp chính xác; việc truyền lặp lại quan hệ tổ tiên trong giao thức truyền tải sẽ buộc mỗi bên sinh dữ liệu phải gánh trách nhiệm về trạng thái đăng ký của client.

**Giới hạn subagent chỉ một cấp.** Triển khai có thể đặt `maxDepth: 1`, nhưng nếu để SDK phụ thuộc vào chính sách đó sẽ tạo ra báo động giả âm thầm đối với các tổ hợp đệ quy hợp lệ.

**Chỉ đăng ký thông báo vòng đời của thế hệ sau.** Cách này có thể sửa việc báo cáo quan hệ và trạng thái kết thúc, nhưng sự kiện session của thế hệ sau vẫn sẽ tích tụ trong hàng đợi toàn cục, và cây session mà callback nhìn thấy vẫn không đầy đủ.

**Công khai và đánh index từng run ID của subagent trên đường truyền JSON-RPC.** Định danh run chính xác có giá trị khi client phải liên kết hai kết quả đồng thời của cùng một child; nhưng việc định tuyến theo cây session đã có sẵn quan hệ start thẩm quyền và parent bất biến trong mỗi thông báo kết thúc. Không cần mở rộng giao thức chỉ để phục vụ quyết định quy thuộc này.

## Hệ quả

Bên tiêu thụ cấp cao sẽ nhận được thông báo vòng đời và session lồng nhau theo đúng thứ tự truyền tải giao thức, trong khi kết quả lượt gốc vẫn giữ ngữ nghĩa phản hồi ban đầu. Client sẽ giữ một quan hệ cha hiện tại cho mỗi sub session đã quan sát được, cho tới khi runtime khởi động lại; việc truy ngược tổ tiên xử lý an toàn các vòng lặp, thông báo session không liên quan vẫn có thể lấy được từ hàng đợi toàn cục. Test Python keyless bao phủ hai cấp ủy quyền, cách ly phản hồi gốc, thông báo cây session không tích tụ, tái sử dụng quan hệ tổ tiên xuyên các lượt đăng ký, và việc tái sử dụng child ID khi run cũ kết thúc không theo thứ tự.
