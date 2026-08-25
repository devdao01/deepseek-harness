# @deepseek-ai/dsh-typert-registry

[English](README.md) | Tiếng Việt

Registry runtime dành cho sản phẩm Typert được sinh ra. Mỗi mục đăng ký chứa thông tin reflection nghiệp vụ của một gói trên một face, cùng schema Zod runtime tùy chọn; `ctx.typert` đăng ký cả hai một cách nguyên tử (atomic), và gỡ bỏ chúng cùng nhau khi Cordis fiber khởi tạo lệnh gọi được giải phóng. Phân tích TypeScript và sinh mã do [`dsh-typert-generator`](../generator/README.md) đảm nhiệm.

Thông tin reflection của gói dùng `<package>#<face>` làm khóa. Schema dùng `<package>#<name>` làm khóa, và giữ lại instance Zod của bên sinh ra nó. Hệ thống tính JSON Schema theo yêu cầu tại biên của bên tiêu thụ.

## API công khai

- `TypertRegistry` là plugin mặc định, và cung cấp `ctx.typert`.
- `ctx.typert.lookups.register()` đăng ký khai báo giao thức và resolver mặc định do gói nghiệp vụ sở hữu; `configure()` đăng ký resolver có thể chạy bất đồng bộ do tổ hợp phía host sở hữu. Vòng đời của cả hai độc lập với nhau: cấu hình có thể được đăng ký trước nhà cung cấp, và unmount cấu hình sẽ khôi phục chính sách mặc định.
- `ctx.typert.contexts.registerHost()` và `configureHost()` áp dụng cùng cách phân chia sở hữu đó cho danh tính Context có scope; `registerClient()` cung cấp bộ gắn kết Context phía client tương ứng.
- `register(contribution)` từ chối các danh tính sai định dạng, cũng như khóa tổ hợp gói và face trùng lặp hoặc khóa schema trùng lặp, trước khi cam kết bất kỳ nội dung nào, sau đó trả về cùng một hàm giải phóng tài nguyên do Cordis effect cung cấp.
- `get(key)`, `resolve(key)` và `list(filter?)` truy vấn schema hiện đang có hiệu lực. `resolve()` có thể phân biệt khóa sai định dạng, gói chưa được đăng ký, và gói đã đăng ký nhưng không cung cấp schema dưới tên đó.
- `getPackage(packageName, face?)` và `listPackages(filter?)` truy vấn thông tin reflection về service, event và object được sinh ra; face mặc định là `host`.
- `toJSONSchema(key, params?)` dùng `z.toJSONSchema()` để chiếu schema hiện đang có hiệu lực, và không cache kết quả.
- `typertKey()` và `typertPackageKey()` xây dựng hai dạng danh tính ổn định.

Subpath `@deepseek-ai/dsh-typert-registry/types` chứa các ước định (convention) kiểu thuần cho mục đăng ký và bản ghi. [`dsh-typert-loader`](../loader/README.md) sẽ phát hiện và đăng ký sản phẩm phía host được sinh ra trong tổ hợp Loader; các chủ sở hữu tổ hợp khác có thể gọi trực tiếp `ctx.typert.register()`.

## Trải nghiệm model

Không có. Registry không cung cấp prompt, công cụ hay sự kiện session; mọi phép chiếu hiển thị tới model do bên tiêu thụ như `cordis_inspect` chịu trách nhiệm.

#### Ảnh hưởng KV Cache

Không ảnh hưởng trực tiếp. Bên tiêu thụ nào đưa thông tin reflection vào request sẽ chịu trách nhiệm về thay đổi tiền tố phát sinh từ đó.

## Giới hạn đã biết và việc còn hoãn lại

- Registry lưu trữ thông tin reflection được sinh ra, nhưng không hợp nhất đồ thị phía host và phía client, cũng không phân giải tham chiếu TypeScript; những việc này do bộ phân tích và bộ xuất sản phẩm đảm nhiệm.
- Khóa schema không bao gồm face, vì phía host và phía client chạy trong các ngữ cảnh khác nhau. Nếu đăng ký hai schema cùng tên từ hai face trong cùng một ngữ cảnh, hệ thống sẽ từ chối vì coi đó là trùng lặp.
