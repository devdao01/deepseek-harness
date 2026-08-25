# Đầu ra streaming của LLM (mô hình ngôn ngữ lớn)

[English](llm-streaming.md) | Tiếng Việt

[`packages/llm`](../../packages/llm/README.md) cung cấp các kiểu hội thoại và streaming: các biến thể `Message`/`ContentBlock` dùng chung cho mọi request và lịch sử bền vững, request mô hình đã lắp ráp đầy đủ, giao thức `StreamChunk` thô, adapter contract mà mọi adapter phải hiện thực, cùng assembler dùng chung. [Package core](core.md) giữ và ghi lại các giá trị này ở từng lượt; trang này khai báo chúng.

Mã nguồn: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="content-blocks-and-messages"></a>

## Khối nội dung và thông điệp

Một cuộc hội thoại gồm các `Message`; một thông điệp là mảng các **khối nội dung** có kiểu. Kiểu union của khối được phái sinh từ `ContentBlockMap`.

Mã nguồn: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}
```

Các interface khối (xem mã nguồn để biết đầy đủ trường): `TextBlock` (`text`), `ReasoningBlock` (thinking, phân biệt với văn bản hiển thị), `ImageBlock` (một [tệp đính kèm ảnh](attachment.md) bền vững), `ToolCallBlock` (`id: CallId`, `name`, chuỗi JSON `arguments` thô), và `ToolResultBlock` (`toolCallId`, `content: ContentBlock[]` lồng nhau, `isError?`). `ContentBlock = ContentBlockMap[ContentBlockType]`. Chỉ đưa một modality mới vào map mở rộng được bằng merge khi cả adapter, UI, compaction (nén ngữ cảnh) và đường phát lại bền vững đều đã hỗ trợ nó.

Mã nguồn: [`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

`Message` là một giá trị bất biến, có định danh, gồm vai trò／nguồn／nội dung. Thông điệp assistant do mô hình sinh ra sẽ ghi vào phần nguồn provider và model đã tạo ra nó, cùng dữ liệu phát lại riêng của adapter (tùy chọn):

```ts type-equiv
/** Provider/model identity and adapter-private replay data for an assistant message. */
interface AssistantProvenance {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmRuntime` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** One immutable message representation shared by delivery, durable history, and model requests. */
interface Message {
  /** Stable identity preserved across every representation boundary. */
  readonly id: MessageId
  /** Provider-neutral conversation role. */
  readonly role: 'system' | 'user' | 'assistant'
  /** Exact model-facing blocks. */
  readonly content: ContentBlock[]
  /** Required source fields supplied by the producer. */
  readonly source: MessageSource
}
```

Bản thân nguồn của thông điệp cũng là một kiểu tổng (sum type) mở rộng được bằng merge:

```ts type-equiv
/**
 * Where a message (or injected content) came from.
 * Merge-extensible sum type — plugins add their own `kind`s.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  plugin: { kind: 'plugin'; plugin: string } & ContextFormed
  model: ModelMessageSource
  tool: ToolMessageSource
}
```

Định danh bên sản xuất và hình thức trình bày độc lập với nhau. `kind` trả lời "ai đã tạo ra"; `form` tùy chọn trả lời "đây là loại thông tin gì", còn bên tiêu thụ quyết định cách trình bày. Nhiều bên sản xuất có thể dùng chung một `form`, và một bên sản xuất cũng có thể phát ra nhiều `form` khác nhau trong cùng một phiên. Các giá trị này mô tả ngữ nghĩa và được bổ sung từng giá trị một; giá trị không được khai báo hoặc không nhận diện được sẽ dùng mặc định mà tài liệu quy định và được trình bày như nội dung không trong suốt:

```ts type-equiv
/**
 * The kind of information in producer-supplied context, declared by the
 * producer beside its provenance.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form, and one producer may emit more than one form over
 * a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source types that carry one.
 *
 * Discriminated by `form` so a producer cannot select a form without the
 * fields needed to present it: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

<a id="streamchunk--the-raw-protocol"></a>

## `StreamChunk`: giao thức thô

Một phản hồi streaming chứa xen kẽ nhiều loại khối (văn bản, reasoning, nhiều lời gọi công cụ). `index` gắn mỗi delta với khối mà nó thuộc về; `block-end` mang theo `ContentBlock` đã lắp ráp hoàn chỉnh, nên bên tiêu thụ không cần tự ghép lại các delta. Đây là một union phân biệt **đóng**: `switch` trên `type` kết thúc bằng `assertNever`, nên khi thêm biến thể mới, mọi bên tiêu thụ bắt buộc phải xử lý nó sẽ báo lỗi biên dịch.

```ts type-equiv
/**
 * Adapter-private lossless-JSON state for replaying a successful response,
 * carried by a terminal `finish` chunk and stored on the assembled assistant
 * message's model source. Both halves stay opaque to the harness; only the
 * split is shared vocabulary, so assembly can keep stored metadata aligned
 * with stored content without reading either half.
 */
