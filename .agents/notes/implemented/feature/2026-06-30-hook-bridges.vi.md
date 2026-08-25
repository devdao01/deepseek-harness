# Agent Note: dsh-hooks-claude-code + dsh-hooks-codex — plugin cầu nối hook Claude Code / Codex

Status: implemented

[English](2026-06-30-hook-bridges.md) | Tiếng Việt

## Vấn đề

Bề mặt mở rộng của harness là các điểm chặn được định kiểu (typed interception point) của nó (xem [Agent Note điểm mở rộng chặn](2026-06-30-interception-extension-points.md)): cái gọi là "hook gốc" thực chất chỉ là một plugin Cordis bình thường, đăng ký `agent/session-start`, `agent/pre-step`, `tools/pre-execute`, `tools/post-execute`, `agent/turn-stopping`, `subagent/start` hoặc `subagent/end`. Nhưng người dùng đến với cấu hình hook **sẵn có** của Claude Code (CC) và Codex, một `hooks.json` (hoặc key `hooks` trong file settings) đầy các hook lệnh shell, và muốn chúng chạy nguyên trạng. Agent Note này giới thiệu hai **plugin cầu nối**, dịch giao thức hook shell bên ngoài sang các điểm mở rộng được định kiểu, xây trên thư viện format giao thức (wire format) dùng chung (xem [Agent Note hook-protocol-lib](2026-06-30-hook-protocol-lib.md)).

Quy tắc cốt lõi là: **cầu nối là adapter tương thích, không phải công cụ cao cấp.** Những gì cầu nối có thể làm (chặn tool, tiêm ngữ cảnh, buộc tiếp tục, quan sát subagent), plugin Cordis gốc đều làm được mạnh hơn — giá trị trả về được định kiểu, `ctx` đầy đủ, không có ranh giới serialize. Lý do cầu nối tồn tại là để chạy tập con được hỗ trợ rõ ràng của các hook lệnh CC/Codex bên ngoài. Điều này giữ mỗi cầu nối tinh gọn: phân giải cấu hình, chọn matcher pattern, xây payload cho từng sự kiện, gọi `runHook` + `mergeHookOutputs` của thư viện dùng chung, rồi ánh xạ kết quả trung tính thành Decision được định kiểu. README của mỗi package duy trì danh sách đầy đủ các sự kiện chưa được hỗ trợ và các trường chỉ được hỗ trợ một phần, đối chiếu với giao thức chính thức.

## Quyết định

Hai plugin độc lập trong nhóm `packages/hooks/`, mỗi cái là plugin function/namespace (`name`/`inject`/`Config`/`apply`, không có default export — xem [postmortem 0001](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md)), chỉ tiêm `bash`:

- **`dsh-hooks-claude-code`** — phương ngữ CC. Bảy trong số các điểm hook hiện tại của Claude Code: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart` và `SubagentStop`. Chịu trách nhiệm xây payload stdin theo từng sự kiện dạng CC (trường cơ sở `session_id`/`transcript_path`/`cwd`/`hook_event_name` cộng trường từng sự kiện), biến môi trường `CLAUDE_PROJECT_DIR` cộng thay thế `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PROJECT_DIR}`, cùng matcher pattern dạng literal hoặc regex. `transcript_path` là kết quả từ trình định vị bền vững hoặc `''`; stdin có **ký tự xuống dòng ở cuối**.
- **`dsh-hooks-codex`** — năm trong số các điểm hook hiện tại của Codex: `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit` và `Stop`. Nó dùng matcher luôn diễn giải theo regex, xuất payload dạng snake_case theo phong cách Codex (kèm trường thêm `turn_id`/`model`/`permission_mode`) và ghi không có ký tự xuống dòng ở cuối, không tiêm biến môi trường plugin Codex, không thay thế placeholder lúc cấu hình, cũng không có đường phê duyệt hay viết lại trước-tool. `transcript_path` là kết quả cùng trình định vị hoặc `null`; payload tool mang `tool_name` thật trong hình dạng `tool_input: { command }` đã tinh giản.

### Ánh xạ Outcome → Decision

Mỗi cầu nối ánh xạ `MergedHookOutcome` trung tính do thư viện dùng chung trả về thành Decision được định kiểu riêng cho từng điểm mở rộng:

| Điểm mở rộng | CC | Codex |
|---|---|---|
| `agent/session-start` (emit) | additionalContext → `agent.inject()` | Output stdout thuần → additionalContext → `agent.inject()` |
| `agent/pre-step` | `deny`→`reject`; chỉ ngữ cảnh→ủy quyền và gấp vào `enter` | `block`→`reject`; chỉ ngữ cảnh→ủy quyền và gấp vào `enter` |
| `tools/pre-execute` | `deny`→`deny`; `ask`→`ask` | `block`→`deny` (không có allow/ask) |
| `tools/post-execute` | `deny`→`block`+phản hồi; chỉ ngữ cảnh→ủy quyền và gấp | Như trên |
| `agent/turn-stopping` | Stop bị chặn → steering (dẫn dắt giữa chừng) bước tiếp theo | Như trên |
| `subagent/start` (emit) | additionalContext → tiêm vào subagent trong tiến trình còn sống; subagent remote không có mục tiêu tiêm cục bộ | Cầu nối này không hỗ trợ |
| `subagent/end` (emit) | Chỉ quan sát | Cầu nối này không hỗ trợ |

Kết quả `ask` của cầu nối CC là một đường quyền hạn thực sự, không phải quyết định cầu nối cuối cùng: `dsh-tools` phân giải nó qua [approval seam](2026-07-06-approval-seam.md) tùy chọn. Client tự động hóa ACP (Agent Client Protocol) có thể trả lời yêu cầu chính sách máy một lần của phiên sở hữu, tiếp tục thực thi sau `allowed-once`; nếu không có ApprovalService hoặc bộ trả lời, lệnh gọi đóng an toàn bằng `deny`.

### Nguồn ngữ cảnh luôn là plugin (chống gán nhãn sai)

Input `inject()` và additional-context của mỗi cầu nối đều truyền tường minh `{ kind: 'plugin', plugin: 'hooks-claude-code' | 'hooks-codex' }`. Unit test chốt xác nhận `user/message.source` trong kết quả là plugin chứ không phải user.

`UserPromptSubmit` chạy ở pre-step sau `turn/start`, nên mỗi lần gọi ghi một cặp `hook/invoked` / `hook/result` có phạm vi turn. Từ chối sẽ giữ input đã lấy quyền sở hữu ở trạng thái đã loại bỏ, đóng turn thành trạng thái bị chặn không chứa bước nào, và giữ lại cặp hook đó như bằng chứng quyết định bền vững. Payload Codex sẽ nhận `turn_id` của turn đã mở này.

### Thêm ngữ cảnh không phải là phủ quyết — delegate trước, rồi mới prepend

Hook chỉ thêm `additionalContext` (không block/deny) không phải là quyết định mà cầu nối có thể tự trả về một mình: trong listener waterfall (sự kiện dạng thác nước), trả về `enter` mà không gọi `next()` sẽ đoản mạch mọi listener `agent/pre-step` / `tools/post-execute` phía sau, khiến các plugin policy/sandbox đăng ký sau cầu nối không thấy prompt đó. Vì vậy, mỗi cầu nối sẽ ủy quyền qua `next()` trước, rồi mới thêm ngữ cảnh của chính nó vào decision `enter` phía sau. Cầu nối giữ lại toàn bộ tin nhắn phía sau; nếu pre-step phía sau reject, toàn bộ batch đã lấy quyền sở hữu sẽ bị loại bỏ, vì bước chưa từng được mở. Quyết định sau-tool vẫn giữ ngữ nghĩa `additionalContexts` có thứ tự độc lập, bao gồm cả việc Code Mode trì hoãn ngữ cảnh qua kết quả `run_code` lớp ngoài. Chỉ khi chính hook thực sự trả về `deny`/`block` mới đoản mạch. Test khẳng định: sau một hook chỉ-ngữ-cảnh, listener muộn hơn vẫn có thể reject prompt, và prompt cùng ngữ cảnh sau-tool được giữ lại vẫn tách biệt với nhau.

### CLAUDE_PROJECT_DIR mặc định là workspace của phiên

Claude Code luôn export `CLAUDE_PROJECT_DIR`, các hook chưa sửa đổi thường tham chiếu `$CLAUDE_PROJECT_DIR` để dựng đường dẫn tương đối theo dự án. `config.projectDir` tường minh được ưu tiên; khi nó bị bỏ qua (đấu nối ACP mặc định chỉ cấu hình `configPath`), cầu nối mặc định biến môi trường đó theo từng lần chạy thành workspace của phiên agent (tác tử) — tức `session.header.cwd` mà hook đã đang chạy trong đó — thay vì để trống. Nhờ vậy, một hook đường dẫn tương đối theo dự án tiêu chuẩn hoạt động đúng ngay với cấu hình mặc định.

### Cô lập

Cấu hình được phân giải một lần khi nạp; khi đọc/phân giải thất bại thì ghi log và không đăng ký gì, thay vì làm sập lúc khởi động (một đường dẫn gõ sai không nên kéo sập cả agent). Cầu nối CC chỉ chạy hook dạng shell `type: 'command'`; các handler `http`, `mcp_tool`, `prompt` và `agent` được phân giải rồi bỏ qua. Cầu nối Codex chỉ chạy handler lệnh đồng bộ, bỏ qua mục `async: true` hoặc không phải lệnh. Đường listener emit (`session-start`, `subagent/start`) chạy độc lập (detached), `inject` của nó được bọc trong `.catch` để ghi log (inject ném lỗi không được phép làm gián đoạn việc khởi động phiên hay vòng lặp).

### Hook chạy ở đâu, cấu hình đến từ đâu

Hook chạy trong workspace phiên của agent, nên đường dẫn tương đối trỏ tới dự án của người dùng. `configPath` được phân giải một lần theo cwd lúc process khởi động, áp dụng cho mọi phiên. Việc phát hiện cấu hình cục bộ theo dự án theo từng phiên vẫn hoãn lại dưới `TODO(per-session-hook-config)`.

## Khoảng trống tương thích bị hoãn

- **Viết lại input của tool.** `updatedInput` của CC/Codex được ghi log và cảnh báo, nhưng không được thực thi — viết lại input là một vấn đề thiết kế nhất quán bị hoãn lại (xem [Agent Note pre-tool-input-rewrite](../../proposed/feature/2026-06-30-pre-tool-input-rewrite.md)), vì tham số pre-execution được đọc chung bởi audit `tool/call`, lịch sử `assistant/message` và hiển thị tool, việc viết lại trung thực là một đơn vị thiết kế, không phải một trường.
- **Chống vòng lặp Stop** (`TODO(stop-loop-guard)`). Claude Code cung cấp `stop_hook_active` và ghi đè hook sau tám lần chặn liên tiếp; Codex cung cấp `stop_hook_active` nhưng không ghi lại giới hạn tương đương. Cả hai cầu nối luôn báo `false`, nên một hook Stop chặn vô điều kiện sẽ buộc tiếp tục ở mọi bước — trước khi có theo dõi trạng thái, tác giả hook phải tự giới hạn.
- **`continue:false` của hook (dừng cứng).** Hook có thể yêu cầu chấm dứt toàn bộ lần chạy (`continue:false` của CC/Codex); việc gộp dùng chung gấp nó thành `MergedHookOutcome.stop`/`stopReason`, nhưng không cầu nối nào hành động theo đó (`TODO(hook-continue-false)`) — điểm chặn chưa có nguyên thủy "dừng cứng agent" (Decision chỉ chặn/dẫn dắt một điểm duy nhất, không phải toàn bộ lần chạy). Bị hoãn cùng công việc chống vòng lặp; yêu cầu giữa turn sẽ ghi lại yêu cầu dừng trong `hook/result`, hook trong lúc đó vẫn giữ hiệu lực từng điểm của nó (decision/ngữ cảnh).
- **Phát hiện cấu hình.** Đường dẫn được chỉ định tường minh trong `cordis.yml` và ở cấp process (xem trên); việc duyệt ưu tiên nhiều tầng đầy đủ của CC/Codex, phát hiện cục bộ theo dự án theo từng phiên và mô hình trust/hash chưa được hiện thực lại (`TODO(per-session-hook-config)`).
- **Ngữ cảnh session-start / subagent-start là nỗ lực tối đa (`TODO(session-start-gating)`).** Cả hai hook chạy độc lập (detached), không chặn luồng khởi động, nên ngữ cảnh của chúng được tiêm khi sẵn sàng, nhưng có thể bỏ lỡ request đầu tiên hoặc subagent tồn tại ngắn. Để đảm bảo request đầu tiên được gửi đến, cần một điểm mở rộng khởi động được await.

## Phương án thay thế đã cân nhắc

**Chạy song song hook theo từng điểm.** Engine tham khảo chạy song song các hook khớp với một điểm và gấp kết quả. Cầu nối này chạy **tuần tự** (mỗi hook `await` trong vòng lặp matching), và gấp bằng cùng chính sách gộp nghiêm ngặt nhất. Tuần tự là có chủ đích: đối với điểm chặn có phạm vi turn, nó giúp mỗi cặp `hook/invoked`/`hook/result` liền kề và có thứ tự xác định, còn việc gộp thì độc lập với thứ tự với quyết định (`deny > ask > allow`), nên kết quả nhất quán. Cái giá là độ trễ (hook *N* chờ hook *N−1*) và timeout từng hook không chồng lấn — chấp nhận được với số lượng hook trong cấu hình thực tế; nếu một cấu hình nào đó có độ phân tán lớn ảnh hưởng đến tổng thời gian, sẽ đánh giá lại.

## Hậu quả

Ngữ nghĩa matching, xử lý exit code và độ ưu tiên gộp nằm ở `dsh-hook-protocol`; mỗi cầu nối chỉ chịu trách nhiệm phân giải cấu hình, xây payload theo phương ngữ và ánh xạ kết quả. Độ bao phủ theo từng file bao gồm các nhánh cấu hình cũng như ánh xạ đầu-cuối qua vòng lặp thật, `dsh-bash-local` và script shell, đồng thời một smoke test Loader thật bảo vệ hình dạng export của package. Plugin gốc bỏ qua format giao thức, trả trực tiếp decision đã được định kiểu.
