# @deepseek-ai/dsh-hooks-codex

[English](README.md) | Tiếng Việt

Một plugin Cordis, chạy tại các điểm chặn (interception) chuẩn của harness, tập con được hỗ trợ của cấu hình **Codex** hook hiện có của người dùng. Đây là phía mang **phương ngữ Codex** trong hệ thống con hooks. Các nguyên hàm độc lập với phương ngữ đến từ [`@deepseek-ai/dsh-hook-protocol`](../hook-protocol/README.md); cầu nối này chịu trách nhiệm xử lý payload dạng Codex, mẫu matcher và ánh xạ quyết định.

Cầu nối này triển khai một tập con được chọn có chủ đích của giao thức hook Codex hiện tại:

- **5 trong tổng số 10 điểm hook:** `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit` và `Stop`.
- **Chỉ dùng matcher regex** (không có đường tắt chuỗi nghĩa đen; matcher luôn là regex không neo).
- **stdin payload snake_case**, mang thêm trường `turn_id`／`model`, khi ghi **không có** ký tự xuống dòng cuối.
- **Không có việc inject env plugin Codex, cũng không có thay thế placeholder khi cấu hình** (lệnh vẫn nhận env của executor, và chạy thông qua shell của nó).
- **Không có đường dẫn phê duyệt trước hoặc viết lại công cụ**: hook có thể chặn, nhưng cầu nối sẽ không phê duyệt trước hoặc thay thế input công cụ.

Plugin Cordis gốc có thể hoàn thành toàn bộ công việc của cầu nối này, và mạnh mẽ hơn; cầu nối này chỉ là đường dẫn tương thích cho tập con Codex đã được ánh xạ (xem [Agent Note điểm mở rộng chặn](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md)).

## Cấu hình

```ts
import type { Config } from '@deepseek-ai/dsh-hooks-codex'
const config: Config = {
  configPath: '/path/to/.codex/hooks.json', // required
  model: 'deepseek-v4',                      // optional: stamped on every payload (Codex includes `model`)
  defaultTimeoutMs: 600_000,                 // optional: per-hook timeout when a hook sets none
  stderrSummaryMaxChars: 500,                // optional: char cap on the hook/result event's persisted stderr summary
}
```

Trong `cordis.yml`:

```yaml
- dsh-hooks-codex:
    configPath: ./.codex/hooks.json
    model: deepseek-v4
```

Cấu hình chỉ được parse **một lần** lúc load. `configPath` là cấu hình **cấp process**: đường dẫn tương đối được resolve tại thời điểm load dựa trên cwd khởi động của process, chứ không resolve theo từng phiên (`TODO(per-session-hook-config)`). Lỗi đọc／parse được cô lập xử lý (ghi log + không đăng ký gì cả); regex matcher không hợp lệ đi kèm sự kiện thực sự tiêu thụ matcher thuộc loại lỗi này, và sẽ báo cáo pattern cùng sự kiện của nó. Chỉ chạy hook `type: 'command'` đồng bộ; hook không phải command hoặc `async: true` sẽ được parse và bỏ qua, đồng thời ghi log cảnh báo. Hook chấp nhận `timeout` hoặc alias `timeoutSec`; khi cả hai đều không thiết lập, dùng giá trị tham chiếu mặc định của giao thức `DEFAULT_HOOK_TIMEOUT_MS` (từ `dsh-hook-protocol`, 10 phút). Các sự kiện ngoài năm điểm được cầu nối hỗ trợ sẽ bị loại bỏ lúc parse.

Bản thân hook sẽ chạy trong workspace phiên của agent (tác tử): đối với các điểm phạm vi agent, cầu nối sẽ dùng `cwd` của phiên làm thư mục làm việc của process hook, do đó hook sẽ hoạt động trên cây project của người dùng, chứ không phải thư mục khởi động của server.

## Điểm Hook → Decision đã định kiểu

