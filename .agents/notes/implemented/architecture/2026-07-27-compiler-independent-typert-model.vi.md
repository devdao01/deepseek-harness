# Agent Note: Mô hình kiểu Typert độc lập với compiler

Status: implemented

[English](2026-07-27-compiler-independent-typert-model.md) | Tiếng Việt

## Problem

Việc ghép trực tiếp Zod và văn bản reflection từ AST của TypeScript sẽ trói buộc phân tích kiểu, nhận diện ngữ nghĩa nghiệp vụ và một mục tiêu sinh mã cụ thể vào cùng một chỗ. Một generator như vậy chỉ trả lời được câu hỏi "đoạn cú pháp này có sinh được không", không cung cấp được biểu diễn chuẩn cho package, face, export công khai, service, event, object và quan hệ kiểu giữa chúng, cũng không thể tái sử dụng cho kiểm tra tĩnh và các mục tiêu sinh mã về sau.

host và client thuộc về hai TypeScript project độc lập; đặt cả hai vào cùng một `ts.Program` sẽ hợp nhất các khai báo `Context` và `Events` xung đột nhau của Cordis. Đồng thời, kiểu của client vẫn cần tham chiếu tường minh tới kiểu của host, nên việc cô lập hoàn toàn hoặc sao chép kiểu ở cả hai phía đều không diễn đạt được quan hệ phụ thuộc thực sự.

## Decision

[`dsh-typert-generator`](../../../../packages/typert/generator/README.md) dựng `ts.Program` riêng cho từng project host và client, chỉ dùng compiler node, symbol và checker như công cụ trích xuất. Sau khi phân tích xong, mọi generator và scanner chỉ tiêu thụ `WorkspaceModel`, `FaceModel` và `TypeGraph` của riêng Typert; trong mô hình không giữ lại đối tượng AST hay checker. Generator không phụ thuộc vào `@deepseek-ai/dsh-typert-registry`.

TypeGraph lưu cấu trúc kiểu trước khi tính toán đúng như lập trình viên viết ra, bao gồm tham số và ứng dụng generic, kế thừa tường minh, conditional, mapped, tham chiếu đệ quy và JSDoc. Kiểu tiếp cận được mà không biểu diễn được không mất mát sẽ khiến phân tích thất bại; khi một emitter không xử lý được node đã được mô hình hóa thì chính emitter đó thất bại, chứ không làm phẳng kiểu hay hạ cấp thành `unknown`.

Mỗi face sở hữu PackageModel và TypeGraph riêng. Các project references trực tiếp của `tsconfig.host.json` và `tsconfig.client.json` quyết định package thuộc face nào, còn `package.json#exports` quyết định ranh giới công khai. Quan hệ liên face chỉ đến từ import hoặc re-export tường minh trong mã nguồn và được giữ lại dưới dạng link độc lập; kiểu npm bên ngoài được ghi nhận là External, không đọc hay sao chép khai báo của chúng.

PackageModel nhận diện Cordis service, event, object tham chiếu `@typert object` và gốc dữ liệu `@typert schema`. service và object chỉ phơi bày public instance member, loại trừ constructor, static, private và protected; các cạnh kế thừa được giữ trong TypeGraph, không sao chép thành member phẳng. Khi thiếu chú thích kiểu cho public property, parameter hoặc return, chế độ `check` báo lỗi, còn chế độ `write` ghi kết quả suy luận của checker rồi dựng lại project và phân tích lại ở chế độ nghiêm ngặt.

[`dsh-typert-registry`](../../../../packages/typert/registry/README.md) cung cấp `ctx.typert`, và chỉ phụ trách đăng ký lúc chạy: một nguyên tử contribution mang theo reflection của package-face cùng Zod schema tùy chọn, và bị thu hồi theo Cordis effect. Registry không phân tích TypeScript, cũng không hợp nhất hai face. JSON Schema là phép chiếu theo yêu cầu của Zod schema đã đăng ký.

