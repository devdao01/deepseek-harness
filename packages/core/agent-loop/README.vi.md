# dsh-agent-loop

[English](README.md) | 中文

Plugin triển khai cụ thể duy nhất và bộ điều khiển (driver) vòng lặp của agent (tác tử). Bên trong gói này triển khai để thỏa mãn interface `Agent`, và điều khiển vòng đời của phiên, lượt (turn) và bước (step).

Đây là gói duy nhất trong harness chứa logic vòng lặp cụ thể. Mọi thứ khác hoặc là service trừu tượng, hoặc là plugin nhắm vào các điểm mở rộng: hành vi mới nên đặt vào plugin, không phải ở đây.

## Service: `AgentLoop` (ctx key: `agentLoop`)

### API công khai

Tạo và khôi phục thuộc cùng một giao dịch được bảo vệ bằng rollback: xây dựng phiên riêng tư, agent cụ thể và ngữ cảnh có phạm vi; chờ setup tùy chọn; đi vào cả hai registry; tuần tự công bố `session/created` rồi `agent/created`; phát `agent/session-start`; chỉ sau đó mới khởi động driver. Setup là mã tổ hợp cùng tiến trình đáng tin cậy, nhận `Context` có phạm vi đầy đủ, và không được điều khiển một agent chưa được công bố. Các input định danh và tùy chọn được gõ kiểu thông thường được mượn theo ước định chỉ đọc; sự kiện seed và metadata phiên vượt qua ranh giới phiên bền vững, do đó hệ thống sẽ xác thực và tạo snapshot cho chúng. `AbortSignal` tùy chọn chỉ hủy việc load/setup/công bố, và tách rời trước khi handle trả về hiển thị.

Fiber gọi và provider AgentLoop cùng sở hữu agent. `AgentFactory.createAgent(ownerCtx, options)` và `resume(ownerCtx, options)` nhận quyền sở hữu của bên gọi một cách tường minh, trong khi factory giữ lại ngữ cảnh phụ thuộc riêng của nó cho `sessions`/`llm`/`tools`/`systemPrompt`; nhờ vậy bên gọi chỉ cần inject `agents` mà không thu hẹp bề mặt service của agent mới. Việc unload của bên gọi, dispose (giải phóng tài nguyên) handle, hoặc unload provider đều hội tụ về cùng một ranh giới ổn định hoàn toàn được ghi nhớ (memoized). Việc đóng provider đồng thời chờ cả teardown tài nguyên lẫn lớp wrapper create/resume công khai đã quan sát thấy trạng thái vô hiệu, do đó sau khi dependency biến mất, bất kỳ continuation nào cũng không thể tiếp tục công bố.

Mỗi agent chia sẻ một `SessionId` do bên gọi chọn với phiên của nó, và giả định id đó là duy nhất toàn cục; xung đột UUID ngoài dự kiến không thuộc mô hình được hỗ trợ. Hai thao tác đồng thời dùng cùng một id đều có thể chuẩn bị, nhưng lệnh gọi `enter()` cuối cùng mới phân xử việc công bố, mọi bên thất bại đều rollback tài nguyên riêng của mình. Mỗi lần detach đều gắn với đối tượng đã vào chính xác, do đó disposer cũ không thể gỡ bỏ bản thay thế cùng id xuất hiện sau đó. Yêu cầu detach trong lúc thông báo tạo đồng bộ sẽ chờ lần phân phối đó kết thúc, nhờ vậy cặp created/disposed được giữ nguyên. Teardown thực hiện theo thứ tự: dừng và xả (drain) → hủy phạm vi → detach agent → detach phiên. Sau khi dọn dẹp phạm vi riêng tư hoàn tất, id đó có thể tái sử dụng. Thông báo `agent/*` bình thường không có quyền phủ quyết được phát qua `agentEvents(ctx, agent)`; việc lắp ráp theo từng bước được thực hiện qua `assembleContextFor(agent)`.

