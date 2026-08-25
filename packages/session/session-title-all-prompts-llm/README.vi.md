# @deepseek-ai/dsh-session-title-all-prompts-llm

[English](README.md) | Tiếng Việt

Nhà cung cấp `ctx.sessionTitle` tùy chọn, tóm tắt mọi tin nhắn người dùng đủ điều kiện thông qua `ctx.llm`. Nó đăng ký nhịp `all-prompts`, và khởi động revision mới sau mỗi prompt người dùng mới, đồng thời dùng lịch sử được cấy sẵn (preseeded) và prompt của sub-session. Revision mới hơn sẽ hủy và thay thế công việc cũ; kể cả khi nhà cung cấp bỏ qua việc hủy, output lỗi thời cũng không thể được commit.

Plugin này dùng [cấu hình LLM (mô hình ngôn ngữ lớn) dùng chung](../session-title-llm/README.md#configuration) đầy đủ và bắt buộc. Khi bỏ qua cả `provider` lẫn `model`, nó sẽ kế thừa đúng tuyến của request chính hiện đang được ghi log; cũng có thể đặt cả hai để việc tạo tiêu đề dùng tuyến độc lập. Nếu prompt tổng hợp cuối cùng được đóng gói vượt quá `maxInputBytes`, request sẽ thất bại thay vì cắt bớt lịch sử; khi tự động sử dụng sẽ phát cảnh báo và giữ nguyên tiêu đề trước đó.

## Trải nghiệm mô hình

### Request tiêu đề toàn bộ tin nhắn

#### Mô hình thấy gì

Mô hình tạo tiêu đề nhận chỉ dẫn tiêu đề dùng chung, cùng một mảng JSON chứa theo thứ tự log toàn bộ tin nhắn người dùng đủ điều kiện tính đến revision hiện tại và seq chính xác của chúng. Lịch sử được cấy sẵn cũng được bao gồm.

#### Ảnh hưởng Token

Sau mỗi prompt mới đủ điều kiện có thể gửi một request phụ, mỗi request bị giới hạn bởi `maxInputBytes` và `maxOutputTokens`; việc refresh tường minh có thể tăng số lệnh gọi. Request agent (tác nhân) chính không tăng token.

#### Ảnh hưởng KV Cache

Không làm mất hiệu lực KV Cache của request chính. Sau mỗi prompt, input phụ sẽ tăng hoặc thay đổi, do đó việc tái sử dụng cache riêng của nhà cung cấp sẽ kết thúc tại token JSON đầu tiên bị thay đổi.

## Hạn chế đã biết và công việc hoãn lại

- Khi input tràn, giữ nguyên tiêu đề trước đó; với session rất dài, nhà cung cấp này không có cơ chế tiếp tục tạo tóm tắt dựa trên tóm tắt hay chiến lược giữ lại.
- Nó đối xử bình đẳng với mọi tin nhắn người dùng đủ điều kiện, không cung cấp trọng số, bộ lọc hay ưu tiên tiêu đề thủ công.
