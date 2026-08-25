# Telemetry

[English](session-telemetry.md) | Tiếng Việt

Việc báo cáo phiên ra bên ngoài được tách thành một [capability seam](../capability-seams.md): Service Definition cùng bộ điều phối thu thập ([dsh-session-telemetry](../../packages/session/session-telemetry), `ctx.sessionTelemetry`) sở hữu các điểm thu thập, phép chiếu phân mảnh cố định, waterfall (sự kiện thác nước) khử nhạy cảm `session-telemetry/record`, con trỏ handoff và giao ước tối thiểu của backend; còn Service Provider do bên triển khai nạp vào ([dsh-session-telemetry-otel](../../packages/session/session-telemetry-otel)) là một pipeline log của OpenTelemetry JS SDK được cấu hình nguyên trạng. Đây là một năng lực tùy chọn, không thuộc trục chính của agent loop (vòng lặp tác tử), và ở đây cũng không có bất cứ thứ gì đi vào request của mô hình. Tiên đề về ranh giới (trách nhiệm của harness dừng lại ở `emit()`; batching, retry, xếp hàng và chính sách mất mát đều thuộc về SDK báo cáo) cùng các phương án thay thế đã bị bác bỏ đều đã được chốt trong [Agent Note về việc hồi sinh](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md); giao ước về điểm thu thập, con trỏ và phép chiếu xem [README của Service Definition](../../packages/session/session-telemetry/README.md).

Mã nguồn: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

## Bản ghi logic

```ts type-equiv
/**
 * Severity of a telemetry record, pre-mapped at capture so a receiver can
 * alert with zero configuration: `error` for events whose own outcome flag
 * says so (the tool-result block's `isError`, `turn/end` error reasons) and for
 * `agent-error` operational records. Captured events otherwise default to
 * `info`; `warn` remains available to `session-telemetry/record` policies and
 * backends.
 */
type SessionTelemetrySeverity = 'info' | 'warn' | 'error'
```

```ts type-equiv
/**
 * One logical record handed to a backend — the capture contract's whole outbound
 * vocabulary. Ledger records mirror session-log events one-to-one;
 * operational records (`channel: 'ops'`) carry the two signals with no log
 * home (`agent-error`, `shutdown`) and deliberately omit `event.seq`-style
 * identity so they can never be mistaken for ledger rows.
 */
interface SessionTelemetryRecord {
  /** Ledger (session-log mirror) or ops (operational signal) channel; backends keep the two under separate instrumentation scopes. */
  channel: 'ledger' | 'ops'
  /** Unix epoch milliseconds — the source event's append time for ledger records, the emission time for ops records. */
  time: number
  /** Pre-mapped alerting severity; see {@link SessionTelemetrySeverity}. */
  severity: SessionTelemetrySeverity
  /**
   * Identity attributes, deliberately minimal: ledger records carry
   * `session.id`, `event.type`, `event.seq`, plus `session.cwd` /
   * `session.parent_id` / `session.seed_length` when the header has them;
   * ops records carry `telemetry.op`, `session.id`, and (for `agent-error`)
   * `agent.id`, `turn`, `step`, `error.name`. Anything recoverable from the
   * body is intentionally NOT duplicated here.
   */
  attributes: Record<string, string | number>
  /**
   * The complete payload: a deep copy of the session event's `data` for
   * ledger records (JSON-serializable by `Session.append`'s own
   * validation), or the op payload for ops records. Never mutated after
   * handoff.
   */
  body: unknown
}
```

Mỗi cặp `(turn, step)` chỉ phát ra `assistant/chunk` đầu tiên, tức tín hiệu "luồng đã bắt đầu"; các phân mảnh còn lại bị loại bỏ ngay khi thu thập, nên khoảng trống `seq` trong quá trình truyền là chuyện bình thường, tuyệt đối không phải dấu hiệu mất dữ liệu. Mọi loại [sự kiện phiên](session.md) khác đều được truyền qua nguyên vẹn, kể cả những loại sự kiện mà seam này chưa từng biết tới và được plugin merge vào. Việc chuyển giao là nỗ lực tối đa (best-effort): con trỏ đánh dấu "đã bàn giao" chứ không phải "đã tới nơi", bản ghi có thể mất (sự cố, cửa sổ reload) và cũng có thể trùng lặp (tiếp quản lại mà không có con trỏ, SDK retry), vì vậy bên nhận khử trùng lặp các bản ghi ledger theo `(session.id, event.seq)`; bản ghi ops cố ý bỏ qua loại định danh này — chúng là tín hiệu để cảnh báo chứ không phải mục để cộng dồn, nên trùng lặp được chấp nhận thay vì bị khử.

