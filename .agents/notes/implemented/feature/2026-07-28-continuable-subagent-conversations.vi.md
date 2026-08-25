# Agent Note: subagent có thể tiếp tục

Status: implemented

[English](2026-07-28-continuable-subagent-conversations.md) | 中文

Bài này thay thế manager tiếp tục thực thi do Task hỗ trợ trong [subagent nền có thể tiếp tục](../../implemented/feature/2026-07-21-continuable-background-subagents.md). Nó giữ lại service `ctx.subagents` duy nhất được xác lập trong [gộp điều khiển subagent vào service subagent](../../implemented/simplification/2026-07-26-merge-subagent-control-service.md), cũng như thao tác `followup` được đặt tên theo intent, xác lập trong [thao tác tiếp tục subagent đặt tên theo intent](../../implemented/simplification/2026-07-27-intent-named-subagent-continuation-operations.md).

## Vấn đề

Manager tiếp tục thực thi trước đây khiến một Task, một lần thực thi provider và một ranh giới kết quả dùng chung một vòng đời. Task settle sẽ dispose (giải phóng tài nguyên) child Agent, Task hoàn thành sẽ tiêm thông báo hoàn thành, input tiếp theo sẽ dựng lại một Agent khác. Điều này từng khiến abstraction công việc nền tổng quát bị ràng buộc với việc gửi tin nhắn session, trong khi subagent có thể tiếp tục vốn đã có session và inbox Agent riêng.

Nếu manager tiếp tục thực thi xếp hàng cho yêu cầu tiếp tục, còn Agent giữ inbox riêng của nó, hệ thống sẽ có hai FIFO mà không có cơ chế thứ tự duy nhất. Còn nếu giao mọi tin nhắn cho Task, thì sẽ lặp lại cơ chế duyệt vào, hủy và dừng hẳn hoàn toàn mà agent loop (vòng lặp agent thông minh) đã có sẵn. `Agent.whenIdle()` không thể khôi phục kết quả Task của một yêu cầu đơn lẻ, vì một khoảng chạy có thể xóa nhiều lượt xếp hàng; `Agent.cancel()` rộng cũng không thể xóa chính xác một yêu cầu đang xếp hàng.

Vòng đời runtime cũng dài hơn một lượt đơn lẻ. Subagent có thể đã kết thúc lượt của chính nó, nhưng child mà nó tạo ra vẫn đang chạy. Lúc này dispose runtime của cha sẽ xóa mất Agent vẫn còn chịu trách nhiệm dỡ bỏ hậu duệ. Ngược lại, nếu để mọi subagent lịch sử luôn thường trú, việc dùng bộ nhớ sẽ mất giới hạn trên.

Agent cha cũng cần gửi công việc tiếp theo cho cùng một child đang online mà không thay đổi lượt hiện tại. Đưa mỗi tin nhắn tiếp tục vào hàng đợi dưới dạng follow-up có thể giữ được quy tắc thứ tự duy nhất.

## Quyết định

Một subagent có thể tiếp tục sở hữu một session bền vững, và tối đa một lần kích hoạt trong tiến trình:

```text
persisted Session
  -> optional live Activation
       -> one retained AgentHandle
       -> Agent inbox as the only turn FIFO
       -> zero or more owned child Activations
```

Activation là một chu kỳ thường trú tái dựng child Agent. Nó có thể thực thi nhiều lượt FIFO, và giữ thường trú khi đang chờ hậu duệ. Nó không phải là ranh giới request, kết quả, hủy hay Task.

Manager tiếp tục thực thi chịu trách nhiệm về duyệt vào activation, kiểm tra quyền, đồ thị sở hữu online, khôi phục nguội và dispose child-first. Agent loop chịu trách nhiệm toàn bộ thứ tự và thực thi lượt. Không có subagent có thể tiếp tục nào sở hữu Task, FIFO activation hay trạng thái activation queued.

### Vật chất hóa và thao tác công khai

Provider subagent có tên chỉ tham gia vào việc chuẩn bị spec tạo mới ban đầu, tại đây `spawn` và `fork` có sự khác biệt. Phương thức tùy chọn `prepareContinuable(request): Promise<ContinuableCreateSpec>` chính là năng lực tạo mới có thể tiếp tục. Spec trả về chỉ chứa input tạo mới tách rời khỏi Agent instance và do provider quyết định, ví dụ seed lịch sử cha tùy chọn; nó không chứa Agent, `AgentHandle`, gửi prompt, kết quả, dispose hay thao tác khôi phục. Manager sẽ dự trữ trước identity child, giải quyết descriptor bền vững và cấu hình Agent tổng quát, gọi `ctx.agents.create()` qua scope activation-owner riêng, cài đặt `AgentHandle` trả về vào activation, thiết lập sở hữu cha có thể tiếp tục thích hợp, rồi gọi `Agent.followup(initialPrompt)`. Khi inbox chấp nhận tin nhắn sẽ sinh ra một `MessageId`; `ctx.subagents.startContinuable()` trả về `{ childId, messageId }` tại ranh giới này, không chờ lượt bắt đầu, cũng không chờ tin nhắn được ghi vào log session.

