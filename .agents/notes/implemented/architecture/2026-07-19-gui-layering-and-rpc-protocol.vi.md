# Agent Note: Phân lớp GUI và protocol RPC — host/client phân lớp theo phía cung cấp năng lực, mô hình message bốn góc phần tư, và carrier fetch

Status: implemented

[English](2026-07-19-gui-layering-and-rpc-protocol.md) | Tiếng Việt

> Ranh giới phân công: bài này = mô hình phân lớp + protocol RPC độc lập với kênh truyền; implementation Web của protocol gồm HTTP đường lên cộng [carrier đường xuống WebSocket](2026-08-04-websocket-downlink-carrier.md), lớp đối tượng trình duyệt xem tại [Agent Note về kiến trúc Web client](2026-07-19-gui-web-client-architecture.md).

## Problem

Cần cung cấp lớp đấu nối UI, ngoài baseline ACP (Agent Client Protocol)/stdio hiện có, còn cần Web (server), Electron và các client sản phẩm khác. Chúng tôi gọi chung chúng là Client. Muốn có các năng lực sau:
- Một tiến trình `dsh` đồng thời hỗ trợ `dsh web` (khởi động) và `dsh --profile headless` (headless), một tiến trình hai mode (dự trù thiết kế)
- Khởi động trong Electron dùng cùng công nghệ Web như `dsh web`

Vậy code kỹ thuật hiện tại cần một mô hình trách nhiệm phân lớp ổn định, để dễ dàng tích hợp các loại client sau này.

Đồng thời kênh vật lý của mỗi phía tiêu thụ khác nhau (HTTP/WebSocket trình duyệt, fetch/SSE trong tiến trình, IPC trong tương lai), còn cần một mô hình message độc lập với kênh truyền và một nguồn sự thật quy ước duy nhất, để "thêm một phương thức" hay "đổi carrier" không ràng buộc lẫn nhau, và mỗi message trên đường dây (wire) có thể kiểm tra kiểu, quan sát được, và đối soát được.

## Decision

### Phân lớp

Thư mục được phân lớp như sau:
- `packages/host/*`: package chỉ cung cấp năng lực phía Host (đại diện cho phần lõi công trình Node.js hiện lấy hệ thống plugin thực thể Harness làm chủ thể), ngoài ra còn chứa
    - Định nghĩa và hỗ trợ protocol backend thống nhất (fetch, HTTP, interface streaming, v.v.), xem các mục từ "Protocol Message" trong bài này
- `packages/client/*`: package chỉ cung cấp năng lực phía Client, mỗi package không trộn hai phía. Ở đây có ba loại package (hai trục thuộc về [Agent Note về mô hình load plugin client](2026-07-23-client-plugin-loading-model.md)):
    - **Thư viện thuần** (`ui-slots`, `web-react`, `ui-primitives`, cộng package nhân `loader`): package entry gốc thông thường, được đóng gói tĩnh vào shell; ba package đầu được gieo (seed) vào bảng module.
    - **Package entry đến tĩnh** (`connection`, `runtime`, `ui-theme`, `i18n`, `hmr`): không có key `dsh.client`, không có bundle trình duyệt — shell đóng nửa `src/client/` của chúng vào bundle của chính nó và đăng ký với `ctx.modules`; chúng cùng với các đơn vị còn lại, được quản trị như entry trong đồ thị do host viết riêng.
    - **Package plugin đến qua fetch** (`ui-layout`, `ui-sidebar`, `ui-conversation`, `ui-trajectory`): entry kép — entry gốc là nửa node (`apply` rỗng, tồn tại để host Loader quản lý vòng đời, để registry plugin web phát hiện khai báo `dsh.client` trong package.json); implementation nằm dưới `src/client/`, phát hành qua subpath `./client` (bundle bằng closure factory của tsdown). Việc tiêu thụ `/client` xuyên plugin chỉ giới hạn ở kiểu; hợp tác ở mức giá trị đi qua dịch vụ cordis.
- `apps/` là entry ứng dụng export ra bên ngoài, có thể lắp ráp hỗn hợp bởi Client / Host.
    - `apps/web` (`dsh-web-frontend`) là ứng dụng vite: một lớp `main.ts` mỏng trên API shell mà `dsh-client-web` export.
    - `apps/cli` (`@deepseek-ai/dsh`) phân phối lệnh: `dsh web` = Host + webserver + `dsh-web-frontend` dist đã build; `dsh --profile headless` = [entry dùng trực tiếp core Agent/Session](2026-08-09-headless-direct-core-entry-point.md), không có Host, HTTP hay lớp trình duyệt.
    - Ứng dụng Electron trong tương lai tái sử dụng cùng bộ package client web qua carrier fetch IPC.

