# Cấu hình plugin

[English](config.md) | 中文

Cho phép plugin của bạn nhận cấu hình mà người dùng truyền vào trong `cordis.yml`.

## Định nghĩa kiểu Config

Export một kiểu `Config` và một schema Schemastery cùng tên trong plugin; giá trị mặc định viết trực tiếp trong schema:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

Thêm cấu hình vào dòng plugin cục bộ vừa được insert trong `scratch-plugin/cordis.yml`:

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

Khi plugin được nạp, Cordis sẽ xác thực cấu hình qua schema đã export, và điền giá trị mặc định cho các trường chưa được cung cấp. Đừng export một object thông thường làm `Config`, vì nó không thỏa mãn interface Standard Schema mà Cordis yêu cầu.

## Xác thực Schema

Với các trường hợp cần xác thực nghiêm ngặt, hãy dùng Schemastery để định nghĩa schema:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}
```

Schema thực hiện xác thực khi plugin được nạp. Nếu cấu hình không hợp lệ, plugin sẽ nạp thất bại kèm thông báo lỗi rõ ràng.

## Nguyên tắc thiết kế

### Không hardcode tham số điều chỉnh

Quy ước của Harness: **bất kỳ tham số nào mà các lần triển khai khác nhau có thể cần giá trị khác nhau đều phải được định nghĩa là trường cấu hình**.

```ts
// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}
```

Tiêu chí kiểm tra: có thể thay đổi giá trị này trong `cordis.yml` mà không cần sửa code không?

### Lỗi cấu hình phải rõ ràng

Diễn đạt các ràng buộc tự thân trong schema, khiến cấu hình không hợp lệ thất bại ngay khi plugin nạp. Tham chiếu tới dịch vụ hoặc tài nguyên đã đăng ký cần dependency injection; [hướng dẫn về dịch vụ](../framework/service.md) sẽ giới thiệu quy ước này.

## Phối hợp với HMR

Thay đổi cấu hình sẽ kích hoạt hot-replace plugin: sau khi sửa `config` của một plugin trong `cordis.yml`, framework sẽ gỡ instance cũ và nạp instance mới. Vì mọi đăng ký đều thuộc effect và sẽ tự động dọn dẹp, việc thay thế không giữ lại đăng ký của instance cũ.

## Bước tiếp theo

- [Đóng gói và cài đặt plugin](./publish.md) — chuyển giao plugin dưới dạng gói có thể cài đặt
- [Plugin và vòng đời](../framework/) — tìm hiểu sâu về toàn bộ vòng đời của plugin
- [Dịch vụ và phụ thuộc](../framework/service.md) — để plugin của bạn cung cấp dịch vụ ra ngoài
