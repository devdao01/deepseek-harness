# 1. Viết plugin đầu tiên

[English](01-first-plugin.md) | 中文

Trong cấu hình loader được dùng ở tutorial này, module plugin Cordis cung cấp hàm `apply` thông qua named export. Khi Cordis nạp module, nó sẽ gọi `apply` với một **context**; context đó chính là object `ctx`, thông qua đó plugin đăng ký mọi thứ mà nó đóng góp.

## Viết plugin

Trong thư mục `tmp/cordis-tutorial` (xem [thiết lập môi trường](index.md#setup)), tạo file `hello.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

Mục export `name` là metadata hiển thị tùy chọn; nó được dùng để định danh plugin trong thông tin chẩn đoán.

## Lắp ráp ứng dụng

Bộ khởi chạy (launcher) của tutorial này lắp ráp ứng dụng thông qua cấu hình. Tạo file `cordis.yml`:

```yaml
- name: './hello.ts'
```

File này là một danh sách các mục cấu hình Cordis. `name` là bộ định danh module (module specifier), có thể là đường dẫn tương đối hoặc tên package NPM; loader sẽ mount từng mục. Các mục khởi động song song, do đó vị trí của chúng trong danh sách không đảm bảo thứ tự nạp plugin; thứ tự được quyết định bởi phụ thuộc dịch vụ (`inject`, xem [Chương 3](03-services.md)), chứ không phải vị trí trong file.

## Chạy

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Đầu ra mong đợi:

```
hello from my first plugin
```

Khi không còn gì tiếp tục chạy, tiến trình sẽ tự thoát. Quá trình cụ thể như sau:

1. Bộ khởi chạy tạo `Context` gốc, và mount plugin **Loader**.
2. Loader đọc `cordis.yml`, phân giải `./hello.ts`, rồi mount nó như một plugin con.
3. Cordis gọi `apply(ctx)` của bạn.

File của bạn không chứa code khởi động framework nào cả: plugin tự mô tả đóng góp của chính mình, còn `cordis.yml` thì lắp ráp ứng dụng. Ví dụ, [`dsh` base](../../packages/bundle/base/cordis.patch.yml) chính là một tổ hợp plugin dài hơn nhiều, được các overlay triển khai vá lại (patch).

## Hai hình thái plugin còn lại

Hàm (function) là hình thái phổ biến nhất, nhưng Cordis chấp nhận ba hình thái:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. Function plugin (what you just wrote).
export function apply(ctx: Context) {}

// 2. Object plugin: an object with an `apply` method.
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. Class plugin: a Service subclass (covered in chapter 3).
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}
```

Trước khi bạn cần công bố (expose) một dịch vụ, hãy luôn dùng hình thái hàm; [Chương 3](03-services.md) sẽ giới thiệu khi nào nên dùng hình thái lớp (class).

## Thử tạo lỗi

Cho `apply` ném ngoại lệ:

```ts ignore-check
export function apply(ctx: Context) {
  throw new Error('apply exploded')
}
```

Chạy lại: tiến trình sẽ kết thúc vì lỗi đó. Việc nạp plugin thất bại sẽ báo lỗi rõ ràng, không chỉ đơn thuần bỏ qua mục cấu hình đó.

Còn một ngoại lệ cần biết sớm: nếu module của một mục cấu hình không thể **phân giải** được, ví dụ đường dẫn hoặc tên package viết sai, Cordis sẽ báo lỗi thông qua dịch vụ logger, chứ không làm sập tiến trình. Trong giai đoạn khởi động, thông báo này có thể bị mất trước khi bộ xuất (exporter) console bắt đầu quan sát. Nếu mục cấu hình mới thêm vào có vẻ như không có tác dụng gì, hãy kiểm tra chính tả trước.

Chương tiếp theo: [Vòng đời và effect](02-lifecycle-and-effects.md): điều gì xảy ra khi plugin được gỡ bỏ (unload).

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