```
apps/*  (applications: apps/web = vite app, apps/cli = bin dispatch)
  │ consume
  ▼
packages/host/*                      packages/client/*
  apiproxy   front layer: protocol     pure libs: ui-slots / web-react / ui-primitives
  runtime    assembly / host entity    dsh.client plugins ×8 (node half = empty apply,
  webserver  Web HTTP carriage                              client half = src/client/)
  │ ctx.plugin(...)                      ▲ import only apiproxy's /api /client subpaths
  ▼                                      │ (type-only + the client base class)
harness core packages ──────────────────┘ (types reach the browser via import type)
```

Kỷ luật hướng (mỗi điều đều có thể kiểm chứng qua deps của package):

- `runtime → apiproxy` một chiều; apiproxy chỉ phụ thuộc vào định nghĩa kiểu.
- Package phía client **không bao giờ import** runtime của package phía host (chỉ ăn hai subpath an toàn cho trình duyệt là `/api`, `/client`).
- `webserver` không phụ thuộc `runtime`: nó cung cấp implementation cụ thể `{ fetch }` — "webserver ← runtime" chỉ là quan hệ inject runtime, không phải phụ thuộc package.
- Import package plugin xuyên package ở phía client luôn đi qua subpath `/client`, và giữa các package plugin chỉ giới hạn import kiểu — import giá trị xuyên plugin sẽ là lỗi build ngay tại cổng kiểm tra độ thuần khiết (purity gate) của tsdown (hợp tác ở mức giá trị đi qua dịch vụ cordis; quy tắc cạnh thuộc về [Agent Note về mô hình load plugin client](2026-07-23-client-plugin-loading-model.md)).

TypeScript kiểm tra bằng **hai aggregate program** được tham chiếu từ gốc solution (`tsconfig.json` = solution; `tsconfig.host.json` = phía host + test, loại trừ `packages/client`; `tsconfig.client.json` = các package client và test của chúng): cả hai phía hợp nhất interface cordis `Context` bằng các dịch vụ khác nhau dưới cùng key (`sessions`, `loader`), một program duy nhất sẽ đồng thời thấy hai lần hợp nhất khai báo và báo xung đột. Package lá dùng chung (session/llm/tools/apiproxy, v.v.) chỉ build một lần, được cả hai program cùng tham chiếu ([cấu trúc topology](../process/2026-07-22-tsconfig-solution-root-two-aggregates.md)).

Phía protocol: TS interface (`packages/host/apiproxy/src/api/`, zero Node dependency, trình duyệt import được); message trên đường dây thống nhất thành **mô hình hai chiều** — mỗi message logic được phân loại theo "ai khởi tạo × request/response" (hai trục bốn ô, sau đây gọi là bốn góc phần tư), tách rời khỏi kênh vật lý; client thống nhất kế thừa `AbstractApiClient` (mọi bất biến thức của protocol nằm ở lớp cơ sở, khác biệt nền tảng chỉ là mặt cắt truyền tải `doFetch`).

#### Vai trò phân lớp

| Lớp | Package | Trách nhiệm | Kỷ luật quan trọng |
|---|---|---|---|
| Lớp tiền tuyến | `dsh-host-apiproxy` | Định nghĩa TS/zod (api/) + trừu tượng fetch (fetch/: handler + lớp cơ sở client) | Làm đơn giản, mọi phía tiêu thụ đều cần; Node/trình duyệt đều import được; nội dung protocol xem các mục "Protocol Message" bên dưới; client không được vòng qua ctx để né api |
| Lớp lắp ráp | `dsh-host-runtime` | Tổ hợp plugin + tích hợp ApiProxy + gắn plugin web UI (bao phủ cây Loader trong bộ nhớ của tám package dsh.client); nơi thuộc về cấu hình cấp host (defaults/persistenceRoot, profile người dùng tương lai) | Load plugin nào, dùng giá trị mặc định gì chỉ định nghĩa ở đây; shell không được sửa việc lắp ráp |
| Lớp mang tải | `dsh-host-webserver` | HTTP Web và upgrade: static serving + chuyển tiếp `/api/*`→handler + route upgrade WebSocket + ngữ nghĩa close; endpoint bundle plugin + inject manifest (metadata clean) `__DSH_BOOT__` (do registry plugin web cung cấp) | Chuyên dụng cho Web (truy cập trình duyệt); zero workspace dependency (registry đến qua inject cấu trúc); Electron không tái sử dụng nó |
| Thư viện client | `dsh-client-ui-slots` / `dsh-client-web-react` / `dsh-client-ui-primitives` | Lõi registry slot / keo dán ctx↔React / component nguyên tử React thuần | Component zero cordis runtime dependency; do shell gieo vào bảng module loader |
| Plugin client | `dsh-client-connection` / `dsh-client-runtime` / `dsh-client-ui-theme` / `dsh-client-i18n` / `dsh-client-ui-layout` / `dsh-client-ui-sidebar` / `dsh-client-ui-conversation` / `dsh-client-ui-trajectory` | Cây plugin cordis phía trình duyệt (phía tiêu thụ wire, dịch vụ lõi, theme, i18n, layout, sidebar, hội thoại, trajectory) — xem Agent Note về kiến trúc Web client | Entry kép (nửa node = apply rỗng; implementation ở `src/client/`); mặt tiêu thụ duy nhất qua ApiProxy |
| Ứng dụng | `@deepseek-ai/dsh` (apps/cli) + `dsh-web-frontend` (apps/web, ứng dụng vite) | Phân phối粗 bin + mỗi ứng dụng một module lắp ráp (web.ts / headless.ts); ứng dụng vite là main mỏng trên bề mặt shell `dsh-client-web` | Mỗi ứng dụng dùng dynamic import, do đó không load lẫn nhau; kiến thức workspace như định vị dist ở lại trong app |

