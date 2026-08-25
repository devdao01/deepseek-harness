# sandbox/: Nhóm năng lực sandbox tiến trình

[English](README.md) | 中文

Nhóm này áp dụng chính sách giới hạn theo từng session vào việc thực thi tiến trình. Nó bao phủ các tiến trình con chia sẻ hệ thống file và kernel với host; các môi trường cô lập (isolation) sẽ thay thế toàn bộ phần triển khai năng lực, chứ không đăng ký tại đây.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`sandbox/`](sandbox/README.md) | Định nghĩa service sandbox tiến trình và từ vựng nâng quyền dùng chung | `ctx.sandbox` |
| [`sandbox-local/`](sandbox-local/README.md) | Cung cấp backend giới hạn theo nền tảng cục bộ | Đăng ký vào `ctx.sandbox` |
| [`sandbox-policy/`](sandbox-policy/README.md) | Phân giải chính sách sandbox bền vững theo từng session | `ctx.sandboxPolicy` |

[Quyết định sandbox](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) ghi lại ranh giới năng lực, [quyết định tích hợp hệ thống file](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md) ghi lại cách sử dụng chính sách xuyên nhóm.

Tham khảo hệ thống con — mode và enforcement, chính sách theo từng lời gọi, phương ngữ argv được bọc, lỗi fail-closed — xem [docs/subsystems/sandbox.md](../../docs/subsystems/sandbox.md); ranh giới và các giai đoạn xuyên nhóm xem tại Agent Note [sandbox](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) và [cross-family fs sandbox](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md).
