# @deepseek-ai/dsh-attachment-local

[English](README.md) | Tiếng Việt

Đây là phần hiện thực cục bộ riêng tư của [`@deepseek-ai/dsh-attachment`](../attachment). Đối tượng được đặt tại `<DSH_HOME>/attachments/v1/objects/<sha256-prefix>/<sha256>` và được định địa chỉ bằng định danh `sha256:` không trong suốt. Mỗi tiến trình đều chứng minh một lần tính bền vững cho một home nhất định bằng cách đồng bộ lần lượt từng mục thư mục tổ tiên lên tới thư mục gốc của hệ thống file, nên tuyệt đối không nhầm một thư mục do tiến trình khác đã tạo nhưng chưa đồng bộ thành ranh giới an toàn. Sau đó, quá trình ghi dùng thư mục tạm riêng tư, file chỉ chủ sở hữu truy cập được, file tạm đã được đồng bộ, phát hành bằng hard link nguyên tử và độc quyền, cùng việc đồng bộ thư mục trên đường dẫn phát hành (áp dụng cho POSIX; Windows dựa vào nhật ký metadata của hệ thống file), bảo đảm tham chiếu đã báo cáo vẫn tồn tại sau sự cố sập. Cả khâu tiếp nhận khi ghi lẫn khâu đọc đều giải mã trọn vẹn ảnh raster rồi mới chấp nhận định dạng và kích thước của nó; khâu đọc còn kiểm tra lại digest và metadata đã ghi. Giới hạn byte và pixel thuộc chính sách tiếp nhận lúc ghi, nên việc siết chặt giới hạn về sau không làm cho lịch sử đã được tiếp nhận trở nên không đọc được.

`DSH_HOME` được phân giải theo chính sách đường dẫn dùng chung: cấu hình tường minh, `$DSH_HOME`, rồi cuối cùng là `~/.dsh`. Log phiên chỉ chứa tham chiếu và metadata đã được kiểm tra, tuyệt đối không chứa đường dẫn host này. `readImage` truyền tín hiệu hủy tùy chọn vào thao tác đọc hệ thống file, quan sát tín hiệu ấy trước và sau khi kiểm tra, đồng thời giữ nguyên ngữ nghĩa hủy chứ không gói nó thành `ATTACHMENT_READ_FAILED`.

## Trải nghiệm mô hình

Package này ảnh hưởng gián tiếp tới mô hình thông qua việc phát lại bền vững ảnh lịch sử của người dùng và ảnh kết quả có cấu trúc của mô hình sau khi khởi động lại và fork.

#### Ảnh hưởng KV cache

Ngoài khối ảnh do adapter phát ra yêu cầu nắm giữ, không phát sinh ảnh hưởng nào khác.

## Hạn chế đã biết và phần việc còn dang dở

- Đối tượng được giữ lại vô thời hạn; thu gom rác dựa trên tham chiếu chưa được hiện thực.
- Backend cục bộ giả định host và adapter nhà cung cấp dùng chung một service hệ thống file.
- Metadata của GIF động được kiểm tra theo màn hình logic; chiến lược giải mã từng khung thuộc về nhà cung cấp.
