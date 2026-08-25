# Agent Note: Thu gọn sự kiện agent loop quanh một state machine có thể quan sát

Status: implemented

[English](2026-07-24-agent-loop-observable-state-machine.md) | Tiếng Việt

## Vấn đề

agent loop (vòng lặp tác tử) trước đây phơi bày luồng điều khiển của nó dưới dạng một số lượng lớn sự kiện Cordis. Hai checkpoint độc lập `pre-step` và `post-step` nằm ở trước và sau mỗi bước; `session-prefix` và `step-result` lần lượt biến đổi thông điệp request và response; `request-error` quyết định liệu một request thất bại có được thử lại trong cùng lượt (turn) hiện tại hay không; còn `turn-continuation` và `turn-stop` kết hợp các quyết định tiếp tục thực thi cạnh tranh lẫn nhau.

Ngay cả khi session log bền vững đã ghi lại đầy đủ các sự kiện lượt và bước tương ứng, các sự kiện này vẫn công khai các giai đoạn nội bộ. Chúng còn trộn lẫn hai mô hình mở rộng: một số listener quan sát ranh giới và phát ra lệnh agent, số khác lại trả về quyết định điều khiển do loop diễn giải. Do đó, để hiểu được state machine công khai, người ta phải tái dựng cả thứ tự sự kiện, độ ưu tiên waterfall (sự kiện dạng thác nước), lẫn các quy tắc ghi đè khi kết thúc đặc biệt.

Vòng đời agent, trạng thái hoạt động tổng thể của agent, tiến độ của các mục trong inbox, và việc kết toán từng lượt, là các chiều trạng thái độc lập với nhau. Nếu coi chúng là một trạng thái duy nhất hoặc một chuỗi callback tuyến tính, các vấn đề thường gặp sẽ trở nên mơ hồ: agent có thể liên tục ở trạng thái `running` qua nhiều lượt; một mục đã được chấp nhận có thể bị loại bỏ mà không khởi động lượt nào; một lượt có thể kết toán xong trong khi công việc tiếp theo vẫn khiến agent duy trì trạng thái hoạt động.

## Quyết định

Quy ước công khai phơi bày bốn chiều trạng thái trực giao:

- Vòng đời đăng ký là khoảng thời gian từ `agent/created` đến `agent/disposed`. dispose (giải phóng tài nguyên) là ranh giới kết thúc của registry, không phải một `AgentStatus`.
- Trạng thái hoạt động tổng thể của agent là `AgentStatus = 'idle' | 'running'`. Nhiều lượt liên tiếp có thể dùng chung một khoảng `running`.
- Khi một thông điệp đang chờ được chèn vào, sự kiện `agent/inbox/inserted` sẽ phát ra, sau đó hoặc phát ra `agent/inbox/claimed` sau khi được nhận (claim) bằng thao tác xóa nguyên tử thuần túy, hoặc phát ra `agent/inbox/discarded` sau một thao tác xóa thông thường. `MessageId` liên kết đúng thông điệp; tọa độ splice bền vững lưu giữ thông tin vị trí và thông tin hủy. Các sự kiện inbox mô tả việc chèn, nhận và loại bỏ, không phải việc hoàn tất lượt.
- Lượt đã được nhận đi qua pre-step để vào giai đoạn quyết định và không hoặc nhiều bước request. Tự động thử lại sẽ đóng lượt thất bại và mở ngay một lượt khác; `agent/settled` chỉ báo cáo lượt cuối cùng (terminal turn) của chuỗi thử lại đó, và vẫn khác với việc agent chuyển toàn bộ sang `status === 'idle'`.

Loop giữ lại bốn sự kiện mở rộng state machine. `agent/pre-step` thực hiện quyết định reject hoặc enter cho một batch đã nhận độc quyền, và chạy trước mỗi bước được đề xuất. `agent/request` là một waterfall dùng để đóng băng cấu hình lời gọi; cấu hình chỉ có thể đến từ `await next()`, không còn được cung cấp qua các tham số vị trí lặp lại. `agent/request-error` tuần tự xác định ai chịu trách nhiệm cho việc chờ khôi phục một request model thất bại. Khi lượt vốn không còn công việc nào còn lại, `agent/turn-stopping` sẽ chạy; listener nào cần thêm một bước nữa sẽ dùng `agent.steer()` để ghi lại steering (dẫn hướng giữa chừng) thực sự, và loop sẽ quyết định dựa trên dữ liệu này sau khi mọi listener đã hoàn tất.

Việc có tiếp tục và kết thúc thực thi hay không được biểu diễn bằng dữ liệu, không còn bằng một enum điều khiển được trả về. Lệnh gọi công cụ (tool call) và steering đã được chấp nhận yêu cầu thực hiện thêm một bước. Kết quả công cụ mang `concludesTurn` sẽ kết thúc vòng lặp công cụ tại bước sở hữu nó. Loop không còn phơi bày `ContinuationDecision` chung hoặc kênh trả về kết thúc chung.

Request model thất bại sẽ đóng bước hiện tại trước, rồi mang theo chính lỗi đó, `LlmFailure` đã chuẩn hóa, và tín hiệu lượt vẫn còn hiệu lực để đi vào `agent/request-error`. Listener chịu trách nhiệm khôi phục sẽ sửa trạng thái, trả về `{ kind: 'retry' }`, và dừng việc ủy quyền tiếp tục. Loop sẽ đóng lượt thất bại, và mở một lượt thử lại dựa trên trạng thái đó, không phát thông báo idle ở giữa; thử lại không phải là một bước khác bên trong lượt thất bại. `agent/settled` báo cáo kết quả cuối cùng; đối với các bên tiêu thụ cần báo cáo lỗi riêng biệt, tách khỏi việc kết toán lượt, `agent/error` vẫn được giữ lại như một thông báo lỗi theo thời gian thực. [Quyết định retry action](2026-07-27-request-error-retry-action.md) đã thay thế phần dạng lệnh trong thiết kế này.

