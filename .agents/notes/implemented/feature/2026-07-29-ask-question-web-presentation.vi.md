# Agent Note: Trình bày Ask-question trên Web

Status: implemented

[English](2026-07-29-ask-question-web-presentation.md) | 中文

## Vấn đề

Web GUI đã có thể tiếp quản việc thu thập câu trả lời qua khu vực input của `QuestionComposer`, nhưng phần trình bày bản ghi session xung quanh nó sai ở ba điểm. Câu hỏi đang chờ trả lời được render hai lần: một lần do khu vực input tiếp quản, một lần là thẻ placeholder chỉ đọc `PendingCard` có từ trước khi có việc tiếp quản. Lời gọi `ask_user_question` đã settle render thành hàng "Tool call" generic và đổ thẳng args JSON gốc, nên cả hai kiểu phán quyết của khu vực input — người dùng bỏ toàn bộ nhóm câu hỏi (`ASK_CANCELLED`) và lượt bị ngắt trong lúc câu hỏi đang chờ trả lời (`ASK_ABORTED`) — đều hiển thị thành chấm đỏ thất bại vô danh. Hơn nữa, văn bản giao diện của chính khu vực input (phân trang, nút, placeholder, phản hồi kiểm tra) là tiếng Trung được hard-code, trong khi client xung quanh đã song ngữ qua `dsh-client-locale`.

Ngoài ra, hình ảnh khu vực input cũng lệch khỏi thiết kế hiện tại: câu trả lời tự viết cần mở rộng mới nhập được, chọn nhiều ngoài dấu tick ở cuối không có dấu hiệu nào khác, phân trang gắn ở header, và còn có giao ước parse hậu tố tiêu đề `（可多选）` từ văn bản model.

## Quyết định

Một câu hỏi đang chờ trả lời chỉ có đúng hai giao diện: khu vực input tiếp quản việc thu thập câu trả lời, một hàng toolview `ask_user_question` chuyên dụng trong bản ghi session trình bày kết quả tương tác. Hàng này đăng ký vào slot có key `tool.call.toolview` hoàn toàn giống `todo_write`, và tái sử dụng `ToolRow` dùng chung (giao diện, hiệu ứng chạy, mở rộng ở đầu). Tóm tắt của nó là phán quyết tương tác chứ không phải tham số: đang chạy hiển thị `waiting`, sau khi settle suy ra `N/M answered` từ JSON kết quả (câu trả lời bị bỏ qua — `selected` rỗng và không có `custom` — không được tính), `ASK_CANCELLED` hiển thị `cancelled`, `ASK_ABORTED` hiển thị `interrupted` và dùng chung ngữ nghĩa stopped màu hổ phách. Kết quả dị dạng hoặc bị cắt sẽ fallback về tóm tắt generic. `PendingCard` từng được thu hẹp thành `PendingWait<'approval'>`, `ChatView` từng lọc danh sách đang chờ chỉ còn chờ phê duyệt, khiến thẻ placeholder chỉ phục vụ phê duyệt; sau đó việc tiếp quản khu vực input của phê duyệt ([Quyền và phê duyệt trên Web](2026-07-23-web-permission-and-approval.md)) đã loại bỏ nó hoàn toàn.

Thiết kế lại khu vực input chuyển phân trang xuống cạnh khu vực thao tác ở dưới cùng, tùy chọn chọn nhiều render checkbox tường minh, chọn một giữ hàng đánh số, và thay lối vào tự viết dạng mở rộng bằng hàng nhập tự viết luôn hiển thị (câu hỏi không có tùy chọn dùng ô văn bản nhiều dòng). Xóa giao ước hậu tố chọn nhiều của `parseQuestionTitle`; `multi_select` đã là metadata có cấu trúc, tiêu đề được render nguyên trạng.

Văn bản giao diện khu vực input được song ngữ hóa: plugin đăng ký từ điển Trung-Anh dưới namespace `question` của `dsh-client-locale`, và qua inject face của slot cung cấp translator gắn với namespace cùng locale snapshot làm nguồn cho hooks compartment; khu vực input đã mount sẽ render lại khi đổi ngôn ngữ. Phản hồi kiểm tra được lưu bằng key từ điển, dịch lại khi chuyển đổi; thông báo lỗi từ vật mang và toàn bộ văn bản câu hỏi/tùy chọn do model viết được render nguyên trạng.

