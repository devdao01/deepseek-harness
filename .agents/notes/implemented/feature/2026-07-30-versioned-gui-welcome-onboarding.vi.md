# Agent Note: Onboarding chào mừng GUI có phiên bản hóa

Status: implemented

[English](2026-07-30-versioned-gui-welcome-onboarding.md) | 中文

## Vấn đề

Onboarding credential của GUI bắt đầu bằng một kiểm tra trạng thái sẵn sàng chuyên biệt cho DeepSeek, nhưng thông báo kiểm thử nội bộ áp dụng cho mọi người dùng, và phải hiển thị trước khi thiết lập provider ngay cả khi credential đã được cấu hình. Nếu xử lý hai thứ này như các lớp phủ (overlay) độc lập, nhiều hộp thoại có thể xuất hiện đồng thời; cờ đóng chỉ tồn tại trong tiến trình vừa không thể phân biệt được thông báo đã được xác nhận xong hay cửa sổ bị đóng trước khi xác nhận, vừa không thể hiển thị lại thông báo một lần sau khi văn bản được sửa đổi có chủ đích.

## Quyết định

**Vỏ (shell) settings điều phối các bước có thứ tự.** `settings.onboarding` vẫn là một list ở phạm vi root, nhưng `ui-settings` chiếu id và thứ tự của từng mục trong đó vào một coordinator, và chỉ mount bước chưa hoàn thành đầu tiên. Bên đăng ký hiện tại nhận `complete()` và `openSection(id)`; các bước sau sẽ không được mount cho tới khi quyền sở hữu được chuyển giao. `ui-settings-models` hiện đăng ký tuyên bố chào mừng đã khôi phục với thứ tự `-100`, và đăng ký bước credential có điều kiện của DeepSeek với thứ tự `0`; phần hiển thị dùng chung hiện tại của cả hai được giữ trong [quyết định về onboarding sản phẩm dùng popup chung](2026-08-13-shared-modal-product-onboarding.md).

**Bước chào mừng sản phẩm được quản lý theo phiên bản và thuộc sở hữu của plugin tính năng.** Tuyên bố này từng bị loại bỏ bởi quyết định lịch sử [loại bỏ thông báo beta lần chạy đầu tiên](../simplification/2026-08-13-remove-first-run-beta-notice.md), giờ được khôi phục trong `ui-settings-models` với văn bản giai đoạn kiểm thử mới. `ui-settings-general` vẫn không đăng ký bước onboarding nào; plugin đang giữ hai bước hiện tại cũng giữ luôn văn bản, store và popup dùng chung.

**Phần `ui-onboarding` đã persist giữ trạng thái xác nhận.** Phía host đăng ký nó trong seam user-settings, lưu vào `$DSH_HOME/settings.yaml` hiện tại; store chào mừng hiện tại đọc/ghi `welcomeNoticeVersion` trong đó thông qua public settings API sẵn có. Plugin connection công bố thống nhất qua `ctx.connection.isLoopback` việc trang hiện tại có dùng loopback authority hay không; việc phán định hostname vẫn nằm trong package connection, các plugin client khác chỉ tiêu thụ trạng thái service chứ không import phần triển khai của nó. API Proxy phơi ra chính xác một namespace sản phẩm này ngoài namespace provider có thể cấu hình, thông qua một allow-list khép kín, đồng thời không coi thay đổi của nó là sự kiện làm mất hiệu lực model catalog.

**Onboarding hiển thị dùng chung một hợp đồng popup.** Cả hai bước hiện tại đều render qua cùng một `OnboardingModal` thông qua body portal, và chỉ đặt root node của app bên dưới thành inert trong lúc popup đang hiển thị. Khi bước đang tải dữ kiện riêng, shell không render lớp bọc nào. Thao tác tường minh mới chuyển giao quyền sở hữu coordinator; nhấn Escape và click vào lớp phủ đều không xác nhận hay bỏ qua bước.

## Các phương án thay thế từng cân nhắc

**Local storage của trình duyệt**: không áp dụng, vì trạng thái xác nhận sẽ đi theo một profile trình duyệt cụ thể, thay vì `$DSH_HOME`; một Harness profile hoàn toàn mới có thể vô tình kế thừa trạng thái xác nhận trước đó, và việc chỉnh sửa profile bên ngoài cũng không có luồng cập nhật có thẩm quyền. Vì vậy, fallback không phải loopback vẫn giữ ở dạng trạng thái trong tiến trình, chứ không phải trạng thái profile trình duyệt.

**Thêm một cửa sổ modal độc lập khác trong `ui-settings-general`**: không áp dụng, vì khi thông báo chào mừng và trạng thái sẵn sàng của credential cùng đúng một lúc, các bên đăng ký list vẫn sẽ chồng lên nhau. Shell khai báo và render list đó nên là bên giữ quyền sở hữu có thứ tự.

**Persist tại thời điểm render hoặc khi đóng cửa sổ**: không áp dụng, vì thấy thông báo không đồng nghĩa với xác nhận, và sự kiện đóng cửa sổ cũng không được gửi tới một cách đáng tin cậy. Chỉ việc submit tường minh nút "Tiếp tục" mới có thể ngăn thông báo hiển thị lại ở lần khởi động kế tiếp.

**Cờ phơi bày settings công khai dùng chung**: không áp dụng, vì một namespace sản phẩm không đủ để biện minh cho việc mở rộng bề mặt cấu hình công khai của mỗi bên đăng ký settings. API Proxy giữ nguyên allow-list khép kín tường minh.

## Hệ quả

Một profile hoàn toàn mới sẽ thấy tuyên bố giai đoạn kiểm thử hiện tại trước; khi không có provider nào khả dụng, sau đó mới thấy popup key DeepSeek có điều kiện. Store hướng đích (targeted store) và test React cố định phiên bản xác nhận chính xác, thứ tự coordinator, chuyển giao có điều kiện, hành vi popup dùng chung và dọn dẹp HMR. Kịch bản Chromium thật sẽ khởi động bản tổ hợp Web đã phát hành dưới thư mục home harness cô lập, kiểm chứng cả hai popup, ghi key qua ranh giới credential hiện có, và kiểm tra secret không lọt vào DOM, ARIA hay console trình duyệt.
