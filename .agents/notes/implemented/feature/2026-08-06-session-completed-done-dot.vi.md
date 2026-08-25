# Agent Note: Chấm nhắc phiên đã hoàn thành ở thanh bên

Status: implemented

[English](2026-08-06-session-completed-done-dot.md) | Tiếng Việt

## Problem

Người vận hành giao việc rồi chuyển sang phiên khác, và khi phiên ban đầu hoàn thành thì không có tín hiệu nào. Sau khi chỉ báo đang chạy dừng lại, dòng đó trông y hệt một phiên rảnh thông thường, người vận hành chỉ còn cách xem đi xem lại danh sách hoặc rất muộn mới phát hiện công việc đã xong. Chấm màu hổ phách báo chờ tương tác chỉ phủ những phiên cần người vận hành nhập liệu, không phủ những phiên «chỉ là đã làm xong việc».

## Decision

`SessionManager` giữ tập nhắc hoàn thành ở phía client, song song với bit chờ tương tác: khi một phiên không phải phiên hiện tại xảy ra cạnh running→idle thì bật nhắc của nó; `select()`/`selectSubagent()` tiêu thụ nhắc; bắt đầu lại một vòng chạy sẽ tắt nhắc và bật lại khi hoàn thành lần nữa; khi phiên bị gỡ bỏ thì dọn nhắc. Bit này đi qua `SessionListEntry` → `SessionSummary` (trường tuỳ chọn, mặc định = không có nhắc) để vào khu duyệt workspace, nơi dòng phiên và dòng kết quả tìm kiếm render trạng thái `done` của `StateDot` sẵn có — đang chạy vẫn hiển thị vòng xoay, phiên rảnh không có nhắc thì không hiển thị chấm nào — còn thẻ hiện khi rê chuột chú thích nhắc này là «Đã hoàn thành / Completed».

Nhắc chỉ tồn tại trong bộ nhớ và được cô lập theo từng thực thể trình duyệt. Nó sống xuyên qua các thế hệ kết nối — nhiễu động truyền tải không làm mất hiệu lực «bạn vẫn chưa quay lại xem» — nhưng sẽ được đặt lại sau khi tải lại trang.

## Consequences

Trạng thái dòng ở thanh bên trở thành ba tín hiệu loại trừ lẫn nhau: xanh lá = đã hoàn thành và chưa xem, hổ phách = đang chờ người vận hành nhập liệu, xanh dương = đang chạy. Không có thay đổi nào về định dạng giao thức (wire format), định dạng trên đĩa hay định dạng cấu hình: `SessionSummary.completed` là trường tuỳ chọn, các bên tiêu thụ hiện có và fixture (dữ liệu chuẩn bị trước cho test) vẫn hợp lệ, chỉ khu duyệt workspace đọc nó. Cạnh hoàn thành được phát hiện tức thì ở mỗi lần danh sách thay đổi và mỗi lần kéo dữ liệu (nếu chỉ phát hiện lúc dựng snapshot thì hai khung trạng thái liên tiếp sẽ bị gộp thành một lần quan sát, làm bỏ sót sự kiện hoàn thành).

## Alternatives considered

- **Trạng thái UI cục bộ trong component.** Đã bác bỏ: thanh bên khi thu gọn sẽ bị unmount, và nhiều giao diện (cây nhóm, danh sách phẳng, tìm kiếm) cần chung một bit trạng thái; manager vốn đã giữ các chuyển đổi trạng thái chạy và trạng thái được chọn, nên tập do manager giữ là nguồn sự thật duy nhất mà mọi giao diện đều có thể chiếu ra.
- **Chỉ bật nhắc theo hướng sự kiện từ khung trạng thái.** Đã bác bỏ: bản thân việc kéo danh sách cũng có thể mang theo chuyển đổi running→idle (phiên đã hoàn thành trong lúc làm mới đang trên đường); nhắc cần được đối soát ở mỗi lần thay đổi và mỗi lần kéo.
- **Lưu bền nhắc.** Đã bác bỏ: ý nghĩa của nhắc là «trong trình duyệt này bạn chưa xem phiên đó»; tải lại sẽ khôi phục trạng thái được chọn và người dùng đang nhìn vào danh sách, nên một bit lưu bền chỉ trở nên cũ kỹ.
