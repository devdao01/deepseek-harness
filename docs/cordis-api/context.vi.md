<!-- Tệp nguồn tiếng Anh được sinh ra bởi scripts/gen-cordis-catalog.ts; tệp tiếng Việt này là bản đối chiếu đã qua đánh giá, được duy trì theo cặp song ngữ.
     Khi cập nhật, trước tiên hãy chạy `pnpm run gen-cordis-catalog` để cập nhật bản tiếng Anh, sau đó cập nhật tệp này và chạy `pnpm run verify-translation-pairing --write docs/cordis-api/context.md` để ghi lại cặp song ngữ. -->

# Ngữ cảnh

[English](context.md) | Tiếng Việt

Ngữ cảnh là đối tượng cốt lõi của Cordis: mọi service, event và API vòng đời đều được truy cập thông qua `ctx`. Các phương thức sự kiện xem tại [Sự kiện](events.md), tác dụng (effect) và fiber hiện tại xem tại [Fiber](fiber.md), việc nạp plugin xem tại [Registry](registry.md).

Vùng chứa phụ thuộc gốc và vùng chứa phụ thuộc con của plugin Cordis.

Ngữ cảnh là một proxy: việc đọc thuộc tính thông thường diễn ra qua bộ phân giải service, còn `extend()`, `isolate()` và `intercept()` sẽ tạo ra ngữ cảnh con có phạm vi riêng mà không sửa đổi ngữ cảnh cha.

