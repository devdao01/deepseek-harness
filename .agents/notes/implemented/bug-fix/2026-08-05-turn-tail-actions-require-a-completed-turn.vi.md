# Agent Note: IconActions ở đuôi lượt đòi hỏi lượt đã hoàn tất

Status: implemented

[English](2026-08-05-turn-tail-actions-require-a-completed-turn.md) | Tiếng Việt

## Vấn đề

Trước đây IconActions của assistant chỉ được suy ra từ transcript (bản ghi văn bản) đã chốt: trong mỗi lượt, message assistant cuối cùng có nội dung văn bản sẽ sở hữu hàng nút đó. Đại lượng này chỉ ổn định sau khi lượt đã đóng. Khi lượt vẫn còn đang sinh ra các bước, đoạn tường thuật mà model viết ra trước lời gọi tool chính là assistant có nội dung cuối cùng của lượt tại thời điểm ấy, nên nó chiếm hàng nút trong lúc tool đang chạy, rồi lại nhường đi khi văn bản của bước tiếp theo đáp xuống. Người đọc sẽ thấy nút sao chép, rẽ nhánh và đồng hồ hiện ra bên dưới một câu tường thuật giữa chừng, đẩy luồng nội dung xuống 28px, rồi biến mất. Bản thân hàng nút ở trạng thái này cũng khiếm khuyết: điều khiển rẽ nhánh đã bị `turnEnds` xác định là vô hiệu, nhãn `Ran for` đã bị `turnTimings` xác định là không hiển thị, chỉ còn mỗi nút sao chép dùng được.

[Quyết định về chrome của message đã lưu trữ](../../archived/feature/2026-07-29-web-message-icon-actions-and-clock.md) luôn khẳng định rằng tường thuật giữa lượt không kèm chrome, nhưng quá trình suy diễn chưa bao giờ có được tín hiệu hoàn tất để câu khẳng định đó thành lập.

## Quyết định

`assistantActionsSeqs` nhận `ConversationSnapshot.turnEnds`, và chỉ trao hàng nút khi trong cửa sổ event có `turn/end` của lượt đó. Cách quy thuộc bên trong một lượt đã hoàn tất giữ nguyên, vẫn là message assistant có nội dung văn bản cuối cùng của lượt. Lượt còn đang sinh ra các bước thì không được trao chỗ nào, nên phần tường thuật của nó không gắn hàng nút; khi lượt đóng, chỗ ngồi đó xuất hiện một lần dưới câu trả lời đã chốt.

Đây chính là sự kiện hoàn tất mà điều khiển rẽ nhánh và nhãn thời lượng chạy đang dùng, nên ba phần trên cùng một hàng giờ đã thống nhất tiêu chí. Việc một lượt đã hoàn tất hay chưa được đọc từ event bền vững `turn/end`, chứ không suy ra từ `running`, từ partial của luồng stream hay từ lời gọi tool đang dở, nhất quán với [quyết định về đuôi lượt đã hoàn tất](2026-08-02-message-fork-actions-require-completed-turn-tail.md). Mọi loại lý do kết thúc đều đóng lượt, nên phần đuôi bị đóng băng của lượt đã hủy vẫn giữ thanh thao tác của nó, còn lượt để mở do sự cố sẽ được bản vá log bổ sung `turn/end` khi nạp.

`hasContentText` được chuyển vào `chat-flow.ts` và được `AssistantMarkdown` import, khiến cổng quy thuộc và cổng gắn kết không thể trôi lệch riêng rẽ.

## Các phương án đã cân nhắc

**Dùng `running` cộng với partial của luồng stream hoặc lời gọi tool dở dang đầu tiên để chỉ ra lượt đang mở, rồi giữ lại hàng nút.** Cách này từng tồn tại ngắn ngủi trong thay đổi ban đầu, sau đó bị xóa. Nó suy diễn trạng thái hoàn tất thay vì đọc trạng thái hoàn tất, lại còn cần một ngoại lệ để tránh việc lượt đã được tiếp nhận nhưng chưa sinh ra bước đầu tiên lại cướp mất chỗ của câu trả lời trước; đó đúng là kiểu suy diễn mà quyết định về đuôi lượt đã hoàn tất đã bác bỏ cho điều khiển rẽ nhánh. `turnEnds` trả lời cùng câu hỏi đó theo từng lượt, không cần suy diễn và cũng không cần ngoại lệ.

**Giữ hàng nút trong lúc lượt đang chạy, chỉ đặt các điều khiển sang trạng thái không dùng được.** Không chọn: tường thuật giữa lượt không phải là một câu trả lời bị hạ cấp, nó vốn không phải câu trả lời. Nút sao chép vẫn sẽ chép ra một đoạn văn bản trung gian, và hàng nút vẫn phải dời xuống phần đuôi thật khi lượt kết thúc.

**Cho mọi node nội dung đã chốt giữ hàng nút lâu dài.** Bác bỏ lại ở đây với đúng lý do như trong quyết định ban đầu: lặp lại sao chép, rẽ nhánh và đồng hồ dưới từng bước sẽ khiến luồng nội dung trông rối rắm. Nó cũng không giải quyết được vấn đề được báo cáo lần này, vì điều khiển rẽ nhánh chỉ có ý nghĩa khi nằm ở phần đuôi.

## Hệ quả

Lượt đang chạy không còn thanh thao tác message nào bên dưới bong bóng người dùng đã kích hoạt nó, còn mọi lượt đã hoàn tất trước đó vẫn giữ chỗ riêng; chỗ ngồi xuất hiện một lần khi `turn/end` tới, lúc đó bên dưới câu trả lời đã chốt sẽ có thêm một hàng 28px. Lượt có `turn/end` rơi ra ngoài cửa sổ nạp thì không được trao chỗ, và việc lật trang không gây ra tình huống này, vì event kết thúc của một lượt xếp sau chính các node của nó. `apps/web/tests/turn-tail-actions.e2e.ts` chốt cả hai trạng thái qua ứng dụng đã lắp ráp: sidecar `hang` tác động lên lời gọi model thứ hai, treo lại một lượt mà bước đầu tường thuật trước rồi mới gọi bash, hai bản output kỳ vọng lần lượt ghi lại luồng nội dung lúc đang treo và luồng nội dung sau khi dừng. Test ở cấp package phủ trực tiếp phép suy diễn đó cùng kết quả render của lượt đang chạy.
