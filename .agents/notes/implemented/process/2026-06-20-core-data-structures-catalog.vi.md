# Agent Note: Danh mục subsystem và gate chống trôi `ts type-equiv`

Status: implemented

[English](2026-06-20-core-data-structures-catalog.md) | Tiếng Việt

## Vấn đề

Người đọc muốn hiểu harness có thể tìm thấy *hành vi* của nó trong [architecture.md](../../../../docs/architecture.md) (service graph, vòng đời session/round/step, phân loại sự kiện), nhưng lại không tìm được nơi nào mô tả thống nhất *từ vựng* của nó — tức là các cấu trúc dữ liệu mà những hành vi đó truyền tải. Định nghĩa kiểu (type) chỉ tồn tại trong mã nguồn, rải rác khắp `packages/*/src/types.ts`, vì vậy muốn hiểu "`Message`, `SessionEvent`, `StreamChunk` là gì" thì buộc phải đọc trực tiếp phần khai báo. Một danh mục dạng văn bản sẽ hữu ích, nhưng một danh mục diễn giải lại hoặc sao chép-dán định nghĩa kiểu sẽ lập tức lỗi thời ngay khi field thay đổi, và tài liệu kiểu không đồng bộ còn tệ hơn là không có tài liệu, vì người đọc sẽ tin tưởng nó.

Do đó, công việc này có hai vấn đề đan xen với nhau: **danh mục như vậy nên bao gồm những gì** (vấn đề về phạm vi — harness có hàng chục loại kiểu vượt ranh giới package, liệt kê tất cả chúng ra không giúp ích cho ai), và **làm sao để tránh việc các định nghĩa kiểu được dán vào bị trôi (drift)** (vấn đề về tính bền vững). Agent Note này ghi lại cả hai quyết định đó. [Quyết định tự động sinh danh mục sự kiện và service của Cordis đã lưu trữ](../../archived/process/2026-06-20-generated-cordis-catalog.md) — vốn đi kèm về mặt lịch sử với tài liệu này — bổ sung theo chiều *đấu nối* (wiring): tài liệu này lập danh mục cho các cấu trúc dữ liệu, còn tài liệu kia lập danh mục cho các sự kiện và service truyền tải các cấu trúc đó.

## Quyết định

Thư mục `docs/subsystems/` mới lập danh mục cho từ vựng này, đi kèm một doc-sync (gate đồng bộ tài liệu) mới là `verify-type-equiv`, giúp mỗi khai báo kiểu được dán vào cùng JSDoc của nó luôn đồng bộ với mã nguồn.

### Thế nào là "core" — ranh giới giữa spine và subsystem

> **Đã bị thay thế với vai trò là quy tắc xác định phạm vi trang**, xem [trang subsystem được neo theo package](2026-08-03-package-anchored-subsystem-pages.md): mỗi trang giờ đây được neo vào nhóm package khai báo từ vựng của nó. Cơ chế `ts type-equiv` bên dưới vẫn còn hiệu lực.

Bài kiểm tra quyết định cho việc xác định phạm vi là `ShellExecRequest`/`ShellExecSpec`/`ShellRunResult`: bash là một *seam* năng lực, không thuộc về spine của agent loop (vòng lặp tác tử); nếu những kiểu này được tính là "core", thì "core" đồng nghĩa với *toàn bộ từ vựng vượt ranh giới package*, và danh mục sẽ trở thành một danh sách dàn trải; nếu không, "core" đồng nghĩa với *spine trung tâm*, và từ vựng của bash sẽ thuộc về trang subsystem riêng của nó. Phương án sau chiến thắng, từ đó xác định cấu trúc tổng thể: một **cây thư mục phân lớp**, chứ không phải một tài liệu dàn trải duy nhất.

Quy tắc để xác định các trường hợp còn lại là: ***kiểu dữ liệu mà bạn viết ra, sở hữu hoặc nhận vào là core; cơ chế cung cấp việc suy luận kiểu, render hoặc lưu trữ (persist) cho nó là chi tiết thuộc trang subsystem.*** Kiểm chứng từng trường hợp như sau:

- Một cấu trúc dữ liệu là **core** nếu nó chạy xuyên suốt spine của agent loop — bất kể plugin nào được nạp, vòng lặp giữ, dẫn xuất, stream ra hoặc ghi log nó ở mỗi round (`Message`, `StreamChunk`, `SessionEvent`, handle `Agent`) — **hoặc** nó là kiểu tiêu biểu duy nhất mà tác giả plugin phải viết khi đối diện với một pipeline nào đó (`ToolDefinition`).
- `ToolDefinition` là core (nó là thứ mà mọi tác giả tool đều phải viết), **ngay cả khi vòng lặp không bao giờ giữ nó** — đối với riêng kiểu tiêu biểu duy nhất này, tầm quan trọng ở khía cạnh viết mã lấn át quy tắc nghiêm ngặt "chạy xuyên suốt spine". Nhưng cơ chế suy luận kiểu của nó — `ValueSchemaSpec`, `ParameterSchemaSpec`, `InferValue` và `InferArgs` — lại là chi tiết thuộc trang subsystem. Đây chính là cách diễn đạt chính xác cho ranh giới giữa spine và subsystem.
- `ToolSchema` là core (nó là một field của `GenerateOptions` — request gửi tới mô hình, chạy xuyên suốt mỗi step), ngay cả khi về mặt khái niệm nó thuộc về pipeline của tool — khi *chạy xuyên suốt spine* xung đột với *thuộc về khái niệm nào*, cái trước sẽ thắng.
- Từ vựng hiển thị của tool (`ToolCallView`/`ToolResultView` v.v.), seam lưu trữ `SessionPersistence`, và từ vựng của bash đều thuộc về các trang subsystem.