Hệ phân loại sự kiện đã loại bỏ các móc chuẩn bị/gửi prompt và móc bước tuần tự cũ, cùng với `agent/post-step`, `agent/session-prefix`, `agent/step-result`, `agent/turn-continuation` và `agent/turn-stop`. Waterfall `agent/pre-step` duy nhất chịu trách nhiệm quyết định thông điệp đã nhận có được vào bước hay không. Ranh giới lượt và bước bền vững vẫn được ghi lại bởi sự kiện session. Nội dung mới hướng tới model sử dụng kênh thông điệp có ghi log, cấu hình request dùng `agent/request`, nội dung response được ghi lại nguyên trạng sau khi lắp ráp, việc khôi phục request thất bại dùng `agent/request-error` trả về hành động, và việc có tiếp tục khi kết thúc lượt hay không được biểu diễn bằng `agent/turn-stopping` cộng với steering.

## Các phương án thay thế đã cân nhắc

**Giữ lại chuỗi sự kiện chi tiết.** Cách này giữ được điểm móc chuyên dụng cho từng giai đoạn nội bộ, bao gồm tiền tố chỉ dùng cho request, việc viết lại thông điệp assistant, xử lý sau bước, khôi phục request trong lượt, và ghi đè kết thúc. Nhưng nó cũng biến thứ tự thực thi riêng tư của loop thành một quy ước công khai vĩnh viễn, và cho phép các điểm mở rộng chồng lấn nhau biểu diễn các quyết định xung đột lẫn nhau. Quyết định hiện tại chấp nhận việc thiếu các điểm móc này, đổi lấy việc mỗi trách nhiệm mở rộng được hỗ trợ chỉ tương ứng với một ranh giới duy nhất.

**Biểu diễn dispose như trạng thái `AgentStatus` thứ ba.** Cách này cho các handle vẫn đang được giữ một giá trị trạng thái kết thúc, nhưng cũng lặp lại việc biểu diễn vòng đời registry mà `agent/disposed` đã thể hiện. Quyết định hiện tại để `AgentStatus` chỉ biểu diễn trạng thái hoạt động trong suốt vòng đời agent, và coi vòng đời đăng ký là một chiều độc lập.

**Để `agent/request-error` trả về quyết định thử lại.** Phương án này đã được thay thế bởi [quyết định retry action](2026-07-27-request-error-retry-action.md); quyết định mới loại bỏ lệnh trùng lặp và giới hạn quyết định vào kết quả trả về của waterfall.

**Ánh xạ ranh giới lượt và bước bền vững thành sự kiện agent.** Cách này sẽ cung cấp một luồng sự kiện thứ hai cho cùng một sự thật, dành cho các bên tiêu thụ theo thời gian thực. Quyết định hiện tại giữ session log làm nguồn sự thật, chỉ phơi bày các checkpoint mở rộng hoặc các sự thật theo thời gian thực thuần túy mà luồng sự kiện bền vững không thể mang theo.

## Ảnh hưởng

State machine có thể quan sát trở nên nhỏ hơn và dễ kết hợp hơn: vòng đời đăng ký, trạng thái hoạt động, tiến độ mục và việc kết toán cuối cùng có thể được theo dõi riêng biệt. Đặc biệt, `agent/settled` không có nghĩa là `agent.status === 'idle'`; sự kiện trước báo cáo lượt cuối cùng của một chuỗi drain, còn `agent/status` báo cáo toàn bộ agent có đang hoạt động hay không.

Plugin không còn khả năng viết lại từng giai đoạn của loop. Không còn tiền tố thông điệp chỉ dùng cho request, biến đổi thông điệp assistant, checkpoint sau bước, enum tiếp tục thực thi chung, kết quả kết thúc chung, hay thử lại request trong lượt. Phần mở rộng chuyển sang dùng các kênh còn lại có trách nhiệm rõ ràng, thay vì dựng lại các giai đoạn này.

Plugin chịu trách nhiệm tiếp tục thực thi sẽ phát ra steering có thể được persist, thay vì trả về lý do không được ghi vào log. Plugin khôi phục xử lý lỗi sau khi bước thất bại kết thúc và trả về hành động thử lại rõ ràng. Nhờ đó, mỗi lượt thử sẽ trở thành một lượt hoàn chỉnh, đồng thời việc sửa chữa bất đồng bộ và trách nhiệm chính sách được tập trung vào một ranh giới waterfall hẹp.

Vòng đời inbox dùng để bổ sung cho session log bền vững, không thay thế nó. `MessageId` liên kết thao tác chấp nhận với thao tác nhận hoặc loại bỏ; số lượt, số bước, thông điệp, hoạt động công cụ và lý do kết thúc vẫn thuộc về sự thật của session.

## Liên quan

- [Hợp nhất tuyến gửi agent và gộp ngữ cảnh chèn vào user/message](../architecture/2026-07-22-unified-send-and-coalesced-user-messages.md)
- [Loại bỏ batching ngầm định trong gửi thông thường](2026-07-17-one-send-one-turn.md)
- [Hệ phân loại sự kiện microkernel](../architecture/2026-06-11-microkernel-event-taxonomy.md)
- [Khôi phục request LLM (mô hình ngôn ngữ lớn) có giới hạn](../architecture/2026-06-21-bounded-llm-request-recovery.md)
- [Request có thể tái dựng](../architecture/2026-07-05-reconstructable-requests.md)
