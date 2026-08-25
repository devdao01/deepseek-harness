# todo/：nhóm năng lực todo/lập kế hoạch

[English](README.md) | 中文

Năng lực todo hướng tới model. Đây là một gói **sản phẩm** duy nhất, vì một session agent (agent thông minh) sở hữu danh sách đó; không có quy ước provider có thể thay thế.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`tool-todo/`](tool-todo/README.md) | Lưu trữ và công khai danh sách todo của session. | (đăng ký vào `ctx.tools`) |

README con chịu trách nhiệm về công cụ, lưu bền vững và quy ước render.

Payload sự kiện được ghi lại trong [docs/subsystems/session.md](../../docs/subsystems/session.md).
