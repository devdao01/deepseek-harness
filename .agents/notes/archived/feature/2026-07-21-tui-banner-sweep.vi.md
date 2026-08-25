# Agent Note: Hiệu ứng quét toàn bộ banner; loại bỏ dòng phụ đề

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-tui-banner-sweep.md) | 中文

> **Đã bị thay thế**: bị thay thế bởi [Agent Note về loại bỏ banner khởi động](2026-07-21-tui-no-banner.md): bản thân banner đã bị loại bỏ, animation quét vào cũng bị loại bỏ theo.

## Problem

[Agent Note về slogan khởi động](2026-07-20-tui-startup-slogans.md) đã thay dòng chào mừng kiểu sách hướng dẫn bằng một kho slogan ngẫu nhiên cộng với animation máy đánh chữ hiện từng ký tự. Trong thực tế sử dụng, các câu trích dẫn này trông kỳ quặc — văn bản mang tính "gia vị" ngẫu nhiên xuất hiện ở phần đầu công cụ — và animation lại chậm (40 ms mỗi ký tự, quét hết cả câu), nhưng chỉ animate một trong bốn dòng của banner. Note này thay thế nửa phần slogan của quyết định đó; quyết định loại bỏ dòng chào mừng khỏi cấu hình mẫu (example) và hạ tầng vòng đời animation vẫn được giữ nguyên.

## Decision

- Xóa kho slogan, `pickStartupSlogan`, và animation máy đánh chữ. Khi `welcome` không được thiết lập, banner **không có dòng phụ đề nào** — chỉ có tiêu đề và chi tiết model/session. Cấu hình `welcome` được giữ lại cho các deployment và fixture muốn có một dòng phụ đề cố định, render không animation, xác định theo từng khung hình (deterministic).
- Animation khởi động giờ áp dụng cho **toàn bộ banner**: `HeaderComponent` thêm phép cắt (clipping) `revealWidth`, hộp header quét từ trái sang phải trong khoảng 24 khung hình, mỗi khung 15 ms (tổng cộng khoảng 360 ms, tức khoảng 60 fps), bắt đầu sau khi `ui.start()` thành công, và được dọn dẹp qua cùng đường dẫn `detachListeners` mà animation máy đánh chữ trước đây từng dùng. `stopBannerReveal` đồng thời reset phép cắt, do đó header bị dispose giữa chừng khi đang quét sẽ được render lại đầy đủ.
- Marker khởi động của bài smoke test PTY đổi từ con trỏ máy đánh chữ (`▌`) sang góc trên bên phải của banner (`╮`), nó chỉ được render sau khi hoàn tất quét.

## Alternatives considered

**Giữ nguyên animation, chỉ đổi nội dung văn bản.** Bị từ chối: bất kỳ câu cố định hay xoay vòng nào bị đọc lại mỗi lần khởi động cũng sẽ thoái hóa thành hình nền trang trí; phán quyết của người dùng là chính bản thân các câu trích dẫn — chứ không chỉ nội dung — là sai đối với bề mặt này.

**Animate từng dòng banner (từ trên xuống dưới) thay vì quét trái-phải.** Bị từ chối: chỉ có bốn dòng thì animation chỉ có bốn bước có thể nhìn thấy — giống nhấp nháy hơn là mở ra dần; quét ngang tận dụng toàn bộ chiều rộng terminal, chuyển động mượt hơn trong cùng một tổng thời lượng.

**Dùng `revealWidth` để cắt văn bản có style theo từng ký tự.** Đã dùng `truncateToWidth` của pi-tui — cùng bộ cắt nhận biết ANSI mà header đã dùng khi xử lý tràn chiều rộng — do đó việc quét không thể làm rách chuỗi escape.

## Consequences

- Khi `welcome` không được thiết lập, đầu ra khởi động lại phụ thuộc vào animation nhưng không còn ngẫu nhiên nữa: mỗi lần khởi động đều quét cùng một banner. Các kịch bản có cấu hình dòng chào mừng (toàn bộ snapshot/fixture viết kịch bản sẵn, overlay Code Mode) vẫn giữ tính xác định theo từng khung hình, không đổi.
- Các export `STARTUP_SLOGANS`/`pickStartupSlogan` bị loại bỏ; ngoài các test đã bị xóa, không còn consumer nào tham chiếu chúng.
- Banner mặc định thiếu một dòng (không có phụ đề), do đó các assertion PTY neo vào hình học của banner dùng ký tự góc thay vì bất kỳ văn bản phụ đề nào.

## Testing

`packages/ui/tui/tests/tui.spec.ts` ghim: việc quét hoàn tất thành banner đầy đủ (hai góc + tiêu đề) và tạo ra ít nhất một khung hình giữa chừng bị cắt; dòng chào mừng đã cấu hình được render nguyên văn và không có khung hình bị cắt; banner không có phụ đề khi không thiết lập dòng chào mừng; việc dispose sẽ dọn dẹp handle timer của riêng quá trình quét. Bài smoke test PTY đánh dấu khởi động hoàn tất bằng `╮` trong các kịch bản tui-demo bin, dsh CLI, và overlay cá nhân. Đã được xác minh thực tế trong tmux.
