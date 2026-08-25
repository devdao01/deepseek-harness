# Agent Note: Lắp ráp business node của Client Conversation và Chat keyed snapshot

Status: implemented

[English](2026-08-09-client-conversation-node-assembly.md) | Tiếng Việt

## Vấn đề

Client Session vừa duy trì cửa sổ truyền tải, trạng thái kết nối và các interaction đang chờ, vừa diễn giải trong một transcript fold tập trung các event nghiệp vụ như Assistant, Tool, message, command, compaction, retry và turn tail. Mỗi khi thêm một loại business node, đều phải sửa switch của Session, phần replay lịch sử, các chỉ mục, cache và cách nhóm trong React; identity nghiệp vụ, sự tiến hóa trạng thái và phần trình bày cuối cùng không có chủ sở hữu độc lập.

Đường đi cũ còn đặt Assistant và Tool đang chạy ra ngoài luồng finalized. Chúng chỉ vào danh sách node sắp theo thứ tự log sau khi đã kết thúc, nên React parent thay đổi và component bị mount lại ngay cả khi business ID và `key` không đổi. Việc nạp toàn bộ lịch sử, prepend trang cũ hơn, append thời gian thực và token streaming lại đi theo những đường cập nhật khác nhau, khiến tính ổn định tham chiếu và việc tính lại cục bộ chỉ có thể duy trì bằng các cache đặc thù rải rác khắp nơi.

Cách liên kết giữa các event nghiệp vụ cũng không thống nhất. Tool có call ID, Assistant liên kết theo turn/step, Compaction có vòng đời và checkpoint riêng, còn Inbox splice biểu diễn một khoảnh khắc của một trạng thái liên tục. Tiếp tục nhét những khác biệt này vào một fold thống nhất sẽ khiến bất kỳ thay đổi nghiệp vụ nào cũng phải đi qua tra cứu bảng toàn cục và làm mất hiệu lực các cache không liên quan.

## Quyết định

Client Runtime cung cấp một engine lắp ráp Conversation Node trung lập với target; plugin nghiệp vụ đăng ký Event Definition, còn plugin view đăng ký View Builder theo từng Session. `ui-conversation` đăng ký loạt Definition dựng sẵn đầu tiên và builder `chat`; Session chỉ chịu trách nhiệm đưa cửa sổ event liên tục hiện tại vào engine và phát hành snapshot của nó, không còn diễn giải nghiệp vụ conversation cụ thể.

Note này giữ lại phần dẫn dắt phương án, sự thích ứng theo từng nghiệp vụ, trách nhiệm, thuật toán và đánh đổi vẫn còn giá trị sau khi triển khai.

### Phân tầng trách nhiệm

| Tầng | Trách nhiệm dài hạn | Rõ ràng không chịu trách nhiệm |
|---|---|---|
| Session | Duy trì cửa sổ Event liên tục, phân biệt replace, prepend, append, điều phối thông báo snapshot | Diễn giải các event nghiệp vụ như Tool, Assistant, Compaction |
| Event Registry | Lưu Definition có `kind` duy nhất và fallback duy nhất theo vòng đời Cordis | Lưu Context hay State của một Session cụ thể |
| Assembler | Khớp Event, duy trì Context, Location, phụ thuộc và tập dirty để phát hành | Hiểu các trường State nghiệp vụ hay thứ tự sắp xếp Chat |
| Node Definition | Định nghĩa identity, tiến hóa State, Location data và target Node của một đối tượng nghiệp vụ | Tạo Context, sửa State nghiệp vụ khác hay quét toàn bộ Context |
| View Builder | Sắp xếp tăng dần các target Node cuối cùng thành snapshot của view đó | Diễn giải lại Session Event nguyên bản |
| React renderer | Hiển thị dữ liệu do renderer sở hữu theo `kind` của Node cuối, và đọc dữ liệu nghiệp vụ chỉ-đọc của Location chứa Node hiện tại | Ghép cặp Event nghiệp vụ, quét Nodes toàn cục hay quyết định vòng đời nghiệp vụ |

Việc đăng ký vào Registry là một Cordis effect; gỡ Definition sẽ kích hoạt việc rebuild registry tần suất thấp cho các Session hiện có. Event nghiệp vụ thông thường không làm đổi Registry, và cũng không vì thế mà dựng lại toàn bộ các loại nghiệp vụ.

### Hợp đồng tổng thể của `ConversationNodeDefinition`

Mỗi [`ConversationNodeDefinition`](../../../../packages/client/runtime/src/client/contract/conversation.ts) sở hữu độc lập việc chuyển đổi một loại đối tượng nghiệp vụ từ Event thành State và thành view Node cuối cùng. `kind` của Definition là tên duy nhất trong Registry, đồng thời là namespace cho business ID.

Cùng một Event có thể được nhiều Definition thông thường nhận. Ví dụ một Assistant Event đồng thời cập nhật Assistant Node và Turn Tail; một Retry Event đồng thời cập nhật Retry, Assistant và Turn Error. Assembler chỉ hỏi tới fallback khi tất cả Definition thông thường đều trả về `null`.

Definition không nắm giữ dữ liệu nghiệp vụ khả biến xuyên Session. Context, State, phụ thuộc và View Builder của mỗi Session đều do Assembler của chính Session đó nắm giữ tách biệt.

#### `kind`, business ID và Context key

`id` mà `match()` trả về chỉ cần ổn định trong phạm vi Definition hiện tại. ID của Tool có thể là call ID, ID của Assistant có thể là `turn:step`, ID của Inbox có thể là seq của splice Event.

Assembler dùng `conversationContextKey(kind, id)` để ghép thành key không đụng độ; các Definition khác nhau dù trả về cùng `id` cũng không dùng chung Context. View Node cuối cùng phải dùng đúng key do engine sở hữu này, không được lấy `seq` hay vị trí render làm identity.

Mỗi `(kind, id)` tồn tại nhiều nhất một start Match. Start thứ hai sẽ báo lỗi ngay; khi Definition cần biểu diễn một vòng đời mới thì phải trả về ID mới.

#### `match(event)`

`match(event)` chỉ đọc `SessionEvent` nguyên bản hiện tại, trả về `{ id, role: 'start' | 'update' }` hoặc `null`. Nó không lấy được Context, lịch sử, Reader, Location hay view envelope.

Ràng buộc này khiến chi phí định tuyến một Event chỉ tăng theo số Definition đã đăng ký. Assembler không phải duyệt Context lịch sử của Definition đó chỉ để xác định một update thuộc về ai.

Các Event start, result, resource, checkpoint và các Event kết thúc riêng của nghiệp vụ phải mang theo hoặc suy ra trực tiếp được cùng một ID. Nếu một Event đơn lẻ không tính ra được ID thì giao thức sinh ra Event phải bổ sung trường liên kết; Client không đoán qua "đối tượng chưa hoàn tất gần nhất".

