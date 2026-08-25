# Agent Note: Duyệt danh sách Session và sắp xếp thủ công cho Workspace

Status: implemented

[English](2026-07-25-session-list-browsing-and-manual-order.md) | 中文

## Vấn đề

[Luồng sản phẩm hoàn chỉnh của Workspace UI](2026-07-25-workspace-ui-product-flow.md) đã giao hình thái đầu tiên của danh sách session theo nhóm, và cố ý loại các thao tác như Rename, kéo-thả sắp xếp ra khỏi phạm vi giai đoạn đó. Bản thiết kế (figma 239-10458 và các màn hình liên quan) sau đó đã bổ sung các tương tác này: danh sách phải chuyển được sang chế độ hiển thị phẳng không nhóm, hàng session khi hover phải hiện thẻ chi tiết và menu thao tác, workspace phải đổi tên được, session trong nhóm phải sắp xếp thủ công được.

Hai cơ chế sẵn có cản đường. Thứ nhất, host trên mỗi `session/event` sẽ đẩy session đang hoạt động lên đầu sổ cái workspace một cách bền vững (ghim theo hoạt động), bất kỳ sắp xếp thủ công nào cũng sẽ bị hoạt động tiếp theo xáo trộn — hai cơ chế thứ tự không thể dung hòa. Thứ hai, khu vực duyệt bị chia làm hai package: ui-sidebar sở hữu danh sách, tìm kiếm và hàng tiêu đề nhóm, còn ui-workspace chỉ mượn một picker slot để đặt lớp overlay; mỗi lần thêm một hộp thoại thuộc miền workspace đều phải nối dây xuyên package, khiến quyền sở hữu ngày càng rối.

## Quyết định

### Hàng phẳng và trạng thái duyệt

Menu group-by cung cấp hai chế độ WorkSpace / In one list. Chế độ WorkSpace hiển thị các hàng session cùng cấp trong mỗi nhóm theo thứ tự thủ công của `WorkspaceView.sessionIds`; chế độ In one list gộp toàn bộ session rồi sắp xếp nghiêm ngặt theo `updatedAt` mới→cũ. Cả hai chế độ đều không chiếu `parentId` thành cấp bậc danh sách, phả hệ fork chỉ được giữ lại trong dữ liệu session; hành vi fork đầy đủ được định nghĩa trong [Thao tác fork session của Web](2026-07-27-web-session-fork-actions.md). Lựa chọn chế độ được lưu bền trong trình duyệt (`dsh.workspace.view`), vẫn giữ nguyên sau khi refresh. [Thứ tự và thu gọn sidebar Workspace](2026-08-11-workspace-sidebar-order-and-folding.md) sau đó bổ sung chế độ xem theo cập nhật gần nhất chỉ lưu cục bộ trên trình duyệt, mà không thay đổi cơ chế thứ tự thủ công do Host ghi sổ.

### Tương tác hàng

- Hover hàng session 500ms hiện thẻ chi tiết (tiêu đề đầy đủ, thời gian tương đối, dòng trạng thái; trước khi wire bổ sung trường status, dòng trạng thái chỉ có hai trạng thái running/idle). Thẻ và menu hàng loại trừ lẫn nhau: menu đang mở hoặc đang kéo-thả thì không hiện thẻ.
- Menu … của hàng session: Rename / Fork session / Delete session, trong đó Rename và Fork đã được nối dây, Delete vẫn chỉ là hình thức thị giác; menu … của hàng tiêu đề nhóm workspace có Rename / Delete workspace đều đã nối dây. Menu tự đóng khi chuột rời khỏi.
- Thành phần hỗ trợ: `Menu` bổ sung mục label, hàng danger, `closeOnPointerLeave`; thêm mới `HoverCard` (định vị qua portal, độ trễ mở, cơ chế bảo vệ disabled).

### workspace.rename

