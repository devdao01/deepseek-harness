# Agent Note: Header định danh người dùng và phiên cho request DeepSeek

Status: implemented

[English](2026-08-11-deepseek-request-user-id-header.md) | Tiếng Việt

## Vấn đề

Khi bên gọi cung cấp `GenerateOptions.sessionId`, request DeepSeek kết nối trực tiếp đã mang theo `x-deepseek-harness-session-id`, giúp phía hỗ trợ và chẩn đoán của nhà cung cấp có thể liên kết nhiều lượt trong cùng một cuộc hội thoại. Nhưng request thiếu một định danh ổn định xuyên suốt các phiên, trong khi harness đã lưu bền vững một id người dùng ẩn danh cho telemetry và phản hồi. Sinh riêng một id khác sẽ phá vỡ mối liên kết; còn đặt nó vào hàm phụ trợ quy thuộc không phụ thuộc nhà cung cấp thì lại khiến mọi HTTP adapter đều gửi một định danh ổn định theo từng người dùng.

Id người dùng là siêu dữ liệu truyền tải, không phải đầu vào của mô hình. Nó không được đi vào phần thân request, prompt, phép đo token, danh tính KV cache hay log phiên. Đích gửi là `baseURL` mà adapter phân giải ra, có thể là chính DeepSeek mà cũng có thể là một gateway đã cấu hình, nên ranh giới riêng tư phải được nói rõ.

## Quyết định

`dsh-llm-deepseek` gửi `x-deepseek-harness-user-id` trên mọi request tới nhà cung cấp phát ra sau khi phân giải thông tin xác thực thành công. Giá trị này lấy từ `@deepseek-ai/dsh-anonymous-user-id`, nên nhất quán với `user.id` trong OpenTelemetry Resource và với `/feedback` của cùng một `$DSH_HOME`. Adapter tiếp tục chỉ gửi `x-deepseek-harness-session-id` khi có `GenerateOptions.sessionId`; các request agent thông thường, sinh tiêu đề và nén ngữ cảnh đều được agent loop cấp `Session.id` bền vững hiện hành.

Plugin lấy id người dùng một cách lười biếng sau khi phân giải thông tin xác thực thành công, rồi cache trong chính thực thể plugin đó. Thiếu thông tin xác thực thì sẽ không tạo `.anonymous-user-id`; ngay cả khi đã đặt `DSH_TELEMETRY_DISABLED`, request đầu tiên đã được cấp quyền tới nhà cung cấp vẫn có thể tạo ra nó. Hàm khởi tạo của adapter kết nối trực tiếp nhận phụ thuộc `resolveUserId`, giúp hành vi trên đường truyền giữ được tính tất định trong unit test.

Cả hai header đều là siêu dữ liệu HTTP mô hình không nhìn thấy, được gửi tới `baseURL` đã phân giải. Chúng không nằm trong phần thân JSON của request, cũng không trở thành đầu vào mô hình nhìn thấy hay sự kiện phiên. Gateway đã cấu hình sẽ nhận được chúng. Việc chia sẻ telemetry chỉ điều khiển việc xuất telemetry, chứ không vô hiệu hóa định danh trên request tới nhà cung cấp.

## Kiểm chứng

- Nhà cung cấp mock khẳng định request đã được cấp quyền mang theo đúng id người dùng mà `getOrCreateAnonymousUserId()` trả về, và bỏ qua header phiên khi không có id phiên.
- Test đường truyền định danh phiên khẳng định cả hai header đều hiện diện, và giữ nguyên id phiên được truyền vào.
- Test adapter kết nối trực tiếp khẳng định mỗi stream chỉ phân giải id người dùng đúng một lần, còn test cấu hình keyless chứng minh rằng thất bại xác thực sẽ không tạo `.anonymous-user-id`.
- Test lắp ráp Loader thật khẳng định plugin sau khi lắp ráp dùng gói user-id dùng chung, chứ không dùng giá trị riêng cho test.
- Không cần sửa snapshot keyless, vì các header này không phải nội dung transcript mà mô hình hay người dùng nhìn thấy.

## Các phương án thay thế đã cân nhắc

| Đã bác bỏ | Lý do |
|---|---|
| Thêm id vào `attributionHeaders()` dùng chung | Hàm phụ trợ này không phụ thuộc nhà cung cấp và mang tính tĩnh; thêm giá trị theo từng người dùng sẽ gửi nó tới cả những nhà cung cấp không liên quan, và vi phạm hợp đồng riêng tư về định danh ứng dụng của nó |
| Cấu hình header tùy chỉnh cố định trong `cordis.yml` | Cấu hình triển khai không suy ra được id phiên hiện hành, và sẽ phơi bày một định danh ổn định dưới dạng cấu hình có thể thay đổi, thay vì dùng hợp đồng runtime mà nó thuộc về |
| Sinh một id người dùng riêng cho DeepSeek | Request tới nhà cung cấp sẽ không liên kết được với telemetry và phản hồi của cùng một harness home |
| Tắt header này theo cài đặt chia sẻ telemetry | Định danh trên request tới nhà cung cấp có bên nhận và mục đích khác với việc xuất telemetry; dùng chung một công tắc sẽ che mất ranh giới riêng tư thực sự |
| Đặt id vào trường request `user` hoặc `metadata` tương thích OpenAI | Trường trong body có thể ảnh hưởng tới schema, log, cache, token hóa của nhà cung cấp, hoặc việc tái dựng mà mô hình nhìn thấy; siêu dữ liệu HTTP giữ được ranh giới như dự kiến |

## Hệ quả

- Bộ phận hỗ trợ DeepSeek có thể liên kết các request xuyên phiên bằng một id ẩn danh theo harness home, và liên kết cùng một cuộc hội thoại bằng session id bền vững.
- Request DeepSeek đầu tiên đã được cấp quyền có thể tạo `$DSH_HOME/.anonymous-user-id` một cách độc lập với việc xuất telemetry.
- Gateway DeepSeek tùy chỉnh sẽ nhận được id người dùng ổn định và id phiên dùng được, nên bên vận hành phải coi `baseURL` đã cấu hình là bên nhận định danh.
- Phần thân request, prompt, số lượng token, danh tính KV cache và log phiên giữ nguyên không đổi.
