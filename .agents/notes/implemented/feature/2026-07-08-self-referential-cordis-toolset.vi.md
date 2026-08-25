# Agent Note: Bộ công cụ cordis tự tham chiếu

Status: implemented

[English](2026-07-08-self-referential-cordis-toolset.md) | 中文

## Vấn đề

Mọi thứ trong harness này đều là plugin cordis, nhưng agent (tác tử) chạy bên trong runtime của plugin đó vừa không nhìn thấy vừa không chạm được vào nó: nó không thể liệt kê các service và event xung quanh, không thể tự thêm tool mới giữa chừng phiên làm việc, cũng không thể tổ hợp các năng lực do chính nó nghĩ ra. Trao cho model khả năng này đáng để khám phá — một agent tự tham chiếu có thể xem xét và sửa đổi runtime của chính nó — nhưng điều đó đồng thời đặt ra ba vấn đề đúng đắn, và trọng tâm của thiết kế này chính là trả lời chúng, chứ không đơn thuần là cơ chế "để model thực thi code".

Thứ nhất, các đăng ký (registration) do model viết ra phải được kiểm tra hợp lệ ngay tại thời điểm đăng ký: schema tool sai định dạng phải fail ngay khi đăng ký, chứ không phải đợi đến khi một request sau đó cố lắp nó vào prompt mới báo lỗi. Thứ hai, code do model viết cần gọi các API service mà nó chưa từng thấy mã nguồn — dựa vào việc đoán chữ ký phương thức, tệ hơn nữa là đoán cấu trúc giá trị trả về, sẽ tiêu tốn rất nhiều bước dò dẫm mù quáng. Thứ ba, mọi thứ model gắn vào (mount) đều phải hoàn toàn có thể giải phóng: model có thể giải phóng theo yêu cầu, vòng đời plugin thông thường cũng giải phóng nó khi plugin chủ (host plugin) được reload, nếu không các phiên dài sẽ tích tụ listener và tool còn sót lại.

## Quyết định

Bộ công cụ này được phát hành dưới tên [`@deepseek-ai/dsh-tool-cordis`](../../../../packages/extensions/tool-cordis/README.md), và được minh họa qua `examples/web-cordis`. Nó cung cấp cho model ba tool để thao tác trên runtime Cordis đang hoạt động trong tiến trình DSH hiện tại: kiểm tra runtime đó, gắn (mount) một plugin tạm thời chỉ tồn tại trong bộ nhớ, rồi gỡ (unmount) plugin đó cho đến khi dừng hẳn hoàn toàn.

vm cô lập ô nhiễm toàn cục ngoài ý muốn, còn context facade ẩn đi các chi tiết nội bộ của framework. Nhưng cả hai đều không giới hạn quyền của các service đã được expose: plugin tạm thời có thể gọi `ctx.shell` để chạy lệnh với quyền của executor chủ, cũng có thể truy cập hệ thống file và network service thật. Nó chạy trong runtime DSH dùng chung, và có thể ảnh hưởng đến các phiên khác trong cùng tiến trình. Đây là một công cụ phát triển cần bật rõ ràng, mức độ tin cậy tương đương bash, không phải một ranh giới bảo mật, cũng không phải cấu hình mặc định của sản phẩm.

### Ba công cụ

| Công cụ | Quy ước |
|---|---|
| `cordis_inspect` | Báo cáo chỉ đọc về runtime đang hoạt động trong tiến trình hiện tại, mỗi giá trị `what` tương ứng một mục Markdown (bỏ qua `what` sẽ xuất tất cả các mục). `plugins` liệt kê toàn bộ fiber còn sống, `temporary` chỉ liệt kê các plugin tạm thời do `cordis_mount` tạo ra. Kết hợp `name` chính xác với `what: "api"` hoặc `what: "events"` sẽ thu hẹp về một mục tiêu duy nhất kèm tài liệu mã nguồn. |
| `cordis_mount` | Ngay lập tức đánh giá `code` như phần thân một hàm JavaScript bất đồng bộ trong sandbox `node:vm`, và không lưu vào bất kỳ đâu. Plugin trả về được gắn dưới nhóm nội bộ `cordis-dynamic`, và được theo dõi bằng id mới trong tiến trình (`dyn-1`, `dyn-2`, ...). |
| `cordis_unmount` | Gỡ một plugin tạm thời `cordis_mount` theo id, và chỉ trả về sau khi toàn bộ tool, listener, service, timer và các effect khác của riêng nó đã dừng hẳn hoàn toàn. Nó không thể xóa các plugin thuộc Loader, đã cấu hình hoặc đã cài đặt. |

