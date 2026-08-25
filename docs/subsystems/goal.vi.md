# Mục tiêu trong cùng session

[English](goal.md) | Tiếng Việt

Các kiểu dữ liệu dùng chung giữa dịch vụ mục tiêu theo hướng event sourcing và các Consumer chính sách của nó. [Agent Note về miền mục tiêu](../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md) chịu trách nhiệm ghi lại các quyết định về lưu trữ bền vững và kích hoạt; trang này ghi lại chính xác các trường và biến thể trong [`packages/goal/goal/src/types.ts`](../../packages/goal/goal/src/types.ts).

## Định danh và vòng đời

`GoalId` là một [id được brand hóa](core.md#branded-ids). Bên gọi sửa đổi một revision mục tiêu chính xác thông qua `GoalRef`; mỗi thay đổi bền vững được chấp nhận đều làm tăng số revision.

```ts type-equiv
/** Compare-and-set identity for one exact goal revision. */
interface GoalRef {
  /** Stable goal identity. */
  readonly id: GoalId
  /** Positive revision; every durable mutation increments it. */
  readonly revision: number
}
```

Pha bền vững trả lời câu hỏi điều gì đã xảy ra với mục tiêu. Trạng thái kích hoạt cục bộ theo tiến trình lại trả lời riêng câu hỏi liệu Consumer chạy tiếp có thể bắt đầu một Round khác hay không.

```ts type-equiv
/** Durable continuation phase. Activation is process-local and separate. */
type GoalPhase =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
```

Bị chặn là trạng thái bền vững duy nhất biểu thị «dừng lại vì gặp vấn đề». Lý do bị chặn do chính sách quyết định sẽ mang theo một mã lower-kebab-case ổn định dùng để định tuyến, cùng một đoạn văn bản tự do để con người và mô hình đọc.

```ts type-equiv
/** Machine-routable and human-readable explanation for a blocked goal. */
interface GoalBlockReason {
  /** Stable lower-kebab-case classification chosen by the blocking policy. */
  readonly code: string
  /** Non-empty explanation shown to humans and models. */
  readonly message: string
}
```

```ts type-equiv
/** Full durable state written by every non-clear goal mutation. */
interface GoalSnapshot extends GoalRef {
  /** Human-requested completion objective. */
  readonly objective: string
  /** Durable lifecycle phase. */
  readonly phase: GoalPhase
  /** Present exactly while `phase` is `blocked`. */
  readonly blockedReason?: GoalBlockReason
  /** Total admitted goal-round cap. */
  readonly maxGoalRounds: number
}
```

```ts type-equiv
/** Current goal projection, including values derived from the session log. */
interface GoalView extends GoalSnapshot {
  /** Highest admitted round number for this goal. */
  readonly roundsStarted: number
  /** Epoch milliseconds of the create mutation. */
  readonly createdAt: number
  /** Epoch milliseconds of the latest mutation. */
  readonly updatedAt: number
  /** Process-local continuation eligibility; never persisted. */
  readonly activation: GoalActivation
}
```

## Thay đổi bền vững

Mỗi thay đổi là một session event `goal/change` bền vững, với payload hoặc là ảnh chụp đầy đủ sau khi thay đổi, hoặc là bia mộ (tombstone) xóa. Phép fold nghiêm ngặt và phép chiếu bền vững chỉ suy ra trạng thái vòng đời từ những event này; thay đổi trong inbox không ảnh hưởng tới trạng thái goal.

```ts type-equiv
/** Full-snapshot goal mutation committed by a durable `goal/change` event. */
interface GoalSnapshotChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshot
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

```ts type-equiv
/** Tombstone retained when the current goal is cleared. */
interface GoalClearChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}
```

Consumer chạy tiếp sẽ gán cho mỗi lượt tin nhắn người dùng được chấp nhận một số Round dương và liên tục cùng số revision hiện tại; chỉ những event `user/message` được chấp nhận này mới đẩy `roundsStarted` tiến lên. Quá trình phát lại sẽ từ chối Round không dương, khoảng trống trong đánh số, revision cũ, pha đã dừng và các trường hợp vượt hạn mức.

```ts type-equiv
/** Message attribution for admitted continuation rounds. */
interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: GoalId
  readonly revision: number
  /** Positive admitted continuation round. */
  readonly round: number
}
```

## Yêu cầu và thông báo

Thao tác tạo phân biệt giữa việc bên gọi bỏ qua trường và việc lấy giá trị từ cấu hình triển khai, `create()` sẽ giải quyết trường hợp sau ở bên trong. Chỉnh sửa là thay thế cục bộ, và trình kiểm tra lúc chạy của nó đòi hỏi phải cung cấp ít nhất một trường. Mỗi thông báo thay đổi đều mang theo thao tác được chấp nhận và số revision chính xác; thao tác xóa không kèm `goal`.

```ts type-equiv
/** Input whose omitted round cap is resolved by the service configuration. */
interface CreateGoalRequest {
  readonly objective: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Fields changed by an edit; at least one must be present. */
interface EditGoalRequest {
  readonly objective?: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Live notification after one durable goal mutation commits. */
interface GoalChanged {
  readonly operation: GoalOperation
  readonly ref: GoalRef
  /** Absent for a clear tombstone. */
  readonly goal?: GoalView
}
```

## Hành vi của dịch vụ

[`GoalService`](../../packages/goal/goal/src/index.ts) giải quyết các giá trị mặc định khi tạo, thực hiện fold phát lại nghiêm ngặt từ các event `goal/change` bền vững, kiểm tra rằng agent được truyền vào đúng là instance đang hoạt động trong registry, thực hiện thay đổi theo kiểu compare-and-set, rồi phát ra thông báo `goal/changed`; lỗi của listener được cô lập. [README](../../packages/goal/goal/README.md) của package định nghĩa API có thể gọi và các quy ước hướng tới mô hình.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgoals--goalservice"></a>

### `ctx.goals` — `GoalService`

Goal service (`ctx.goals`) backed exclusively by the owning session log.

```ts cordis-catalog
/**
 * Read the current goal for one exact live agent.
 * @param agent - owning live agent.
 * @returns a fresh view or `undefined` when no goal is current.
 * @throws {@link GoalError} when the agent is not the registry's live instance.
 */
get(agent: Agent): GoalView | undefined

/**
 * Remove process-local continuation authority without changing durable goal
 * phase or revision. Lifecycle owners use this before unloading a driver;
 * a later human-authorized {@link resume} records the new activation edge.
 * @param agent - owning live agent.
 * @returns a fresh disarmed view, or `undefined` when no goal is current.
 */
disarm(agent: Agent): GoalView | undefined

/**
 * Create and arm a goal. A completed goal may be replaced; every other
 * current phase must be cleared or resumed instead.
 * @param agent - owning live agent.
 * @param request - objective and optional round cap.
 * @returns the created live view.
 */
create(agent: Agent, request: CreateGoalRequest): GoalView

/**
 * Edit objective and/or round cap without changing phase.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param request - at least one replacement field.
 * @returns the edited view.
 */
@Remote('edit') edit(agent: Agent, ref: GoalRef, request: EditGoalRequest): GoalView

/**
 * Pause an active goal and disarm automatic continuation.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the paused view.
 */
@Remote('pause') pause(agent: Agent, ref: GoalRef): GoalView

/**
 * Resume and arm a stopped goal, or rearm an active goal after a
 * session-start edge, while its round budget still has capacity.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the active view.
 */
@Remote('resume') resume(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark a current non-complete goal complete and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the completed view.
 */
@Remote('complete') complete(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark an active goal blocked and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param reason - policy-owned stable code and human-readable explanation.
 * @returns the blocked view with its durable reason.
 */
block(agent: Agent, ref: GoalRef, reason: GoalBlockReason): GoalView

/**
 * Clear the current goal while retaining a durable tombstone and history.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the tombstone ref whose revision is one past the cleared snapshot.
 */
@Remote('clear') clear(agent: Agent, ref: GoalRef): GoalRef

/**
 * Create one Goal through the remote boundary.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - objective and optional round cap.
 * @returns the created Goal identity.
 */
@Remote('create') remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult
```

Types: [Agent](core.md)

Source: [`packages/goal/goal/src/index.ts:183`](../../packages/goal/goal/src/index.ts)

<a id="goal-events"></a>

### `goal/*` events

<a id="goalchanged--emit"></a>

#### `goal/changed` — emit

Goal mutation accepted by one live agent. The matching `goal/change` session event has already committed. Listener failures are contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Goal mutation accepted by one live agent. The matching `goal/change`
 * session event has already committed. Listener failures are contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param payload.agent - agent whose session owns the goal.
 * @param payload.change - fresh current projection or clear tombstone.
 * @mode emit
 */
'goal/changed'(this: import('@deepseek-ai/dsh-scope').Scoped<Agent>, payload: { agent: Agent; change: GoalChanged }): void
```

Types: [Agent](core.md) · [Scoped](scope.md)

Source: [`packages/goal/goal/src/domain.ts:114`](../../packages/goal/goal/src/domain.ts)
<!-- END GENERATED cordis-surface -->
