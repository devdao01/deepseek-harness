# Tiến trình con

[English](subprocess.md) | Tiếng Việt

Seam tiến trình con được chia thành Service Definition ([dsh-subprocess](../../packages/subprocess/subprocess), `ctx.subprocess`) và Service Provider ([dsh-subprocess-local](../../packages/subprocess/subprocess-local)); các Consumer của nó là những capability seam khác và các backend chạy ngoài tiến trình: [họ bộ thực thi bash](shell.md) dùng đầu ra theo lô ở chế độ collect, LSP dùng ống dẫn giao thức thô, backend PTY dùng các nguyên thủy terminal, còn backend subagent ACP (Agent Client Protocol) dùng ndjson truyền qua ống dẫn và để stderr ở chế độ inherit. Seam này sở hữu không gian tên môi trường `DSH_*` được quản lý, phần xóa thông tin xác thực dùng chung (`scrubbedParentEnv`) và cấu trúc `CollectedOutput`; [dsh-shell](../../packages/shell/shell) tái xuất bộ từ vựng này để các bên tiêu thụ bash giữ được một điểm import duy nhất.

Mã nguồn: [`packages/subprocess/subprocess/src/types.ts`](../../packages/subprocess/subprocess/src/types.ts) và [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)

## Tra cứu tệp thực thi

Thư mục làm việc khi spawn, đường dẫn tệp thực thi, tiến trình thường và phiên terminal của một bên cung cấp đều nằm trong cùng không gian tên đường dẫn và tiến trình với bên cung cấp hệ thống tệp đã được gắn. `resolveExecutable(command, env?, signal?)` xác thực đường dẫn tuyệt đối của tệp thực thi, hoặc phân giải tên trần qua `PATH` đã được bên cung cấp làm sạch cộng với các ghi đè có chủ đích.

## Không gian tên môi trường được quản lý và đầu ra đã bắt

Các biến `DSH_*` là những dữ kiện tiến trình con thuộc sở hữu của Harness; phần hiện thực sẽ loại bỏ các tên `DSH_*` sẵn có trong môi trường trước khi hợp nhất `env` tường minh của bên gọi, nhờ vậy dữ kiện hiện tại chỉ đến được dưới dạng các mục chuỗi được cung cấp có chủ đích, còn tombstone `undefined` tường minh sẽ xóa giá trị sẵn có trong môi trường thường. Mỗi luồng được thu thập đều báo cáo trạng thái cắt bớt và khả năng khôi phục từ tệp spill của chính nó qua `CollectedOutput`.

```ts type-equiv
/** One environment key inside the managed {@link DSH_ENV_PREFIX} namespace. */
type DshEnvironmentKey = `${typeof DSH_ENV_PREFIX}${string}`
```

```ts type-equiv
/** Trusted DeepSeek Harness variables for one child-process execution. */
type DshEnvironment = Readonly<Record<DshEnvironmentKey, string>>
```

```ts type-equiv
/** One captured stream: the (possibly truncated) text plus recovery info. */
interface CollectedOutput {
  /** Collected text — the TAIL of the stream when truncated. */
  text: string
  /** True when bytes were dropped from `text`. */
  truncated: boolean
  /** Path to a file holding the COMPLETE stream, when truncated and available. */
  spillPath?: string
}
```

## Cách bố trí stdio theo phong cách Node (disposition)

Cách bố trí của từng luồng đều được nêu tường minh và do mỗi bên tiêu thụ tự chọn: ống dẫn thô dùng cho việc phân khung giao thức (LSP JSON-RPC, ACP ndjson), inherit dùng cho đầu ra chẩn đoán đi thẳng, chế độ collect dùng cho đầu ra theo lô có giới hạn; trong đó tệp spill là tùy chọn, nên phần đuôi chẩn đoán (stderr của language server) có thể chỉ nằm trong bộ đệm bộ nhớ mà không để lại tệp nào.

```ts type-equiv
/**
 * stdin disposition. `'ignore'` leaves fd 0 on `/dev/null`; `'pipe'` exposes
 * {@link SubprocessHandle.stdin} for the caller's ongoing protocol writes;
 * `{ data }` writes the bytes and closes (the batch shape).
 */
type SubprocessStdinMode = 'ignore' | 'pipe' | { readonly data: string }
```

```ts type-equiv
/**
 * Bounded in-memory collection for one output stream, with an optional
 * full-stream spill file. Omitting `spill` keeps only the in-memory tail —
 * the diagnostic-tail shape (a language server's stderr); including it makes
 * the complete stream recoverable up to its cap (the bash tool shape).
 */
interface SubprocessCollect {
  /** In-memory cap in bytes; overflow keeps the TAIL. */
  maxBytes: number
  /** Full-stream spill file; absent disables spilling entirely. */
  spill?: {
    /** Whole-stream byte cap; a larger stream discards its now-incomplete spill. */
    maxBytes: number
  }
}
```

