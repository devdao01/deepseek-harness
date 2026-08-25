# Agent Note: Trajectory lắp ráp dữ liệu dựa trên Conversation Context kiểu đăng ký

Status: implemented

[English](2026-08-11-trajectory-conversation-context-assembly.md) | 中文

## Vấn đề

Trajectory trước đây duy trì một nguồn dữ liệu Session History độc lập, và gộp toàn bộ cửa sổ Event đã load thành trạng thái Assistant, Tool, message, Request header và Compaction. Chat đã lắp ráp cùng một họ Event đó thông qua Conversation Definition kiểu đăng ký. Hai luồng này triển khai trùng lặp hành vi liên kết nghiệp vụ và phân trang; ngay cả khi chỉ một đối tượng nghiệp vụ thay đổi, việc cập nhật cấu trúc của Trajectory vẫn sao chép hoặc quét lại một lượng dữ liệu tỷ lệ thuận với số Event gốc.

Tái sử dụng Node cuối cùng của Chat không giải quyết được vấn đề phân định trách nhiệm. Trajectory cần vòng đời request, trạng thái Assistant đang chạy, kế thừa prompt, tool schema, bản ghi thời gian và read model theo hướng stage, trong khi Chat không tiêu thụ những dữ liệu này. Dùng chung payload Node cuối cùng sẽ khiến cả hai view phụ thuộc vào hợp của nhu cầu cả hai bên.

Lần di trú này còn phải giữ nguyên việc phân loại steering (dẫn dắt giữa chừng) lưu bền. Bản thân `user/message` không cho biết nó mở một Turn mới hay được nhận từ inbox `next-step`; các trang cũ hơn cũng có thể chỉ bổ sung tiền tố inbox hoặc Location còn thiếu sau khi message đã được vật hóa.

## Quyết định

Trajectory đăng ký Conversation Definition và View Builder `trajectory` riêng của target mình vào [`ConversationNodeAssembler`](2026-08-09-client-conversation-node-assembly.md) dùng chung. Session chỉ duy trì một cửa sổ Event liên tục duy nhất, và công bố snapshot Chat và Trajectory qua `Session.views`; nó không còn chạy bộ nguồn lịch sử Trajectory thứ hai hay fold nghiệp vụ riêng nữa.

Mỗi Definition chỉ thuộc về một target. Chat và Trajectory có thể nhận diện cùng một họ Event lưu bền, nhưng duy trì State và payload Node cuối cùng riêng của mình. Chúng chỉ dùng chung khớp ID chính xác của Assembler, Match có thứ tự, sự thật Location, dependency Reader, lịch phát hành, và vòng đời replace/prepend/append.

[Bảng ghi kiểm tra Trajectory](../feature/2026-07-27-trajectory-inspection-ledger.md) hiện có tiếp tục đóng vai trò view model. Trajectory Builder chuyển đổi Node target đã vật hóa thành `eventNodes`, Requests, tool schema, lệnh gọi đang chạy và bản đồ Location gốc; layout, ảo hóa bảng, lựa chọn, hành vi Overview và inspector sẽ không trở thành quy ước Conversation tổng quát.

### Definition nghiệp vụ

| Nghiệp vụ | Định danh Context | Cách lắp ráp State | Đóng góp cho Trajectory |
|---|---|---|---|
| inbox `next-step` | seq Event splice | Áp dụng splice vào Context inbox tiền nhiệm gần nhất | Chỉ duy trì trạng thái, không tạo Node khả kiến |
| Message người dùng, steering hoặc tiêm | seq Event message | Đọc State inbox tiền nhiệm, và phân loại message lưu bền | Node Input hoặc context |
| Assistant và Request thông thường | `turn:step` | Gộp `step/start`, chunk, message cuối cùng, retry và `step/end` | Assistant cuối cùng, Assistant partial và Request |
| Tool call gốc | ID call gốc | Gộp call/result gốc với Event Code Dispatch lồng nhau thành một cây gọi | Cây Tool cuối cùng hoặc đang chạy |
| Compaction | ID compaction | Gộp start, summary, end và checkpoint thay thế | Request Compaction |
| Header Request | seq Event header | Đọc header trước đó, giữ prompt hiệu lực và thay đổi thật | Nguồn Prompt và tool schema |
| Ranh giới Session và Turn | seq Event boundary | Giữ thời điểm đóng và sự thật lỗi | Compaction bị gián đoạn hoặc Request thông thường thất bại |

