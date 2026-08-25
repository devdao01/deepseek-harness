# Agent Note: Máy trạng thái input Web, composer slot và pipeline slash (ui-conversation input / ui-input-trigger)

Status: implemented

[English](2026-07-25-web-input-machine-and-slash-pipeline.md) | 中文

> Phạm vi: máy trạng thái input (bảng occurrence + canh giữ claim + transaction submit), hub/facade và điều phối gửi đi, ba sự kiện scoped bail cho việc viết lại input xuyên plugin, phát hiện trigger `/` và `@` cùng pipeline menu (ui-input-trigger), hệ thống slot quanh composer. Phụ thuộc vào sctx / provide / session-maybe và mô hình thực thể blank của [Agent Note phạm vi session](2026-07-25-web-client-session-scope-and-provide-channel.md); không liên quan gì tới tri thức lệnh (ba loại, mục lục, popup) — đó là lãnh địa của [Agent Note mặt bằng nghiệp vụ lệnh](2026-07-25-web-command-surfaces-and-assembly.md).

## Vấn đề

Hai composer hoạt động độc lập: hero (EmptyState, chuỗi controlled ghi thẳng vào session) và InputBar trong session (textarea controlled thông thường), hành vi, quyền sở hữu draft, đường gửi hoàn toàn không nhất quán. Để đưa ba loại trigger — lệnh `/`, tham chiếu skill, tham chiếu `@` — vào mặt bằng input, phải trả lời:

- ba loại trigger phân tầng thế nào, ai có tri thức về "lệnh", ai không có tri thức gì;
- ô input biểu diễn "trạng thái lệnh" ra sao — suy ra từ text draft hay trạng thái tường minh? Backspace, Enter, space, dán nguyên hàng mỗi thứ có ngữ nghĩa gì;
- submit là một transaction bất đồng bộ (round-trip RPC) — kết quả đến muộn ghi ngược, đổi session, React concurrent replay lại phải phòng thủ ra sao;
- chip tham chiếu biểu diễn thế nào trên textarea thuần, undo/clipboard/khớp paste/serialize cho model thuộc về ai;
- việc viết lại input xuyên plugin (điền lại từ menu, chèn tham chiếu, tiêu thụ token) đảo ngược phụ thuộc như thế nào;
- khi không có session → session blank, những vỏ React nào phải tái sử dụng, những gì thuộc thực thể input nghiêm ngặt của session được phép thay thế.

Ràng buộc cứng: component luôn gắn qua slots; sản phẩm hiển thị không vào session log; đường phím toàn trình an toàn với IME.

## Quyết định

### Máy trạng thái input (`InputMachine`)

Máy trạng thái thuần, sự kiện vào/hiệu ứng ra, đồng hồ được inject. Bốn phase (plain / adjudicating / claimed / submitting). Trạng thái lệnh **không bao giờ suy ra từ draft**, được đường pick thiết lập tường minh tại các thời điểm rời rạc; claim được canh giữ bởi `draft.startsWith(token)`, backspace phá vỡ thì tự động release; hình dạng claim `{token, hint?}` (hint dùng cho ghost text).

Mặt sự kiện (`dispatch(ev)` là cổng ghi duy nhất, mỗi sự kiện một transaction):

