# Agent Note: Kiến trúc Web client — cây plugin client cordis, hệ thống slot và lớp đối tượng React-free

Status: implemented

[English](2026-07-19-gui-web-client-architecture.md) | Tiếng Việt

> Ranh giới phân công: mô hình phân tầng độc lập với kênh truyền và giao thức RPC (mô hình thông điệp / hệ thống kiểu / mặt giao ước / lớp cơ sở phía client) xem [ghi chú phân tầng và giao thức RPC](2026-07-19-gui-layering-and-rpc-protocol.md); bài này = phía trình duyệt: cây client cordis được nạp ra sao, plugin UI kết hợp với nhau qua slot và service thế nào, lớp đối tượng React-free cung cấp snapshot bất biến cho React như thế nào.

## Problem

Client trình duyệt bị định hình bởi hai lực. Thứ nhất là tính streaming: trong một UI hội thoại hướng sự kiện, nếu trạng thái nghiệp vụ (cửa sổ sự kiện, tích lũy dòng chảy, tương tác đang chờ trả lời, máy trạng thái kết nối) nằm rải rác trong các component React và global store, thì mỗi mảnh token đều làm rung động cây render, và đổi thư viện UI đồng nghĩa với viết lại logic nghiệp vụ. Thứ hai là tính mô-đun: các tính năng UI (bố cục, sidebar, hội thoại, chủ đề, gói ngôn ngữ) phải là những plugin nạp được độc lập — kết hợp lúc chạy theo manifest (bản kê metadata) do host phát xuống, chứ không phải biên dịch vào một bundle duy nhất — đồng thời không từ bỏ an toàn kiểu ở thời điểm biên dịch xuyên qua ranh giới plugin.

## Decision

Cả hai đầu đều chạy cordis. Host là một cây plugin cordis; trong trình duyệt chạy cây cordis thứ hai ở phía client, trong đó mọi năng lực UI đều là plugin, được nạp động bởi loader mà vỏ ứng dụng giữ tĩnh. Trong cây, cordis ctx mang toàn bộ sự thật lúc chạy (service, store, scope phiên), còn React chỉ là phép chiếu thuần túy: component không import gì từ framework, mọi thứ được tiêm qua props, và đăng ký nhận snapshot bất biến qua `useSyncExternalStore` (dưới đây gọi là uSES).

```
┌─ Host ─────────────────────────┐   ┌─ Browser ─────────────────────────────────────────┐
│ sessions/agents/SessionLog     │   │ client cordis root ctx                             │
│ apiproxy: RPC + mux/host 双流  │◀─▶│  ├ vendored Loader + ctx.modules（内核，壳静态持有）│
│ webserver:                     │   │  ├ immediately entries: connection/runtime/        │
│  ├ GET /plugins/<id>/client.js │   │  │   ui-theme/i18n（fetch bundle，boot 预拉）       │
│  └ GET / 注入 __DSH_BOOT__ 图  │   │  ├ lazy entries: layout/sidebar/                   │
│                                │   │  │   conversation/trajectory（fetch bundle，按需） │
└────────────────────────────────┘   │  ├ app-shell 伪行（壳内静态注册，同一治理）        │
                                     │  └ session scope ×N（观看驱动，惰性建）            │
                                     │ React: loading 页 → settled → 整 UI 一次成型       │
                                     └────────────────────────────────────────────────────┘
```

## Cây client cordis và chuỗi nạp

