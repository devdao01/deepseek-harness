# Agent Note: Giữ định tuyến agent là phần hiện thực riêng tư

Status: implemented

[English](2026-07-30-private-agent-send.md) | Tiếng Việt

## Vấn đề

Phương thức công khai `Agent.send()` phơi bày ma trận định tuyến của phần hiện thực vòng lặp cụ thể, nhưng bên gọi trong production chỉ dùng các thao tác có ngữ nghĩa rõ ràng là `followup()`, `steer()` và `inject()`. Tổ hợp thứ tư, tức `next-turn` đi kèm `wakeup: false`, không có bên tiêu thụ nào ngoài các bài test. Giữ năng lực tiềm tàng này ở giao diện công khai còn buộc các hiện thực `Agent` khác và test double phải chấp nhận chính sách định tuyến ở tầng hiện thực.

## Quyết định

`Agent` công khai `followup()`, `steer()` và `inject()` như một giao ước bàn giao hoàn chỉnh. `ReactLoopAgent` giữ lại phương thức trợ giúp riêng tư `send()` để ba phương thức trên dùng chung cơ chế định tuyến; `dsh-agent` không còn export `SendTarget` và `SendOptions`.

Giao diện công khai không thể xếp một lượt vào hàng đợi mà không đánh thức bộ điều khiển. `followup()` luôn yêu cầu thực thi, `steer()` yêu cầu bước gần nhất, còn `inject()` cung cấp ngữ cảnh hướng tới model mà không yêu cầu thực thi. Quyết định này thay thế một phần nội dung về giao diện công khai trong [quyết định hợp nhất việc gửi](../architecture/2026-07-22-unified-send-and-coalesced-user-messages.md), đồng thời giữ lại phần định tuyến nội bộ và biểu diễn `user/message` thống nhất của nó.

## Các phương án đã cân nhắc

**Giữ ma trận định tuyến ở dạng công khai.** Cách này giữ lại tổ hợp xếp hàng không đánh thức vốn không được dùng, nhưng cũng phơi bày cơ chế thay vì ý định của bên gọi, và buộc mọi bộ điều khiển thay thế đều phải hỗ trợ cơ chế đó.

**Thêm một phương thức công khai để xếp hàng không đánh thức.** Dùng phương thức có tên rõ ràng sẽ minh bạch hơn cờ định tuyến thô, nhưng hiện chưa có luồng công việc production nào cần để công việc treo ở trạng thái chờ cho tới khi một lần bàn giao không liên quan đánh thức nó.

## Hệ quả

Plugin chọn trong ba thao tác có ngữ nghĩa, không còn tự dựng tùy chọn định tuyến. Các bộ điều khiển khác và test double dạng cấu trúc chỉ cần hiện thực một giao ước nhỏ hơn, và danh mục API Cordis cũng không còn liệt kê `send`, `SendTarget` hay `SendOptions`.

Chỉ khi xuất hiện bên tiêu thụ rõ ràng và định nghĩa được ngữ nghĩa vòng đời tường minh thì mới khôi phục năng lực xếp hàng không đánh thức đã bị gỡ bỏ. `cancel({ keepInbox: true })` vẫn giữ lại phần công việc đã vào trạng thái chờ xử lý qua các đường bàn giao được hỗ trợ.
