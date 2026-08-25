# Agent Note: Trình điều khiển Goal Round trong cùng phiên

Status: implemented

[English](2026-07-19-same-session-goal-round-driver.md) | Tiếng Việt

## Vấn đề

Lĩnh vực mục tiêu (goal) có thể giữ mục tiêu, công cụ mà mô hình nhìn thấy cũng có thể thay đổi vòng đời của nó, nhưng cả hai đều không nên quyết định khi nào lượt mô hình tiếp theo bắt đầu. Trình điều khiển tiếp tục thực thi phải bắc cầu trạng thái mục tiêu đang hoạt động vào agent loop (vòng lặp tác tử) thông thường, đồng thời không được thêm nhánh chuyên biệt cho mục tiêu vào `dsh-agent-loop`, không tạo ra một cuộc hội thoại thứ hai, và cũng không được coi mỗi lượt của con người là một vòng lặp tự động.

Lớp kết nối này còn gánh nghĩa vụ về đồng thời và tính bền vững. Đầu vào của con người, hủy bỏ, chỉnh sửa mục tiêu, lỗi lưu bền vững, khởi động lại phiên, gỡ plugin, và chính sách prompt ở tầng dưới đều có thể cạnh tranh với một lần tiếp tục thực thi đang chờ. Một listener đơn giản kiểu `goal/changed -> agent.followup()` có thể chấp nhận công việc đã lỗi thời, chạy đồng thời với prompt của con người, tiêu tốn tài nguyên vượt giới hạn, hoặc tự khởi động lại sau khi replay mà không có ủy quyền mới.

## Quyết định

`@deepseek-ai/dsh-goal-round-driver` nằm ở `packages/goal/goal-round-driver/` là một plugin chính sách được xây dựng trên `ctx.goals`, giao diện `Agent` công khai, và các sự kiện phiên bền vững. Nó không import bất kỳ implementation agent-loop cụ thể nào. Nó duy trì trạng thái lập lịch trong tiến trình theo đúng danh tính đối tượng (object identity) của từng `Agent` đang hoạt động, và chỉ dành trước tối đa một Goal Round tự động tại một thời điểm.

Quan hệ phân cấp là Mục tiêu (Goal) → Goal Round → Lượt (Turn) → Bước (Step). Goal Round là một lần lặp của chính sách tiếp tục thực thi ở tầng ngoài; nó trở thành một lượt hội thoại thuộc về mục tiêu, và lượt đó có thể chứa bất kỳ số bước mô hình hoặc công cụ thông thường nào. Lượt bắt nguồn từ con người trong cùng phiên không phải là Goal Round, và không bao giờ làm tăng `roundsStarted`.

Plugin này không có tùy chọn cấu hình. `maxGoalRounds` do `dsh-goal` phân giải và lưu bền vững; ngưỡng "cùng điều kiện chặn" do `dsh-tool-goal` phân giải và ghi vào prompt. Nếu trình điều khiển khai báo lại các giá trị có thể điều chỉnh này, một chính sách sẽ có nhiều hơn một chủ sở hữu.

### Dành trước và chấp nhận

Khi agent đang rảnh, không có công việc đang xếp hàng cạnh tranh, và mục tiêu hiện tại vừa `active` vừa `armed`, trình điều khiển trước tiên sẽ lưu bền vững thay đổi mục tiêu đang chờ vào checkpoint, và sau khi chờ hoàn tất sẽ xác nhận lại toàn bộ điều kiện. Nếu `roundsStarted` đã bằng `maxGoalRounds`, nó sẽ ghi nhận trạng thái `blocked` với mã `round-limit`; ngược lại, nó sẽ dành trước danh tính chính xác `{ goalId, revision, round: roundsStarted + 1 }` cùng prompt đã render đầy đủ, rồi gọi `Agent.followup()` với `GoalMessageSource`. Prompt mã hóa mô tả mục tiêu bằng dấu ngoặc kép JSON, để văn bản nhiều dòng hoặc giống thẻ (tag-like) vẫn là giá trị dữ liệu không mơ hồ trong một khung quen thuộc.

Waterfall (chuỗi sự kiện dạng thác nước) `agent/pre-step` là cổng đầu vào. Chỉ những nguồn mục tiêu có số Round dương mới được đi qua nếu khớp hoàn toàn với danh tính và nội dung đang chờ của trình điều khiển, mục tiêu đang hoạt động vẫn còn cùng id và số revision, trạng thái kích hoạt vẫn là armed, và Round đó vẫn là Round tiếp theo cần đánh số. Plugin kiểm tra một lần trước khi ủy quyền cho các listener ở tầng dưới, và kiểm tra lại một lần nữa sau khi tầng dưới trả về. Lần kiểm tra thứ hai ngăn việc một listener bất đồng bộ chỉnh sửa hoặc tạm dừng mục tiêu trong khi prompt cũ vẫn lọt qua.

