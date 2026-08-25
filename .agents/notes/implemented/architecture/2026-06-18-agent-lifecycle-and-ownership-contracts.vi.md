# Agent Note: Vòng đời Agent và các quy ước về quyền sở hữu

Status: implemented

[English](2026-06-18-agent-lifecycle-and-ownership-contracts.md) | Tiếng Việt

## Vấn đề

Một số hạn chế của ACP (Agent Client Protocol) và tool-bash đều là triệu chứng của cùng một quy ước sở hữu còn thiếu: plugin có thể tạo hoặc khôi phục agent qua `ctx.agents`, nhưng không thể sở hữu và dispose (giải phóng tài nguyên) từng agent một cách độc lập, còn các tác vụ bash chạy dài cũng không có chủ sở hữu ổn định trong bộ thực thi. ACP hủy và chờ agent khi mất kết nối, nhưng không thể chỉ hủy đăng ký agent của riêng phiên đó; `session/cancel` không thể hủy công việc đã vào hàng đợi nhưng chưa bắt đầu; `tool-bash` giữ quyền sở hữu tác vụ trong một `Map` cục bộ của plugin, nên chỉ một lần nạp lại HMR (thay thế module nóng) là đủ khiến các tác vụ cũ trông như vô chủ.

## Quyết định

Ba thay đổi về quy ước: hủy có nhận biết hàng đợi, bộ giải phóng `AgentHandle`, và token chủ sở hữu cho bash.

### 1. `Agent.cancel(cause?)` có nhận biết hàng đợi

Giao diện `Agent` được bổ sung động từ `cancel()` — nguyên thủy dừng công khai duy nhất. (Ban đầu nó được phát hành cùng `abort()` vốn hẹp hơn và chỉ tác động lên bước; `abort()` về sau bị gỡ vì không ai dùng, khiến `cancel()` trở thành cách công khai duy nhất để dừng công việc.) Nó dọn sạch FIFO queued + steering của inbox, hủy lượt đang hoạt động nếu có, và giữ lại một dấu pre-run không kèm cause, khiến prompt bị hủy trước khi được nhận sẽ không bao giờ chạy, trong khi các prompt đến sau vẫn độc lập. Lời gọi có hiệu lực sẽ phát `agent/cancel-requested` trước khi dọn hoặc hủy, kèm cause có kiểu `user | parent`; hủy khi rảnh không phát sự kiện nào và cũng không làm prompt kế tiếp bị mắc kẹt. `whenIdle()` sẽ đạt trạng thái dừng hẳn sau khi hủy, và `session/cancel` của ACP ánh xạ sang `user`. [Quyết định hủy lượt tường minh](2026-07-16-explicit-turn-cancellation.md) quy định cause, vòng đời signal và quy ước kết toán hợp tác hiện hành.

### 2. Bộ giải phóng bất đồng bộ `AgentHandle`

`ctx.agents.create`/`resume` (cũng như giao diện `AgentFactory`) trả về `AgentHandle = { agent: Agent; dispose(): Promise<void> }`. Bộ giải phóng là một **năng lực của Consumer** — người quan sát registry mà chỉ nắm `Agent` trần thì không thể tháo dỡ nó. Fiber gọi và Service Provider factory đã đăng ký là đồng sở hữu về mặt cấu trúc: việc gỡ tải fiber gọi cưỡng chế quyền sở hữu có cấu trúc, còn việc gỡ tải provider bắt buộc phải dừng thực thể cũ, vì bề mặt phụ thuộc theo phạm vi thực thể của nó được phân giải qua chính provider đó. Cả ba đường đều đi vào cùng một quá trình tháo dỡ đã được ghi nhớ: dừng vòng lặp, chờ nó thoát và hoàn tất việc xả khi rảnh (dừng hẳn hoàn toàn, chứ không chỉ lật trạng thái thành `disposed`), tách agent, tách phiên của nó, rồi giải phóng scope của nó. Mỗi ID công khai trở lại dùng được ngay khi mục registry chính xác của nó được tách ra; không có giai đoạn giải phóng phần giữ chỗ riêng biệt. Agent được tạo từ cấu hình đã thuộc quyền sở hữu của fiber `AgentLoop` (handle bị bỏ đi). ACP lưu bộ giải phóng của từng phiên mới tinh trong `SessionRecord` của nó và chạy bộ giải phóng đó khi mất kết nối hoặc khi plugin bị tháo dỡ, nhờ vậy việc client chỉ đơn thuần mất kết nối sẽ không để lại agent đã đăng ký hay mục lưu trữ phiên. Luồng tạo thua trong cuộc đua với việc đóng sẽ dispose handle chưa kịp công bố của nó.

**Thứ tự tháo dỡ có ý nghĩa sống còn với tính bền vững**, và hiện thực gộp vòng đời phiên vào một Cordis effect phức hợp duy nhất của agent (`SessionStore.prepare`/`enter`/`announce`, thay cho việc tách thành các effect anh em). Việc gỡ tải fiber sẽ giải phóng các effect anh em một cách đồng thời (`Promise.all`), khiến việc gỡ hook công bố append của kho lưu trữ phiên tranh chấp với `session/flush` lúc vòng lặp đóng, và do đó làm mất `turn/end` khi đóng; còn bên trong một effect duy nhất, các bộ giải phóng chạy như một chuỗi LIFO có thứ tự (dừng vòng lặp + `await agent.done` trước khi tách phiên), nên dù là `dispose()` của handle hay việc gỡ tải fiber thì đều bắt được lần xả cuối cùng của vòng lặp. Các thông báo `agent/disposed` và `session/disposed` đã được cách ly không thể bác bỏ chuỗi đó hay bỏ qua phần tháo dỡ còn lại.