Các mục của `cordis_inspect` gồm `services` (mỗi service ctx đã cung cấp và fiber sở hữu nó), `plugins` (toàn bộ fiber plugin còn sống), `tools` (tool mà model có thể gọi), `temporary` (tập con `cordis_mount`, gồm id, trạng thái running/pending, và các service cung cấp/đang chờ cùng vòng đời), `api` (chữ ký service đang hoạt động và các kiểu tham chiếu của chúng), và `events` (event của harness cùng mẫu phân phối và chữ ký). Plugin tạm thời có thể vẫn hoạt động qua nhiều lượt tiếp theo, và biến mất sau `cordis_unmount`, khi bộ công cụ được gỡ, hoặc khi DSH khởi động lại; hệ thống không bao giờ tự động khôi phục chúng. Báo cáo `api` và `events` ở dạng rộng bỏ qua JSDoc đầy đủ; `name` chính xác trả về một service hoặc event kèm JSDoc gốc. Các mục khác không thể kết hợp với name, mục tiêu không xác định sẽ fail, và mục tiêu API phải đang ở trạng thái hoạt động. Mô tả tool hướng tới model chứa các quy tắc vận hành cần thiết khi gọi; [danh mục tool được sinh tự động](../../../../docs/tool-catalog.md) là bản trình bày đầy đủ của các quy tắc đó.

### Ngữ nghĩa sandbox

Code gắn vào chạy dưới dạng thân hàm bất đồng bộ trong một realm vm mới. API đã được tài liệu hóa của nó dẫn hướng truy cập file, network, process và timer về các service Cordis, giữ cho việc mount luôn có thể xem xét và giải phóng được. Các phương tiện hỗ trợ của host realm vẫn khiến việc thoát ra Node trở nên khả thi, điều này nhất quán với lập trường về tin cậy đã nêu. `vmTimeoutMs` chỉ giới hạn phần thực thi đồng bộ.

Các biến toàn cục của sandbox được thiết kế tối giản có chủ đích: một `console` ghi thẳng có gắn nhãn (xuất `[cordis:<id>] …` lên stdout/stderr của host, để output của listener kích hoạt rất lâu sau lời gọi mount vẫn hiển thị cho người dùng), cặp đăng ký `harness.defineTool`/`harness.registerTool`, các nguyên hàm mã hóa mà vm context mới thiếu (`btoa`/`atob` dưới dạng closure host dựa trên `Buffer` — một ngoại lệ được cho phép rõ ràng, còn bản thân `Buffer` không bao giờ được expose — cộng với `TextEncoder`/`TextDecoder`), và các bẫy có thể gọi được (callable trap) đặt trên các API Node chưa được expose (`require`, `setTimeout`/`setInterval`/`setImmediate`/`clearTimeout`/`clearInterval`, `fetch`), các bẫy này ném ra thông báo chuyển hướng chỉ rõ phương án thay thế của cordis. Chỉ các biến toàn cục dạng hàm mới bị đặt bẫy; `process` và `Buffer` vẫn giữ `undefined`, để việc dò đặc trưng bằng `typeof` vẫn vô hại, mà không kích hoạt accessor sẽ ném ngoại lệ.

Code gắn vào vượt qua ranh giới vm thông qua ba cơ chế kiểm soát. `instanceof` hai-realm nhận diện được cả đối tượng host lẫn vm. `harness.defineTool` tái tạo output schema/projector trong host realm, chụp nhanh (snapshot) giá trị trả về của thân tool thành JSON thuộc sở hữu của host, và để registry cưỡng chế thực thi [quy ước output tool chuẩn](../architecture/2026-07-20-canonical-tool-output-contract.md) trước khi quan sát. Plugin đã mount nhận một context facade theo danh sách trắng, không phải `Context` gốc hay truyền thẳng; cơ chế nội bộ của framework và các giá trị trả về lấy context làm giá trị đều bị từ chối. Đọc service cần khai báo `inject`, giữ nguyên ngữ nghĩa kích hoạt và gỡ bỏ của Cordis. `ctx.tools.get` chỉ expose view schema, do đó code gắn vào không thể vòng qua `ToolRuntime.execute` để gọi thẳng định nghĩa.

