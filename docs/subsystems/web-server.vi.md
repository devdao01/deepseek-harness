# Máy chủ HTTP

[English](web-server.md) | Tiếng Việt

[dsh-host-webserver](../../packages/host/webserver) là lớp vận chuyển HTTP trên trình duyệt của GUI host: nó là một plugin `node:http` cung cấp `ctx.webServer`, gồm registry route có tên, callback biến đổi index.html, cùng một handler dự phòng mà plugin có thể nhận quyền sở hữu. Nó không thuộc agent loop (vòng lặp tác tử), cũng không phải capability seam; nó không biết bất kỳ khái niệm nào của harness. Các plugin khác chịu trách nhiệm đăng ký toàn bộ route chức năng, bao gồm cầu nối `/api`, bundle plugin và luồng sự kiện HMR (thay thế module nóng) ([giải thích phân lớp](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)). Máy chủ này chỉ phục vụ trình duyệt: Electron nạp file đã build qua `file://` và gửi request fetch qua cầu nối IPC, không dùng máy chủ này.

Mã nguồn: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

## Route

```ts type-equiv
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
type WebRouteKind = 'exact' | 'prefix'
```

```ts type-equiv
/** One named route registration. */
interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
```

Thứ tự khớp là cố định: tra bảng exact trước, rồi lấy prefix khớp dài nhất, cuối cùng rơi về handler dự phòng đã đăng ký. Thứ tự đăng ký không mang bất kỳ ngữ nghĩa nào đối với request: các route có tên không giao nhau về mặt tổ hợp, và mọi request không được route có tên nào nhận đều do chỗ ngồi dự phòng trả lời; chỗ ngồi này chỉ có một chủ sở hữu, lần đăng ký thứ hai sẽ ném lỗi. Bản tổ hợp Web được phát hành dùng [`dsh-host-frontend-static`](../../packages/host/frontend-static/src/index.ts) để nhận chỗ ngồi đó, tức máy chủ phục vụ thư mục dist của SPA theo ngữ nghĩa cố định: request không phải GET/HEAD trả về 405, truy vết vượt ra ngoài thư mục gốc dist trả về 403, mọi trường hợp không khớp đều rơi về `index.html` với HTTP 200 (định tuyến SPA), và phần mở rộng không xác định được gửi dưới dạng octet-stream.

## Cấu hình

```ts type-equiv
/** Gateway config: the listen address. */
interface Config {
  /** Listen host; the two supported values are loopback and all-interfaces. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero requests an OS-assigned port. */
  port: number
}
```

`host` chỉ nhận `127.0.0.1` (tư thế mặc định) và `0.0.0.0` (chủ ý phơi ra mạng); không có TLS, xác thực hay chính sách origin, nên bind vào địa chỉ không phải loopback sẽ phơi máy chủ ra mạng đó. Vị trí thư mục dist là sự thật ở tầng lắp ráp của plugin frontend nhận chỗ ngồi dự phòng.

## Service

`WebServer` (`ctx.webServer`) bắt đầu lắng nghe ngay khi kích hoạt; lắng nghe thất bại (EADDRINUSE, v.v.) sẽ khiến quá trình khởi tạo bị từ chối, và tiến trình khởi động sẽ báo cáo fiber thất bại. `register(route)` thêm một route có tên và trả về disposer của nó; `(kind, path)` trùng lặp sẽ ném lỗi, vì mẫu route là quy ước ở tầng tổ hợp nên xung đột chính là lỗi cấu hình. `tapIndex(transform)` thêm một hàm thuần biến đổi HTML sang HTML, được áp dụng theo thứ tự đăng ký cho mọi response index (`/` và mỗi lần rơi về SPA); [dsh-client-modules](../../packages/client/modules) dùng nó để tiêm manifest khởi động (danh sách metadata). `port` đọc cổng đang lắng nghe, bao gồm cả cổng do hệ điều hành cấp phát khi `config.port` bằng 0.

Những request ném lỗi trong quá trình xử lý (chuỗi thoát % dị dạng gặp `decodeURIComponent`, client ngắt kết nối giữa chừng khi đang gửi body) được ghi log cảnh báo và trả về 400 (hoặc huỷ socket nếu header đã được gửi), và tuyệt đối không làm tiến trình thoát. Quá trình dispose (giải phóng tài nguyên) ghép `close()` cùng `closeAllConnections()`, vì handler có thể giữ response mở như SSE (Server-Sent Events), và loại kết nối đó không bao giờ tự kết thúc; không có bước đóng cưỡng bức thì việc tháo dỡ sẽ treo. Package này không bao giờ in ra output: dòng URL thuộc về shell. Chi tiết vận hành theo từng package (bao gồm pipeline theo dõi bundle ở chế độ dev) nằm trong [README](../../packages/host/webserver/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebserver--webserver"></a>

### `ctx.webServer` — `WebServer`

The browser HTTP carrier service. Activation listens immediately. Route registration order does not affect requests because configured named routes must be distinct, and the fallback handler answers anything not yet claimed during startup with 404 until its owner registers. A listen failure rejects initialization, and the boot process reports the failed fiber.

```ts cordis-catalog
/**
 * Register a named route. Duplicate (kind, path) throws — route patterns are
 * a composition-level contract, so a collision is a misconfiguration.
 * @param route - kind, path, and the owning handler.
 * @returns the disposer removing the route.
 */
register(route: WebRoute): () => void

/**
 * Register an exact-path HTTP upgrade route. Duplicate paths throw because
 * one socket can have only one protocol owner.
 * @param route - pathname and handler owning negotiation plus socket use.
 * @returns the disposer removing the route.
 */
registerUpgrade(route: WebUpgradeRoute): () => void

/**
 * Claim the fallback seat: the handler answering every request no named
 * route matches (the SPA dist server in the shipped Web composition). One
 * owner only — a second registration throws, because two fallbacks cannot
 * compose.
 * @param handler - owns the full response lifecycle of unmatched requests.
 * @returns the disposer releasing the seat.
 */
registerFallback(handler: WebRoute['handler']): () => void

/**
 * Register an index.html transform, applied by the fallback owner to every
 * index response ({@link applyIndexTaps}) in registration order.
 * @param transform - pure html-to-html function.
 * @returns the disposer removing the transform.
 */
tapIndex(transform: (html: string) => string): () => void

/**
 * Run an index.html body through the registered taps in registration order
 * — called by the fallback owner on every index response it renders.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
applyIndexTaps(html: string): string
```

Source: [`packages/host/webserver/src/index.ts:59`](../../packages/host/webserver/src/index.ts)
<!-- END GENERATED cordis-surface -->
