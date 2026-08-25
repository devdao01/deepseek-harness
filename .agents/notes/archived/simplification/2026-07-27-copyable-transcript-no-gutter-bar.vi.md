# Agent Note: Transcript TUI sao chép được, không còn gutter bar

Status: implemented
Archived: 2026-08-04

[English](2026-07-27-copyable-transcript-no-gutter-bar.md) | Tiếng Việt

## Problem

Trước đây TUI nhóm prompt của người dùng và thẻ công cụ phía sau một gutter bar màu bên trái (`▌ `); thanh dọc đó được thêm vào đầu từng dòng nội dung, đồng thời thụt toàn bộ khối assistant và khối hệ thống vào một cột. Cả hai đều là tiền tố theo dòng: khi kéo chuột chọn vùng trên transcript, phần `▌ ` hoặc khoảng trắng đầu dòng của mỗi dòng cũng bị chọn theo, nên sao chép một tin nhắn, một đoạn đầu ra công cụ hay một khối mã đều dính ký tự trang trí và người dùng phải tự dọn tay. Nhưng thanh dọc đó lại là dấu phân tách theo từng tin nhắn duy nhất trong transcript, nên không thể xóa thẳng khi chưa có cách phân biệt khác.

## Decision

Transcript không còn bất kỳ tiền tố theo dòng nào. Tin nhắn chỉ được phân tách bằng tiêu đề vai trò in đậm gạch chân được render theo màu của vai trò, cùng các dòng trống mà terminal vốn đã tự chèn trước và sau mỗi khối. Gạch chân giúp mỗi vai trò có một dải phân định thị giác rõ ràng mà không cần tô nền, nên đọc được trên mọi bảng màu terminal và không bao giờ lọt vào clipboard:

- Prompt người dùng và prompt steering (`UserMessageComponent`) chuyển thành `Container` thường: một dòng tiêu đề `You` / `Steering` in đậm, gạch chân, dùng màu nhấn (sinh ra qua hàm trợ giúp dùng chung `messageHeader`), sau đó là thân prompt đặt ở cột 0.
- Khối assistant render một dòng tiêu đề `Assistant` in đậm gạch chân, sau đó cả phần reasoning lẫn văn bản đều render ở cột 0, dòng timing nằm ở cuối khối (phần thụt lề `paddingX = 1` trước đây đã bị bỏ).
- Thẻ công cụ bỏ lớp bọc `GutterBox`. Trạng thái thẻ (đang chạy / lỗi / thành công) tô màu cho cả dòng tiêu đề — glyph trạng thái (`◌` / `✕` / `✓`) dùng chung một màu với văn bản tiêu đề, đồng thời in đậm và gạch chân giống tiêu đề vai trò — thay vì một thanh dọc màu đặt cạnh tiêu đề không tô màu. Thân thẻ render không tiền tố; các dòng thân vẫn đi qua `Text` theo bề rộng terminal, để đầu ra công cụ thô quá dài xuống dòng thay vì tràn.
- Lớp `GutterBox` đã bị xóa; không nơi nào khác dùng nó.

Giờ đây khi chọn vùng ở bất kỳ khu vực nào nói trên, phần sao chép được chính là văn bản tin nhắn.

## Alternatives considered

- **Chỉ giữ thanh dọc trên tin nhắn người dùng và bỏ ở thẻ công cụ** — vẫn khiến đầu ra công cụ, thứ bị sao chép nhiều nhất, tiếp tục bị nhiễm bẩn. Bác bỏ: mục tiêu là làm cho toàn bộ transcript sao chép được.
- **Chỉ thêm một đường ngang phía trên hoặc một thanh dọc trên dòng tiêu đề** — thân tin nhắn sao chép sạch, nhưng khi chọn tiêu đề vẫn dính một glyph, mà so với tiêu đề vai trò gạch chân thì không đem lại thêm khả năng phân biệt nào, lại đưa ký tự trang trí quay về.
- **Dùng thụt lề thay thanh dọc để thụt thân nội dung đã nhóm** — khoảng trắng đầu dòng vẫn lọt vào clipboard, không giải quyết được vấn đề sao chép; đã loại rõ ràng.
- **Dùng dải nền được tô đầy trên tiêu đề** (đảo màu, hoặc nền dịu 256 màu) — cho mỗi vai trò một mảng màu mạnh, nhưng nền ANSI bão hòa nhìn quá nặng, và 256 màu là màu cố định chứ không ánh xạ lại theo chủ đề. Gạch chân đem lại đúng khả năng phân biệt theo vai trò đó theo cách nhẹ hơn nhiều.

## Consequences

- Sao chép rồi dán từ transcript không cần người dùng xử lý hậu kỳ gì. Đây chính là lợi ích cốt lõi của thay đổi này.
- Transcript phẳng hơn so với bố cục gutter bar, nhưng mỗi vai trò có tiêu đề in đậm gạch chân render theo màu vai trò cộng dòng trống phân tách, đủ giữ ranh giới tin nhắn rõ ràng mà không cần đệm ở lề trái. Trạng thái thẻ công cụ vẫn dễ đọc nhờ glyph và tiêu đề có màu, gạch chân.
- Viền dạng bảng (`│`) trên các lớp phủ tạm thời (bảng trạng thái, bộ chọn mô hình, danh sách khôi phục) giữ nguyên. Chúng không thuộc nội dung tin nhắn của transcript và hiếm khi bị sao chép.
- Các snapshot `*.expected.txt` của TUI keyless bị ảnh hưởng đều đã ghi lại qua phát lại fixture (không cần khóa API; phiên LLM được ghi không đổi, chỉ khác phần render). Việc khởi động tương tác và một lượt prompt khứ hồi đã được kiểm chứng trong tmux.
