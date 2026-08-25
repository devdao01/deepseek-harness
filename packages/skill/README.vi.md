# skill/: họ năng lực skill (kỹ năng)

[English](README.md) | Tiếng Việt

Họ này phát hiện các chỉ dẫn agent (trợ lý thông minh) có thể tái sử dụng, rồi công khai chúng cho mô hình thông qua danh mục và loader không phụ thuộc nhà cung cấp.

| Package | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`skill/`](skill/README.md) | Định nghĩa việc đăng ký và tra cứu nhà cung cấp skill | `ctx.skills` |
| [`skill-badge/`](skill-badge/README.md) | Đóng góp skill huy hiệu dsh dựng sẵn tùy chọn | Đăng ký vào `ctx.skills` |
| [`skill-filesystem/`](skill-filesystem/README.md) | Phát hiện skill từ hệ thống tệp cục bộ | Đăng ký vào `ctx.skills` |
| [`tool-skill/`](tool-skill/README.md) | Phát hành danh mục skill và loader hướng mô hình | Đăng ký vào `ctx.tools` |

Năng lực này nằm ngoài trục điều khiển lõi, có thể dùng nhà cung cấp cục bộ, nhúng hoặc từ xa mà không cần thay đổi quy ước hướng mô hình.

Tham chiếu hệ thống con — thứ tự ưu tiên phát hiện, ảnh chụp danh mục, bộ nạp `skill` — xem [docs/subsystems/skills.md](../../docs/subsystems/skills.md).