`role` mô tả vòng đời State, không mô tả khả năng hiển thị. start có thể sinh ngay một Node terminal; update cũng có thể vào một Context pending trước khi start được nạp.

#### `ConversationMatch`

Sau khi khớp thành công, Assembler gộp Event nguyên bản, wire presentation view tùy chọn, `role` và `location` do engine tính thành một `ConversationMatch` chỉ-đọc.

`matches` của Context luôn được lưu theo thứ tự tăng dần của Event `seq`, chứ không theo thứ tự đến qua mạng hay thứ tự nạp phân trang. Khi trang cuối của lịch sử xuất hiện result trước còn trang cũ hơn mới có call, thứ tự Match cuối cùng vẫn là call trước, result sau.

Location có thể thay đổi khi prepend bù đủ biên hoặc append đóng biên. Assembler thay Location chỉ-đọc của các Match bị ảnh hưởng rồi replay Context; nghiệp vụ không được lưu bản sao Location cũ như nguồn quyền lực.

#### `ConversationNodeContext`

| Trường | Chủ sở hữu | Ngữ nghĩa mà Definition thấy được |
|---|---|---|
| `key` | Assembler | identity cuối cùng ổn định của `kind + id` |
| `kind` / `id` | Definition + Assembler | namespace nghiệp vụ hiện tại và business ID |
| `matches` | Assembler | toàn bộ bằng chứng nghiệp vụ đã thu thập trong cửa sổ hiện tại và sắp theo `seq` |
| `start` | Assembler | start Match duy nhất; là `undefined` khi chưa được nạp |
| `state` | Definition trả về, Assembler nắm giữ | giá trị trả về gần nhất của `start`/`update`; là `undefined` khi chưa khởi tạo |
| `current` | Assembler | Node materialize gần nhất của từng target, hoặc `null` |

Các trường của Context là chỉ-đọc, điều này không có nghĩa State nghiệp vụ phải immutable sâu. Definition có thể trả về đối tượng mới, cũng có thể sửa tại chỗ đối tượng cũ rồi trả về cùng tham chiếu.

Assembler chỉ chấp nhận giá trị trả về của hàm. `start()` hoặc `update()` trả về `undefined` là lỗi hợp đồng và báo lỗi ngay; sửa đối tượng mà không trả về nó cũng không hợp lệ.

Definition có thể đọc toàn bộ `matches` để hỗ trợ dựng State hoặc Node fallback, nhưng không được thêm/xóa Match, thay thế trường của Context hay sửa một Context khác.

#### `start(context, match, reader)`

`start()` là lối khởi tạo State duy nhất. Assembler gọi nó ngay khi lần đầu có được start duy nhất, và lấy State mà nó trả về.

Khi một trang cũ hơn làm thay đổi thứ tự Match của Context, câu trả lời tiền nhiệm của Reader hoặc các sự kiện thực tế về Location, Assembler tính lại từ `start()`, chứ không vá State cũ theo chiều ngược lại.

Khi `start()` được gọi, Context có thể đã thu thập các update nằm sau start. Sau khi `start()` trả về State ban đầu, Assembler vẫn gọi `update()` lần lượt theo thứ tự log xuôi từ sau start, nên chiều nạp dữ liệu không làm đổi kết quả fold cuối cùng.

`reader` chỉ khả dụng bên trong `start()`. Nó cho phép logic khởi tạo đọc Context active gần nhất thuộc `kind` chỉ định và nằm nghiêm ngặt trước seq của start hiện tại, nhưng không trao cho nghiệp vụ một giao diện quét tùy ý các Map nội bộ của engine.

Mỗi lần gọi lại `start()` đều thay thế các phụ thuộc Reader đã đăng ký ở lần gọi trước, bảo đảm khi Definition đổi nhánh truy vấn thì không giữ lại cạnh phụ thuộc cũ.

#### `reader.previous(kind)`

`reader.previous(kind)` tìm Context gần nhất thỏa `candidate.startSeq < current.startSeq` và đã khởi tạo State. Nó không trả về Context cùng seq, Context tương lai hay Context pending chưa có State.

Giá trị trả về gồm key, kind, id, start seq, State chỉ-đọc và Matches của Context tiền nhiệm. Bên tiêu thụ tự diễn giải State; bên cung cấp chỉ chịu trách nhiệm duy trì State của mình cho đúng, không cần đăng ký phương thức query đặc thù.

Mỗi truy vấn của Reader đều ghi lại phụ thuộc `{ key, revision, windowGap }`. Khi trúng một Context tiền nhiệm, thay đổi revision của nó sẽ replay bên tiêu thụ; khi không trúng mà vẫn còn lịch sử cũ hơn, window gap sẽ chờ các lần prepend sau.

Nếu cửa sổ đã tới điểm khởi đầu của Session mà vẫn không trúng thì `undefined` là câu trả lời xác định. Nếu `hasMore` là true, Definition vẫn thấy đúng `undefined` đó, nhưng Assembler ghi nhớ rằng đây là kết quả tạm.

Phụ thuộc đi nghiêm ngặt từ start sớm hơn tới start muộn hơn, nên replay bắc cầu không tạo thành chu trình theo thời gian. Chuỗi trạng thái khoảnh khắc của Inbox và việc Message đọc Inbox đều dùng ràng buộc này.

#### `update(context, match)`

`update()` chỉ xử lý các Match sau start đã được `match()` định tuyến chính xác tới `(kind, id)` hiện tại. Nó không còn phải phán đoán Event thuộc Context nào.

Assembler gọi `update()` theo `seq` tăng dần. Update ở đuôi thời gian thực có thể áp dụng tăng dần trực tiếp; mọi việc chèn bằng chứng không ở đuôi, bù start hay mất hiệu lực phụ thuộc đều replay đầy đủ từ `start()`.

Khi không có thay đổi nghiệp vụ, `update()` trả về State cũ. Khi có thay đổi nghiệp vụ, nó có thể trả về bản thay thế immutable, cũng có thể sửa tại chỗ rồi trả về cùng đối tượng.

Assembler không dựa vào so sánh tham chiếu State để quyết định có cần phát hành hay lan truyền hay không. Mỗi lần update thành công đều tăng revision của Context, đánh dấu dirty, và khiến các bên tiêu thụ Reader trực tiếp hoặc bắc cầu phải tính lại.

#### `publication(match)`

`publication()` chỉ quyết định khi nào State mới nhất được materialize thành view Node, không làm đổi việc thực thi đồng bộ của `match()`, `start()` hay `update()`.

| Giá trị trả về | Hành vi |
|---|---|
| `immediate` | Yêu cầu thông báo và flush trong microtask hiện tại |
| `animation-frame` | Gộp nhiều cập nhật tần suất cao vào frame kế tiếp để materialize |
| `none` | Match này không chủ động lên lịch flush; State và dấu dirty vẫn được giữ |

