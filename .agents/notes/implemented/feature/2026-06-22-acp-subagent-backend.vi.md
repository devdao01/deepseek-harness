# Agent Note: backend subagent ACP (ủy thác ngoài tiến trình)

Status: implemented

[English](2026-06-22-acp-subagent-backend.md) | Tiếng Việt

## Vấn đề

Thiết kế của subagent seam ([Agent Note seam](2026-06-21-subagent-capability-seam.md)) cho phép nhiều backend cùng tồn tại theo tên trong `ctx.subagents`. Backend trong tiến trình (`-spawn`/`-fork`) chạy agent con (tác tử) như một `Agent` thứ hai trên cùng một Cordis context: chi phí thấp, nhưng agent con dùng chung process, model client và tool với agent cha. Ý nghĩa cốt lõi của seam là đồng thời hỗ trợ agent con ngoài tiến trình đến qua giao thức, để chứng minh rằng abstraction này có thể áp dụng xuyên ranh giới process. Agent Note này thêm backend đầu tiên thuộc loại đó: một client ACP (Agent Client Protocol).

## Quyết định

`@deepseek-ai/dsh-subagent-acp` đăng ký một `SubagentProvider`, chạy mỗi agent con trong một child process được khởi động qua spawn, và điều khiển nó với vai trò *client* ACP. Nó là cặp song sinh đảo chiều của cầu nối phía server sẵn có `@deepseek-ai/dsh-acp` (*agent* ACP): cầu nối trả lời `initialize`/`newSession`/`prompt`; backend này gọi chúng và hiện thực callback `Client` (`sessionUpdate`, `requestPermission`). Trỏ lệnh spawn đã cấu hình vào ví dụ `acp-agent` sẽ cho phép harness giao tiếp với chính nó.

### Mỗi lần chạy khởi động một process hoàn toàn mới

Mỗi `start` spawn một child process mới, chạy đúng một phiên ACP (`initialize` → `newSession` → `prompt`), `dispose` giết child process và chờ nó thoát. Đây là vòng đời đơn giản nhất, nhất quán với hình thái trong tiến trình "mỗi lần chạy một agent con".

### Client stub tối giản

Client không khai báo bất kỳ năng lực tùy chọn nào (không `fs`, không `terminal`): agent con tự xử lý quyền truy cập file/terminal trong process của riêng nó. Thông báo `session/update` được tiêu thụ: backend tích lũy văn bản `agent_message_chunk` thành output kết quả, bỏ qua phần còn lại (suy nghĩ, thẻ lệnh gọi tool), nên chỉ phơi bày câu trả lời cuối cùng của agent con. `session/request_permission` được trả lời tự động theo chính sách đã cấu hình (`reject` từ chối mọi prompt, `allow` chấp thuận qua tùy chọn đầu tiên biểu thị sự cho phép) — không phơi bày bất kỳ prompt quyền hạn nào cho con người. Việc proxy `fs`/`terminal` ngược về process cha (chế độ workspace dùng chung) vẫn là công việc sau này, như Agent Note của seam đã nêu.

### Không có năng lực lúc khởi động

Toàn bộ `capabilities` của nhà cung cấp đều là `false`. Agent con ngoài tiến trình không thể tuân theo `maxDepth` của agent cha (nó không có quyền truy cập `parent.options.subagentDepth`) hoặc `toolFilter` (nó có registry tool riêng), giai đoạn này cũng chưa hiện thực `outputSchema`. Nếu yêu cầu cần bất kỳ tính năng nào trong số đó, dịch vụ sẽ từ chối trước khi `start` chạy. Backend chỉ tiêm `subagents` (chứ không phải `ctx.agents`); thứ duy nhất nó đọc từ `request.parent` là cwd của header phiên (xem phần giải quyết workspace bên dưới) — ngữ cảnh hội thoại, độ sâu và trạng thái tool đều không vượt qua ranh giới process.

### Giải quyết cwd của workspace

Thư mục làm việc của child process đến từ việc giải quyết tường minh, tuyệt đối không dùng cwd của process harness: nếu đã cấu hình override `cwd` triển khai, nó được chuyển thành đường dẫn tuyệt đối theo thư mục khởi động và được xác thực khi nạp; nếu không, dùng cwd của header phiên cha và xác thực khi khởi động; nếu cả hai đều không có, từ chối thẳng thắn trước khi spawn bất kỳ process nào. Một process server ACP phục vụ các phiên từ nhiều workspace, nên `process.cwd()` không thể thay thế workspace của phiên — phương án dự phòng ngầm định cũ sẽ khiến child process chạy trong thư mục khởi động của server. Đường dẫn ứng viên phải là thư mục tuyệt đối mà harness có thể truy cập vào được (yêu cầu `X_OK`; chỉ `statSync().isDirectory()` sẽ chấp nhận cả thư mục có mode-600, còn spawn sẽ thất bại với EACCES); cùng một đường dẫn đã giải quyết được dùng làm cả cwd của child process lẫn workspace `session/new` của ACP.

### Ánh xạ StopReason

