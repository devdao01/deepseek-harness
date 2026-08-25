# Agent Note: Đổi kích thước sidebar mà không hiển thị pill

Status: implemented
Archived: 2026-08-07

[English](2026-07-30-sidebar-resize-without-visible-pill.md) | Tiếng Việt

## Vấn đề

AppFrame hiển thị cùng một pill nổi ở cả hai ranh giới cột. Pill bên trái làm tăng gánh nặng thị giác không cần thiết bên cạnh thanh điều hướng chính, nhưng thao tác đổi kích thước sidebar thì vẫn hữu ích.

## Quyết định

AppFrame giữ dải vùng chạm rộng 8px để đổi kích thước sidebar, con trỏ `col-resize`, việc bắt con trỏ, tiết lưu theo khung hình động và việc cập nhật bề rộng, nhưng không còn sinh ra phần tử giả hình pill cho tay cầm của sidebar. Ranh giới cột chi tiết vẫn giữ đồng thời cả dải vùng chạm lẫn pill nổi.

Các bài kiểm thử component bố cục tiếp tục cố định hành vi kéo sidebar, cùng vòng đời của cả hai tay cầm khi panel thu gọn. Một kịch bản trình duyệt không cần khóa sẽ đọc phần tử giả do tổ hợp bàn giao thực tế sinh ra và kéo ranh giới sidebar vô hình, chứng minh thao tác này vẫn hoạt động.

## Các phương án đã cân nhắc

**Gỡ luôn thao tác kéo sidebar cùng với pill.** Không chọn, vì yêu cầu lần này chỉ đổi phần biểu hiện thị giác; gỡ một điều khiển hình học đang hoạt động tốt sẽ thu hẹp cách tương tác một cách không cần thiết.

**Giữ pill nhưng giảm mức nhấn thị giác của nó.** Pill nhỏ hơn hoặc tương phản thấp hơn thì vẫn để lại một vật thể không cần thiết ở ranh giới sidebar.

## Hệ quả

Ranh giới sidebar trông gọn gàng về mặt thị giác, đồng thời vẫn có thể dùng con trỏ để chỉnh bề rộng ngay tại ranh giới và vẫn giữ con trỏ đổi kích thước. Khác với điều khiển ở cột chi tiết, thao tác này không có pill hiển thị.