- `ctx.agentLoop.create(id: SessionId, options?: AgentOptions, meta?: { cwd?: string }): Agent`: tạo đồng bộ dưới một id agent/phiên chia sẻ chính xác, không chạy setup, và dispose cùng fiber gọi. Cấu hình khai báo coi `agents[].id` là label ổn định, thường sẽ sinh `${label}-session-<uuid>` trước, rồi mới gọi ranh giới này. Ứng dụng cũng có thể cung cấp `sessionId` ổn định và chính xác: tạo mới ở lần dùng đầu tiên; khi mount lại và nội dung bền vững đã tồn tại, thì khôi phục lịch sử đã được hiện thực hóa. `resumeSessionId` yêu cầu và load một id bền vững đã tồn tại, và loại trừ lẫn nhau với `sessionId`. Nhờ vậy, mặc định mỗi lần khởi động lại đều tạo phiên mới, tránh xung đột, cũng không cần giữ một danh tính định tuyến thời gian thực thứ hai.

`AgentLoop` còn triển khai ước định `AgentFactory`, và tự đăng ký qua `ctx.agents.setFactory(this)`, do đó plugin sẽ tạo/khôi phục agent thông qua `ctx.agents`:

- `ctx.agents.create({ sessionId, meta?, seed?, agentOptions?, setup?, signal? }): Promise<AgentHandle>`: tạo theo cách lập trình bằng id chia sẻ do bên gọi cung cấp. Nó chờ giao dịch setup chưa công bố, rồi mới trả về; `meta` mang metadata ranh giới cwd/dòng dõi/seed, `seed` sẽ tái tạo tiền tố cho con fork sau khi xác thực và snapshot giá trị bền vững ở ranh giới phiên. `signal` chỉ có hiệu lực trước khi Promise này giải quyết. [`AgentHandle`](../agent/README.md) trả về sở hữu năng lực teardown chính xác.
- `ctx.agents.resume({ resumeSessionId, agentOptions?, setup?, signal? }): Promise<AgentHandle>`: load phiên bền vững qua `ctx.sessionPersistence` (xem [session persistence](../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md)), đăng ký agent bằng cùng id, tái tạo lịch sử, rồi chờ setup cho phạm vi agent hoàn toàn mới và chưa công bố, sau đó thực hiện công bố được bảo vệ bằng rollback. Số thứ tự lượt và lịch sử dẫn xuất tiếp tục từ log đã load. Thao tác này đòi hỏi có backend session persistence (không inject cứng, nên demo không bền vững vẫn hoạt động; khi thiếu persistence, `resume` sẽ từ chối với lỗi rõ ràng). `signal` chỉ dùng cho việc tạo. Trả về `AgentHandle`.

Đường dẫn `ctx.agentLoop.create()` do cấu hình điều khiển khiến fiber vòng lặp sở hữu agent của nó (đường dẫn này bỏ qua handle). Với agent được tạo theo cách lập trình, người giữ handle là năng lực teardown duy nhất hướng tới bên tiêu thụ; việc unload provider AgentLoop là một cạnh teardown cấu trúc độc lập, không phải một handle khác được công khai cho mã ứng dụng.

### Service được inject

`agents`, `sessions`, `llm`, `tools`, `systemPrompt`: cả 5 interface service.

### Điểm vào phụ trợ bất biến (invariant)

Điểm vào phụ trợ tùy chọn `@deepseek-ai/dsh-agent-loop/invariant` đăng ký việc tái tạo yêu cầu vào `ctx.invariants`. Vòng lặp ghi lại mỗi yêu cầu đóng băng chính xác vào một tập định danh cục bộ theo tiến trình do `dsh-llm` sở hữu; sau đó, điểm vào phụ trợ yêu cầu phải có phiên thời gian thực, và tái tạo độc lập ranh giới message cùng request header đã gộp dựa trên log. Ngay cả khi bên gọi đóng băng một lệnh gọi một lần trực tiếp, hoặc gắn id phiên cho nó, các lệnh gọi này vẫn không thuộc ước định đó.

### Cấu hình (Schemastery)

```ts
interface Config {
  maxParallelToolCalls?: number // default 10; 1 is serial
  agents: Array<{
    id: string                 // required
    provider?: string
    model?: string
    maxTokens?: number         // positive per-request output-token cap
    resumeSessionId?: string   // load this persisted session instead of creating one
    cwd?: string               // optional workspace cwd for the fresh session
  }>
}
```

