# Agent Note: Hệ thống vận hành plugin động Cordis Host/Client

Status: proposed

[English](2026-08-08-cordis-web-dynamic-packages.md) | 中文

## Problem

Model cần mở rộng tạm thời tiến trình DSH hiện tại mà không sửa mã nguồn repo, không build lại ứng dụng, không refresh trình duyệt. Phần mở rộng có thể chạy trên tiến trình Node.js của Host, cũng có thể chạy trên trang trình duyệt của Client, hoặc do Host lấy dữ liệu, Client hiển thị, cùng nhau tạo thành một plugin.

Năng lực này không thể chỉ đơn thuần là "thực thi một đoạn code". Model cần khám phá Service, Event, Builtin, Slot và theme token mà cả hai phía cho phép sử dụng trước khi viết code; người dùng cần xem trước code, rồi mới quyết định có cho phép code Client vào trang hay không; cùng một plugin cần thêm phiên bản bất biến, thử lại hoặc rollback sau khi thất bại; lỗi bất đồng bộ sau khi chạy cần quay lại model, chứ không chỉ nằm lại trong log server hay console trình duyệt.

Nếu nhồi định nghĩa, phê duyệt, chạy, chuyển đổi phiên bản, khám phá năng lực và trạng thái UI vào một hành động, sẽ sinh ra trạng thái không thể giải thích ổn định: định nghĩa thành công có đồng nghĩa với chạy thành công hay không, sau khi nâng cấp thất bại thì phiên bản nào vẫn là phiên bản thành công, khi trang không phản hồi thì Tool nên đợi bao lâu, khi cùng một Package chạy nhiều lần thì thẻ lịch sử nào mang UI nghiệp vụ, và trạng thái tải cục bộ của trang Client có thể đại diện cho trạng thái cấp tiến trình của Host hay không.

## Proposal

### Nguyên tắc cốt lõi

- Host lưu trạng thái có thẩm quyền cấp tiến trình duy nhất cho Plugin, Package, Run, phê duyệt và con trỏ phiên bản.
- Client chỉ lưu tương tác phê duyệt, kết quả tải, đóng góp Slot, view nghiệp vụ và lỗi cục bộ trang của trang hiện tại.
- Define chỉ tạo phiên bản code bất biến; Run chỉ kích hoạt một phiên bản đã định nghĩa.
- Chuyển đổi phiên bản chỉ commit `currentPackageId` sau khi Package đích hoàn thành yêu cầu kích hoạt Host/Client.
- Trước khi viết code, model truy vấn năng lực qua Inspect Provider; kết quả Inspect chỉ hỗ trợ việc code, không phải dữ liệu nghiệp vụ runtime của plugin.
- Code động của cả Host và Client đều dùng ngữ cảnh plain JavaScript bị hạn chế, và móc side effect có thể hủy vào vòng đời Cordis.
- Code Client cần được người dùng ủy quyền trước khi vào trang; phạm vi ủy quyền có thể là một Package đơn lẻ, cũng có thể là các phiên bản sau này của cùng một Plugin.
- Lời gọi Tool không đợi phê duyệt hoặc thao tác trình duyệt chỉ có thể xảy ra sau khi lượt hiện tại kết thúc; kết cục bất đồng bộ được phản hồi qua kho trạng thái và steering model.

### Trách nhiệm gói và hướng phụ thuộc

Hệ thống vận hành động gồm bốn gói dưới `packages/self-modification/`:

| Gói | Tên gói npm | Trách nhiệm |
| --- | --- | --- |
| `tool-cordis` | `@deepseek-ai/dsh-tool-cordis` | Đăng ký System Prompt, bảy Tool model, Host Inspect Provider, tiêm ngữ cảnh `@pluginId` và metadata hiển thị Tool |
| `cordis-host-runner` | `@deepseek-ai/dsh-cordis-host-runner` | Lưu Registry có thẩm quyền, cấp ID, thực thi code Host, quản lý phiên bản, phê duyệt, Run, handler riêng tư, định tuyến Inspect và phản hồi model |
| `cordis-client-runner` | `@deepseek-ai/dsh-cordis-client-runner` | Đồng bộ manifest Inspect trên trình duyệt, điều phối kích hoạt Host→Client sau phê duyệt, đánh giá code Client, quản lý Guard, Loader/Fiber, timer, style và teardown |
| `ui-cordis` | `@deepseek-ai/dsh-client-ui-cordis` | Hiển thị thẻ Tool Define/Run, panel Cordis toàn cục, control phê duyệt, chọn phiên bản, trạng thái chạy và view nghiệp vụ tùy chỉnh của Package |

`tool-cordis` chỉ phụ thuộc service trong-tiến-trình của Host Runner, không import triển khai Client. `ui-cordis` chỉ tiêu thụ face của Client Runner và kiểu wire an toàn với Client, không import triển khai Host. Kiểm soát vận hành của Host và Client thông qua mặt Remote sinh sẵn và sự kiện chuyển tiếp đã có; gateway không sở hữu logic nghiệp vụ của Plugin động.