#### Quy tắc đặt tên

Tên package dưới `packages/host/*` và `packages/client/*` **phải chứa tiền tố nhóm thư mục**: host/runtime → `dsh-host-runtime`, client/runtime → `dsh-client-runtime`. Tên thư mục không lặp lại tiền tố nhóm (host/ đã thể hiện). Do đó đoạn cuối tên package ≠ tên thư mục, wildcard `dsh-*` của tsconfig.base.json (resolve theo tên thư mục) không khớp được — **mỗi package trong hai nhóm này cần mục paths tường minh**, và subpath `/client` của mỗi package client cần liệt kê riêng một mục, để việc resolve ở cấp source code nhất quán với exports map.

#### Cách tích hợp một ứng dụng mới (checklist thao tác)

1. **Chọn cách giả lập (fake) fetch**: HTTP cùng origin trên trình duyệt / inject `host.handler.fetch` trong tiến trình / tự viết subclass mặt cắt truyền tải (như Electron IPC tương lai, xem "bảng subclass" bên dưới).
2. **Viết module lắp ráp dưới `apps/`**: `startHost()` + subclass client + ngữ nghĩa signal/print/exit riêng của ứng dụng đó; thể hỗn hợp không tạo package riêng, việc lắp ráp viết trong app.
3. **Chỉ import `dsh-host-webserver` khi cần HTTP carrier**, nếu không thì zero port.

Hai ứng dụng hiện có giữ sự phân biệt này: ứng dụng Web gắn tổ hợp Host, carrier và trình duyệt, còn `dsh --profile headless` gắn runner dùng trực tiếp dịch vụ lõi, không chứa Host, HTTP hay port. Cầu nối protocol dạng ACP không tuân theo checklist carrier client: nó phơi bày core ra hệ sinh thái bên ngoài, gắn trực tiếp qua `ctx.plugin(entry plugin)`, không dùng fetch.

## Protocol Message

Các mục dưới đây là bản thân protocol do lớp tiền tuyến (`dsh-host-apiproxy`) mang tải. Trên đường dây chỉ có bốn loại message (bốn góc phần tư) — cột phải là carrier Web chỉ là ví dụ, khi đổi carrier (trong tiến trình/IPC) bốn góc phần tư không đổi:

```
                 client khởi tạo                  server khởi tạo
  request   ① ClientRequest                 ③ ServerRequest
            （body của POST /api/<method>） （WebSocket message: event session, approval/question requested）
  response  ② ServerResponse                ④ ClientResponse
            （body phản hồi HTTP của POST đó） （body của POST /api/respond, điền lại rpcId của ③）
```

(Ghi chú: "client 发起" = client khởi tạo, "server 发起" = server khởi tạo; "该 POST 的 HTTP 应答体" = body phản hồi HTTP của POST đó; "回填 ③ 的 rpcId" = điền lại rpcId của ③.)

### Hình dạng đầy đủ trên đường dây: union bốn thành phần có判别 (discriminated union) được đặt tên (`api/rpc.ts`)

| Kiểu | Tag phân biệt | Trường | rpcId thuộc về | Carrier Web |
|---|---|---|---|---|
| `ClientRequest` | `'client-request'` | `rpcId` `method` `payload` | client mint | body của `POST /api/<method>` |
| `ServerResponse` | `'server-response'` | `rpcId` `result` | điền lại ① | body phản hồi của POST đó (luôn HTTP 200) |
| `ServerRequest` | `'server-request'` | `rpcId` `method` `payload` | server mint | WebSocket text message |
| `ClientResponse` | `'client-response'` | `rpcId` `result` | điền lại ③ | body của `POST /api/respond` |

