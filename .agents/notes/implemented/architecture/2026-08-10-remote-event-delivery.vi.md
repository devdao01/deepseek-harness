# Agent Note: Truyền phát sự kiện Remote (ctx.remote.$on)

Status: implemented

[English](2026-08-10-remote-event-delivery.md) | 中文

## Vấn đề

[Gọi phương thức Typert Remote](../../implemented/architecture/2026-08-02-typert-remote-method-calls.md) chỉ bao phủ lời gọi định hướng kiểu "một request một kết quả", cố tình để lại luồng sự kiện Session và tương tác có trạng thái ở nơi khác; **đẩy sự kiện một chiều** từ Host tới bên tiêu thụ do đó vẫn hoàn toàn dồn lên API Proxy kiểu cũ.

Host sở hữu năm sự kiện một chiều: `agent-preset/selected`, `commands/change`, `credentials/updated`, `llm/adapters-updated`, `settings/document-updated`; chúng không phụ thuộc AgentScope, và payload vốn đã là JSON. Trước đây mỗi sự kiện phải đi qua sự kiện host cordis, frame viết tay của apiproxy, cầu nối viết tay của client/runtime và alias sự kiện Client mới tới được UI, trong khi các tầng này không nêu ra sự thật mới nào ngoài sự kiện chủ sở hữu (owner event).

Việc khai báo lặp lại đó còn **có tổn hại**: phía client viết thành `settings/changed(ns: string)`, kiểu brand ở bước nhảy này bị làm phẳng thành `string` trần, ngược lại với quy ước sẵn có ở phía phương thức Remote là "kiểu ở phía tiêu thụ trỏ tới đúng symbol duy nhất của gói nghiệp vụ".

## Quyết định

Mặt Remote phía tiêu thụ giữ một động từ đăng ký sự kiện một chiều `ctx.remote.$on(event, listener)`; **do danh sách điều khiển, chuyển tiếp nguyên trạng**:

- `packages/api/remotes/src/remote-events.ts` giữ một danh sách tên sự kiện host có thể chuyển tiếp, đồng thời là điểm kiểm soát duy nhất cho "phía tiêu thụ có thể đăng ký cái gì". `src/types.ts` bên cạnh nó suy ra hình chiếu kiểu (type projection) từ danh sách đó và điền vào chỗ selection, giữ thuần kiểu (pure type) theo đúng quy ước gói. **Cả hai file đều được liệt kê đồng thời trong `files` của cả hai face host và client của gói này**, cả hai phía đọc cùng một bản.
- Tên sự kiện trên wire **chính là tên sự kiện gốc của host cordis** (`settings/document-updated`), không thêm tiền tố `host/`; payload **chính là danh sách tham số thực tế của host**, đi qua JSON nguyên trạng từng phần tử, không hình chiếu, không ẩn danh hóa (desensitize), không đổi tên.
- Carrier (vật mang) **ký sinh vào luồng host hiện có**: `HostFrame` thêm một frame bao `host/remote-event`, không mở thêm kênh xuống mới.
- **Chữ ký (signature)** sự kiện không lập bảng riêng: gói chủ sở hữu chuyển khai báo `Events` cordis của mình vào lối xuất kiểu thuần (pure type export) `./types` an toàn cho client, cả hai phía đọc **cùng một bản** — kiểu listener của `$on` chính là `Events[Event]`. "Nguyên trạng" không cần chứng minh, nó đúng theo cấu trúc (constructively).
- Nhưng **chỉ mượn hình dạng kiểu của cordis, không nối vào hệ thống sự kiện của cordis**: ngữ nghĩa truyền phát, registry, xử lý ngoại lệ đều do Typert tự đảm nhận.

