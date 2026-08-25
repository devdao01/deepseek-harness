# Agent Note: Cắt bỏ turn cuối bị gián đoạn khi load

Status: rejected — Một turn đơn lẻ có thể chứa lượng công việc thực sự lớn, bao gồm nhiều bước và nhiều output công cụ. Giữ lại turn bị gián đoạn tốt hơn là âm thầm loại bỏ phần đuôi này khi load.

[English](2026-06-20-truncate-interrupted-turns.md) | Tiếng Việt

## Vấn đề

Quy ước lưu bền vững hiện tại giữ lại turn cuối cùng đã được ghi bền vững nhưng chưa bao giờ được đóng lại. Khi load, `interruptedTurnClosers()` quét phần đuôi, tổng hợp sự kiện `tool/result` lỗi cho các tool call chưa được phản hồi, append `step/end` nếu bước đang ở trạng thái mở, append `turn/end { kind: 'interrupted' }`, và yêu cầu backend ghi bền vững bản khắc phục này. Bộ điều phối, backend JSONL, backend SQLite, từ vựng sự kiện phiên, bất biến (invariant), tài liệu và test đều đã mô hình hóa đường đóng tổng hợp này.

Đây là một cơ chế đồ sộ, chỉ để giữ lại một phần công việc trong turn bị crash lần trước. Nó còn tạo ra từ hư không những sự kiện chưa từng thực sự xảy ra. Kết quả tool tổng hợp tuy hữu ích (vì giúp lịch sử phía provider vẫn hợp lệ), nhưng cũng đồng nghĩa log sau khi khôi phục chứa văn bản hiển thị được với model nhưng không phải do bất kỳ công cụ nào thực sự sinh ra. Thiết kế hiện tại lấy mục tiêu tối đa hóa việc giữ lại phần đuôi làm tối ưu, trong khi chưa có sản phẩm phát hành, cũng chưa có UX khôi phục thực tế nào chứng minh việc khôi phục turn một phần thực sự có giá trị.

## Đề xuất

Khi load, chỉ giữ lại turn hoàn chỉnh cuối cùng. Backend vẫn dung nạp và cắt bỏ bản ghi cuối bị rách, nhưng nếu phần tiền tố bền vững đã phân tích được vẫn còn turn chưa đóng sau `turn/start`, cách khắc phục chuẩn là loại bỏ mọi sự kiện sau `turn/end` cuối cùng. Không tổng hợp `tool/result`, không tổng hợp `step/end`, không append `turn/end { interrupted }`, và cũng không đưa vào lý do kết thúc turn `interrupted`.

Điều này làm cho ranh giới turn bền vững trở nên đơn giản: một `turn/end` đã hoàn tất chính là checkpoint. Mọi thứ sau checkpoint cuối cùng là phần đuôi do crash để lại. Prompt tiếp theo khôi phục từ transcript (bản ghi văn bản) hợp lệ đã biết cuối cùng phía provider, chứ không phải từ turn cuối được tái dựng một phần.

## Tiêu chí nghiệm thu

- `TurnEndReasonMap` loại bỏ biến thể `interrupted`.
- `interruptedTurnClosers()` cùng test của nó bị xóa.
- Hook khắc phục của bộ điều phối persistence cắt bỏ trạng thái đuôi bị rách hoặc chưa đóng đặc thù theo backend, không append sự kiện đóng.
- [Tài liệu session persistence](../../../../packages/session/session-persistence/README.md) nêu rõ việc load trả về turn hoàn chỉnh cuối cùng, không bao gồm turn cuối chưa hoàn tất một phần.
- Test snapshot và test quy ước được cập nhật cùng với hành vi mà chúng cố định lại.
- Phiên bản định dạng phiên và fixture đã ghi lại (dữ liệu tiền đề cho test) được refresh; theo chính sách định dạng tiền phát hành, log lưu trữ không đúng phiên bản hiện hành sẽ bị từ chối, không có đường di trú.

## Nội dung bị từ bỏ

Khi crash xảy ra, có thể mất công việc thực sự trong turn cuối: văn bản assistant, tool call và output công cụ được append sau `turn/end` trước đó. Đây là một sự đơn giản hóa có chủ đích. Sản phẩm chưa phát hành, ngữ nghĩa khôi phục turn cuối chưa được người dùng kiểm chứng, còn một mô hình "turn đã hoàn tất chính là checkpoint" gọn gàng thì dễ giải thích, dễ test và dễ hiện thực hơn nhiều. Nếu tương lai cần tính năng "khôi phục công việc bị crash một phần", nó nên được thiết kế thành một view khôi phục tường minh hướng tới người dùng, thay vì âm thầm chèn sự kiện tổng hợp vào transcript chuẩn.

## Liên quan

Đề xuất này là một đơn giản hóa trực tiếp của [Session persistence](../../implemented/architecture/2026-06-14-session-persistence.md) và quy tắc lịch sử [Generic turn enclosure invariant](../../archived/architecture/2026-06-15-turn-enclosure-invariant.md). Nó cũng loại bỏ phần lớn động lực cho việc lưu bền vững sự kiện ranh giới bước, khiến thay đổi trong [Gỡ bỏ sự kiện ranh giới bước bền vững](2026-06-20-drop-durable-step-boundaries.md) nhỏ hơn.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
