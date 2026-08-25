# 2. Vòng đời và effect

[English](02-lifecycle-and-effects.md) | 中文

Plugin Cordis có thể bị gỡ bỏ (unload) do thay đổi cấu hình, hot reload, giải phóng tài nguyên tường minh, hoặc dịch vụ cần thiết biến mất. Các đăng ký được thiết lập thông qua API của Cordis đều thuộc về effect, và sẽ bị hủy khi plugin sở hữu nó bị gỡ bỏ; tài nguyên được quản lý bên ngoài các API này phải được bọc trong `ctx.effect()`.

## Effect

Đối với tài nguyên mà Cordis chưa quản lý, ví dụ timer, connection hay watcher, hãy bọc nó trong `ctx.effect()` và trả về disposer (hàm giải phóng tài nguyên):

Tạo file `lifecycle.ts`, đặt nó trong `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

Cho `cordis.yml` trỏ tới file này:

```yaml
- name: './lifecycle.ts'
```

Sau khi chạy (`node --import tsx ../../vendor/cordis/bin.js`) bạn sẽ nhận được:

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

Hãy chú ý ba điểm:

- `ctx.plugin(heartbeat)` sẽ mount một hàm **từ code** làm plugin, tương tự như việc YAML loader thực hiện cho mỗi mục cấu hình. Plugin dạng hàm không cần phương thức `apply`: Cordis sẽ gọi trực tiếp hàm đó, tên của nó chỉ dùng để chẩn đoán. Chỉ hình thái object mới yêu cầu phương thức `apply`, ví dụ `ctx.plugin({ apply(ctx) { /* ... */ } })`. Lệnh gọi sẽ trả về một **fiber**, tức là một handle thời gian chạy (runtime handle) của một instance plugin đã được nạp.
- Phần thân của effect chạy trong giai đoạn nạp; disposer mà nó trả về chạy trong giai đoạn gỡ bỏ. Đối với tài nguyên có vòng đời trùng khớp với plugin, bạn không bao giờ cần tự gọi disposer.
- `fiber.dispose()` sẽ chờ toàn bộ công việc dọn dẹp của plugin đó (bao gồm cả disposer bất đồng bộ) hoàn tất mới kết thúc, và gỡ bỏ đệ quy toàn bộ plugin con mà nó đã mount.

## Máy trạng thái Fiber

Mỗi instance plugin đã nạp đều sở hữu một fiber, và chuyển đổi giữa các trạng thái sau:

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING**: đã được khai báo, nhưng dịch vụ cần thiết (Chương 3) chưa sẵn sàng.
- **LOADING / ACTIVE**: `apply` đang chạy／đã hoàn tất.
- **FAILED**: `apply` hoặc việc xác thực cấu hình ném ra ngoại lệ.
- **UNLOADING / DISPOSED**: disposer đang chạy／mọi thứ đã được tháo dỡ hoàn toàn.

Bạn sẽ gặp lại PENDING ở [Chương 6](06-composition-and-hmr.md), nó thường chính là câu trả lời cho câu hỏi "tại sao plugin của tôi không xuất ra gì".

## Những thao tác vốn đã là effect

Bạn hiếm khi cần tự viết `ctx.effect()`, vì bản thân các API đăng ký tích hợp sẵn đã là effect:

- `ctx.on(event, listener)`: listener sẽ bị gỡ bỏ khi unload ([Chương 4](04-events.md)).
- `ctx.plugin(child)`: plugin con sẽ được dispose (giải phóng tài nguyên) cùng với plugin cha.
- Đăng ký dịch vụ thuộc về effect. Các registry của harness như `ctx.tools.register(...)` cũng gắn disposer được trả về vào plugin gọi nó, do đó sẽ tự động bị hủy ([Chương 7](07-into-the-harness.md)).

Đối với tài nguyên mà Cordis không quản lý, hãy lấy nó bên trong `ctx.effect()`, và trả về disposer dùng để giải phóng tài nguyên. Sau đó Cordis sẽ gọi logic giải phóng đó trong giai đoạn gỡ bỏ, kể cả khi hot reload cũng không ngoại lệ.

Có một lưu ý về thứ tự: các disposer sẽ khởi động theo thứ tự ngược lại với thứ tự đăng ký, nhưng nhiều disposer **bất đồng bộ** sẽ chạy song song. Nếu các bước tháo dỡ bắt buộc phải thực hiện theo thứ tự, hãy đặt chúng trong cùng một disposer, và chờ từng bước hoàn tất tuần tự bên trong đó.

Chương tiếp theo: [Dịch vụ](03-services.md): plugin chia sẻ chức năng như thế nào.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
