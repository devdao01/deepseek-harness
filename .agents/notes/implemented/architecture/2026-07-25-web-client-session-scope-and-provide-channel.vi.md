# Agent Note: Mô hình tương ứng Agent-scope của web client và kênh cấp dữ liệu (agents/scope / tái dùng blank / provide)

Status: implemented

[English](2026-07-25-web-client-session-scope-and-provide-channel.md) | Tiếng Việt

> Phạm vi: Agent scope của client (actx) và sự kiện có định hướng, mô hình tương ứng về thực thể hoá giữa client/host, bit blank cho session rỗng và việc tái dùng (`connectWorkspace`), kênh cấp dữ liệu theo từng session (`sessions.provide`), cùng các chi tiết wire phía host gánh những năng lực này (cột `blank` trong summary, trường của khung `host/session-added`, khung `host/commands-changed`). Máy trạng thái nhập liệu và đường ống slash xem [note máy trạng thái nhập liệu](2026-07-25-web-input-machine-and-slash-pipeline.md); mặt nghiệp vụ của lệnh xem [note mặt nghiệp vụ lệnh](2026-07-25-web-command-surfaces-and-assembly.md).

## Vấn đề

Web client chỉ có một mặt session toàn cục duy nhất: mọi slot đều render từ context gốc, plugin không lấy được ngữ cảnh "hiện đang là agent/session nào"; bản sao có thẩm quyền của draft thì chôn trong đối tượng Session, nên plugin nào muốn tham gia vào việc nhập liệu cũng không có chỗ để bắt đầu. Để đỡ được hệ thống lệnh/nhập liệu, tầng nền tảng trước hết phải trả lời:

- trạng thái tương tác của session (menu, popup, bản nháp, request đang bay) do ai nắm giữ, và hai session cô lập với nhau về mặt cấu trúc ra sao;
- "session mới" là gì trước khi thực thể host tồn tại — client có buộc phải tạo ra một vòng đời độc lập từ hư không cho nó hay không;
- component ở scope session "tự lấy dữ liệu session" bằng cách nào, thay vì truyền props qua từng tầng;
- session mới bị người dùng bỏ dở để lại gì ở phía host, và ai thu hồi.

Ràng buộc cứng: host là nguồn sự thật duy nhất; mọi đăng ký đều đi qua disposer của `ctx.effect`; cơ chế scope nhất quán với kiến trúc Agent scope của host; model nhìn thấy được ⟺ đã vào log session.

## Quyết định

### Mô hình tương ứng: client và host chung một trục trạng thái gốc

Phía host, `session.create(workspaceId)` sinh ra Session + Agent + cwd trong một thể thống nhất (như một khối nguyên tử không thể tách rời); phía client chính là tấm gương của lần khai sinh đó — ngay khoảnh khắc dòng session vào list mirror, client đúc Agent scope cho nó (actx + provide + gắn trọn bộ mặt nhập liệu):

- Định danh session ngay từ khi sinh ra đã là thân thật của host: sessionId đến từ phản hồi của `session.create` hoặc từ khung `host/session-added`, và mọi cách định địa chỉ phía client (scope tag, khoá slot store, địa chỉ RPC) đều dùng cùng một id.
- Thời điểm thực thể hoá = khoảnh khắc người dùng chọn Workspace (cwd đã xác định): client gọi ngay `session.create({workspaceId})` và nhận về thực thể đầy đủ.
- "New Session mà chưa chọn workspace" là **trạng thái thuần view** (một vị trí điều hướng), không tương ứng với bất kỳ thực thể session/scope nào; trước khi chọn xong thì toàn bộ composer bị khoá (không slash, không văn bản thuần).
- "Session rỗng" chỉ là một session đã thực thể hoá bình thường mà log còn trống; với mọi plugin ở Agent-scope trên host (goal/plan/skill (kỹ năng)/…) nó không khác gì bất kỳ session nào, nên slash/plan đương nhiên hoạt động đầy đủ.

### Agent scope: actx là vật mang session duy nhất trong thế giới cordis phía client

Runtime `agents/scope.ts` nhất quán với tầng cơ chế `dsh-scope` của host (fiber + tag + lọc bằng filter; không value-import: package host mang theo phần merge `Events` của scoped-events, đưa vào client program sẽ đụng độ với merge của Context):

