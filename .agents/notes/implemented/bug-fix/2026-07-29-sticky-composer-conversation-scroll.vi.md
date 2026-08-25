# Agent Note: Thanh tiêu đề cố định, composer sticky nằm trong vùng cuộn transcript (bản ghi văn bản)

Status: implemented

[English](2026-07-29-sticky-composer-conversation-scroll.md) | Tiếng Việt

## Vấn đề

Cột phiên đang hoạt động chia việc cuộn thành hai đoạn: view chat (và trajectory) có `overflow-y: auto` riêng, còn stack composer là nút anh em của vùng cuộn đó và nằm bên dưới. Khi con trỏ nằm trên dòng thống kê hoặc vùng nhập liệu, thao tác lăn chuột rơi vào khu vực không cuộn được nên hoàn toàn vô tác dụng — transcript chỉ dịch chuyển khi con trỏ nằm trên danh sách tin nhắn. Bản nháp càng dài thì càng tệ: bản thân textarea cũng là một vùng cuộn, nên thao tác lăn chuột trên composer có thể bị chặn lại ở đó. Thanh tiêu đề phiên phải chiếm đỉnh cột như chrome thông thường (không được `position: sticky` bên trong vùng cuộn), còn composer phải bám vào đáy cùng một vùng cuộn với transcript, để thao tác lăn chuột trên phần chân trang cũng làm nội dung trôi đi.

## Quyết định

`ConversationRoot` luôn sở hữu cùng một thân `data-conversation-scroll`, trong đó view outlet `conversation.session` nghiêm ngặt nằm trước `data-composer-seat`; seat này bọc toàn bộ đầu ra của chain `'conversation.composer'` (fallback dưới `overlay: true` cùng các nút anh em overlay được bầu chọn). Một outlet `conversation.session.header` nghiêm ngặt, độc lập, nằm phía trên vùng cuộn với vai trò chrome cột `flex: none`, và bị ẩn khi Session vẫn còn blank. Cây cha cố định giúp thân cuộn và composer seat luôn được mount xuyên suốt từ trạng thái không có phiên, Hero blank, cho tới hội thoại đang hoạt động. CSS của giai đoạn hoạt động ghim seat này bằng `position: sticky; bottom: 0`, để phần Question／Approval tiếp quản vẫn hiển thị khi người dùng chưa bám đáy; CSS của Hero căn giữa stack fallback bên trong thân cuộn. ChatView và Trajectory/Waterfall chỉ giữ scroller cục bộ khi được mount bên ngoài host (unit test); khi nằm dưới host thì đặt `overflow: visible`, và phân giải việc bám đáy cùng việc neo phần đầu qua `closest('[data-conversation-scroll]')`.

Thống kê phiên gắn vào `'conversation.composer.dock'` (nằm trên `'conversation.input.dock'`). Textarea của InputBar xử lý `wheel` theo chuỗi với `{ passive: false }` khi ở trong host: giữ nguyên cử chỉ gốc chừng nào textarea bị giới hạn chiều cao vẫn còn cuộn được theo hướng đó; chỉ khi chạm biên của chính nó mới `preventDefault` và áp `deltaY` lên host.

Việc chèn thêm lịch sử Chat ở phía trước bám theo ý định của người đọc thông qua định danh node／call đã render ổn định, chứ không dùng chênh lệch chiều cao của cả vùng cuộn. Khi bắt đầu phân trang, `ChatView` ghi lại `data-chat-anchor-key` hiển thị đầu tiên cùng vị trí đỉnh của nó tương đối với vùng cuộn; trong lúc request đang trên đường, mỗi lần người đọc cuộn đều chọn lại điểm neo ổn định đang hiển thị; khi trang về tới nơi thì bù trừ theo chênh lệch trước-sau của hình chữ nhật dòng đó. Việc chạm đáy hoặc thêm tin nhắn của chính người đọc sẽ hủy điểm neo phân trang, nên trang về muộn không thể kéo khung nhìn rời khỏi nội dung mới nhất. Việc bám đáy dùng trạng thái được lưu, chứ không dùng trạng thái hình học cuộn thô; còn cách nhận diện thao tác của người đọc — tức lệch khỏi sổ cái observed-top được tạo từ `scrollTop` được giao hoặc được ghi gần nhất, theo cách độc lập thiết bị — do [ghi chú quy thuộc cuộn của người đọc](2026-08-06-reader-scroll-attribution-observed-top-ledger.md) phụ trách. `ResizeObserver` duy nhất của `ChatView` chỉ bám theo đầu ra dạng stream, việc bung công cụ và thay đổi kích thước bản nháp khi quyền sở hữu bám đáy còn được giữ, và mỗi phân mảnh không kích hoạt lần ghi cuộn thứ hai.