### 3. Token chủ sở hữu Bash trong Service Definition

Quyền sở hữu tác vụ nền được chuyển từ `Map<string, Agent>` cục bộ của plugin `tool-bash` vào bộ thực thi. `ShellExecRequest` được bổ sung `owner?: string` tùy chọn; `ShellExecSpec` sau khi phân giải mang nó dưới dạng `owner: string | undefined` bắt buộc nhưng cho phép rỗng (owner bị quên là một `undefined` nhìn thấy được, chứ không phải một thuộc tính thiếu vắng lặng lẽ). Bộ thực thi lưu token trên tác vụ và phơi bày nó qua phương thức mới `ShellExecutor.ownerOf(id): string | undefined` (không đặt trên `BashTask` công khai — chỉ có một đường đọc, không cần API dư thừa). `tool-bash` xóa hẳn `Map` của mình: khi `start` nó đóng dấu `exec.agent?.id` (id registry/phiên dùng chung) làm owner, còn `bash_output`/`bash_kill` so sánh `ctx.shell.ownerOf(id)` với token của bên gọi theo ngữ nghĩa `!== undefined` (token là chuỗi rỗng vẫn là owner thật). Thông báo hoàn tất tìm agent còn sống có `agent.id === ownerToken` bằng cách quét `ctx.get('agents')?.list()` (đọc qua `ctx.get` — `onJobDone` chạy trên fiber bash, một fiber bên ngoài, nên dùng trực tiếp proxy `ctx.agents` sẽ ném lỗi). Vì quyền sở hữu giờ nằm trên tác vụ của bộ thực thi (được dispose cùng fiber `dsh-shell`), nó có thể sống sót qua các lần nạp lại HMR của `tool-bash`, khép lại lỗ hổng `XXX(tool-bash-owner-hmr)` trước đây. (Listener `onJobDone` vẫn bị ràng buộc bởi effect `apply` của `tool-bash`, nên việc hoàn tất rơi vào khe nạp lại vẫn làm mất một thông báo — đó là mất mát khe nạp lại vốn đã tồn tại — nhưng bản thân việc cách ly quyền sở hữu thì đã không còn bị HMR ảnh hưởng.)

## Xác minh

Các bất biến sau đã thành lập và được cố định bằng kiểm thử:

- Sau khi ACP mất kết nối hoặc plugin bị tháo dỡ, mọi phiên do lớp cầu nối sở hữu đều không để lại agent đã đăng ký hay mục lưu trữ phiên, kể cả luồng tạo đang tranh chấp với việc đóng kết nối.
- Thực thi `session/cancel` trước khi prompt đã vào hàng đợi khởi động sẽ ngăn prompt đó chạy; prompt được chấp nhận sau đó vẫn là một lượt đã vào hàng đợi độc lập.
- Nạp lại HMR `tool-bash` không khiến một phiên khác có thể đọc hay chấm dứt các tác vụ nền đang có (quyền sở hữu được giữ lại ở bộ thực thi).
- Các bản demo phi ACP hiện có vẫn hoạt động mà không cần quản lý handle tường minh; agent được tạo từ cấu hình vẫn thuộc quyền sở hữu của fiber plugin `AgentLoop`.

## Token chủ sở hữu phiên là duy nhất trong số các agent còn sống

Việc so sánh token chủ sở hữu bash dựa vào tính duy nhất của `Agent.id`/`SessionId` dùng chung trong số các agent còn sống. Các thao tác đồng thời có cùng ID đều có thể chuẩn bị riêng tư, nhưng khi công bố thì sẽ lần lượt đăng ký phiên rồi đến agent; `SessionStore.enter()` từ chối id phiên còn sống bị trùng, và mỗi giao dịch thất bại sẽ hoàn tác trạng thái riêng của chính nó. Do đó bên gọi theo cách lập trình không thể công bố hai agent còn sống dùng chung một token phiên. *Chính sách* truy cập (so sánh token) vẫn nằm ở Consumer `tool-bash`; năng lực bash chỉ lưu chuỗi `owner` mờ đục và không bao giờ diễn giải nó — đây chính là phép tách Service Definition / Service Provider / Consumer đúng đắn.

## Các phương án từng cân nhắc

- **Trường công khai `BashTask.owner`** thay cho phương thức Service Definition `ShellExecutor.ownerOf(id)`: bị bác bỏ. Chỉ cần một đường đọc, không cần API dư thừa.
- **Dùng các Cordis effect anh em cho vòng đời phiên của agent**: bị bác bỏ. Khi gỡ tải fiber, các effect anh em được giải phóng đồng thời (`Promise.all`), khiến việc gỡ hook công bố append do store sở hữu tranh chấp với `session/flush` lúc vòng lặp đóng; chỉ chuỗi LIFO có thứ tự của một effect phức hợp duy nhất mới bắt được `turn/end` khi đóng trên cả hai đường giải phóng.
- **Bổ sung một `abort()` chỉ hủy bước bên cạnh `cancel()`**: từng được phát hành ban đầu, sau bị gỡ vì không ai dùng; `cancel()` là nguyên thủy dừng công khai duy nhất (xem [Agent Note về giao diện dừng công khai](../simplification/2026-06-20-public-agent-stop-api.md)).

## Hệ quả

Thay đổi này cố ý chạm vào các giao diện công khai (`Agent`, `AgentFactory`, seam bash), thay vì là một bản vá cục bộ cho ACP. Việc giao agent đồng bộ vẫn đơn giản; đường vòng đời bất đồng bộ được thêm vào theo kiểu tăng dần, dành cho những chủ sở hữu cần đến nó.
