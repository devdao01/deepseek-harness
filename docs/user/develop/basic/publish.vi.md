# Đóng gói và cài đặt plugin

[English](publish.md) | 中文

Các hướng dẫn trước đã nạp plugin cục bộ qua overlay `--patch`. Hướng dẫn này sẽ đóng gói nó thành một **bundle** (gói tổ hợp) có thể cài đặt, cài vào một **profile** bằng `dsh plugin add`, và giải thích thứ tự các lớp quyết định cấu hình sau khi tổ hợp. Bài viết này giả định CLI `dsh` đã được cài đặt. Hãy hoàn tất [Cấu hình plugin](./config.md) trước.

Nếu dùng một checkout mã nguồn hoàn toàn mới, hãy chuẩn bị theo [phần chạy từ mã nguồn](../../../../README.md#run-from-source) trước, đặt thư mục `hello-plugin` của hướng dẫn này ở thư mục gốc repo, và từ thư mục đó đổi các lệnh `dsh ...` dưới đây thành `pnpm dsh ...`. Hành vi build và launcher xem tại [Thực thi từ mã nguồn](../../../../apps/cli/reference/README.md#source-execution).

## Hai khái niệm, hai loại manifest

Cơ chế cài đặt được xây dựng trên hai khái niệm. Cả hai đều được mô tả bởi một `package.json`, nhưng chúng mang loại manifest (danh sách siêu dữ liệu) khác nhau dưới khóa `dsh`, và trả lời câu hỏi khác nhau:

- **Bundle** là một gói npm kèm theo một lớp cấu hình. Manifest của nó khai báo `dsh.bundle`, trả lời câu hỏi "gói này đóng góp gì?": một file patch chèn hoặc ghi đè dòng plugin.
- **Profile** là một thư mục nằm dưới `$DSH_HOME/profiles/<name>`, mô tả một tổ hợp có thể khởi động. Manifest của nó khai báo `dsh.profile`, trả lời câu hỏi "cấu hình này gồm những bundle nào, theo thứ tự nào?".

Bundle là thứ bạn viết và phân phối; profile là thứ người dùng khởi động bằng `dsh --profile <name>`. Không có gì vừa là bundle vừa là profile cùng lúc.

### Manifest bundle

Tạo thư mục gói:

```sh
mkdir -p hello-plugin
```

```
hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

Tạo `hello-plugin/package.json`:

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

Tạo `hello-plugin/index.js`, viết entry point của plugin:

```js
export const name = 'hello-plugin'

export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}
```

Tạo `hello-plugin/cordis.patch.yml`. Patch này giống hệt overlay `--patch` đã viết từ đầu, là một mảng YAML các mục patch; điểm khác biệt là dòng plugin tham chiếu gói này theo tên gói thay vì đường dẫn mã nguồn tương đối, để cơ chế giải quyết module của Node có thể tìm thấy mã đã cài đặt:

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

Gói không khai báo `dsh.bundle` vẫn có thể cài đặt được, nhưng chỉ như một dependency thông thường: `dsh plugin` sẽ in cảnh báo, và không kích hoạt lớp nào. Nếu một thư viện được import bởi gói plugin, thay vì được người dùng bật, hãy dùng định dạng gói này.

### Manifest profile

Thư mục profile chứa hai file:

- `package.json` — các plugin dependency ngoài cây của profile (do pnpm quản lý), cùng manifest `dsh.profile` và danh sách `bundles` có thứ tự của nó.
- `cordis.patch.yml` — lớp patch của riêng người dùng, được áp dụng sau mỗi lớp bundle.

Manifest profile không bao giờ cần viết tay: `dsh plugin` chịu trách nhiệm tạo và duy trì nó. Phần sau sẽ cho thấy kết quả.

## Cài đặt vào profile

`dsh plugin --profile <name> <args...>` chuyển tiếp tới pnpm bên trong thư mục profile, nên mọi lệnh con pnpm đều dùng được. Cài đặt checkout của gói trong thư mục chứa `hello-plugin`:

```sh
dsh plugin --profile demo add ./hello-plugin
```

Lần đầu sử dụng sẽ khởi tạo profile (`@deepseek-ai/dsh-base` là bundle đầu tiên của nó), pnpm liên kết checkout đó, và `dsh` thêm gói vào `dsh.profile.bundles` vì gói này khai báo `dsh.bundle`:

```json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-hello-plugin": "link:/path/to/hello-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "dsh-hello-plugin"
      ]
    }
  }
}
```

Hãy chỉ xác thực lớp này trước khi khởi động, rồi mới khởi động:

```sh
dsh --profile demo --dump-config   # shows a "# == dsh-hello-plugin" layer
dsh --profile demo
```

`dsh plugin --profile demo remove dsh-hello-plugin` sẽ gỡ bỏ đồng thời dependency lẫn lớp tương ứng.

## Thứ tự nạp

Cấu hình có hiệu lực được tổ hợp theo từng lớp trên một gốc rỗng theo thứ tự sau:

1. Từng patch bundle được liệt kê trong danh sách `dsh.profile.bundles` của profile, theo thứ tự trong danh sách — đầu tiên là `@deepseek-ai/dsh-base`, sau đó là từng bundle đã cài đặt, theo thứ tự được thêm vào.
2. `cordis.patch.yml` của riêng profile.
3. `$DSH_HOME/cordis.patch.yml` cấp home — tùy chọn cục bộ trên máy, dùng chung cho các profile.
4. Từng overlay `--patch <path>`, theo thứ tự argv.

Tham số ứng dụng không phải là một lớp patch khác. Các bundle ở lớp trên có thể giải quyết chúng qua dịch vụ của riêng mình theo cách thông thường được mô tả bên dưới.

Lớp được áp dụng sau sẽ thắng theo từng dòng, và patch sẽ thay thế toàn bộ giá trị `config` của dòng mục tiêu, thay vì hợp nhất sâu từng khóa. Điều này dẫn đến hai hệ quả cho tác giả bundle:

- Patch của bạn có thể ghi đè các dòng của lớp trước theo `id` — giống cách [bundle `dsh-web-app`](../../../../packages/bundle/web-app/cordis.patch.yml) ghi đè dòng của `dsh-base` — nhưng phải viết lại đầy đủ mọi khóa mà dòng đó cần, không chỉ khóa bị thay đổi.
- Người dùng có thể ghi đè dòng của bạn trong `cordis.patch.yml` của profile của họ mà không cần sửa gói của bạn, vì vậy hãy ưu tiên đưa ra giá trị cấu hình mặc định mà người dùng nhiều khả năng sẽ giữ nguyên, phần còn lại để schema đảm nhận.

Tên bundle tích hợp sẵn luôn được giải quyết từ chính thư mục cài đặt dsh; pnpm chỉ quản lý các gói ngoài cây, nên bundle của bạn có thể yên tâm phụ thuộc vào việc `@deepseek-ai/dsh-base` tồn tại và nhất quán với bản cài đặt.

## Để bundle ở lớp trên sở hữu dòng lệnh riêng

Bundle định nghĩa một ứng dụng có thể chạy sẽ gắn một plugin nhà cung cấp thông thường:

```yaml
- id: hello-startup
  name: 'dsh-hello-plugin/startup'