Bất kỳ thất bại nào xảy ra trước khi inbox chấp nhận tin nhắn thì thao tác sẽ bị từ chối mà không trả về id nào. Luồng tạo Agent chịu trách nhiệm rollback trước khi handle được chuyển giao; sau khi chuyển giao, manager sẽ giữ một giao dịch đóng có thể quan sát được với việc gửi đồng thời và drain, dispose handle đã tạo, xóa activation và rollback bất kỳ thành viên nào trong `ownedChildren` của cha, rồi từ chối thao tác. Thất bại trước khi sự kiện thường trú start được công bố sẽ không phát sự kiện kết thúc, thất bại sau khi start được công bố sẽ đóng cặp vòng đời qua dispose bình thường.

`backgroundMode: 'one-shot' | 'continuable'` vẫn là chính sách deployment. Cấu hình thành continuable yêu cầu phải có `prepareContinuable`; việc có phương thức này hay không sẽ thay thế `SubagentProvider.resume?()` để trở thành kiểm tra năng lực, provider có năng lực này vẫn có thể chạy công việc one-shot.

Khôi phục nguội không được phân phối qua provider subagent. Manager tiếp tục thực thi sẽ gộp descriptor trong tiến trình tổng quát, gọi `ctx.agents.resume()` qua cùng scope activation-owner, cài đặt `AgentHandle` trả về, và commit `next-turn` đang chờ. `SubagentProvider.resume?()` và `SubagentProviderResumeRequest` đều không tồn tại. Sau khi provider ban đầu bị hủy đăng ký, descriptor vẫn giữ tên của nó; tên đó không cấp năng lực khôi phục, cũng không yêu cầu provider đó phải tồn tại ở lần thường trú sau. Provider từ xa cần thiết kế riêng.

`SubagentProvider.start()` và `SubagentRun` chỉ giữ lại trên đường one-shot không đổi. Activation có thể tiếp tục trực tiếp giữ `AgentHandle` của chính nó, không bao giờ tạo, bọc hay giữ `SubagentRun`; do đó, `SubagentRun.steer?()` không tồn tại.

`ctx.subagents.followup(parent, childId, content, { source, signal })` vẫn là thao tác tin nhắn tiếp tục duy nhất từ cha đến child. Agent cha online chính xác cấp phép gửi; khôi phục nguội sẽ kiểm tra quyền này trước khi tái dựng, mỗi đường còn kiểm tra lại lần nữa ở khoảng duyệt vào inbox cuối cùng không await, nên cha đã bị hủy đăng ký hoặc thay thế trong lúc vật chất hóa sẽ không thể cấp phép gửi. `source` ghi lại ai đã cung cấp tin nhắn được chấp thuận, không cấp bất kỳ quyền nào. Tool `send_message` hướng tới model chỉ giữ trường `subagent_id` và `message` ổn định, và luôn submit một lượt follow-up. Cả start và follow-up đều trả về `MessageId` đã chấp nhận, cả hai đều không báo cáo manager đã vật chất hóa activation như thế nào.

Đối với start và follow-up, signal của bên gọi chỉ giữ tìm kiếm, vật chất hóa và duyệt vào trước khi inbox chấp nhận tin nhắn. Sau khi thao tác trả về `MessageId`, manager sẽ giữ activation đó độc lập; việc hủy sau đó của bên gọi sẽ không hủy lượt đã được chấp nhận, cũng không dispose child.

### Session bền vững và activation online

Session giữ identity child ổn định, transcript (bản ghi văn bản), phả hệ cha trực tiếp, độ sâu ủy quyền và descriptor tiếp tục có version. `SessionHeader.parentSession` ghi lại cha trực tiếp, và là input xác thực; nó không phải năng lực định tuyến online, cũng không có nghĩa là cha được ghi lại vẫn còn thường trú.

Session lịch sử rảnh rỗi không có `AgentHandle`. Lần giao tin `next-turn` đầu tiên qua xác thực sẽ khôi phục activation dựa trên session bền vững, và submit tin nhắn vào inbox của nó. Khôi phục nguội dùng đúng Agent cha online đã xác thực danh tính để thực hiện xác thực quyền; khi cha đó có activation, còn dùng nó để thiết lập sở hữu, nhưng không bao giờ dùng cha để tái dựng.

Activation giữ trực tiếp `AgentHandle` đã công bố cho đến khi settle, còn scope activation-owner riêng của manager là chủ sở hữu cấu trúc hóa Cordis của nó. Đường subagent có thể tiếp tục không tạo bất kỳ lớp bọc thực thi mang kết quả trung gian nào, kể cả `SubagentRun`; ủy quyền một lần giữ nguyên, và không thuộc vòng đời này. Provider từ xa không nằm trong phạm vi ở đây, khi đưa vào cần giao ước sở hữu activation riêng.

### Vòng đời activation

Vòng đời thường trú nội bộ có ba trạng thái, không có trạng thái `queued` riêng:

```text
running
  | Agent quiescent with live children
  v
waiting
  | next-turn
  +--------------------------> running

running or waiting
  | Agent quiescent and no live children
  v
settled
  | AgentHandle.dispose completes
  v
no Activation
```

`running` nghĩa là Agent đang thực thi duyệt vào hoặc lượt, hoặc trong inbox có công việc sẽ đánh thức Agent. `waiting` nghĩa là Agent đã dừng hẳn hoàn toàn, nhưng activation vẫn giữ ít nhất một activation con chưa hoàn thành dispose. `settled` nghĩa là Agent đã dừng hẳn hoàn toàn và toàn bộ child đang giữ đã dispose; sau đó manager sẽ dispose `AgentHandle` và xóa activation.

Manager suy ra các trạng thái này dựa trên việc Agent đã dừng hẳn hay chưa và tập hợp child đang giữ, chứ không duy trì một máy trạng thái thực thi thứ hai. `next-turn` được giao trong lúc `running` sẽ vào inbox Agent. `next-turn` được giao trong lúc `waiting` sẽ đánh thức cùng Agent đó, và đưa activation trở về `running`. Gửi tin nhắn sau khi dispose hoàn tất sẽ khôi phục nguội một activation mới.

Manager sẽ tuyến tính hóa việc giao, giải phóng child và dispose cho mỗi child bền vững. Nếu việc giao và dispose cuối cùng cạnh tranh nhau, chỉ một bên có thể vượt qua điểm chốt duyệt vào: việc giao hoặc vào inbox của Agent vẫn online, hoặc chờ dispose hoàn tất rồi khôi phục nguội activation mới. Không bên gọi nào có thể gửi tin nhắn đến handle đã bắt đầu giao dịch dispose.

### Một inbox và giao follow-up

Inbox Agent là hàng đợi duy nhất. Mỗi tin nhắn tiếp tục đều dùng `Agent.followup()`, và trở thành một lượt FIFO; cả manager tiếp tục thực thi lẫn host đều không duy trì hàng đợi tin nhắn thứ hai. Mỗi mục đã được chấp nhận và sẽ đánh thức Agent sẽ giữ activation hiện tại online, cho đến khi `Agent.whenIdle()` quan sát thấy toàn bộ chuỗi công việc đánh thức đã kết thúc.

Định tuyến chỉ phụ thuộc vào trạng thái thường trú của activation:

| Trạng thái activation | `followup` |
|---|---|
| `running` | Xếp hàng trong cùng activation |
| `waiting` | Đánh thức cùng activation |
| Không có activation | Khôi phục nguội activation mới |

Tầng tiếp tục thực thi không định nghĩa kết quả định tuyến giao hàng riêng. Khi giao thành công, `ctx.subagents.followup()` hoặc `send_message` sẽ trả về `MessageId` đã chấp nhận, giao thất bại thì ném ngoại lệ. Các sự kiện `agent/inbox/enqueue`, `agent/inbox/dequeue` và `agent/inbox/discard` hiện có vẫn dùng để quan sát vòng đời tin nhắn; adapter có thể trình bày xác nhận chấp nhận tổng quát, nhưng không lộ các từ vựng định tuyến riêng của subagent như `started`, `queued`, `resumed`.

### Sở hữu child

Mỗi lần activation giữ `AgentHandle` của chính nó và một `ownedChildren: Set<SessionId>`. Vì một session tối đa có một lần activation online, id session child đã đủ để định danh child online, không cần thêm tham chiếu incarnation runtime khác. `SessionHeader.parentSession` ghi lại identity cha trực tiếp bền vững, còn thành viên trong `ownedChildren` ghi lại quan hệ sở hữu trong tiến trình.

Khi cha đã xác thực danh tính chính là một activation do manager tiếp tục thực thi quản lý, việc khởi động child hoặc submit công việc do cha khởi xướng sẽ đưa id session child vào `ownedChildren` của cha đó trước khi child có thể chạy hoặc tin nhắn có thể vào inbox của nó. Khi tập hợp này không rỗng, cha đó không thể settle hay dispose. Agent cấp cao nhất hoặc Agent không thuộc tiếp tục thực thi khác không có activation, cũng không tham gia đồ thị chờ đó.

Chỉ khi child Agent đã dừng hẳn hoàn toàn, mọi child mà child đó giữ đều đã dispose, best-effort flush session cuối cùng đã settle và `AgentHandle` của child hoàn thành dispose, hệ thống mới giải phóng child. Manager sẽ chờ `ctx.sessions.flush(child.session)`, nhưng không diễn giải giá trị boolean tham gia của nó: bất kỳ listener nào cũng không thể chứng minh backend bền vững đã chọn đã lưu trạng thái đó. Rejection sẽ được ghi log, nhưng không ngăn dispose handle hay giải phóng quyền sở hữu, vì giữ lại child sẽ khiến tổ tiên của nó bị cố định vĩnh viễn ở `waiting`. Nếu child thuộc sở hữu của cha, manager sau đó sẽ giải quyết cha online qua `SessionHeader.parentSession`, và xóa id session child khỏi `ownedChildren` của nó. Việc dỡ bỏ của manager dùng cùng thứ tự child-first.