`RpcMessage = ClientRequest | ServerResponse | ServerRequest | ClientResponse`, thu hẹp bằng `switch (message.type)`.

**Kỷ luật rpcId** (`RpcId` là branded string, constructor `RpcId()`):

- Ai khởi tạo, người đó mint; response luôn điền lại rpcId của request tương ứng, **không bao giờ mint id mới**.
- server-request chia hai loại, phân biệt tĩnh theo `method` (=type của frame), **không đặt loại thứ ba**: frame có thể trả lời (`approval/requested`, `question/requested`) có rpcId là id request logic ổn định (mint một lần khi tiếp nhận, replay baseline dùng lại nguyên trạng, client điền lại nó vào response); frame chỉ đẩy thuần túy (`session/event`, v.v.) có rpcId nhận diện lần đẩy đó (mint mới mỗi lần).
- Business code không mint: việc mint của unary được thu gọn tại lớp cơ sở client `callUnary`, việc mint của frame được thu gọn ở phía host.

### Hình dạng hẹp của chữ ký và việc bổ sung của carrier

Chữ ký interface lĩnh vực chỉ nhận biết hình dạng hẹp: `RpcRequest<P> = { rpcId, payload }`, `RpcResponse<T> = { rpcId, result: RpcResult<T> }`. Lớp carrier bổ sung hình dạng hẹp thành hình dạng đầy đủ (bổ sung tag `type` và `method`), hướng không dựa vào suy luận từ kênh truyền. `RpcResult<T> = { ok: true; value } | { ok: false; error: RpcError }` — phương thức không throw lỗi business.

### RpcReceipt: biên nhận của carrier

Body phản hồi HTTP của `ClientResponse` là `RpcReceipt = { accepted: true } | { accepted: false; reason: 'not-pending' | 'bad-response' }` — biên nhận của lớp carrier, **không phải** RpcMessage (response không có response nữa); response tới muộn/trùng lặp nhận `not-pending`, điểm hội tụ logic là frame `*/resolved`.

## Hệ thống kiểu: chữ ký hàm chính là nguồn sự thật

### RpcMethodMap và generic phái sinh (`api/rpc-map.ts`)

Cấu trúc tham số/giá trị trả về của phương thức **chỉ nằm trong chữ ký phương thức của interface**; map chỉ đăng ký bản thân phương thức; mọi vị trí khác (handler, client, store, test) tham chiếu generic phái sinh, cấm sao chép lại literal hoặc tạo kiểu có tên riêng biệt khác:

```ts ignore-check
export interface RpcMethodMap {
  'session.list': SessionsApi['list']        // map key chính là đoạn path trên wire
  // …các phương thức còn lại đăng ký cùng hình dạng, tập đầy đủ xem api/rpc-map.ts
}
// generic phái sinh (xuyên qua hình dạng hẹp để lấy kiểu business; khai báo thực tế có ràng buộc K extends keyof RpcMethodMap)
export type RequestPayload<K> = Parameters<RpcMethodMap[K]>[0]['payload']
export type ResponseValue<K> =
  Awaited<ReturnType<RpcMethodMap[K]>> extends RpcResponse<infer T> ? T : never
```

Phương thức stream (`events.mux`/`events.host`) không vào map (không phải unary); `respond` không vào map (là client-response, không phải lời gọi phương thức).

### Mô hình lỗi (`RpcErrorDetailsMap`)

Ví dụ error code một dòng:

| code | details | Khi nào |
|---|---|---|
| `bad-request` | `{ issues: ZodIssue[] }` | Xác thực zod của wire/payload thất bại |

Tập code đầy đủ xem `RpcErrorDetailsMap` trong `api/rpc.ts`. `RpcError` là union phân tán được map mở rộng: `code` phân biệt, `switch` xong `details` tự động thu hẹp; **details là bắt buộc** — code mới = thêm một dòng vào map + thêm một nhánh vào error schema, thiếu điền là lỗi biên dịch. Lỗi transport (mất mạng, host chưa khởi động) do carrier ném exception, không trộn lẫn với hai tầng lỗi business.

### Xác thực và neo hai chiều của zod

