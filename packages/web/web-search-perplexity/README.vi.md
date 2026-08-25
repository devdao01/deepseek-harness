# @deepseek-ai/dsh-web-search-perplexity

[English](README.md) | Tiếng Việt

`WebSearchProvider` được hỗ trợ bởi [Perplexity](https://perplexity.ai), dùng cho [web capability seam](../web/README.md) của harness (`ctx.web`). Nó gọi endpoint `POST /chat/completions` tương thích OpenAI của Perplexity, ánh xạ câu trả lời sinh sẵn và trích dẫn thành `WebSearchResult` đã chuẩn hóa bởi seam.

Đây là một gói **triển khai (implementation)**: nó đăng ký bên cung cấp vào `ctx.web`, không sở hữu khóa đó, cũng không đăng ký công cụ hướng tới model. Giống `@deepseek-ai/dsh-llm-deepseek`, nó là plugin dạng hàm／namespace (`inject: ['web']`). Định dạng giao thức (wire format) tương thích OpenAI là chi tiết riêng của bên cung cấp, và **không** khiến bên cung cấp này phụ thuộc vào `ctx.llm`.

## Cấu hình

| Khóa cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `apiKey` | `$PERPLEXITY_API_KEY` | API key của Perplexity. Khi rỗng hoặc thiếu, bên cung cấp không khả dụng. |
| `baseURL` | `https://api.perplexity.ai` | Địa chỉ gốc endpoint; nối thêm `/chat/completions`. Khi không phân giải được, bên cung cấp không khả dụng. |
| `model` | `sonar` | Tên model tìm kiếm. |
| `maxTokens` | `1024` | Giới hạn token cho câu trả lời sinh ra (`max_tokens`). Phải là số nguyên dương. |
| `searchRecency` | (chưa đặt) | Cửa sổ độ mới gửi dưới dạng `search_recency_filter`: `day`, `week`, `month` hoặc `year`. Khi chưa đặt thì không gửi điều kiện lọc. |

```yaml
- id: web-search-perplexity
  name: '@deepseek-ai/dsh-web-search-perplexity'
  config:
    apiKey: !!js process.env.PERPLEXITY_API_KEY
```

## Ánh xạ

`content` ← `choices[0].message.content` (câu trả lời sinh ra). `sources[]` ưu tiên dùng `search_results[]` có cấu trúc (`url`, `title`, `snippet`, `publishedAt` ← `date`), nếu không sẽ fallback về mảng `citations[]` chỉ có URL; đường fallback này chỉ được dùng khi không tồn tại `search_results`. Các nguồn này chỉ mang `url`, do đó `title`／`snippet`／`publishedAt` trên seam là các trường tùy chọn. Thất bại của bên cung cấp hiển thị dưới dạng `WebError` `WEB_PROVIDER_ERROR`; request bị hủy hiển thị dưới dạng `WEB_ABORTED`. Redirect HTTP bị từ chối trước khi truy cập đích trỏ bởi `Location`, và hiển thị dưới dạng `WEB_PROVIDER_ERROR`. Perplexity không có điều khiển số lượng kết quả, do đó seam thực thi `maxResults` (cắt bớt `sources[]` và đặt `truncated`).

## Trải nghiệm model

### Request Perplexity hỗ trợ

#### Model nhìn thấy gì

Model Perplexity độc lập nhận `<query>` nguyên văn làm tin nhắn người dùng duy nhất, qua endpoint chat-completions. Request này không thuộc về ngữ cảnh model của session.

#### Ảnh hưởng Token

Mỗi lần tìm kiếm phát sinh token độc lập của bên cung cấp; `maxTokens` giới hạn câu trả lời sinh ra.

#### Ảnh hưởng KV Cache

Độc lập với cache request của session. Cùng một query trên cùng một định tuyến model có thể tái sử dụng cache của bên cung cấp; query hoặc định tuyến thay đổi sẽ tạo tiền tố khác.

### Kết quả công cụ session gián tiếp

#### Model nhìn thấy gì

Thông qua [`dsh-tool-web`](../tool-web/README.md), model của session sẽ thấy câu trả lời sinh ra và metadata kết quả có cấu trúc, hoặc trích dẫn chỉ có URL. Các thông báo lỗi chính xác của bên cung cấp này là `Perplexity search aborted`, `Perplexity search request failed: <error>` và `Perplexity returned an unprocessable response body: <error>`; thất bại HTTP giữ nguyên thông báo của bên cung cấp. Tầng bọc lỗi thuộc trách nhiệm bên tiêu thụ.

#### Ảnh hưởng Token

Việc đăng ký không trực tiếp phát sinh token session. Token của câu trả lời và nguồn phụ thuộc dữ liệu, số lượng nguồn bị giới hạn theo service; kết quả hoặc lỗi được giữ lại sẽ được gửi lặp lại cho đến khi xảy ra nén (compaction).

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới có thể nhìn thấy nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Giới hạn đã biết và việc còn hoãn lại

- **Nguồn fallback trích dẫn chỉ có URL**: khi Perplexity bỏ qua `search_results[]` có cấu trúc, nguồn không có `title`／`snippet`／`publishedAt`, do đó công cụ chỉ render nhãn hostname thuần túy.
- **Nguồn trả về vượt mức vẫn tăng tiêu tốn token và độ trễ**: giao thức không có điều khiển số lượng kết quả, `maxResults` chỉ có thể bị seam cắt bớt sau khi nhận về.
- **Chỉ công khai `model`／`maxTokens`／`searchRecency`**: các điều khiển tìm kiếm khác của Perplexity (điều kiện lọc domain, kích thước ngữ cảnh `web_search_options`, hình ảnh) đang chờ trường Service Definition không phụ thuộc bên cung cấp hỗ trợ (xem [Agent Note về seam](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)).
- **Phân loại việc hủy dựa trên hình dạng lỗi**: chỉ khi là `DOMException` có tên `AbortError` thì mới ánh xạ thành `WEB_ABORTED`; việc hủy mang lý do tùy chỉnh (ví dụ `TimeoutReason` của `dsh-timeout`) sẽ hiển thị dưới dạng `WEB_PROVIDER_ERROR`.