- `createScope(ctx, key)`: fiber plugin no-op + `extend({[kScope]: key, [Context.filter]: …})` — filter nằm thẳng trên actx: listener untagged nhận được toàn cục, còn tagged chỉ nhận trong scope của mình.
- Việc phát sự kiện chính là nguyên thuỷ của cordis, với thisArg = chính actx: `actx.bail(actx, event, req)` / `actx.emit(actx, event, payload)`.
- `Session.bindScope(actx)`: ghép cặp một lần khi resolve đúc scope (bind lặp thì throw; dropScope thì unbind), phản chiếu `Agent.loopCtx` của host — Session dùng nó để tự phát các sự kiện có scope. Chiều ngược actx→Session đi một chặng qua `sessions.sessionOf(actx)` (phản chiếu cách plugin host dùng `agent.session`).

Ba điểm phân kỳ có chủ ý so với dsh-scope của host:

- filter nằm trên chính actx thay vì trên một carrier riêng: tầng bọc của host bảo vệ điều "subject Agent nghiệp vụ và scope key không trôi lệch nhau" (sự kiện host tiêm chính thực thể Agent vào tham số đầu), còn payload sự kiện của client chỉ mang id, không có subject nào để bảo vệ.
- key so sánh bằng giá trị `SessionId` có brand chứ không theo định danh đối tượng: trong host thì agent.id === id session (đồng trục 1:1), định danh agent dùng lại thẳng brand `SessionId`, nên định danh của scope phía client chính là wire id.
- client là scope theo **định danh Agent** chứ không phải scope theo đối tượng sống: trong giai đoạn session nguội, đối tượng Agent của host đã dispose (giải phóng tài nguyên) trong khi actx của client vẫn sống (nằm trong tầm nhìn) — trục định danh tương ứng nghiêm ngặt, còn trạng thái nóng/nguội của đối tượng thì cố ý không đồng bộ.

Việc chuyển từ id sang ctx chỉ được phép ở ba loại vị trí (bên cung cấp nghiệp vụ thì không bao giờ chuyển):

- factory inject của slot: ctx không đi vào tầng render, thứ mà khung slot trao cho component chính là sessionId, rồi qua map của service để đổi lại đối tượng/controller.
- service điều phối ở root tự định địa chỉ: từ sessionId trong phép chiếu tìm lại actx qua `sessions.scope(id)`.
- listener untagged ở root: tra store của chính mình theo sessionId trong payload.

### Vòng đời scope: bám theo list mirror, sinh ra là vào tầm nhìn, chết là bị prune

Thực thể Session và scope có cùng vòng đời, và tiêu chuẩn tồn tại = được host liệt kê (một tiêu chí duy nhất, dùng chung cho cả việc đúc lẫn việc prune):

- Sinh ra = dòng session vào tầm nhìn của client (kéo baseline của list / tiếng vọng cục bộ của `create()` / khung `host/session-added`), lần resolve đầu tiên theo kiểu lazy sẽ đúc scope (resolution là hàm thuần, an toàn khi render).
- Một lần prune tháo đồng thời ba thứ: thực thể Session, fiber scope (mọi bên tiêu thụ mắc dây chuyền trên actx), và slot store khoá theo session. Ngoại lệ là session đang tạm giữ (= `list.current`): dù bị gỡ khỏi danh sách mà vẫn còn trên sân khấu thì vẫn giữ view chỉ đọc đã đóng băng, chỉ khi rời stage mới tháo.
- Mở lại = dựng lại thực thể theo kiểu lazy + `open()` kéo history (log session của host là sự thật bền vững).
- TODO còn tồn đọng: khung approval/question không vào history, nên không khôi phục được sau prune (pendingBuffers ở cấp manager chỉ bao phủ cửa sổ "chưa từng được thực thể hoá").

### Bit blank: phép chiếu nhìn thấy được, việc chuyển chính thức và tái dùng session rỗng

Session "đã thực thể hoá nhưng chưa có prompt đầu tiên" được quản trị qua bit dẫn xuất `blank` của summary (cột dẫn xuất chứ không phải trường header, giữ cho SessionHeader bất biến):

