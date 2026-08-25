# Điều hướng LSP

[English](lsp.md) | Tiếng Việt

LSP seam là một [capability seam](../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md): nó phơi bày phần điều hướng mã nguồn theo ngữ nghĩa trên một dịch vụ `ctx.lsp` duy nhất, và được tách ra nhiều package: Service Definition ([dsh-lsp](../../packages/lsp/lsp), `ctx.lsp` + registry provider), Service Provider dùng chung ([dsh-lsp-stdio](../../packages/lsp/lsp-stdio), phần host cho các language server stdio đã cấu hình) và Consumer ([dsh-tool-lsp](../../packages/lsp/tool-lsp), tức schema của tool `lsp`). LSP là **một năng lực tùy chọn**, không thuộc phần trục chính của agent loop (vòng lặp tác tử), nên từ vựng của nó được định nghĩa ở đây chứ không phải trong [core.md](core.md). Đổi provider không làm thay đổi cách mô hình yêu cầu điều hướng.

Tệp nguồn: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)

## Thao tác và tọa độ

Seam và mô hình phơi bày đúng 4 truy vấn ngữ nghĩa; union này là đóng, nên việc thêm một truy vấn mới sẽ bị trình biên dịch bắt buộc phải sửa đồng bộ ở seam, provider và tool. Vị trí và phạm vi dùng tọa độ UTF-16 bắt đầu từ 0, khớp với giao thức; tool hướng tới mô hình dùng quy ước con trỏ bắt đầu từ 1, và thực hiện chuyển đổi ở đầu vào lẫn đầu ra.

```ts type-equiv
/**
 * The four semantic queries the seam and model expose. A closed union: adding an operation is a
 * compile-enforced change across the seam, providers, and the tool. Symbols and call hierarchy are
 * not operations here; they need different schemas.
 */
type LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
```

```ts type-equiv
/** A zero-based UTF-16 cursor coordinate, matching the LSP wire convention. */
interface LspPosition {
  /** Zero-based line. */
  readonly line: number
  /** Zero-based UTF-16 code-unit offset within the line. */
  readonly character: number
}
```

```ts type-equiv
/** A zero-based UTF-16 half-open range `[start, end)`. */
interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}
```

## Yêu cầu

Mọi trường đều bắt buộc: `workspaceRoot` do bên gọi cung cấp, `languageId` đến từ phần đăng ký của provider chứ không phải từ yêu cầu, còn thời gian chờ và giới hạn kết quả do consumer quyết định. Vì vậy không trường nào cần hiện thực gán giá trị mặc định, và cũng không tồn tại bước `resolve()`. Provider nhận yêu cầu của bên gọi cùng `languageId` được phái sinh; cái sau chỉ dùng để đồng bộ tài liệu tạm thời, không bao giờ tham gia vào việc chọn provider.

```ts type-equiv
/**
 * A caller's normalized query. Every field is required: `workspaceRoot` is caller-supplied,
 * `languageId` comes from the provider registration (not here), and consumers own timeouts and
 * result limits — so no field needs implementation defaulting and there is no `resolve()` step.
 */
interface LspQueryRequest {
  /** Which semantic query to run. */
  readonly operation: LspOperation
  /** The source file to query (relative to `workspaceRoot` or absolute; the provider canonicalizes). */
  readonly filePath: string
  /** The zero-based UTF-16 cursor position to query at. */
  readonly position: LspPosition
  /** The workspace root the provider resolves against and indexes; required, never defaulted. */
  readonly workspaceRoot: string
}
```

```ts type-equiv
/**
 * A request as a provider receives it: the caller's {@link LspQueryRequest} plus the `languageId`
 * the seam derived from the provider's extension mapping. The language id only synchronizes the
 * transient document; it does not participate in selection.
 */
interface LspProviderQuery extends LspQueryRequest {
  /** The LSP language id for `filePath`, from this provider's extension mapping. */
  readonly languageId: string
}
```

## Kết quả

Đây là một discriminated union đóng: các thao tác điều hướng được chuẩn hóa thành `locations`, còn `hover` được chuẩn hóa thành nội dung hoặc `null`. Consumer dùng `switch` để xử lý vét cạn theo `kind`, nên một nhánh mới sẽ làm biên dịch thất bại cho tới khi được xử lý. `findReferences` luôn bao gồm cả phần khai báo; provider tự đảm bảo điều này ở bên trong, nên bên gọi không có flag tương ứng. Biến thể `locations` mang theo `resolvedWorkspaceUri`, tức URI `file:` chuẩn tắc của workspace theo provider. Khi bên gọi muốn tương đối hóa các URI vị trí, hãy dùng tọa độ này, thay vì áp quy tắc đường dẫn của nền tảng host lên thư mục gốc yêu cầu vốn có thể đi qua symlink.