Chuỗi nạp — hai loại gói (gói thường vs plugin dsh.client), sự phân biệt giữa hệ mô-đun và bộ quản trị plugin, quá trình boot hai giai đoạn trên đồ thị entry mang số hiệu bản sửa đổi do host độc quyền soạn, và hot reload — thuộc về [ghi chú nạp plugin client](2026-07-23-client-plugin-loading-model.md). Những sự thật mà bài này dựa vào: trình duyệt khởi động cùng một `@cordisjs/plugin-loader` vendored như host, với giao ước `internal` của nó được hệ mô-đun client (`ctx.modules`, `packages/client/modules`) lấp đầy; mọi đơn vị mang hành vi sản phẩm đều là entry trong đồ thị `__DSH_BOOT__` do host độc quyền soạn — mỗi gói plugin production (kể cả hạ tầng) đều mang khai báo `dsh.client`, được cung cấp bởi bundle bao đóng tsdown `./client` đến qua fetch, các dòng `immediately` chỉ khác ở chỗ được prefetch trong giai đoạn đầu của boot, còn các gói thường (họ react, cordis, các thư viện chưa được nâng cấp) vẫn nằm trong vỏ, đã được gieo sẵn và vô hình với đồ thị; bundle thực thi `window.__ModuleLoader__.load({ id, factory })`, và `require` của nó được bảng mô-đun CJS lazy đáp ứng (mục gieo sẵn + factory đã đăng ký, vật chất hóa và ghi nhớ ở lần require đầu tiên — import giá trị xuyên plugin là lỗi build, hợp tác phải đi qua service cordis); CSS của plugin được nội tuyến trong bundle, khi vật chất hóa thì tiêm vào dưới dạng `<style data-plugin="<id>">` (băm CSS Modules + nhãn quy thuộc = cô lập, gỡ bỏ khi reload); hot reload đã có trong đồ thị dev — webserver stat-poll các bundle do chính nó cung cấp và phát khung SSE `rebuilt`, plugin `client-hmr` thay một fiber trên mỗi khung. Cú lật settled (`loader.await()` + một lượt quét toàn bộ ACTIVE) vẫn khiến vỏ chuyển một lần từ trang loading sang UI thật — settled nghĩa là mọi entry đã được tạo, mọi fiber đã đạt ACTIVE, còn các fiber FAILED/PENDING bị liệt kê thật to; không tồn tại chế độ khả dụng một phần (render tăng tiến là việc để sau).

Vũ trụ kiểu được tách ở tầng tổng hợp — `tsconfig.host.json` là program của host, `tsconfig.client.json` là program của client, cả hai được tsconfig gốc solution `tsconfig.json` tham chiếu, bởi vì hai phía cùng khai báo hợp nhất (declaration merging) trên cùng các khóa (`sessions`, `loader`) của `Context` cordis nhưng với service khác nhau; các gói client tiêu thụ từ vựng giao thức qua các subpath thuần kiểu (`@deepseek-ai/dsh-session/types`, v.v.), nên phần khai báo hợp nhất phía host không đi ké vào program của client.

## Hệ thống slot: trang được ghép ra sao

Hệ thống slot có ghi chú riêng — [chuẩn hệ thống slot](2026-07-22-slot-type-chain-implementation.md) — và bài này bàn giao trọn vẹn cho nó. Ở đây chỉ giữ một đoạn tóm tắt định vị: vỏ chỉ render `'root'`; plugin dùng một lần gọi `register` duy nhất để kết hợp UI — chiếm slot, khai báo và ủy quyền slot con (đối tượng spec `children`), khai báo store, tiêm mặt nghiệp vụ; props của component đến theo bốn phần được suy ra tự động (`PropsRuntime<K>` / `PropsRenderSlots<S>` / `PropsStore<H>` / inject), mỗi phần có một nguồn sự thật duy nhất. Khai báo hợp nhất `SlotMap` vẫn là thẩm quyền về kiểu, entry chỉ mang phần của owner («ai tiêm thì kiểu thuộc về người đó»); mỗi mục đăng ký được render đều nằm trong một error boundary riêng cho từng entry.

Nơi ở của phần hiện thực: lõi registry và các kiểu phần props nằm ở `packages/client/ui-slots`, còn component xuất ra / renderer / cầu nối uSES nằm ở `packages/client/web-react`.

## Service và định địa chỉ scope

Service là API duy nhất của một plugin dành cho các plugin khác (component UI và mặt tiêm đều không phải API; plugin không ai gọi thì không gắn service — ui-trajectory chính là mẫu plugin tối thiểu: không có service trên ctx, chỉ đăng ký slot khung nhìn). Danh sách: `ctx.connection` (api client + handle dòng chảy), `ctx.slots` (lớp bọc registry, phát `slots/changed`, điểm vào render, giao ước cài đặt renderer), `ctx.sessions` (store danh sách, trạng thái phiên hiện tại, cây scope), `ctx.loader`, `ctx.theme`, `ctx.i18n`, `ctx.layout` (điều hướng khung nhìn xuyên plugin), `ctx.conversation` (send/cancel/startSession). Trạng thái xem trước đây nằm trong store của service (bề rộng panel, lựa chọn, bản nháp) nay nằm trong store do entry khai báo theo [chuẩn hệ thống slot](2026-07-22-slot-type-chain-implementation.md).

