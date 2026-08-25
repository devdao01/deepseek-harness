# Workflow

[English](workflow.md) | Tiếng Việt

Workflow seam cho phép agent (tác tử) chạy các script điều phối do mô hình viết ra, có khả năng khởi động subagent. Giống như [subagent](subagent.md), đây là **một năng lực tùy chọn**, không thuộc agent loop, nên các kiểu dữ liệu và thao tác của nó được ghi ở đây chứ không phải ở [core.md](core.md). Giống như bash, mỗi context chỉ cho phép một engine duy nhất cung cấp `ctx.workflowEngine`; không có registry cho các provider được đặt tên (engine thứ hai thay thế engine thứ nhất thông qua cấu hình plugin, chứ không chạy song song với nó).

Service Definition: [dsh-workflow](../../packages/workflow/workflow) (`ctx.workflowEngine` + từ vựng bên dưới). Service Provider là [dsh-workflow-worker-thread](../../packages/workflow/workflow-worker-thread) (một engine `node:worker_threads` — mỗi run một worker, vm context của script nằm bên trong đó); Consumer hướng mô hình là [dsh-tool-workflow](../../packages/workflow/tool-workflow). Đề xuất và lý do thiết kế xem [dynamic-workflows Agent Note](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md).

Mã nguồn: từ vựng an toàn cho trình duyệt nằm ở [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts), request phía Host và handle của các run đang hoạt động nằm ở [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts).

## Request khởi động

Mục này định nghĩa request mà bên gọi gửi lên khi khởi động một lần chạy. Công cụ workflow thông thường dựng request đó từ lệnh gọi `{ script, meta, args }` của mô hình và agent phát ra lệnh gọi; consumer chuyên biệt còn có thể chọn `subagentProvider` ở cấp engine cho lần chạy này và hạ thấp `maxTotalAgents`, nhưng script không thể quan sát hay thay thế hai chính sách đó. `meta` và `args` là dữ liệu JSON thuần; engine kiểm tra `meta` bằng schema và báo lỗi rõ ràng, từ chối dữ liệu không hợp lệ trước khi bất kỳ công việc nào bắt đầu. Engine không bao giờ lấy chúng bằng cách đánh giá văn bản script. `parent` là trường bắt buộc — mọi agent con do script khởi động đều thuộc về nó, còn cwd, phả hệ và độ sâu được truyền qua [subagent seam](subagent.md).

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}
```

## Danh tính của workflow: `WorkflowMeta`

Khối danh tính đính kèm request khởi động dưới dạng dữ liệu (tham số `meta` của công cụ; từ vựng các trường trùng với khối meta của dynamic workflow trong Claude Code). `phases` chỉ dùng để hiển thị tiến độ: các lệnh gọi `phase()` khớp với tiêu đề để bên quan sát sử dụng; nó không hàm ý bất kỳ cấu trúc thực thi nào.

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## Kết quả cuối: `WorkflowResult`

`WorkflowRun.result` sẽ resolve thành kết quả của một lần chạy. `value` là giá trị trả về đã được vật chất hóa của script — dữ liệu JSON thuần thuộc host realm (là `null` khi script không trả về gì) — và chỉ có ý nghĩa khi ở trạng thái `completed`. `stopReason` là kiểu union đóng (do engine định nghĩa; consumer có thể liệt kê hết): `completed` | `cancelled` | `error`. Những lý do khác `completed` mang theo thông tin lỗi trong `error`, và consumer ánh xạ nó thành kết quả công cụ `isError` thay vì báo cáo phần output dở dang như một thành công.

```ts type-equiv
/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (grace force-settle,
   * worker death) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## Lần chạy đang hoạt động: `WorkflowRun`

