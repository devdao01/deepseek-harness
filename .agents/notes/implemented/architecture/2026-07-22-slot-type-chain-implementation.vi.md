# Agent Note: Chuẩn hệ thống slot — register đơn nhất, bốn phần props và ghế store của framework

Status: implemented

[English](2026-07-22-slot-type-chain-implementation.md) | Tiếng Việt

> Phạm vi: thiết kế cuối cùng của hệ thống slot cho Web client — cách các plugin UI ghép trang lại, quyền render nằm ở đâu, props của component được định kiểu như thế nào, dữ liệu nghiệp vụ sống ở đâu. Bối cảnh xung quanh (chuỗi nạp, tầng đối tượng, service) thuộc về [RFC kiến trúc Web client](2026-07-19-gui-web-client-architecture.md), các mục về slot của RFC đó được chuyển giao cho tài liệu này.

## Vấn đề

Tại runtime, trang được ghép lại từ các plugin nạp độc lập với nhau, vì vậy UI cần một cơ chế kết hợp có thể trả lời bốn câu hỏi bằng sự cưỡng chế tĩnh (static). Ai được phép render vào một vùng nào đó — quyền này có được cưỡng chế thực thi hay chỉ dựa vào quy ước? Component làm sao vừa giữ được tính hàm thuần (pure function — không ctx, không import framework) vừa nhận được mọi thứ nó cần, mà không phải luồn tay từng giá trị qua code lắp ráp? Dữ liệu nghiệp vụ thời gian thực nên đặt ở đâu để cập nhật dạng stream chỉ render lại đúng những bên đăng ký, mà không buộc mỗi plugin phải tự dựng một cơ chế đăng ký riêng? Và có bao nhiêu phần trong tất cả những điều này có thể giao cho trình biên dịch kiểm tra, để component bị lệch, lời gọi render vượt quyền, hay store schema không khớp trở thành lỗi biên dịch tại một điểm gọi duy nhất có thể nhìn thấy, thay vì bất ngờ lúc runtime?

## Quyết định

Tóm gọn một câu: **shell chỉ render `'root'`; plugin ghép UI bằng đúng một lần gọi `register` — lần gọi này vừa chiếm slot, vừa khai báo và ủy quyền cho slot con, vừa khai báo store, vừa inject business face; component là hàm thuần, props đến theo bốn phần, mỗi phần được tự động suy ra từ một nguồn sự thật duy nhất của riêng nó.**

### 'root' là slot tiên nghiệm duy nhất

`SlotRegistry` (runtime của client) khai báo `'root'` ngay lúc khởi tạo — single/root, `owner: {}` — khai báo hợp nhất `SlotMap` của nó nằm trong package runtime. Toàn bộ việc lắp ráp của shell chỉ là `ctx.slots.renderSlot('root', {})`: điểm vào render duy nhất ở cấp ctx; truyền bất kỳ key nào khác, renderer chưa được cài đặt, hoặc root chưa ai đăng ký — đều fail to lên (không có fallback).

### `register` là API duy nhất; `children` = khai báo + ủy quyền + spec runtime

```ts ignore-check
ctx.slots.register({
  name: 'root',
  children: {
    'sidebar':      { kind: 'single', scope: 'root' },
    'conversation': { kind: 'single', scope: 'session' },
  },
  store: createLayoutStore,      // StoreHandle or factory (below)
  inject: injectFrame,           // business face (below)
}, AppFrame)
```

Không tồn tại một API định nghĩa slot riêng biệt. Đối tượng `children` làm hai việc cùng lúc: **khai báo slot con**, và **ủy quyền cho chính component này render chúng** — slot là một lỗ hổng trên cây render, nó tồn tại vì có ai đó muốn render vào đó, nên vòng đời của slot chính là vòng đời của entry đã khai báo nó (khi entry bị dispose (giải phóng tài nguyên), slot cũng biến mất theo, mọi đóng góp hiện có trong slot bị xóa sạch). Giá trị của `children` là spec runtime (`kind`/`scope` chi phối hình thái lặp của outlet và cách chọn binding; `SlotMap` là kiểu thuần túy, bị xóa lúc runtime — đây chính là lý do vì sao dạng mảng key không hoạt động), và được đối chiếu kiểm tra tĩnh với entry `SlotMap` tương ứng — kiểu và giá trị được khai báo cùng một điểm, kiểm tra chéo lẫn nhau.