### Đối tượng lĩnh vực

#### Plugin

Plugin là một thực thể plugin động có thể tiếp tục sửa đổi, được định danh bởi kiểu có nhãn `CordisDynamicPluginId`, ví dụ `clock-1`. Khi tạo Plugin mới, model chỉ gửi một tiền tố ngữ nghĩa tiếng Anh viết thường 3-6 ký tự; Host thêm một hậu tố số duy nhất trong tiến trình. `pluginId` hoàn chỉnh không thể do model chỉ định.

Plugin thuộc về Session đã định nghĩa nó. Tool model chỉ có thể đọc và thao tác Plugin của Session hiện tại; panel Client toàn cục có thể liệt kê Plugin của mọi Session, nhưng mỗi hành động vẫn thực thi bằng Session chủ sở hữu mà dòng đó mang theo.

#### Package

Package là một phiên bản code bất biến dưới Plugin, được định danh bởi `CordisDynamicPackageId`, ví dụ `pkg-2`. Nó chứa tên, mục đích, code Host tùy chọn và code Client tùy chọn, và có ít nhất một trong hai phía. Mỗi lần `cordis_define` đều tạo Package mới; Package đã có không được phép sửa tại chỗ.

Cùng một Plugin có thể có nhiều Package, nhưng cùng một thời điểm nhiều nhất chỉ có một Run vật lý. Việc Package có chứa Host hay Client chỉ quyết định các bước kích hoạt, không thay đổi định danh phiên bản.

#### Plugin Run

Plugin Run là một lần thử kích hoạt cụ thể, được định danh bởi `CordisDynamicPluginRunId`, ví dụ `run-3`. Mỗi lần thử kích hoạt mới đều được cấp ID mới, bao gồm thất bại sau phê duyệt, thử lại cùng Package và cập nhật phiên bản. `pluginRunId` liên kết phê duyệt, kích hoạt Host, tải Client, RPC riêng tư, thẻ Tool và lỗi vào cùng một lần thử.

Host lưu riêng biệt Run vật lý hiện tại và `latestRun`. Run vật lý biểu thị lần kích hoạt lúc này vẫn có thể gọi và hủy; `latestRun` biểu thị phê duyệt, giai đoạn, trạng thái hai phía và chẩn đoán của lần thử gần nhất. Một lần thất bại có thể không còn Run vật lý nào sống, nhưng vẫn để lại một attempt có thể truy vấn.

#### Con trỏ phiên bản

- `currentPackageId` là Package của lần cuối cùng hoàn thành quy trình kích hoạt theo yêu cầu. Dừng plugin, bắt đầu cập nhật hay cập nhật thất bại đều không xóa nó.
- `nextPackageId` là Package đích đang chờ phê duyệt, đang kích hoạt, đang chờ Client, hoặc vừa thất bại gần nhất. Khi đích thành công và được commit thành current thì bị xóa.

Package chỉ-có-Host commit thành current sau khi Host thiết lập Fiber thành công. Package chứa Client commit thành current sau khi Host kích hoạt thành công và ít nhất một Client thiết lập được lần tải tương ứng thành công. Fiber bị Cordis park thành waiting do thiếu phụ thuộc cứng vẫn là đối tượng vòng đời đã thiết lập thành công, không đồng nghĩa với việc resolve hay `apply` thất bại.

Khi cập nhật đích thất bại sẽ không tự động khởi động lại Run vật lý cũ. `currentPackageId` cũ tiếp tục biểu thị phiên bản thành công cuối cùng, đích thất bại được giữ lại làm `nextPackageId`. Người dùng hoặc model có thể thử lại next, cũng có thể kích hoạt lại current với `mode: "run"` để hoàn tất rollback.

### Trạng thái có thẩm quyền và tính bền vững của Host

`DynamicCordisRunnerService` và Registry nội bộ của nó là nguồn thẩm quyền duy nhất trong tiến trình DSH hiện tại, lưu:

- Quyền sở hữu Session của Plugin và tập hợp Package bất biến;
- `currentPackageId`, `nextPackageId`, Run vật lý và `latestRun`;
- Ủy quyền theo Package đơn lẻ và ủy quyền xuyên phiên bản của Plugin;
- Yêu cầu kích hoạt Client đang chờ xử lý;
- Fiber của Host, handler riêng tư của Package, Service đang chờ và chẩn đoán gần nhất;
- Danh mục và đường định tuyến truy vấn của Inspect Registry Host và Client.

Các đối tượng này không được ghi vào cấu hình hay đĩa, cũng không khôi phục sau khi tiến trình khởi động lại. Session Log có thể giữ lại metadata cần thiết cho lời gọi Tool, kết quả và thẻ, nhưng sẽ không replay lại code động để khôi phục Registry. Sau khi tiến trình khởi động lại, thẻ lịch sử vẫn tồn tại như bản ghi hội thoại, nhưng `pluginId` và `packageId` gốc không còn chạy được nữa.