Bỏ qua `publication()` tương đương `immediate`. Assistant token delta dùng `animation-frame`, Context Inbox không hiển thị dùng `none`, còn final, replay do phụ thuộc và biên Location sẽ phát hành kết quả mới nhất qua đường immediate.

Mỗi delta trong một frame vẫn được `update`; thứ bị gộp chỉ là `buildViewNode()`, View Builder và thông báo snapshot cho React, không mất token nào.

#### `buildLocationData(context, scope)`

`buildLocationData()` cho phép Definition phát hành các giá trị dẫn xuất chỉ-đọc của State lên Step hoặc Turn do engine sở hữu, mà không phơi State khả biến của một nghiệp vụ khác. Trong mỗi lần materialize, Assembler luôn xử lý `step` trước rồi mới tới `turn`, nên phần tổng hợp ở mức Turn có thể đọc dữ liệu Step đã cập nhật trong cùng vòng; chỉ khi toàn bộ Location data sẵn sàng thì `buildViewNode()` mới được gọi.

Definition nhận scope `step` và `turn` riêng biệt, và có thể trả về một giá trị hoặc `null` ở bất kỳ giai đoạn nào. Giá trị trả về phải khai báo đúng tọa độ turn/step, và dùng key trùng với `kind` của Definition; Assembler sở hữu việc thay thế và loại bỏ, đồng thời từ chối để một Context khác chiếm cùng một Location key.

`ConversationStepDataMap` và `ConversationTurnDataMap` ràng buộc key và value bằng declaration merging. Location chỉ phơi ra reader ổn định `data.get(key)`; bên tiêu thụ không lấy được Context của bên cung cấp và không sửa được State của nó.

#### `buildViewNode(context, target)`

`buildViewNode()` đọc Context mới nhất trong giai đoạn phát hành và sinh trực tiếp business Node cuối cùng cho target chỉ định. Assembler không gắn thêm tầng nghiệp vụ activity, tail candidate hay layout dùng chung sau nó.

`null` nghĩa là Context đó chưa materialize cho target này. Trên đường tăng dần thông thường, một Context đã từng trả về Node khác null thì không được trả về `null` nữa; muốn ẩn tạm thời thì phải giữ lại Node cùng key và dùng visibility của chính target.

Assembler kiểm tra Node `key === context.key` và Node `target === target`. Nghiệp vụ có thể đổi `anchorSeq`, data, Location hay visibility, nhưng không được đổi identity trong một vòng đời.

`current` cho phép Definition phân biệt "chưa từng sinh ra" với "đã sinh ra rồi nay cần ẩn". Assistant retry và Turn Error suppression dùng nó để tránh việc rút Node một cách bất hợp lệ.

Một Definition sở hữu nhiều nhất một view target; Definition chỉ duy trì trạng thái thì bỏ qua đồng thời `target` và `buildViewNode()`. Ngay cả khi Chat và Trajectory nhận diện cùng một họ Event bền vững, chúng vẫn đăng ký Definition nghiệp vụ riêng của mình; còn Assembler dùng chung cung cấp cho hai target cùng cơ chế khớp, replay, Location và phát hành.

#### Không cung cấp `end()` dùng chung

Engine không cung cấp vòng đời `end()` cố định. Nghiệp vụ một Event hoàn tất ngay trong `start()`, nghiệp vụ nhiều Event ghi nhận việc hoàn tất trong update của chính nó, còn nghiệp vụ trạng thái khoảnh khắc kéo dài thì lập Context mới cho mỗi Event.

Việc đóng Step/Turn là sự kiện Location bên ngoài, không thay nghiệp vụ sửa State. Thay đổi biên sẽ replay và build lại các Context bị ảnh hưởng; nghiệp vụ kết hợp "State của mình đã hoàn tất chưa" với "Location đã closed chưa" để sinh biểu hiện bình thường, running hay interrupted.

ID không được tái sử dụng; Context đã hoàn tất vẫn tiếp tục tồn tại trong cửa sổ hiện tại, vừa cung cấp identity render ổn định, vừa có thể làm bằng chứng tiền nhiệm cho Reader về sau.

### Location là sự kiện hạng nhất của engine

[`ConversationLocationIndex`](../../../../packages/client/runtime/src/client/sessions/conversation-location-index.ts) dựng ánh xạ từ Event sang Location dựa trên `turn/start`, `step/start`, payload turn/step tường minh, `step/end` và `turn/end`.

Location có bốn hình thái: `session`, `turn`, `step` và `unresolved`. Turn/Step mỗi cái mang trạng thái `open`, `closed` hoặc `unknown`, cùng các Event start/end đã được nạp.

Mỗi Turn và Step còn giữ một Location data store ổn định tham chiếu. Cập nhật của Definition chỉ thay key mà nó sở hữu; cùng một store identity có thể nhận giá trị mới khi append hoặc prepend, giúp Context, View Builder và React renderer dùng chung những sự kiện nghiệp vụ phân tầng đã xác định, mà không sao chép hay duyệt mảng Node toàn cục.

`unresolved` nghĩa là cửa sổ lịch sử hiện tại thiếu biên tiền nhiệm đầy đủ, không đồng nghĩa với session-level. Sau khi prepend bù biên, chỉ mục sửa lại Location của Match và chỉ replay các Context sở hữu những seq đó.

Append Event thông thường chỉ kế thừa tọa độ hiện tại; append biên chỉ tính lại Turn tương ứng. Prepend sẽ dựng lại Location facts dựa trên toàn bộ cửa sổ liên tục đã mở rộng, nhưng logic ổn định tham chiếu vẫn giữ nguyên các đối tượng Turn/Step không đổi.

Assembler còn trao timeline ổn định tham chiếu cho View Builder. Nghiệp vụ không phải tự duy trì lại turn order, step list, last step hay Map biên.

## Ba đường đi của cửa sổ event

"Quét ngược lịch sử" mô tả chiều mà UI nạp từ trang đuôi mới nhất lùi dần về điểm khởi đầu Session, chứ không có nghĩa Definition thực thi `update()` theo thứ tự ngược. Bất kể API lịch sử trả về theo thứ tự nào hay trang được nạp theo chiều nào, Assembler đều canonicalize theo `seq` tăng dần cho mỗi cửa sổ hiện tại và mỗi fresh page.

| Tình huống | Phạm vi đầu vào | Xử lý Context/State | View Builder |
|---|---|---|---|
| Trang đuôi lịch sử ban đầu hoặc resync | Toàn bộ cửa sổ liên tục hiện tại | Xóa sạch rồi dựng lại toàn bộ Context theo `seq` xuôi | `replace()` |
| Nạp một trang older history | Chỉ truyền các fresh Event sớm hơn và đã khử trùng lặp | Giữ nguyên identity của Context hiện có, bù Match, Location và phụ thuộc rồi replay cục bộ | `apply(upserts)` |
| Append thời gian thực | Một Event ở đuôi liên tục | Chỉ khớp Definitions và cập nhật chính xác ID trúng; biên chỉ ảnh hưởng Turn tương ứng | `apply(upserts)` |

