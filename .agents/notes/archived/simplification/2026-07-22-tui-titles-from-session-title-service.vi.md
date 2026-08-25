# Agent Note: Tiêu đề TUI đến từ dịch vụ session-title

Status: implemented
Archived: 2026-07-27

[English](2026-07-22-tui-titles-from-session-title-service.md) | Tiếng Việt

## Vấn đề

Tiêu đề theo từng phiên giúp phân biệt các pane và tab của terminal, nhưng lời gọi mô hình cục bộ của TUI lại tạo ra một đường ống tiêu đề thứ hai bên cạnh [tiêu đề phiên dựa trên log](../feature/2026-07-21-log-backed-session-titles.md). Nhánh cục bộ cần prompt riêng, giới hạn cắt chuỗi riêng, chốt một lần, suy diễn khi khôi phục, hủy và phương án dự phòng khi thất bại, trong khi kết quả cục bộ theo tiến trình của nó vẫn không hiển thị với danh sách phiên, fork, các bên tiêu thụ Web và phát lại. Nếu hai nhánh cùng chạy, cùng một phiên còn có thể bị đặt tên hai lần theo hai chiến lược khác nhau.

## Quyết định

Dịch vụ session-title là nguồn tiêu đề duy nhất. TUI không chứa cấu hình `autoTitle`, không gọi mô hình để lấy tiêu đề, không có chốt, abort controller, prompt hay giới hạn đầu ra. Khi nạp, TUI gộp tiêu đề đã ghi log mới nhất (`foldSessionTitle`), render nó thành phụ đề của banner, và trên mỗi sự kiện `session/title` được chấp nhận sẽ gọi `runtime.terminal.setTitle` với `<session title> — <configured title>`. Cùng một nhánh OSC 0 an toàn cho terminal sẽ xử lý tiêu đề dự phòng đã cấu hình, phiên được khôi phục và các bản sửa đổi theo thời gian thực, vừa không đổi tên cửa sổ tmux, vừa không thêm một bộ giao diện điều khiển terminal khác.

Tiêu đề do mô hình sinh ra là một lựa chọn tổ hợp: `examples/tui-agent/cordis.yml` (cùng fixture PTY kịch bản hóa) nạp `@deepseek-ai/dsh-session-title-first-message-llm`, plugin này kế thừa đúng định tuyến của request chính và thay phương án dự phòng tất định của spine bằng một bản tóm tắt ngắn do mô hình sinh. Các bản triển khai không nạp provider đó vẫn giữ tiêu đề dự phòng của `SessionTitleService` tích hợp trong `dsh-agent-spine-demo`.

## Phương án thay thế

**Cho cả hai cùng tồn tại, tiêu đề đã ghi log thắng.** Đây là phương án hợp nhất ở bản đầu tiên: auto-title chiếm trọn tiêu đề cửa sổ cho tới khi `session/title` đã ghi log tới dưới dạng hậu tố. Nó bảo toàn hành vi nhưng làm mỗi phiên mới tốn gấp đôi lời gọi mô hình, và tiêu đề của TUI thì không quan sát được trong log, về thực chất vi phạm model-visible ⟺ logged, đồng thời xé lẻ cam kết về tiêu đề cho hai chủ sở hữu.

**Chuyển prompt và phần cắt chuỗi của auto-title thành provider thứ ba của dịch vụ.** Provider first-message-llm đã tồn tại, cùng nhịp điệu, đã có cam kết prompt qua review, có ghi nhận request bền vững và hàng rào thay thế; dựng thêm một provider gần như giống hệt chỉ là trùng lặp.

**Chỉ dùng prompt đầu tiên đã cắt ngắn, hoặc chỉ dùng tiêu đề từ mô hình.** Phương án dự phòng tất định có thể cấp tiêu đề ngay lập tức và miễn phí, còn provider mô hình tùy chọn có thể nâng chất lượng mà không làm trễ lượt chính. Ép buộc chọn một trong hai chiến lược sẽ xóa mất lựa chọn triển khai này.

**Đưa tiêu đề từ mô hình thành hành vi mặc định của TUI, hoặc chặn lượt đầu tiên để chờ nó.** Chi phí và định tuyến thuộc về tổ hợp, và độ trễ của tiêu đề phụ trợ không được phép lọt vào đường tới hạn tương tác. TUI chỉ tiêu thụ trạng thái đã được chấp nhận, không sở hữu chiến lược sinh tiêu đề.

**Đổi tên cửa sổ tmux, hoặc dùng một chuỗi escape terminal khác.** Không chọn, vì nhánh OSC 0 của bộ adapter terminal hiện có đã đủ để đánh dấu pane hoặc tab, không cần chiếm quyền sở hữu tmux, cũng không cần thêm một API điều khiển thứ hai.

## Kiểm chứng

Các bài kiểm thử TUI cố định việc tiêu thụ `session/title` sau khôi phục và theo thời gian thực, việc render tiêu đề an toàn cho terminal, tiêu đề dự phòng đã cấu hình, cùng việc không tồn tại nhánh mô hình riêng của TUI. Bài kiểm thử khói PTY không cần khóa khởi động tổ hợp thật, nhận tiêu đề từ provider đã ghi log, và quan sát tiêu đề terminal sinh ra từ đó. [Quyết định tiêu đề dựa trên log](../feature/2026-07-21-log-backed-session-titles.md) sở hữu độ phủ cho provider, persistence, khôi phục, fork, hủy và kết quả hoàn tất lỗi thời.

## Ảnh hưởng

Đường ống tiêu đề duy nhất là bền vững, phát lại được, hiển thị với mọi bên tiêu thụ, và được dịch vụ bảo vệ khỏi việc kết quả hoàn tất lỗi thời có hiệu lực. TUI không còn nhánh tiêu đề streaming qua `llm`. Muốn nâng chất lượng tiêu đề từ mô hình thì phải nạp plugin provider trong tổ hợp; bản triển khai không nạp sẽ giữ phương án dự phòng tất định. Tiêu đề terminal luôn dùng dạng hậu tố `<title> — <product>`.
