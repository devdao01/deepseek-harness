# Agent Note: Cmd/Ctrl+Enter khi ô nhập rỗng sẽ chen toàn bộ tin nhắn đang xếp hàng của Web

Status: implemented

[English](2026-08-06-web-queue-steer-all-gesture.md) | Tiếng Việt

## Vấn đề

Khi phiên chính đang chạy, những tin nhắn người dùng gõ bằng Enter thường (hoặc khi tuỳ chọn busy-Enter là Queue) sẽ tích lại trong hàng đợi Web. Muốn dồn chúng vào lượt hiện tại thì phải bấm nút «chen gửi» từng dòng một; còn khi bản nháp trong ô nhập rỗng thì không có cử chỉ bàn phím nào — máy nhập liệu từ chối thẳng bản nháp rỗng, Enter và Cmd/Ctrl+Enter đều là thao tác rỗng. Khi tin nhắn xếp hàng nhiều lên, chen từng dòng là ma sát nhiều điểm rõ rệt, và nháp rỗng + Enter tăng tốc chính là chỗ tự nhiên cho «chen tất cả».

## Quyết định

Cmd/Ctrl+Enter khi bản nháp rỗng giờ sẽ chen toàn bộ các dòng Inbox vẫn đang xếp hàng (`placement: 'queued'`) vào lượt đang chạy theo thứ tự FIFO, chỉ giới hạn ở phiên chính báo cáo trạng thái running. Cử chỉ được giải mã tại `InputBar.onKeyDown`: khi có Enter tăng tốc + bản nháp rỗng sau khi cắt khoảng trắng + `running` + không có địa chỉ subagent + ít nhất một dòng `queued`, luồng sẽ đi qua động từ `ComposerKeyboard.steerQueue()` mới thay vì `submit()`. `SessionInputShell.steerQueue()` uỷ quyền cho quy trình do hub điều phối: đọc lại snapshot `session/queue` có thẩm quyền, lọc `placement: 'queued'` (các dòng pending steering vốn đã nằm trong lượt này), rồi lần lượt thực thi thao tác steer nghiêm ngặt của bảng Queue là `session.updateQueue(itemId, { kind: 'steer' })`, nhờ đó bảo đảm thứ tự FIFO ở phía host. `steer-unavailable` (lượt đóng lại giữa chừng khi đang flush) hoặc `queue-item-not-found` (dòng đã bị chiếm) sẽ hội tụ im lặng; các thất bại khác bật một thông báo composer («Chen gửi thất bại, vui lòng thử lại.»). Không có thay đổi nào về wire, đĩa hay agent-loop: ranh giới steer nghiêm ngặt vốn đã nằm ở phía host.

Cử chỉ này bị giới hạn nghiêm ngặt ở tổ hợp phím tăng tốc. Nháp rỗng + Enter thường vẫn là thao tác rỗng (kể cả khi tuỳ chọn busy-Enter là Steer); nội dung bản nháp được ưu tiên hơn hàng đợi (Enter tăng tốc chỉ chen bản nháp hiện tại); phiên idle hoặc phiên subagent giữ nguyên hành vi thao tác rỗng khi nháp rỗng, vì không có lượt đang chạy nào để chèn vào.

Cùng một tập điều kiện khả dụng được tính ra đó cũng đảm nhiệm việc gợi ý cử chỉ này: khi bản nháp rỗng, ô nhập không bị khoá và không ở trong khoá máy tạm thời (adjudicating/submitting), menu lệnh chưa mở, phiên chính thông thường đang chạy và ít nhất một dòng vẫn ở trạng thái `queued`, thì placeholder của ô văn bản sẽ gợi ý rằng Cmd/Ctrl+Enter sẽ chen gửi toàn bộ tin nhắn đang xếp hàng. Placeholder do owner cung cấp vẫn được ưu tiên; khi khả dụng, gợi ý steer cố ý được ưu tiên hơn placeholder của chế độ plan (trong khoảng thời gian đó cử chỉ thực sự dùng được).

## Hệ quả

Một cử chỉ bàn phím thay cho N lần bấm, đồng thời giữ nguyên một đường steer nghiêm ngặt duy nhất và một thẩm quyền hội tụ duy nhất. Nút bấm từng dòng và cử chỉ là cùng một thao tác host, nên ngữ nghĩa tranh chấp và thất bại hoàn toàn nhất quán. Cử chỉ và placeholder của nó dùng chung một điều kiện ở tầng trình bày; hub sẽ đọc lại snapshot khi thực thi, nên điều kiện phía client vẫn chỉ mang tính gợi ý, còn host vẫn là thẩm quyền.

## Quyết định liên quan

Hành động «chen gửi» từng dòng và ranh giới steer nghiêm ngặt của nó được ghi lại trong [Chen một tin nhắn xếp hàng của Web vào lượt đang hoạt động](../feature/2026-07-30-web-queue-steer-action.md); ghi chú này chỉ bổ sung cử chỉ bàn phím cho toàn hàng đợi lên trên đó.

## Các phương án từng cân nhắc

- **Chặn bên trong máy nhập liệu.** Đã bác bỏ: máy nhập liệu theo thiết kế không nhận biết hàng đợi (phép chiếu hàng đợi do tầng wiring xếp chồng lên), và nó không thể phân biệt Enter tăng tốc với Enter thường vốn phải giữ nguyên là thao tác rỗng.
- **Chen từng dòng bằng `session.prompt(mode: 'steer')`.** Đã bác bỏ: cách đó sẽ đúc ra tin nhắn mới thay vì chuyển dòng pending, phá vỡ cam kết bất biến về tin nhắn của dock; `updateQueue({ kind: 'steer' })` vốn đã chuyển đúng dòng đó một cách nguyên tử.
- **Kích hoạt tất cả các dòng đồng thời.** Đã bác bỏ: không thể bảo đảm thứ tự đến host, trong khi thứ tự chen lại hiển thị với mô hình; await tuần tự bảo đảm FIFO.
- **Thêm RPC host mới cho steer-all.** Đã bác bỏ: thao tác từng dòng hiện có đã đủ idempotent — mỗi dòng một lần steer nghiêm ngặt, đóng giữa chừng thì hội tụ im lặng — nên thay đổi giao thức không mang lại lợi ích.
- **Tooltip trên nút gửi.** Đã bác bỏ: khi phiên thông thường đang chạy, nút chính là Stop, và đó cũng là khoảng thời gian duy nhất cử chỉ toàn hàng đợi khả dụng. Placeholder khi nháp rỗng lại hiển thị đúng trong khoảng đó, nên có thể trực tiếp giải thích thao tác bàn phím này.