interface ReplayEnvelope {
  /** Response-level adapter-private metadata (ids, native stop reason). */
  response: unknown
  /**
   * Per-block adapter-private metadata, one entry per emitted block in
   * first-seen stream order. When assembly drops a block it drops the entry at
   * the same position; entries whose length does not match the emitted block
   * count discard the whole envelope. An adapter whose metadata is independent
   * of block structure omits this field and the envelope passes through
   * assembly unchanged.
   */
  blocks?: readonly unknown[]
}
```

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmRuntime.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: CallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Replay metadata for a successful response; see {@link ReplayEnvelope}. */
    replayState?: ReplayEnvelope
  }
```

<a id="llmfailure"></a>

## `LlmFailure`

Mọi lỗi được ném ra hoặc lỗi in-band từ adapter cuối cùng đều được chuẩn hóa thành một payload có thể tuần tự hóa và độc lập với provider. `providerRetryAfterMs` là độ trễ dương đã được kiểm chứng do provider yêu cầu, chứ không phải quyết định thử lại; `ProviderRequestId` là chuỗi branded không trong suốt dùng cho chẩn đoán.

```ts type-equiv
/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
}
```

## Cam kết của adapter

Mọi adapter phải tuân thủ các quy tắc sau, và mọi bên tiêu thụ có thể dựa vào chúng:

