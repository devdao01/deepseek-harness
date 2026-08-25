# @deepseek-ai/dsh-typert-generator

[English](README.md) | Tiếng Việt

Bộ phân tích dự án TypeScript và bộ sinh Typert dựa trên model. Trước khi sinh ra bất kỳ sản phẩm nào, nó sẽ chuyển đổi cây kiểu (type) do lập trình viên viết trong mã nguồn thành dữ liệu `FaceModel` và `TypeGraph` độc lập với compiler. Phân tích tĩnh có thể tiêu thụ model này mà không cần Cordis; các thành phần sinh sản phẩm đều không nhận vào cây cú pháp trừu tượng (AST) hay đối tượng type checker của TypeScript.

Bộ phân tích có thể sử dụng riêng biệt `ts.Program` được khởi tạo bởi `tsconfig.host.json` hoặc `tsconfig.client.json`. Tham chiếu dự án trực tiếp xác định thành viên nào thuộc về face compiler, còn subpath của gói xác định đóng góp cho face runtime Typert: một gói đơn dự án thông thường khai báo `dsh.client` có thể đồng thời đóng góp cho cả model runtime Host và Client; chỉ những dự án tách riêng, được tham chiếu tường minh qua `tsconfig.host.json` hoặc `tsconfig.client.json`, mới bị giới hạn vào face tương ứng. `package.json#exports` xác định mọi ranh giới công khai giữa các gói, các cạnh xuyên face chỉ có thể đến từ import hoặc re-export trong mã nguồn. Các kiểu thuộc sở hữu của dependency NPM (bao gồm khai báo global trong gói `@types`) vẫn được biểu diễn bằng tham chiếu `external`, không bị mở rộng.

## Model phân tích

Mỗi face bao gồm export của gói, service và event của Cordis, các đối tượng và schema được đánh dấu tường minh, cùng một đồ thị kiểu (type graph) bao phủ các khai báo có thể truy cập tới. Đồ thị kiểu giữ lại danh tính khai báo, tham số generic và cách áp dụng chúng, kế thừa tường minh, kiểu điều kiện và kiểu ánh xạ, thuộc tính import, modifier abstract, và JSDoc trong mã nguồn. Bề mặt công khai của service và `@typert object` chỉ hiển thị các thành viên instance công khai; constructor, thành viên static và thành viên không công khai đều bị loại trừ.

`WorkspaceAnalyzer` mặc định dùng chế độ `check`, và sẽ thất bại khi gặp chẩn đoán cú pháp hoặc ngữ nghĩa TypeScript, khi khai báo công khai có thể truy cập tới thiếu chú thích kiểu, khi có tham chiếu private xuyên gói, và khi việc hợp nhất khai báo có thể truy cập tới mà model không thể bảo toàn không mất mát. Chế độ `write` sẽ chèn các chú thích kiểu do type checker suy ra, xây dựng lại chương trình đó, và trả về model ở chế độ check không có chẩn đoán nào.

## Sinh sản phẩm và phát hành có chọn lọc

`FaceModelEmitter` chỉ tiêu thụ model. Nó sinh ra JavaScript có thể thực thi, chứa các schema Zod được hỗ trợ và một contribution `TYPERT`; đồng thời sinh ra file khai báo, trong đó đánh dấu các schema này là `z.ZodType<SourceType>` thông qua export công khai của gói. Khi gặp phép chiếu Zod không được hỗ trợ, quá trình sinh sẽ thất bại, không làm phẳng hay làm yếu kiểu gốc.

`WorkspaceTypertGenerator` duyệt qua các export công khai của gói có thể truy cập tới từ các khai báo mở rộng `Context` hoặc `Events` của Cordis cũng như khai báo `@typert` tường minh, để phát hiện các bên đóng góp. Khi phát hành sản phẩm, nó yêu cầu sản phẩm phía host nằm ở `lib/typert.host.{js,d.ts}` và được lộ ra qua `package/typert`, sản phẩm phía client nằm ở `lib/typert.client.{js,d.ts}` và được lộ ra qua `package/client/typert`. Khai báo được sinh ra biểu diễn `TYPERT` là `unknown`, do đó các gói nghiệp vụ tham gia đóng góp không cần phụ thuộc vào registry runtime.

Mỗi gói có thể tự chọn có phát hành hay không, gói nghiệp vụ không cung cấp entry công khai tương ứng thì không cần sinh sản phẩm Typert. Host tsdown của repo này chạy việc sinh Typert cho toàn workspace, chỉ dùng `tsconfig.host.json` làm hạt giống program duy nhất; nó vừa sinh sản phẩm reflection Host, vừa chiếu ước định (convention) Host Remote thành `typert.remote-client.*` để Client sử dụng. Client tsdown chạy sau đó không khởi động Typert, cũng không phân tích `tsconfig.client.json`. Bên tiêu thụ tĩnh vẫn có thể gọi trực tiếp `WorkspaceAnalyzer`, chọn tường minh face và tập con gói, xử lý theo lô các gói mà không cần phát hành hay tải sản phẩm runtime.

## Phép chiếu Cordis của repo này

Export ở gốc gói chứa logic trích xuất dựa trên model, kiểm tra tính toàn vẹn, và bộ render văn bản xác định được dùng cho danh mục Cordis của repo này. Chúng nhận vào `CordisCatalogPolicy`; các liên kết kiểu do repo sở hữu, phân loại kiểu cơ sở／kiểu miễn trừ, và các mục Cordis được kế thừa vẫn nằm trong `scripts/gen-cordis-catalog.ts`, và được bên gọi truyền vào tường minh. Do đó, gói generator chỉ chứa cơ chế chiếu, không sao chép ngầm hệ thống phân loại tài liệu của repo này.

## Trải nghiệm model

Không có. Gói này chỉ chạy tại thời điểm build hoặc test, không yêu cầu bổ sung bất kỳ nội dung nào hướng tới model.

#### Ảnh hưởng KV Cache

Không có.

## Giới hạn đã biết và việc còn hoãn lại

- Hệ thống bỏ qua các mẫu khớp (pattern) trong export của gói; các gói tham gia đóng góp cần có mục tiêu export cụ thể.
- Re-export có tên và re-export dấu sao xuyên face sẽ sinh ra liên kết; trước khi `TypeTargetModel` có thể biểu diễn namespace của module mà không cần làm phẳng, re-export namespace sẽ thất bại.
- Thành phần sinh sản phẩm Zod chỉ hỗ trợ phần được giới hạn có chủ đích trong đồ thị kiểu TypeScript. Khai báo schema generic, và các cấu trúc tính toán lấy kiểu điều kiện hoặc kiểu ánh xạ làm gốc schema, đều sẽ thất bại cho đến khi có chiến lược factory schema rõ ràng.
- Liên kết xuyên face được biểu diễn trong model để phục vụ phân tích, nhưng hiện tại không có schema nào được sinh ra cần import Zod runtime xuyên face.
- Quá trình phát hiện duyệt qua các file nguồn có thể truy cập tới từ các export công khai cụ thể; các khai báo không được export và cũng không được đồ thị này import sẽ bị loại khỏi model của gói theo thiết kế.