Agent tạo qua cấu hình sẽ tự động khởi động. Lệnh gọi model cần cả `provider` lẫn `model`; `agent/request` có thể bổ sung cặp giá trị còn thiếu trước khi phân phối. `maxTokens` dương tùy chọn cung cấp giới hạn output ban đầu cho mỗi request hội thoại, và được ghi vào request header. `maxParallelToolCalls` giới hạn pool xoay vòng có giới hạn mà mỗi agent dùng cho các lệnh gọi an toàn song song, giá trị mặc định là `10`; nó cũng là toàn bộ nội dung của phân đoạn Settings `agent-loop`, do đó tầng người dùng chồng lên mục này có thể giới hạn nhóm lệnh gọi công cụ tiếp theo mà không cần khởi động lại, còn giá trị không phải số nguyên dương sẽ bị từ chối ngay khi ghi, thay vì chỉ thất bại khi đến nhóm đó. `agents` cố tình không nằm trong phân đoạn này — nó được tiêu thụ một lần khi service khởi động, nên thay đổi lưu trữ chỉ trông như có hiệu lực. `cwd` chỉ áp dụng cho phiên hoàn toàn mới, còn `resumeSessionId` giữ nguyên metadata bền vững. Agent tạo qua cấu hình dùng persona khi triển khai; setup theo cách lập trình có thể che phủ nó theo từng agent. Plugin này cung cấp các biến prompt `provider`, `model` và `cwd` cho mỗi agent; danh tính harness và persona khi triển khai thuộc về `dsh-system-prompt`.

### Driver cụ thể nội bộ gói

`ReactLoopAgent` cụ thể, inbox của nó và quyền điều khiển vận hành đều là triển khai nội bộ gói. Gốc gói chỉ export ước định plugin/service/cấu hình, bản đồ export của gói không cung cấp đường thoát `./src/*`; bên sở hữu vòng đời tạo agent qua `ctx.agents`, chứ không chỉ đích danh, xây dựng hay khởi động các thành phần nội bộ của driver. Một phiên đã sẵn sàng chỉ có thể được một driver cụ thể nhận quyền; mọi hành vi có thể quan sát đều diễn ra qua sự kiện phiên và hệ phân loại sự kiện `agent/*`.

Nguyên thủy `send()` thống nhất định tuyến nội dung và nguồn theo (`target` × `wakeup`); `followup`/`steer`/`inject` là các bí danh preset cố định của nó. `followup()` thêm vào FIFO `next-turn` và đánh thức driver, `steer()` thêm vào inbox `next-step` và đánh thức driver, còn `inject()` cũng thêm vào cùng inbox `next-step` đó, nhưng không đánh thức driver. Tại ranh giới lượt, driver sẽ mở lượt bền vững trước, rồi nguyên tử nhận (claim) input next-step đang chờ và một prompt đang xếp hàng; giữa các bước thì chỉ nhận input next-step. Thao tác nhận dùng splice chỉ-xóa để gỡ toàn bộ lô tin nhắn, và phát một lần `agent/inbox/claimed { message, turn }` cho mỗi tin nhắn. Sau đó `agent/pre-step` trả về kết quả từ chối, hoặc trả về lô tin nhắn đầy đủ sẽ vào bước dự kiến. Sau khi bị từ chối, lô đã nhận vẫn giữ trạng thái đã xóa và đóng lượt không có bước; input được chèn sau khi nhận vẫn chờ xử lý tiếp theo, còn injection ở trạng thái rảnh sẽ chờ mãi cho đến khi follow-up hoặc steering đánh thức driver.

Mỗi thay đổi inbox đều công bố một sự kiện `agent/inbox/spliced` chuẩn hóa trước khi sửa đổi hình chiếu (projection) thời gian thực. Do đó, chèn, sửa, gỡ, nhận và hủy đều replay qua cùng một bộ tọa độ splice chuẩn. Xóa thông thường mang `outcome: 'canceled'` và phát `agent/inbox/discarded { message }`; nhận dùng xóa thuần không có outcome, sau đó vòng lặp phát `agent/inbox/claimed`. Mỗi lần chèn đều phát `agent/inbox/inserted { message }`. `MessageId` giữ tính duy nhất giữa hai danh sách đang chờ, bên quan sát đồng bộ của sự kiện bền vững có thể tái tạo giá trị đã bị gỡ từ hình chiếu trước-splice.

### Vòng đời vòng lặp (`agent.ts`)

