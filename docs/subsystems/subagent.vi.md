# Subagent

[English](subagent.md) | Tiếng Việt

subagent seam cho phép một agent (tác tử) uỷ thác công việc cho agent con. Giống như [bash](shell.md), đây là **một capability tuỳ chọn**, không thuộc agent loop (vòng lặp tác tử), nên định nghĩa kiểu của nó nằm ở đây chứ không nằm trong [core.md](core.md). Nó khác các capability seam khác ở chỗ **nhiều bản triển khai provider có thể cùng tồn tại trong một context**, và được đăng ký theo tên (`ctx.subagents`), trong khi bash chỉ cho phép một executor. Registry này theo mô hình [registry adapter LLM (mô hình ngôn ngữ lớn)](llm-streaming.md), chứ không theo mô hình executor bash đơn dịch vụ.

Service Definition: [dsh-subagent](../../packages/subagent/subagent) (`ctx.subagents` + bộ từ vựng bên dưới). Service Provider là sáu package anh em: `dsh-subagent-spawn-in-process`, `-fork`, `-acp`, `-codex`, `-claude-code`, `-dsh-sdk`; các Consumer hướng mô hình gồm [dsh-tool-subagent](../../packages/subagent/tool-subagent) (uỷ thác theo provider), [dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control) (các tool điều khiển toàn cục tuỳ chọn `send_message`, `interrupt_agent` và `list_agents`) và [dsh-tool-subagent-report](../../packages/subagent/tool-subagent-report) (kênh phản hồi `report` tuỳ chọn ở phạm vi child). Chính service `ctx.subagents` này, thông qua trình quản lý activation nội bộ, chịu trách nhiệm điều phối agent con có thể tiếp tục, và cung cấp khả năng khám phá chỉ đọc đối với child cùng hậu duệ trực tiếp dựa trên session store và session persistence tuỳ chọn. Cơ sở thiết kế của các provider sản phẩm xem [Agent Note về Codex và Claude Code](../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md); cơ sở thiết kế của seam tổng quát xem [Agent Note về subagent](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md), [Agent Note về subagent có thể tiếp tục](../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md), [Agent Note về tool report](../../.agents/notes/implemented/feature/2026-07-30-continuable-subagent-report-tool.md), [Agent Note về catalog bền vững](../../.agents/notes/implemented/feature/2026-07-22-durable-subagent-catalog-and-list-agents.md), [Agent Note về projection danh tính cho listing](../../.agents/notes/implemented/architecture/2026-08-06-subagent-list-identity-projection.md) và [Agent Note về hợp nhất service](../../.agents/notes/implemented/simplification/2026-07-26-merge-subagent-control-service.md).

Mã nguồn: [`packages/subagent/subagent/src/types.ts`](../../packages/subagent/subagent/src/types.ts), [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts) và [`packages/subagent/subagent/src/continuation.ts`](../../packages/subagent/subagent/src/continuation.ts)

## Hai loại capability, hai cách khám phá

