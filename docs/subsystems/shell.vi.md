# Bộ thực thi Bash

[English](shell.md) | Tiếng Việt

seam thực thi bash được chia thành Service Definition ([dsh-shell](../../packages/shell/shell), `ctx.shell`), Service Provider ([dsh-bash-local](../../packages/shell/bash-local) và [dsh-bash-sandbox](../../packages/shell/bash-sandbox)) và Consumer ([dsh-tool-bash](../../packages/shell/tool-bash), tức schema `bash`). Job id, quyền sở hữu và điều khiển của tác vụ nền dùng chung nằm ở [jobs.md](jobs.md); seam này trả về một handle tiến trình không mang khái niệm tác vụ. Cơ chế nhóm tiến trình thô được đóng gói sau [seam tiến trình con](subprocess.md).

Mã nguồn: [`packages/shell/shell/src/types.ts`](../../packages/shell/shell/src/types.ts)

## Namespace môi trường shell được quản lý

Các biến `DSH_*` là những sự kiện tiến trình con do Harness sở hữu. Công cụ bash hướng tới mô hình thu thập chúng qua `ctx.shellEnv`, rồi truyền đi qua `ShellExecRequest.dshEnv`; dịch vụ tiến trình con sẽ loại bỏ các tên `DSH_*` được kế thừa trước khi hợp nhất snapshot hiện tại. Từ vựng `DshEnvironmentKey`/`DshEnvironment` thuộc sở hữu của [seam tiến trình con](subprocess.md) và được `dsh-shell` re-export.

## Request và spec: tách bằng `resolve()`

seam này tách **request hướng tới mô hình/plugin** (`workdir`/`timeoutMs`/`stdoutMaxBytes` là tùy chọn, được cấu hình hoặc chính sách request bổ sung) khỏi **spec đã phân giải hoàn toàn** mà bộ thực thi thực sự dùng (những trường này đều bắt buộc). Tầng công cụ gọi `ctx.shell.resolve(request)` ở giữa hai bên (quy tắc "tường minh hơn ngầm định tại biên package" của repo); `ShellExecSpec` mang theo các giá trị đã phân giải.

```ts type-equiv
/**
 * A caller's execution REQUEST: `workdir` and `timeoutMs` are optional and
 * filled by {@link ShellExecutor.resolve} from the implementation's config.
 * This is the model-/plugin-facing shape; pass it to `resolve()` to obtain a
 * fully-resolved {@link ShellExecSpec}.
 */
interface ShellExecRequest {
  command: string
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap. Trusted in-process consumers use this when they must
   * parse complete stdout up to their own bounded limit; the model-facing bash
   * tool does not expose it as a parameter.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /**
   * Bytes to write to the command's stdin, then close it. Absent leaves stdin
   * closed/empty (the default for model-driven tool calls). Set by in-process
   * plugins (e.g. the hooks bridges, which write a hook command's JSON payload
   * to its stdin); the model-facing bash tool does not expose it as a parameter
   * (a model that needs stdin uses shell syntax like a heredoc or a pipe).
   */
  stdin?: string | undefined
  /**
   * Ordinary environment entries for the command, merged after the credential
   * scrub. Managed facts belong in {@link dshEnv}, which merges after this
   * map, so an entry here can never displace one. Set by in-process plugins
   * (the hooks bridges set `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, …); the
   * model-facing bash tool does not expose it as a parameter.
   */
  env?: Record<string, string> | undefined
  /**
   * Harness-owned `DSH_*` variables for this execution (typed to managed
   * keys). Executors discard ambient `DSH_*` entries before merging this
   * snapshot last, so an unavailable current fact cannot inherit a stale
   * value from the harness process and a caller {@link env} entry cannot
   * displace a managed one.
   */
  dshEnv?: DshEnvironment | undefined
  /** Fully resolved per-call sandbox policy; sandboxing executors default it. */
  sandboxPolicy?: SandboxExecutionPolicy | undefined
}
```

```ts type-equiv
/**
 * A resolved execution spec. {@link ShellExecutor.resolve} fills and caps the
 * required fields; {@link ShellExecutor.start} ignores `timeoutMs` because
 * background processes have no executor timeout.
 */
