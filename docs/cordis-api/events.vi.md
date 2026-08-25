<!-- Tệp nguồn tiếng Anh được sinh ra bởi scripts/gen-cordis-catalog.ts; tệp tiếng Việt này là bản đối chiếu đã qua đánh giá, được duy trì theo cặp song ngữ.
     Khi cập nhật, trước tiên hãy chạy `pnpm run gen-cordis-catalog` để cập nhật bản tiếng Anh, sau đó cập nhật tệp này và chạy `pnpm run verify-translation-pairing --write docs/cordis-api/events.md` để ghi lại cặp song ngữ. -->

# Sự kiện

[English](events.md) | Tiếng Việt

API phân phối sự kiện được mixin vào mọi ngữ cảnh. Các khai báo sự kiện của harness cùng mô hình phân phối của chúng được sinh ra trong [trang hệ thống con](../subsystems/core.md) tương ứng.

### ctx.parallel(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event, running all listeners concurrently.
 *
 * @param name — the event name.
 * @param args — arguments passed to every listener.
 * @returns a promise resolving once every listener has settled.
 */
parallel<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promise<void>
parallel<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promise<void>
```

Phân phối một sự kiện, chạy đồng thời tất cả listener.

- `name`: tên sự kiện.
- `args`: các tham số được truyền cho mỗi listener.

**Giá trị trả về**: một Promise được hoàn tất sau khi tất cả listener đã hoàn thành.

[Mã nguồn](../../vendor/cordis/src/events.ts#L44)

### ctx.emit(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event synchronously, ignoring listener return values.
 *
 * @param name — the event name.
 * @param args — arguments passed to every listener.
 */
emit<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): void
emit<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): void
```

Phân phối một sự kiện một cách đồng bộ, bỏ qua giá trị trả về của các listener.

- `name`: tên sự kiện.
- `args`: các tham số được truyền cho mỗi listener.

