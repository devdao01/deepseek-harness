# Agent Note: seam năng lực subagent

Status: implemented

[English](2026-06-21-subagent-capability-seam.md) | Tiếng Việt

> Seam đầy đủ đã được giao: interface `dsh-subagent` và bên tiêu thụ `dsh-tool-subagent`; hai backend chạy trong tiến trình (`dsh-subagent-spawn-in-process`, `dsh-subagent-fork-in-process`); hạ tầng snapshot cho agent (tác tử) lồng nhau ([replay snapshot theo từng phiên](../testing/2026-06-22-subagent-snapshot-replay.md)); và các backend ngoài tiến trình ACP (Agent Client Protocol), Codex và Claude Code ([Agent Note ACP](2026-06-22-acp-subagent-backend.md), [Agent Note nhà cung cấp sản phẩm](2026-08-04-claude-code-and-codex-subagent-backends.md)).

## Vấn đề

harness có một seam bị treo lâu ngày dành cho **subagent**: một agent ủy thác công việc cho một agent khác. Ý định này đã có bản nháp trong interface `Agent`/`AgentLoop` ([packages/core/agent/src/types.ts](../../../../packages/core/agent/src/types.ts), [packages/core/agent-loop/src/index.ts](../../../../packages/core/agent-loop/src/index.ts)): một tùy chọn tạo mới tham chiếu agent cha (fork = khởi tạo phiên con bằng event log của phiên cha; spawn = phiên hoàn toàn mới), agent con trả về dưới dạng handle `Agent`, giúp steering (dẫn dắt giữa chừng) và đăng ký sự kiện hoạt động một cách thống nhất.

**Nhiều cài đặt subagent phải cùng tồn tại lúc runtime.** Một agent cha, trong cùng một phiên, có thể vừa cần một agent con trong tiến trình rẻ tiền để xử lý subtask phạm vi giới hạn, vừa cần một agent con ngoài tiến trình được cô lập (qua ACP). Các phương thức truyền tải:

- **Trong tiến trình**: tạo một `Agent` con cụ thể trên cùng một `Context` (rẻ nhất, xét đến chi phí gần như bằng không của các agent factory sẵn có);
- **ACP**: đóng vai trò *client* ACP điều khiển một process agent khác (có thể là một instance khác của chính nó);
- **Codex app-server và Claude Code Agent SDK**: các nhà cung cấp cùng loại một lần hiện có, áp dụng cùng một quy ước nhà cung cấp có tên cho các process sản phẩm chính thức ([Agent Note nhà cung cấp sản phẩm](2026-08-04-claude-code-and-codex-subagent-backends.md));
- Về sau: **A2A**, dùng cùng hình thái ngoài tiến trình: "khởi động agent con, gửi prompt, quyết toán, hủy".

## Phương án thay thế đã cân nhắc

### Vì sao không dùng hình dạng của bash seam

bash seam ([capability seam](../architecture/2026-06-13-capability-seams.md)) chỉ đăng ký đúng một `ShellExecutor` trong mỗi context; nạp cái thứ hai sẽ ném lỗi. Điều này đúng với bash (một máy, một cách thực thi lệnh), nhưng sai ở đây: nhu cầu chính là cùng tồn tại. Vì vậy dịch vụ subagent là một **registry nhà cung cấp có tên** — mỗi cài đặt đăng ký với tên duy nhất, bên gọi chọn theo tên — phản chiếu **registry adapter LLM (mô hình ngôn ngữ lớn)** (`LlmRuntime.registerAdapter`), chứ không phải bộ thực thi bash dịch vụ đơn. Seam vẫn là cấu trúc ba loại package (Service Definition / Service Provider / Consumer); chỉ khác ở chiều "một vs. nhiều cài đặt".

## Quyết định

### Ranh giới gồm ba loại package

Tạo nhóm package mới `packages/subagent/`:

| Package | Vai trò |
|---|---|
| `@deepseek-ai/dsh-subagent` | Interface: `SubagentRuntime` (`ctx.subagents`), `SubagentProvider`, `SubagentRun`, yêu cầu, kết quả, từ vựng năng lực, sự kiện `subagent/*` |
| `@deepseek-ai/dsh-subagent-spawn-in-process` | Cài đặt: tạo agent con trong tiến trình hoàn toàn mới qua `ctx.agents.create` |
| `@deepseek-ai/dsh-subagent-fork-in-process` | Cài đặt: agent con trong tiến trình được khởi tạo bằng snapshot log của agent cha |
| `@deepseek-ai/dsh-subagent-acp` | Cài đặt: đóng vai trò client ACP điều khiển một child process đã cấu hình |
| `@deepseek-ai/dsh-subagent-codex` | Cài đặt: process Codex app-server chính thức dùng một lần |
| `@deepseek-ai/dsh-subagent-claude-code` | Cài đặt: process Claude Code chính thức dùng một lần chạy qua Agent SDK |
| `@deepseek-ai/dsh-tool-subagent` | Bên tiêu thụ: tool `subagent` hướng model, dựa trên `ctx.subagents` |

### Nguyên thủy: `start → SubagentRun` bất đồng bộ

Nhà cung cấp phơi bày `start(request) → Promise<SubagentRun>`. Khi hoàn tất, một agent con được publish, và handle chạy của nó được chuyển giao cho bên gọi. Công việc thất bại trước khi publish sẽ reject `start()`, còn prompt, turn, hủy và kết quả hạ tầng sau khi publish sẽ quyết toán qua `run.result`, không che giấu child id. Cùng một tín hiệu bao phủ việc hủy trước và sau publish; `dispose()` (giải phóng tài nguyên) hủy công việc còn lại và chờ dừng hoàn toàn. Khi khởi động bị từ chối, tài nguyên chưa publish được dọn dẹp và không phát ra sự kiện vòng đời; nếu kết quả sau publish thất bại thì cặp sự kiện vòng đời đã publish sẽ được kết thúc. `start` độc lập với phương thức truyền tải; `spawn` chỉ ám chỉ backend trong tiến trình hoàn toàn mới.

### Hai loại năng lực tùy chọn, hai cách phát hiện

- **Tính năng tại thời điểm khởi động** (`outputSchema`, `depthLimit`, `toolFilter`, `persona`) gắn trên descriptor `provider.capabilities` tĩnh. Dịch vụ kiểm tra mỗi tính năng được yêu cầu trước khi ủy thác, và nếu nhà cung cấp không hỗ trợ thì **từ chối thẳng thắn** (`SubagentError('UNSUPPORTED_CAPABILITY')`), không bao giờ chấp nhận rồi âm thầm bỏ qua. Các tính năng này phải được kiểm tra trước khi run tồn tại, nên không thể là phương thức runtime.
- **Có thể tiếp tục tạo** dùng phương thức tùy chọn `SubagentProvider.prepareContinuable`; sự tồn tại của phương thức tự nó là năng lực, việc thu hẹp type của TypeScript chính là cơ chế phát hiện, nên không cần một flag riêng có thể lệch pha với cài đặt. Trình quản lý tiếp tục thực hiện việc gửi tiếp theo và khôi phục nguội trực tiếp qua `AgentHandle`, còn `SubagentRun` dùng một lần không có thao tác steering hay resume, chi tiết cụ thể ở [subagent có thể tiếp tục](2026-07-28-continuable-subagent-conversations.md).

### Fork và fresh là các backend độc lập, không phải một flag

Agent con hoàn toàn mới và agent con fork là các nhà cung cấp độc lập, không phải một flag trong request. `dsh-subagent-spawn-in-process` khởi động agent con cô lập; `dsh-subagent-fork-in-process` khởi tạo agent con bằng một tiền tố cân bằng chỉ chứa các turn cha đã hoàn thành. Turn đang diễn ra bị loại trừ vì lệnh gọi subagent của nó chưa có kết quả, không thể tạo thành lịch sử replay hợp lệ.

### Cô lập agent con và log cha

