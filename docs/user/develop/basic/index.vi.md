# Plugin đầu tiên

[English](index.md) | 中文

Hướng dẫn này sẽ tạo một plugin Harness tối giản, và nạp nó vào Web UI. Hãy bắt đầu từ một checkout repo đã hoàn tất [đường dẫn chạy từ mã nguồn](../../../../README.md#run-from-source).

## Tạo dự án cục bộ

Tạo dự án tạm dùng cho hướng dẫn này ở thư mục gốc repo:

```sh
mkdir -p scratch-plugin/src
```

## Plugin là gì

Trong Harness, plugin là một module TypeScript export hàm `apply`. Framework gọi `apply` khi nạp, truyền vào một `ctx` (đối tượng context), bạn dùng `ctx` để đăng ký năng lực:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

Đây là cấu hình đầy đủ.

## Tạo file plugin

Tạo `scratch-plugin/src/my-plugin.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

## Đăng ký vào cordis.yml

Chạy `pwd` ở thư mục gốc repo, sau đó tạo `scratch-plugin/cordis.yml`, đóng vai trò lớp overlay Web để insert plugin cục bộ. Hãy thay `/absolute/path/to/deepseek-harness` dưới đây bằng đường dẫn mà lệnh vừa in ra:

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/deepseek-harness/scratch-plugin/src/my-plugin.ts'
```

Đường dẫn plugin phải là đường dẫn tuyệt đối. File patch chỉ đóng góp cấu hình, không thay đổi thư mục profile mà loader dùng để giải quyết đường dẫn module.

Khởi động Web UI với overlay này:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

Mở `http://127.0.0.1:3080`. Trong lúc khởi động, terminal sẽ in ra `[hello-plugin] plugin loaded!`.

## Tự động dọn dẹp

Bất cứ thứ gì được đăng ký qua `ctx` — event listener, công cụ, timer — đều sẽ tự động được dọn dẹp khi plugin bị gỡ. Bạn không cần tự gọi removeListener hay clearInterval.

Nếu bạn có tài nguyên cần dọn dẹp thủ công (ví dụ một kết nối mạng), hãy dùng `ctx.effect()` để báo cho framework biết cách dọn dẹp:

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}
```

## Khai báo phụ thuộc

Nếu plugin của bạn cần dùng dịch vụ khác (như `tools`, `llm`), bạn cần khai báo `inject`:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

Framework sẽ đảm bảo dịch vụ phụ thuộc sẵn sàng trước khi nạp plugin của bạn.

## Ba dạng thức của plugin

Ngoài dạng hàm, plugin còn hỗ trợ dạng object và dạng class:

### Dạng object

```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### Dạng class

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}
```

Trong đa số trường hợp, dạng hàm là đủ dùng. Khi plugin cần cung cấp dịch vụ cho các plugin khác, có thể dùng dạng class (xem [Dịch vụ và phụ thuộc](../framework/service.md)).

## Bước tiếp theo

- [Phát triển một công cụ](./tool.md) — tìm hiểu DSL định nghĩa công cụ
- [Cấu hình plugin](./config.md) — cho phép plugin nhận cấu hình từ người dùng
- [Hướng dẫn framework Cordis](../../../cordis-tutorial/index.md) — framework plugin tầng thấp, thực hành trực tiếp trong thư mục tạm, không cần API key