- **Parse hai cấp**: parse toàn bộ schema một lần (cấu trúc type/rpcId/method + handler xác thực path==method) → phân phối parse lần hai theo method/loại frame cho payload business; từ chối = `bad-request`.
- **Neo**: schema thống nhất `satisfies z.ZodType<Wire<T>>` (`api/rpc.schema.ts`). `Wire<T>` là việc mở rộng "| undefined" sâu — repo bật `exactOptionalPropertyTypes` còn `.optional()` của zod xuất ra `T | undefined`, neo trực tiếp kiểu gốc sẽ không dùng được toàn tuyến; trên wire JSON, việc vắng mặt và undefined cùng hình dạng, việc mở rộng không mất ngữ nghĩa xác thực. Nhánh truyền qua mở rộng (`SessionEvent`/`ContentBlock`/union frame/`RpcError`) và schema id brand dùng cast tường minh kèm comment.
- Điểm cast brand duy nhất: cast id trong mỗi file schema thu gọn về một chỗ (`rpcIdSchema` là điểm cast duy nhất trong rpc.schema.ts).

## Mặt quy ước (ApiProxy)

Interface gốc `ApiProxy = { sessions, host, events, respond }` (`api/index.ts`). Lĩnh vực client-request mới = một cặp file mới (`<lĩnh vực>.ts` + `<lĩnh vực>.schema.ts`) + một trường trong interface gốc + thêm một dòng vào map.

### Bảng phương thức unary

Ví dụ phương thức một dòng (cấu trúc bảng chính là cách đọc):

| method key | request payload | giá trị trả về | Ngữ nghĩa |
|---|---|---|---|
| `session.list` | `{ cursor?: string }` (cursor giữ chỗ, chưa implement) | `{ items: SessionSummary[] }` | Session đã lưu bền vững, sắp xếp giảm dần theo updatedAt; v1 không xây index |

Tham số và giá trị trả về của các phương thức còn lại (`session.create`/`session.history`/`session.rename`/`session.prompt`/`session.cancel`/`host.describe`) không được sao chép lại ở đây — chữ ký chính là nguồn sự thật, xem `api/sessions.ts`, `api/host.ts` và `RpcMethodMap`.

### Frame (server→client, union được đặt tên)

Hai luồng logic: luồng mux (`/api/events.mux`, tổng hợp toàn session) và luồng host (`/api/events.host`, event cấp host). Trình duyệt tiêu thụ qua mỗi luồng một WebSocket đường xuống; carrier fetch trong tiến trình dùng SSE để giữ đồng cấu trúc; ranh giới vật lý xem [carrier đường xuống WebSocket](2026-08-04-websocket-downlink-carrier.md). Ví dụ frame một dòng:

| Frame type | Payload | Khi nào phát |
|---|---|---|
| `session/event` | `{ sessionId; event: SessionEvent }` | Truyền qua thuần túy của core: event core đi qua nguyên trạng, `assistant/chunk` chính là luồng token, không có frame delta độc lập |

Các loại frame còn lại không được sao chép lại ở đây, tập union đầy đủ xem `MuxFrame`/`HostFrame` trong `api/events.ts`. Về ngữ nghĩa cần biết ba điểm: `lastSeq` của `session/subscribed` dùng để phát hiện race điều kiện với history; frame requested của `approval/question` có thể trả lời (rpcId ổn định), frame resolved là mặt hội tụ; `host/agent-error` là lối ra duy nhất cho lỗi live không có vị trí turn.

**Kỷ luật truyền qua**: event/message/content block trên wire chính là kiểu core (`SessionEvent`/`ContentBlock`), không tạo thêm bộ DTO thứ hai; kiểu đến trình duyệt trực tiếp qua chuỗi phụ thuộc `import type`. `SessionEventMap` merge-extensible: client dùng documented-default (bỏ qua) cho type chưa biết, event schema giữ nhánh "envelope hợp lệ + type chưa biết" — envelope vẫn nghiêm ngặt, không phải passthrough ở mức trường.

### Ngữ nghĩa session (cam kết phía impl)