`StopReason` ACP → `SubagentStopReason` của harness: `end_turn`→`completed`, `max_tokens`→`max-tokens`, `refusal`→`refusal`, `cancelled`→`aborted`, `max_turn_requests`→`error` (không có ngữ nghĩa tương đương, tác vụ chưa hoàn thành), không xác định→`error`. Khi spawn/truyền tải/RPC thất bại, kết quả là `error` (hoặc `aborted` nếu đã yêu cầu hủy); theo quy ước của seam, `result` không bao giờ reject khi thất bại ở cấp agent con.

### Bảo mật: làm sạch môi trường child process

Agent con là process độc lập, nên sẽ kế thừa biến môi trường. Các biến môi trường có dạng credential (`/KEY|PASSWORD|SECRET|TOKEN/i`) mặc định không được chuyển tiếp — khóa bí mật của chính harness cha không được rò rỉ ngầm vào process khởi động bằng spawn (cùng chính sách với bộ thực thi bash). Credential của riêng agent con (nó cần khóa model) được cung cấp tường minh qua `config.env`, được xếp chồng sau bước làm sạch, nên `DEEPSEEK_API_KEY` được truyền có chủ đích sẽ được giữ lại, còn `AWS_SECRET_ACCESS_KEY` tồn tại ngẫu nhiên thì không. stderr của child process được kế thừa vào stderr của process cha (thông tin chẩn đoán tự nhiên hiện ra); sự kiện `error` ở cấp spawn (ví dụ ENOENT khi lệnh không tồn tại) được bắt và chạy đua với việc điều khiển ACP, nên lệnh sai sẽ cho kết quả `error` thay vì làm sập process cha bằng lỗi chưa xử lý.

## Kiểm thử

- **Unit/integration test không cần khóa API:** một child process ACP được kịch bản hóa test luồng vào/ra của prompt qua stdio thật, toàn bộ ánh xạ stop-reason, hủy bằng tín hiệu và dispose (bao gồm pre-abort, race trước khi có phiên và trường hợp pipe đứt), hai chính sách quyền hạn, các update không phải tin nhắn bị bỏ qua, dọn dẹp khi thiếu lệnh, reload nhà cung cấp và export namespace.
- **Test tổ hợp Loader không cần khóa API:** một cordis.yml chỉ dùng cho test khởi động ứng dụng stdio qua Loader thật và bỏ qua `cwd` của backend; model được kịch bản hóa ủy thác một lần, còn child process được kịch bản hóa chứng minh nó chạy trong workspace của phiên cha, và ACP cũng công bố workspace đó ra ngoài, nhờ đó bao phủ đầu-cuối nhánh kế thừa cwd.
- **e2e test cần khóa API:** backend spawn một ví dụ ACP thật; model của nó trả lời `PONG`, ghi `proof.txt`, process cha xác minh file đó.
- **Khoảng trống snapshot:** mỗi agent con ACP là một process độc lập, có phiên replay của riêng nó, khác với việc replay theo phiên trong tiến trình. Mock server tất định hiện có đã bao phủ; `TODO(acp-subagent-replay)` theo dõi việc hỗ trợ replay agent con trong replay của process cha.

## Phương án thay thế đã cân nhắc

### Vì sao tiếp tục dùng SDK 0.25.1?

Backend chỉ cần `ClientSideConnection`, `ndJsonStream`, `PROTOCOL_VERSION` và các type giao thức client, 0.25.1 hỗ trợ đầy đủ. Fluent API của 0.28 yêu cầu di chuyển đồng thời class connection client và server ở tầng ACP, nhưng lại không cải thiện gì cho backend này, nên việc nâng cấp được giữ lại như một thay đổi độc lập.

### Vì sao không dùng child process bền vững?

Pool process bền vững (tái sử dụng child process nóng qua nhiều lần chạy) là một tối ưu hiệu năng, hoãn lại cho công việc sau này. Nó tăng độ phức tạp của vòng đời phiên và khôi phục sau crash, không cần thiết ở giai đoạn này; mỗi `start` spawn một child process hoàn toàn mới nhất quán với hình thái trong tiến trình "mỗi lần chạy một agent con".

## Hậu quả

Mỗi lần chạy phải trả giá bằng một child process hoàn toàn mới (spawn + `initialize` + `newSession`). Process cha chỉ phơi bày câu trả lời cuối cùng của agent con: suy nghĩ và thẻ lệnh gọi tool trong `session/update` bị tiêu thụ rồi loại bỏ, prompt quyền hạn không bao giờ đến tay con người — được trả lời bởi chính sách đã cấu hình. Môi trường child process mặc định đã qua làm sạch credential, nên khóa model của riêng nó cần được cung cấp tường minh qua `config.env`.

## Nhà cung cấp sản phẩm anh em

[Nhà cung cấp Codex app-server và Claude Code Agent SDK](2026-08-04-claude-code-and-codex-subagent-backends.md) đăng ký theo tên như những nhà cung cấp anh em, dùng cùng ranh giới khởi động/prompt/quyết toán/hủy ngoài tiến trình. A2A vẫn là phương thức truyền tải anh em trong tương lai; backend ACP đã chứng minh rằng subagent seam có thể hỗ trợ ranh giới này mà không cần chịu trách nhiệm về giao thức riêng của sản phẩm.
