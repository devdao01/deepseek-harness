# guard/ — họ guard vệ sinh vòng lặp

[English](README.md) | Tiếng Việt

Plugin guard hành vi giám sát các mẫu hình không hợp lệ trong agent loop (vòng lặp tác tử) và cưỡng chế ngân sách cho mỗi lần gọi. Guard là bên tiêu thụ tự chứa của các dịch vụ cốt lõi và điểm mở rộng, chứ không phải một năng lực có thể thay thế.

| Package | Trách nhiệm | ctx key |
|---|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.md) | Nhắc nhở mang tính gợi ý cho các lệnh gọi tool lặp lại | Lắng nghe sự kiện tool và agent |
| [`timeout-policy/`](timeout-policy/README.md) | Thiết lập hạn chót cho mỗi lệnh gọi tool dưới dạng chính sách triển khai | Đăng ký listener `tools/execute` |

Lời nhắc được truyền dưới dạng `additionalContexts` cùng với quyết định `tools/post-execute`, và được ghi lại dưới dạng sự kiện `user/message` có nguồn từ plugin ([tool](../../docs/subsystems/tools.md)); việc phân tách timeout giữa `dsh-timeout`, việc chấm dứt năng lực và tầng chính sách này được ghi lại trong [Agent Note về thư viện timeout](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md).
