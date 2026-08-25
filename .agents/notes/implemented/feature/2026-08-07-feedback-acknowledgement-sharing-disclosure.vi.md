# Agent Note: Công bố việc chia sẻ phiên trong xác nhận phản hồi

Status: implemented

[English](2026-08-07-feedback-acknowledgement-sharing-disclosure.md) | Tiếng Việt

## Vấn đề

Lệnh `/feedback` ghi lại một sự kiện `feedback/record` chỉ ghi log và xác nhận với người dùng, nhưng văn bản xác nhận không mang theo thông tin bền vững nào về nơi phiên đi tới: những bản triển khai có gắn telemetry phiên (`FULL`, `FEEDBACK_ONLY` hoặc `DISABLED`) không thể cho người dùng biết phản hồi và phiên của họ có rời khỏi tiến trình hay không, và văn bản xác nhận cũng không lặp lại id của phiên nhận. Plugin lệnh không đọc được chính sách chia sẻ, vì seam telemetry chỉ phơi bày khả năng thu thập, còn enum chế độ OTel lại nằm trong gói backend tuỳ chọn.

## Quyết định

Seam telemetry (`@deepseek-ai/dsh-session-telemetry`) giờ sở hữu một bộ từ vựng chia sẻ độc lập với backend: `SessionTelemetrySharingStatus` (`full` | `feedback-only` | `disabled`), và bổ sung một thành viên trừu tượng bắt buộc `sharing` trên lớp service `SessionTelemetryBackend` — mỗi backend đều phải công bố chính sách của mình, nên bên tiêu thụ chỉ render «chưa được cấu hình» khi không có service telemetry nào được gắn. `@deepseek-ai/dsh-session-telemetry-otel` ánh xạ `SessionTelemetryMode` đã tuần tự hoá (ngữ nghĩa của chế độ do [quyết định gửi telemetry theo cổng phản hồi](2026-08-05-feedback-gated-session-telemetry.md) chịu trách nhiệm) sang trạng thái đó trong hàm khởi tạo và công bố nó, bao gồm cả chế độ `DISABLED`. Bộ xử lý `/feedback` đọc service đã gắn thông qua ngữ cảnh plugin (`ctx.get('telemetry')`, tuyệt đối không phải injection được khai báo, để lệnh vẫn nạp và chạy được khi không có telemetry), rồi nối thêm một câu công bố chia sẻ sau văn bản xác nhận: `Feedback recorded for session {id}. <câu>`. Không có service → `Session sharing is not configured.`; `disabled` → `Session sharing is disabled.`; `feedback-only` → `Session sharing is feedback-gated; recording feedback releases the session prefix for sharing.`; `full` → `Session sharing is enabled.`

Phần công bố chỉ nêu chính sách chia sẻ hiện tại, tuyệt đối không hứa hẹn về việc gửi hay lưu giữ: việc bàn giao là một lần xếp hàng không chặn của backend, còn xử lý theo lô, thử lại và chính sách rơi mất vẫn thuộc về SDK của backend, và việc cấu hình lại sau này có thể thay đổi những gì đã chia sẻ, nên câu văn không tuyên bố rằng bất kỳ nội dung nào đã tới đầu thu thập, cũng không tuyên bố gì về việc lưu giữ trong tương lai. Phần công bố không thêm bất kỳ sự kiện phiên nào và tuyệt đối không đi vào surface của mô hình; Web client render nguyên trạng qua dòng lệnh hiện có (văn bản kết quả của `CommandNode`), không cần thay đổi phía client.

## Phương án thay thế

**Thêm RPC trạng thái và huy hiệu ở phía client.** Bác bỏ, vì văn bản xác nhận do host sinh ra và Web client vốn đã render nguyên trạng văn bản kết quả lệnh trong dòng lệnh; một RPC riêng sẽ lặp lại trạng thái đó ở surface thứ hai và thêm một cam kết trên đường truyền chỉ để phục vụ một câu chữ.

**Khai báo injection `telemetry` trong `command-feedback`.** Bác bỏ, vì telemetry là tuỳ chọn: khi service vắng mặt, việc khai báo injection sẽ khiến plugin nạp thất bại, trong khi lệnh phải dùng được cả khi không có telemetry. Thay vào đó, plugin đọc service bằng `ctx.get('telemetry')` lúc bộ xử lý thực thi.

**Để gói OTel sở hữu bộ từ vựng.** Bác bỏ, vì `command-feedback` không thể phụ thuộc vào gói backend OTel tuỳ chọn. Seam sở hữu `SessionTelemetrySharingStatus`, và mọi backend đều có thể công bố chính sách.

## Hệ quả

Văn bản xác nhận hiển thị với người dùng: nó nêu đích danh phiên nhận và báo cáo chính sách chia sẻ hiện tại, mô tả trung thực việc bàn giao kiểu fire-and-forget. Test cấp gói cố định câu văn cho từng trạng thái cũng như tình huống không có service; e2e trình duyệt sau khi lắp ráp gắn hàng telemetry đi kèm ở chế độ FULL (trỏ tới một endpoint dead cục bộ) và dùng golden để cố định câu mặc định đi kèm (`Session sharing is enabled.`). Thành viên của seam là bắt buộc, nên backend đã gắn luôn công bố chính sách, và câu «chưa được cấu hình» phản ánh trung thực rằng không có service telemetry nào; lệnh `/feedback` vẫn hoạt động bình thường khi chưa gắn telemetry. Phiên Web mới còn trắng không render dòng lệnh, nên phản hồi được ghi trước tin nhắn đầu tiên sẽ không có xác nhận hiển thị (đã ghi lại trong phần giới hạn của README gói).
