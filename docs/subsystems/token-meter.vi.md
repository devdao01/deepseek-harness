# Đo lường Token

[English](token-meter.md) | Tiếng Việt

`@deepseek-ai/dsh-token-meter` cung cấp một ảnh chụp phát lại độc lập, biểu diễn áp lực yêu cầu và định giá bề mặt theo vị trí. `logRevision` biểu thị số sự kiện bền vững đã tiêu thụ khi sinh ra từng trường trong phép đo này.

Nguồn: [`packages/llm/token-meter/src/types.ts`](../../packages/llm/token-meter/src/types.ts)

## `TokenMeasurement`

```ts type-equiv
/** Detached immutable request-pressure and surface snapshot at one consumed log revision. */
interface TokenMeasurement {
  /** Number of durable events consumed; equal to the next unread event seq. */
  readonly logRevision: number
  /** Provider or heuristic anchor used for this measurement. */
  readonly baseline: TokenMeasurementBaseline
  /** Signed repricing of current surface content relative to the baseline anchor. */
  readonly surfaceDeltaTokens: number
  /** Non-negative current request-and-response pressure. */
  readonly totalTokens: number
  /** Total heuristic tokens across the current surface. */
  readonly surfaceTokens: number
  /** Current surface nodes in positional head-to-tail order. */
  readonly nodes: readonly TokenSurfaceNode[]
}
```

`baseline.kind === 'usage'` nghĩa là lần gọi nhà cung cấp thành công gần nhất có cùng envelope yêu cầu chuẩn tắc, và tổng lượng của lần gọi đó không thấp hơn mốc neo heuristic đầy đủ của nó. `estimated` nghĩa là không có mốc neo usage bảo thủ nào để tái sử dụng, nên dịch vụ dùng quy tắc heuristic cố định để định giá toàn bộ envelope và bề mặt. Các yêu cầu thành công về sau sẽ thay thế mốc neo trước đó; giá trị có dấu `surfaceDeltaTokens` giữ lại phần tăng và giảm so với mốc neo khớp. `totalTokens` vẫn biểu thị áp lực yêu cầu và phản hồi, còn `surfaceTokens` là tổng heuristic chỉ tính riêng bề mặt, bằng tổng giá của mọi node.

## `TokenSurfaceNode`

```ts type-equiv
/** One token-priced node in the current ordered session surface. */
interface TokenSurfaceNode {
  /** Durable sequence number of the surface event. */
  readonly seq: number
  /** Heuristic tokens for the exact message projected by this node. */
  readonly tokens: number
}
```

Thứ tự bề mặt có tính thẩm quyền; seq bền vững của node thay thế có thể cao hơn các node nằm sau nó về vị trí. Ảnh chụp này bất biến, không tăng thêm khi phép gấp (fold) phát lại bên dưới tiến lên.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtokenmeter--tokenmeter"></a>

### `ctx.tokenMeter` — `TokenMeter`

Replay owner for one service-wide estimator and isolated per-session folds.

```ts cordis-catalog
/**
 * Measure current request pressure and surface through the durable tail.
 *
 * Provider usage is reused only when the latest successful call's canonical
 * request envelope matches `requestHeader` and its total is no lower than
 * that call's full heuristic anchor; otherwise the complete envelope and
 * surface are heuristically repriced.
 *
 * `requestHeader` affects request pressure only; surface fields always
 * describe the current session surface. Every call clones those positional
 * nodes, so measurement is O(surface).
 *
 * @param session - session to replay through its current durable tail.
 * @param requestHeader - optional effective request envelope replacing the latest logged header.
 * @returns a detached deeply immutable pressure and surface measurement.
 */
measure(session: Session, requestHeader?: EpochHeader): TokenMeasurement

/**
 * Heuristically price one model-visible message (instance face of the pure
 * `estimateMessage` export from `estimate.ts`).
 * @param message - message to price without mutation.
 * @returns content and role-framing tokens under the fixed service heuristic.
 */
estimateMessage(message: Message): number
```

Types: [EpochHeader](session.md) · [Message](llm-streaming.md) · [Session](session.md)

Source: [`packages/llm/token-meter/src/index.ts:74`](../../packages/llm/token-meter/src/index.ts)
<!-- END GENERATED cordis-surface -->
