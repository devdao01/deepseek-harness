# Agent Note: New Session clears onto the empty-state launch

Status: implemented

Archived: 2026-07-26

[English](2026-07-24-new-session-clears-to-empty-state.md) | 中文

## Problem

"New Session" ở sidebar trước đây sẽ tạo và mở ngay một phiên trống, do đó cột giữa hiển thị `ConversationRoot` với transcript (bản ghi văn bản) rỗng và composer thường trực. Màn hình NEW SESSION của Figma (`EmptyState` + `InputBar` hero dùng chung) chỉ render khi `sessions.current` đã là undefined, do đó điều khiển tạo mới chính không thể chạm tới trang khởi động.

## Decision

`SessionsService.clear()` xóa lựa chọn đã persist và `list.current`. Điểm vào tạo mới ở cấp cao nhất của sidebar (`onCreate()` không có cwd — New Session và New Workspace) gọi `clear()`, khiến `AppFrame` render `conversation.empty`. Lần gửi đầu tiên ở trạng thái rỗng vẫn đi qua `conversation.startSession` (create → open → send), và tái sử dụng cùng component `InputBar` (`variant="hero"`) như composer thường trực. Nút "+" theo dự án (`onCreate(cwd)`) vẫn tiếp tục create-then-open, cho đến khi bộ chọn trạng thái rỗng có thể nhận cwd điền sẵn.

## Alternatives considered

**Giữ create-then-open cho New Session, và thêm một bộ chrome trạng thái rỗng khác bên trong ConversationRoot khi transcript rỗng.** Bác bỏ: điều này sẽ lặp lại InputBar của trang khởi động, và phá vỡ quy ước empty→content — cùng một InputBar nên dịch chuyển vị trí, chứ không phải đổi component cho nhau.

**Định tuyến New Session tới một route hoặc slot chuyên dụng nằm ngoài trạng thái lựa chọn.** Bác bỏ trong đợt này: `conversation.empty` đã sở hữu UI khởi động; xóa `current` chính là nhánh trạng thái rỗng đã có sẵn.

## Consequences

New Session không còn tạo phiên host trước lần gửi đầu tiên. Tải lại sau khi clear vẫn ở trạng thái rỗng. Nút "+" theo phạm vi dự án vẫn tạo ngay lập tức. `EmptyState` xếp chồng khu vực hero theo Figma (Input_Bottom 75:8208): logo cá + tiêu đề, chip workspace do Menu điều khiển phía trên card, tiếp theo là `InputBar` dùng chung (`variant="hero"`, max-width 800, card bo góc r20 nhất quán với composer — không phải khu vực hero r24 cao hơn), bộ chọn cùng phía sau card được phủ một lớp elip ánh sáng dịu căn giữa (figma 313:14109), chiều rộng khóa theo tỷ lệ asset `1051/776` của card, co giãn theo card. Chip dùng nền fill tương tác dịu khi hover của 75:8208 và bo góc 12px, và mở MenuDropdown (figma 122:9481; `--dsw-specific-menu` + `--dsw-shadow-lv3`): hàng basename kèm biểu tượng thư mục và dấu tick ở cuối, sau dấu phân cách là "New Workspace", submenu của nó (figma 419:16920) cung cấp "Use a existing folder" và "Create new". Use a existing folder mở Dialog nhập đường dẫn (figma 451:18655 copy — "Enter an existing folder path" / Open Folder), đặt trên lớp phủ toàn viewport (`--dsw-alias-bg-mask-1` + `--dsw-mask-blur`), và đặt cwd của chip. Create new mở cùng bộ chrome Dialog đó, đặt tên thư mục dưới `host.describe().cwd`; thành công thì đi qua `sessions.createWorkspace` → `session.create` của host (mkdir recursive) → `sessions.open`, mặc định rơi vào một phiên trong workspace mới. `InputBar` vẽ chrome thanh dưới (attach / Plan / Read-only / model), chỉ dùng trạng thái `<select>` gốc cục bộ — seam plan, access, model phía host vẫn chưa được nối.
