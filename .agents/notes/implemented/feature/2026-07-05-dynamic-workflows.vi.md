# Agent Note: Dynamic workflows — seam điều phối đa agent do script điều khiển

Status: implemented

[English](2026-07-05-dynamic-workflows.md) | Tiếng Việt

## Vấn đề

harness có thể ủy thác một tác vụ cho một subagent (tác tử con) thông qua `dsh-tool-subagent`, nhưng công việc cần phân tán ra nhiều phần độc lập — audit trên nhiều file, migration, khảo sát đa góc nhìn, xác thực đối kháng — buộc model phải điều phối theo từng lượt: mỗi kết quả trung gian rơi vào ngữ cảnh của cha, kế hoạch không có nơi lưu trữ bền vững, và việc điều phối mỗi bước đều tốn một lượt round-trip với model. Claude Code cung cấp năng lực này dưới dạng [dynamic workflows](https://code.claude.com/docs/en/workflows): model viết một đoạn script điều phối JavaScript, runtime thực thi nó, và script (chứ không phải hội thoại) nắm giữ vòng lặp, nhánh rẽ và kết quả trung gian.

## Quyết định

Cung cấp một tập năng lực workflow dưới `packages/workflow/` theo hình thái bash seam (Service Definition／Service Provider／Consumer), cùng với nền tảng structured output mà nó cần trên subagent seam.

### Quy ước script (tương thích Claude Code)

Một lần gọi workflow gồm `meta` JSON (`name`, `description`, và tùy chọn `whenToUse`/`phases`) cùng một `script` JavaScript hỗ trợ `await` ở top-level và trả về một giá trị JSON. Metadata chỉ dùng để xác thực dữ liệu, không bao giờ được thực thi. Phần thân nhận `agent(prompt, options)`, `parallel(thunks)`, `pipeline(items, ...stages)`, `phase(title)`, `log(message)` và `args`. Mỗi stage của pipeline nhận `(prev, item, index)`, không có rào chắn giữa các stage; subagent thất bại và lỗi stage thông thường sẽ khiến item bị ảnh hưởng settle thành `null` và bỏ qua các stage còn lại. Ràng buộc tính xác định (determinism) của Claude Code được hoãn triển khai cùng với cơ chế logging, vì vậy phần thân script tương thích, sau khi chuyển header meta vào tham số, có thể dùng đồng hồ và số ngẫu nhiên.

Có một điểm khác biệt cố ý nghiêm ngặt hơn so với CC: lỗi dùng sai hook — option không xác định hoặc bị hoãn (`effort`/`isolation`/`agentType`), tham số sai định dạng, schema vượt quá tập con được hỗ trợ, chạm mức trần, seam khởi động thất bại — sẽ ném ra `WorkflowError` kèm `fatal: true`, và bộ kết hợp (combinator) sẽ ném lại lỗi fatal thay vì đặt item thành null. Nếu không làm vậy, một option gõ sai chính tả sẽ âm thầm biến thành một `null` không thể phân biệt với việc subagent thất bại — đây chính là kiểu lỗi "được chấp nhận rồi bị bỏ qua" mà repo này cấm. Có thêm một điểm mới: tham số `args` của tool là một JSON object (danh sách trần được bọc thành một field), giữ cho wire format trung thực.

### Seam (dsh-workflow)

`ctx.workflowEngine` là `WorkflowEngine` trừu tượng theo hình thái bash — mỗi context có một engine, không có registry provider có tên (engine là thứ được thay thế ở cấp triển khai, không phải thứ cùng tồn tại song song). `start(request)` ném lỗi đồng bộ đối với script không thể khởi động; `result` của `WorkflowRun` trả về không bao giờ reject (khi thất bại sẽ settle thành `stopReason: 'error' | 'cancelled'`). Các sự kiện `workflow/*` chỉ để quan sát (emit), mang theo snapshot dữ liệu (id + meta; `workflow/end` bỏ qua giá trị result), cô lập theo từng listener, đối xứng với `subagent/start`/`subagent/end` — quyền kiểm soát vẫn nằm trong tay người giữ run. Chi tiết từ vựng xem [subsystems/workflow.md](../../../../docs/subsystems/workflow.md).

### Engine (dsh-workflow-worker-thread): mỗi lần chạy một worker thread

**Tiền đề tin cậy**: script workflow có cùng mức tin cậy như quyền truy cập bash của model. Engine giới hạn tác động của một script có lỗi, và đảm bảo kết quả đã settled, giá trị có thể biểu diễn an toàn dưới dạng JSON, dừng hoàn toàn sau khi hủy; nó không phòng thủ trước mã độc. vm context và worker thread không phải là ranh giới an toàn: script có thể thoát ra Node API với quyền cấp process. Sandbox hóa cần một process riêng hoặc engine isolated-vm phía sau seam này.

**Vì sao chọn `node:worker_threads`**: mỗi lần chạy nhận một worker không pooled. vm context giới hạn API script như tài liệu mô tả, còn message port RPC bắc cầu `agent()` tới sub-loop phía host. Worker ngăn công việc đồng bộ của script chặn host, cung cấp ranh giới serialization, và cho phép buộc kết thúc sau khi hủy. `isolated-vm` bị bác bỏ vì trạng thái bảo trì và yêu cầu triển khai của nó.

Host xác thực metadata và parse phần thân trước khi publish. Payload map với khóa enum riêng tư định nghĩa wire format; bản ghi pending-start, bản ghi published-child, tín hiệu hủy duy nhất, thu hồi khi worker chết, ưu tiên kết quả và settle hoàn toàn khi dispose (giải phóng tài nguyên) đều giữ quy ước subagent run trên protocol này. Các thuật toán race condition này được định nghĩa trong [Agent Note thiết kế runtime phạm vi agent](../architecture/2026-07-12-agent-scope-runtime-design.md#workflow-children-are-pending-starts-or-published-records).

Engine cung cấp một đường test `MessageChannel` trong tiến trình, vì V8 coverage của tiến trình chính không thể quan sát việc thực thi trong worker.

**Meta là dữ liệu**: trường `meta` đã qua xác thực schema đến seam dưới dạng JSON, chỉ kiểm tra hình dạng. Host không bao giờ thực thi literal metadata, nếu không thì accessor do script kiểm soát có thể chạy bên ngoài worker isolation.

**Ranh giới giá trị**: `materializeFromRealm` sao chép giá trị đi ra ngoài, và từ chối function, symbol, `undefined` lồng nhau, prototype khác thường, tham chiếu vòng, mảng thưa (sparse array) và số không hữu hạn. Việc sao chép data property khiến `"__proto__"` an toàn; getter đọc bình thường, getter ném lỗi sẽ báo lỗi rõ ràng. `args` được truyền qua `workerData`, và được clone lại trước khi phơi bày. Hàm trong realm được gọi chứ không sao chép, giá trị bị ném ra dùng bộ render có định nghĩa cho mọi input, nên `result` sẽ không bao giờ reject. Lỗi hook là `WorkflowError` của host realm, script nên rẽ nhánh dựa trên `name` hoặc `code` thay vì `instanceof Error`, như README của engine đã nêu. Giới hạn concurrency, total-agent, item, timeout và grace đều là config đã qua xác thực.

### Consumer (`dsh-tool-workflow`)

Một tool `workflow` phản chiếu hình thái đồng bộ của `dsh-tool-subagent`: start, await, `try/finally` dispose, abort bắc cầu `exec.signal`, không phải `completed` → `isError`. Ý định render UI: một card `generic` lấy tham số `meta.name` của lệnh gọi làm tiêu đề (hiển thị là hàm thuần của tham số). Mô tả tool chính là spec viết cho model. Chính sách sử dụng đi kèm đoạn prompt `tool:<toolName>` của chính tool khi phát hành (hướng dẫn chỉ dùng khi được yêu cầu rõ ràng — hướng dẫn tool nằm trong plugin của tool, không bao giờ nằm trong persona triển khai); harness không có cổng effort kiểu ultracode.

Đối với việc thực thi tool ở cấp top-level, cùng consumer đó cũng ghi vòng đời của run và các member thực tế vào Session cha của bên gọi, tạo thành bốn loại sự kiện `tool-workflow/*` chỉ để log. Đường ghi log chỉ quan sát, không kiểm soát việc thực thi: lần append đầu tiên thất bại sẽ vô hiệu hóa các lần ghi tiếp theo của run này và để lại một prefix hợp lệ, không làm thay đổi kết quả tool. [`ui-workflow-run`](../../../../packages/client/ui-workflow-run/README.md) tái dựng những sự kiện này qua Conversation Node engine, tạo thành một dòng Chat có key riêng; dòng tool generic hiện có vẫn giữ hiển thị riêng của nó. Chi tiết quyết định về persist, replay, mở rộng/thu gọn và điều hướng thời gian thực xem [Persistent workflow runs trong Chat](2026-08-10-durable-workflow-runs-in-chat.md).

### Nền tảng: structured output trên subagent seam

`SubagentStartRequest.outputSchema` được `dsh-subagent-in-process-driver` triển khai cho hai backend chạy trong tiến trình. Mỗi structured subagent nhận tool capture, hướng dẫn và đăng ký bắt buộc trong phạm vi riêng trên `child.ctx`; các subagent chạy song song có thể dùng schema khác nhau mà không chia sẻ policy có thể thay đổi, và dispose subagent sẽ gỡ toàn bộ phần đính kèm.

Output schema khiến việc capture đã commit hợp lệ theo schema trở thành điều kiện cần để subagent hoàn thành thành công. Scoped runtime hiển thị tool capture và hướng dẫn, chỉ commit kết quả cuối cùng thành công (bao gồm kết quả của `run_code` ở lớp ngoài khi gọi qua SDK), từ chối các side effect tiếp theo sau khi capture chuyển sang pending, và dừng subagent ngay khi commit xong mà không chạy thêm bước model nào. Xác thực thất bại vẫn là lỗi tool có thể thử lại; hoàn thành bình thường mà không có capture đã commit sẽ settle thành lỗi.

`ObjectJsonSchema` là view phía consumer gốc đối tượng (object root) do tập con JSON Schema thống nhất và có thể cưỡng chế của `dsh-tools` cung cấp; các từ khóa không được hỗ trợ sẽ báo lỗi rõ ràng, vì dữ liệu protocol này trở thành parameters của tool capture nguyên văn. [Agent Note unified JSON value schema DSL](../architecture/2026-07-20-unified-json-value-schema-dsl.md) định nghĩa từ vựng và ngữ nghĩa xác thực, còn [Agent Note thiết kế runtime phạm vi agent](../architecture/2026-07-12-agent-scope-runtime-design.md#structured-output-commits-only-authoritative-outcomes) định nghĩa thuật toán lắp ráp, commit, guard và dừng khi kết thúc.

## Kiểm thử

Logic phía worker chạy qua `MessageChannel` trong tiến trình, để V8 coverage có thể đo được nó. Unit test bao phủ các script helper, lỗi fatal và nullable, ranh giới JSON, mức trần, hủy, quyền sở hữu subagent và structured output qua một vòng lặp thực. Smoke test cho binary sau khi build chạy `lib/worker.cjs` được đóng gói riêng dưới Node thuần, e2e có key thực chạy subagent thực, và hành vi workflow hướng tới model được bao phủ bằng snapshot qua ví dụ tương ứng.

## Hoãn lại (non-goal rõ ràng)

- **Thu thập nền (background)** (tool khởi động → run id → thông báo hoàn thành → thu thập), sẽ được thiết kế cùng với việc thống nhất background của shell/subagent.
- **Log hóa + phục hồi** (`resumeFromRunId`, prefix `agent()` đã cache): triển khai điều này sẽ tái đưa lệnh cấm tính xác định của CC trở lại dưới dạng thắt chặt quy ước script (script hiện tại có thể đọc đồng hồ).
- **Workflow đã lưu/đóng gói** (registry `.deepseek/workflows/`, API slash command) và **persist script vào thư mục run** (sự kiện tool call đã ghi lại script rồi).
- **`workflow()` lồng nhau**, **`budget` token**, và các option agent `effort`/`isolation`/`agentType` (mỗi cái đều bị từ chối rõ ràng, kèm ghi chú trong message rằng chúng đã bị hoãn triển khai).
- **Timeout wall-clock cho toàn bộ run**: hủy luôn giải phóng bên gọi (result settle trong thời gian ân hạn), nên mức trần thời gian chạy tổng thể là một nút điều chỉnh chính sách cho việc thiết kế lại background, không phải yêu cầu đúng đắn ở đây.
- **Gia cố engine vượt ra ngoài worker thread**: dùng isolated-vm hoặc engine process riêng phía sau cùng seam này (sandbox hóa thực sự; giới hạn bộ nhớ).
- **Structured output cho backend ACP (Agent Client Protocol)** và **`toolFilter`** (cả hai vẫn bị chặn bởi capability flag `false`).

## Phương án từng cân nhắc

- **Bảo vệ giá trị độc hại phía host** (proxy từ chối không có trap, duyệt descriptor không bao giờ gọi accessor, pre-render giá trị ném ra ở phía realm, clone promise/array/error dựng ở realm cộng nhận diện fatal có cấu trúc): bị bác bỏ. Mỗi lớp phòng thủ đều nhắm vào tác giả mà tiền đề tin cậy đã chấp nhận, trong khi ranh giới serialization của thread đã đảm bảo về mặt cấu trúc rằng việc xử lý giá trị xuyên realm có kết quả xác định cho mọi input.
- **Thực thi `node:vm` trong tiến trình**: đơn giản nhất về mặt cơ học — không RPC, không thread — nhưng `start()` sẽ chặn bên gọi trong lát cắt đồng bộ đầu tiên của script, vòng lặp đồng bộ sau await đầu tiên không thể bị kết thúc trong tiến trình (`timeout` của vm chỉ bao phủ lát cắt đầu tiên), và `dispose()` chỉ có thể bỏ mặc một script chưa settle trên vòng lặp host. Engine worker thread giữ nguyên API script vm context tương tự, đồng thời gỡ bỏ việc chặn host và khiến việc kết thúc trở nên khả thi thực sự.
- **Thực thi nền làm mặc định** (hình thái của CC): hoãn lại. Đồng bộ ở foreground nhất quán với hình thái hiện tại của `dsh-tool-subagent`, và ngữ nghĩa background nên được thiết kế thống nhất một lần giữa bash, subagent và workflow, thay vì thiết kế riêng lẻ từng tool.
- **Lớp workflow tự parse JSON cho `agent({schema})`**: lặp lại mối quan tâm của seam trong một consumer, trong khi capability flag của seam vẫn không trung thực khi là `false`.
- **Nhúng Meta vào script dưới dạng `export const meta = {...}`** (đúng định dạng của CC): giữ script tự chứa và script CC có thể dùng trực tiếp, nhưng lấy meta đòi hỏi thực thi văn bản do model viết trên host. Ngay cả một vm context giới hạn thời gian rỗng cũng không thể ràng buộc getter do script kiểm soát (khi host đọc object kết quả). Tham số JSON loại bỏ lỗ hổng scanner, thực thi và vòng lặp đồng bộ trên host; cái giá phải trả là header meta của script CC phải chuyển vào tham số (phần thân vẫn dùng trực tiếp được).
- **`ValueSchemaSpec` làm kiểu protocol cho `outputSchema`**: hình thức hướng tới tác giả hiện có từ vựng tương đương, nhưng workflow cung cấp dữ liệu JSON Schema gốc từ realm khác; giả vờ dữ liệu runtime dạng này là khai báo đáng tin của tác giả sẽ bỏ qua ranh giới xác nhận schema gốc.
- **Thư viện đối tượng schema (zod hoặc schemastery của repo này) cho tập con structured output**: schema là dữ liệu protocol — JSON thuần, vượt ranh giới realm vm trong `agent({schema})` và rơi nguyên văn vào parameters của tool cưỡng chế — chính xác là nơi đối tượng schema sống (live schema object) không thể tồn tại; tiêu thụ JSON Schema gốc tại runtime cần thêm một bộ chuyển đổi bên thứ ba phía trên (zod core chỉ xuất ra JSON Schema, không thể chuyển ngược), và sẽ đặt một ngôn ngữ schema thứ hai cạnh vai trò cấu hình của schemastery.
- **ajv cho việc xác thực giá trị**: nó xác thực toàn bộ JSON Schema, nên việc chặn tập con — điểm mấu chốt thực sự của module, vì mỗi từ khóa được chấp nhận đều phải được harness cưỡng chế — dù sao vẫn phải viết tay; nó biên dịch validator bằng `new Function`; và nó sẽ trở thành dependency runtime đầu tiên của dsh-tools, chỉ để thay thế khoảng 70 dòng bộ duyệt giá trị, trong khi báo cáo lỗi kèm path và báo từng vi phạm dù sao cũng phải tự viết.
- **JSON mode phía provider thay cho tool capture**: nó đảm bảo JSON hợp lệ, nhưng không đảm bảo tuân theo schema, và tương tác của nó với tool call không rõ ràng. Tool capture giữ được khả năng retry xác thực trong cùng lượt. Schema tool nghiêm ngặt phía provider sau này có thể thu hẹp tập con được chấp nhận mà không thay đổi thiết kế này.

## Hệ quả

Kế hoạch phân tán giờ tồn tại trong một script có thể chạy lại, `outputSchema` cung cấp kết quả subagent có cấu trúc đáng tin cậy. Mỗi lần chạy tốn chi phí khởi động worker và message port RPC, nhưng host khởi động không bị chặn, hủy có thể kết thúc worker, và serialization cưỡng chế ranh giới giá trị. Worker thread không phải là ranh giới an toàn. Option không hợp lệ sẽ thất bại thay vì suy biến thành `null` như Claude Code; consumer giữ quyền kiểm soát qua run handle, observer chỉ nhận snapshot. Người dùng Web ở cấp top-level còn nhận được bản ghi workflow bền vững, có thể replay, mà không mở rộng execution seam, cũng không gắn chặt card tool gốc vào UI riêng cho workflow.
