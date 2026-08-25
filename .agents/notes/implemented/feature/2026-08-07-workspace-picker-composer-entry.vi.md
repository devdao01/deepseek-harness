# Agent Note: Mở bộ chọn đã có từ trình soạn thảo khi chưa chọn Workspace

Status: implemented

[English](2026-08-07-workspace-picker-composer-entry.md) | 中文

## Vấn đề

[Quyết định session scope](../architecture/2026-07-25-web-client-session-scope-and-provide-channel.md) giữ lại cùng một trình soạn thảo thường trực trước khi Workspace tồn tại, nhưng textarea ở trạng thái vô hiệu hóa, chỉ có chip Workspace nhỏ hơn mới mở được bộ chọn. Khi người dùng lần đầu bấm vào vùng nhập liệu nổi bật và quen thuộc nhất, giao diện không phản hồi, mặc dù chính giao diện đó đã có sẵn lối để tiếp tục thao tác.

## Quyết định

Khi phiên mới chưa thuộc về Workspace nào, toàn bộ thẻ nhập liệu có thể được kích hoạt bằng chuột để mở bộ chọn `conversation.hero.workspace` đã có sẵn — trình xử lý click thuộc quyền sở hữu của thẻ, các điều khiển bị vô hiệu hóa của nó cho phép sự kiện con trỏ đi qua, do đó toàn bộ viên nang này là cùng một mục tiêu; textarea thường trực chỉ-đọc cũng có thể được kích hoạt bằng Enter hoặc Space. `aria-haspopup="menu"` và `aria-expanded` mô tả trạng thái mở rộng khi menu bộ chọn dùng chung được lắp vào. Khi cài đặt hoàn toàn mới chưa có dòng Workspace nào, bộ chọn sẽ chuyển ngay sang hộp thoại danh mục và xóa trạng thái mở rộng của chính nó; hộp thoại đó dùng ngữ nghĩa khả năng truy cập riêng của nó. Viền chấm l4 (vòng chấm SVG, vì khoảng cách của `dashed` gốc không thể tùy chỉnh) cùng màu xanh business khi hover đánh dấu thẻ là lối vào để chọn. Thẻ chặn `pointerdown`, để việc đóng-khi-click-ra-ngoài của bộ chọn đã mở không đua với việc mở lại do click — đóng trước rồi mở lại sẽ làm chip nhấp nháy khi vọng lại trạng thái mở rộng. Việc gửi tin nhắn, lệnh, quyền, model và các điều khiển khác thuộc phạm vi Session sẽ vẫn khóa cho đến khi người dùng chọn Workspace và tạo hoặc kết nối lại một Session thật.

Việc chọn Workspace tiếp tục dùng chủ sở hữu và luồng hiện có. `ConversationRoot` mở bộ chọn, `WorkspacePicker` liệt kê hoặc tạo Workspace; khi Session đến, cùng một node DOM textarea đó chuyển sang trạng thái có thể chỉnh sửa.

## Phương án thay thế đã cân nhắc

**Giữ textarea vô hiệu hóa và làm nổi bật chip Workspace.** Cách này giữ nguyên ranh giới điều khiển sẵn có, nhưng vùng chỉnh sửa chính vẫn không phản hồi ở lần thao tác đầu tiên.

**Đặt một nút trong suốt phía trên textarea.** Nút có ngữ nghĩa kích hoạt trực tiếp, nhưng sẽ thêm một phần tử có thể focus thứ hai phía trên textarea thường trực, và làm phức tạp thêm việc giữ focus, bộ gõ, và chuyển tiếp identity DOM cho hành vi bản nháp.

**Nhận bản nháp trước khi chọn Workspace.** Việc này đòi hỏi một Session bản nháp do client sở hữu hoặc một trục trạng thái tiền-Session khác. Tính năng này chỉ cần cung cấp một lối vào dễ phát hiện hơn tới bộ chọn đã có sẵn.

## Hệ quả

Người dùng bấm lần đầu vào trình soạn thảo là có thể tiếp tục luồng thiết lập cần thiết, người dùng bàn phím cũng kích hoạt được cùng lối đi đó. textarea vẫn báo cáo đúng trạng thái chỉ-đọc cho đến khi Session tồn tại; các điều khiển liền kề vẫn ở trạng thái vô hiệu hóa. Giao diện không đưa vào trạng thái Workspace, truyền tải, hay luồng chọn danh mục mới nào.

Component test sẽ cố định việc kích hoạt bằng chuột và bàn phím, bao phủ mục tiêu click toàn thẻ, `pointerdown` bị chặn, các điều khiển liền kề bị khóa, bộ chọn mở rộng, và quá trình chuyển đổi cùng node thành textarea có thể chỉnh sửa. Web helper đã lắp ráp sẽ bắt đầu thiết lập Workspace mới qua textarea, do đó việc phát lại kịch bản trình duyệt sẽ bao phủ đúng đường dẫn giao hàng thực tế.
