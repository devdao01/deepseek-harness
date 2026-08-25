# Agent Note: IconActions dưới bong bóng tin nhắn người dùng

Status: implemented

Archived: 2026-07-27

[English](2026-07-27-user-message-icon-actions.md) | 中文

## 问题

Không có thanh thao tác nào dưới bong bóng người dùng trong chat. Bản thiết kế Harness (figma `User_Bubble/message_container`) hiển thị ba IconActions căn phải dưới bong bóng — sao chép, phân nhánh sang hội thoại mới, chỉnh sửa — nhất quán với mẫu thanh thao tác dùng ở nơi khác trong sản phẩm.

## 决策

Chỉ khi `kind: 'user'`, `MessageItem` mới có các thao tác này. Bố cục là một cột dọc (`align-items: flex-end`, khoảng cách 6px): trước tiên là bong bóng, sau đó là hàng thao tác cao 28px; khoảng cách trong hàng 10px, kích thước nút biểu tượng hình tròn là 28px (`IconCopyOutline16`, `IconBranchOutline16`, `IconEditOutline16`). Tooltip mang nhãn tiếng Trung. Thao tác mặc định luôn hiển thị; trong `@media (hover: hover)` sẽ ẩn cho đến khi hover hoặc focus-within, để thiết bị cảm ứng/`hover: none` vẫn có thể phát hiện điều khiển (chỉ dùng opacity vẫn sẽ trúng test).

Sao chép ghi văn bản đã ghép nối trong bong bóng vào clipboard (`navigator.clipboard.writeText`, dùng `execCommand` làm phương án dự phòng). Phân nhánh và chỉnh sửa hiện chỉ có hình thức bên ngoài, chưa có hàm xử lý — chúng chỉ dành sẵn chỗ về mặt thiết kế, không phát minh ra luồng fork phiên hay gửi lại sau khi chỉnh sửa.

Bong bóng steering (dẫn dắt giữa chừng) vẫn chỉ giữ hình thức huy hiệu, không hiển thị các thao tác này.

## 考虑过的替代方案

**Nối phân nhánh/chỉnh sửa ngay với fork phiên thật và chỉnh sửa bản nháp.** Không được chấp nhận trong thay đổi lần này: các luồng sản phẩm này chưa được chốt; giao nút không có hành vi phù hợp với phạm vi yêu cầu, cũng tránh được đường thay đổi làm dở dang.

**Luôn ẩn bằng `opacity: 0` khi không hover.** Không được chấp nhận vì lý do cảm ứng: nếu không có `@media (hover: hover)`, opacity khi rảnh trông như trống rỗng nhưng vẫn trúng test. Con trỏ có khả năng hover giữ hiệu ứng mờ dần; thiết bị khác giữ thao tác luôn hiển thị.

## 后果

Tin nhắn người dùng ngay lập tức có thể sao chép; phân nhánh/chỉnh sửa vẫn là placeholder có thể nhấp, cho đến khi có quyết định sau này làm rõ hành vi của chúng. Test chốt ba nút, payload sao chép, và việc loại trừ với steering.