Việc phát hành sản phẩm của package vẫn theo cơ chế opt-in tường minh qua package exports. `WorkspaceTypertGenerator` chỉ kiểm tra giao ước sản phẩm ở thư mục gốc của face được yêu cầu khi nó được gọi: host face phải phơi bày `package/lib/typert.host.{js,d.ts}` qua subpath hướng người dùng `package/typert`, client face phải phơi bày `package/lib/typert.client.{js,d.ts}` qua `package/client/typert`; nó không sửa các exports đó. [Thiết kế Typert Remote](2026-08-02-typert-remote-method-calls.md) về sau bổ sung một pass giao ước Host toàn repo cho build, typecheck, lint và kiểm tra kiểu tài liệu ở thư mục gốc. Với các package Host đã opt-in, pass này sẽ sinh sản phẩm reflection cục bộ và giao ước `/remote` Host-for-Client nghiêm ngặt trước khi phía tiêu thụ phân giải cả hai. Khai báo cục bộ được sinh ra giữ kiểu `TYPERT` là `unknown`, nên các package nghiệp vụ không phụ thuộc vào registry.

`CordisCatalogProjector` ở giai đoạn build tiêu thụ `FaceModel` và `TypeGraph` sau phân tích đúng một lần, sinh ra `docs/cordis-catalog/events.md`, `docs/cordis-catalog/services.md`, cùng các catalog tĩnh `SERVICE_API`, `EVENT_API` và `TYPE_API` được commit cho `tool-cordis`. `tool-cordis` đọc catalog tĩnh đó và lúc chạy không phụ thuộc vào `ctx.typert`. [`dsh-typert-loader`](../../../../packages/typert/loader/README.md) và registry vẫn là đường chạy runtime độc lập: loader lắng nghe sự kiện vòng đời của mục cấu hình Cordis Loader, import sản phẩm host `./typert` được phát hành tường minh, rồi đăng ký qua `ctx.typert`; cả hai đều không phải nguồn dữ liệu của catalog `cordis_inspect` hiện tại.

## Verification contract

Một project hai face cỡ nhỏ được commit trong repo sẽ snapshot toàn bộ mô hình kiểu và chỉ mục khai báo mã nguồn của nó. Phân tích theo lô toàn repo và phân tích tập trung trực tiếp phải sinh ra `FaceModel` và `TypeGraph` tương đương về mô hình cho cùng một face. So sánh tập hợp đầy đủ ở mức kiểu và tập hợp lúc chạy bảo đảm mọi discriminant của node, target, declaration và member đều đến từ cú pháp TypeScript thật; ma trận ngữ nghĩa trường bao phủ mọi hạng mục keyword, type operator, literal value, cùng từng trạng thái của generic, parameter, tuple, mapped modifier, import attributes, abstract, predicate và enum initializer.

Kiểu nguồn của mỗi property trong `SyntaxZoo`, sau khi chuẩn hóa qua TypeScript printer, phải bằng từng mục với kết quả render của TypeGraph, sau đó mọi declaration đã render lại được đưa cho TypeScript biên dịch. Lớp kiểm tra này xét xem thông tin bên trong node có được giữ nguyên vẹn không, bao gồm template literal không nội suy, type query có type argument và `infer` có ràng buộc, chứ không lấy độ phủ discriminant hay độ phủ mã thay cho tương đương cấu trúc.

Các ca biên cố định import package tường minh cùng face và liên face, re-export có tên liên face, export alias chính xác, link `import()` có định danh đầy đủ và quy thuộc External của `@types` toàn cục, đồng thời từ chối chẩn đoán TypeScript của chính package, đường dẫn tương đối vượt biên, tham chiếu nằm ngoài `package.json#exports`, cũng như re-export namespace liên face chưa có target mô hình. Việc declaration merging của interface giữ lại tường minh từng phần được viết ra; các dạng merge khác không biểu diễn được không mất mát sẽ thất bại.