Hai sửa lỗi liên quan đi kèm. Mọi icon đầu dòng toolview generic (bao gồm mũi tên hover) giờ đồng nhất kế thừa màu nhãn cấp ba — xóa việc ghi đè màu cấp hai của biến thể others và quy tắc màu mũi tên độc lập, chỉ giữ lại điểm nhấn màu nghiệp vụ cordis có chủ đích. Bộ đóng gói dev-watch của client dùng `addWatchFile` đăng ký mỗi CSS module, vì lớp gián tiếp virtual module trước đây khiến watcher không thấy được các chỉnh sửa chỉ động vào CSS.

## Phương án thay thế đã cân nhắc

**Tiếp tục render câu hỏi qua `PendingCard`.** Bác bỏ: thẻ đó là placeholder chỉ đọc có từ trước khi có việc tiếp quản, dẫn đến cùng nội dung hiển thị hai lần mà một trong hai không trả lời được. Hàng toolview cộng việc tiếp quản cùng lúc bao phủ cả hai mặt ghi lại và thu thập.

**Hiển thị câu hỏi hoặc câu trả lời nội tuyến trong hàng bản ghi session.** Bác bỏ: việc tiếp quản khu vực input sở hữu render câu hỏi và thu thập câu trả lời, còn giao ước của hàng (`todo_write`) là một dòng, chi tiết nằm trong panel. Do đó hàng chỉ báo cáo kết quả, giống như hàng todo báo cáo số lượng còn panel sở hữu danh sách.

**Render `ASK_CANCELLED`/`ASK_ABORTED` bằng hình thái lỗi generic.** Bác bỏ: bỏ dở là thao tác chủ động của chính người dùng, ngắt là cử chỉ dừng dùng chung; cả hai đều là kết quả dự kiến chứ không phải tool thất bại. Phán quyết được đặt tên (và interrupted vẫn giữ ngữ nghĩa stopped màu hổ phách) nhất quán với cách trình bày các lời gọi tool bị ngắt khác.

**Dịch ngay văn bản phán quyết nội tuyến trong hàng.** Hoãn lại theo quyết định sản phẩm rõ ràng: các chuỗi `waiting`/`answered`/`cancelled`/`interrupted` của hàng vẫn giữ tiếng Anh trong lần thay đổi này; việc quốc tế hóa văn bản giao diện khu vực input được triển khai vì văn bản chỉ tiếng Trung của nó vốn dĩ sai ở ngôn ngữ en.

**Giữ giao ước hậu tố chọn nhiều trong tiêu đề.** Bác bỏ: `multi_select` là metadata request có cấu trúc và dấu hiệu checkbox đã mang tín hiệu đó, parse `（可多选）` từ văn bản model là một kênh lặp lại dễ vỡ.

## Hậu quả

`ask_user_question` và `todo_write` giờ cùng minh họa mẫu toolview dự kiến: tái sử dụng `ToolRow`, tóm tắt fallback có kiểm tra hình dạng từ tham số lời gọi hoặc JSON kết quả, đăng ký qua slot có key. `todo-row.module.css` chuyên dụng đã bị xóa.

Chuỗi phán quyết nội tuyến trong hàng là mặt tiếng Anh hard-code cuối cùng còn lại của luồng câu hỏi; bản địa hóa nó là công việc tiếp theo bị hoãn lại. Việc tiếp quản khu vực input của phê duyệt đã được giao ([Quyền và phê duyệt trên Web](2026-07-23-web-permission-and-approval.md), và áp giới hạn chiều cao theo [Agent Note panel phê duyệt](../bug-fix/2026-07-30-approval-panel-command-cap.md)), `PendingCard` không còn tồn tại.

`ui-user-questions` thêm dependency `dsh-client-locale` và inject face mà trước đây không có; giao ước của nó (`QuestionComposerInjected`) cùng bên tiêu thụ được đặt trong `contract/slots.ts`.

## Xác minh

Test `ui-conversation` chốt ma trận waiting/answered/skipped/cancelled/interrupted/fallback của hàng, việc lọc danh sách đang chờ chỉ còn phê duyệt và đăng ký slot; test `ui-user-questions` chốt khu vực input đã thiết kế lại (checkbox chọn nhiều, hàng tự viết luôn hiển thị, phân trang ở dưới cùng, phản hồi key từ điển dịch lại, Enter an toàn với IME) cùng việc plugin đăng ký từ điển và inject face; test `ui-primitives` chốt bộ icon. Web GUI đã lắp ráp đã diễn tập đường trả lời, hủy và ngắt lượt trong session thật.