- Tiêu chí phía host: `session.events.length === 0` (không có sự kiện log nào = chưa có thông điệp người dùng). Session live thì `summarize()` đọc thẳng từ bộ nhớ; session nguội thì luôn `false` — quy ước lazy-create bảo đảm session chưa từng được ghi thêm sẽ không hề vào `persistence.list()` (cả hai backend JSONL/SQLite đều đã được kiểm chứng là lazy thật), nên blank không bao giờ chạm đĩa.
- Wire gánh ở hai chỗ: cột bắt buộc `SessionSummary.blank`; trường bắt buộc `blank` trong khung `host/session-added` (lúc tạo thì luôn true, để các tab khác đưa vào mirror theo cùng một trạng thái session rỗng).
- Mirror phía client chỉ hạ chứ không nâng (đơn điệu), lật theo ba nguồn, tất cả đều dùng lại tín hiệu wire sẵn có:
  - Cục bộ ở bên gửi: **phản hồi thành công** của `prompt()` lần đầu sẽ lật thành false (được tiếp nhận tức là đã chứng minh thông điệp người dùng vào log host — lần lật này là xác chứng chứ không phải lạc quan; `onEngaged` cập nhật đồng bộ mirror của danh sách, dòng `New Session` hiện tại chuyển tại chỗ thành tiêu đề thường, không thêm dòng mới vào danh sách). Nếu prompt đầu tiên bị từ chối thì session vẫn giữ blank: khớp với thẩm quyền của host, tiếp tục hiển thị là `New Session`, và giữ tư cách được tái dùng bởi connectWorkspace khi vẫn còn là thành viên của workspace đó.
  - Ở các đầu khác: khung `host/session-status (running:true)` sẽ lật — session blank không bao giờ running, nên lần running đầu tiên tất yếu đã không còn blank;
  - Căn chỉnh khi kết nối lại: summary.blank của `session.list` là bên có thẩm quyền, đầu nào lỡ khung thì lần kéo sau sẽ tự khớp lại; giá trị blank:true cũ kỹ không được đánh ngược một session đã chuyển chính thức về lại blank.
- Kỷ luật danh sách: store giữ lại toàn bộ các dòng; phần nhóm, dàn phẳng, tìm kiếm và đếm của Workspace browser dùng chung một phép chiếu nhìn thấy được — mọi session không blank đều hiển thị, còn session blank chỉ hiển thị đúng một dòng có `session.id === sessions.current`, và tiêu đề bị ép thành `New Session`. Sau khi chuyển Workspace, thực thể blank cũ vẫn còn trong mirror nhưng bị ẩn khỏi danh sách, còn blank current của Workspace đích thì hiển thị; do đó bề mặt người dùng nhìn thấy được có tối đa một dòng blank trên toàn cục.
- Không GC phần dư sót: sau khi refresh, session blank quay lại kèm theo bit, lần sau khi cùng workspace và vẫn còn là thành viên thì được tái dùng, và đường đi một đầu thông thường khiến mỗi workspace giữ tối đa một cái; sau khi host khởi động lại, blank không để lại dấu vết trên đĩa nên bốc hơi tự nhiên; các vỏ rỗng thừa ra do tranh chấp nhiều tab chỉ trở thành dòng ẩn không phải current, sẽ được tiêu hoá bởi lần tái dùng sau, và không cần phối hợp gì.

### connectWorkspace: lối vào duy nhất của New Session

`workspaces.connectWorkspace(workspaceId): Promise<SessionId>` (thuộc về WorkspaceRuntime — nó đồng thời nắm giữ path chuẩn của workspace và tham chiếu tới sessions):

