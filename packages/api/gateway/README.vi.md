# @deepseek-ai/dsh-api-gateway

[English](README.md) | Tiếng Việt

Cung cấp Typert RPC endpoint cho môi trường Cordis ở cả hai phía Host và Client. Entry point Host cung cấp `ctx.typertGateway`, còn `@deepseek-ai/dsh-api-gateway/client` cung cấp `ctx.remote`; cả hai dùng chung một bộ quy ước `InvocationDescriptor` được sinh ra, giao việc lựa chọn nghiệp vụ cho API Remotes và giao phần truyền tải, tương quan yêu cầu, tin cậy cùng đóng gói phản hồi cho Connection.

## Service phía Host: `TypertGatewayService` (ctx key: `typertGateway`)

Ở mỗi lần gọi, `ctx.typertGateway.invoke()` đều phân giải descriptor hiện hành và service Cordis, kiểm tra tham số có tên khớp hoàn toàn, phân giải đối tượng đã đăng ký hoặc định danh Context, gọi phương thức nghiệp vụ công khai rồi kiểm tra kết quả trả về. Service nghiệp vụ kế thừa `TypertRemoteService` của [`dsh-typert-protocol`](../../typert/protocol/README.md) và đánh dấu phương thức bằng `@Remote` hoặc `@RemoteScope`; khi đã có lớp cơ sở khác thì vẫn có thể chuyển sang dùng `bindTypertRemote()`.

Chế độ nghiêm ngặt đọc descriptor lời gọi được sinh ra từ `ctx.typert.local`. Việc tra cứu tham số dùng resolver đang có hiệu lực trong `ctx.typert.lookups`: package nghiệp vụ đăng ký khai báo ổn định cùng chính sách mặc định, còn tổ hợp Host có thể ghi đè hành vi phân giải bằng `configure()` giới hạn theo effect; `@RemoteScope` thì phân giải bên nhận thông qua nhà cung cấp Host Context đã đăng ký. Chế độ SRC là đường lui trong giai đoạn phát triển, dùng cho các endpoint chưa từng có định nghĩa nghiêm ngặt; nó phân giải tên tham số đơn giản và chỉ cho phép tham số không phải tra cứu dùng giá trị biểu diễn an toàn được dưới dạng JSON. Một khi định nghĩa nghiêm ngặt đã quan sát được bị rút lại, hệ thống báo lỗi thẳng chứ không hạ thấp mức độ kiểm tra.

Khi có Connection, entry point Host sẽ đăng ký trusted-host interceptor trên FetchHandler `/api` mà Connection chia sẻ. Connection giao handler hợp thành này cho HTTP bridge; handler phân phối các endpoint đã được nhận cho Gateway, còn endpoint chưa được nhận thì giao cho API Proxy. Gọi trực tiếp `invoke()` sẽ giữ nguyên lỗi nghiệp vụ; `TypertGatewayError` phân biệt được các sự cố thuộc trách nhiệm của phân phối, ràng buộc, nhà cung cấp, tra cứu, Context, tham số và codec. Resolver có thể dùng `TypertLookupFailure` để mang theo lỗi RPC sẵn có, giúp những trường hợp chính sách từ chối như khôi phục nguội thất bại hay ownership fence giữ nguyên mã lỗi ban đầu.

Phương thức Remote hỗ trợ hủy sẽ khai báo `signal: AbortSignal` làm tham số Host cuối cùng. Signal là metadata của descriptor chứ không phải tham số wire: Connection cung cấp nó cho Gateway, còn Gateway tiêm nó vào sau các tham số nghiệp vụ đã giải mã. SRC nhận diện tên tham số cuối được dành riêng này, còn sinh mã nghiêm ngặt còn yêu cầu nó phải có kiểu `AbortSignal` toàn cục.

## Service phía Client: `ClientRemote` (ctx key: `remote`)

`ctx.remote.$mount()` kiểm tra và đăng ký các phần đóng góp Host-for-Client được sinh ra, rồi cài đặt những phương thức trực tiếp và phương thức theo phạm vi cụ thể cho fiber Cordis phát ra lời gọi. Mỗi namespace là một Service con `remote.<namespace>` có thể theo dõi được, và sẽ được gỡ bỏ sau khi phương thức cuối cùng bị rút lại. Endpoint trùng lặp, xung đột namespace, cũng như descriptor thiếu codec nghiêm ngặt được sinh ra đều báo lỗi trước khi phương thức có thể gọi được.

