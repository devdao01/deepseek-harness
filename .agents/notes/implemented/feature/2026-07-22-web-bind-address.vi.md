# Agent Note: chỉ định rõ ràng địa chỉ bind của Web

Status: implemented

[English](2026-07-22-web-bind-address.md) | 中文

## Vấn đề

Ngay cả khi trình duyệt và server chạy trên cùng một máy, `dsh web` vẫn bind toàn bộ network interface. Do đó, việc sử dụng cục bộ sẽ phơi bày một dev server chưa xác thực mà operator không chủ động chọn; mặt khác, các kịch bản container từ xa và trình duyệt trong mạng LAN vẫn cần một cách được hỗ trợ để chấp nhận kết nối không phải loopback.

Tầng HTTP transport cũng giấu địa chỉ bind bên trong `startWebServer()`, khiến các shell khác không thể diễn đạt rõ ràng chính sách mạng của mình tại ranh giới package.

## Quyết định

`dsh web` mặc định bind `127.0.0.1`. CLI (command-line interface) nhận `--host 0.0.0.0` như chế độ toàn interface được bật rõ ràng, và từ chối mọi giá trị khác, giữ chế độ mạng là một quy ước nhỏ, được giới hạn cẩn thận. Chế độ toàn interface vẫn xuất ra URL loopback cục bộ, và xuất thêm URL IPv4 bên ngoài đầu tiên nếu có.

`WebServerOptions.host` là trường bắt buộc. Tầng HTTP transport truyền giá trị này trực tiếp cho `node:http`, không có giá trị fallback, nên mỗi shell chịu trách nhiệm định ra chính sách bind của riêng mình. Bên tiêu dùng transport theo cách lập trình có thể chọn hostname hoặc địa chỉ khác.

## Phương án đã cân nhắc

**Giữ `0.0.0.0` làm mặc định.** Không chấp nhận, vì việc sử dụng cùng máy thông thường không cần khả năng truy cập toàn mạng, và cũng không nên ngầm nhận được khả năng đó.

**Dùng cờ boolean expose.** Không chấp nhận, vì `--host 0.0.0.0` nói rõ trực tiếp hành vi socket cuối cùng, và nhất quán với option server bên dưới, không cần thêm một bộ thuật ngữ thứ hai.

**Đặt giá trị mặc định bên trong `startWebServer()`.** Không chấp nhận, vì tầng transport có thể được gọi bởi nhiều loại shell, không có cơ sở để chọn hộ chính sách deployment cho họ. Yêu cầu truyền `host` giúp mỗi lần lắp ráp phải đưa ra lựa chọn này một cách rõ ràng.

## Hệ quả

Việc khởi động cục bộ của `dsh web` vẫn truy cập được qua `http://127.0.0.1:3080`; trình duyệt trên máy khác phải dùng `dsh web --host 0.0.0.0` để bật rõ ràng. CLI hiện chưa mở địa chỉ interface tùy chỉnh hay chế độ IPv6, còn bên tiêu dùng transport theo cách lập trình vẫn giữ được sự linh hoạt này. Test server chốt (pin) việc truyền chế độ loopback và toàn interface tới ranh giới listen của Node như một quy ước, Web smoke test tiếp tục bao phủ đường CLI mặc định.
