# Agent Note: Các control phía trên của sidebar thu gọn dùng chung một animation vào

Status: implemented
Archived: 2026-08-12

[English](2026-08-12-collapsed-sidebar-shared-entry-motion.md) | 中文

## Problem

Bốn control phía trên của track sidebar thu gọn được render bởi hai package: shell giữ nút chuyển sidebar và nút tạo phiên mới, khu vực Workspace giữ nút thêm và tìm kiếm. Chúng có cùng thời gian độ trong suốt, nhưng hành vi hình học khác nhau. Control căn phải sẽ di chuyển khi thanh thu hẹp lại, còn control căn trái thì giữ nguyên, nên nút thêm dù dùng cùng hiệu ứng fade-in vẫn trông chậm hơn nút tìm kiếm về mặt thị giác.

Control cài đặt ở dưới cùng đóng vai trò khác. Nó cố định ở footer của track, không thể tham gia vào chuyển động vào theo chiều ngang của các control phía trên.

## Decision

Khi track vào vị trí, bốn control phía trên 36px bắt đầu từ cùng một bố cục căn trái, dùng chung một animation `150ms`, di chuyển từ `translateX(49px)` đến padding trong cuối cùng là 10px. Shell áp dụng độ dịch chuyển riêng cho nút chuyển sidebar và nút tạo phiên mới, và chỉ áp dụng một lần cho khu vực Workspace, nên nút thêm và tìm kiếm sẽ kế thừa cùng một đường đi, không phát sinh biến đổi lồng nhau. Độ trong suốt dùng chung một timeline animation.

Control cài đặt dùng một tập keyframe độc lập có cùng thời lượng và easing, nhưng chỉ thay đổi độ trong suốt. Khi trang khởi tạo đã ở trạng thái thu gọn sẵn thì sẽ không phát animation vào; chế độ giảm chuyển động sẽ vô hiệu hóa cả hai tập keyframe.

## Alternatives considered

**Cố định mỗi control của track ở padding trong cuối cùng.** Cách này loại bỏ được sự không nhất quán, nhưng cũng loại bỏ luôn hiệu ứng vào theo chiều ngang cần thiết cho bốn control phía trên.

**Thêm animation riêng cho từng nút Workspace.** Cách này sẽ lặp lại thời gian của shell trong `ui-workspace`, và có thể đồng thời áp dụng biến đổi cho cả khu vực lẫn control con. Chỉ dịch chuyển một lần cho khu vực đã đăng ký giúp animation tiếp tục do shell sidebar sở hữu.

**Cho control cài đặt di chuyển cùng với các control phía trên.** Không áp dụng, vì cài đặt là thao tác footer cố định ở dưới cùng, không thuộc chuỗi control phía trên.

## Consequences

- Nút chuyển sidebar, nút tạo phiên mới, nút thêm và tìm kiếm dùng cùng hoành độ trong suốt quá trình thu gọn.
- Cài đặt fade-in tại hoành độ cuối cùng.
- Render tĩnh ở trạng thái thu gọn giữ nguyên hình học cuối cùng, không phát animation khởi động.
- Style test cố định việc phân bổ animation dùng chung, khoảng cách dịch chuyển, điểm neo cơ sở và ngoại lệ của cài đặt.
