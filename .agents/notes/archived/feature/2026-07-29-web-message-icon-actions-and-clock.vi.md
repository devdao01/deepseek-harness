# Agent Note: IconActions và đồng hồ cho tin nhắn Web

Status: implemented

Archived: 2026-08-07

[English](2026-07-29-web-message-icon-actions-and-clock.md) | 中文

## Vấn đề

Bong bóng người dùng của Web chat đã có IconActions sao chép, phân nhánh (branch), sửa, nhưng chưa có đồng hồ. Phía dưới lời tường thuật (narrative) assistant đã hoàn tất hoàn toàn không có thanh thao tác, dù bản thiết kế harness đã chốt thể hiện sao chép, phân nhánh, đồng hồ sau khi câu trả lời kết thúc. Câu trả lời đang stream không được phép chớp thanh thao tác này trong lúc output từng token. Các dòng đã được tối ưu bằng memo vẫn phải giữ props ổn định khi vượt qua nửa đêm, do đó một lần `Date.now()` duy nhất sẽ khiến tin nhắn của ngày hôm qua mãi kẹt ở `HH:mm`.

## Quyết định

**Bong bóng người dùng thêm đồng hồ địa phương biết ngày (date-aware) vào đầu dòng IconActions hiện có; assistant cuối cùng có nội dung text trong mỗi lượt thêm sao chép, phân nhánh, đồng hồ dưới phần thân với `margin-top: 16px`; cả hai bên chỉ cần đã mount là luôn hiển thị, và được định dạng lại vào lúc nửa đêm địa phương tiếp theo.**

Chỗ ngồi (seat) phía assistant được [quyết định về lượt đã hoàn thành](../bug-fix/2026-08-05-turn-tail-actions-require-a-completed-turn.md) siết chặt lại: chỉ lượt đã có `turn/end` mới được cấp dòng này, lượt vẫn đang sinh bước không giao dòng này cho bất kỳ node nào. Điều khiển phân nhánh phía người dùng bị [quyết định loại bỏ nhánh khỏi bong bóng người dùng](../simplification/2026-08-06-user-bubbles-drop-the-branch-action.md) loại bỏ trực tiếp; IconActions của dòng người dùng chỉ còn đồng hồ và sao chép.

Cả hai bên đều định dạng `node.time` thông qua `formatMessageClock`: cùng ngày lịch → `HH:mm`, cùng năm nhưng sớm hơn → `M月D日 HH:mm`, khác năm → `YYYY年M月D日 HH:mm`. `useCalendarDay` là một đồng hồ ngày cục bộ trong component (đặt hẹn giờ đến nửa đêm địa phương tiếp theo), do đó dòng đã memo sẽ render lại khi ngày lịch thay đổi, và không thêm hook framework mới. `MessageItem` đặt nhãn trước phần sao chép (figma `388:20051`). `ChatView` suy ra seq của phần đuôi lượt thông qua `assistantActionsSeqs` và không truyền `time` cho nội dung ở giữa lượt; `AssistantMarkdown` đặt dòng này sau phân nhánh (figma `43:32997`), và chỉ render khi `streaming` là false, đã biết thời điểm sự kiện, và node chứa nội dung text không rỗng. Node chỉ có Think, lời tường thuật giữa lượt và phần đuôi đang stream đều bỏ qua dòng này. Sao chép ghi vào các khối text đã được ghép nối. Cả hai dạng dòng tin nhắn đều truyền `seq` sự kiện của riêng mình cho cùng một callback fork; hợp đồng mutation thật được định nghĩa bởi [thao tác fork session Web](2026-07-27-web-session-fork-actions.md). Hàm ghi clipboard và hàm hỗ trợ đồng hồ được đặt trong `message-chrome.ts`. Giao diện đã lắp ráp được cố định bởi `apps/web/tests/message-actions.e2e.ts` (lịch sử seed nguội + aria golden); việc chuẩn hóa aria gộp mỗi dạng đồng hồ thành `{{clock}}`.

## Các phương án đã cân nhắc

**Hiển thị IconActions của assistant trong lúc đang stream.** Từ chối: yêu cầu là dòng này chỉ hiển thị sau khi output hoàn tất; chrome ở giữa chừng sẽ nhấp nháy, và dụ người dùng sao chép câu trả lời còn dang dở.

**Gắn IconActions cho mọi node assistant đã hoàn tất (kể cả chỉ có Think).** Từ chối: khi không có nội dung text thì sao chép không có gì để ghi, và lặp lại chrome dưới mỗi bước／Think sẽ làm rối luồng đọc; chỉ nội dung output mới sở hữu chỗ ngồi này.

**Gắn IconActions cho mọi assistant có nội dung text trong lượt nhiều bước.** Từ chối: lời tường thuật giữa lượt (text trước khi gọi tool) không phải là câu trả lời đã hoàn tất; lặp lại sao chép, phân nhánh, đồng hồ dưới mỗi bước sẽ làm rối luồng đọc. Chỉ nội dung assistant cuối cùng trong lượt đó sở hữu chỗ ngồi này.

**Chỉ hiển thị dòng thao tác khi hover trên con trỏ có khả năng hover.** Từ chối: một khi dòng tồn tại thì nên luôn có thể phát hiện được; ẩn bằng opacity dễ bị bỏ sót, và cần lặp lại cổng mount qua bộ chọn hover cha.

**Để quyết định IconActions đồng thời định nghĩa luôn ngữ nghĩa session fork.** Từ chối: ghi chú này chỉ sở hữu chrome tin nhắn, đồng hồ và cổng mount; lựa chọn ranh giới, hành vi thất bại và ngữ nghĩa chuyển đổi thuộc về [thao tác fork session Web](2026-07-27-web-session-fork-actions.md) độc lập, tránh để component trình bày trở thành nơi thứ hai cho mutation session.

**Công bố ngày lịch thông qua chat store hoặc hook inject.** Từ chối: đồng hồ ngày chỉ là trạng thái cục bộ của tầng trình bày, không có bên tiêu thụ nào ở entry point khác; timeout cục bộ trong component tuân theo quy tắc client "hook hành vi có thể sở hữu trạng thái không đăng ký nguồn bên ngoài".

## Hậu quả

Mỗi câu trả lời có nội dung đã hoàn tất cuối cùng trong lượt sẽ công bố sao chép, phân nhánh và đồng hồ sự kiện ngay khi dòng được mount; nội dung giữa lượt và node chỉ có Think không có chrome. Đồng hồ người dùng và assistant dùng chung một bộ quy tắc mở rộng qua ngày, qua năm, và làm mới sau nửa đêm mà không cần thay đổi tin nhắn. Phân trang theo từng tin nhắn vẫn là vị trí chức năng footer đang hoãn lại, được ghi trong README của package. Test cấp package cố định ba dạng đồng hồ, mở rộng qua nửa đêm, cổng chỉ-nội-dung của assistant, cổng seq đuôi lượt, và `seq` sự kiện mà nút phân nhánh của user/assistant truyền riêng; kịch bản Web e2e cố định chrome IconActions đã lắp ráp.