Hệ thống sẽ giữ quyền sở hữu cho đến khi child activation hoàn thành dispose. Cải tiến sau này có thể giải phóng lease giới hạn theo request sớm hơn, nhưng điều đó cần liên kết chính xác việc hoàn thành lượt, và thiết kế không dùng Task này cố ý không thêm cơ chế đó.

Việc dỡ bỏ cấp cao nhất do host chịu trách nhiệm, chứ không biểu diễn thành một activation khác. Manager unload sẽ gọi drain toàn cục nội bộ của nó, đồng bộ đóng duyệt vào, chờ mỗi quá trình vật chất hóa đã được chấp thuận hoàn thành công bố hoặc rollback, dừng khu rừng online ổn định, và giải phóng theo thứ tự child-first. Host sở hữu Agent cấp cao nhất đã chọn dùng `drainContinuableDescendants(parents)`: identity Agent chính xác chỉ đóng duyệt vào dưới các gốc này cho đến khi mỗi identity rời khỏi registry, còn khu rừng không liên quan và duyệt vào toàn cục của manager vẫn online; manager sẽ dừng hậu duệ có thể thấy của nó trước lần await đầu tiên, chỉ chờ các quá trình vật chất hóa đã được chấp thuận dưới các gốc này, và chỉ giải phóng nhánh đã chọn. Mỗi lần vật chất hóa start và giao online đều sẽ kiểm tra lại việc hủy của bên gọi, scope draining khả dụng, dispose Activation và quyền cha chính xác trong cùng khoảng đồng bộ với việc chấp nhận vào inbox, nên chỉ cần việc dỡ bỏ hoặc thay thế cha xảy ra trước việc chấp nhận, sẽ ngăn được việc giao đến handle đang đóng. Chỉ khi drain khả dụng đã settle, host mới có thể dispose Agent cấp cao nhất của chính mình; chỉ có drain toàn cục của manager mới thực hiện trước dispose scope của manager.

Scope activation-owner sở dĩ tồn tại là vì effect owner Cordis thông thường bị hủy theo thứ tự đăng ký ngược, không thể biểu diễn đồ thị child động. Khi khởi tạo, manager sẽ đăng ký disposer cấu trúc hóa của scope riêng trước, rồi đăng ký disposer drain của chính nó, khiến việc hủy theo thứ tự ngược thực hiện drain trước, rồi giải phóng scope đó sau; nếu chỉ đăng ký cleanup effect trên cùng scope với Agent handle sau đó, dispose handle cấu trúc hóa có thể bỏ qua thứ tự child-first. Mỗi quá trình vật chất hóa sẽ đăng ký mục tham gia rào chắn của nó trước khi khởi động giao dịch nội bộ, và chụp snapshot tổ tiên online chính xác của nó, rồi giữ theo dõi cho đến khi cài đặt Activation hoặc rollback hoàn toàn. Activation sẽ giữ thành viên yếu của nó trong tập tổ tiên đó, nên Agent trung gian dù rời khỏi registry cũng không khiến hậu duệ vẫn online thoát khỏi phạm vi có thể thấy của gốc host. Mỗi Activation sẽ cài đặt một dispose promise được ghi nhớ trước khi hủy hoặc callback đệ quy, để việc đóng host giới hạn scope, unload manager toàn cục, giải phóng child và settle bình thường có thể hội tụ mà không giải phóng lặp lại. Việc hủy sẽ lan truyền từ trên xuống trước khi chờ dọn dẹp hậu duệ chậm; việc giải phóng handle vẫn là child-first. Các nhánh cùng cấp drain độc lập; hệ thống sẽ ghi log thất bại dispose đơn lẻ, nhưng vẫn thử các handle đã chọn còn lại, drain tổng hợp thì báo cáo thất bại sau khi mọi nhánh đã chọn settle. Việc dỡ bỏ trong tiến trình này không hủy các session child bền vững.

### Mở rộng giao báo cáo

Tool `report(output)` phạm vi child tùy chọn thêm sau này sẽ không thay đổi trạng thái thường trú Activation, cũng không thêm hàng đợi khác. Nó có thể được gọi không hoặc nhiều lần mỗi lượt, không cho phép chỉ định bên nhận, mà suy ra cha trực tiếp online; việc giao dùng tiêm âm thầm hay đánh thức follow-up của cha do cấu hình deployment chọn. [Agent Note tool report](2026-07-30-continuable-subagent-report-tool.md) quy định quyền, xác nhận, đóng góp setting và giao ước giao hàng của nó.

### Steering (dẫn dắt giữa chừng) hoãn lại

Bản này không lộ thao tác subagent steering. Tin nhắn tiếp tục của cha luôn mở lượt FIFO tiếp theo, nên tầng tiếp tục thực thi không lưu bên kiểm soát lượt hiện tại, cũng không thêm giao ước duyệt vào Agent nhận biết bên kiểm soát.

