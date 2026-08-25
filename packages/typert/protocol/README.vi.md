# @deepseek-ai/dsh-typert-protocol

[English](README.md) | Tiếng Việt

Gói này cung cấp các khai báo không phụ thuộc compiler, được chia sẻ bởi các gói nghiệp vụ, sản phẩm Typert được sinh ra, gateway phía host, và API phía client. Nó chịu trách nhiệm về lớp cơ sở service Remote, decorator, phương án dự phòng gắn kết tường minh, bảng ánh xạ giao thức có thể mở rộng qua hợp nhất khai báo, descriptor lệnh gọi, codec, và ước định (convention) của nhà cung cấp; nó không thực hiện phân tích TypeScript, cũng không đăng ký bất kỳ service Cordis cụ thể nào.

## Khai báo Remote

- `@Remote` đánh dấu các phương thức instance công khai là có thể gọi trực tiếp trên service Cordis mà nó được đăng ký.
- `@RemoteScope(key)` đánh dấu các phương thức mà receiver được chọn từ kiểu Context có scope trong khai báo hợp nhất.
- `TypertRemoteService` gắn kết khóa Cordis được truyền cho `super(ctx, serviceKey, options?)` với cùng một namespace giao thức mặc định.
- `bindTypertRemote(this, serviceKey, options?)` cung cấp cùng một binding hiển thị và đóng băng (frozen) cho các service không thể kế thừa `TypertRemoteService`.
- `remoteMethods(service)` trả về một snapshot theo thứ tự khai báo, tách biệt khỏi trạng thái nội bộ, phục vụ cho đường dự phòng SRC của Gateway.

Phương thức phía host bật khả năng hủy hợp tác (collaborative cancellation) bằng cách khai báo `signal: AbortSignal` làm tham số cuối cùng. `InvocationDescriptor.cancellation` ghi lại điểm inject dành riêng này; tín hiệu (signal) này không bao giờ trở thành tham số JSON hay trường tra cứu. SRC nhận diện tên tham số ở vị trí cuối, và ở chế độ sinh nghiêm ngặt còn xác thực xem nó có kiểu `AbortSignal` toàn cục hay không.

Bộ khởi tạo decorator lưu các đánh dấu trong một `WeakMap` riêng của module, dùng prototype của service làm khóa. Chúng không thêm symbol vào constructor, cũng không thêm thuộc tính prototype, metadata tham số, hay trường reflection runtime. `TypertRemoteService` hiển thị binding `typertRemote` chỉ đọc, công khai, giống hệt như hàm hỗ trợ tường minh.

## Giao thức Typert

Các gói nghiệp vụ mở rộng `TypertLookupMap` và `TypertContextMap` để liên kết đối tượng phía host hoặc Context có scope với danh tính giao thức của chúng. Sản phẩm được sinh ra mở rộng `TypertRemoteMap`, `TypertRemoteScopeMap` và `TypertRemoteNamespaceMap`, để client sau khi import chỉ hiển thị các phương thức Remote đã chọn. `InvocationDescriptor` là dạng runtime dùng chung cho registry, gateway và Remote phía client.

Việc lắp ráp Host mở rộng `TypertRemoteEventSelection` bằng các sự kiện Host được chuyển tiếp tới bên tiêu thụ, từ đó thu hẹp bề mặt khóa của `ctx.remote.$on`; `TypertForwardableEvent` phát biểu rõ hình dạng nào mà việc truyền dẫn một chiều về cơ bản có thể mang được, loại trừ các sự kiện có Scope hóa và sự kiện có giá trị trả về. `TypertClientRemote` mang hai vai trò trên bề mặt này: bên tiêu thụ đăng ký qua `$on`, còn nửa Client giữ sink khung của Host giao khung qua `$dispatch`.

Gói lookup và gói Context cùng chịu trách nhiệm cho cả hai phía của ước định này: hợp nhất khai báo cung cấp liên kết tĩnh, còn nhà cung cấp runtime đăng ký danh tính phân giải với `ctx.typert`. Nhà cung cấp lookup hoặc nhà cung cấp Context phía host cung cấp khai báo ổn định và resolver mặc định, tổ hợp phía host có thể cấu hình thêm resolver đồng bộ hoặc bất đồng bộ; việc chính sách từ chối có thể mang giá trị lỗi `TypertLookupFailure` do adapter biên (boundary adapter) sở hữu. Codec nghiêm ngặt mang schema được sinh ra; codec `src-json` đánh dấu đường khởi động từ mã nguồn có ràng buộc yếu hơn.

## Trải nghiệm model

Không có, vì gói giao thức này chỉ khai báo và áp dụng reflection, không đăng ký bất kỳ nội dung nào hướng tới model.

#### Ảnh hưởng KV Cache

Không ảnh hưởng trực tiếp.

## Giới hạn đã biết và việc còn hoãn lại

- Đánh dấu decorator chỉ chứa tên phương thức, cùng chế độ gọi trực tiếp hoặc gọi qua Context. Reflection cho tham số, kết quả, lookup và schema cần có pipeline build Typert.
- Decorator Remote chỉ chấp nhận phương thức instance công khai, không static, có tên dạng chuỗi. Việc thực thi SRC không thể biểu diễn chữ ký overload, cũng như chữ ký phương thức có tham số destructuring, tham số mặc định hoặc tham số rest.
