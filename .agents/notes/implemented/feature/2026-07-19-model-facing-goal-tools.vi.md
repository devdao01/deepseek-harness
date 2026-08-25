# Agent Note: Tool mục tiêu cùng phiên hướng tới model

Status: implemented

[English](2026-07-19-model-facing-goal-tools.md) | 中文

## Vấn đề

Miền mục tiêu bền vững có chủ đích cung cấp các động từ vòng đời cho plugin, chứ không trực tiếp cho model. Model vẫn cần một API kiểm soát nhỏ gọn, để phát hiện mục tiêu hiện tại, tạo mục tiêu theo ý định người dùng và thay đổi vòng đời của nó. Chỉ dựa vào hướng dẫn trong prompt không thể xác định ai đã ủy quyền cho một thay đổi: subagent, message plugin được tiêm vào, lượt model lỗi thời, hoặc phiên sau khi khôi phục đều có thể sinh ra cùng tham số tool.

API tool này cũng cần giữ sự phân tách giữa trạng thái bền vững và quyền thực thi thời gian thực. Phiên sau khi khôi phục hoặc fork có thể replay mục tiêu đang hoạt động, nhưng ban đầu ở trạng thái chưa kích hoạt; khi người dùng sau đó yêu cầu kiểu "tiếp tục đi", model cần có khả năng kích hoạt lại mục tiêu mà không cần người dùng dùng lệnh nghĩa đen (literal command). Ngược lại, một Goal Round tự trị đã được chấp nhận phải có khả năng báo cáo hoàn thành hoặc tiếp tục bị chặn, nhưng không vì thế mà có được quyền chỉnh sửa, tạm dừng, resume hay thay thế mục tiêu của người dùng.

## Quyết định

`@deepseek-ai/dsh-tool-goal` tại `packages/goal/tool-goal/` đóng góp ba tool độc quyền và một đoạn chính sách system prompt trên nền `ctx.goals`: `get_goal`, `create_goal` và `update_goal`. Tên tool và hình thái đọc-tạo-cập nhật tuân theo bề mặt tool mục tiêu gọn nhẹ của Codex, còn quy tắc ủy quyền dùng agent (tác tử), phiên, tool và goal service chung của repo này.

### Tool và quy ước model

`get_goal()` trả về mục tiêu hiện tại hoặc `null`. Kết quả không rỗng chứa id và số revision dùng cho compare-and-swap, mô tả mục tiêu, giai đoạn bền vững, số Goal Round đã chấp nhận và tối đa, lý do bị chặn nếu có, và quan sát trạng thái kích hoạt cục bộ theo tiến trình. `create_goal(objective, max_goal_rounds?)` tạo một mục tiêu cùng phiên chạy dài. `update_goal(goal_id, revision, action, objective?, max_goal_rounds?, blocked_reason?)` hỗ trợ `edit`, `pause`, `resume`, `complete` và `blocked`; trường thay thế chỉ có hiệu lực với `edit`, `blocked_reason` không rỗng chỉ bắt buộc khi `blocked`, và được lưu bền vững với mã ổn định `model-reported`. Executor coi trường tùy chọn có giá trị đúng bằng chuỗi rỗng và `max_goal_rounds` bằng 0 là giá trị giữ chỗ (placeholder) theo schema nghiêm ngặt: các giá trị này tương đương với việc bỏ qua; khi chỉnh sửa vẫn phải cung cấp ít nhất một trường thay thế có ý nghĩa thực; mọi giá trị không phải placeholder vẫn bị ràng buộc theo thao tác tương ứng.

Prompt cho model biết: nó có thể suy ra ý định mục tiêu từ bất kỳ request trực tiếp nào của người dùng, dù cách diễn đạt hay ngôn ngữ nào, nhưng không nên biến công việc một lượt thông thường thành mục tiêu. Trước khi cập nhật, phải đọc mục tiêu hiện tại và sao chép chính xác id và revision. Với mục tiêu đang hoạt động nhưng chưa kích hoạt sau khi khôi phục hoặc fork, việc người dùng yêu cầu tiếp tục về mặt ngữ nghĩa là đủ căn cứ để thực hiện `resume`. Chỉ được đánh dấu hoàn thành khi mục tiêu thực sự đã đạt được; khó khăn hay sự không chắc chắn tự nó không cấu thành bị chặn; báo cáo bị chặn phải nêu rõ điều kiện cụ thể.

Cả ba tool đều thực thi độc quyền, để các batch được model sắp xếp có thể quan sát các thay đổi trước đó cùng revision mới của chúng. Kết quả là JSON gọn nhẹ. Hiển thị UI là hàm thuần của tham số, dùng thẻ đọc hoặc thay đổi tổng quát; thẻ thay đổi khi chọn input sẽ ưu tiên giá trị thao tác có ý nghĩa thực trước, rồi mới đến id mục tiêu, do đó các giá trị placeholder được phép sẽ không làm input của thẻ trống rỗng. Trạng thái kích hoạt chỉ được trả về như một quan sát thời gian thực, không bao giờ được ghi vào trạng thái replay.