Handle mà consumer giữ trong lúc script thực thi. Consumer chờ `result`, có thể gọi `cancel` trong lúc chạy, và bắt buộc phải gọi `dispose` (giải phóng tài nguyên) trên mọi nhánh. `result` không bao giờ bị reject: script thất bại sẽ resolve thành `stopReason: 'error'`. Sau khi một lần chạy bị hủy, kết quả vẫn sẽ được chốt trong khoảng thời gian ân hạn có giới hạn do engine quy định, kể cả khi bản thân script không bao giờ kết thúc; engine sẽ cưỡng chế chốt nó thành `cancelled`, sau đó engine worker-thread sẽ terminate worker chứa script. Nhờ vậy, consumer đang chờ `result` sẽ không bị treo vô hạn sau khi hủy. `dispose()` thực hiện hủy, chờ chốt trong giới hạn và chờ các agent con dừng hẳn, và không bị treo vì script kẹt.

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its children. */
  cancel(reason?: string): void
  /** Cancel if needed and await bounded settlement and cleanup. */
  dispose(): Promise<void>
}
```

## Kỷ luật xử lý lỗi: `WorkflowError.fatal`

Việc dùng sai hook bên trong script: sai tham số, tùy chọn `agent()` không xác định hoặc bị hoãn, schema vượt ngoài [tập con structured output](../../packages/core/tools/README.md), vượt giới hạn trên, seam khởi động thất bại, và hủy bỏ — tất cả đều ném ra `WorkflowError` với `fatal: true`. Các combinator `parallel()`/`pipeline()` ném lại trực tiếp lỗi fatal thay vì ánh xạ mục đó thành `null`: một tùy chọn viết sai chính tả phải báo lỗi rõ ràng và chấm dứt script, tuyệt đối không được tan biến thành thứ trông như một agent con thất bại bình thường. Giá trị `null` theo từng mục được dành cho trường hợp lần chạy con thất bại (stop reason khác `completed`) và các lỗi script thông thường trong một giai đoạn.

## Sự kiện

Các sự kiện `workflow/*` (`workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end`, xem [danh mục sự kiện](#cordis-surface)) là các emit **chỉ để quan sát**, mang theo ảnh chụp dữ liệu: mỗi payload bắt đầu bằng `WorkflowRunInfo` (id + meta) chứ không phải `WorkflowRun` đang hoạt động, nên bên đăng ký không có được `cancel`/`dispose`; `workflow/end` cố ý bỏ qua giá trị result (listener quan sát kết quả không được nhận một alias có thể thay đổi của result thuộc bên gọi). Mỗi lần emit được cô lập theo từng listener: ngoại lệ do bên đăng ký ném ra sẽ được ghi vào log mà không lan truyền, và cũng không ngăn các listener đăng ký sau nhận được sự kiện; mỗi listener nhận một bản sao payload riêng, nên việc sửa đổi nó không làm hỏng engine cũng không ảnh hưởng các listener khác. Cách cô lập này thống nhất với `subagent/start`/`subagent/end`.

## Bản ghi Chat bền vững

Consumer `dsh-tool-workflow` ở cấp cao nhất chiếu các dữ kiện hiển thị vào Session cha đã gọi nó, đồng thời không thay đổi quyền sở hữu việc thực thi. Sau khi lần chạy được chấp nhận, nó ghi `tool-workflow/run-start`, ghép cặp phần bắt đầu và kết thúc của từng thành viên bằng `runId + seq`, và chỉ ghi `tool-workflow/run-end` sau khi đã có kết quả và dispose đã dừng hẳn. Các lệnh gọi transport lồng nhau không ghi bản ghi. Lần append thất bại đầu tiên sẽ vô hiệu hóa các lần ghi tiếp theo của lần chạy này, nhờ đó log vẫn rỗng hoặc là một tiền tố liên tục hợp lệ, còn kết quả công cụ không đổi.

`dsh-tool-workflow/invariant` kiểm tra cùng một giao thức trước khi commit trực tiếp và khi nạp Session: mỗi lần chạy chỉ có một start, số thứ tự thành viên là số dương và duy nhất, phần end của thành viên phải được ghép cặp, không được kết thúc lần chạy khi vẫn còn thành viên đang mở, và không được cập nhật tiếp sau khi lần chạy đã kết thúc. Việc thiếu phần end của thành viên hay run end ở cuối log là bằng chứng hợp lệ của một lần gián đoạn, không phải hỏng dữ liệu.

`dsh-client-ui-workflow-run` gộp bốn loại sự kiện thành một node Chat `workflow-run` thông qua engine Conversation Node, neo ngay sau node công cụ workflow gốc theo số thứ tự run-start. Các nhóm giai đoạn chỉ đến từ những thành viên thực sự đã bắt đầu và giữ nguyên chuỗi chính xác, bao gồm cả sự khác biệt giữa trường bị khuyết và `''`. Khi Location đóng, điểm kết thúc bị thiếu sẽ hiển thị là đã gián đoạn. [README của package giao diện](../../packages/client/ui-workflow-run/README.md) chịu trách nhiệm định nghĩa hành vi disclosure, trạng thái và điều hướng cục bộ trong cùng node cha.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkflowengine--workflowengine-abstract-seam"></a>

### `ctx.workflowEngine` — `WorkflowEngine` (abstract seam)

Workflow Service Definition contract. Invalid requests throw before publication; a live run is holder-owned, its result never rejects, cancellation and disposal are bounded, and disposal waits for child cleanup within that bound. Lifecycle listener failures are contained, and `workflow/end` fires exactly once as the result settles.

```ts cordis-catalog
/**
 * Parse and execute a workflow script.
 * @param request - the script, its `args`, the parent agent, and an
 *   optional cancel signal.
 * @returns the live run; its `result` resolves when the script settles.
 */