Ngoài slot không tồn tại mô hình đăng ký component thứ hai — vòng khung nhìn và vòng công cụ trước kia đều đã hòa tan vào đây. Khung nhìn phiên chính là entry của list slot `'conversation.view'` do ui-conversation khai báo, metadata tab đi kèm options lúc đăng ký (`id`/`order`/`label`), còn chrome riêng của từng khung nhìn nằm trong chính component khung nhìn. Cuối cùng, Node nghiệp vụ Chat được điều phối qua slot keyed/session `'conversation.chat.node'`; ui-tool sở hữu entry `tool-call` trong đó, render đệ quy các `subCalls` được truyền vào, và khai báo slot con keyed/session `'tool.call.toolview'`. Không gian khóa vẫn mở lúc chạy (SlotMap khai báo slot, không bao giờ khai báo khóa), root và hậu duệ ở độ sâu bất kỳ đều điều phối theo `entryKey: toolName`, với `GenericToolCard` làm phương án dự phòng. Gói nghiệp vụ đăng ký khung nhìn nguyên tử qua `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: '<tool>' }, Row))`; bản thân khai báo chính là phụ thuộc để nạp và reload ([quyết định](2026-08-05-slot-declaration-injection.md)). ui-conversation còn ủy thác phần thân chi tiết của call được chọn qua `'conversation.details.tool'`, giữ cho card model của ui-tool là chủ sở hữu trình bày duy nhất, đồng thời tránh việc conversation import component Tool. Registry sự kiện và registry khung nhìn không liên quan tới target là seam lắp ráp dữ liệu, không phải registry component song song ([quyết định](2026-08-09-client-conversation-node-assembly.md)).

**Định địa chỉ scope** đồng cấu trúc với quy ước scope của agent (tác tử thông minh) phía host: service là singleton ở root, phương thức không nhận sessionId — chúng đọc nhãn scope trên ctx của bên gọi (`scopeOf(ctx)`). Bên trong scope phiên, `ctx.conversation.send('hi', 'queue')` tự động trúng phiên đó; gọi xuyên phiên thì đổi ctx để định hướng (`ctx.sessions.scope(id)!.conversation.send(...)`); gọi thẳng phương thức scoped từ ctx root sẽ throw. Scope phiên phía client được đúc theo cùng cách với agent scope phía host (fiber plugin no-op + extend khóa scope), được tạo lười khi xem lần đầu, và chỉ tháo khi phiên bị gỡ mà không còn ai xem — riêng việc phiên chết ở host thì không tháo scope (đóng băng thành ô cửa chỉ đọc).

## Lớp đối tượng dữ liệu (`packages/client/runtime/src/client/sessions/`)

Khung đi vào từ đây, snapshot đi ra từ đây, còn Conversation assembler ngồi ở giữa — React-free (không import React, có thể khẳng định bằng grep):

```
mux/host frames (ConnectionController pump, injected sinks)
        │
        ▼
SessionManager.handleMuxEnvelope / handleHostEnvelope
        │ session frames target existing instances (requested waits buffer)
        ▼
Session.handleMuxEnvelope ──► contiguous Event window
        │                        │ replace / prepend / append
        │                        ▼
        │                ConversationNodeAssembler
        │                  Definitions -> Contexts -> view builders
        ▼
Notifier 微任务合批 ──► ConversationSnapshot 缓存 ──uSES──► 组件
```

