# Agent Note: Xóa bỏ việc gộp lô ngầm cho send thông thường

Status: implemented

[English](2026-07-17-one-send-one-turn.md) | Tiếng Việt

## Vấn đề

Giả sử bên gọi gọi `Agent.send()` hai lần liên tiếp, gửi trước thông điệp A, rồi tới thông điệp B. Việc gộp lô ngầm có thể xếp A và B vào cùng một lượt chỉ vì cả hai thông điệp đều đang chờ tại thời điểm bộ điều phối đọc hàng đợi. Bên gọi rõ ràng đã gọi hai lần, nhưng agent loop (vòng lặp tác tử) lại lặng lẽ biến chúng thành một đơn vị công việc.

Cách nhóm này phụ thuộc vào thời điểm chạy, chứ không phải ý định của bên gọi. Vì vậy, dù mọi bên gọi đều dùng cùng một API, các lời gọi đến từ cùng một call stack đồng bộ, từ các microtask liền kề, từ listener sự kiện và từ callback của mô hình vẫn có thể cho ra cách nhóm khác nhau.

Cách nhóm này không chỉ thay đổi số lần gọi mô hình. Một lượt thông thường bao gồm một follow-up đã được nhận lãnh, `turn/start`, `turn/end` và một checkpoint bền vững. Nếu thông điệp B dùng chung lượt với thông điệp A, B có thể đi thẳng vào request mô hình của A, thay vì trước tiên thấy kết quả đã đóng của A trong log phiên. Nếu hệ thống cho một follow-up vào mà từ chối cái còn lại, còn phải đưa vào một trạng thái hỗn hợp mà bên gọi không hề yêu cầu.

## Quyết định

Một lần `send()` thành công tạo ra một mục hàng đợi FIFO độc lập. Nếu mục hàng đợi đó chạy, nó là thông điệp thông thường duy nhất trong lượt chứa nó. Mục hàng đợi có thể bị loại bỏ trước khi khởi động, nên đảm bảo chính xác là *tối đa* một lượt, chứ không phải chắc chắn một lượt; hai lần send không bao giờ bị âm thầm hợp nhất.

Trước khi chèn thông điệp, `send()` kiểm tra trạng thái agent và nhận vào giá trị đã có định danh và đã được đóng băng sâu. Việc splice bền vững và `agent/inbox/inserted { message }` giữ lại `MessageId` của nó; trước khi bộ điều phối nhận lãnh hoặc loại bỏ thông điệp, có thể định địa chỉ nó qua `Inbox.replace()` và `Inbox.remove()`. Vòng đời hiện hành được quy định bởi [quyết định về inbox pre-step đã nhận lãnh](../architecture/2026-07-31-claimed-pre-step-inbox-lifecycle.md).

Nếu cả thông điệp A và B đều được xử lý, lượt của B chỉ có thể bắt đầu sau khi A đã ghi `turn/end` và checkpoint bền vững của A xử lý xong. Nhờ đó, request của B thấy được kết quả đã đóng mà A để lại trong cùng log phiên. Lỗi checkpoint vẫn được báo cáo như thường lệ, nhưng việc xử lý xong chỉ có nghĩa là gỡ bỏ rào cản thứ tự này, chứ không có nghĩa là phần ghi thất bại đã được lưu bền vững. Việc `cancel()` ở phạm vi toàn bộ agent, dispose (giải phóng tài nguyên) hoặc thất bại trước `turn/start` cũng có thể loại bỏ mục hàng đợi chưa khởi động mà không mở ra một lượt rỗng.

Tại ranh giới lượt, vòng lặp mở lượt trước, rồi nhận lãnh một follow-up sau các đầu vào next-step đang chờ. `agent/pre-step` hoặc là từ chối đề xuất, hoặc là trả về trọn lô đi vào bước. Follow-up bị từ chối vẫn ở trạng thái đã xóa và đóng lại một lượt bị chặn không có bước nào, không ghi vào lịch sử mà mô hình nhìn thấy. Trong bản cài đặt không tồn tại nhánh follow-up thông thường hỗn hợp.

