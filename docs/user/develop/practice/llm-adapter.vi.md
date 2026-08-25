# Adapter LLM

[English](llm-adapter.md) | 中文

Bài viết này giới thiệu cách tích hợp một nhà cung cấp model mới vào Harness.

## Tổng quan

Adapter LLM là một class kế thừa `LlmAdapter` và triển khai phương thức `stream()`, chuyển đổi request không phụ thuộc nhà cung cấp của Harness thành lệnh gọi API cụ thể của nhà cung cấp, và chuyển đổi ngược phản hồi thành các phân đoạn (chunk) của Harness.

## Triển khai tối giản

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. Convert options.messages to the provider format.
    // 2. Call the streaming API.
    // 3. Convert the response into StreamChunk values.
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

## Giao thức StreamChunk

`stream()` phải sinh ra các phân đoạn theo giao thức sau:

```ts
import { CallId, type StreamChunk } from '@deepseek-ai/dsh-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. Start each content block with block-start.
  yield { type: 'block-start', index: 0, blockType: 'text' }

  // 2. Stream text through text-delta.
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }

  // 3. End each content block with block-end and the complete block.
  yield {
    type: 'block-end',
    index: 0,
    block: { type: 'text', text: 'Hello world' },
  }

  // 4. Tool-call block.
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield {
    type: 'tool-call-delta',
    index: 1,
    id: CallId('call-123'),
    name: 'bash',
    argumentsDelta: '{"command":"ls"}',
  }
  yield {
    type: 'block-end',
    index: 1,
    block: {
      type: 'tool-call',
      id: CallId('call-123'),
      name: 'bash',
      arguments: '{"command":"ls"}',
    },
  }

  // 5. Token usage.
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }

  // 6. Finish reason.
  yield { type: 'finish', reason: { kind: 'stop' } }
  // Alternatively, { kind: 'tool-calls' } requests tool execution.
}
```

### Quy tắc quan trọng

- Mỗi `block-start` phải có một `block-end` tương ứng.
- `index` tăng dần từ 0, dùng để đánh dấu thứ tự các khối nội dung.
- `argumentsDelta` của `tool-call-delta` là phần tăng dần của văn bản JSON gốc, có thể sinh trọn vẹn trong một phân đoạn, hoặc chia thành nhiều phân đoạn.
- `finish` phải là phân đoạn cuối cùng.
- `usage` phải được sinh ra trước `finish`.

## GenerateOptions

`stream()` nhận `GenerateOptions` được export bởi repo. Nó chứa model, ID cường độ reasoning thuộc sở hữu của adapter, lịch sử hội thoại, prompt hệ thống, schema công cụ, tham số sinh, chuỗi dừng và tín hiệu hủy; đầy đủ các trường lấy kiểu TypeScript được export bởi `@deepseek-ai/dsh-llm` làm chuẩn. Adapter phải ánh xạ các trường được hỗ trợ vào API cụ thể; nếu không thể hỗ trợ một trường nào đó, phải ném `LlmError` kèm code ổn định, không được âm thầm bỏ qua.

Hãy ghi đè `resolveModel(provider, model, signal?)`, để trả về đúng danh tính nhà cung cấp/model trong một lần truy vấn, cùng metadata `context` và `reasoning` tùy chọn. Metadata reasoning gồm ID không minh bạch (opaque) có thứ tự, tên hiển thị, và giá trị cấu hình mặc định tùy chọn; hãy giữ nguyên danh sách tùy chọn có thẩm quyền mà adapter đưa ra, bao gồm cả `off` mà API năng lực thượng nguồn của nó trả về, đừng nâng các giá trị đó lên thành enum cốt lõi. Truy vấn bất đồng bộ phải phản hồi tín hiệu tùy chọn đó, để quá trình hủy và giải phóng tài nguyên hoàn toàn ổn định. Dịch vụ sẽ xác thực kết quả tổng hợp, và từ chối cường độ reasoning được chỉ định rõ ràng nhưng không được hỗ trợ trước khi gọi `stream()`; bỏ qua `reasoning` nghĩa là model đó không có năng lực cường độ reasoning tùy chọn.

## Đăng ký adapter

```ts ignore-check
ctx.llm.registerAdapter(['my-provider'], adapter)
```

Tham số đầu tiên là danh sách route nhà cung cấp mà adapter đó xử lý. `GenerateOptions.provider` chọn adapter đã đăng ký, `GenerateOptions.model` sau đó truyền vào model id thuộc sở hữu của adapter, không cần đăng ký lúc khởi động vòng đời. Khi adapter có thể công bố tùy chọn model cho bộ chọn, hãy ghi đè `listModels()`.

## Sử dụng trong cordis.yml

```yaml
- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider

- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1
```

## Tham khảo thực chiến

Repo chứa hai triển khai hoàn chỉnh sau:

- `packages/llm/llm-deepseek/` — adapter API DeepSeek (định dạng tương thích OpenAI)
- `packages/llm/llm-pi-ai/` — adapter Pi AI (định dạng API khác)

So sánh hai adapter đã bàn giao này cho thấy cùng một hợp đồng harness được triển khai như thế nào trên các SDK nhà cung cấp khác nhau.

## Xử lý lỗi

Adapter nên ném `LlmError` kèm code ổn định cho lỗi truyền tải và giao thức; agent loop (vòng lặp tác tử) sẽ giữ lại lỗi đó cùng code của nó để chẩn đoán và xử lý chính sách. Đừng dựa vào việc `Error` thông thường được tự động chuyển đổi. Mỗi request HTTP tới nhà cung cấp còn phải hợp nhất `attributionHeaders()`, và truyền `options.signal`.

```ts
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class HttpAdapter extends LlmAdapter {
  constructor(private readonly endpoint: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify({ model: options.model, messages: options.messages }),
      ...options.signal ? { signal: options.signal } : {},
    })
    if (!response.ok) {
      throw new LlmError(`Provider API error: ${response.status}`, 'PROVIDER_HTTP_ERROR')
    }
    // A real adapter parses the response and emits the complete chunk sequence.
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
```
