# 3. Dịch vụ

[English](03-services.md) | 中文

**Dịch vụ (service)** là một năng lực có tên do một plugin cung cấp, và các plugin khác tiêu thụ thông qua `ctx`. Trong harness, `ctx.tools`, `ctx.llm` và `ctx.agents` đều là dịch vụ. Bên tiêu thụ chỉ cần chỉ định năng lực như `'tools'`, mà không cần import nhà cung cấp của nó, do đó cấu hình có thể chọn nhà cung cấp mà không cần sửa bên tiêu thụ.

## Cung cấp dịch vụ

Tạo file `greeter.ts`, đặt nó trong `tmp/cordis-tutorial`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

Hai phần này phối hợp với nhau:

- **Thời gian chạy (runtime)**: `super(ctx, 'greeter')` đăng ký instance này với tên `greeter`. Sau đó, bất kỳ plugin nào cũng có thể truy cập nó thông qua `ctx.greeter`. Việc đăng ký thuộc về effect, khi gỡ bỏ nhà cung cấp thì dịch vụ cũng bị gỡ theo.
- **Thời gian biên dịch (compile time)**: khối `declare module '@deepseek-ai/cordis'` dùng cơ chế gộp khai báo (declaration merging) của TypeScript để thêm `greeter` vào interface `Context`, giúp `ctx.greeter` vượt qua type check ở mọi nơi. Nó không sinh ra code nào cả; nếu thiếu khai báo này, dịch vụ vẫn hoạt động bình thường ở thời gian chạy, nhưng bên tiêu thụ sẽ mất đi tính an toàn kiểu (type safety).

Lớp con `Service` tự nó chính là plugin (hình thái lớp đã giới thiệu ở Chương 1), do đó `ctx.plugin(GreeterService)` sẽ mount nó giống như mount các plugin khác.

## Tiêu thụ dịch vụ bằng `inject`

Tạo file `consumer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

`inject` liệt kê các dịch vụ mà plugin này cần. Cordis sẽ giữ plugin ở trạng thái PENDING cho đến khi từng dịch vụ được liệt kê đều tồn tại, do đó bên trong `apply` có thể đảm bảo `ctx.greeter` đã sẵn sàng. Thứ tự nạp trong `cordis.yml` không quan trọng: điều quyết định thời điểm plugin khởi động là quan hệ phụ thuộc, chứ không phải thứ tự trong file.

Lắp ráp và chạy:

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

```
Hello, world!
```

Đổi thứ tự hai dòng trong `cordis.yml` rồi chạy lại, đầu ra vẫn không đổi. Thử xóa hẳn `./greeter.ts`: bên tiêu thụ sẽ ở trạng thái PENDING mãi mãi, không xuất ra gì, cũng không bị sập, cũng không chỉ chạy một phần. Fiber ở trạng thái PENDING cũng không giữ event loop của Node hoạt động, do đó nếu trong tổ hợp không còn mục nào khác đang chạy, tiến trình sẽ lặng lẽ thoát với mã trạng thái 0. [Chương 6](06-composition-and-hmr.md) sẽ giới thiệu cách chẩn đoán tình trạng này.

## Quan hệ phụ thuộc vẫn được theo dõi sau khi nạp

`inject` không phải là kiểm tra một lần lúc khởi động. Nếu dịch vụ cần thiết biến mất trong khi ứng dụng đang chạy, ví dụ nhà cung cấp bị gỡ bỏ hoặc được thay thế nóng (hot replace), mỗi plugin phụ thuộc cũng sẽ bị gỡ bỏ theo, và nạp lại sau khi dịch vụ được khôi phục. Kết hợp với effect ([Chương 2](02-lifecycle-and-effects.md)), điều này ngăn bên tiêu thụ đang chạy giữ tham chiếu tới một dịch vụ không còn khả dụng: khi phụ thuộc biến mất, đăng ký của chính nó cũng bị hủy theo.

Đây cũng là lý do vì sao dịch vụ có thể được thay thế trong cấu hình: gỡ bỏ mục cấu hình Cordis `dsh-bash-local`, mount một nhà cung cấp `shell` khác, tất cả các plugin có inject `'shell'` sẽ khởi động lại và dùng triển khai mới.

## Phụ thuộc tùy chọn

`inject` dùng cho phụ thuộc bắt buộc (hard dependency). Nếu một tính năng vẫn có thể hoạt động khi thiếu, hãy bỏ qua `inject`, và kiểm tra sự tồn tại tại nơi sử dụng:

```ts ignore-check
export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

## Đặt tên

Tên dịch vụ trong mỗi ứng dụng dùng chung một namespace phẳng. Hãy thêm tiền tố hoặc namespace có tính nhận diện riêng cho dịch vụ của mình (harness đã chiếm các tên thông thường như `tools` và `llm`); khối `cordis-surface` được sinh ra trên [trang subsystem](../subsystems/core.md) liệt kê từng tên mà harness đã đăng ký.

Chương tiếp theo: [Sự kiện](04-events.md): giao tiếp mà không cần chia sẻ dịch vụ.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
