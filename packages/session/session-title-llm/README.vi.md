# @deepseek-ai/dsh-session-title-llm

[English](README.md) | Tiếng Việt

Chiến lược triển khai dùng chung cho các nhà cung cấp tiêu đề phiên chạy bằng mô hình. Nó phân giải tuyến định tuyến phụ trợ, đóng gói các tin nhắn người dùng được chọn chính xác thành JSON, ghi nhận đúng yêu cầu sẽ được phát đi, áp dụng chỉ thị tiêu đề nhận biết ngôn ngữ, thực thi ngân sách đầu vào và đầu ra, kết hợp timeout với việc hủy từ phía gọi, lắp ráp luồng, rồi trả về văn bản đã chuẩn hóa kèm theo seq nguồn chính xác và tuyến nhà cung cấp／mô hình đã dùng để sinh ra văn bản đó.

Gói này là thư viện thông thường, không phải plugin Cordis. Các plugin nhà cung cấp gọi `registerSessionTitleLlmProvider()` với nhịp và bộ chọn tin nhắn riêng của mình; hàm này xác thực cấu hình dùng chung và ủy quyền mỗi lần chỉnh sửa cho `generateSessionTitleWithLlm()`, nhờ đó hành vi đăng ký, định tuyến, prompt, hủy và xác thực của từng plugin không bị trôi lệch.

## Quy ước định tuyến và thất bại

Cả hai giá trị ghi đè `provider` và `model` đều tùy chọn, nhưng phải được cung cấp cùng lúc dưới dạng chuỗi không rỗng. Nếu thiếu cặp giá trị này, mô-đun phụ trợ dùng đúng tuyến nhà cung cấp／mô hình được ghi lại trong `request/header` hiện tại của phiên; vì vậy, khi refresh tường minh trước khi bất kỳ tuyến nào xuất hiện thì bắt buộc phải cung cấp giá trị ghi đè. Trước khi ghi nhận hay phát đi, mô-đun phụ trợ kiểm tra kích thước prompt người dùng đã đóng gói JSON cuối cùng theo `maxInputBytes`, bao gồm cả trường seq, lớp bọc và phần escape JSON, thay vì cắt bớt nó. Timeout và việc hủy từ phía gọi được kiểm tra lại cả trong lúc tiêu thụ luồng lẫn sau khi luồng hoàn tất, nên ngay cả khi interceptor hoặc adapter bỏ qua abort thì kết quả thành công đến muộn cũng không được chấp nhận. Đầu ra sai định dạng hoặc rỗng, lời gọi công cụ, và lý do kết thúc khác `stop` cũng khiến lời gọi bị từ chối; dịch vụ tiêu đề phiên quyết định việc từ chối đó là cảnh báo tự động hay lỗi tường minh cho phía gọi.

Sau khi hoàn tất xác thực định tuyến và đầu vào, mô-đun phụ trợ nối trực tiếp qua `Session` một sự kiện `session/title-llm-request` chỉ ghi vào log, ngay trước khi phát đi tới mô hình. Sự kiện gồm id nhà cung cấp tiêu đề, seq nguồn chính xác, tuyến định tuyến, system prompt, danh sách tin nhắn, và giới hạn token đầu ra mà lời gọi đó dùng. Lớp lưu bền quan sát bản ghi đó ngay lập tức; việc nối thêm không cần cờ đánh dấu riêng cho tiêu đề, khẳng định kiểu, hàng đợi kết toán hay flush. Bao yêu cầu được phát đi bị đóng băng sâu, mang `purpose: 'session-title'`, và cố ý không chứa định danh yêu cầu cục bộ tiến trình của dsh-agent-loop. Interceptor giữ nhất quán với bản ghi, còn observer tái dựng dành riêng cho vòng lặp sẽ không so sánh nó với header yêu cầu hội thoại. Adapter DeepSeek tắt phần suy nghĩ theo mục đích này, để toàn bộ ngân sách đầu ra ít ỏi dành cho văn bản tiêu đề hiển thị; các adapter khác tự chịu trách nhiệm về hành vi riêng theo mục đích. Lỗi mô hình xảy ra sau đó vẫn giữ lại bản ghi yêu cầu; lỗi xác thực chưa từng trở thành yêu cầu phát đi sẽ không tạo bản ghi. Sự kiện này luôn nằm ngoài lịch sử mô hình được dẫn xuất.

## Cấu hình

Ngoài cặp giá trị ghi đè định tuyến, mọi trường đều bắt buộc; thư viện không cung cấp giá trị mặc định.

| Khóa | Quy ước |
|---|---|
| `targetWords` | Số từ mục tiêu, số nguyên dương, cho tiêu đề không phải CJK. |
| `targetCjkCharacters` | Số ký tự mục tiêu, số nguyên dương, cho tiêu đề tiếng Trung, Nhật hoặc Hàn. |
| `maxInputBytes` | Giới hạn trên số byte UTF-8, số nguyên dương, của prompt người dùng đã đóng gói JSON cuối cùng. |
| `maxOutputTokens` | Giới hạn trên số token, số nguyên dương, cho phần sinh phụ trợ. |
| `timeoutMs` | Hạn mức đầu-cuối, số dương, nằm trong giới hạn bộ định thời của runtime. |
| `provider`, `model` | Tuyến định tuyến tường minh tùy chọn; cung cấp cả hai hoặc bỏ qua cả hai. |

## Trải nghiệm mô hình

### Yêu cầu tiêu đề phụ trợ

#### Nội dung mô hình nhìn thấy

Mô hình sinh tiêu đề nhận một chỉ thị hệ thống cố định, yêu cầu trả về một tiêu đề ngắn gọn và không trang trí, viết bằng ngôn ngữ đầu vào; chỉ thị này chứa số từ và số ký tự CJK mục tiêu đã cấu hình. Tin nhắn người dùng duy nhất của nó chứa một mảng JSON gồm các tin nhắn người dùng được chọn chính xác kèm seq của chúng.

#### Ảnh hưởng token

Yêu cầu phụ trợ tiêu thụ token theo kích thước đầu vào đã chọn và `maxOutputTokens`. Nó độc lập với yêu cầu agent (tác tử) chính và không thêm văn bản tiêu đề hay nội dung đóng gói vào lịch sử agent. Lời gọi tiêu đề của DeepSeek tắt phần suy nghĩ; hội thoại chính giữ nguyên chế độ suy nghĩ đã cấu hình của nó.

#### Ảnh hưởng KV Cache

Không làm mất hiệu lực KV Cache của yêu cầu chính. Việc tái dùng cache phụ trợ do nhà cung cấp quyết định; chỉ thị cố định có thể tái dùng, còn mảng tin nhắn JSON thay đổi theo mỗi lần chỉnh sửa.

## Hạn chế đã biết và phần tạm hoãn

- Mô-đun phụ trợ chỉ chấp nhận đầu ra văn bản và từ chối lời gọi công cụ; nó không công khai adapter đầu ra có cấu trúc hay biến thể prompt riêng cho từng nhà cung cấp.
- Nó thực thi giới hạn byte trên toàn bộ prompt người dùng đã đóng gói, không cắt gọt từng tin nhắn riêng lẻ hay áp dụng chính sách giữ lại.
