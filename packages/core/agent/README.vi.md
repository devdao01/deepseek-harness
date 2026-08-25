# dsh-agent

[English](README.md) | 中文

Interface Agent, registry, phạm vi bên khởi tạo (initiator) cục bộ theo tiến trình, và từ vựng sự kiện `agent/*`. Mỗi plugin (UI, hook, orchestrator) đều lập trình hướng đến handle `Agent` được định nghĩa ở đây; nó không phụ thuộc vào vòng lặp, do đó vòng lặp có thể thay thế được.

Gói phụ trợ tùy chọn `@deepseek-ai/dsh-agent/invariant` đăng ký các kiểm tra chuyển trạng thái agent (tác tử) của gói này vào `ctx.invariants`. Service agent gốc không ngầm định load chẩn đoán.

## Service: `AgentRegistry` (ctx key: `agents`)

Theo dõi agent thời gian thực, và mang theo Agent gọi khởi tạo trong công việc bất đồng bộ của driver, mà không cần import gói vòng lặp cụ thể.

### API công khai

Interface đăng ký có phạm vi: `Agent.ctx` là ngữ cảnh có phạm vi của agent (`dsh-scope`, key = agent đó). Đăng ký công cụ/đoạn/biến/listener qua nó chỉ có hiệu lực với agent đó, và đều bị hủy khi dispose (giải phóng tài nguyên). `agentEvents(ctx, agent)` là bộ phân phối hợp nhất cho thao tác thân agent bình thường (mang cả payload lẫn thân injection trong một lần); mode thông báo của nó gọi từng listener và đồng thời chứa cả lỗi ném đồng bộ lẫn Promise bị reject. Vòng đời registry đối với việc tái sử dụng một payload định tuyến ổn định. `assembleContextFor(agent)` xây dựng ngữ cảnh lắp ráp theo từng agent (bao gồm cả `agent` + `scope`). `installAgentLlmTarget(agentCtx, target)` chụp snapshot lựa chọn provider/model/cường độ reasoning (suy luận) có thể thay đổi trong lúc lắp ráp prompt, áp dụng tuyến đường vào biến prompt, và áp dụng target đầy đủ vào tuyến request của một bước; nếu không có cường độ reasoning được chọn, nó sẽ xóa cường độ reasoning kế thừa, để target đó dùng giá trị mặc định của adapter/provider. `CreateAgentOptions.setup(agentCtx)` và `ResumeAgentOptions.setup(agentCtx)` tổ hợp thế giới có phạm vi của agent mới tạo hoặc khôi phục khi nó chưa được công bố. Setup là mã tổ hợp cùng tiến trình đáng tin cậy: chỉ sau khi tạo xong mới có thể điều khiển agent.

`AgentOptions` cung cấp tuyến provider/model ban đầu, cùng giới hạn output `maxTokens` dương tùy chọn. Vòng lặp cụ thể phân giải giá trị mặc định adapter cho model chính xác, ghi giới hạn có hiệu lực vào request header, và áp dụng cho mỗi request model hội thoại; tùy chọn Agent tường minh được ưu tiên, khi bỏ qua thì do giá trị mặc định adapter hoặc tuyến provider kiểm soát.

- `ctx.agents.register(agent: Agent): () => void`: ghi nhận một agent **đã được xây dựng xong**. Dispose cùng fiber gọi.
- Vòng đời có thứ tự cấp cao: `enter(agent, owner): () => void` bắt buộc `agent.id === agent.session.id`, thực hiện kiểm tra xung đột ID có thẩm quyền, và chèn mà không thông báo; `owner` ghi lại tường minh quan hệ agent tạo thời gian thực (agent gốc là `undefined`), không liên quan đến dòng dõi phiên bền vững. `announce(agent)` phát đúng một lần `agent/created`. Yêu cầu detach đồng bộ từ listener tạo được trì hoãn đến khi lần phân phối đó kết thúc; mỗi detach kiểm tra đối tượng mục đã bắt giữ, do đó năng lực cũ không thể xóa bản thay thế cùng ID xuất hiện sau đó. Factory bất đồng bộ dùng cách tách này; plugin thông thường dùng `register()`.
- `ctx.agents.get(id: SessionId): Agent | undefined`
- `ctx.agents.isOwnedBy(id: SessionId, owner: Agent): boolean`: mục thời gian thực chính xác đó có được tạo qua ngữ cảnh phạm vi của agent cha hay không; quyền sở hữu thời gian thực không liên quan đến dòng dõi phiên bền vững.
- `ctx.agents.list(): Agent[]`
- `ctx.agents.roots(): Agent[]`: agent thời gian thực được tạo mà không có ngữ cảnh agent sở hữu; phiên khôi phục có dòng dõi vẫn có thể là gốc thời gian thực.

