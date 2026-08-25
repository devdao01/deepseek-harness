# Agent Note: Telemetry phản hồi không buffer

Status: implemented

[English](2026-08-06-buffer-free-feedback-telemetry.md) | Tiếng Việt

## Vấn đề

Telemetry chỉ-khi-có-phản-hồi (feedback-only) phải chỉ tải lên tiền tố session log sau khi phản hồi đã được ghi nhận. Nếu giữ một bản ghi đã deep-copy, đã che dấu (redact) cho mỗi sự kiện đã được projection trước khi việc kích hoạt xảy ra, thì việc này sẽ sao chép lại session log chính thức; với các session chạy dài nhưng không bao giờ ghi nhận phản hồi, bản sao đó sẽ tăng trưởng vô hạn.

## Quyết định

Bộ điều phối telemetry cung cấp chế độ chụp `live` và `on-demand`. Chụp on-demand không đăng ký listener sự kiện session, flush hay vận hành, và không giữ bản ghi projection nào. `captureSession(session, throughSeq?)` đọc session log chính thức từ con trỏ handoff trở về sau, cho tới ranh giới số thứ tự tùy chọn (bao gồm cả ranh giới đó), áp dụng phép projection cố định, deep-copy từng sự kiện đã được chấp nhận, chạy waterfall (sự kiện dạng thác nước) `session-telemetry/record` hiện hành, và giao kết quả cho backend.

`FEEDBACK_ONLY` gọi phương thức này với số thứ tự của sự kiện `feedback/record`. Khi listener `session/event` đang chạy, thao tác append đã được commit, do đó việc replay sẽ bao gồm chính sự kiện phản hồi đó, và không thể bao gồm bất kỳ hậu tố (suffix) nào sau đó. Con trỏ handoff hiện có đủ để phân biệt các lượt replay tiếp theo, không cần thêm chỉ mục bản ghi đang chờ nào khác.

Chụp on-demand chỉ đọc log chính thức, do đó không phát ra bản ghi vận hành `agent-error` hay `shutdown`. Việc che dấu được đánh giá tại thời điểm có phản hồi, thay vì tại thời điểm append. [Quyết định về chế độ phản hồi](../feature/2026-08-05-feedback-gated-session-telemetry.md) quy định hành vi công khai dùng chung; ghi chú này quy định cách triển khai không buffer của nó.

## Các phương án thay thế đã cân nhắc

**Giữ bản ghi đã che dấu tại thời điểm chụp.** Phương án này sẽ giữ được đúng chính sách che dấu và bản ghi vận hành được quan sát tại thời điểm mỗi sự kiện xảy ra, nhưng cũng sẽ sao chép tiền tố session không giới hạn. Chế độ này cam kết tải lên session log sau khi phản hồi được kích hoạt, chứ không phải giữ lại snapshot chính sách tại thời điểm chụp hay telemetry vận hành trước khi có phản hồi.

**Giữ tham chiếu sự kiện session hoặc số thứ tự.** Bị từ chối, vì log chính thức đã cung cấp đồng thời cả thứ tự lẫn định danh. Chỉ mục thứ hai có thể tránh được việc sao chép payload, nhưng sẽ làm tăng trạng thái vòng đời mà không thực hiện thêm bất kỳ hành vi bắt buộc nào.

**Ghi vào một spool bền vững trước-khi-có-phản-hồi.** Trì hoãn đến khi có triển khai yêu cầu khả năng khôi phục sau crash trước khi có phản hồi. Phương án này sẽ thêm storage, dọn dẹp và chính sách bảo mật cho một chế độ vốn dĩ được kỳ vọng là không tải lên bất cứ thứ gì nếu tiến trình thoát trước khi có phản hồi.

## Hệ quả

Các session không có phản hồi không tiêu tốn bộ nhớ riêng của telemetry tăng theo số lượng sự kiện; session log chính thức vẫn là bản sao duy nhất trước khi có phản hồi. Việc xử lý phản hồi thực hiện đồng bộ phép projection, deep-copy và che dấu trước khi đưa vào hàng đợi non-blocking ở backend, do đó chi phí của nó tăng theo tiền tố chưa được giải phóng. Thay đổi chính sách che dấu trước khi có phản hồi sẽ ảnh hưởng đến lượt replay đó, và nếu crash xảy ra trước khi có phản hồi thì sẽ không có gì được tải lên. Phản hồi tiếp theo chỉ xử lý các sự kiện sau con trỏ handoff.