- `draft-changed {draft, editRange?}` — toàn bộ draft của textarea; editRange thu hẹp phép tính dịch chuyển occurrence, mặc định quét cả tiền tố và hậu tố.
- `newline {selection}` — xuống dòng Ctrl+Enter (không qua execCommand của trình duyệt: dưới undo tự quản, ghi của trình duyệt sẽ phân nhánh thành hai lịch sử).
- `begin-command {claim, span}` / `insert-ref {reference, span}` / `consume-token {guard}` — phía máy của ba sự kiện bail; span CAS = draftRev bằng nhau.
- `set-invalid {invalidIds}` — bit style của kết quả owner resolution (không phải transaction).
- `undo` / `redo` — transaction log tự quản (bộ đệm vòng dung lượng 100; gõ từng ký tự gộp theo cửa sổ đồng hồ inject; submit thành công thì xóa log).
- `paste-begin {text, selection, components?, generation?}` — dán + khớp component đồng bộ theo snapshot nóng trong cùng transaction (Undo một lần về trước khi dán); mở PasteMatchAttempt.
- `paste-upgrade {attemptId, span, reference}` — khớp bất đồng bộ nâng cấp thành transaction độc lập (Undo hai đoạn); attempt giữ nguyên current, insertedRange co lại theo nâng cấp.
- `invalidate-paste` — cử chỉ kết thúc attempt quan sát được ở tầng DOM (thao tác caret/selection v.v.).
- `enter {mode}` / `adjudicated` / `adjudication-failed` / `submit-settled` / `release` — mặt bằng transaction submit: SubmitAttempt (seq + AbortSignal) chống ghi ngược, commit thành công thì xóa draft, thất bại có guard chống trôi để rollback (khi Enter, snapshot chỉ điền lại nếu live draft vẫn bằng nó; nếu người dùng đã gõ tiếp thì chỉ phát notice).

Mặt hiệu ứng (shell thực thi): `adjudicate` (gọi InputTriggerController.adjudicate), `begin-submit` (transaction claim.submit), `default-sink` (message thường, hub điều phối), `notice`.

Bảng occurrence và ba phép chiếu chip:

- Mỗi tham chiếu chiếm một `U+FFFC` trong draft; mục bảng `{occurrenceId, source, ref, offset, label, clipboardText, invalid?}`; chip cùng tên độc lập nhờ occurrenceId.
- Mọi chỉnh sửa cập nhật draft và bảng trong cùng transaction: dịch chuyển vùng; xóa/thay thế giao với placeholder tác động lên toàn bộ đơn vị.
- Placeholder một ký tự khiến phần lớn tính nguyên tử của bàn phím thành tự nhiên (caret không có vị trí bên trong; Backspace/phím mũi tên/Shift mở rộng vùng chọn tự nhiên đã là toàn bộ đơn vị); click chuột vào chip do backdrop bắt trúng → setSelectionRange cho toàn bộ đơn vị.
- Phép chiếu thị giác = label: backdrop render chip tại offset của placeholder (glyph textarea vô hình), invalid dùng style báo lỗi.
- Phép chiếu clipboard/persist = clipboardText: copy/cut mở rộng placeholder trong vùng chọn; mirror persist của draft ghi cùng phép chiếu này (trong chat store luôn là text thường, ngữ nghĩa seed khi refresh = chọn hết copy → mở lại → paste, chip hạ cấp thành text qua các lần refresh).
- Phép chiếu model = khi submit, sinh từng đơn vị qua `codec.serialize` của source (thuộc signal và guard chống cũ của submit attempt; owner thiếu/lỗi/hủy thì không gửi, không hạ cấp thành `/name`).

### Viết lại input xuyên plugin: ba sự kiện scoped bail

Quy ước khai báo trong ui-input-trigger (phụ thuộc tầng thấp nhất), bên sản xuất phân phối qua `sctx.bail(sctx, ...)`, phía tiêu thụ duy nhất là ba listener mà hub gắn vào sctx khi dựng shell; trả về `true` ⟺ máy đã qua phase + guard CAS và thực sự viết lại (phát sự kiện ≠ sửa đổi thành công, việc Space có `preventDefault` hay không lấy giá trị trả về làm chuẩn):

- `slash/input-begin-command` `{claim, span}` — điền lại claim lệnh do menu pick / phán quyết Space quyết định (do InputTriggerController phân phối).
- `slash/input-insert-reference` `{reference, span}` — chèn chip tham chiếu (do InputTriggerController phân phối).
- `slash/input-consume-token` `{guard: span | bare-token}` — tiêu thụ token lệnh sau khi nghiệp vụ thành công (mặt bằng lệnh downstream phân phối).

Lệnh gọi không sự kiện hóa (đăng ký registry → gọi tường minh → await): draft/submit của chính Input, phán quyết bất đồng bộ của Enter, reference serializer, paste matcher bất đồng bộ. `@mode bail` đã vào cổng JSDoc parser và cordis catalog (scripts/jsdoc.ts).

