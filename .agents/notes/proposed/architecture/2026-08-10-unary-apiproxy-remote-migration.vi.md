# Agent Note: Di trú các lời gọi API Proxy dạng unary đơn giản sang service Remote nghiệp vụ

Status: proposed

[English](2026-08-10-unary-apiproxy-remote-migration.md) | Tiếng Việt

## Vấn đề

Host API Proxy vẫn gánh rất nhiều phương thức unary. Phần hiện thực của các phương thức này chỉ thực hiện tra cứu service, chiếu tham số, một lời gọi nghiệp vụ và chiếu phản hồi. Mặc dù [lời gọi Typert Remote](../../implemented/architecture/2026-08-02-typert-remote-method-calls.md) đã cho phép các package nghiệp vụ gánh loại lời gọi này, cách làm hiện tại vẫn lặp lại cùng một quy ước giữa service nghiệp vụ, interface API Proxy, Zod schema, bảng định tuyến, stub phía client và bên gọi Client.

Chỉ di trú phương thức một cách máy móc là chưa đủ. Các phương thức API Proxy gắn với Agent sẽ gọi `agentFor()`: nó tái sử dụng Agent live, khôi phục Session bằng preset được ghi lại trong Session nguội thông thường, khử trùng lặp các lần khôi phục đồng thời, và từ chối identity do subagent sở hữu. Nếu phương thức Remote phân giải `Agent` hoặc `Session` theo cách khác, hành vi vòng đời sẽ thay đổi ngay cả khi lời gọi nghiệp vụ cuối cùng trông giống hệt.

API Proxy còn chứa một số thao tác BFF không lấy phương thức nghiệp vụ làm quy ước: vòng đời Session và việc lắp ráp transcript (bản ghi văn bản), trạng thái chọn model, điều khiển đầu vào chỉ dành cho live, lọc cấu hình, hiển thị skill (kỹ năng), thông tin tổ hợp Host và thao tác desktop native. Tương tác có trạng thái và luồng stream lại có vòng đời khác. Nếu coi cú pháp của lời gọi unary là căn cứ để kết luận phương thức là đơn giản, ta sẽ đẩy chính sách sản phẩm vào một package service tùy ý, hoặc buộc hệ thống phải thêm những package không có chủ sở hữu nghiệp vụ độc lập.

Cuối cùng, Connection hiện đang thực thi danh sách các phương thức đặc quyền chỉ dành cho địa chỉ loopback bên trong nhánh dự phòng của API Proxy. Typert interceptor sẽ nhận endpoint của chính nó trước nhánh dự phòng đó, nên nếu di trú các lời gọi credential hoặc soạn preset mà không di trú kèm phần kiểm tra quyền, bên gọi trong mạng LAN đáng tin cậy sẽ có được quyền thực hiện các thao tác hiện chỉ mở cho bên gọi loopback.

## Đề xuất

Chỉ di trú những lời gọi unary thỏa các điều kiện sau: thao tác nghiệp vụ của nó đã có một service sở hữu tự nhiên, và phần thích ứng còn lại chỉ là một ít phép chiếu tham số hoặc kết quả. Khi chữ ký của phương thức hiện có chính là quy ước mà bên tiêu thụ mong đợi, service nên gắn với Typert namespace và trang trí trực tiếp phương thức hiện có bằng `@Remote`. Chỉ khi thực hiện thích ứng thực chất mới có lý do thêm phương thức mới; không được thêm lớp bọc `remote*` chỉ chuyển tiếp y nguyên.

`@deepseek-ai/dsh-api-remotes/client` sẽ mount các đóng góp `/remote` được sinh ra từ từng package nghiệp vụ được chọn. Package nghiệp vụ phía Client sẽ gọi `ctx.remote.<service>`, và thực hiện ngay trong package các phép chiếu liên kết hoặc hiển thị thuộc sở hữu của Client. Các thành viên interface API Proxy tương ứng, schema, route, handler, phương thức client được sinh, phần hiện thực fixture (dữ liệu chuẩn bị cho test) và điểm gọi trong môi trường sản xuất sẽ được gỡ bỏ cùng nhau trong commit dọc của service đó.

