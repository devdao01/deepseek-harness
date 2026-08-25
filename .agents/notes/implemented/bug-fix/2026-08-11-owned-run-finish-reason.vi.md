# Agent Note: Báo cáo lý do kết thúc của lần chạy tự sở hữu

Status: implemented

[English](2026-08-11-owned-run-finish-reason.md) | 中文

## Vấn đề

Bên tiêu thụ Python SDK cần một cách gọn gàng để xác định khoảng thời gian hoạt động tự sở hữu của mình đã chuyển sang idle như thế nào. Yêu cầu mỗi bên tiêu thụ tự quét sự kiện `turn/end` thô sẽ lặp lại kiến thức giao thức, còn một trạng thái thành công tổng quát sẽ làm mất đi sự khác biệt giữa việc chạm trần token và lỗi model.

## Quyết định

`RunResult.finish_reason` là `kind` dạng chuỗi của `turn/end` cuối cùng của root session, được thu thập từ thời điểm biên nhận tin nhắn đã commit vào inbox lưu bền vững cho đến khi toàn bộ agent chuyển sang idle lần kế tiếp. Nếu khoảng thời gian đó không có `turn/end`, trường này sẽ là `None`. `turn/end` thiếu `data.reason.kind` dạng chuỗi sẽ throw `SdkProtocolError`, chứ không được báo cáo là "trong khoảng này không có lượt kết thúc nào". Trường này mô tả khoảng thời gian chạy tự sở hữu; nó không gán lý do kết thúc này cho tin nhắn đã commit. [Quyết định về ranh giới lần chạy tự sở hữu](../architecture/2026-07-30-followup-enqueue-and-owned-runs.md) vẫn cấm việc gán kết quả ở cấp tin nhắn.

Trường này chỉ phơi bày `kind`, vì bên gọi cần một cách phân loại ổn định, lý do có cấu trúc đầy đủ vẫn có thể lấy được từ `RunResult.events`. Mất kết nối truyền tải, timeout và lỗi giao thức vẫn sẽ throw exception, chứ không tạo ra lý do kết thúc.

## Các phương án thay thế đã cân nhắc

**Khôi phục `status`.** Trạng thái `ok` hoặc `error` do deployment ánh xạ sẽ làm lẫn lộn các tình huống kết thúc bền vững khác nhau, và trông giống trạng thái thành công của tầng truyền tải, nên không thể trả lời câu hỏi vì sao khoảng thời gian này kết thúc.

**Phơi bày `FinishReason` của model.** Một lần chạy có thể chứa nhiều bước model, `tool-calls` ở giữa kết thúc không có nghĩa là lần chạy kết thúc. `turn/end` cuối cùng của agent mới là quan sát ở cấp lần chạy có liên quan.

**Đặt tên trường là `stop_reason`.** Seam ACP và subagent ánh xạ lý do kết thúc lượt vào tập giá trị `stopReason` riêng của chúng. Trường Python giữ nguyên kind lý do gốc của agent, nên dùng lại tên đó sẽ khiến người ta nhầm tưởng interface này cũng thực hiện kiểu ánh xạ đó.

**Phơi bày toàn bộ lý do lượt có cấu trúc.** Luồng sự kiện thô đã giữ đầy đủ chi tiết về lỗi và hủy. Sao chép object này vào `RunResult` sẽ tạo ra hai cách biểu diễn mà bên gọi Python phải tự phối hợp.

## Xác nhận

Test Python SDK bao phủ việc chọn lượt kết thúc cuối cùng, trường hợp khoảng thời gian không có lượt kết thúc nào, và việc từ chối lý do lượt kết thúc sai định dạng. README của SDK ghi lại các giá trị của trường, trường hợp `None`, hành vi khi lỗi và phạm vi cấp lần chạy.

## Hệ quả

Bên gọi có thể phân nhánh theo `completed`, `max-tokens`, `error` và các kind lý do trong tương lai mà không cần tự phân tích danh sách sự kiện. Trường này có thể mô tả steering, ngữ cảnh được inject hoặc công việc xếp hàng được thêm vào trong khoảng thời gian đó, nên không thể diễn đạt nó như kết quả nhân quả của prompt ban đầu. TypeScript SDK trong repo chỉ cung cấp quan sát lý do kết thúc thông qua sự kiện đã định kiểu; bên gọi của nó có thể đọc trực tiếp quan sát này từ `SessionEvent[]`.