Ranh giới chuẩn hóa các dạng JSON Schema không mơ hồ thành `ParameterSchemaSpec`, đồng thời giữ nguyên `integer`, tính mở của object gốc và mảng required. Các node object dùng trực tiếp DSL phải khai báo `additionalProperties`; từ vựng không hợp lệ sẽ báo lỗi kèm phương án thay thế chấp nhận được. Thông báo lỗi cho parse error, lỗi TypeScript, thiếu return, dùng sai API Node và trùng tên tool đều chứa dòng mã nguồn liên quan hoặc quy ước sửa lỗi, không tường thuật chi tiết nội bộ triển khai.

### Nhóm nội bộ và vòng đời plugin tạm thời

Mỗi plugin tạm thời là con của nhóm nội bộ `cordis-dynamic` nằm dưới plugin tool, do đó việc giải phóng fiber thông thường là đủ để xử lý reload và unmount của bộ công cụ. `cordis_mount` chờ settlement; khi khởi động thất bại, fiber được giải phóng trước khi trả về lỗi. Plugin đã settle nhưng ở trạng thái pending vẫn hiển thị, kèm liệt kê các injection còn thiếu. `cordis_unmount` chờ việc giải phóng fiber của plugin hoàn tất.

Plugin tạm thời chỉ tồn tại trong bộ nhớ tiến trình. Nó không tạo file Plugin, không cài đặt package, không sửa `cordis.yml` hay cấu hình cá nhân/dự án, không tồn tại qua các lần khởi động lại, và cũng không có cơ chế tự lưu, "chuyển chính thức" hay đường dẫn cài đặt. Nếu muốn giữ lại kết quả thử nghiệm, Agent nên thực hiện qua quy trình phát triển thông thường để tạo một Plugin dự án bình thường hoặc một gói profile có thể cài đặt.

### Tổ hợp xuyên các lần mount qua provide/inject

Các lần mount liên kết với nhau qua ngữ nghĩa service cordis thông thường, dùng id của mỗi lần làm handle vòng đời: lần mount A gọi `ctx.provide('foo', value)`, lần mount B khai báo `inject: ['foo']` và được kích hoạt ngay khi `foo` xuất hiện; nếu B mount trước, nó ở trạng thái pending và liệt kê service còn thiếu; unmount A đưa B trở về pending (đăng ký của nó bị thu hồi), sau đó provide lại sẽ chạy lại `apply` của B thông qua một sandbox facade mới; provide trùng lặp sẽ báo lỗi rõ ràng và chỉ ra fiber đang sở hữu service đó. Một lưu ý về realm: giá trị service do một lần mount provide là đối tượng thuộc vm realm — gọi phương thức của nó từ bất kỳ đâu đều hoạt động, nhưng bên tiêu thụ không được giả định nó có prototype của host.

### Danh mục API được sinh tự động

`cordis_inspect` lấy dữ liệu API và event từ danh mục được sinh tự động, thay vì duy trì một bảng trùng lặp. Bộ sinh tái sử dụng cơ chế quét AST của danh mục Cordis, xuất ra tóm tắt service, chữ ký, JSDoc gốc của phương thức và event của service, schema event, các khai báo kiểu được tham chiếu, và API context được kế thừa. Tên kiểu mơ hồ bị bỏ qua, khai báo quá lớn bị đánh dấu là đã cắt bớt.

Tính mới cũng bị ràng buộc bởi cổng kiểm soát như mọi sản phẩm sinh tự động khác: `pnpm run verify-cordis-api` (trong `doc-sync`) sinh lại trong bộ nhớ và fail nếu có bất kỳ diff nào, do đó thay đổi JSDoc hay chữ ký công khai mà không sinh lại danh mục model đọc sẽ không thể được merge. Tool inspect chạy runtime giao danh mục với runtime đang hoạt động thay vì dump thẳng: báo cáo dạng rộng hiển thị service đang hoạt động có mục trong danh mục dưới dạng tóm tắt + chữ ký, hiển thị service đang hoạt động không có mục trong danh mục (do mount cung cấp) dưới dạng tên + fiber sở hữu, liệt kê tóm tắt các service có mục trong danh mục nhưng không có provider đang hoạt động, rồi đính kèm cấu trúc kiểu được tham chiếu. Báo cáo tên chính xác hiển thị một service hoặc event đang hoạt động, đặt JSDoc gốc ngay trước mỗi chữ ký; để chi tiết đó chỉ xuất hiện khi cần, tránh việc danh sách khám phá phải gánh chi phí token của nó.

