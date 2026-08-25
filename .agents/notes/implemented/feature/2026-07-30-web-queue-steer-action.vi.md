# Agent Note: Chuyển tin nhắn Web đã xếp hàng thành steering (dẫn dắt giữa chừng) cho lượt đang hoạt động

Status: implemented

[English](2026-07-30-web-queue-steer-action.md) | 中文

## Vấn đề

Trước đây Web composer coi mọi lần submit bằng Enter trong lúc agent đang chạy là một lần đưa vào Queue. QueueDock đã cung cấp một dòng có thể định vị cho mỗi tin nhắn đang chờ, transcript bền vững cũng đã có thể render sự kiện steer đã tiêu thụ thành bong bóng kiểu người dùng, nhưng Web chưa có thao tác kết nối hai giao diện này lại, cũng chưa cho người dùng cử chỉ để chọn steering lượt hiện tại trực tiếp từ composer.

Nếu Web xóa dòng đó ở phía client trước rồi mới gọi `session.prompt(mode: 'steer')`, thì ý định của người dùng trong một lần thao tác sẽ bị tách thành hai RPC. Driver có thể nhận (claim) mục đó trước giữa hai lần gọi, và việc gửi steering cũng có thể thất bại sau khi đã xóa; fallback `agent.steer()` cố gắng-hết-sức hiện có còn có thể âm thầm thêm một mục Queue mới sau khi mục nhập-hàng-một-lần ban đầu đã bị xóa. Vì vậy, thao tác gửi ngay lập tức phải phân biệt giữa steering lượt hiện tại và việc đẩy lên trước trong Queue, và phải giữ lại dòng gốc khi steering không khả dụng.

## Quyết định

### Thỏa ước sản phẩm

Trong mỗi session bình thường, mỗi dòng QueueDock không ở trạng thái edit sẽ có thao tác mũi tên hướng lên tên là "Gửi chen ngang" (steer send). Thao tác này chỉ được kích hoạt khi session báo cáo agent đang chạy; các tin nhắn chứa nội dung hỗn hợp vẫn dùng được vì steering chuyển tiếp toàn bộ `UserMessage` bất biến, chứ không phải phần chiếu văn bản của dòng đó. Chiếu Queue của một subagent đã được định vị vẫn ở chế độ chỉ đọc, vì đường truyền tiếp tục thực thi của nó không cung cấp thay đổi Queue.

Kích hoạt thao tác này sẽ yêu cầu steering nghiêm ngặt cho lượt hiện tại, gắn với `InboxItemId` tương ứng. Sau khi thao tác thành công, snapshot có thẩm quyền của Host sẽ xóa dòng Queue, và chiếu ngay cùng một steering đang chờ ngay sau dòng trạng thái chạy `Deep diving...`; bong bóng đó cung cấp copy, nhưng tin nhắn chưa có số thứ tự sự kiện bền vững nên chưa cung cấp fork. Sau khi AgentLoop tiêu thụ hết mục đó, sự kiện `user/message` bền vững hiện có sẽ tiếp quản cùng bong bóng kiểu người dùng đó, và khôi phục đồng hồ, copy và fork mà không cần thêm đường hiển thị bền vững riêng.

Cờ running chỉ dùng để gợi ý trạng thái tương tác. Tại ranh giới thay đổi đồng bộ, giá trị `acceptsNextStep` của AgentLoop mới là căn cứ có thẩm quyền. Nếu cửa sổ đó đã đóng, thao tác sẽ giữ nguyên mục nhập-hàng-một-lần trong Queue và trả về lỗi được gõ kiểu (typed) `steer-unavailable`, sau đó mục nhập-hàng-một-lần đánh thức ban đầu sẽ tiếp tục thực thi qua Queue. Nếu driver đã claim mục đó, thao tác trả về lỗi hiện có `queue-item-not-found`, và việc gửi lượt độc lập đã bắt đầu. UI coi cả hai tình huống race này là đã hội tụ về gửi qua Queue, không hiển thị thông báo lỗi; lỗi truyền tải và lỗi không xác định thì vẫn hiển thị.

