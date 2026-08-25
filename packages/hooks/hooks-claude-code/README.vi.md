# @deepseek-ai/dsh-hooks-claude-code

[English](README.md) | Tiếng Việt

Một plugin Cordis, chạy tại các điểm chặn (interception) chuẩn của harness, tập con được hỗ trợ của command hook trong cấu hình **Claude Code** hook hiện có của người dùng (`hooks.json` hoặc key `hooks` của file settings). Đây là phần **phương ngữ CC** của hệ thống con hooks, chịu trách nhiệm cầu nối cho stdin payload theo từng sự kiện định dạng CC, env của CC và việc thay thế `${CLAUDE_PLUGIN_ROOT}`／`${CLAUDE_PROJECT_DIR}`, cùng với việc ánh xạ kết quả trung lập của hook thành Decision đã được định kiểu của harness. Các nguyên hàm độc lập với phương ngữ (matcher, codec exit code／stdout, thực thi `ctx.shell`, gộp nghiêm ngặt nhất, sự kiện `hook/*`) đến từ [`@deepseek-ai/dsh-hook-protocol`](../hook-protocol/README.md).

Plugin Cordis gốc có thể hoàn thành toàn bộ công việc của cầu nối này, mạnh mẽ hơn, và có kiểu trả về được định kiểu, không có ranh giới serialize. **Cầu nối này chỉ là đường dẫn tương thích cho tập con command hook CC đã được ánh xạ**; mọi hành vi tùy chỉnh nên dùng plugin gốc tại cùng điểm mở rộng đó (xem [Agent Note điểm mở rộng chặn](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md)).

## Cấu hình

```ts
import type { Config } from '@deepseek-ai/dsh-hooks-claude-code'
const config: Config = {
  configPath: '/path/to/hooks.json', // required: a hooks.json or a settings file with a `hooks` key
  pluginRoot: '/path/to/plugin',     // optional: replaces ${CLAUDE_PLUGIN_ROOT} in command strings
  projectDir: '/path/to/project',    // optional: replaces ${CLAUDE_PROJECT_DIR} AND sets the hook env var; defaults to the session cwd when omitted
  defaultTimeoutMs: 600_000,         // optional: per-hook timeout when a hook sets none (CC default)
  stderrSummaryMaxChars: 500,        // optional: char cap on the hook/result event's persisted stderr summary
}
```

Trong `cordis.yml`:

```yaml
- dsh-hooks-claude-code:
    configPath: ./.claude/hooks.json
    pluginRoot: ./.claude/plugins/my-plugin
    projectDir: .
```

Cấu hình chỉ được parse **một lần** lúc load. `configPath` là cấu hình **cấp process**: đường dẫn tương đối được resolve tại thời điểm load dựa trên cwd khởi động của process, do đó một cấu hình áp dụng cho toàn bộ process. Chưa có khám phá cấu hình theo từng phiên (`session/new.cwd`) (`TODO(per-session-hook-config)`). Lỗi đọc／parse được cô lập xử lý, bao gồm cả các regex matcher không hợp lệ đi kèm sự kiện thực sự tiêu thụ matcher (sẽ báo cáo pattern và sự kiện của nó): cầu nối ghi log cảnh báo và không đăng ký gì cả, thay vì làm sập quá trình khởi động (lỗi chính tả đường dẫn không nên khiến agent (tác tử) dừng lại). Chỉ chạy hook dạng shell `type: 'command'`; hook `http`／`mcp_tool`／`prompt`／`agent` sẽ được parse và bỏ qua, đồng thời ghi log cảnh báo. Hook không có `timeout` riêng sẽ dùng giá trị tham chiếu mặc định của giao thức `DEFAULT_HOOK_TIMEOUT_MS` (từ `dsh-hook-protocol`, 10 phút, tức giá trị mặc định của CC).

Bản thân hook sẽ chạy trong workspace phiên của agent: đối với các điểm phạm vi agent, cầu nối sẽ dùng `cwd` của phiên (`session/new.cwd`) làm thư mục làm việc của process hook, do đó `pwd`／đường dẫn tương đối／marker của hook sẽ hoạt động trên cây project của người dùng, chứ không phải thư mục khởi động của server.

## Điểm Hook → Decision đã định kiểu

| CC hook | Điểm Harness | Ánh xạ |
|---|---|---|
| `SessionStart` | `agent/session-start` (emit) | additionalContext → `agent.inject()` vào phiên mới (không thể chặn) |
| `UserPromptSubmit` | `agent/pre-step` (waterfall (sự kiện dạng thác nước)) | `deny` → `PreStepDecision.reject`; chỉ additionalContext → ủy quyền qua `next()`, sau đó thêm một message đánh dấu nguồn riêng vào quyết định `enter` ở downstream (listener bên ngoài sau đó vẫn có thể reject／viết lại) |
| `PreToolUse` | `tools/pre-execute` (waterfall) | `deny` → `PreToolDecision.deny`; `ask` → `PreToolDecision.ask` |
| `PostToolUse` | `tools/post-execute` (waterfall) | `deny` → `block` kèm phản hồi; chỉ additionalContext → ủy quyền qua `next()`, sau đó thêm ngữ cảnh đánh dấu nguồn riêng vào đầu quyết định downstream; Code Mode trì hoãn ngữ cảnh của lời gọi con đến kết quả `run_code` ở lớp ngoài |
| `Stop` | `agent/turn-stopping` (serial) | Hook Stop bị chặn sẽ đưa lý do của nó vào qua `steer()`, buộc chạy thêm một bước |
| `SubagentStart` | `subagent/start` (emit) | additionalContext → `agent.inject()` vào child cùng process vẫn đang chạy; child từ xa không có đích inject cục bộ |
| `SubagentStop` | `subagent/end` (emit) | Chỉ quan sát |

