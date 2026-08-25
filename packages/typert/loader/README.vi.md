# @deepseek-ai/dsh-typert-loader

[English](README.md) | Tiếng Việt

Tích hợp Loader dành cho sản phẩm Typert được sinh ra, chỉ hỗ trợ Node. Plugin này cần `ctx.loader` và `ctx.typert`; bản thân nó không cung cấp registry.

Khi được kích hoạt, plugin này quét các mục cấu hình Loader hiện có. Sau đó nó lắng nghe thông báo vòng đời `internal/plugin` của Cordis, phân giải `package.json` của gói mà mỗi mục cấu hình thuộc về, import subpath `./typert` nếu gói đó export nó, xác thực manifest (bản khai metadata) `TYPERT` của gói, và đăng ký đóng góp đó, cho đến khi mục cấu hình hoặc plugin này bị unmount. Nếu thao tác import kết thúc sau khi mục cấu hình hoặc plugin này đã unmount, hệ thống sẽ bỏ kết quả đó.

`packages` dùng để liệt kê các sản phẩm gói cần được đăng ký thêm cho các plugin lồng bên trong một mục cấu hình Loader khác. Cordis fiber không giữ lại specifier gói npm cho các plugin lồng này, do đó ở đây ranh giới được phân định bằng cấu hình tường minh; mỗi gói được liệt kê trong cấu hình phải phân giải được từ cây cấu hình, và phải export `./typert`.

Các gói không export subpath này sẽ bị bỏ qua. Kết quả phân giải gói và manifest đã import được cache trong suốt vòng đời tiến trình, do đó sau khi thêm export này cần khởi động lại tiến trình. Khi plugin được kích hoạt, nếu sản phẩm của mục cấu hình Loader đã mount có định dạng sai, việc kích hoạt sẽ thất bại; các lỗi xảy ra sau đó chỉ được ghi log, không ngăn cản các gói không liên quan hoàn tất đăng ký.

## Trải nghiệm model

Không có. loader chỉ cung cấp mục đăng ký cho [`ctx.typert`](../registry/README.md); mọi phép chiếu hiển thị tới model do bên tiêu thụ chịu trách nhiệm.

#### Ảnh hưởng KV Cache

Không ảnh hưởng trực tiếp.

## Giới hạn đã biết và việc còn hoãn lại

- Cơ chế phát hiện chỉ import sản phẩm phía host; muốn thêm cơ chế phát hiện tương đương cho runtime client thì cần có chủ sở hữu tổ hợp độc lập trước.
- Các mục cấu hình Loader được tự động phát hiện. Plugin lồng hoặc plugin không phải Loader cần được thêm tường minh vào `packages`, hoặc chủ sở hữu của chúng phải trực tiếp gọi `ctx.typert.register()`.