Host UI sau này có thể lộ riêng thao tác **Steer** và **Follow up**. Steering của host phải nghiêm ngặt chỉ dùng khi online: chỉ khi activation chấp nhận bước tiếp theo, nó mới có thể gọi đường steering Agent hiện có; các trường hợp khác phải từ chối, và không bao giờ chuyển thành xếp hàng hay khôi phục nguội. Việc có lộ steering cha qua tool hướng tới model hay không vẫn cần thiết kế riêng.

### Quyền và identity người gửi đã ghi log

Quyền đến từ ngữ cảnh tool Agent online chính xác. Sau khi duyệt vào, `MessageSource` và `senderSessionId` ghi lại ai đã cung cấp tin nhắn; bên gọi không thể dùng các trường này để lấy quyền.

Bản này chỉ cấp quyền cho cha trực tiếp của child bền vững. Manager sẽ kiểm tra `SessionHeader.parentSession` dựa trên Agent cha online chính xác tại ranh giới duyệt vào inbox cuối cùng không await, trước khi đăng ký child vào `ownedChildren` của cha đó; khôi phục nguội còn thực hiện một lần kiểm tra sớm hơn trước khi tái dựng, để fail nhanh. Agent khác, tổ tiên, host, team và workflow vẫn bị từ chối, cho đến khi có bên tiêu thụ cụ thể chứng minh giao ước quyền khác là hợp lý.

Việc giao do cha khởi xướng yêu cầu cha phải online tại thời điểm duyệt vào, và tiếp tục online nhờ quan hệ sở hữu.

### Bền vững, dispose và khôi phục

Sau khi không còn Task, hệ thống không còn cung cấp `job_output`, `job_kill`, trạng thái Task hay promise kết quả theo từng tin nhắn. Signal của bên gọi chỉ có thể hủy start hoặc follow-up trước khi inbox chấp nhận tin nhắn. Sau khi tin nhắn được chấp nhận, cha không thể hủy tin nhắn đã chấp nhận hay dispose activation qua `ctx.subagents`; thao tác dừng công khai duy nhất là [ngắt lượt hiện tại](2026-08-06-continuable-subagent-interrupt.md) sau này, nó dùng `keepInbox` để hủy lượt hiện tại của target online, giữ nguyên thường trú, công việc đang chờ và hậu duệ.

Việc dỡ bỏ của host và manager vẫn là đường dừng vòng đời. Manager unload sẽ áp dụng nó toàn cục; host chỉ áp dụng nó dưới Agent cấp cao nhất mà nó sở hữu chính xác. Cả hai hình thức đều sẽ đóng scope duyệt vào khả dụng, dừng Activation có thể thấy đã chọn, chờ các quá trình vật chất hóa đã được chấp thuận trong scope đó, giải phóng theo thứ tự child-first, và giữ lại Session bền vững.

Mỗi lượt sẽ yêu cầu checkpoint bền vững session thực thi, còn Activation settle cuối cùng sẽ chờ `ctx.sessions.flush()`, coi nó là rào chắn best-effort. Manager cố ý bỏ qua kết quả boolean, vì việc listener có tham gia hay không không thể định danh backend bền vững. Rejection sẽ được ghi log, nhưng không thay đổi kết quả vòng đời hay kết quả drain của host; manager vẫn sẽ dispose handle và giải phóng quyền sở hữu, trạng thái child bền vững lúc khôi phục sau đó có thể thiếu hoặc cũ.

Chỉ tin nhắn thực sự được ghi vào log session của child mới có thể giữ lại nguồn gốc cung cấp nó khi tái dựng; chỉ được inbox chấp nhận không đảm bảo được khôi phục sau restart.

Trạng thái bền vững của session và descriptor có thể giữ lại sau restart. Trạng thái activation, nội dung inbox Agent và đồ thị sở hữu đều là trạng thái trong tiến trình. Tiến trình crash có thể mất prompt ban đầu hoặc follow-up đã được chấp nhận nhưng còn nằm trong inbox, chưa được ghi vào log session. Session và descriptor có thể vẫn còn, nên tin nhắn được cấp quyền sau đó vẫn có thể khôi phục nguội child, nhưng tin nhắn đã mất sẽ không tự động replay. Khôi phục tin nhắn đã chấp nhận nhưng chưa hoàn thành hoặc chưa ghi log cần giao ước inbox bền vững, đề xuất này không ngụ ý năng lực đó.

### Phạm vi

Bản này bao phủ child có thể tiếp tục trong tiến trình, ủy quyền một lần giữ nguyên. Provider từ xa phải có handle activation riêng, cùng giao ước xác thực tương đương và giao ước dừng hẳn hoàn toàn child-first, mới có thể hỗ trợ cùng hành vi.

