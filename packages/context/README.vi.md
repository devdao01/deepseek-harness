# context/ — mở rộng ngữ cảnh request

[English](README.md) | Tiếng Việt

Các plugin sản phẩm thêm ngữ cảnh request hiển thị cho mô hình mà không định nghĩa công cụ. `agent-instructions` được bao gồm trong tổ hợp `dsh-agent-spine-demo` mặc định, có thể vô hiệu hóa qua cấu hình tổ hợp; `time-context`, `tmux-context` và `session-reference` cần được bật chủ động.

| Package | Trách nhiệm | ctx key |
|---|---|---|
| [`session-reference/`](session-reference/README.md) | Snapshot có giới hạn của các phiên khác | `ctx.sessionReferenceResolver` |
| [`time-context/`](time-context/README.md) | Ngữ cảnh thời gian hiện tại & thời lượng trôi qua | — |
| [`tmux-context/`](tmux-context/README.md) | Ngữ cảnh vị trí tmux | — |
| [`agent-instructions/`](agent-instructions/README.md) | Ngữ cảnh chỉ thị workspace | — |

Tham chiếu phiên xem tại [docs/subsystems/session-reference.md](../../docs/subsystems/session-reference.md); [bản ghi quyết định `agent-instructions`](../../.agents/notes/implemented/feature/2026-06-24-workspace-context.md) quy định việc cô lập theo agent (tác tử)/phiên và phân tách vòng đời của nó.
