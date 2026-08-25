# Agent Note: Cung cấp các con số thống kê toàn phiên qua projection sessionStats

Status: implemented

[English](2026-08-12-full-session-turn-step-counts.md) | Tiếng Việt

## Vấn đề

Mỗi con số không phải token trong thanh thống kê chat của Web đều được quy đổi từ cửa sổ session mà `StatsLine` đã tải (`deriveStats` duyệt `chat.legacy.nodes`): số đếm "N lượt · M bước", thời gian tường LLM và tool, trung bình TTFT/thông lượng. Lịch sử được phân trang mỗi trang 50 tin nhắn, nên mỗi lần bấm "tải thêm lịch sử cũ hơn", cửa sổ mở rộng ra và mọi con số tăng theo — 7 lượt · 44 bước biến thành 10 lượt · 89 bước sau khi lật thêm một trang, thời lượng LLM cũng tăng tương tự. Kỳ vọng sản phẩm là các con số toàn phiên không phụ thuộc vào việc client đã tải bao nhiêu lịch sử. Sổ sách token trong cùng thanh thống kê đó đã dùng đúng kiến trúc từ trước: một projection bền vững `tokenUsage`.

## Quyết định

Plugin hàm mới `@deepseek-ai/dsh-session-stats` đăng ký đơn vị projection `sessionStats` trên `ctx.sessionProjections`, được mount như một dòng bundle web-app. Giá trị mang toàn bộ tập con số không phải token của thanh thống kê — `{ turns, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens }`, tên trường khớp một-một với cách quy đổi cửa sổ để có thể hoán đổi trọn vẹn. `steps` đếm sự kiện `step/end`, `turns` đếm số turn khác nhau có chứa ít nhất một sự kiện đó (số turn tăng đơn điệu, chỉ cần một ô `lastTurn` là đủ); `llmMs` cộng dồn từ `step/start` → `assistant/message`; TTFT ghi lại chunk delta không rỗng đầu tiên của mỗi bước (được giữ lại sau `llm/retry` trong cùng bước, khớp với `resetForRetry` của cửa sổ); thời lượng decode bao phủ từ token đầu tiên → tin nhắn đã lắp ráp xong, chỉ tính các bước có báo cáo usage; `toolMs` ghép cặp `tool/call` → `tool/result` theo callId, các lệnh gọi chưa giải quyết bị loại bỏ khi `turn/end`. Predicate token đầu tiên `isTokenDelta` được chuyển vào `@deepseek-ai/dsh-llm/message` (cùng chỗ với kiểu `StreamChunk` mà nó phân biệt), việc quy đổi ở Host và việc đo thời gian ở client dùng chung một cài đặt; client-runtime chuyển tiếp export này. Việc phân phối tái sử dụng hoàn toàn các đường projection sẵn có — khối trang cuối lịch sử, frame đẩy `session/projection`, hàng danh sách — apiproxy, wire schema và client runtime không thay đổi gì. `StatsLine` đọc `useProjection('sessionStats')`, khi key là undefined (lắp ráp không tổ hợp đơn vị này) thì toàn bộ rơi về quy đổi theo cửa sổ. Client connection fixture, theo nguyên tắc "phản chiếu mỗi key đã tổ hợp" sẵn có, cài đặt song song cách quy đổi này bằng `sessionStatsOf`.

Sự kiện đếm chọn `step/end` thay vì `assistant/message`, xuất phát từ hai vấn đề đúng đắn phát hiện được khi review phương án trực giác (đếm theo tin nhắn):

1. Bước max-tokens sẽ thêm một `assistant/message` nội dung rỗng chỉ để chứa usage, không bao giờ xuất hiện trên surface; đếm theo tin nhắn sẽ tính vào cả bước không thấy trên transcript.
2. Bước bị hủy sẽ dừng trước khi lắp ráp tin nhắn (hoàn toàn không có `assistant/message`), nhưng client sẽ tổng hợp một node assistant bị interrupted có thể nhìn thấy; đếm theo tin nhắn sẽ âm thầm bỏ mất các bước bị hủy vốn thường gặp.

