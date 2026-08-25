# api/: Tầng Remote API

[English](README.md) | Tiếng Việt

Ngăn xếp công nghệ Remote hướng đến ứng dụng. `remotes` chịu trách nhiệm về chính sách BFF và các API nghiệp vụ được chọn, còn `gateway` triển khai endpoint RPC đơn nguyên (unary) Typert dùng chung giữa môi trường Host và Client.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`remotes/`](remotes/README.md) | Chính sách tra cứu Host Agent/Session và lắp ráp đóng góp Client Remote | Không có service; cấu hình `ctx.typert` và tiêu thụ `ctx.remote` |
| [`gateway/`](gateway/README.md) | Bộ điều phối Host Typert và endpoint Client Remote | `ctx.typertGateway` / `ctx.remote` |

Hướng phụ thuộc thời gian chạy là `remotes → gateway → connection → webserver`: BFF tiêu thụ quy ước `TypertClientRemote` dùng chung, Gateway giao việc vận chuyển cho Connection, Connection sau đó gắn vào HTTP server. Cordis service injection và metadata module Client duy trì thứ tự này mà không để entry point Client của Remotes phải import trực tiếp triển khai Gateway cụ thể.

## Hạn chế đã biết và công việc hoãn lại

- Connection và WebServer vẫn nằm ở [`client/connection`](../client/connection/README.md) và [`host/webserver`](../host/webserver/README.md); về sau có thể chỉ cần di chuyển gói, đặt chúng dưới `api/connection` và `api/webserver`, mà không cần thay đổi quy ước service.
- API Proxy cũ vẫn nằm ở [`host/apiproxy`](../host/apiproxy/README.md), làm đường dẫn dự phòng cho các phương thức chưa được di chuyển sang Remote. Nó dùng Host resolver do `api-remotes` giữ, giúp các phương thức đã di chuyển và phương thức cũ dùng chung một chính sách danh tính Agent/Session.
