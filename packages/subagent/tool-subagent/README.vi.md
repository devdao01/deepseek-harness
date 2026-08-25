# @deepseek-ai/dsh-tool-subagent

[English](README.md) | 中文

Công cụ ủy quyền hướng tới model, dựa trên một provider `ctx.subagents` đã được cấu hình. Đổi provider chỉ thay đổi tầng truyền tải (transport), không thay đổi quy ước thực thi.

## Lựa chọn provider và vòng đời

Mỗi instance plugin gắn một `provider` với một `toolName`; model sẽ không nhận được bộ chọn provider. Nếu cần công khai một tầng truyền tải khác, hãy nạp một instance khác có tên khác. Công cụ chỉ đăng ký khi provider của nó tồn tại, nhờ đó tránh phụ thuộc vào thứ tự nạp của các plugin cùng cấp và việc nạp lại provider. Mô tả công cụ tuân theo `provider.inheritsParentContext`: tạo mới một sub agent (agent con) cần prompt độc lập, còn fork sub agent thì đã thấy được các lượt (turn) đã hoàn thành của cấp cha.

Lời gọi ở foreground sẽ khiến tín hiệu thực thi xuyên suốt cả khởi động lẫn thực thi, chờ `run.result`, và luôn chờ `run.dispose()` trước khi trả về. Chỉ `completed` mới trả về giá trị chuẩn `{ kind: 'foreground', runId, output: JsonValue[] }`, và được render thành cùng một đoạn văn bản cuối cùng; abort, reject, vượt token cap và các lỗi khác đều trở thành kết quả công cụ báo lỗi, với thông điệp kèm theo phần văn bản còn giữ lại được của sub agent (tức phần được chọn ra từ `SubagentResult.output`) sau tiêu đề nguyên nhân kết thúc — câu trả lời bị cắt cụt sẽ không được báo cáo là thành công, và cũng không bao giờ bị âm thầm bỏ qua. Nếu cả việc thu thập kết quả lẫn dispose (giải phóng tài nguyên) đều bị reject, kết quả báo lỗi sẽ giữ lại cả hai thông tin chẩn đoán.

`backgroundMode` vừa chọn tuyến đường background vừa chọn hành vi mặc định khi bỏ qua `run_in_background`. `one-shot` mặc định chờ ở foreground; khi truyền `true` một cách tường minh, nó sẽ đăng ký một Task thông thường thuộc sở hữu của cấp cha, và trả về giá trị chuẩn `{ kind: 'background', jobId }`, được render thành `started background subagent job <id>`, ngay cả khi provider hỗ trợ sub agent có thể tiếp tục (continuable) cũng vậy. Công cụ Task chung chịu trách nhiệm về trạng thái tiếp theo, việc thu thập, hủy bỏ và thông báo của nó. `continuable` chạy ở background khi tham số bị bỏ qua hoặc là `true`; khi truyền `false` một cách tường minh thì sẽ chờ kết quả ở foreground. Tuyến background của nó đòi hỏi provider phải có năng lực `prepareContinuable`, gọi `ctx.subagents.startContinuable()`, và trả về `{ kind: 'continuable', subagentId }`, được render thành `started subagent <childId>`. Tuyến này kết toán khi inbox chấp nhận: từ đó sub agent sở hữu lượt (turn) của riêng nó, nên lời gọi này không chờ cũng không thu thập kết quả. Xem transcript (bản ghi văn bản) của nó qua id này vẫn là nguồn cung cấp đầu ra chi tiết, còn công cụ `send_message` toàn cục (tùy chọn) thì gửi thêm việc cho nó. Mỗi khi Activation của sub agent kết thúc, dịch vụ tiếp tục thực thi sẽ gửi một thông báo kết toán, kèm theo kết quả kết thúc và có thể có cả tin nhắn assistant cuối cùng, và việc gửi này không phụ thuộc vào `report`. Khởi động công việc có thể tiếp tục không yêu cầu phải nạp `send_message`. Xem [Agent Note về background subagent](../../../.agents/notes/implemented/feature/2026-07-08-background-subagent-tasks.md), [Agent Note về subagent có thể tiếp tục](../../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md) và [Agent Note về ủy quyền ưu tiên background](../../../.agents/notes/implemented/feature/2026-08-11-background-first-continuable-delegation.md).