Nguyên tắc đối xứng: **entry khai báo slot con nắm độc quyền render các slot con đó**, tất cả được xác định ngay lúc `register` (lỗi cấu hình sẽ fail rõ ràng lúc nạp; đường nóng của render không còn phải kiểm tra lại). Các trường hợp nổ ngay lúc nạp: entry thứ hai khai báo một slot đã được khai báo rồi; `register` vào một slot chưa được khai báo; cùng một handle store được gắn vào hai scope khác nhau; đăng ký chain thiếu `select`.

Các bên đóng góp có thứ tự kích hoạt độc lập với entry khai báo sử dụng `ctx.slots.inject(key, callback)`, và việc gọi trực tiếp `register()` vẫn tiếp tục fail to. Vòng đời riêng của khai báo, bên đóng góp, thay thế và thất bại được quy định trong [quyết định inject khai báo slot](2026-08-05-slot-declaration-injection.md).

Khai báo hợp nhất `SlotMap` vẫn là thẩm quyền về kiểu, và mỗi entry chỉ khai báo trục của riêng mình cộng với **phần owner** — props do bên đăng ký inject vào không bao giờ đi vào bảng toàn cục ("ai inject thì kiểu thuộc về người đó").

### Props của component: bốn phần, mỗi phần có một nguồn sự thật duy nhất

| Phần | Kiểu | Nguồn sự thật | Nội dung |
|---|---|---|---|
| Runtime | `PropsRuntime<K>` | Entry SlotMap tương ứng với K | `OwnerOf<K>` (tham số truyền tại chỗ render) + bộ chuẩn `useSession`/`sessionId` cho session scope + `useSessions`/`useWorkspaces` toàn cục |
| Render slot con | `PropsRenderSlots<S>` | Tập key `children` của register | `renderSlot(key, owner)`, tham số key được thu hẹp tĩnh về S; key chain có thêm `renderSlotChain` |
| store | `PropsStore<H>` | Kiểu trả về của store factory | hook selector `useStore` + `actions.*` (đã lột bỏ tham số draft) |
| Nghiệp vụ | `I` | Kiểu trả về của inject | Dữ liệu thường + callback; trong vùng `hooks` được giữ riêng, observable trần sau khi bind sẽ đến dưới dạng hook selector `use<Name>` (`InjectFace<I>`) |

Bất cứ nơi nào khai báo `scope: 'session'`, `sessionId` luôn do framework cung cấp — tham số owner không mang nó. Điểm gọi `register` là nơi khép lại của ràng buộc kiểu kép: tập key renderSlot của component vượt quá khai báo `children`, thiếu tiếp nhận một face đã khai báo, hình dạng store/inject bị lệch — bất kỳ điều nào trong số đó cũng báo lỗi biên dịch ngay tại dòng đó. Ủy quyền lại chỉ là truyền props bình thường (đưa hàm `renderSlot` xuống, có thể bọc thêm một chữ ký hẹp hơn nếu cần) — không tồn tại đối tượng face dạng whitelist, cũng không tồn tại API đúc face.

### chain kind: entry tự đề cử, mục khớp đầu tiên chịu trách nhiệm render