`workspace.rename({ workspaceId, title })`: title sau khi trim phải khác rỗng; no-op khi trùng tên hiện tại và kiểm tra trùng tên đều được đánh giá trong chuỗi thao tác Workspace tuần tự của Host (cùng chuỗi với việc thu nạp theo đường dẫn và xóa, các thao tác Workspace đồng thời không được xen kẽ tạo ra trùng tên hoặc thành công giả sai thứ tự), xung đột trả về `workspace-name-conflict`. Thu nạp theo đường dẫn có thể suy ra title đã tồn tại, vì thứ sở hữu định danh là canonical path chứ không phải title (xem [quyết định định danh](../bug-fix/2026-07-31-same-basename-workspace-adoption.md)). Ghi xuống đĩa đi qua kênh mutate của `setTitle`, listener `domain/changed` tự động phát khung `host/workspace-changed`. UI là Modal chuẩn, phía client còn tự kiểm tra trùng tên trước.

### Sắp xếp thủ công: insertSessionBefore thay thế ghim theo hoạt động

Chuỗi ghim theo hoạt động `session/event` → `touchSession` bị xóa hoàn toàn; thứ tự sổ cái workspace hiện hoàn toàn do sắp xếp thủ công quyết định — session mới attach sẽ chèn lên đầu, sắp xếp lại tường minh đi qua `workspace.insertSessionBefore({ workspaceId, sessionId, beforeSessionId? })` (ngữ nghĩa DOM insertBefore: khi có điểm neo thì chèn trước điểm neo, bỏ qua thì thêm vào cuối). Entity chỉ ném `WorkspaceMoveInvalidError` đã gõ kiểu cho session/điểm neo không có trong sổ, handler chỉ ánh xạ nó thành mã nghiệp vụ `workspace-move-invalid`, lỗi lưu trữ vẫn giữ ở mức internal.

UI dùng kéo-thả HTML5 cho hàng session trong nhóm (chỉ ở chế độ nhóm workspace, không phải trạng thái tìm kiếm; fork session con và session nguồn của nó sắp xếp độc lập nhau). Cơ chế thứ tự hoàn toàn nằm ở host: drop chỉ gửi RPC, client không sắp xếp lại cục bộ, view dựa vào upsert từ response và khung changed để làm mới; thất bại thì không có gì xảy ra. Upsert phía client từ chối snapshot cũ hơn (`updatedAt`) so với projection đã tải, để tránh response một chiều đến muộn rollback lại khung mới hơn.

### Phân tách shell/khu vực

ui-sidebar thu gọn thành shell hình học cột: hàng thương hiệu, state machine thu gọn, New Session, Settings, cùng một lỗ hổng `sidebar.workspaces`; giao ước giữa shell và khu vực chỉ có hai sự kiện `{ wide, expandSidebar }`. ui-workspace sở hữu toàn bộ khu vực duyệt (section header, tìm kiếm, cây nhóm và chế độ phẳng, hộp thoại toàn bộ workspace, kéo-thả) cùng store groupBy của nó; tìm kiếm ở trạng thái rail, icon thêm workspace cũng thuộc khu vực, yêu cầu shell mở rộng qua `expandSidebar()`. Picker được tách thành thành phần lõi `WorkspacePickFlow` (kết hợp component trực tiếp trong khu vực; trước [Note đường dẫn duy nhất](../simplification/2026-07-31-one-route-to-add-a-workspace.md) có tên là `WorkspaceCreateFlow`) và lớp wrapper mỏng `WorkspacePicker` (tiếp tục lấp vào hero slot của ui-conversation); slot picker `sidebar.workspace` gốc cùng cơ chế đăng ký trễ nhận biết khai báo bị xóa theo đó.

## Phương án thay thế đã cân nhắc

**Giữ ghim theo hoạt động, kéo-thả chỉ là điều chỉnh tạm thời** — thứ tự thủ công sẽ bị xóa bỏ ngay ở hoạt động session tiếp theo, coi như vô nghĩa; hai cơ chế thứ tự cùng tồn tại không thể giải thích được cho người dùng. Cũng đã cân nhắc phương án dung hòa "kéo một lần thì đóng băng ghim theo hoạt động của workspace đó", nhưng thêm một trạng thái, ngữ nghĩa khó giải thích hơn, xóa thẳng gọn gàng hơn.