### Trang đuôi lịch sử ban đầu và việc quét ngược về mặt logic

1. `Session.open()` kéo tail page mới nhất và giao các History Entries liên tục cho `replaceWindow(entries, hasMore)`.
2. `replaceWindow` xóa Context cũ, chỉ mục start-seq, chỉ mục ngược theo seq, phụ thuộc Reader và Map đầu vào.
3. Toàn bộ entries được sắp tăng dần theo Event `seq` và ghi vào cửa sổ hiện tại.
4. LocationIndex dựng lại Turn/Step facts cho cửa sổ này.
5. Assembler gọi `match(event)` của từng Definition thông thường cho lần lượt các Event theo thứ tự tăng dần.
6. Mỗi kết quả trúng sẽ lấy hoặc tạo Context theo `(kind, id)`, và chèn Match vào mảng có thứ tự của Context đó.
7. Gặp start thì chạy `start()`; update ở đuôi mà đã có State thì chạy thẳng `update()`.
8. Khi trang hiện tại chỉ chứa result/resource mà thiếu start, Context vẫn được tạo theo ID và thu thập Matches, nhưng State vẫn là `undefined`.
9. Sau khi khớp hết Event, Assembler rà lại phụ thuộc Reader, để các trạng thái khoảnh khắc sớm hơn trong cùng cửa sổ ổn định trước rồi bên tiêu thụ muộn hơn mới đọc chúng.
10. Mọi Context được đánh dấu dirty; lần flush kế tiếp trước hết dựng lại đầy đủ Location data theo Step→Turn, rồi gọi `buildViewNode()` cho từng target.
11. Một số nghiệp vụ trả về `null` khi thiếu start; Compaction, Command, Tool result hay Turn Error thì có thể dựng Node fallback dựa trên bằng chứng update đủ dùng.
12. Mỗi View Builder nhận tập Node đầy đủ và timeline, rồi lập snapshot ban đầu qua `replace()`.

Việc đường đi này "bắt đầu từ trang mới nhất" chỉ xảy ra ở tầng chọn phân trang. State bên trong một trang luôn được tính theo thứ tự xuôi, nên cùng một cửa sổ sẽ không cho ra kết quả nghiệp vụ khác nhau vì chiều quét khác nhau.

Context thiếu start không phải là lỗi. Nó là một hộp tổng hợp pending đang chờ trang older bù đủ; việc có hiển thị sớm hay không do `buildViewNode()` của Definition đó quyết định.

Nếu update cùng ID trong trang hiện tại thật sự sớm hơn start theo thứ tự log, chứ không chỉ là được nạp trước, thì sau khi bù start, quá trình replay sẽ báo lỗi giao thức. Thứ tự đến có thể đảo ngược, thứ tự log nghiệp vụ thì không.

### Prepend của trang older mới

1. `Session.loadOlder()` dùng `baseSeq` hiện tại để kéo trang liền trước, và trước hết kiểm tra đuôi trang liền mạch với cửa sổ hiện tại.
2. Session prepend mảng raw Event/view vào cửa sổ của mình, và chỉ truyền trang này cho `assembler.prepend(entries, hasMore)`.
3. Assembler loại theo seq các Event trùng lặp với cửa sổ hiện tại, rồi sắp tăng dần nội bộ fresh page.
4. Các Context, State, current Nodes và instance View Builder đã có đều không bị xóa.
5. LocationIndex dựng lại facts với đầu vào đầy đủ đã mở rộng, và báo cáo những seq mà Location identity thực sự thay đổi.
6. Các Context sở hữu những seq đó cập nhật Location của Match và replay từ start; các Context không liên quan không tham gia replay Location.
7. Các fresh Event lần lượt chạy matcher của Definition, và được chèn vào Matches có thứ tự của Context sẵn có hoặc mới theo ID ổn định.
8. Khi trang mới bù ra start cho một Context pending, Context đó khởi tạo từ start rồi áp dụng theo thứ tự xuôi tất cả update đã thu thập.
9. Khi trang mới lập ra predecessor gần hơn cho Reader, làm đổi revision của predecessor hoặc xóa window gap, bên tiêu thụ tính lại từ `start()`.
10. Phụ thuộc Reader lan truyền replay xuôi theo start seq; cùng một đợt lan truyền sẽ không áp dụng Event theo thứ tự ngược.
11. Một trang rỗng làm `hasMore` chuyển từ true sang false cũng khiến phụ thuộc được rà lại, đưa `undefined` tạm thời hội tụ thành xác định là không tồn tại.
12. flush chỉ phát hành lại Location data Step/Turn và target Node cho các Context dirty, rồi giao các kết quả khác null làm `upserts` cho `apply()` của View Builder.

Prepend giữ nguyên Context key và identity của current Node đã có. Trang mới có thể thêm key vào đầu `order` của Chat, cũng có thể sửa anchor, Location, visibility hay data của Node sẵn có, nhưng không tạo lại Context cho các nghiệp vụ không liên quan.

Khi gặp thay đổi cấu trúc, Chat Builder tính lại `order` hiển thị và chỉ mục cấp hai của Location từ keyed store; đây là việc tính chỉ mục của view, không chạy lại toàn bộ Definition nghiệp vụ và không thay giá trị của các Node không đổi.

Việc vá gap của Reader là khác biệt thuật toán lớn nhất giữa prepend và append thông thường. Trang mới không chỉ có thể tạo ra Node lịch sử hiển thị, mà còn có thể làm đổi trạng thái khoảnh khắc Inbox về sau cùng cách phân loại Message phụ thuộc vào nó.

### Append thời gian thực theo chiều xuôi