Mỗi Event liên kết đều phải cung cấp trực tiếp cùng một ID nghiệp vụ. Code Dispatch dùng `rootCallId`, Compaction dùng ID compaction; ngay cả khi một Definition liên kết theo `turn:step`, Event Tool thông thường và retry vẫn giữ định danh giao thức riêng của mình. Các bản ghi cũ thiếu ID liên kết cần thiết sẽ bị Definition đó bỏ qua, không hòa vào Context `undefined`, và cũng không khiến Session sập.

Chunk Assistant chỉ cập nhật Context `turn:step` tương ứng. Chunk có nội dung yêu cầu công bố theo animation-frame; chunk usage và finish cập nhật State nhưng không ép buộc riêng một frame refresh. Message cuối cùng, retry hoặc ranh giới công bố ngay lập tức. State Assistant đã hoàn thành chỉ giữ block đã lắp ráp, thời gian, usage và sự thật retry, không sao chép ledger chunk gốc vào target snapshot.

### Khôi phục steering qua Context tiền nhiệm

Trajectory khôi phục steering từ lịch sử inbox lưu bền, dùng cùng quy tắc định danh với [quyết định Chat steering](../feature/2026-08-04-web-context-source-and-steer-marks.md), nhưng không dùng chung Node cuối cùng của Chat.

Mỗi Event `agent/inbox/spliced` nhắm tới `next-step` sẽ khởi động một Context không khả kiến được định danh bằng seq Event. `start()` của nó đọc Context inbox tiền nhiệm gần nhất, áp dụng splice, và lưu định danh đang chờ cùng tập ID message đã nhận tích lũy. `user/message` nguồn người dùng tiếp theo đọc Context inbox tiền nhiệm gần nhất: ID đã nhận sinh ra Node Steering, các message nguồn người dùng còn lại sinh ra Node User thông thường.

Khi vẫn còn lịch sử sớm hơn, việc Reader bị miss sẽ ghi lại dependency window-gap. Sau khi prepend bổ sung tiền nhiệm còn thiếu, Assembler sẽ replay theo thứ tự Event tăng dần đối với chuỗi inbox và Context message bị ảnh hưởng. Do đó, hướng phân trang lịch sử sẽ không phân loại sai message vĩnh viễn.

Location của Event message đưa steering vào đúng Step nó thuộc về. Nếu cửa sổ lịch sử đã load thiếu đủ Event ranh giới để giải quyết Location này, layout sẽ dùng step Assistant tiếp theo làm vị trí dự phòng. Trong cùng một Step, dấu Request đang chạy được xếp sau input steering đứng trước, do đó dấu này biểu thị Request model do input đó kích hoạt, chứ không xuất hiện trước input.

### Chuỗi cửa sổ và độ phức tạp

Gọi `E` là số Event gốc đã load, `P` là số trang của một lần prepend mới, `D` là số Definition Trajectory, `C` là số đóng góp Context Trajectory đã vật hóa, `Mᵣ` là tổng số Match mà các Context bị một lần prepend làm mất hiệu lực đang nắm giữ. `D` là tập đăng ký nhỏ; các chunk streaming sẽ hội tụ vào cùng một Context Assistant, do đó thông thường `C` nhỏ hơn đáng kể so với `E`.

| Luồng | Khối lượng công việc Context | Khối lượng công việc target snapshot | Kết quả |
|---|---|---|---|
| Trang cuối ban đầu hoặc replace khi kết nối lại | Khớp cửa sổ đã load với `O(E × D)`, và xây dựng State theo thứ tự Event tăng dần | Xây dựng và sắp xếp `C` đóng góp | Replace hoàn chỉnh vẫn tỷ lệ với cửa sổ đã load |
| Prepend trang sớm hơn | Chỉ khớp Event mới, và chỉ replay Context có Match, Location hoặc câu trả lời Reader thay đổi, chi phí `O(P × D + Mᵣ)` | Tái tạo lại stage snapshot từ `C` đóng góp | Fold nghiệp vụ không chạy lại từ đầu toàn bộ `E` Event |
| Append thời gian thực | Khớp với `O(D)`, tìm Context có key với `O(1)`, và chỉ cập nhật State tương ứng | Trước khi lắp ráp snapshot, thay thế đóng góp có anchor không đổi với `O(1)` | Chi phí liên kết nghiệp vụ không phụ thuộc lịch sử Event đã load |

