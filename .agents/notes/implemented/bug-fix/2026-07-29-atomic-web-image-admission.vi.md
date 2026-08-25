# Agent Note: Tính nguyên tử của việc thu nhận ảnh trên Web

Status: implemented

[English](2026-07-29-atomic-web-image-admission.md) | Tiếng Việt

## Vấn đề

Cả việc thu nhận prompt có chứa ảnh lẫn `session.selectModel` đều đọc trạng thái modality của phiên trong quá trình trải dài qua truy vấn model bất đồng bộ và truy vấn tệp đính kèm. Nếu không có một ranh giới thứ tự thống nhất, prompt có chứa ảnh có thể vượt qua kiểm tra trên một đích hỗ trợ ảnh, trong khi thao tác chọn chạy song song lại đặt đích chỉ hỗ trợ văn bản; thao tác chọn cũng có thể bỏ sót prompt đã rời khỏi hàng đợi inbox nhưng sự kiện tin nhắn bền vững của nó chưa được phát ra. Quét nhật ký sự kiện bất biến giúp tránh được tình huống tranh chấp thứ hai, nhưng ngay cả khi compaction (nén) đã loại ảnh khỏi lịch sử model hiện tại, cách này vẫn vĩnh viễn chặn việc chọn đích chỉ hỗ trợ văn bản.

## Quyết định

Mỗi Web agent (tác tử thông minh) đang hoạt động đều có một chuỗi promise riêng, dùng chung cho việc thu nhận prompt có chứa ảnh và việc chọn model. Thao tác thất bại vẫn được truyền lên phía gọi như thường lệ, và không làm hỏng chuỗi đó. Prompt chỉ có văn bản đi vòng qua chuỗi này, vì chúng không làm thay đổi ràng buộc modality.

Tập chờ phát sẽ ghi nhận mục xếp hàng khi mục đó rời hàng đợi, còn mục steering được ghi nhận ngay khi vào hàng đợi (mục steering không bao giờ đi vào bản ánh xạ UI của hàng đợi), và mỗi mục được giữ lại cho tới khi sự kiện `user/message` hoặc `steering/message` tương ứng được phát ra. Nếu kết thúc quá trình thu nhận mà không có sự kiện nào được phát, việc chuyển sang trạng thái rảnh sẽ loại bỏ những mục này; việc hủy inbox sẽ loại bỏ các work item được liệt kê, còn dispose (giải phóng tài nguyên) phiên sẽ loại bỏ mọi mục còn lại. Việc chọn model sẽ kiểm tra tập này, bản ánh xạ UI của hàng đợi, cùng `Session.deriveMessages()`; cái sau biểu thị lịch sử mà model hiện thấy được sau khi nén.

Adapter của nhà cung cấp vẫn là ranh giới cưỡng chế kiểm tra sau cùng. Việc kiểm soát thứ tự ở phía host chỉ nhằm tránh để trạng thái định tuyến khả biến và trạng thái ảnh chờ phát của nó mâu thuẫn nhau trước khi lắp ráp request.

## Các phương án từng cân nhắc

**Quét mọi sự kiện phiên bất biến.** Cách này bắt được các ảnh đã phát, nhưng lại coi nội dung đã bị nén loại bỏ là vĩnh viễn hiển thị với model, do đó chặn việc chuyển hợp lệ về tuyến chỉ văn bản sau này.

**Loại bỏ bản ánh xạ chờ xử lý ngay khi rời hàng đợi inbox.** Việc rời hàng đợi xảy ra trước khi tin nhắn bền vững được ghi nối, nên đúng là sẽ để lại một khoảng thời gian mà việc chọn model không thấy được cả trạng thái chờ xử lý lẫn trạng thái đã phát.

**Tuần tự hóa mọi prompt và mọi thay đổi phiên.** Prompt chỉ có văn bản và các thao tác phiên không liên quan không thể đưa vào yêu cầu về ảnh. Khóa rộng hơn sẽ tăng độ trễ và độ phức tạp về quyền sở hữu, mà không loại bỏ thêm được tình huống tranh chấp modality nào.

## Hệ quả

Giữa việc thu nhận prompt có chứa ảnh và việc chọn model chạy song song có một thứ tự trước sau xác định, và đích chỉ hỗ trợ văn bản không thể làm mắc kẹt những ảnh đã được thu nhận nhưng chưa phát. Việc chọn model có thể phải chờ quá trình thu nhận ảnh đang diễn ra hoàn tất, còn các prompt không liên quan vẫn được xử lý song song theo cách hiện có. Khi không còn ảnh nào chờ phát, và lịch sử dẫn xuất sau khi nén cũng không còn chứa ảnh, thì đích chỉ hỗ trợ văn bản có thể trở nên hợp lệ.