Composer dùng một bộ thỏa ước cố-gắng-hết-sức khác cho input mới. Khi session được định vị đang idle, cả Enter và Cmd/Ctrl+Enter đều thực hiện gửi Queue thông thường. Trong khi session chính đang chạy, tùy chọn trong General Settings sẽ gán Enter thường thành Queue (mặc định) hoặc Steer, còn Cmd/Ctrl+Enter thực hiện hành vi còn lại; Shift+Enter dùng để xuống dòng. Subagent đã được định vị khiến cả hai cử chỉ này dùng đường truyền tiếp tục thực thi chỉ hỗ trợ Queue của nó. Tài liệu Host settings persist tùy chọn này giữa các Web origin dùng chung cùng một DSH home, và nó chỉ ảnh hưởng đến cặp cử chỉ ở trạng thái bận hỗ trợ steering. Nếu Steer gửi trực tiếp từ composer bỏ lỡ cửa sổ next-step hiện tại, AgentLoop sẽ tự động chấp nhận nó thành lượt Queue đánh thức tiếp theo, Web không hiển thị lỗi.

### Ranh giới Agent và vòng đời

`InboxAction` thêm thao tác `{ kind: 'steer' }` được hỗ trợ bởi bên tiêu thụ thực sự, ngoài edit và remove. `Agent.updateInbox()` chỉ xử lý thao tác này khi tìm thấy mục nhập-hàng-một-lần đang queued và xác nhận `acceptsNextStep`, không bao giờ ủy quyền cho alias `agent.steer()` cố-gắng-hết-sức.

Sau khi thao tác được áp dụng thành công, hệ thống sẽ kết thúc mục nhập-hàng-một-lần đang queued, và chấp nhận cùng `UserMessage` bất biến đó thành một mục nhập-hàng-một-lần steering mới. Mục nhập-hàng-một-lần steering sẽ nhận `InboxItemId` mới và `placement: 'steering'` phản ánh trung thực phương thức gửi, còn tin nhắn thì giữ nguyên `MessageId`, nội dung, nguồn gốc và bất kỳ bộ điều khiển gửi `SteeringReceipt` đang chờ nào. AgentLoop sẽ cài đặt mục outbox mới trước, rồi mới publish sự kiện vòng đời; sau đó phát ra enqueue của mục nhập-hàng-một-lần mới trước, rồi mới phát discard của mục cũ, để đảm bảo việc hủy có thể tái nhập (reentrant cancellation) không thể quan sát hay loại bỏ một mục chưa được công bố. Vì vậy, bất biến bảo toàn inbox hiện có vẫn yêu cầu mỗi mục nhập-hàng-một-lần tương ứng đúng một enqueue, và một dequeue hoặc discard ở trạng thái cuối.

Thao tác này không chạy `agent/prompt-submit`: việc chọn steering có chủ ý thay đổi phương thức gửi từ một lượt được chấp nhận độc lập thành input next-step của lượt hiện tại. Nó không hủy công việc hiện tại, cũng không sắp xếp lại các mục còn lại trong Queue.

### Ranh giới Host và client

`session.updateQueue` mang thao tác `steer`, và ánh xạ hai kết quả tiêu cực thành lỗi RPC được gõ kiểu. Việc chuyển đổi này là một thao tác Agent đồng bộ; Host không bao giờ tái tạo nó bằng cách kết hợp gọi remove và prompt.

Host vẫn dùng `queuedMirror` hiện có làm nguồn thẩm quyền duy nhất cho inbox tạm thời. Snapshot `session/queue` mang tất cả mục nhập-hàng-một-lần còn sống cùng `placement: 'queued' | 'steering'`: QueueDock chỉ render các dòng queued, còn ChatView render steering đang chờ ở cuối luồng session, ngay sau dòng trạng thái chạy `Deep diving...`, cung cấp thao tác copy nhưng không cung cấp fork, edit hay xóa. Kết nối lại sẽ phát lại cùng snapshot đó, nên khả năng hiển thị này không phụ thuộc vào hiển thị lạc quan (optimistic) phía client, cũng không cần registry thứ hai.

