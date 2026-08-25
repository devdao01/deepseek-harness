# Agent Note: Loại bỏ sự kiện provider skill không có bên tiêu thụ

Status: implemented

Archived: 2026-07-26

[English](2026-07-12-drop-unconsumed-skill-provider-events.md) | 中文

## Vấn đề

Registry skill (kỹ năng) sinh ra hai sự kiện thông báo, nhưng không có listener nào trong môi trường sản xuất. Ma trận producer/consumer đã sinh cùng việc tìm kiếm chính xác tên sự kiện cho thấy `skill/provider-added` và `skill/provider-removed` chỉ xuất hiện trong khai báo, điểm emit, test, catalog đã sinh và văn xuôi.

Việc phát hiện skill đọc bản đồ provider hiện tại theo yêu cầu (on-demand), việc đăng ký provider xóa đồng bộ catalog đã hoàn thành, còn kiểm tra phiên bản sau await ngăn kết quả phát hiện đã lỗi thời lọt vào cache. Không có plugin anh em nào chờ provider skill qua các sự kiện này — trái ngược với bên tiêu thụ `subagent/provider-added` đang hoạt động, nơi chấp nhận việc các anh em load đồng thời.

`tools/change` và `system-prompt/change` rõ ràng nằm ngoài phạm vi đề xuất này. Quyết định đơn giản hóa trước đó giữ chúng lại như điểm quan sát có chủ đích cho UI tool và prompt thời gian thực, và plugin đã mount tự tham chiếu đã dùng `tools/change`. Đề xuất này cũng không thay đổi `subagent/provider-added`/`removed`, vì `tool-subagent` có bên tiêu thụ vòng đời trong môi trường sản xuất.

## Quyết định

Registry skill không còn khai báo và emit sự kiện thay đổi thành viên provider. Việc đăng ký và dispose (giải phóng tài nguyên) provider vẫn là thay đổi trạng thái trực tiếp do effect sở hữu, làm mất hiệu lực đồng bộ catalog đã hoàn thành; việc tra cứu và phát hiện đọc bản đồ provider hiện tại theo yêu cầu. Test quan sát hành vi dọn dẹp qua việc tra cứu provider và output thu thập được, thay vì dựa vào thông báo vòng đời.

Danh mục sự kiện đã sinh, danh mục API và ma trận producer/consumer không còn chứa thông báo đã xóa. Agent Note (bản ghi quyết định của agent) của hệ thống skill và tài liệu package mô tả việc đăng ký thông qua trạng thái do effect sở hữu trực tiếp cùng hợp đồng làm mất hiệu lực cache.

## Các phương án thay thế đã cân nhắc

**Giữ thông báo provider skill cho plugin tương lai.** Plugin bên thứ ba có thể muốn quan sát tính khả dụng của provider, nhưng đăng ký provider trực tiếp và tra cứu theo yêu cầu mới là hợp đồng mở rộng; hiện không có bên tiêu thụ nào cần tín hiệu đẩy. Nếu tương lai xuất hiện tình huống race điều kiện khi các anh em cùng load, có thể đưa vào một thông báo mang ngữ nghĩa định danh và sẵn sàng mà bên tiêu thụ đó thực sự cần, giống như registry subagent đã làm.

## Hệ quả

Ma trận sự kiện đã sinh không còn dòng nào cho `skill/provider-added` hay `skill/provider-removed`. Việc phát hiện skill, đăng ký runtime trực tiếp, rollback/dispose effect của provider, làm mất hiệu lực cache và dọn dẹp tra cứu registry giữ nguyên không đổi; rollback do listener kích hoạt biến mất cùng sự kiện. `tools/change`, `system-prompt/change` và sự kiện vòng đời provider subagent đã được tiêu thụ không bị ảnh hưởng.

Bên tiêu thụ ở giai đoạn tiền phát hành mất điểm quan sát provider skill, nhưng vẫn giữ hai cách đóng góp skill: đăng ký runtime trực tiếp và đăng ký provider. Nếu tương lai có bên tiêu thụ cần thông tin khả dụng provider thời gian thực, phải thêm một thông báo chuyên dụng mang ngữ nghĩa định danh và sẵn sàng mà nó thực sự cần.