```ts type-equiv
/**
 * stdout/stderr disposition. `'pipe'` exposes the raw `Readable` for the
 * caller's protocol decoding; `'inherit'` passes the parent's descriptor
 * through (child diagnostics land on the harness's own stream); a
 * {@link SubprocessCollect} object buffers boundedly with offset-based reads.
 */
type SubprocessOutputMode = 'pipe' | 'inherit' | SubprocessCollect
```

```ts type-equiv
/** Per-stream stdio dispositions, all explicit — this seam applies no defaults. */
interface SubprocessStdio {
  stdin: SubprocessStdinMode
  stdout: SubprocessOutputMode
  stderr: SubprocessOutputMode
}
```

## Spawn spec hoàn toàn tường minh

Seam này không áp dụng bất kỳ giá trị mặc định nào: mọi cách bố trí, giới hạn và thư mục đều được nêu tường minh trên spec, nhờ đó chúng do chính cấu hình của bên gọi quyết định, chứ không phải do một giá trị mặc định ẩn nào đó của dịch vụ tiến trình con. `argv` không bao giờ đi qua diễn giải của shell.

```ts type-equiv
/**
 * A fully-specified spawn request. This seam applies no defaults: every
 * disposition, limit, and directory is explicit, so the caller's own config —
 * not a hidden subprocess-service default — decides them (the `dsh-shell`
 * request/spec split is the owning template).
 */
interface SubprocessSpawnSpec {
  /** Executable and arguments; `argv[0]` is the program. Never shell-interpreted here. */
  argv: readonly string[]
  /** Working directory for the child. */
  cwd: string
  /** Per-stream stdio dispositions. */
  stdio: SubprocessStdio
  /**
   * Positive finite grace period in milliseconds, no greater than
   * `MAX_TIMER_DELAY_MS`, for the {@link SubprocessHandle.terminate} escalation
   * and for draining still-open collected pipes after the process exits (an
   * inherited descriptor held by a surviving descendant cannot hold the
   * outcome open indefinitely).
   */
  graceMs: number
  /**
   * Abort signal — starts the terminate escalation on the process tree when
   * it fires. The caller owns deadlines and cause classification; this seam
   * only reacts to the abort.
   */
  signal?: AbortSignal | undefined
  /**
   * Explicit environment entries merged onto the implementation's scrubbed
   * parent base (see `scrubbedParentEnv`), with no namespace validation. A
   * string is a deliberate caller opt-in, so a forwarded credential-shaped
   * entry or current `DSH_*` fact survives the scrub; `undefined` is a
   * tombstone that removes an ordinary ambient entry from the child.
   */
  env?: NodeJS.ProcessEnv | undefined
}
```

## Handle: luồng, bộ đọc và việc kết thúc theo phạm vi cây tiến trình

spawn trả về ngay một handle đang sống. Bộ đọc ở chế độ collect nhận offset byte trên toàn luồng và không bao giờ tiêu thụ dữ liệu, nên các bộ đọc độc lập không giành mất phần gia tăng của nhau; các luồng được đưa qua ống dẫn thuộc sở hữu của bên gọi. Việc kết thúc trên mọi nền tảng đều có phạm vi là cả cây tiến trình: `terminate()` (động từ kết thúc duy nhất) thực hiện leo thang SIGTERM→thời gian ân hạn→SIGKILL, còn `waitForExit()` quan sát toàn bộ cây tiến trình. Chừng đó là đủ để bên tiêu thụ tự xây dựng quy trình dọn dẹp phân tầng của mình; hàm `disposeAcpChild` của backend ACP đóng stdin trước để tiến trình con nhận EOF, và đó là bản hiện thực tham chiếu trong kho mã.

