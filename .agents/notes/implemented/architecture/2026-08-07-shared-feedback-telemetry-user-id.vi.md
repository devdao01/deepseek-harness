# Agent Note: Telemetry, feedback và yêu cầu DeepSeek dùng chung id người dùng ẩn danh

Status: implemented

[English](2026-08-07-shared-feedback-telemetry-user-id.md) | 中文

## Vấn đề

Backend OpenTelemetry đã lưu bền một UUID ẩn danh trong `$DSH_HOME/.anonymous-user-id`. `/feedback` cần báo cáo đồng thời id phiên nhận feedback và id người dùng, để đội vận hành có thể liên kết văn bản xác nhận với các bản ghi đã export. Sao chép danh tính đó hoặc tự sinh danh tính riêng sẽ khiến id người dùng được báo cáo mất ý nghĩa; còn nếu import danh tính từ `session-telemetry-otel` thì lệnh trực tiếp sẽ phụ thuộc vào backend export, và tạo thành vòng phụ thuộc khi gắn feedback export vào phía telemetry.

Quyết định [id người dùng ẩn danh](../feature/2026-07-31-telemetry-anonymous-user-id.md) trước đó cố tình giữ hàm hỗ trợ bên trong backend OTel, cho đến khi xuất hiện bên tiêu thụ thứ hai thực sự. Feedback là bên tiêu thụ thứ hai, còn [id danh tính yêu cầu DeepSeek trực tiếp](../feature/2026-08-11-deepseek-request-user-id-header.md) là bên thứ ba.

## Quyết định

`@deepseek-ai/dsh-anonymous-user-id` phụ trách `getOrCreateAnonymousUserId()` và quy ước lưu trữ `$DSH_HOME/.anonymous-user-id`. `session-telemetry-otel` dùng id trả về làm `user.id` cho OpenTelemetry Resource; xác nhận thành công của `/feedback` báo cáo `Feedback recorded for session {sessionId}` trước, rồi hiển thị `User: {userId}` ở dòng thứ hai; còn yêu cầu DeepSeek trực tiếp mang nó qua header `x-deepseek-harness-user-id`. Hệ thống từ chối feedback không hợp lệ trước khi lấy id, adapter DeepSeek cũng chỉ lấy id sau khi phân giải credential thành công, do đó lệnh rỗng và lỗi credential đều không tạo ra `.anonymous-user-id`.

Lần tách này giữ nguyên các đặc tính hiện có: UUID ngẫu nhiên, phân giải home, cache trong tiến trình, tạo độc quyền có kiểm soát concurrency, thay thế file hỏng và ngữ nghĩa ghi best-effort.

## Các phương án đã cân nhắc

| Đã từ chối | Lý do |
|---|---|
| Import hàm hỗ trợ từ `session-telemetry-otel` | Khiến feedback phụ thuộc vào backend export tùy chọn, và tạo vòng phụ thuộc ngược khi telemetry export feedback |
| Sao chép hàm hỗ trợ lưu bền vào feedback | Hai bản triển khai của cùng một quy ước file có thể lệch nhau, và tạo race condition do khác biệt về xác thực hoặc ngữ nghĩa lỗi |
| Sinh id người dùng feedback độc lập | Văn bản xác nhận không thể liên kết với OTel Resource, do đó không đạt được mục đích báo cáo |

## Hệ quả

- Một harness home chỉ có một id ẩn danh, được xác nhận feedback, export telemetry phiên và yêu cầu DeepSeek trực tiếp dùng chung.
- Gói feedback chỉ phụ thuộc vào năng lực danh tính, không phụ thuộc vào seam telemetry hay SDK OTel.
- Gói này được ba bên tiêu thụ sử dụng, trở thành thư viện dùng chung có căn cứ đầy đủ; plugin bất biến rỗng đi kèm của nó giải thích tại sao đọc file riêng tư không phải là kiểm tra quan hệ runtime hữu ích.
- Agent Note gốc về id người dùng ẩn danh vẫn là bản ghi thẩm quyền cho ngữ nghĩa lưu trữ và quyền riêng tư; Note này chỉ thay thế phần quyết định trong đó về việc OTel sở hữu danh tính cục bộ.
