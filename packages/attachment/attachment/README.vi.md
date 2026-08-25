# @deepseek-ai/dsh-attachment

[English](README.md) | Tiếng Việt

Ranh giới service đính kèm bền vững. `ctx.attachments` kiểm tra và gửi bền vững các byte ảnh bất biến, sau đó trả về `ImageAttachmentRef` có thể tuần tự hóa; bên tiêu thụ tuyệt đối không lưu bền vững đường dẫn trình duyệt, object URL, URL nhà cung cấp hay base64 trong sự kiện phiên.

Ảnh trong vùng nhập chưa gửi vẫn là bản nháp tạm thời do trình duyệt nắm giữ. `validateImage` chạy đúng chính sách tiếp nhận đó nhưng không thực hiện lưu bền vững. `saveImages` phụ trách giới hạn số lượng ảnh và tổng số byte của một lô, kiểm tra toàn bộ thành viên trước, rồi gửi lần lượt, và chỉ trả về tham chiếu khi cả lô thành công trọn vẹn. Lỗi lưu trữ về sau sẽ không trả về tham chiếu từng phần, nhưng các đối tượng bất biến định địa chỉ theo nội dung được ghi sớm hơn có thể vẫn không thể tiếp cận cho tới khi có thu gom rác nhận biết tham chiếu. `AttachmentError.code` dùng kiểu union chuỗi đóng `AttachmentErrorCode`. Tập con `ImageAdmissionErrorCode` của nó đánh dấu các lỗi đầu vào ảnh mà bên gọi có thể tự sửa; `isImageAdmissionError` nhận diện tập con đó tại runtime, để mỗi adapter giao thức có thể ánh xạ sang từ vựng lỗi của riêng mình. `saveImage` gửi một ảnh đã được chấp nhận trước khi phát ra bất kỳ sự kiện phiên nào mà mô hình nhìn thấy, còn `readImage` kiểm tra đối tượng định địa chỉ theo nội dung dựa trên metadata đã ghi. Bên gọi có thể hủy `readImage`; phần hiện thực quan sát việc hủy tại ranh giới giữa thao tác đọc backend và công việc kiểm tra, đồng thời giữ nguyên ngữ nghĩa hủy chứ không chuyển nó thành lỗi lưu trữ.

## Trải nghiệm mô hình

Package này ảnh hưởng gián tiếp tới mô hình thông qua `ImageBlock` lõi không phụ thuộc vai trò, cùng các adapter nhà cung cấp phân giải tham chiếu bền vững của nó.

#### Ảnh hưởng KV cache

Thêm ảnh làm thay đổi yêu cầu gửi tới nhà cung cấp, nên sẽ vô hiệu hóa phần hậu tố của các yêu cầu bị ảnh hưởng.

## Hạn chế đã biết và phần việc còn dang dở

- Phiên bản đầu chỉ chấp nhận PNG, JPEG, WebP và GIF.
- Chính sách lưu giữ và thu gom rác chưa được hiện thực, vì các phiên sau khi khôi phục và fork có thể dùng chung đối tượng bất biến.
- File thông thường, âm thanh, video và bản nháp chưa gửi được lưu bền vững cần vòng đời cùng hợp đồng nhà cung cấp riêng.