```ts type-equiv
/**
 * A live child process rooted in its own process tree. Collected output
 * remains readable after exit; piped streams belong to the caller.
 *
 * Termination is tree-scoped everywhere: POSIX signals the detached process
 * group (falling back to the direct child when the group is gone), Windows
 * terminates the tree via `taskkill /T`, so helper processes cannot outlive
 * the handle unnoticed.
 */
interface SubprocessHandle {
  /** Process id (tree root); -1 when the spawn itself failed. */
  readonly pid: number
  /** The child's stdin, present iff spawned with `stdin: 'pipe'`. */
  readonly stdin: Writable | undefined
  /** The child's raw stdout, present iff spawned with `stdout: 'pipe'`. */
  readonly stdout: Readable | undefined
  /** The child's raw stderr, present iff spawned with `stderr: 'pipe'`. */
  readonly stderr: Readable | undefined
  /** Offset-based readers for collect-mode streams (also readable after exit). */
  readonly collected: SubprocessCollectedOutputs
  /** Resolves at process close with exit facts; rejects only for spawn-level failures. */
  readonly done: Promise<SubprocessOutcome>
  /**
   * Begin the SIGTERM → `graceMs` → SIGKILL escalation on the process tree
   * (Windows force-terminates immediately) — the seam's only termination
   * verb. Idempotent, a no-op once the tree is gone (the pid may be reused),
   * and also triggered by the spec's abort signal.
   */
  terminate(): void
  /**
   * Wait until the process tree has exited — the tree, not just the direct
   * child, so a still-running helper is observable before teardown returns.
   * @param signal - optional bound for the wait.
   * @returns `true` when the tree exited, `false` when the signal aborted first.
   */
  waitForExit(signal?: AbortSignal): Promise<boolean>
}
```

```ts type-equiv
/**
 * Cursor-free incremental access to one collected output stream. Offsets are
 * whole-stream byte coordinates owned by the caller, so independent readers
 * cannot consume one another's output; `readFrom(0)` after settlement is the
 * batch result (`lossy` then means the in-memory tail lost its head — the
 * {@link CollectedOutput.truncated} fact).
 */
interface SubprocessOutputReader {
  /**
   * Read everything captured since `fromByte`. When that offset has slid out
   * of the in-memory tail window the read is `lossy` — it returns the whole
   * retained tail and the gap is only recoverable from the spill file.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
   * @returns the delta text, the next offset, the `lossy` flag, and the spill path when one exists.
   */
  readFrom(fromByte: number): SubprocessOutputRead
}
```

```ts type-equiv
/** One incremental {@link SubprocessOutputReader.readFrom} read. */
interface SubprocessOutputRead {
  /** Stream text from the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the in-memory tail window. */
  lossy: boolean
  /** Path to the full-stream spill file, when one was created and remains intact. */
  spillPath?: string
}
```

```ts type-equiv
/** Offset-based readers for the streams spawned in collect mode. */
interface SubprocessCollectedOutputs {
  /** Present iff stdout is a {@link SubprocessCollect}. */
  readonly stdout?: SubprocessOutputReader
  /** Present iff stderr is a {@link SubprocessCollect}. */
  readonly stderr?: SubprocessOutputReader
}
```


## Kết quả chỉ mang các dữ kiện thoát

`done` báo cáo theo từ vựng của sự kiện close trong Node, không mang theo phân loại nguyên nhân: dịch vụ sẽ kết thúc tiến trình khi bị hủy, nhưng không bao giờ phán định nguyên nhân (bên gọi đọc tín hiệu deadline thuộc sở hữu của mình, ví dụ cách bộ thực thi bash tách `timedOut`/`aborted`). Đầu ra đã thu thập vẫn đọc được qua `handle.collected` sau khi kết thúc, nhờ vậy bên gọi theo lô và bên gọi theo luồng dùng chung một đường truy cập.

```ts type-equiv
/**
 * Exit facts of one closed process — Node's `close`-event vocabulary.
 * Deliberately carries NO timeout or cancellation classification (the caller
 * reads the signal it owns to classify causes) and NO output: collected
 * streams stay readable through {@link SubprocessHandle.collected} after
 * settlement, so batch and streaming callers share one access path.
 */
interface SubprocessOutcome {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
}
```

## Nguyên thủy tiến trình terminal

`spawnTerminal(spec)` là nguyên thủy tiến trình không dùng ống dẫn. Bên cung cấp cấp phát terminal điều khiển và chịu trách nhiệm về việc truyền văn bản UTF-8, kiểm tra nhóm tiến trình foreground và gửi tín hiệu, cùng một thao tác TERM→KILL cần chờ; thao tác đó khiến mọi thành viên phiên mà bên cung cấp còn quan sát được đều dừng hẳn, còn bên cung cấp thì ghi lại các giới hạn về khả năng quan sát đặc thù của nền tảng thực thi. Backend PTY vẫn chịu trách nhiệm phát hiện dấu nhắc, suy luận trạng thái sẵn sàng, scrollback, chính sách sandbox và quyền sở hữu phiên bền vững; `spawn()` thông thường không thể tái dựng ngữ nghĩa của terminal điều khiển.