### Pipeline slash (ui-input-trigger: `InputTriggerService` gốc + `InputTriggerController` mỗi session)

Pipeline trigger/menu/pick không có tri thức gì về "lệnh":

- Service chỉ có registry source (`InputTriggerSource{trigger: '/'|'@', name, order?, candidates, onPick, matchSpace?, matchEnter?}`; (trigger,name) là duy nhất; `order` tùy chọn để sắp thứ tự roster — nhỏ hơn thì đứng trước, mặc định 0, cùng giá trị giữ thứ tự đăng ký — roster đã sắp thứ tự vừa là thứ tự nhóm vừa là thứ tự vòng lặp) và `sessionOf(sctx)`. Có hook match tức là khai báo tham gia phán quyết space/enter; pipeline vòng lặp theo thứ tự roster, đáp ứng đầu tiên khác undefined thắng, không ai nhận thì rơi vào default sink. matchSpace đồng bộ (space kích hoạt trong lúc gõ phím, chỉ cho phép cache nóng); matchEnter bất đồng bộ (có thể await để source tự làm nóng, làm nóng thất bại thì reject).
- Controller giữ hit thẩm quyền duy nhất (gồm span; giữ lại cho Space sau khi menu đóng), menu store theo từng session, generation fetch ứng viên, phân xử bàn phím (chế độ combobox: focus luôn ở textarea, ↑↓/Enter/Escape bị chặn và toàn trình có guard composition IME, ngoại lệ duy nhất Shift+Enter luôn được ưu tiên vô điều kiện), và điều phối pick (outcome → tự phân phối sự kiện bail). `toggleSource(name, syntheticHit)` là đường chrome launcher: nó dựa trên selection textarea của bên gọi, chỉ seed source tương ứng đã đăng ký, và phát `launcher = name` cho đến khi đóng; tracking kiểu gõ phím thông thường sẽ xóa launcher và khôi phục toàn bộ roster trigger. Cả hai đường render cùng một MenuView, và thực thi cùng một chuỗi `onPick`. Động từ `dismiss()` hậu thuẫn `onDismiss` do MenuView inject (con trỏ đặt ngoài menu và thẻ composer chứa nó thì đóng menu; MenuView còn địa phương hóa tiêu đề nhóm qua namespace locale `slash.menu`, và dùng `useAnchoredMaxHeight` của ui-primitives để thu chiều cao vào khoảng không gian viewport phía trên composer); mỗi phạm vi session khi sinh ra thực hiện một lần `warm(projection)` cho roster source, projection trong scope đó chỉ có sessionId ổn định, không có việc chuyển tiếp published/năng lực; disposer của scope tháo dỡ controller.
- Ranh giới từ khi phát hiện trigger (`user@host`, `/` trong URL không bao giờ trigger), phân tầng guard (plain: `/` mọi nơi + `@` trong dòng / claimed: `/` bị ức chế, `@` vẫn hoạt động / frozen: không gì cả) là lõi thuần đông cứng.

### hub / facade: vỏ thường trực và thực thể input session nghiêm ngặt

