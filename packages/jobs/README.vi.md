# jobs/: họ năng lực tác vụ nền

[English](README.md) | 中文

Họ này cung cấp một bộ giao thức tác vụ nền được cách ly theo chủ sở hữu cho các công cụ chạy lâu, dùng để quan sát, hủy, chờ và thông báo hoàn tất.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`jobs/`](jobs/README.md) | Định nghĩa registry tác vụ và quy ước vòng đời | `ctx.jobs` |
| [`jobs-local/`](jobs-local/README.md) | Triển khai registry tác vụ cục bộ theo tiến trình | đăng ký vào `ctx.jobs` |
| [`tool-jobs/`](tool-jobs/README.md) | Công bố điều khiển tác vụ và thông báo hoàn tất cho mô hình | đăng ký vào `ctx.tools` |

Xem quyết định [runtime tác vụ nền](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) và [registry tác vụ](../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md).

Tài liệu tham khảo phân hệ — cơ chế id, quy ước cách ly chủ sở hữu, snapshot — xem [docs/subsystems/jobs.md](../../docs/subsystems/jobs.md); thiết kế xem hai Agent Note [runtime tác vụ nền](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) và [quy ước registry tác vụ](../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md).