Các phương thức BFF lớn vẫn ở lại trong `dsh-host-apiproxy`. Nếu trong quá trình hiện thực phát hiện một phương thức chứa chính sách vòng đời riêng của endpoint, khối lượng điều phối lớn, việc Client phụ thuộc vào phân biệt lỗi chỉ tồn tại ở tầng giao thức, hoặc cấu trúc dữ liệu truyền tải của nó không thể diễn đạt bằng một adapter nhỏ ở phía sở hữu, thì phương thức đó nằm ngoài phạm vi lần di trú này.

## Tập hợp di trú

| RPC cũ | Đích Remote | Phương thức Host | Thích ứng |
|---|---|---|---|
| `session.rename` | `ctx.remote.sessionTitle`, nằm trong `@deepseek-ai/dsh-session-title` | `SessionTitleService.rename(Session, title)` | Dùng trực tiếp `@Remote`; Client ánh xạ `eventSeq` sang chuỗi chiếu tiêu đề của chính nó. |
| `command.list`, `command.execute` | `ctx.remote.commands`, nằm trong `@deepseek-ai/dsh-commands` | `CommandRuntime.list(Agent)`, `execute(Agent, line, signal)` | Dùng trực tiếp `@Remote`; Client ánh xạ `undefined` thành kết quả không khớp, và giữ nguyên hành vi hủy của bên gọi. |
| `llm.providers` | `ctx.remote.llm`, nằm trong `@deepseek-ai/dsh-llm` | `LlmRuntime.listProviders()`, `listConfigurableProviders()` | Cả hai thao tác đọc đều dùng trực tiếp `@Remote`; Client liên kết dòng đăng ký với dòng danh mục cấu hình. |
| `credentials.describe`, `credentials.set`, `credentials.unset` | `ctx.remote.credentials`, nằm trong `@deepseek-ai/dsh-credentials-local` | `LocalCredentialProvider.describe(ref)`, `set(ref, value)`, `unset(ref)` | Dùng trực tiếp `@Remote`; khi UI yêu cầu nhiều ref, Client phát các lời gọi `describe` theo lô. |
| `agentPreset.read`, `agentPreset.copy`, `agentPreset.remove` | `ctx.remote.agentPresets`, nằm trong `@deepseek-ai/dsh-agent-presets` | `readDocument(id)`, `copy(from, id, name?)`, `remove(id)` | `copy` và `remove` phơi bày trực tiếp phương thức hiện có; `readDocument` kết hợp nội dung đã lưu với metadata lấy từ một lần khám phá thời gian thực. |
| `subagent.interrupt` | `ctx.remote.subagents`, nằm trong `@deepseek-ai/dsh-subagent` | `interruptByParent(targetSessionId, parentSessionId)` | Adapter dựng biến thể quyền người dùng ở bên trong, không phân giải cũng không khôi phục Agent nào. |
| `workspace.list`, `workspace.insertSessionBefore`, `workspace.archiveSession` | `ctx.remote.workspace`, nằm trong `@deepseek-ai/dsh-workspace` | `snapshot()`, `insertSessionBefore(workspaceId, sessionId, before?)`, `archiveSession(sessionId)` | Adapter registry tách các thực thể khả biến, và trả về workspace đã cập nhật xong hoặc ảnh chụp đã lưu trữ. |

Remote API cố ý dùng tên service thay vì giữ tên phân cách bằng dấu chấm của RPC cũ. Ví dụ, thao tác đổi tên Session sẽ trở thành `ctx.remote.sessionTitle.rename(...)`.

## Các mảng API Proxy tạm hoãn di trú