Sau khi một Goal Round tự trị báo cáo thành công hoàn thành hoặc bị chặn, kết quả tool của nó sẽ kèm theo một chỉ dẫn kết thúc (wrap-up), model vẫn sẽ nói với người dùng trước khi lượt kết thúc qua đường dừng-không-gọi-tool thông thường; cách làm trước đây là kết thúc lượt ngay tại kết quả đã được thay thế bởi [quyết định kết thúc Goal Round](../bug-fix/2026-08-02-goal-round-wrapup-message.md). Thay đổi do người dùng trực tiếp khởi xướng sẽ không nhận chỉ dẫn: agent có thể xác nhận thay đổi đó, và steering (chỉ dẫn giữa chừng) đồng thời của người dùng vẫn có thể tham gia kiểm tra dừng thông thường.

### Quyền thực thi

Mỗi lời gọi đều yêu cầu tồn tại `exec.agent`, và nó phải chính là đối tượng đang chạy hoàn toàn giống trong `AgentRegistry`, là bên khởi xướng driver đang kế thừa hiện tại, và nằm trong một lượt đang mở. Các kiểm tra này thực hiện lúc thực thi, không thể bị vượt qua bằng cách tiêm prompt hay viết tay tham số tool.

Tạo, chỉnh sửa, tạm dừng và resume còn yêu cầu lượt hiện tại của agent gốc runtime đã chấp nhận một message người dùng hoặc event steering người dùng. Quyền sở hữu gốc đến từ đồ thị agent thời gian thực, không phải quan hệ tổ tiên fork bền vững: phiên fork sau khi khôi phục có thể nhận quyền người dùng trực tiếp mới, còn con thời gian thực vẫn là subagent, không thể thay đổi các trạng thái này. Nguồn người dùng là bằng chứng do host cung cấp: mỗi input `Agent.followup()` hoặc `steer()` đều phải cung cấp nguồn tường minh, do đó host gắn nhãn nội dung người dùng trực tiếp là `{ kind: 'user' }`, còn các nhà sản xuất không phải người dùng tự ghi chú mình trong trường nguồn. Runtime chứng minh lượt hiện tại chứa message do người dùng gửi trực tiếp, chứ không phán đoán liệu cách diễn đạt của người dùng có đủ về mặt ngữ nghĩa để tạo hay resume mục tiêu hay không; việc diễn giải đó vẫn do model thực hiện.

Complete và blocked chấp nhận cả quyền người dùng trực tiếp lẫn đúng Goal Round hiện tại. Quyền Goal Round yêu cầu tồn tại một `user/message` có nguồn là mục tiêu, trong đó id mục tiêu, revision và Round đều bằng với mục tiêu hiện tại đã gấp (fold). Nó chỉ cấp quyền cho hai loại báo cáo kết thúc này. Quyền người dùng trực tiếp có thể dừng mục tiêu ngay lập tức.

### Ngưỡng bị chặn

`blockedAfterConsecutiveRounds` là cấu hình số nguyên an toàn dương đã được kiểm tra, mặc định là `3`. Khi một Goal Round tự trị gọi `blocked`, plugin sẽ máy móc yêu cầu ít nhất đã chấp nhận số Round đó và cung cấp giải thích không rỗng; giá trị cấu hình cũng xuất hiện trong hướng dẫn model. Runtime không thể phán đoán liệu các Round này có gặp cùng điều kiện bị chặn về mặt ngữ nghĩa hay không, do đó tính tương đương ngữ nghĩa vẫn do model phán đoán. Bộ đếm này có chủ đích tách biệt khỏi giới hạn tiếp tục thực thi rộng rãi của mục tiêu.

## Kiểm thử

Unit test cố định việc đăng ký và dispose (giải phóng tài nguyên), lập lịch độc quyền, chính sách prompt được sinh ra, hiển thị tổng quát xử lý an toàn giá trị placeholder, việc người dùng trực tiếp tạo mục tiêu trong lượt không phải tiếng Anh, kiểm tra agent và driver chính xác/lỗi thời/không chạy, từ chối subagent thời gian thực, quyền cho gốc fork sau khôi phục, steering, bên khởi xướng không khớp, hành vi đọc/tạo/chỉnh sửa từng phần trường/tạm dừng/resume (bao gồm giá trị placeholder theo schema nghiêm ngặt), giải thích bị chặn có điều kiện, kích hoạt lại sau cạnh khởi động phiên, hành vi thất bại khi kiểm tra quyền diễn ra trước kiểm tra tham số điều kiện, hoàn thành với Goal Round chính xác, chỉ Round tự trị mới kích hoạt kết thúc, ngưỡng bị chặn đã cấu hình, và người dùng chặn ngay lập tức. Snapshot replay không cần key gắn miền mục tiêu và tool vào ứng dụng chạy một lần headless thật, điều khiển một lần thăm dò `update_goal` mang giá trị placeholder theo schema nghiêm ngặt, cùng các lời gọi `create_goal` và `get_goal` qua vòng lặp và stack persistence đi kèm, cố định transcript (bản ghi văn bản) stream-json, và kiểm tra thay đổi mục tiêu đã lưu bền vững bên ngoài. Ở đây có chủ đích không dùng fixture (dữ liệu tiền đề cho test) echo-agent thay cho UX ứng dụng thật.

