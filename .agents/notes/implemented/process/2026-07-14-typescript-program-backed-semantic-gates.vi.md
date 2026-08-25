# Agent Note: Gate ngữ nghĩa dựa trên TypeScript Program

Status: implemented

[English](2026-07-14-typescript-program-backed-semantic-gates.md) | Tiếng Việt

## Vấn đề

Đôi khi các gate trong repo cần xác định những sự thật mà cú pháp TypeScript đơn thuần không mang theo: liệu receiver có phải là Cordis `Context` hay không, những tên event cụ thể nào sẽ đi vào một helper forwarding, hoặc declaration merging có làm thay đổi chữ ký (signature) của event hay không.

Các gate hiện tại dựa trên khả năng phân tích cú pháp TypeScript trên từng file đơn lẻ, dùng quy ước đặt tên, bảng viết tay, JSDoc, v.v. để duy trì loại thông tin này.

Repo cần một nguồn ngữ nghĩa chuẩn (semantic source of truth), nhưng không được đưa vào dependency vòng tròn giữa các package runtime, logic dự phòng (fallback heuristic) quá rộng, hay annotation máy đọc được lặp lại thông tin mà TypeScript vốn đã có.

## Quyết định

Các gate trong repo có thể dùng `ts.Program` để tổng hợp thông tin kiểu ở cấp dự án, và dùng `TypeChecker` để trích xuất các sự thật **strongly-typed**, từ đó giảm phụ thuộc vào quy ước đặt tên, bảng viết tay và metadata JSDoc.

Repo áp dụng mô hình này cho hai gate sau.

### Một model dự án mở rộng cấu hình dự án gốc

[`TypeScriptProject`](../../../../scripts/ts-project.ts) phân giải `tsconfig.json` gốc, mở rộng đệ quy từng project reference, và gộp source root của các project được tham chiếu thành một Program ngữ nghĩa duy nhất không xuất file. Khi tạo Program thông thường trực tiếp từ cấu hình dự án gốc, TypeScript có thể chuyển hướng project được tham chiếu tới file declaration đã build; việc mở rộng tường minh cho phép gate tiếp tục duyệt qua file `src` của từng package, và giữ được tính đồng nhất của symbol.

Lớp bọc này gánh chung trách nhiệm chẩn đoán cấu hình, compile option ngữ nghĩa, đường dẫn tương đối trong repo, tìm kiếm source code và TypeChecker dùng chung. Các gate không còn tự quét source code package theo pattern file, cũng không tự build các Program không đầy đủ riêng lẻ.

### A. Quan hệ event được quyết định bởi kiểu receiver và kiểu value

[`gen-doc-graphs`](../../../../scripts/gen-doc-graphs.ts) phân loại dựa trên quan hệ có thể gán (assignability) giữa receiver của lệnh gọi với các kiểu `Context`, `AgentEventDispatch` và Cordis `EventsService` thực tế trong repo. Tên biến và cách viết property không còn quyết định một lệnh gọi có thuộc về event operation hay không.

Các lệnh gọi Context và AgentEventDispatch chỉ đóng góp tập hợp event hữu hạn tạo từ string literal. Với các đường gọi trực tiếp `EventsService.dispatch()`, generator sẽ khôi phục các event slot dọc theo array literal, alias hằng số, nhánh điều kiện, và call site đã resolve của các helper local không được export. Tham số forwarding kiểu generic không tính là nơi sản sinh cụ thể: event vẫn thuộc về call site đưa vào giá trị event đã đóng gói (closed).

Truy vấn ngữ nghĩa chỉ chạy tại nơi có nhánh tiêu thụ (consumer branch): lệnh gọi được lọc trước qua tập hợp đóng của tên phương thức API event, sau đó mới phân loại receiver; index call site của helper function được xây dựng theo yêu cầu, thay vì giải signature trước cho mọi lệnh gọi trên toàn bộ source code package. Index theo yêu cầu chứng minh tính cục bộ cho từng helper function một: helper không được export, nằm trong file ES module thực sự, và mọi tham chiếu trong cùng file đều là call site trực tiếp — theo quy tắc phạm vi module, toàn bộ lệnh gọi của nó chắc chắn nằm trong file này, khi đó chỉ index file đó. Nếu bất kỳ tiền đề nào không chứng minh được (có export modifier, nằm trong file script toàn cục, có tham chiếu bị alias hóa hoặc không thể phân loại), hệ thống sẽ fallback về index toàn bộ source code package gốc ban đầu — đường fallback chính là ngữ nghĩa gốc: việc chứng minh chỉ ảnh hưởng tới chi phí, không ảnh hưởng tới kết quả. Phương án index toàn cục lazy duy nhất bị bác bỏ, vì cây source code hiện tại thực sự đi vào đường tham số helper function, phương án đó vẫn phải trả gần như toàn bộ chi phí quét `getResolvedSignature`.

Mỗi event harness đã khai báo đều phải có nơi sản sinh được quét thấy. Khi không tìm thấy nơi sản sinh, quá trình generate sẽ coi đó là một từ vựng event không có nơi sản sinh hoặc một dạng semantic dispatch chưa được hỗ trợ, và thất bại rõ ràng; các extension point không có nơi lắng nghe vẫn hợp lệ. Instrumentation `internal/dispatch` không được coi là subscriber cho mỗi event mà nó quan sát, nên ma trận quan hệ chỉ ghi lại các nơi lắng nghe trực tiếp của sản phẩm, không còn bổ sung thủ công các quan hệ gián tiếp.

