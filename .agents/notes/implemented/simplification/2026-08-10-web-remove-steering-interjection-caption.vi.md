# Agent Note: Loại bỏ nhãn "chen ngang" của steering (dẫn hướng giữa chừng)

Status: implemented

[English](2026-08-10-web-remove-steering-interjection-caption.md) | Tiếng Việt

## Vấn đề

[Quyết định về nguồn ngữ cảnh và nhãn steer](../feature/2026-08-04-web-context-source-and-steer-marks.md) đã thêm nhãn `Chen ngang` / `Interjection` cho mỗi bong bóng steering bền vững lẫn đang chờ, để transcript (bản ghi văn bản) có thể chỉ ra bong bóng căn phải nào đã ngắt một lượt đang chạy. Nhãn này lặp lại một sự thật mà luồng thông điệp đã thể hiện sẵn: bong bóng steering nằm giữa lượt, kẹp giữa nội dung assistant mà nó ngắt, còn prompt mở lượt thì nằm ở ranh giới lượt. Việc luôn hiển thị một dòng chữ cấp ba phía trên mỗi bong bóng steer không mang lại thêm thông tin nào cho người đọc vốn đã thấy được vị trí, và đây là bong bóng kiểu-user duy nhất có trang trí, phá vỡ nhịp căn phải vốn thống nhất.

## Quyết định

steering giờ được render hoàn toàn như bong bóng user. `UserStyleBubble` không còn cờ steering, khóa locale `message.steering` và style `.steeringMark` đã bị xóa, `PendingSteeringBubble` và `UserMessageNodeView` chỉ truyền nội dung và thao tác. Một steer giữa lượt chỉ có thể được nhận biết qua vị trí của nó trong luồng thông điệp của lượt đang chạy, ngoài ra không có bất kỳ dấu hiệu nhận diện nào khác.

Sự phân biệt ở tầng runtime vẫn giữ nguyên. Việc projection `SteeringMessageNode` từ lịch sử `agent/inbox/spliced` bền vững, thuộc tính `data-pending-steering`, và việc bàn giao từ trạng thái đang chờ sang trạng thái bền vững đều được giữ lại: vòng đời "đang chờ" cần định danh node bất kể cách hiển thị ra sao, và test vẫn dùng thuộc tính đó để định vị bong bóng đang chờ.

Quyết định này thay thế một phần điều khoản về steering trong [quyết định về nguồn ngữ cảnh và nhãn steer](../feature/2026-08-04-web-context-source-and-steer-marks.md); phần đặt tên nguồn ngữ cảnh và recall của quyết định đó vẫn còn hiệu lực. Nhãn này trước đây đã từng bị đảo chiều một lần: [quyết định đã lưu trữ về việc hủy trang trí steer](../../archived/simplification/2026-07-31-web-ui-no-steer-entry-or-interjection-chrome.md) loại bỏ nó khi composer chưa thể steer, rồi quyết định ngày 2026-08-04 thêm nó trở lại sau khi composer có được cử chỉ Steer. Lần loại bỏ này không xét lại bản thân cử chỉ đó — điểm vào steering, thao tác gửi chen ngang của Queue dock, vòng đời đang chờ đều thuộc quyền của chủ sở hữu riêng — mà chỉ khẳng định rằng transcript không cần đặt tên cho kết quả của nó.

## Các phương án thay thế đã cân nhắc

**Giữ nhãn.** Đây là hiện trạng, chi phí duy trì thấp, nhưng nó trang trí vĩnh viễn mỗi bong bóng steer, chỉ để mã hóa một sự thật mà vị trí của bong bóng đã thể hiện sẵn. Trang trí không mang lại thông tin mà người đọc còn thiếu nên bị xóa, chứ không nên tiếp tục duy trì.

**Xóa luôn cả sự phân biệt `SteeringMessageNode`.** Loại node này bắt nguồn từ lịch sử inbox bền vững, điều khiển việc bàn giao từ đang chờ sang bền vững; đó là sự thật khi replay, không phải cách hiển thị. Gộp nó vào `UserMessageNode` sẽ thay đổi hành vi projection mà không mang lại lợi ích UI nào.

**Đổi sang trang trí kín đáo hơn (màu nền, thụt lề, nhãn khi hover).** Bất kỳ trang trí thay thế nào cũng sẽ đặt lại cùng một câu hỏi bằng cách diễn đạt yếu hơn. Sự phân biệt mà transcript cần là về mặt vị trí, và đã hiển thị sẵn; đổi sang trang trí kín đáo hơn vẫn giữ chi phí nhưng đánh mất ưu điểm duy nhất của nhãn chữ, đó là sự rõ ràng.

## Kiểm thử

- Bộ bao phủ jsdom của `packages/client/ui-conversation` cố định hành vi bong bóng thuần túy: test bàn giao đang chờ dùng `data-pending-steering` để định vị bong bóng đang chờ, khẳng định việc bàn giao một bong bóng duy nhất mà không có bất kỳ nhãn nào; nhánh steering của MessageItem khẳng định trên bong bóng không nhãn rằng có thể copy và không có thao tác branch.
- Golden Web đã bundle không cần key (`steering/mid-steer`, `steering/settled`, `plan-review/approved`) được replay với fixture session không đổi, không chứa văn bản nhãn.

## Hệ quả

- Transcript được replay không còn đặt tên cho steering: người đọc suy ra đây là một lần chen ngang giữa chừng dựa trên vị trí của thông điệp trong lượt. Với người đọc lướt nhanh qua ranh giới lượt, suy luận này yếu hơn một nhãn tường minh; quyết định này chấp nhận cái giá đó.
- Bong bóng steer đang chờ, trước khi được chấp nhận, giờ hoàn toàn giống về mặt hình ảnh với bong bóng đã gửi thông thường, chỉ thiếu timestamp.
- Việc tái giới thiệu bất kỳ hình thức trang trí steering nào cũng đòi hỏi một quyết định sản phẩm mới thay thế ghi chú này.
