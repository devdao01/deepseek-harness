# Agent Note: nhận (claim) input inbox trước một quyết định pre-step duy nhất

Status: implemented

[English](2026-07-31-claimed-pre-step-inbox-lifecycle.md) | 中文

## Vấn đề

Trước đây, loop tách một ranh giới step thành chuẩn bị prompt, cho phép prompt (admit) và các hook step tuần tự. Kết quả admit có thể giữ lại hoặc bỏ input đã claim, còn sự kiện hàng đợi thời gian thực lại mang cấu trúc dữ liệu trùng lặp với trạng thái inbox bền vững. Plugin buộc phải chọn giữa việc sửa inbox, viết lại batch đã commit, hoặc append thẳng vào lịch sử phiên, còn bên quan sát không thể dựa vào một thứ tự rõ ràng nào.

Lớp bọc inbox chỉ dùng cho một lần xuất hiện cũng trùng lặp định danh mà mỗi `UserMessage` vốn đã có. Nó gộp chèn, sửa, claim, hủy, ánh xạ khi kết nối lại và việc vào step thành một giao thức, trong khi phiên chỉ-append vốn đã có sẵn ánh xạ hàng đợi bền vững.

## Quyết định

Trước mỗi step được đề xuất, `Inbox.claim(target)` sẽ xóa nguyên tử toàn bộ batch: mọi message `next-step`, cộng với một message `next-turn` tại ranh giới turn. Ở ranh giới đầu tiên, loop sẽ commit `turn/start` trước, để việc claim và quyết định `agent/pre-step` duy nhất của nó có quyền sở hữu turn bền vững. Việc claim ghi lại một `agent/inbox/spliced` thuần túy dạng xóa, đã chuẩn hóa, không mang outcome. Sau đó, loop phát ra một `agent/inbox/claimed { message, turn }` cho mỗi message đã claim, và chờ waterfall (sự kiện dạng thác nước) với đúng batch độc quyền đó cùng `{ turn, step, signal }`.

`PreStepDecision` là `{ kind: 'reject' } | { kind: 'enter'; messages: UserMessage[] }`. Reject sẽ không mở step, giữ nguyên batch đã claim ở trạng thái đã xóa, và đóng turn thành blocked, không sinh ra bất kỳ sự kiện step nào. Enter rỗng, hủy, và thất bại trước `step/start` cũng đóng lại một turn không có step, cân bằng ở ranh giới. Enter cung cấp batch đầy đủ được append dưới dạng `user/message` sau `step/start`. Listener bọc `next()` sẽ giữ lại thay đổi từ tầng dưới trừ khi cố ý thay thế, nên mọi việc viết lại message chỉ kết toán một lần vào giá trị trả về cuối cùng. Hệ thống không còn các điểm mở rộng `agent/prompt-prepare`, `agent/prompt-submit` hay `agent/step`.

Inbox bền vững vẫn là hai danh sách `UserMessage[]` được định địa chỉ qua `MessageId`. `append`, `prepend` và `splice` nhận target; `replace(messageId, newMessage)` và `remove(messageId)` định vị message đang chờ xử lý qua `MessageId` trên cả hai danh sách trước khi commit một splice đã chuẩn hóa. Replace có thể đổi định danh, và sẽ công bố message cũ dạng discarded trước, rồi message mới dạng inserted. Mỗi lần chèn phát ra `agent/inbox/inserted { message }`; việc xóa thông thường ghi `outcome: 'canceled'` và phát ra `agent/inbox/discarded { message }`. Claim là thao tác nội bộ tại ranh giới step của loop trên inbox, ghi lại một lần xóa thuần túy không kèm thông báo hay outcome, nên loop có thể tự phát sự kiện claimed. Các sự kiện thời gian thực này không thêm trường placement, outcome hay batch.

