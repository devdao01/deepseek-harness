# Agent Note: Ràng buộc danh tính session JSONL trước khi thay đổi

Status: implemented

[English](2026-07-20-jsonl-storage-identity.md) | 中文

## Vấn đề

Việc tra cứu JSONL chọn ra log vật lý trong các thư mục dự án dựa theo session id được yêu cầu, còn `SessionHeader` thu được sau khi phân tích sẽ cung cấp metadata dùng cho các thao tác sửa chữa và ghi nối về sau. Nếu hai dữ kiện này không được ràng buộc với nhau, log được chọn cho session A có thể khai báo id hoặc cwd của session B, và chuyển hướng việc sửa chữa hay ghi nối về sau sang đường dẫn của B. Khi cùng một id đã mã hóa xuất hiện trong nhiều thư mục dự án, việc quét dự án cũng phải cho ra kết quả xác định. SQLite không có sự mơ hồ này, vì truy vấn theo khóa chính ràng buộc metadata và sự kiện vào đúng id được yêu cầu.

## Quyết định

`loadStored(id)` là thao tác tra cứu tiền tố đã lưu duy nhất của bộ điều phối. Backend JSONL quét mọi thư mục dự án, yêu cầu có nhiều nhất một thư mục session mà tên khớp với giá trị đã mã hóa của id đó và bên trong có chứa transcript (bản ghi văn bản), phân tích transcript trong đó, rồi xác thực `header.id === id`, đồng thời xác thực rằng đường dẫn được chọn hoặc bằng `logPath(root, header.cwd, header.id)`, hoặc sau khi chuẩn hóa đường dẫn hệ thống file thì cả hai cách viết cùng phân giải về một transcript duy nhất. `list()` thực hiện đúng việc xác thực đường dẫn đó, và từ chối các id trùng lặp giữa các thư mục dự án.

Bộ điều phối khẳng định id trả về một cách độc lập, và so sánh cwd đã lưu với cwd của session đang hoạt động trước khi sửa chữa, công bố trạng thái hoặc lưu bền vững phần hậu tố. Bộ điều phối giữ một bản sao riêng của metadata đã xác thực; các thao tác ghi nối và sửa chữa của JSONL suy ra đường dẫn từ bản sao đó. Nhờ vậy, interface `PersistenceBackend<TornMarker>` không cần tra cứu session đang hoạt động theo phạm vi, cũng không cần kiểu định vị lưu trữ.

Nếu thư mục gốc JSONL đã cấu hình đã tồn tại, thì khi nạp plugin, đường dẫn đó phải là một thư mục đọc được. Thư mục gốc không tồn tại vẫn là cấu hình hợp lệ, thư mục sẽ được tạo ở lần vật chất hóa đầu tiên. Backend chỉ hỗ trợ một bên ghi đang hoạt động cho mỗi session; trước khi chủ sở hữu hoàn tất dispose (giải phóng tài nguyên) và mọi thao tác ghi dừng lại, một instance backend khác hoặc tiến trình khác không được thay đổi session đó.

## Phương án khác đã cân nhắc

**Lưu trữ phẳng theo session id.** Không gian tên phẳng sẽ khiến các lần công bố trùng lặp xung đột trên cùng một đường dẫn, nhưng việc xác thực đường dẫn và từ chối bản trùng đã đủ để loại bỏ khiếm khuyết về danh tính mà không cần đặt các kiểm tra phụ thuộc vào một không gian tên toàn cục phẳng.

**Truyền bộ định vị lưu trữ mờ qua bộ điều phối.** Bộ định vị có thể ràng buộc thay đổi JSONL trực tiếp vào đường dẫn được chọn, nhưng JSONL có thể suy lại đường dẫn đó từ metadata đã được xác thực. Việc thêm một generic và một tham số cho SQLite, backend thử nghiệm, cùng các thao tác ghi nối và sửa chữa sẽ bắt mọi hiện thực phải gánh một khái niệm mà chỉ backend theo file mới cần.

**Điều phối nhiều bên ghi đang hoạt động.** Một service điều phối chuyên biệt, một registry toàn cục ở cấp tiến trình, hoặc khóa liên tiến trình sẽ định nghĩa một topology triển khai mới, chứ không sửa được việc xác thực danh tính. Topology được hỗ trợ chỉ có một bên ghi đang hoạt động; việc công bố bằng hard link cấm ghi đè vẫn phân xử được tranh chấp tạo mới cùng id ban đầu.

## Hệ quả

Danh tính không khớp, vị trí sai và trùng lặp của log JSONL sẽ thất bại trước khi sửa chữa hoặc trước khi thay đổi trạng thái bộ điều phối. Chi phí tra cứu vẫn tỉ lệ với số lượng thư mục dự án, và quyền sở hữu một bên ghi đang hoạt động duy nhất vẫn là giới hạn rõ ràng. Các test của bộ điều phối và JSONL cố định việc từ chối trước khi sửa chữa, việc byte của cả hai log bị ảnh hưởng đều không đổi, việc xác thực đường dẫn khi liệt kê, việc từ chối id trùng lặp, xung đột chuẩn hóa đường dẫn dự án và bí danh phân biệt hoa thường, cùng việc xác thực thư mục gốc lúc nạp.
