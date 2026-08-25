# Truy cập Web

[English](web.md) | Tiếng Việt

Seam truy cập Web là một [capability seam](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md), trải trên **hai thao tác** (search và fetch) trong cùng một dịch vụ `ctx.web` và được tách ra nhiều package: Service Definition ([dsh-web](../../packages/web/web), `ctx.web` + registry bên cung cấp), Service Provider ([dsh-web-search-exa](../../packages/web/web-search-exa), [dsh-web-search-perplexity](../../packages/web/web-search-perplexity), [dsh-web-search-deepseek](../../packages/web/web-search-deepseek), [dsh-web-fetch-http](../../packages/web/web-fetch-http)) và Consumer ([dsh-tool-web](../../packages/web/tool-web), tức schema của công cụ `web_search`/`web_fetch`). Web là **một năng lực tùy chọn**, không thuộc phần trục chính của agent loop, vì vậy từ vựng của nó được định nghĩa ở đây chứ không phải trong [core.md](core.md). Đổi bên cung cấp search không làm thay đổi cách mô hình gửi truy vấn, và đổi bên cung cấp fetch cũng không làm thay đổi cách mô hình yêu cầu URL.

Mã nguồn: [`packages/web/web/src/types.ts`](../../packages/web/web/src/types.ts)

## Vì sao một năng lực lại gồm hai thao tác

Search và fetch không dùng chung schema yêu cầu, cũng không dùng chung logic nghiệp vụ, nhưng chúng được thiết kế có chủ đích thành cùng một lớp trung gian `ctx.web`: một nơi sở hữu chiến lược chọn bên cung cấp, một bộ từ vựng hủy và lỗi, cùng một mặt cấu hình hướng sản phẩm cho câu hỏi «harness này truy cập Web như thế nào». Cái giá phải trả là các cặp phương thức `searchX`／`fetchX` song song trên dịch vụ; sự song song đó là cố ý, chứ không phải bỏ sót phần chung có thể trích xuất. Bên cung cấp đăng ký **năng lực** (`WebSearchProvider` hoặc `WebFetchProvider`), không phải công cụ; tên, schema, phần dẫn dắt trong prompt và cách hiển thị hướng tới mô hình đều tập trung trong bên tiêu thụ duy nhất là `dsh-tool-web`.

## Yêu cầu và kết quả tìm kiếm

Tham số công cụ hướng tới mô hình chỉ gồm một `query`; `maxResults` là giới hạn do bên tiêu thụ tự sở hữu (cấu hình `searchMaxResults` của `dsh-tool-web`, mặc định `8`), được truyền qua seam và bị áp đặt khi trả về — nếu bên cung cấp trả quá số lượng, seam sẽ cắt bớt `sources[]` và đặt `truncated`.

```ts type-equiv
/**
 * What one search-capable backend can return. The model-facing argument is just
 * a query; `maxResults` is a `dsh-tool-web`-layer bound passed through unchanged
 * and enforced on the way back by the seam (see {@link WebSearchResult}).
 */
interface WebSearchRequest {
  readonly query: string
  /**
   * Upper bound on returned sources; the seam truncates to it. Omitted = no
   * bound. `dsh-tool-web` always sets it. A provider whose API supports a
   * result-count control (Exa's `numResults`) should apply it at the request
   * layer as a cost/latency optimization; the seam enforces the bound
   * regardless.
   */
  readonly maxResults?: number
}
```

```ts type-equiv
/**
 * Normalized search outcome. `content` is optional provider-generated answer
 * text or summary (Exa and DeepSeek return none; Perplexity returns a
 * generated answer).
 * `sources[]` is the portable citation shape. `truncated` is set by the seam
 * when it cut `sources[]` down to `maxResults`.
 */
interface WebSearchResult {
  /** Optional provider-generated answer text, search context, or summary. */
  readonly content?: string
  /** Citeable sources, already truncated to the request's `maxResults`. */
  readonly sources: readonly WebSearchSource[]
  /** True when the seam dropped sources to honor `maxResults`. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * One citeable source. A source always has a URL; `title`, `snippet`, and
 * `publishedAt` are optional because not every provider returns them — forcing
 * adapters to invent them would make the seam lie (Perplexity citations may be
 * URL-only). `dsh-tool-web` renders `title ?? hostname(url)` for display.
 */
interface WebSearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  /** Publication/crawl timestamp as a provider-supplied ISO-8601 string. */
  readonly publishedAt?: string
}
```

## Yêu cầu và kết quả truy xuất

```ts type-equiv
/**
 * What one fetch-capable backend is asked to retrieve. The request deliberately
 * omits timeout, format, prompt, and extraction controls: cancellation is a
 * direct execution argument, while presentation and higher-level LLM concerns
 * belong outside safe retrieval.
 */
interface WebFetchRequest {
  readonly url: string
}
```

Mã trạng thái HTTP là một phần trạng thái của tài nguyên được truy xuất, không tự động bị xem là thất bại: ngay cả khi một lần truy xuất mạng thành công nhận về phản hồi `404` hay `500`, kết quả vẫn là một `WebFetchResult` chứa mã trạng thái và phần thân đã giải mã bị giới hạn độ dài. `url` là URL cuối cùng sau các chuyển hướng được cho phép. `WebError` chỉ dùng cho các trường hợp không thể lấy về hoặc biểu diễn tài nguyên một cách an toàn.

