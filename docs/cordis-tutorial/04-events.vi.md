# 4. Sự kiện

[English](04-events.md) | Tiếng Việt

Service hỗ trợ gọi trực tiếp; **sự kiện** cho phép plugin phát thông báo mà không cần biết có những plugin nào đang lắng nghe. harness dùng sự kiện để xử lý các tương tác như kết quả tool, request tới model và quyết định phê duyệt.

## Khai báo, phát và lắng nghe

Tạo `stats.ts` và đặt nó trong `tmp/cordis-tutorial`. Đây là một service chịu trách nhiệm đếm và phát thông báo mỗi khi có thay đổi:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}
```

Phép hợp nhất `interface Events` và phép hợp nhất `interface Context` ở chương 3 tương ứng với nhau trong hệ thống sự kiện: nó khai báo tên sự kiện cùng chữ ký listener của sự kiện đó, nhờ vậy cả `ctx.emit` lẫn `ctx.on` đều có kiểu đầy đủ. Quy ước đặt tên `namespace/action` giúp không gian tên sự kiện phẳng vẫn dễ đọc.

Tạo `reporter.ts`:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
```

Dòng `import type {} from './stats.ts'` không import bất kỳ thứ gì lúc chạy; tác dụng của nó là để TypeScript thấy được phép hợp nhất khai báo. Kết hợp lại rồi chạy:

```yaml
- name: './stats.ts'
- name: './reporter.ts'
```

```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

Vì `ctx.on()` là một effect, listener sẽ biến mất cùng với plugin, hoàn toàn không cần tự tay duy trì `removeListener`.

## Các chế độ phân phát

`emit` là một trong 5 chế độ phân phát. Việc một sự kiện dùng chế độ nào là một phần trong hợp đồng của nó, quyết định listener có được trả về giá trị hay không, có chạy đồng thời hay không, và có thể short-circuit lẫn nhau hay không:

| Chế độ | Cách gọi | Ngữ nghĩa |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | Phát quảng bá đồng bộ; không chờ và không thu thập các promise hay giá trị trả về. |
| parallel | `await ctx.parallel(name, ...args)` | Mọi listener chạy đồng thời và được chờ cùng nhau. |
| serial | `await ctx.serial(name, ...args)` | Listener chạy tuần tự và được chờ; giá trị trả về đầu tiên khác `null`/`false`/`undefined` sẽ thắng và dừng các listener phía sau. |
| bail | `ctx.bail(name, ...args)` | Phiên bản đồng bộ của serial. |
| waterfall (sự kiện kiểu thác nước) | `ctx.waterfall(name, ...args, next)` | Middleware bao quanh, xem bên dưới. |

Mỗi sự kiện của harness đều ghi lại chế độ của mình trong tài liệu tham khảo sinh tự động ở [trang subsystem](../subsystems/core.md) tương ứng.

## waterfall: biến đổi hoặc short-circuit

waterfall là chế độ dùng để hiện thực việc chặn (intercept). Mỗi listener nhận các tham số và một continuation `next()`; nó có thể biến đổi giá trị trả về của `next()`, hoặc trả về ngay mà không gọi `next()` để short-circuit phần còn lại của chuỗi. Tài liệu Cordis gọi hành vi thứ hai là phủ quyết. Tạo `waterfall-demo.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
```

Cho `cordis.yml` chỉ trỏ tới tệp này rồi chạy:

```
HELLO
** BLOCKED **
```

Hãy lần theo thứ tự để thấy dòng thứ hai được tạo ra thế nào: listener 1 chạy trước và gọi `next()`, qua đó gọi listener 2; listener 2 thấy `blocked` nên trả về ngay mà không gọi `next()`, vì vậy logic mặc định trong cùng (hàm truyền cho `ctx.waterfall`) không bao giờ chạy; trên đường trả về, listener 1 lại biến đổi thông điệp thay thế thành chữ in hoa.

Từ đó rút ra một kỷ luật: **listener waterfall chỉ quan sát hoặc chú giải thì bắt buộc phải gọi `next()`**; trả về mà không gọi nghĩa là cố ý short-circuit. Nếu một listener ghi log quên gọi `next()`, nó sẽ âm thầm nuốt mất toàn bộ hành vi mặc định phía dưới. Đây là quy tắc thường trực của repo này ([ngữ nghĩa waterfall](../cordis-primer.md#cordis-waterfall-semantics)).

harness dùng waterfall cho những quyết định mà các plugin cộng tác có thể bao bọc hoặc trả lời: [`agent/request`](../subsystems/core.md#agentrequest--waterfall) cho phép plugin thay thế cấu hình lời gọi model, [`approval/request`](../subsystems/approval.md#approvalrequest--waterfall) cho phép chính sách trả lời thay cho người dùng.

Chương tiếp theo: [Cấu hình](05-config.md): các tùy chọn plugin đến từ `cordis.yml`.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
