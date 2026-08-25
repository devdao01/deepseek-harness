# Module Client

[English](client-modules.md) | Tiếng Việt

Bảng plugin Web: nửa Node của hệ thống module client trong [dsh-client-modules](../../packages/client/modules), được phơi bày dưới dạng `ctx.clientModules` (`ClientModuleRegistry`). Nó quét entry của Loader chủ (host Loader), tìm những package khai báo `dsh.client`, tổ hợp thành đồ thị entry `window.__DSH_BOOT__`, phục vụ từng bundle tại `/plugins/<id>/client.js`, và tiêm boot manifest (bảng kê metadata) thông qua index transform (index tap) — đây là bốn mặt của cùng một service. Đây là một năng lực tùy chọn của stack Web GUI, không thuộc phần trục chính của agent loop (vòng lặp tác tử), và là bên tiêu thụ của [dsh-host-webserver](../../packages/host/webserver): loader mô tả trong [web-server.md](web-server.md) cung cấp tuyến đường tiền tố và index transform mà service này đăng ký. Nửa trình duyệt của cùng package (`ctx.modules`, tức bảng module CJS lazy kéo về và hiện thực hóa các bundle này) thuộc về cơ chế nội bộ (internal machinery) của kernel, được ghi lại trong [README của package](../../packages/client/modules/README.md), không nằm trong trang này.