#### Phạm vi Agent bên khởi tạo

`AgentLoop` chạy toàn bộ vòng đời của mỗi driver cụ thể bên trong ranh giới bên khởi tạo. Các driver đồng thời cách ly lẫn nhau: continuation của driver con mang theo agent con, còn khi `withInitiator()` trả về, continuation cha lập tức lấy lại agent cha; việc theo dõi drain tiếp tục cho đến khi Promise của driver con giải quyết. Việc tạo, load bền vững và setup chưa công bố nằm ngoài ranh giới con, do đó setup do agent cha khởi tạo sẽ kế thừa agent cha, còn `agentCtx.agent` xác định tường minh agent con.

- `ctx.agents.currentInitiator(): Agent | undefined`: đọc bên khởi tạo kế thừa, không yêu cầu nó phải tồn tại.
- `ctx.agents.requireInitiator(): Agent`: đọc bên khởi tạo, ném lỗi `no initiating agent is active` khi vắng mặt.
- `ctx.agents.withInitiator(agent, operation)`: chạy với một Agent chính xác, và giữ nguyên giá trị đồng bộ hoặc Promise chính xác của thao tác.
- `ctx.agents.withoutInitiator(operation)`: ẩn bên khởi tạo kế thừa đối với công việc cục bộ tiến trình không liên quan.

Phạm vi này mang theo chính đối tượng `Agent`, và chỉ có hiệu lực trong tiến trình. Danh tính trong môi trường không phải bằng chứng còn tồn tại, cũng không phải sự ủy quyền; ở ranh giới service, worker, tiến trình, persistence và wire, trường Agent tường minh vẫn là nguồn có thẩm quyền. Teardown sẽ từ chối ranh giới mới, cho phép các dependency đã inject và ranh giới trả về Promise drain, rồi vô hiệu hóa `AsyncLocalStorage` bên dưới; công việc chưa trả về vẫn thuộc quyền sở hữu của hệ thống con đã tách nó ra. Nếu chuỗi bất đồng bộ kế thừa của một ranh giới bắt đầu unload một fiber Cordis sở hữu nó, chuỗi ranh giới lồng nhau đó sẽ được giải phóng khỏi drain, để việc unload không phải chờ chính nó; continuation của nó sẽ quan sát thấy service đã dispose sau teardown. Ranh giới chi tiết và ước định teardown do [quyết định phạm vi bên khởi tạo](../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md) sở hữu.

#### API Factory (Tạo)

Việc *tạo* Agent do plugin triển khai `AgentFactory` (`dsh-agent-loop`) cung cấp, và đăng ký qua `setFactory`. Nhờ vậy, chức năng tạo vẫn nằm trên interface `dsh-agent`, bên tiêu thụ (UI, lớp cầu nối ACP (Agent Client Protocol)) có thể lập trình hướng đến `ctx.agents` mà không phụ thuộc gói vòng lặp cụ thể. Registry sẽ chuẩn hóa Service đã được trace thành target cụ thể, và trace lại mỗi lệnh gọi qua ngữ cảnh bên gọi; cách này vừa tránh lồng shadow Cordis, vừa truyền `ownerCtx` tường minh, ràng buộc bên gọi cho factory thông thường.

