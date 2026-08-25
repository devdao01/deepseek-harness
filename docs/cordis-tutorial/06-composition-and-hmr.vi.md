# 6. Kết hợp và HMR (thay thế module nóng)

[English](06-composition-and-hmr.md) | Tiếng Việt

Mọi năng lực đã xây dựng đến giờ đều là plugin, còn `cordis.yml` thì chọn cây plugin của ứng dụng. Chương này sẽ thay đổi cách kết hợp đó, nạp nóng một plugin và chẩn đoán plugin mãi không nạp được.

## Mục cấu hình Cordis không chỉ có tên

Ngoài `name` và `config`, mục cấu hình Cordis còn nhận thêm metadata khác:

```yaml
- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it
```

`id` cung cấp cho mục cấu hình Cordis một danh tính ổn định, giúp loader phân biệt được việc sửa một mục cấu hình Cordis hiện có với việc xóa đi rồi thêm lại. `disabled: true` sẽ tháo plugin mà không xóa mục cấu hình Cordis của nó; sau khi đổi lại giá trị ban đầu, plugin cùng mọi plugin đang ở trạng thái PENDING vì phụ thuộc service của nó sẽ được nạp lại.

Group có thể lồng một danh sách con các mục cấu hình Cordis và nạp hay tháo cả nhóm như một đơn vị; còn `isolate` thì cấp cho một group một thực thể riêng của một tên service nào đó, nhờ vậy hai group có thể thấy các provider `shell` được cấu hình khác nhau mà không ảnh hưởng lẫn nhau. [Nhập môn Cordis](../cordis-primer.md) và [ví dụ cô lập service](../user/develop/framework/service.md#service-isolation) trình bày chi tiết.

## Thay thế module nóng

Việc tháo sẽ giải phóng các effect ([chương 2](02-lifecycle-and-effects.md)), còn việc nạp thì tuân theo quan hệ phụ thuộc ([chương 3](03-services.md)), nên HMR có thể tháo trước rồi nạp sau để thay thế plugin đang chạy. Plugin `@deepseek-ai/cordis-plugin-hmr` sẽ theo dõi tệp và thực hiện quá trình này khi bạn lưu.

Viết `cordis.yml` trong `tmp/cordis-tutorial`:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

Danh sách có thêm hai plugin phụ trợ: HMR ghi log thông qua service logger của Cordis, nên không có bộ xuất ra console thì không thấy được thông điệp của nó; nó còn `inject` service `timer` để chống dội (debounce), và nếu không có `@deepseek-ai/cordis-plugin-timer` thì nó sẽ mắc kẹt mãi ở PENDING mà không phát ra bất kỳ dấu hiệu nào. Phần tiếp theo sẽ bàn về trạng thái im lặng này.

HMR đọc phần nội bộ loader của Node thông qua công cụ phụ trợ nguyên bản của Loader. Hãy chạy Cordis dưới tsx:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Bây giờ sửa `hello.ts`, đổi thông điệp log rồi lưu lại:

```
hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

Thực thể cũ được tháo trước (mọi effect của nó đều được cuộn ngược), rồi mã mới được nạp và `apply` chạy lại. Nhấn Ctrl-C để dừng tiến trình. Sửa chính `cordis.yml` cũng kích hoạt cập nhật: loader so sánh các mục cấu hình Cordis theo `id`, chỉ mount, tháo hoặc cấu hình lại phần đã thay đổi. Đó là lý do các mục cấu hình Cordis ở trên mang `id` một cách tường minh: mục cấu hình Cordis không có trường này sẽ nhận một id sinh mới ở mỗi lần đọc, nên chỉ cần tệp cấu hình có bất kỳ chỉnh sửa nào, dù văn bản của chính nó không đổi, nó vẫn bị xem là xóa đi rồi thêm lại và được mount lại.

## Chẩn đoán plugin mãi không nạp được

Việc nạp theo phụ thuộc cũng có mặt trái: nếu `inject` của plugin chỉ định một service không ai cung cấp, nó sẽ chờ mãi và không xuất ra gì cả. Đây không phải lỗi, vì PENDING là trạng thái hợp lệ, provider có thể mount muộn hơn.

Bạn có thể xem trực tiếp những trạng thái này. Mọi context đều liệt kê được registry plugin; hãy tạo `diagnose.ts`:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

Rồi tạo thêm một plugin có phụ thuộc không thể thỏa mãn, `needs-timer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

Chạy nó (thực thi trực tiếp `node --import tsx ../../vendor/cordis/bin.js`, nhấn Ctrl-C để dừng):

```
needs-timer is PENDING — a required service is missing
```

`inject: ['timer']` không có provider. Sau khi thêm `- name: '@deepseek-ai/cordis-plugin-timer'` vào danh sách, plugin sẽ nạp được. Nếu một plugin không thực hiện thao tác nào mà cũng không báo cáo gì, hãy kiểm tra trạng thái fiber của nó. Khi duyệt mà không lọc theo PENDING, bạn còn thấy chính các plugin của loader (Loader, Include) đang ở trạng thái ACTIVE, vì bản thân tệp cấu hình cũng được mount thông qua plugin.

Chương tiếp theo: [Bước vào harness](07-into-the-harness.md): áp dụng cùng những mô thức đó cho các service thật của harness.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
