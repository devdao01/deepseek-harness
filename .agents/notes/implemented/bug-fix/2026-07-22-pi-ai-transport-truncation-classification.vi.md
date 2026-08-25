# Agent Note: Phân loại cắt cụt tầng truyền tải của pi-ai từ văn bản thông điệp đã làm phẳng

Status: implemented

[English](2026-07-22-pi-ai-transport-truncation-classification.md) | 中文

## Vấn đề

Một lần chạy TUI có kết nối model bị đứt giữa chừng khi đang streaming, chỉ hiện lên một thông báo `terminated`, còn một response Anthropic bị cắt cụt thì hiện lên `Anthropic stream ended before message_stop`. Cả hai đều là cắt cụt ở tầng truyền tải — kết nối đứt trước cả sự kiện SSE (Server-Sent Events) kết thúc của provider — thế nhưng `classifyPiAiError` trong `dsh-llm-pi-ai` lại không khớp với trường hợp nào, và cuối cùng rơi vào nhánh dự phòng `PI_AI_ERROR`. Vì `PI_AI_ERROR` không nằm trong `DEFAULT_RETRYABLE_CODES` của `llm-retry` (`RATE_LIMIT`, `SERVER`, `TIMEOUT`, `TRANSPORT`), một lần đứt kết nối có thể khôi phục lại bị xử lý như thất bại vĩnh viễn và không bao giờ được thử lại.

Việc mất chi tiết xảy ra ở phía upstream và không thể khôi phục bên trong adapter: pi-ai rút gọn lỗi bắt được thành `error.message` (`api/anthropic-messages.js`: `errorMessage = error instanceof Error ? error.message : JSON.stringify(error)`) trước khi đẩy sự kiện `error` kết thúc, vứt bỏ `Error` gốc cùng chuỗi `cause` của nó. undici đặt `SocketError` có thể hành động được vào `cause`, nhưng chỉ trao cho lớp bọc fetch một chữ `terminated` trần trụi; pi-ai chỉ giữ lại đúng từ đó. `SimpleStreamOptions` của pi-ai không phơi ra bất kỳ hook fetch/dispatcher/client nào để chúng ta tự bắt `cause` trước khi chi tiết bị làm phẳng.

## Quyết định

- `classifyPiAiError` nhận diện thêm hai cách diễn đạt ở tầng truyền tải, và ánh xạ cả hai thành `TRANSPORT`:
  - đứt socket giữa chừng streaming, biểu hiện dưới dạng `terminated` trần (undici) hoặc `Premature close` (tầng stream của Node);
  - luồng bị cắt cụt trước sự kiện kết thúc, mà mỗi provider của pi-ai lại ném ra một cách diễn đạt khác nhau (`Anthropic stream ended before message_stop`, `… before a terminal response event`, `… ended without a terminal event`, `Stream ended without finish_reason`), được khớp thống nhất theo `stream ended before/without`.
- Bộ phân loại này có kèm một ghi chú `XXX(pi-ai upstream)` nêu đích danh nơi việc làm phẳng xảy ra và mô tả cách sửa mong muốn: nếu một ngày nào đó pi-ai chuyển tiếp `Error` gốc hoặc cung cấp một hook để chúng ta bắt được `cause`, thì chuyển sang phân loại dựa trên `code`/`cause`. Từ giờ đến lúc đó, việc phân loại vẫn là khớp văn bản theo kiểu nỗ lực tối đa.
- `llm-pi-ai/README.md` bổ sung một mục Known-Limitations, ghi lại việc pi-ai làm phẳng chuỗi cause, nên harness code phải phân loại từ văn bản thông điệp.

Việc phân loại vẫn dựa trên văn bản thông điệp, vì đó là tín hiệu duy nhất mà pi-ai bàn giao; `XXX` cho thấy đây là giải pháp tình thế, chứ không phải trạng thái cuối cùng mong muốn.

## Phương án khác đã cân nhắc

**Bắt `cause` qua hook fetch/dispatcher/client của pi-ai.** Bác bỏ: pi-ai 0.81.1 không phơi ra hook nào cả. `StreamOptions` chỉ cung cấp `onPayload`/`onResponse`; `onResponse` kích hoạt trước khi luồng thân response được tiêu thụ, nên không thể quan sát được việc đứt kết nối giữa chừng streaming. Đường Anthropic có nhận một đối tượng `client`, nhưng việc dựng và tiêm một client SDK của provider cho mỗi request chỉ để chặn bắt lỗi truyền tải là vượt qua ranh giới service của adapter chỉ vì một chuỗi chẩn đoán.

**Giữ cả hai ở `PI_AI_ERROR` và nới lỏng tập mã có thể thử lại của `llm-retry`.** Bác bỏ: `PI_AI_ERROR` là nhánh dự phòng cho những thất bại thực sự chưa phân loại, trong đó có cả thất bại không thể thử lại (response dị dạng của provider, bug SDK ngoài dự kiến). Cho nhánh dự phòng trở thành có thể thử lại sẽ khiến hệ thống thử lại những thất bại không bao giờ thành công; cách sửa đúng là phân loại ra đúng trường hợp có thể khôi phục, chứ không phải làm mờ nhóm này.

**Bọc lỗi đã làm phẳng thành `LlmError('TRANSPORT', { cause })` trong adapter, theo mẫu adapter DeepSeek.** Bác bỏ trong trường hợp này: adapter DeepSeek bọc rejection của `fetch` xảy ra trước khi nhận được response, khi `cause` vẫn còn nguyên vẹn, nên việc bọc theo chuỗi giữ được chi tiết thật. Còn trên đường pi-ai, `errorMessage` của sự kiện kết thúc vốn đã là một chuỗi đã làm phẳng không có `cause` nào để nối chuỗi, nên việc bọc chỉ thêm một lớp mà chẳng khôi phục được gì; phân loại ra code là giá trị duy nhất còn có thể bổ sung.

## Hệ quả

- Việc đứt truyền tải giữa chừng streaming và việc luồng bị cắt cụt trước sự kiện kết thúc giờ đều mang `TRANSPORT`, nên policy `llm-retry` được tổ hợp sẽ thử lại chúng theo mặc định, thay vì để lượt đó thất bại.
- Văn bản thông báo không đổi (`terminated` / `Anthropic stream ended before message_stop`): chi tiết cause đã mất trước khi adapter kịp thấy, nên `errorChain` không có gì thêm để hiển thị. Chỉ có `code` được định tuyến là được cải thiện.
- Việc phân loại vẫn dựa vào khớp chuỗi và phụ thuộc vào cách diễn đạt của provider: nếu một phiên bản pi-ai tương lai viết lại cách diễn đạt của các lỗi này, hệ thống sẽ âm thầm quay về `PI_AI_ERROR` cho tới khi mẫu khớp được cập nhật. Ghi chú `XXX` chỉ tới cách sửa bền vững đó (định tuyến dựa trên `code`/`cause` được chuyển tiếp).