- **History = replay event**: một bộ fold (phía client), phân trang history và increment live dùng chung một đường code. History **ranh giới trang khớp ranh giới message** (không bao giờ cắt giữa message; chunk được nhóm theo message đã hoàn thiện), trang cuối chứa chunk partial đang tiến hành.
- **Liên kết prompt**: rpcId của prompt truyền qua MessageSource (`'user-rpc'`) vào event `user/message`, client dùng nó để chuyển việc hiển thị lạc quan (optimistic) thành chính thức.
- **Reconnect = tái dựng**: không dùng cursor tiếp tục (chữ ký `since` của `mux` giữ chỗ, truyền vào bị bỏ qua); mất kết nối thì mở lại luồng + tải lại history; so sánh `subscribed.lastSeq` với seq cuối của history, có khoảng trống thì tải bù thêm một lần.
- **Xử lý session lạnh (cold) tuân theo quyền sở hữu**: việc đọc ở phía nguồn của `session.history` và `session.fork` sẽ kiểm tra lưu trữ bền vững mà không cần lấy Agent, còn phương thức session thông thường ràng buộc với Agent (như `prompt`) sẽ phục hồi session sau khi khử trùng lặp qua bảng đang diễn ra. Subagent được hỗ trợ bởi session sẽ từ chối đường phục hồi thông thường này, và trạng thái phụ trợ không phơi bày cho client (`running` đã bao phủ).
- **Approval/hỏi đáp**: frame requested mint rpcId ổn định khi tiếp nhận; ai đến trước thắng, bảng pending trong bộ nhớ của host (keyed theo rpcId) là trọng tài duy nhất; sau khi mux mở lại sẽ replay các frame requested vẫn còn pending sau frame subscribed (rpcId dùng lại nguyên trạng, refresh sẽ phục hồi). Event audit `approval/asked`/`decided` vẫn đi qua log durable như thường lệ — frame = mặt điều khiển live, event = audit durable. **Hiện trạng**: quy ước và kiểu frame đã shipped, bảng pending phía host/wire answerer chưa implement (`respond` trong `api-proxy.ts` là stub, luôn trả về `not-pending`); PendingCard v1 chỉ hiển thị.
- **Không đặt version protocol**: client và host phát hành gắn kết với nhau, `host.describe` không có trường protocolVersion; sẽ đưa vào khi có client phát hành độc lập.
- **Kỷ luật phương thức dự trữ**: map chỉ chứa phương thức đã implement, method chưa biết sẽ fail loud (`bad-request`) ngay khi parse envelope, không đặt code dự phòng not-implemented. Danh sách dự trữ (khi implement thì chép chữ ký vào interface lĩnh vực + thêm dòng vào map + thêm cặp vào schema là nâng cấp): `session.fork`, `prompt.mode` thêm `'inject'`, `task.list`, `host.listModels`, describe thêm `hostInstanceId`. (`session.rename` đã tốt nghiệp khỏi danh sách này: đã bổ sung event `session/title` có nguồn từ user.)

## Carrier phía client: hệ thống lớp AbstractApiClient (`fetch/client.ts`)

**Bất biến thức của protocol nằm ở lớp cơ sở, khác biệt nền tảng là hai mặt cắt**: phương thức trừu tượng `doFetch(url, init)` (truyền tải) + `onEnvelope` có thể ghi đè (quan sát).

### IApiClient: view của caller

Cùng cây lĩnh vực với `ApiProxy`, nhưng phương thức unary **nhận payload business truyền trực tiếp** — carrier mint rpcId và bọc envelope, business code không bao giờ mint; nếu cần rpcId của lần gọi này thì đọc từ `RpcResponse` phản hồi trả về. `ApiProxy` là quy ước chữ ký hình dạng hẹp do phía impl implement, `IApiClient` là view truyền payload trực tiếp do phía client tiêu thụ, `AbstractApiClient` bắc cầu hai bên. Phương thức được phái sinh từng key một từ `RpcMethodMap` — thêm dòng vào map là tự động cập nhật.

### Các đường protocol do lớp cơ sở nắm giữ

| Đường | Nội dung |
|---|---|
| `callUnary` | mint → tap → POST hình dạng đầy đủ → parse `serverResponseSchema` → **xác thực echo lại rpcId** (không khớp thì throw) → tap → xuất ra hình dạng hẹp |
| `readSse` | streaming fetch (không phải EventSource), tách frame theo `\n\n`, ghép `data:`, parse hình dạng đầy đủ ServerRequest, tap, xuất ra hình dạng hẹp `RpcRequest<frame>` |
| `respond` | truyền qua client-response (rpcId là điền lại, không mint ở đây); parse body phản hồi bằng `rpcReceiptSchema` |
| Giới hạn thời gian unary | Lời gọi unary thông thường dùng `AbortSignal.timeout` (mặc định 30s, có thể điều chỉnh qua tham số constructor); `host.pickDirectory` và `command.execute` do người dùng kiểm soát nhịp độ không đặt giới hạn thời gian này, nhưng vẫn giữ khả năng hủy từ phía gọi/kết nối; stream không đặt giới hạn thời gian |
| `resolveBase` | Trình duyệt = origin cùng nguồn; môi trường không có location (Node) = authority giả `http://dsh.internal` |

### Mặt cắt quan sát envelope cấp instance