Trạng thái vận hành không được ghi vào Session projection như trạng thái có thể khôi phục. Refresh trang hoặc mở trang mới sẽ không tự động khôi phục nửa Client; tự động khôi phục sẽ tái đưa vào định danh kết nối, baseline giai đoạn khởi động và protocol nhất quán xuyên trang, không thuộc thiết kế hiện tại.

### Define, Run và chuyển đổi phiên bản

`cordis_define` có hai chế độ: khi tạo Plugin mới gửi `idPrefix`; khi sửa Plugin đã có gửi `pluginId` chính xác. Code thống nhất là `code: { host?, client? }`. Define chỉ xác thực tham số và cú pháp plain JavaScript, ghi lại source code bất biến và trả về ID cuối cùng. Nó không thực thi `apply`, không sinh ra phê duyệt, không thay đổi con trỏ phiên bản, cũng không ngầm chạy.

Không cung cấp `cordis_update` độc lập. `cordis_run` biểu đạt ý định kích hoạt qua `mode`:

| Quan hệ phiên bản | `mode` |
| --- | --- |
| Chưa có `currentPackageId` | `run` |
| Đích bằng current, bao gồm khởi động lại, thử lại hoặc rollback | `run` |
| Đích khác với current đã có | `update` |
| Thử lại `nextPackageId` sau khi cập nhật thất bại | `update` |

Run trước tiên xác thực quyền sở hữu Plugin/Package, quan hệ phiên bản và liệu có chuyển đổi nào đang diễn ra hay không, rồi mới tạo `pluginRunId`, ghi `latestRun` và `nextPackageId`.

Package chỉ-có-Host hoàn thành kích hoạt Host bên trong lời gọi Tool, và trả về đồng bộ `running` hoặc thất bại. Package chứa Client không đợi kết cục cuối cùng của trình duyệt bên trong lời gọi Tool: khi chưa được ủy quyền thì đăng ký phê duyệt và trả về `awaiting-approval`; khi đã được ủy quyền thì đăng ký kích hoạt Client tự động và trả về `starting`. Cả hai loại trả về đều chỉ biểu thị yêu cầu đã được thiết lập, không biểu thị kích hoạt hoàn chỉnh thành công.

Khi đích thực sự bắt đầu kích hoạt, Host trước tiên dừng Run vật lý cũ, rồi thực thi nửa Host của đích. Chỉ sau khi Host thành công mới cho phép Client lấy source code tương ứng với `pluginRunId` chính xác và tải. Sau khi Client thành công Host mới commit con trỏ phiên bản; thất bại ở bất kỳ giai đoạn nào đều được ghi vào attempt đó, không giả trang việc khởi động lại phiên bản cũ thành thành công của đích.

`cordis_stop` hủy Run Host/Client hiện tại và yêu cầu đang chờ phê duyệt, nhưng giữ lại Plugin, Package, ủy quyền và con trỏ phiên bản. `cordis_undefine` trước tiên dừng, rồi xóa Plugin, Package, ủy quyền và con trỏ phiên bản; sau khi xóa thẻ lịch sử chỉ hiển thị "plugin đã bị gỡ bỏ".

### Phê duyệt và ủy quyền Client

Package chứa code Client cần được người dùng ủy quyền trước lần kích hoạt đầu tiên, vì nó sẽ chạy code do model sinh ra trong trang của người dùng. Panel phê duyệt cung cấp ba hành động:

- Tích đơn cho phép Package hiện tại; Package đó chạy lại lần sau không cần phê duyệt lại, Package mới vẫn cần phê duyệt.
- Tích đôi cho phép các phiên bản sau này của Plugin hiện tại; Package mới, cập nhật, thử lại và rollback không còn phê duyệt theo từng phiên bản nữa.
- Từ chối kết thúc yêu cầu hiện tại, không thực thi code Host hay Client; model không được lập tức lặp lại yêu cầu khi người dùng không có yêu cầu mới.

Ủy quyền được ghi vào Host Registry khi người dùng cho phép, ngay cả khi sau đó xảy ra thất bại kỹ thuật vẫn được giữ lại. Khi panel trực tiếp chạy Package, bản thân việc người dùng click chính là ủy quyền cho Package đó.

Hàng đang chờ phê duyệt chỉ hiển thị cho phép một lần, cho phép xuyên phiên bản và từ chối, không đồng thời cung cấp chạy, dừng hay xóa. Khi phát hiện phê duyệt mới, panel tự động mở rộng; khi tự động mở rộng thất bại hoặc bị thu gọn, điểm vào cố định và trạng thái hàng vẫn hiển thị số lượng và trạng thái đang chờ phê duyệt.

### Điều phối kích hoạt Client