Builder lưu đóng góp theo key Context, và duy trì index từ key sang vị trí. Cập nhật nội dung với anchor giống nhau sẽ thay thế một đóng góp tại chỗ; chỉ khi có đóng góp mới hoặc anchor thay đổi mới xây dựng lại và sắp xếp lại thứ tự đóng góp. Sau đó, việc lắp ráp snapshot duyệt qua `C` đóng góp, dùng Map để index header Request và tool schema, và dùng con trỏ tuyến tính hoặc index để xử lý ranh giới Compaction và lỗi Turn.

Việc sắp xếp Event và Request cuối cùng giữ giới hạn trên hiện tại của một lần công bố ở mức `O(C log C)`. Lần di trú này loại bỏ tra cứu ngược trùng lặp và refold lịch sử gốc kiểu cũ, nhưng không tuyên bố việc công bố đầu-cuối đạt `O(1)`. Chat vẫn giữ nguyên hành vi và độ phức tạp snapshot có key hiện có; việc thêm target Trajectory không khiến Chat quét Context hay Node của Trajectory.

### Tối ưu điểm nóng tầng hiển thị độc lập

Việc di trú Context và các tối ưu tầng hiển thị dưới đây giải quyết các chi phí khác nhau. Các tối ưu này giữ nguyên view model hiện có; lợi ích đến từ số lần gọi và ước tính độ phức tạp tiệm cận, quyết định này không tuyên bố có kết quả benchmark thực đo.

| Điểm nóng | Hành vi giữ nguyên | Khối lượng công việc dự kiến giảm |
|---|---|---|
| Tóm tắt Markdown | Layout chỉ giữ Markdown nguồn; mỗi bản ghi Table ổn định memo hiển thị tóm tắt theo nội dung, Detail chỉ phân tích bản ghi đang được chọn | Một lần append bản ghi đơn chỉ phân tích lại bản ghi khả kiến bị thay đổi, thay vì toàn bộ bản ghi Markdown |
| Văn bản tìm kiếm | `TrajectorySearchIndex` vẫn đối chiếu tuyến tính ID Record ổn định với chữ ký nguồn, nhưng chỉ chuẩn hóa Markdown cho record thay đổi, và commit cập nhật theo lô ba giây | So sánh chữ ký vẫn là `O(C)`; việc chuẩn hóa tốn kém chỉ tăng theo số record thay đổi, cập nhật frame liên tục được gộp thành một lô cho mỗi cửa sổ thời gian |
| Tooltip Timeline | Trì hoãn việc tính văn bản thời gian cho tới khi Tooltip mở | Lần render không mở Tooltip không thực hiện định dạng nhãn theo từng span |
| Tìm kiếm Assistant kế tiếp | Một lượt duyệt ngược ghi lại Assistant tiếp theo cho mỗi vị trí input | Độ phức tạp xấu nhất của việc tìm kiếm tiến trùng lặp trước đây giảm từ `O(C²)` xuống `O(C)` |
| Thời lượng Group | Dùng nhóm thập phân cố định thay cho `toLocaleString('en-US')` ở dạng số tiếng Anh cố định | Độ phức tạp vẫn tuyến tính theo số Group, nhưng đường dẫn render lặp lại không còn gọi Intl formatter |

Memo hiển thị và index tìm kiếm độc lập với nhau. Tìm kiếm phải bao phủ cả record ngoài màn hình, và cho phép thay đổi thời gian thực trễ một chu kỳ throttle; Table phải cập nhật ngay lập tức record khả kiến bị thay đổi, không thể kế thừa nhịp commit của index.

## Các phương án đã cân nhắc

**Giữ fold Session History độc lập, chỉ tối ưu cục bộ.** Không được chấp nhận: cache có thể giảm một số điểm nóng, nhưng Trajectory vẫn sẽ có một cửa sổ Event thứ hai, sửa lỗi phân trang, fold kiểm tra request và triển khai liên kết nghiệp vụ riêng ngoài Chat.

**Tái sử dụng Definition của Chat, và rẽ nhánh theo `target` trong `buildViewNode()`.** Không được chấp nhận: Trajectory cần State và record trung gian khác, không chỉ là một React renderer khác. Một Definition duy nhất sẽ mang theo payload và điều kiện của cả hai view, và khiến dữ liệu target không liên quan mất hiệu lực khi bất kỳ view nào thay đổi.

