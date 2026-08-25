# Thiết kế ba vai trò của năng lực

[English](index.md) | 中文

Bài viết này gồm hai phần: đầu tiên tham khảo khái niệm về mô hình năng lực ba vai trò, sau đó qua một hướng dẫn nâng cao để xây dựng một năng lực. Hãy hoàn tất [đường dẫn plugin cơ bản](../basic/) và [hướng dẫn về dịch vụ](../framework/service.md) trước.

## Tham khảo khái niệm

Khi một năng lực đủ tổng quát để cần hỗ trợ nhà cung cấp có thể thay thế (ví dụ thực thi Bash), harness sẽ phân biệt ba vai trò: **Service Definition**, **Service Provider** và **Consumer**. Khi các vai trò cần tiến hóa hoặc thay thế độc lập, hãy đặt chúng vào các gói khác nhau; nếu không, một gói có thể đảm nhận nhiều vai trò. Toàn bộ năng lực tạo thành seam của nó. Không một vai trò đơn lẻ nào là seam.

## Lấy Bash làm ví dụ

Lấy năng lực thực thi Bash làm ví dụ:

- **Service Definition** (`dsh-shell`): định nghĩa dịch vụ Cordis cùng các kiểu request và result cho Bash
- **Service Provider** (`dsh-bash-local`): thực thi lệnh trên máy cục bộ
- **Consumer** (`dsh-tool-bash`): công khai năng lực đó thành một công cụ model có thể gọi

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-shell   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│(definition) │     │    (provider)     │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']
```

## Lợi ích của việc tách

### Nhà cung cấp có thể thay thế

Cùng một Service Definition có thể có nhiều nhà cung cấp, chọn được qua `cordis.yml`:

```yaml
# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that provides the same service.
```

Khi đổi nhà cung cấp, Service Definition và công cụ vẫn giữ nguyên.

### Tiến hóa độc lập

- Sau khi bên gọi bắt đầu phụ thuộc vào quy ước của Service Definition, Service Definition hiếm khi thay đổi.
- Service Provider có thể tối ưu hiệu năng và bảo mật một cách độc lập.
- Consumer có thể điều chỉnh cách năng lực được trình bày cho model.

### Tách rời phụ thuộc

- Service Provider phụ thuộc vào Service Definition.
- Consumer phụ thuộc vào Service Definition.
- Service Provider và Consumer **không phụ thuộc lẫn nhau**.

Các nhóm tích hợp sẵn hiện có và liên kết gói của chúng thuộc sở hữu của [tài liệu tham khảo capability seam](../../../capability-seams.md).

## Hướng dẫn: phát triển năng lực ba vai trò

### Bước một: viết Service Definition

```ts ignore-check
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}
```

### Bước hai: viết Service Provider

```ts ignore-check
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Local provider behavior.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### Bước ba: viết Consumer

```ts ignore-check
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### Tổ hợp trong cordis.yml

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## Điểm chính khi thiết kế

- **Đừng tách trước khi cần**: chỉ dùng các gói khác nhau khi vai trò thật sự cần tiến hóa độc lập. Plugin công cụ đơn giản không cần tách.
- **Service Definition sở hữu kiểu Request/Result**: Service Provider và Consumer chỉ phụ thuộc vào gói Service Definition.
- **Rõ ràng hơn ngầm định**: việc triển khai nên xử lý giá trị mặc định qua bước `resolve(request): Spec` rõ ràng, thay vì ẩn `?? default` trong `run()`.

## Bước tiếp theo

- [Adapter LLM (mô hình ngôn ngữ lớn)](./llm-adapter.md): triển khai một nhà cung cấp LLM
