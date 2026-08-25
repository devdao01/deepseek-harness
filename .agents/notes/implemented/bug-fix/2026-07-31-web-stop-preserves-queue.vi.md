# Agent Note: Thao tác dừng trên Web giữ lại Queue đang chờ

Status: implemented

[English](2026-07-31-web-stop-preserves-queue.md) | Tiếng Việt

## Vấn đề

Nút dừng trên Web gọi `session.cancel`, hàm này ánh xạ tới `agent.cancel({ kind: 'user' })` dạng tổng quát. Trong lúc một lượt đang hoạt động, các lần gửi từ composer thông thường vốn đã được tiếp nhận thành mục xếp hàng vào Queue có thể định địa chỉ độc lập. Khi người dùng chỉ muốn dừng phần sinh nội dung hiện tại, việc hủy tổng quát lại vứt bỏ toàn bộ các mục đang xếp hàng, làm lẫn lộn giữa việc ngắt lượt và thao tác xóa tường minh khỏi Queue.

Trình duyệt không thể sửa mất mát này bằng cách gửi lại các dòng nhìn thấy được. Nó không sở hữu `InboxItemId` thời gian thực, chính sách đánh thức hay cuộc đua giành quyền nhận việc của các dòng đó; gửi lại còn có thể nhân đôi công việc mà Host đã nhận.

## Quyết định

`session.cancel` là thao tác dừng lượt đang hoạt động của Web Host API dành cho session thông thường. Nó sẽ từ chối các subagent được chống đỡ bởi session với lý do `agent-busy`; ngược lại nó gọi `agent.cancel({ kind: 'user' }, { keepInbox: true })`, vừa ngắt lượt hiện tại theo kiểu hợp tác vừa giữ lại công việc inbox đang chờ. Tùy chọn ở tầng dưới sẽ giữ lại các mục queued và steering; projection Queue của Web tiếp tục chỉ phơi bày các mục queued.

AgentLoop sẽ không khởi động lượt thay thế chạy song song. Nó đóng lại và flush lượt bị ngắt, đạt trạng thái dừng hẳn hoàn toàn của việc hủy, rồi thông qua bộ điều khiển FIFO sẵn có mà nhận mục queued kế tiếp có thể đánh thức. Lần nhận việc đó phát ra `agent/inbox/dequeue`, nên snapshot `session/queue` có thẩm quyền của Host sẽ cho dòng đã nhận nghỉ hưu và giữ phần đuôi hàng đợi còn lại vẫn hiển thị. Trình duyệt không gửi lại, cũng không đôn dòng nào lên. Công việc phớt lờ lệnh hủy sẽ làm chậm cuộc bàn giao này cho tới khi công việc đó kết toán.

Ánh xạ này chỉ thay đổi endpoint `session.cancel` của Host mà Web client sử dụng. Quy ước mặc định của `Agent.cancel()` vẫn là hủy tổng quát, ACP và TUI giữ nguyên chính sách hủy vốn có, và `AgentHandle.dispose()` vẫn dọn sạch công việc đang chờ trong lúc tháo dỡ. Xóa dòng khỏi Queue vẫn là thao tác Web tường minh để bỏ đi từng mục đang chờ.

## Các phương án đã cân nhắc

**Nút dừng tiếp tục dùng hủy tổng quát.** Bác bỏ vì: dừng một lần sinh nội dung không nên phá hủy ý định của người dùng đã được xếp hàng độc lập; Queue vốn đã có thao tác xóa tường minh.

**Sau khi hủy thì để trình duyệt gửi lại dòng kế tiếp.** Bác bỏ vì: Host sở hữu định danh mục và thứ tự nhận việc. Việc client gửi lại có thể nhân đôi công việc, xáo trộn FIFO, hoặc tranh chấp với luồng dequeue có thẩm quyền.

**Khởi động lượt kế tiếp trước khi công việc bị hủy dừng hẳn hoàn toàn.** Bác bỏ vì: hai lượt sẽ đồng thời sửa cùng một log session và dùng chung tài nguyên thuộc về Agent. Hủy kiểu hợp tác thì trung thực chờ công việc đang hoạt động kết toán.

**Thêm tùy chọn giao thức cho hủy tổng quát và hủy có giữ lại.** Bác bỏ vì: chừng nào sản phẩm Web chưa có tương tác «dừng và dọn sạch Queue» riêng thì chưa cần tùy chọn này. Nút dừng hiện tại chỉ có một chính sách, còn việc xóa từng dòng đã cung cấp bộ điều khiển vứt bỏ hiện thời.

## Kiểm chứng

Phần bao phủ của AgentLoop giữ một luồng model đang hoạt động, xếp hàng hai lượt có thể đánh thức, hủy với `keepInbox`, rồi cố định kiểm tra lý do của lượt bị ngắt trước và lượt hoàn thành sau, thứ tự message người dùng theo FIFO, không tồn tại sự kiện discard, và trạng thái nhàn rỗi cuối cùng. Kịch bản Web không cần khóa điều khiển tổ hợp đã lắp ghép qua HTTP/SSE: nó dừng một lượt bị kẹt, quan sát thấy mục queued kế tiếp bắt đầu trong khi phần đuôi hàng đợi vẫn hiển thị, rồi dừng lượt đó, và quan sát mục queued cuối cùng hoàn thành. Snapshot khả năng tiếp cận của kịch bản này cố định trạng thái Queue được giữ lại ở giữa chừng.

## Hệ quả

Thao tác dừng trên Web giữ lại ý định đã xếp hàng và đã được tiếp nhận, rồi tự động tiến tiếp sau khi việc hủy kết toán một cách trung thực. Khi công việc đang hoạt động không hợp tác với lệnh hủy đang thu dọn, dòng Queue có thể vẫn còn hiển thị; phần steering từ bên ngoài được cùng tùy chọn inbox đó giữ lại có thể đi vào lượt được tiếp nhận kế tiếp, dù Web không render steering trong QueueDock. Tương tác dọn sạch hàng loạt trong tương lai cần một thao tác sản phẩm tường minh, chứ không phải nạp chồng lên nút dừng.
