# Agent Note: Luồng chat hiển thị lượt kết thúc bởi max-tokens

Status: implemented

[English](2026-08-12-max-tokens-turn-end-notice.md) | Tiếng Việt

## Vấn đề

agent loop đã ghi nhận `max-tokens` là một lý do `turn/end` riêng biệt, nhưng chưa có bề mặt người dùng nào tiêu thụ nó. Trong luồng chat trên Web, chỉ `reason.kind === 'error'` mới sinh ra node hội thoại, còn cơ chế dự phòng cho bề mặt không xác định (unknown-surface) chỉ tiếp quản các sự kiện append-surface, nên những lượt bị nhà cung cấp cắt ngang tại giới hạn output không để lại dấu vết nào có thể nhìn thấy: câu trả lời bị cắt trông giống hệt như một câu trả lời hoàn tất bình thường, người dùng không có cách nào biết vì sao phiên chạy lại dừng lại (issue #1522).

## Quyết định

Thêm một Definition node hội thoại `turn-max-tokens`, khớp với `turn/end` có `reason.kind === 'max-tokens'`, sinh ra tại vị trí lượt đó một dòng chat được lưu bền: một StateDot ở trạng thái warning, tiêu đề đã bản địa hóa, cùng hướng dẫn giải thích rằng output bị cắt vẫn được giữ lại, và gửi "tiếp tục" có thể cho phép tiếp tục output ở một lượt mới. Node chỉ được suy ra từ các sự kiện session đã lưu bền, nên việc tải lại, khôi phục và phát lại lịch sử đều tái tạo ra kết quả hoàn toàn nhất quán. Gợi ý không hiển thị bất kỳ con số token nào: bản thân sự kiện không mang theo số lượng, và gợi ý cũng không được phép giả mạo dữ liệu ngân sách mà nhà cung cấp chưa báo cáo.

Renderer được đăng ký như mọi dòng chat khác, dưới slot `conversation.chat.node` phân phối theo kind, và projection chat-snapshot kiểu cũ (legacy) cũng bao gồm node này. Lịch sử fixture được bổ sung một lượt mẫu max-tokens (lượt 72, lượt hình ảnh và lượt todo dịch chuyển thành 73, 74), kèm một snapshot keyless đã lắp ráp để chốt (pin) trạng thái chấm tròn, tiêu đề và nội dung hướng dẫn — bất kỳ hồi quy nào khiến max-tokens bị định tuyến trở lại kiểu hiển thị lỗi hoặc lại im lặng như trước đều sẽ làm thay đổi golden.

## Các phương án đã cân nhắc

**Thêm một nhánh max-tokens vào `turn-error`** — bị bác bỏ: tiêu chí nghiệm thu của issue #1522 yêu cầu max-tokens không được hiển thị như một lỗi provider thông thường; dùng chung node sẽ ghép chặt hai kiểu hiển thị với nhau, trong khi dữ liệu mà hai lý do này mang theo lại khác nhau (một loại có payload lỗi, loại kia thì không).

**Dùng đánh dấu turn-tail thay cho một dòng chat riêng** — bị bác bỏ: turn-tail hiển thị thông tin kết thúc của một lượt đã hoàn tất, thao tác của nó sẽ bị thu gọn ở các lượt sau, trong khi gợi ý về việc bị cắt phải ở lại đúng lượt bị cắt đó, và phải xem được trong lịch sử mà không cần tương tác.

**Đặt nút tiếp tục hoặc thử lại trên gợi ý** — tạm hoãn: ngữ nghĩa của việc khôi phục output chưa được xác định (mở lượt mới hay tiếp tục cùng lượt, quy tắc giữ lại output cũ), và issue #1522 đã nói rõ loại bỏ điều này khỏi phạm vi; nội dung hướng dẫn đã đưa ra bước tiếp theo an toàn, không cần phải chốt trước một cam kết thao tác.

## Hệ quả

Việc kết thúc do max-tokens giờ đây hiển thị được, đã bản địa hóa, và được phân biệt rõ ràng với lỗi cũng như hoàn tất bình thường, trong cả luồng thời gian thực, khi tải lại và khi phát lại. Việc đánh số lại fixture cần cập nhật hai chú thích phụ thuộc vào snapshot, và các thay đổi chốt số lượt fixture sau này phải đếm theo bố cục mới. Các bề mặt ngoài luồng chat Web (ACP và các bên tiêu thụ SDK) vẫn ánh xạ lý do này theo cách hiển thị riêng của chúng, không thay đổi trong lần này.