- `ctx.agents.setFactory(factory: AgentFactory): () => void`: đăng ký factory tạo (vòng lặp gọi lúc xây dựng). Factory thứ hai sẽ khiến lỗi bị ném ra; dispose sẽ xóa slot.
- `ctx.agents.create(options: CreateAgentOptions): Promise<AgentHandle>`: tạo phiên và agent, chờ setup tùy chọn mà không công bố, rồi kiểm tra công bố qua `SessionStore.enter()` và `AgentRegistry.enter()` cuối cùng. Không hỗ trợ tạo đồng thời cùng một ID: nhiều thao tác có thể chuẩn bị, nhưng chỉ một có thể vào; mỗi bên thất bại sẽ rollback phạm vi/phiên/driver riêng của mình. `signal` tùy chọn và chỉ dùng cho việc tạo sẽ hủy setup chưa công bố, và tách rời trước khi trả về handle; hủy sau đó dùng `handle.dispose()` hoặc `agent.cancel()`. Việc công bố nằm trong phạm vi rollback, mỗi cạnh tạo đã chuyển giao sẽ được xử lý theo cặp trong lúc rollback. Từ chối khi chưa đăng ký factory.
- `ctx.agents.resume(options: ResumeAgentOptions): Promise<AgentHandle>`: load phiên bền vững ([session persistence](../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md)), tạo phạm vi agent mới chưa công bố, chờ setup tùy chọn, và dùng cùng chuỗi công bố nhập cuối. `signal` tùy chọn của nó cũng chỉ dùng cho việc tạo. Từ chối khi chưa đăng ký factory hoặc chưa cấu hình session persistence.

`AgentHandle = { agent: Agent; dispose(): Promise<void> }`. Disposer là một **năng lực của bên tiêu thụ**; bên quan sát chỉ giữ mục registry trần không thể teardown agent. Fiber gọi và provider factory đã đăng ký là đồng sở hữu có cấu trúc: unload của bên gọi bắt buộc quyền sở hữu có cấu trúc, còn unload factory phải dừng instance cũ vì phạm vi phụ thuộc của chúng thuộc về provider đó. Bất kỳ chủ sở hữu nào gọi `dispose()` đều đến cùng một ranh giới ổn định hoàn toàn được ghi nhớ (memoized): nó dừng vòng lặp, chờ vòng lặp thoát, hủy đăng ký agent, gỡ phiên khỏi kho lưu trữ, và cuối cùng hủy toàn bộ thế giới phạm vi của nó. `ctx.agents.get(id)` vẫn trả về `Agent` trần; lớp cầu nối ACP và backend subagent trong tiến trình giữ handle bên tiêu thụ, còn agent được tạo qua cấu hình đã do fiber vòng lặp sở hữu.

### Sự kiện thời gian thực