```ts type-equiv
/** One resolved location: a document URI and the range within it. */
interface LspLocation {
  /** The target document URI (`file:` or otherwise), verbatim from the server. */
  readonly uri: string
  /** The range within the target document. */
  readonly range: LspRange
}
```

```ts type-equiv
/** Normalized hover content, or `null` for no hover at the position. */
interface LspHover {
  /** The normalized hover text (markdown or plaintext, provider-joined). */
  readonly contents: string
  /** The range the hover applies to, when the server supplied one. */
  readonly range?: LspRange
}
```

```ts type-equiv
/**
 * The closed result union. Navigation operations (`goToDefinition`, `findReferences`,
 * `goToImplementation`) normalize to `locations`; `hover` normalizes to content or `null`.
 * Consumers `switch` on `kind` to exhaustiveness so a new arm breaks compilation until handled.
 *
 * The `locations` variant carries `resolvedWorkspaceUri`: the provider's canonical `file:` URI for
 * the request's workspace root. A caller that relativizes location URIs MUST use this, not parse the
 * request's possibly symlinked process path with host-platform rules; the execution platform may
 * differ from the caller's.
 */
type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly LspLocation[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: LspHover | null }
```

## Provider và dịch vụ

Mỗi provider sở hữu một `id` đã brand hóa và ổn định, cùng một ánh xạ phần mở rộng tệp loại trừ lẫn nhau, viết thường và bắt đầu bằng dấu chấm. `registerProvider` đặt chỗ nguyên tử cho id và từng phần mở rộng: khi đăng ký không hợp lệ hoặc xung đột thì không có gì được xuất bản; disposer của nó giải phóng mọi phần đã đặt chỗ. Mỗi truy vấn chọn provider độc lập, và việc chọn không phụ thuộc thứ tự; khi không có kết quả khớp thì ném `LspError` `LSP_UNAVAILABLE`. Seam này không phơi bày kiểu giao thức, tiến trình hay quyền điều khiển tài liệu, và cũng không cung cấp lối thoát JSON-RPC tổng quát.

```ts type-equiv
/**
 * A language-server backend registered on `ctx.lsp`. Each provider owns a stable {@link
 * LspProviderId} and an extension-to-language-id map (lowercase, leading-dot keys).
 * `findReferences` always includes declarations — the provider enforces this internally; callers
 * get no flag.
 */
interface LspProvider {
  /** Stable provider identity, reserved atomically with the extension mappings. */
  readonly id: LspProviderId
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /**
   * Run one query. The seam has already selected this provider and derived `languageId`.
   * @param request - the resolved provider query (caller request + derived language id).
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}
```

```ts type-equiv
/**
 * The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query
 * execution; exposes exactly the four operations and no protocol escape hatch.
 */
interface LspService {
  /**
   * Register a provider, atomically reserving its id and every normalized extension. Any conflict
   * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
   * reservations. Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id and all extension reservations.
   */
  registerProvider(provider: LspProvider): () => void
  /**
   * Select a provider by the file's extension and run one query. Selection is per-query and
   * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
   * @param request - the normalized query.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
```

`LspProviderId` là id đã brand hóa của seam này (`Branded<'LspProviderId'>` từ [dsh-brand](../../packages/util/brand)); `LspError` mở rộng `HarnessError`, cung cấp các mã lỗi ổn định như `LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`, `LSP_UNSUPPORTED_OPERATION` và `LSP_MALFORMED_RESPONSE`; bên gọi nên định tuyến theo mã lỗi, chứ không phân tích `message`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlsp--lspservice"></a>

### `ctx.lsp` — `LspService`

The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query execution; exposes exactly the four operations and no protocol escape hatch.

```ts cordis-catalog
/**
 * Register a provider, atomically reserving its id and every normalized extension. Any conflict
 * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
 * reservations. Disposed with the calling fiber.
 * @param provider - the backend to register.
 * @returns a synchronous disposer releasing the id and all extension reservations.
 */
registerProvider(provider: LspProvider): () => void

/**
 * Select a provider by the file's extension and run one query. Selection is per-query and
 * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
 * @param request - the normalized query.
 * @param signal - optional cancellation forwarded to the selected provider.
 * @returns the normalized, closed-union result.
 */
query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
```

Source: [`packages/lsp/lsp/src/types.ts:113`](../../packages/lsp/lsp/src/types.ts)
<!-- END GENERATED cordis-surface -->
