# subprocess/：nhóm năng lực tiến trình con

[English](README.md) | 中文

Đây là nơi tập trung cung cấp phần nền chung cho tiến trình của một thế giới thực thi: tìm kiếm file thực thi, cây tiến trình con được quản lý với stdio thô hoặc thu thập, được chỉ định hoàn toàn tường minh, cùng một nguyên thủy (primitive) tiến trình terminal cấp thấp chịu trách nhiệm cấp phát PTY, nhóm tiến trình foreground và dọn dẹp thành viên session mà provider vẫn có thể quan sát được. Việc điền giá trị mặc định cho lệnh, ngữ nghĩa shell, giới hạn thời gian, phân khung giao thức, trạng thái sẵn sàng và cách trình bày vẫn thuộc về bên tiêu thụ: [bộ thực thi bash](../shell/README.md), [host LSP](../lsp/README.md), [backend PTY shell](../terminal/README.md) và [backend subagent ACP (Agent Client Protocol)](../subagent/README.md). Xem [Agent Note về subprocess seam](../../.agents/notes/implemented/architecture/2026-07-26-subprocess-seam.md).

| Gói | Khóa ctx | Vai trò |
|---|---|---|
| [`subprocess`](subprocess/README.md) (`@deepseek-ai/dsh-subprocess`) | `ctx.subprocess` | Service Definition: tìm kiếm file thực thi, spawn được quản lý thông thường, nguyên thủy tiến trình terminal, vòng đời handle, cùng từ vựng môi trường/đầu ra dùng chung |
| [`subprocess-local`](subprocess-local/README.md) (`@deepseek-ai/dsh-subprocess-local`) | không có | Service Provider cục bộ: cây tiến trình detached, thu thập/spill có giới hạn, `node-pty`, kiểm tra foreground/session, gửi tín hiệu tới cây tiến trình, và dispose (giải phóng tài nguyên) theo kiểu chấm dứt trước rồi chờ thoát sau |

Ngay cả khi bên tiêu thụ tải lại, vòng đời tiến trình vẫn do dịch vụ quản lý; bên tiêu thụ chịu trách nhiệm định nghĩa ý nghĩa của tiến trình (một lệnh bash, một trình chạy phi-shell trong tương lai), cũng như quyết định mọi giá trị mặc định định hình tiến trình đó.

Tham chiếu subsystem — spawn spec, bộ đọc đầu ra, kết quả, môi trường `DSH_*` — xem [docs/subsystems/subprocess.md](../../docs/subsystems/subprocess.md); quyết định về seam xem [Agent Note về subprocess seam](../../.agents/notes/implemented/architecture/2026-07-26-subprocess-seam.md).
