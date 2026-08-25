# Agent Note: Thẻ đặt câu hỏi có thể thu gọn

Status: implemented

[English](2026-08-11-collapsible-ask-user-question-card.md) | Tiếng Việt

## Problem

Giao diện tiếp quản ask-user của `dsh` render nhóm câu hỏi đang chờ trả lời thành một thẻ ở đáy màn hình, với chiều cao tối đa là `min(60vh, 520px)`; khi lô câu hỏi dài, hoặc khi người dùng muốn đọc lại bản ghi hội thoại phía trên rồi mới quyết định, thẻ sẽ chiếm gần hết viewport mà không thu nhỏ được — phần hội thoại phía trên gần như bị che kín, chỉ còn thấy vài dòng trên cùng.

## Decision

Thêm nút chuyển thu gọn/mở rộng vào phần đầu của thẻ câu hỏi (ngay cạnh nút "bỏ qua cả nhóm câu hỏi" hiện có). Khi thu gọn thì ẩn phần thân chứa các lựa chọn và khu thao tác ở đáy, chỉ giữ lại một dải header (eyebrow, tiêu đề, hai nút biểu tượng) để người dùng vẫn thấy tín hiệu "còn câu hỏi chưa trả lời"; khi mở rộng thì khôi phục thẻ đầy đủ.

- Trạng thái được lưu trong state cục bộ của `QuestionFlow` (`minimized`), nên việc thu gọn/mở rộng không làm mất bản nháp và chỉ số câu hỏi hiện tại — các đáp án đã chọn vẫn có thể gửi ngay.
- Nút chuyển dùng `IconChevronDownOutline14` / `IconChevronUpOutline14`, tái sử dụng lưới nút biểu tượng 24px hiện có; `aria-expanded` phản ánh trạng thái thẻ, phần chữ chuyển đổi giữa `nav.minimize` / `nav.maximize` (sau khi thu gọn, nút hiển thị với trình đọc màn hình là "mở rộng").
- Khi thu gọn, phần thân chứa lựa chọn và phần đáy được tháo bỏ qua `{!minimized && ...}`, không để sót mặt tương tác bị ẩn trong cây a11y.
- Khi đang gửi/hủy (`busy !== null`) thì nút thu gọn bị vô hiệu hóa, nhất quán với cách bảo vệ của nút bỏ qua hiện có.
- CSS: `.cardMinimized` bỏ giới hạn `max-height` và ẩn `.body` / `.footer`; `.header` tăng padding dưới để tránh quá chật sau khi gập lại.
- Phạm vi: chỉ luồng hỏi đáp dùng chung (`QuestionFlow`) có nút chuyển này. Thẻ duyệt kế hoạch (`PlanReviewPanel`) là một hình thái khác (một quyết định duy nhất cho một kế hoạch) nên giữ nguyên bố cục hiện có.

## Consequences

- Người dùng có thể thu nhỏ thẻ câu hỏi để đọc hội thoại, rồi mở rộng ra để trả lời — bản nháp và vị trí được giữ lại vì trạng thái nằm trong component của luồng.
- Thao tác thu gọn nằm ngay cạnh nút bỏ qua, cả hai dùng chung kiểu nút biểu tượng nên phần header vẫn cân đối.
- Phần chữ sản phẩm mới chỉ nằm trong namespace locale `question` (`nav.minimize` / `nav.maximize`), theo hợp đồng từ điển thì tiếng Trung và tiếng Anh đi thành cặp.

## Alternatives considered

- **Tự động thu gọn khi cuộn**: tự động gập thẻ khi người dùng cuộn hội thoại thì tiết kiệm được không gian, nhưng lại đối đầu với người dùng ngay giữa lúc thao tác, và vô tình ẩn mất tín hiệu "còn câu hỏi chưa trả lời"; nút chuyển tường minh trao quyền quyết định cho người dùng.
- **Cho phép kéo để đổi kích thước**: tay cầm kéo giúp người dùng tự do chỉnh kích thước thẻ, nhưng cơ chế phức tạp hơn mức nhu cầu đòi hỏi, và cũng không giải quyết được mong muốn "để thẻ tránh hẳn ra".
- **Lưu trạng thái gập theo phiên**: là thứ làm đẹp thêm, nhưng hỏi đáp là tương tác một lần; việc lưu trữ kéo theo độ phức tạp về lưu trữ và đồng bộ mà giao diện này không thu được lợi ích rõ ràng nào.