`step/end` được thêm đúng một lần trong `finally` của vòng lặp cho mỗi bước đi vào, nên các bước hoàn thành, thất bại, bị hủy, max-tokens đều rơi vào đúng một lần đếm — và việc đếm tiến triển tại thời điểm bước quyết toán, cùng thời điểm với quy đổi cửa sổ, nên hành vi trong lúc live-stream không đổi.

## Phương án thay thế

**Đếm sự kiện `assistant/message`.** Bị phủ quyết vì hai lỗi đúng đắn nêu trên (đếm thừa tin nhắn host chỉ chứa usage, đếm thiếu bước bị hủy).

**Đếm sự kiện `step/start`.** Độ bao phủ tương đương (nó đến trước mỗi `step/end`), nhưng việc đếm sẽ tiến triển tại thời điểm bước bắt đầu thay vì lúc quyết toán — một thay đổi hành vi live-stream có thể nhìn thấy nhưng không mang lại lợi ích gì; vị trí `finally` của `step/end` cho cùng độ đầy đủ.

**Đăng ký đơn vị vào `core/agent-loop` (bên phát sinh sự kiện).** Vòng lặp là trục sản phẩm chính; đưa read model của UI vào đó sẽ khiến mọi lắp ráp phải phụ thuộc session-projection, vi phạm nguyên tắc "dùng plugin thay vì sửa vòng lặp" và "tổ hợp mặc định không kèm tùy chọn".

**Đăng ký đơn vị vào `token-meter` (đơn vị hiện có quy đổi cùng lô sự kiện).** Đếm lượt/bước không phải là độ đo token; mỗi key projection nên nằm trong package sở hữu lĩnh vực của nó.

**Quy đổi toàn bộ log ở phía client.** Client theo thiết kế chỉ giữ cửa sổ đã phân trang; quy tắc "không quy đổi ở client" của RFC projection chính là để các con số sống sót qua phân trang, compaction và cold read.

**Giữ thời gian tường, TTFT và thông lượng theo khẩu độ cửa sổ, hiểu là "những gì đang có trên màn hình".** Bị phủ quyết: cùng vấn đề phân trang cũng rơi vào thời lượng LLM, và số đếm toàn phần lẫn thời gian theo cửa sổ trộn trong cùng một thanh thống kê đọc lên là một bộ số tự mâu thuẫn. Projection mang theo toàn bộ tập hợp đầy đủ, quy đổi theo cửa sổ giáng cấp thành phương án dự phòng khi không có đơn vị.

## Hậu quả

Thanh thống kê hiển thị con số toàn log ngay từ trang cuối đầu tiên; lật trang không còn thay đổi bất kỳ nhóm số nào. Các khác biệt biên đã xác định so với ngữ nghĩa cửa sổ cũ được ghi trong README của package: các bước không tạo ra output nhìn thấy (thất bại trước khi có nội dung) vẫn được tính; các bước bị gián đoạn bởi crash vẫn được tính sau khi tải lại, khôi phục qua `step/end` tổng hợp được ghi bù (`interruptedTurnClosers`); các bước bị hủy được đếm nhưng không tính thời gian (không lắp ráp được tin nhắn); tin nhắn host chỉ chứa usage của max-tokens đóng góp thời gian model không nhìn thấy trên surface. Mỗi trang cuối và hàng danh sách của web mang thêm một key nhỏ, và trạng thái nội bộ của đơn vị thay đổi tại ranh giới bước và tại chunk token đầu tiên, luồng thay đổi sẽ phát thêm vài frame giá trị giống nhau mỗi bước; các lắp ráp TUI và headless không cung cấp key `sessionStats`, bên tiêu thụ của chúng rơi về quy đổi theo cửa sổ. Hai e2e (`chat-scroll-contract`, `complex-history.perf`) từng dùng thanh thống kê như một phép dò cửa sổ đã tải, nay đổi sang đếm dòng luồng tin nhắn đã mount/footer turn-tail. Kịch bản web `stats-paged-history` seed nguội một log 28 lượt, chốt việc cả thanh thống kê đọc ra con số toàn phần ngay trên trang cuối chưa đầy đủ, và không đổi trước/sau khi "tải thêm lịch sử cũ hơn".
