# @deepseek-ai/dsh-host-webserver

[English](README.md) | Tiếng Việt

Plugin đăng ký route HTTP và upgrade cho Web (default export `WebServer`, cấu hình là `{host, port}`): một server `node:http` bắt đầu lắng nghe khi được kích hoạt, cung cấp `ctx.webServer`. `register(route)` thêm route HTTP có tên dạng `exact`／`prefix`; `registerUpgrade(route)` thêm route upgrade khớp pathname chính xác; đường dẫn trùng lặp trong cùng một bảng sẽ ném lỗi, vì pattern route là quy ước ở cấp lắp ráp, xung đột chính là lỗi cấu hình; cả hai đều trả về disposer để gỡ đăng ký. `registerFallback(handler)` đăng ký một handler xử lý mọi request không khớp với route có tên nào. Lần đăng ký thứ hai sẽ ném lỗi; máy chủ dist SPA đi kèm [`dsh-host-frontend-static`](../frontend-static/README.md) là chủ sở hữu của handler này, khi chưa có handler nào được đăng ký thì server trả về 404. `tapIndex(transform)` thêm một phép chuyển đổi index.html, `applyIndexTaps(html)` chạy các phép chuyển đổi đã đăng ký theo thứ tự đăng ký trên một đoạn nội dung response; fallback handler gọi nó ở mỗi response index. `port` đọc cổng đang lắng nghe (đọc giá trị do OS gán khi `port` là 0), `host` đọc host binding đã cấu hình (đây là những sự thật ở thời điểm lắp ráp mà các plugin khác dựa vào để tự thích ứng, ví dụ bộ chọn của directory-picker). Thứ tự khớp HTTP là cố định: khớp route chính xác trong toàn bộ bảng trước, sau đó khớp tiền tố dài nhất, cuối cùng giao cho fallback handler. Upgrade chỉ khớp chính xác, kết nối không khớp sẽ bị đóng trực tiếp; thứ tự đăng ký không ảnh hưởng đến việc xử lý request.

Package này không biết về bất kỳ khái niệm harness nào, cũng không cung cấp dịch vụ file nào: cầu nối HTTP `/api` và WebSocket downstream là route của plugin connection, luồng sự kiện plugin bundle và HMR (thay thế module nóng) là route của plugin modules／hmr, việc phục vụ dist thuộc về chủ sở hữu fallback. Upgrade handler sở hữu bắt tay giao thức và nội dung kết nối; webserver chỉ giao socket và request thô. `host` chỉ chấp nhận `127.0.0.1` (tư thế an toàn mặc định) và `0.0.0.0` (cố ý mở ra mạng). Server này chỉ phục vụ trình duyệt; Electron tải dist qua `file://` và mang fetch qua cầu nối IPC. Package này không bao giờ in ra bất cứ điều gì; dòng URL thuộc về shell.

Lỗi khi lắng nghe (EADDRINUSE...) sẽ được ném ra từ quá trình kích hoạt, và từ chối việc lắp ráp Loader với thông tin chẩn đoán binding; fiber ứng viên bị lỗi sẽ được dispose (giải phóng tài nguyên). Khi xử lý request HTTP mà ném lỗi (ví dụ `decodeURIComponent` của chủ sở hữu fallback nhận phải chuỗi thoát phần trăm định dạng sai, hoặc client ngắt kết nối giữa chừng khi truyền request body), server sẽ trả lời 400; nếu header đã được gửi đi thì hủy socket, và ghi log warning, nhưng không bao giờ thoát tiến trình. Khi upgrade handler ném lỗi hoặc socket sau khi upgrade gặp lỗi truyền tải, hệ thống sẽ ghi log warning và hủy socket tương ứng. Việc giải phóng tài nguyên sẽ khởi động `close()` và `closeAllConnections()`, hủy mọi socket upgrade đang được theo dõi, và chỉ trả về khi cả HTTP server lẫn các socket đó đều đã đóng.

## Trải nghiệm model

Không có. Package này chỉ là phương tiện truyền tải Web giữa trình duyệt và các route HTTP／upgrade do plugin khác đăng ký, không có nội dung nào ở đây đi vào request của model.

#### Ảnh hưởng KV Cache

Không có; package này không lắp ráp cũng không gửi request nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Không cung cấp TLS, xác thực hay chính sách nguồn gốc**: việc binding vào địa chỉ khác loopback sẽ công bố server ra mạng tương ứng; các biện pháp gia cố hướng tới triển khai (hoặc đặt reverse proxy thật ở phía trước) cố ý không được đưa vào v1 hướng tới môi trường phát triển.
- **Tùy chọn socket cố định**: cấu hình chỉ chọn host và port binding; backlog và các thiết lập socket khác vẫn là triển khai nội bộ cho đến khi có nhu cầu cụ thể từ triển khai thực tế.
