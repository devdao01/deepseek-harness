# 7. Bước vào harness

[English](07-into-the-harness.md) | Tiếng Việt

Chương này sẽ đăng ký vào service `tools` của harness một tool mà model có thể gọi, thực thi nó qua đường ống tool của harness và quan sát sự kiện kết quả. Toàn bộ ví dụ không cần khóa và cũng không gọi model.

## Plugin tool

Tạo `greet-tool.ts` và đặt nó trong `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. CallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: CallId('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
```

Mỗi mô thức ở đây đều đến từ các chương trước: `inject: ['tools']` ([chương 3](03-services.md)) khiến plugin chờ registry tool sẵn sàng; `ctx.tools.register(...)` gắn disposer đăng ký vào plugin ([chương 2](02-lifecycle-and-effects.md)), nên khi tháo plugin thì tool cũng được hủy đăng ký. `defineTool` chuyển đặc tả `parameters` thành JSON Schema trình cho model, suy ra kiểu của `args`, và kiểm tra tham số do model cung cấp trước khi `execute` chạy. Tool trả về giá trị chuẩn tắc được khai báo bởi `output.schema`; còn `output.render` đóng vai trò Native renderer (bộ kết xuất nguyên bản), sinh riêng phần nội dung kết quả có thể lưu bền.

## Plugin quan sát

Tạo `tool-logger.ts`. Đây là một plugin độc lập, quan sát mọi lời gọi tool trong ứng dụng thông qua sự kiện `tools/result` của harness:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

Dòng `import type {} from '@deepseek-ai/dsh-tools'` kéo vào phép hợp nhất khai báo của package đó, giúp `'tools/result'` cùng payload của nó có kiểu. Cách làm này giống hệt việc import `stats.ts` ở chương 4, chỉ mở rộng lên mức package.

## Kết hợp và chạy

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

`@deepseek-ai/dsh-tools` sẽ inject service `systemPrompt`, vì tool cần đóng góp schema vào system prompt, nên trong phần kết hợp cũng phải liệt kê provider của service đó. Khi thiếu provider, plugin tool sẽ ở trạng thái PENDING đúng như [chương 6](06-composition-and-hmr.md) mô tả.

```sh
node --import tsx ../../vendor/cordis/bin.js
```

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

logger sẽ kích hoạt trước: `tools/result` được phát trong quá trình vật chất hóa kết quả, trước khi promise mà `execute` trả về cho bên gọi được tuân thành. Cả hai plugin đều không biết plugin kia tồn tại, chúng được nối với nhau bởi service registry và sự kiện.

## Từ đây đi tới một agent (tác tử) hoàn chỉnh

Một agent thật chính là bộ kết hợp này cộng thêm nhiều plugin nữa: bộ chuyển tiếp LLM (mô hình ngôn ngữ lớn), agent loop (vòng lặp tác tử), phần lưu bền và điểm vào để chạy. Đối chiếu với [examples/headless-agent/cordis.yml](../../examples/headless-agent/cordis.yml), giờ đây bạn đã có thể đọc hiểu từng mục cấu hình trong đó. Chỉ cần thêm `greet-tool.ts` vào một bản sao của tệp ấy.

Có thể đọc tiếp:

- [Xây dựng tool](../user/develop/basic/tool.md): tìm hiểu sâu về `defineTool`, bao gồm cách trình bày và schema phong phú hơn.
- [Thiết kế năng lực ba tầng](../user/develop/practice/index.md): harness tổ chức các năng lực có thể thay thế như thế nào.
- Khối `cordis-surface` được sinh ra trên [trang subsystem](../subsystems/core.md): mọi thứ có thể inject và lắng nghe, mỗi thứ nằm trên trang tương ứng của nó.
- [Kiến trúc](../architecture.md): bản đồ hệ thống mà các plugin này nằm trong đó.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