Host gửi yêu cầu kích hoạt Client qua `cordis/request-run`. Yêu cầu chỉ chứa định danh yêu cầu, Session, Plugin, Package, mode, tên, mục đích và có cần phê duyệt hay không, không broadcast source code.

Trang được ủy quyền thực thi theo thứ tự cố định:

1. Gọi `runHostHalf`, khởi động nửa Host của đích hoặc gắn vào Run Host của cùng attempt đã khởi động.
2. Sau khi Host thành công, gọi `getClientCode` với `pluginId + pluginRunId`, chỉ lấy source code Client của Run chính xác hiện tại.
3. Client Runner đánh giá plugin trong trang, thiết lập Loader entry/Fiber, cài đặt Guard, style, Slot và trạng thái cục bộ trang.
4. Trang gọi `resolveRequestRun` hoặc `settleUserRun` để báo cáo thành công, waiting hoặc thất bại.
5. Host chấp nhận báo cáo của Run chính xác vẫn còn hiệu lực, commit current hoặc lưu chẩn đoán, và broadcast kết thúc yêu cầu, các trang khác dọn dẹp hoạt động.

Host kích hoạt trước Client, tránh việc Client khởi động khi handler Host cần thiết chưa tồn tại. Chỉ Run Host thực sự được tạo bởi yêu cầu này mới có thể bị hủy do Client của trang này thất bại; trang chỉ gắn vào Run đã có không sở hữu nó.

Client Orchestrator lưu hoạt động đang chờ phê duyệt và đang điều phối theo `pluginId`, cùng một Plugin không thực thi kích hoạt trang song song hai lần. Host inventory có thể dựng lại mục đang chờ phê duyệt bị bỏ sót và yêu cầu kích hoạt tự động không cần phê duyệt.

Trạng thái tải Client là sự thật cục bộ của trang. Host active không đại diện cho việc trang hiện tại đã tải nửa Client. UI dùng ba trạng thái chính: không có Run vật lý là màu xám "chờ kích hoạt", Host đã chạy nhưng Client của trang hiện tại chưa tải thành công là màu vàng "Client chờ kích hoạt", cả hai phía của trang hiện tại đều khả dụng là màu xanh "đang chạy". Đang phê duyệt và thất bại được hiển thị như trạng thái bổ sung.

Phiên bản hiện tại không thiết lập định danh per-connection hay quorum đa trang. Báo cáo thành công đầu tiên của Client còn hiệu lực có thể commit current cấp tiến trình; việc trang khác có tải hay không do store của từng trang riêng biệt biểu thị.

### Kênh giao tiếp riêng tư Client→Host của Package

Package động gọi Host từ Client qua một kênh JSON riêng tư: Host dùng `harness.handle(method, handler)` đăng ký phương thức của Run hiện tại, Client dùng `host.call(method, args)` để gọi. Mỗi lời gọi liên kết với `pluginId + pluginRunId`, Host từ chối Run đã dừng hoặc đã hết hạn. Tham số và giá trị trả về phải là JSON không mất mát, không cho phép function, React element, Context, instance Service hay đối tượng class.

Kênh này chỉ phục vụ lời gọi Client→Host của cùng một Package, không dùng Remote Service công khai hay `ctx.remote` trong code động. Mặt Remote công khai chỉ mang giao thức điều khiển riêng của Runner, không phơi bày cho Package động.

### Code động, Guard và vòng đời

Host và Client đều chỉ thực thi thân hàm plain JavaScript, không qua TypeScript, JSX hay chuyển đổi bundler. Host chạy trong `node:vm`, Client được đánh giá trong closure bị hạn chế. Ngữ cảnh hai phía dùng để giảm lạm dụng và cung cấp lỗi mang tính hướng dẫn, không phải ranh giới an toàn chống code độc hại.

Mặc định model đọc Service tùy chọn qua `ctx.get('serviceName')` và kiểm tra `undefined`. Chỉ khi Service là phụ thuộc cứng, thiếu thì Package bắt buộc phải waiting và kích hoạt lại sau khi Service xuất hiện, mới khai báo `inject` trên đối tượng plugin. Truy cập trực tiếp `ctx.serviceName` chỉ được phép khi cùng plugin đó đã khai báo inject tương ứng.

`timer` của Host và Client đều là cùng tên Cordis Service, dùng interface nhất quán, không phải Builtin toàn cục. Plugin cần timer phải khai báo `inject: ['timer']`; timer được tạo trong React effect trả disposer làm cleanup.

Mọi đăng ký và side effect có thể hủy đều thuộc sở hữu của Fiber hiện tại. Event listener, Service, Tool, handler, timer, Slot, style và ghi đè theme đều đăng ký qua `ctx.effect()`, `ctx.on()` hoặc API chính thức trả về disposer. Đóng góp hai phía bị hủy khi dừng, cập nhật, rollback do thất bại hoặc undefine. Ghi đè Theme phải phân tầng theo source và trả về disposer, để khi unmount khôi phục lại giá trị theme trước đó.