- Nhánh tái dùng: tìm trong list mirror phần `blank && cwd == workspace.path && sessionIds.includes(id)` — đây là quy tắc thành viên của chính host, tuyệt đối không chỉ dựa vào cwd. Việc khớp cwd mà không có slot trong sổ (session do CLI (giao diện dòng lệnh)/TUI tạo tại cwd của host, hoặc đăng ký đã bị xoá/tạo lại) sẽ mở ra một session mà không bề mặt nhóm nào hiển thị được dưới workspace đó, nên rơi xuống nhánh tạo mới (xem [bản vá tái dùng theo thành viên](../bug-fix/2026-08-05-workspace-blank-session-reuse-membership.md)); nếu trúng thì trả thẳng id đó về, không tạo mới.
- Nhánh tạo mới: nếu không trúng thì `session.create({workspaceId})`, trả về id mới.
- workspaceId lạ thì fail loud (không âm thầm tạo sang chỗ khác).
- Bảo đảm về việc phân giải (cả hai nhánh cùng một quy ước): khi promise resolve, id trả về đã nằm trong list store và `sessions.binding(id)` phân giải được một cách đồng bộ — `SessionRuntime.create` chiếu danh sách một cách đồng bộ sau khi RPC thành công rồi mới resolve, nhờ đó bên chuyển draft có thể ghi văn bản vào machine của scope mới trước khi open, mà không phải chờ notifier flush.
- Bên gọi cầm id rồi tự `sessions.open`; việc gửi prompt đầu tiên chỉ là `session.prompt` thông thường — session vốn đã có sẵn, nên thất bại chỉ là thất bại prompt thông thường, văn bản draft vẫn còn trong machine, thử lại là gửi lại.
- Nút New Session toàn cục mặc định lấy `recentWorkspaceId`: trước hết so sánh `updatedAt` mới nhất của Session trong từng Workspace, khi không có Session thì lùi về `createdAt` của Workspace, giá trị bằng nhau thì giữ thứ tự của Host; chỉ khi hoàn toàn không có Workspace nào thì mới `sessions.clear()` để vào view không có session.  Hành động tạo bên trong nhóm Workspace vẫn trúng đúng Workspace đó một cách tường minh.
- Khi runtime khởi động, nó đăng ký nhận baseline đầy đủ lần đầu: nếu đã có session current khôi phục thành công thì giữ nguyên, ngược lại tự động `connectWorkspace(recentWorkspaceId)` rồi open session blank được trả về. Chính sách này chỉ kết toán một lần; sau đó việc người dùng chủ động clear sẽ không bị lựa chọn tự động ghi đè lần nữa, còn nếu kết nối thất bại thì chờ phép chiếu baseline lần sau thử lại.
- Việc đổi Workspace trong Hero blank cũng đi qua `connectWorkspace`; nếu id đích khác id hiện tại thì trước hết chuyển draft không rỗng của input machine hiện tại sang scope đích, rồi mới `sessions.open(nextId)`. Thực thể blank cũ không bị xoá, chỉ bị ẩn khỏi danh sách vì không còn là current.

### Cấp dữ liệu theo từng session: kênh linh kiện chuẩn `sessions.provide`

Đây là đường cấp dữ liệu duy nhất để component slot của session "tự lấy dữ liệu session". Plugin khai báo bảng khoá cố định bằng bộ mô tả tĩnh `sessions.provide({hooks, props, resolve})` (đăng ký key trùng tên thì throw), còn `resolve(binding)` hiện thực hoá giá trị dưới một session xác định và bị tháo theo scope; `standardKit` của web-react dùng một vòng lặp thống nhất để buộc ô hooks thành các hook selector `use<Name>` (`observableHook`→uSES, chống tearing), còn ô props thì truyền thẳng nguyên trạng.

Scope của slot là tập đóng `root | session-maybe | session`:

- `root` chỉ lấy linh kiện chuẩn toàn cục, không nhận định danh session hay dữ liệu được cấp.
- `session-maybe` đi theo session current với **ngữ nghĩa định danh kiểu nhận nuôi (adoption)** (đây là hành vi duy nhất — không tồn tại chế độ "giữ thực thể vĩnh viễn"): hoá thân sinh ra ở trạng thái rỗng sẽ giữ nguyên thực thể React khi session **đầu tiên** tới (vỏ rỗng nhận nuôi nó — không mount lại, DOM vẫn sống); từ đó trở đi hành vi hoàn toàn giống entry session nghiêm ngặt — chuyển sang session khác thì mount lại, rơi về không có session cũng mount lại thành một hoá thân rỗng hoàn toàn mới (rồi sau đó lại nhận nuôi). Do đó, trạng thái cục bộ theo từng session trong component **được bảo đảm bằng cấu trúc** là bị xoá sạch khi chuyển; trạng thái cần sống sót qua lần chuyển buộc phải nằm ở nguồn gắn với session (machine, store, hooks). Khi không có session, `sessionId`, kết quả chọn của `useSession`/`useInput` và `inputActions` đều có thể vắng mặt. `SessionMaybeProvider` không key ở gốc dẫn dắt luồng cập nhật này bằng cách đăng ký nhận phép chiếu nguyên tử `currentProvide` của runtime — việc di chuyển lựa chọn và thay đổi danh sách bên cung cấp đều được phát qua cùng một source, nên khi current id không đổi mà danh sách thay đổi thì bundle đã mount cũng được phát lại, thay vì mắc kẹt entry ở hình dạng hook/prop lỗi thời — `SessionMaybeProvideInfo` nhờ bảng khoá tĩnh mà vẫn giữ nguyên hình dạng hook/prop đầy đủ ngay cả khi không có session; phần sổ sách nhận nuôi theo từng entry (khoá đếm hoá thân) nằm trong `SessionMaybeEntry` của renderer.
- `session` bảo đảm `sessionId`, mọi source của hook và props đều tồn tại; error boundary của từng entry nghiêm ngặt lấy `sessionId` làm key, nên chuyển session sẽ dựng lại entry đó cùng session store của nó.