Nếu một mục `Events` có chữ ký chạm tới symbol chỉ-có-ở-host (Service, `Agent`, Context, v.v.), cách xử lý là **tách mã cho tới khi nó có thể nằm gọn trong `./types`**; không chấp nhận khai báo bị chia đôi kiểu "một nửa ở lại index, một nửa dời đi", cũng không chấp nhận tạo kiểu bóng (shadow type) tương đương cấu trúc trong `./types`. Năm gói này đều không cần tách: các mục của chúng chỉ chạm tới kiểu thuần. agent-presets đổi tên module từ vựng gốc thành `preset.ts`, để `types.ts` xuất ra chuyên trách chứa khai báo sự kiện an toàn cho client.

Cả năm sự kiện đều đi theo đường này, frame chuyên dụng và alias Client đều đã bị xóa. Bên tiêu thụ model đăng ký trực tiếp `llm/adapters-updated` và `settings/document-updated`; bên tiêu thụ preset đăng ký `agent-preset/selected`. Dữ liệu thực sự cần hình chiếu hoặc khử trùng lặp vẫn giữ frame chuyên dụng.

`skills/change`, `tools/change`, `system-prompt/change` là các sự kiện làm mất hiệu lực thuần túy có cùng hình dạng nhưng hiện **không có bất kỳ bên tiêu thụ nào**, theo nguyên tắc "mỗi phần trừu tượng đều phải có chủ sở hữu hiện tại và nhu cầu hiện tại" nên không đưa vào danh sách, chỉ ghi lại ở đây như một chỗ mở rộng.

### Quy ước phía tiêu thụ (dsh-typert-protocol)

type-meta thêm một **vị từ hình dạng (shape predicate)**, một **chỗ selection**, và **một** thành viên của `TypertClientRemote`; không có mã runtime nào:

```ts
import type { Events } from '@deepseek-ai/cordis'

/** Cordis events shaped for one-way remote delivery: no Scope binding, void return. */
export type TypertForwardableEvent = {
  [Event in keyof Events]: unknown extends ThisParameterType<Events[Event]>
    ? ReturnType<Events[Event]> extends void ? Event : never
    : never
}[keyof Events]

/** The Host assembly's forwarding selection; api/remotes' allowlist fills it, no other package does. */
export interface TypertRemoteEventSelection {}

/** `$on`'s legal keys: selected, and present in the current compilation face. */
export type TypertRemoteEvent = Extract<keyof Events, keyof TypertRemoteEventSelection>
```

```ts ignore-check
/** Subscribe to one forwarded Host event; the returned disposer belongs to the calling fiber. */
$on<Event extends TypertRemoteEvent>(event: Event, listener: Events[Event]): () => void
```

`Events` được phân giải theo từng chương trình: trong chương trình host là toàn tập sự kiện host, trong chương trình client là những sự kiện mà mặt biên dịch (compilation face) client nhìn thấy được — cùng một vị từ tự thành lập ở cả hai phía, không cần kéo khai báo host vào client.

**Quy ước tách riêng động từ tiêu thụ và bàn giao carrier**: bên tiêu thụ dùng `$on` để đăng ký, bên đang giữ sink frame host dùng `$dispatch` để giao frame đã giải mã vào. Nó **không thể** là một hàm cấp module xuyên plugin: cổng chặn (gate) độ thuần (purity) của client bundle (`packages/client/tsdown.client.ts`) chỉ cho qua ba loại import giá trị: `CLIENT_EXTERNALS`, tầng quy ước wire `INLINE_SAFE`, và sản phẩm sinh ra `/remote`; còn nếu vòng qua bằng inline sẽ khiến `ClientRemoteService` bị sao chép thêm một bản vào runtime bundle, làm `instanceof` luôn sai. Phương thức dịch vụ cordis chính là hình thái hợp tác mà cổng chặn này quy định:

```ts ignore-check
$dispatch(event: string, args: readonly unknown[]): void
```

client/runtime đang giữ sink frame host gọi trực tiếp nó, frame không qua trung chuyển sự kiện mà đến thẳng bảng đăng ký. Tham số hình thức `event` là `string` chứ không phải `TypertRemoteEvent`: đây là ranh giới wire, nhận được tên không ai đăng ký thì âm thầm bỏ qua.