Nó không thêm host-user tiếp tục thực thi, thao tác subagent steering, mailbox bền vững, lease xuyên tiến trình, replay tự động công việc inbox bị ngắt, quyền team, quyền workflow, truy vấn thường trú công khai, giới hạn số activation online mới hoặc tổng số hậu duệ, hay runtime cache; [ngắt lượt hiện tại](2026-08-06-continuable-subagent-interrupt.md) sau này bổ sung thao tác dừng công khai duy nhất trên vòng đời này. Chính sách độ sâu ủy quyền hiện có giữ nguyên. Báo cáo child đến cha tùy chọn là tính năng tiêu thụ vòng đời này sau này, không thuộc năng lực có thể tiếp tục cơ bản.

## Phương án thay thế đã cân nhắc

**Giữ activation do Task hỗ trợ.** Task có thể cung cấp trạng thái tổng quát, thu thập kết quả và hủy, nhưng dùng Task để gửi session sẽ tạo ra hàng đợi thứ hai, và lặp lại quyền sở hữu lượt. Thiết kế này từ bỏ những kiểm soát Task tổng quát đó, để inbox Agent trở thành thứ tự thực thi duy nhất.

**Mỗi `next-turn` tạo một lần activation.** Điều này sẽ khôi phục ranh giới kết quả và hủy độc lập, nhưng cần duy trì FIFO manager bên cạnh inbox Agent, còn khiến Agent được giữ lại vượt qua ranh giới activation nhân tạo. Mỗi chu kỳ thường trú ứng với một activation nhỏ hơn, cũng trực tiếp theo vòng đời `AgentHandle`.

**Dispose Agent trong lúc chờ.** Tái dựng cha khi child vẫn thuộc đồ thị sở hữu tiến trình trước đó, cần giao ước sở hữu và dỡ bỏ bền vững. Chỉ giữ `AgentHandle` cho đồ thị sở hữu chưa hoàn thành có thể giữ được dỡ bỏ child-first mà không để lịch sử đã settle thường trú.

**Để provider tạo, khôi phục child hoặc giao tin nhắn qua Agent handle.** Provider ban đầu chỉ giữ khác biệt duy nhất là `prepareContinuable()` và spec tạo mới tách rời của nó: child là khởi động hoàn toàn mới, hay có tiền tố cha. Manager phải tự gọi `ctx.agents.create()` qua scope activation-owner riêng, khiến scope đó trở thành chủ sở hữu cấu trúc hóa của mỗi handle. Session trong tiến trình bền vững đã bao gồm tiền tố ban đầu và descriptor tái dựng tổng quát, còn việc giao tin nhắn thuộc về inbox Agent. Để provider giữ bất kỳ handle sau đó, `SubagentRun` hay quyền sở hữu tin nhắn nào sẽ khiến provider giữ quyền sở hữu mà không có hành vi đã giao nào cần nó.

**Đưa việc giao báo cáo vào vòng đời cơ bản.** Báo cáo child đến cha có thể lặp lại tương thích với vòng đời này, nhưng giao âm thầm hay giao đánh thức, xác nhận, bền vững và hành vi thử lại đều là quyết định sản phẩm độc lập. Gói report sau này giữ tùy chọn, và tiêu thụ một hook setting child tường minh, nên thường trú có thể tiếp tục không mặc định cấp kênh trả về.

**Coi `SessionHeader.parentSession` là quyền sở hữu online.** Phả hệ bền vững không thể chứng minh cha được ghi lại hiện đang giữ child. Thành viên `ownedChildren` của cha online sẽ ghi lại quan hệ trong tiến trình, mà không thay đổi id cha bền vững.

**Giữ Agent cha chính xác trong một link riêng.** Activation cha đã giữ `AgentHandle` của chính nó, và `ownedChildren` sẽ ngăn activation đó dispose khi child vẫn online. Do đó, giải quyết cha qua id session đã đủ, cũng tránh được tham chiếu runtime dư thừa.

**Duy trì hàng đợi riêng cho tin nhắn tiếp tục.** FIFO thứ hai sẽ khiến thứ tự giữa nó và tin nhắn đã được Agent chấp nhận không rõ ràng. Một inbox Agent duy nhất cung cấp thứ tự duy nhất và có thể quan sát cho mỗi lượt đã chấp nhận.

**Lộ subagent steering ngay bây giờ.** Steering của cha cần trạng thái bên kiểm soát lượt hiện tại, và chính sách duyệt vào riêng khác với giao follow-up. Phiên bản đầu tiên xếp hàng mọi tin nhắn tiếp tục, có thể tránh đưa vào trạng thái đó và cạnh tranh duyệt vào của nó.

**Lộ host-user follow-up khi chưa có bên tiêu thụ host.** Phương thức đúc quyền công khai và nhánh người dùng có thể thực hiện khôi phục nguội khi không có cha lịch sử, nhưng chưa có adapter host sản xuất nào gọi thao tác đó. Trước khi tương tác host đã xác thực cụ thể có thể nhận năng lực riêng, API tiếp tục thực thi chỉ chấp nhận cha online chính xác.

**Trả về định tuyến giao hàng riêng của subagent.** Các nhãn như `started`, `queued` và `resumed` sẽ lặp lại trạng thái activation và inbox, mà không cung cấp kết quả độc lập cho bên gọi. Tái sử dụng `MessageId` và sự kiện inbox hiện có, có thể để liên kết giao hàng tiếp tục do giao ước Agent mà nó thuộc về đảm nhiệm.

