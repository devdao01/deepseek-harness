<!-- Tệp nguồn tiếng Anh được sinh ra bởi scripts/gen-cordis-catalog.ts; tệp tiếng Việt này là bản đối chiếu đã qua đánh giá, được duy trì theo cặp song ngữ.
     Khi cập nhật, trước tiên hãy chạy `pnpm run gen-cordis-catalog` để cập nhật bản tiếng Anh, sau đó cập nhật tệp này và chạy `pnpm run verify-translation-pairing --write docs/cordis-api/registry.md` để ghi lại cặp song ngữ. -->

# Registry

[English](registry.md) | Tiếng Việt

Nạp plugin và tiêm phụ thuộc.

### ctx.inject(deps, callback)

```ts cordis-catalog
/**
 * Run a callback once the requested services are available.
 *
 * Shorthand for `ctx.plugin({ inject, apply: callback })`: the callback
 * is unloaded and re-run whenever a required service changes.
 *
 * @param deps — required services, as an array or a name → config map.
 * @param callback — plugin body called with `(ctx, config)`.
 * @returns the fiber; awaiting it settles once loading finished.
 */
inject(deps: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>
```

Chạy callback sau khi các service được yêu cầu đã sẵn sàng.

Đây là dạng viết tắt của `ctx.plugin({ inject, apply: callback })`: mỗi khi một service bắt buộc thay đổi, hệ thống sẽ gỡ tải và chạy lại callback đó.

- `deps`: các service bắt buộc, có thể ở dạng mảng hoặc bản đồ từ tên sang cấu hình.
- `callback`: phần thân plugin được gọi với `(ctx, config)`.

**Trả về** fiber; thực hiện await trên nó sẽ kết thúc chờ sau khi việc nạp hoàn tất.

[Mã nguồn](../../vendor/cordis/src/registry.ts#L176)

### ctx.plugin(plugin, ...args)

```ts cordis-catalog
/**
 * Load a plugin in the current context.
 *
 * @param plugin — a function, class, or `{ apply }` object plugin.
 * @param args — the plugin config, validated against its `Config` schema.
 * @returns the fiber; awaiting it settles once loading finished
 * (rejecting on config or startup errors).
 */
plugin<P extends Plugin>(plugin: P, ...args: Spread<GetPluginConfig<P>>): Fiber & PromiseLike<Fiber>
```

Nạp một plugin trong ngữ cảnh hiện tại.

- `plugin`: plugin ở dạng hàm, lớp hoặc đối tượng `{ apply }`.
- `args`: cấu hình plugin, sẽ được kiểm định theo schema `Config` của nó.

**Trả về** fiber; thực hiện await trên nó sẽ kết thúc chờ sau khi việc nạp hoàn tất (nếu xảy ra lỗi cấu hình hoặc lỗi khởi động thì sẽ bị từ chối).

[Mã nguồn](../../vendor/cordis/src/registry.ts#L185)

## Plugin

Các dạng điểm vào (entrypoint) plugin được hỗ trợ.

```ts cordis-catalog
/** Supported plugin entrypoint shapes. */
type Plugin<T = any> =
  | Plugin.Function<T>
  | Plugin.Constructor<T>
  | Plugin.Object<T>

/** Types associated with plugin entrypoints and runtime records. */
namespace Plugin {
  /** Shared metadata understood by the plugin registry and related tooling. */
  export interface Base<T = any> {
    /** Display name used for fiber diagnostics and logger names. */
    name?: string
    /** Standard-schema validator applied to config before the plugin starts. */
    Config?: StandardSchemaV1<any, T>
    /** Services the plugin requires; it only loads while all are available. */
    inject?: Inject
    /** Service name(s) the plugin provides (read by `Service` and by loaders). */
    provide?: string | string[]
    /** Service names whose intercept config the plugin declares it consumes. */
    intercept?: Dict<boolean>
  }

  export interface Transform<S, T> {
    /** Marks the transform object as a schema/config transform. */
    schema?: true
    /** Convert user-facing config to runtime config. */
    Config: (config: S) => T
  }

  /** Function plugin called with `(ctx, config)`. */
  export interface Function<T = any> extends Base<T> {
    (ctx: Context, config: T): any
  }

  /** Class plugin constructed with `(ctx, config)`. */
  export interface Constructor<T = any> extends Base<T> {
    new (ctx: Context, config: T): any
  }

  /** Object plugin with an `apply(ctx, config)` method. */
  export interface Object<T = any> extends Base<T> {
    apply(ctx: Context, config: T): any
  }

  /** Mutable registry record shared by all fibers of one plugin callback. */
  export interface Runtime {
    /** Display name copied from the first registered plugin shape. */
    name?: string
    /** Every live fiber of this plugin (one per `ctx.plugin()` call). */
    fibers: DisposableList<Fiber>
    /** The executable entrypoint all fibers share (registry identity key). */
    callback: globalThis.Function
    /** Standard-schema validator applied to each fiber's config. */
    Config?: StandardSchemaV1
  }
}
```

[Mã nguồn](../../vendor/cordis/src/registry.ts#L92)

## Inject

Khai báo phụ thuộc service mà các plugin và decorator `@Inject` chấp nhận.

Dạng mảng yêu cầu các service mà không kèm cấu hình intercept. Dạng đối tượng ánh xạ mỗi tên service tới cấu hình intercept tùy chọn trong ngữ cảnh plugin.

```ts cordis-catalog
/**
 * Service dependency declaration accepted by plugins and the `@Inject`
 * decorator.
 *
 * Array form requests services without intercept config. Object form maps each
 * service name to optional intercept config for the plugin context.
 */
type Inject<M = Dict> = (keyof M)[] | { [K in keyof M]?: M[K] }

/** Utilities for normalizing plugin dependency declarations. */
namespace Inject {
  /**
   * Convert array/object/class-inherited inject metadata into a plain map.
   *
   * @param inject — the declaration to normalize; `null`/`undefined` add nothing.
   * @param result — the map to fill (service name → intercept config or `null`).
   * @returns `result`.
   */
  export function resolve(inject: Inject | null | undefined, result: Dict = Object.create(null))
}
```

[Mã nguồn](../../vendor/cordis/src/registry.ts#L19)