Nguồn: [`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## wire

Đồ thị là nguồn sự thật duy nhất của tầng giao thức giữa nửa Node và nửa trình duyệt: host tổ hợp các dòng `WebBootEntry` từ những package đã quét được, tiêm đồ thị làm script đầu tiên trong `<head>` (`window.__DSH_BOOT__`, trong đó `<` đã được escape, nên chuỗi do plugin kiểm soát không thể thoát ra khỏi phần tử script), rồi vỏ (shell) sẽ phân tích nó trước khi khởi động bất kỳ thứ gì. Trang không có manifest hợp lệ sẽ không thể khởi động — bộ phân tích phía trình duyệt sẽ ném lỗi lớn tiếng khi đồ thị bị thiếu hoặc sai định dạng.

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch; `inject` is informational graph
 * metadata (the authoritative edges live in each package's `dsh.client`
 * declaration and reach fibers through entry creation).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /** Bundle endpoint, '/plugins/<id>/client.js?rev=<rev>'. */
  url: string
  /** Bundle content hash (cache-busting consistency anchor). */
  rev: string
  /** Package-name dependency edges, informational (preflight display / HMR diffing). */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the whole graph (content + bundle hashes). */
  rev: string
  /** Composed entries; order carries no semantics (activation order is fiber inject waiting). */
  entries: WebBootEntry[]
}
```

`rev` của mỗi dòng là hash nội dung của bundle đó, và được gắn vào URL như một tham số query để vô hiệu hóa cache; `rev` của đồ thị là hash trên toàn bộ các dòng đã tổ hợp, nên bất kỳ thay đổi nào ở một dòng cũng làm nó thay đổi. `immediately` đánh dấu bậc prefetch giai đoạn một (fetch và thực thi trong lúc khởi động mặt module, chỉ để đăng ký); các dòng lazy chỉ được kéo về khi import lần đầu.

## Quét

Package tham gia vào bảng này bằng cách khai báo `dsh.client` trong package.json của chính nó (`platform: 'web'`, edge `inject` tùy chọn, `immediately` tùy chọn), và export bundle đã build tại `exports["./client"]`. Việc phân giải package được neo vào `ctx.baseUrl` của cây cấu hình — tức thư mục chứa cordis.yml, nơi package của thư mục đó khai báo mỗi plugin được tổ hợp là dependency — nếu điểm neo này chưa được thiết lập thì việc dựng sẽ ném lỗi ngay.

Việc quét là tăng dần theo từng package; không tồn tại đường quét lại toàn bộ. Mỗi lần cordis phát sự kiện `internal/plugin` khi fiber được dựng hoặc dispose (giải phóng tài nguyên) sẽ đánh dấu bẩn tên entry của fiber đó, một lần flush microtask sẽ đối chiếu từng tên bẩn với entry loader thời gian thực. Lượt kích hoạt (activation) nạp toàn bộ entry hiện tại vào cùng một tập bẩn và flush đồng bộ, nên lần quét đầu tiên và trạng thái ổn định dùng chung một cách triển khai — nhưng tư thế thất bại thì ngược nhau. Lúc kích hoạt, khai báo sai định dạng hoặc bundle bị thiếu trong các entry đã tải sẽ được gộp thành một `AggregateError` lớn tiếng, liệt kê từng package bị hỏng: fiber đó chuyển sang FAILED, được sweep thất bại lớn tiếng lúc khởi động báo cáo lên. Ở trạng thái ổn định, package bị hỏng chỉ ghi một cảnh báo, và không được ảnh hưởng đến các package khác.

Metadata của package — kể cả kết luận phủ định "không phải package client" — được cache theo tên và không bao giờ hết hạn: thay đổi tập hợp plugin chỉ có hiệu lực sau khi khởi động lại. Fiber khởi động lại sẽ tái sử dụng nguyên vẹn dòng và rev của nó; thay đổi nội dung bundle chỉ đến được đồ thị qua `rebuilt()`.

## Định tuyến bundle và index transform

`GET`/`HEAD /plugins/<id>/client.js` phục vụ bundle đã đăng ký từ đĩa với `no-cache` (tham số query rev, chứ không phải HTTP cache, là điểm neo tính nhất quán); các phương thức khác trả về 405. Id không xác định — hoặc dòng đã đăng ký nhưng bundle không đọc được vì chưa build — sẽ trả về 404 lớn tiếng, thay vì để SPA fallback của loader phát HTML ra như thể đó là JavaScript. Index transform tiêm đồ thị hiện tại vào mỗi lần render index, nên việc tải lại trang luôn nhắm vào tổ hợp khởi động thời gian thực.

## Service

`ClientModuleRegistry` (`ctx.clientModules`, định nghĩa tại [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)) phơi bày mặt đọc và mặt rebuild; chữ ký xem tại [danh mục service](#ctxclientmodules--clientmoduleregistry) đã sinh ra. `graph()` trả về đồ thị đã tổ hợp hiện tại (cùng một đối tượng ổn định giữa hai lần thay đổi), `clientPath(id)` trả về đường dẫn tuyệt đối của bundle đó. `rebuilt(id)` là điểm vào duy nhất để nội dung bundle đến được đồ thị: nó hash lại tệp, chỉ khi rev thực sự thay đổi mới tổ hợp lại đồ thị và phát thông báo. `onRebuilt` kích hoạt riêng theo từng bundle đã thay đổi kèm rev mới; `onGraphChanged` kích hoạt sau mỗi lần flush đã tổ hợp lại đồ thị (thêm/bớt dòng, hoặc thay đổi rev do rebuilt mang lại), và dùng mô hình pull — listener tự đọc lại `graph()`. Cả hai đường thông báo đều bắt lỗi listener, nên một subscriber ném lỗi không thể khiến các subscriber sau bị bỏ qua, cũng không thể giết chết bên đã kích hoạt lần flush đó.

Ở môi trường dev, [dsh-client-hmr](../../packages/client/hmr/README.md) là driver theo dõi (watch) của registry: nửa Node của nó xuất phát từ baseline lấy đồng bộ, poll stat trên bundle của mỗi dòng trong đồ thị, gọi `rebuilt(id)` khi có thay đổi, đồng bộ lại tập theo dõi qua `onGraphChanged`, và phát tán thay đổi rev tới nửa trình duyệt qua SSE (Server-Sent Events). Đồ thị ở môi trường production hoàn toàn không chứa dòng HMR (thay thế module nóng); bản thân module host không bao giờ theo dõi tệp.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `dsh.client` scan + wire composition + bundle route + index tap. Construction runs the activation scan synchronously — a malformed declaration or missing bundle among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Re-hash one bundle (the HMR watch's registration hook — the only entry
 * point through which bundle content changes reach the graph).
 * @param id - entry id (package name).
 * @returns the new rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts:184`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