| Codex hook | Điểm Harness | Ánh xạ |
|---|---|---|
| `SessionStart` | `agent/session-start` (emit) | Đầu ra của hook stdout thuần → additionalContext → `agent.inject()` |
| `UserPromptSubmit` | `agent/pre-step` (waterfall, sự kiện dạng thác nước) | `block` (exit code 2) → `PreStepDecision.reject`; chỉ additionalContext → ủy quyền qua `next()`, sau đó thêm một message đánh dấu nguồn riêng vào quyết định `enter` ở downstream |
| `PreToolUse` | `tools/pre-execute` (waterfall) | `block` → `PreToolDecision.deny` (không có `allow`／`ask`) |
| `PostToolUse` | `tools/post-execute` (waterfall) | `block` → `block` kèm phản hồi; chỉ additionalContext → ủy quyền qua `next()`, sau đó thêm ngữ cảnh đánh dấu nguồn riêng vào đầu quyết định downstream; Code Mode trì hoãn ngữ cảnh của lời gọi con đến kết quả `run_code` ở lớp ngoài |
| `Stop` | `agent/turn-stopping` (serial) | Hook Stop bị chặn sẽ đưa lý do của nó vào qua `steer()`, buộc chạy thêm một bước |

Payload của lời gọi công cụ mang `tool_name` thực (giá trị matcher dùng để kiểm tra) và hình dạng Codex `tool_input: { command }` (dùng giá trị arg `command` nếu tồn tại, ngược lại dùng `''`). Đối tượng của matcher là tên công cụ (`PreToolUse`／`PostToolUse`) hoặc nguồn phiên (`SessionStart`); `UserPromptSubmit`／`Stop` bỏ qua matcher.

Mỗi stdin payload ở phạm vi agent đều mang `session_id` và `transcript_path`. Khi có thể, cầu nối sẽ resolve giá trị sau thông qua `ctx.sessionPersistence.locate(session.header)`, ngược lại sẽ gửi `null`, giữ nguyên hình dạng Codex `string | null`. Việc tra cứu không tạo hoặc flush sản phẩm, do đó trước checkpoint kết thúc lượt đầu tiên, đường dẫn có thể chưa tồn tại, hoặc transcript (bản ghi văn bản) mà nó trỏ tới có thể chưa bao gồm lượt hiện tại chưa kết thúc.

`SessionStart` là điểm emit duy nhất, và nó chạy tách rời. Mỗi chuỗi chạy đều được theo dõi; thực hiện dispose (giải phóng tài nguyên) trên cầu nối sẽ hủy các process hook vẫn đang chạy, rồi rút cạn continuation, sau đó dispose mới hoàn tất (`createDetachedRuns`, nằm trong `dsh-hook-protocol`).

## Nguồn ngữ cảnh

Ngữ cảnh được inject mang nguồn tường minh `{ kind: 'plugin', plugin: 'hooks-codex' }`, do đó message bền vững sẽ không bao giờ bị nhầm là prompt của người dùng.

## Trải nghiệm mô hình

### Ngữ cảnh do Hook cung cấp

#### Mô hình nhìn thấy gì

`SessionStart`, prompt đã được chấp nhận và hook tool-post có thể thêm message ngữ cảnh mang nguồn gán rõ ràng; hook `Stop` bị chặn sẽ thêm lý do của nó làm bước steering (dẫn dắt giữa chừng) tiếp theo.

#### Ảnh hưởng Token

Không tốn chi phí khi hook không trả về ngữ cảnh. Văn bản hook phụ thuộc dữ liệu, được ghi log, và gửi lại cho đến khi nén (compaction).

#### Ảnh hưởng KV Cache

Chỉ thêm vào cuối (append-only); nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

### Prompt hoặc kết quả công cụ bị chặn

#### Mô hình nhìn thấy gì

Lý do do nhà cung cấp cung cấp được truyền nguyên văn. Khi thiếu lý do, prompt bị chặn dùng chính xác `blocked by UserPromptSubmit hook`, công cụ bị từ chối trở thành `Error: blocked by PreToolUse hook`, phản hồi tool-post bị chặn chính xác là `blocked by PostToolUse hook`, stop bị chặn thì thêm chính xác steering `continue: blocked by Stop hook`. `systemMessage` của Codex sẽ không được hiển thị.

