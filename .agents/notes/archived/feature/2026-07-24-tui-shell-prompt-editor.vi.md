# Agent Note: Trình soạn prompt shell của TUI

Status: implemented

Archived: 2026-08-04

[English](2026-07-24-tui-shell-prompt-editor.md) | 中文

## 问题

Editor pi-tui upstream luôn render dòng viền ngang. Cách hiển thị này tuy tách khu vực nhập liệu ra khỏi transcript (bản ghi văn bản), nhưng lại chiếm hai dòng chiều cao terminal, và cũng không giống hình thái nhập liệu hướng lệnh trong shell.

## 决策

TUI hiển thị prompt hai dòng. Dòng ngữ cảnh riêng của DSH hiển thị thư mục làm việc, thời gian của lượt đang chạy, nhánh Git tùy chọn, model hiện tại, tổng token, tỷ lệ cache hit và áp lực ngữ cảnh dưới dạng các segment (đoạn) có mức ưu tiên phân bổ riêng. Terminal hẹp sẽ bỏ bớt các segment ưu tiên thấp, nhưng giữ lại thư mục; khi có thời gian chạy, mức ưu tiên giữ lại của nó chỉ đứng sau thư mục. Dòng thứ hai dùng tiền tố `dsh> ` chiều rộng cố định và thụt lề dòng tiếp theo có cùng độ rộng; văn bản gợi ý steering (dẫn dắt giữa chừng) và hủy khi agent đang chạy chỉ là placeholder, biến mất ngay khi bắt đầu gõ.

Package `@earendil-works/pi-tui` phiên bản cố định mang theo một patch pnpm, thêm `frame: "none"` và tiền tố prompt chiều rộng cố định cho `EditorOptions`. Giá trị mặc định vẫn là viền ngang upstream, do đó chỉ editor của DSH bật hành vi này. Chiều rộng khả kiến của hai tiền tố phải bằng nhau; nếu chiều rộng khác nhau, việc khởi tạo sẽ thất bại. Nhập liệu, xuống dòng tường minh, tự động hoàn thành, định vị con trỏ và chỉ báo cuộn dùng chung chiều rộng dòng đầu đã thu gọn; các dòng sinh ra do tự động ngắt dòng không render tiền tố, văn bản của chúng bắt đầu từ khoảng trắng bên trái của editor, chiếm cột tiền tố, và ngắt dòng theo chiều rộng nội dung đầy đủ.

Phạm vi patch chỉ giới hạn ở JavaScript và khai báo kiểu của editor đã publish. Phụ thuộc giữ nguyên phiên bản chính xác đã cố định, khiến việc cài đặt hoặc áp dụng patch đã biết hoặc thất bại trực tiếp, chứ không âm thầm mất đi cách hiển thị này.

## 曾考虑的替代方案

**Lọc đầu ra render của editor ở tầng bọc.** Điều này đòi hỏi phải nhận diện dòng viền có style ANSI và dòng chỉ báo cuộn, đồng thời phân biệt đầu ra tự động hoàn thành với đầu ra nhập liệu, mà những thứ này đều là chi tiết render không có tài liệu.

**Vendor toàn bộ package pi-tui.** Dự án này cập nhật thường xuyên, còn thay đổi lần này chỉ cần một tùy chọn render editor cục bộ. Tiếp nhận toàn bộ mã nguồn cùng quy trình đồng bộ của nó sẽ mang lại chi phí bảo trì không tương xứng.

**Giữ nguyên viền ngang.** Cách này có thể tránh việc tùy biến phụ thuộc, nhưng đó chính là cách hiển thị mà thay đổi lần này muốn thay thế.

## 后果

Editor và ngữ cảnh cùng chiếm hai dòng, thay thế editor có viền cộng footer trước đây, khu vực prompt và thẻ hội thoại cách nhau một dòng trống. Hiển thị thường trực không bao gồm định danh phiên và chế độ thẻ công cụ; `/status` và các lệnh vẫn giữ lại các chi tiết này. Bố cục nhập liệu và tự động hoàn thành mất sáu cột chiều rộng do tiền tố prompt chiếm chỗ, nhưng văn bản sau khi xuống dòng sẽ chiếm cột tiền tố vốn để trống. Cuộn không viền dùng các dòng `↑ N more` và `↓ N more` riêng.

Biểu diễn nội bộ của segment xác lập thứ tự ưu tiên chiều rộng, nhưng chưa công bố ngôn ngữ tùy biến công khai. Sau khi module mặc định và hành vi tràn tích lũy đủ bằng chứng từ môi trường sản phẩm, tương lai có thể xây dựng một cấu hình kiểu Starship trên nền tảng đó.

Khi nâng cấp pi-tui cần rà soát lại patch này, và áp dụng lại hoặc loại bỏ nó. Bản chụp nhanh terminal của TUI cố định hiệu ứng hiển thị đã lắp ráp, bao gồm module ngữ cảnh, màu prompt, căn chỉnh, định vị con trỏ và chiều rộng tự động hoàn thành.