`dsh-agent` khai báo từ vựng phối hợp `agent/*` thời gian thực, giúp plugin không phải phụ thuộc vòng lặp cụ thể. Chữ ký chính xác, mode phân phối, quy tắc lọc theo phạm vi và ước định payload nằm trong khối sinh tự động của [core.md](../../../docs/subsystems/core.md#cordis-surface); [luồng lượt kiến trúc](../../../docs/architecture.md#turn-flow) trình bày thứ tự tương đối của chúng với sự kiện phiên bền vững.

Cạnh vòng đời có hai lưu ý cục bộ quan trọng. `agent/created` chạy sau setup phạm vi, sau khi cả mục registry phiên lẫn agent đều tồn tại. Setup là mã đáng tin cậy chỉ dùng để tổ hợp; thông báo `agent/session-start` không thể phủ quyết ngay sau đó là điểm inject khởi động đầu tiên được hỗ trợ. `agent/disposed` luôn biểu thị agent chính xác đã rời registry. AgentLoop phát sự kiện này sau khi driver của nó hoàn toàn ổn định, còn teardown có thứ tự lúc này có thể vẫn đang tách phiên và hủy phạm vi; agent tùy chỉnh đăng ký trực tiếp tự sở hữu bất kỳ ước định thứ tự driver mạnh hơn nào.

Hầu hết điểm chặn đều là waterfall (sự kiện dạng thác) hợp tác. `agent/pre-step` nhận một payload, mang theo `agent` chủ thể, `UserMessage[]` đã nhận độc quyền cùng `turn`, `step` và `signal` hủy dự kiến vào; khi công cụ đã yêu cầu tiếp tục request, lô này có thể rỗng. Điểm mở rộng lượt phạm vi agent mang `AbortSignal` tường minh trong payload; các điểm mở rộng phạm vi lượt còn lại nhận nó qua giá trị request của chúng. Listener có thể phối hợp với tín hiệu, nhưng không được giữ nó như quyền kiểm soát một lượt khác. `agent/request-error` là waterfall khôi phục cho request model thất bại: nó nhận tọa độ request, sự kiện thất bại đã chuẩn hóa, chính sách retry theo mục đăng ký service khi có sẵn, cùng tín hiệu. Listener có quyền khôi phục trả về `{ kind: 'retry' }` và không gọi `next()`. `agent/turn-stopping` chạy trước khi một lượt vốn có thể hoàn thành bị đóng. Vòng đời tín hiệu do [quyết định hủy lượt tường minh](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.md) sở hữu; việc phân phối theo phạm vi và giải quyết chấm dứt do [Agent Note thiết kế runtime phạm vi agent](../../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.md#three-execution-boundaries-are-deliberately-one-way) sở hữu.

`PreStepDecision` hoặc là `{ kind: 'reject' }`, hoặc là `{ kind: 'enter', messages }`. Nhánh enter là lô đầy đủ, có định danh và đóng băng dự kiến vào bước. Listener bọc enter ở phía dưới sẽ giữ nguyên lô đó, trừ khi cố ý thay thế nó; tin nhắn mới tuân theo thứ tự trả về tự nhiên của waterfall. Thao tác nhận đã xóa tin nhắn ứng viên khỏi inbox, do đó reject không giữ lại chúng; tin nhắn chèn sau khi nhận vẫn chờ ranh giới tiếp theo.

Thông báo thời gian thực của inbox cố tình dùng payload tối giản theo từng tin nhắn: `agent/inbox/inserted { message }`, `agent/inbox/claimed { message, turn }` và `agent/inbox/discarded { message }`. Chúng bổ sung cho hình chiếu (projection) `agent/inbox/spliced` bền vững, nhưng không đưa thêm một lớp vòng đời khác.

Ranh giới lượt và bước cùng luồng token model là sự kiện bền vững `session/event`, không phải thông báo `agent/*` được phản chiếu. Bên tiêu thụ đọc `turn/*`, `step/*` và `assistant/chunk` từ luồng sự kiện phiên; việc quan sát chính sách và kết quả công cụ thuộc về pipeline hoàn chỉnh được [`dsh-tools`](../tools/README.md) ghi lại.

`foldConsumedWork(events)` đọc lại luồng sự kiện này, trả lời câu hỏi mà chỉ dựa vào chuỗi lượt không thể trả lời được: công việc mà một log tiêu thụ rốt cuộc kết thúc thế nào. Nó trả về `turn/end` mới nhất có thể giải trình cho công việc đã tiêu thụ — tức lượt đã vào step model, hoặc đã nhận input inbox nhưng thất bại, bị dừng hoặc bị từ chối trước khi vào step — cùng thêm một sự kiện "công việc đã chấp nhận sau đó có bị hủy khỏi inbox và chưa từng chạy hay không". Cả hai sự kiện đều đến từ log, do đó bất kể chủ sở hữu nào khởi xướng việc hủy, đọc ra đều như nhau. Lượt không có step không lấy input nào, hoặc kết thúc bình thường sau khi lô đã nhận bị viết lại thành rỗng thì không mô tả công việc, sẽ bị bỏ qua; lượt đã nhận input mà kết thúc bằng `blocked` thì là một sự giải trình, vì việc từ chối đã bỏ luôn các input đó.

### Interface Agent (`types.ts`)

Handle mà mỗi plugin hướng đến:

- `agent.inbox`: hình chiếu (projection) sự kiện `agent/inbox/spliced` bền vững mà agent sở hữu. `nextTurn` và `nextStep` hiển thị giá trị `UserMessage` đang chờ. `append`, `prepend`, `replace`, `remove`, `clear`, `splice` và `claim` dùng để thay đổi hàng đợi; `replace(messageId, newMessage)` và `remove(messageId)` định vị tin nhắn đang chờ qua `MessageId` trên cả hai danh sách. Thay thế có thể đổi định danh, và công bố tin nhắn cũ dưới dạng discarded trước, rồi tin nhắn mới dưới dạng inserted. Xóa thông thường và `clear()` đều là hủy bền vững, và phát `agent/inbox/discarded`. `claim(target)` gỡ lô ứng viên tiếp theo bằng splice xóa thuần, sau đó vòng lặp phát `agent/inbox/claimed`. `MessageId` là định danh mục hàng đợi duy nhất, phải giữ tính duy nhất trong lúc tin nhắn đang chờ.
- `agent.followup(message)`: xếp hàng một tin nhắn `next-turn` bình thường và đánh thức driver. Nó không trả về handle hoàn thành; id tin nhắn xác định sự kiện chèn, nhận và bỏ trong inbox, không xác định output hay `turn/end` sau đó.
- `agent.steer(message)`: xếp hàng input steering (dẫn dắt giữa chừng) `next-step` sẽ đánh thức. Khi agent đang rảnh sẽ đồng bộ khởi động một lượt; steering tiếp theo nhận được trong lúc driver đang chạy sẽ được tiêu thụ ở ranh giới bước tiếp theo.
- `agent.inject(message)`: xếp hàng ngữ cảnh `next-step` không đánh thức. Driver đang chạy sẽ nhận nó tại ranh giới pre-step tiếp theo gần nhất; driver rảnh sẽ để nó ở trạng thái chờ, cho đến khi `followup()` hoặc `steer()` đánh thức driver. Nếu pre-step của một request nào đó đã nhận xong lô, nó có thể không kịp cho request đó.
- `agent.cancel(cause, options?)`: hủy driver đang hoạt động, và hủy bền vững toàn bộ công việc inbox đang chờ khi không đặt `options.keepInbox`. Hủy khi rảnh là no-op.
- `agent.whenIdle()`: quan sát toàn bộ agent đạt trạng thái ổn định hoàn toàn, bao gồm cả công việc thay thế được lên lịch trước khi driver hiện tại nghỉ hưu. Nó không giải quyết bất kỳ tin nhắn cụ thể nào.
- `agent.session`, `agent.status`, `agent.options`, `agent.id`, `agent.ctx`

`running` mô tả khoảng drain theo phạm vi driver, không phải bằng chứng lượt vẫn còn mở; nó có thể trải dài qua việc đóng lượt, checkpoint bền vững và các lượt xếp hàng liên tiếp. Chỉ bên gọi sở hữu khoảng đầy đủ mới có thể khái quát nó thành kết quả của một lần chạy ([quyết định](../../../.agents/notes/implemented/architecture/2026-07-30-followup-enqueue-and-owned-runs.md)).

### Điểm mở rộng

- Tạo Agent: `AgentLoop.create()` là triển khai đường dẫn cấu hình cụ thể (nằm trong `dsh-agent-loop`), bên tiêu thụ theo cách lập trình thì tạo hoặc khôi phục agent có quyền sở hữu qua `ctx.agents.create()`/`ctx.agents.resume()`. Khi thay thế vòng lặp, nên triển khai `Agent` và đăng ký qua `ctx.agents.register()`.
- Listener sự kiện: toàn bộ sự kiện `agent/*` được khai báo ở đây, không cần phụ thuộc gói vòng lặp.
- Ủy quyền subagent không phải là phương thức của `Agent`; provider tạo hoặc điều khiển handle thông thường qua API factory, do đó kênh ủy quyền nằm ngoài interface agent cốt lõi.

## Trải nghiệm model

### Tin nhắn user, steering và injection

#### Model nhìn thấy gì

`send`, `steer` và `inject` cung cấp input cho phiên sở hữu chúng. `agent/pre-step` và các sự kiện đã khai báo khác cho phép plugin từ chối bước dự kiến vào hoặc thêm tài liệu request bền vững; bản thân interface này không đóng góp văn bản cố định.

#### Ảnh hưởng Token

Nội dung được chấp nhận trở thành lịch sử được giữ lại, hoặc trở thành tiền tố phiên được lặp lại ở mỗi request; nội dung bị chặn không đóng góp token request. Kích thước tùy thuộc vào bên gọi và plugin.

#### Ảnh hưởng KV Cache

Lịch sử đã chấp nhận và steering chỉ-thêm; commit bị chặn không gửi request. Tiền tố phiên giữ ổn định trong instance vòng lặp, còn instance mới tạo hoặc khôi phục có thể thiết lập tiền tố khác.

### Lắp ráp request theo phạm vi Agent

#### Model nhìn thấy gì

Việc đăng ký qua `agent.ctx` có thể che phủ đoạn prompt hoặc công cụ, hoặc cài đặt interceptor chỉ áp dụng cho agent đó trong lúc setup chưa công bố.

#### Ảnh hưởng Token

Bản thân gói này không thêm token; đóng góp có phạm vi chỉ ảnh hưởng agent đó, và biến mất khi dispose.

#### Ảnh hưởng KV Cache

Miễn là đăng ký theo phạm vi của agent không đổi, tiền tố sẽ giữ ổn định. Thay đổi đoạn prompt, định nghĩa công cụ hoặc setup/reload listener request có thể làm mất hiệu lực khả năng tái sử dụng kể từ token request đầu tiên bị ảnh hưởng.

## Hạn chế đã biết và việc còn hoãn lại

- **Phạm vi bên khởi tạo chỉ tồn tại trong tiến trình**: worker, tiến trình con, HTTP, hàng đợi bền vững và khởi động lại phải truyền tường minh danh tính cần thiết.
- **Danh tính môi trường có thể tồn tại lâu hơn trạng thái còn sống**: bên tiêu thụ vẫn phải kiểm tra `agent.status`, trạng thái hủy và ước định năng lực sở hữu trước công việc nhạy cảm về vòng đời.
- **Kênh liên agent ngoài ủy quyền**: trạng thái chia sẻ, sub-output dạng stream và ngữ nghĩa nền/polling vẫn nằm ngoài seam `ctx.subagents` đồng bộ hiện tại.
- **`agent/session-start` không thể làm cổng chặn cho khởi động**: nó vẫn là thông báo đồng bộ và không thể phủ quyết; tổ hợp bất đồng bộ phải hoàn thành trước khi công bố thuộc về giao dịch `setup(agentCtx)` của factory.
- **`cancel()` mặc định xóa sạch inbox**: nó hủy cả lượt đang xử lý lẫn công việc xếp hàng và steering; `cancel(cause, { keepInbox: true })` chỉ hủy lượt và giữ lại mục đang chờ. Vẫn chưa có thao tác chỉ hủy bước mà vẫn để lượt đang xử lý tiếp tục chạy ([Agent Note API dừng](../../../.agents/notes/implemented/simplification/2026-06-20-public-agent-stop-api.md)).
- **Mỗi `UserMessage` gắn thêm đúng một `MessageSource`**: đóng góp của nhiều plugin gộp vào một lệnh gọi công cụ sẽ quy về cùng một nguồn, do đó tin nhắn đó không thể liệt kê nhiều bên sinh ra.
- **`SessionStartSource` dành sẵn `'clear'`/`'compact'`, nhưng chưa có bên phát**: trước khi hệ thống con điều khiển được hoàn thiện, chỉ `'startup'`/`'resume'` xuất hiện (`TODO(compaction)`).