### B. Event routing có scope sinh ra một bảng resolver function strongly-typed

[`gen-scoped-events`](../../../../scripts/gen-scoped-events.ts) quét các lệnh gọi `scopeTarget(base, key)` thực tế, xác định kiểu routing key cho mỗi loại đối tượng cơ sở có scope. Sau đó, nó tìm các thành viên Cordis `Events` có `this: Scoped<Base>`, và tìm kiếm trong mỗi tham số event cùng property công khai lớp đầu tiên của nó kiểu khớp với routing key đó; sau khi loại bỏ `null` và `undefined`, kiểu ứng viên phải hoàn toàn giống với kiểu routing key.

Nếu khớp đúng một ứng viên, generator sẽ sinh resolver function. Nếu có nhiều ứng viên khớp, ý nghĩa không rõ ràng, generator sẽ thất bại. Nếu không có ứng viên nào khớp, event phải được đánh dấu `@dshScopeScan unsupported`; nhãn này chỉ dùng cho trường hợp routing key cố tình nằm ngoài tham số event, ví dụ event session được route theo agent sở hữu, và event vòng đời subagent được route theo agent cha. Nhãn này chỉ biểu thị việc quét không được hỗ trợ, không mã hóa tên event, chỉ số tham số, đường property, hay kiểu thay thế.

[`scoped-events.generated.ts`](../../../../packages/core/scope/src/scoped-events.generated.ts) được commit vào repo là một mapping runtime thuần túy nằm trong package sở hữu scoped dispatch, không import bất kỳ package khai báo event nào. Tính toàn vẹn ngữ nghĩa do chính generator đảm bảo: Program gốc liệt kê toàn bộ khai báo `Events` có scope và quy ước `scopeTarget` thực tế, dùng checker để resolve đường payload duy nhất, và từ chối các entry thiếu, lỗi thời hoặc ý nghĩa không rõ ràng trước khi render ranh giới runtime `unknown[]`.

Companion `dsh-scope/invariant` tiêu thụ mapping này, không còn duy trì bảng event viết tay. Phân tích Program diễn ra bên trong gate của repo, chứ không phụ thuộc vào import kiểu được sinh ra, nên cả `dsh-scope` lẫn `dsh-invariants` đều không cần phụ thuộc vào toàn bộ package khai báo event.

### Khoảng trống ngữ nghĩa phải thất bại rõ ràng

Khi gặp khai báo thiếu, chẩn đoán cấu hình, tên event bị mở rộng hoặc giữ ở dạng generic, kiểu routing key không nhất quán, tham số event khớp không duy nhất, nhãn unsupported không cần thiết, hoặc sản phẩm được sinh ra đã lỗi thời, generator đều từ chối tiếp tục. Khả năng khôi phục thông tin qua call site của helper function local bị hạn chế cố ý trong phạm vi hẹp: nếu luồng dữ liệu đi qua ranh giới được export hoặc không thể resolve, cần thêm một quy tắc ngữ nghĩa tổng quát, chứ không phải thêm một override riêng cho package cụ thể.

## Xác thực

`verify-doc-graphs` thực hiện kiểm tra tính tươi mới (freshness) cho việc quét nơi sản sinh/lắng nghe ngữ nghĩa; `verify-scoped-events` chạy lại phân tích Program và kiểm tra tính tươi mới của mapping được sinh ra. Build TypeScript gốc sẽ compile adapter runtime này; kiểm tra ràng buộc workspace và bao đóng dependency runtime đảm bảo package khai báo event không lọt vào dependency deploy.

## Các phương án thay thế đã cân nhắc

- **Giữ nguyên phân tích cú pháp, whitelist receiver và override viết tay.** Mỗi ngoại lệ đều dễ xử lý riêng lẻ, nhưng khi đổi tên hoặc thêm dạng helper function mới, vẫn phải cập nhật một biểu diễn thứ hai. Kiểm tra tính đầy đủ có thể phát hiện thiếu nơi sản sinh, nhưng không thể chứng minh override vẫn khớp với source code.

## Hệ quả

- Việc sinh quan hệ event dựa trên định danh receiver ngữ nghĩa và giá trị event đã đóng gói, không còn phụ thuộc vào quy ước đặt tên cục bộ;
- Quan hệ thành viên event có scope, trích xuất chủ thể và invariant runtime bao trùm đến từ khai báo event và quy ước dispatch thực tế, không còn đến từ bảng viết tay;
- Khi sửa tên event, vị trí tham số, property của chủ thể hoặc kiểu routing key, việc generate sẽ thất bại ngay tại quy ước sở hữu tương ứng;
- Build một Program đã flatten tốn nhiều thời gian khởi động và bộ nhớ hơn so với phân tích file đơn lẻ, các gate ngữ nghĩa cũng phụ thuộc vào project graph gốc hợp lệ;
- TypeScript được sinh ra vẫn là source code được commit vào repo: sau khi nơi khai báo event hoặc hình thái dispatch thay đổi, phải regenerate lại file này cùng tài liệu bị ảnh hưởng.