- **Session** (session.ts): tạo lười, thường trú — sau khi tạo thì tiếp tục ăn khung ở nền, chuyển đi rồi quay lại là hiện ngay. Mặt thao tác: `prompt`/`cancel` (truyền thẳng RPC; thất bại rơi vào `promptError` của snapshot), `open` (kéo trang history cuối, idempotent), `loadOlder` (lật trang lên trên, chống tái nhập), `resync` (kết nối lại = xóa cửa sổ và chạy lại open). Mặt đăng ký: `subscribe`/`getSnapshot` (luôn trả về tham chiếu đã cache) — `implements ObservableSnapshot<ConversationSnapshot>`, lúc khởi tạo gắn `useSelector = bindSnapshotSelector(this)`, nên bản thân Session chính là nguồn uSES. Việc phân phối khung là một switch: khung `session/event` được khử trùng lặp theo seq (khóa khử trùng lặp duy nhất), đệm lại khi open đang trên đường, ngược lại thì nối thêm + chiếu tăng tiến; open/khâu nối hợp nhất bộ đệm live theo seq và khử trùng lặp, nếu `subscribed.lastSeq` vượt quá đuôi cửa sổ thì bù lại một lần.
- **ConversationSnapshot** (conversation.ts): giao ước snapshot bất biến ở tầng trên cùng. `chat` chứa `order` có cấu trúc, Node reader theo khóa với identity ổn định, index Turn/Step và timeline; `nodes`, `partial`, `runningCalls`, `turnTimings`, `turnEnds` là các lát tương thích dành cho những bên tiêu thụ Trajectory chưa di trú. Tương tác đang chờ, hàng đợi, đang chạy, đã gỡ, trạng thái open, phân trang và lỗi prompt vẫn là thông tin của Session. **Kỷ luật tham chiếu** (tiền đề của memo và uSES): các cấu trúc con và giá trị Node không đổi thì giữ nguyên tham chiếu; một lần cập nhật nghiệp vụ đơn lẻ chỉ thay giá trị của khóa tương ứng, trừ khi thứ tự hoặc Location của nó thay đổi. React vẫn chỉ đăng ký đúng một observable source là Session, và dùng `useSession(selector)` do framework cung cấp để cô lập các cập nhật gộp của Node và Location.
- **SessionManager** (manager.ts): cụm instance + cửa vào duy nhất của khung + danh sách phiên. Khung có sessionId chỉ được ném vào instance đã tồn tại (mux broadcast không được phép khiến mọi phiên đều bị khởi tạo); ngoại lệ là các khung `requested` của phê duyệt/hỏi đáp — chúng không rơi vào history, open không bù lại được, nên được đệm vào `pendingBuffers` và phát lại khi khởi tạo.
- **Notifier** (notifier.ts): hai kênh thông báo, dùng tùy theo nguồn thay đổi. `markDirty()` (mặc định; mọi thứ do khung điều khiển đều dùng nó) gộp lô theo microtask — N lần thay đổi, một lần thông báo, một lần render lại; flush thì dựng lại cache snapshot trước rồi mới thông báo. `notifyNow()` (chỉ dành cho tiếng vọng trực tiếp của thao tác người dùng) dựng lại và thông báo ngay trong cùng tick — nếu tiếng vọng của input được kiểm soát bị hoãn tới microtask, DOM sẽ lùi lại và con trỏ nhảy về cuối. Mã do khung điều khiển mà dùng notifyNow sẽ làm việc gộp lô sụp về render từng khung; cấm.
- **ConversationNodeAssembler** (`runtime/src/client/conversation/`): động cơ tăng tiến do Session sở hữu, chạy các Definition được đăng ký độc lập trên sự kiện thô. `match(event)` chọn ra `(kind, id)` mà không cần quét Context; start/update dựng state của Definition; Location do động cơ tính mang thông tin đóng Turn/Step; khi truy vấn Context về phía trước thì ghi lại phụ thuộc, và được các lần prepend sau đó sửa lại; `buildViewNode(target)` chỉ vật chất hóa Context bẩn. Chat builder giữ thứ tự cấu trúc và identity giá trị theo từng khóa, selector `useSession` lo phần cô lập tiêu thụ, còn việc phát token của Assistant thì gộp lại mỗi animation frame một lần. [Quyết định Conversation Node](2026-08-09-client-conversation-node-assembly.md) sở hữu ranh giới lắp ráp, [Quyền sở hữu trình bày Tool](2026-08-08-client-tool-presentation-ownership.md) sở hữu phần render đệ quy của Tool.
- **ConnectionController** (nằm ở `packages/client/connection`): mở song luồng mux/host, bơm vào bằng for-await, kết nối lại với exponential backoff bên trong hàng rào thế hệ (500ms nhân đôi tới trần 10s, có jitter, thử lại vô hạn); sink được tiêm một chiều (Controller không biết tới Session). Kết nối lại = dựng lại: `onConnected` → làm mới danh sách + resync từng phiên đang mở. Lớp đối tượng chỉ hướng tới `IApiClient`; phần chuyên chở Web dùng HTTP POST để tải hai góc phần tư client→server, và dùng [mỗi luồng logic một WebSocket](2026-08-04-websocket-downlink-carrier.md) để tải hai góc phần tư server→client, còn họ lớp client thì thuộc địa phận ghi chú phân tầng.