`conversation` là lớp vỏ thường trú của `session-maybe`: `ConversationRoot`, HeroShell, Workspace picker, scrollport và composer stack do root nắm giữ, cùng khung fallback bên ngoài của overlay chain, đều giữ nguyên thực thể React trong lần chuyển từ không có session → session blank. Hai entry session nghiêm ngặt chỉ lấp vào các vùng cố định, không làm đổi cấp cha của cây đó: `conversation.session.header` gánh breadcrumb/tab/action ở phía trên scrollport, còn `conversation.session` gánh view ring và draft mirror bên trong nó; cả hai dùng chung một chat store thuộc session scope. Bản thân composer bar (`conversation.composer.bar`) chính là `session-maybe`: khi không có session, các machine face và hành động thông điệp của nó ở trạng thái lười, cả tấm thẻ nét đứt có thể mở Workspace picker sẵn có bằng con trỏ, còn textarea chỉ đọc cũng có thể mở bằng Enter hoặc Space. Sau khi session xuất hiện thì chính thực thể đó (gồm cả textarea) chuyển sang live; các slot nhập liệu còn lại giữ mức `session` nghiêm ngặt và không phát bất cứ nội dung nào trước thời điểm đó. InputBar khi chuyển blank → engaging/active không bị dựng lại chỉ vì phase lật.

- Mục đầu tiên có sẵn trong runtime: hook `'session'` — bản thân `useSession` cũng đi qua chính cơ chế này, không có xử lý đặc biệt.
- Kỷ luật Concurrent: mặt phẳng render chỉ đọc từ ô hooks (uSES bảo đảm tính nhất quán); callback của ô props chỉ dùng trong không gian handler sự kiện; việc phân giải bộ mô tả là render-safe (cache idempotent, phần render bỏ đi còn sót lại do prune dọn xác).
- Component bên thứ ba phụ thuộc giá trị bằng không, kiểu chỉ cần một dòng type-only import (declaration merging vào `SessionStandardProps` / `SessionMaybeStandardProps`).

### Mirror chỉ đọc của hàng đợi

- Ngữ nghĩa hàng đợi: running không khoá nhập liệu; thông điệp thông thường xếp hàng qua `session.prompt {mode:'queue'}`, còn lệnh thì không bao giờ xếp hàng.

### Các chi tiết wire phía host

- Cột `blank` trong summary và trường `blank` của khung `host/session-added` (xem phần bit blank ở trên).
- Khung SSE (Server-Sent Events) `host/commands-changed` (tín hiệu vô hiệu hoá thuần tuý); phía client được định tuyến thành sự kiện có kiểu `commands/changed` và `connection/reset` (phát quảng bá sau khi kết nối được thiết lập lại, và cache dẫn xuất từ wire luôn coi trạng thái cũ là lỗi thời).  Khung commands đó cùng sự kiện client có kiểu của nó về sau được thay bằng "`commands/change` được chuyển tiếp nguyên trạng qua `ctx.remote.$on`" ([sự kiện Remote được chuyển tiếp](2026-08-10-remote-event-delivery.md)); `connection/reset` giữ nguyên; giao ước "vô hiệu hoá chứ không sai phân" nêu ở mục này vẫn còn hiệu lực.
- `command.list/execute`, `skill.list` đều định địa chỉ đơn bằng `sessionId` (session luôn có Agent, và ngữ nghĩa khôi phục của `agentFor` đã có sẵn); phần trình bày về mặt lệnh xem [note mặt nghiệp vụ lệnh](2026-07-25-web-command-surfaces-and-assembly.md).
- Hình dạng request của `session.create`: chọn một trong workspaceId/cwd + sessionId do bên gọi cấp phát trước (tuỳ chọn) (thử lại với cùng id và cùng cwd là idempotent, khác cwd thì báo `session-conflict`).

## Các phương án đã cân nhắc