- hub (registry trigger/decoration + điều phối gửi) là phụ thuộc `ctx.get()` tùy chọn với service slash/command: khi không có ui-input-trigger/mặt bằng lệnh thì input vẫn thu/gửi bình thường, hạ cấp một cách mượt mà.
- Mỗi session thực thể chỉ có một `SessionInputShell` (facade), tạo và tháo dỡ theo phạm vi session; không có session thì không dựng input machine. `ConversationRoot` tự thân là vỏ thường trực `session-maybe`, giữ HeroShell, Workspace picker, composer stack và khung fallback chain. Nó luôn sở hữu cùng một scrollport và composer seat; khi session xuất hiện, header session nghiêm ngặt và body outlet độc lập lẫn nhau chỉ điền vào những vùng cố định này.
- composer bar là một slot entry `session-maybe` luôn render vô điều kiện: không có session thì cùng một InputBar render ở trạng thái lười (thiếu machine face, owner prop `disabled`), sau khi `connectWorkspace` trả về session blank thì cùng instance đó chuyển sang live — DOM textarea không tái tạo trong suốt chuyển đổi không session → blank và mọi lần lật phase sau đó; `ConversationRoot`, Hero và khung layout được giữ nguyên toàn trình.
- Điều kiện Hero của ConversationRoot là `sessionId === undefined || (composerPhase === 'blank' && (openState === 'open' || summaryBlank === true))`: session đã được xác minh là summary rỗng thì giữ Hero ở mọi open state, session chưa được xác minh thì vào settling trong lúc loading. Submit đầu tiên đồng bộ chuyển sang engaging, thất bại vẫn giữ composer và ngữ cảnh lỗi, không lùi về Hero blank; vị trí blank của sidebar chỉ lật false sau khi prompt được tiếp nhận thành công.
- Gửi thống nhất tại defaultSink của hub: xóa draft lạc quan xong chỉ đi qua `session.prompt` với `mode:'queue'` cố định (Web UI không có lối vào steer; `mode:'steer'` trên dây host không đi qua machine này); thất bại và live draft vẫn rỗng thì mới điền lại, người dùng đã gõ tiếp thì không ghi đè. Không tồn tại transaction Draft materialize hay attach.
- Khi blank Hero đổi Workspace, vỏ gọi `connectWorkspace`; khi session mục tiêu khác thì chuyển draft không rỗng từ shell hiện tại sang shell mục tiêu, rồi mở id mới, session blank cũ vẫn tồn tại nhưng không còn là current.
- Quy ước hai bit của Notifier: `dirty` (độ mới của snapshot, `ensureFresh` kéo về có thể xóa) và `notifyPending` (nợ thông báo, chỉ flush mới xóa) độc lập với nhau — kéo về không được nuốt push, đối tượng tầng dưới push cho subscriber (watchTransaction) phụ thuộc vào bảo đảm này.

### Tham chiếu văn bản thuần: text outcome và trang trí lexicon

Tham chiếu skill/@subagent không đi qua chuỗi placeholder + danh tính occurrence — quyết định tham chiếu văn bản thuần: pick chèn thẳng nguyên văn `/name ` `@name ` vào draft, hiển thị chip thuần suy diễn:

- PickOutcome thêm nhánh `{text}`; sự kiện scoped bail mới `slash/input-insert-text` `{text, span}` (theo cùng quy ước với ba sự kiện kia: CAS draftRev, trả về true ⟺ thực sự viết lại); facade.insertText đi qua setDraft nối chuỗi, máy không thay đổi gì.
- Source có hook tùy chọn `lexicon?(session)`: danh sách tên đồng bộ từ snapshot nóng, `undefined` = dữ liệu chưa nóng — không trang trí, không bao giờ trigger fetch (đường render giữ đồng bộ không side effect); hook tùy chọn cặp đôi `subscribeLexicon?(session, listener)` là kênh vô hiệu hóa khi danh sách tên vẫn thay đổi sau khi đã nóng (mục lục settle, con sinh/diệt). Controller gộp các danh sách tên vào store snapshot `lexicon` của chính nó (mỗi lần source thông báo là kéo lại); source đăng ký sau khi scope đã sinh ra được service broadcast cho controller đang sống, bổ sung warm và nhập vào danh sách tên.
- `decorations.scanTextRefs`: quét ranh giới từ trong draft (`/name`, `@name` ở đầu dòng/sau khoảng trắng, `x/name` không bao giờ khớp) đối chiếu danh sách tên, khớp thì đánh mark `.textRef` (backdrop chỉ highlight range thuần, giống hlToken); chỉnh sửa phá vỡ hình dạng khớp thì lần quét sau tự nhiên biến mất.
- Gửi đi là nguyên văn (không còn serialize thành `<skill>`); phía bong bóng MessageItem trang trí hai hình dạng (thẻ `<skill>` cũ + token văn bản thuần).
- Chuỗi occurrence/paste/serialize cũ vẫn giữ nguyên trên đĩa, chưa xóa (cộng thêm; xóa là một nhát dao riêng trong tương lai). Khả năng phản hồi của trang trí: InputBar dùng uSES subscribe lexicon source của shell, danh sách tên chỉ settle sau khi scope sinh ra và làm nóng sẽ trực tiếp thắp sáng token draft đã có sẵn, không cần tương tác menu hay re-render không liên quan.

