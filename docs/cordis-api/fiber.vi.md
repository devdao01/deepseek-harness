<!-- Tệp nguồn tiếng Anh được sinh ra bởi scripts/gen-cordis-catalog.ts; tệp tiếng Việt này là bản đối chiếu đã qua đánh giá, được duy trì theo cặp song ngữ.
     Khi cập nhật, trước tiên hãy chạy `pnpm run gen-cordis-catalog` để cập nhật bản tiếng Anh, sau đó cập nhật tệp này và chạy `pnpm run verify-translation-pairing --write docs/cordis-api/fiber.md` để ghi lại cặp song ngữ. -->

# Fiber

[English](fiber.md) | Tiếng Việt

fiber là một thực thể plugin đã được nạp, bao gồm trạng thái vòng đời, cấu hình đã được kiểm định và các tác dụng (effect) đã đăng ký của nó. `ctx.fiber` là fiber hiện tại, còn `ctx.effect()` sẽ ủy thác lời gọi cho nó.

### ctx.effect(execute, label?)

```ts cordis-catalog
/**
 * Register a cleanup-aware effect on this fiber.
 *
 * `execute` runs immediately; the disposers it produces are collected and
 * run (in reverse order) either when the returned disposer is called or
 * when the fiber unloads, whichever comes first. Calling the disposer twice
 * is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
 * already disposed, and `TypeError` if `execute` returns an invalid shape.
 *
 * @param execute — the effect body; see {@link Effect} for accepted shapes.
 * @param label — effect label shown in `getEffects()` diagnostics.
 * @returns a disposer that tears the effect down and settles once done.
 */
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
```

Đăng ký trên fiber này một tác dụng có hỗ trợ dọn dẹp.

`execute` sẽ chạy ngay lập tức; các hàm dọn dẹp mà nó tạo ra sẽ được thu thập và chạy theo thứ tự ngược lại khi hàm dọn dẹp được trả về được gọi hoặc khi fiber được gỡ tải, tùy điều kiện nào xảy ra trước. Gọi hàm dọn dẹp nhiều lần sẽ không gây ra tác dụng nào. Nếu fiber đã dispose (giải phóng tài nguyên) thì ném `CordisError('INACTIVE_EFFECT')`; nếu cấu trúc không hợp lệ thì ném `TypeError`, cho biết `execute` đã trả về một kết quả không được hỗ trợ.

- `execute`: phần thân của tác dụng; các cấu trúc được chấp nhận xem tại `Effect`.
- `label`: nhãn tác dụng được hiển thị trong thông tin chẩn đoán của `getEffects()`.

**Trả về** một hàm dọn dẹp dùng để hủy bỏ tác dụng đó, và hoàn tất sau khi việc dọn dẹp kết thúc.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L415)

### ctx.fiber

```ts cordis-catalog
/** The fiber (plugin runtime instance) that owns this context. */
fiber: Fiber
```

fiber (thực thể runtime của plugin) sở hữu ngữ cảnh này.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L12)

## Lớp Fiber

Thực thể runtime của một lần áp dụng plugin.

fiber theo dõi trạng thái phụ thuộc, cấu hình đã được kiểm định, các tác dụng vòng đời và những thao tác dọn dẹp tương ứng với ngữ cảnh plugin mà `ctx.plugin()` trả về.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L184)

### fiber.uid

```ts cordis-catalog
/** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
public uid: number | null
```

id duy nhất trong registry; id của fiber gốc là 0, và sau khi dispose thì là `null`.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L186)

### fiber.ctx

```ts cordis-catalog
/** The context this fiber's plugin runs in (extends the parent context). */
public readonly ctx: Context
```

Ngữ cảnh nơi plugin của fiber này chạy (mở rộng từ ngữ cảnh cha).

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L188)

### fiber.config

```ts cordis-catalog
/** The validated plugin config (updated by `update()`). */
public config: any
```

Cấu hình plugin đã được kiểm định (được cập nhật bởi `update()`).

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L190)

### fiber.state

```ts cordis-catalog
/** Current lifecycle state; transitions emit `internal/status`. */
public state
```

Trạng thái vòng đời hiện tại; việc chuyển trạng thái sẽ phát ra `internal/status`.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L194)

### fiber.dispose

```ts cordis-catalog
/** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
public readonly dispose: () => Promise<void>
```