Quy tắc không gộp lô nói trên chỉ áp dụng cho đầu vào follow-up thông thường. `steer()` đặt đầu vào vào inbox next-step và đánh thức bộ điều phối. Trong một lượt, vòng lặp có thể nhận lãnh nó tại ranh giới bước tiếp theo; khi agent rảnh, lô next-step có khả năng đánh thức này sẽ khởi động một lượt mới. Đầu vào đến sau khi lô đã được nhận lãnh sẽ chờ ranh giới sau đó, còn hủy hoặc dispose có thể loại bỏ nó.

`inject()` tiếp tục thêm ngữ cảnh hướng mô hình, nhưng không gửi đầu vào thông thường và cũng không đánh thức bộ điều phối. Ngay cả khi agent rảnh, nó vẫn luôn chờ trong inbox next-step cho tới pre-step kế tiếp; AgentLoop chỉ ghi nó thành `user/message` khi quyết định enter trả về nó bên trong một lượt. `cancel()` vẫn là thao tác ở phạm vi toàn bộ agent, có thể dọn sạch mọi đầu vào thông thường chưa khởi động, steering (điều hướng giữa chừng) và nội dung inject, đồng thời hủy bước hiện tại. `status` và `whenIdle()` cũng mô tả toàn bộ agent, chứ không phải một thông điệp cụ thể.

## Các phương án đã cân nhắc

**Giữ việc gộp lô tự động cho send thông thường để giảm số lần gọi mô hình.** Khi thông điệp vào hàng đợi nhanh hơn tốc độ xử lý của bộ điều phối, cách làm này có thể tăng thông lượng, nhưng nó khiến ranh giới lượt phụ thuộc vào lịch điều phối và cho phép thông điệp sau chạy trước khi lượt trước đóng lại và tới checkpoint. Quyết định này giữ ranh giới có thể dự đoán được và chấp nhận thêm lời gọi. Nếu tương lai muốn thêm tính năng gộp lô, phải cung cấp một giao ước tường minh mà bên gọi nhìn thấy được, và phải có kết quả đo lường làm căn cứ.

## Kiểm chứng

- Unit test và test dựa trên thuộc tính gửi send từ cùng một call stack, từ các microtask liền kề, từ các bên tạo ra khác nhau và từ callback tái nhập; mỗi thông điệp đều nhận được một lượt riêng theo thứ tự FIFO.
- Test trên sản phẩm build của stdio gửi hai dòng đầu vào và quan sát thấy hai request mô hình cùng hai ranh giới lượt.
- Việc trì hoãn hay từ chối checkpoint của lượt đầu tiên đều khiến lượt tiếp theo tiếp tục chờ, và chứng minh rằng request của nó sẽ thấy kết quả trợ lý trước đó.
- Test đường dẫn thất bại bao phủ việc pre-step từ chối, listener thất bại, hủy ở phạm vi toàn bộ agent, dispose và thất bại trước `turn/start`; mọi lối thoát ở pre-step đầu tiên đều đóng lại một lượt không có bước với ranh giới cân bằng, thông điệp không bị hợp nhất, và phần việc vẫn còn phải xử lý sau đó vẫn tiếp tục được dọn hết.
- Các test khác lần lượt bao phủ `steer()` khi lượt đang mở, sau khi lượt thất bại và khi đang rảnh, cũng như `inject()` đang chờ, trạng thái ở phạm vi toàn bộ agent và `whenIdle()`.

## Hệ quả

Ranh giới của lượt thông thường có thể dự đoán được: thông điệp A và B luôn tách rời, và B chỉ chạy sau khi A đã đóng và tới checkpoint. Bên gọi vẫn không nhận được handle hoàn tất cho từng lần send; thông điệp đang chờ có thể được gỡ qua `MessageId` của nó, việc hủy ở phạm vi toàn bộ agent có thể loại bỏ toàn bộ phần đuôi hàng đợi chưa khởi động, còn trạng thái và việc dừng hẳn vẫn là quan sát ở phạm vi toàn bộ agent.

Cái giá là số request mô hình và số checkpoint đều tăng lên. Hàng đợi bận có thể mất nhiều thời gian hơn để dọn hết; nếu bên tạo ra liên tục gửi thông điệp, hàng đợi cũng có thể phình to. Chỉ khi thiết lập được một giao ước tường minh và đã qua đo lường thì mới được đưa lại việc gộp lô cho send thông thường.