Host, DSH, Cordis và Service, Event payload, Slot props, Session/Conversation Snapshot, trạng thái Tool cùng các đối tượng runtime khác đều là dữ liệu sống nội bộ. Code động không được thực hiện `JSON.stringify`, `structuredClone`, liệt kê đệ quy, sao chép toàn phần hay hiển thị toàn bộ đối với các đối tượng này hay đối tượng con của chúng; chỉ được đọc field lá cần thiết cho tác vụ hiện tại, dựng dữ liệu tối thiểu của riêng mình không chứa tham chiếu host.

### Inspect Provider và Catalog

Khám phá năng lực chia thành ba Tool: `cordis_inspect_list` liệt kê manifest Provider Host/Client; `cordis_inspect_query` thực thi truy vấn chỉ-đọc tường minh trên nền tảng chỉ định; `cordis_inspect_self` truy vấn Plugin, Package, source code, con trỏ phiên bản và chẩn đoán vận hành của Session hiện tại.

Host và Client mỗi bên có `CordisInspectRegistry` riêng. Provider đăng ký ID duy nhất trong nền tảng, mô tả, method, schema đầu vào và schema đầu ra. Provider method là truy vấn danh sách trắng tường minh, không phải chuyển tiếp phương thức Service tùy ý; Registry không duy trì target phân tầng, cũng không tự động biến phương thức Service nghiệp vụ thành Inspect method có thể thực thi.

Danh sách Provider đầu tiên:

| Platform | Provider.method | Nguồn dữ liệu |
| --- | --- | --- |
| Host / Client | `Service.listService` | Catalog tĩnh của Service theo từng nền tảng |
| Host / Client | `Event.listEvents` | Catalog tĩnh của Event theo từng nền tảng |
| Host / Client | `Builtin.listBuiltins` | Định nghĩa thủ công gần evaluator/Guard |
| Host | `Tool.listTools` | Registry Tool thực sự nhìn thấy được của Agent hiện tại |
| Client | `Slots.listSubTree` | Catalog tĩnh Slot và subtree/occupant sống của trang |
| Client | `Theme.listTokens` | Export inspect chỉ-đọc của ThemeService |

Sau khi Client Registry thay đổi sẽ đồng bộ manifest hoàn chỉnh về Host, không lưu danh mục trùng lặp theo từng Session. Host query thực thi cục bộ; Client query được Host broadcast bằng request ID, trang gọi Provider cục bộ rồi gửi kết quả về. Host chỉ chấp nhận kết quả thành công đầu tiên vượt qua xác thực output schema; trang thất bại không tranh chấp yêu cầu. Khi không có trang nào trả lời thành công, Tool giữ trạng thái pending cho đến khi thành công về sau hoặc lời gọi Tool bị hủy.

Dữ liệu Inspect chỉ dùng để xác nhận năng lực, chữ ký, kiểu và protocol gắn kết trước khi viết code. Khi plugin runtime cần dữ liệu nghiệp vụ phải gọi Service thực hoặc lắng nghe Event thực, không được cache, hiển thị hay phụ thuộc vào giá trị trả về của Inspect/Catalog.

`CordisCatalogProjector` dùng TypeRT để sinh Catalog Service và Event Host/Client riêng biệt; bộ sinh Slot AST quét `SlotMap`, tùy chọn đăng ký, standard props, owner props và kiểu tham chiếu; Slots Provider khi truy vấn gộp Catalog tĩnh và cây sống. Theme token do ThemeService export, Builtin duy trì thủ công gần evaluator/Guard, schema Tool đến từ Registry.

Catalog quét chữ ký source code thật, rồi áp dụng danh sách trắng model-visible. Danh sách trắng có thể ẩn Service, thành viên, API `@deprecated`, service của chính Runner và Event điều khiển `cordis/*`, nhưng không thể viết lại tên phương thức, tham số và kiểu trả về của API còn lại. Guard có thể từ chối tham số, cố định nguồn hoặc chặn thành viên, nhưng phải tôn trọng chữ ký source code.

JSDoc dành cho chủ sở hữu model-visible chỉ yêu cầu description đầy đủ, `@param` cho mỗi tham số, `@returns` cho giá trị trả về non-void, `@mode` của Event, và mô tả field Slot/props. Khuyến nghị gọi, phản ví dụ và lựa chọn xuyên năng lực đặt trong Skill, không thêm field example trùng lặp vào Catalog.

### Phân tầng chỉ dẫn model

Chỉ dẫn model chia thành bốn tầng:

