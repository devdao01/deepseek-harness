# Agent Note: Thay trình phân tích SSE viết tay trong llm-deepseek bằng eventsource-parser

Status: implemented
Archived: 2026-08-07

[English](2026-07-26-eventsource-parser-for-deepseek-sse.md) | Tiếng Việt

## Vấn đề

`packages/llm/llm-deepseek/src/sse.ts` từng tự hiện thực việc phân tích SSE (Server-Sent Events): một `TextDecoder` dạng streaming, cắt khối sự kiện theo `\r?\n\r?\n`, trích và nối tải trọng `data:`, bỏ qua chú thích cùng các trường khác, dấu hiệu `[DONE]`, ném lỗi `STREAM_CLOSED` khi gặp EOF mà chưa thấy dấu hiệu, và flush khối sự kiện cuối cùng chưa kết thúc. File này khoảng 67 dòng, kèm khoảng 108 dòng kiểm thử riêng (`tests/sse.spec.ts`) kiểm lại các hành vi theo đặc tả SSE — ký tự UTF-8 bị cắt qua nhiều mảnh, xử lý CRLF, nối nhiều dòng `data:`, không có khoảng trắng sau dấu hai chấm — những hành vi mà một trình phân tích được bảo trì liên tục vốn đã bảo đảm. Bên tiêu thụ duy nhất của nó là `adapter.ts` (`yield* translate(parseSse(response.body))`).

Đây đúng là phần giao diện mà `eventsource-parser` đảm nhiệm: trình phân tích SSE tiêu chuẩn trên thực tế (cả Vercel AI SDK lẫn MCP SDK đều xây trên nó), không dependency, được bảo trì liên tục, và vốn đã xuất hiện trong lockfile của kho mã này như một dependency bắc cầu qua `@modelcontextprotocol/sdk` — nên việc dùng thẳng nó thực chất không làm tăng diện tiếp xúc chuỗi cung ứng.

## Quyết định

`sse.ts` ủy thác việc chia khung SSE cho `EventSourceParserStream` của `eventsource-parser/stream`: `parseSse` lần lượt nối body của response qua `new TextDecoderStream()` rồi `new EventSourceParserStream()`, chỉ giữ lại lớp đệm cho giao thức DeepSeek — sinh ra `data` của từng sự kiện, kết thúc khi gặp `[DONE]`, và ném `LlmError('STREAM_CLOSED')` nếu luồng kết thúc mà chưa thấy dấu hiệu. Toàn bộ năng lực tích hợp sẵn cần dùng (`TextDecoderStream`, `pipeThrough`, `ReadableStream` duyệt bất đồng bộ được) đã có sẵn ở cận dưới engine Node ^22.19. Các bài kiểm thử tuân thủ đặc tả đã bị xóa; `tests/sse.spec.ts` chỉ cố định cam kết `[DONE]`/`STREAM_CLOSED`/EOF. `eventsource-parser` là dependency runtime thứ hai của `llm-deepseek` sau schemastery. [Agent Note về cặp adapter song sinh](../architecture/2026-06-13-twin-llm-adapters.md) từng mô tả adapter này là "fetch viết tay + phân tích SSE" cùng JSDoc của `dsh-llm` nay mô tả nó là fetch trực tiếp cộng SSE chia khung bằng thư viện.

Thư viện này còn bóc BOM ở đầu luồng (trình phân tích viết tay sẽ không khớp được `data:` sau BOM) và cung cấp năng lực gia cố `maxBufferSize` mà trình phân tích viết tay thiếu.

## Các phương án đã cân nhắc

- **Giữ trình phân tích viết tay.** Theo [quyết định về cặp adapter song sinh](../architecture/2026-06-13-twin-llm-adapters.md), lựa chọn này có chỗ để biện hộ: adapter đó cố ý đóng vai trò song sinh viết tay để kiểm chứng thiết kế của adapter pi-ai. Nhưng ranh giới nâng đỡ lập luận trong Agent Note đó nằm giữa "tự nắm phần nội bộ fetch/translate" và "ủy thác cho một SDK nhà cung cấp đầy đủ"; một trình phân tích SSE tí hon khoảng 700 byte thuộc về đường ống tầng vận chuyển, không phải bản thân thiết kế đang được kiểm chứng. Agent Note về cặp adapter song sinh nay đã ghi rõ cách hiểu này.
- **Dùng API callback `createParser({onEvent})` thay vì stream.** Kết hợp với vòng lặp `TextDecoder` thủ công thì vẫn chạy được, nhưng cách tổ hợp bằng `pipeThrough` xóa được nhiều mã viết tay hơn.

## Hệ quả

- Lớp đệm còn lại chỉ mã hóa giao thức `[DONE]`/`STREAM_CLOSED` của DeepSeek; các tình huống biên của việc chia khung SSE thuộc cam kết của eventsource-parser, không còn được kiểm lại ở đây.
- Đã từ bỏ một chỗ lệch chuẩn có chủ đích vì độ bền: trình phân tích viết tay sẽ flush khối sự kiện cuối cùng thiếu dòng trống kết thúc, nên `data: [DONE]` ở cuối vẫn sinh ra DONE dù không có `\n\n`. eventsource-parser tuân thủ đặc tả nghiêm ngặt, chỉ phát sự kiện tại dòng trống, nên hình thái này giờ là `STREAM_CLOSED`. Các nhà cung cấp thật và `dsh-llm-mock-server` luôn kết thúc sự kiện đúng cách — phần flush đó chỉ là điểm cộng về độ bền chứ không phải hình thái nhà cung cấp từng quan sát thấy — và `tests/sse.spec.ts` cố định phán quyết cắt cụt mới cho phần đuôi đó.
- Danh tính "viết tay" được ghi nhận của cặp adapter song sinh thu hẹp lại còn phần nội bộ fetch/translate; Agent Note về cặp adapter song sinh được cập nhật trong cùng lần thay đổi, thay vì để tuyên bố đó cũ đi.