Cả bốn góc phần tư hình dạng đầy đủ đều đi qua `onEnvelope`; implementation lớp cơ sở là **buffer gộp lô (batch) bằng microtask do instance nắm giữ** (cơn bão frame không làm phiền phía tiêu thụ theo từng frame một; trạng thái cấp module sẽ rò rỉ xuyên instance/test, nên nắm giữ ở cấp instance). Observer đăng ký qua `subscribeEnvelopes(listener)` (nhận cả lô `readonly RpcMessage[]`, trả về hàm hủy đăng ký); listener ném exception sẽ bị cô lập (việc quan sát không được phản ngược lên carrier). Không có subscriber thì chi phí buffer bằng không. Hiện tại không có phía tiêu thụ đang hoạt động nào đăng ký — mặt cắt này là chỗ dự trữ cho chẩn đoán wire (panel debug RPC đã nghỉ hưu từng là phía tiêu thụ đầu tiên của nó, khi phía tiêu thụ chẩn đoán tương lai đấu nối vào sẽ không cần động vào carrier).

### Bảng subclass (mang tải truyền tải)

| Subclass | Package | doFetch | Công dụng |
|---|---|---|---|
| `InProcessApiClient` | package apiproxy này | handler `{ fetch }` được inject | **Điểm đồng cấu trúc**: `new InProcessApiClient(toFetchHandler(api))` toàn trình không qua network nhưng chạy thật serialize wire/zod/frame SSE; test carrier và phía gọi có thể chạy bộ protocol này mà không cần mở port, còn `dsh --profile headless` của sản phẩm điều khiển core trực tiếp |
| `WebApiClient` | dsh-client-connection | `globalThis.fetch` đường lên + mỗi luồng logic một WebSocket cùng nguồn đường xuống | Client trình duyệt; ranh giới vật lý xem [carrier đường xuống WebSocket](2026-08-04-websocket-downlink-carrier.md) |
| `FixtureApiClient` | dsh-client-connection | Không dùng (ghi đè ở tầng protocol) | Phát triển UI không cần server (`?fixture`): ghi đè phương thức ảo `callUnary`/`openMux`/`openHost`/`respond`, bản thân nó chính là server giả (rpcId của frame do nó mint, tự nhất quán về ngữ nghĩa) |
| Subclass cầu nối IPC (ví dụ giả định — chưa có hình dạng này) | shell Electron | Round-trip serialize qua IPC | Chỉ cần đổi doFetch, quy ước/lớp cơ sở không đổi gì |

## Cách mở rộng (checklist thao tác)

**Thêm một phương thức unary (5 bước)**: ① Thêm chữ ký phương thức vào interface lĩnh vực (tham số/giá trị trả về inline, đây là nguồn sự thật duy nhất); ② Thêm một dòng vào `RpcMethodMap`; ③ Thêm cặp schema request/value vào `<lĩnh vực>.schema.ts` (neo `Wire<RequestPayload<'…'>>`); ④ Thêm một dòng vào `UNARY_ROUTES` của handler (carrier Web của handler xem Agent Note về kiến trúc Web client); ⑤ Implement ở phía impl (echo lại `request.rpcId`). Bảng phương thức lĩnh vực của `IApiClient`/`AbstractApiClient` phía client đồng bộ thêm một dòng truyền qua.

**Thêm một loại frame (3 bước)**: ① Thêm một nhánh vào union `MuxFrame`/`HostFrame` (frame có thể trả lời cần ghi chú ngữ nghĩa rpcId ổn định); ② Thêm một nhánh vào frame schema; ③ fold/routing của phía tiêu thụ đã có documented-default xử lý dự phòng cho type chưa biết, thêm nhánh tường minh khi cần.

**Thêm một error code (2 bước)**: ① Thêm một dòng vào `RpcErrorDetailsMap` (details bắt buộc); ② Thêm một nhánh vào discriminatedUnion của `rpcErrorSchema`.

**Đấu nối một carrier mới**: kế thừa `AbstractApiClient` chỉ cần implement `doFetch`; nếu cần chặn ở tầng protocol (như fixture — dữ liệu tiền đặt cho test) thì ghi đè phương thức ảo `callUnary`/`openMux`/`openHost`. Quy ước và lớp cơ sở không đổi gì.

**Nâng cấp một phương thức dự trữ**: chép chữ ký dự trữ vào interface lĩnh vực → thêm dòng vào map → thêm cặp vào schema → thêm dòng vào UNARY_ROUTES → implement ở phía impl.

## Consequences