**Tạo Assembler riêng cho Trajectory.** Không được chấp nhận: định tuyến ID chính xác, thu thập kiểu update-trước-start-sau, replay prepend, sửa Location, dependency Reader và nhịp công bố đều không phải hành vi riêng của Trajectory. Một engine thứ hai sẽ tái tạo lại chính sự trùng lặp vòng đời mà lần cải tổ này nhằm loại bỏ.

**Thêm vòng đời Surface, rewind, fanout hoặc settled tổng quát.** Không được chấp nhận: luồng Event lưu bền hiện tại không cần nhánh Surface tổng quát; ranh giới Session hay Turn là input nghiệp vụ của target, không phải lý do để fanout một Event tới toàn bộ Context lịch sử. Điều kiện hoàn thành vẫn do State nghiệp vụ kết hợp closure Location quyết định.

**Thay stage Trajectory bằng Conversation Node tổng quát.** Không được chấp nhận: stage tổ chức Request, thời gian, schema và layout bảng cho một view duy nhất. Biến nó thành quy ước engine sẽ giới hạn các view Session-log đơn giản trong tương lai, và đưa việc tổ hợp riêng của view quay trở lại Client Runtime.

**Dùng chung một cache Markdown giữa hiển thị và tìm kiếm.** Không được chấp nhận: hiển thị yêu cầu cập nhật ngay lập tức và bị ràng buộc bởi viewport, còn tìm kiếm bao phủ toàn bộ record đã load và cố tình commit cập nhật theo lô. Cache dùng chung sẽ ghép tính đúng đắn và nhịp lập lịch của hai bên tiêu thụ không liên quan lại với nhau.

## Xác minh

Test Runtime cố định việc đăng ký target, append ID chính xác, replay kiểu update-trước-start-sau, identity prepend, sửa lỗi window-gap của Reader, replay Location, và cách ly snapshot giữa Chat và Trajectory.

Test Definition và Builder của Trajectory cố định streaming và gián đoạn Assistant, tool call lồng nhau và gián đoạn song song, Compaction và kế thừa prompt, phân loại Steering và vị trí Step, thứ tự dấu Request, thay thế đóng góp ổn định và mở rộng prepend. Test Table, layout, Timeline và tìm kiếm cố định việc trì hoãn công việc Markdown, cập nhật index theo throttle, định dạng khi hiển thị Tooltip, và kết quả tìm kiếm ổn định trong lúc append/prepend.

## Hệ quả

Chi phí lắp ráp nghiệp vụ của Trajectory tăng theo số trang thay đổi hoặc Context có key, không còn bắt đầu lại từ toàn bộ cửa sổ Event gốc. Definition riêng của target có thể tiến hóa độc lập với Chat, đồng thời vẫn dùng chung một cửa sổ Session và một bộ quy tắc vòng đời. Steering sẽ trở thành record Trajectory hạng nhất tại đúng vị trí Step mà nó thuộc về, không cần thêm trạng thái riêng cho steering vào Session.

Builder theo hướng stage được giữ lại vẫn sẽ thực hiện khối lượng công việc tỷ lệ với số đóng góp Trajectory đã vật hóa, và có thể sắp xếp lại khi công bố. Khi layout input thay đổi, index tìm kiếm vẫn sẽ thực hiện một lần kiểm tra chữ ký tuyến tính nhẹ. Các chi phí này là công việc view target tường minh, không phải một lần refold toàn bộ Event ẩn.

Tác giả Definition phải cung cấp định danh giao thức ổn định. Event cũ thiếu ID cần thiết có thể không xuất hiện trong view nghiệp vụ Trajectory bị ảnh hưởng; so với việc gộp nhầm bản ghi không liên quan hoặc khiến việc load lịch sử thất bại, đây là cách xuống cấp an toàn hơn. Bên sinh ra dữ liệu cần hiển thị đầy đủ phải ghi lại định danh đó.

[Quyết định lắp ráp Conversation](2026-08-09-client-conversation-node-assembly.md) tiếp tục là nguồn thẩm quyền cho quy ước Context, Reader, Location và công bố tổng quát. [Quyết định ledger Trajectory](../feature/2026-07-27-trajectory-inspection-ledger.md) tiếp tục chịu trách nhiệm về phân cấp bảng, ảo hóa, inspector và hành vi tương tác. Note này chịu trách nhiệm giải thích Trajectory thích ứng với hai quyết định đó như thế nào, và tại sao việc thích ứng đó không dùng chung Node cuối cùng với Chat.