| Mảng | Phương thức | Lý do giữ lại trong API Proxy |
|---|---|---|
| Vòng đời Session Host | `session.list`, `search`, `create`, `fork` | Lưu trữ xuyên Agent, phân bổ Workspace, tổ hợp preset và chính sách tạo mới. |
| Session transcript | `session.history`, `attachment`, `subagent.history` | Log cold／live, phân trang, phép chiếu, bộ hiển thị và ủy quyền tệp đính kèm. |
| Chọn model cho Agent | `session.models`, `selectModel` | Trạng thái riêng của từng Agent, kiểm tra model và lưu giá trị mặc định đều thuộc chính sách BFF. |
| Đầu vào và điều khiển Agent | `session.prompt`, `updateQueue`, `cancel` | Kiểm duyệt ảnh, thay đổi Inbox và ngữ nghĩa chỉ dành cho live riêng của endpoint. |
| Remote cấu hình | `settings.describe`, `openDocument`, `update`, `replace`, `mutate` | Phơi bày namespace, che dữ liệu nhạy cảm, kiểm tra bản sửa đổi và thao tác mở native đều thuộc chính sách sản phẩm. |
| Danh mục skill của Session | `skill.list` | Không được khôi phục Session nguội; scope thường trú của preset và bộ lọc hiển thị là thao tác liên kết của BFF. |
| Thông tin runtime của Host | `host.describe` | Phiên bản, cwd, model mặc định và số Session đang gắn đến từ nhiều chủ sở hữu Host khác nhau. |
| Mở đường dẫn trên Host | `host.openPath`, `agentPreset.openDocument` | Quyền desktop native và việc hủy thuộc về tổ hợp Host. |
| Các lời gọi preset, subagent và workspace còn lại | `agentPreset.list`, `select`; `subagent.list`, `history`, `prompt`; `workspace.create`, `rename`, `delete` | Các lời gọi này chứa chính sách danh sách, liên kết live／cold, ủy quyền hoặc thứ tự thực hiện tuần tự của nhiều thao tác. |
| Giao thức có trạng thái và giao thức streaming | Phê duyệt, câu hỏi, phản hồi, mux và luồng Host | Chúng không phải lời gọi nghiệp vụ dạng một yêu cầu／một kết quả. |

`workspace.delete` ở lại cùng `create` và `rename` vì cả ba đều tham gia cùng một chuỗi thao tác tuần tự tạo／đặt tên／xóa. Tách riêng một phương thức ra sẽ khiến service và API Proxy quan sát thấy thứ tự thao tác khác nhau.

## Tính tương đương khi lookup Agent và Session

`createApiRemoteAgentResolver()` dựng một resolver và trả nó về làm `agentFor` của API Proxy. Cùng closure đó được cài đặt qua `ctx.typert.lookups.configure('agent', ...)`, `ctx.typert.lookups.configure('session', ...)` và `ctx.typert.contexts.configureHost('agent', ...)`. Nhờ vậy, tham số `Agent` hay `Session` của Remote dùng chung với lời gọi `agentFor()` phiên bản cũ cùng một bộ lookup live, bảng khôi phục đang diễn ra, kiểm tra lưu trữ, setup nhận biết preset và ownership fence.

Việc di trú phải cố định các kết quả sau bằng test tích hợp:

- tái sử dụng trực tiếp Agent live thông thường, không thực hiện khôi phục;
- khôi phục Session nguội thông thường dựa trên header đã lưu, sự kiện và setup preset đã ghi lại;
- khi thực hiện lookup Agent và Session đồng thời cho cùng một id, chúng dùng chung một lần khôi phục;
- bất kể live hay cold, identity do subagent sở hữu đều thất bại với `agent-busy` trước lời gọi nghiệp vụ;
- id không tồn tại trong kho lưu trữ thất bại với `session-not-found`;
- resolver thất bại vẫn giữ nguyên `RpcError` hiện có và truyền qua `TypertLookupFailure`.

Chính sách lookup tác động lên toàn bộ key chứ không lên endpoint cụ thể. Nếu các phương thức như nhập prompt, sửa hàng đợi, hủy, chọn model và liệt kê skill dùng lookup `agent` hoặc `session` dùng chung, chúng không thể giữ được hành vi chỉ dành cho live hoặc cấm khôi phục; vì vậy các phương thức này vẫn ở lại API Proxy cho đến khi Typert hỗ trợ chính sách tường minh theo từng endpoint.

Phương thức mà chữ ký chỉ chứa branded id sẽ không gọi lookup đối tượng của Typert. `subagents.interruptByParent()` phải giữ nguyên lookup Activation trong tiến trình hiện có và hành vi khi cha đã offline: nó không gọi `agentFor`, không đọc danh mục, không kiểm tra lưu trữ, và cũng không khôi phục nguội Agent cha hay Agent con.

## Hành vi phía Client và hành vi lỗi

Phương thức Remote được sinh ra trả về giá trị nghiệp vụ, và ném ra một Error có `cause` chứa lỗi RPC hiện có. Service nghiệp vụ phía Client chịu trách nhiệm thích ứng sang interface kết quả／store hiện tại. Chúng phải làm cho kết quả thành công có hiệu lực ngay như hiện nay, sao cho khung sự kiện vẫn là phát lại idempotent chứ không phải con đường cập nhật duy nhất.