`core.md` là một **tài liệu spine tự chứa (self-contained)**: nó đưa ra định nghĩa kiểu chính xác cho từng cấu trúc thuộc spine, kèm phần văn bản tối thiểu, và liên kết tới các trang subsystem cùng cấp để lấy chi tiết do từng package sở hữu; [README](../../../../docs/subsystems/README.md) của thư mục lập chỉ mục cho toàn bộ các trang. Các trang subsystem ban đầu bao gồm `llm-streaming.md`, `session.md`, `persistence.md` (được tách ra từ trang session theo ranh giới giữa mô hình bộ nhớ (memory model) và seam lưu trữ), `tools.md` và `shell.md`.

### Cơ chế `ts type-equiv` — vừa đúng nguyên văn, vừa chống trôi

Yêu cầu về tính bền vững rất cụ thể: tài liệu phải trình bày **đúng nguyên văn** nội dung khai báo kiểu hiện tại cùng JSDoc gốc của nó (để người đọc thấy được hình dạng thật và các quy ước trong mã nguồn, chứ không phải bản diễn giải lại), **và** phải đảm bảo bằng cơ chế máy móc rằng nó khớp với mã nguồn. Repo đã có sẵn cơ chế biên dịch các khối rào (fence) ` ```ts ` (`doc-typecheck`), nhưng những khối thực sự được đưa vào type-check lại cần import gây nhiễu, và chỉ có thể chứng minh được *tính có thể gán được* (assignability) — việc đổi tên field hoặc thay đổi JSDoc vẫn có thể vượt qua. Do đó:

- Toàn bộ khai báo kiểu cùng JSDoc của nó được dán nguyên văn vào một khối rào chuyên dụng ` ```ts type-equiv `. Khối rào gọn hơn ` ```ts public-api ` mang phần chiếu (projection) khai báo tương đương ambient của class ở dạng mã nguồn, dùng cho các class mà phần thân triển khai (implementation body) không nên xuất hiện trong danh mục. `doc-typecheck` nhận diện và bỏ qua cả hai loại khối rào này (khai báo trần không thể tự biên dịch độc lập), và **loại chúng ra khỏi tỷ lệ opt-out** — chúng là một hạng mục được kiểm tra riêng, chứ không phải là bản nháp không được kiểm tra.
- `scripts/verify-type-equiv.ts` mới được thêm vào sẽ trích xuất từng khối bằng TypeScript parser, và khẳng định rằng cấu trúc khai báo cùng mọi comment JSDoc của nó khớp với symbol đã khai báo, chỉ bỏ qua khoảng trắng định dạng và các comment không phải JSDoc. Khối thông thường giữ nguyên toàn bộ khai báo. Phần chiếu `public-api` giữ lại các field public, constructor, accessor và method của class cùng JSDoc gốc của chúng, đồng thời loại bỏ phần thân triển khai cũng như các thành viên private hoặc protected. Sở dĩ chọn cách này thay vì assertion `_Check` kiểu biên dịch, là vì thứ mà danh mục cần giữ gìn là tên gọi trong mã nguồn và tính nhất quán với tài liệu, chứ không phải tính có thể gán được.
- Tài liệu, symbol và file nguồn của mỗi khối kiểu được ghi lại tập trung trong `scripts/type-equiv.manifest.json` (các mục `{ doc, symbol, source }`), **chứ không phải** trong comment chỉ dẫn nằm rải rác trong văn bản. Script này áp đặt một **tương ứng 1:1** giữa mỗi khối `type-equiv` chính và một mục manifest (danh sách metadata), vì vậy một khối sẽ không bao giờ bị bỏ sót âm thầm, và một mục cũng không bao giờ bị mục nát dần. Chỉ khi toàn bộ chuỗi khối rào được theo dõi của khối `.zh.md` đối ứng khớp với file anh em không hậu tố cả về thứ tự, loại lẫn nội dung chính xác từng byte, thì nó mới được tái sử dụng mục của file kia; nếu không, gate sẽ kiểm tra khối đó một cách độc lập, và thất bại khi không tìm thấy mục manifest tương ứng.
- Được tích hợp vào `doc-sync`, do đó khi tài liệu liên quan thay đổi, nó sẽ chạy cục bộ, và CI cũng sẽ chạy nó cùng các kiểm tra tài liệu khác.

### Việc bảo trì là trách nhiệm của tác giả, gate chỉ là lưới an toàn cuối cùng

`verify-type-equiv` có thể bắt được *sự trôi khi dán lại* của các kiểu đã được ghi lại, nhưng không thể cho bạn biết một kiểu core hoàn toàn mới chưa được ghi lại. Vì vậy AGENTS.md và skill `dsh-code-review` (kỹ năng) đã được cập nhật, yêu cầu đồng bộ cập nhật danh mục khi một thay đổi thêm mới hoặc tái định hình một kiểu đã được ghi lại — gate xử lý phần trôi, còn con người xử lý phần kiểu mới.

## Các phương án thay thế từng cân nhắc

- **Liệt kê dàn trải toàn bộ từ vựng vượt ranh giới package**: bài kiểm tra `ShellExecRequest` đã phủ quyết phương án này. Nếu từ vựng của seam được tính là "core", danh mục sẽ không giúp ích cho ai; cấu trúc phân lớp spine-và-subsystem chiến thắng.
- **Dùng assertion `_Check` kiểu biên dịch để kiểm tra tính có thể gán được** thay cho việc khớp mã nguồn: bị bác bỏ. Tính có thể gán được không giữ lại tên gọi hay JSDoc; việc đổi tên field cùng kiểu hoặc thay đổi comment quy ước vẫn sẽ vượt qua.
- **Ghi file nguồn của mỗi khối kiểu vào comment chỉ dẫn**: bị bác bỏ, thay vào đó dùng manifest tập trung; sự tương ứng 1:1 bắt buộc của nó đảm bảo một khối không bao giờ bị bỏ sót âm thầm, và một mục cũng không bao giờ mục nát dần.

## Bài học từ việc xác minh

`verify-type-equiv` phải quét toàn bộ phạm vi Markdown, chứ không chỉ những tài liệu được manifest điểm danh. Nếu không, các khối `type-equiv` chưa được liệt kê vào danh sách sẽ trốn thoát khỏi việc kiểm tra một-đối-một mà nó tuyên bố thực hiện. Vì vậy, gate sẽ báo cáo những khối như vậy là các khối chưa được liệt kê vào danh sách. Agent Note này ghi lại quy tắc quét mặc định từ chối này, cùng với quyết định về ranh giới spine-và-subsystem và quyết định khớp nguyên văn; danh mục Cordis được sinh tự động có bản ghi thiết kế đối xứng trong [Agent Note đã lưu trữ của nó](../../archived/process/2026-06-20-generated-cordis-catalog.md).

## Hệ quả

- Từ vựng này giờ đây có **một chủ sở hữu duy nhất, không thể trôi âm thầm**: khi một field hoặc thành viên public của class thay đổi trong mã nguồn, `doc-sync` và `verify-type-equiv` trong CI sẽ liên tục thất bại cho đến khi nội dung dán được làm mới. Các method của service Cordis vẫn do danh mục service được sinh tự động phụ trách, và không bị lặp lại ở đây.
- Ranh giới spine-và-subsystem là một công cụ xác định phạm vi có thể tái sử dụng, chứ không phải chỉ dùng một lần: cùng một quy tắc "thứ bạn viết/sở hữu/nhận vào là core; cơ chế cung cấp việc suy luận kiểu/render/lưu trữ cho nó là chi tiết", sau này cũng được dùng để xác định các lớp harness và lớp kế thừa (inheritance) cho danh mục sự kiện/service.
- Khối rào `ts type-equiv` là loại khối tài liệu thứ ba, sau ` ```ts ` (biên dịch) và ` ```ts ignore-check ` (bản nháp). Một gate anh em kế tiếp còn thêm loại thứ tư là ` ```ts cordis-catalog ` (chữ ký được sinh tự động), tái sử dụng cùng cơ chế bỏ qua và loại trừ.
- Việc thêm mới hoặc tái định hình một kiểu core giờ đây đi kèm một nghĩa vụ về tài liệu mà tác giả phải thực hiện (gate không thể phát hiện một kiểu *mới* bị thiếu), với `dsh-code-review` làm lưới an toàn cuối cùng.
- Kể từ 2026-07-27, lớp trang subsystem đã bao phủ mọi service mang service: chín trang tinh gọn (preset quyền, chế độ plan, bất biến runtime, HTTP carrier, storage — vừa sở hữu `ctx.storage` vừa sở hữu `ctx.storageDomain` — mở rộng terminal, workspace, module client, telemetry) bao phủ mười service `ctx` vốn trước đây không có trang riêng, nhờ đó mỗi service và event scope của harness đều có đúng một trang subsystems mà nó thuộc về — đây chính là điều kiện tiên quyết để đưa phần tham chiếu service/event được sinh theo từng subsystem vào các trang này (thay vì một danh mục dàn trải).
