# native/

[English](README.md) | Tiếng Việt

Mã nguồn native và các package công khai được bảo trì cùng với DeepSeek Harness. [`landlock-run/` workspace](landlock-run/README.md) chịu trách nhiệm về bộ khởi chạy tự giới hạn bằng Landlock mà harness sử dụng, bao gồm kiến trúc của nó, họ package npm gồm ba package, hỗ trợ nền tảng, quy trình phát triển và [quy trình phát hành](landlock-run/docs/release.md).

## Workspace và ranh giới phát hành

`landlock-run/` cùng các package của nó thuộc pnpm workspace ở gốc kho mã và dùng chung lock file ở gốc. Trong phát triển và CI, các bên tiêu thụ thuộc harness dùng trực tiếp package đầu vào của workspace hiện tại, nhờ vậy thay đổi quy ước của bộ khởi chạy và cập nhật phía tiêu thụ có thể được thực hiện trong cùng một thay đổi và được kiểm thử cùng nhau.

Workflow `Landlock Run` của kho mã chính build và test cho từng kiến trúc được hỗ trợ. `Landlock Run Release` gom các sản phẩm native đó, đóng gói và xác minh ba npm tarball, sau đó có thể tùy chọn phát hành chúng dưới cùng một phiên bản bộ khởi chạy. Package đầu vào tiếp tục khai báo các package theo nền tảng dưới dạng optional dependency của npm, nên npm vẫn chỉ cài đúng package khớp với hệ điều hành và CPU của người dùng.