Khi AgentLoop claim một steering đang chờ, nó phát `agent/inbox/dequeue` ngay trước khi đồng bộ thêm sự kiện `user/message` bền vững. Host chờ đến microtask kế tiếp mới loại bỏ dòng steering đó, để sự kiện session bền vững đi vào luồng mux tuyến tính trước. Khi Session phía client tiếp nhận sự kiện thời gian thực này, nó sẽ loại bỏ mục steering hiện tại đầu tiên khớp trước khi publish snapshot; phát lại lịch sử không tiêu thụ mục nhập-hàng-một-lần dùng lại cùng `MessageId` về sau. Vì vậy, ChatView không cần quét lịch sử bền vững vẫn có thể render đúng một nguồn thẩm quyền mỗi lần, còn chiếu bền vững thì khôi phục đồng hồ, copy và fork dựa trên thời gian và số thứ tự sự kiện đã ghi. Khi việc thêm vào thất bại, dòng đã claim vẫn bị loại bỏ.

`session.prompt(mode: 'steer')` hiện có với input mới trên session chính vẫn dùng thỏa ước cố-gắng-hết-sức: ngoài cửa sổ next-step, nó sẽ trở thành lượt tiếp theo đánh thức agent. Composer để chế độ `queue | steer` tường minh đi qua phân xử slash và serialize tham chiếu trước khi gọi thỏa ước đó. Chính sách submit của trình duyệt sở hữu tùy chọn Enter ở trạng thái bận thời gian thực, còn Host settings service sở hữu tính bền vững; chính sách này chỉ phân giải Enter thường và Enter tăng tốc thành hai cử chỉ bổ sung nhau cho các session hỗ trợ steering, dòng Settings và InputBar dùng chung chính sách này chứ không triển khai lại thẩm quyền lưu trữ hay cửa sổ gửi. Chỉ thao tác dòng Queue dùng ngữ nghĩa nghiêm ngặt, vì bất kỳ kết quả tiêu cực nào cũng sẽ hội tụ qua mục nhập-hàng-một-lần Queue gốc.

### Kiểm chứng

Bao phủ thỏa ước AgentLoop giữ cửa sổ chấp nhận prompt mở, chuyển đổi chính xác một mục nhập-hàng-một-lần queued, và chứng minh mục steering thay thế nó giữ nguyên giá trị tin nhắn và receipt gửi, được xả (drain) dưới dạng `user/message`, và không bao giờ khởi động lượt độc lập ban đầu. Bao phủ đó cũng cố định việc giữ nguyên mục gốc khi cửa sổ không khả dụng, từ chối địa chỉ đã bị claim, và bảo toàn vòng đời dưới hủy có thể tái nhập.

Test schema Host và proxy bao phủ thao tác mới, hai loại lỗi được gõ kiểu, snapshot có placement và phát lại khi kết nối lại, cùng thứ tự persist trước rồi mới loại bỏ. Test client bao phủ sự hội tụ âm thầm của cả hai race điều kiện ngữ nghĩa, báo cáo lỗi thật, dòng subagent chỉ đọc và cử chỉ subagent chỉ hỗ trợ Queue. Test runtime và ChatView bao phủ việc bàn giao từ đang chờ sang bền vững hoàn thành theo từng mục nhập-hàng-một-lần, bao gồm giá trị `MessageId` trùng lặp; snapshot ARIA của Web bao phủ steering đang chờ nằm sau dòng trạng thái chạy và chỉ có copy, cùng node bền vững có đồng hồ, copy và fork.

Kịch bản Web steering không cần key, trong lúc phản hồi đầu tiên đang stream, xếp hàng một tin nhắn qua composer thật và kích hoạt mũi tên trên dòng đó, rồi dùng `ask_user_question` làm rào chắn steering đang chờ ổn định. Kịch bản này chứng minh bong bóng đang chờ do Host hỗ trợ xuất hiện trước khi được admit, bàn giao thành đúng một lần chen ngang bền vững sau khi trả lời, và ảnh hưởng tới request model kế tiếp. Kịch bản composer đã lắp ráp chứng minh Cmd+Enter ở chế độ mặc định không cần tạo dòng Queue, cũng đi vào cùng đường đang chờ và bền vững; Cmd+Enter ở chế độ Steer thì tạo dòng Queue. Bao phủ Settings và chính sách submit cố định giá trị mặc định, tính bền vững, phạm vi chỉ-ở-trạng-thái-bận và ánh xạ cử chỉ bổ sung; các kịch bản edit/xóa Queue tiếp tục chứng minh các thao tác này không đổi.