## Các phương án thay thế đã cân nhắc

- **Dựa vào chỉ dẫn prompt để thực thi quyền hạn** — không áp dụng, vì văn bản có thể hướng dẫn phán đoán của model, nhưng không thể xác thực bên gọi thời gian thực, lượt, hay event nguồn.
- **Expose từng động từ goal service riêng lẻ thành các tool** — không áp dụng, vì API đọc/tạo/cập nhật gọn nhẹ có thể giảm chi phí schema, và giữ hành vi compare-and-swap thống nhất.
- **Yêu cầu cụm từ lệnh chính xác** — không áp dụng, vì ý định ngôn ngữ tự nhiên (kể cả ngôn ngữ khác tiếng Anh) nên do model diễn giải; quyền thực thi phụ thuộc vào message do người dùng gửi trực tiếp trong lượt hiện tại, không phải cách viết.
- **Ủy quyền dựa trên metadata gốc hoặc fork bền vững** — không áp dụng, vì fork được khôi phục độc lập như một phiên cấp cao nhất nên nhận quyền người dùng mới, còn subagent vẫn bị ràng buộc quyền sở hữu hiện tại thì không nên.
- **Cho phép Round tự trị chỉnh sửa hoặc resume mục tiêu** — không áp dụng, vì quyền tiếp tục thực thi hẹp hơn quyền định nghĩa lại hoặc khởi động lại mục tiêu của người dùng.
- **Coi ngưỡng bị chặn như một bộ đánh giá** — không áp dụng, vì đếm event không thể chứng minh trở ngại chưa thay đổi về mặt ngữ nghĩa hay thực sự không thể tiếp tục.
- **Từ chối mọi trường thao tác cụ thể đã được cung cấp** — không áp dụng, vì bên cung cấp dùng schema nghiêm ngặt có thể tuần tự hóa giá trị placeholder bằng 0 cho mỗi trường tùy chọn; chỉ giá trị trường có ý nghĩa thực mới có thể biểu thị một thao tác khác xung đột với thao tác đã chỉ định.

## Hệ quả

- Model có được một API vòng đời ổn định, gọn nhẹ, không cần truy cập trực tiếp goal service.
- Lời gọi thay đổi trạng thái yêu cầu agent gốc runtime thời gian thực, message do người dùng gửi trực tiếp trong lượt hiện tại, và tham chiếu compare-and-swap bền vững.
- Người dùng có thể tạo và kích hoạt lại mục tiêu qua request ngôn ngữ tự nhiên thông thường, trong khi phiên sau khi khôi phục giữ nguyên trạng thái tĩnh cho đến khi nhận input như vậy.
- Goal Round có thể hoàn thành hoặc báo cáo bị chặn lặp lại, nhưng không thể tự mở rộng quyền hạn của nhiệm vụ.
- Chính sách triển khai chọn ngưỡng dưới cho bị chặn; cùng một giá trị đã giải quyết vừa kiểm soát thực thi vừa kiểm soát hướng dẫn prompt.
- Hệ thống tương thích với giá trị placeholder do bên cung cấp dùng schema nghiêm ngặt điền vào, đồng thời không cho phép cập nhật xuyên thao tác có ý nghĩa thực.

## Giới hạn đã biết và các việc tạm hoãn

- Việc phân loại mục tiêu có quan trọng hay không, có nên yêu cầu tiếp tục hay không, mục tiêu đã hoàn thành hay chưa, và điều kiện bị chặn có giống nhau hay không, vẫn do model phân loại về mặt ngữ nghĩa. Bộ đánh giá độc lập hoặc chứng chỉ hoàn thành được hoãn lại.
- Các tool này thay đổi trạng thái mục tiêu, nhưng không lập lịch Goal Round, không phân loại việc dừng do bất thường driver, cũng không hủy lượt đang hoạt động; các hành vi này do driver cùng phiên đảm nhiệm.
- Đường quyền Goal Round ở trạng thái ngủ (dormant) trừ khi driver tiếp tục thực thi được gắn riêng đã chấp nhận một lượt người dùng có nguồn là mục tiêu; bản thân bộ tool này không tạo ra quyền đó.
- Việc phát hiện và render lệnh slash hướng tới người dùng do plugin [`dsh-command-goal`](../../../../packages/goal/command-goal/README.md) độc lập đảm nhiệm.
- Nếu triển khai không đặt cùng phạm vi (scope) cho cả hai mục đăng ký, một phạm vi có thể ẩn đăng ký tool, nhưng vẫn giữ đoạn prompt đăng ký độc lập.