Chỉ khi `user/message` cuối cùng thực sự được tạo ra thì đó mới là một Goal Round đã vào cuộc, và nó mới đẩy tiến trạng thái mục tiêu (goal folding). Một lần dành trước đã lỗi thời sẽ đóng một lượt bị chặn với không bước nào; trình điều khiển sẽ đánh dấu nó là lỗi thời, không tính vào số Round. Nếu chính sách tầng dưới từ chối vì lý do khác không phải trạng thái lỗi thời, mục tiêu sẽ chuyển sang blocked, chứ không tự động thử lại để vượt qua chính sách đó.

### Công việc của con người và cạnh tranh về revision

`MessageId` được dành trước sẽ phân biệt bản ghi đầy đủ của chính trình điều khiển với mọi prompt khác. Công việc thông thường đã xếp hàng từ trước khi dành trước sẽ chặn việc lập lịch; công việc thông thường đến trong lúc prompt tự động đang chờ sẽ khiến lần dành trước đó lỗi thời, do đó một lô đã được nhận (claimed) hỗn hợp sẽ từ chối đề xuất tự động. Công việc thông thường đến sau khi Goal Round đã vào cuộc sẽ ở lại hàng đợi, trở thành một lượt độc lập tiếp theo; chỉ khi agent lại rảnh thì việc tiếp tục thực thi mới được xem xét lại.

Mục tiêu sẽ tăng số revision bền vững khi có thay đổi trong Round. Việc chốt kết quả (settlement) của revision cũ không được ghi đè lên thay đổi đó. Trình điều khiển sẽ bỏ kết quả của lần thử cũ, đọc lại projection mới, và chỉ tiếp tục nếu revision mới vẫn là active và armed. Do đó, việc hoàn thành, tạm dừng, chặn, và chỉnh sửa được mô hình ghi log có thẩm quyền cuối cùng so với lý do đóng lượt đến muộn hơn về mặt vật lý.

### Chốt kết quả

Trình điều khiển phân loại một lượt đã đóng, thuộc về mục tiêu, theo bảng dưới đây:

| Kết quả lượt | Hành động |
|---|---|
| `completed` đã lưu bền vững | Tiếp tục nếu mục tiêu vẫn active/armed và chưa đạt giới hạn |
| Hủy Goal Round đã dành trước/đã chấp nhận, hoặc Round đó cho ra kết quả `aborted` | Tạm dừng và hủy kích hoạt |
| `error` với mã `RATE_LIMIT` hoặc `QUOTA` | Chặn với mã `usage-limited` |
| `error` khác | Chặn với mã `turn-error` |
| `max-tokens` | Chặn với mã `max-tokens` |
| Lưu bền vững checkpoint thất bại | Hủy kích hoạt, nhưng không đổi giai đoạn lưu bền vững |
| `disposed` hoặc `interrupted` | Hủy kích hoạt |
| Kết quả không xác định do plugin mới thêm | Chặn và chờ kiểm tra |

Không kết quả bất thường nào yêu cầu tự động thử lại. Prompt sau đó của con người có thể yêu cầu tiếp tục bằng bất kỳ ngôn ngữ nào; mô hình đọc mục tiêu đã dừng và gọi hành động resume của công cụ mục tiêu, ghi lại revision mới và kích hoạt lại việc tiếp tục thực thi.

### Cam kết về lưu bền vững và hủy bỏ

Mỗi thông báo `goal/changed` sẽ tạo ra một nghĩa vụ checkpoint. Trình điều khiển chờ `ctx.sessions.flush(session)` trước khi dành trước công việc, sau đó kiểm tra xem có xuất hiện thay đổi mới hơn, thay đổi vòng đời agent, hay prompt cạnh tranh hay không. Lỗi flush khi kết thúc lượt sẽ được báo cáo sau `turn/end` qua thông báo `agent/error` hiện có; ngay cả khi một lần chèn (injection) một lần đồng thời đã thêm lượt tiếp theo, trình điều khiển vẫn tìm đúng lượt đã đóng tương ứng, gắn lỗi vào đúng lần thử đó, và hủy kích hoạt trước quyết định rảnh tiếp theo.