dispose fiber này: gỡ tải plugin và hoàn tất sau khi việc dọn dẹp kết thúc.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L196)

### fiber.store

```ts cordis-catalog
/** Snapshot of required service implementations while loaded; `undefined` otherwise. */
public store: Dict<Impl> | undefined
```

Ảnh chụp các triển khai service cần thiết trong thời gian được nạp; trong các trường hợp khác là `undefined`.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L198)

### fiber.inertia

```ts cordis-catalog
/** The in-flight load/unload transition, if one is currently running. */
public inertia: Promise<void> | undefined
```

Quá trình chuyển tiếp nạp hoặc gỡ tải đang diễn ra; nếu không có quá trình chuyển tiếp nào như vậy thì là undefined.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L200)

### fiber.name

```ts cordis-catalog
/** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
get name()
```

Tên hiển thị của plugin, kế thừa từ tổ tiên có tên gần nhất; nếu không tồn tại thì là `'root'`.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L336)

### fiber.assertActive()

```ts cordis-catalog
/**
 * Throw if the fiber has already been disposed.
 *
 * @returns nothing when the fiber is still active.
 * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
 */
assertActive()
```

Nếu fiber đã dispose thì ném ngoại lệ.

**Trả về**: không trả về nội dung nào khi fiber vẫn đang ở trạng thái hoạt động.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L351)

### fiber.effect(execute, label?)

```ts cordis-catalog
/**
 * Register a cleanup-aware effect on this fiber.
 *
 * `execute` runs immediately; the disposers it produces are collected and
 * run (in reverse order) either when the returned disposer is called or
 * when the fiber unloads, whichever comes first. Calling the disposer twice
 * is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
 * already disposed, and `TypeError` if `execute` returns an invalid shape.
 *
 * @param execute — the effect body; see {@link Effect} for accepted shapes.
 * @param label — effect label shown in `getEffects()` diagnostics.
 * @returns a disposer that tears the effect down and settles once done.
 */
effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
```

Đăng ký trên fiber này một tác dụng có hỗ trợ dọn dẹp.

`execute` sẽ chạy ngay lập tức; các hàm dọn dẹp mà nó tạo ra sẽ được thu thập và chạy theo thứ tự ngược lại khi hàm dọn dẹp được trả về được gọi hoặc khi fiber được gỡ tải, tùy điều kiện nào xảy ra trước. Gọi hàm dọn dẹp nhiều lần sẽ không gây ra tác dụng nào. Nếu fiber đã dispose thì ném `CordisError('INACTIVE_EFFECT')`; nếu cấu trúc không hợp lệ thì ném `TypeError`, cho biết `execute` đã trả về một kết quả không được hỗ trợ.

- `execute`: phần thân của tác dụng; các cấu trúc được chấp nhận xem tại `Effect`.
- `label`: nhãn tác dụng được hiển thị trong thông tin chẩn đoán của `getEffects()`.

**Trả về** một hàm dọn dẹp dùng để hủy bỏ tác dụng đó, và hoàn tất sau khi việc dọn dẹp kết thúc.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L415)

### fiber.getEffects()

```ts cordis-catalog
/**
 * Return metadata for currently registered effects.
 *
 * @returns one {@link EffectMeta} tree per labeled live effect.
 */
getEffects()
```

Trả về metadata của các tác dụng hiện đang được đăng ký.

**Trả về**: mỗi tác dụng đang hoạt động có gắn nhãn tương ứng với một cây `EffectMeta`.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L568)

### fiber.await()

```ts cordis-catalog
/**
 * Wait for current lifecycle work and rethrow startup errors.
 *
 * @returns this fiber, once it has settled into a stable state.
 * @throws the config-validation or plugin-startup error, if any.
 */
async await()
```

Chờ công việc vòng đời hiện tại hoàn thành và ném lại các lỗi khởi động.

**Trả về**: chính fiber này sau khi nó đã vào trạng thái ổn định.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L704)

### fiber.restart()

```ts cordis-catalog
/**
 * Dispose and immediately reload this plugin with its current config.
 *
 * @returns a promise resolving once the reload settled.
 * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
 */
async restart()
```

dispose plugin này và lập tức nạp lại bằng cấu hình hiện tại của nó.

**Trả về** một promise được hoàn tất sau khi việc nạp lại kết thúc.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L718)