[Mã nguồn](../../vendor/cordis/src/events.ts#L53)

### ctx.serial(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event, awaiting listeners in order until one bails.
 *
 * @param name — the event name.
 * @param args — arguments passed to each listener.
 * @returns the first bail value (non-null, non-false, non-undefined), if any.
 */
serial<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType<Events[K]>>
serial<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType<Events[K]>>
```

Phân phối một sự kiện, lần lượt chờ từng listener cho đến khi một listener kết thúc sớm quá trình phân phối.

- `name`: tên sự kiện.
- `args`: các tham số được truyền cho mỗi listener.

**Giá trị trả về**: giá trị kết thúc sớm đầu tiên (khác null, khác false và khác undefined); nếu không có thì không trả về giá trị loại này.

[Mã nguồn](../../vendor/cordis/src/events.ts#L63)

### ctx.bail(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event, calling listeners in order until one bails.
 *
 * @param name — the event name.
 * @param args — arguments passed to each listener.
 * @returns the first bail value (non-null, non-false, non-undefined), if any.
 */
bail<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
bail<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
```

Phân phối một sự kiện, lần lượt gọi từng listener cho đến khi một listener kết thúc sớm quá trình phân phối.

- `name`: tên sự kiện.
- `args`: các tham số được truyền cho mỗi listener.

**Giá trị trả về**: giá trị kết thúc sớm đầu tiên (khác null, khác false và khác undefined); nếu không có thì không trả về giá trị loại này.

[Mã nguồn](../../vendor/cordis/src/events.ts#L73)

### ctx.waterfall(name, ...args)

```ts cordis-catalog
/**
 * Dispatch an event whose last argument is a `next` continuation.
 *
 * Each listener wraps the rest of the chain: calling `next()` invokes the
 * next listener (finally the built-in behavior); not calling it vetoes.
 *
 * @param name — the event name.
 * @param args — listener arguments; the final one is the innermost `next`.
 * @returns the outermost listener's return value.
 */
waterfall<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
waterfall<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
```

Phân phối một sự kiện mà tham số cuối cùng của nó là callback `next` dùng để chạy tiếp chuỗi xử lý.

Mỗi listener bao bọc phần còn lại của chuỗi gọi: gọi `next()` sẽ thực thi listener kế tiếp, và cuối cùng là hành vi mặc định tích hợp sẵn; không gọi `next()` đồng nghĩa với việc phủ quyết phần xử lý phía sau.

- `name`: tên sự kiện.
- `args`: các tham số của listener; tham số cuối cùng là `next` ở lớp trong cùng.

**Giá trị trả về**: giá trị trả về của listener ngoài cùng.

[Mã nguồn](../../vendor/cordis/src/events.ts#L86)

### ctx.on(name, listener, options?)

```ts cordis-catalog
/**
 * Register an event listener owned by the current fiber.
 *
 * @param name — the event name to listen for.
 * @param listener — called with the dispatch arguments.
 * @param options — listener options; a boolean is shorthand for `prepend`.
 * @returns a disposer removing the listener; `true` if it was still registered.
 */
on<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
```

Đăng ký một listener sự kiện thuộc sở hữu của fiber hiện tại.

- `name`: tên sự kiện cần lắng nghe.
- `listener`: listener được gọi với các tham số phân phối.
- `options`: các tùy chọn của listener; giá trị boolean có thể dùng như dạng viết tắt của `prepend`.

**Giá trị trả về**: một hàm giải phóng tài nguyên dùng để gỡ bỏ listener; nếu tại thời điểm gọi hàm đó listener vẫn đang ở trạng thái đã đăng ký thì trả về `true`.

[Mã nguồn](../../vendor/cordis/src/events.ts#L97)

### ctx.once(name, listener, options?)

```ts cordis-catalog
/**
 * Same as `on()`, but the listener disposes itself after its first call.
 *
 * @param name — the event name to listen for.
 * @param listener — called at most once with the dispatch arguments.
 * @param options — listener options; a boolean is shorthand for `prepend`.
 * @returns a disposer removing the listener; `true` if it was still registered.
 */
once<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
```

Giống `on()`, nhưng listener sẽ tự hủy đăng ký sau lần gọi đầu tiên.

- `name`: tên sự kiện cần lắng nghe.
- `listener`: được gọi với các tham số phân phối, tối đa một lần.
- `options`: các tùy chọn của listener; giá trị boolean có thể dùng như dạng viết tắt của `prepend`.

**Giá trị trả về**: một hàm giải phóng tài nguyên dùng để gỡ bỏ listener; nếu tại thời điểm gọi hàm đó listener vẫn đang ở trạng thái đã đăng ký thì trả về `true`.

[Mã nguồn](../../vendor/cordis/src/events.ts#L106)

## EventOptions

Các tùy chọn mà `ctx.on()` và `ctx.once()` chấp nhận.

```ts cordis-catalog
/** Options accepted by `ctx.on()` and `ctx.once()`. */
interface EventOptions {
  /** Add the listener before existing listeners for the same event. */
  prepend?: boolean
  /** Receive the event regardless of context filter checks. */
  global?: boolean
}
```

[Mã nguồn](../../vendor/cordis/src/events.ts#L112)

## DispatchMode

Chiến lược phân phối sự kiện mà service sự kiện sử dụng.

`emit` chạy các listener đồng bộ nhưng không chờ chúng, `parallel` chờ đồng thời tất cả listener, `serial` lần lượt chờ từng listener cho đến khi một listener kết thúc sớm quá trình phân phối, `bail` dừng lại ở giá trị kết thúc sớm đồng bộ đầu tiên, còn `waterfall` thì kết hợp các listener xoay quanh callback `next` cuối cùng.

```ts cordis-catalog
/**
 * Event dispatch strategy used by the event service.
 *
 * `emit` runs synchronous listeners without awaiting them, `parallel` awaits
 * all listeners together, `serial` awaits them in order until one bails,
 * `bail` stops on the first synchronous bail value, and `waterfall` composes
 * listeners around a final `next` callback.
 */
type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall'
```

[Mã nguồn](../../vendor/cordis/src/events.ts#L32)