`SlotKind` thứ tư — `'chain'` — đảo ngược quyền định tuyến so với `keyed`: nơi phân phối của keyed chọn entry chiếm slot bằng `entryKey`, còn chain thì để entry tự đề cử — owner chỉ phân phối một bộ owner props có định dạng thống nhất, không bao giờ biết ai sẽ tiếp nhận, và gói tiếp nhận mới đăng ký vào mà owner không phải thay đổi gì. Đăng ký chain mang theo một selector thuần `select` (`ChainSelect<O, M>`: `(owner) => matched | null`) và `priority` tùy chọn (tăng dần; cùng giá trị thì giữ thứ tự đăng ký = thứ tự lắp ráp — topology inject có thể kiểm soát khi triển khai — tái dùng cùng kiểu sắp xếp ổn định với `order` của list); đăng ký thiếu `select` chính là một trong các trường hợp nổ ngay lúc nạp nêu trên. Lúc render, outlet thực thi lần lượt từng `select` theo thứ tự chain: giá trị trả về khác null đầu tiên được chọn, giá trị đó được gộp vào props của component dưới tên `matched` (component không bao giờ tự suy lại việc khớp); trả về `null` thì chuyển sang entry tiếp theo; toàn bộ null thì render phần fallback của owner (`ChainRenderOpts`).

Quyết định "không nhận" nằm trong `select`, tuyệt đối không phải là component tự dò props sau khi đã mount: để render null, component vẫn phải mount trước, hook và effect của nó chạy hoàn toàn vô ích, kèm theo đó là hiện tượng rung mount/unmount phá vỡ memo hóa và ngữ nghĩa React key; trong khi đó selector là hàm thuần — có thể unit test, không có side effect khi mount — cùng một kỷ luật với "presentation methods are pure functions of `args`". Thuần, chính là quy ước của selector: không đọc trạng thái mutable bên ngoài, không tạo side effect, nên quyết định định tuyến hoàn toàn là hàm của owner props, mỗi lần phân phối đều có thể thực thi an toàn. Selector chỉ làm việc định tuyến, tuyệt đối không tạo đối tượng mới — dựng đối tượng mới mỗi lần phân phối sẽ khiến reference đổi mới ở mỗi lần render; việc bọc giá trị khớp thành một face phong phú hơn diễn ra bên trong component được chọn (`useMemo` phụ thuộc vào `matched`).

Trên chuỗi kiểu, hình dạng SlotMap của chain entry là `{ kind: 'chain'; scope; owner }`, `owner` chính là "đồng tiền chung" của chain; `M` — kiểu của prop `matched` — được suy ra từ giá trị trả về của select (khi selector thu hẹp thành viên union, kiểu `matched` tự động thu hẹp theo); và vị trí component không tham gia vào việc suy luận `M`, cùng gốc với quyết định NoInfer ghim phần inject (xem quyết định bên dưới). Về phía owner, `renderSlotChain(key, owner, { fallback })` ở cùng phần `PropsRenderSlots` với `renderSlot`, miền key của nó được thu hẹp tĩnh về các key kind chain trong khai báo `children` của entry này (`ChainKeysOf`); nơi phân phối chỉ có một dòng, không chứa bất kỳ logic dẫn xuất hay định tuyến riêng nào.

### Ghế store: engine thuộc về framework, schema thuộc về bên đăng ký

Framework chỉ sở hữu duy nhất một cơ chế đăng ký (subscription): engine store dạng snapshot (zustand vanilla + immer + tùy chọn persist localStorage) nằm trong **package runtime** (export chính `./client` — không có sub-path), tạo ra các nguồn observable trần; web-react tại outlet sẽ bind chúng thành hook (bind uSES được cache theo nguồn). *Nội dung* bên trong store là khai báo của bên đăng ký, và bắt buộc phải viết dưới dạng hàm factory, để handle cấp module hoàn toàn không thể tồn tại (handle cấp module sẽ trở thành singleton trên thực tế sống sót qua các lần reload xuyên plugin):

```ts ignore-check
export function createChatStore() {
  return defineStore({
    init: () => ({ selection: null as SelectionTarget | null, draft: '' }),
    persist: 'dsh.conversation.chat',
    actions: {
      select:    (d, t: SelectionTarget) => { d.selection = t },
      clearDraft:(d) => { d.draft = '' },
    },
  })
}
```