Hai loại sự kiện phục vụ hai bên tiêu thụ khác nhau. Bên quan sát theo dõi từng message riêng lẻ dùng `agent/inbox/inserted`, `claimed` và `discarded`. Bên tiêu thụ toàn bộ hàng đợi — bao gồm ánh xạ hàng đợi trên Web và baseline khi kết nối lại — dùng luồng bền vững `agent/inbox/spliced`; việc sửa và xóa từ UI đi qua `Inbox.splice()` hoặc các phương thức thay đổi Inbox khác, nhờ đó cùng một ánh xạ ghi nhận mọi thay đổi.

Plugin nào cần viết lại nguyên tử cho step hiện tại thì trả về message từ `agent/pre-step`. Plugin chỉ cần ngữ cảnh về sau có thể sửa trực tiếp `agent.inbox`. Workspace context dùng cả hai đường: ánh xạ hệ thống file bất đồng bộ sẽ tạm giữ một message `next-step` có thể thay thế, còn pre-step của lần vào step tiếp theo sẽ gộp message đó hoặc baseline mới tổ hợp vào batch cuối cùng, đồng thời xóa bản sao vẫn đang chờ xử lý. Reject sẽ giữ mục đó tiếp tục nằm trong hàng đợi.

[Quyết định về các mục hàng đợi định địa chỉ được](../../archived/feature/2026-07-29-addressable-queue-operations.md) đã được lưu trữ, mô tả thiết kế lớp bọc chỉ-một-lần-xuất-hiện đã bị thay thế. Nay `MessageId` đảm nhiệm việc định địa chỉ, còn bản sao hàng đợi Host được giữ lại thì được dẫn xuất từ ánh xạ splice bền vững.

## Phương án khác đã cân nhắc

**Giữ hai hook prepare và admit tách biệt.** Cách này cho phép giai đoạn prepare sửa inbox trước khi claim, và giai đoạn admit viết lại sau khi claim, nhưng cùng một ranh giới sẽ có hai bề mặt thứ tự, còn việc quy trách nhiệm hủy cũng trở nên mơ hồ.

**Đưa batch đã claim trở lại hàng đợi khi reject.** Điều này trông như giữ được hành vi retry, nhưng lại khiến việc từ chối âm thầm sửa hàng đợi; nếu không rào chắn từng race condition, nó còn nhân đôi công việc về sau, và khiến claim không thể là một lần chuyển quyền sở hữu nguyên tử.

**Mang theo placement và outcome trên mỗi sự kiện thời gian thực.** Splice bền vững đã sẵn có các sự kiện này. Thông báo thời gian thực lặp lại chúng sẽ tạo ra một quy ước thứ hai có thể lệch pha, trong khi bên tiêu thụ đang giữ đúng định danh message không cần các trường đó.

## Kiểm chứng

Agent loop (vòng lặp tác tử) đã cố định thứ tự `turn/start` trước, claim sau, rồi mới đến pre-step; payload chính xác của sự kiện thời gian thực; reject không step nhưng ranh giới vẫn cân bằng; việc viết lại batch cuối cùng; input được chèn sau khi claim; listener thất bại và hủy. Test Inbox và bên tiêu thụ cố định việc xóa thuần túy khi claim, kết quả canceled khi xóa thông thường, việc tạm giữ agent-instructions, thay thế và vào cùng step, hành vi plan/goal/hook, dọn dẹp UI, compaction (nén), checkpoint, và ánh xạ bền vững sau khi khôi phục. Danh mục sự kiện và kiểu sinh ra chỉ công bố waterfall và payload mới.

## Hệ quả

Loop chỉ còn một quyết định cần chờ trước mỗi step, và chỉ một lần chuyển quyền sở hữu cho input. Message đã claim sẽ không âm thầm quay lại inbox; các lần chèn sau đó vẫn độc lập. Sự kiện thời gian thực đối xứng với các thông báo inbox khác, nhưng không phản chiếu metadata bền vững; plugin có thể chọn tường minh giữa việc viết lại chính xác cho step hiện tại, hoặc gửi vào inbox thông thường cho sau này.