### fiber.update(config, noSave?)

```ts cordis-catalog
/**
 * Validate and apply new config, then restart the plugin.
 *
 * Runs the `internal/update` waterfall first, so update hooks (and HMR)
 * can veto or replace the restart.
 *
 * @param config — the new raw config; validated before anything restarts.
 * @param noSave — hint for persistence hooks not to write the change back.
 * @returns the update waterfall result; the default restart returns a promise.
 * @throws when validation, an update listener, or the restarted plugin fails.
 */
update(config: any, noSave = false)
```

Kiểm định và áp dụng cấu hình mới, sau đó khởi động lại plugin.

Trước tiên chạy waterfall (sự kiện kiểu thác nước) `internal/update`, nhờ đó các hook cập nhật (và HMR (thay thế module nóng)) có thể phủ quyết hoặc thay thế thao tác khởi động lại.

- `config`: cấu hình thô mới; được kiểm định trước khi bất kỳ thành phần nào khởi động lại.
- `noSave`: gợi ý cho các hook lưu trữ bền vững không ghi lại thay đổi này.

**Trả về** kết quả của waterfall cập nhật; thao tác khởi động lại mặc định trả về một promise.

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L736)

## Effect

Kết quả thân tác dụng mà `ctx.effect()` và quá trình khởi động plugin chấp nhận.

Có thể là một hàm dọn dẹp đơn lẻ, một promise hoàn tất thành hàm dọn dẹp, hoặc một đối tượng khả duyệt (có thể là bất đồng bộ) sinh ra nhiều hàm dọn dẹp. Tác dụng dạng generator sẽ đăng ký từng hàm dọn dẹp ngay khi nó được sinh ra.

```ts cordis-catalog
/**
 * Effect body result accepted by `ctx.effect()` and plugin startup.
 *
 * Either a single disposer, a promise of one, or a (possibly async) iterable
 * yielding several — generator effects register each yielded disposer as it
 * is produced.
 */
type Effect<T = any> =
  | SyncEffect<T>
  | AsyncEffect<T>
```

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L83)

## Disposable

Hàm do tác dụng trả về, dùng để giải phóng tài nguyên trong quá trình dispose.

Khi fiber sở hữu hàm đó được gỡ tải, các hàm dọn dẹp sẽ chạy theo thứ tự ngược với thứ tự đăng ký; hàm dọn dẹp có thể là bất đồng bộ, khi đó quá trình gỡ tải sẽ chờ chúng hoàn thành.

```ts cordis-catalog
/**
 * Function returned by an effect to release resources during disposal.
 *
 * Disposers run in reverse registration order when the owning fiber unloads;
 * they may be async, in which case unloading awaits them.
 */
type Disposable<T = any> = () => T
```

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L74)

## EffectMeta

Nút cây dùng để công bố các nhãn tác dụng lồng nhau trong thông tin chẩn đoán.

```ts cordis-catalog
/** Tree node used to expose nested effect labels for diagnostics. */
interface EffectMeta {
  /** Human-readable effect label, e.g. `ctx.on("event")` or `ctx.provide("name")`. */
  label: string
  /** Metadata of nested effects registered while this effect ran. */
  children: EffectMeta[]
}
```

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L96)

## CordisError

Lỗi framework có mã lỗi ổn định, máy có thể đọc được.

```ts cordis-catalog
/** Framework error with a stable machine-readable code. */
class CordisError extends Error {
  /**
   * @param code — the stable error code; also the default message.
   * @param message — optional human-readable override.
   */
  constructor(public code: CordisError.Code, message?: string)
}

/** Cordis error code definitions. */
namespace CordisError {
  export type Code = keyof typeof Code

  export const Code = {
    INACTIVE_EFFECT: 'cannot create effect on inactive context',
  } as const
}
```

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L157)

## ValidationError

Lỗi được ném ra khi cấu hình plugin không vượt qua kiểm định standard-schema.

```ts cordis-catalog
/** Error raised when plugin configuration fails standard-schema validation. */
class ValidationError extends TypeError {
  name = 'ValidationError'

  /**
   * Build the aggregated message from schema issues.
   *
   * @param issues — the standard-schema issues, one message line each.
   */
  constructor(issues: readonly StandardSchemaV1.Issue[])
}
```

[Mã nguồn](../../vendor/cordis/src/fiber.ts#L19)