- System Prompt lưu mô hình vận hành ổn định, giới hạn hai phía, vòng đời, phê duyệt, con trỏ phiên bản, quy phạm code tối thiểu và bản đồ sử dụng bảy Tool. Khi Skill không khả dụng, nó vẫn phải hỗ trợ được triển khai đúng ở mức tối thiểu.
- Skill `cordis-plugin-development` lưu điều hướng nhu cầu, tổ hợp năng lực, khuyến nghị và phản ví dụ, không sao chép schema hoàn chỉnh.
- Mỗi description Tool chỉ mô tả tiền điều kiện, ngữ nghĩa tham số, kết quả đồng bộ/bất đồng bộ và bước tiếp theo của hành động đó.
- Provider/Catalog trả về tên chính xác, chữ ký, tham số, Slot props, token và kết quả truy vấn runtime hiện tại.

System Prompt yêu cầu trước tiên tải Skill, sau đó list/query, rồi mới define/run. Ví dụ React trong Skill phải đăng ký vào Slot, không được trực tiếp trả về React Element từ `apply()`; ví dụ dùng `React.createElement`, `ctx.get()`/`inject` đúng cách, effect có thể đảo ngược và JSON RPC tối thiểu.

### `@pluginId` và Tool UI

Hệ thống input đăng ký mention `@pluginId` cho Session hiện tại. Sau khi chọn chỉ tiêm định danh Plugin, Package cơ sở mặc định, con trỏ phiên bản, Run hoạt động và trạng thái gần nhất, không tiêm source code. Cơ sở mặc định lần lượt chọn next, current, Package định nghĩa gần nhất. Model phải trước tiên dùng `cordis_inspect_self` đọc source code, rồi mới append Package ở chế độ existing; khi tham chiếu mất hiệu lực không được âm thầm tạo Plugin thay thế.

Thẻ `cordis_define` hiển thị code bằng hai tab con Host/Client. Thẻ `cordis_run` liên kết attempt chính xác qua `pluginRunId`, và đọc Client store để hiển thị chờ phê duyệt, Client chờ kích hoạt, đang chạy, thất bại, đã bị Run sau thay thế hoặc Plugin đã bị gỡ bỏ.

Package có thể đăng ký `key: "self"` vào `tool.view.cordis`. Lúc runtime self được gắn thành `pluginId + packageId`; key Slot nghiệp vụ không chứa `pluginRunId`, nhưng owner props vẫn cung cấp định danh Run chính xác. Thẻ Run mới nhất của cùng một Package mang UI nghiệp vụ, thẻ cũ hơn hiển thị đã có run mới hơn. Thẻ phản ứng thay đổi qua store, không quét Session Log về sau, cũng không thông báo lẫn nhau.

Panel Cordis toàn cục dùng một điểm vào cố định, nhóm theo phiên hiện tại và các phiên khác. Tiêu đề panel và thao tác thu gọn cố định, chỉ danh sách cuộn được. Hàng thường có thể chọn Package rồi chạy, dừng hoặc xóa; cập nhật thất bại có thể thử lại next hoặc chọn current để rollback; hàng chờ phê duyệt chỉ cung cấp hai hành động cho phép và từ chối.

### Lỗi và phản hồi model

Lỗi kỹ thuật xuyên Host/Client giữ lại `message` gốc, và giữ lại `stack` khi đối tượng lỗi cung cấp. Chẩn đoán có cấu trúc chứa `pluginId`, `packageId`, `pluginRunId` và giai đoạn: approval, host-load, host-apply, client-load, client-apply hoặc client-render.

Guard Host/Client, đánh giá và handler Host, đánh giá và apply Client, `onEntryError` của Slot và React ErrorBoundary đều đưa lỗi về Agent sở hữu. Console Client đồng thời in đối tượng error gốc bằng `console.error`. Lỗi render thuộc về Run chính xác, không làm bẩn Package bất biến.

Run bất đồng bộ do model khởi xướng sau khi thành công, bị từ chối hoặc thất bại kỹ thuật sẽ dùng `agent.steer` đánh thức Agent sở hữu. Thất bại kỹ thuật yêu cầu đọc chẩn đoán, sửa trong cùng Plugin và tự chủ thử lại; người dùng từ chối thì cấm tự động lặp lại yêu cầu. Việc người dùng thủ công chạy, dừng hay xóa trên panel thông báo bước tiếp theo qua context injection, nhưng không chủ động đánh thức model.

## Alternatives considered

**Gộp Define và Run.** Việc này sẽ mất trạng thái "đã định nghĩa nhưng chưa chạy" có thể xem trước, trộn lẫn lỗi cú pháp, phê duyệt, lỗi chạy và thử lại thành một hành động, do đó tách thành Define bất biến và Run độc lập.

**Package ID đồng thời làm Plugin ID.** ID một tầng không thể biểu đạt việc thêm phiên bản bất biến dưới một thực thể ổn định, cập nhật chỉ có thể stop, undefine, định nghĩa lại, thẻ lịch sử và tham chiếu `@` cũng không thể giữ cùng một đối tượng, do đó dùng định danh ba tầng Plugin, Package, Run.

**Cung cấp `cordis_update` độc lập.** Tải, phê duyệt, UI, chẩn đoán và Run của Update giống hệt nhau, Tool độc lập chỉ lặp lại giao thức, do đó gộp vào `cordis_run mode:"update"`.