### Đóng góp cấp phát dữ liệu theo từng session và mặt riêng bàn phím

- ui-conversation (hub kiêm bên đóng góp) cung cấp hook `'input'` (trạng thái máy + overlay queue) + prop `inputActions` (`setDraft`/`submit`, callback void ổn định) qua `sessions.provide`.
- Ranh giới công/tư: provide công khai chỉ đặt các thành viên từ vựng React. Mặt bằng lệnh bàn phím/DOM (track/arbitrate/space/undo/redo/paste/dismissPopup/bindMirror — giá trị trả về đồng bộ, ngữ nghĩa disposer) là độc quyền của InputBar, đi qua inject nội bộ gói của chính entry InputBar, không ra khỏi ranh giới plugin.

### Hệ thống slot

`conversation` tự thân là session-maybe; nội dung session và slot input composer của nó được giới hạn nghiêm ngặt cho session, Workspace picker của Hero giữ ở root. Đăng ký root render header outlet phía trên scrollport thường trực, render body outlet bên trong nó, trước composer seat thường trực. Các slot con đều do đăng ký conversation của ui-conversation khai báo:

- `conversation.session.header` (single) — breadcrumb, view tab và header action của session nghiêm ngặt phía trên scrollport thường trực.
- `conversation.session` (single) — view ring và draft mirror của session nghiêm ngặt bên trong scrollport thường trực. header và body chia sẻ cùng một chat store thuộc phạm vi session; khi id session đổi thì mỗi bên tự tái tạo.
- `conversation.composer.bar` (single) — slot của chính InputBar: InputBar là slot entry thật (tự đăng ký slot của riêng nó), là nội dung của composer chain fallback; không làm chain entry — vì single-select của chain sẽ tháo dỡ nó khi takeover, phá vỡ sự sống còn của DOM textarea.
- `conversation.input.overlay` — điểm neo lớp nổi trong thẻ input; bên đăng ký inject giải quyết controller theo từng session bằng sessionId của slot.
- `conversation.input.dock` — dải xếp chồng phía trên input (danh sách chỉ đọc hàng đợi của QueueDock nằm ở đây), có order định thứ tự.
- `conversation.composer.dock` — dải thống kê phía trên composer.
- `conversation.input.left` / `conversation.input.right` — vùng trái/phải của hàng công cụ.
- `conversation.input.plan` / `conversation.input.model` (single) — hai vị trí điều khiển có tên trong hàng công cụ; bar chỉ truyền `locked` (owner props), rỗng cho đến khi plugin sở hữu đăng ký, không có fallback chỗ trống. Chỗ plan chưa kích hoạt vẫn giữ rỗng, vì lối vào thuộc về Command source dùng chung; mục tiêu plan hợp lệ sẽ render nút trạng thái `Plan ×` ở trạng thái warn, hành động duy nhất của nó là `/plan off`.
- `conversation.hero.workspace` (root scope) — Workspace picker dùng chung cho không session / blank Hero; pick đi qua `connectWorkspace` để tái sử dụng hoặc tạo session blank mục tiêu, khi cần thì mang theo draft rồi chuyển current.

### Kỷ luật kiểm thử

Toàn bộ hành vi của máy trạng thái được phủ bằng unit test JS thuần (sự kiện vào theo chuỗi, assert trạng thái và hiệu ứng, không DOM trình duyệt); ma trận tương tác được test theo từng phép chiếu từng dòng. Chính yêu cầu này là nguyên nhân của việc phân tầng lõi thuần + vỏ service.

## Phương án thay thế đã cân nhắc

