# Agent Note: Completion rỗng từ model là lỗi EMPTY_RESPONSE có thể retry

Status: implemented

[English](2026-07-24-empty-model-response-is-retryable.md) | 中文

## Vấn đề

Provider đôi khi trả về một completion suy biến: bản thân stream có định dạng đúng, kết thúc với `stop` mang tính chung cuộc, nhưng không có bất kỳ content block nào — không văn bản, không reasoning (suy luận), không tool call. Nếu adapter ánh xạ dạng này thành kết thúc `{kind: 'stop'}` thành công, main loop sẽ ghi lại một `assistant/message` rỗng, và kết thúc lượt đó với `completed`. Hệ thống sẽ không retry, lỗi cũng không lộ ra cho bên gọi, còn các driver như goal-round-driver sẽ tiêu tốn một Round mà không đạt được tiến triển nào.

## Quyết định

Adapter sẽ phân loại phản hồi "đã hoàn thành nhưng rỗng" thành một lỗi ranh giới phía provider, còn chính sách retry sẽ coi đó là vấn đề tạm thời:

- `dsh-llm` xuất mã quy chuẩn `EMPTY_RESPONSE_CODE` (`'EMPTY_RESPONSE'`) bên cạnh `CONTEXT_WINDOW_EXCEEDED_CODE`/`QUOTA_EXCEEDED_CODE`.
- `dsh-llm-pi-ai` (`mapStopReason`): khi message assistant tương ứng với `stop` mang tính chung cuộc không có content block nào, nó sẽ trở thành `finish {kind: 'error'}` mang mã này. Việc phát hiện tràn ngữ cảnh (context overflow) vẫn được ưu tiên trong phạm vi áp dụng của nó (nó được kiểm tra trước, và cũng là phân loại có thể hành động hơn).
- `dsh-llm-deepseek` (`translate`): tại `[DONE]`, nếu kết thúc bằng `stop` (hoặc thiếu) mà chưa từng mở block nào, cũng trở thành kết thúc lỗi này. Stream chỉ chứa reasoning được tính là có nội dung, vẫn coi là thành công.
- Giá trị mặc định retry thông thường do provider định nghĩa bao gồm `EMPTY_RESPONSE`: lần thử này không tạo ra bất kỳ nội dung lưu bền nào, do đó lặp lại nó là an toàn; triển khai vẫn có thể loại nó khỏi `retryableCodes`, và `dsh-llm-retry` sẽ thực thi chính sách đã phân giải.

Việc phát hiện chỉ giới hạn ở kết thúc `stop`. Nội dung rỗng với `max-tokens` giữ nguyên ý nghĩa hiện có (pi-ai đã chuẩn hóa tình huống tràn output bằng không), `tool-calls` trên thực tế không thể là block rỗng, còn kết thúc kiểu error/aborted vốn đã tính là thất bại.

Cách phân loại này dùng cơ chế main loop hiện có — `finishError` → `agent/request-error` → `dsh-llm-retry` — và giữ cho `agent-loop` không phụ thuộc provider. Khi ngân sách retry cạn, lượt đó sẽ kết thúc bằng thất bại `EMPTY_RESPONSE` tường minh, thay vì kết thúc thành công mà không có nội dung.

## Các phương án đã cân nhắc

**Phát hiện trong main loop hoặc `BlockAssembler`.** Chỉ cần một bản triển khai dùng chung, nhưng điều này sẽ đưa việc phán đoán về phản hồi provider vào main loop, vi phạm nguyên tắc "ưu tiên plugin, không sửa main loop", và assembler là thuật toán lắp ráp thuần túy. Adapter mới là nơi chuyển hóa sự thật ở tầng giao thức thành phân loại của harness, và việc phân loại lại tràn ngữ cảnh chính là tiền lệ chính xác cho việc này.

**Làm một plugin chuyển đổi stream trên waterfall (chuỗi thác) `llm/stream`.** Cách này không phụ thuộc provider và chỉ cần một bản triển khai, nhưng nó thêm một gói và phần đấu nối riêng cho "một sự thật ranh giới mà mỗi adapter chỉ cần vài dòng để khai báo", và hành vi bật mặc định vẫn cần sửa từng bundle.

**Coi phản hồi chỉ chứa khoảng trắng hoặc chỉ chứa reasoning cũng là phản hồi rỗng.** Bị bác bỏ vì thiết kế thừa: loại phản hồi này mang nội dung do model tạo ra, việc coi nhầm một phản hồi hợp lệ (dù vô dụng) thành lỗi truyền tải sẽ gây ra vòng lặp retry ở những model cố tình dừng sau reasoning. Phạm vi được giới hạn nghiêm ngặt ở "không content block nào".

## Hệ quả

- Một provider gặp sự cố ngẫu nhiên sẽ tiêu tốn một lần retry có giới hạn, thay vì một lượt không có output; một model liên tục trả về nội dung rỗng sẽ tạo ra lỗi lượt `EMPTY_RESPONSE` mà người dùng có thể hành động dựa vào.
- Một model thực sự có ý định không nói gì (hiếm gặp, nhưng có thể xảy ra sau một kết quả tool) sẽ bị retry, nếu luôn rỗng thì lượt đó thất bại. Đây là đánh đổi đã được cân nhắc kỹ và chấp nhận: một message assistant rỗng không thể phân biệt được với lỗi provider, và không có giá trị gì với người dùng.
- Snapshot `empty-response-retry` ACP (Agent Client Protocol) (một kịch bản keyless được viết thủ công, kèm overlay retry xác định không dao động 1 ms, `examples/acp-agent/retry.cordis.yml`) chốt hành vi khả kiến với sản phẩm: sự kiện `llm/retry` lưu bền, các lần thử bị bỏ không tạo ra bất kỳ output ACP nào, phản hồi sau khi khôi phục, và một lượt hoàn thành bình thường.
