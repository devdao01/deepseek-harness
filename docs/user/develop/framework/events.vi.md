# Hệ thống sự kiện

[English](events.md) | 中文

Sự kiện là cơ chế cốt lõi để các plugin Cordis giao tiếp với nhau. Harness dùng sự kiện rộng rãi để tạo ra các điểm mở rộng lỏng lẻo (loose-coupled).

## Cách dùng cơ bản

### Lắng nghe sự kiện

```ts ignore-check
ctx.on('event-name', (payload) => {
  // Handle the event.
})
```

### Kích hoạt sự kiện

```ts ignore-check
ctx.emit('event-name', payload)
```

## Các mô hình sự kiện

Cordis cung cấp nhiều mô hình sự kiện, áp dụng cho các hợp đồng tương tác khác nhau:

### emit — Phát quảng bá

Mọi listener chạy đồng bộ, giá trị trả về bị bỏ qua:

```ts ignore-check
// Emit
ctx.emit('my-plugin/ready', { id: 'worker-1' })

// Listen
ctx.on('my-plugin/ready', ({ id }) => {
  console.log(`${id} is ready`)
})
```

### bail — Ngắt mạch

Các listener chạy theo thứ tự, giá trị trả về đầu tiên không phải `null`, `false` hay `undefined` sẽ trở thành kết quả cuối cùng:

```ts ignore-check
// Dispatch
const result = ctx.bail('some-check', input)

// Listen: a returned value stops later listeners.
ctx.on('some-check', (input) => {
  if (shouldBlock(input)) return 'blocked'
  // Return null, false, or undefined to continue to the next listener.
})
```

### serial — Thực thi tuần tự

Các listener chạy lần lượt theo thứ tự đăng ký, và chờ kết quả bất đồng bộ; giá trị trả về đầu tiên không phải `null`, `false` hay `undefined` sẽ dừng các bước thực thi tiếp theo:

```ts ignore-check
await ctx.serial('setup-phase', context)
```

### waterfall (sự kiện thác nước) — Pipeline

Mỗi listener có thể bọc giá trị trả về từ downstream, tạo thành một chuỗi xử lý. **Bắt buộc phải gọi `next()`** để chuyển tiếp cho downstream, không gọi sẽ khiến pipeline bị ngắt mạch:

```ts ignore-check
// Dispatch
const output = await ctx.waterfall('my-plugin/transform', input, async () => input)

// Listen: next() is mandatory.
ctx.on('my-plugin/transform', async (_input, next) => {
  const downstream = await next()
  return downstream.trim()
})
```

::: warning
Listener waterfall **bắt buộc phải gọi `next()`**. Không gọi `next` sẽ ngắt mạch toàn bộ pipeline, đây là thiết kế có chủ đích — dùng để triển khai logic chặn/gateway.
:::

## Sự kiện an toàn kiểu (type-safe)

Harness dùng declaration merging của TypeScript để cung cấp tính an toàn kiểu cho sự kiện:

```ts
import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/check': (input: string) => boolean | undefined
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}

// ctx.on('my-plugin/ready', ...) and ctx.emit('my-plugin/ready', ...)
// are now inferred correctly.
```

## Sự kiện Cordis và bản ghi session

Sự kiện Cordis trong Harness tuân theo cách đặt tên `namespace/action`, ví dụ `agent/step`, `agent/request`, `agent/request-error`, `tools/result` và `session/event`. Chữ ký đầy đủ và mô hình kích hoạt xem tại khối `cordis-surface` được tự động sinh ra trên [trang subsystem](../../../subsystems/core.md).

`turn/*`, `step/*`, `tool/call`, `tool/result` và `compaction/*` là các loại sự kiện session được lưu bền vững, không phải sự kiện Cordis cùng tên. Khi cần quan sát chúng, hãy lắng nghe `session/event` và kiểm tra `event.type`.

## Listener sự kiện cũng là effect

Listener đăng ký qua `ctx.on()` sẽ tự động bị gỡ khi plugin bị gỡ bỏ:

```ts ignore-check
export function apply(ctx: Context) {
  // This listener is removed when the plugin disposes.
  ctx.on('tools/result', handler)
}
```

## Ví dụ: plugin ghi log

Plugin này ghi lại lệnh gọi công cụ và kết quả công cụ:

```ts
import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log(`[tool] ${exec.name}(${JSON.stringify(exec.arguments)})`)
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
    console.log(`[tool result] ${text.slice(0, 100)}`)
  })
}
```

## Bước tiếp theo

- [Phân lớp năng lực](../practice/) — tìm hiểu sự kiện trong giao diện năng lực
- [Adapter LLM (mô hình ngôn ngữ lớn)](../practice/llm-adapter.md) — triển khai một backend LLM hoàn chỉnh