1. Session chỉ nhận live Event liền kề tail seq hiện tại; seq trùng thì khử trùng lặp, khi có gap thì đi qua tail-page repair trước.
2. Event không phải biên được ghi tăng dần vào tọa độ Turn/Step hiện tại; Event biên cập nhật Location facts của Turn tương ứng.
3. Assembler gọi `match()` đúng một lần cho mỗi Definition thông thường với Event này, và không duyệt tập Context của bất kỳ Definition nào.
4. Mỗi kết quả trúng định vị trực tiếp một Context qua `(kind, id)`.
5. ID mới thì tạo Context; ID đã có với update đuôi bình thường thì gọi thẳng một lần `update()`.
6. start hoặc bất kỳ bằng chứng nào cần chèn vào vị trí không phải đuôi đều đi qua `replayContext()` đầy đủ, giữ nguyên ngữ nghĩa thứ tự xuôi.
7. Sau khi revision của Context thay đổi, chỉ replay các bên tiêu thụ dọc theo phụ thuộc Reader đã đăng ký.
8. Việc đóng Location sẽ cập nhật Location của các Match bị ảnh hưởng trong Turn tương ứng và replay các Context đó, khiến Assistant, Tool hay Retry chưa hoàn tất có sắc thái interrupted/cancelled.
9. Assembler tổng hợp publication urgency của mọi Definition trúng; `immediate` cao hơn `animation-frame`, và cái sau cao hơn `none`.
10. Session giao immediate cho microtask notifier, giao animation-frame cho RAF notifier.
11. flush trước hết cập nhật Location data Step/Turn cho các Context dirty, rồi gọi `buildViewNode()`, cuối cùng giao các upserts của vòng này cùng timeline mới nhất cho View Builder.
12. Snapshot mới mà React đăng ký dùng lại Context key ổn định; cùng một Tool running→settled hay Assistant streaming→final không di chuyển qua node cha khác.

Chi phí khớp nghiệp vụ của append là số Definition cộng với số Context thực sự trúng phải cập nhật, không tăng theo số Context lịch sử. Bên tiêu thụ Reader và việc đóng Location sẽ thêm phần replay tỉ lệ với phụ thuộc thật hoặc với Turn tương ứng.

Thay đổi cấu trúc của `order` trong Chat vẫn có thể sắp xếp lại các key đang hiển thị; cập nhật thuần data chỉ thay một Node trong keyed store và touch chỉ mục Location tương ứng. Điều được bảo đảm ở đây là nghiệp vụ không liên quan không bị refold và Node identity không bị thay, chứ không phải tuyên bố rằng mọi thao tác chỉ mục của view đều có độ phức tạp hằng số.

### Tính nhất quán giữa replace, prepend và append

Cả ba đường đi cuối cùng đều tuân theo cùng một bất biến: Matches của Context sắp theo seq, State fold theo thứ tự xuôi từ start duy nhất, Reader chỉ nhìn Context active nghiêm ngặt tiền nhiệm, Location data phát hành theo Step→Turn, và Node key chỉ do kind và ID quyết định.

`replaceWindow` là lần thay thế toàn phần tần suất thấp cho việc mở lần đầu, resync, gap repair và thay đổi registry, không dùng để hiện thực load older thông thường. Cả `prepend` lẫn `append` đều giữ lại Builder và Context identity hiện có.

Độ rộng trang, số lần nạp lịch sử và việc gộp theo RAF chỉ ảnh hưởng tới thời điểm có thêm bằng chứng hoặc thời điểm phát hành, không làm đổi State của Context và Node cuối cùng khi bằng chứng trong cửa sổ là như nhau.

## Các nghiệp vụ dựng sẵn dùng Definition như thế nào

### Khớp, ID và State

| Nghiệp vụ / `kind` | ID ổn định | start Match | update Matches | State và việc đọc xuyên Context |
|---|---|---|---|---|
| Next-turn Inbox / `inbox-next-turn` | seq của splice Event | mỗi `agent/inbox/spliced` nhắm tới next-turn | không có | áp dụng splice hiện tại lên trạng thái khoảnh khắc pending/claimed lấy từ `reader.previous(ownKind)` |
| Next-step Inbox / `inbox-next-step` | seq của splice Event | mỗi `agent/inbox/spliced` nhắm tới next-step | không có | cũng tạo thành trạng thái khoảnh khắc theo từng chỉ thị, tập claimed dành cho Message đọc |
| Message / `input-message` | message ID | `user/message` trên append-surface | không có | sinh context message theo source, hoặc đọc Inbox next-step gần nhất để phân định user/steering |
| Assistant / `assistant-step` | `turn:step` | `step/start` | `assistant/chunk`, `assistant/message` final, Retry cùng step | tổng hợp blocks, usage, thời điểm token đầu, trạng thái final và ẩn do retry, đồng thời phát hành Step data cùng key |
| Tool / `tool-call` | root call ID | `tool/call` gốc | root result, Code Dispatch start/result | tổng hợp root, children và Map parent; Dispatch Event định tuyến chính xác bằng `rootCallId` |
| Command / `command` | command ID | `command/run` | `command/done`, compact lifecycle/checkpoint mang source command ID | tổng hợp command outcome và bằng chứng compaction thủ công |
| Automatic Compaction / `compaction` | compaction ID | `compaction/start` không có source command ID | summary, end, replacement checkpoint | tổng hợp summary/checkpoint; khi checkpoint đã đủ thì có thể fallback dù thiếu start |
| Retry / `model-retry` | retry ID | `llm/retry` của attempt 1 | các `llm/retry` và `llm/retry-started` tiếp theo | tổng hợp attempts cùng một RetryId và trạng thái scheduled/started |
| Turn Error / `turn-error` | số hiệu turn | `turn/start` | `turn/end` lỗi và các Retry Event của turn đó | tổng hợp terminal failure, và dùng bằng chứng Retry để quyết định việc ẩn |
| Turn Tail / `turn-tail` | số hiệu turn | `turn/start` | Assistant, Retry, `step/end`, `turn/end` | lưu turn end, đọc dữ liệu Assistant của từng Step, phát hành Turn data; dùng Matches đầy đủ để chọn anchor đuôi trực quan |
| Deliverables / `deliverables` | số hiệu turn | `turn/start` | Tool call/result của Turn đó | tổng hợp các mutation path thành công và phát hành Turn data, không sinh view Node |
| Unknown fallback / `unknown-surface` | seq của Event | Event trên append-surface không được Definition thông thường nào nhận | không có | lưu type/data nguyên bản làm JSON fallback |

### Chat Node và đặc tính lịch sử/thời gian thực