Hủy bỏ diện rộng sẽ xóa công việc đang chờ trong hộp thư đến (inbox) và abort các giai đoạn vòng lặp đang hoạt động. Trình điều khiển mục tiêu theo dõi tin nhắn đã dành trước qua sự kiện nhận/bỏ của inbox và sự kiện kết thúc lượt aborted đã lưu bền vững. Vì lượt hiện đã mở trước khi được nhận lần đầu, việc hủy có thể đóng một lần thử đã nhận với không bước nào; trình điều khiển sẽ đánh dấu lần thử đó là đã hủy, và để lần rảnh tiếp theo tạm dừng mục tiêu, giống như cách xử lý một lần thử đã được chấp nhận. Việc hủy không khớp với lần thử mục tiêu nào chỉ xóa trạng thái kích hoạt trong tiến trình. Nếu thay đổi tạm dừng ném lỗi, trình điều khiển sẽ lùi về hủy kích hoạt, để tránh công việc tự động đã hủy khởi động lại.

`Agent.cancel()` vẫn là động từ hủy bỏ diện rộng công khai duy nhất. Nếu bên tiêu thụ phụ thuộc vào các thứ tự này, một `Agent` tùy chỉnh triển khai giao diện này phải tuân theo thứ tự inbox, kết thúc lượt, trạng thái, và dừng hẳn hoàn toàn.

### Vòng đời tiến trình

`GoalService.disarm(agent)` chỉ xóa trạng thái kích hoạt trong tiến trình. Nó không ghi sự kiện phiên, không đổi số revision, và không phát ra thay đổi mục tiêu. Trình điều khiển gọi phương thức này khi tải một agent hiện có, khi tính bền vững không chắc chắn, và trước khi gỡ bỏ; chỉ `resume` sau đó mới là cạnh kích hoạt bền vững mà mô hình nhìn thấy.

Listener sự kiện của trình điều khiển và luồng đóng sau khi dừng hẳn hoàn toàn được lồng trong cùng một Cordis effect có thứ tự. Cordis sẽ gỡ các effect anh em đồng thời; nếu listener và dọn dẹp được đăng ký riêng, disposer bất đồng bộ vẫn có thể đang xả (drain) trong khi cổng prompt đã bị gỡ. Effect kết hợp sẽ đóng việc chấp nhận trước, hủy kích hoạt mục tiêu, hủy lần thử đã chấp nhận, và chờ cả agent lẫn trình điều khiển dừng hẳn hoàn toàn; chỉ sau đó mới hủy đăng ký listener.

Ngay trước khi plugin bắt đầu gỡ bỏ, việc nhận trong inbox có thể thắng trong cuộc đua microtask. Trong trường hợp đó, lượt, thậm chí cả yêu cầu đầu tiên, có thể đã bắt đầu, và Round đó vẫn được lưu bền vững tính vào hạn mức; một khi việc gỡ bỏ bắt đầu, hủy bỏ sẽ abort nó, không lập lịch thêm lượt nào nữa, mục tiêu vẫn giữ active nhưng disarmed. Nếu giả vờ như lần nhận đã quan sát được chưa từng xảy ra, điều đó sẽ phá vỡ số đếm khi replay.

## Kiểm thử

Test đơn vị dùng agent loop và dịch vụ phiên thật, chỉ viết kịch bản (script) cho mô hình. Nội dung bao phủ gồm: chấp nhận liên tiếp chính xác và thực thi tới giới hạn, độ trễ (laziness) khi tải và khôi phục, toàn bộ phân loại kết quả, giới hạn tốc độ, lỗi yêu cầu, max token, chính sách prompt tầng dưới phủ quyết, hủy trước khi chấp nhận và trong khi thực thi, hủy công việc không liên quan của con người, lùi lại khi tạm dừng thất bại, thứ tự đầu vào của con người, cạnh tranh revision tầng dưới khi đang xếp hàng, nguồn mục tiêu giả mạo, lỗi checkpoint khi thay đổi và khi kết thúc lượt (bao gồm cả chèn một lần tiếp theo), lỗi bộ lập lịch và agent tùy chỉnh, reset khi khởi động phiên, thoát vòng đời chính xác, và gỡ plugin cả khi đang xếp hàng lẫn khi đang chạy. Mã nguồn trình điều khiển mới đạt 100% câu lệnh, nhánh, hàm và dòng theo từng file.

Snapshot ACP (Agent Client Protocol) không cần khóa (keyless) gắn ứng dụng tự động hóa đã publish qua `cordis.yml`, cùng với lĩnh vực mục tiêu thật, công cụ mục tiêu, trình điều khiển mục tiêu, agent loop, lưu bền vững và adapter replay thật. Một lượt bắt nguồn từ con người tạo và kiểm tra một mục tiêu có hai Round; Round tự động đầu tiên dừng bình thường, sau đó ACP hủy Round thứ hai bị cố ý làm treo, và ghi lại trạng thái tạm dừng bền vững. Transcript (bản ghi văn bản) đã chuẩn hóa ở tầng giao thức và assertion JSONL bên ngoài chứng minh chỉ có một phiên, nguồn Round lần lượt là `1, 2`, số đếm thay đổi vòng đời và replay chính xác, và không hề coi `echo-agent` là ứng dụng thay thế.

