# Agent Note: Telemetry phiên được cổng hóa theo phản hồi

Status: implemented

[English](2026-08-05-feedback-gated-session-telemetry.md) | 中文

## Vấn đề

Telemetry phiên vốn chỉ có một hành vi đã lắp: mỗi bản ghi đã chấp nhận lập tức đi vào backend báo cáo. Bên triển khai cần hai chính sách chặt hơn mà không thay thế plugin: chỉ giải phóng telemetry của phiên khi người dùng ghi lại phản hồi, hoặc vô hiệu hóa báo cáo nhưng vẫn giải thích cho người dùng biết phản hồi đi đâu. Chính sách này phải giữ nguyên ranh giới rằng telemetry seam khử nhạy cảm (sanitize) bản ghi trước khi bản ghi đến backend.

## Quyết định

`@deepseek-ai/dsh-session-telemetry-otel` công khai enum `SessionTelemetryMode` dạng chuỗi cho phía gọi TypeScript, và chấp nhận cùng ba giá trị `mode` viết hoa trong cấu hình tuần tự hóa:

- `FULL` chọn tường minh việc gửi ngay lập tức tới pipeline OTel đã cấu hình.
- `FEEDBACK_ONLY` đọc session log có thẩm quyền khi `feedback/record` được thêm vào, và bàn giao tiền tố chưa giải phóng tính đến sự kiện đó. Các bản ghi được thêm vào sau ranh giới này sẽ ở lại cục bộ cho đến sự kiện phản hồi tiếp theo.
- `DISABLED` là [giá trị mặc định](2026-08-10-telemetry-default-off.md), không xây dựng exporter, processor, hay log provider nào, và xuất cảnh báo khi quan sát thấy `feedback/record`, nói rõ rằng sẽ không có gì được chia sẻ và phản hồi vẫn ở lại cục bộ.

Bộ điều phối telemetry chung sở hữu hai chế độ capture `live` và `on-demand`. Capture thời gian thực chiếu, sao chép sâu, và khử nhạy cảm từng sự kiện trên firehose của phiên, rồi giao cho backend. Capture theo yêu cầu không đăng ký listener capture liên tục; `captureSession(session, throughSeq)` đọc từ con trỏ handoff, tới số thứ tự chỉ định bao gồm ranh giới, rồi chiếu, sao chép sâu, khử nhạy cảm và bàn giao tiền tố đó. Con trỏ chỉ tiến lên cho các bản ghi đã bàn giao. [Quyết định phát lại không bộ đệm](../simplification/2026-08-06-buffer-free-feedback-telemetry.md) giải thích vì sao đường theo yêu cầu dùng log có thẩm quyền thay vì bản sao bản ghi.

Việc phân giải chế độ dùng kiểm tra khép kín và thất bại trước khi thiết lập: truyền giá trị không rõ qua cách khởi tạo trực tiếp sẽ thất bại trước khi đọc cấu hình truyền tải. Chỉ `FULL` mở đường `emit()` của dịch vụ công khai tới pipeline SDK. `FEEDBACK_ONLY` cung cấp năng lực backend riêng tư cho bộ điều phối theo yêu cầu của nó; điều kiện duy nhất để listener của nó chuyển một sự kiện tới `captureSession()` là sự kiện đó có cùng định danh đối tượng hoàn toàn với đối tượng `feedback/record` đó, và đối tượng đó đã được lưu tại `session.events[event.seq]`. `Session.append` đã commit đối tượng đó trước khi phát `session/event`, do đó phát lại bao gồm phản hồi này nhưng không vượt qua ranh giới của nó. `DISABLED` không tạo ra năng lực đó cũng không tạo pipeline SDK, và không kiểm tra cấu hình exporter.

## Phương án thay thế đã cân nhắc

**Phiên mở vĩnh viễn sau lần phản hồi đầu tiên.** Đã bác bỏ, vì công việc sau đó sẽ bị chia sẻ dù người dùng không gửi phản hồi lần nữa, và plugin cần thêm trạng thái phiên mở. Mỗi phản hồi chỉ giải phóng một tiền tố đang chờ, máy trạng thái nhỏ hơn và ranh giới chia sẻ hẹp hơn.

**Giữ bản ghi đã khử nhạy cảm tại thời điểm capture trước khi có phản hồi.** Đã bác bỏ, vì log có thẩm quyền đã sở hữu các sự kiện này, phương án này vẫn sao chép tiền tố phiên không giới hạn. Nó có thể giữ chính sách khử nhạy cảm tại thời điểm capture cùng bản ghi vận hành, nhưng với một chế độ được định nghĩa là "tải lên session log sau khi có phản hồi", các tính chất này không đủ để biện minh cho chi phí bộ nhớ đó.

**Tạm thời cho phép gọi `emit()` công khai trong lúc phát lại phản hồi.** Đã bác bỏ, vì trong lúc cờ bật, listener khử nhạy cảm hoặc một bên gọi tái nhập khác có thể xếp hàng các bản ghi không liên quan. Năng lực backend riêng tư biến việc cấp quyền thành bảo đảm cấu trúc, và đảm bảo dịch vụ công khai vẫn đóng suốt quá trình phát lại.

**Biểu diễn trạng thái vô hiệu hóa bằng cách không lắp plugin.** Đây vẫn là cách thoát âm thầm, nhưng không thể xuất cảnh báo khi phản hồi được ghi lại. Chế độ vô hiệu hóa tường minh cho phép bên triển khai giữ cùng một hình thái cấu hình và giải thích rằng phản hồi cục bộ không rời khỏi tiến trình.

## Hệ quả

`FULL` giữ nguyên hành vi mã nguồn và giao thức gốc như một chế độ bật tường minh. `FEEDBACK_ONLY` không thêm bộ đệm theo từng sự kiện của riêng telemetry trước khi có phản hồi; cả lời gọi dịch vụ trực tiếp lẫn sự kiện phản hồi không có thẩm quyền đều không tải lên bất kỳ thứ gì, và nếu sập trước khi có phản hồi thì tiền tố đó cũng không được tải lên. Phát lại dùng chính sách khử nhạy cảm được lắp tại thời điểm ghi lại phản hồi, và loại trừ các bản ghi vận hành không tồn tại trong log có thẩm quyền. Do đó, luồng chỉ-có-phản-hồi không mang theo bản ghi `agent-error` cũng không mang `shutdown`, và việc thiếu shutdown không phải là tín hiệu sập. Mỗi phản hồi tiếp theo sẽ capture phần hậu tố tích lũy kể từ ranh giới trước đó. `DISABLED` có thể bỏ qua `exporter.url`, không thực hiện bất kỳ công việc báo cáo nào, và chỉ giữ phản hồi trong session log có thẩm quyền.