| Nghiệp vụ | `publication()` | Sản phẩm Chat | Phân trang lịch sử và hành vi lúc chạy |
|---|---|---|---|
| Inbox | `none` | không sinh Node | khi prepend bù các splice tiền nhiệm thì tính lại trạng thái khoảnh khắc dọc chuỗi Reader |
| Message | mặc định immediate | `user`, `steering` hoặc `context` | việc vá window gap có thể khiến cùng một message key được phân loại lại |
| Assistant | chunk dùng RAF, final immediate, thuần usage/finish dùng none | `assistant-step` cùng key, trạng thái running/settled/interrupted | thiếu `step/start` thì có thể tạm fallback bằng Matches; Location close sinh biểu hiện gián đoạn |
| Tool | mặc định immediate | một `tool-call` root đệ quy, chứa toàn bộ `subCalls` | cửa sổ lịch sử chỉ có result thì có thể fallback; running→settled giữ nguyên key |
| Command | mặc định immediate | `command` thông thường hoặc `manual-compaction` tích hợp | checkpoint đến có thể đổi anchor, nhưng không đổi Context key |
| Compaction | mặc định immediate | marker `compaction` | checkpoint có thể hiển thị trước, sau khi trang older bù start thì replay theo thứ tự xuôi |
| Retry | mặc định immediate | một Node `model-retry` chứa các attempts | nhiều lần retry cập nhật cùng một key; Location close biểu diễn lần scheduled cuối là cancelled |
| Turn Error | mặc định immediate | `turn-error` visible/hidden | thiếu start thì có thể fallback từ error end; khi Retry đến thì giữ key và ẩn đi |
| Turn Tail | chỉ `turn/end` là immediate, còn lại none | footer `turn-tail` độc lập | tính closing/metrics từ dữ liệu Assistant của Step, và quyết định anchor qua Matches cùng turn |
| Deliverables | mặc định immediate | không sinh Node | Tool kết thúc thì cập nhật tăng dần Turn data tương ứng, slot mở rộng của Turn Tail đọc produced files |
| Fallback | mặc định immediate | dòng `unknown` JSON | chỉ đỡ cho append surface, không sinh lặp khi nghiệp vụ thông thường đã nhận nhưng tạm chưa hiển thị |

Inbox minh họa "mỗi Event là một Context trạng thái khoảnh khắc chỉ có start", chứ không phải nghiệp vụ nào cũng cần cặp start/update. Nó tạo fold liên tục với Context cùng kind trước đó qua Reader, thay vì chế tạo thủ công một ID vòng đời cho toàn bộ Inbox.

Assistant, Turn Tail và Turn Error minh họa việc cùng một Event được nhiều Definition nhận độc lập. Mỗi Definition chỉ cập nhật State của mình, và cuối cùng sinh ra Chat Node nguyên tử riêng.

Assistant, Turn Tail và Deliverables minh họa cách kết hợp phân tầng của Location data. Assistant lo viết đúng dữ liệu `assistant-step` cho từng Step; Turn Tail tính dữ liệu `turn-tail` từ các giá trị Step đó; Deliverables duy trì độc lập dữ liệu `deliverables` của cùng Turn. Bên tiêu thụ chỉ đọc key sau declaration merging, không quét Node của nghiệp vụ khác, và cũng không lấy được Context State của bên cung cấp.

Tool và Command minh họa việc tổng hợp nhiều Event: bên sản xuất cung cấp ID chung, Context dựng cây hoặc tích hợp Compaction ngay bên trong nghiệp vụ, không đẩy việc ghép cặp sang Chat Builder.

Compaction và Tool result lịch sử minh họa fallback nghiệp vụ khi thiếu start. Engine không quy định thống nhất "không có start thì không render"; Definition tự quyết dựa trên việc Matches hiện tại có đủ hay không.

Retry minh họa sự phân công giữa State nghiệp vụ và Location. scheduled/started thuộc về Retry State; việc Step/Turn có đóng hay không thuộc về Location của engine; `buildViewNode()` kết hợp cả hai để ra trạng thái trực quan cancelled.

Unknown fallback minh họa quyền sở hữu của Registry: fallback chỉ xử lý các Event trên append surface mà không matcher thông thường nào nhận, và sẽ không sinh nhầm Node thứ hai chỉ vì một Context thông thường tạm trả về `null`.

## View Builder và React identity

[`ConversationViewRegistry`](../../../../packages/client/runtime/src/client/conversation/view-registry.ts) tạo builder riêng theo từng Session cho mỗi target. Registry lưu factory, không dùng chung thứ tự sắp xếp hay cache của một Session nào.

Khi Assembler thay thế toàn phần tần suất thấp thì gọi `replace({ nodes, timeline })`; flush prepend/append thông thường thì gọi `apply({ upserts, timeline })`. Builder chỉ nhận các target Node đã được Definition dựng xong.

[`ChatSnapshotBuilder`](../../../../packages/client/ui-conversation/src/client/conversation-nodes/chat-snapshot-builder.ts) duy trì `order`, keyed store `nodes`, index `locations` theo turn/step, `timeline`, cùng slice `legacy` do StatsLine sử dụng và được phản chiếu ra các trường tương thích công khai ở tầng trên cùng.

Thay đổi cấu trúc của Chat chỉ được kích hoạt bởi key mới, `anchorSeq`, visibility hoặc thay đổi Location identity. Thay đổi nội dung thông thường không dựng lại `order`; keyed Node store chỉ thay value của key đó.

Khi gặp thay đổi cấu trúc, Builder tính visible order từ các giá trị hiện tại của store và tái sử dụng các mảng chỉ mục theo tham chiếu không đổi. Prepend có thể thêm key lịch sử ở phía trước, append có thể thêm ở đuôi hoặc rơi vào vị trí theo anchor nghiệp vụ; các key sẵn có không bị đổi tên vì thứ tự thay đổi.

[`ChatView`](../../../../packages/client/ui-conversation/src/client/chat/ChatView.tsx) chỉ duyệt `order`. Mỗi [`ChatNodeSeat`](../../../../packages/client/ui-conversation/src/client/chat/ChatNodeSeat.tsx) được cố định trong cùng một danh sách cha theo Context key, và phân phối keyed slot `'conversation.chat.node'` theo `node.kind`.

[`ChatNodeDataMap`](../../../../packages/client/ui-conversation/src/client/contract/chat-nodes.ts) là registry payload của renderer theo kiểu declaration-merged. Mỗi module nghiệp vụ tự đăng ký Definition và keyed renderer của mình; `registerConversationNodes()` và `registerChatNodeRenderers()` chỉ chịu trách nhiệm lắp ráp các đóng góp độc lập đó, không diễn giải nghiệp vụ qua closed union hay switch tập trung. Phần hiện thực dựng sẵn vẫn nằm trong `ui-conversation`, nhưng kiểu và ranh giới đăng ký này cho phép nghiệp vụ chuyển sang package riêng mà không phải sửa Chat dispatcher.

Chat entry của `conversation.view` đăng ký thống nhất `ChatNodeTurnDataInjected` khi khai báo child slot `conversation.chat.node`. `ChatNodeSeat` chỉ truyền Node key ổn định vào slot dưới dạng `hookContext`; Slot renderer dùng `useSession` trong bộ standard props chính thức cùng key đó để dựng `useTurnData(businessKey)`, nhờ vậy mỗi keyed Chat renderer đều đọc được dữ liệu chỉ-đọc có kiểu mạnh của Turn chứa Node của mình, và Assistant renderer không có quyền inject đặc biệt nào.

Contextual Hook ở mức slot và `inject.hooks` do entry sở hữu là hai đường độc lập. Đường sau tiếp tục chỉ bind Observable do registration sở hữu; đường trước cache định nghĩa theo slot inject face ổn định, và bind factory cùng Hook theo lần render ổn định. Selector bên trong `useTurnData()` chỉ trả về `turn.data.get(key)` của Node hiện tại, nên các publication không liên quan của Session bị cắt bởi selector equality.