```ts type-equiv
/**
 * Normalized fetch outcome. A successful network fetch of a non-2xx response is
 * a result, not an error: the status code is part of the fetched resource
 * state. {@link WebError} is reserved for failures to safely retrieve or
 * represent the resource.
 */
interface WebFetchResult {
  /** The final URL after allowed redirects (the request URL is in the request). */
  readonly url: string
  /** HTTP status code of the fetched response. */
  readonly statusCode: number
  /** Decoded body, classified by content kind. */
  readonly body: WebFetchBody
  /** True when the provider capped the decoded body. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * The decoded body of a fetched resource. A CLOSED discriminated union owned by
 * `dsh-web`: the provider decodes the kind and `dsh-tool-web` renders it, so a
 * new kind is a coordinated change across known packages, not a plugin
 * extension. Consumers `switch` on `kind` ending in `default: assertNever(...)`
 * so adding a kind breaks compilation at every consumer until handled. Each arm
 * stays its own object literal even where fields coincide, so an arm can gain
 * fields the others lack.
 */
type WebFetchBody =
  | { readonly kind: 'html'; readonly content: string }
  | { readonly kind: 'text'; readonly content: string }
```

## Tính khả dụng của bên cung cấp

Hàm `available(): boolean` của bên cung cấp là một phép kiểm tra cục bộ rẻ tiền (thông tin xác thực có tồn tại không, cấu hình có phân giải được không) và **không được phép gọi mạng**. Nó là đầu vào để chọn bên cung cấp tại thời điểm thực thi, chứ không phải một hệ thống kiểm tra sức khỏe: `search()`／`fetch()` đọc giá trị này để chọn bên cung cấp khả dụng. Khi việc lựa chọn thất bại, bên gọi nhận về một `WebError` có cấu trúc để rẽ nhánh xử lý; mã lỗi và thông điệp của nó nêu rõ id bị thiếu hoặc tập ứng viên gây nhập nhằng.

Việc lựa chọn không bao giờ phụ thuộc vào thứ tự đăng ký, thứ tự cấu hình hay thứ tự HMR: một năng lực hoặc phải có id bên cung cấp tường minh (cấu hình `searchProvider`／`fetchProvider`, hoặc biến môi trường tương ứng điền vào chính trường đó), hoặc được chọn tự động khi chỉ có đúng một bên cung cấp khả dụng được đăng ký; nếu có nhiều bên cung cấp khả dụng mà không cấu hình id thì ném `WEB_PROVIDER_AMBIGUOUS`, chứ không chọn bên cung cấp đăng ký sớm nhất.

## Lỗi

`WebError extends HarnessError` (hệ phân loại lỗi trong [core.md](core.md)), kèm `code: string` (kiểu mở, nhất quán với lỗi của các seam khác — `LlmError`, `SubagentError`) chứ không phải union đóng: bên cung cấp có thể ném mã lỗi của riêng mình mà không cần sửa `dsh-web`, và bên tiêu thụ buộc phải dung thứ các mã lỗi chưa biết. Mã lỗi được phân chia theo bên sở hữu. Quy ước `WebRuntime` dùng chung sẽ ném các mã lỗi không phụ thuộc seam: `WEB_PROVIDER_UNAVAILABLE`, `WEB_PROVIDER_CONFIGURED_MISSING`, `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`, `WEB_PROVIDER_AMBIGUOUS`, `WEB_DUPLICATE_PROVIDER` (lỗi lập trình khi đăng ký, tương tự `DUPLICATE_ADAPTER` của `LlmRuntime`), `WEB_ABORTED`, và `WEB_PROVIDER_ERROR` (mã dự phòng dùng khi chính bên cung cấp gặp sự cố và lộ ra qua seam, bao gồm các sự cố mạng hoặc truyền tải như DNS, kết nối bị từ chối, TLS). Các mã lỗi tầng truyền tải của fetch do phần hiện thực `dsh-web-fetch-http` sở hữu, các backend fetch khác không cần ném chúng: `WEB_INVALID_URL`, `WEB_BLOCKED_URL`, `WEB_REDIRECT_BLOCKED`, `WEB_FETCH_TOO_LARGE`, `WEB_FETCH_TIMEOUT`, `WEB_UNSUPPORTED_CONTENT_TYPE`.

## Dịch vụ

`WebRuntime` đăng ký các bên cung cấp search và fetch, từ chối id trùng lặp bằng `WEB_DUPLICATE_PROVIDER`, và phân giải bên cung cấp tại thời điểm thực thi kèm lỗi lựa chọn có cấu trúc. Backend fetch cục bộ chỉ chấp nhận HTTP(S), từ chối thông tin xác thực, giới hạn số lần chuyển hướng, số byte, số ký tự và thời gian, kiểm tra an toàn lại ở mỗi bước chuyển hướng cùng nguồn, rồi giải mã phần thân; việc hiển thị do công cụ đảm nhiệm. Backend cục bộ không chặn các đích thuộc mạng riêng; trong môi trường có thể chạm tới các đích nội bộ nhạy cảm, không được bật `web_fetch`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxweb--webruntime"></a>

### `ctx.web` — `WebRuntime`

The web access service. Registered as `ctx.web` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for search. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerSearchProvider(provider: WebSearchProvider): () => void

/**
 * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for fetch. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerFetchProvider(provider: WebFetchProvider): () => void

/**
 * Run one search through the selected provider. Resolves the provider at call
 * time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. The seam enforces `request.maxResults` on the result:
 * if the provider over-returns, `sources[]` is truncated and `truncated` set.
 * @param request - the query and optional result limit.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's results, capped to `request.maxResults`.
 */
async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>

/**
 * Retrieve one URL through the selected provider. Resolves the provider at
 * call time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. A non-2xx response is a result, not a throw.
 * @param request - the URL plus retrieval options.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the retrieval outcome; non-2xx responses resolve descriptively.
 */
async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
```

Source: [`packages/web/web/src/index.ts:74`](../../packages/web/web/src/index.ts)
<!-- END GENERATED cordis-surface -->
