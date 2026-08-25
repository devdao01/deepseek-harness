# shell/ — họ năng lực bash

[English](README.md) | Tiếng Việt

Họ năng lực này bao gồm seam trình thực thi chuẩn tắc, các bản hiện thực của nó, môi trường shell dùng chung và công cụ hướng tới mô hình. Tất cả đều là gói **sản phẩm**.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`shell/`](shell/README.md) | Định nghĩa quy ước trình thực thi dùng chung giữa Service Provider và Consumer. | `ctx.shell` |
| [`bash-local/`](bash-local/README.md) | Thực thi lệnh thông qua dịch vụ [`subprocess`](../subprocess/README.md) cục bộ. | (đăng ký `ctx.shell`) |
| [`bash-sandbox/`](bash-sandbox/README.md) | Áp dụng backend [`sandbox`](../sandbox/README.md) đã cấu hình trước khi thực thi cục bộ. | (đăng ký `ctx.shell`) |
| [`pwsh-local/`](pwsh-local/README.md) | Thực thi lệnh PowerShell với hành vi tiến trình đặc thù của Windows. | (đăng ký `ctx.shell`) |
| [`shell-env/`](shell-env/README.md) | Cung cấp môi trường `DSH_*` được quản lý dùng chung cho các công cụ shell. | `ctx.shellEnv` |
| [`tool-bash/`](tool-bash/README.md) | Công khai việc thực thi Bash và tích hợp tác vụ nền cho mô hình. | (đăng ký vào `ctx.tools`) |
| [`tool-pwsh/`](tool-pwsh/README.md) | Công khai việc thực thi PowerShell cho mô hình. | (đăng ký vào `ctx.tools`) |

`cordis.yml` ở nút lá chọn một bản hiện thực trình thực thi và các công cụ hướng tới mô hình cần dùng. Tổ hợp có sandbox còn chọn thêm một nhà cung cấp `ctx.sandbox`; [ví dụ ACP (Agent Client Protocol)](../../examples/acp-agent/) minh họa một bộ đấu nối hoàn chỉnh.

Tham chiếu hệ thống con — từ vựng request/spec, kết quả, tiến trình nền, dịch vụ và sự kiện — xem [docs/subsystems/shell.md](../../docs/subsystems/shell.md).
