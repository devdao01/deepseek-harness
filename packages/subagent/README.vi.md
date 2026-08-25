# subagent/: họ năng lực subagent

[English](README.md) | Tiếng Việt

Họ này cho phép một agent (tác tử) ủy thác công việc cho các subagent. Nhiều nhà cung cấp có tên khác nhau có thể cùng tồn tại trong một context.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`subagent/`](subagent/README.md) | Định nghĩa việc đăng ký nhà cung cấp, ủy thác và tiếp tục thực thi | `ctx.subagents` |
| [`subagent-inprocess/`](subagent-in-process-driver/README.md) | Cung cấp driver chạy in-process dùng chung | Không có |
| [`subagent-spawn-in-process/`](subagent-spawn-in-process/README.md) | Khởi động subagent in-process hoàn toàn mới | Đăng ký vào `ctx.subagents` |
| [`subagent-fork-in-process/`](subagent-fork-in-process/README.md) | Khởi động subagent in-process từ lịch sử đã hoàn tất của agent cha | Đăng ký vào `ctx.subagents` |
| [`subagent-acp/`](subagent-acp/README.md) | Khởi động subagent ngoài tiến trình qua ACP (Agent Client Protocol) | Đăng ký vào `ctx.subagents` |
| [`subagent-codex/`](subagent-codex/README.md) | Khởi động subagent Codex app-server thật | Đăng ký vào `ctx.subagents` |
| [`subagent-claude-code/`](subagent-claude-code/README.md) | Khởi động subagent Claude Code thật qua Claude Agent SDK chính thức | Đăng ký vào `ctx.subagents` |
| [`subagent-dsh-sdk/`](subagent-dsh-sdk/README.md) | Khởi động subagent Harness ngoài tiến trình qua TypeScript SDK | Đăng ký vào `ctx.subagents` |
| [`tool-subagent/`](tool-subagent/README.md) | Công bố thao tác ủy thác cho mô hình | Đăng ký vào `ctx.tools` |
| [`tool-subagent-control/`](tool-subagent-control/README.md) | Công bố cho mô hình thao tác gửi tin nhắn tới agent con và liệt kê agent con | Đăng ký vào `ctx.tools` |
| [`tool-subagent-report/`](tool-subagent-report/README.md) | Cung cấp kênh báo cáo từ agent con lên agent cha | Đăng ký vào phạm vi của agent con |

Xem các quyết định liên quan tới [họ năng lực](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md), [agent con có thể tiếp tục thực thi](../../.agents/notes/implemented/feature/2026-07-21-continuable-background-subagents.md) và [tool điều khiển](../../.agents/notes/implemented/simplification/2026-07-26-merge-subagent-control-service.md).

Tham chiếu hệ thống con — yêu cầu khởi động, kết quả, lần chạy thời gian thực, giao ước nhà cung cấp, subagent nền có thể chạy tiếp — xem [docs/subsystems/subagent.md](../../docs/subsystems/subagent.md); căn cứ thiết kế xem các Agent Note [subagent capability seam](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md), [subagent nền có thể chạy tiếp](../../.agents/notes/implemented/feature/2026-07-21-continuable-background-subagents.md) và [gộp service điều khiển subagent](../../.agents/notes/implemented/simplification/2026-07-26-merge-subagent-control-service.md).
