# Dịch vụ và phụ thuộc

[English](service.md) | 中文

Dịch vụ (service) là một năng lực mà một plugin công khai cho các plugin khác. inject khai báo plugin cần những dịch vụ nào.

## Dịch vụ là gì

Trong Harness, `tools`, `llm`, `agents` đều là dịch vụ. Dịch vụ là năng lực có tên, gắn trên `ctx`:

```ts ignore-check
ctx.tools    // ToolRuntime service
ctx.llm      // LLM service
ctx.agents   // Agent service
```

Bất kỳ plugin nào cũng có thể cung cấp dịch vụ, để plugin khác sử dụng.

## Sử dụng dịch vụ

Khai báo `inject` để dùng một dịch vụ đã có:

```ts ignore-check
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools exists and is ready here.
  ctx.tools.register(/* ... */)
}
```

Framework đảm bảo: khi `apply` thực thi, mọi dịch vụ khai báo trong `inject` đều đã sẵn sàng. Nếu dịch vụ chưa sẵn sàng, plugin của bạn sẽ chờ, không thực thi.

## Cung cấp dịch vụ

### Dùng lớp cơ sở Service

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']  // A service may depend on other services.

  constructor(ctx: Context) {
    super(ctx, 'metrics')  // 'metrics' is the service name.
  }

  // Public service method.
  record(event: string, value: number) {
    // ...
  }
}
```

Sau khi nạp plugin này, bên tiêu thụ có thể truy cập nó qua `ctx.metrics`:

```ts ignore-check
export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('tool_call', 1)
}
```

### Khai báo kiểu

Dùng declaration merging của TypeScript để `ctx.metrics` có kiểu chính xác:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    metrics: MetricsService
  }
}

export default class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(event: string, value: number) { /* ... */ }
}
```

## Hành vi của dependency

### Dependency bắt buộc và tùy chọn

```ts ignore-check
// Required: the plugin does not load while the service is absent.
export const inject = ['tools']

// Optional: omit inject and query with ctx.get() at the use site.
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('plugin_loaded', 1)
}
```

### Hành vi khi dịch vụ biến mất

Nếu một dịch vụ bắt buộc biến mất trong lúc ứng dụng đang chạy (ví dụ nhà cung cấp của nó bị gỡ):

1. Plugin phụ thuộc vào nó sẽ tự động dispose (giải phóng tài nguyên)
2. Khi dịch vụ xuất hiện trở lại, plugin sẽ tự động nạp lại

Điều này ngăn plugin gọi vào một dịch vụ không còn tồn tại.

<a id="service-isolation"></a>

## Cách ly dịch vụ

`cordis.yml` hỗ trợ cách ly dịch vụ — cùng một dịch vụ có thể có nhiều instance, các nhóm plugin khác nhau nhìn thấy instance khác nhau:

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 60000
    - name: './src/plugin-b.ts'
```

`plugin-a` và `plugin-b` mỗi cái chỉ thấy instance Bash trong nhóm của chính mình, không ảnh hưởng lẫn nhau.

## Dịch vụ tích hợp sẵn của Harness

Tên dịch vụ, phương thức công khai và vị trí mã nguồn được repo tự động sinh vào [trang subsystem](../../../subsystems/core.md) của từng dịch vụ. Khi phát triển plugin, hãy lấy các khối được sinh tự động này và interface TypeScript của dịch vụ làm chuẩn, đừng duy trì một danh sách tĩnh khác.

## Bước tiếp theo

- [Hệ thống sự kiện](./events.md) — giao tiếp lỏng lẻo giữa các plugin
- [Phân lớp năng lực](../practice/) — dùng dịch vụ như giao diện năng lực