interface ShellExecSpec {
  command: string
  workdir: string
  timeoutMs: number
  /**
   * Resolved foreground stdout capture budget in bytes. `run()` uses it for
   * stdout; background jobs and stderr keep the executor's own output cap.
   */
  stdoutMaxBytes: number
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries carried through from
   * {@link ShellExecRequest.env}; {@link dshEnv} still merges after them.
   * OPTIONAL on the spec for the same reason as `stdin`: absent means no
   * ordinary extra environment.
   */
  env?: Record<string, string> | undefined
  /** Managed `DSH_*` snapshot (typed to managed keys); merges after {@link env}. */
  dshEnv?: DshEnvironment | undefined
  /** Resolved sandbox policy; ignored by executors that do not confine. */
  sandboxPolicy: SandboxExecutionPolicy | undefined
}
```

`stdin` và `env` là đầu vào từ plugin trong tiến trình đáng tin cậy, không được `dsh-tool-bash` phơi bày. Bộ thực thi cục bộ sẽ xóa sạch thông tin đăng nhập khỏi môi trường trước, rồi mới hợp nhất phần env do bên gọi cung cấp tường minh. Xem [bash-stdin-env Agent Note](../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md).

`stdoutMaxBytes` cũng chỉ dành cho plugin đáng tin cậy. Nó cho phép consumer chạy tiền cảnh yêu cầu toàn bộ stdout trong một ngân sách phân tích có giới hạn, mà không làm thay đổi giới hạn đầu ra thông thường của stderr, tác vụ nền hay công cụ bash hướng tới mô hình.

## Chạy tiền cảnh: `ShellRunResult`

Kết quả của một lần chạy tiền cảnh đã hoàn tất (hoặc bị kết liễu). Các kết quả trực giao được **báo cáo độc lập**: một tiến trình có thể vừa hết thời gian chờ vừa thoát với mã 0 (vì nó bắt được tín hiệu), nên `timedOut`, `aborted`, `signal` và `exitCode` mỗi thứ là một trường riêng; bên gọi sẽ không bao giờ hiểu nhầm một lần chạy bị cắt ngang sớm là thành công bình thường.

```ts type-equiv
/** The outcome of one completed (or killed) foreground run. */
interface ShellRunResult {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the FIRST cause to cut the command
   * short. Mutually exclusive with {@link aborted}: one fused deadline drives
   * both the timeout and the caller's cancellation, so a timeout and an abort
   * racing before process close report the single first-abort cause, not both
   * (see the [timeout-library Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the FIRST cause to kill the command
   * (and it was not the executor's own timeout). Mutually exclusive with
   * {@link timedOut} — see there for the first-cause classification.
   */
  aborted: boolean
  /** The effective timeout applied to this run (after defaulting/capping). */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
  /** Sandbox execution facts, absent for an unsandboxed executor. */
  sandbox?: ShellSandboxInfo
}
```

Mỗi luồng là một `CollectedOutput`: phần văn bản (có thể đã bị cắt bớt) cộng với thông tin khôi phục; khi bị cắt bớt, `text` là **phần đuôi**, còn luồng đầy đủ tràn ra một file riêng. Những trường này thuộc sở hữu của [seam tiến trình con](subprocess.md) và được `dsh-shell` re-export.

## Sandbox file: `ShellSandboxInfo`

Bộ thực thi có dùng sandbox sẽ phơi bày giá trị chế độ dự phòng đã cấu hình qua `ShellExecutor.sandboxMode`. Tầng công cụ yêu cầu [`@deepseek-ai/dsh-sandbox-policy`](../../packages/sandbox/sandbox-policy/README.md) phân giải giá trị ghi đè `sandbox/mode` bền vững của từng session gọi cùng cwd bất biến thành `ShellExecRequest.sandboxPolicy`; lời gọi đã được người dùng phê duyệt và nới lỏng chặt chẽ hơn chỉ thay thế chế độ. Từ vựng mode/root/enforcement thuộc sở hữu của [seam sandbox `@deepseek-ai/dsh-sandbox`](sandbox.md); chế độ chỉ chi phối các hiệu ứng trên file.

Một lần chạy có sandbox sẽ báo cáo chế độ, phân loại từ chối theo hướng thận trọng và mức độ đầy đủ của việc cưỡng chế. `runnerFailed` đánh dấu rằng sandbox runner đã thất bại trước khi lệnh kịp chạy; thực thi tiền cảnh sẽ ném `SANDBOX_UNAVAILABLE`, còn tiến trình nền đã kết thúc thì chỉ có thể báo cáo qua kênh sự kiện của nó.

```ts type-equiv
/**
 * Sandbox facts for one run, present iff a sandboxing executor handled it.
 * Facts are reported independently of process exit status so callers can
 * distinguish command failures from policy denials and runner failures.
 */
interface ShellSandboxInfo {
  /** The mode the command actually ran under. */
  mode: SandboxMode
  /** Whether the sandbox denied a file operation. */
  denied: boolean
  /** How completely the selected runner enforced the requested mode. */
  enforcement?: SandboxEnforcement
  /** Whether the sandbox runner failed before the command could run. */
  runnerFailed?: boolean
}
```

Khi chế độ hạn chế không có backend khả dụng, provider `ctx.sandbox` sẽ ném và bộ thực thi sẽ lan truyền mã lỗi `SANDBOX_UNAVAILABLE` thuộc sở hữu của [seam sandbox](sandbox.md). Khi runner được chọn từ chối profile của nó, cùng một lỗi tiền cảnh theo hướng fail-closed sẽ được kích hoạt; còn tác vụ nền đã kết thúc thì ghi nhận `runnerFailed`. Mô hình nhận được các sự kiện từ chối/runner trong kết quả, chỉ biết chế độ hiệu lực khi dấu hiệu từ chối chỉ ra chế độ đó, và có thể yêu cầu thử lại một lần duy nhất với mức nới lỏng chặt chẽ hơn qua `sandbox_permissions` kèm `justification`; trước khi thực hiện bất cứ thao tác nào, `ctx.approval` phải phê duyệt đúng lời gọi đó. Toàn bộ thiết kế chính sách và cơ chế chuyển đổi xem tại [Agent Note về sandbox](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

## Tiến trình nền: `ShellProcess`

`start()` trả về một handle không có id hay chủ sở hữu. `dsh-tool-bash` chuyển thể nó thành hook `ctx.jobs.start()`; sau đó runtime dùng chung sở hữu danh tính và vòng đời của tác vụ. `done` hoàn tất khi tiến trình đóng và không bao giờ bị reject; vẫn đọc được sau khi tiến trình kết thúc, và các sự kiện sandbox được ghi trước khi `done` hoàn tất.

```ts type-equiv
/**
 * A background process handle returned by {@link ShellExecutor.start}. It is the
 * only access path; buffered output remains readable after exit. Composition
 * teardown (the subprocess service's disposal) kills running processes and
 * awaits {@link done}; an executor-only reload leaves them running.
 */
interface ShellProcess {
  /** Process lifecycle state (settled exactly once). */
  status: ShellProcessStatus
  /** Exit code once finished (null = killed by signal / still running). */
  exitCode: number | null
  /** Terminating signal name, when signal-killed. */
  signal: NodeJS.Signals | null
  /** Resolves when the underlying process closes (never rejects — a spawn failure settles as `killed` with the error on stderr). */
  readonly done: Promise<void>
  /** Sandbox facts, stamped once a confined process settles. */
  sandbox?: ShellSandboxInfo
  /**
   * Read output produced since the previous read (consuming — consecutive
   * reads never re-deliver). Reads that lost data flag `lossy` and point at
   * full-stream spill files when available.
   */
  readOutput(): ShellProcessRead
  /**
   * Kill the process group. Returns false when it had already finished
   * (no-op); idempotent.
   */
  kill(): boolean
}
```

`readOutput()` trả về phần nội dung tăng thêm cùng thông tin khôi phục spill:

```ts type-equiv
/** One incremental {@link ShellProcess.readOutput} read. */
interface ShellProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  /** Full stdout spill file, when stdout truncation occurred and a safe path is available. */
  stdoutSpillPath?: string
  /** Full stderr spill file, when stderr truncation occurred and a safe path is available. */
  stderrSpillPath?: string
}
```

## Dịch vụ

`ShellExecutor` sở hữu `resolve`, `run` ở tiền cảnh, `start` tiến trình nền cùng sự kiện năng lực `sandboxMode`. `dsh-bash-local` sở hữu việc bổ sung giá trị mặc định cho lệnh, phân loại timeout/hủy, môi trường terminal và việc gộp các lần đọc nền; nhóm tiến trình, bộ thu thập có giới hạn, file spill, xóa thông tin đăng nhập và việc dừng hẳn hoàn toàn sau dispose (giải phóng tài nguyên) thuộc sở hữu của [dịch vụ tiến trình con](subprocess.md). `dsh-tool-bash` sở hữu phần hiển thị hướng tới mô hình, và chuyển thể handle nền sang [runtime tác vụ dùng chung](jobs.md). `dsh-shell` sở hữu quy ước trạng thái thoát dùng chung giữa các công cụ shell: `parseExitStatus`/`ParsedExitStatus` được export chính là phép phân tích ngược của các dấu `[exit code: N]` / `[killed by signal: X]` mà `renderResult` của `dsh-tool-bash` và `renderPwshResult` của `dsh-tool-pwsh` nối thêm, và `presentResult` của cả hai công cụ đều dùng nó để tách văn bản đã hiển thị thành phần thân đầu ra của thẻ terminal và pill trạng thái thoát.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxshell--shellexecutor-abstract-seam"></a>

### `ctx.shell` — `ShellExecutor` (abstract seam)

Abstract bash execution service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.shell` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- run rejects only for infrastructure failures. Nonzero exits, timeout kills, and abort kills resolve with a ShellRunResult.
- start returns immediately; no timeout applies to background processes. `done` settles at process close and never rejects; spawn failures settle as `killed` with the error on stderr.
- ShellProcess.readOutput is incremental: consecutive reads never repeat output. Lossy reads report truncation and available spill files.
- A still-running background process is stopped and awaited when its owning composition tears down. With the subprocess seam that boundary is `ctx.subprocess` disposal, so a background process survives an executor-only reload.

```ts cordis-catalog
/**
 * Apply implementation-owned defaults and caps to a request before execution.
 * @param request - the caller's request; omitted fields get this
 *   implementation's defaults, capped fields are clamped.
 * @returns the fully-specified spec to hand to {@link run}/{@link start}.
 */
abstract resolve(request: ShellExecRequest): ShellExecSpec

/**
 * Run a command in the foreground; resolves when it finishes.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the outcome; nonzero exits, timeout kills, and abort kills
 *   resolve with a descriptive result rather than reject.
 */
abstract run(spec: ShellExecSpec): Promise<ShellRunResult>

/**
 * Start a background process and return its handle immediately.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the live process handle (reads, kill, quiescence promise).
 */
abstract start(spec: ShellExecSpec): ShellProcess
```

Source: [`packages/shell/shell/src/index.ts:65`](../../packages/shell/shell/src/index.ts)

<a id="ctxshellenv--shellenvregistry"></a>

### `ctx.shellEnv` — `ShellEnvRegistry`

Registry (`ctx.shellEnv`) for trusted, per-execution `DSH_*` variables. The namespace is rebuilt for every model shell call: ambient `DSH_*` values are discarded by the executor, then the registry's current snapshot is injected. Built-in shell facts remain owned by the registry itself while plugins can register additional, enumerable facts with effect-scoped disposal.

```ts cordis-catalog
/**
 * Register one environment contributor. Names and keys are unique; built-in
 * keys are reserved. Registration is disposed with the calling plugin fiber.
 * @param contributor - declared key ownership and per-execution resolver.
 * @returns the disposer that unregisters the contribution.
 */
register(contributor: BashEnvContributor): () => void

/**
 * Build the trusted `DSH_*` snapshot for one shell tool execution.
 * @param execution - the current tool execution.
 * @returns an immutable environment overlay containing built-ins and current contributions.
 */
collect(execution: ToolExecution): DshEnvironment

/**
 * Enumerate plugin-contributed variables without executing their resolvers.
 * @returns declarations sorted by environment variable name.
 */
list(): BashEnvVariableInfo[]
```

Types: [DshEnvironment](subprocess.md) · [ToolExecution](tools.md)

Source: [`packages/shell/shell-env/src/index.ts:89`](../../packages/shell/shell-env/src/index.ts)
<!-- END GENERATED cordis-surface -->