Spec terminal chỉ định đầy đủ argv, cwd, các ghi đè môi trường, kích thước, thời gian ân hạn dọn dẹp và tùy chọn hủy việc cấp phát. Handle của nó công khai `pid`, đầu ra có thứ tự, `done`, `write`, `inspectForeground`, `signalForeground` và `terminate` cần chờ; hình dạng công khai chính xác được sinh ra trong [danh mục dịch vụ `ctx.subprocess`](#ctxsubprocess--subprocessruntime-abstract-seam).

## Hành vi của dịch vụ

Service Definition trừu tượng [`SubprocessRuntime`](../../packages/subprocess/subprocess/src/index.ts) quy định tọa độ thế giới thực thi, việc tra cứu tệp thực thi, `spawn` thông thường và `spawnTerminal`. [`LocalSubprocessRuntime`](../../packages/subprocess/subprocess-local/src/index.ts) cung cấp những năng lực đó bằng cây tiến trình detached, việc đấu nối theo cách bố trí, việc xóa thông tin xác thực, `node-pty`, phép kiểm tra tiến trình theo nền tảng, và cách giải phóng tài nguyên theo trình tự kết thúc trước rồi chờ thoát. Quy ước của Service Definition xem [`dsh-subprocess`](../../packages/subprocess/subprocess/README.md), cơ chế cục bộ xem [`dsh-subprocess-local`](../../packages/subprocess/subprocess-local/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxe2b--e2bruntime"></a>

### `ctx.e2b` — `E2BRuntime`

Creates one lazily consumable E2B SDK handle and deletes the sandbox at timeout or disposal. Creation begins at plugin construction; adapters await getSandbox before their first operation.

```ts cordis-catalog
/**
 * Return the shared live SDK handle.
 * @returns the created sandbox after the configured cwd exists.
 * @throws when E2B rejects creation or the service is disposing.
 */
async getSandbox(): Promise<Sandbox>
```

Source: [`packages/e2b/e2b/src/index.ts:74`](../../packages/e2b/e2b/src/index.ts)

<a id="ctxsubprocess--subprocessruntime-abstract-seam"></a>

### `ctx.subprocess` — `SubprocessRuntime` (abstract seam)

Abstract subprocess service. Subclass, implement spawn, and load the subclass as a plugin — it registers as `ctx.subprocess` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- Executable paths belong to one execution world shared with the mounted filesystem provider.
- spawn returns immediately with a live handle; `done` resolves at process close with exit facts and rejects only for spawn-level failures.
- Collect-mode readers are offset-based and non-consuming, so independent readers never consume one another's output; lossy reads report truncation and the spill file holding the complete stream when one exists. Piped streams are handed to the caller raw and never buffered here.
- SubprocessHandle.terminate (and the spec's abort signal) escalates SIGTERM→grace→SIGKILL — the only termination verb — tree-scoped on every platform. SubprocessHandle.waitForExit observes whole-tree liveness, so a consumer-owned teardown ladder can hold each tier on real quiescence.
- Disposal of the service terminates all still-running managed processes and awaits their exit.
- spawnTerminal owns terminal allocation, text transport, foreground groups, signalling, and whole-session quiescence behind one awaited termination method; readiness and persistent-shell policy stay in the PTY consumer. Its output stream ends after queued terminal output when the top-level process exits.

```ts cordis-catalog
/**
 * Resolve one configured executable in this provider's execution world.
 * Absolute paths are verified; bare names use the provider's scrubbed PATH
 * plus explicit environment overrides. Relative paths containing separators
 * are rejected: the resolution base is undefined, so providers fail loud
 * instead of guessing.
 * @param command - absolute executable path or bare PATH name.
 * @param env - explicit environment entries used for lookup.
 * @param signal - aborts remote or local lookup.
 * @returns a canonical executable path.
 */
abstract resolveExecutable( command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal, ): Promise<string>

/**
 * Start one managed child process from a fully-specified spec; this seam
 * applies no defaults.
 * @param spec - argv, directory, stdio dispositions, grace, cancellation, and environment.
 * @returns the live process handle (streams/readers, signalling, outcome promise).
 */
abstract spawn(spec: SubprocessSpawnSpec): SubprocessHandle

/**
 * Allocate a real terminal and start one owned process session. This is the
 * only non-pipe process primitive: implementations own terminal byte I/O,
 * foreground groups, signals, and complete session-tree cleanup.
 * @param spec - fully specified argv, cwd, environment, dimensions, grace, and allocation cancellation.
 * @returns the live terminal handle after allocation succeeds.
 */
abstract spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>
```

Source: [`packages/subprocess/subprocess/src/index.ts:102`](../../packages/subprocess/subprocess/src/index.ts)
<!-- END GENERATED cordis-surface -->