- **`usage` đứng trước `finish`, và sau `finish` không còn chunk nào nữa.** Hãy hoãn cả hai tới dấu kết thúc luồng của provider, để chunk chỉ chứa usage ở cuối không phá vỡ thứ tự.
- **`arguments` của lời gọi công cụ luôn giữ nguyên dạng chuỗi JSON thô trong suốt quá trình.** Các mảnh cục bộ được truyền theo luồng qua `argumentsDelta`; nếu provider trả về đối tượng đã parse, adapter phải tuần tự hóa lại thành chuỗi tại `block-end`.
- **Hai đường lỗi được hỗ trợ, dùng chung một kiểu `LlmFailure`.** Lỗi có thể được ném ra từ `stream()` (lỗi truyền tải／giao thức), **hoặc** kết thúc luồng bằng `finish {kind:'error'|'aborted', failure}` (adapter không thể ném ngoại lệ giữa chừng dùng cách này để biểu diễn lỗi in-band của provider). `LlmError.failure` mang chính `LlmFailure` đó. Sau khi lời gọi đã chọn xong adapter, luồng giữ nguyên đúng đối tượng `Error` đã bị ném, đồng thời gắn vào lời gọi đó các dữ kiện bất biến cùng chính sách thử lại bất biến của đăng ký thực sự phục vụ nó; agent loop (vòng lặp tác tử) đóng bước thất bại, rồi cung cấp cho `agent/request-error` lỗi, các dữ kiện, dữ kiện bất biến về những lần thất bại đã thử lại trước đó, chính sách thực sự phục vụ và tín hiệu của lượt. Listener xử lý lỗi đó trả về `{ kind: 'retry' }` sau khi việc khắc phục mà nó await hoàn tất; nếu không khôi phục được, lỗi có cấu trúc sẽ trở thành lỗi của lượt, và lần thử đó không commit thông điệp assistant thông thường hay tác dụng phụ của công cụ.
- **Một lời gọi adapter là một lần thử với provider.** Adapter tắt cơ chế thử lại của thư viện. Việc khôi phục ở tầng agent sẽ mở một lượt bền vững, có đánh số khác; bên gọi trực tiếp `ctx.llm.stream()` vẫn chỉ thử đúng một lần.
- **Việc provider ngừng gửi dữ liệu bị ràng buộc thời hạn ở tầng truyền tải.** Cả hai adapter từ xa đã bàn giao đều phơi bày `streamIdleTimeoutMs` dương và hữu hạn, mặc định năm phút. Watchdog chỉ khởi động khi `next()` của iterator chưa hoàn tất, dùng cùng một signal ổn định cho toàn bộ request, ánh xạ việc hết hạn của chính nó thành `TIMEOUT`, và giữ nguyên `ABORTED` cho lần hủy từ bên gọi xảy ra sớm hơn.
- **Tràn ngữ cảnh chỉ có duy nhất một code chuẩn tắc.** Cả hai adapter DeepSeek đều dùng `isContextWindowExceededError()` để phân loại chi tiết tường minh của provider và phơi bày `CONTEXT_WINDOW_EXCEEDED`, bất kể lỗi đến dưới dạng `LlmError` HTTP được ném ra hay finish error in-band. Bên tiêu thụ định tuyến theo code, tuyệt đối không dựa vào văn bản của provider.
- **Completion rỗng là lỗi có thể thử lại, chứ không phải kết quả thành công âm thầm.** Cả hai adapter đều ánh xạ kết thúc `stop` cuối cùng mà không mang theo bất kỳ khối nội dung nào thành `finish {kind:'error'}` với code chuẩn tắc `EMPTY_RESPONSE`, và `dsh-llm-retry` mặc định sẽ thử lại nó; xem chi tiết ở [phản hồi mô hình rỗng là có thể thử lại](../../.agents/notes/implemented/bug-fix/2026-07-24-empty-model-response-is-retryable.md).
- **Mọi request HTTP tới provider đều mang header ghi nhận ứng dụng.** Adapter gửi `attributionHeaders()` (xem bên dưới) làm `User-Agent` cơ sở, và chứng minh điều đó bằng kiểm thử ở mức giao thức.
- **Trạng thái phát lại thuộc về adapter; cách chia đôi nó là từ vựng dùng chung.** Một `finish` thành công có thể mang theo một `ReplayEnvelope`: metadata mức phản hồi không trong suốt, cộng với các mục theo từng khối (tùy chọn) được căn khớp với chuỗi khối đã phát ra. Quan hệ căn khớp này là từ vựng của harness — khi quá trình lắp ráp loại bỏ một khối thì mục ở cùng vị trí cũng bị loại bỏ, nhờ vậy metadata được lưu luôn mô tả đúng nội dung được lưu. Vòng lặp lưu dữ liệu đã cắt tỉa cùng với thông điệp assistant đã lắp ráp. Ở các request sau, `LlmRuntime` chỉ chuyển tiếp trạng thái đó khi provider lịch sử và provider đích hiện đang được đăng ký với đúng cùng một instance adapter. Adapter đó chịu trách nhiệm kiểm chứng trạng thái và sở hữu mọi phép chuyển đổi xuyên mô hình hoặc xuyên provider; các adapter khác chỉ nhận nội dung độc lập với provider cùng các trường provider／model, chứ không nhận trạng thái riêng tư. Nội dung được persist vẫn giữ tính quyền uy: khi đọc phải trạng thái đã lưu mà adapter không dùng được, chỉ riêng thông điệp đó bị hạ cấp xuống phép chuyển đổi độc lập với provider kèm thông tin chẩn đoán, chứ không làm request thất bại.

## `ResolvedRetryPolicy`