Provider công bố các tính năng **thời điểm khởi động** của mình qua một descriptor tĩnh, và service sẽ kiểm tra descriptor đó trước cả khi một run đơn lẻ tồn tại; nếu request phụ thuộc vào tính năng mà provider không có, nó sẽ bị từ chối rõ ràng (`SubagentError('UNSUPPORTED_CAPABILITY')`), tuyệt đối không bị chấp nhận rồi âm thầm bỏ qua. Các flag này chỉ mô tả đường đi [`start()`](#the-provider-contract-subagentprovider) một lần, tức đường mà provider tự tổ hợp agent con. Agent con **có thể tiếp tục** được tổ hợp bởi chính trình quản lý continuation, nên chúng được kiểm soát bởi một phương thức tuỳ chọn duy nhất, sự tồn tại của phương thức chính là capability, và cơ chế khám phá là type narrowing của TypeScript: [`SubagentProvider.prepareContinuable`](#the-provider-contract-subagentprovider).

```ts type-equiv
/**
 * Which START-TIME features a provider supports. Checked by the service before delegating to
 * {@link SubagentProvider.start}: a request that needs a capability the chosen provider lacks
 * is rejected with a typed error rather than accepted-then-ignored (the "fail loud, no silent
 * degradation" rule). These flags describe the ONE-SHOT
 * {@link SubagentProvider.start} path, where the provider composes the child;
 * continuable children are composed by the continuation manager itself and are
 * gated by {@link SubagentProvider.prepareContinuable} instead. Each flag
 * corresponds one-to-one to a {@link SubagentStartRequest} option: `depthLimit`
 * to `maxDepth`; the other names match.
 */
interface SubagentCapabilities {
  readonly outputSchema: boolean
  readonly depthLimit: boolean
  readonly toolFilter: boolean
  readonly persona: boolean
}
```

## Request khởi động một lần

Tầng tool dựng request này từ input của mô hình và cấu hình của chính nó; service sẽ kiểm tra request đối với provider được chỉ định trước khi gọi `start`. Trường bắt buộc `parent` cung cấp cwd của session, phả hệ và độ sâu uỷ thác. Các trường tuỳ chọn output schema, depth, bộ lọc tool và persona đòi hỏi flag capability tương ứng phải khớp. Schema không được hỗ trợ sẽ thất bại ngay khi khởi động; backend chạy trong tiến trình giới hạn phạm vi của filter và persona vào giai đoạn tạo agent con, và hiện thực các schema object-rooted được hỗ trợ thông qua tool capture bắt buộc.

```ts type-equiv
/**
 * What a caller asks for when starting a ONE-SHOT subagent. The tool layer
 * builds this from the model's `{ description, prompt }` plus its own config;
 * the service validates {@link SubagentCapabilities} against the named provider
 * and resolves the durable descriptor before dispatching to
 * {@link SubagentProvider.start}.
 */
interface SubagentStartRequest {
  /** Optional short display label persisted with a session-backed child. */
  readonly label?: string
  /** Content delivered as the child's user message. */
  readonly prompt: ContentBlock[]
  /**
   * The spawning agent. In-process providers derive workspace, lineage, and
   * delegation depth from its durable session state. ACP reads only its cwd,
   * and only when no deployment `cwd` override is configured.
   */
  readonly parent: Agent
  /**
   * Cancellation signal from the spawning context (the tool's `exec.signal`).
   * This is the canonical cancellation channel both before and after startup:
   * a provider rejects `start()` after cleaning partial resources when it
   * fires before the run is published, and cancels the published run's
   * remaining turn work when it fires afterward.
   */
  readonly signal: AbortSignal
  readonly agentOptions?: AgentOptions
  /**
   * Object-rooted JSON Schema within `assertObjectJsonSchema`'s enforced subset. Start rejects
   * unsupported schemas or providers without the capability. Data must be plain host-realm JSON;
   * a successful child returns the matching value as {@link SubagentResult.structured}.
   */
  readonly outputSchema?: ObjectJsonSchema
  /**
   * Optional absolute delegation-depth cap for the child being started: its
   * computed depth must be less than or equal to this non-negative safe
   * integer. Requires {@link SubagentCapabilities.depthLimit}; rejected at
   * start otherwise.
   */
  readonly maxDepth?: number
  /**
   * Optional child tool scoping. Requires {@link SubagentCapabilities.toolFilter};
   * rejected at start otherwise. In-process backends apply it as a scoped
   * `tools.restrict()` in the child's creation window: the named tools vanish
   * from the child's prompt AND refuse to execute (one visibility), with loud
   * unknown-name validation.
   */
  readonly toolFilter?: ToolRestriction
  /**
   * Optional per-child persona. Requires {@link SubagentCapabilities.persona};
   * rejected at start otherwise. In-process backends register it as a scoped
   * `deployment:persona` section on the child, SHADOWING the deployment's
   * persona for this child alone — same template semantics as the deployment
   * persona (strict `{{…}}` interpolation against the registered variables).
   */
  readonly persona?: string
}
```

`signal` là kênh huỷ duy nhất cả trước lẫn sau khi sẵn sàng. [Agent Note về kiểm soát tổ hợp subagent](../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.md) quy định cơ sở thiết kế cho persona, bộ lọc tool toàn cục theo thời gian thực, độ sâu tuyệt đối và nguyên tắc «khả kiến chứ không phải quyền hạn».

Request hướng về phía caller không mang chi tiết định dạng catalog hay trạng thái continuation. `SubagentRuntime.start()` sẽ phân giải descriptor một lần tách rời sau khi kiểm tra capability, rồi chuyển request hướng provider sau đây cho transport đã chọn; agent con có thể tiếp tục thì không bao giờ đi tới `SubagentProvider.start()`:

```ts type-equiv
/**
 * Provider-facing one-shot request after {@link SubagentRuntime.start} resolves
 * the durable child descriptor.
 */
interface ResolvedSubagentStartRequest extends SubagentStartRequest {
  /** Detached descriptor a session-backed provider persists in the child log. */
  readonly descriptor: SubagentDescriptorData
}
```

## Agent con có thể tiếp tục và Activation

**Subagent nền có thể tiếp tục** là một phiên (Session) agent con được lưu bền, gắn với nhiều nhất một **Activation (kích hoạt)** trong tiến trình, tức khoảng thời gian mà Agent con được dựng lại đang thường trú. Activation không phải request, kết quả, huỷ hay Task: nó có thể thực hiện nhiều lượt FIFO, và vẫn thường trú trong khi các hậu duệ do nó tạo ra còn đang chạy. Trình quản lý continuation chịu trách nhiệm cho phép activation, xác thực cha trực tiếp, đồ thị quyền sở hữu thời gian thực, khôi phục nguội (cold resume) và giải phóng ưu tiên con trước; agent loop chịu trách nhiệm cho toàn bộ việc sắp xếp và thực thi lượt. Không đường đi nào có thể tiếp tục tạo ra Task, cũng không tạo lớp bọc mang kết quả trung gian.

```text
persisted Session
  -> optional live Activation
       -> one retained AgentHandle
       -> Agent inbox as the only turn FIFO
       -> zero or more owned child Activations
```

`SubagentRuntime.startContinuable()` sẽ đặt trước một id agent con ổn định, chụp snapshot payload `subagent/descriptor` có phiên bản, yêu cầu provider được chỉ định trả về `ContinuableCreateSpec` tách rời của nó, tạo Agent con qua phạm vi activation-owner riêng tư, thiết lập quyền sở hữu cho bất kỳ cha có thể tiếp tục nào, và gửi prompt ban đầu. Khi hộp thư đến (inbox) chấp nhận và sinh ra id message, nó resolve với `{ childId, messageId }` — không cần chờ lượt bắt đầu, cũng không cần chờ message vào session log. Bất kỳ thất bại nào trước lần chấp nhận đó đều reject mà không trả về id nào, đồng thời dispose (giải phóng tài nguyên) mọi handle đã tạo, quay lui Activation và quyền sở hữu của cha.

`SubagentRuntime.followup()` là thao tác nhắn tin tiếp tục duy nhất, và việc định tuyến của nó chỉ phụ thuộc vào trạng thái thường trú của Activation:

| Trạng thái Activation | `followup` |
|---|---|
| `running` | xếp hàng trong cùng Activation |
| `waiting` | đánh thức cùng Activation |
| Không có Activation | khôi phục nguội một Activation mới |

`running` nghĩa là Agent đang có lần chấp nhận hoặc lượt đang hoạt động, hoặc đang xử lý công việc đánh thức inbox; `waiting` nghĩa là nó đã dừng hẳn nhưng vẫn sở hữu ít nhất một Activation con chưa hoàn tất dispose; `settled` nghĩa là đã dừng hẳn và mọi con nó sở hữu đều đã dispose, lúc này trình quản lý sẽ dispose [`AgentHandle`](core.md#creation-and-ownership) và gỡ bỏ Activation đó. Trình quản lý suy ra các điều kiện nội bộ này từ trạng thái dừng hẳn của Agent cùng tập con mà nó sở hữu, chứ không duy trì một máy trạng thái thực thi thứ hai.

Inbox của Agent là hàng đợi duy nhất. Mỗi message tiếp tục đều trở thành một lượt FIFO `Agent.followup()`, nên các message đã được chấp nhận chia sẻ cùng một thứ tự quan sát được, và message đến sau không thể thay đổi lượt đang diễn ra. Gửi thành công sẽ trả về `MessageId` đã được chấp nhận; các sự kiện sẵn có `agent/inbox/inserted`, `agent/inbox/claimed` và `agent/inbox/discarded` vẫn là điểm quan sát vòng đời message, và tầng continuation không định nghĩa bất kỳ định tuyến gửi nào riêng cho subagent.

Quyền thực hiện thao tác tiếp theo đến từ đúng context tool của Agent đang online. Agent đã xác thực phải là cha trực tiếp được ghi trong `SessionHeader.parentSession` của agent con lưu bền. `MessageSource` và `senderSessionId` ghi lại ai đã cung cấp message được chấp nhận, nhưng không cấp bất kỳ quyền nào; tool tuỳ chọn hướng mô hình dùng `CoordinatorMessageSource`.

Với cả hai thao tác này, signal của caller chỉ chi phối việc tra cứu, vật chất hoá và chấp nhận cho tới trước khi inbox nhận. Sau đó trình quản lý độc lập chi phối Activation đó: việc caller huỷ về sau không huỷ lượt đã được chấp nhận, cũng không dispose agent con, và seam này không phơi ra bất kỳ thao tác steering (lái giữa chừng) nào.

`SubagentRuntime.interrupt(targetSessionId, authority)` là thao tác dừng công khai duy nhất: nó hoàn tất xác thực một cách đồng bộ, phát `Agent.cancel(cause, { keepInbox: true })` tới mục tiêu đang online, rồi trả về mà không chờ dừng hẳn. Activation, công việc inbox đang chờ mà chưa được nhận, cùng các hậu duệ đã công bố đều không bị ảnh hưởng; công việc đã được nhận vào lượt bị ngắt sẽ không được xếp lại hàng. Sau khi driver bị ngắt rơi vào idle, một lần gửi đánh thức sẽ khôi phục hàng đợi FIFO đang bị treo. Mục tiêu không tồn tại — không rõ, một lần, hoặc đã kết thúc — cũng như tổ hợp không gắn trình quản lý, đều là no-op được chấp nhận. Với mục tiêu đang online, địa chỉ parent sai hoặc caller không nằm trong chuỗi tổ tiên online của nó sẽ bị từ chối với `UNAUTHORIZED`; đối tượng ancestor đã cũ và request ancestor trỏ về chính nó sẽ bị từ chối trước khi tra cứu mục tiêu.

```ts type-equiv
/**
 * Authority under which one interrupt request is admitted. `user` carries the
 * durable direct-parent address a human client presented; `ancestor` carries
 * the exact live Agent object whose recorded lineage must contain the caller.
 */
type SubagentInterruptAuthority =
  | { readonly kind: 'user'; readonly parentSessionId: SessionId }
  | { readonly kind: 'ancestor'; readonly agent: Agent }
```

Mỗi Activation sở hữu `AgentHandle` của riêng nó cùng một `ownedChildren: Set<SessionId>`; vì mỗi session có nhiều nhất một Activation còn sống, id session con đủ để định danh agent con đang sống mà không cần thêm một tham chiếu hoá thân runtime khác. Việc khởi động agent con hoặc gửi công việc bắt nguồn từ parent sẽ đăng ký agent con vào tập hợp thuộc cha được continuation quản lý trước khi agent con có thể chạy; chừng nào tập hợp đó chưa rỗng, cha đó không thể settle. Agent ở tầng trên cùng hoặc các Agent không thuộc continuation khác không có Activation và nằm ngoài đồ thị waiting. Chỉ khi Agent con đã dừng hẳn, mọi con của agent con đó đã dispose, lần flush session cuối cùng theo kiểu best-effort đã kết thúc, và `AgentHandle` của agent con đã dispose xong, thì agent con mới được giải phóng.

Bước kết thúc cuối cùng sẽ chờ `ctx.sessions.flush(session)`, nhưng bỏ qua giá trị boolean cho biết có bên nào tham gia hay không, vì không listener nào có thể chứng minh một backend lưu bền đã lưu trạng thái đó. Rejection sẽ được ghi log nhưng không làm Activation thất bại; trình quản lý vẫn dispose handle đó và giải phóng quyền sở hữu, sau đó trạng thái agent con được lưu bền có thể thiếu hoặc cũ khi khôi phục về sau. Việc gỡ tải trình quản lý sẽ gọi drain toàn cục nội bộ của trình quản lý, đóng việc chấp nhận và dispose từng khu rừng online; `drainContinuableDescendants(parents)` chỉ đóng việc chấp nhận bên dưới các Agent online mà host sở hữu chính xác, và dispose các hậu duệ có thể tiếp tục của chúng, còn những khu rừng không liên quan vẫn giữ online. Cả hai đều chờ những quá trình vật chất hoá đã được chấp nhận trong phạm vi của mình, lan truyền huỷ từ trên xuống, giải phóng handle theo thứ tự con-trước, và chờ mọi nhánh được chọn ngay cả khi có nhánh riêng lẻ thất bại. Session con được lưu bền không bị ảnh hưởng bởi quá trình tháo dỡ trong tiến trình này.

```ts type-equiv
/** Attribution for a model coordinator's follow-up to one of its children. */
interface CoordinatorMessageSource {
  readonly kind: 'coordinator'
  /** A message another agent addressed to this one (`relay` context form). */
  readonly form: 'relay'
  /** Session id of the agent whose tool call produced the follow-up. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Options for following up with one continuable child. */
interface SubagentFollowupOptions {
  /** Durable attribution retained on the delivered message; it grants no authority. */
  readonly source: MessageSource
  /** Caller cancellation, owning the operation only until inbox acceptance. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Identities returned once a continuable child accepted its initial prompt. */
interface ContinuableStart {
  /** The durable child session id, stable across activations. */
  readonly childId: SessionId
  /** The accepted initial prompt's inbox message id. */
  readonly messageId: MessageId
}
```

Phần đóng góp thiết lập child có thể tiếp tục tuỳ chọn có thể cài đặt các capability giới hạn phạm vi sau khi tổ hợp nền tảng của child hoàn tất và trước khi Activation được công bố. Registry này thực thi theo thứ tự và có tính giao dịch: khi thiết lập thất bại hoặc bị thu hồi, Activation chưa công bố sẽ bị quay lui; khi phạm vi child dispose, mọi cài đặt đều được giải phóng; mục đăng ký mới có hiệu lực ở Activation kế tiếp; còn khi gỡ mục đăng ký thì mọi cài đặt đang thường trú bị thu hồi ngay lập tức.

`SubagentRuntime.reportFrom()` hiện thực việc báo cáo qua điểm mở rộng này, không cần thêm hàng đợi thứ hai hay lớp bọc child mang kết quả. Lời gọi được uỷ quyền bởi đúng Agent child đang online, và caller không được chỉ định bên nhận. Trình quản lý suy ra bên nhận duy nhất từ `parentSession` lưu bền của child, yêu cầu Agent parent đó phải đang online, đóng gói nội dung được chọn thành một user message `subagent-report`, và trả về `MessageId` ổn định của message ấy. Gửi im lặng dùng `Agent.inject()`, không sinh ra thực thể mục inbox hay lượt của parent; gửi đánh thức dùng `Agent.followup()`, sinh ra một lượt parent tiếp theo thông thường. Cả hai chế độ đều không kết thúc lượt của child, và câu trả lời cuối cùng cũng không ngầm báo cáo.

```ts type-equiv
/** Durable attribution for a continuable child's explicit parent report. */
interface SubagentReportMessageSource {
  readonly kind: 'subagent-report'
  /** A message another agent addressed to this one (`relay` context form). */
  readonly form: 'relay'
  /** Session id of the reporting child. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Deployment scheduling policy for accepted child reports. */
type SubagentReportDelivery = 'quiet' | 'wakeup'
```

Việc báo cáo là lựa chọn của chính child, nên trình quản lý còn giữ một sổ sách của riêng mình: khi Activation thường trú kết thúc, nó gửi tới cha trực tiếp được lưu bền của child đó một thông báo mô tả epoch này đã kết thúc ra sao, kèm nội dung assistant cuối cùng. Với mọi child mà caller từng nhận được id, lần gửi này là vô điều kiện; nó xảy ra trước khi giải phóng quyền sở hữu — thứ khiến parent bị xem là đã kết thúc — và đến được parent thường trú qua cùng cơ chế sổ sách chấp nhận đánh thức như báo cáo. Nếu phả hệ chứa chính parent đang trong quá trình tháo dỡ, thông báo này sẽ được gửi theo cách không đánh thức, vì đánh thức một Agent đang nghỉ là mở một lượt chứ không phải xếp hàng chờ việc. Thông tin nguồn của nó dùng một kind riêng, nên transcript (bản ghi văn bản) không bao giờ trình bày sổ sách của runtime như thể là nội dung do chính child viết ra.

```ts type-equiv
/**
 * Durable attribution for the runtime's own account of a continuable child
 * settling. Deliberately a different kind from
 * {@link SubagentReportMessageSource}: a report is content the child chose,
 * while this message is the manager stating what became of the child, and a
 * transcript that merged them would credit the child with words it never wrote.
 */
interface SubagentSettledMessageSource {
  readonly kind: 'subagent-settled'
  /** A runtime account shown without expanding the row (`notice` context form). */
  readonly form: 'notice'
  /** One-line account of how the child ended. */
  readonly summary: string
  /** Session id of the child that settled. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Options for one continuable child's report to its direct parent. */
interface SubagentReportOptions {
  /** Already-resolved parent scheduling policy. */
  readonly delivery: SubagentReportDelivery
  /** Caller cancellation, owning authorization and admission until acceptance. */
  readonly signal: AbortSignal
}
```

Provider chỉ tham gia vào việc chuẩn bị spec tạo ban đầu, và `spawn` với `fork` khác nhau ở chỗ này. Spec trả về chỉ mang các input tạo tách rời, riêng của provider — hiện tại là phần lịch sử cha dùng làm hạt giống tuỳ chọn — chứ không chứa Agent, `AgentHandle`, việc gửi prompt, kết quả, dispose hay thao tác khôi phục. Khôi phục nguội hoàn toàn không đi qua provider: trình quản lý gấp descriptor chung, gọi `ctx.agents.resume()` qua cùng phạm vi activation-owner, và gửi lượt đang chờ.

```ts type-equiv
/**
 * What the continuation manager asks a provider for while materializing one
 * continuable child's FIRST activation. The manager has already reserved the
 * durable child identity and owns every later operation, so this request
 * carries only what distinguishes a fresh child from one seeded with parent
 * history.
 */
interface ContinuableCreateRequest {
  /** The reserved durable child session id, for provider diagnostics. */
  readonly sessionId: SessionId
  /** The delegating parent agent whose history a seeding provider reads. */
  readonly parent: Agent
  /**
   * Caller cancellation, which owns preparation only until the manager accepts
   * the initial prompt into the child's inbox.
   */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/**
 * A provider's detached contribution to one continuable child's creation. This
 * is DATA, never a capability: it carries no Agent, `AgentHandle`, prompt
 * delivery, result, disposal, or resume operation, because the continuation
 * manager owns the child's whole lifecycle after preparation.
 */
interface ContinuableCreateSpec {
  /**
   * Completed-turn prefix of the parent's log to seed the child session with,
   * or absent for a fresh child. Same durable contract as
   * `CreateAgentOptions.seed`: contiguous from seq 0, lossless JSON, balanced.
   */
  readonly seed?: readonly SessionEvent[]
}
```

Descriptor (`SubagentDescriptorData` trong [descriptor.ts](../../packages/subagent/subagent/src/descriptor.ts)) là danh tính lưu bền, phân biệt theo mode, mà mọi subagent dựa trên session đều dùng. Cả hai mode đều mang tên provider. Descriptor `one-shot` có thể mang một `label` hiển thị tuỳ chọn thuộc về caller; descriptor `continuable` yêu cầu dùng `description` của lần uỷ thác làm nhãn tạo được lưu bền, và ngoài ra còn chụp snapshot `agentOptions.provider`／`model` đã phân giải của agent con cùng `persona`／`toolFilter` tuỳ chọn, phục vụ khôi phục nguội. Nó không bao giờ chụp snapshot toàn bộ đối tượng `AgentOptions` có thể mở rộng bằng hợp nhất, nên các giá trị mở rộng không liên quan sẽ không phá vỡ việc tiếp tục, còn việc bổ sung input cấu hình tổ hợp về sau là một thay đổi phiên bản có chủ đích. Descriptor bỏ qua `subagentDepth` (khôi phục nguội lấy `delegationDepth` trong header lưu bền làm cận dưới đơn điệu) và `outputSchema` (đó là giao ước kết quả của một run hay một Activation, không phải danh tính lưu bền).

Provider một lần chạy cục bộ sẽ nối thêm descriptor trong lượt đầu tiên của agent con, trước request đầu tiên. Trình quản lý continuation sẽ nối thêm descriptor sau bất kỳ phả hệ nào do provider cung cấp và trước khi prompt ban đầu được chấp nhận; `header.seedLength` vẫn là ranh giới phả hệ fork: khi khôi phục, thẩm quyền descriptor đọc hậu tố của chính agent con, còn projection danh tính phục vụ listing sẽ gấp `subagent/descriptor` theo kiểu last-wins, trong đó descriptor của chính agent con ghi đè descriptor của tổ tiên trong fork seed. Sự kiện này chỉ vào log: không có `surfaceOp`, không bao giờ vào lịch sử mô hình, và được log chỉ-thêm giữ lại xuyên qua nén. Descriptor phiên bản hiện tại nhưng sai định dạng bị coi là hỏng; runtime này không thể phân loại các phiên bản không được hỗ trợ.

## Liệt kê bền vững: `listChildren()`, `listDescendants()` và các entry của chúng

`SubagentRuntime.listChildren(parentSessionId)` liệt kê các subagent trực tiếp, dựa trên session, của parent từ phép hợp nhất ưu tiên bản đang sống giữa `ctx.sessions.list()` và `ctx.sessionPersistence.list()` tuỳ chọn — không qua service truy vấn, cũng không nạp hay khôi phục bất kỳ Agent nào. Ứng viên là các child trực tiếp mà header lưu bền mang `origin: 'subagent'`; dấu hiệu này chỉ phục vụ phân loại khi liệt kê và việc từ chối định tuyến chung ở mức thô, chứ không chứng minh descriptor hợp lệ, child khôi phục được, hay thao tác đã được uỷ quyền — danh tính do phép gấp projection đảm nhiệm, còn khôi phục do giao ước Activation đảm nhiệm. Giá trị `mode`／`label` của mỗi dòng là giá trị của projection unit `subagent` đã đăng ký, được cung cấp qua một thang ba bậc: child đang sống lấy từ cache mực nước của registry (không đọc log); child nguội thì trước hết đọc cache checkpoint projection tuỳ chọn (`cachedSnapshot` — danh tính vượt cửa seq own-suffix là giá trị cố định, vì descriptor của chính nó bất biến một khi đã được nối thêm); nếu không thì gấp qua registry trên một lần đọc `persistence.inspect()` (đồng thời có giới hạn, tính lại ở mỗi lần liệt kê). Cache đó chỉ là lớp tăng tốc hoàn toàn tuỳ chọn: service vắng mặt, dòng chứa sentinel `null` hoặc thiếu key, không qua cửa seq, đọc lỗi — tất cả đều âm thầm rơi về phép gấp có thẩm quyền. Quy tắc gấp là `subagent/descriptor` last-wins và không có kênh thất bại: descriptor của chính agent con ghi đè descriptor của tổ tiên trong fork seed, còn payload sai định dạng hoặc phiên bản không nhận biết được sẽ gấp thành sentinel `null` có thể tuần tự hoá, xem như không có giá trị. Kết quả là `SubagentListEntry[]` sắp theo `createdAt`, rồi theo id: lấy được danh tính thì sinh ra entry `child` với `mode: 'one-shot' | 'continuable'` và `activity: 'running' | 'inactive'`; entry có thể tiếp tục luôn mang `label`, còn entry một lần chỉ mang trường này khi caller khởi động cung cấp metadata hiển thị. Ứng viên đã ngã ngũ mà phép gấp không cho danh tính sẽ sinh ra diagnostic `corrupt` — descriptor thiếu, sai định dạng và phiên bản không nhận biết được cố ý không phân biệt thêm nữa (`unsupported` vẫn còn trong kiểu nhưng không bao giờ được sinh ra); ứng viên đang chạy mà không có danh tính thì bị bỏ qua (cửa sổ tạo trước khi descriptor xuống đĩa); kiểm tra nguội thất bại sinh ra một diagnostic `unavailable` và sẽ thử lại tự nhiên ở lần liệt kê sau, nên một sibling hỏng không che mất các child khoẻ mạnh. Cờ `hasChildren` đánh dấu sự tồn tại của hậu duệ trực tiếp có origin subagent lưu bền, và được đọc từ cùng nguồn dữ liệu hợp nhất. Trạng thái hoạt động chỉ cho biết bản ghi logic có còn sống trong `ctx.sessions` hay không, chứ không cho biết kết quả hay khả năng khôi phục. Khi thiếu persistence, việc liệt kê suy biến thành chỉ liệt kê bản đang sống thay vì báo lỗi — lúc đó child nguội vốn cũng không thể khôi phục. Khi thiếu registry `ctx.sessionProjections`, `listChildren()` ném `SubagentError` với mã lỗi `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE`, còn khi thiếu session store thì ném `SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE`, cả hai đều được kiểm tra trước mọi thao tác đọc, nên một triển khai không có child nào cũng thất bại một cách xác định; tool liệt kê yêu cầu `ctx.subagents` và `ctx.agents` ngay khi nạp plugin. Các consumer service như UI có thể hiển thị cả hai mode và chọn cách hiển thị dự phòng cho child một lần không có nhãn; còn adapter `list_agents` hướng mô hình (plugin `/list-agents` có thể nạp riêng trong [dsh-tool-subagent-control](../../packages/subagent/tool-subagent-control)) thì chỉ giữ lại các entry có thể tiếp tục, và tinh chỉnh trạng thái thành bộ từ vựng `running`／`idle`／`ready` của riêng nó qua registry Agent online, trong đó `ready` gọi tên child chỉ tồn tại trong store là có thể khôi phục chứ không phải trạng thái cuối. Việc liệt kê không truy vấn map Activation của trình quản lý continuation, registry Agent hay tình trạng sẵn có của provider; `send_message` vẫn là thao tác có thẩm quyền tại thời điểm message được gửi tới, và một child có thể tiếp tục đang chạy trong danh sách vẫn có thể từ chối nhận vì xung đột quyền sở hữu. Cơ sở thiết kế của đường đọc xem [Agent Note về projection danh tính cho listing](../../.agents/notes/implemented/architecture/2026-08-06-subagent-list-identity-projection.md).

`SubagentRuntime.listDescendants(rootSessionId)` áp dụng cùng ngữ liệu ưu tiên bản đang sống và cách diễn giải dựa trên projection lên toàn bộ cây hậu duệ của root, và xuất ra theo pre-order ổn định. Session thông thường và child một lần vẫn là nút duyệt, nên các hậu duệ có thể tiếp tục nằm dưới chúng vẫn khám phá được; chỉ ứng viên có `origin: 'subagent'` mới sinh ra entry. Mỗi child hoặc diagnostic được trả về đều gắn thêm vị trí trong cây lấy từ header lưu bền thu được khi liệt kê; kiểm tra nguội còn xác thực lại toàn bộ vòng đời trước khi cung cấp danh tính:

```ts type-equiv
/**
 * One entry of a descendant listing: the interpreted subagent facts plus its
 * position in the complete session tree. `parentId` is the durable direct
 * parent from the enumerated header, and `depth` counts edges from the root.
 */
type SubagentDescendantListEntry = SubagentListEntry & {
  /** Durable direct parent of this candidate in the enumerated tree. */
  readonly parentId: SessionId
  /** Edge distance from the requested root; direct children are `1`. */
  readonly depth: number
}
```


## Kết quả cuối: `SubagentResult`

Sản phẩm cuối cùng của một run đơn lẻ, được resolve bởi `SubagentRun.result`. `structured` chỉ tồn tại khi `outputSchema` được yêu cầu và được thoả mãn thành công; việc yêu cầu schema không đảm bảo chắc chắn nhận được nó, và khi agent con thất bại hoặc kết thúc mà không sinh ra capture hợp lệ, provider có thể trả về `stopReason: 'error'`. `stopReason` khác `completed` nghĩa là `output` có thể không đầy đủ — consumer ánh xạ nó thành kết quả tool `isError`, chứ không báo cáo output cục bộ như thành công.

```ts type-equiv
/**
 * The terminal outcome of a subagent run, resolved by {@link SubagentRun.result}.
 */
interface SubagentResult {
  /**
   * The child's final assistant output is the content of its last non-empty
   * assistant message. Empty-content messages, including usage-only messages,
   * are skipped. Without a non-empty message, the output is its accumulated
   * assistant text stream, or `[]` when the child produced neither.
   */
  readonly output: ContentBlock[]
  /**
   * The structured result after a requested `outputSchema` was successfully
   * satisfied. Requesting a schema does not guarantee presence: a provider can
   * end with `stopReason: 'error'` when the child fails or finishes without a
   * valid capture. The structured value is validated against the requested
   * output schema by the provider; `unknown` here because the seam is
   * schema-agnostic.
   */
  readonly structured?: unknown
  /** Why the run ended. A non-`completed` reason means `output` may be partial. */
  readonly stopReason: SubagentStopReason
}
```

`SubagentStopReason` là một [union kiểu dẫn xuất có thể mở rộng bằng hợp nhất](core.md#the-map--derived-union-pattern) — backend có thể thêm biến thể, nên consumer nên rẽ nhánh theo các case đã biết và coi lý do kết thúc không rõ là thất bại:

```ts type-equiv
/**
 * Why a subagent run ended. Merge-extensible (a backend may add variants);
 * consumers branch on the known cases and fall through `default`. The known
 * cases mirror the harness turn-end vocabulary so the tool layer can map a
 * non-`completed` result to an `isError` tool result.
 */
interface SubagentStopReasonMap {
  /** The child finished its turn normally. */
  completed: 'completed'
  /** Cancelled through the request signal or disposal. */
  aborted: 'aborted'
  /** Model or transport failure. */
  error: 'error'
  /** The child hit its token ceiling before finishing. */
  'max-tokens': 'max-tokens'
  /** The child declined the task. */
  refusal: 'refusal'
}
```

## Run một lần: `SubagentRun`

`SubagentRun` là handle do consumer nắm giữ, trỏ tới một agent con một-lần đã được công bố — một lần uỷ thác foreground có thể dispose, chỉ có một kết quả, và tuyệt đối không phải handle agent con lưu bền. Sau khi công bố, việc gửi prompt, công việc theo lượt và sự cố hạ tầng đều thuộc về `result`. Consumer await kết quả đó và luôn phải dispose run cho tới khi dừng hẳn. Khi agent con thất bại, nó resolve với stop reason khác completed; chỉ những sự cố hạ tầng không thể biểu diễn được mới reject. Run không có steering, cũng không có khôi phục: các cuộc hội thoại có thể tiếp tục hoàn toàn không có run, vì trình quản lý continuation giữ trực tiếp `AgentHandle` của chúng và sắp xếp từng lượt qua chính inbox của agent con.

```ts type-equiv
/**
 * ONE-SHOT child handle returned after publication. Prompt submission, turn
 * work, and infrastructure faults after that boundary belong to {@link result}.
 * Consumers await that result and must always {@link dispose} to cancel
 * remaining work and reach quiescence. A run is one disposable foreground
 * delegation with one result; continuable conversations have no run — the
 * continuation manager holds their `AgentHandle` directly and orders every
 * turn through the child's own inbox.
 */
interface SubagentRun {
  /**
   * Parent-scoped run id. For a local run, this MUST equal the published child
   * session id, whose `parentSession` records `request.parent.session.id`; a
   * remote provider mints an id unique in the parent namespace.
   */
  readonly id: SessionId
  /**
   * The exact published in-process child, or `undefined` for a remote run.
   * When present, its id is {@link id}; the provider retains no ownership
   * implication beyond the run's ordinary {@link dispose} contract.
   */
  readonly localAgent: Agent | undefined
  /**
   * Resolves with the child's terminal {@link SubagentResult} when the run
   * settles. Does NOT reject on a child-level failure — a model/transport
   * failure resolves with `stopReason: 'error'` so the consumer maps it to an
   * `isError` tool result. Rejects on an infrastructure fault the seam cannot
   * represent as a stop reason.
   */
  readonly result: Promise<SubagentResult>
  /**
   * Cancel remaining work, reach child quiescence, and release resources.
   * Idempotent.
   */
  dispose(): Promise<void>
}
```

Run một lần chạy cục bộ phải công bố một agent con／session thông thường trước khi `start()` fulfill, trả về id session con đó làm `SubagentRun.id`, phơi ra đúng agent con qua `localAgent`, ghi `request.parent.session.id` vào header `parentSession` của agent con, và nối thêm descriptor đã phân giải trong lượt đầu tiên của agent con, trước request đầu tiên. Quyền sở hữu ở runtime có thể đặt agent con dưới phạm vi parent, provider hoặc root. Provider từ xa thì trả về id vòng đời thuộc phạm vi parent cùng `localAgent: undefined`; do không có Session con cục bộ, nó không xuất hiện trong kết quả liệt kê bền vững.

<a id="the-provider-contract-subagentprovider"></a>

## Giao ước provider: `SubagentProvider`

Mỗi provider là một tầng transport agent con có tên, và nhiều provider có thể cùng tồn tại. Service kiểm tra các capability thời điểm khởi động được yêu cầu trước khi gọi `start()`, và từ chối việc start có thể tiếp tục trên provider không có `prepareContinuable`. `inheritsParentContext` chỉ mô tả việc tiêm hạt giống hội thoại (`fork`: true; `spawn` và `acp`: false), giúp consumer sinh ra cách diễn đạt chính xác hướng mô hình, chứ không ngụ ý kế thừa tool, service hay quyền hạn.

```ts type-equiv
/**
 * One registered transport for running child agents. Providers are trusted
 * same-process implementations; callers treat descriptors and returned values
 * as borrowed immutable data. The service may call one provider concurrently
 * for distinct children. Providers isolate operation-local mutable state; a
 * shared capacity controller may delay an operation but must not couple its
 * settlement or cleanup to a sibling.
 */
interface SubagentProvider {
  /** Unique registry name (e.g. `spawn`, `fork`, `acp`). */
  readonly name: string
  /** The start-time features this provider supports (see {@link SubagentCapabilities}). */
  readonly capabilities: SubagentCapabilities
  /**
   * Whether the child sees the parent's completed-turn prefix. This is descriptive, not a
   * service-validated start capability: the model-facing tool derives truthful wording from it.
   * It says nothing about tool registration, injected services, or authority inheritance.
   */
  readonly inheritsParentContext: boolean
  /**
   * Establish a ONE-SHOT child and return its handle after publication.
   * The service has already validated that every requested start-time
   * capability is supported and resolved `request.descriptor`, so a
   * session-backed implementation appends that descriptor inside the child's
   * initial turn. Before fulfillment, the provider owns setup and cleans any
   * unpublished partial resources before rejecting. Ownership transfers on
   * fulfillment; subsequent turn or infrastructure failure settles through
   * the returned run. Distinct starts may overlap; cancellation, failure,
   * result settlement, and disposal remain independent for each run.
   */
  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun>
  /**
   * OPTIONAL (continuable-creation capability): contribute the detached
   * creation inputs that distinguish this provider's continuable children —
   * only whether the child session is seeded with parent history. Method
   * presence IS the capability: the service rejects continuable starts on
   * providers without it, while a provider that has it may still serve
   * ordinary one-shot delegations.
   *
   * This is the provider's ONLY participation in a continuable child. The
   * continuation manager owns identity reservation, composition, Agent
   * creation, prompt delivery, cold resume, ownership, and disposal, so a
   * provider never sees the child's Agent, handle, turns, or teardown.
   * Distinct preparations may overlap; each follows its own signal and returns
   * data belonging only to `request.sessionId`.
   */
  prepareContinuable?(request: ContinuableCreateRequest): Promise<ContinuableCreateSpec>
}
```

`start()` của provider sẽ fulfill với một run đã được công bố. Service đúc ra `runId` duy nhất, chụp snapshot `local` từ `localAgent` chính xác của provider, quan sát kết quả, emit `subagent/start`, và trả về đúng run đó; `start()` reject nghĩa là tài nguyên chưa công bố đã được dọn dẹp và không có cặp sự kiện vòng đời nào được emit, còn kết quả reject sau khi đã công bố sẽ kết thúc cặp sự kiện đã emit. Mỗi Activation có thể tiếp tục đều emit cùng cặp sự kiện chỉ-để-quan-sát ấy cho epoch thường trú của nó, nên một lần khôi phục nguội chính là một epoch mới với `runId` riêng. Sự kiện `subagent/end` đi kèm mang cùng định danh cùng output cuối cùng hoặc sự cố hạ tầng. Cả hai sự kiện đều chỉ dùng để quan sát, và cô lập ngoại lệ của từng listener. Trường `provider` trong đó cho biết provider tại thời điểm khởi động run hoặc Activation, chứ không khẳng định provider vẫn còn đăng ký khi edge đó được phát ra.

## Backend trong tiến trình: độ sâu và hạt giống

Backend spawn và fork tạo một agent một-lần thông thường qua `parent.ctx`, truyền tín hiệu huỷ vào luồng tạo lõi, và dispose qua `AgentHandle`; còn agent con có thể tiếp tục thì do trình quản lý continuation tạo qua phạm vi activation-owner của riêng nó. Gỡ bỏ provider sẽ chặn các lần start mới, nhưng không thu hồi những run đã được chấp nhận. Mỗi agent con nhận một phạm vi phẳng mới, chứ không kế thừa đăng ký của cha. Độ sâu và việc tiêm hạt giống fork tái sử dụng bộ từ vựng agent và session sẵn có:

- **Độ sâu uỷ thác** được biểu diễn bởi `SessionHeader.delegationDepth` lưu bền cùng trường runtime có thể mở rộng bằng hợp nhất `AgentOptions.subagentDepth`; vắng mặt nghĩa là tầng trên cùng với độ sâu bằng không, và giá trị lớn hơn nếu có mặt sẽ có thẩm quyền. Cả hai trường đều thuộc về seam này — vòng lặp không đặt cũng không đọc chúng — nên agent con trong tiến trình lưu bền độ sâu cha + 1, khôi phục nguội không thể hạ độ sâu, và mỗi lần start đều từ chối độ sâu dẫn xuất vượt miền số nguyên an toàn, hoặc cao hơn trần tuyệt đối `request.maxDepth` nếu đã được định nghĩa.
- **Việc tiêm hạt giống fork** dùng [`CreateAgentOptions.seed`](core.md#creation-and-ownership) (một tiền tố `SessionEvent[]`, truyền qua `AgentLoop.createAgent` → `ctx.sessions.prepare({ seed })`, cùng primitive mà `ctx.agents.resume()` dùng). Backend fork truyền vào một *tiền tố cân bằng gồm các lượt đã hoàn tất* của log cha — các sự kiện của cha cho tới và bao gồm `turn/end` cuối cùng — nên hạt giống liên tục từ 0 và việc phát lại [invariants](../../packages/runtime-diagnostics/invariants) có thể chấp nhận nó (các lượt đang diễn ra, chưa cân bằng bị loại trừ).