Các lỗi `session-not-found` và `agent-busy` do resolver sở hữu vẫn giữ nguyên vì resolver dùng chung ném ra `TypertLookupFailure`. Ngoại lệ nghiệp vụ thông thường sẽ trở thành lỗi RPC `internal` hiện có của Gateway. Chỉ được di trú một lời gọi khi bên tiêu thụ Client được chọn không rẽ nhánh theo các mã lỗi nghiệp vụ cũ cụ thể hơn; nếu trong quá trình hiện thực phát hiện kiểu rẽ nhánh này, RPC đó sẽ rời khỏi tập hợp, trừ khi package nghiệp vụ bổ sung kiểu lỗi có kiểu và độc lập với lớp truyền tải.

## Quyền gọi các phương thức đặc quyền

Connection phải kiểm tra bên gọi có quyền truy cập endpoint đặc quyền hay không trước khi chọn Typert interceptor hay nhánh dự phòng API Proxy. Việc kiểm tra này phải nhận diện được cả tên phân cách bằng dấu chấm kiểu cũ lẫn endpoint Remote dùng dấu gạch chéo, và giữ các thao tác đã di trú sau đây chỉ dành cho địa chỉ loopback:

- `agentPresets/readDocument`, `agentPresets/copy` và `agentPresets/remove`;
- `credentials/describe`, `credentials/set` và `credentials/unset`.

Các kiểm tra trusted-host và origin xuyên suốt toàn bộ lớp mang tin vẫn giữ nguyên. Đây là một yêu cầu không nâng quyền: quyền sở hữu endpoint có thể thay đổi, nhưng tập hợp bên gọi được phép thực hiện thao tác đó không được mở rộng.

## Ranh giới commit

Lần di trú này sẽ hạ cánh bằng một commit RFC, mỗi service một commit dọc, và một commit tích hợp cuối cùng. Commit của service bao gồm phần gắn kết Host và decorator, khai báo package cần cho quy ước được sinh, phần mount API Remotes, phần tiếp nhận phía Client, cùng việc gỡ bỏ route API Proxy cũ và lời gọi client trong môi trường sản xuất của service đó. Commit của service có thể tạm thời không qua được cổng kiểm tra, vì các sản phẩm sinh ra và fixture dùng chung sẽ được chỉnh đồng bộ trong commit tích hợp cuối cùng.

Commit cuối cùng sinh toàn bộ sản phẩm `/remote` từ trạng thái sạch, cập nhật fixture và test dùng chung, chuyển tài liệu này sang `implemented`, cập nhật những tài liệu giao thức vẫn còn thẩm quyền ở chỗ quyền sở hữu lời gọi unary tập trung thay đổi, và chạy các cổng kiểm tra được chọn của repo.

## Các phương án đã cân nhắc

**Giữ các phương thức đơn giản trong API Proxy tập trung.** Cách này giữ được vẻ ngoài truyền tải thống nhất, nhưng vẫn kéo dài đúng những interface, schema, dòng route, stub và phép chiếu nghiệp vụ trùng lặp mà Typert vốn muốn loại bỏ.

**Di trú mọi phương thức API Proxy dạng unary.** Hình thức lời gọi unary không có nghĩa là hành vi chỉ có một chủ sở hữu. Việc điều phối Session, điều khiển chỉ dành cho live, phơi bày cấu hình và thao tác Host native hoặc sẽ làm rò rỉ chính sách BFF vào service dùng chung, hoặc sẽ sinh ra những package không có chủ sở hữu.

**Cung cấp phần hiện thực khôi phục riêng cho phương thức Remote.** Một resolver thứ hai có thể lệch ở phần khôi phục preset, khử trùng lặp đồng thời hoặc quyền sở hữu của subagent. Dùng chung đúng cùng một closure với `agentFor()` phiên bản cũ khiến tính tương đương trở thành sự thật của phần hiện thực, chứ không chỉ là một lời hứa.

**Giữ nguyên mọi tên RPC cũ và response envelope.** Cách này biến package nghiệp vụ thành bản sao của giao thức cũ. Tên hướng service và giá trị nghiệp vụ giao việc liên kết cho Client, còn Connection tiếp tục lo RPC envelope thống nhất.

