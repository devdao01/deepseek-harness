# terminal/：nhóm năng lực PTY bền vững

[English](README.md) | 中文

`PTY` viết đầy đủ là **Pseudo-Terminal (giả terminal)**. Năng lực này cung cấp session terminal bền vững, có phạm vi sở hữu giới hạn, phù hợp cho các luồng công việc cần giữ trạng thái qua nhiều lần gọi công cụ hoặc cần dùng stdin tương tác. PTY bổ sung cho công cụ bash một lần và công cụ filesystem, không thay thế các quy ước theo từng thao tác nghiêm ngặt hơn của hai công cụ đó.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`pty`](terminal/README.md) (`@deepseek-ai/dsh-terminal`) | Registry backend, id đã gắn nhãn thương hiệu, quyền sở hữu chính xác của Agent, thao tác session và dọn dẹp chờ hoàn tất | `ctx.terminals` |
| `terminal-bash` (`@deepseek-ai/dsh-terminal-bash`) | Backend shell dựa trên `ctx.subprocess.spawnTerminal`: phát hiện sẵn sàng, trạng thái terminal có giới hạn, chính sách sandbox và thao tác session | Đăng ký vào `ctx.terminals` |
| `tool-terminal` (`@deepseek-ai/dsh-tool-terminal`) | 6 công cụ hướng tới model, và tích hợp task chung cho gửi background | Đăng ký vào `ctx.tools` |

Ranh giới thiết kế và hoãn lại được ghi lại trong [Agent Note về PTY bền vững](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md).

Tham chiếu subsystem — id, quy ước backend/session, sẵn sàng để gửi, đọc có giới hạn — xem [docs/subsystems/terminal.md](../../docs/subsystems/terminal.md); thiết kế và ranh giới hoãn lại xem [Agent Note về PTY bền vững](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md).