Một factory, ba điểm tiêu thụ: (1) `register` — nếu store độc quyền thì truyền thẳng factory; muốn chia sẻ instance thì gọi factory một lần trong `apply`, rồi truyền cùng một handle cho nhiều lần `register` (chia sẻ construction xuyên plugin là bất khả thi về mặt cấu trúc: handle không bao giờ ra khỏi package); (2) `PropsStore<ReturnType<typeof createChatStore>>` suy ra phần store của component, không cần viết tay thành viên nào; (3) test tự gọi factory và `.create()` ra instance engine thật, đưa `useSelector`/`actions` thẳng vào làm props — outlet ở production đi đúng con đường `create` đó, không tồn tại một cơ chế thứ hai.

Scope của store **được suy ra từ scope của entry nơi nó được mount** (session slot → mỗi session một instance, sinh diệt theo session; root slot → mỗi entry một instance). Đọc = `props.useStore`; ghi = chỉ qua `props.actions.*` — instance trần (có `update`/`set`) không bao giờ đến được component, các actions đã khai báo chính là API thay đổi đầy đủ và có thể kiểm toán. Code production không bao giờ gọi factory hay `create` ở ngoài `apply`.

### inject: bên đăng ký cung cấp interface nghiệp vụ qua ctx của chính mình

Factory inject chỉ nhận các tham số được ủy quyền theo khai báo của nó — session slot nhận `sessionId`, đã khai báo store thì nhận `actions` đã được bind sẵn, ngoài ra không có tham số — việc lấy service luôn đi qua **ctx của chính closure `apply`**, nên ranh giới năng lực chính là topology `inject` mà plugin này đã khai báo (cordis property proxy hoạt động tự nhiên; không tồn tại handle lắp ráp mang theo ctx rộng hơn). Giá trị trả về là dữ liệu thường và callback, cộng thêm nhiều nhất là ô khóa dành riêng `hooks`: một bảng các nguồn observable trần (getSnapshot+subscribe), renderer sẽ bind mỗi source thành hook selector `use<Name>` trước khi business face đến được component — tức là bản song sinh riêng của bên đăng ký với ô `hooks` trên kênh provide, dành cho những sự thật phản ứng (reactive) quá đặc thù, không đáng đưa vào bộ chuẩn toàn cục (notices/lexicon của composer, dòng điều hướng settings). Component không bao giờ nhận được source trần, nên code nghiệp vụ vẫn không chứa cơ chế đăng ký. Phần còn lại vẫn bình thường: face đọc/ghi thu hẹp cho service riêng của plugin này, điều phối xuyên service (ví dụ `send` = `actions.clearDraft()` + `ctx.conversation.send(...)`), và side effect lắp ráp theo từng (entry×session). Không được viết tay hook, không được sinh ra ReactNode, cũng không được truyền cả object service — chính việc thu hẹp là giá trị: component có thể làm gì được khoanh vùng đúng bằng hình dạng của giá trị trả về từ factory.

### Kỷ luật ranh giới dữ liệu

Chỉ framework mới được tạo hook: năm ghế `useSession`, `useSessions`, `useWorkspaces`, `useStore`, `renderSlot`, cộng với các hook được bind ra từ đóng góp provide và ô `hooks` của inject — tất cả đều xuất phát từ cùng một cỗ máy bind của renderer; code nghiệp vụ giữa component cha và con chỉ truyền dữ liệu thường và callback (hook hành vi mà component tự dùng nội bộ, không đăng ký bất kỳ nguồn dữ liệu ngoài nào, không nằm trong giới hạn này). Dữ liệu sống chỉ có đúng ba kênh: cái mà cha biết, được truyền vào dưới dạng owner props tại nơi gọi renderSlot; cái chỉ component tự biết, là local state; cái cần chia sẻ xuyên entry hoặc sống sót qua nhiều lần remount, là store đã khai báo. Dẫn xuất là hàm thuần (`useMemo`) áp lên dữ liệu từ hook của framework, tuyệt đối không tự tạo thành một đường đăng ký riêng.