Mỗi subagent trong tiến trình chạy trong **`Session` của riêng nó** (id riêng, phả hệ `parentSession`), được persist độc lập. Nhà cung cấp ACP remote và nhà cung cấp sản phẩm dùng một lần thì sinh ra một id vòng đời có phạm vi cha, không phơi bày `Agent` hay `Session` con cục bộ nào; trạng thái nội bộ của nó nằm lại trong process remote. Ở cả hai hình thức, log của cha chỉ ghi lại `tool/call` spawn và `tool/result` của nó (output cuối cùng của agent con), còn bước và lệnh gọi tool của agent con đều nằm ngoài log của cha.

### Thu thập đồng bộ (phiên bản đầu)

`dsh-tool-subagent` truyền tín hiệu thực thi của nó cho `start()`, chờ kết quả của agent con, và dispose run đó trước khi báo cáo. Kết quả ở trạng thái chưa hoàn thành trở thành kết quả lỗi, chứ không phải output từng phần thành công; việc reject kết quả và dispose độc lập với nhau, và cả hai thông tin chẩn đoán đều được giữ lại.

### Việc chọn nhà cung cấp là cấu hình, không hướng tới model

`dsh-tool-subagent` gắn với đúng một tên nhà cung cấp (`Config.provider`); model chỉ thấy `{ description, prompt }`. Muốn phơi bày nhiều phương thức truyền tải, hãy nạp plugin tool này nhiều lần, mỗi lần gắn với một nhà cung cấp và một `toolName` khác nhau (registry tool từ chối trùng tên). *Dịch vụ* giữ registry đa nhà cung cấp; *tool* chọn một trong số đó — schema không có tham số nhà cung cấp/type.

## Kiểm thử

Test registry và tool chỉ dùng nhà cung cấp được kịch bản hóa trong package để thay thế agent con phi xác định, đồng thời test `SubagentRuntime` thật, vòng đời, tích hợp task và tool hướng model. Test hồi quy loader vẫn bao phủ export của nhà cung cấp và bên tiêu thụ, để ngăn thất bại được mô tả trong [postmortem 0001](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md). Test registry bao phủ an toàn khi reload, trùng tên và từ chối năng lực lúc khởi động; kịch bản agent lồng nhau được replay không cần khóa API qua [replay snapshot theo từng phiên](../testing/2026-06-22-subagent-snapshot-replay.md); backend trong tiến trình còn có unit test vòng lặp thật và e2e test cần khóa API.

## Hậu quả

- **Đệ quy.** Nếu không giới hạn, agent con trong tiến trình có thể thấy tool ủy thác và gọi đệ quy. Backend trong tiến trình hiện thực giới hạn độ sâu tuyệt đối tùy chọn và `toolFilter` toàn cục có phạm vi theo thời gian thực; ACP khai báo cả hai năng lực này ở trạng thái tắt, và từ chối các yêu cầu như vậy. [Agent Note kiểm soát tổ hợp subagent](2026-07-12-subagent-persona-tool-filter-and-depth.md) chịu trách nhiệm định nghĩa ngữ nghĩa chính xác và ranh giới an toàn của chúng.
- **Chặn turn của cha.** Việc thu thập ở tiền cảnh giữ bước của agent cha mở trong suốt thời gian tồn tại của agent con. Ủy thác nền dùng runtime `ctx.jobs` dùng chung và tool `job_*` chung, chia sẻ cùng bộ thu thập với bash nền; bản thân seam subagent vẫn không nhận biết task.
- **Tiến độ theo thời gian thực.** Chỉ phơi bày sự kiện vòng đời và kết quả cuối cùng; luồng cập nhật con→cha theo từng mảnh được hoãn lại đến khi thiết kế lại phần nền.
- **Interface client ACP.** Việc proxy `fs`/`terminal` của agent con ACP ngược về agent cha (chế độ workspace dùng chung) là công việc sau này; backend này không khai báo hai năng lực đó, agent con tự phục vụ trong process của riêng nó.
