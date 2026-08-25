# boot/: lớp keo khởi động app bin dùng chung

[English](README.md) | Tiếng Việt

Thư viện khởi động không phụ thuộc kênh phân phối, được `apps/cli` và các demo bin trong [`examples/`](../examples/README.md) dùng chung.

| Package | Trách nhiệm | ctx key |
|---|---|---|
| `app-boot/` | Lớp keo khởi động dùng chung cho app bin: nạp `.env`, cơ chế bảo vệ Loader báo lỗi rõ ràng, phân giải cấu hình có nhận biết snapshot, cùng trình tự khởi động chờ cả cây ổn định | (thư viện cho từng bin dùng) |
| `cmdline/` | Bàn giao dòng lệnh từ trình khởi chạy sang ứng dụng, cùng phần phân giải khởi động do ứng dụng nắm giữ | `cmdlineArgs`, `appExit` |

Trình tự khởi động và quy ước cấu hình cá nhân xem [`app-boot/README.md`](app-boot/README.md); dòng lệnh do ứng dụng nắm giữ xem [`cmdline/README.md`](cmdline/README.md).
