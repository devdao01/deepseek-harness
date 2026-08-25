# Agent Note: Gộp sự kiện session chỉ dùng để trace vào sự kiện mang chức năng thực

Status: implemented

[English](2026-06-20-collapse-trace-only-session-events.md) | 中文

## Vấn đề

Từ vựng sự kiện session chứa một số sự kiện hạng nhất không thuộc lịch sử hội thoại có thể replay, và hầu như không có bên tiêu thụ nào trong production. `usage` đã tồn tại dưới dạng phân mảnh (chunk) stream của model, sau đó loop lại append thêm một sự kiện `usage` độc lập. `error` trùng lặp với nguyên nhân thất bại của loop trong `turn/end { kind: 'error', message, code }`; việc settle của ACP (Agent Client Protocol) đọc lý do kết thúc turn, còn cả message projection lẫn UI projection đều bỏ qua sự kiện `error` độc lập.

Những sự kiện này khiến transcript (bản ghi văn bản) canonical trông có vẻ phù hợp làm telemetry hơn thực tế. Chúng làm tăng thêm event variant, invariant, test, snapshot và use case persistence, nhưng bản thân không mang chức năng thực khi ghi độc lập. Sự kiện chúng mang vẫn có ích: token usage nên được giữ lại để hạch toán, số thứ tự step của lỗi cũng không nên âm thầm biến mất. Cách đơn giản hóa là gộp các sự kiện này vào sự kiện lân cận mà bên tiêu thụ vốn đã phải hiểu, chứ không phải giảm bớt lượng thông tin được ghi lại.

## Quyết định

Chỉ loại bỏ sự kiện độc lập chỉ dùng để trace khi thông tin đã được giữ lại, không cần ghi song song:

- Usage của step thành công được gộp vào `assistant/message` khớp (`assistant/message { turn, step, content, usage? }`), để output model đã lắp ráp cùng thông tin hạch toán của nó được truyền đi cùng nhau.
- Step thất bại hoặc bị hủy nếu có usage nhưng không có nội dung assistant, thì usage sẽ đặt trên một `assistant/message { content: [], usage }` với nội dung rỗng — không có chunk usage nào đã persist mà không có chỗ để đặt. Trường hợp điển hình cần đảm bảo thông tin không mất là đường max-tokens: một step bị cắt có usage nhưng nội dung rỗng (ví dụ chỉ có một tool call bị bỏ), trước đây sẽ phát ra `usage` độc lập. Để tránh sự kiện nội dung rỗng bơm thêm một turn assistant không nội dung thừa vào transcript của provider, `deriveMessages()` bỏ qua sự kiện `assistant/message` có nội dung rỗng; test hồi quy khẳng định usage vẫn được ghi lại, và lịch sử suy ra không bị phá vỡ.
- Số thứ tự step trong sự kiện `error` độc lập được gộp vào `turn/end.reason` (khi `kind: 'error'`: `{ kind: 'error', step, message, code? }`) — `turn/end` là kết quả turn bền vững mà ACP và cơ chế khôi phục đã tiêu thụ sẵn.
- `agent/error` cùng log được giữ lại cho chẩn đoán thời gian thực; sau `turn/end` không còn bản ghi lỗi log session thứ hai.

Log hội thoại của người dùng chứa đầy đủ thông tin cần cho render, khôi phục, audit và hạch toán, bên tiêu thụ không cần phối hợp các dòng trace trùng lặp.

## Phương án thay thế từng cân nhắc

**Giữ dòng độc lập làm telemetry** — các sự kiện này khiến transcript canonical trông có vẻ phù hợp làm telemetry hơn thực tế, với cái giá là làm tăng event variant, invariant, test, snapshot và use case persistence, mà không có bên tiêu thụ nào sử dụng. Nếu nhu cầu phân tích thực sự xuất hiện, hình thức đúng đắn là một công cụ hỗ trợ projection hoặc kho telemetry chuyên dụng với chính sách giữ lại (retention) riêng, chứ không phải dòng trace trùng lặp trong log hội thoại.

## Xác minh

`SessionEventMap` không còn `usage` hay `error` độc lập; agent loop (vòng lặp agent) không còn append sự kiện usage độc lập, và ghi nhận thất bại bền vững qua `turn/end { kind: 'error', step, message, code? }`; test snapshot và persistence của ACP khẳng định không tồn tại dòng chỉ dùng để trace; fixture (dữ liệu tiền đề test) đã ghi dùng hình dạng sự kiện mới, phiên bản định dạng session cố định ở `0` (backend từ chối theo chính sách định dạng tiền phát hành với bất kỳ log đã lưu nào có phiên bản khác `0`); tài liệu mô tả rõ vị trí quan sát token usage và lỗi runtime.

## Hệ quả

Bên tiêu thụ không thể lọc dòng `usage` hay `error` cấp step độc lập từ log canonical nữa, mà phải đọc các sự kiện này từ message assistant hoặc sự kiện thất bại mang chúng. Vì cùng một sự kiện vẫn tồn tại — mục "Xác minh" đã chứng minh — đây là một cách đơn giản hóa hợp lý.

## Ghi chú triển khai

**Phiên bản định dạng.** Thay đổi này ảnh hưởng đến sự kiện đã persist, nhưng định dạng session tiền phát hành vẫn cố định ở `0`, từ chối mọi phiên bản khác và không migrate. `dsh-session` sở hữu hằng số mà bên ghi và xác minh khi load dùng chung. Phiên bản định dạng tăng đơn điệu sẽ bắt đầu từ lần phát hành chính thức đầu tiên.

Usage giờ được quan sát qua `assistant/message.usage`; số thứ tự step của lỗi runtime được quan sát qua `turn/end.reason` (khi `kind: 'error'`). `agent/error` cùng log dùng cho chẩn đoán thời gian thực, giữ nguyên không đổi.