#### Ảnh hưởng Token

Prompt bị chặn sẽ không sinh ra token request mô hình tương ứng với prompt đó; từ chối hoặc phản hồi sẽ thêm văn bản fallback hoặc văn bản của nhà cung cấp được giữ lại; buộc continuation cần thêm một request đầy đủ khác.

#### Ảnh hưởng KV Cache

Prompt bị chặn không gửi request, không gây mất hiệu lực. Ngữ cảnh của việc từ chối, phản hồi và buộc continuation được thêm vào sau tiền tố có thể tái sử dụng, không viết lại tiền tố.

## Hạn chế đã biết và công việc hoãn lại

- **Sự kiện hook không được hỗ trợ (5 trong tổng số 10 sự kiện hiện tại của Codex):** `PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStart` và `SubagentStop`. Cấu hình cho các sự kiện này sẽ bị âm thầm loại bỏ trong quá trình parse. Cơ sở so sánh là [tài liệu tham khảo hook chính thức](https://learn.chatgpt.com/docs/hooks) của Codex.
- **`SessionStart` chỉ hỗ trợ một phần chức năng:** hỗ trợ stdout thuần và JSON `additionalContext`, nhưng hook chạy tách rời, do đó ngữ cảnh có thể bỏ lỡ request đầu tiên (`TODO(session-start-gating)`).
- **`UserPromptSubmit` chỉ hỗ trợ một phần chức năng:** hỗ trợ chặn cộng ngữ cảnh stdout thuần hoặc JSON, nhưng không buộc thực thi `systemMessage` chung và điều khiển `{"continue": false}`.
- **`PreToolUse` chỉ hỗ trợ một phần chức năng:** hỗ trợ chặn, nhưng bỏ qua `additionalContext`, `permissionDecision: "allow"` và `updatedInput`. Mỗi công cụ đều được biểu diễn dưới dạng `tool_input: { command }`, do đó tham số của công cụ không phải shell sẽ không được công khai trung thực cho hook.
- **`PostToolUse` chỉ hỗ trợ một phần chức năng:** hỗ trợ phản hồi chặn và JSON `additionalContext`, nhưng không buộc thực thi `{"continue": false}`, tham số công cụ không phải shell sẽ được thu gọn thành `{ command }`, đầu ra công cụ có cấu trúc sẽ được làm phẳng thành văn bản trong `tool_response`.
- **`Stop` chỉ hỗ trợ một phần chức năng:** việc chặn sẽ buộc thêm một lượt mô hình khác, nhưng `stop_hook_active` luôn là `false`, `last_assistant_message` luôn là `null`, và sẽ không buộc thực thi `{"continue": false}`. Do đó, hook chặn vô điều kiện sẽ buộc continuation ở mỗi bước, trừ khi nó tự giới hạn (`TODO(stop-loop-guard)`).
- **Payload chung và trường đầu ra chỉ hỗ trợ một phần chức năng:** mỗi sự kiện đã ánh xạ đều báo cáo `model` được cấu hình tĩnh và `permission_mode: "default"`, chứ không phải giá trị runtime hiện tại của Codex. `systemMessage` sẽ được ghi log và kích hoạt cảnh báo, nhưng không hiển thị, `{"continue": false}` sẽ được ghi log nhưng sẽ không áp dụng hành vi dừng đặc thù theo sự kiện của Codex (`TODO(hook-continue-false)`).
- **Việc nạp cấu hình và thực thi chỉ hỗ trợ một phần chức năng:** một `configPath` cấp process sẽ được parse lúc load; chưa triển khai lớp user, project, session, system／managed và plugin đang hoạt động của Codex, kiểm soát tin cậy và hình thức hook `config.toml` nội tuyến (`TODO(per-session-hook-config)`). Chỉ chạy handler `command` đồng bộ, bỏ qua các metadata hiện tại như `statusMessage` và `commandWindows`, handler khớp chạy nối tiếp, thay vì dùng ngữ nghĩa khởi động đồng thời của Codex.
