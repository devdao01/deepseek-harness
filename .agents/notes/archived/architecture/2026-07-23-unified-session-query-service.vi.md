# Agent Note: Dịch vụ truy vấn phiên hợp nhất

Status: implemented
Archived: 2026-07-26

[English](2026-07-23-unified-session-query-service.md) | 中文

## Vấn đề

Đọc chính xác, lọc ngữ nghĩa, truy vết quan hệ và tìm kiếm toàn văn đều tác động lên cùng một kho ngữ liệu phiên ưu tiên nguồn thời gian thực. Việc phơi bày tìm kiếm toàn văn dưới một context key thứ hai sẽ khiến các bên tiêu thụ và tổ hợp ứng dụng coi cùng một chức năng truy vấn là hai dịch vụ, dù chỉ có phần triển khai SQLite là đặc thù backend.

Gói interface đã có sẵn các hợp đồng chung về bản ghi, lọc, truy vết, yêu cầu tìm kiếm, con trỏ (cursor) và lỗi. Registry nhà cung cấp hoặc bộ điều phối sẽ đưa vào ngữ nghĩa lựa chọn thời gian chạy, trong khi hiện chưa có bên tiêu thụ nào hỗ trợ ngữ nghĩa đó.

## Quyết định

`SessionQueryService` là dịch vụ trừu tượng duy nhất được đăng ký dưới tên `ctx.sessionQuery`. Nó triển khai danh sách truy vấn, đọc tiêu đề và sự kiện, đọc bề mặt, lọc và truy vết quan hệ thông qua `SessionCorpus` không phụ thuộc backend. Chỉ có hai phương thức `searchSessions()` và `searchEvents()` là phương thức trừu tượng.

`SessionQuerySqlite` mở rộng dịch vụ này và là backend cụ thể duy nhất. Do đó, một instance được mount có thể phơi bày toàn bộ các thao tác qua `ctx.sessionQuery`; các thao tác chính xác được kế thừa dùng triển khai corpus chung, trong khi vòng đời do SQLite quản lý chịu trách nhiệm quan sát nguồn dữ liệu, đồng bộ chỉ mục FTS phái sinh, sắp xếp các kết quả khớp và quản lý thế hệ con trỏ. Gói interface không cung cấp plugin cụ thể riêng biệt, registry nhà cung cấp tìm kiếm, hay context key thứ hai.

Quá trình đồng bộ của SQLite là một máy trạng thái tuần tự có đảm bảo tính tĩnh lặng. Nó chuyển tín hiệu abort gốc của bên gọi tới các thao tác liệt kê và kiểm tra snapshot đã lưu bền vững, chờ trực tiếp từng thao tác backend đã khởi động, và kiểm tra hủy sau mỗi lần chờ cũng như trước khi khởi động nguồn dữ liệu hoặc thao tác chỉ mục tiếp theo. Do đó, ngay cả khi backend bỏ qua việc hủy hoặc đang phối hợp dọn dẹp, bộ tuần tự hóa cũng sẽ không giải phóng sớm; sau khi quan sát thấy tín hiệu hủy, cũng sẽ không khởi động thêm thao tác liệt kê, kiểm tra, đồng bộ hoặc truy vấn nào nữa.

Cấu hình backend, ngoài đường dẫn chỉ mục, chế độ log, giới hạn phân trang và giới hạn độ dài đoạn văn bản trích của riêng nó, còn bao gồm cấu hình `readWindowMax` được kế thừa. Ứng dụng bên thứ nhất cần truy vấn phiên sẽ mount backend SQLite và đặt chỉ mục có thể vứt bỏ của nó cạnh thư mục gốc lưu bền vững đã cấu hình.

Cấu trúc dịch vụ này thay thế phần nói về việc tách context key trong [quyết định truy vấn chính xác](../feature/2026-07-10-session-query-service.md) và [quyết định tìm kiếm SQLite](../feature/2026-07-10-sqlite-session-query-provider.md); các quyết định về corpus, truy vấn, tokenizer, đồng bộ và bảo mật trong đó vẫn còn hiệu lực.

## Phương án thay thế đã cân nhắc

- **Giữ `ctx.sessionQuery` và `ctx.sessionSearch` độc lập với nhau**: không áp dụng, vì cả hai đều cung cấp thao tác trên cùng một kho ngữ liệu logic, buộc bên tiêu thụ phải nhận diện hai key, và có thể khiến ứng dụng vô tình mount một tập hợp interface truy vấn không đầy đủ.
- **Giữ dịch vụ cơ sở cụ thể, rồi để plugin SQLite đăng ký hoặc sửa hai phương thức tìm kiếm**: không áp dụng, vì tính khả dụng của phương thức sẽ phụ thuộc vào thứ tự plugin và thời điểm dispose, và dịch vụ này sẽ cần định nghĩa một giao thức đăng ký nhà cung cấp cho triển khai duy nhất đó.
- **Chuyển toàn bộ triển khai truy vấn vào gói SQLite**: không áp dụng, vì đọc chính xác, lọc và truy vết không cần chỉ mục, và đều thuộc hành vi chung nên đặt cùng hợp đồng không phụ thuộc nhà cung cấp.

## Hệ quả

Bên tiêu thụ chỉ cần inject một dịch vụ, không cần tìm kiếm thêm chức năng khác, là có thể tổ hợp thao tác chính xác và thao tác toàn văn. Tổ hợp môi trường production phải chọn một backend cụ thể, ngay cả khi hiện tại một bên tiêu thụ chỉ gọi các phương thức chính xác được kế thừa; nếu hành vi backend không thuộc phạm vi test, test có thể dùng một subclass tối thiểu.

Đối tượng đã hợp nhất có chủ đích giữ lại hai chiến lược quan sát nội bộ: thao tác chính xác đọc nguồn thời gian thực có thẩm quyền hoặc nguồn lưu bền vững ở mỗi lần gọi, còn thao tác toàn văn đồng bộ chỉ mục có thể vứt bỏ với nguồn dữ liệu. Context key chung không khiến chỉ mục phái sinh trở thành nguồn có thẩm quyền, cũng không khiến tính khả dụng của đọc chính xác phụ thuộc vào truy vấn FTS.

Việc hủy ở giai đoạn xếp hàng vẫn có hiệu lực kịp thời. Khi hủy xảy ra sau khi việc quan sát nguồn dữ liệu bất đồng bộ đã bắt đầu, bên gọi sẽ chờ thao tác đó hoàn tất dọn dẹp rồi mới nhận được từ chối; do đó bản thân sự từ chối tạo thành ranh giới tĩnh lặng, và đảm bảo các lần tìm kiếm tiếp theo vẫn theo đúng một luồng tuần tự duy nhất. Câu lệnh SQLite đồng bộ không thể bị chiếm quyền giữa chừng, dịch vụ sẽ kiểm tra tín hiệu hủy trước và sau nó.

Unit test cố định đồng thời hợp đồng của triển khai kế thừa và phương thức trừu tượng trên cùng một key, test SQLite bao phủ cả hai loại thao tác trên backend cụ thể, còn đường dẫn Loader thực xác minh một plugin export duy nhất có thể đăng ký dịch vụ đã tổ hợp.
