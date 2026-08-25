# Tutorial Cordis

[English](index.md) | 中文

Cordis là framework plugin nằm bên dưới DeepSeek Harness: đó là một runtime nhỏ gọn, trong đó mọi năng lực — bao gồm công cụ (tool), adapter LLM (mô hình ngôn ngữ lớn), truy cập file, thậm chí cả agent loop (vòng lặp tác nhân) — đều là các plugin được mount vào một context dùng chung. Tutorial này giảng giải Cordis theo cách thực hành: mỗi chương là một ví dụ có thể chạy được, bạn sẽ từng bước xây dựng nó trong một thư mục tạm bên trong repo này, và cuối cùng kết nối một plugin vào dịch vụ harness thật.

Tutorial này hướng đến các nhà phát triển agent. Bạn không cần nắm vững TypeScript ở mức sâu; phần [Ghi chú về TypeScript](#typescript-notes) bên dưới sẽ giải thích những cú pháp có thể còn xa lạ, và mỗi chương đều đưa ra lệnh chính xác cùng đầu ra mong đợi.

Nếu bạn muốn đọc tài liệu tham khảo khái niệm rút gọn, thay vì thực hành từng bước, hãy xem [Nhập môn Cordis](../cordis-primer.md). Tài liệu tham khảo API chi tiết xem tại khối `cordis-surface` được sinh ra trên [trang subsystem](../subsystems/core.md), cùng trang [Cordis Core API](../cordis-api/context.md).

Nếu bạn muốn viết plugin cho chính harness — được `cordis.yml` nạp, chạy trong Web UI, chứ không phải bộ khởi chạy (launcher) dưới đây — hãy bắt đầu từ [Plugin Harness đầu tiên](../user/develop/basic/index.md).

<a id="setup"></a>

## Chuẩn bị

Bạn cần clone repo này và cài đặt dependency; [hướng dẫn phát triển](../development.md#setup-tutorial) liệt kê các điều kiện tiên quyết. Tutorial này không cần API key; mọi ví dụ đều có thể chạy trong môi trường không có key.

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
```

Tạo thư mục tạm dùng cho các chương. `tmp/` đã bị git bỏ qua, do đó bất cứ thứ gì bạn ghi vào đó đều sẽ không vào version control:

```sh
mkdir -p tmp/cordis-tutorial
cd tmp/cordis-tutorial
```

Mỗi chương đều chạy cùng một lệnh từ thư mục này:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Bộ khởi chạy dạng file đơn này (xem [vendor/cordis/bin.js](../../vendor/cordis/bin.js)) sẽ tạo `Context` gốc, mount plugin Loader, và để nó nạp `./cordis.yml` từ thư mục hiện tại. Mọi thứ còn lại, bao gồm có những plugin nào và cấu hình chúng ra sao, đều đến từ file YAML mà bạn sẽ viết sau này. Cờ `--import tsx` cho phép Node chạy trực tiếp file TypeScript mà cấu hình trỏ tới, không cần bước build.

## Các chương

1. [Plugin đầu tiên của bạn](01-first-plugin.md): plugin là hàm, được loader mount.
2. [Vòng đời và effect](02-lifecycle-and-effects.md): các đăng ký do Cordis quản lý sẽ bị hủy khi plugin sở hữu chúng bị gỡ bỏ.
3. [Dịch vụ](03-services.md): công bố một năng lực trên `ctx`, và phụ thuộc vào nó thông qua `inject`.
4. [Sự kiện](04-events.md): sự kiện có kiểu, phân phối theo kiểu broadcast, và hành vi ngắt mạch (short-circuit) của waterfall (chuỗi sự kiện dạng thác nước).
5. [Cấu hình](05-config.md): đọc cấu hình đã được xác thực trong `cordis.yml`, và báo lỗi rõ ràng khi đầu vào sai.
6. [Lắp ráp và HMR (hot module replacement)](06-composition-and-hmr.md): coi file cấu hình như một cây plugin, dùng hot reload, và chẩn đoán plugin luôn không nạp được.
7. [Đi vào harness](07-into-the-harness.md): đăng ký một công cụ có thể gọi được bởi mô hình, dựa trên dịch vụ harness thật.

<a id="typescript-notes"></a>

## Ghi chú về TypeScript

Các ví dụ này dùng ba tính năng TypeScript nằm ngoài JavaScript hiện đại thông thường:

- **Chú thích kiểu (type annotation)** mô tả giá trị, nhưng không làm thay đổi hành vi tại thời gian chạy: `ctx: Context` nghĩa là `ctx` có API context của Cordis, `who: string` nhận văn bản, còn `string[]` biểu thị mảng chuỗi.
- **`import type { Context } from '@deepseek-ai/cordis'`** chỉ import thông tin kiểu. Nó biến mất tại thời gian chạy, do đó các file plugin chỉ dùng `Context` để chú thích kiểu sẽ không tăng thêm dependency thời gian chạy nào.
- **Gộp khai báo (declaration merging)** (`declare module '@deepseek-ai/cordis' { ... }`) sẽ thêm mục của bạn vào các interface mà Cordis đã khai báo sẵn, ví dụ kiểu của thuộc tính `ctx.greeter` mới hoặc tên sự kiện mới. Nó không sinh ra bất kỳ kết nối (wiring) thời gian chạy nào; plugin phải tự cung cấp dịch vụ hoặc phát sự kiện riêng. Chương 3 sẽ trình bày đầy đủ mẫu này.

Chương 5 còn dùng `interface` để mô tả các trường của object cấu hình, và dùng kiểu generic như `Schema<Config>` để biểu thị schema xác thực những trường nào của object. Bạn có thể sao chép trực tiếp các khai báo này; phần văn bản xung quanh sẽ giải thích mỗi khai báo kết nối tới đâu.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
