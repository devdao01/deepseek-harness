# Plugin và vòng đời

[English](index.md) | 中文

Trang này giới thiệu mô hình plugin Cordis và máy trạng thái vòng đời.

## Máy trạng thái Fiber

Mỗi plugin đã được nạp sở hữu một phạm vi **Fiber**, với các trạng thái sau:

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| Trạng thái | Ý nghĩa |
|------|------|
| PENDING | Đã khai báo, nhưng dependency cần thiết chưa sẵn sàng |
| LOADING | Dependency đã sẵn sàng, đang thực thi `apply` |
| ACTIVE | Plugin đang chạy |
| FAILED | `apply` ném ra exception |
| UNLOADING | Plugin đang được gỡ và giải phóng tài nguyên |
| DISPOSED | Đã gỡ hoàn toàn |

## Nạp theo dependency

Plugin khai báo `inject` sẽ chờ mọi dịch vụ cần thiết sẵn sàng:

```ts ignore-check
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}
```

Nếu dịch vụ phụ thuộc biến mất (ví dụ khi nhà cung cấp bị thay thế), plugin sẽ tự động bị gỡ (ACTIVE → DISPOSED), và nạp lại sau khi dịch vụ khôi phục.

## Cơ chế tự động dọn dẹp

Bất kỳ đăng ký nào thực hiện qua `ctx` đều sẽ tự động bị hủy khi plugin được gỡ:

```ts ignore-check
export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}
```

Các thao tác sau đều được tự động theo dõi và dọn dẹp:
- `ctx.on(event, handler)` — lắng nghe sự kiện
- `ctx.tools.register(tool)` — đăng ký công cụ
- `ctx.llm.registerAdapter(names, adapter)` — đăng ký adapter LLM (mô hình ngôn ngữ lớn)
- `ctx.effect(() => cleanup)` — tài nguyên tùy chỉnh

Khi plugin bị gỡ, các disposer bắt đầu được gọi theo thứ tự ngược với thứ tự đăng ký, nhưng nhiều disposer bất đồng bộ sẽ chạy song song, không đảm bảo hoàn thành lần lượt. Các bước dọn dẹp có phụ thuộc thứ tự bắt buộc phải nằm trong cùng một disposer trả về từ một `ctx.effect()`, do disposer đó chịu trách nhiệm chờ tuần tự.

## Context lồng nhau

`ctx.plugin()` tạo một Fiber con, kế thừa context cha nhưng có vòng đời độc lập:

```ts ignore-check
export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}
```

## Ngữ nghĩa dispose (giải phóng tài nguyên)

Khi bạn cần chấm dứt sớm một instance plugin:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()
```

`dispose` đảm bảo:
1. Mọi đăng ký thuộc sở hữu của plugin đó đều bị gỡ bỏ
2. Plugin con của nó cũng bị gỡ theo cách đệ quy
3. Promise trả về sẽ resolve sau khi mọi thao tác dọn dẹp bất đồng bộ hoàn tất

## HMR (Hot Module Replacement)

Sau khi nạp `@deepseek-ai/cordis-plugin-hmr` qua `cordis.yml`, sửa file mã nguồn plugin sẽ kích hoạt:

1. Gỡ plugin cũ (dọn dẹp mọi đăng ký)
2. Nạp lại mã mới
3. Thực thi `apply` mới

Vì đăng ký của plugin sẽ tự động được dọn dẹp, hot-replace không giữ lại đăng ký của instance cũ.

## Ví dụ vòng đời

```ts ignore-check
export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}
```

Output khi nạp:
```
plugin loading
effect registered
```

Output khi gỡ:
```
effect cleaned up
```

## Bước tiếp theo

- [Dịch vụ và phụ thuộc](./service.md) — để plugin cung cấp năng lực cho plugin khác
- [Hệ thống sự kiện](./events.md) — giao tiếp giữa các plugin
- [Hướng dẫn framework Cordis](../../../cordis-tutorial/index.md) — xây dựng từng bước cùng một bộ vòng đời, dịch vụ và sự kiện này trên chính runtime Cordis
