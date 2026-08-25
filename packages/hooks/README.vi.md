# hooks/ — cầu nối hook và giao thức dùng chung

[English](README.md) | Tiếng Việt

Phân hệ hooks cho phép người dùng mở rộng agent (tác tử) tại các điểm vòng đời giống như khi dùng Claude Code và Codex: chỉ cần trỏ plugin cầu nối vào `hooks.json` (hoặc cấu hình) hiện có, là có thể chạy trung thực các hook shell bên ngoài đó. Bản thân interface mở rộng chuẩn hóa chính là các điểm chặn (interception point) đã được gán kiểu của harness (xem [Agent Note về điểm mở rộng chặn](../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md)); "hook gốc" chỉ là các plugin Cordis thông thường tại các điểm mở rộng đó. Các package này là **cầu nối** chuyển đổi giao thức hook shell bên ngoài sang cùng một interface, cùng với thư viện giao thức dùng chung mà chúng cùng phụ thuộc.

| Package | Trách nhiệm | Hình thức |
|---|---|---|
| [`hook-protocol/`](hook-protocol/README.md) | Thư viện giao thức hook shell dùng chung | Thư viện |
| [`hooks-claude-code/`](hooks-claude-code/README.md) | Cầu nối hook Claude Code | Plugin |
| [`hooks-codex/`](hooks-codex/README.md) | Cầu nối hook Codex | Plugin |

Thư viện dùng chung chịu trách nhiệm về hành vi giao thức chung; mỗi cầu nối chịu trách nhiệm về việc ánh xạ sự kiện theo phương ngữ riêng của nó. README con ghi lại các quy ước này.
