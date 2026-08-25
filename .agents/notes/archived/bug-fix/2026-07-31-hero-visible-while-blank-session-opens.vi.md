# Agent Note: Giữ hero hiển thị trong lúc phiên trống đang mở

Status: implemented
Archived: 2026-08-07

[English](2026-07-31-hero-visible-while-blank-session-opens.md) | 中文

## Vấn đề

Session root giữ một giai đoạn `settling` cho các phiên "đang mở và composer ở trạng thái `blank`": trước khi lịch sử được trả về, quyền sở hữu giữa hero và docked là không thể xác định, nên thà ẩn chỗ ngồi của composer (`visibility:hidden`) còn hơn để hero căn giữa lóe lên trước rồi mới nhảy xuống thanh nhập liệu ở dưới cùng. Việc tự động chọn khi khởi động lại biến chính lớp bảo vệ này thành thứ mà nó vốn định ngăn chặn. Khi vào từ hero không có workspace, `WorkspacesService.startInitialSelection` sẽ kết nối tới workspace gần nhất và mở phiên trống của nó; `open()` vừa chạm đất, `openState` lập tức chuyển sang `loading`, khiến cột giữa trống suốt toàn bộ vòng lịch sử qua lại, rồi vẽ lại một lần — mỗi lần khởi động trông như tải lại toàn trang.

## Quyết định

`ConversationRoot` đọc cờ `blank` từ tóm tắt danh sách phiên cùng lúc đọc snapshot phiên, và miễn trừ settling cho các phiên "đã được tóm tắt chứng minh là trống": `settling` yêu cầu thêm điều kiện `summaryBlank !== true`, còn `hero` chấp nhận composer đang ở trạng thái blank khi tóm tắt chứng minh phiên là trống — áp dụng cho mọi open state, không chỉ `loading`. Phiên đã được danh sách báo cáo là trống chỉ có thể rơi vào hero, nên việc ẩn không mang lại lợi ích gì, chỉ đổi lấy một lần lóe hiển thị; cùng một bằng chứng đó vẫn đúng trước khi việc mở bắt đầu (`cold`) và sau khi việc mở thất bại (`error`), trong khi điều kiện trước đây sẽ rơi vào giai đoạn active ở cả hai trạng thái này, vẽ ra một composer trần trụi đã docked bên dưới lớp vỏ mà `ConversationSession` ẩn đi cho phiên trống. Miễn là tóm tắt chưa chứng minh phiên là trống — dù là dòng báo cáo `blank: false`, hay danh sách chưa kịp cập nhật nên hoàn toàn không có dòng đó — `summaryBlank` sẽ không phải là `true`, và hành vi ẩn thận trọng của settling vẫn giữ nguyên.

Cờ tóm tắt và `blank` của chính snapshot là hai nguồn khác nhau: snapshot mô tả phiên đang được mở, còn tóm tắt là dòng danh sách đã tồn tại trước khi thao tác mở hoàn tất. Chỉ nguồn sau mới đủ sớm để dùng cho việc quyết định giai đoạn.

## Phương án thay thế

**Loại bỏ hoàn toàn giai đoạn settling.** Bị bác bỏ, vì nó vẫn có giá trị với các phiên không có dòng tóm tắt: khi thiếu bất kỳ khẳng định tiên nghiệm nào về việc "có trống hay không", quyền sở hữu giữa hero và docked thực sự không thể xác định, và hiện tượng lóe mà nó ngăn chặn còn tệ hơn.

**Trì hoãn việc chuyển sang `loading` cho đến khi lịch sử được trả về.** Bị bác bỏ, vì `openState` là trạng thái có thẩm quyền của thao tác mở; trì hoãn nó chỉ để che một lỗi ở tầng hiển thị sẽ báo sai trạng thái dữ liệu cho mọi consumer khác.

**Thêm hiệu ứng crossfade hoặc animation khác cho việc ẩn của settling.** Bị bác bỏ, vì dù thế nào thanh này cũng không có nội dung gì để hiển thị trong lúc qua lại — bản sửa đúng là không ẩn nội dung mà kết quả đã biết trước, chứ không phải làm cho việc ẩn trông đẹp hơn.

## Việc hoãn lại

Hiện tượng rung tham chiếu ở tầng object phát hiện trong lúc chẩn đoán — phép chiếu no-op đúc ra snapshot mới, đường tạo mới chiếu lặp lại một lần, `select()` dùng `notifyNow` trong continuation bất đồng bộ — đều thực sự tồn tại, nhưng độc lập với hiện tượng lóe hiển thị lần này.

## Ảnh hưởng

Việc tự động chọn khi khởi động giờ render hero ngay lập tức và giữ chỗ ngồi của composer cùng header hiển thị suốt toàn bộ vòng lịch sử qua lại, nên việc khởi động vào workspace gần nhất không còn giống như tải lại trang nữa. Các phiên mà tóm tắt chưa chứng minh là trống vẫn giữ hành vi settling như cũ, lớp bảo vệ này vẫn bao phủ đúng kịch bản mà nó từng nhắm tới. Skeleton test cố định ba hình thái của tóm tắt: dòng báo cáo `blank: false` đi vào settling; hoàn toàn không có dòng đó cũng đi vào settling; tóm tắt đã chứng minh là trống thì render vỏ hero và textbox khả dụng trong lúc `loading`.

Bao phủ ở cấp độ lắp ráp (assembly-level) là `apps/web/tests/startup-auto-selection.e2e.ts` (luồng trình duyệt Web không cần khóa API). Khi kết nối Workspace lần đầu, nó khẳng định hero root, Workspace chip, phần thân cuộn, chỗ ngồi composer và textarea đều là cùng một node DOM trước và sau khi Session trống xuất hiện. Sau đó nó chặn phản hồi `session.history` tại ranh giới mạng trình duyệt và khẳng định khung hình khả kiến — giai đoạn hero, tiêu đề hero, composer đã vẽ — trong lúc thao tác mở tự động chọn vẫn đang bay, cộng thêm dòng thời gian các giai đoạn ghi lại cho toàn bộ lần tải đúng bằng `['hero']`. Việc chặn vòng qua lại này chính là lý do khiến trường hợp thứ hai trở thành một regression test chứ không phải một cuộc đua điều kiện (race condition): đối với localhost, việc mở nhanh đến mức không thể lấy mẫu; còn một khi lùi lại việc miễn trừ này, đúng khoảng cửa sổ bị chặn đó lại là thời điểm root báo cáo `settling`.
