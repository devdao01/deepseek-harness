# Phê duyệt của người dùng

[English](approval.md) | Tiếng Việt

[dsh-user-approval](../../packages/interaction/user-approval) seam phê duyệt của người dùng trả lời một câu hỏi: hành động cụ thể này có được phép tiếp tục hay không? Nó sở hữu từ vựng request/result dùng chung, service phân phối `ctx.approval`, waterfall (chuỗi sự kiện thác nước) người trả lời `approval/request`, cặp sự kiện audit chỉ ghi log, và policy `ask`/`never` theo từng session. Kênh UI có thể cung cấp người trả lời là con người; [cầu nối tự động hóa ACP (Agent Client Protocol)](../../packages/acp/acp) đưa ra quyết định máy một lần cho các agent mà nó sở hữu. Bên gọi như [dsh-tools](../../packages/core/tools) và [dsh-tool-bash](../../packages/shell/tool-bash) tiêu thụ kết quả đóng, và từ chối trong mọi trường hợp trừ khi kết quả là `allowed-once`.

Nguồn: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

## Định danh và kết quả

Mỗi request nhận được một `ApprovalRequestId` hoàn toàn mới. Kiểu đã brand hóa này ghép cặp sự kiện audit `approval/asked` với `approval/decided`, đồng thời không cho phép id phê duyệt hoán đổi được với id tool call hay id agent/session.

```ts type-equiv
/**
 * Pairs one `approval/asked` audit event with its `approval/decided`.
 * Service-issued (one fresh id per {@link ApprovalService.request} call).
 */
type ApprovalRequestId = Branded<'ApprovalRequestId'>
```

`ApprovalOutcome` là đóng, và thất bại thì đóng (fail closed). `allowed-once` chỉ cấp quyền cho đúng một hành động được hỏi. Bên gọi từ chối cả `rejected`, `cancelled` lẫn `unavailable`. Người trả lời bị thiếu, không chịu trách nhiệm cho request đó, ném lỗi, hoặc không tuân thủ đều sinh ra `unavailable`, chứ không phải cho phép.

```ts type-equiv
/**
 * Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn
 * request, or unavailable answerer. Callers fail closed on `unavailable`.
 */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

## Policy theo từng session

`ApprovalPolicy` quyết định điều gì xảy ra trước khi người trả lời tương tác chạy. `ask` ủy quyền cho chuỗi người trả lời đã tổ hợp, với giá trị mặc định khi chuỗi không có ai trả lời là `unavailable`; `never` trả về `rejected` một cách xác định, không phân phối tới bất kỳ người trả lời nào. Giá trị hiệu lực là sự kiện `approval/policy` cuối cùng trong log session, quay về cấu hình service nếu không có. `setApprovalPolicy(session, policy)` là đường ghi duy nhất, nên việc replay có thể dựng lại giá trị ghi đè.

```ts type-equiv
/**
 * A session's approval policy — what happens to an {@link ApprovalService}
 * ask BEFORE any interactive answerer sees it:
 *
 * - `'ask'` (the default) — delegate to the composed answerers; with none
 *   composed the chain falls through to the fail-closed `'unavailable'`.
 * - `'never'` — never prompt anyone: every ask resolves `'rejected'`
 *   deterministically. The strict headless stance (CI, unattended runs) and
 *   the policy whose outcome is knowable without asking.
 */
type ApprovalPolicy = 'ask' | 'never'
```

Cả hai policy đều đóng góp đầy đủ ý nghĩa hiện tại của mình vào snapshot ngữ cảnh runtime an toàn để cache. `user/message` kèm nguồn gốc là đầu vào bền vững và mô hình có thể nhìn thấy; khi trạng thái phê duyệt thay đổi, một snapshot đầy đủ mới sẽ được nối thêm sau lịch sử đã giữ lại, mà không viết lại system prompt trong request header.

## Request phê duyệt

`ApprovalRequest` nhận dạng agent và hành động tool đủ chính xác để định tuyến và audit câu hỏi đó. Nó cố ý bỏ qua tham số tool: người trả lời gắn prompt vào tool call đã được stream sẵn thông qua `callId`, thay vì render thêm một bản sao có thể bị lệch.

```ts type-equiv
/**
 * Readonly same-process permission question. `callId` links to an already
 * presented tool call, so arguments are not duplicated here.
 */
