# @deepseek-ai/dsh-tool-ask-user

[English](README.md) | 中文

Công cụ `ask_user_question` phía mô hình, được triển khai dựa trên `ctx.userQuestions`. Khi mô hình cần xác nhận, chọn kết quả, hoặc thông tin còn thiếu để tiếp tục, nó có thể dùng công cụ này để đặt câu hỏi ngắn gọn cho người dùng.

## Công cụ

`ask_user_question` nhận các tham số sau:

- `questions`: mảng đối tượng câu hỏi bắt buộc, không được rỗng.
- `id`: id ổn định bắt buộc cho mỗi câu hỏi, sẽ được đưa nguyên trạng vào câu trả lời.
- `question`: văn bản câu hỏi bắt buộc cho mỗi câu hỏi.
- `header`: tiêu đề ngắn tùy chọn.
- `options`: các tùy chọn tùy chọn, gồm `label` và `description`. Nếu muốn đề xuất một tùy chọn nào đó, hãy đặt nó lên đầu và thêm `(Recommended)` vào cuối nhãn đó.
- `multi_select`: câu hỏi này có thể trả về nhiều tùy chọn được chọn hay không.

Công cụ gọi `ctx.userQuestions.ask()`, và trả về `{ answers: [{ id, selected, custom? }] }` theo dạng chuẩn. `selected` chứa nhãn tùy chọn; `custom` mang câu trả lời tự do nhập, đối với câu hỏi nhiều lựa chọn sẽ bổ sung cho `selected`, đối với câu hỏi một lựa chọn thì sẽ ghi đè lên nó. Bộ render Native sẽ giữ nguyên dạng văn bản JSON gọn nhẹ `{ "answers": [{ "id": "...", "selected": ["..."], "custom": "..." }] }`.

## Trách nhiệm

Gói này là gói Consumer của seam tương tác người dùng. Nó không render UI, cũng không biết đầu vào được thu thập ra sao; nó chỉ chuyển tham số mô hình thành `AskUserQuestionRequest`, và trả câu trả lời của người dùng về agent loop (vòng lặp tác tử).

## Trải nghiệm mô hình

### Schema công cụ

#### Những gì mô hình thấy

Mô hình sẽ thấy [schema `ask_user_question`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-ask-user) đã sinh, bao gồm id câu hỏi, lời nhắc, tiêu đề, tùy chọn và cờ nhiều lựa chọn.

#### Ảnh hưởng Token

Khi công cụ hiển thị, mỗi request sẽ phát sinh chi phí token schema cố định.

#### Ảnh hưởng KV Cache

Chỉ cần định nghĩa và khả năng hiển thị không đổi, tiền tố có thể được tái sử dụng ổn định. Thay đổi vòng đời plugin hoặc giới hạn phạm vi có thể làm mất hiệu lực tái sử dụng cache kể từ schema này.

### Lịch sử gọi công cụ và kết quả

#### Những gì mô hình thấy

Câu hỏi đầy đủ mà mô hình đưa ra được giữ lại trong tham số gọi công cụ của assistant. Sau khi người dùng trả lời, bước tiếp theo sẽ thấy JSON gọn nhẹ chính xác theo dạng `{"answers":[{"id":"<id>","selected":["<label>"],"custom":"<text>"}]}`; khi không dùng `custom` thì trường này sẽ được bỏ qua, `selected` có thể chứa không, một, hoặc nhiều nhãn. Tương tác UI trong lúc chờ gọi không thuộc ngữ cảnh mô hình.

#### Ảnh hưởng Token

Tham số và JSON câu trả lời là token được giữ lại tùy theo dữ liệu; không phát sinh chi phí token khi chờ người dùng.

#### Ảnh hưởng KV Cache

Chỉ thêm vào cuối; nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Câu hỏi đang chờ sẽ chặn lệnh gọi công cụ cho đến khi người dùng trả lời**: công cụ này không khai báo ngân sách `timeout-policy`; việc hủy chỉ theo `exec.signal` của lượt hiện tại.
- **Subagent thuộc về agent khác trong runtime không thể hỏi người dùng**: `ask_user_question` sẽ từ chối với `DELEGATED_CALLER` đối với con còn sống thuộc về một agent khác; con đó phải đưa câu hỏi hoặc quyết định chưa giải quyết vào kết quả cuối cùng. Phả hệ bền vững không thể quyết định ranh giới này, do đó việc khôi phục session mang phả hệ trở thành runtime root có thể hỏi bình thường.
- **Câu trả lời Native được render dưới dạng văn bản JSON**: giá trị chuẩn vẫn là dữ liệu có cấu trúc, nhưng kết quả phía mô hình dùng JSON gọn nhẹ, chứ không phải từ vựng khối nội dung phong phú hơn.