**Dựa vào nhánh dự phòng của API Proxy để cưỡng chế quyền cho phương thức đặc quyền.** Việc chọn interceptor sẽ đi vòng qua nhánh dự phòng đó, nên cách này âm thầm mở rộng phạm vi quyền của các phương thức đã di trú.

## Tiêu chí nghiệm thu

- Mọi phương thức trong bảng di trú đều gọi được qua service `ctx.remote` liệt kê trong bảng, và không còn route API Proxy cũ, schema, dòng bảng ánh xạ, stub client hay lời gọi nào trong môi trường sản xuất.
- Phương thức hiện có khớp chữ ký được gắn trực tiếp `@Remote`; mỗi phương thức mới đều thực hiện phần thích ứng nêu trong bảng, và không giữ lại lớp bọc `remote*` chỉ chuyển tiếp y nguyên.
- Test tích hợp Agent／Session chứng minh từng kết quả của lookup dùng chung, và test ngắt subagent chứng minh không xảy ra khôi phục nguội.
- Endpoint đặc quyền đã di trú từ chối bên gọi đáng tin cậy nhưng không phải loopback, chấp nhận bên gọi loopback, và phán quyết này hoàn tất trước khi bất kỳ nhánh phân phối nào chạy.
- Hành vi phía Client và hành vi commit trạng thái tức thì của từng lời gọi đã di trú vẫn tương đương, kể cả hành vi hủy ở những chỗ có hỗ trợ hủy.
- Các phương thức tạm hoãn di trú và hành vi hiện có của chúng vẫn nằm trên API Proxy.
- Một lần sinh mã và build bắt đầu từ trạng thái sạch sẽ sinh ra và tiêu thụ mọi đóng góp Remote được chọn, đồng thời các test tập trung và cổng kiểm tra cuối cùng của repo đều qua.

## Rủi ro

Việc gỡ bỏ schema cũ cũng gỡ bỏ luôn phần phân loại lỗi riêng của giao thức đó. Nếu trong Client tồn tại một nhánh ẩn phụ thuộc vào một trong các mã lỗi ấy, thì lời gọi đó không phải lời gọi đơn giản, và phải phát hiện ra nó trước khi chấp nhận commit service tương ứng.

Quy ước Remote được sinh ra sẽ kéo theo yêu cầu về thứ tự build và mục phát hành cho từng package nghiệp vụ. Nếu bỏ sót bất kỳ mục nào trong số: mount runtime, export khai báo, nguồn source map, phụ thuộc package hay Project Reference, thì test nguồn cục bộ vẫn có thể qua, nhưng bản build Client bắt đầu từ trạng thái sạch sẽ thất bại.

Chuyển việc cưỡng chế quyền sang phân phối tổ hợp làm thay đổi mã lớp mang tin nhạy cảm về bảo mật. Test phải bao phủ một endpoint do Remote sở hữu và một endpoint dự phòng kiểu cũ, đảm bảo cả hai nhánh đều không thể đi vòng qua phán quyết loopback.

Tài liệu này áp dụng kiến trúc Typert Remote hiện có chứ không thay thế nó. Tài liệu này thay thế một phần phần quyền sở hữu lời gọi unary tập trung và danh sách kiểm tra mở rộng năm bước trong [ghi chú giao thức GUI RPC](../../implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md), cùng danh sách đấu nối tập trung trong [ghi chú mặt phẳng cấu hình Web](../../implemented/architecture/2026-07-30-web-config-plane.md); đối với envelope Connection và hành vi cấu hình nằm ngoài các phương thức đã di trú, những ghi chú đó vẫn còn thẩm quyền. Các ghi chú về tiêu đề, lệnh, ranh giới cấu hình, ngắt subagent và lưu trữ tiếp tục chịu trách nhiệm cho hành vi nghiệp vụ của riêng chúng, chỉ cần cập nhật trung thực các sự kiện liên quan đến truyền tải mà không cần lưu trữ. [Ranh giới tin cậy của trình duyệt](../../implemented/architecture/2026-07-28-api-browser-trust-boundary.md) và [thứ tự build của quy ước được sinh](../../implemented/process/2026-08-08-api-remotes-generated-contract-build.md) vẫn còn thẩm quyền và không cần thực hiện thao tác lưu trữ.
