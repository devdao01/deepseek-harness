# 5. Cấu hình

[English](05-config.md) | Tiếng Việt

Mỗi mục cấu hình Cordis trong `cordis.yml` đều có thể mang một khối `config`, còn plugin thì khai báo một schema để kiểm tra khối đó trước khi chạy `apply`. Cấu hình sai sẽ khiến việc nạp thất bại và đưa ra lỗi chính xác: plugin không bao giờ khởi động khi cấu hình chưa đầy đủ.

## Plugin có thể cấu hình

Tạo `config-demo.ts` và đặt nó trong `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

`Config` được export vừa là interface TypeScript, vừa là schema lúc chạy cùng tên: bên tiêu thụ nhận được kiểu, còn Cordis nhận được bộ kiểm tra. Repo này dùng [Schemastery](https://github.com/shigma/schemastery) để định nghĩa schema; bản thân Cordis chấp nhận mọi bộ kiểm tra [Standard Schema](https://standardschema.dev/), do đó export một object thuần làm `Config` sẽ không hoạt động.

Cấu hình cho nó:

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

Chạy:

```
Hello, alpha!
Hello, beta!
```

Không cung cấp `greeting`, nên giá trị mặc định của schema sẽ bù vào: `apply` luôn nhận được cấu hình đầy đủ và đã được kiểm tra.

## Báo lỗi rõ ràng

Bây giờ hãy truyền cho nó nội dung không hợp lệ:

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

Fiber của plugin chuyển sang trạng thái FAILED, và bộ khởi động của hướng dẫn này in lỗi rồi thoát với mã trạng thái 1. Nếu cấu hình của một plugin vượt qua kiểm tra schema nhưng tài nguyên hay nhà cung cấp được chỉ định trong đó không khả dụng, plugin ấy cũng phải từ chối ngay tại thời điểm sớm nhất có thể phân giải tham chiếu đó.

## Giá trị cấu hình được tính toán

Loader mà repo này dùng hỗ trợ thẻ `!!js` dành cho các giá trị cấu hình buộc phải tính lúc nạp:

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js` chỉ có hiệu lực bên trong `config` và trường `disabled` của mục cấu hình. `disabled: !!js ...` được ước lượng theo ngữ cảnh loader ở mỗi lần quyết định mount (phần mở rộng của repo này), cho phép chặn một dòng theo nền tảng hoặc môi trường; phần metadata còn lại (`name`, `id`, `inject`, ...) giữ nguyên tính tĩnh, và biểu thức trong đó chỉ là dữ liệu chân trị thông thường. Xem chi tiết tại [cấu hình loader](../cordis-primer.md#loader-configuration).

Chương tiếp theo: [Kết hợp và HMR (thay thế module nóng)](06-composition-and-hmr.md): xem `cordis.yml` như một ứng dụng.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