Cả ba điểm emit đều chạy theo cách tách rời: không có điểm mở rộng nào chờ hook `SessionStart`／`SubagentStart`／`SubagentStop`. Mỗi chuỗi chạy đều được theo dõi; khi thực hiện dispose (giải phóng tài nguyên) trên cầu nối, các process hook vẫn đang chạy sẽ bị hủy, và continuation sẽ được rút cạn trước khi dispose hoàn tất (`createDetachedRuns`, nằm trong `dsh-hook-protocol`).

Đối tượng của matcher là tên công cụ (`PreToolUse`／`PostToolUse`), nguồn phiên (`SessionStart`), hoặc hằng số `agent_type` với giá trị `general-purpose` (`SubagentStart`／`SubagentStop`). Seam subagent của harness không mang label theo từng kind, do đó cầu nối báo cáo giá trị mặc định của công cụ Task chính Claude Code. Matcher mặc định／`*`／`agent_type` rỗng sẽ được kích hoạt, matcher kind cụ thể sẽ không được kích hoạt. `UserPromptSubmit`／`Stop` bỏ qua matcher. Nhiều hook được cấu hình trong file tại một điểm sẽ **chạy nối tiếp theo thứ tự cấu hình**, và được gộp theo cách nghiêm ngặt nhất (`deny > ask > allow`, xem `dsh-hook-protocol`). Chạy nối tiếp giúp mỗi cặp `hook/invoked`／`hook/result` của một hook nằm liền kề nhau trong log, kết quả gộp quyết định quyền hạn không phụ thuộc vào thứ tự (xem giải thích "run serially, not concurrently" trong Agent Note).

Mỗi stdin payload ở phạm vi agent đều mang `session_id` và `transcript_path` dưới dạng chuỗi. Khi có thể, cầu nối sẽ resolve giá trị sau thông qua `ctx.sessionPersistence.locate(session.header)`, ngược lại sẽ gửi `''`. Việc tra cứu không tạo hoặc flush sản phẩm, do đó trước checkpoint kết thúc lượt đầu tiên đường dẫn có thể chưa tồn tại, và cũng có thể bỏ sót lượt đang mở hiện tại.

## Nguồn ngữ cảnh

Ngữ cảnh được inject mang nguồn tường minh `{ kind: 'plugin', plugin: 'hooks-claude-code' }`, do đó message bền vững sẽ không bao giờ bị nhầm là prompt của người dùng.

## Trải nghiệm mô hình

### Ngữ cảnh do Hook cung cấp

#### Mô hình nhìn thấy gì

`SessionStart`, prompt đã được chấp nhận, hook tool-post và hook subagent-start cùng process theo thời gian thực đều có thể thêm message ngữ cảnh mang nguồn gán rõ ràng; hook `Stop` bị chặn sẽ thêm lý do làm bước steering (dẫn dắt giữa chừng) tiếp theo. Việc inject vào child từ xa không có đích cục bộ.

#### Ảnh hưởng Token

Không tốn chi phí khi hook không trả về ngữ cảnh. Văn bản hook phụ thuộc dữ liệu, được ghi log, và gửi lại trong các request phiên tiếp theo cho đến khi nén (compaction).

#### Ảnh hưởng KV Cache

Chỉ thêm vào cuối (append-only); nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

### Prompt hoặc kết quả công cụ bị chặn

#### Mô hình nhìn thấy gì

Lý do do nhà cung cấp cung cấp được truyền nguyên văn. Khi thiếu lý do, prompt bị chặn dùng chính xác `blocked by UserPromptSubmit hook`, công cụ bị từ chối trở thành `Error: blocked by PreToolUse hook`, phản hồi tool-post bị chặn chính xác là `blocked by PostToolUse hook`, stop bị chặn thì thêm chính xác steering `continue: blocked by Stop hook`. `systemMessage` và `updatedInput` sẽ được ghi log hoặc cảnh báo, nhưng không hiển thị với mô hình trong triển khai này.

#### Ảnh hưởng Token

Prompt bị chặn sẽ không sinh ra token request mô hình tương ứng với prompt đó; từ chối hoặc phản hồi sẽ thêm văn bản fallback hoặc văn bản của nhà cung cấp được giữ lại; buộc continuation cần thêm một request đầy đủ khác.

#### Ảnh hưởng KV Cache