**Dùng đếm tham chiếu child.** Bộ đếm không thể nhận biết child nào vẫn còn công việc dỡ bỏ, cũng cho phép lỗi giảm lặp lại. Tập hợp identity sẽ tường minh giữ nghĩa vụ hủy và dispose.

## Ảnh hưởng

Cách triển khai này cố định các hành vi sau:

- Child có thể tiếp tục tối đa có một activation online và một inbox Agent; manager tiếp tục thực thi không có FIFO activation hay trạng thái activation queued.
- `SubagentProvider.prepareContinuable?()` chỉ trả về `ContinuableCreateSpec` tách rời; cấu hình thành continuable yêu cầu có năng lực này, còn `backgroundMode` vẫn là lựa chọn chính sách độc lập.
- Manager gọi `ctx.agents.create()` qua scope activation-owner riêng, cài đặt `AgentHandle` trả về và thiết lập sở hữu cha, gọi `Agent.followup(initialPrompt)`, rồi trả về `{ childId, messageId }` khi inbox chấp nhận tin nhắn và sinh `MessageId`, mà không chờ lượt bắt đầu hay tin nhắn được ghi vào log session.
- Mỗi đường thất bại trước khi prompt ban đầu được inbox chấp nhận đều khiến thao tác bị từ chối và không trả về id, và rollback bất kỳ handle, activation và thành viên `ownedChildren` của cha đã tạo qua một giao dịch đóng có thể quan sát được với việc gửi đồng thời và drain; thất bại công bố vòng đời không sinh sự kiện kết thúc không ghép cặp.
- Khôi phục nguội do manager tiếp tục thực thi gọi `ctx.agents.resume()`, không bao giờ đi qua hoặc phụ thuộc vào provider subagent ban đầu; sau khi xóa provider, descriptor vẫn giữ tên provider ban đầu, và `SubagentProvider.resume?()` cùng `SubagentProviderResumeRequest` đều không tồn tại.
- Activation có thể tiếp tục trực tiếp giữ `AgentHandle`, không bao giờ tạo, bọc hay giữ `SubagentRun`; `SubagentProvider.start()` và `SubagentRun` chỉ dùng cho one-shot, và không có `SubagentRun.steer?()`.
- `followup()` chỉ chấp nhận cha trực tiếp online chính xác, và kiểm tra lại identity này ở ranh giới duyệt vào inbox cuối cùng không await sau bất kỳ vật chất hóa nào; thông tin nguồn gốc tin nhắn bền vững không thể cấp quyền giao hàng.
- Tin nhắn tiếp tục luôn dùng `Agent.followup()` và dùng chung FIFO inbox của nó, kể cả khi child đã có lượt đang mở.
- `ctx.subagents.followup()` và adapter `send_message` của nó chỉ trả về `MessageId` đã chấp nhận; tầng tiếp tục thực thi không chấp nhận target giao hàng, cũng không định nghĩa kết quả định tuyến riêng của subagent.
- Signal của bên gọi chỉ có thể dừng start và follow-up trước khi inbox chấp nhận tin nhắn, việc dỡ bỏ giới hạn tại host và dỡ bỏ toàn cục của manager vẫn giữ dọn dẹp child-first; [ngắt lượt hiện tại](2026-08-06-continuable-subagent-interrupt.md) là thao tác dừng công khai duy nhất, và không đi vào luồng dỡ bỏ.
- Bản này không lộ thao tác subagent steering hay trạng thái bên kiểm soát lượt hiện tại.
- Agent rảnh rỗi có child đang giữ online sẽ sinh activation `waiting`, `AgentHandle` của nó tiếp tục được giữ lại.
- Giao `next-turn` đến `waiting` sẽ đánh thức cùng một activation; giao tin nhắn sau khi hoàn thành dispose sẽ khôi phục nguội activation mới.
- Mỗi activation cha do manager tiếp tục thực thi quản lý chỉ dispose sau khi mọi activation child trực tiếp giữ đã hoàn thành dispose `AgentHandle`; Agent cấp cao nhất không tham gia đồ thị chờ.
- Activation settle cuối cùng sẽ chờ `ctx.sessions.flush(child.session)`, coi nó là rào chắn best-effort; nó sẽ ghi log rejection, nhưng không diễn giải việc listener tham gia thành bằng chứng bền vững, rồi dispose handle child và giải phóng quyền sở hữu cha, khiến flush thất bại không rò rỉ Activation `waiting`.
- Việc dỡ bỏ của manager sẽ đóng duyệt vào toàn cục; host sở hữu Agent cấp cao nhất đã chọn thì chỉ đóng duyệt vào dưới các identity chính xác này cho đến khi các gốc này rời khỏi registry. Cả hai đều theo dõi quá trình vật chất hóa đã được chấp thuận theo quan hệ tổ tiên chính xác, cài đặt một điểm chốt dispose được ghi nhớ cho mỗi Activation có thể thấy đã chọn, lan truyền hủy từ trên xuống, giải phóng handle theo thứ tự child-first, dù nhánh riêng lẻ thất bại vẫn chờ toàn bộ nhánh đã chọn, sau đó mới dispose Agent cấp cao nhất tương ứng hoặc scope manager.
- Vòng đời cơ bản không lộ hành vi báo cáo ngầm; gói report tùy chọn đóng góp một tool phạm vi child tường minh qua hook setup.
- Log session chỉ tái dựng tin nhắn thực sự đã ghi, và giữ lại nguồn gốc cung cấp mỗi tin nhắn; tin nhắn đã được inbox chấp nhận nhưng chưa ghi log không đảm bảo khôi phục sau restart.
- Đường subagent có thể tiếp tục không tạo hoặc phụ thuộc vào Task, `JobId`, thông báo hoàn thành Task, hủy Task hay lớp bọc thực thi mang kết quả trung gian.
- Test đơn vị chốt ranh giới trả về của `startContinuable()` khi inbox chấp nhận tin nhắn, rollback đầy đủ ở mỗi đường thất bại trước và sau khi chấp nhận và công bố vòng đời, drain toàn cục và giới hạn theo scope cha đều chờ quá trình vật chất hóa kẹp giữa công bố Agent và đăng ký Activation dừng hẳn hoàn toàn, cách ly khu rừng cùng cấp, quan hệ tổ tiên chính xác sau khi Agent trung gian rời khỏi registry, khôi phục nguội không phụ thuộc provider, tái cấp quyền cha chính xác cuối cùng sau khi khôi phục nguội vật chất hóa, signal bên gọi và quyền sở hữu dỡ bỏ ở cả hai giai đoạn trước và sau chấp nhận, và tin nhắn đã chấp nhận nhưng chưa ghi log sẽ không tự động replay.
- Test đơn vị chốt bảng định tuyến chỉ do trạng thái thường trú quyết định, thứ tự inbox đơn, liên kết `MessageId` qua sự kiện inbox, follow-up trong lượt đang mở, đánh thức khi chờ, khôi phục nguội, đăng ký và giải phóng quyền sở hữu, dispose child-first, cạnh tranh giữa gửi và dispose, flush cuối cùng best-effort khi không có listener và khi listener thất bại, và không tồn tại hủy hay steering subagent công khai.
- Test đơn vị của gói report lần lượt chốt khả năng hiển thị chỉ dành cho child, hủy đăng ký setup, quyền, chế độ giao hàng, identity tin nhắn ổn định và cạnh tranh vòng đời.
- Một snapshot ứng dụng toàn bộ keyless bao phủ ủy quyền cha và xếp hàng follow-up, không tồn tại subagent steering và giao báo cáo ngầm, giữ `AgentHandle` trong waiting và dispose child-first. Một snapshot report khác bao phủ kênh trả về tường minh tùy chọn.

