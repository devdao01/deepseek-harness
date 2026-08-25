# @deepseek-ai/dsh-session-title-first-prompt-llm

[English](README.md) | Tiếng Việt

Nhà cung cấp `ctx.sessionTitle` tùy chọn, tóm tắt tin nhắn người dùng hợp lệ đầu tiên thông qua `ctx.llm`. Nó đăng ký nhịp `first-prompt`, chỉ tự động chạy khi phiên hoàn toàn mới, không phải fork, lần đầu tạo giá trị dự phòng, và quy kết kết quả về đúng seq của tin nhắn đó. Lỗi tự động sẽ giữ nguyên giá trị dự phòng, sau đó chỉ có thể thử lại qua `ctx.sessionTitle.refresh()`.

Plugin này dùng [cấu hình LLM (mô hình ngôn ngữ lớn) dùng chung](../session-title-llm/README.md#configuration) đầy đủ và bắt buộc. Khi bỏ qua đồng thời `provider` và `model`, nó kế thừa đúng tuyến định tuyến của yêu cầu chính đã được ghi nhận hiện tại; cũng có thể đặt cả hai để việc sinh tiêu đề dùng tuyến riêng.

## Trải nghiệm mô hình

### Yêu cầu tiêu đề từ tin nhắn đầu tiên

#### Nội dung mô hình nhìn thấy

Mô hình sinh tiêu đề nhận chỉ thị tiêu đề dùng chung, cùng một mảng JSON chỉ chứa tin nhắn người dùng hợp lệ đầu tiên. Các prompt sau đó và lịch sử fork kế thừa sẽ không kích hoạt thêm lần gọi tự động nào.

#### Ảnh hưởng token

Phiên hoàn toàn mới phát tối đa một yêu cầu phụ trợ tự động, chịu ràng buộc bởi `maxInputBytes` và `maxOutputTokens`; refresh tường minh có thể phát sinh thêm lần gọi. Yêu cầu agent (tác tử) chính không tăng thêm token.

#### Ảnh hưởng KV Cache

Không làm mất hiệu lực KV Cache của yêu cầu chính. Yêu cầu phụ trợ dùng tuyến đã cấu hình hoặc đã ghi nhận, và hành vi cache của nó do nhà cung cấp quyết định.

## Hạn chế đã biết và phần tạm hoãn

- Với phiên chạy dài, tin nhắn đầu tiên có thể không còn tiêu biểu; nếu các prompt sau cần kích hoạt sinh lại tiêu đề, hãy dùng nhà cung cấp toàn bộ tin nhắn.
- Fork giữ nguyên tiêu đề kế thừa và không bao giờ tự động chạy nhà cung cấp này, kể cả khi tin nhắn đầu tiên được nạp sẵn đến từ phiên cha.
