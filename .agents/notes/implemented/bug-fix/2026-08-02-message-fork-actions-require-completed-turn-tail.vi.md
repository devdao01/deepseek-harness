# Agent Note: Thao tác fork message yêu cầu message nằm ở đuôi turn đã hoàn tất

Status: implemented

[English](2026-08-02-message-fork-actions-require-completed-turn-tail.md) | 中文

## Vấn đề

Web session gắn thao tác fork vào node assistant có text không rỗng cuối cùng trong mỗi turn. Nếu phía sau còn có tool result, reasoning node bị ngắt, hoặc lỗi cuối cùng, các dòng đó cũng không tiếp quản thao tác này, vì chúng không có IconActions gắn với content text. Do đó, icon fork có thể xuất hiện ngay dưới response của assistant, trong khi vẫn còn nhiều dòng khác của cùng turn nằm phía sau nó. Host mở rộng đúng mỏ neo message đó tới `turn/end` chứa nó, nhưng vị trí icon lại khiến thao tác trông như đang cắt ở cấp message, và subsession sẽ rõ ràng kế thừa cả phần đuôi còn lại của cùng turn đó.

## Quyết định

`ConversationSnapshot.turnEnds` giữ lại ranh giới turn đã hoàn tất trong cửa sổ event gốc. Session view duyệt qua các node transcript (bản ghi văn bản) theo từng ranh giới, chỉ bật thao tác fork khi node cuối cùng của ranh giới đó là user message, message steering (dẫn dắt giữa chừng) bền, hoặc assistant message có nội dung. Turn còn mở không có message đủ điều kiện; nếu phía sau còn tool result, phần bị ngắt chỉ có nội dung reasoning, lỗi turn, hoặc node transcript khác, thao tác fork trên message trước đó sẽ vẫn ở trạng thái không khả dụng. Control không khả dụng vẫn hiển thị, có thể focus, có thể hover; `aria-disabled`, tooltip và `aria-describedby` sẽ giải thích yêu cầu về đuôi đã hoàn tất, và sẽ không gửi request tới Host. Copy và đồng hồ vẫn dùng được dưới lớp chrome message hiện có, ngữ nghĩa fork theo turn đã hoàn tất của Host giữ nguyên.

Nửa phần liên quan tới message bubble trong việc xác định điều kiện này đã được thay thế bởi [quyết định loại bỏ action branch khỏi bubble của user](../simplification/2026-08-06-user-bubbles-drop-the-branch-action.md): bubble user và steering không còn render control này nữa, nên chỉ đuôi assistant có nội dung mới có thể fork; việc chặn phía assistant và cách hiển thị nhìn thấy nhưng không khả dụng vẫn có hiệu lực.

Quyết định này thắt chặt điều kiện đủ về message đã được [quyết định về thao tác fork của Web session](../feature/2026-07-27-web-session-fork-actions.md) trước đó định nghĩa. Fork ở cấp dòng Session vẫn chọn turn đã hoàn tất mới nhất; thao tác message đủ điều kiện vẫn truyền seq event của nó qua thao tác runtime client dùng chung.

## Các phương án đã cân nhắc

**Cắt event log tại vị trí message assistant được click.** Không chọn: message assistant có thể nằm trong một step chưa kết thúc, hoặc chứa lời gọi tool mà kết quả xuất hiện sau đó. Phần đầu log gốc cắt tại seq đó không phải một turn có cấu trúc hoàn chỉnh, và cũng có thể không phải transcript hợp lệ đối với provider.

**Suy luận trạng thái hoàn tất từ `running` hoặc user message tiếp theo.** Không chọn: turn retry và turn steering không nhất thiết khớp với bubble user hiển thị tiếp theo, và cửa sổ phân trang cũng có thể bỏ qua bubble đó. Event `turn/end` bền mới là fact hoàn tất có thẩm quyền.

**Ẩn fork cho mọi turn bị ngắt.** Không chọn: turn đã hủy vẫn đóng bền, và text bị ngắt cuối cùng của nó có thể chính là đuôi transcript thật sự. Điều kiện đủ phụ thuộc vào ranh giới đã hoàn tất và thứ tự node, không phụ thuộc vào loại kết quả.

**Ẩn control trên message không đủ điều kiện.** Không chọn: control biến mất không thể giải thích được yêu cầu về ranh giới, còn khiến lớp chrome message vốn phải ổn định bị dịch chuyển. Giữ control có thể focus nhưng không khả dụng vừa duy trì gợi ý thao tác, vừa ngăn được request.

## Hệ quả

Icon fork được bật giờ đại diện đúng ranh giới turn đã hoàn tất mà Host thực sự sao chép. Trong hình thái đã báo cáo "response → tool → Think bị ngắt", response vẫn giữ copy, đồng hồ, và một control fork bị vô hiệu hóa giải thích lý do không thao tác được. Thay đổi này cố ý không cung cấp việc sửa transcript trong cùng turn, cũng không cung cấp thao tác retry trước turn; khi người đọc muốn copy đầy đủ turn đã hoàn tất mới nhất, vẫn có thể dùng thao tác dòng Session. Test runtime cố định phép chiếu ranh giới và tính ổn định của tham chiếu, test session bao phủ đuôi assistant, đuôi chỉ có user message, đuôi steering bền, và control không khả dụng do dòng tool tiếp theo cùng dòng reasoning bị ngắt gây ra.
