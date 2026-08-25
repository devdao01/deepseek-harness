# Agent Note: Dùng hai LLM adapter làm cặp song sinh xác thực thiết kế

Status: implemented

[English](2026-06-13-twin-llm-adapters.md) | 中文

## Vấn đề

`dsh-llm` sở hữu một bộ từ vựng streaming độc lập với provider: giao thức `StreamChunk` (`block-start`, `text-delta`, `reasoning-delta`, `tool-call-delta`, `block-end`, `usage`, `finish`) cùng các kiểu content block ([từ vựng content block](2026-06-11-content-block-vocabulary.md)). Nếu từ vựng chỉ được định nghĩa dựa trên một adapter duy nhất, sẽ có nguy cơ hành vi đặc thù của adapter đó bị đóng cứng vào quy ước "trung lập": triển khai duy nhất tình cờ làm gì thì cái đó trở thành quy chuẩn trên thực tế; trước khi provider thứ hai xuất hiện, lớp trừu tượng chưa được xác thực — và khi đó, cái giá để sửa sự rò rỉ này đã rất cao.

## Quyết định

Ngay từ đầu, cung cấp **hai** adapter cùng dựa trên một quy ước, được xây dựng có chủ đích trên các triển khai nội bộ khác nhau:

- `dsh-llm-deepseek`: dùng `fetch` trực tiếp + logic dịch trong repo để kết nối với DeepSeek API; việc phân khung SSE (Server-Sent Events) được ủy quyền cho `eventsource-parser` ([quyết định thay thế SSE parser đã được lưu trữ](../archived/simplification/2026-07-26-eventsource-parser-for-deepseek-sse.md)). Đặc trưng "song sinh" nằm ở việc tự nắm giữ logic nội bộ fetch/translate thay vì ủy quyền cho SDK provider đầy đủ, không nằm ở việc tự viết tay ống dẫn transport layer.
- `dsh-llm-pi-ai`: truy cập cùng endpoint đó qua thư viện `@earendil-works/pi-ai` (thư viện này có từ vựng event riêng của nó).

Quy tắc mà cả hai cùng thực thi là: **bất cứ điều gì mà từ vựng StreamChunk không thể diễn đạt đồng thời cho cả hai triển khai, đều là khiếm khuyết của từ vựng cốt lõi** — cần được phơi bày ngay lập tức, thay vì đợi tới khi kết nối provider tiếp theo mới phát hiện ra. Điều này đã xác lập cho cặp adapter song sinh một quy ước hiện được ghi lại trong `dsh-llm/src/types.ts` trên `StreamChunk`: usage được phát ra trước finish, sau finish không còn bất kỳ event nào, `arguments` của tool call luôn được truyền dưới dạng chuỗi JSON thô xuyên suốt, và hai đường lỗi hợp lệ mà consumer phải xử lý ở cả hai bên (`stream()` ném ngoại lệ, *hoặc* kết thúc bằng `finish {kind:'error'|'aborted'}`). Chính sự phân kỳ này được phơi bày nhờ adapter dựa trên thư viện, một adapter fetch trực tiếp duy nhất sẽ che giấu nó.

## Phương án thay thế từng cân nhắc

- **Adapter đơn lẻ**: ít code hơn, chi phí e2e giảm một nửa, nhưng tuyên bố "độc lập với provider" không có cách nào xác thực; từ vựng sẽ âm thầm mã hóa giả định của DeepSeek-via-fetch.
- **mock adapter thứ hai**: rẻ hơn, nhưng không chạm được vào các đặc thù định dạng giao thức (wire format) của provider thật, nên sức thuyết phục hạn chế. Cặp song sinh là xác thực thật đối thật.

## Hệ quả

Cặp song sinh khiến khối lượng bảo trì adapter và e2e cần API key tăng gấp đôi — cả hai đều bao phủ hành vi của V4 Flash và Pro dưới các chế độ reasoning (suy luận) đại diện — đổi lại là xác thực liên tục tính trung lập của seam và có thêm ví dụ triển khai thứ hai. Cả hai adapter đều dùng `apiKey`, `baseURL` và `models`; adapter fetch trực tiếp phơi bày `thinking`/`reasoningEffort`, adapter pi-ai phơi bày một mức `reasoning`. Trong tương lai nếu có bộ test consistency, có thể lập luận để loại bỏ một trong hai adapter thông qua một Agent Note tiếp theo.
