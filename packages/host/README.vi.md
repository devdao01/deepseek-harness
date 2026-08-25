# host/ — Phía Host của Web GUI

[English](README.md) | Tiếng Việt

Phía host của dsh Web GUI: API gateway dùng chung cho tất cả các hình thái client, và HTTP server thông thường lưu trữ nó. Phía trình duyệt nằm ở [`client/`](../client/README.md); ứng dụng tổ hợp là [`apps/cli`](../../apps/cli/README.md), nó khởi động [gói tổ hợp `dsh-base`](../bundle/base/cordis.patch.yml) để cung cấp [`apps/web`](../../apps/web/). Tất cả đều là các gói **sản phẩm**.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`apiproxy/`](apiproxy/README.md) | API gateway dùng chung của host và quy ước giao thức | `ctx.apiProxy` |
| [`webserver/`](webserver/README.md) | Đối tượng mang tuyến đường (route) HTTP | `ctx.webServer` |
| [`frontend-static/`](frontend-static/README.md) | Server dist SPA chiếm ghế fallback của webserver | Tiêu thụ `ctx.webServer` |
| [`directory-picker/`](directory-picker/README.md) | Seam chọn thư mục workspace | `ctx.directoryPicker` |
| [`directory-picker-native/`](directory-picker-native/README.md) | Backend chọn thư mục gốc (native) và tương tác trình duyệt | Đăng ký `ctx.directoryPicker` |
| [`directory-picker-browse/`](directory-picker-browse/README.md) | Backend trình duyệt thư mục trong ứng dụng và tương tác | Đăng ký `ctx.directoryPicker` |
| [`directory-picker-auto/`](directory-picker-auto/README.md) | Tổ hợp bộ chọn thích ứng của host | Gắn (mount) một backend |
| [`plugin-inventory/`](plugin-inventory/README.md) | Chiếu chỉ đọc của các mục Loader hiện tại | Remote `pluginInventory/list` |

`apiproxy` giữ tính độc lập với transport; [`client/connection`](../client/connection/README.md) cung cấp phương tiện mang (carrier) trình duyệt／HTTP. Các triển khai bộ chọn có thể thay thế lẫn nhau phía sau seam dùng chung.

Tài liệu tham khảo hệ thống con: [web-server.md](../../docs/subsystems/web-server.md) và [workspace.md](../../docs/subsystems/workspace.md) (seam bộ chọn).
