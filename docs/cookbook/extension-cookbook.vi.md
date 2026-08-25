# Thực hành: Các hình thái mở rộng plugin

[English](extension-cookbook.md) | 中文

Các mẫu tham khảo cho việc mở rộng harness. Các đoạn code lược bỏ phần import và triển khai phụ trợ, không thể sao chép chạy trực tiếp. Đường dẫn viết cụ thể xem tại [danh sách kiểm tra package](adding-a-package.md), [hướng dẫn plugin đầu tiên](../user/develop/basic/tool.md), [tham khảo công cụ (tool)](adding-a-tool.md) và [hướng dẫn adapter LLM (mô hình ngôn ngữ lớn)](adding-an-llm-adapter.md); việc ánh xạ hệ thống và điểm mở rộng do [tài liệu kiến trúc](../architecture.md) đảm nhiệm.

## Plugin công cụ (tool)

Công cụ được đăng ký trên `ctx.tools`. Ví dụ `defineTool` có chú thích (tham số `execute` có kiểu, cách dựng kết quả, chế độ `run_in_background`) xem tại [adding-a-tool.md](adding-a-tool.md) — hướng dẫn này là nguồn chân lý (true source) cho việc định nghĩa công cụ. `ctx.tools.register()` cũng nhận trực tiếp `ToolDefinition` dạng JSON Schema thô (các công cụ có nguồn gốc từ MCP đến bằng cách này); `defineTool` là hàm trợ giúp có kiểu (typed helper) dùng cho các công cụ first-party.

<a id="a-hook-plugin-permission-gate-example"></a>

## Plugin hook (lấy cổng quyền hạn làm ví dụ)

Cổng quyền hạn (permission gate) này là một ví dụ về plugin hook. Nó trả về một quyết định có kiểu từ cổng `tools/pre-execute` để cho phép hoặc từ chối một lệnh gọi; sandbox, quyền hạn và plugin plan-mode đều có thể dùng điểm mở rộng này. Plugin hook cũng có thể can thiệp vào các điểm mở rộng khác, bản thân nó không đồng nghĩa với cổng quyền hạn. "Hook bản địa" (native hook) là plugin Cordis thông thường chạy tại điểm can thiệp, không cần giao thức bên ngoài.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

