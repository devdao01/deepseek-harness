# Nén (compaction)

[English](compaction.md) | Tiếng Việt

Compaction seam là một [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md), giống như bash, được chia thành Service Definition ([dsh-compaction](../../packages/compaction/compaction), `ctx.compaction`), Service Provider (ví dụ backend [dsh-compaction-basic](../../packages/compaction/compaction-basic)) và Consumer hướng tới người dùng ([dsh-command-compact](../../packages/compaction/command-compact)). Nén là **một năng lực tùy chọn**, không thuộc phần trục chính của agent loop (vòng lặp tác tử), nên từ vựng của nó được định nghĩa ở đây chứ không phải trong [core.md](core.md). Các backend dựa trên tokenizer hoặc dựa trên template là những package anh em cùng hiện thực một interface. Khác với bash, interface này tất yếu phụ thuộc vào `dsh-session` và `dsh-llm`: các động từ của nó tác động lên `Session` do agent sở hữu, còn các sự kiện tóm tắt bền vững của nó dùng từ vựng `ContentBlock` (xem [Agent Note về compaction capability seam](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)).

Mã nguồn: [`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## Sự kiện session `compaction/*`

Compaction mở rộng [`SessionEventMap`](session.md) thêm ba loại sự kiện thông qua declaration merging. Cả ba đều **chỉ ghi vào log** — chúng ghi lại khóa, bản tóm tắt, phạm vi được chọn, seq của các sự kiện bị che, số token và lời gọi mô hình, và tuyệt đối không đi vào surface. Ở đây cố ý không mở rộng `SurfaceEventType` (chỉ những sự kiện sinh ra message mới đến được mô hình), nên bản tóm tắt tự nó được mang trên một `user/message` khác kèm `surfaceOp: { op: 'replace', start, end }` — đây là thay đổi surface duy nhất mà quá trình nén tóm tắt thực hiện. [Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md) chịu trách nhiệm về căn cứ của quyết định tái sử dụng `user/message`.

| Sự kiện | Payload | Vai trò |
|---|---|---|
| `compaction/start` | `{ turn }` | Lấy khóa được ghi vào log; số nhận diện lượt tự động chưa kết thúc, `null` nhận diện lần thử thủ công độc lập |
| `compaction/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | Phép chiếu tóm tắt an toàn, đầu ra provider đầy đủ tùy chọn cùng usage, cờ `llmStreamCall: true` cho biết kết quả được tạo qua đúng một lời gọi `ctx.llm.stream()` từ context này (khi đó bắt buộc phải cung cấp `rawOutput` đầy đủ), cặp biên surface bị che (`start`/`end` seq — một khoảng theo vị trí, không phải khoảng số học), các seq bị che theo thứ tự surface, số token ước tính, và envelope của lời gọi tóm tắt (`provider`, `model`, cùng giới hạn sinh nếu có) — sau khi ghi vào log, yêu cầu một lần này có thể được tái dựng từ log + mã nguồn (xem Agent Note về tính tái dựng); `rawOutput` không kèm cờ thì không đủ để xác định đường đi của lời gọi |
| `compaction/end` | `{ turn, error? }` | Giải phóng khóa với cùng giá trị quy thuộc dạng số hoặc `null` (`error` ghi lại lần thử thất bại) |

Khóa bao trọn **toàn bộ** thao tác: trước hết nối thêm `compaction/start`, rồi thực hiện sinh tóm tắt, ghi bản ghi `compaction/summary` và phần thay thế `user/message`, cuối cùng mới nối thêm `compaction/end`. Việc giải phóng khóa sau cùng nghĩa là một sự cố giữa chừng sẽ biểu hiện thành khóa còn sót có thể phát hiện được (có `compaction/start` mà không có `compaction/end` khớp), thay vì một `compaction/end` tuyên bố sai rằng nén đã hoàn tất.

Những dấu mốc này biểu thị thời điểm của khóa, chứ không phải một vật chứa loại trừ. Trong lúc chờ tóm tắt, các lần chèn lúc rảnh không liên quan có thể xuất hiện giữa cặp start và end thủ công độc lập. Đường đi thủ công chỉ xác thực lại span vị trí đã chọn, nên phần ngữ cảnh được chèn đó vẫn được giữ lại sau checkpoint thay thế. Một start chưa khớp còn hoạt động sẽ chặn mọi điểm vào; một start chưa khớp nằm trước `session/end-seed` mới hơn là bằng chứng cũ còn sót lại từ vòng đời trước và sẽ bị bỏ qua.

Các biến thể này được hợp nhất bên trong khối `declare module '@deepseek-ai/dsh-session/types'`, nên — khác với các kiểu cấp cao nhất trên những trang subsystem khác — chúng không được dán vào khối ` ```ts type-equiv ` của kiểm tra trôi lệch (bộ trích xuất `verify-type-equiv` chỉ khớp các khai báo cấp cao nhất theo tên). Bảng payload phía trên chính là mục lục; các trường có thẩm quyền xin xem theo liên kết mã nguồn.

## `CompactionResult`

Một lần nén thành công trả về cho bên gọi: seq của các sự kiện ghi sổ, phép chiếu tóm tắt an toàn, phạm vi và các seq bị che, cùng số token ước tính.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: number
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: number
  /** The seq of the appended `compaction/end` event. */
  endSeq: number
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: number; end: number }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: number[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## Dịch vụ

Bên gọi tự động sẽ nêu rõ vì sao chính sách chạy; hiện thực có thể xử lý tình huống tràn đã được xác nhận quyết liệt hơn so với áp lực thông thường.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` phơi bày `compactIfNeeded(agent, trigger, signal)` để thực thi chính sách tự động `pressure` hoặc `context-overflow`, phơi bày `compactNow(agent, signal)` để thu gọn hữu ích một lần cho session đang rảnh ngay cả khi chưa đạt ngưỡng áp lực, và còn phơi bày `compactRegion(...)` cho một phạm vi surface tường minh, bao gồm cả hai đầu. `compactNow()` chạy như agent maintenance giữa các lượt; khi không có phạm vi hữu ích thì trả về `null` và không ghi gì; nó ghi một cặp dấu mốc `turn: null` độc lập trước khi tóm tắt, và flush lần thử đã đóng trước khi các prompt xếp hàng phía sau có thể phái sinh từ surface mới. Mỗi backend đều dùng `compactCheckpointSource(compactionId, sourceCommandId?)` để tạo nguồn cho `user/message` thay thế; các consumer phía client và wire import hàm khởi tạo đó, `CompactionCheckpointSource` và `isCompactCheckpointSource()` từ subpath không phụ thuộc Cordis là `@deepseek-ai/dsh-compaction/checkpoint`, còn gốc package thì re-export chúng cho consumer phía host. Danh tính giao dịch bắt buộc sẽ liên kết checkpoint thay thế, và hàm phán định đó giúp việc nhận diện checkpoint không phụ thuộc vào bất kỳ backend cụ thể nào. Hiện thực phải chuyển tiếp signal nhận được cho luồng tóm tắt. Seam này không sở hữu API định lượng: singleton [`ctx.tokenMeter`](token-meter.md) trực tiếp sở hữu việc ước tính và phát lại, còn `dsh-compaction-basic` sở hữu chính sách giữ lại, thứ tự sự kiện, lời gọi tóm tắt thực thi theo route cùng cấu hình của nó.

Các thất bại thủ công dự kiến dùng `ManualCompactionErrorCode`:

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` và `summary` giữ nguyên surface của session, nhưng vẫn đóng lần thử thất bại và ghi bền vững nó vào log. `commit` có thể xảy ra sau khi đã có thay đổi một phần; `persistence` nghĩa là cặp dấu mốc trong bộ nhớ đã đóng, nhưng flush thất bại. Việc hủy độc lập với các thất bại này và ném lại nguyên nhân abort gốc sau khi hoàn tất dọn dẹp cần thiết.

Nén theo áp lực chạy trong `agent/pre-step` tuần tự, trước bước suy dẫn yêu cầu. Một khi áp lực hoặc tràn đã chuẩn hóa thỏa điều kiện, compaction-basic sẽ gọi [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.md) tùy chọn trước khi chọn phạm vi, rồi đo lại qua `ctx.tokenMeter`, và có thể đẩy surface tiến lên mà không cần sinh tóm tắt. Việc khôi phục sau yêu cầu thất bại chạy qua `agent/request-error` sau khi bước thất bại đã đóng; chỉ trả về hành động thử lại khi surface replacement generation tiến lên, kể cả khi công việc tóm tắt sau đó ném ngoại lệ sau bước prune; việc hủy vẫn được ưu tiên. Biên vùng giữ nguyên cặp tool call/kết quả, nhưng không giữ nguyên cả lượt, nên một bước đã đóng sớm hơn trong một lượt quá lớn vẫn có thể bị nén. `dsh-compaction-basic` sở hữu ngưỡng, chính sách giữ phần đuôi, giới hạn tràn và cách xử lý thất bại.

Service Definition này export `toolPairingBalancedBefore(session, seq)` và `toolPairingBalancedAfter(session, seq)` để kiểm tra cặp tool call/kết quả trước và sau một seq. Cả hai đều xác thực tư cách thành viên surface hiện tại, và từ chối các seq thiếu cũng như kết quả còn sót; [quy ước của package](../../packages/compaction/compaction/README.md#tool-pairing-boundaries) định nghĩa hành vi cache của chúng.

## Kết quả prune tool result

Dịch vụ prune tool result tùy chọn sẽ báo cáo từng lần thay thế nội dung bền vững cùng tổng mức giảm tính theo Unicode code point. Kiểu kết quả công khai của nó nằm ở [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts).

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: number
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: number
  /** Tool call shared by the original and replacement. */
  readonly callId: CallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (abstract seam)

Abstract compaction service. Implementations own trigger policy, retention, and summarization, and may consume a separate measurement service. A successful run replaces the selected surface span with one summary node and prevents concurrent compaction of the same session. The replacement user message uses compactCheckpointSource with the transaction identity so consumers recognize and correlate it independently of the backend. Load one implementation per context as `ctx.compaction`.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: number, end: number, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>
```

Types: [CommandId](commands.md)

Source: [`packages/compaction/compaction/src/index.ts:96`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Deterministic head/middle/tail pruning for current tool-result surface nodes.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types: [ContentBlock](llm-streaming.md) · [Session](session.md)

Source: [`packages/compaction/compaction-tool-result-pruner/src/index.ts:44`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)
<!-- END GENERATED cordis-surface -->
