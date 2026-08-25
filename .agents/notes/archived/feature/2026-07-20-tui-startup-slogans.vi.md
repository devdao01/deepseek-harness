# Agent Note: Slogan khởi động thay thế lời chào TUI dạng cấu hình

Status: implemented

Archived: 2026-07-26

[English](2026-07-20-tui-startup-slogans.md) | 中文

> **Đã bị thay thế**: nửa phần slogan/animation đã được [Agent Note về banner sweep](2026-07-21-tui-banner-sweep.md) thay thế: thư viện slogan và animation kiểu máy đánh chữ khi lên production trông kỳ quặc, đã được thay bằng banner không có subtitle kèm hiệu ứng sweep toàn bộ. Quyết định loại bỏ lời chào khỏi cấu hình mẫu (example config) và hạ tầng vòng đời animation (khởi động sau `ui.start()`, được dọn dẹp qua `detachListeners`) vẫn giữ nguyên.

## Problem

Subtitle ở phần header của TUI đến từ cấu hình `welcome`, và cấu hình leaf mẫu đặt nó là "TUI agent ready. Give it a coding task." — một câu điền chỗ trống kiểu hướng dẫn sử dụng, không mang thông tin gì với người dùng lâu năm, mỗi lần khởi động lại nhắc lại sản phẩm là gì, và nó còn có một "anh em sinh đôi" hardcode (`'ready.'`) làm giá trị mặc định schema ở hai package. Sản phẩm cần một khoảnh khắc khởi động có cá tính, chứ không phải một dòng chú thích banner tĩnh.

## Decision

- `examples/tui-agent/cordis.yml` không còn cấu hình `welcome` nữa; key cấu hình này được giữ lại cho các triển khai và fixture cần subtitle cố định, xác định (overlay Code Mode và tất cả fixture snapshot/script hóa đều giữ nguyên lời chào riêng của mình).
- Khi `welcome` không được thiết lập, `dsh-tui` mỗi lần khởi động sẽ chọn một câu từ thư viện `STARTUP_SLOGANS` đã export (`pickStartupSlogan`, nguồn ngẫu nhiên có thể được inject), và hiển thị bằng animation kiểu máy đánh chữ: mỗi khung hình 40 ms cho một ký tự, trước khi hoàn thành có một con trỏ khối `▌` theo sau. Animation chỉ khởi động sau khi `ui.start()` thành công, timer của nó được dọn dẹp cùng các listener khác khi dispose.
- Thư viện slogan là văn bản trình bày, cố tình không làm thành cấu hình: các triển khai muốn kiểm soát câu chữ đã có lối ra là `welcome`. Theo hợp đồng, slogan chỉ chứa ASCII, vì việc hiển thị từng ký tự được cắt theo ký tự.
- `dsh-tui-demo` chỉ chuyển tiếp `welcome` khi nó được cấu hình, không còn điền giá trị mặc định, ứng dụng không còn thay TUI quyết định subtitle khi rảnh rỗi.
- Kịch bản khởi động PTY không có key được đổi thành chờ con trỏ hiển thị từng ký tự (`▌` — nguồn duy nhất của ký tự này trong transcript rỗng), không còn chờ văn bản chào đã bị xóa.

Cùng một thay đổi đã khôi phục `packages/ui/tui/src/index.ts` về mức bao phủ (coverage) 100% cho một file duy nhất (việc gộp color scheme từng làm hỏng nó trên nhánh tích hợp): việc gán lại màu viền editor bên trong `applyColorScheme` là dead code (lệnh gọi `setStatus` ngay sau đó sẽ suy lại nó), đã được xóa; các hàm mũi tên `.then`/`.catch` của truy vấn color scheme được đổi thành các handler có tên, có test (`applyReportedScheme`, `ignoreSchemeQueryFailure` — cái sau được cố định bởi một test làm terminal ném lỗi khi ghi truy vấn DSR).

## Alternatives considered

**Đổi sang một slogan cố định hay hơn.** Từ chối: một chuỗi được đọc lại mỗi lần khởi động sẽ thoái hóa thành hình nền giống hệt cái nó thay thế; một thư viện xoay vòng nhỏ giữ khoảnh khắc này luôn mới mẻ với chi phí độ phức tạp gần như bằng không.

**Đưa thư viện slogan và tốc độ hiển thị thành cấu hình.** Từ chối: đó là thêm hai nút vặn cho văn bản trình bày; các triển khai có chủ kiến về câu chữ đã có lối ra là `welcome`, còn quy tắc "không hardcode tham số có thể điều chỉnh trong plugin" nhắm vào hành vi thay đổi theo triển khai, không phải văn bản thương hiệu.

**Làm animation bên trong `HeaderComponent`.** Từ chối: component sẽ cần giữ handle TUI và vòng đời riêng; lớp chat đã có sẵn render loop, timer và đường giải phóng tài nguyên, nên việc hiển thị từng ký tự được đặt cùng các tài nguyên khác của `createTuiChat`, được `detachListeners` dọn dẹp.

## Consequences

- Khi `welcome` không được thiết lập, output khởi động không còn xác định ở mức byte (slogan ngẫu nhiên, khung hình theo timer). Tất cả các bề mặt ghi hình hoặc snapshot đều cố định `welcome` một cách tường minh, do đó không có snapshot nào thay đổi; smoke test PTY được đổi thành neo vào con trỏ hiển thị từng ký tự và dòng session id.
- Giá trị mặc định schema của `welcome` biến mất khỏi `dsh-tui` và `dsh-tui-demo`; các lời gọi trực tiếp không truyền welcome giờ nhận được slogan, thay vì `'ready.'`.
- Thêm một slogan mới chỉ cần thêm một dòng vào thư viện; test khẳng định thành viên thuộc thư viện, không khẳng định nội dung văn bản cụ thể.

## Testing

`packages/ui/tui/tests/tui.spec.ts` cố định các hành vi sau: việc chọn xác định sau khi inject nguồn ngẫu nhiên, hiển thị từng ký tự (render đầy đủ một câu trong thư viện, quan sát khung hình con trỏ), khi welcome được cấu hình thì animation từng ký tự không khởi động và văn bản gốc được render, và dispose sẽ dừng animation đang diễn ra. `examples/tui-agent/tests/tui-keyless-smoke.e2e.ts` khởi động cây cấu hình thật trong PTY và chờ con trỏ hiển thị. Đã được xác minh thực tế trong tmux (khung hình giữa chừng `no map below▌`, sau đó là slogan đầy đủ).
