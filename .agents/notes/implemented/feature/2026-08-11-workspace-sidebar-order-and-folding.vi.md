# Agent Note: Thứ tự và gấp lại sidebar Workspace

Status: implemented

[English](2026-08-11-workspace-sidebar-order-and-folding.md) | 中文

## Vấn đề

Workspace có nhiều Session sẽ chiếm hết toàn bộ sidebar, đẩy các Workspace khác ra ngoài vùng nhìn thấy. Danh sách gọn cần một chiều cao mặc định có giới hạn, đồng thời vẫn phải cung cấp lối vào rõ ràng tới từng Session. Sidebar còn cần thứ tự hướng theo thời gian hoạt động, nhưng `WorkspaceView.sessionIds` là sổ sách thủ công bền vững, không được phép bị hoạt động Session ghi đè.

Bản thân nhóm Workspace không có thứ tự bền vững do người dùng điều khiển. Kéo-thả gốc của trình duyệt còn coi việc thả chuột ngoài danh sách là từ chối, và bật hàng về vị trí cũ, ngay cả khi ứng dụng vẫn giữ một dấu chèn hợp lệ. Sau khi Workspace mở rộng, nếu chỉ tính trúng theo header nhóm, ranh giới thị giác giữa hai nhóm cũng không còn bằng điểm giữa của header nhóm nào cả.

## Quyết định

### Thứ tự Workspace

Registry Workspace giữ thứ tự `workspaceIds` bền vững, và cung cấp `insertBefore(id, beforeId?)` theo ngữ nghĩa `insertBefore` của DOM. RPC Host `workspace.insertBefore` trả về toàn bộ thứ tự đã commit; thay đổi thứ tự đơn thuần được đẩy qua `host/workspace-order-changed` với cùng toàn bộ thứ tự đó. Nguồn hoặc anchor id không xác định bị từ chối với `workspace-not-found`; lấy chính nó làm anchor hoặc di chuyển tới vị trí hiện tại sẽ không ghi gì cả.

Client cài đặt lạc quan (optimistic) cho việc kéo-thả Workspace. Thế hệ request và thế hệ frame đảm bảo chỉ có phản hồi một chiều mới nhất mới được thay thế thứ tự cục bộ, và frame Host mới hơn được ưu tiên hơn phản hồi cũ; khi request mới nhất bị từ chối, thứ tự đầy đủ gần nhất được xác nhận bởi baseline Host, frame, hoặc phản hồi một chiều hiện tại sẽ được khôi phục. Mỗi lần baseline danh sách thành công đều khôi phục thứ tự Host, do đó việc kết nối lại sẽ tiếp nhận thay đổi bền vững đã commit ở nơi khác.

### Gấp lại Session và thứ tự view

Mỗi Workspace lưu bền vững một trạng thái mở cục bộ trên trình duyệt: đóng nghĩa là zero hàng Session, mở nghĩa là tối đa năm hàng. Khi có nhiều Session hơn, **mở rộng phần còn lại** chỉ hiển thị các mục còn lại trong phiên mount hiện tại; đóng toàn bộ Workspace sẽ xóa trạng thái mở rộng tạm thời này, do đó khi mở lại sẽ trở về năm hàng. Chỉ khi người dùng chưa lưu trạng thái rõ ràng cho Workspace đó, nhóm chứa Session hiện tại mới tự động mở. Khi tạo Session từ hàng Workspace, nhóm mục tiêu sẽ được mở trước khi khởi động Session, để sau khi trạng thái lan truyền xong, hàng mới vẫn hiển thị được. Sau khi baseline Workspace sẵn sàng thay đổi, trình duyệt sẽ xóa trạng thái mở rộng, thứ tự và bản ghi thời gian đã quan sát của id không còn tồn tại trong baseline, đồng thời giữ lại sổ sách Ungrouped và danh sách đơn.

Menu view tổ hợp cung cấp cả **sắp xếp thủ công** và **cập nhật gần đây nhất** trong cả cách trình bày theo nhóm và danh sách đơn, mỗi sổ sách tự giữ một thứ tự bền vững cục bộ trên trình duyệt riêng. Workspace thật khởi tạo từ `WorkspaceView.sessionIds`; Ungrouped và danh sách đơn xuyên Workspace khởi tạo theo thứ tự thời gian cập nhật gần đây, và không có sổ sách Session phía Host. Vào chế độ cập nhật gần đây sẽ thực hiện một lần sắp xếp thời gian đầy đủ; user prompt hoặc steer sau đó sẽ đưa Session tương ứng lên đầu đúng một lần, kéo-thả vẫn có thể chỉnh sửa thứ tự thu được. Quay lại sắp xếp thủ công sẽ giữ nguyên thứ tự hiện tại, chỉ tắt việc đưa lên đầu do hoạt động tiếp theo. Kéo-thả trên Workspace thật ở chế độ thủ công còn ghi vào sổ sách Session phía Host, còn kéo-thả và đưa lên đầu do hoạt động của Ungrouped và danh sách đơn chỉ lưu cục bộ trên trình duyệt. Danh sách đơn không có phân cấp cha, do đó không hiển thị ô trạng thái trống bên trái; khi có trạng thái hiển thị được, ô đó vẫn được giữ lại.

### Kéo-thả và giao diện gọn

