# Agent Note: Sửa xung đột loader trùng lặp của pwsh terminal overlay

Status: implemented

[English](2026-08-12-fix-pwsh-terminal-overlay-dup.md) | Tiếng Việt

## Problem

`apps/web/tests/pwsh-terminal.e2e.ts` thất bại trên mọi nền tảng với lỗi `TypeError: duplicate loader entry id: tool-pwsh`, do `vendor/loader/src/config/group.ts:64` ném ra khi lắp ráp tổ hợp web. Kênh seed gặp lỗi này khởi động bundle đã phát hành đầy đủ cộng thêm một test overlay, nên E2E không bao giờ chạm tới assertion render, khiến `check:ci:snapshot` và `test:web` mỗi lần chạy đều báo đỏ một web test, dù tính năng được kiểm thử không liên quan đến thay đổi đang review.

Web E2E scaffold áp dụng `extraOverlayPath` sau bề mặt Web đã phát hành và base patches. `pwsh-terminal.overlay.yml` dùng khối `insert` để thêm dòng `tool-pwsh`:

```yaml
- insert:
    - id: pwsh-local
      name: '@deepseek-ai/dsh-pwsh-local'
    - id: tool-pwsh
      name: '@deepseek-ai/dsh-tool-pwsh'
```

`insert` chỉ đúng khi `tool-pwsh` chưa tồn tại trong tổ hợp. id này tồn tại vì `86b6979bdc` (refactor(bundle): fold the Windows shell platform layer into the base rows) đã chuyển hai bộ shell stack với cổng nền tảng nghịch đảo lẫn nhau vào base bundle — `packages/bundle/base/cordis.patch.yml` khai báo `tool-pwsh` với `disabled: !!js process.platform !== 'win32'`, nên dòng này tồn tại trong tổ hợp trên mọi nền tảng. Sau đó `42fc7c5ffb` (refactor(preset): gate tool-pwsh by platform alongside tool-bash) thêm vào web-app patch một dòng vô hiệu hóa `tool-pwsh` cho các bề mặt dùng preset; patch không thể tạo mới id, nên nó không phải nguồn gây xung đột. `insert` của overlay do đó gửi thêm một dòng cùng id vào cùng một nhóm loader, và loader từ chối cặp trùng này khi khởi động.

## Decision

Thay `insert` của overlay đối với `tool-pwsh` bằng override theo id ở cấp cao nhất:

```yaml
- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: false
```

Trạng thái hiệu lực của `tool-pwsh` là một stack ba lớp: dòng base khóa `disabled` theo `process.platform !== 'win32'`, web-app overlay đặt `disabled: true` vô điều kiện cho các bề mặt preset, và override của kênh này trả `disabled: false` bất kể nền tảng. Override cấp cao nhất định vị theo `id` sẽ thay thế dòng đã tổ hợp; chỉ `insert` mới gây xung đột.

Kênh này giờ cũng vô hiệu hóa `pwsh-sandbox` theo id, đối xứng với việc vô hiệu hóa `bash-sandbox` đã có sẵn: base khóa `pwsh-sandbox` bằng `disabled: !!js process.platform !== 'win32'`, nên trên Windows nó vốn sẽ tồn tại song song với `pwsh-local` được chèn vào, cả hai sẽ đăng ký cùng một dịch vụ executor. Vô hiệu hóa nó giúp `pwsh-local` là executor duy nhất trên mọi nền tảng.

Comment đầu overlay đã được cập nhật để mô tả đầy đủ lựa chọn, comment inline ở dòng `tool-pwsh` giờ ghi rõ dòng base là nguồn gốc của id này.

## Alternatives considered

**Giữ `insert`, sửa tổ hợp web.** Bị từ chối. Tổ hợp web đã phát hành nên giữ dòng `tool-pwsh` của host bị vô hiệu hóa trên mọi bề mặt dùng preset; overlay mới là kênh cố ý cần dòng này, nên việc kích hoạt theo id nên đặt ở đó. Bản thân dòng base cũng không thể bị loại bỏ: đó là khai báo shell stack với cổng nền tảng dùng chung cho mọi bundle.

**Kích hoạt `tool-pwsh` trong khối `insert`.** Không khả thi. Dùng `insert` cho một id đã tồn tại chính là lỗi trùng lặp cần sửa ở đây. Dòng này phải được định vị theo id, tức dạng override cấp cao nhất, không phải `insert`.

**Chỉ sửa `tool-pwsh` theo id mà không đặt `disabled: false`.** Không đủ. web-app đặt `disabled: true` vô điều kiện, cổng nền tảng của dòng base chỉ có hiệu lực khi thiếu override của web-app, nên nếu chỉ nhắc lại override của `name` thì dòng vẫn giữ trạng thái vô hiệu hóa, kênh này sẽ không render ra thẻ terminal. `disabled: false` là bắt buộc.

**Chỉ vô hiệu hóa `bash-sandbox`, dựa vào cổng nền tảng để giữ `pwsh-sandbox` ở trạng thái tắt.** Bị từ chối. Đúng trên POSIX, nhưng sẽ thất bại trên Windows: dòng base khiến `pwsh-sandbox` được bật, nó sẽ xung đột với `pwsh-local` được chèn vào trên cùng một dịch vụ executor. Kênh này vô hiệu hóa `pwsh-sandbox` để mỗi nền tảng chỉ có một executor duy nhất.

## Verification

Hoàn tác bản sửa (khôi phục `insert` cho `tool-pwsh`) tái tạo đúng lỗi khởi động `duplicate loader entry id: tool-pwsh`, xác nhận override có hiệu lực. Sau khi sửa, cùng head đó `pwsh-terminal.e2e.ts` pass 2/2 — điều này áp dụng cho seam POSIX, các lệnh gọi pwsh được seed render ra qua `tool-pwsh` đã kích hoạt và `pwsh-local` đã chèn. Kênh seed này cần có `pwsh` khả dụng, máy không có binary này sẽ bị skip; máy này có `pwsh`, test đã thực sự chạy qua. Đường Windows (base `pwsh-sandbox` song song với `pwsh-local` được chèn) không được bất kỳ CI lane nào bao phủ, `test:web` của nó chỉ chạy trên Linux; overlay vô hiệu hóa `pwsh-sandbox` giúp đường này có thể tổ hợp được khi thực sự chạy trên máy phát triển Windows.

## Consequences

Kênh seed E2E web dùng để thực thi khởi động PowerShell giờ có thể tổ hợp thay vì xung đột, nên `check:ci:snapshot` và `test:web` không còn thất bại vì lỗi trùng lặp này một cách không liên quan tới thay đổi đang được kiểm thử. Mẫu hình này mang tính tổng quát: overlay `--patch`/`extraOverlayPath` phải kiểm tra xem bundle đích đã có sẵn dòng đó hay chưa trước khi quyết định dùng `insert` hay override theo id; dùng `insert` cho một id đã được base hoặc bề mặt Web đã phát hành khai báo là lỗi trùng lặp lúc khởi động.