`useSession` chuẩn vẫn là năng lực công khai của mọi slot renderer trong phạm vi session, còn `useTurnData()` là cách thu hẹp kiểu đọc phổ biến chứ không phải một sandbox quyền hạn. Thống kê toàn cửa sổ hay việc lập chỉ mục đối tượng tùy ý vẫn có thể dùng Session snapshot một cách tường minh; chúng chỉ không được giả trang thành "Turn data của Node hiện tại".

Assistant từ streaming sang final, Tool từ running sang settled chỉ cập nhật data và các thuộc tính sắp xếp cần thiết của cùng một Seat, không còn chuyển từ running container ở cuối vào luồng finalized, nên State bên trong component không tự bị đưa về không khi kết thúc.

Khi nghiệp vụ chủ động chuyển một Node đã phát hành thành hidden, nó rời khỏi visible order, và sẽ mount lại khi hiển thị trở lại. Đây là ngữ nghĩa thu hồi hiển thị tường minh của nghiệp vụ, khác với bảo đảm Seat ổn định của running→settled.

Renderer cụ thể của Tool vẫn bị ràng buộc bởi [`ui-tool ownership decision`](2026-08-08-client-tool-presentation-ownership.md). Tool Definition chỉ giao dữ liệu root/subcall đệ quy, còn `ui-tool` phân phối biểu hiện cụ thể theo keyed slot dựa trên Tool name.

Trajectory đăng ký target và Definition nghiệp vụ của riêng nó trên cùng Assembler và cùng cửa sổ event của Session như Chat. Target builder của nó giữ lại read model hướng stage, không tiêu thụ legacy slice của Chat Builder và cũng không chạy history fold riêng. Chat Builder giữ legacy slice cho StatsLine và các trường tương thích công khai ở tầng trên cùng; các Definition riêng của từng target không làm đổi Context, Reader hay hợp đồng Location dùng chung.

Các Definition Trajectory riêng theo target, stage model được giữ lại, phần thích ứng Steering, cận trên độ phức tạp và các điểm nóng ở tầng trình bày do [quyết định lắp ráp Trajectory Context](2026-08-11-trajectory-conversation-context-assembly.md) phụ trách.

## Runtime và đường render

```text
Session Event window
  -> ConversationNodeAssembler
       -> Definition.match(event) -> (kind, id, start/update)
       -> Context matches + State + Location
       -> Definition.buildLocationData(step -> turn)
            -> StepLocation.data / TurnLocation.data
       -> Definition.buildViewNode() for its declared target
  -> target View Builder
       -> chat: ChatSnapshotBuilder -> ChatView -> keyed ChatNodeSeat
       -> trajectory: TrajectorySnapshotBuilder -> stages/layout/table
```

## Kiểm chứng

Runtime tests cố định việc đăng ký vòng đời Definition, append theo exact-ID, việc thu thập update-before-start và replay xuôi sau start, identity khi prepend, việc vá window-gap của Reader, phụ thuộc bắc cầu, Location closure, thứ tự pha Step→Turn data, việc thay thế Location data, nhịp publication, thu hồi bất hợp lệ và Builder theo từng target.

Conversation tests bao phủ toàn bộ Chat Definition dựng sẵn, Assistant Step data, Turn data của Turn Tail và Deliverables, thứ tự sắp xếp Chat và việc chia sẻ cấu trúc, selector isolation, identity running-to-settled của Assistant/Tool, Code Dispatch lồng nhau, steering, Compaction, Retry, interruption, load-older anchoring và slot dispatch. Trajectory tests thì bao phủ các Definition Message, Assistant, Tool, Compaction, Request-header và boundary mà nó tự đăng ký, cùng view model hướng stage vẫn được giữ lại.

Slot type/runtime tests cố định việc cha đăng ký bắt buộc phải cung cấp common inject đã khai báo, kiểu của `hookContext`, sự cô lập Hook giữa các Node context khác nhau, tính ổn định identity của factory/Hook, và việc publication không liên quan của Session không làm render lại renderer nghiệp vụ. Các test Hook Observable do entry sở hữu trước đây tiếp tục cố định đường không dùng contextual factory.

Assembled Web snapshot, GUI và các kịch bản trình duyệt bao phủ plugin graph thật. Bằng chứng từ trình duyệt so sánh Assistant streaming→settled, Bash running→settled và Code Mode root + subcall lồng nhau với layout trên master.

Việc kiểm chứng đường lịch sử đồng thời bao phủ replace toàn phần, prepend không chồng lấn, khử trùng lặp seq chồng lấn, hội tụ `hasMore` với trang rỗng và live append. Cùng một cửa sổ Event, qua các đường nạp khác nhau, cho ra cùng State nghiệp vụ và Node cuối cùng.

## Các phương án đã cân nhắc

**Giữ transcript fold tập trung trong Session, chỉ tách helper.** Bị từ chối: identity nghiệp vụ, replay lịch sử và cache invalidation vẫn thuộc về một switch khép kín; di chuyển hàm không tạo ra quyền sở hữu độc lập.

**Để React renderer tự quét Session Event.** Bị từ chối: mỗi loại view sẽ lặp lại việc khớp và State vòng đời, React trở thành nguồn quyền lực nghiệp vụ, còn paging và streaming sẽ tính lại những cây component không liên quan.

**Truyền Nodes toàn cục hay chỉ mục Location cho mọi renderer nghiệp vụ.** Bị từ chối: component nghiệp vụ sẽ tự quét và suy ra Turn/Step hiện tại, phạm vi subscribe tăng theo cửa sổ. Definition phát hành giá trị tổng hợp lên Location do engine sở hữu, renderer chỉ đọc Location data của Node mình.

**Với mỗi Event mới thì gọi toàn bộ Context của cùng Definition.** Bị từ chối: chi phí append tăng theo lịch sử, và `update()` sẽ đồng thời gánh cả việc khớp lẫn việc chuyển đổi. `match(event)` không có Context tính ra ID trước, sau đó chỉ cập nhật một Context.

**Để matcher của Definition đọc Context hoặc quét lịch sử.** Bị từ chối: việc khớp sẽ phụ thuộc chiều nạp, trang lịch sử result-first không tự tính ra quy thuộc, và append thời gian thực cũng suy biến thành tra cứu đối tượng mở.

**Định nghĩa một State fold ngược cho việc quét ngược lịch sử.** Bị từ chối: mỗi nghiệp vụ sẽ phải duy trì hai bộ logic nghịch đảo lẫn nhau, và việc xóa, các phép tổng hợp không khả nghịch cùng phụ thuộc xuyên Context rất khó giữ nhất quán. Thống nhất Matches rồi replay xuôi từ start thì chỉ có một bộ ngữ nghĩa nghiệp vụ.