[Mã nguồn](../../vendor/cordis/src/context.ts#L42)

### ctx.extend(meta?)

```ts cordis-catalog
/**
 * Create a child context with extra metadata on top of the current scope.
 *
 * The child prototypally inherits every property of this context; own
 * properties of `meta` shadow the inherited ones. The parent is not mutated.
 *
 * @param meta — own properties (including symbol keys) to define on the child.
 * @returns a child context inheriting from this one.
 */
extend(meta = {}): this
```

Tạo một ngữ cảnh con mang thêm metadata bên trên phạm vi hiện tại.

Ngữ cảnh con kế thừa qua prototype toàn bộ thuộc tính của ngữ cảnh hiện tại; các thuộc tính riêng của `meta` sẽ che khuất những thuộc tính cùng tên được kế thừa. Ngữ cảnh cha không bị sửa đổi.

- `meta`: các thuộc tính riêng sẽ được định nghĩa trên ngữ cảnh con, bao gồm cả những thuộc tính có khóa là symbol.

**Trả về** ngữ cảnh con kế thừa từ ngữ cảnh hiện tại.

[Mã nguồn](../../vendor/cordis/src/context.ts#L99)

### ctx.isolate(name, label?)

```ts cordis-catalog
/**
 * Create a child context with an independent service scope for `name`.
 *
 * Below the returned context, reads and writes of the service `name`
 * resolve against the new label instead of the parent's, so a different
 * implementation can be provided without affecting the parent scope.
 * Passing the same `label` to two `isolate()` calls joins their scopes.
 *
 * @param name — the service name to isolate.
 * @param label — scope label to join; defaults to a fresh unique symbol.
 * @returns a child context whose `name` service resolves in the new scope.
 */
isolate(name: string, label?: symbol)
```

Tạo một ngữ cảnh con để `name` có phạm vi service độc lập.

Bên dưới ngữ cảnh được trả về, việc đọc và ghi service `name` sẽ được phân giải theo nhãn mới thay vì theo nhãn của ngữ cảnh cha, nhờ đó có thể cung cấp một triển khai khác mà không ảnh hưởng đến phạm vi cha. Truyền cùng một `label` cho hai lần gọi `isolate()` sẽ khiến cả hai cùng tham gia một phạm vi.

- `name`: tên service cần cô lập.
- `label`: nhãn phạm vi cần tham gia; mặc định là một symbol duy nhất mới tạo.

**Trả về** một ngữ cảnh con mà service `name` của nó được phân giải trong phạm vi mới.

[Mã nguồn](../../vendor/cordis/src/context.ts#L121)

### ctx.intercept(name, config)

```ts cordis-catalog
/**
 * Add service-specific intercept config for plugins started below this
 * context.
 *
 * Plugins loaded under the returned context see `config` merged into the
 * service's resolved config (ancestor entries first; see
 * `Service[symbols.resolveConfig]`). The parent context is not affected.
 *
 * @param name — the service name whose config to intercept.
 * @param config — the intercept config to merge for that service.
 * @returns a child context carrying the additional intercept entry.
 */
intercept<K extends InjectKey>(name: K, config: Context[K] extends { [symbols.config]: infer T } ? T : never): this
intercept(name: string, config: any): this
```

Thêm cấu hình intercept dành riêng cho service đối với các plugin được khởi động bên dưới ngữ cảnh này.

Các plugin được nạp dưới ngữ cảnh trả về sẽ thấy `config` đã được gộp vào cấu hình đã phân giải của service (các mục của tổ tiên đứng trước; xem `Service[symbols.resolveConfig]`). Ngữ cảnh cha không bị ảnh hưởng.

- `name`: tên service cần intercept cấu hình.
- `config`: cấu hình intercept cần gộp cho service đó.

**Trả về** một ngữ cảnh con mang thêm mục intercept đó.

[Mã nguồn](../../vendor/cordis/src/context.ts#L139)

### ctx.root

```ts cordis-catalog
/** The root context of the application (every child context shares it). @experimental */
root: this
```

Ngữ cảnh gốc của ứng dụng, mọi ngữ cảnh con đều dùng chung nó. @experimental

[Mã nguồn](../../vendor/cordis/src/context.ts#L22)

### ctx.baseUrl

```ts cordis-catalog
/** Base URL used to resolve relative plugin/module specifiers, if the runtime sets one. */
baseUrl?: string
```

URL cơ sở dùng để phân giải các specifier plugin/module tương đối, với điều kiện runtime có thiết lập giá trị này.

[Mã nguồn](../../vendor/cordis/src/context.ts#L24)

### ctx.events

```ts cordis-catalog
/** The event bus. Its methods are also mixed onto `ctx` (`ctx.on`, `ctx.emit`, ...). */
events: EventsService
```

Bus sự kiện. Các phương thức của nó cũng được mixin vào `ctx` (`ctx.on`, `ctx.emit`, v.v.).

[Mã nguồn](../../vendor/cordis/src/context.ts#L26)

### ctx.logger

```ts cordis-catalog
/** The logging service. Call `ctx.logger(name)` for a named logger. */
logger: LoggerService
```

Service ghi log. Gọi `ctx.logger(name)` để lấy một logger có tên.

[Mã nguồn](../../vendor/cordis/src/context.ts#L28)

### ctx.reflect

```ts cordis-catalog
/** The reflection layer backing the context proxy (`ctx.get`, `ctx.provide`, ...). */
reflect: ReflectService
```

Lớp phản chiếu (reflection) hỗ trợ cho proxy ngữ cảnh (`ctx.get`, `ctx.provide`, v.v.).

[Mã nguồn](../../vendor/cordis/src/context.ts#L30)

### ctx.registry

```ts cordis-catalog
/** The plugin registry. Its methods are mixed onto `ctx` (`ctx.plugin`, `ctx.inject`). */
registry: RegistryService
```

Registry plugin. Các phương thức của nó được mixin vào `ctx` (`ctx.plugin`, `ctx.inject`).

[Mã nguồn](../../vendor/cordis/src/context.ts#L32)

## Thành viên tĩnh

### Context.effect

```ts cordis-catalog
/** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
static readonly effect: unique symbol
```

Khóa symbol mà hàm giải phóng tài nguyên dùng để công bố cây chẩn đoán EffectMeta của nó.

[Mã nguồn](../../vendor/cordis/src/context.ts#L44)

### Context.filter

```ts cordis-catalog
/** Symbol key for a context's listener filter, consulted on every event dispatch. */
static readonly filter: unique symbol
```

Khóa symbol của bộ lọc listener trong ngữ cảnh; bộ lọc này được tra cứu mỗi lần phân phối sự kiện.

[Mã nguồn](../../vendor/cordis/src/context.ts#L46)

### Context.isolate

```ts cordis-catalog
/** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
static readonly isolate: unique symbol
```

Khóa symbol của bản đồ cô lập (xem thuộc tính `Context[symbols.isolate]`).

[Mã nguồn](../../vendor/cordis/src/context.ts#L48)

### Context.intercept

```ts cordis-catalog
/** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
static readonly intercept: unique symbol
```

Khóa symbol của bản đồ intercept (xem thuộc tính `Context[symbols.intercept]`).

[Mã nguồn](../../vendor/cordis/src/context.ts#L50)

### Context.is(value)

```ts cordis-catalog
/**
 * Returns true for Cordis context proxies and context prototypes.
 *
 * Works across realms and across multiple copies of cordis, because the
 * brand is keyed by a global symbol rather than by `instanceof`.
 *
 * @param value — the value to test.
 * @returns `true` if `value` is a Cordis context, narrowing its type.
 */
static is(value: any): value is Context
```

Trả về true đối với proxy ngữ cảnh Cordis và prototype ngữ cảnh.

Phương thức này hoạt động xuyên các realm và nhiều bản sao cordis, bởi vì dấu nhận dạng (brand) của nó được khóa bằng một symbol toàn cục chứ không dựa vào `instanceof`.

- `value`: giá trị cần kiểm tra.

**Trả về** `true` khi `value` là một ngữ cảnh Cordis, đồng thời thu hẹp kiểu của nó.

[Mã nguồn](../../vendor/cordis/src/context.ts#L61)

## Lưu trữ service và mixin

### ctx.get(name, strict?)

```ts cordis-catalog
/**
 * Read a service from the store without the inject requirement.
 *
 * @param name — the service name.
 * @param strict — when `true` (default), only return implementations
 * whose providing fiber is currently active.
 * @returns the service value, or `undefined` when not (yet) provided.
 */
get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K]
get(name: string, strict?: boolean): any
```

Đọc một service từ kho lưu trữ mà không cần thỏa mãn yêu cầu inject.

- `name`: tên service.
- `strict`: khi đặt là `true` (giá trị mặc định), chỉ trả về những triển khai có fiber cung cấp đang ở trạng thái hoạt động.

**Trả về** giá trị của service; nếu service chưa được cung cấp thì trả về `undefined`.

[Mã nguồn](../../vendor/cordis/src/reflect.ts#L17)

### ctx.set(name, value)

```ts cordis-catalog
/**
 * Overwrite a provided service's value.
 *
 * Only the fiber that provided the service may set it; setting an
 * unprovided name throws.
 *
 * @param name — the service name.
 * @param value — the new service value.
 */
set<K extends string & keyof this>(name: K, value: undefined | this[K]): void
set(name: string, value: any): void
```

Ghi đè giá trị của một service đã được cung cấp.

Chỉ fiber đã cung cấp service đó mới được phép thiết lập nó; thiết lập một tên chưa được cung cấp sẽ ném ngoại lệ.

- `name`: tên service.
- `value`: giá trị service mới.

[Mã nguồn](../../vendor/cordis/src/reflect.ts#L29)

### ctx.provide(name, value)

```ts cordis-catalog
/**
 * Register a service implementation owned by the current fiber.
 *
 * The service becomes visible to dependents in the same isolation scope
 * once the fiber is active; it is unregistered (waking dependents) when
 * the returned disposer runs or the fiber unloads. Throws if the name is
 * already provided in this scope or declared as an accessor.
 *
 * @param name — the service name.
 * @param value — the service value.
 * @returns a disposer that unregisters the service.
 */
provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void
provide(name: string, value?: any): () => void
```

Đăng ký một triển khai service thuộc sở hữu của fiber hiện tại.

Sau khi fiber được kích hoạt, service này sẽ hiển thị với các bên phụ thuộc trong cùng phạm vi cô lập; khi hàm giải phóng tài nguyên được trả về chạy hoặc khi fiber được gỡ tải, service sẽ bị hủy đăng ký và đánh thức các bên phụ thuộc. Nếu tên đó đã được cung cấp trong phạm vi này, hoặc đã được khai báo là accessor, thì sẽ ném ngoại lệ.

- `name`: tên service.
- `value`: giá trị service.

**Trả về** một hàm giải phóng tài nguyên dùng để hủy đăng ký service đó.

[Mã nguồn](../../vendor/cordis/src/reflect.ts#L44)

### ctx.accessor(name, options)

```ts cordis-catalog
/**
 * Define a computed context property backed by get/set hooks.
 *
 * The accessor is removed when the current fiber unloads. Throws if the
 * name is already declared.
 *
 * @param name — the context property name.
 * @param options — the `get` hook and optional `set` hook.
 */
accessor(name: string, options: Omit<Property.Accessor, 'type'>): void
```

Định nghĩa một thuộc tính ngữ cảnh dạng tính toán được hỗ trợ bởi các hook get/set.

Accessor sẽ bị gỡ bỏ khi fiber hiện tại được gỡ tải. Nếu tên đó đã được khai báo thì sẽ ném ngoại lệ.

- `name`: tên thuộc tính ngữ cảnh.
- `options`: hook `get` và hook `set` tùy chọn.

[Mã nguồn](../../vendor/cordis/src/reflect.ts#L56)

### ctx.mixin(name, mixins)

```ts cordis-catalog
/**
 * Expose selected members of a service directly on `ctx`.
 *
 * Each mixed-in key becomes an accessor that forwards to the service
 * (binding methods to it), so e.g. `ctx.on` forwards to `ctx.events.on`.
 * Mixins are removed when the current fiber unloads.
 *
 * @param name — the context property holding the source service.
 * @param mixins — keys to forward, or a source-key → ctx-key map.
 */
mixin<K extends string & keyof this>(name: K, mixins: (keyof this & keyof this[K])[] | Dict<string>): void
mixin<T extends {}>(source: T, mixins: (keyof this & keyof T)[] | Dict<string>): void
```

Công bố trực tiếp trên `ctx` các thành viên được chỉ định của một service.

Mỗi khóa được mixin sẽ trở thành một accessor chuyển tiếp tới service đó, đồng thời ràng buộc các phương thức vào service. Ví dụ, `ctx.on` sẽ chuyển tiếp tới `ctx.events.on`. Khi fiber hiện tại được gỡ tải, các mixin này sẽ bị gỡ bỏ.

- `name`: thuộc tính ngữ cảnh chứa service nguồn.
- `mixins`: các khóa cần chuyển tiếp, hoặc bản đồ từ khóa nguồn sang khóa ctx.

[Mã nguồn](../../vendor/cordis/src/reflect.ts#L67)