Ngữ nghĩa truyền phát không dùng chung triển khai với hệ thống sự kiện cordis: chỉ có truyền phát một chiều, không có mô hình waterfall / bail / parallel / serial, cũng không có khái niệm `@mode` (`ReturnType extends void` là biểu đạt tĩnh của kỷ luật này); không gắn `this`; không có `EventOptions`, `prepend`, độ ưu tiên; gọi lần lượt theo thứ tự đăng ký, một listener ném lỗi sẽ bị cô lập tại chỗ và ghi log — nó tuyệt đối không được kéo sập bơm frame (frame pump) (theo đúng cách xử lý ngoại lệ sink sẵn có của `ConnectionController`).

### Danh sách: cùng một khai báo được hai face đọc chung

`packages/api/remotes/src/remote-events.ts` được liệt kê đồng thời trong `files` của cả `tsconfig.host.json` và `tsconfig.client.json`, là **nhà duy nhất** của danh sách; `src/types.ts` suy ra mặt kiểu (type face) từ nó:

```ts
// remote-events.ts — the value
export const API_REMOTE_FORWARDED_EVENTS = [
  'agent-preset/selected',
  'commands/change',
  'credentials/updated',
  'llm/adapters-updated',
  'settings/document-updated',
] as const

// types.ts — the type face, derived
export type ApiRemoteForwardedEvent = typeof API_REMOTE_FORWARDED_EVENTS[number]

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends Record<ApiRemoteForwardedEvent, true> {}
}
```

Nhờ vậy **thêm một sự kiện chỉ cần sửa đúng một dòng mảng này**: hình chiếu kiểu, mặt khóa (key face) của `$on`, vòng lặp chuyển tiếp của host đều được suy ra từ nó. `ctx.remote.$on('slots/changed', …)` (sự kiện cục bộ của client) hay `$on('skills/change', …)` (chưa mở trong danh sách) đều là **lỗi biên dịch**.

Nửa phía host thêm một khẳng định hình dạng nữa, đặt ràng buộc của từ vựng sự kiện host lên đúng danh sách này:

```ts ignore-check
API_REMOTE_FORWARDED_EVENTS satisfies readonly TypertForwardableEvent[]
```

Viết thành câu lệnh biểu thức (expression statement) thay vì hằng số có tên: cách sau sẽ bị `noUnusedLocals` coi là chưa dùng (tiền tố gạch dưới chỉ miễn trừ cho tham số). Nó chặn ba việc: **tên hợp lệ** (vị từ lấy `keyof Events` làm nền), **không gắn Scope** (họ `ThisParameterType` của nhóm `goal/changed` không phải `unknown`, bị loại trừ — biểu đạt tĩnh của "không phụ thuộc AgentScope"), **một chiều** (hình dạng waterfall/bail có kiểu trả về khác `void` bị loại trừ).

**"Nguyên trạng" không được chứng minh ở bất cứ đâu, mà đúng theo cấu trúc**: kiểu listener của `$on` lấy từ chính bản khai báo `Events` cordis trong `./types` của gói chủ sở hữu, việc chuyển tiếp phía host đọc đúng bản đó, không tồn tại bản khai báo thứ hai có thể lệch nhau.

Payload an toàn JSON (JSON-safe) được giao cho runtime kiểm tra: apiproxy dùng `isJsonValue` của `dsh-session` để kiểm tra từng phần tử trước khi chuyển tiếp, không đạt thì **ném lỗi ồn ào (fail loud)** (đây là lỗi cấu hình danh sách, không phải input bên ngoài).

### Giao thức wire (apiproxy)

```ts ignore-check
| { type: 'host/remote-event'; event: string; args: JsonValue[] }
```

Phía zod dùng `args: z.array(z.unknown())`: bản thân frame đến từ `JSON.parse`, các phần tử chắc chắn đã là giá trị JSON, quy ước cấu trúc do khai báo `Events` của gói chủ sở hữu đảm nhận — cùng tư thế (posture) với `value` của frame `session/projection` sẵn có.