## Mặt React (`packages/client/web-react`)

Gói keo này chính là toàn bộ ranh giới ctx↔React; component vẫn không phụ thuộc framework nào.

- Động cơ store snapshot **nằm trong gói runtime** (zustand vanilla + cập nhật kiểu bản nháp, mặc định `flush: 'sync'`, tùy chọn gộp lô `'raf'`, tùy chọn lưu bền toàn giá trị vào localStorage, deep-freeze ở dev — tất cả được export từ đầu ra chính `./client` của `runtime`, không có subpath): sản phẩm store là nguồn quan sát trần trụi, không mang bất kỳ thành viên hook nào. Plugin chỉ chạm tới động cơ qua khai báo `defineStore` của [chuẩn hệ thống slot](2026-07-22-slot-type-chain-implementation.md). web-react tổng hợp từng hook ngay tại chỗ ràng buộc (`bindSnapshotSelector`, cache theo nguồn) từ giao ước dữ liệu duy nhất mà React tiêu thụ: `ObservableSnapshot<T>` (`getSnapshot`/`subscribe`) — đối tượng Session và store snapshot đồng cấu trúc nên đều thỏa mãn nó. Các gói plugin nghiệp vụ chỉ phụ thuộc runtime và ui-slots; web-react là lớp keo chỉ vỏ mới dùng được.
- `bindSnapshotSelector(source)`: ràng buộc một nguồn thành hook selector có kiểu thông qua uSES-with-selector. Bốn giao ước của uSES thành lập theo cách xây dựng: getSnapshot luôn trả tham chiếu đã cache; subscribe là bao đóng ở thời điểm ràng buộc (tham chiếu vĩnh viễn ổn định); CSR thuần thì không truyền server snapshot; so sánh bằng mặc định là `Object.is`, mỗi lần gọi có thể tùy chọn `shallowEqual`.
- `useInvoke(fn)`: bọc một hành động bất đồng bộ thành trigger có tham chiếu bất biến kèm cờ pending; pending được đọc ra từ external store riêng của mỗi hook qua uSES (đường render không có setState), các lần gọi đồng thời được đếm, và tham chiếu invoke không bao giờ đổi.
- Giao thức so sánh bằng, nhất quán toàn chuỗi: đầu sản xuất chia sẻ cấu trúc; bên tiêu thụ đoản mạch bằng `Object.is` hoặc `shallowEqual`; `React.memo` so sánh nông. Cấm so sánh sâu trên toàn chuỗi.

## Hình thái thư mục

Các gói client nằm ở `packages/client/*`, còn `apps/web` là một ứng dụng Vite mỏng dựng trên phần export boot của vỏ. Nửa trình duyệt của gói plugin nằm dưới `src/client/`; **mọi sản phẩm build đều rơi vào `lib/`** — nửa node là `lib/index.js`/`lib/invariant.js`, bundle trình duyệt là `lib/client.js` (preset tsdown client dùng chung xuất ra cả hai; không có thư mục `dist/`, `exports["./client"]` trỏ tới `./lib/client.js`). `ui-slots`, web-react và runtime tạo thành hướng hạ tầng; plugin tính năng hợp tác qua service và slot, không import phần hiện thực trình bày.

Nửa client của gói plugin đa lĩnh vực còn được tách tiếp theo ranh giới gói tương lai — ui-conversation chính là mẫu:

```
src/client/
  contract/    shared slot and cross-domain types
  service.ts   cross-domain orchestration
  skeleton/    conversation shell and details host
  conversation-nodes/ independently registered business Definitions and Chat builder
  chat/        ordered conversation view
  input/       composer state machine
  queue/       queued-message presentation
  settings/    conversation settings rows
  apply.ts     cross-domain assembly point
  index.ts     public contract surface
```

Các tệp hiện thực của từng lĩnh vực không import lĩnh vực anh em; mặt dùng chung đều đi qua `contract/`. `scripts/verify-client-domain-graph.ts` canh giữ phân tầng (contract=0, domain=1, apply/index=2; import chỉ được trỏ tới tầng không cao hơn chính nó; phụ thuộc giữa các lĩnh vực anh em sẽ fail). Phần trình bày Tool đã được tách thành gói `ui-tool` độc lập, chỉ đến được chat và details qua các slot do ui-conversation khai báo.

