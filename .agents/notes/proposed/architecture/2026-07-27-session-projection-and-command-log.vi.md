# Agent Note: Chiếu phiên và ghi log vòng đời lệnh

Status: proposed

[English](2026-07-27-session-projection-and-command-log.md) | 中文

## Vấn đề

Ba tính năng web đang triển khai — todo (#497), goal (#527), plan mode (#587) — đều cần suy ra trạng thái theo từng phiên từ log phiên và hiển thị lên client trình duyệt, nhưng cả ba lại tự phát minh ra một cơ chế giống nhau:

- **Lớp core class của client hấp thụ mọi lĩnh vực.** Cả ba đều thêm private field, dàn dựng việc lấy dữ liệu và nhánh switch sự kiện vào class `Session` của client runtime, rồi phát giá trị của mình ra qua `ConversationSnapshot`. Riêng plan đã thêm bảy private field và ba tầng chắn (phiên bản request, phiên bản sự kiện, cache giá trị mới nhất còn hiệu lực); goal thêm một chắn write revision cộng thêm một vòng lặp lấy lại kiểu gộp; todo thêm một field chiếu (projection) và một nhánh case sự kiện. Nếu có lĩnh vực thứ tư, lại phải sửa core class lần thứ tư.
- **Ba kênh baseline.** todo dựa vào field `todos` ở trang cuối lịch sử — được tính bởi `backscanTodos` **bên trong api-proxy**, logic fold nghiệp vụ trú ngụ trong lớp vận chuyển; plan thêm một RPC đơn trị chuyên dụng `session.planMode`; goal thêm `goals.get`. Cùng một vấn đề, ba định dạng giao thức (wire format) khác nhau.
- **Kết quả lệnh không thể khôi phục.** `/goal`, `/plan` và mọi lệnh slash khác chỉ trả kết quả trong response RPC `command.execute`, hiển thị như một thông báo composer thoáng qua trên tab đã phát lệnh. Log phiên không giữ lại gì cả: refresh, mở tab khác, khôi phục hay fork đều làm mất bản ghi "lệnh này từng được chạy". Sự thay đổi *trạng thái* của lĩnh vực là bền vững (goal commit metadata `goal/change`, plan commit `plan/mode`), nhưng bản thân lời gọi lệnh và kết luận của nó thì không.

Lỗ hổng nền tảng mang tính kiến trúc: client không có một seam để plugin quan sát sự kiện phiên trong phạm vi phiên và duy trì trạng thái phái sinh của riêng mình; phía host cũng không có cách thống nhất để trao giá trị hiện tại của trạng thái phái sinh từ log cho client — trong khi lịch sử của trạng thái đó có thể đã bị phân trang đẩy ra ngoài cửa sổ của client.

## Đề xuất

Trước tiên dựng bốn hạ tầng, sau đó mỗi lĩnh vực chỉ còn là bên đóng góp thuần túy.

### Quy tắc sự kiện giá trị toàn phần

Sự kiện log mang trạng thái phải mang toàn bộ trạng thái sau khi thay đổi, tuyệt đối không mang delta trần. Cả ba lĩnh vực hiện tại đều đã tuân thủ: `todo/write` là snapshot toàn bảng, `plan/mode` là một giá trị boolean hoàn chỉnh, metadata `goal/change` là một `GoalSnapshot` hoàn chỉnh (hoặc một tombstone xóa giá trị toàn phần). Quy tắc này giúp việc chuyển trạng thái của mỗi lĩnh vực luôn đủ rẻ (framework điều khiển nó theo từng sự kiện), khiến giá trị tự mô tả ở tầng giao thức, và cho phép bất kỳ bên tiêu thụ nào cũng có thể coi giá trị mới nhất đã push là giá trị cuối cùng — có được khả năng miễn nhiễm với thứ tự lộn xộn nhờ so sánh seq, và tự phục hồi: bản cập nhật bị bỏ lỡ sẽ được bản cập nhật kế tiếp sửa lại.

### Registry chiếu phía host (`dsh-session-projection`, gói mới)

Một gói Service Definition nhẹ: bảng kiểu merge-extensible, service registry, xác thực zod ở ranh giới. Vai trò của capability seam như sau: plugin host của lĩnh vực cung cấp đơn vị chiếu, lớp vận chuyển tiêu thụ các đơn vị này, hai bên không biết về nhau.

Lĩnh vực đăng ký một **đơn vị tính toán dẫn dắt bởi trạng thái (state-driven computation unit)** — ba hàm thuần túy cộng thêm vài khai báo — tuyệt đối không phải một getter mờ đục. Việc điều khiển nó là trách nhiệm của framework (subscription, watermark, cache, và cơ chế checkpoint về sau), lĩnh vực chỉ chịu trách nhiệm cho phần toán học. Chiếu phục vụ mọi lĩnh vực nghiệp vụ (tiêu đề phiên, plan, goal, quyền, todos); lệnh chỉ là một trong các đường trigger, không có vị thế đặc biệt nào trong convention này.

```ts ignore-check
export interface SessionProjectionMap {}   // the single type table for the whole chain

export interface ProjectionDefinition<K extends keyof SessionProjectionMap, S> {
  key: K
  schema: ZodType<SessionProjectionMap[K]>  // validates the payload before it leaves the host
  /** State for the empty log. */
  init(): S
  /** Pure transition: previous state + one event → next state. The framework drives it; domains hold no subscriptions. */
  apply(state: S, event: SessionEvent): S
  /** State → wire payload (the read-side projection). */
  view(state: S): SessionProjectionMap[K]
  /** State must be plain JSON (persisted-cache precondition); bump to invalidate persisted rows. */
  stateVersion: number
}

declare module 'cordis' {
  interface Context { sessionProjections: SessionProjectionRegistry }
}
```

- Giá trị chính là payload JSON ở tầng giao thức; cùng một bảng kiểu được kết nối đầu-cuối qua `import type` (đơn vị phía host, khối giao thức, React hook) — không có bảng DTO thứ hai, cũng không có bảng "views" riêng ở client. Việc giá trị được *render* ra sao thuộc về hệ thống slot, không bao giờ thuộc tầng chiếu.
- **Host là nơi tính toán chiếu duy nhất.** Framework chủ động điều khiển (eager drive) mỗi đơn vị đã đăng ký: mỗi sự kiện phiên đã commit đều đi qua `apply`; đơn vị không quan tâm sự kiện đó thì trả về cùng một tham chiếu trạng thái, và khi tham chiếu không đổi (`Object.is`) thì không phát sinh bất kỳ công việc downstream nào. Client không bao giờ fold sự kiện lĩnh vực — thứ chúng nhận được là giá trị thành phẩm (khối baseline + khung push nói bên dưới). Điều này loại bỏ bẫy triển khai kép (việc fold hai sự kiện của plan chỉ viết một lần ở host), và loại bỏ mọi code lĩnh vực ở phía client.
- **Trạng thái luôn được tính toán ra, không bao giờ ghi vào log.** Log chỉ lưu sự kiện; trạng thái của đơn vị nằm trong cache watermark theo-từng-phiên của framework (mỗi đơn vị một bản `{state, observedSeq}`), và ở giai đoạn sau sẽ vào **cache chiếu bền vững (persisted projection cache)** trên seam lưu trữ domain-KV: các dòng dạng `(sessionId, key, ver, seq, val)` (`ver` = `stateVersion` của đơn vị, `seq` = watermark, `val` = trạng thái JSON). Một dòng không bao giờ sai, nhiều nhất chỉ lỗi thời — `seq` của nó cho biết chính xác lỗi thời đến đâu. Đọc nguội và đọc đang hoạt động dùng chung một công thức đọc: lấy trạng thái cache (hoặc `init()`), chỉ `apply` theo hướng thuận cho các sự kiện vượt quá watermark của nó, rồi `view` kết quả. Danh sách nguội (liệt kê tiêu đề của mỗi phiên trên toàn bộ workspace) trở thành một lần đọc index, tối đa cộng thêm một đoạn replay đuôi nhỏ; seam session-persistence ở cùng giai đoạn sau sẽ bổ sung một nguyên thủy đọc bắt đầu theo seq cho đoạn đuôi này. Chính sách ghi: throttle (số lần/khoảng thời gian, cấu hình được) cộng thêm hai điểm bắt buộc — `turn/end` và detach (thời điểm chuyển từ hoạt động sang nguội). Cái giá của việc crash giữa hai lần ghi chỉ là replay đuôi dài hơn một chút, không bao giờ là giá trị sai.
- Tập sự kiện đầu vào của mỗi lĩnh vực do chính lĩnh vực đó chọn: todos chỉ fold `todo/write`; plan fold `plan/mode` cộng thêm bản ghi `command/run` của chính `/plan` (xem phần plan); goal fold metadata `goal/change`; tiêu đề phiên fold sự kiện tiêu đề của nó (đồng thời gỡ bỏ khung `session/title` chuyên dụng cũ và bảng snapshot tiêu đề của client — đây là bản chiếu thủ công thứ tư mà seam này thu nạp).
- Đăng ký là một effect (disposer đi theo fiber): sau khi plugin unmount, key của nó biến mất khỏi các response tiếp theo, client đọc điều đó như thiếu năng lực — ngữ nghĩa HMR (thay thế module nóng) tự động thành lập theo đó. Key trùng lặp sẽ throw ngay. Plugin lĩnh vực đăng ký dưới `ctx.inject(['sessionProjections'], …)`, nên việc lắp ráp headless không có registry hoàn toàn không bị ảnh hưởng.
- Gói này sở hữu `./invariant` (mỗi key được phục vụ đều có một đăng ký còn sống).

### Bên tiêu thụ đã triển khai: đơn vị định danh subagent

Hai cách đọc registry hiện có đã phục vụ một bên tiêu thụ đã triển khai nằm ngoài kế hoạch giao thức của RFC này: [danh sách subagent đọc định danh qua đơn vị chiếu](../../implemented/architecture/2026-08-06-subagent-list-identity-projection.md) đã đăng ký đơn vị `subagent` — định danh mode/label bền vững được fold theo kiểu last-wins từ `subagent/descriptor` — `SubagentRuntime.listChildren` đọc qua `snapshot()` cho child đang sống (cache watermark, không đọc log), và gọi `restore({}, events, 0)` cho child nguội bằng kết quả một lần đọc toàn phần bền vững. Convention của registry không đổi: không có kênh lỗi, không có cách đọc mới — đơn vị không bao giờ throw, việc giá trị vắng mặt tự nó là tín hiệu, còn việc trình bày vắng mặt đó ra sao là quyết định của chính bên tiêu thụ này.

### Tầng giao thức: khối projections trên trang cuối lịch sử

```ts ignore-check
// session.history response, tail page only (beforeSeq absent):
{ events, hasMore,
  projections?: { asOfSeq: number, values: Partial<SessionProjectionMap> } }
```

Bộ xử lý lịch sử của api-proxy sau khi cắt trang cuối sẽ duyệt registry đồng bộ — không có bất kỳ `await` nào trong toàn bộ quá trình, nên giá trị của mọi key và `asOfSeq` tạo thành cùng một lát cắt nhất quán. `asOfSeq` là **seq của sự kiện cuối cùng** (`session.seq - 1`; log rỗng là `-1`, dùng chung bộ từ vựng với `session/subscribed.lastSeq`), nên khung push mang theo thay đổi đầu tiên sau baseline khi so sánh luôn lớn hơn nghiêm ngặt. api-proxy không nắm giữ bất kỳ tri thức lĩnh vực nào (cùng loại quan hệ vận chuyển/đóng góp với `viewFor` hướng về `ctx.tools`).

Không thêm phương thức RPC mới. Sự trùng khớp về thời điểm là chính xác: mỗi thời điểm client cần một baseline mới (mở, kết nối lại đồng bộ lại, vá lỗ hổng) vốn dĩ đã phải kéo trang cuối, còn đường duy nhất không bao giờ cần baseline (loadOlder) lại đúng là đường duy nhất truyền `beforeSeq`. Do đó client **hoàn toàn không có** quyết định "lấy lại baseline" độc lập. Nội dung cửa sổ không bao giờ đóng vai trò tín hiệu: câu hỏi "trong cửa sổ không có sự kiện của lĩnh vực này" về mặt cấu trúc không thể trả lời trong phạm vi cửa sổ, chỉ có baseline mới trả lời được.

Các kênh cũ bị gỡ bỏ cùng khối này: `session.planMode` và `setPlanMode` (cả đọc lẫn ghi — lựa chọn plan chuyển sang kênh lệnh chuẩn, xem phần plan), `goals.get` (phía đọc; sáu RPC thay đổi vẫn giữ, nhưng response của chúng không còn nuôi trạng thái nữa — sự kiện mux dù sao cũng sẽ đến), field `todos` gắn kèm, và `backscanTodos` trong api-proxy (chuyển vào đơn vị của lĩnh vực todo, đặt tại `tool-todo`).

### Khung push và kho giá trị client (không có code client cho lĩnh vực)

Vì host là nơi tính toán duy nhất, giá trị thành phẩm được gửi tới client qua một khung mux mới:

```ts ignore-check
// MuxFrame union + schema branch:
{ type: 'session/projection', sessionId, key: string, value: unknown, seq: number }
```

Chỉ cần tham chiếu trạng thái của một đơn vị thay đổi (cổng `Object.is` nói ở trên), framework sẽ phát khung này; `seq` là watermark của đơn vị đó tại thời điểm phát. Đây là trạng thái push thời gian thực, tuyệt đối không vào log — cùng tư thế với slot `view` của tool-view: khi replay sẽ được tính lại ở host.

Tầng đối tượng của client duy trì một **kho giá trị tổng quát (value store)** cho mỗi phiên: `key → { value, seq }`, được gieo mầm bởi khối projections của trang cuối, được cập nhật bởi khung này, quy tắc duy nhất là **seq cao hơn thắng**. Baseline replay không thể lùi lại một khung mới hơn; cái giá của việc mất một khung chỉ là lỗi thời — cho đến khung tiếp theo hoặc baseline tiếp theo — tuyệt đối không bao giờ sai. Không có `fromEvent`, không có đăng ký cell theo từng lĩnh vực, không có fold lĩnh vực ở phía client — lĩnh vực chỉ cần **không có code client nào** để hỗ trợ chiếu (`SessionProjectionMap` merge qua điểm xuất `/types` phục vụ cả hai bên). Khung `session/title` chuyên dụng cũ và bảng snapshot tiêu đề của manager đều được thu nạp vào cặp cơ chế tổng quát này. Mọi hàng rào tự chế theo từng lĩnh vực (ba tầng của #587, write revision của #527) đều tan biến vào quy tắc seq duy nhất này.

### Plan đi qua kênh lệnh chuẩn (ví dụ đầy đủ)

Plan mode minh họa đầy đủ mẫu hình này — đường trigger, mặt chạy, mặt replay tách bạch rõ ràng:

- **Đường trigger**: công tắc plan trên web gửi `/plan` / `/plan off` qua `command.execute` giống mọi lệnh khác; RPC `setPlanMode`/`planMode` chuyên dụng bị gỡ bỏ. *Yêu cầu* của người dùng được ghi bền vững dưới dạng `command/run { name: 'plan', args: 'off' | '' }` của lệnh đó — field có cấu trúc, không cần parse text dòng lệnh.
- **Mặt chạy** (không đổi): service plan-mode giữ ý định đang chờ (pending) trong bộ nhớ, và commit `plan/mode` tại ranh giới lượt tiếp theo. Khi khởi động nguội, service dựng lại hàng đợi ý định của mình từ mặt replay ("trạng thái chạy trống thì lấy trạng thái replay làm chuẩn").
- **Mặt replay**: đơn vị chiếu của plan fold **hai** loại sự kiện — bản ghi `command/run` của chính nó đặt `wanted`; `plan/mode` đặt `active` và xóa `wanted`; `view` suy ra `{ active, pending: wanted !== null && wanted !== active }`. Trạng thái pending nhờ đó trở thành đại lượng replay thuần túy: host khởi động lại có thể khôi phục nó, các tab khác fold cùng sự kiện đó (trạng thái pending xuyên tab do đó tự động có được), đọc nguội trả lời `{ active: false, pending: true }` cũng chính xác ("một lựa chọn chưa được thực thi đang chờ khôi phục").

Tập sự kiện đầu vào của mỗi lĩnh vực do chính lĩnh vực chọn — ví dụ này chính là hiện thực hóa quy tắc chung đó. Việc "người dùng đã yêu cầu X" xuất hiện trong chiếu (plan fold bản ghi lệnh của chính nó), hay chỉ xuất hiện trong flow (node lệnh dù sao cũng sẽ render), thuộc về ngữ nghĩa riêng của từng lĩnh vực, không bao giờ là mối quan tâm của framework.

### React: `useProjection`, chỗ ngồi thứ năm của framework hook

Bốn chỗ ngồi hiện có đều không chứa được loại trạng thái này (kỷ luật store cấm đối tượng nghiệp vụ; inject cấm hook; `ConversationSnapshot` đang bị loại bỏ dần). `useProjection` trở thành một chỗ ngồi framework, được đúc tại web-react (điểm đúc hook duy nhất), được truyền tới qua cùng kênh bộ chuẩn với `useSession` (`provideInfo` → SessionProvider → props):

```ts ignore-check
type UseProjection = {
  <K extends keyof SessionProjectionMap>(key: K): SessionProjectionMap[K] | undefined
  <K extends keyof SessionProjectionMap, S>(
    key: K, selector: (v: SessionProjectionMap[K] | undefined) => S,
    eq?: (a: S, b: S) => boolean): S
}
```

`undefined` thống nhất biểu thị năng lực bị thiếu (plugin host chưa gắn, hoặc chưa từng có baseline/khung nào mang theo key đó). Kho giá trị chỉ phơi bày một mặt trần `{subscribe, getSnapshot}` theo từng key; phần còn lại giao cho `bindSnapshotSelector` với cache theo từng key — tính ổn định tham chiếu được đảm bảo, vì tham chiếu giá trị của một key chỉ thay đổi khi khung hoặc baseline được ghi vào. Đường ghi không đổi: callback thay đổi vẫn ở mặt chia sẻ của inject (callback đến từ inject, trạng thái sống đến từ `useProjection`).

Vi phạm duy nhất hiện có của quy tắc "hook không được xuyên qua inject" — `DetailsInjected.useSelection` — cũng được thu nạp cùng thay đổi này: trạng thái chọn là trạng thái xem trú ngụ trong chat store, nên đăng ký details khai báo một handle store dùng chung, component chuyển sang đọc `props.useStore(s => s.selection)`; `useSelection` rút khỏi convention inject.

### Vòng đời lệnh trong log

Hai sự kiện chỉ-log (không phải surface, model không nhìn thấy), phản chiếu cặp `tool/call`/`tool/result`:

```ts ignore-check
'command/run':  { commandId: string; name: string; args?: string; source: CommandSource }
'command/done': { commandId: string; kind: 'success' | 'error'; text?: string }
```

Bộ thực thi lệnh phía host (`packages/interaction/commands`) append `command/run` trước khi gọi handler, append `command/done` khi kết toán — append độc lập trực tiếp trên phiên của agent (tác tử) đang nhận, cùng hình thái với mọi sự kiện chỉ-log của plugin sau [loại bỏ lượt tổng hợp](../../implemented/simplification/2026-07-28-remove-synthetic-log-only-turns.md): không có lượt nào bao bọc chúng (lượt chỉ mô tả việc thực thi vòng lặp model), checkpoint bền vững xả (drain) chúng ở checkpoint thông thường, cặp run/done được canh giữ bởi plugin invariant đi kèm của chính gói commands. Payload có cấu trúc — `name` cùng `args` mặc định mang theo đến từ chính việc phân tách của parser (`name` và `rawInput` của `parseCommand`), nên bên tiêu thụ (đơn vị chiếu fold bản ghi lệnh của chính mình, thẻ lệnh phong phú) không bao giờ cần parse lại text dòng lệnh. Khi payload đã được nắm giữ bởi sự kiện lĩnh vực có thẩm quyền, định nghĩa lệnh sẽ đặt `recordInput: false`; lúc đó `command/run` bỏ `args`, thay vì lặp lại payload đó. `text` là kết quả nguyên trạng của handler — cùng bản chất dữ kiện với `tool/result.content`, không phải hiển thị (cách dàn trang vẫn do client tính toán lúc render, thỏa mãn ranh giới đỏ "hiển thị không bao giờ vào log"). Lĩnh vực muốn model biết kết quả thì tiếp tục làm điều chúng vẫn làm hôm nay (lời dẫn của plan, việc tiêm của goal) — đó là quyết định riêng của lĩnh vực, không đổi.

Vì sự kiện đã commit sẽ được broadcast trên luồng mux, ba điều sau tự động có được: vẫn còn sau khi refresh, đồng bộ đa tab, có thể khôi phục sau fork/restore. RPC `command.execute` suy biến thành phán quyết truy cập — `{ matched, commandId? }`: dòng đó có khớp lệnh hay không, và id cặp mới đúc khi khớp, client phát lệnh dựa vào đó để liên kết yêu cầu của mình với node flow do sự kiện vòng đời sinh ra. Kênh thông báo một lần (`runDetached` → `noticeFor`) bị gỡ bỏ theo đó.

Bộ dựng flow của client thêm một node lệnh tổng quát mới (run/done ghép cặp theo `commandId`; khi bị cắt cụt xuyên cửa sổ thì giảm cấp mềm giống như cặp tool). Việc render đi qua một keyed slot mới `'conversation.chat.commandview'`, key = tên lệnh, **mặc định = thẻ lệnh tổng quát** (dùng được mà không cần đăng ký gì — text thông báo trước đây giờ được render bền vững trong flow). Lĩnh vực muốn nâng cấp hiển thị chỉ cần đăng ký một component hàng, lấy dữ liệu từ field có cấu trúc của `command/run` và giá trị chiếu của chính mình (`useProjection`) — cùng hình thái với hàng tool sau khi toolview được giải tán.

## Kế hoạch triển khai

Hạ tầng đi trước; ba PR (Pull Request) đang triển khai giữ nguyên (bản đồ di trú của chúng chính là hướng dẫn để kết nối lại sau khi nền tảng dựng xong):

1. **Nền tảng host**: `dsh-session-projection` (convention đơn vị, chủ động điều khiển, cache watermark) + khối projections của api-proxy + khung push `session/projection`. Không có đăng ký lĩnh vực nào cũng có thể merge (lúc đó khối và khung sẽ trực tiếp vắng mặt).
2. **Nền tảng client**: kho giá trị tổng quát + chỗ ngồi `useProjection`; gỡ bỏ cơ chế cell theo từng lĩnh vực, và gỡ bỏ khung `session/title` cùng bảng snapshot tiêu đề sau khi đơn vị tiêu đề đăng ký. Hình dạng khung phụ thuộc vào bước 1 (trước đó fixture (dữ liệu tiền cấu hình cho test) nuôi khung tổng hợp).
3. **Kênh lệnh**: hai sự kiện, bộ thực thi ghi log, node tổng quát + keyed slot, gỡ bỏ kênh thông báo, phán quyết truy cập `{matched, commandId?}`. Chạy song song với bước 1.
4. **Kết nối lại lĩnh vực** (sau bước 1+2): trước tiên là todo (đơn vị vào `tool-todo`, xóa field gắn kèm), sau đó plan (đơn vị hai sự kiện, gỡ RPC, công tắc chuyển sang gửi `/plan`), cuối cùng là goal (đơn vị `goal/change`, xóa `goals.get`, chuyển sáu phương thức `Session` vào inject của plugin lĩnh vực).
5. **Cache chiếu bền vững** (giai đoạn sau, khi seam lưu trữ domain-KV sẵn sàng): dòng `(sessionId, key, ver, seq, val)`, ghi có throttle với các điểm bắt buộc turn/end và detach, cùng nguyên thủy đọc bắt đầu theo seq ở phía bền vững phục vụ replay đuôi nguội.

## Phương án khác

**Mở riêng một RPC `session.projections`** — không áp dụng: thời điểm refresh baseline trùng khớp chính xác với việc kéo trang cuối, một RPC đơn trị độc lập chỉ đổi lấy một vòng round-trip thứ hai, một seq cần hòa giải thứ hai, và một quyết định "khi nào lấy lại" ở client — trong khi thiết kế gắn kèm đã xóa bỏ hoàn toàn quyết định đó.

**Convention nhà cung cấp `get(agent)` mờ đục** — bác bỏ: khi mô hình tính toán ẩn bên trong lĩnh vực, framework vĩnh viễn không thể checkpoint trạng thái, không thể phục vụ phiên nguội (không có agent, không có log đã tải — `get` không có chỗ chạy), cũng không thể tính tiếp từ giữa log. Đăng ký đơn vị `(init, apply, view)` trao quyền điều khiển cho framework, lĩnh vực chỉ giữ lại phần toán học thuần túy; lĩnh vực nào cần hành vi phía host thì service subscription của nó vẫn tự giữ như cũ, không liên quan đến đơn vị chiếu.

**Hook chồng chỉ-thời-gian-thực chuyên dụng cho ý định pending của plan (`live?(agent, base)`)** — không áp dụng: lý do tồn tại duy nhất của nó là *lựa chọn* plan của người dùng không nằm trong log. Sau khi lựa chọn đi qua kênh lệnh chuẩn, `command/run` đã được ghi sổ, trạng thái pending trở thành đại lượng replay thuần túy, convention chiếu giữ đúng ba hàm thuần túy.

**Đặt tên API đăng ký là `registerFold`** — đã bị convention đơn vị thay thế: đối tượng đăng ký giờ đúng là một fold, nhưng trong repo này `fold*` chỉ dùng riêng cho hàm phụ trợ thuần túy `(events) => state`, còn registry này nhận một đơn vị có key, có schema, có version. Projection vẫn là thuật ngữ chỉ vai trò read model trong event sourcing, tiêu đề Note của #587 và bình luận của #497 cũng đều đã dùng nó.

**Fold ở phía client (cell chiếu theo từng lĩnh vực với `fromEvent`)** — bác bỏ: một khi đơn vị của plan phải fold hai loại sự kiện, cell ở client sẽ phải sao chép logic chuyển trạng thái của host trong trình duyệt — cùng một fold viết hai lần, tiến hóa riêng biệt. Push giá trị thành phẩm (tổng quát hóa tiền lệ của khung tiêu đề) giữ vững nơi tính toán duy nhất, và đơn giản hóa client thành một kho giá trị tổng quát được canh gác bởi seq; lĩnh vực không có code client.

**Quét ngược có giới hạn ở đuôi log (khai báo absorber)** — chưa áp dụng: hiện tại không có gì hỗ trợ nó, nó chỉ phục vụ lĩnh vực "mỗi sự kiện đều mang toàn bộ trạng thái fold", còn cache chiếu bền vững đã bao phủ cùng nhu cầu đọc nguội đó theo cách thống nhất (dòng cache + replay đuôi thuận — cùng công thức với baseline + đuổi kịp của client, và với tải phân trang). Chỉ xem xét lại khi xuất hiện đường đọc nguội thực sự mà cơ chế checkpoint không phục vụ được.

**Cell kiểu `invalidate` (đánh dấu bẩn, gặp sự kiện lĩnh vực thì lấy lại)** — không áp dụng: nó tồn tại chỉ để phục vụ sự kiện dạng delta. Quy tắc giá trị toàn phần khiến mọi lĩnh vực đều là last-wins; vòng lặp lấy lại, logic gộp, hàng rào đọc lỗi thời của goal đều biến mất theo đó.

**Gắn registry vào `ctx.apiProxy`** — không áp dụng: chiếu phiên không phải riêng cho web (TUI, ACP (Agent Client Protocol), headless đều là bên tiêu thụ tương lai), và gói lĩnh vực không được phụ thuộc gói apiproxy. Seam độc lập còn tiện thể xóa luôn cạnh import type-only từ api-proxy trỏ vào gói plan của #587.

**Bảng kiểu `SessionProjectionViews` riêng ở client** — không áp dụng: một bảng `SessionProjectionMap` xuyên suốt đầu-cuối chính là kỷ luật truyền thẳng giao thức (không lập bộ từ vựng DTO thứ hai); giá trị chính là payload JSON, render thuộc về slot.

**Dùng thu thập qua broadcast sự kiện thay cho duyệt registry** — không áp dụng: listener bất đồng bộ không thể cho ra lát cắt đồng bộ duy nhất đó, mà chính lát cắt đó khiến `asOfSeq` trở thành một snapshot nhất quán xuyên suốt mọi key; registry mới là hình thái tiếp nhận đóng góp phổ biến trong repo này (`ctx.tools`, mảnh prompt, slot).

**Sự kiện lựa chọn `plan/select` chuyên dụng (thay bản ghi lệnh được fold bằng sự kiện lĩnh vực có cấu trúc)** — không áp dụng, chuyển sang dùng kênh lệnh: `{name, args}` có cấu trúc của `command/run` đã ghi lại lựa chọn, cú pháp của `/plan` và logic fold của nó sống chung trong cùng một plugin (khớp nối nội bộ trong lĩnh vực, không xuyên lĩnh vực), lại còn ít đi một loại sự kiện. Handler phải gọi `set()` trước mọi đường có thể thất bại, khiến yêu cầu đã vào log và mặt chạy không thể phân kỳ — đây là ràng buộc thứ tự nội bộ của lĩnh vực, được ghi tài liệu tại handler.

**Giữ lại RPC chuyên dụng `setPlanMode`** — không áp dụng: lựa chọn plan chỉ là một lệnh người dùng thông thường; kênh lệnh cho nó bản ghi bền vững, render flow, khả năng thấy được xuyên đa tab và ngữ nghĩa truy cập, không cần một phương thức giao thức chuyên dụng. Component tương tác của Web UI (một công tắc) chỉ cần tự ghép dòng lệnh ở bên trong.

**Để response của RPC thay đổi nuôi trạng thái cell** — không áp dụng: sự kiện mux đã commit đến ngay lập tức, mang theo cùng giá trị toàn phần cộng thêm seq; "để response nuôi trạng thái" chính là nguyên nhân buộc phải có hàng rào write revision của #527 lúc đầu.

## Tiêu chí nghiệm thu

- Plugin lĩnh vực gửi trạng thái phái sinh từ log theo phiên tới React chỉ cần viết: khai báo sự kiện giá trị toàn phần, một lần `register` đơn vị phía host, phần merge `SessionProjectionMap` của riêng mình, và callback inject — không có code phía client, không sửa class `Session` của client, `ConversationSnapshot`, api-proxy hay bất kỳ file schema giao thức nào.
- Trang cuối lịch sử mang `projections`, `asOfSeq` của nó bằng seq đuôi cửa sổ; trang loadOlder không bao giờ mang; deployment chưa cài registry vẫn trả về lịch sử không có khối đó như bình thường, client coi mọi key là vắng mặt.
- Baseline lỗi thời không thể ghi đè lên khung `session/projection` mới hơn, khung được replay cũng không thể khiến kho giá trị lùi lại (cả hai đường đều có test seq-cao-hơn-thắng).
- Lệnh slash được thực thi trên một tab, sau khi refresh, trên tab thứ hai, sau khi restore, đều render ra node bền vững trong flow; lệnh chưa đăng ký render thẻ tổng quát; đường thông báo composer cho kết quả lệnh bị loại bỏ hoàn toàn.
- `useProjection` đến component qua bộ props chuẩn; không có hook nào xuyên qua convention inject (bao gồm `useSelection`).
- Tiêu đề phiên đi theo cặp cơ chế tổng quát này (khối baseline + khung chiếu); khung `session/title` chuyên dụng và bảng snapshot tiêu đề của client bị loại bỏ hoàn toàn.

## Rủi ro

- **Quy tắc giá trị toàn phần là kết cấu chịu lực**: nếu tương lai một lĩnh vực nào đó chỉ ghi delta trần, nó sẽ không thể phục vụ bên tiêu thụ bằng sự kiện mới nhất của mình, còn khiến đơn vị của chính nó phức tạp hơn. Giảm thiểu: quy tắc này được ghi rõ trong Note này và README của gói chiếu; convention đơn vị khiến trạng thái đầy đủ tường minh tại mỗi lần chuyển tiếp.
- **Kỷ luật đồng bộ của đơn vị**: `init`/`apply`/`view` một khi await sẽ xé toạc lát cắt nhất quán. Registry ghi rõ kỷ luật này trong tài liệu, invariant đi kèm khẳng định tính đồng bộ trong phạm vi khả thi; phần còn lại do review canh giữ.
- **Việc thêm/bớt registry theo thời gian thực không được push**: tải hoặc unmount plugin lĩnh vực giữa phiên sẽ thay đổi tập key, nhưng không kích hoạt bất kỳ sự kiện phiên nào, cũng không push bất kỳ khung nào; client đang mở giữ key lỗi thời cho đến lần kéo trang cuối tiếp theo (kết nối lại, vá lỗ hổng, mở). Chấp nhận đây là cửa sổ lỗi thời chỉ trong giai đoạn phát triển (HMR) — sau này có thể thêm một push thay đổi registry trên luồng thay đổi, convention không đổi.
- **Chi phí điều khiển chủ động trên phiên bận rộn**: mỗi sự kiện đã commit đều phải đi qua `apply` của mỗi đơn vị đã đăng ký. Theo cấu trúc, chi phí mỗi-sự-kiện của đơn vị rất thấp (quy tắc giá trị toàn phần), sự kiện không khớp trả về cùng tham chiếu, và số lượng lĩnh vực đã đăng ký nhỏ; nếu thực sự xuất hiện đường nóng, có thể thêm bộ lọc trước theo loại sự kiện của từng đơn vị, convention không đổi.
- **Payload chiếu phình to**: mỗi trang cuối mang theo mỗi key đã đăng ký. Payload là giá trị toàn phần của trạng thái tầm cỡ UI (một danh sách todo, một snapshot goal); tương lai nếu giá trị của một lĩnh vực nào đó lớn, có thể thêm opt-out theo từng key hoặc key lazy trên request, bản thân model không cần thay đổi.
- **Khối lượng log lệnh**: mỗi lệnh slash có hai sự kiện chỉ-log; giới hạn trên do tần suất người dùng gõ lệnh quyết định, không đáng kể so với khối lượng phân mảnh.
- **Chi phí làm lại khi kết nối lại**: ba PR chưa merge phải rebase lên nền tảng đã di chuyển. Đây là cái giá đã định trước của việc dựng hạ tầng trước.