Prompt bị chặn không gửi request, không gây mất hiệu lực. Ngữ cảnh của việc từ chối, phản hồi và buộc continuation được thêm vào sau tiền tố có thể tái sử dụng, không viết lại tiền tố.

## Hạn chế đã biết và công việc hoãn lại

- **Sự kiện hook không được hỗ trợ (23 trong tổng số 30 sự kiện hiện tại của Claude Code):** `Setup`, `InstructionsLoaded`, `UserPromptExpansion`, `MessageDisplay`, `PermissionRequest`, `PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `Notification`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `SessionEnd`, `Elicitation` và `ElicitationResult`. Cấu hình cho các sự kiện này sẽ bị bỏ qua trước khi parse config group, do đó sự kiện không được hỗ trợ không làm cấu hình mất hiệu lực, cũng không đăng ký hook nào. Cơ sở so sánh là [tài liệu tham khảo sự kiện hook chính thức](https://code.claude.com/docs/en/hooks#hook-events) của Claude Code.
- **`SessionStart` chỉ hỗ trợ một phần chức năng:** sẽ tiêu thụ JSON `additionalContext`, nhưng không hỗ trợ ngữ cảnh stdout thuần, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills` và `CLAUDE_ENV_FILE`. Hook chạy tách rời, do đó ngữ cảnh có thể bỏ lỡ request đầu tiên (`TODO(session-start-gating)`), payload sẽ bỏ qua các trường tùy chọn hiện tại như `model`, `agent_type` và `session_title`.
- **`UserPromptSubmit` chỉ hỗ trợ một phần chức năng:** hỗ trợ chặn và JSON `additionalContext`, nhưng không hỗ trợ ngữ cảnh stdout thuần, `sessionTitle` và `suppressOriginalPrompt`. Trừ khi bị ghi đè, cầu nối còn dùng giá trị mặc định 600 giây của riêng mình, thay vì timeout command 30 giây đặc thù theo sự kiện của Claude Code.
- **`PreToolUse` chỉ hỗ trợ một phần chức năng:** quyết định `deny` và `ask` có sẵn; `allow` sẽ không được phê duyệt trước, không hỗ trợ `defer`, `additionalContext` sẽ bị bỏ qua, `updatedInput` sẽ được ghi log + cảnh báo nhưng không được áp dụng (xem [Agent Note pre-tool-input-rewrite](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md)).
- **`PostToolUse` chỉ hỗ trợ một phần chức năng:** hỗ trợ phản hồi chặn và JSON `additionalContext`, nhưng không hỗ trợ `updatedToolOutput` và `updatedMCPToolOutput`, `tool_response` sẽ được làm phẳng thành văn bản.
- **`SubagentStart` và `SubagentStop` chỉ hỗ trợ một phần chức năng:** cả hai đều báo cáo hằng số `agent_type` với giá trị `general-purpose`, và dùng id phiên child ở nơi Claude Code báo cáo phiên cha. Ngữ cảnh Start là best-effort, và chỉ có thể tới được child cùng process vẫn đang chạy; stop chỉ quan sát, không thể chặn subagent hoặc cung cấp ngữ cảnh cho nó. Start bỏ qua `transcript_path`; stop còn bỏ qua `agent_transcript_path`, `last_assistant_message`, `background_tasks` và `session_crons`, và luôn báo cáo `stop_hook_active: false`.
- **`Stop` chỉ hỗ trợ một phần chức năng:** việc chặn sẽ buộc thêm một lượt mô hình khác, nhưng `stop_hook_active` luôn là `false`, sẽ bỏ qua `last_assistant_message`, `background_tasks` và `session_crons`, và chưa triển khai giới hạn chặn liên tiếp (`TODO(stop-loop-guard)`). Do đó, hook chặn vô điều kiện sẽ buộc continuation ở mỗi bước, trừ khi nó tự giới hạn.
- **Payload chung và trường đầu ra chỉ hỗ trợ một phần chức năng:** các sự kiện đã ánh xạ sẽ bỏ qua `prompt_id`, `transcript_path`, `permission_mode` và `effort` mà Claude Code vốn cung cấp. `systemMessage` sẽ được ghi log + cảnh báo nhưng không hiển thị; `{"continue": false}` sẽ được ghi log nhưng không dừng lần chạy; sẽ không áp dụng `suppressOutput`, `stopReason` và `terminalSequence` (`TODO(hook-continue-false)`).
- **Handler và cấu hình chỉ hỗ trợ một phần chức năng:** chỉ chạy command handler dạng shell. Sẽ bỏ qua handler `http`, `mcp_tool`, `prompt` và `agent`; không tuân theo các tùy chọn command handler như `args`, `async`, `asyncRewake`, `shell`, `if`, `once` và `statusMessage`. Handler khớp chạy nối tiếp và không loại bỏ trùng lặp, trong khi Claude Code chạy song song và loại bỏ trùng lặp cho cùng một handler. Một `configPath` cấp process sẽ được parse một lần lúc load; chưa triển khai việc khám phá phân lớp project, user, plugin và policy cùng việc reload theo thời gian thực của Claude Code (`TODO(per-session-hook-config)`).
