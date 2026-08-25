# Agent Note: Gỡ bỏ nút chỉnh sửa rỗng của tin nhắn user

Status: implemented

[English](2026-07-31-drop-user-message-edit-stub.md) | Tiếng Việt

## Vấn đề

Hàng IconActions của bong bóng user còn có một nút chỉnh sửa nằm cạnh nút sao chép và rẽ nhánh, nhưng phía sau nó không có gì cả: điều khiển này không có trình xử lý click, không có mutation phía client, và cũng không có thao tác phía host để gửi lại tin nhắn đã chỉnh sửa. Khi người dùng tìm thấy nó, thứ họ thấy là một khả năng tương tác mà sản phẩm không thể thực hiện được.

## Quyết định

`MessageIconActions` chỉ render đồng hồ/sao chép/rẽ nhánh, prop `edit` của nó bị xóa cùng với nút; `MessageItem` không còn truyền prop đó nữa. Giờ đây bong bóng user và phần chrome của assistant chỉ khác nhau ở vị trí đồng hồ. README của package ghi lại năng lực còn thiếu này trong mục Known Limitations, còn đầu ra kỳ vọng của message-actions bên web thì cố định hàng thao tác không chứa điều khiển đó.

Locale công khai vẫn giữ mục từ `edit` dùng chung: đó là từ vựng dùng chung, không phải nội dung văn bản của component này.

Khi đưa lại điều khiển này, nó phải xuất hiện cùng với năng lực tương ứng: vừa cần mutation phía client để chỉnh sửa tin nhắn user đã chốt, vừa cần phía host quyết định xem tin nhắn sau chỉnh sửa đó có ý nghĩa gì với những lượt vốn đã tiêu thụ nó.

## Các phương án đã cân nhắc

**Làm mờ nút và thêm tooltip.** Một điều khiển hiển thị nhưng vô hiệu vẫn tuyên bố rằng có thể chỉnh sửa, và chi phí giải thích thì vẫn thế; gỡ bỏ hẳn mới là trạng thái trung thực.

**Nối vào trình soạn thảo hàng đợi.** Trình soạn thảo hàng đợi chỉnh sửa những tin nhắn chưa gửi. Tin nhắn user đã chốt thì đã đi vào transcript (bản ghi văn bản) và ngữ cảnh của model, nên tái dùng trình soạn thảo đó sẽ âm thầm biến cùng một thao tác thành một việc khác hẳn.

## Hệ quả

Web không có cách nào để sửa lại tin nhắn đã gửi; rẽ nhánh từ tin nhắn đó là cử chỉ sẵn có gần nhất. Vì nội dung hàng thao tác hoàn toàn được ghép từ props, nên khi mutation phía client đã sẵn sàng thì việc đưa lại chỉ là một thay đổi thuần UI.