`events.host()` khi mở sẽ gắn listener theo danh sách; mỗi luồng tự giữ disposer riêng, không cần thêm tập broadcast hay listener làm mất hiệu lực phái sinh.


`api/events.ts` là file quy ước wire mà phía trình duyệt cũng phải biên dịch, do đó mỗi kiểu nó tham chiếu tới đều phải đi qua **subpath kiểu-thuần an toàn cho client (client-safe type-only)** của gói chủ sở hữu, tuyệt đối không được đi qua lối xuất gốc của gói (package root export). Bằng chứng thực tế: chỉ cần dẫn một kiểu từ gốc `@deepseek-ai/dsh-session`, nó sẽ kéo `declare module 'cordis' { interface Context { sessions: SessionStore } }` ở lối xuất gốc vào mặt biên dịch client, đè `ctx.sessions: ISessions` của client, và nổ ra 18 lỗi ở `ui-input-trigger` / `ui-conversation` vốn hoàn toàn không liên quan. Do đó `JsonValue` cần `dsh-session/src/types.ts` bổ sung một dòng re-export.

### e2e trình duyệt của apps/web thuộc mặt Host

Nhóm e2e trong `apps/web/tests/**` được kiểm tra kiểu tại **`tsconfig.host.json`** gốc: chúng khởi động harness thật trong tiến trình, chạm trực tiếp `ctx.apiProxy`, `SessionStore.get/create/flush` phía host, `ctx.sessionProjectionCache`. **Runtime dùng trình duyệt ≠ về mặt kiểu thuộc chương trình client** — nếu chuyển chúng vào tổ hợp client sẽ báo lỗi ngay 21 lỗi, vì một program không thể chứa cùng lúc hai face gộp lại cho cùng một Context key.

Từ đó có một kỷ luật kéo theo quan trọng đối với thiết kế này: **các test này chỉ cần import giá trị hoặc kiểu từ gói client là sẽ kéo toàn bộ project của gói đó — cùng mọi project mà nó tham chiếu tới — vào đồ thị build Host**. Bốn bên tiêu thụ `ui-settings-general`/`ui-settings-models`/`ui-permission`/`ui-commands` tham chiếu (references) mặt client của `api/remotes`, mà mặt này phải đợi host tsdown sinh ra `@deepseek-ai/dsh-goal/remote` mới biên dịch được, từ đó tạo thành deadlock ở giai đoạn build: host tsc → mặt client api/remotes → `goal/remote` → host tsdown → xếp sau host tsc.

Các symbol client cần dùng được **soi gương (mirror)** một bản riêng ở phía test (`scaffold.ts` xuất ra hằng số welcome-notice đã soi gương, hai e2e chat dẫn thẳng `dsh-client-runtime/client` vì project `runtime` vốn đã nằm trong đồ thị host), nhờ đó bốn bên tiêu thụ trên rời khỏi đồ thị host; 15 dòng tham chiếu project client trong `apps/cli/tsconfig.json` theo đó mất luôn vai trò owner-map, đã bị xóa cùng lúc. Giá trị soi gương khớp từng chữ với nguồn, biểu hiện của việc trôi dạt (drift) là selector không khớp hoặc thông báo không bị ẩn đi, đều là lỗi ồn ào.

### Danh sách thay đổi