`toolFilter` thay đổi tầng công cụ toàn cục của sub agent, nhưng không phải là giới hạn quyền được kế thừa từ cấp cha. Xem [mục tiêu phi bảo mật của agent-scoped](../../../.agents/notes/implemented/architecture/2026-07-08-agent-scope-contexts.md#security-and-authority-are-non-goals).

## Cấu hình

| Khóa | Ý nghĩa |
|---|---|
| `provider` (bắt buộc) | Tên provider (`spawn`, `fork`, `acp`, v.v.). |
| `toolName` | Tên hướng tới model, mặc định `subagent`; mỗi instance đã nạp phải khác nhau. |
| `enableRunInBackground` | Công khai chế độ background, mặc định `true`; khi tắt cũng sẽ từ chối lời gọi ép buộc chạy background. |
| `backgroundMode` | Chiến lược vòng đời background, mặc định `one-shot`. `one-shot` mặc định gọi ở foreground; `continuable` mặc định gọi ở background, đòi hỏi provider có năng lực `prepareContinuable`, và trả về ID sub agent đã được lưu bền vững, không yêu cầu phải nạp công cụ gửi tin nhắn tiếp theo. |
| `agentOptions` | `provider`, `model` và `maxTokens` (số nguyên dương) của sub agent truyền cho provider cụ thể; provider trong tiến trình sẽ ghi đè các tùy chọn kế thừa từ cấp cha bằng giá trị tường minh. |
| `persona` | Persona độc lập cho mỗi sub agent; đòi hỏi provider có năng lực `persona`. |
| `toolFilter` | Giới hạn công cụ toàn cục độc lập cho mỗi sub agent; đòi hỏi provider có năng lực `toolFilter`. |
| `maxDepth` | Giới hạn tuyệt đối về độ sâu ủy quyền, mặc định `3` (`0` cấm ủy quyền); giới hạn dạng số đòi hỏi năng lực `depthLimit`, thiếu năng lực này sẽ khiến việc mount thất bại. Với provider ngoài tiến trình mà ngân sách do sub-harness sở hữu, `'provider-managed'` sẽ không gửi giới hạn. Công cụ vẫn hiển thị khi đã đạt giới hạn; mỗi lần thử khởi động đều kiểm tra độ sâu hiện tại của agent gọi, bị từ chối thì trả về kết quả công cụ báo lỗi. |

## Đồng thời (Concurrency)

Cả lời gọi foreground lẫn background đều an toàn khi đồng thời: các ủy quyền cùng cấp trong cùng một tin nhắn assistant sẽ chồng lấn thực thi trong pool xoay vòng của vòng lặp (`maxParallelToolCalls`), kết quả vẫn được nộp theo đúng thứ tự của model. Sub agent làm việc trong session riêng của nó, một lần chạy không bao giờ thay đổi session cha; với dạng one-shot chạy background, thao tác ghi duy nhất vào trạng thái mà cấp cha sở hữu là đăng ký một Task — đây là một thao tác chèn đồng bộ, có thể hoán đổi, chịu được sự phân phối đồng thời, do đó các lời gọi background chồng lấn sẽ nhận job id riêng theo đúng thứ tự cuộc đua (race) khi phân phối. Việc phối hợp hiệu ứng workspace giữa các cấp cùng cấp do model chịu trách nhiệm, giống như model đã đảm nhận với sub agent background và sub agent có thể tiếp tục. Xem [Agent Note về subagent song song](../../../.agents/notes/implemented/feature/2026-08-09-parallel-subagent-delegations.md) và [Agent Note về thực thi lời gọi công cụ song song](../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md).

## Trải nghiệm model

### Tool schema

#### Model nhìn thấy gì

Khi provider tồn tại, schema [`subagent`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-subagent) mặc định đã sinh ra sẽ được công khai dưới tên đã cấu hình cho instance hiện tại. Việc provider có kế thừa context hay không sẽ thay đổi mô tả công cụ và mô tả prompt. Bật chế độ background sẽ thêm `run_in_background`: chế độ continuable sẽ ghi lại giá trị mặc định là `true`, thông báo kết toán tại thời điểm chạy, và khả năng ghi đè tường minh sang foreground; chế độ one-shot sẽ ghi lại giá trị mặc định là `false`, cùng job id để thu thập bằng `job_output` hoặc dừng bằng `job_kill`. Khi công cụ hiển thị trong phạm vi được lắp ráp ở lượt này, một section system prompt `tool:<toolName>` sẽ hướng dẫn model đồng thời khởi động các ủy quyền có thể tiếp tục độc lập với nhau, tiếp tục làm việc trong khi chúng đang chạy, và chỉ chọn foreground khi bước tiếp theo phụ thuộc vào kết quả; giới hạn công cụ sẽ đồng thời loại bỏ cả schema lẫn đoạn hướng dẫn này.

#### Ảnh hưởng Token

Mỗi request của cấp cha đều phát sinh chi phí token schema cố định; mỗi instance provider thêm một schema, mỗi instance continuable còn thêm một section system prompt ngắn.

#### Ảnh hưởng KV Cache

Miễn là instance provider, tên, mô tả và schema không đổi, tiền tố (prefix) sẽ giữ ổn định. Vòng đời đăng ký provider có thể khiến việc tái sử dụng của cấp cha thất hiệu kể từ định nghĩa công cụ đầu tiên bị thay đổi.

### Kết quả foreground

#### Model nhìn thấy gì

Lời gọi giữ lại mô tả và prompt. Khi thành công chỉ chứa văn bản cuối cùng của sub agent; các kết quả khác trở thành `Error: <message>`. Các bước trung gian của sub agent không đi vào cấp cha.

#### Ảnh hưởng Token

Prompt và kết quả sẽ ở lại lịch sử của cấp cha cho đến khi nén ngữ cảnh (context compaction); context làm việc của sub agent ở lại bên trong sub agent.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung hiển thị mới nằm sau tiền tố request có thể tái sử dụng, không làm thất hiệu các mục KV Cache hiện có.

### Kết quả background

#### Model nhìn thấy gì

Ở chế độ continuable đã cấu hình, nội dung trả về khi khởi động chính xác là `started subagent <childId>`; ở chế độ one-shot đã cấu hình, thì trả về `started background subagent job <id>`. Ở chế độ one-shot, giao diện Task chung cung cấp trạng thái tiếp theo, đầu ra cuối cùng, phản hồi hủy bỏ và thông báo. Ở chế độ continuable, công cụ này không trả về kết quả của riêng nó; việc kết toán của sub agent sẽ đến cấp cha qua [thông báo do dịch vụ chịu trách nhiệm](../subagent/README.md#settlement-notice), công cụ `send_message` được nạp độc lập sẽ gửi các tin nhắn tiếp theo, còn xem transcript của sub agent qua id của nó chính là nguồn cung cấp đầu ra chi tiết.

#### Ảnh hưởng Token

Thông điệp xác nhận sẽ được giữ lại; đầu ra cuối cùng của one-shot chỉ đi vào lịch sử của cấp cha khi được thu thập hoặc chèn vào, còn đầu ra của sub agent continuable thì không bao giờ được trả về qua công cụ này — thông báo kết toán của nó đến độc lập với bất kỳ kết quả công cụ nào.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung hiển thị mới nằm sau tiền tố request có thể tái sử dụng, không làm thất hiệu các mục KV Cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Chạy background không công khai kết quả qua công cụ này**: đầu ra cuối cùng của tác vụ one-shot được thu thập qua giao diện Task chung, đầu ra của sub agent continuable ở lại trong session của chính nó, đọc theo subagent id của nó. Thông báo kết toán sẽ nói rõ sub agent đó kết thúc như thế nào, kèm theo tin nhắn assistant cuối cùng nếu có, nhưng đó không phải là giá trị trả về của lời gọi này, cũng không thể chờ ở đây.
- **Instance one-shot đang chờ chỉ phát hiện tên trùng khá muộn** (`TODO(subagent-dup-toolname)`): instance continuable sẽ đặt trước tên section prompt trong quá trình plugin được áp dụng, nhưng để ngăn instance one-shot đang chờ rollback việc đăng ký provider, vẫn cần một registry tên dự kiến.
- **Chiến lược sub agent cho mỗi instance là cố định**: model khác, persona khác, bộ lọc công cụ khác hoặc giới hạn độ sâu khác đều cần một công cụ khác với tên khác.