**Tự động khôi phục Run vật lý cũ sau khi cập nhật thất bại.** Tự động khôi phục sẽ trộn lẫn "đích thất bại" và "phiên bản cũ thành công lại" thành một kết quả. Thiết kế hiện tại giữ con trỏ current cũ nhưng không tự động khởi động lại, để người dùng chủ động chọn thử lại next hoặc run current.

**Để `cordis_run` block đến khi có phê duyệt của người dùng và kết cục Client.** Phê duyệt hoặc thao tác trang có thể chỉ xảy ra sau khi lượt model hiện tại kết thúc, block sẽ tạo deadlock, và chiếm dụng Tool vô hạn khi không có trang. Thiết kế hiện tại trả về ngay lập tức, báo cáo kết cục qua store, Inspect và steering.

**Host broadcast source code và dùng timeout đợi Client ack.** Broadcast sẽ gửi code cho mọi trang trước khi được ủy quyền; timeout không thể phân biệt không có trang, trang chậm và người dùng chưa thao tác; Host còn phải duy trì rollback kiểu bù trừ. Protocol hiện tại chỉ broadcast metadata, do trang được phê duyệt tự kéo source code theo Run chính xác.

**Tự động khôi phục mọi Package active của Host khi trang khởi động.** Việc này đòi hỏi định danh kết nối, baseline giai đoạn khởi động và nhất quán xuyên trang. Thiết kế hiện tại chấp nhận trạng thái Client cục bộ theo trang, người dùng có thể tải lại trên panel.

**Kết nối hai nửa Package qua Remote Service công khai hoặc `ctx.remote`.** Việc này sẽ phơi bày Package động lên mặt RPC cấp sản phẩm. `harness.handle`/`host.call` riêng tư của Package đã đủ để mang lời gọi JSON Client→Host, và có thể từ chối yêu cầu cũ theo `pluginRunId`.

**Tự động phơi bày mọi phương thức Service thành Inspect query.** Việc này sẽ biến khám phá năng lực thành proxy gọi nghiệp vụ, bỏ qua phê duyệt và vòng đời plugin. Provider chỉ phơi bày truy vấn chỉ-đọc được tuyển chọn, Service Catalog chỉ mô tả chữ ký phương thức nghiệp vụ.

**Viết toàn bộ API vào System Prompt hoặc Skill.** Text cố định sẽ bị trôi lệch và chiếm ngữ cảnh. System Prompt giữ quy tắc ổn định, Skill chịu trách nhiệm điều hướng nhu cầu, chữ ký chính xác và danh mục runtime do Provider/Catalog trả về.

**Yêu cầu Slot owner đăng ký props schema lúc runtime.** Slot props đã tồn tại trong kiểu TypeScript và JSDoc, đăng ký trùng lặp sẽ tạo ra một nguồn thẩm quyền thứ hai. Thiết kế hiện tại dùng Slot AST Catalog trích xuất protocol tĩnh, chỉ gộp cây sống lúc truy vấn.

**Ghi trạng thái vận hành vào Session Log và khôi phục lúc replay.** Code động và Fiber là đối tượng cục bộ tiến trình, khôi phục đòi hỏi thực thi lại code lịch sử và diễn giải lại phê duyệt. Session chỉ giữ bản ghi model-visible, Registry và Run trang không khôi phục.

**Để thẻ Run lịch sử quét Session Log về sau.** Việc này sẽ khiến Tool view phụ thuộc vào thứ tự log toàn phần và cấu trúc tin nhắn về sau. Card index/store của trang đã đủ để thông báo theo Package rằng thẻ cũ bị thay thế hoặc Plugin bị xóa.

## Acceptance criteria