Waterfall (chuỗi sự kiện dạng thác nước) này là một lớp chính sách có thể sắp xếp lại thứ tự. Khi bất biến thức (invariant) cần một quyết định từ chối cuối cùng đơn điệu, hãy dùng `ctx.tools.guard()`; khi plugin cần bọc toàn bộ vòng đời phân phối thực tế (timeout/retry/metrics; chỉ `exec.signal` có thể thay thế), hãy dùng `tools/execute`; với biến đổi kết quả tường minh, dùng `tools/post-execute`; với quan sát bị giới hạn trên kết quả cuối cùng bất biến, dùng `tools/result`. Quy tắc lựa chọn xem tại [hướng dẫn thêm công cụ](adding-a-tool.md#execution-policy-and-observation).

## Plugin UI

Plugin UI render từ luồng sự kiện `session/event` (token stream của trợ lý đến dưới dạng `assistant/chunk`, cộng với ranh giới lượt/bước (turn/step boundary) và hoạt động công cụ), và đưa đầu vào ngược trở lại thông qua `agent.followup()` / `agent.steer()`. Nếu plugin trình duyệt muốn đóng góp hành vi nghiệp vụ vào Web Client tích hợp sẵn, nó nên đăng ký `ConversationNodeDefinition` cùng với renderer Chat có khóa (keyed renderer); các bước cụ thể xem tại [hướng dẫn Conversation Node](adding-a-conversation-node.md).

```ts
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta') {
      render(event.data.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(SessionId('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

## Driver giao thức bên ngoài

*Driver giao thức* kết nối đối tác giao thức vào `ctx.agents`; nó có thể phục vụ client UI hoặc client tự động hóa. Driver stdio sở hữu stdout, tạo hoặc khôi phục agent (tác nhân) thông qua factory, và ánh xạ request giao thức thành `followup()` hoặc `cancel()`. Request prompt ở tầng thấp trả về biên nhận đưa vào hàng đợi bền vững (persistent enqueue receipt) của nó; nó không thu được kết quả thông qua việc liên kết `MessageId` với `turn/end`. Trạng thái của toàn bộ agent nên được phát hành riêng biệt. Phương pháp tự động hóa có thể chờ từ biên nhận đến lần idle tiếp theo, và tóm lược khoảng thời gian được sở hữu tường minh này; còn UI thường liên tục quan sát luồng sự kiện mở (open-ended). Tháo dỡ agent thông qua `AgentHandle.dispose()` để dispose (giải phóng tài nguyên) đạt trạng thái dừng hẳn hoàn toàn.

[`packages/acp/acp`](../../packages/acp/acp) là ví dụ hoàn chỉnh chỉ hướng đến tự động hóa: nó cung cấp phiên văn bản hoàn toàn mới qua ACP (Agent Client Protocol) JSON-RPC stdio, phát ra văn bản trợ lý đã commit, và đăng ký một bộ trả lời quyền máy (machine permission responder) dùng một lần cho agent mà nó sở hữu. [README](../../packages/acp/acp/README.md) của nó định nghĩa các phương thức, thứ tự sự kiện và quy ước vòng đời chính xác.

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-protocol-bridge'
export const inject = ['agents', 'sessions', 'sessionPersistence']

export function apply(ctx: Context) {
  // Stream every logged assistant text/reasoning delta out to the client.
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (chunk.type === 'text-delta') {
        // sendToClient({ kind: 'message_chunk', text: chunk.text })
      }
    }
  })
  // Inbound "prompt": create/resume an agent, feed it, and return its enqueue receipt.
  // Whole-agent status is a separate notification; no turn end belongs to this prompt.
  // Teardown reaches quiescence via AgentHandle.dispose() (stop + await exit).
}
```

## Ví dụ lắp ráp có thể chạy được

Các leaf (lá) có thể chạy được nạp cây plugin riêng của mình từ `examples/*/cordis.yml`; các script `demo:*` ở thư mục gốc và các thư mục leaf này là danh sách quyền hạn (manifest) chính thức. Bộ khởi chạy `dsh` sản phẩm phụ trách Web và thực thi headless một lần, leaf ACP dùng [`@deepseek-ai/dsh-acp-demo`](../../packages/examples/acp-demo), leaf JSON-RPC dùng [`@deepseek-ai/dsh-sdk-jsonrpc-demo`](../../packages/examples/jsonrpc-demo). Node leaf snapshot headless gắn tường minh [`@deepseek-ai/dsh-agent-spine-demo`](../../packages/examples/agent-spine-demo) và bền vững hóa JSONL, rồi dùng fixture kiểm thử (dữ liệu tiền đặt cho kiểm thử) riêng của ví dụ để điều khiển các thành phần này, thay vì qua app package đã bàn giao.

## Ánh xạ Tính năng → Cơ chế

Mỗi tính năng sản phẩm được ánh xạ tới một listener trên một điểm mở rộng đã được ghi tài liệu — nhờ đó khai báo vi nhân (microkernel) có thể được xác thực ([Agent Note vi nhân](../../.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.md)). Không có dòng nào chỉnh sửa trực tiếp bản thân vòng lặp.

`system-prompt/assemble` là một biến đổi lắp ráp tổng thể theo kiểu cộng tác chuyên gia (expert-collaborative): kết quả lắp ráp mà nó trả về có tính chính thức (authoritative), do đó tác giả của listener có trách nhiệm giữ lại các đóng góp từ Code Mode đang hoạt động và giao thức đầu ra có cấu trúc. Đối với việc lọc công cụ cần giữ đồng bộ giữa hiển thị, tra cứu và thực thi, hãy ưu tiên dùng `ctx.tools.restrict()`.

| Tính năng sản phẩm | Cơ chế plugin |
|---|---|
| Hệ thống hook (cấp người dùng + cấp dự án) | Listener trên `agent/session-start`, `agent/pre-step`, `agent/request`, `tools/pre-execute`, `tools/post-execute` và `agent/turn-stopping`; waterfall trả về quyết định có kiểu, còn `agent/turn-stopping` có thể kích hoạt bước tiếp theo thông qua steering (dẫn dắt giữa chừng); bridge `dsh-hooks-claude-code` / `dsh-hooks-codex` ánh xạ file cấu hình hook vào các điểm mở rộng này |
| `/goal` | `ctx.goals` quản lý trạng thái bền vững, `dsh-goal-round-driver` điều phối Round cùng phiên thông qua `Agent` công khai, các nhà sản xuất lệnh/công cụ độc lập lần lượt cung cấp điều khiển người/mô hình |
| `/loop` | Gọi `followup()` cho lần lặp tiếp theo trên sự kiện phiên `turn/end`; hoặc cưỡng bức tiếp tục |
| Workflow động | `ctx.workflowEngine` + engine worker-thread + công cụ `workflow`; các subtask trong tiến trình có cấu trúc cưỡng bức đầu ra thông qua đăng ký prompt/công cụ theo phạm vi (scoped), guard công cụ đơn điệu, commit `tools/result` cuối cùng (bao gồm `run_code` bên ngoài) và cờ `concludeTurn()` đơn điệu của việc thực thi đầu ra có cấu trúc |
| Tin nhắn xếp hàng + steering | `Agent.followup()` / `Agent.steer()` ở lõi |
| Nén ngữ cảnh (context compaction) (tự động + thủ công) | Seam `ctx.compaction` + `dsh-compaction-basic`; kiểm tra áp lực tự động chạy trên `agent/pre-step` tuần tự, cơ chế phục hồi tràn (overflow) chuẩn chạy trên `agent/request-error`, bên gọi thủ công dùng chung cùng một dịch vụ nén ([Agent Note về nén](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)) |
| Khả năng cấu hình prompt hệ thống | `ctx.systemPrompt.section()`, hỗ trợ sắp xếp thứ tự và ghi đè cục bộ theo phạm vi |
| AGENTS.md (thư mục gốc) | Một nhà cung cấp section đọc file này |
| AGENTS.md (thư mục con, kích hoạt theo nhu cầu) + thông báo thay đổi file | Gọi `agent.inject()` từ listener watcher / kết quả công cụ |
| Công cụ tích hợp sẵn | `ctx.tools.register()`; schema tự động chảy vào lắp ráp — dòng `dsh-tool-*` (bash, fs, web, subagent, todo) là các ví dụ đã bàn giao |
| ToolSearch / công bố dần dần (progressive disclosure) | Thay thế một đăng ký `ctx.tools.restrict()` theo phạm vi khi tập hiển thị thay đổi; registry giữ hiển thị, tra cứu và thực thi đồng bộ với nhau |
| Thời hạn / thử lại / chỉ số công cụ | Bọc việc phân phối lõi bằng `tools/execute`; lớp bọc có thể thay thế `exec.signal`, ủy quyền thực thi, và kiểm tra kết quả đã chuẩn hóa trong cùng một vòng đời từ vựng (lexical lifetime) |
| Chỉ số / kiểm toán / thu thập kết quả công cụ cuối cùng | Quan sát kết quả chính thức bất biến bằng `tools/result`; chỉ dùng `tools/post-execute` khi plugin cần biến đổi kết quả hoặc gắn thêm ngữ cảnh |
| Chính sách lượt cuối đơn điệu | Gọi `ToolExecution.concludeTurn()` từ lệnh gọi công cụ cuối thành công; các lệnh gọi công cụ tiếp theo trong cùng response vẫn có thể bị guard chặn, vòng lặp dừng sau bước đó |
| Sandbox subprocess (landlock / sandbox-exec) | Dùng backend `ctx.sandbox` qua `dsh-bash-sandbox`; từ chối ở cấp năng lực dùng `tools/pre-execute` |
| Hệ thống quyền hạn / AskUserQuestion | Trả về `ask` từ `tools/pre-execute` và trả lời qua `ctx.approval`; đăng ký một công cụ ask hướng mô hình riêng biệt cho câu hỏi thông thường của người dùng |
| Plan mode | [`@deepseek-ai/dsh-plan-mode`](../../packages/plan/plan-mode/README.md): trạng thái `plan/mode` được ghi log, section dẫn dắt `plan:policy`, lối vào `/plan [message]`, lối thoát trực tiếp `/plan off`, và lối ra `exit_plan_mode` được người dùng đánh giá; ràng buộc cưỡng bức nằm ở trục sandbox/approval riêng biệt |
| Ủy quyền subagent | Registry nhà cung cấp `ctx.subagents` (`dsh-subagent-spawn-in-process`/`-fork`/`-acp`/`-codex`/`-claude-code`/`-dsh-sdk`) + `dsh-tool-subagent` để phơi bày một nhà cung cấp đã cấu hình sẵn cho mô hình |
| MCP | Mỗi server một plugin: khám phá công cụ → `ctx.tools.register()` |
| Skill (kỹ năng) | Section + đăng ký công cụ; tiêm nội dung skill qua `inject()` khi gọi |
| Bộ nhớ (memory) | Nhà cung cấp section + công cụ |
| Tác vụ định thời (cron) | Plugin đăng ký công cụ lập lịch hướng mô hình; bộ hẹn giờ kích hoạt → `followup(…, {source: {kind: 'cron', …}})` khi rảnh／thông báo qua `inject()` khi bận |
| UI (GUI; CLI (giao diện dòng lệnh) xuất JSONL) | Lắng nghe `session/event` (mảnh trợ lý, ranh giới, hoạt động công cụ); đầu vào → `followup()` |
| Node nghiệp vụ Chat của Web Client | Đăng ký `ConversationNodeDefinition` cùng renderer có khóa `conversation.chat.node` |
| Đo lường từ xa (telemetry) / trace có thể phát lại | `session/event` → JSONL; phát lại = `sessions.create(id, { seed })` |
| Adapter mô hình | Đăng ký lớp con `LlmAdapter` thông qua `registerAdapter` (`dsh-llm-deepseek`, `dsh-llm-pi-ai`) |
| Tải lại nóng plugin | Mỗi đăng ký là một `ctx.effect` → có hiệu lực trực tiếp cùng HMR (hot module replacement) đi kèm sẵn trong repo |