### Cấu hình, hiển thị và khả năng quan sát

Plugin này expose một trường cấu hình, được schemastery kiểm tra và ghi lại trong [danh mục cấu hình](../../../../docs/config-catalog.md): `vmTimeoutMs` (mặc định 5000), giới hạn mili giây cho phần đánh giá đồng bộ của code. Tên hướng tới model hiện tại là `cordis_inspect`, `cordis_mount` và `cordis_unmount`; tên nhóm nội bộ `cordis-dynamic` và tiền tố id `dyn-` vẫn là từ vựng cấu trúc. Cả ba tool đều được hiển thị dưới dạng thẻ `generic` theo [sổ tay thực hành thêm tool](../../../../docs/cookbook/adding-a-tool.md): inspect là `read`, mount là `execute` mang theo `rawInput` là code, unmount là `delete`. Các dòng hội thoại Web giữ nguyên các cơ chế chung này, đồng thời đặt tiêu đề thao tác riêng cho từng tool là `Inspect`, `Mount temporary Plugin` và `Unmount temporary Plugin` cùng màu nhấn Cordis thống nhất; dòng mount vẫn dùng view mở rộng JavaScript và syntax highlight dùng chung.

Nguyên tắc "model nhìn thấy ⟺ đã ghi log" vẫn đúng, và không cần loại event phiên mới nào: mount và unmount hiển thị qua cặp `tool/call`/`tool/result` đã được ghi log, khi schema thay đổi giữa các bước, hệ thống phát ra request header đầy đủ ghi lại mọi thay đổi của bộ công cụ. Plugin tạm thời thuộc bộ nhớ tiến trình, không phải trạng thái phiên: khôi phục một phiên đã lưu lâu dài chỉ tái tạo lại lịch sử hội thoại, không bao giờ tái tạo lại chúng.

## Các phương án thay thế đã cân nhắc

**Thay `cordis_mount` bằng các tool đăng ký có cấu trúc theo từng năng lực.** Phương án thay thế hấp dẫn nhất là một `cordis_register_tool` với các trường tường minh `name`/`description`/`parameters`/`code` (cùng các tool đi kèm `cordis_register_listener`, `cordis_register_service`, ...), thay vì một nguyên hàm duy nhất "gắn một plugin". Lý do bác bỏ: lợi thế thực sự duy nhất của nó — miễn boilerplate plugin cho kịch bản đơn lẻ phổ biến nhất — không đủ bù đắp cho cái giá phải trả, trong khi nguyên hàm mount duy nhất có thể bao phủ mọi năng lực chỉ trong một lần.

| Khía cạnh | Tool có cấu trúc theo từng năng lực | `cordis_mount` duy nhất |
|---|---|---|
| Tính đúng đắn của schema | `parameters` vẫn là JSON do model viết, cần kiểm tra schema thống nhất, chỉ là được đưa lên sớm hơn | Cùng một kiểm tra chạy tại ranh giới sandbox, cùng thông báo lỗi mang tính hướng dẫn |
| Trường code | Thân hàm `execute` vẫn là JS do model viết trong vm; vấn đề đúng đắn của realm và lời gọi service không đổi | Một sandbox, một đường chuẩn hóa duy nhất, một nơi đăng ký được bảo vệ |
| Phạm vi năng lực | Chỉ giới hạn ở tool; listener, service, quan hệ `inject` mỗi thứ cần một tool có cấu trúc khác — API tăng vô hạn | Một bộ từ vựng (plugin cordis) bao phủ mọi hiệu ứng hiện tại và tương lai |
| Tổ hợp xuyên các lần mount | Không thể biểu diễn trong payload đăng ký tool | `provide`/`inject` gốc, ngữ nghĩa cordis thông thường |
| Khả năng xem xét | Thứ được đăng ký không thể hiển thị như một plugin trong danh sách plugin | Cái model mount ra chính là cái `cordis_inspect` hiển thị |
| Dễ dùng với model | Có lợi thế cho kịch bản đơn lẻ phổ biến nhất (không boilerplate plugin) | Được giảm nhẹ bằng ví dụ chuẩn trong mô tả mount cộng thông báo lỗi ranh giới dạy cách gọi đúng |