### Cái giá đã chấp nhận

Xóa Task sẽ từ bỏ việc kiểm tra công việc nền tổng quát, thu thập kết quả và hủy Task chính xác. Nếu các tính năng sản phẩm này trở thành nhu cầu, sẽ cần request ticket hoặc năng lực inbox không tái đưa vào hàng đợi thực thi thứ hai.

Giữ activation trong lúc hậu duệ đang chạy sẽ tiêu tốn tài nguyên Agent theo quy mô đồ thị sở hữu chưa hoàn thành. Chính sách độ sâu ủy quyền hiện có vẫn giới hạn cấp lồng, nhưng bản này không thêm giới hạn số activation online mới hoặc tổng số hậu duệ; session lịch sử đã settle không giữ `AgentHandle`.

Inbox trong tiến trình và đồ thị sở hữu không thể điều phối hai tiến trình harness. Deployment cho phép nhiều tiến trình đồng thời truy cập cùng lưu trữ bền vững vẫn cần giao ước lease và mailbox bền vững.

Khi chưa cài gói report tùy chọn, việc hoàn thành lượt child sẽ không gửi nội dung cho cha lịch sử, cũng không đánh thức nó. Sau khi cài, chỉ có việc gọi `report` tường minh mới gửi nội dung đã chọn; giao âm thầm không đánh thức cha, giao đánh thức thì đưa vào một lượt tiếp theo. Dù thế nào, output chi tiết của child vẫn được giữ trong session bền vững của nó.

Xếp hàng mỗi tin nhắn tiếp tục có nghĩa là cha không thể sửa ngay lập tức lượt child đang tiến hành; thao tác sửa sẽ thực hiện ở lượt tiếp theo. Thao tác steering UI sau này có thể rút ngắn độ trễ đó, mà không thay đổi thứ tự follow-up.

Khi flush cuối cùng best-effort thất bại sẽ được ghi log, đồng thời đồ thị sở hữu runtime vẫn tiếp tục drain; trạng thái child bền vững có thể thiếu hoặc cũ. Thử lại và sửa chữa cần thiết kế khôi phục riêng.