## Công bố việc chia sẻ

Giao ước xác nhận của seam này (thuộc [mục công bố việc chia sẻ trong README của Service Definition](../../packages/session/session-telemetry/README.md#the-sharing-disclosure)): mỗi backend đều công bố chính sách chia sẻ ở cấp triển khai của mình qua thành viên trừu tượng bắt buộc `sharing` trên `ctx.sessionTelemetry`, và consumer chỉ hiển thị "chưa cấu hình" khi không có dịch vụ telemetry nào được mount. Việc công bố chỉ nêu chính sách hiện tại, tuyệt đối không cam kết về chuyển giao hay lưu giữ — bàn giao là thao tác đưa vào hàng đợi không chặn, còn batching, retry và chính sách mất mát vẫn thuộc về SDK báo cáo.

```ts type-equiv
/**
 * Deployment-selected session-sharing policy disclosed by a mounted
 * {@link SessionTelemetryBackend} backend to human-facing acknowledgement surfaces (the
 * `/feedback` command's confirmation text). The seam owns the vocabulary so
 * any backend can disclose a policy without depending on the OTel package;
 * the values mirror the OTel backend's serialized `SessionTelemetryMode` choices.
 */
type SessionTelemetrySharingStatus = 'full' | 'feedback-only' | 'disabled'
```

## Giao ước của backend

```ts type-equiv
/**
 * The minimum backend contract the coordinator requires. {@link SessionTelemetryBackend} is
 * its service-registered form; tests compose the coordinator with a bare
 * implementation of this interface.
 */
interface SessionTelemetrySink {
  /**
   * Hand one record to the backend's pipeline. MUST be a non-blocking
   * enqueue — the coordinator calls this synchronously from the
   * `session/event` hot path or an explicit canonical-log capture, so anything
   * slower than a queue push would tax the agent loop or feedback handling.
   * Errors thrown here are contained by the coordinator and logged; they
   * never reach the loop.
   * @param record - the logical record to report; owned by the backend after the call.
   */
  emit(record: SessionTelemetryRecord): void
  /**
   * Optional hint that a turn ended. A backend may forward it to its SDK's
   * flush so records are exported after each turn. Called
   * fire-and-forget; implementations must not block and must not throw
   * meaningfully (the coordinator contains exceptions). Most backends should
   * leave this unimplemented and let their SDK's own batching cadence govern
   * export timing: a backend that does implement it owns the interaction
   * between its concurrent flushes and {@link shutdown}'s drain (the OTel
   * backend leaves it unimplemented for exactly that hazard — see the
   * revival Agent Note).
   */
  flush?(): void
  /**
   * Forward the fiber's disposal to the SDK: flush whatever is queued and
   * reach quiescence, per the SDK's own shutdown contract. Everything
   * emitted before this call must still be delivered — including records
   * enqueued while a {@link flush} hint is in flight, so a backend whose SDK
   * guards against concurrent flushes orders behind the outstanding one (the
   * coordinator emits its dispose-time `shutdown` markers immediately before
   * calling this). Awaited by the coordinator's dispose; a rejection is
   * logged as a warning and never fails application teardown.
   * The coordinator captures dispose-time shutdown markers immediately before
   * this call for live capture; on-demand capture creates no ops records.
   * @returns resolves when the backend's pipeline has quiesced.
   */
  shutdown(): Promise<void>
}
```

`SessionTelemetryBackend` (`ctx.sessionTelemetry`, [chữ ký](#ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam)) là dạng có thể nạp được của giao ước này: mỗi context chỉ cho phép một hiện thực, nạp trùng sẽ ném lỗi; backend kết hợp `SessionTelemetryCoordinator` của seam ngay trong constructor của nó để lắp đặt phía thu thập.

## Waterfall khử nhạy cảm: `session-telemetry/record`

Mỗi bản ghi đều đi qua [waterfall](../cordis-primer.md#cordis-waterfall-semantics) `session-telemetry/record` ([mục sự kiện](#session-telemetryrecord--waterfall)) ở giữa phép chiếu và `emit()`. Bản thân seam không mang theo bất kỳ quy tắc nào: khi không có listener nào được mount, bản ghi tới backend đúng như lúc thu thập; dữ liệu xuất ra sạch tới mức nào phụ thuộc chính xác vào những quy tắc mà bên triển khai mount vào. Các listener xếp chồng bằng cách biến đổi giá trị trả về của `next()`; trả về mà không gọi `next()` tức là thay thế toàn bộ phần logic bên dưới; listener ném ngoại lệ sẽ khiến bản ghi đó bị giữ lại theo kiểu fail-closed, trong phạm vi cô lập của bộ điều phối. Việc khử nhạy cảm chỉ tác động lên bản sao xuất ra; log phiên có thẩm quyền không bao giờ bị viết lại.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam"></a>

### `ctx.sessionTelemetry` — `SessionTelemetryBackend` (abstract seam)

Loadable form of the backend contract: one implementation per context — the cordis `Service` registration under the `telemetry` key throws on a duplicate, cordis' standard behavior. A backend composes a SessionTelemetryCoordinator in its constructor to install the capture side.

```ts cordis-catalog
/**
 * See {@link SessionTelemetrySink.emit} — that declaration is the contract's one home.
 * @param record - the logical record to report; owned by the backend after the call.
 */
abstract emit(record: SessionTelemetryRecord): void

/** See {@link SessionTelemetrySink.flush}. */
flush?(): void

/**
 * See {@link SessionTelemetrySink.shutdown}.
 * @returns resolves when the backend's pipeline has quiesced.
 */
abstract shutdown(): Promise<void>
```

Source: [`packages/session/session-telemetry/src/index.ts:148`](../../packages/session/session-telemetry/src/index.ts)

<a id="session-telemetry-events"></a>

### `session-telemetry/*` events

<a id="session-telemetryrecord--waterfall"></a>

#### `session-telemetry/record` — waterfall

Transform one outbound record before it reaches the backend. This waterfall is the Service Definition's redaction extension point. It ships NO rules of its own: the innermost `next()` passes the record through unchanged, and with no listener mounted records reach the backend as captured, so exported data is exactly as clean as the rules a deployment mounts. Listeners stack by transforming `next()`'s return value; returning without `next()` replaces everything beneath. Dispatched synchronously on the capture hot path inside the coordinator's containment: a throwing listener withholds that one record (fail-closed) and never reaches the agent loop. Live capture dispatches at append time; on-demand capture dispatches while reading the canonical log. Redaction applies to the exported copy only; the canonical session log is never rewritten.

```ts cordis-catalog
/**
 * Transform one outbound record before it reaches the backend. This
 * waterfall is the Service Definition's redaction extension point. It ships NO rules
 * of its own: the
 * innermost `next()` passes the record through unchanged, and with no
 * listener mounted records reach the backend as captured, so exported
 * data is exactly as clean as the rules a deployment mounts. Listeners
 * stack by transforming `next()`'s return value; returning without
 * `next()` replaces everything beneath. Dispatched synchronously on the
 * capture hot path inside the coordinator's containment: a throwing
 * listener withholds that one record (fail-closed) and never reaches the
 * agent loop. Live capture dispatches at append time; on-demand capture
 * dispatches while reading the canonical log. Redaction applies to the
 * exported copy only; the canonical session log is never rewritten.
 * @param record - the candidate record, already the coordinator's own deep
 *   copy; listeners return a (possibly new) record and must not mutate it.
 * @mode waterfall
 */
'session-telemetry/record'(record: SessionTelemetryRecord, next: () => SessionTelemetryRecord): SessionTelemetryRecord
```

Source: [`packages/session/session-telemetry/src/index.ts:43`](../../packages/session/session-telemetry/src/index.ts)
<!-- END GENERATED cordis-surface -->
