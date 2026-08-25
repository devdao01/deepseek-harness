# Agent Note: Gỡ bỏ sự kiện ranh giới bước (step boundary) bền vững

Status: rejected — `step/end` là tín hiệu bền vững cho biết một bước của model đã hoàn tất; giữ cặp `step/start` / `step/end` đối xứng giúp việc rà soát khắc phục sự cố crash, bất biến (invariant) và transcript (bản ghi văn bản) dễ hiểu hơn so với việc suy luận trạng thái hoàn tất từ các sự kiện cấp bước lân cận.

[English](2026-06-20-drop-durable-step-boundaries.md) | Tiếng Việt

## Vấn đề

Log phiên lưu trữ các sự kiện `step/start` và `step/end`, mặc dù mỗi sự kiện cấp bước tự thân đã mang sẵn `{ turn, step }`: phân mảnh assistant, message assistant, tool call, tool result, usage và lỗi. `deriveMessages()` bỏ qua ranh giới bước, ACP (Agent Client Protocol) ở tầng UI cũng bỏ qua chúng; bên tiêu thụ chính là kiểm tra bất biến, test, kết quả kỳ vọng của snapshot, và khôi phục sau crash.

Lập luận bị bác bỏ là: sự kiện ranh giới khiến log mang tính hình thức hơn là mang thông tin. Trên thực tế, `step/end` là thông tin cụ thể: người đọc không cần suy luận trạng thái từ sự kiện kế tiếp mới biết được một request tới model đã hoàn tất, đã crash, hay đang được khắc phục. Tương tự, một `step/start` đứng riêng cũng có giá trị cho tình huống "request tới model đã được gửi đi nhưng thất bại trước khi sinh ra bất kỳ phân mảnh nào".

## Đề xuất

Lấy turn làm ranh giới bền vững duy nhất. `step/start` và `step/end` sẽ bị loại khỏi `SessionEventMap`; trường `step` kiểu số vẫn được giữ lại trên các sự kiện cần nhóm theo bước. Agent loop tăng bộ đếm bước và ghi sự kiện cấp bước theo số đó, nhưng không còn append sự kiện ranh giới đầu/cuối. Bên tiêu thụ suy ra nhóm bước từ các sự kiện liên tiếp cùng chia sẻ `(turn, step)`.

Plugin bất biến nên bắt buộc các sự kiện cấp bước có số bước nguyên dương hợp lệ trong một turn đang mở, thay vì yêu cầu bản ghi ranh giới riêng bao quanh chúng. Khôi phục sau crash không nên tổng hợp `step/end`; nếu một turn bị gián đoạn được giữ lại, đường khắc phục vẫn có thể đóng turn đó mà không cần bịa ra bản ghi ranh giới bước.

## Tiêu chí nghiệm thu

- `SessionEventMap` không còn chứa `step/start` hay `step/end`.
- Agent loop không còn đường kết thúc `closeStep()`.
- Snapshot ACP và fixture của quy ước lưu bền vững (dữ liệu tiền đề cho test) không còn kỳ vọng dòng ranh giới bước.
- `deriveMessages()` và replay suy ra cùng một lịch sử message từ các sự kiện cấp bước.
- [Tài liệu phân loại sự kiện](../../../../docs/architecture.md) mô tả turn là ranh giới bền vững, và step là một trường trên bản ghi cấp bước.
- Phiên bản định dạng phiên và fixture đã ghi lại được refresh; theo chính sách định dạng tiền phát hành, log lưu trữ không đúng phiên bản hiện hành sẽ bị từ chối.

## Những gì bị từ bỏ

Log sẽ không còn ghi lại như một sự thật bền vững việc "một request tới model đã được gửi nhưng tiến trình chết trước khi sinh ra bất kỳ sự kiện nào", cũng không còn dấu hiệu tường minh "bước này đã hoàn tất". Khi log phiên vẫn còn là bề mặt replay và audit bền vững như hiện nay, mức mất mát này là không thể chấp nhận.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
