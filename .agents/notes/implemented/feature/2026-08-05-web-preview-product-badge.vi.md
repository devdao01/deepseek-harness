# Agent Note: Huy hiệu sản phẩm bản xem trước (preview) trên Web

Status: implemented

[English](2026-08-05-web-preview-product-badge.md) | Tiếng Việt

## Vấn đề

Trạng thái rỗng của Web không cho biết sản phẩm đang ở giai đoạn preview. Người dùng có thể vào thẳng giao diện phiên hội thoại chính mà không thấy rằng sản phẩm chưa chính thức phát hành; còn nếu chuyển thành một tùy chọn cấu hình triển khai, điều đó sẽ diễn giải sai một quyết định vòng đời áp dụng cho toàn bộ sản phẩm thành một lựa chọn của người vận hành.

## Quyết định

Khu vực visual chính của trạng thái rỗng luôn render một huy hiệu `Preview` / `预览版` đã bản địa hóa ngay dưới tiêu đề. Nó không có công tắc cấu hình: trạng thái preview là một phần bản sắc sản phẩm chung cho mọi lần triển khai, chứ không phải một tham số có thể điều chỉnh theo từng lần triển khai.

Huy hiệu dùng nền business-tertiary, giúp cả hai theme (sáng và tối) đều giữ được ngữ cảnh thị giác màu xanh sản phẩm; còn chữ thì dùng token nhãn primary của theme. Sự kết hợp này giúp văn bản 12px thông thường có đủ độ tương phản ở cả theme sáng lẫn tối. Màu tiền cảnh business-primary chỉ dành cho văn bản cỡ lớn hơn hoặc các yếu tố nhấn phi văn bản, vì nó không đạt độ tương phản yêu cầu trên nền đó.

Khi lần phát hành có gắn tag đầu tiên xóa bỏ lập trường tiền phát hành của repo, hoặc khi bên sở hữu sản phẩm quyết định rõ ràng rằng giai đoạn preview đã kết thúc, sản phẩm sẽ gỡ bỏ huy hiệu này. Thay đổi đó sẽ gỡ cả huy hiệu lẫn locale key của nó cùng lúc, thay vì thêm một công tắc runtime.

## Các phương án thay thế đã cân nhắc

**Làm cho trạng thái preview có thể cấu hình được.** Không chấp nhận: hai lần triển khai của cùng một sản phẩm tiền phát hành không được phép hiển thị bản sắc vòng đời khác nhau, và một trường cấu hình còn biến trạng thái phát hành sản phẩm thành một lựa chọn của người vận hành mà lẽ ra không nên được hỗ trợ.

**Dùng chữ business-primary trên nền business-tertiary.** Không chấp nhận: độ tương phản kết quả ở cả theme sáng và tối đều thấp hơn mức 4.5:1 mà chữ 12px của huy hiệu yêu cầu.

**Ẩn huy hiệu khỏi cây accessibility.** Không chấp nhận: trạng thái preview là thông tin sản phẩm chứ không phải trang trí, do đó tiêu đề accessibility sẽ bao gồm cả chữ của huy hiệu.

## Hệ quả

Mỗi phiên hội thoại mới đều hiển thị cùng một bản sắc preview đã bản địa hóa, cả trong output thị giác lẫn output accessibility. Gỡ bỏ trạng thái preview là một thay đổi phát hành sản phẩm rõ ràng; huy hiệu giữ nền màu xanh business trong khi dùng chữ màu trung tính dễ đọc, thay vì phương án toàn màu xanh.

## Kiểm thử

Test component bao phủ hai giá trị huy hiệu đã bản địa hóa, còn snapshot vòng đời Web thì cố định huy hiệu tiếng Anh trong khu vực visual chính của trạng thái rỗng sau khi lắp ráp.