- Plugin mới chỉ có thể được tạo bằng tiền tố tiếng Anh viết thường 3-6 ký tự, Plugin, Package và Run ID cuối cùng do Host cấp và dùng kiểu có nhãn.
- `cordis_define` chỉ kiểm tra tham số và cú pháp plain JavaScript, trả về Package bất biến; cùng một Plugin có thể thêm phiên bản, source code cũ vẫn có thể inspect.
- `cordis_run` xác thực nghiêm ngặt run/update; Host-only hoàn thành đồng bộ, Client-bearing trả về `awaiting-approval` hoặc `starting`, không đợi kết cục trang.
- Tích đơn chỉ ủy quyền Package hiện tại, tích đôi ủy quyền các phiên bản sau này của cùng một Plugin; ủy quyền vẫn giữ lại sau thất bại kỹ thuật, từ chối thì không thực thi code hai phía.
- Host kích hoạt trước, Client sau đó mới lấy source code Run chính xác; trước khi Client thành công không commit current cho Package chứa Client, sau thất bại current/next có thể dùng để thử lại và rollback.
- Cùng một Plugin nhiều nhất một Run vật lý cùng lúc; stop hủy đóng góp hai phía nhưng giữ định nghĩa và con trỏ, undefine xóa toàn bộ Package, ủy quyền và trạng thái.
- Trang hiện tại có thể phân biệt "chờ kích hoạt" "Client chờ kích hoạt" và "đang chạy", khi chờ phê duyệt chỉ hiển thị hành động phê duyệt.
- `tool.view.cordis` gắn self với Plugin + Package; thẻ Run mới nhất của cùng Package độc quyền UI nghiệp vụ, thẻ cũ và Plugin đã xóa có trạng thái giảm cấp rõ ràng.
- Guard Host/Client từ chối import, JSX, Service chưa khai báo và global không khả dụng; Service, timer, Slot, style, Tool, handler và ghi đè theme đều theo teardown của Run.
- RPC riêng tư của Package chỉ cho phép JSON không mất mát từ Client→Host, và từ chối `pluginRunId` cũ.
- Inspect list trả về manifest Host/Client trong một lần; query chỉ gọi phương thức chỉ-đọc tường minh, truy vấn Client đợi kết quả thành công đầu tiên hợp lệ schema hoặc bị hủy.
- Catalog Service/Event sinh riêng theo Host/Client và áp dụng danh sách trắng, API `@deprecated`, service của chính Runner và Event điều khiển `cordis/*` không phơi bày cho model; truy vấn Slot gộp props tĩnh và subtree sống.
- `cordis_inspect_self` trả về theo tầng danh sách, tóm tắt Package và source code/chẩn đoán chính xác; `@pluginId` không trực tiếp tiêm source code và cập nhật giữ nguyên trong cùng Plugin.
- Thất bại kỹ thuật bất đồng bộ, handler Host, Guard Client và lỗi render React giữ lại message/stack và steering Agent sở hữu; thao tác panel của người dùng chỉ tiêm context bước tiếp theo.
- System Prompt, Skill, description Tool và Provider/Catalog phân tầng theo Note này, khi Skill không khả dụng Prompt vẫn đủ để sinh plugin đúng ở mức tối thiểu.
- Workspace liên quan `pnpm run build` pass; giai đoạn triển khai bổ sung đầy đủ vòng đời Host/Client, phiên bản, phê duyệt, Inspect, Guard, thẻ Tool và bao phủ snapshot ứng dụng thật.

## Risks

- **Khởi động lại tiến trình mất toàn bộ đối tượng động.** Thẻ Tool lịch sử vẫn còn, nhưng Registry không khôi phục; người dùng phải define lại.
- **Trạng thái đa trang không phải hệ thống nhất quán mạnh.** Kết quả thành công đầu tiên của Client hợp lệ có thể commit current, trạng thái tải và render Client của các trang vẫn có thể khác nhau; hiện tại không đưa vào định danh kết nối, quorum hay tổng hợp trang.
- **Client Inspect có thể pending trong thời gian dài.** Host lưu manifest gần nhất, nhưng khi không có trang nào thực thi Provider thành công thì không được dùng dữ liệu cũ giả làm kết quả sống; khi nhiều trang đều thất bại thì yêu cầu đợi đến khi bị hủy.
- **Ủy quyền xuyên phiên bản mở rộng phạm vi tin cậy.** Tích đôi cho phép Package sau này của cùng Plugin không cần phê duyệt lại; UI phải phân biệt rõ ràng ủy quyền một lần và ủy quyền xuyên phiên bản.
- **Cập nhật thất bại có thể để current trỏ vào phiên bản cũ nhưng phiên bản cũ chưa chạy.** current biểu thị phiên bản thành công cuối cùng, không biểu thị Run vật lý hiện tại; UI, Inspect và gợi ý phải đồng thời hiển thị active, current và next.
- **Ngữ cảnh bị hạn chế không phải sandbox an toàn.** Service Host, file, lệnh, mạng và UI Client đều là năng lực thật. Danh sách trắng và phê duyệt giảm lạm dụng, không cách ly code độc hại.
- **Catalog, Guard và source code có thể trôi lệch.** Bộ sinh, danh sách trắng và JSDoc của owner phải cùng duy trì; chiến lược ẩn của Guard không được tạo ra một bộ chữ ký khác.
- **Builtin phụ thuộc khai báo thủ công.** React, harness, host, styles và phương thức Context không có điểm vào quét thống nhất, triển khai tiêm và định nghĩa Provider phải đặt cùng một chỗ duy trì.
- **Output schema của Provider hiện cho phép JSON khá rộng.** Phiên bản đầu ưu tiên hoàn thành quyền sở hữu Provider, xác thực đầu vào và định tuyến Host/Client; output schema hẹp hơn sẽ siết chặt sau.
- **Guard của Host và Client có triển khai song song.** Môi trường mở và mặt kiểu Cordis hai phía khác nhau, hiện giữ triển khai riêng của mỗi bên; spec chung chỉ trích xuất khi vừa giảm được code vừa không che giấu chiến lược an toàn.