interface ApprovalRequest {
  /**
   * The agent on whose behalf the question is asked. Routes the question (a
   * UI answerer only answers for agents it owns) and receives the audit
   * events on its session log.
   */
  readonly agent: Agent
  /** The tool the question is about (presentation and audit). */
  readonly toolName: string
  /**
   * The exact tool call being decided, when the asker has one — lets a UI
   * attach the prompt to the tool call it already streamed.
   */
  readonly callId?: CallId
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly reason?: string
  /**
   * Aborting withdraws the question: the request settles `'cancelled'`
   * immediately and a late answer from a still-pending answerer is discarded.
   */
  readonly signal?: AbortSignal
}
```

## Phân phối và audit

`ctx.approval.request(req)` yêu cầu session phát khởi request phải đang ở trong một lượt (turn) chưa kết thúc. Nó nối thêm `approval/asked`, nhận một kết quả, nối thêm `approval/decided` tương ứng, rồi hoàn tất với kết quả đó. Policy `never` được thực thi bên trong service, trước khi phân phối waterfall, nên ngay cả người trả lời được đăng ký sau bằng `prepend` cũng không thể vượt qua nó. Người trả lời trả về kết quả khi chịu trách nhiệm xử lý request đó, nếu không thì gọi `next()` để ủy quyền tiếp; người trả lời đầu tiên chiếm giữ khe quyết định duy nhất.

Sự kiện audit chỉ được ghi vào log, không đi vào transcript (bản ghi văn bản) của mô hình. Hành vi mà mô hình nhìn thấy là kết quả tool do bên gọi tạo ra và snapshot ngữ cảnh runtime hiện tại. Khi service dispose (giải phóng tài nguyên), nó gỡ bỏ phần đóng góp ngữ cảnh của mình; listener của người trả lời gắn với effect độc lập theo plugin mà nó thuộc về.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapproval--approvalservice"></a>

### `ctx.approval` — `ApprovalService`

Approval service that applies session policy before answerers and logs every ask/outcome pair to the requesting session. It exposes deterministic policy changes to the model through the runtime-context snapshot and switch notices.

```ts cordis-catalog
/**
 * Switch one live agent's policy and queue the transition for its next model
 * step. Session initialization uses {@link setApprovalPolicy} directly
 * because there is no previously visible policy to change.
 * @param agent - the live agent whose policy is changing.
 * @param policy - the new effective policy.
 */
setPolicy(agent: Agent, policy: ApprovalPolicy): void

/**
 * Ask the composed answerers to decide one readonly same-process request.
 * The service borrows the request, agent, session, and live signal directly.
 * The request requires an open turn because the audit pair must be enclosed
 * by the durable log's commit/replay boundary; an idle ask rejects before
 * appending anything. The answerer phase always produces an outcome: an
 * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
 * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
 * normalized to `'unavailable'`. A failure that prevents either audit append
 * from committing still rejects because returning an unlogged decision would
 * violate the pair. Session contains post-commit observer failures, so an
 * authoritative append cannot reject the request or suppress its matching
 * audit event.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @returns the closed outcome; `'allowed-once'` is the only grant.
 * @throws when no turn is open or either audit event fails before the session
 *   append commit point.
 */
async request(req: ApprovalRequest): Promise<ApprovalOutcome>

/**
 * Read the session override without applying the configured default.
 * @param session - session whose log supplies the override.
 * @returns the last logged policy, or `undefined` without one.
 */
overrideOf(session: Session): ApprovalPolicy | undefined
```

Types: [Agent](core.md) · [Session](session.md)

Source: [`packages/interaction/user-approval/src/index.ts:192`](../../packages/interaction/user-approval/src/index.ts)

<a id="approval-events"></a>

### `approval/*` events

<a id="approvalrequest--waterfall"></a>

#### `approval/request` — waterfall

Ask composed answerers for one decision. Return an outcome to claim the request or call `next()`; failure yields the fail-closed default. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Ask composed answerers for one decision. Return an outcome to claim the
 * request or call `next()`; failure yields the fail-closed default.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @mode waterfall
 */
'approval/request'(this: Scoped<ApprovalService>, req: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>
```

Types: [Scoped](scope.md)

Source: [`packages/interaction/user-approval/src/index.ts:30`](../../packages/interaction/user-approval/src/index.ts)
<!-- END GENERATED cordis-surface -->