## Các phương án thay thế đã cân nhắc

**Xóa dòng đó trong Web, rồi gọi `session.prompt(mode: 'steer')`.** Không áp dụng, vì hai RPC không thể khiến việc xóa và steering trở thành nguyên tử (atomic); lỗi và race điều kiện claim của driver có thể làm mất hoặc trùng lặp tin nhắn người dùng.

**Khôi phục thao tác đẩy Queue lên trước cho mũi tên hướng lên.** Không áp dụng, vì di chuyển một mục lên đầu hàng đợi vẫn tạo ra một lượt được chấp nhận độc lập. Control này cam kết steering lượt hiện tại, chứ không phải mức ưu tiên trong Queue.

**Dùng hành vi `agent.steer()` cố-gắng-hết-sức hiện có cho dòng Queue.** Không áp dụng, vì cửa sổ next-step đã đóng sẽ tạo mục nhập-hàng-một-lần queued mới, với vị trí và danh tính có thể khác. Từ chối nghiêm ngặt sẽ giữ nguyên mục gốc, để UI có thể coi nó là cùng một lần gửi Queue đã được chấp nhận. Tin nhắn composer với input mới không có mục Queue hiện có nào cần giữ lại, nên có chủ ý dùng hành vi cố-gắng-hết-sức.

**Để mọi `agent.steer()` mà từng bên gọi dùng dùng ngữ nghĩa nghiêm ngặt.** Không áp dụng, vì TUI và các bên gọi plugin dùng fallback lượt tiếp theo an toàn của chúng cho input vừa submit. Dòng queued có trạng thái có thể phục hồi mà các bên gọi đó không có.

**Giữ cùng một `InboxItemId` khi thay đổi phương thức gửi.** Không áp dụng, vì `InboxItemId` định danh một lần chấp nhận FIFO, còn `placement` ghi lại phương thức gửi mà lần chấp nhận đó giải quyết ra. Kết thúc một mục nhập-hàng-một-lần queued và chấp nhận một mục nhập-hàng-một-lần steering giúp giữ trung thực các sự kiện vòng đời, và giữ nguyên bất biến bảo toàn.

**Thêm chiếu và store client riêng cho steering đang chờ.** Không áp dụng, vì các mục nhập-hàng-một-lần queued và steering đã dùng chung vòng đời inbox Agent và mirror Host. Một chiếu thứ hai sẽ trùng lặp việc lưu trạng thái kết nối lại và thẩm quyền thứ tự; nhãn placement cho phép mỗi giao diện client chọn dòng của riêng nó, mà không mở rộng ngữ nghĩa thay đổi Queue.

**Hủy lượt đang hoạt động và chạy mục Queue được chọn.** Không áp dụng, vì việc này sẽ phá vỡ công việc đang tiến hành không liên quan, và sẽ khởi động một lượt mới thay vì steering lượt hiện tại.

## Hệ quả

`session/queue` giờ biểu diễn một snapshot inbox tạm thời có placement, chứ không chỉ là danh sách Queue, nên mỗi bên tiêu thụ phải lọc theo placement. Steering đang chờ xuất hiện ngay trong giao diện và có thể khôi phục sau khi kết nối lại, nhưng vẫn chưa được persist cho tới khi tin nhắn `user/message` bền vững được submit. Sau khi cửa sổ next-step nghiêm ngặt đóng lại, cờ running vẫn có thể tạm thời giữ giá trị true, nên một thao tác đã được kích hoạt có thể nội bộ trả về `steer-unavailable`, trong khi sản phẩm vẫn tiếp tục thực thi qua Queue và không hiển thị lỗi.

Thao tác tường minh này thay đổi phương thức gửi từ một lượt được chấp nhận độc lập thành steering lượt hiện tại, nên plugin chấp nhận prompt không xử lý tin nhắn đã được chuyển đổi. Để đảm bảo an toàn cho hủy có thể tái nhập, sự kiện vòng đời vẫn phải publish enqueue trước rồi mới publish discard; bao phủ hồi quy có mục tiêu sẽ bảo vệ thứ tự này.
