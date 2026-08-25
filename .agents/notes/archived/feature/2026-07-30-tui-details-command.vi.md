# Agent Note: Lệnh /details cho trạng thái chi tiết của transcript

Status: implemented

Archived: 2026-08-04

[English](2026-07-30-tui-details-command.md) | 中文

## Problem

Trạng thái chi tiết của transcript trong TUI — khả năng hiển thị thẻ tool (`collapsed`/`expanded`/`hidden`, xem [trình bày TUI hợp nhất](../architecture/2026-07-28-consolidated-tui-presentation.md)) và hiển thị khối reasoning — trước đây chỉ có thể chạm tới qua vòng lặp Ctrl+O và chuyển đổi Ctrl+R. Người dùng muốn một chế độ cụ thể phải lặp qua các chế độ khác, không thể thiết lập cả hai chiều cùng lúc trong một thao tác, cũng không thể truy vấn trạng thái hiện tại; các terminal nuốt mất các phím tắt này thì hoàn toàn không có đường thay thế.

## Decision

`dsh-tui` đăng ký `/details` bên cạnh các lệnh khác trong phạm vi agent. `/details` không tham số sẽ mở `DetailsDialog`: một công tắc bàn phím căn giữa, mỗi chiều một mục — `Tool cards` và `Reasoning` — hiển thị giá trị thời gian thực: Tab lặp qua mục được highlight và áp dụng thay đổi ngay lập tức, transcript phía sau hộp thoại chính là bản xem trước, Enter, Esc hoặc Ctrl+C sẽ đóng; chiều rộng của nó do key cấu hình `detailsDialogWidth` quyết định, gọi lại `/details` khi bộ chọn đang mở sẽ thay thế nó, nhất quán với overlay `/model`. Tham số đặt tên trực tiếp trạng thái mục tiêu: `collapsed|expanded|hidden` sẽ đưa thẻ tool nhảy đến giai đoạn đó, `reasoning on|off` thiết lập hiển thị reasoning, `reasoning` không tham số sẽ đảo trạng thái, và các chỉ thị có thể kết hợp trong một lần gọi. Token không xác định sẽ trả về lỗi lệnh kèm dòng hướng dẫn sử dụng. Mỗi lối vào đều thay đổi cùng trạng thái closure như phím tắt, sau khi tái cấu trúc, việc lặp và chuyển đổi trở thành lớp bọc mỏng trên `setToolsVisibility`/`setReasoning`; phím tắt và thông báo của chúng giữ nguyên không đổi.

Lệnh gọi kết hợp áp dụng reasoning trước rồi mới áp dụng khả năng hiển thị, vì `setReasoning` sẽ tái tạo transcript từ sự kiện session, và việc tái tạo sẽ loại bỏ các component thông báo không bền vững; nếu áp dụng nó sau cùng, thông báo khả năng hiển thị vừa được thêm vào sẽ bị xóa mất.

Việc tái tạo reasoning đã phơi bày một lỗi phát lại (replay), thay đổi này sửa nó trong `renderEvent`: đường thời gian thực sẽ xóa `StreamingAssistantComponent` đã kết thúc trước `assistant/message` tiếp theo trong cùng bước (do đó tin nhắn thứ hai nhận được component mới), nhưng `rebuildTranscript` phát lại đã tái sử dụng component đã kết thúc, `settle()` ghi đè nội dung của nó, âm thầm làm mất văn bản của tin nhắn trước đó. Kiểm tra "đã kết thúc" giờ nằm trong nhánh `assistant/message` của `renderEvent` — hai đường dùng chung một nơi quy thuộc — snapshot `untrusted-controls` sai trước đây (reasoning và văn bản bị mất chỉ còn lại tiêu đề `Assistant` rỗng) đã được ghi lại thành phiên bản có nội dung.

## Alternatives considered

**`/details` không tham số lặp giống Ctrl+O.** Từ chối: giá trị của lệnh so với phím tắt nằm ở việc đặt tên trạng thái tuyệt đối; lệnh lặp chỉ là phím tắt cần bấm nhiều hơn, còn gọi không tham số là một bộ chọn thì hữu ích hơn — nó vừa hiển thị trạng thái hiện tại, vừa cung cấp mọi mục tiêu.

**`/details` không tham số chỉ xuất báo cáo trạng thái dạng văn bản.** Đây là triển khai phiên bản đầu, sau đó bị bộ chọn thay thế: báo cáo trả lời câu hỏi "tôi đang ở đâu", nhưng muốn thay đổi bất cứ điều gì vẫn cần một lệnh gọi thứ hai kèm tham số đúng chính tả; bộ chọn hiển thị cùng trạng thái đó và áp dụng thay đổi trong một lần tương tác. Cú pháp văn bản được giữ lại cho script, thói quen tay và thay đổi kết hợp hai chiều.

**Tách thành hai lệnh `/tools` và `/reasoning`.** Từ chối: hai chiều cùng thuộc một mối quan tâm trình bày ("transcript hiển thị bao nhiêu chi tiết"), một lệnh duy nhất giúp registry và danh sách `/help` nhỏ gọn hơn, đồng thời cho phép một lần gọi kết hợp.

**Cung cấp giá trị mặc định theo chế độ trong key cấu hình.** Ngoài phạm vi: `showReasoning` đã tồn tại như cấu hình; lệnh là trạng thái runtime trên nó, nhất quán với phím tắt.

## Consequences

- Người dùng có thể nhảy đến bất kỳ chế độ chi tiết nào, thiết lập cả hai chiều trong một lần, và thấy trạng thái hiện tại trong bộ chọn — kể cả trên các terminal chặn Ctrl+O/Ctrl+R.
- Bộ phân tích chấp nhận token không theo thứ tự, do đó `/details reasoning expanded` sẽ đảo reasoning và mở rộng thẻ; mỗi chiều theo chỉ thị cuối cùng. Sự nới lỏng này là chủ ý và được ghi trong README.
- Bộ chọn không có trạng thái treo (pending) hoặc hủy: mỗi lần Tab là một thay đổi thực sự đã có hiệu lực, đã thông báo, việc đóng lại không bao giờ hoàn tác. Người dùng lặp quá đích chỉ cần tiếp tục Tab đến giá trị mong muốn.
- Khi một bước mang nhiều sự kiện `assistant/message`, việc tái tạo transcript không còn làm mất tin nhắn assistant; snapshot `details-command` cố định bề mặt tham số và việc phát lại đã sửa, `details-selector` cố định việc Tab áp dụng `hidden` thành `collapsed` mà công tắc vẫn mở, bao gồm thẻ tool đằng sau nó khôi phục hiển thị.