```

Plugin đó export `inject = ['cmdlineArgs']`, dùng commander program của riêng nó để gọi `parseCmdline` từ [`@deepseek-ai/dsh-cmdline`](../../../../packages/boot/cmdline/README.md), rồi cung cấp dịch vụ riêng của ứng dụng trong action của chính program đó. Launcher đưa cùng một bộ tham số bất biến, nằm sau flag của chính nó, cho mỗi plugin, nên việc thêm flag riêng của ứng dụng không cần sửa launcher, và nhiều plugin cũng có thể phân tích cùng một snapshot đó. Dòng Loader không cần đánh dấu launcher hay kiểu đặc biệt.

Dòng được cấu hình bởi các tham số này sẽ inject dịch vụ nhà cung cấp, và đọc nó trong tùy chọn `!!js` của riêng mình, đồng thời viết giá trị triển khai bên cạnh làm phương án dự phòng:

```yaml
- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080
```

Khi gặp `--help`, nhà cung cấp sẽ không phát hành dịch vụ đó, nên các dòng này sẽ không được kích hoạt. Loader chỉ gắn tổ hợp một lần, chờ inject thông thường cho từng dòng, rồi mới đánh giá cấu hình `!!js` của dòng đó dựa trên context đã được inject của nó.

## Cài đặt từ GitHub: rào cản build script

Việc phát hành lên registry không bắt buộc — người dùng có thể cài đặt trực tiếp từ nơi lưu trữ git:

```sh
dsh plugin --profile demo add github:you/hello-plugin
```

Nhưng cài đặt từ git sẽ tải về **mã nguồn, không phải artifact build**: không có khâu nào chạy script `build` của bạn, nên gói TypeScript nhận được không có output `lib/`, và việc nạp sẽ thất bại. Cần làm một việc ở mỗi phía:

- **Tác giả** cung cấp một script `prepare` — pnpm chạy nó sau khi cài đặt từ git — build entry point phát hành từ mã nguồn, và phải tự chứa: không được giả định có ngữ cảnh chỉ tồn tại trong môi trường phát triển, ví dụ có sẵn một checkout monorepo bên cạnh. [turtle-ui](https://github.com/deepseek-harness/turtle-ui) là một ví dụ dùng được: `prepare` của nó chạy một cấu hình tsdown chuyên dụng, biên dịch trực tiếp `src/`, không dùng project reference, cũng không kiểm tra kiểu.
- **Người dùng** cấp quyền cho việc build. pnpm ≥10 từ chối chạy script `prepare` của git dependency cho tới khi được cấp phép rõ ràng, nên lần `add` đầu tiên sẽ thất bại; `dsh` sẽ chỉ ra cách khắc phục — sao chép đúng package key mà pnpm in ra vào `pnpm-workspace.yaml` của profile đó:

  ```yaml
  allowBuilds:
    dsh-hello-plugin: true
  ```

  rồi chạy lại `add`.

Hãy nhìn nhận đúng bản chất của việc cấp quyền này: **cho phép mã của gói đó thực thi trên máy bạn lúc cài đặt**, và không nằm trong bất kỳ sandbox nào mà agent chạy trong đó. Chỉ cấp quyền cho gói có mã nguồn đáng tin cậy, và khóa commit (`github:you/hello-plugin#<sha>`), để các lần push sau đó không thể âm thầm thay đổi những gì thực sự chạy.

Nếu không muốn người dùng phải thực hiện việc cấp quyền này, hãy phân phối artifact build thay thế — cả hai hình thức sau đều không cần bất kỳ quyền build nào:

- **Phát hành lên npm**, build sẵn `lib/` lúc `pnpm publish`; `dsh plugin add your-package` sẽ cài đặt đúng mã đã được build sẵn.
- **Chuyển giao tarball**: đóng gói bằng `pnpm pack`; người dùng chạy `dsh plugin add ./hello-plugin-0.1.0.tgz`.

## Bước tiếp theo

- [Plugin và vòng đời](../framework/) — toàn bộ vòng đời của plugin
- [Tài liệu tham khảo hành vi CLI (giao diện dòng lệnh)](../../../../apps/cli/reference/README.md) — độ ưu tiên lớp chính xác, flag và cơ chế profile