| Vị trí | Thay đổi |
|---|---|
| `dsh-typert-protocol` | `src/types.ts` thêm `TypertForwardableEvent`, `TypertRemoteEventSelection`, `TypertRemoteEvent`; `TypertClientRemote` thêm `$on` và `$dispatch`. Kiểu thuần, không có runtime |
| Nửa client `api/gateway` | `ClientRemoteService` triển khai `$on` (đăng ký định địa chỉ theo mục đăng ký, `ctx.effect` thuộc về fiber gọi) và `$dispatch` (chụp nhanh rồi phát theo thứ tự đăng ký, thu nạp listener ném lỗi hoặc reject) |
| `api/remotes` | Thêm `src/remote-events.ts` (giá trị danh sách) và `src/types.ts` (hình chiếu kiểu + chỗ selection), cả hai đều liệt kê kép trong `files` của hai face; lối xuất `./types` + `files` bổ sung `lib/types/**/*.js`; nửa host thêm khẳng định hình dạng và `import type {}` `./types` của ba gói chủ sở hữu; nửa client `export type {}` ba `./types` đó và `@deepseek-ai/dsh-api-gateway/client` |
| `tsconfig.base.json` gốc | Thêm ba `paths`: `dsh-settings/types`, `dsh-credentials/types`, `dsh-api-remotes/types`, tất cả đều trỏ vào **mặt nguồn** |
| `dsh-commands` / `dsh-settings` / `dsh-credentials` | Khối con `interface Events` chuyển vào `./types` an toàn cho client của từng gói (settings/credentials tạo mới lối xuất này, brand và kiểu thuần cũng chuyển theo, index tiếp tục re-export và giữ lại constructor; `files` bổ sung `lib/types/**/*.js`) |
| `host/apiproxy` | `HostFrame` thêm `host/remote-event`, xóa năm biến thể chuyên dụng và zod của chúng; `events.host()` gắn listener theo danh sách và kiểm tra qua `assertJsonArgs` |
| `dsh-session` | `src/types.ts` bổ sung `export type { JsonValue }`, để file quy ước wire có thể đi qua subpath an toàn cho client |
| `client/runtime` | Năm nhánh cầu nối sự kiện Client được gộp lại thành `ctx.remote.$dispatch(frame.event, frame.args)`, và xóa các khai báo lặp lại |
| 5 bên tiêu thụ | ui-commands / ui-settings-models / ui-settings-general / ui-permission / ui-agent-preset chuyển sang đăng ký `ctx.remote.$on(...)`; theo tiền lệ của `ui-goal`, dẫn kiểu-thuần `@deepseek-ai/dsh-api-remotes/client` và thêm `'remote'` vào `inject` |
| `client/connection` | `emitHost` của fixture tạo `host/remote-event` |
| `apps/web/tests` + `apps/cli` | Soi gương symbol client (xem mục trên); `apps/cli/tsconfig.json` xóa 15 dòng tham chiếu project client |

## Phương án thay thế

**Mở thêm một kênh xuống chung mới cho sự kiện Remote** (đối ngẫu đẩy của `ctx.connection.rpc`, WebSocket thứ ba). Khớp nhất với nguyên tắc "Connection độc quyền carrier, Gateway không đụng transport"; nhưng phải sửa đồng thời luồng xuống host, `WebApiClient`, `ConnectionController`, fixture và web e2e, mỗi thứ một luồng, cái giá không tương xứng với lợi ích lần này. Cái giá của việc ký sinh vào luồng host là quy ước mới tạm thời ở nhờ trong union frame legacy — khi luồng host sau này dọn nhà toàn bộ, nó sẽ đi theo, quy ước phía tiêu thụ không đổi.

**Lập một `TypertRemoteEventMap` độc lập trong type-meta, để gói chủ sở hữu declare-merge vào đó.** Tập khóa phía tiêu thụ sẽ chính xác bằng "các sự kiện được khai báo là có thể truyền phát từ xa"; cái giá là chữ ký của mỗi sự kiện phải **viết lại một lần nữa** ngoài `Events` của cordis, do đó cần một chứng minh tương đương `extends` hai chiều để ngăn trôi dạt, còn phải thêm dependency type-meta cho ba gói chủ sở hữu. Vì dùng chung một bản khai báo `Events` đã khiến tính tương đương đúng theo cấu trúc, nên bảng này không được lập.

**Để typert generator sinh hình chiếu sự kiện từ khai báo `Events` của host** (codec + `.d.ts` + ánh xạ khai báo, cùng họ với `/remote`). Generator đã phân tích sự kiện host sẵn; nhưng nó không có ngữ nghĩa hình chiếu và ẩn danh hóa, và phải động vào cả generator lẫn mặt build. Con đường chuyển tiếp nguyên trạng vốn không cần hình chiếu.