**Bản tin sắp xếp dùng chỉ số dạng số** — `{ index }` sẽ trôi trong khoảng thời gian kéo-thả: host chèn session mới lên đầu (như Intent hóa vật chất) thì cùng một chỉ số lại trỏ tới hàng khác. insertBefore dạng neo miễn nhiễm tự nhiên với việc chèn đầu và filter projection.

**Sắp xếp lại lạc quan sau khi drop** — client sắp xếp lại trước cần rollback khi thất bại, thêm một trạng thái rối rắm ở tầng đối tượng; roundtrip cục bộ, mạng LAN chỉ mili-giây, phương án đơn giản chờ phản hồi host mắt thường không cảm nhận được. Sau khi cơ chế thứ tự được đơn nhất hóa (hoàn toàn tin host), frontend không bao giờ tự phát minh thứ tự.

**Giữ hộp thoại rename ở ui-sidebar (thay đổi tối thiểu)** — chính là bản chất vấn đề: hộp thoại thuộc miền workspace rải rác trong hố mượn, mỗi lần thêm một cái (hộp xác nhận Delete sắp tới) đều lặp lại việc nối dây xuyên package. Chỉ chuyển Modal rename thì sẽ lặp lại việc nối dây này ở hộp thoại tiếp theo; toàn bộ khu vực duyệt thuộc về ui-workspace, shell chỉ giữ hình học.

**Chế độ WorkSpace lồng session theo phả hệ fork** — lồng sẽ khiến session con hiện tại phải phụ thuộc trạng thái mở rộng của tổ tiên mới thấy được, cũng khiến thứ tự thủ công trong nhóm chỉ có thể di chuyển node gốc; `parentId` là dữ liệu lineage, không phải cấu trúc điều hướng danh sách. Sau khi mọi session được làm phẳng thành hàng cùng cấp, mỗi hàng có thể mở, tìm kiếm và sắp xếp độc lập; In one list vẫn tắt kéo-thả vì không có vật mang bền vững workspace.

## Hậu quả

- Thứ tự thủ công là cơ chế thứ tự duy nhất của sổ cái workspace thuộc Host: hoạt động không bao giờ thay đổi `WorkspaceView.sessionIds`. Chế độ xem theo cập nhật gần nhất lưu cục bộ trên trình duyệt bổ sung sau này có thể đưa hàng đang hoạt động lên đầu, nhưng không thay đổi sổ cái đó; ngữ nghĩa độc lập của nó xem [Thứ tự và thu gọn sidebar Workspace](2026-08-11-workspace-sidebar-order-and-folding.md).
- Giao ước hai sự kiện shell/khu vực gom toàn bộ tính năng tiếp theo thuộc miền workspace (xác nhận Delete, di chuyển xuyên nhóm, thu nạp Ungrouped) vào riêng package ui-workspace; ui-sidebar không còn phải tiến hóa cùng chức năng danh sách session.
- Chế độ phẳng không hỗ trợ sắp xếp lại, cũng không có lối vào tạo session trong workspace chỉ định (cần chuyển về chế độ nhóm), là phạm vi bị thu hẹp được chấp nhận có chủ đích.
- Việc nối dây chức năng session Delete và mở rộng enum trạng thái wire, để lại cho iteration sau.

## Kiểm thử

Các test case cấp package bao phủ việc suy diễn (deriveGroups/deriveFlat), hàng session cùng cấp, hai chỗ đăng ký và truyền apply, ngữ nghĩa dịch chuyển entity của host, cài đặt RPC và fixture (dữ liệu tiền đặt cho test) stub của rename/insertSessionBefore; hồi quy snapshot keyless của `apps/web` bao phủ ứng dụng sau khi lắp ráp, và chốt việc không có điều khiển mở rộng session sau khi fork.
