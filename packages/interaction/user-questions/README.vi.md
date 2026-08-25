# @deepseek-ai/dsh-user-questions

[English](README.md) | 中文

Service Definition tương tác người dùng. Nó định nghĩa `ctx.userQuestions`, dùng cho các công cụ hướng tới mô hình hoặc plugin quyền khi cần tạm dừng công việc và hỏi quyết định của con người.

## Service: `UserQuestionService` (khóa ctx: `userQuestions`)

### API công khai

- `ctx.userQuestions.registerProvider(provider): () => void` đăng ký bên cung cấp phía UI. Trong cùng một ngữ cảnh chỉ được có một provider hoạt động; dispose (giải phóng tài nguyên) sẽ hủy đăng ký nó.
- `ctx.userQuestions.ask(request): Promise<AskUserQuestionAnswer>` đặt câu hỏi cho provider đang hoạt động và chờ câu trả lời.

### Kiểu dữ liệu chính

- `AskUserQuestionRequest`: `{ questions: [{ id, question, detail?, header?, options?, multiSelect?, intent? }], agent?, signal? }`; `detail` cung cấp văn bản hỗ trợ, provider sẽ render nó cùng với câu hỏi, chứ không biến nó thành nhãn tùy chọn. Nếu cung cấp `agent`, nó phải là cùng một đối tượng với runtime root agent (tác tử) còn sống trong registry.
- `AskUserQuestionOption`: `{ label, description? }`.
- `AskUserQuestionIntent`: `{ kind: 'plan-review', approve }`; tức ý định trình bày có gắn nhãn được nêu bên dưới.
- `AskUserQuestionAnswer`: `{ answers: [{ id, selected, custom? }] }`.
- `UserQuestionProvider`: triển khai UI chứa `ask(request)`.
- `UserQuestionError`: lớp con của `HarnessError`, chứa các mã `EMPTY_QUESTIONS`, `BAD_INTENT`, `NO_PROVIDER`, `DUPLICATE_PROVIDER`, `ASK_ABORTED`, `CALLER_NOT_LIVE` và `DELEGATED_CALLER`.

Đối với câu hỏi một lựa chọn, `custom` sẽ ghi đè tùy chọn đã chọn, và `selected` để trống. Đối với câu hỏi nhiều lựa chọn, `custom` có thể bổ sung cho các nhãn trong `selected`. UI có thể giữ các mục bị bỏ qua dưới dạng `{ id, selected: [] }`, vừa duy trì hình thái câu trả lời hiện có, vừa giữ lại các câu trả lời khác trong cùng đợt.

Khi request chứa agent, `ask()` sẽ xác minh thông qua `AgentRegistry` hiện tại rằng agent đó là cùng một đối tượng với thực thể còn sống trong registry, và chỉ cho phép runtime root gọi. Phả hệ bền vững không cấu thành cơ sở quyền: session mang độ sâu ủy quyền lịch sử được khôi phục thành runtime root mới có thể hỏi; con còn sống thuộc về một agent khác thì bị từ chối ngay cả khi độ sâu ủy quyền được ghi bền vững bằng không. Request theo chương trình không chứa agent tiếp tục theo đường dẫn provider hiện có.

### Ý định trình bày

`intent` khai báo rằng bản thân một câu hỏi là một loại quyết định đã biết, do đó UI nhận diện được nhãn này có thể trình bày tương ứng — `plan-review` biểu thị `detail` là một kế hoạch đang chờ xét duyệt, `dsh-plan-mode` sẽ đặt ý định này trên câu hỏi của `exit_plan_mode`. Ý định chỉ thay đổi cách trình bày: UI tuân theo nó vẫn trả lời bằng đúng những nhãn tùy chọn mà UI thông thường sẽ gửi, UI không nhận diện nhãn này sẽ render danh sách tùy chọn thông thường, do đó bên gọi đọc được cùng các trường câu trả lời trong cả hai trường hợp. `approve` chỉ định nhãn nào biểu thị chấp thuận, không phụ thuộc vào thứ tự tùy chọn. Có hai khẳng định không thể biểu đạt bằng kiểu dữ liệu, `ask()` sẽ từ chối chúng với `BAD_INTENT`: `approve` không khớp với bất kỳ tùy chọn nào của chính câu hỏi đó, và ý định rơi vào một câu hỏi không có `detail` — trong khi `detail` chính là thứ nó tự nhận đang xét duyệt.

## Trách nhiệm

Đây là gói Service Definition. Consumer như `@deepseek-ai/dsh-tool-ask-user` phụ thuộc vào service này; runtime host Web cung cấp Service Provider đi kèm sản phẩm. Vòng lặp giữ nguyên không đổi: lệnh gọi công cụ chờ Promise, kết quả công cụ sau đó khôi phục agent loop (vòng lặp tác tử) bình thường.

## Trải nghiệm mô hình

Gián tiếp, thông qua `dsh-tool-ask-user`: nó sẽ giữ lại câu trả lời thành công của provider dưới dạng JSON gọn nhẹ, hoặc trả về một trong các lỗi sau: `Error: ask_user_question was aborted before the user answered`, `Error: ask_user_question requires at least one question`, `Error: human interaction requires the exact live calling agent when an agent is supplied`, `Error: human interaction is unavailable while the calling agent is owned by another live agent; include the unresolved question or decision in the child agent's final result`, `Error: no user-questions provider is registered` hoặc `Error: <message>`. Chờ câu trả lời của con người không làm tăng token.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; mọi thay đổi tiền tố request do bên tiêu thụ nêu trên chịu trách nhiệm.

## Hạn chế đã biết và công việc hoãn lại

- **Mỗi ngữ cảnh chỉ có một provider**: không hỗ trợ định tuyến hay phân phối tới nhiều UI; đăng ký lần thứ hai sẽ ném `DUPLICATE_PROVIDER`, khi chưa đăng ký provider nào, `ask()` sẽ ném `NO_PROVIDER`, chứ không hạ cấp.
- **Từ vựng chỉ gồm hình thái biểu mẫu câu hỏi**: các tùy chọn có thể chọn cộng với văn bản tùy chỉnh tùy chọn; các hình thái tương tác phong phú hơn (bộ chọn tệp, xác nhận xem trước diff) chưa có từ vựng seam.