Việc tính trúng (hit test) Workspace dùng toàn bộ đoạn nhóm đã render, bao gồm cả hàng Session hiển thị. Nửa dưới của nhóm trước và nửa trên của nhóm sau chia sẻ cùng một ranh giới chèn, chỉ báo là một đường ngang định vị tuyệt đối có góc nhọn hướng phải nối liền và không ảnh hưởng đến layout. Lớp phủ thân cây sẽ vẽ ranh giới đầu tiên với cùng offset âm ở ngoài vùng cắt khi cuộn, do đó góc nhọn bên trái vẫn hiển thị được, và vị trí danh sách cũng không thay đổi. Trong lúc kéo-thả Workspace hoặc Session, handler `dragover` và `drop` cấp tài liệu sẽ chấp nhận thao tác gốc; nếu thả chuột ngoài danh sách Workspace, `dragend` sẽ commit dấu hợp lệ cuối cùng.

Tìm kiếm là thao tác ở đầu vùng khi gấp lại, và chiếm không gian của tiêu đề cùng thao tác cuối khi mở rộng. Khi query rỗng sau khi xóa khoảng trắng đầu cuối, click ra ngoài sẽ thu gọn ô tìm kiếm; query không rỗng thì được giữ lại. Hàng Workspace và Session gọn, hiệu ứng mờ dần 24px ở đáy, và việc bỏ số lượng Session của mỗi Workspace cùng nhau tiết kiệm không gian theo chiều dọc, đồng thời vẫn giữ lối vào điều hướng.

## Phương án khác đã cân nhắc

**Ghi mỗi lần đưa lên đầu do hoạt động vào `Workspace.sessionIds`.** Ưu tiên trình bày phía trình duyệt sẽ ghi đè sổ sách Host dùng chung mỗi khi người dùng gửi prompt.

**Giữ thứ tự riêng biệt cho sắp xếp thủ công và cập nhật gần đây.** Chuyển chế độ sẽ thay danh sách hiển thị bằng vị trí cũ từ một thứ tự khác, trong khi chọn sắp xếp thủ công chỉ có nghĩa là hoạt động tiếp theo không còn di chuyển mục nữa.

**Luôn hiển thị toàn bộ Session khi mở Workspace.** Workspace lớn vẫn sẽ chiếm chỗ của nhóm khác; chỉ nhớ trạng thái mở của cả nhóm không thể giới hạn chiều cao của nó.

**Lưu bền vững trạng thái mở rộng phần còn lại.** Khi mở lại Workspace sau một thời gian dài, nó có thể bất ngờ chiếm hết sidebar. Chỉ trạng thái zero hoặc năm hàng mới thuộc về sở thích điều hướng ổn định; hiển thị phần còn lại chỉ là một lần xem cục bộ.

**Dùng chỉ số (index) hoặc chỉ tính trúng theo header nhóm khi kéo-thả.** Hàng thay đổi trong lúc kéo-thả sẽ làm chỉ số trôi lệch; khi Workspace mở rộng, điểm giữa header nhóm không khớp với ranh giới hiển thị. Anchor id và hình học toàn đoạn giữ ổn định trong cả hai trường hợp.

**Cho trình duyệt từ chối việc thả chuột ngoài danh sách.** Ứng dụng sẽ commit dấu hợp lệ cuối cùng, trong khi trình duyệt lại đồng thời phát hiệu ứng từ chối, tạo ra phản hồi mâu thuẫn nhau.

## Kết quả

- Thứ tự Workspace được lưu bền vững và chia sẻ qua Host; cách nhóm, trạng thái mở, thứ tự view Session của mỗi sổ sách và trạng thái query vẫn là sở thích trình bày cục bộ trên trình duyệt. Ungrouped và danh sách đơn hỗ trợ cùng quy tắc kéo-thả và đưa lên đầu, nhưng vì không có một sổ sách Workspace duy nhất, thứ tự của chúng chỉ lưu cục bộ trên trình duyệt.
- Chế độ cập nhật gần đây thực hiện một lần sắp xếp thời gian đầy đủ khi vào, sau đó giữ nguyên điều chỉnh thủ công cho đến khi user prompt hoặc steer thúc đẩy một Session và đưa nó lên đầu. Quay lại sắp xếp thủ công sẽ giữ nguyên toàn bộ vị trí hiện tại.
- Khi chưa thực hiện thao tác **mở rộng phần còn lại** rõ ràng, mở Workspace hiển thị tối đa năm Session; đóng nhóm chỉ reset thao tác tạm thời này.
- Sổ sách Session phía Host tiếp tục dùng ý nghĩa thứ tự thủ công đã được xác lập trong [Duyệt danh sách Session và sắp xếp thủ công Workspace](2026-07-25-session-list-browsing-and-manual-order.md).

## Test

Test domain và Host bao phủ việc di chuyển Workspace bền vững, không thao tác và anchor không hợp lệ, khôi phục sau khởi động lại, phản hồi RPC thứ tự đầy đủ, frame thứ tự, và mỗi stream Host chỉ đọc một snapshot Workspace. Test runtime bao phủ thứ tự lạc quan, ưu tiên frame/phản hồi, khôi phục thứ tự đã xác nhận của Host sau khi bị từ chối do chồng chéo, baseline khi kết nối lại, và ưu tiên mục tiêu New Session. Test UI bao phủ gấp lại năm hàng, reset mở rộng tạm thời, dọn dẹp trạng thái bền vững sau khi Workspace bị xóa, chuyển chế độ vẫn giữ thứ tự, đưa lên đầu một lần cho cập nhật gần đây, lưu bền vững kéo-thả cục bộ trên trình duyệt cho Ungrouped và danh sách đơn, khoảng cách trái của hàng danh sách đơn không phân cấp, đánh dấu view hiện tại, tính trúng Workspace trên đoạn mở rộng, ranh giới chèn đầu tiên không bị cắt, thả chuột Workspace và Session ngoài danh sách, quy tắc thu gọn tìm kiếm, và kích thước CSS gọn.