### Ngữ cảnh trên cây và quy ước của renderer

`SessionProvider` là component của framework, **được đưa tới dưới dạng ghế chuẩn**: entry đã khai báo slot session scope trong `children` nhận nó qua prop (kiểu nằm trong ui-slots, giá trị do renderer inject) — component không bao giờ import giá trị của nó. Nó tự đấu dây bởi framework (bên trong tự đọc trạng thái session hiện tại của runtime, bên lắp ráp không truyền tham số nào), có dạng render-prop — `children(sessionId)` cộng thêm nhánh `empty`, remount bằng `key={sessionId}`. `BindingContext` thuộc về nội bộ cơ chế; số React Context mà component nghiệp vụ nhìn thấy được là bằng không. Factory inject cố ý được thực thi bên trong outlet (error boundary theo từng entry chặn được chúng; bên đăng ký bị crash chỉ làm đen ô của chính nó, còn lỗi lắp ráp thì được ném lại (rethrow)); outlet đọc ngữ cảnh trên cây như một tham số ngầm chỉ dành cho cơ chế của framework — tức là sự phân công "danh tính đến từ closure `register`, hiện trường đến từ vị trí trên cây".

Việc render nằm sau một quy ước cài đặt, nên runtime không phụ thuộc vào React: `SlotRenderer` (interface nằm trong ui-slots, phần triển khai `createSlotRenderer()` nằm trong web-react) được cài đặt đúng một lần qua `ctx.slots.install(...)` lúc shell boot; cài đặt hai lần hoặc render trước khi cài đặt đều throw. Sổ sách quy thuộc là một `Map<key, entry>` duy nhất bên trong service — sổ cái, slot, đóng góp, binding render, instance store, tất cả sinh diệt theo cùng một trục entry, nhờ đó cửa sổ thẩm quyền cũ (stale authority) khi reload xuyên plugin bị đóng lại về mặt cấu trúc (một `renderSlot` bị entry đã dispose bắt giữ, hễ vào là ném lỗi ủy quyền đã cũ (stale-authorization)).

### Các quyết định triển khai trên chuỗi kiểu

Hai quyết định đã được chốt cứng trong chữ ký `register` tồn tại vì phương án thay thế hiển nhiên sẽ thất bại theo cách cụ thể, có thể tái hiện; người sửa đổi trong tương lai không nên tranh luận lại chúng:

1. **Vị trí đăng ký dùng `SlotComponent<P>` (chữ ký gọi trần) thay vì `FC<P>`.** `FC` của React mang theo các field tĩnh (`propTypes`, `defaultProps`), kiểu của chúng tham chiếu `P` ở vị trí hiệp biến (covariant); kiểm tra khả năng gán giữa hai lần khởi tạo `FC` sẽ kiểm luôn các field tĩnh này, từ chối những component mà thiết kế vốn muốn chấp nhận. Chữ ký gọi trần chỉ đi qua kiểm tra nghịch biến (contravariant) sạch sẽ trên tham số; component vẫn là hàm bình thường.
2. **`NoInfer<I>` ghim việc suy luận phần nghiệp vụ vào đúng factory inject.** Nếu không có nó, TS vẫn sẽ thu thập ứng viên suy luận từ vị trí tham số của component, khiến component bị lệch (tiêu thụ một key mà factory không cung cấp) âm thầm mở rộng `I` cho đủ rộng để lời gọi qua được — đúng thứ mà chuỗi kiểu vốn muốn bắt lại lại bị nuốt mất. Spec mẫu âm (negative sample) ghim chặt điều này: nếu ngày sau `NoInfer` này bị "tiện tay đơn giản hóa" đi, vị trí expect-error sẽ là chỗ đỏ đầu tiên.

## Hệ quả