Vì vậy, đầu tư cho tính đúng đắn được đặt vào nơi mang lại lợi ích cho mọi năng lực chỉ trong một lần: danh mục API được sinh tự động hiển thị qua `cordis_inspect`, và kiểm tra tại ranh giới sandbox (thông báo lỗi của nó dạy cách gọi đúng). Các tool đăng ký có cấu trúc vẫn có thể được thêm sau này như syntax sugar tổng hợp ra code mount; thiết kế này không loại trừ khả năng đó.

**Duy trì tham chiếu service/event thủ công trong tool.** Phiên bản đầu tiên của tool inspect mang theo một bảng chữ ký phương thức service viết tay. Nó đã được thay thế bởi `api-catalog.ts` sinh tự động, vì bảng viết tay sẽ lệch pha với JSDoc ngay khi chữ ký thay đổi và không có cổng kiểm soát nào ràng buộc độ trôi đó, trong khi sản phẩm sinh tự động được đảm bảo tính mới bởi cùng bộ kiểm tra AST mà tài liệu sử dụng.

**Thêm event phiên `cordis/mount`.** Một event bền vững ghi lại mã nguồn và tên của mỗi lần mount, có tiền lệ rõ ràng (`hook/invoked`, `compaction/start`). Bị bác bỏ ở v1: mount và unmount đã hiển thị qua cặp `tool/call`/`tool/result`, thay đổi bộ công cụ đã được ghi lại như request header thay đổi đầy đủ, do đó một event chuyên dụng chỉ ghi lại trùng lặp. Nếu use case audit sau này cần lấy mã nguồn và tên của lần mount ngoài phạm vi lời gọi tool, vẫn có thể thêm sau.

**Sandbox được gia cố/giới hạn năng lực.** Việc đặt bẫy trên các module built-in của Node và cung cấp cho code gắn vào một facade theo danh sách trắng thay vì context gốc, có thể ngụ ý mục đích là sandbox hóa vì bảo mật. Điều đó rõ ràng không phải vậy ở đây: bẫy và facade thu hẹp *API* mà code gắn vào nhìn thấy — dẫn hướng nó về các service cordis, tránh xa các module built-in dễ rò rỉ của Node và cơ chế nội bộ của framework — mục đích là tính đúng đắn và bịt các lỗ thoát context không được bảo vệ, nhưng các năng lực mà facade expose (`ctx.shell`, `ctx.fs`, `ctx.web`) chạm vào runtime thật, do đó nó không phải là ranh giới bảo mật. Ranh giới bảo mật thật sự (tiến trình độc lập, nhắc xin quyền) nằm ngoài phạm vi của một bộ công cụ dành cho phát triển/cần bật rõ ràng, và sẽ xung đột với mục đích cốt lõi của nó — trao runtime đang hoạt động cho model.

## Hệ quả

Bộ công cụ này là thiết kế cần bật rõ ràng có chủ đích, có `ctx` với đầy đủ quyền hạn, do đó mức độ nhận thức khi bên triển khai áp dụng nó nên tương đương với tool bash. Một số sự thật sau được thông báo trực tiếp cho model qua mô tả tool: một listener kiểu waterfall (event dạng thác nước) (như `tools/pre-execute`) nếu return mà không gọi `next()` sẽ làm đoản mạch (short-circuit) toàn bộ chuỗi, do đó một listener đã mount có thể chặn đứng việc phân phối tool của chính agent ([ngữ nghĩa waterfall](../../../../docs/cordis-primer.md#cordis-waterfall-semantics)); code gắn vào chạy trong lời gọi tool của lượt hiện tại, do đó await bất cứ thứ gì chỉ resolve sau khi lượt đó kết thúc sẽ gây deadlock; `vmTimeoutMs` chỉ giới hạn phần thực thi đồng bộ; mount không tồn tại được sau khi phiên được khôi phục.