**Thêm hàm hình chiếu payload cho sự kiện có thể chuyển tiếp** (bảng chuyển tiếp `{ tên sự kiện, hình chiếu, zod }`). Có thể bao phủ luôn fan-in của `models-changed` và view phái sinh của workspace; cái giá là logic hình chiếu phải khớp thủ công với kiểu payload, quay lại hình thái bảng trung tâm mà phía phương thức vừa mới loại bỏ.

**Chuyển e2e trình duyệt của apps/web vào tổ hợp client.** Tưởng như "test client thuộc về mặt client", nhưng thực tế báo lỗi ngay 21 lỗi: chúng dùng dịch vụ host, trong khi trong chương trình client thì `ctx.sessions` là `ISessions`. Đã bị bác bỏ.

**Tách mặt host/client cho `directory-picker-browse`/`-native`**, để từ gốc gói client không lọt vào đồ thị host. Hướng đi đúng (chúng đúng là các gói nửa-chưa-tách), nhưng thay đổi lại nằm trên địa bàn của người khác, mà lợi ích chỉ là "đồ thị build sạch hơn" — sau khi thiết kế này đã soi gương symbol client ở phía test thì không còn cần nó nữa. **Đã đánh giá và quyết định không làm**.

## Xác minh

Những gì chốt chặt hành vi này:

- Một test tổ hợp thật: mỗi lần host emit, luồng host thật sẽ phát ra một frame `host/remote-event`, `event` là tên gốc của host, `args` khớp từng phần tử với tham số thực tế.
- Tầng kiểu từ chối ba loại ứng viên phản ví dụ: tên không phải sự kiện, sự kiện gắn Scope (`goal/changed`), sự kiện có giá trị trả về khác `void`. `$on('slots/changed', …)` (sự kiện cục bộ client) và `$on('skills/change', …)` (đã khai báo nhưng chưa được chọn) đều biên dịch lỗi — do đó mặt khóa của `$on` khớp chính xác với danh sách.
- Phía tiêu thụ `$on('settings/document-updated', …)` phân giải `ns` thành `SettingsNamespace`: brand sống sót qua wire.
- Disposer của `$on` thuộc về fiber gọi; cùng một đối tượng hàm đăng ký hai lần thì hai lượt đăng ký hủy đăng ký độc lập với nhau — bảng dùng danh tính listener làm khóa sẽ gộp chúng lại, nên việc đăng ký được định địa chỉ theo từng mục đăng ký.
- Việc truyền phát vừa thu nạp listener ném lỗi vừa thu nạp listener trả về promise bị reject: kiểu trả về khai báo là `void`, không ai await listener bất đồng bộ, nếu không thì việc reject của nó sẽ hoàn toàn thoát khỏi lớp thu nạp này. Việc truyền phát duyệt qua bản chụp nhanh (snapshot), do đó đăng ký hoặc hủy đăng ký trong lúc phát không làm thay đổi tập người nhận của frame hiện tại.
- `assertJsonArgs` được unit test trực tiếp, chứ không phải tạo emit dị dạng từ event bus: `ctx.emit` đã gõ kiểu thì không thể tạo ra input như vậy — payload của mỗi sự kiện trong danh sách đều an toàn JSON về mặt tĩnh.
- Năm frame chuyên dụng, năm alias Client và các nhánh cầu nối của chúng đều không còn tồn tại; mỗi bên tiêu thụ quan sát trực tiếp sự kiện chủ sở hữu.

## Hệ quả