Từ nay quyền render có thể được cưỡng chế thực thi thay vì chỉ dựa vào quy ước: ai render cái gì là sự thật ở thời điểm nạp, audit cấu trúc UI = đọc hết các lời gọi `register`; với chain slot, "ai sẽ render" có thêm một lớp sự thật ở thời điểm render, nhưng selector ra quyết định đều là khai báo ngay tại chỗ `register`, nên phạm vi audit vẫn chỉ là các lời gọi `register`. Mỗi API props đều được suy ra tĩnh từ một nguồn sự thật duy nhất (entry SlotMap, tập key `children`, factory store, giá trị trả về của inject), thay đổi schema được trình biên dịch lan truyền chứ không dựa vào grep. Plugin không còn tự mang theo bất kỳ cơ chế đăng ký nào — vòng đời store (instance theo từng session, dispose, persist) là ngữ nghĩa của framework được ghim vào trục entry. Cái giá phải trả: option đăng ký dày đặc (object spec `children`); framework phải gánh một cỗ máy suy luận thực sự nặng (suy luận cùng lượt của init/actions trong `defineStore` có thể cần currying làm phương án dự phòng); khóa hai chiều ở thời điểm biên dịch nghĩa là độ lệch ở giai đoạn prototype trở thành lỗi cứng ngay lập tức, thay vì cảnh báo.

## Các phương án thay thế đã cân nhắc

| Rejected | One-line reason |
|---|---|
| API hai bước define/register tách rời | Tách ra khiến quyền render không thể cưỡng chế, gây ra bug về thứ tự thời gian; đưa `children` vào `register` giúp khai báo, ủy quyền, spec kết thúc gọn tại một điểm nhìn thấy được |
| Đối tượng face dạng whitelist (`ScopedSlots` + trợ giúp thu hẹp) | Whitelist đã nằm trong kiểu props của component, đối tượng đó có thể được suy ra bằng máy móc; một đối tượng face có thể đúc (cast) là một bộ API thẩm quyền thứ ba, và chỉ được kiểm tra lúc runtime |
| Handle lắp ráp mang root ctx vào inject | Vòng qua topology inject đã khai báo — mọi factory đều chạm được tới mọi service, khai báo dependency trong package.json mất hết ý nghĩa |
| `children` dùng dạng mảng key | kind/scope là dữ liệu phân phối lúc runtime; `SlotMap` đã bị xóa, dạng mảng tất yếu buộc phải có một API đăng ký spec thứ hai — API định nghĩa sống lại |
| Nghiệp vụ tự tạo hook / truyền observable trần trong props của component | Mỗi plugin sẽ tự biến thành một cỗ máy đăng ký riêng; ô `hooks` của inject để cùng một sự thật đi qua đúng một cỗ máy bind có thể kiểm toán |
| Handle store cấp module | Handle cấp module là singleton xuyên suốt các lần reload plugin và xuyên các test case; dạng factory khoanh danh tính vào trong đúng một lần gọi apply/test |
| Component nhận trực tiếp instance store | Code render có thể dùng `update`/`set`, API thay đổi trở nên không thể audit; các actions đã khai báo giữ cho "cái gì có thể thay đổi" luôn là sự thật tại chỗ `register` |
| Vị trí đăng ký dùng `FC` / suy luận `I` từ phía component | Field tĩnh của FC sinh nhiễu hiệp biến, từ chối component hợp lệ; suy luận phía component âm thầm nuốt mất độ lệch props (xem quyết định ở trên) |
| Tiếp nhận slot bằng phân phối keyed + định tuyến phía owner | owner sẽ liên tục tích tụ các quy ước theo từng entry và bảng định tuyến hard-code (mỗi kiểu tiếp nhận một cặp `find` + `entryKey`); "đồng tiền chung" chain giúp đăng ký tiếp nhận mới mà owner không phải thay đổi gì |
| Component dựa vào render null để biểu thị không nhận | Không nhận cũng phải mount trước — hook và effect chạy vô ích, rung mount/unmount phá vỡ memo hóa và ngữ nghĩa key; selector thuần có thể phán quyết mà không cần instance component |