## Cách phát triển

- **Tính năng UI mới** = gói plugin mới: package.json khai báo `dsh.client` (+ topo `inject`), nửa trình duyệt viết trong `src/client/` (apply gắn service/dựng store, đăng ký slot), khi không có logic host thì nửa node giữ apply rỗng, và build bằng preset dùng chung. Thêm plugin vào cấu hình host; manifest và việc nạp sẽ tự động theo sau.
- **Slot mới**: xem [ghi chú chuẩn hệ thống slot](2026-07-22-slot-type-chain-implementation.md) — giao ước hợp nhất vào `SlotMap`, khai báo trong `children` của entry cha, render qua prop `renderSlot` được tiêm tự động. Không bao giờ export component ra toàn cục.
- **Tiêu thụ loại khung mới**: session frame thuần truyền tải → switch phân phối của Session; frame cấp host → bảng định tuyến của Manager; sự kiện nghiệp vụ conversation đã được ghi log → thêm keyed view renderer cho Definition, không thêm nhánh nghiệp vụ vào Session.
- **Trạng thái ở đâu**: dữ liệu nghiệp vụ (sự kiện, dòng chảy, chờ trả lời) → luôn ở lớp đối tượng; thứ mà cha biết → props của owner ngay tại chỗ renderSlot; thứ riêng tư của một component (cuộn, từ khóa tìm kiếm, tập mở rộng) → state của component; thứ chia sẻ xuyên entry hoặc sống sót qua remount (lựa chọn, bản nháp, bề rộng panel) → store do entry khai báo ([chuẩn hệ thống slot](2026-07-22-slot-type-chain-implementation.md)).
- **Kênh thông báo**: do khung điều khiển/bất đồng bộ = `markDirty` gộp lô; input được kiểm soát cần tiếng vọng trực tiếp của thao tác người dùng ngay trong cùng tick = `notifyNow`.

## Consequences

Dòng token không còn làm rung cây render: mảnh Assistant chỉ cập nhật một Context nghiệp vụ, và mỗi animation frame nhiều nhất phát ra một lần Node keyed tương ứng; kết quả selector của các dòng không liên quan giữ nguyên tham chiếu, nên không render lại. Tính năng UI được nạp, hỏng, và tắt ở mức hạt của plugin độc lập — một mục đăng ký slot bị sập chỉ làm đen một tấm card, một bundle nạp lỗi sẽ báo lỗi thật to trước khi UI vào cuộc. Cái giá phải chấp nhận: cơ cấu loader/bảng mô-đun là hạ tầng tùy biến do đội tự gánh từ đầu tới cuối; khởi động thành hình một lần (không render tăng tiến) đánh đổi độ hạt của màn hình đầu lấy sự đơn giản khi lắp ráp; hai program kiểu khiến «tệp này thuộc bộ tổng hợp nào» thỉnh thoảng trở thành câu hỏi mà lập trình viên phải trả lời.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Một SPA bundle liên kết tĩnh | Plugin phải do host kết hợp lúc chạy theo cấu hình; khối nguyên khối lại ghép chặt mọi tính năng UI vào một lần build |
| Dùng biến toàn cục window / import map cho phụ thuộc dùng chung | Bảng require DI khiến việc dùng chung trở nên tường minh, fail thật to, và thay thế được; biến toàn cục rò rỉ identity và phiên bản trong im lặng |
| Đưa dữ liệu nghiệp vụ vào các lát zustand | Cửa sổ sự kiện/bộ tích lũy là máy trạng thái hành vi, không phải lát phẳng; lớp đối tượng giữ được khả năng kiểm soát độ hạt snapshot và việc gộp lô |
| Dùng registry component khóa chuỗi song song cho dòng Tool | Slot con keyed của ui-tool chuyên chở tập tên Tool mở lúc chạy thông qua mô hình đăng ký slot duy nhất ([hòa tan toolview](2026-07-23-toolview-dissolution.md)) |
| Làm khởi động tăng tiến/Suspense ngay ở bản web client đầu tiên | Thành hình một lần đơn giản hơn hẳn; mặt trạng thái theo từng plugin của loader đã được giữ lại, nên việc thắp sáng tăng tiến có thể làm sau mà không cần tái cấu trúc |