| Phương án bị loại | Lý do ngắn gọn |
|---|---|
| Trạng thái trung gian ActiveCommand / registry chế độ registerMode / suy trạng thái lệnh từ draft | claim được đường pick thiết lập tường minh — không bảng, không suy diễn |
| Đối tượng bindTarget/bindDraft nối trực tiếp | khớp nối ngược + singleton root cấu hình sai xuyên session; sự kiện scoped bail giữ đảo ngược phụ thuộc và định tuyến đúng cấu trúc |
| Thống nhất `slash/input-apply` hoặc sự kiện hóa toàn bộ | ba payload độc lập phủ đủ việc viết lại xuyên plugin; chuỗi bất đồng bộ giữ nguyên gọi tường minh dựa trên registry |
| contenteditable / cây văn bản phong phú | tương thích kém; textarea + U+FFFC + bảng occurrence phủ đủ mọi quy ước tương tác |
| Persist draft kép {text, occurrences} | mirror ghi phép chiếu clipboard không thêm khái niệm mới; chip hạ cấp qua các lần refresh chấp nhận được |
| Ngăn xếp undo textarea gốc | không đáng tin cậy dưới controlled + ghi theo chương trình; ngữ nghĩa undo hai đoạn của paste chỉ có thể tự quản |
| InputBar nhận gói 16 callback wiring | ma trận tiêu thụ chứng minh 11 thành viên là độc quyền InputBar, 1 thành viên chết; kênh chuẩn để component tự lấy, mặt bàn phím inject nội bộ gói |
| Phán quyết space cũng công nhận claim là lệnh kiểu thực thi ngay | tuyến phòng thủ chống kích hoạt nhầm: sau space cả dòng là prompt thường; side effect không thể hoàn tác chỉ có lối vào tường minh |
| Cơ chế trang trí tokenPattern chung | bản ghi occurrence có cấu trúc thay thế việc quét pattern |
| Select chỗ trống thường trực trên hàng công cụ | slot có tên giữ rỗng trước khi đăng ký; chỗ trống và triển khai thật xung đột là hai nguồn thật |
| Toggle Plan bật/tắt luôn hiển thị | lối vào đã thuộc Command source dùng chung; lối vào thứ hai sẽ biến chỗ trạng thái thành mode chrome thừa |
| Bộ component/controller menu dấu cộng thứ hai, hoặc thêm nhóm Add/File phía trên Command | sẽ lặp lại ứng viên bất đồng bộ, highlight bàn phím, giữ focus và trạng thái pick; nút dấu cộng chỉ là launcher lọc MenuView sẵn có theo source, và scope này không có năng lực file |
| Tham chiếu luôn dùng chip U+FFFC (đường cũ bị quyết định tham chiếu văn bản thuần thay thế) | văn bản thuần + trang trí suy diễn không trạng thái danh tính; nguyên văn chính là phép chiếu model, undo/clipboard không cần xử lý đặc biệt; chuỗi chip giữ lại cho các trường hợp cần tính nguyên tử không chia được |

## Hậu quả

- Một vỏ conversation thường trực đảm nhận không session/blank/active: không session → blank giữ ConversationRoot, Hero, Workspace picker phạm vi root, scrollport, composer seat, InputBar và textarea; chỉ header và body outlet của session nghiêm ngặt bắt đầu mang nội dung. Cùng một session blank → engaging/active cũng giữ InputBar và textarea. EmptyState và chuỗi intent controlled (`sessions.updateIntent`/`updatePendingPrompt`/`workspaces.sendSession`) bị xóa cùng bên tiêu thụ cuối cùng.
- Mặt input không có tri thức về lệnh + phụ thuộc tùy chọn: khi không có gói lệnh thì input thuần vẫn dùng được; tham chiếu `@` và tham chiếu skill tái sử dụng miễn phí cùng pipeline menu/pick. Cái giá là phán quyết space/enter là giao thức vòng lặp theo từng source, ngữ nghĩa đáp ứng của nó (đồng bộ/bất đồng bộ, ý nghĩa của undefined) là quy ước đông cứng.
- Việc transaction hóa submit (attempt seq + guard chống trôi) khiến ba loại lỗi — ghi ngược kết quả đến muộn, đổi session, replay concurrent — trở nên bất khả thi về mặt cấu trúc, được ma trận test chốt lại.
- Nợ đã biết: độ trung thực của chip qua các lần refresh (có thể tái sử dụng khớp paste) chưa lên dự án; biểu diễn model của tham chiếu subagent chờ lên dự án nghiệp vụ.
