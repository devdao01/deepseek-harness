# Agent Note: Lệnh /reload đọc lại cấu hình loader theo yêu cầu

Status: implemented

Archived: 2026-07-26

[English](2026-07-21-tui-reload-command.md) | 中文

## Problem

Trình theo dõi tệp của HMR chỉ phản ứng với sự kiện `change` tại chỗ trong thư mục gốc cấu hình của nó (trong ví dụ tức là thư mục chứa leaf cấu hình). Các trình biên tập thay thế tệp bằng cách đổi tên (BSD `sed -i`, `git checkout`) không tạo ra sự kiện, còn runtime không gắn mục cấu hình HMR thì hoàn toàn không có đường tải lại cấu hình. Khi phát triển, điều này có nghĩa là chỉ cần trình theo dõi bỏ lỡ một lần chỉnh sửa cấu hình là phải khởi động lại TUI. Từng cân nhắc mở rộng thư mục gốc theo dõi ra toàn bộ repo, nhưng sau thảo luận đã bác bỏ: việc chia sẻ dày đặc giữa các package khiến HMR ở cấp module trở thành thao tác "gắn lại phần lớn cây", còn ranh giới externals cũng không thể dự đoán được.

## Decision

`dsh-tui` bổ sung một lệnh slash `/reload` **thử nghiệm, chỉ dùng khi phát triển**: duyệt qua `ctx.loader.entries()`, gọi `refresh()` cho cây con (`Include`) của mỗi backend tệp — chính là con đường code mà nhánh thay đổi cấu hình của trình theo dõi HMR đi qua, nhưng đổi thành kích hoạt thủ công thay vì phụ thuộc vào trình theo dõi. Tệp không thay đổi thì không có thao tác nào (`Include.read` so sánh nội dung); tệp không hợp lệ sẽ ghi log cảnh báo và giữ nguyên cây đang chạy (hợp đồng khả năng phục hồi của hot reload); `patches` của include — bao gồm cả overlay cá nhân của dsh CLI — được áp dụng lại mỗi lần đọc lại.

TUI truy cập Loader theo **cách cấu trúc** (thông qua kiểu cục bộ để truy cập `ctx.loader`, chứ không phải `inject`): các test và bên nhúng chạy TUI mà không có Loader, khi đó `/reload` sẽ suy biến thành một thông báo cảnh báo thay vì lỗi gắn kết. Việc hot reload mã nguồn module vẫn do trình theo dõi đảm nhiệm; `/reload` chỉ làm mới cấu hình.

## Alternatives considered

**Mở rộng thư mục gốc theo dõi của HMR ra `packages/`/`apps/`.** Tạm hoãn rồi bác bỏ: thay đổi mã nguồn plugin sẽ tải lại fiber của mọi plugin phụ thuộc, và các package được chia sẻ dày đặc trong repo (`dsh-session`, `dsh-llm`, `dsh-tools`) khiến điều này tương đương với việc gỡ bỏ trục chính và UI giữa chừng phiên làm việc — một cuộc khởi động lại giả trang thành hot reload, còn tiềm ẩn nguy cơ tải lại một phần. Lệnh thủ công, chỉ bao phủ phạm vi cấu hình, nắm đúng cái tập con an toàn, có thể dự đoán được.

**Khai báo `loader` trong `inject`.** Bác bỏ: điều đó sẽ biến Loader thành phụ thuộc cứng của TUI, chỉ vì một tiện lợi khi phát triển mà phá vỡ mọi tổ hợp không có Loader (test harness đơn vị, bên nhúng).

**Làm một công cụ hướng mô hình `cordis_reload` trong dsh-tool-cordis.** Bác bỏ: đây là hành động của người vận hành đầu cuối, không phải năng lực mà mô hình nên kích hoạt; bề mặt mount/unmount của bộ công cụ cordis đã bao phủ nhu cầu sửa đổi runtime của mô hình.

## Consequences

- `/reload` xuất hiện trong dòng trợ giúp, tự động hoàn thành (đánh dấu EXPERIMENTAL (dev)) và hai bản chụp nhanh render trợ giúp (đã ghi lại).
- Lệnh báo cáo số lượng cây và hoàn tất bằng thông báo transcript; lỗi ở một tệp đơn lẻ chỉ xuất hiện trong log của loader, TUI không hiển thị — điều này chấp nhận được với một bề mặt chỉ dùng khi phát triển, và đã ghi chú trong thông báo hoàn tất.
- Bảo vệ chống tái nhập tuần tự hóa việc tải lại: nếu lần trước đang diễn ra, `/reload` sẽ bị từ chối kèm cảnh báo, giữ cho quá trình cập nhật cây không có mutex của loader chỉ có một người ghi duy nhất; bảo vệ được giải phóng khi hoàn tất hoặc thất bại.
- `/reload` chỉ chạy khi agent đang rảnh: việc tải lại có thể unmount rồi mount lại các mục cấu hình, trong một lượt đang hoạt động điều này sẽ rút công cụ hoặc adapter ra khỏi chân một lệnh gọi đang tiến hành. Việc kiểm tra chỉ mang tính khuyến nghị (sau khi kiểm tra vẫn có thể có race của send xen vào), nhưng loại bỏ được cái bẫy thường gặp.
- Nếu hợp đồng "không bao giờ reject" của `refresh()` thay đổi trong tương lai, lệnh sẽ báo cáo thất bại thay vì để lại một rejection không được xử lý.

## Testing

`packages/ui/tui/tests/tui.spec.ts` cố định: `/reload` làm mới cây con của mỗi backend tệp và bỏ qua các mục cấu hình thông thường (Loader giả có cấu trúc), báo cáo hoàn tất, từ chối tái nhập khi việc làm mới đang bị chặn tiến hành và có thể chạy lại sau khi giải phóng, nhánh thất bại cũng giải phóng bảo vệ tương tự, từ chối khi agent đang chạy và có thể chạy lại sau khi rảnh, báo cáo refresh bị reject, suy biến thành cảnh báo khi không có Loader — bao gồm cả trường hợp được mount như một fiber plugin thật, nơi việc tra cứu dịch vụ có thể ném lỗi sẽ rò rỉ ra ngoài. Đã xác minh thực tế trong tmux trên cây cấu hình thật: chỉnh sửa thăm dò → reload có hiệu lực; chỉnh sửa không hợp lệ → reload giữ nguyên cây đang chạy.
