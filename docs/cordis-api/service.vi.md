<!-- Tệp nguồn tiếng Anh được sinh ra bởi scripts/gen-cordis-catalog.ts; tệp tiếng Việt này là bản đối chiếu đã qua đánh giá, được duy trì theo cặp song ngữ.
     Khi cập nhật, trước tiên hãy chạy `pnpm run gen-cordis-catalog` để cập nhật bản tiếng Anh, sau đó cập nhật tệp này và chạy `pnpm run verify-translation-pairing --write docs/cordis-api/service.md` để ghi lại cặp song ngữ. -->

# Service

[English](service.md) | Tiếng Việt

Lớp cơ sở của service ngữ cảnh. Các lớp con được nạp dưới dạng plugin sẽ tự đăng ký chính mình thành `ctx.<name>`.

Lớp cơ sở của service dùng để công bố API có tên trên `ctx`.

Lớp con gọi `super(ctx, name)` trong constructor. Service được đăng ký ngay lập tức và tự động bị gỡ bỏ cùng với fiber sở hữu nó.

[Mã nguồn](../../vendor/cordis/src/service.ts#L11)

### service.name

```ts cordis-catalog
/** The service name this instance is registered under. */
public name!: string
```

Tên service mà thực thể này dùng khi đăng ký.

[Mã nguồn](../../vendor/cordis/src/service.ts#L30)

## Thành viên tĩnh

### Service.init

```ts cordis-catalog
/** Symbol key of an instance method run after construction (class plugins). */
static readonly init: unique symbol
```

Khóa symbol của phương thức thực thể được chạy sau khi khởi tạo xong (plugin dạng lớp).

[Mã nguồn](../../vendor/cordis/src/service.ts#L13)

### Service.check

```ts cordis-catalog
/** Symbol key of the availability predicate passed to `ctx.provide()`. */
static readonly check: unique symbol
```

Khóa symbol của vị từ kiểm tra tính khả dụng được truyền cho `ctx.provide()`.

[Mã nguồn](../../vendor/cordis/src/service.ts#L15)

### Service.config

```ts cordis-catalog
/** Symbol key of the phantom intercept-config type parameter. */
static readonly config: unique symbol
```

Khóa symbol của tham số kiểu cấu hình intercept ảo (phantom).

[Mã nguồn](../../vendor/cordis/src/service.ts#L17)

### Service.invoke

```ts cordis-catalog
/** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
static readonly invoke: unique symbol
```

Khóa symbol của phần thân lời gọi giúp service có thể được gọi (ví dụ `ctx.logger()`).

[Mã nguồn](../../vendor/cordis/src/service.ts#L19)

### Service.extend

```ts cordis-catalog
/** Symbol key of the helper deriving an extended service instance. */
static readonly extend: unique symbol
```

Khóa symbol của phương thức trợ giúp dùng để dẫn xuất một thực thể service mở rộng.

[Mã nguồn](../../vendor/cordis/src/service.ts#L21)

### Service.tracker

```ts cordis-catalog
/** Symbol key of the tracker metadata used for context tracing. */
static readonly tracker: unique symbol
```

Khóa symbol của metadata bộ theo dõi dùng cho việc truy vết ngữ cảnh.

[Mã nguồn](../../vendor/cordis/src/service.ts#L23)

### Service.resolveConfig

```ts cordis-catalog
/** Symbol key of the intercept-config resolution helper below. */
static readonly resolveConfig: unique symbol
```

Khóa symbol của phương thức trợ giúp phân giải cấu hình intercept nêu dưới đây.

[Mã nguồn](../../vendor/cordis/src/service.ts#L25)