Mỗi lần gọi đều kiểm tra tham số vị trí, dựng `args` có tên khớp hoàn toàn với descriptor, rồi gửi đi qua `ctx.connection.rpc.call('/api', endpoint, ...)`. Phương thức hỗ trợ hủy được sinh ra nhận một `AbortSignal` tùy chọn ở vị trí cuối; Client sẽ hợp nhất nó với vòng đời gắn kết của phần đóng góp trước khi gọi Connection. Giá trị trả về được kiểm tra xong mới giao cho code ứng dụng. Rút lại phần đóng góp sẽ đồng thời gỡ bỏ descriptor cùng phương thức của nó, hủy các lời gọi đang diễn ra, và làm cho những handle phương thức mà bên ngoài còn giữ trả về kết quả bị từ chối khi gọi.

`ctx.remote.$on()` đăng ký nhận một sự kiện Host được chuyển tiếp. Tập khóa hợp lệ của nó đúng bằng lựa chọn chuyển tiếp mà phần lắp ráp Host khai báo, còn kiểu listener chính là khai báo `Events` Cordis của package sở hữu sự kiện đó, nên không tồn tại chữ ký thứ hai có thể trôi lệch khỏi nó. Mỗi đăng ký thuộc về fiber phát ra lời gọi và biến mất cùng fiber ấy. Việc phân phát là một chiều và theo thứ tự đăng ký; listener ném lỗi sẽ được ghi log và cô lập khỏi các listener còn lại, tuyệt đối không ảnh hưởng đến bơm khung (frame pump). `ctx.remote.$dispatch()` là nửa còn lại của mặt này và thuộc về tầng vận chuyển: nửa Client nắm sink khung Host đưa từng khung đã giải mã vào đây, gặp tên sự kiện không ai đăng ký thì bỏ qua, vì cái gì xuất hiện trên wire là do lựa chọn chuyển tiếp của Host quyết định. Bên tiêu thụ chỉ đăng ký, tuyệt đối không gọi nó.

Phần declaration merging được sinh ra cung cấp API TypeScript thông qua quy ước `TypertClientRemote` dùng chung. Entry point Client không chứa service Host hay phần hợp nhất interface Cordis phía Host; việc tra cứu và gọi phương thức dùng object và function thông thường, không dùng JavaScript Proxy.

## Trải nghiệm mô hình

Không có, vì package này phân phối lời gọi ứng dụng và không đăng ký bất kỳ prompt, tool hay sự kiện phiên nào.

#### Ảnh hưởng KV Cache

Không có ảnh hưởng trực tiếp; service nghiệp vụ được gọi mới chịu trách nhiệm tạo ra bất kỳ kết quả nào mà mô hình nhìn thấy.

## Hạn chế đã biết và phần việc hoãn lại

- Adapter Connection ánh xạ các sự cố phân phối thông thường và ngoại lệ nghiệp vụ thành mã `internal` của RPC mà không kèm thông tin chi tiết; lỗi chính sách tra cứu do `TypertLookupFailure` mang theo được trả về nguyên trạng. Các nhóm `TypertGatewayError` có cấu trúc chỉ dành cho bên gọi trong cùng tiến trình.
- Chế độ SRC chỉ hỗ trợ tham số định danh có tên duy nhất, không hỗ trợ destructuring, giá trị mặc định hay tham số rest. Nó chỉ kiểm tra giá trị có biểu diễn an toàn được dưới dạng JSON hay không, không kiểm tra kiểu nghiệp vụ được sinh ra, và tuyệt đối không suy diễn trường tùy chọn.
- Phía Client chỉ có thể gắn kết những phần đóng góp được sinh ra ở chế độ nghiêm ngặt. Đánh dấu SRC không có codec hay phép chiếu kiểu cho Client.
- Package này chỉ phân phối phương thức đơn nguyên. Dữ liệu phiên gia tăng được truyền qua một giao thức luồng có tên riêng trên cùng Connection đó.
- Resolver tra cứu được cấu hình theo key; hiện chưa thể để một tham số Remote hay một endpoint riêng lẻ chọn chính sách live-only dưới cùng một key `agent`/`session`.
- Sự kiện được chuyển tiếp đến `$on` nguyên trạng: không có phép chiếu hay che giấu payload, không hỗ trợ đăng ký theo Scope, và cũng không phát lại sau khi kết nối lại.