## Các phương án đã cân nhắc

**Cả thanh tiêu đề lẫn composer đều sticky trong cùng một vùng cuộn cột.** Bác bỏ với thanh tiêu đề: nó phải chiếm đỉnh như chrome bố cục cố định, chứ không tham gia vào tầng sticky của vùng cuộn.

**Đặt composer cố định flex-none bên dưới vùng cuộn rồi chuyển tiếp thao tác lăn chuột.** Bác bỏ: sản phẩm yêu cầu composer sticky bên trong vùng cuộn transcript, khiến phần chân trang trở thành một phần của bề mặt nhận thao tác cuộn đó, chứ không phải một nút anh em chỉ chuyển tiếp gia số.

**Portal composer vào scroller của ChatView.** Bác bỏ: composer được chia sẻ giữa các tab view; đích của nó là vùng cuộn do root sở hữu trong lớp vỏ thường trú.

**Giữ StatsLine bên dưới cột tin nhắn của ChatView.** Bác bỏ: nằm ngoài composer sticky thì nó sẽ trôi đi theo nội dung, trong khi vùng nhập liệu vẫn ghim ở đáy.

**Mô hình hóa mọi nguồn đầu vào cuộn của trình duyệt.** Bản sửa phạm vi hẹp lần này không áp dụng: lối đi desktop đã tái hiện được dùng đầu vào lăn chuột／touchpad. Cuộn bằng con trỏ／cảm ứng, kéo thanh cuộn gốc, cuộn bằng bàn phím, điều hướng theo focus và quyền sở hữu overflow lồng nhau khi đó được để ngoài mô hình nguồn đầu vào, và cũng không có máy trạng thái đầu vào tổng quát nào được thêm vào vì việc này. [Ghi chú quy thuộc cuộn của người đọc](2026-08-06-reader-scroll-attribution-observed-top-ledger.md) về sau đã tổng quát hóa việc quy thuộc bằng sổ cái observed-top, bù đắp phần hoãn lại này, và vẫn không đưa vào máy trạng thái đầu vào.

## Hệ quả

Lăn chuột trên phần chân trang sẽ cuộn transcript; bố cục nhìn thấy được là thanh tiêu đề cố định, transcript cuộn được và composer sticky ở đáy. Thống kê xuất hiện trên mọi tab view đang hoạt động. Các scroller của view lồng nhau dưới host bị chặn, nhờ đó tiêu đề lượt sticky của Trajectory bám vào host cột. Việc tải lịch sử đồng thời, đầu ra dạng stream, việc bung công cụ và việc bố trí lại composer đều giữ nguyên quyết định cuộn của người đọc, kể cả trường hợp Chromium đẩy trạng thái hình học của compositor lên trước rồi mới giao sự kiện, cũng như việc kẹp co lại ở giai đoạn kết thúc stream. Quyền sở hữu bám đáy được mở rộng cho mọi loại thao tác của người đọc theo [ghi chú quy thuộc cuộn của người đọc](2026-08-06-reader-scroll-attribution-observed-top-ledger.md). Cả chuyển tiếp không-có-phiên → Hero blank lẫn Hero → active đều giữ nguyên cùng một node DOM textarea cùng bản nháp trong InputHub.