abstract start(request: WorkflowStartRequest): WorkflowRun
```

Source: [`packages/workflow/workflow/src/index.ts:157`](../../packages/workflow/workflow/src/index.ts)

<a id="workflow-events"></a>

### `workflow/*` events

<a id="workflowagent-end--emit"></a>

#### `workflow/agent-end` — emit

One `agent()` call settled (clean result, child failure, or run cancellation). Paired with Events['workflow/agent-start'] by `agent.seq`, exactly once per started call on every stop path — on an engine termination path (a worker killed past its grace) the end is engine-synthesized with outcome `'cancelled'`.

```ts cordis-catalog
/**
 * One `agent()` call settled (clean result, child failure, or run
 * cancellation). Paired with {@link Events['workflow/agent-start']} by
 * `agent.seq`, exactly once per started call on every stop path — on an
 * engine termination path (a worker killed past its grace) the end is
 * engine-synthesized with outcome `'cancelled'`.
 * @param info - the run's identity snapshot.
 * @param agent - the call identity plus its outcome.
 * @mode emit
 */
'workflow/agent-end'(info: WorkflowRunInfo, agent: WorkflowAgentEndInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:79`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowagent-start--emit"></a>

#### `workflow/agent-start` — emit

One `agent()` call established a published child run. Paired with Events['workflow/agent-end'] by `agent.seq`. A call that never receives a published run from the provider emits neither event in this pair.

```ts cordis-catalog
/**
 * One `agent()` call established a published child run. Paired with
 * {@link Events['workflow/agent-end']} by `agent.seq`. A call that never
 * receives a published run from the provider emits neither
 * event in this pair.
 * @param info - the run's identity snapshot.
 * @param agent - the call's sequence number, label, phase, and child id.
 * @mode emit
 */
'workflow/agent-start'(info: WorkflowRunInfo, agent: WorkflowAgentInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:68`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowend--emit"></a>

#### `workflow/end` — emit

A workflow run settled (any stop reason). Fired when WorkflowRun.result resolves. Paired with Events['workflow/start'].

```ts cordis-catalog
/**
 * A workflow run settled (any stop reason). Fired when
 * {@link WorkflowRun.result} resolves. Paired with
 * {@link Events['workflow/start']}.
 * @param info - the run's identity snapshot.
 * @param result - the outcome data (stop reason, error, agent count) —
 *   deliberately WITHOUT the result value (see {@link WorkflowResultInfo}).
 * @mode emit
 */
'workflow/end'(info: WorkflowRunInfo, result: WorkflowResultInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:89`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowlog--emit"></a>

#### `workflow/log` — emit

The script emitted a narration line (a `log(message)` call).

```ts cordis-catalog
/**
 * The script emitted a narration line (a `log(message)` call).
 * @param info - the run's identity snapshot.
 * @param message - the logged message, verbatim.
 * @mode emit
 */
'workflow/log'(info: WorkflowRunInfo, message: string): void
```

Source: [`packages/workflow/workflow/src/index.ts:58`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowphase--emit"></a>

#### `workflow/phase` — emit

The script entered a phase (a `phase(title)` call) — progress grouping for observers; no execution semantics.

```ts cordis-catalog
/**
 * The script entered a phase (a `phase(title)` call) — progress grouping
 * for observers; no execution semantics.
 * @param info - the run's identity snapshot.
 * @param title - the phase title, verbatim.
 * @mode emit
 */
'workflow/phase'(info: WorkflowRunInfo, title: string): void
```

Source: [`packages/workflow/workflow/src/index.ts:51`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowstart--emit"></a>

#### `workflow/start` — emit

A workflow run started — the script's meta block validated, the body about to execute. Paired with Events['workflow/end'].

```ts cordis-catalog
/**
 * A workflow run started — the script's meta block validated, the body
 * about to execute. Paired with {@link Events['workflow/end']}.
 * @param info - the run's identity snapshot (id + meta).
 * @mode emit
 */
'workflow/start'(info: WorkflowRunInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:43`](../../packages/workflow/workflow/src/index.ts)
<!-- END GENERATED cordis-surface -->