**Biến Inbox thành công dân hạng nhất của engine hoặc một Context ở mức cửa sổ.** Bị từ chối: Inbox là trạng thái nghiệp vụ thông thường, không nên làm bẩn engine dùng chung; trạng thái khoảnh khắc theo từng splice cộng với Reader tiền nhiệm nghiêm ngặt đã hỗ trợ đồng thời prepend, append và truy vấn của Message.

**Đăng ký query method đặc thù cho các truy vấn xuyên nghiệp vụ.** Bị từ chối: bên tiêu thụ vẫn phải phụ thuộc API của bên cung cấp, và mỗi quan hệ mới sẽ làm phình giao diện tập trung. Reader phơi ra Context tiền nhiệm chỉ-đọc theo kind chỉ định; bên cung cấp viết đúng State, bên tiêu thụ hiểu State.

**Để bên tiêu thụ Location data đọc trực tiếp Context State của bên cung cấp.** Bị từ chối: bên tiêu thụ sẽ phụ thuộc vào cấu trúc nội bộ khả biến của một nghiệp vụ khác, và cũng không diễn đạt được giá trị thuộc về Turn/Step nào. data map declaration-merged chỉ công khai các giá trị chỉ-đọc mà bên cung cấp chọn phát hành, cùng tọa độ do engine sở hữu.

**Thêm vòng đời `end()`, prepared hay window reset dùng chung.** Bị từ chối: điều kiện hoàn tất của mỗi nghiệp vụ khác nhau, và khoảng trống phân trang cũng không phải vòng đời nghiệp vụ. Event nghiệp vụ cập nhật State, Location close kích hoạt replay/build, còn Reader dependency lo việc mất hiệu lực khi bù trang.

**Phân nhánh cho Chat và Trajectory qua `buildViewNode(target)` bên trong cùng một Event Definition.** Bị từ chối: hai loại view cần State nghiệp vụ và bản ghi trung gian khác nhau, dùng chung Definition sẽ buộc mỗi package mang theo điều kiện và payload của phía kia. Definition riêng của từng target giữ những lựa chọn đó ở phạm vi cục bộ, đồng thời tái sử dụng các quy ước nạp và vòng đời của Assembler.

**Chồng thêm một tầng layout model dùng chung lên business Node cuối cùng.** Bị từ chối: activity, tail candidacy và layout enum sẽ gom ngữ nghĩa nghiệp vụ của Chat hiện tại trở lại vào engine. Node cuối cùng mang thẳng dữ liệu mà renderer cần, chỉ chia sẻ identity, thứ tự sắp xếp và các sự kiện Location.

**Chỉ đăng ký Turn data Hook trong Assistant renderer.** Bị từ chối: truy cập Location của Node hiện tại là năng lực công khai của slot `conversation.chat.node`, không thuộc về riêng renderer nghiệp vụ nào. Chat entry cha đăng ký common inject một lần, mọi keyed renderer dùng chung một quy ước có kiểu mạnh.

**Giữ Assistant hoặc Tool đang chạy trong một tail container riêng.** Bị từ chối: khi kết thúc sẽ phải di chuyển qua React parent khác, và business key ổn định cũng không ngăn được remount. Keyed order thống nhất cho phép data và vị trí sắp xếp thay đổi, nhưng không đổi Seat identity.

## Hệ quả

Business node mới có thể đăng ký cục bộ matcher, phép chuyển State, Location data tùy chọn, target Node cuối cùng và renderer của riêng nó, không còn phải sửa switch nghiệp vụ của Session. `ChatNodeDataMap` và các Location data map cho phép package nghiệp vụ hòa dữ liệu có kiểu mạnh vào bằng declaration merging; mọi Event liên quan vẫn phải phơi ra ID ổn định suy ra được từ một Event đơn lẻ.

Package nghiệp vụ phía Host declaration-merge các thành viên Event bền vững của mình vào `@deepseek-ai/dsh-session/types`, còn Client Definition thì type-only import qua sub-path `/types` của package nghiệp vụ tương ứng. Việc tăng cường chính interface được khai báo thay vì re-export barrel giúp các TypeScript Program độc lập của Host và Client đều thu được cùng phép narrowing cho Event, đồng thời không kéo Host runtime vào đồ thị của Client.

Trang đuôi ban đầu, prepend older và live append dùng chung một bộ bất biến của Context. Thiếu start, Reader window gap, Location unknown và delta tần suất cao đều là những trạng thái mà engine biểu đạt tường minh, nghiệp vụ không cần dựng thêm cache phụ thuộc chiều.

Append không quét Context lịch sử; prepend chỉ replay các Context mà Match, Location hoặc câu trả lời của Reader thực sự bị ảnh hưởng. Thay đổi cấu trúc Chat vẫn có thể phải tính lại visible order và chỉ mục, nhưng sẽ không chạy lại fold nghiệp vụ không liên quan hay thay identity của các Node không đổi.

Sau khi tách rời việc cập nhật State với tần suất phát hành, mỗi delta của Assistant đều được fold, đồng thời mỗi animation frame materialize nhiều nhất một lần. step/turn close và final có thể phát hành ngay State mới nhất.

Step/Turn trở thành nơi trú ngụ ổn định cho các giá trị tổng hợp dùng chung giữa các nghiệp vụ. Turn Tail và Deliverables không còn phụ thuộc vào việc renderer quét Nodes toàn cục; `useTurnData()` ở mức slot giới hạn kiểu đọc phổ biến vào đúng Turn chứa Node hiện tại, và cô lập các cập nhật không liên quan bằng selector equality.

Cái giá phải trả là Runtime có thêm Registry, Assembler, Location data, việc replay theo phụ thuộc và hợp đồng Builder theo từng target, còn UI Slots có thêm common inject do cha sở hữu và `hookContext` theo từng lần xuất hiện. Tác giả Definition phải hiểu ID ổn định, start duy nhất, replay xuôi, thứ tự phát hành Step→Turn, Reader chỉ-đọc và quy tắc không thu hồi Node.

`useTurnData()` không thu hồi `useSession` chuẩn của các renderer trong phạm vi session, nên ranh giới đó dựa vào việc dẫn hướng bằng API và test, chứ không phải cô lập năng lực. Thay đổi Registry vẫn là lần rebuild toàn phần tần suất thấp; Chat Builder tiếp tục duy trì legacy slice cho StatsLine và các trường công khai ở tầng trên cùng, còn Trajectory sở hữu Definition và Builder riêng theo target trên cửa sổ Session dùng chung. Các Definition dựng sẵn vẫn nằm trong UI package tương ứng; những ranh giới tương thích này không trao lại quyền diễn giải nghiệp vụ cho Session.
