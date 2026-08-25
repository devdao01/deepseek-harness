# Agent Note: Preset thông dụng chỉ cung cấp một bộ công cụ chỉnh sửa

Status: implemented

[English](2026-08-10-default-presets-single-editor.md) | Tiếng Việt

## Vấn đề

Các preset `standard`, `code` và `cordis` đồng thời cung cấp các tool hệ thống file `read`/`write`/`edit` lẫn `str_replace_editor`. Hai bộ giao diện chồng lấn nhau ở việc xem và sửa file thông thường, khiến mỗi yêu cầu phải mang thêm schema tool mà không thêm năng lực mặc định độc lập nào. Preset `minimal` có quy ước tổ hợp khác: danh sách hai tool cố định của nó chủ ý cung cấp `str_replace_editor` bên cạnh `bash` bền vững.

## Quyết định

Cấu hình các preset `standard`, `code` và `cordis` mount `dsh-tool-fs` cùng `dsh-tool-fs-search`, nhưng không mount `dsh-tool-str-replace-editor`. Do đó registry của Code Mode và SDK sinh tự động đều không chứa `str_replace_editor`. Preset `minimal` tiếp tục mount `dsh-tool-str-replace-editor`, và cấu hình triển khai hay preset tùy chỉnh của người dùng vẫn có thể mount plugin này một cách tường minh.

Quyết định này thu hẹp danh sách tool của preset, chứ không gỡ gói tool cùng phần hỗ trợ runtime Python của nó. [Quyết định về danh sách dùng chung](../feature/2026-07-31-even-out-shipped-tool-rosters.md) trước đó vẫn giải thích vì sao các tool không phụ thuộc surface lại thuộc về phần tổ hợp preset; ghi chú này giải thích ngoại lệ dành cho trình soạn thảo.

## Các phương án từng cân nhắc

**Giữ cả hai giao diện chỉnh sửa trong preset thông dụng.** Không áp dụng, vì schema chồng lấn mà mô hình nhìn thấy làm tăng lựa chọn tool nhưng không cung cấp thao tác mặc định khác biệt.

**Gỡ `str_replace_editor` khỏi mọi tổ hợp được giao.** Không áp dụng, vì preset `minimal` chủ ý dùng schema này làm một trong hai tool, và triển khai tường minh vẫn là bên tiêu thụ hợp lệ của plugin độc lập đó.

## Hệ quả

Agent thông dụng dùng `read`, `write` và `edit` để sửa đổi hệ thống file, còn agent minimal giữ lại `str_replace_editor`. Test tổ hợp preset ghim việc nó không xuất hiện trong danh sách standard, danh sách Cordis và SDK Code Mode, đồng thời các khẳng định của minimal tiếp tục ghim sự hiện diện của nó.