Test hủy bỏ ở core cố định thứ tự thông báo và cách ly: chỉ hủy hợp lệ mới được thông báo; observer có thể xếp hàng công việc thay thế trước khi làm rỗng inbox; ném lỗi không được chặn các observer tiếp theo; gọi khi rảnh không phát ra sự kiện.

## Các phương án thay thế đã cân nhắc

- **Thêm vòng lặp mục tiêu bên trong `dsh-agent-loop`** — không chọn, vì hàng đợi, prompt, phiên, hủy bỏ và cam kết trạng thái công khai đã đủ, và một nhánh vòng lặp cụ thể sẽ trao đặc quyền cho một chính sách nào đó.
- **Dùng `agent/turn-continuation` để biến mỗi Round thành một bước khác** — không chọn, vì Goal Round là một lần lặp chính sách ở tầng ngoài, cần có prompt người dùng bền vững riêng, ranh giới lượt riêng, số đếm Round riêng và cách chốt lỗi riêng.
- **Lưu bền vững lần dành trước đang chờ** — không chọn, vì việc sập hệ thống không thể chứng minh hàng đợi trong tiến trình đã đạt tới điểm chấp nhận; chỉ `user/message` bền vững mới tính vào Round.
- **Tự động thử lại bên cung cấp hoặc lỗi bền vững** — không chọn, vì thử lại tiêu tốn tài nguyên và cần ủy quyền tường minh; dừng giai đoạn rồi để con người tiếp tục sau đó đơn giản hơn và dễ quan sát hơn.
- **Fork lịch sử hội thoại hoặc tạo agent mới cho mỗi Round** — gói này không áp dụng, vì mục tiêu này rõ ràng thuộc công việc trong cùng phiên. Việc thực thi kiểu Ralph với agent mới vẫn là một plugin workflow độc lập dựa trên các nguyên thủy subagent và workflow.
- **Coi mỗi lượt trong phiên là một lần đếm Round** — không chọn, vì việc làm rõ của con người và công việc không liên quan cùng chia sẻ phiên, nhưng không chia sẻ ngân sách công việc tự động.

## Hệ quả

- Việc tiếp tục thực thi mục tiêu vẫn là một plugin có thể gỡ bỏ, vòng lặp cụ thể chỉ thêm một thông báo "quan sát trước khi hủy" tổng quát.
- Replay có thể dựng lại từng Round đã chấp nhận từ nguồn mục tiêu và prompt chính xác; lần dành trước bị từ chối sẽ không tạo ra mức tiêu thụ ngân sách giả.
- Tin nhắn của con người và thay đổi vòng đời có thể thắng trong các cuộc đua có ràng buộc tài liệu hóa, mà không phá vỡ số revision hay bộ đếm.
- Việc resume và fork luôn giữ tính lười (lazy) cho đến khi ý định ngữ nghĩa của con người thúc đẩy mô hình ghi lại thay đổi resume.
- Việc ánh xạ lỗi thận trọng có thể yêu cầu tiếp tục thủ công sau lỗi tạm thời, nhưng sẽ không bao giờ che giấu việc tự động thử lại.

## Giới hạn đã biết và các việc hoãn lại

- Sự tương đương ngữ nghĩa của bằng chứng hoàn thành và điều kiện chặn vẫn do mô hình phán đoán. Bộ đánh giá độc lập, chứng chỉ hoàn thành, hoặc chính sách dừng do trình xác thực điều khiển được hoãn sang một plugin chính sách độc lập.
- Gói này không cung cấp lần thử agent mới kiểu Ralph, reset ngữ cảnh, phản hồi đánh giá xuyên Round, hay song song hóa ở cấp workflow; những thứ đó thuộc công cụ workflow Ralph độc lập.
- Việc gỡ bỏ của Cordis bắt đầu bất đồng bộ. Một mục đã được inbox chấp nhận có thể vào một Round tính vào hạn mức và khởi động một yêu cầu trước khi việc hủy do gỡ bỏ có hiệu lực; việc xả (drain) khi đóng sẽ chặn mọi Round tiếp theo.
- `maxGoalRounds` chỉ là giới hạn trên của số Round đã chấp nhận. Token, chi phí, thời gian đồng hồ treo tường, và ngân sách sử dụng của bên cung cấp cần chính sách độc lập.
- Implementation `Agent` tùy chỉnh phải tạo ra đúng sự kiện phiên, cạnh trạng thái, thông báo hủy bỏ, và ngữ nghĩa dừng hẳn hoàn toàn theo tài liệu quy định; chỉ tương thích cấu trúc TypeScript không thể xác minh thứ tự thời gian chạy.
