# Phát triển một công cụ

[English](tool.md) | 中文

Hướng dẫn này sẽ thêm một công cụ `greet` vào Web UI. Hãy hoàn tất [Plugin đầu tiên](./) trước, và giữ lại thư mục `scratch-plugin` từ đó.

## Tạo plugin công cụ

Thay thế `scratch-plugin/src/my-plugin.ts` bằng:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`inject` khiến Cordis chờ registry công cụ sẵn sàng. `defineTool` suy luận và xác thực `args` dựa trên `parameters`; `execute` trả về giá trị chuẩn (canonical value) mà `output.schema` khai báo, `output.render` sau đó chuyển giá trị đó thành nội dung hướng tới model.

## Chạy và gọi công cụ

Nếu lệnh phát triển chưa chạy, hãy khởi động lại:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

Mở `http://127.0.0.1:3080`, rồi nhập: `Use the greet tool to greet Ada.` Model có thể gọi `greet`, và nhận được kết quả công cụ `Hello, Ada!`.

## Bước tiếp theo

- [Cấu hình plugin](./config.md) — làm cho lời chào có thể cấu hình.
- [Tài liệu tham khảo viết công cụ](../../../cookbook/adding-a-tool.md) — tìm hiểu schema lồng nhau, giá trị chuẩn, công việc nền, hook chính sách, Code Mode và thẻ UI.
- [Phân lớp năng lực](../practice/) — tách năng lực có thể thay thế thành ba loại gói Service Definition, Service Provider và Consumer.