Driver sở hữu một agent trong suốt vòng đời của nó, và chạy bên trong `ctx.agents.withInitiator(agent, ...)`. Điểm tổ hợp riêng tư của gói khôi phục Agent chính xác, dẫn xuất `agent.session` một lần, và để các hàm phụ trợ cục bộ theo thao tác nắm giữ nó, thay vì tiếp tục truyền driver cụ thể hay `Session` theo từng thao tác qua interface nông. Nếu `Session` tường minh chính là interface thực sự của hàm phụ trợ, hàm đó sẽ giữ nguyên nó; việc tạo, load bền vững, setup chưa công bố, service, worker, tiến trình, persistence và wire protocol đều tiếp tục giữ danh tính tường minh riêng của chúng. [Service agent](../agent/README.md#initiating-agent-scope) quy định quy tắc lan truyền, teardown và tách rời.

Mỗi lần lệnh gọi provider kết thúc thành công, đúng một mỏ neo hoàn thành `assistant/message` sẽ được thêm vào, bao gồm cả lệnh gọi không nội dung và lệnh gọi kết thúc bằng `max-tokens`. Mỏ neo này ghi lại nguyên trạng nội dung đã lắp ráp, liệt kê chính xác các seq phân đoạn trong `sourceEventSeqs` (là `[]` khi stream không có phân đoạn), và bao gồm usage khi có sẵn; nội dung rỗng không đi vào lịch sử tin nhắn dẫn xuất.

Sau khi `agent/request` trả về cấu hình lệnh gọi provider/model, vòng lặp sẽ gọi `ctx.llm.prepareCall()`, dưới sự kiểm soát của tín hiệu lượt đang hoạt động để xác thực các trường mà adapter chịu trách nhiệm, và điền cường độ reasoning (suy luận) cùng giá trị mặc định output token đã cấu hình. Lệnh gọi đã chuẩn bị sẽ giữ nguyên đúng một mục đăng ký adapter trong suốt quá trình phân giải bất đồng bộ này, việc ghi log `request/header` và phân phối cuối cùng, do đó HMR (hot module replacement) không trộn lẫn kết quả phân giải năng lực của một adapter với request của adapter khác. Request header ghi lại cấu hình có hiệu lực cùng trường nào đến từ adapter. Trước waterfall (sự kiện dạng thác) tiếp theo, vòng lặp sẽ gỡ các trường có đánh dấu này khỏi đề xuất, để tuyến đường chính xác hiện tại tự điền lại giá trị mặc định của mình; các thiết lập tường minh không đánh dấu sẽ được giữ nguyên qua các bước và thay đổi tuyến đường. Tuyến đường không có adapter đăng ký sẽ giữ nguyên cấu hình ban đầu, để listener `llm/stream` có thể tiếp quản và short-circuit request đó; việc phân phối cuối cùng vẫn sẽ từ chối tuyến đường chưa được xử lý với `NO_ADAPTER`. Instance vòng lặp mới khi khôi phục sẽ tuân theo cùng bộ quy tắc đánh dấu giá trị mặc định adapter đó.

Lỗi plugin sẽ kết thúc lượt hiện tại, chứ không kết thúc vòng lặp. Lỗi lựa chọn adapter cuối cùng, phân phối và lặp sẽ đến dưới dạng lỗi chấm dứt hoặc kết thúc bị hủy từ `ctx.llm`, và đi vào `agent/request-error`; lỗi middleware, xử lý kết quả, công cụ và các mở rộng khác vẫn ném lỗi và đóng lượt trực tiếp. Logic khôi phục nhận tọa độ request, sự kiện provider bất biến, chính sách retry bất biến do đăng ký adapter đã chuẩn bị nắm giữ, cùng tín hiệu lượt; khi middleware tiếp quản tuyến đường chưa chuẩn bị, chính sách này sẽ thiếu. Listener xử lý lỗi trả về `{ kind: 'retry' }`; lỗi không được xử lý là trạng thái cuối cùng. AgentLoop sở hữu một tín hiệu hủy cho thao tác truy cập hoặc lượt hiện tại. `cancel(cause)` hợp lệ sẽ xóa công việc đang chờ khi không đặt `keepInbox`, và hủy tín hiệu đó theo kiểu hợp tác; hủy khi rảnh là no-op. Input đánh thức đến trong khoảng từ khi abort kích hoạt đến khi hoạt động hội tụ về rảnh sẽ được chốt lại (`wakeRequested`), và được replay tại ranh giới hội tụ của chính driver, không cần gửi thêm một send đánh thức nữa để thực thi; hủy `disposed` không bao giờ chốt lại, còn khi agent đã ở trạng thái rảnh mà gửi đánh thức thì luôn mở ranh giới turn của riêng nó (ngay cả khi tin nhắn đã bị xóa, trạng thái vẫn hiển thị cặp `idle → running → idle` thoáng qua). `turn/end` bền vững ghi `aborted` cho `user` và `parent`, dispose thì ghi `disposed`; lệnh gọi công cụ của model chưa được phân phối sẽ nhận cặp `tool/call` tổng hợp cùng kết quả `ABORTED_BEFORE_DISPATCH`. Lý do hủy chỉ ảnh hưởng đến cách báo cáo, không ảnh hưởng đến cách xử lý ngữ cảnh kết quả đã hoàn tất sau khi hủy. Dispose sẽ chờ công việc bỏ qua tín hiệu hoàn tất, rồi mới gỡ khỏi registry. [Quyết định hủy lượt tường minh](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.md) và [chốt đánh thức trong cửa sổ hội tụ hủy](../../../.agents/notes/implemented/bug-fix/2026-08-07-cancel-convergence-wake-latch.md) quy định vòng đời và ước định race condition.

Trong một bước, lệnh gọi độc quyền tạo thành rào chắn (barrier); lệnh gọi an toàn song song dùng pool xoay vòng có giới hạn, và được phân loại lại trước khi khởi động. Chỉ việc phân phối và thực thi phần thân lệnh gọi mới có thể chồng lấp. Chính sách, kết quả bền vững và ngữ cảnh kết quả vẫn giữ đúng thứ tự model. Hủy sẽ ngăn khởi động lệnh gọi mới, chờ xử lý kết quả của lệnh gọi đã khởi động, và giữ lại ngữ cảnh kết quả sau khi chúng hoàn tất, bất kể lý do hủy. Lỗi bộ lập lịch nội bộ sẽ dừng việc phân phối mới, chờ các phân phối đã khởi động, rồi đi đến ranh giới lỗi lượt mà không bịa đặt kết quả công cụ.

### Trách nhiệm của plugin

Mọi thứ ngoài "gọi model, chạy công cụ, lặp lại" đều thuộc về plugin lắng nghe hệ phân loại sự kiện:
- Hook và chính sách: các checkpoint `agent/*` liên quan, cộng pipeline `tools/pre-execute` → `tools/execute` → `tools/post-execute` → `finalizeContent` do định nghĩa sở hữu → `tools/result` được bảo vệ bằng guard; chữ ký sự kiện chính xác và mode nằm trong khối sinh tự động của [core.md](../../../docs/subsystems/core.md#cordis-surface) và [tools.md](../../../docs/subsystems/tools.md#cordis-surface)
- Compaction (nén): quan sát áp lực trên `agent/pre-step`; sửa chữa tràn theo chuẩn trên `agent/request-error`
- Khôi phục request model: `dsh-llm-retry` ghi lại trên `agent/request-error` và chờ backoff normal hoặc không giới hạn theo cấu hình provider chính xác, phát trạng thái `llm/retry` không lộ ra bề mặt, rồi trả về hành động retry
- Sandbox, quyền hạn, plan mode: dùng `tools/pre-execute` để cung cấp từ chối/hỏi có thể mở rộng, dùng `tools.guard()` để cung cấp chính sách đơn điệu do bên sở hữu quyết định, dùng `tools/post-execute` để xử lý quyết định kết quả, và dùng `tools/result` để quan sát cuối cùng
- subagent: triển khai bên ngoài vòng lặp dưới dạng provider `ctx.subagents`; provider trong tiến trình dùng `ctx.agents.create()` để tạo agent, và teardown qua `AgentHandle` mà nó sở hữu, còn [`ctx.jobs`](../../jobs/jobs/) và [`dsh-tool-subagent`](../../subagent/tool-subagent/) đảm nhiệm việc thu thập nền chung.
- Persistence: lên lịch ghi trì hoãn ngay sau `session/event`; `session/flush` là rào chắn quan sát tường minh
- UI: `session/event` (stream token assistant, ranh giới, hoạt động công cụ) + sự kiện điều khiển `agent/*` (`agent/status`, `agent/created`/`agent/disposed`)

## Trải nghiệm model

### Request hội thoại đầy đủ

#### Model nhìn thấy gì

Ở mỗi bước, vòng lặp gửi system prompt được trình bày cho agent đó, schema công cụ có thể nhìn thấy và tin nhắn dẫn xuất từ phiên. Nó cung cấp giá trị biến `provider`, `model` và `cwd`, nhưng không thêm văn bản cố định.

#### Ảnh hưởng Token

Mỗi bước đều tính lại văn bản system và schema. Phạm vi theo từng agent quyết định đóng góp, còn waterfall lắp ráp có thẩm quyền có thể thay đổi request cuối cùng, và listener của nó chịu trách nhiệm giữ tính nhất quán của protocol.

#### Ảnh hưởng KV Cache

Chỉ khi cùng tuyến provider và model, và văn bản system, schema cùng lịch sử trước đó đều nhất quán từng byte, chuỗi token request mới giữ tính chỉ-thêm (append-only). Việc viết lại tổ hợp mang theo token hoặc thay đổi thành phần có thể làm mất hiệu lực khả năng tái sử dụng kể từ token request đầu tiên bị thay đổi.

### Lịch sử tin nhắn được giữ lại

#### Model nhìn thấy gì

Tin nhắn user, tin nhắn assistant, lệnh gọi và kết quả công cụ, ngữ cảnh injection và steering (dẫn dắt giữa chừng) được chấp nhận đều được ghi lại, và gửi trong các bước tiếp theo. Phân đoạn stream thô, ranh giới vòng đời và các sự kiện chỉ-ghi-log khác bị loại trừ.

#### Ảnh hưởng Token

Input tăng theo mỗi tin nhắn bề mặt, cho đến khi compaction thay thế che phủ node cũ hơn; lượt công cụ gồm nhiều bước sẽ gửi lại lịch sử tích lũy ở mỗi bước.

#### Ảnh hưởng KV Cache

Tăng trưởng lịch sử bình thường chỉ-thêm, giữ nguyên các mục có thể tái sử dụng. Việc thay thế bề mặt hoặc compaction sẽ làm mất hiệu lực khả năng tái sử dụng kể từ token lịch sử đầu tiên bị che phủ.

### Lệnh gọi chưa phân phối sau khi hủy

#### Model nhìn thấy gì

Nếu một request sau đó replay một bước đã bị hủy, mỗi lệnh gọi công cụ mà việc hủy đã ngăn phân phối đều có mã lỗi `ABORTED_BEFORE_DISPATCH`, văn bản kết quả là `Error: tool call aborted before dispatch`.

#### Ảnh hưởng Token

Mỗi lệnh gọi bị bỏ qua sẽ giữ lại một kết quả lỗi cố định trong lịch sử, cho đến khi compaction che phủ nó.

#### Ảnh hưởng KV Cache

Chỉ-thêm; mỗi kết quả tổng hợp nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Hạn chế đã biết và việc còn hoãn lại

- **Phân loại là đơn nhất (unary)**: tính an toàn phụ thuộc vào việc lệnh gọi so sánh các lệnh gọi hoặc tài nguyên cùng cấp phải giữ độc quyền (xem [nguyên lý thiết kế](../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md)).
- **Label cấu hình mặc định tương ứng với phiên mới**: khi bỏ qua `sessionId`, mỗi lần khởi động đều tạo `${id}-session-<uuid>` mới; nếu cần hành vi khôi phục hoặc tạo chính xác, phải cung cấp tường minh một `sessionId` ổn định, còn `resumeSessionId` yêu cầu đã có lịch sử bền vững.
- **Agent cấu hình không có trường persona hay hook setup theo từng agent**: chúng dùng persona khi triển khai; chỉ tùy chọn factory `ctx.agents.create()` / `resume()` theo cách lập trình mới hỗ trợ persona/tổ hợp công cụ có phạm vi.
- **Không có ngân sách lượt tích hợp sẵn**: lệnh gọi công cụ hoặc steering sẽ khiến lượt hiện tại tiếp tục. Chính sách giới hạn lượt mất kiểm soát phải thực hiện việc hủy từ các điểm mở rộng vòng đời sẵn có (như `agent/turn-stopping`).