Mọi client dùng cùng một quy ước: thêm một phương thức unary là năm bước thay đổi có tính máy móc xuất phát từ một chữ ký duy nhất, đổi carrier chỉ động vào một subclass `doFetch`, mỗi message trên wire có thể xác thực bằng zod, quan sát được qua tap envelope, đối soát được theo rpcId. Lời gọi unary thông thường vẫn chịu ràng buộc giới hạn thời gian, còn `host.pickDirectory` và `command.execute` có thể giữ trạng thái treo cho tới khi thao tác hoàn tất hoặc phía gọi/kết nối hủy; nếu thao tác do người dùng kiểm soát nhịp độ không tự kết thúc, request có thể treo mãi, đây là cái giá chấp nhận để tránh coi thời lượng thao tác hợp lý là lỗi truyền tải. Các cái giá khác đã chấp nhận: hai nhóm package cần mục paths tường minh trong tsconfig; phương thức dự trữ (fork/inject/task.list/listModels/hostInstanceId) giữ trạng thái ngủ đông cho tới khi có phía tiêu thụ thật xuất hiện.

## Alternatives considered

| Phương án bị bỏ | Lý do một dòng |
|---|---|
| Chia package theo sản phẩm (một dòng họ web, một dòng họ electron) | Cái được chia sẻ giữa các sản phẩm là năng lực hai phía host/client, chứ không phải implementation của một ứng dụng cụ thể; phân lớp theo phía cung cấp năng lực khiến ứng dụng mới không cần package mới |
| Tạo package cho thể hỗn hợp (như package độc lập cho headless) | Thể hỗn hợp chỉ có một phía tiêu thụ (app của chính nó), tạo package là abstraction vô chủ; việc lắp ráp viết trong app dễ đọc dễ bỏ |
| Client dạng tiêu thụ kết nối trực tiếp ctx (bớt một lớp apiproxy) | Client cần xác thực wire, quan sát và tính nhất quán đa client. Headless trực tiếp là entry cục bộ không có ranh giới client, dùng seam Agent/Session công khai, chứ không phải mặt lệnh của client |
| webserver phụ thuộc runtime (bớt việc inject handler) | Inject theo kiểu cấu trúc khiến webserver có thể tái sử dụng bởi sidecar/test và zero workspace dependency; phụ thuộc package sẽ kéo kiến thức lắp ráp vào lớp mang tải |
| Tên package không kèm tiền tố nhóm (dùng dsh-<đoạn cuối>) | `dsh-runtime`/`dsh-web-ui` sẽ mất thông tin thuộc về trong không gian tên npm phẳng; cái giá chỉ là mỗi package một mục paths tường minh |
| Tái sử dụng JSON-RPC 2.0 trong repo (dsh-sdk-jsonrpc-server) | Error code dạng số suy thoái thành một code dự phòng duy nhất, quy ước phải đối chiếu thủ công hai lần, việc đặt tên không có convention nên tự nhiên trôi (drift) |
| Mô hình ba envelope (mỗi Request/Response/Frame một envelope, chữ ký không nhận biết hướng) | rpcId là liên kết ở tầng logic, ngữ nghĩa hướng của frame và response dựa vào suy luận từ kênh truyền sẽ mất hiệu lực khi đổi carrier |
| Cặp kiểu Request/Response được đặt tên làm nguồn sự thật (map đăng ký cặp kiểu) | Kiểu có tên riêng phẳng là tên thứ hai của cùng một fact; suy luận (infer) từ chữ ký giúp thêm phương thức chỉ cần sửa một chỗ |
| Path kiểu REST | Phía tiêu thụ là client tự nhà, không có nhu cầu trải nghiệm REST bên thứ ba; bảng phương thức ánh xạ trực tiếp kiểu RPC mang tính máy móc hơn |
| Lớp DTO (bộ cấu trúc thứ hai chuyên cho wire) | Kiểu core đến trình duyệt qua type-only với chi phí bằng không; DTO là thuế đồng bộ hai chiều vĩnh viễn |
| Tiếp tục cursor (thực hiện since của mux) | Reconnect = tái dựng (giống opencode) đã bao phủ toàn bộ nhu cầu v1; chữ ký giữ chỗ, chờ phía tiêu thụ thật để implement |
| Factory function createApiClient (implementation gốc) | Khác biệt nền tảng (truyền tải/quan sát) là mặt cắt kế thừa chứ không phải tham số; hệ thống lớp giúp fixture thay thế ở tầng protocol thay vì bọc thêm một lớp envelope giả |
| Áp dụng giới hạn thời gian truyền tải 30 giây cho `command.execute` | Thời gian chạy lệnh thuộc về bản thân thao tác, không phải ngân sách sức khỏe truyền tải; giới hạn này sẽ chấm dứt bộ xử lý dài hạn đáng lẽ vẫn nên tiếp tục chạy, việc hủy từ phía gọi/kết nối đã cung cấp đường dừng cần thiết |
