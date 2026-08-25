# web/: họ năng lực web

[English](README.md) | Tiếng Việt

Họ năng lực này cung cấp thao tác tìm kiếm và lấy nội dung web không phụ thuộc bên cung cấp cụ thể, cùng với công cụ hướng tới model tiêu thụ các thao tác đó.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`web/`](web/README.md) | Định nghĩa đăng ký, lựa chọn bên cung cấp web và lỗi dùng chung | `ctx.web` |
| [`web-search-exa/`](web-search-exa/README.md) | Cung cấp tìm kiếm web qua Exa | đăng ký vào `ctx.web` |
| [`web-search-perplexity/`](web-search-perplexity/README.md) | Cung cấp tìm kiếm web qua Perplexity | đăng ký vào `ctx.web` |
| [`web-search-deepseek/`](web-search-deepseek/README.md) | Cung cấp tìm kiếm web nguyên bản của DeepSeek | đăng ký vào `ctx.web` |
| [`web-fetch-http/`](web-fetch-http/README.md) | Lấy nội dung từ tài nguyên HTTP và HTTPS công khai | đăng ký vào `ctx.web` |
| [`tool-web/`](tool-web/README.md) | Công khai chức năng tìm kiếm và lấy nội dung web cho model | đăng ký vào `ctx.tools` |

[Quyết định về năng lực web](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md) ghi lại lý do tìm kiếm và lấy nội dung dùng chung một service lựa chọn bên cung cấp.

Tham khảo subsystem — request/kết quả tìm kiếm/lấy nội dung, tính khả dụng, `WebError` — xem [docs/subsystems/web.md](../../docs/subsystems/web.md); căn cứ (bao gồm việc bảo vệ SSRF bị hoãn lại) xem [Agent Note về web capability seam](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md).
