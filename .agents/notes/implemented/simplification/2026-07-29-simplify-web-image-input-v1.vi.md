# Agent Note: Đơn giản hóa phiên bản đầu của đầu vào ảnh trên Web

Status: implemented

[English](2026-07-29-simplify-web-image-input-v1.md) | Tiếng Việt

## Vấn đề

Lát cắt đầu tiên của đầu vào ảnh Web có lưu trữ bền vững, khi đưa vào năng lực bắt buộc là nhận nhiều ảnh theo thứ tự, đã đồng thời đưa vào những bề mặt mang tính suy đoán: gắn nhà cung cấp tùy ý từ CLI (giao diện dòng lệnh), khám phá phương thức đầu ra, văn bản thay thế, định giá token thị giác không phụ thuộc nhà cung cấp, cùng các API vòng đời trình duyệt không có bên tiêu thụ xuyên package (gói). Giữ lại những bề mặt suy đoán này sẽ biến các hành vi tương lai chưa được chọn thành giao ước công khai, và khiến năng lực ban đầu khó rà soát và bảo trì hơn.

## Quyết định

Phiên bản đầu tiên chấp nhận lô ảnh có thứ tự, và ràng buộc lô đó bằng các giới hạn cấu hình được về số ảnh mỗi tin nhắn và tổng số byte ảnh, cùng giới hạn số byte và số điểm ảnh của từng ảnh. Trình duyệt sẽ từ chối các định dạng khai báo là không hỗ trợ trước khi cấp phát bản xem trước, còn host thì giải mã toàn bộ lô một cách có thẩm quyền, kiểm tra giới hạn của bản triển khai hiện tại, xác thực từng ảnh mà không ghi vào kho lưu trữ, sau đó mới lưu từng ảnh và giữ nguyên thứ tự gửi trong các khối ảnh bền vững được sinh ra. Giới hạn bộ đệm request được suy trực tiếp từ giới hạn tổng số byte ảnh của dịch vụ đính kèm. Nhờ vậy, tính nguyên tử của khâu xác thực được giữ vững mà không cần thêm giao dịch theo lô, giao thức rollback hay ảnh chụp chính sách trong `host.describe`.

Việc chọn nhà cung cấp/model vẫn thuộc về cấu hình và trạng thái profile. Phần ghép lúc khởi động đăng ký các tuyến DeepSeek, OpenAI và Anthropic được bàn giao; CLI không thêm cờ chọn dành riêng cho ảnh, không kiểm tra danh sách nhà cung cấp trong yml và không gắn adapter một cách động.

Metadata model chính xác chỉ mang theo những phương thức đầu vào mà quyết định tiếp nhận hiện tại sẽ tiêu thụ. `ImageBlock` mang tham chiếu tới tệp đính kèm bền vững; tên hiển thị tùy chọn của nó cung cấp văn bản UI cho khả năng tiếp cận, nên khối ở lõi không có trường văn bản thay thế riêng. Việc ước lượng token không phụ thuộc nhà cung cấp sẽ không áp công thức định giá thị giác của một nhà cung cấp cho các tuyến khác.

Seam đính kèm công khai các giới hạn của nó, `validateImage` không chạm vào kho lưu trữ, cùng `saveImage` và `readImage`. Host phụ thuộc vào seam này, chứ không phụ thuộc vào những gì tầng hiện thực xuất lại. Bản nháp trên trình duyệt và thao tác với ảnh trong lịch sử vẫn là phần hiện thực nội bộ của plugin phiên cụ thể; bề mặt `IConversation` công khai chỉ gồm registry đầu vào, cùng các thao tác gửi theo phạm vi, hủy và lịch sử được dùng xuyên ranh giới package.

## Các phương án đã cân nhắc

**Chỉ chấp nhận một ảnh.** So sánh hoặc kết hợp nhiều ảnh là yêu cầu sản phẩm hiện tại. Giới hạn số ảnh và tổng số byte giữ cho đường đi này có biên, mà không cần thu hẹp xuống còn một ảnh.

**Thêm giao dịch lưu trữ hoặc giao thức rollback.** Việc xác thực không chạm vào kho lưu trữ đã ngăn được tình huống một phần tử dị dạng phía sau khiến các phần tử hợp lệ phía trước trở thành đối tượng không còn tham chiếu. Muốn đạt bảo đảm lưu trữ "được tất cả hoặc không gì cả" mạnh hơn giữa các đối tượng địa chỉ hóa theo nội dung độc lập thì cần đến ngữ nghĩa sở hữu hoặc thu hồi, điều mà đường đi sản phẩm hiện tại không cần.

**Giữ các trường và phương thức hướng tương lai làm chỗ giữ chỗ.** Phương thức đầu ra, văn bản thay thế cho khối và dữ liệu bắt tay của model đang hoạt động hiện đều chưa có bên tiêu thụ để ra quyết định. Chờ đến khi bên tiêu thụ đầu tiên xuất hiện rồi mới thêm những thứ này sẽ giữ được tự do lựa chọn giao ước đúng đắn.

**Ước lượng từng ảnh bằng một công thức chia ô.** Định giá thị giác thay đổi theo nhà cung cấp, model, chế độ chi tiết và khâu tiền xử lý. Một ước lượng hardcode và không phụ thuộc nhà cung cấp sẽ trông có vẻ có thẩm quyền nhưng thực chất lại sai; mức dùng do nhà cung cấp báo mới là nguồn hạch toán có thẩm quyền.

**Thêm việc chọn nhà cung cấp/model hoặc gắn động từ CLI.** Cấu hình vốn đã phụ trách việc chọn tuyến, ghép plugin và thông tin xác thực. Lặp lại các lựa chọn này trong cờ đầu vào ảnh sẽ đòi hỏi phân giải hoặc sửa đổi cây cấu hình bên ngoài loader.

## Hệ quả

Tính năng này giữ lại hai giới hạn theo lô và một phương thức xác thực không chạm vào kho lưu trữ mà prompt nhiều ảnh cần đến, đồng thời loại bỏ các trường công khai, thao tác vòng đời, ảnh chụp chính sách và nhánh lắp ráp tuyến không liên quan. Việc chọn nhà cung cấp/model vẫn thuộc về cấu hình ghép hoặc profile. Trước khi thiết kế được bộ ước lượng có nhận biết nhà cung cấp, phép tính áp lực token trước khi gửi request có thể đếm thiếu phần đầu vào thị giác, còn mức dùng được báo cáo thì vẫn chính xác.

Khi đưa lại bất kỳ bề mặt nào đã bị gỡ bỏ, phải có bên tiêu thụ cụ thể và phải định nghĩa giao ước về lỗi, vòng đời, phát lại và kiểm thử cho bên đó, chứ không phải để tương thích với hình hài tiền phát hành này.
