# Agent Note: Thanh chi tiết Web mặc định đóng

Status: implemented
Archived: 2026-08-07

[English](2026-07-30-web-details-default-closed.md) | 中文

## Vấn đề

Store bố cục tức thời (transient layout store) trước đây khởi tạo thanh chi tiết với chiều rộng theo hợp đồng là 360px. Do đó, phiên đã kết nối đầu tiên cũng như mỗi lần tải lại toàn trang đều dành sẵn cột bên phải trước khi người dùng chọn bất kỳ nội dung chi tiết nào. Hàng công cụ (tool row) của Chat cố ý giữ inline, không mở thanh chi tiết; hàng Trajectory thì mở thanh chi tiết khi một sự kiện được chọn. Vì vậy, bố cục mặc định mở không có nghĩa là đang tồn tại một lựa chọn chi tiết hợp lệ.

## Quyết định

Layout store khởi tạo thanh chi tiết bằng không, đồng thời giữ nguyên chiều rộng mặc định 360px theo hợp đồng hiện có của `openDetails()`. `AppFrame` vẫn mount slot chi tiết với chiều rộng bằng không, nhờ đó các điểm vào tường minh như việc chọn sự kiện Trajectory có thể mở thanh chi tiết mà không cần mount lại subtree của nó. [Vòng đời sở hữu phiên (session ownership lifecycle)](2026-07-29-web-details-session-lifecycle.md) vẫn là hợp đồng có thẩm quyền: bề mặt chưa chọn sẽ phát sinh chiều rộng bằng không mà không giành quyền sở hữu; quay lại cùng một phiên sẽ giữ nguyên chiều rộng sau khi đã mở tường minh; chọn một phiên khác sẽ đóng thanh chi tiết.

Thông tin hình học của panel vẫn là trạng thái tức thời. Hệ thống không thêm khóa lưu trữ trình duyệt mới; tải lại sẽ khôi phục giá trị mặc định của sidebar và đưa thanh chi tiết về chiều rộng bằng không. Component test cố định xác nhận giá trị mặc định của store, slot chiều rộng bằng không vẫn được mount, hành vi kéo và nhường chỗ sau khi mở tường minh, cũng như quá trình chuyển đổi quyền sở hữu phiên. Regression test tổ hợp đã bàn giao, không cần khóa API, cố định xác nhận phiên đầu tiên giữ đóng, việc tải lại, bề mặt New Session, và việc chọn phiên tiếp theo.

## Phương án đã cân nhắc

**Lưu trạng thái ưu tiên đóng/mở lần cuối.** Bị bác bỏ: việc tải lại phải có một baseline đóng xác định, trong khi việc lưu thông tin hình học sẽ tái đưa vào trạng thái xem cũ giữa các phiên trình duyệt.

**Giữ thanh chi tiết mở cho đến khi Chat có cử chỉ lựa chọn thay thế.** Bị bác bỏ: vùng trống không phải là nội dung chi tiết hữu ích. Tương tác hàng công cụ inline của Chat và khả năng bổ sung cử chỉ lựa chọn chi tiết trong tương lai là các quyết định sản phẩm độc lập với nhau.

**Loại bỏ thanh chi tiết và dịch vụ bố cục.** Bị bác bỏ: Trajectory đã mở chi tiết sự kiện thông qua ranh giới dịch vụ đó; việc tiếp tục mount slot này giúp giữ lại tương tác đang hoạt động bình thường.

## Hệ quả

Các phiên mới tạo, khôi phục, và tải lại sẽ sử dụng toàn bộ vùng trung tâm cho đến khi một thao tác chi tiết tường minh mở cột bên phải. Việc chọn sự kiện Trajectory vẫn có thể mở thanh chi tiết tới 360px, nút đóng của nó đưa track về không; hàng công cụ Chat vẫn không thay đổi thông tin hình học. Chuyển sang phiên khác sẽ đóng thanh chi tiết đang mở, và mọi trạng thái panel đều không được giữ lại sau khi tải lại.