Zod emitter thực hiện parse thành công và thất bại theo từng loại cho các node được hỗ trợ và từng loại literal, và với node không được hỗ trợ thì khẳng định `TypertEmitError` rõ ràng theo từng loại. Emitter fixture snapshot JavaScript Zod được sinh ra và văn bản `.d.ts`, chạy JavaScript đó, và kiểm tra kiểu cho các declaration. Test của `dsh-typert-registry` cố định việc đăng ký nguyên tử, truy vấn, JSON Schema và thu hồi effect; test của `dsh-typert-loader` còn chứng minh hành vi mount trễ, unmount và giải phóng dynamic import chưa hoàn tất. Lát cắt dọc `dsh-tools` thật sinh contribution từ mô hình, sau khi nạp qua registry lúc chạy sẽ đối chiếu bản ghi service, event và kiểu liên quan của nó với `SERVICE_API`, `EVENT_API` và `TYPE_API` tĩnh đã được commit. Test projector toàn repo sinh lại hai tài liệu Cordis catalog và catalog API của `tool-cordis`, và yêu cầu cả ba văn bản khớp từng byte với sản phẩm đã commit.

## Alternatives considered

**Lưu trực tiếp AST của TypeScript.** AST giữ được cách viết trong mã nguồn, nhưng khiến mọi phía tiêu thụ phụ thuộc vào vòng đời compiler, node identity và ngữ cảnh checker, không tạo được ranh giới kiến trúc ổn định, nên chỉ dùng trong giai đoạn trích xuất.

**Sinh kiểu cuối dựa trên checker.** `ts.Type` sau khi làm phẳng thì dễ duyệt trực tiếp, nhưng mất đi cách diễn đạt của lập trình viên về generic, conditional, mapped và alias application, không đáp ứng được nhu cầu reflection và sinh mã về sau.

**Gộp project host/client hoặc sao chép kiểu host.** Gộp sẽ làm nhiễm declaration merging của Cordis; sao chép sẽ sinh ra nguồn sự thật kiểu thứ hai. Face độc lập cộng với cross-face link tường minh giữ được cả sự cô lập project lẫn quan hệ tham chiếu thật.

**Để `dsh-typert-registry` gánh việc phân giải kiểu và tổng hợp liên package.** Cách này sẽ ghép lại TypeScript compiler, vòng đời Cordis và chính sách schema cụ thể. Registry giữ vai trò vật chứa vòng đời cho artifact được sinh ra, còn phân tích phức tạp nằm lại ở mô hình giai đoạn build.

## Consequences

Mục tiêu sinh mã mới hoặc kiểm tra tĩnh mới có thể tái sử dụng cùng một TypeGraph, và hạng mục nghiệp vụ cũng có thể mở rộng trên PackageModel mà không phải phân tích AST lần nữa. Cái giá của việc giữ kiểu trước khi tính toán và các face độc lập là mô hình phức tạp hơn schema đã làm phẳng, và emitter phải khai báo tường minh phạm vi hỗ trợ rồi thất bại khi thiếu năng lực.

Việc opt-in tường minh ở cấp package khiến phát hành sản phẩm và exports do từng package tự quản lý. Điều phối ở cấp repo vẫn có thể chạy pass giao ước Host toàn repo cho mỗi package đã opt-in; pass đó vẫn do Agent Note về Remote Gateway sau này chịu trách nhiệm giải thích. Catalog Cordis tĩnh có thể tái lập từ mô hình chuẩn, đồng thời không ghép `tool-cordis` vào trạng thái registry lúc chạy. `ctx.typert` chỉ phản ánh sản phẩm đã được mount trong runtime hiện tại; với các instance Zod mà phía tiêu thụ vẫn giữ sau khi import trực tiếp, quy trình unmount không kiểm soát được.