- **Ở nhờ trong union frame legacy**: quy ước sống trong `HostFrame` của apiproxy, người đọc có thể nhầm tưởng apiproxy sở hữu sự kiện Remote. JSDoc của frame đó nêu rõ danh sách thuộc về `api-remotes`, README của apiproxy ghi lại việc ở nhờ này trong mục known limitations. Khi luồng host sau này dọn nhà toàn bộ, frame bao sẽ đi theo, quy ước phía tiêu thụ không đổi.
- **Hai file phá vỡ quy ước loại trừ lẫn nhau giữa các face của api/remotes**: `src/remote-events.ts` và `src/types.ts` cùng thuộc về hai project, mỗi bên phát ra một bản khai báo giống nhau vào `lib/types` dùng chung. Nội dung giống nhau từng byte, `.tsbuildinfo` độc lập với nhau, trên thực tế vô hại; mục ranh giới build trong README nêu rõ ngoại lệ này và nguyên nhân của nó (`paths` trỏ vào mặt nguồn).
- **Việc bàn giao carrier khả kiến với developer**: bất kỳ plugin client nào giữ `ctx.remote` đều có thể gọi `$dispatch` để tự tổng hợp một sự kiện chuyển tiếp. Bề mặt lộ ra này có từ trước cả động từ này: trước đây khi trung chuyển sự kiện nội bộ qua frame, `ctx.emit` cũng đã có thể chạm tới — cùng mức độ với việc `connection/reset` có thể bị giả mạo thành reconnect (client là một miền tin cậy duy nhất). Test chỉ chốt "bàn giao chuyển đổi tới `$on`", không giả vờ rằng cổng này phân biệt được bên gọi.
- **Tham số thực tế dị dạng thất bại trong lớp thu nạp ở phía phát, không phải lúc load**: `assertJsonArgs` ném lỗi bên trong listener chuyển tiếp, do đó bị chính listener thu nạp của seam phát ghi log và bỏ frame đó — xuất hiện ồn ào trong log host, chứ không phải lúc load hay tại điểm emit.
- **Giá trị soi gương phía test có thể trôi dạt**: không có cơ chế nào đối chiếu hằng số client được soi gương trong `apps/web/tests` với nguồn của nó; lưới an toàn duy nhất là việc trôi dạt sẽ khiến selector không khớp. Quy tắc được ghi trong `apps/web/tests/README.md`, do review canh giữ; cổng chặn cấp grep đã được đánh giá và cố tình không làm.
- **Năng lực bị từ bỏ**: không hỗ trợ hình chiếu hay ẩn danh hóa payload, không hỗ trợ sự kiện theo Scope (`agentCtx.remote.$on`), reconnect không phát lại — đây đều là tín hiệu làm mất hiệu lực thuần túy, và `connection/reset` đã bao phủ việc lấy lại dữ liệu sau reconnect. Sự kiện phiên của luồng mux, frame có thể trả lời và baseline snapshot không nằm trong phạm vi này.
- **Vẫn còn gói client nằm trong đồ thị host**: 12 project (`connection`, `runtime`, `ui-slots`, v.v.) vẫn có thể chạm tới đồ thị host qua `directory-picker-browse`/`-native` chưa tách và `api/gateway → client/connection`. Chúng đều biên dịch được và không còn kéo theo mặt client của api/remotes nữa, do đó không chặn thay đổi lần này; tách các gói đó có thể giảm bớt vài project, nhưng đã đánh giá và quyết định không làm. Hai e2e chat dẫn thẳng `dsh-client-runtime/client` là vì project `runtime` vốn đã nằm trong đồ thị — đây là ngẫu nhiên, không phải bảo đảm.
- **Companion invariant không kiểm tra tại runtime**: một bản sửa trước đây từng khẳng định hình dạng truyền phát trên event bus đang sống (`thisArg === null`, `mode === 'emit'`), điều này khiến companion gắn chặt với giá trị danh sách, và khiến rolldown nâng nó thành chunk bundle thứ ba — trong khi danh sách file phát hành được suy ra máy móc lại không mang theo nó. Khẳng định `TypertForwardableEvent` ở mặt host đã từ chối hai kiểu lệch này tại thời điểm biên dịch, do đó companion này là một installer rỗng có kèm giải thích.