Cấu hình provider được phân giải thành một union phân biệt bất biến trước khi đăng ký route. Normal mode mang `mode: 'normal'`, `maxRetries` hữu hạn, `retryableCodes`, cùng các trường bắt buộc `initialDelayMs`, `maxDelayMs` và `jitterRatio`; always mode mang `mode: 'always'` và cùng bộ trường backoff bắt buộc đó, nhưng không có giới hạn trên hữu hạn. `LlmRuntime.providerRetryPolicy(provider)` trả về giá trị đang được đăng ký và cung cấp mặc định normal khi adapter bỏ qua chính sách; sau khi lời gọi đã chọn xong đăng ký đó, `llmRetryPolicyOf(stream)` trả về giá trị mà đăng ký phục vụ lời gọi này đã nắm bắt, nên việc giải phóng hay thay thế route về sau không thể thay đổi chính sách khôi phục của một lỗi đang diễn ra. Các trường cấu hình đầu vào tùy chọn được liệt kê trong [danh mục cấu hình được sinh ra](../config-catalog.md).

## `AppIdentity`: ghi nhận ứng dụng

Định danh ứng dụng công khai, tĩnh mà mọi adapter đều gửi tới provider ([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)` chỉ ánh xạ nó vào header `User-Agent` tiêu chuẩn; cam kết này cố ý không hỗ trợ các header ghi nhận ứng dụng riêng của OpenRouter. `APP_IDENTITY` mặc định lấy phiên bản từ manifest (bản kê metadata) của package; mọi trường đều là dữ kiện sản phẩm công khai — không chứa secret, đường dẫn, id phiên hay định danh theo từng người dùng, và không thông tin theo từng request nào được phép ảnh hưởng tới các giá trị này. Lý do thiết kế xem [bắt buộc ghi nhận qua `User-Agent`](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md).

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Repository home URL of the app, used as the `User-Agent` comment. */
  url: string
}
```

<a id="tokenusage"></a>

## `TokenUsage`

Hạch toán token theo từng lời gọi. Các số đếm **không chồng lấn nhau**: `inputTokens` chỉ gồm phần đầu vào không được cache; đầu vào từ cache được báo cáo riêng, và đầu vào tính phí là tổng của cả ba. Nếu provider gộp số lần trúng cache vào một tổng prompt duy nhất (như `prompt_tokens` của DeepSeek), adapter sẽ trừ phần đó ra. `reasoningTokens` khi có mặt chỉ là chi tiết mang tính thông tin và đã nằm sẵn trong `outputTokens`; không được cộng lặp khi tổng hợp.

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

<a id="blockassembler"></a>

## `BlockAssembler`

`BlockAssembler` ([`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts)) là hiện thực dùng chung duy nhất, chịu trách nhiệm gấp (fold) luồng `StreamChunk` trở lại thành `ContentBlock`, usage, lý do kết thúc và trạng thái phát lại. Vòng lặp vừa ghi lại các chunk thô vừa đưa chính loạt chunk đó vào assembler, rồi lưu nội dung assistant đã lắp ráp cùng với provider và model đã sinh ra nó. Bên tiêu thụ nào cần kết quả lắp ráp mà không muốn hiện thực lại phép fold thì dùng nó.

Nội dung và metadata dùng chung một quyết định giữ/bỏ duy nhất: kết thúc `max-tokens` sẽ loại bỏ mọi lời gọi công cụ, vì lời gọi bị cắt cụt không thể thực thi an toàn, và cũng chính quyết định đó cắt bỏ mục theo từng khối của dữ liệu phát lại ở mỗi vị trí bị loại. Dù quá trình lắp ráp có loại bỏ gì đi nữa, `blocks()` và `replayState` cũng không thể lệch nhau.

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /**
   * Replay metadata from the terminal finish chunk, if any, with per-block
   * entries pruned in step with {@link blocks}. Undefined when the envelope's
   * entries do not align with the emitted blocks.
   */
  get replayState(): ReplayEnvelope | undefined;
  /**
   * The assembled assistant message.
   * @param source - producer attribution for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: MessageSource = { kind: 'plugin', plugin: 'dsh-llm/assembler' }): Message;
}
```

<a id="the-model-request-and-result"></a>

## Request mô hình

Một lời gọi mô hình là một `GenerateOptions` đã được lắp ráp đầy đủ. Adapter đáp lại bằng luồng [`StreamChunk`](#streamchunk--the-raw-protocol) thô; bên tiêu thụ dùng [`BlockAssembler`](#blockassembler) để lắp ráp nó.

Mã nguồn: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

Việc khám phá provider và model dùng các descriptor nhỏ, độc lập với provider. Danh mục model chỉ mang tính tham khảo: định tuyến vẫn lấy provider đã đăng ký làm khóa, và adapter cũng có thể chấp nhận những model id không được liệt kê.

Việc đăng ký adapter trả về một handle: vừa là bộ giải phóng, vừa kèm thao tác thay thế route nguyên tử — đúng thứ mà plugin có tập route do cấu hình người dùng quyết định cần đến.

```ts type-equiv
/**
 * What {@link LlmRuntime.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

Plugin adapter còn dùng `registerConfigurableProviders()` để khai báo những route *có thể* chạy, đồng thời chỉ ra phân mục user-settings của từng route, giúp giao diện cấu hình trình bày được các provider đang ngủ ngay cả trước khi có bất kỳ route nào được đăng ký.

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
  /** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
  inputModalities?: readonly ModelModality[]
}
```

Metadata nhạy cảm với tính đúng đắn được phân giải tách biệt khỏi danh mục tham khảo, và thuộc về adapter phục vụ đúng route đó. Dung lượng ngữ cảnh, mặc định lời gọi của adapter và các tùy chọn suy luận dùng chung một kết quả model chính xác, nhờ vậy bên tiêu thụ không phải lặp lại việc phân giải model có tính quyền uy.

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

Reasoning effort (cường độ suy luận) là một năng lực khác gắn với route chính xác. Phần core gắn kiểu branded cho định danh nhưng không liệt kê các giá trị của nó; tập hợp có thứ tự, tên hiển thị và mặc định triển khai tùy chọn đều do từng adapter nắm giữ.

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts in adapter-preferred display order. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
}
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them (after
   * the `system` slot). A loop-built request assembles them as
   * the derived history (dsh-agent-loop); a hand-built one-shot passes any list.
   */
  messages: Message[]
  /** System prompt text (adapters map to the provider's system slot). */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for request routing. Replay uses it
   * to separate cursors; adapters may map it to model-hidden transport metadata.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata or purpose-specific
   * generation policy. Ordinary conversation requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

Lý do phản hồi mô hình dừng lại được biểu diễn bằng tập lý do mở rộng được bằng merge. Lỗi ở trạng thái cuối của provider mang theo [`LlmFailure`](#llmfailure) của cam kết streaming:

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`. `TokenUsage` (đo lường theo từng lời gọi, gồm các trường cache không chồng lấn) được nói chi tiết ở [phần dưới](#tokenusage).

`GenerateOptions.tools` mang theo `ToolSchema` — mô tả JSON Schema của công cụ, được gửi tới mô hình. Nó được khai báo trong dsh-llm (chứ không phải dsh-tools) chính vì nó là một phần của request mà vòng lặp lắp ráp ở mỗi bước:

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in dsh-tools) because it is part of {@link GenerateOptions};
 * dsh-tools' ToolDefinition and dsh-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

`ToolSchema` hướng tới mô hình là kiểu thuộc giao thức; `ToolDefinition` đã đăng ký sinh ra nó (schema + `execute`) nằm trong [tools.md](tools.md).

Provider mà giao diện đang soạn thảo thì chưa có route lẫn catalog, nên việc truy vấn được mô tả riêng: request mang theo bản nháp người dùng đang chỉnh sửa, còn phản hồi là các ứng viên mà giao diện có thể chọn dùng, chứ không phải catalog mà nó buộc phải phục vụ.

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
  /** Caller cancellation; implementations must settle promptly after it aborts. */
  signal?: AbortSignal
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
}
```

### Phong bì request: `LlmCallConfig` và header được ghi nhật ký

Vòng lặp dựng từng request từ trạng thái đã được ghi nhật ký. `EpochHeader` ghi lại call config, đánh dấu những trường do mặc định của adapter cung cấp, và thông qua ảnh chụp `request/header` đầy đủ ghi lại prompt đã render cùng thứ tự công cụ trả về có tính quyền uy (do `toolOrder` cấu hình; khi không cấu hình thì theo thứ tự từ điển). Kết hợp với lịch sử phái sinh, request có thể được tái dựng từ nhật ký phiên. Xem [session.md](session.md#the-request-header-event-requestheader) và [Agent Note về tính tái dựng được](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md).

`agent/request` nhận hạt giống call config đã bị đóng băng, và có thể trả về giá trị thay thế để đổi provider, model, reasoning effort hoặc tham số lấy mẫu. Trước khi waterfall (sự kiện kiểu thác nước) bắt đầu, vòng lặp loại bỏ những giá trị được đánh dấu là mặc định của adapter, để quá trình chuẩn bị model chính xác điền vào giá trị hiện tại của route đã chọn; các thiết lập tường minh không mang dấu vẫn được giữ trong đề xuất. Sau khi waterfall kết thúc, dưới sự kiểm soát của tín hiệu lượt, quá trình chuẩn bị sẽ từ chối các ID reasoning effort được chỉ định tường minh nhưng không được hỗ trợ (không tự động điều chỉnh), rồi ghi lại cấu hình có hiệu lực cùng những trường do mặc định của adapter cung cấp. Lời gọi đã chuẩn bị xong luôn giữ cùng một đăng ký adapter cho tới khi việc điều phối hoàn tất. Request đến `llm/stream` bị đóng băng sâu, nên mọi thay đổi sẽ ném ngoại lệ; request còn mang theo định danh vòng lặp cục bộ trong tiến trình, giúp bên quan sát không nhầm những lời gọi phụ trợ đã đóng băng và được ghi nhật ký riêng thành request hội thoại.

Trong giao thức, request do vòng lặp dựng sẽ đọc slot `system` trước (phần lắp ráp prompt đã render), rồi mới đọc lịch sử phái sinh. Ảnh chụp request đã ghi nhật ký kết thúc bằng `user/message` mới nhất (ở bước đầu của lượt) hoặc bằng kết quả công cụ của bước trước (ở các bước sau). Bất biến dành cho phát triển sẽ tính lại chính xác đẳng thức này cho từng request do vòng lặp dựng.

FIXME(call-config-shape): xem xét lại xem những trường còn lại nào thực sự thuộc cấp epoch vì mục đích caching (`model` và reasoning effort do model nắm giữ thì chắc chắn thuộc về; các đại lượng vô hướng lấy mẫu tạm thời được giữ ở đây vì thận trọng).

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## Cam kết của service và provider

`LlmAdapter` là cam kết dành cho provider: tạo lớp con, hiện thực `stream()`, rồi đăng ký một instance adapter bằng `ctx.llm.registerAdapter(providers, adapter)`. `GenerateOptions.provider` chọn adapter đã đăng ký; `GenerateOptions.model` được chuyển cho adapter đó mà không cần đăng ký lúc khởi động vòng đời. Route provider trùng lặp sẽ thất bại một cách nguyên tử. `providerRetryPolicy()` tùy chọn được nắm bắt theo từng route và điền mặc định normal, còn `providerInfo()` cùng phương thức bất đồng bộ `listModels()` cung cấp metadata selector đã tách rời cho `LlmRuntime.listProviders()` / `listModels()`. Danh mục này chỉ mang tính tham khảo, không phải danh sách trắng cho request: adapter vẫn là bên quyền uy và có thể chấp nhận những model id không được liệt kê. Một truy vấn bất đồng bộ `resolveModel()` duy nhất trả về định danh model chính xác, cùng các thông tin tùy chọn nhạy cảm với tính đúng đắn: dung lượng ngữ cảnh, `defaultMaxTokens` do adapter cấu hình, các ID reasoning effort có thứ tự do model nắm giữ và mặc định triển khai tùy chọn; trường bị thiếu nghĩa là metadata không khả dụng hoặc giữ nguyên hành vi thuộc về provider, chứ không có nghĩa là quan hệ thành viên trong danh mục không hợp lệ. Bộ phân giải nhận một tín hiệu hủy tùy chọn và phải kết thúc nhanh chóng sau khi tín hiệu bị hủy. `LlmRuntime.resolveModelInfo()` kiểm chứng kết quả tổng hợp và trả về giá trị đã tách rời. Ở ranh giới adapter cuối cùng, `resolveCallConfig()` chỉ điền mặc định đầu ra khi thiếu `maxTokens`, đồng thời kiểm chứng và điền reasoning effort, nên ngay cả lời gọi trực tiếp cũng không thể lách qua bất kỳ hành vi đã cấu hình nào; điều phối trực tiếp sẽ nắm bắt một đăng ký adapter trước khi chờ phân giải. Còn agent loop dùng `prepareCall()`, để việc phân giải model, ghi nhật ký bền vững header request và điều phối đều dùng chung một đăng ký, giữ lại metadata ngữ cảnh đã tách rời từ chính truy vấn đó, và báo cáo những trường cấu hình do adapter điền vào. Việc tra cứu adapter diễn ra ở continuation cuối của waterfall `llm/stream`, nên listener có thể chặn ngắn lời gọi trước khi tra cứu, hoặc định tuyến một request một lần có thể thay đổi. AgentLoop quan sát thấy một lần thử request khi waterfall ở lớp ngoài trả về handle của luồng; ranh giới hữu hạn này không chứng minh rằng adapter cuối kiểu lười đã được khởi tạo xong hay đã bắt đầu I/O tới provider. Việc `index` của `block-start` / `block-end` gắn kết các chunk, cùng với assembler, có nghĩa là adapter chỉ cần emit các chunk đúng định dạng — ghép lại khối không phải là chuyện mà từng adapter phải tự lo. Vị trí của `ctx.llm.stream()` và waterfall `llm/stream` trong một lượt được nói ở [architecture.md](../architecture.md#turn-flow).

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * The result is advisory: an adapter may accept unlisted model ids, and
   * consumers must not turn absence into request rejection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType` (tập khóa mà các khối có gắn kết `index` mang theo) được phái sinh từ [`ContentBlockMap`](#content-blocks-and-messages) ở trên.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxllm--llmruntime"></a>

### `ctx.llm` — `LlmRuntime`

The abstract `llm` service: an adapter registry plus a streaming model-call API, interceptable via the `llm/stream` waterfall.

```ts cordis-catalog
/**
 * Register an adapter for the given provider routes. Throws `LlmError` with code
 * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
 * Disposed with the fiber.
 * @param providers - every provider route this adapter should serve.
 * @param adapter - the adapter that streams calls for those providers.
 * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
 */
registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle

/**
 * Describe provider routes with a registered adapter.
 * @returns detached provider metadata in registration order.
 */
listProviders(): LlmProviderInfo[]

/**
 * Declare provider routes an adapter plugin can activate through
 * configuration. Registration is all-or-nothing: an empty list, invalid
 * entry, or a provider already declared by any registration throws
 * `LlmError` without registering the rest. Disposed with the fiber.
 * @param entries - every configurable provider this plugin owns.
 * @returns a handle that withdraws all of them, and can atomically replace them.
 */
registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle

/**
 * List every declared configurable provider, registered or dormant.
 * @returns detached directory entries in declaration order.
 */
listConfigurableProviders(): LlmConfigurableProvider[]

/**
 * Offer to interrogate provider endpoints on behalf of the settings
 * namespace this plugin owns. The namespace is the key because that is what
 * a configuration surface already holds from the configurable-provider
 * directory, and because a provider being *added* has no route to name yet.
 * Disposed with the fiber.
 * @param settingsNs - the namespace whose profiles this discovery serves.
 * @param discover - interrogates one endpoint; must honor `request.signal`.
 * @returns the disposer that withdraws the offer.
 */
registerModelDiscovery( settingsNs: string, discover: (request: LlmModelDiscoveryRequest) => Promise<readonly LlmDiscoveredModel[]>, ): () => void

/**
 * Interrogate one provider endpoint for the models it advertises. The
 * request describes a draft, not a stored route, so nothing here reads or
 * writes settings or credentials — the caller owns both, and the reply is
 * candidate metadata a surface may offer for adoption.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @returns the advertised models, deduplicated in endpoint order.
 */
async discoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, ): Promise<LlmDiscoveredModel[]>

/**
 * Resolve the retry policy captured when one provider route was registered.
 * @param provider - registered provider route to inspect.
 * @returns the provider-owned policy, with normal defaults already resolved.
 */
providerRetryPolicy(provider: string): ResolvedRetryPolicy

/**
 * Discover models advertised by one registered provider. Catalog membership
 * is advisory and never changes routing or request validation.
 * @param provider - registered provider route to inspect.
 * @returns detached model metadata in adapter-preferred order.
 */
async listModels(provider: string): Promise<LlmModelInfo[]>

/**
 * Resolve and validate all metadata from the adapter that owns one exact
 * route. The result is detached from adapter-owned objects; catalog
 * membership remains advisory and does not control request routing.
 * @param provider - registered provider route to inspect.
 * @param model - exact model id passed to the adapter.
 * @param signal - optional cancellation for adapter-owned asynchronous lookup.
 * @returns exact model identity plus available context and reasoning metadata.
 */
async resolveModelInfo( provider: string, model: string, signal?: AbortSignal, ): Promise<LlmResolvedModelInfo>

/**
 * Validate a conversation call config against its exact model capability and
 * materialize adapter-configured defaults. Unsupported explicit efforts
 * reject before provider I/O; no clamping or aliasing is performed. This
 * standalone query does not bind a later dispatch; use {@link prepareCall}
 * when logging and streaming must share one adapter registration.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a detached config only when a default must be materialized.
 */
async resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>

/**
 * Resolve one call under its current adapter registration. The returned
 * one-shot handle keeps that registration across header logging and dispatch,
 * so HMR cannot combine one adapter's capability result with another adapter.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a prepared config and its registration-bound stream entry point.
 */
async prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>

/**
 * Stream one model call as raw chunks (token-level deltas). Replay state is
 * retained only when the same adapter instance owns its historical provider
 * and the target provider. Final adapter selection remains fixed through
 * asynchronous exact-model resolution and dispatch. Adapter selection,
 * dispatch, and iteration failures become terminal `error` or `aborted`
 * finish chunks; middleware, nested-call, cleanup, and consumer failures
 * remain thrown.
 * @param options - the full request; `options.provider` selects the adapter.
 * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
 */
stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

Source: [`packages/llm/llm/src/index.ts:284`](../../packages/llm/llm/src/index.ts)

<a id="llm-events"></a>

### `llm/*` events

<a id="llmadapters-updated--emit"></a>

#### `llm/adapters-updated` — emit

The provider topology changed: an adapter registered or unregistered routes, or the configurable-provider directory gained or lost entries. This payload-free registry notification fires at each commit point (including registration disposal); consumers re-read `listProviders()`, `listModels()`, or `listConfigurableProviders()` for the new state. Observer failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * The provider topology changed: an adapter registered or unregistered
 * routes, or the configurable-provider directory gained or lost entries.
 * This payload-free registry notification fires at each commit point
 * (including registration disposal); consumers re-read `listProviders()`,
 * `listModels()`, or `listConfigurableProviders()` for the new state.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'llm/adapters-updated'(): void
```

Source: [`packages/llm/llm/src/types.ts:23`](../../packages/llm/llm/src/types.ts)

<a id="llmstream--waterfall"></a>

#### `llm/stream` — waterfall

Waterfall around every streaming model call (retry, replay, routing). Bound to the LlmRuntime; call `next()` to reach the resolved adapter's stream, or yield your own chunks to short-circuit.

```ts cordis-catalog
/**
 * Waterfall around every streaming model call (retry, replay, routing).
 * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
 * adapter's stream, or yield your own chunks to short-circuit.
 * @param options - the full request. A LOOP-built request carries the
 *   process-local {@link markAgentLoopRequest} identity and arrives deep-frozen
 *   (mutation throws): its content is a pure function of the session log (the
 *   reconstructability Agent Note), so listeners read it, never rewrite it.
 *   Hand-built calls do not carry that marker; their messages already obey
 *   the immutable creation contract.
 * @mode waterfall
 */
'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
```

Source: [`packages/llm/llm/src/index.ts:64`](../../packages/llm/llm/src/index.ts)
<!-- END GENERATED cordis-surface -->