| Phương án bị bỏ | Lý do một dòng |
|---|---|
| Intent cục bộ ở client + materialize (published CAS / giao dịch attach pendingPrompt / chuỗi before-create) | client bị buộc phải mô phỏng nửa đầu vòng đời mà host thiếu, đẻ ra một đống máy trạng thái gồm published CAS, giao dịch attach và phát hành từng phần |
| host giữ trước ID (draft Map) | host chỉ nhận một con số, còn máy trạng thái vẫn nguyên xi ở client |
| host draft Session (có Session mà không có Agent) | mọi bề mặt host tra Agent đều phải rẽ nhánh cho draft; core phải thêm API `attachAgent` + ghi cwd vào header sau |
| Bind Agent trước khi có cwd (ungrouped) | phá vỡ tính bất biến readonly "created in" của header.cwd + cái bẫy sản phẩm do tác dụng phụ của launch-dir |
| Truyền ngữ cảnh session qua từng tầng React Context | plugin ở cả hai phía host/client nên là một mô hình tư duy duy nhất; cơ chế scope đồng cấu với dsh-scope của host |
| carrier `scopeTarget` + bộ phát hợp nhất (phản chiếu `agentEvents` của host) | tầng bọc của host bảo vệ điều "subject Agent nghiệp vụ và scope key không trôi lệch", còn sự kiện client không có subject để bảo vệ; filter đặt trên actx + nguyên thuỷ cordis đã phủ hết mọi nhu cầu |
| Session không giữ ctx (tầng đối tượng cordis-free) | lằn ranh đỏ sinh ra chỉ để test đơn vị lọc mà không phải kéo cordis vào, cái giá là contribute phải qua hai chặng callback + trường công khai khả biến; Agent của host vốn đã giữ loopCtx |
| Thực thể Session thường trú (resident-instance) | log session của host chính là sự thật bền vững; thường trú chỉ tiện cho định danh, và việc lệch pha với vòng đời scope là nguồn cơn của độ phức tạp |
| Component nhận một gói callback wiring (truyền hai tầng inject→props) | kênh linh kiện chuẩn để component tự lấy; API công khai thu gọn thành hooks + props ổn định |
| Hoán đổi nguyên cả nhánh giữa Hero view không có session và Conversation của session | dù layout lớp ngoài không đổi, cây con Hero, picker và composer vẫn bị dựng lại cùng lúc, khiến giao diện giật cả mảng |
| Để chính InputBar trở thành `session-maybe` | máy trạng thái nhập liệu, mặt lệnh bàn phím và các hành động đều bị buộc phải chấp nhận giá trị vắng mặt; chỉ thay thế phần thân nhập liệu disabled thì mới giữ được tính tuỳ chọn ở ranh giới lớp vỏ |
| Khung "chuyển chính thức" chuyên dụng | `session-status(running:true)` về ngữ nghĩa đã hàm ý việc chuyển chính thức (session blank không bao giờ running), thêm khung là wire có thêm một kiểu mà đổi lại không có thông tin gì |

## Hệ quả

- Plugin có được ngữ cảnh session đồng cấu với host: trạng thái theo từng session gắn trên actx, tháo lắp một lần theo fiber scope, khiến rò rỉ là bất khả về mặt cấu trúc; việc cô lập hai session được bảo đảm về cấu trúc bởi filter của scope.
- Tầng đối tượng của client thu gọn thành tấm gương của wire: định danh session, vòng đời và việc phán định năng lực đều lấy thực thể host làm chuẩn — hệ thống nhập liệu (tầng kế tiếp) luôn đối diện với "session có Agent thật", còn các bên cung cấp như slash/skill đều định địa chỉ trực tiếp bằng sessionId.
- Việc quản trị session rỗng không cần cơ chế chuyên dụng nào: trạng thái dựa vào một bit dẫn xuất, tính hiển thị dựa vào phép chiếu danh sách thống nhất (chỉ blank current mới hiển thị dưới dạng `New Session`), việc thu hồi dựa vào quy ước sẵn có của lazy persistence (khởi động lại là bốc hơi), còn giới hạn trên thông thường dựa vào việc tái dùng trong cùng Workspace.
- Cái giá: kỷ luật chuyển id→ctx và kỷ luật Concurrent của provide đều là quy ước chứ không được kiểu ép buộc, nên phải nhờ review và test ghim lại. Trục trạng thái duy nhất vẫn sẽ ẩn machine face khi Session chưa tồn tại; trong khoảng thời gian đó, tấm thẻ thường trú chuyển thao tác kích hoạt sang Workspace picker ([quyết định](../feature/2026-08-07-workspace-picker-composer-entry.md)).
- Nợ đã biết: khôi phục approval/question qua prune (TODO); việc chọn model quay lại dưới hình dạng live-mutation (bộ ba `selectModel` của host đã có sẵn, nhưng bên tiêu thụ phía client của nó vẫn chưa được xây).
