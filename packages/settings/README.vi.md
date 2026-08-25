# settings/: họ năng lực thiết lập người dùng

[English](README.md) | Tiếng Việt

Họ gói này phân giải cấu hình người dùng có thể chỉnh sửa thông qua các namespace đã đăng ký và nhà cung cấp lưu trữ có thể thay thế.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`settings/`](settings/README.md) | Định nghĩa việc đăng ký namespace, phân giải phân tầng và commit | `ctx.settings` |
| [`settings-file/`](settings-file/README.md) | Lưu thiết lập trong tệp cục bộ và theo dõi các chỉnh sửa từ bên ngoài | Đăng ký vào `ctx.settings` |

Tham chiếu hệ thống con — namespace, owner scope, thứ tự phân giải, hot commit — xem [docs/subsystems/settings.md](../../docs/subsystems/settings.md).
