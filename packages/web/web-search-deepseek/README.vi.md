# @deepseek-ai/dsh-web-search-deepseek

[English](README.md) | Tiếng Việt

`WebSearchProvider` được hỗ trợ bởi [DeepSeek](https://deepseek.com), dùng cho [web capability seam](../web/README.md) của harness (`ctx.web`). Nó gọi **Anthropic-compatible Messages API** của DeepSeek (`POST {baseURL}/messages`), bật server tool nguyên bản `web_search_20250305`, và ánh xạ khối `web_search_tool_result` có cấu trúc mà DeepSeek trả về thành `WebSearchResult` đã chuẩn hóa bởi seam.

Đây là một gói **triển khai (implementation)**: nó đăng ký bên cung cấp vào `ctx.web`, phân giải credential cho mỗi lần tìm kiếm qua seam `ctx.credentials` tùy chọn, nếu tồn tại session agent (tác tử) phát khởi request thì cũng ghi lại request hỗ trợ này trong session đó, và không đăng ký công cụ hướng tới model. Giống `@deepseek-ai/dsh-llm-deepseek`, nó là plugin dạng hàm／namespace (`inject: ['web']`). Định dạng giao thức (wire format) Anthropic là chi tiết riêng của bên cung cấp, và **không** khiến bên cung cấp này phụ thuộc vào `ctx.llm`.

## Khác biệt so với endpoint tìm kiếm chuyên dụng

Exa và Perplexity cung cấp endpoint tìm kiếm chuyên dụng, còn DeepSeek thì không. Bên cung cấp này thay vào đó phát khởi một **lệnh gọi model Messages đầy đủ** kèm server tool `web_search`, do đó một lần tìm kiếm sẽ phát sinh độ trễ và chi phí token của cả một lượt model đầy đủ, nặng hơn endpoint truy xuất thuần túy. DeepSeek thực hiện tìm kiếm ở phía server, trả về khối `web_search_tool_result` **có cấu trúc**; bên cung cấp phân tích các khối này, **tuyệt đối không** trích xuất URL từ văn bản model.

**Chế độ nghiêm ngặt**: nếu response không chứa khối `web_search_tool_result` (tìm kiếm nguyên bản không được kích hoạt), bên cung cấp sẽ ném `WebError` `WEB_PROVIDER_ERROR`, thay vì hạ cấp về trích xuất từ văn bản.

Nó tái sử dụng tham chiếu credential `DEEPSEEK_API_KEY` (không thêm secret mới), nhưng **không** tái sử dụng `$DEEPSEEK_BASE_URL`: endpoint tìm kiếm dùng địa chỉ gốc tương thích Anthropic (`https://api.deepseek.com/anthropic/v1`), khác với địa chỉ gốc chat-completions mà adapter LLM (mô hình ngôn ngữ lớn) dùng (`https://api.deepseek.com`). Service credential đã mount có tính quyền uy; khi không có service đó, bên cung cấp sẽ fallback về biến môi trường của tiến trình khởi động. Mỗi lần tìm kiếm đều phân giải lại tham chiếu này, do đó secret được lưu hoặc xoay vòng trong trang Models của Web có thể dùng ngay cho lần gọi tiếp theo mà không cần khởi động lại.

## Cấu hình

| Khóa cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `apiKey` | chưa đặt | Giá trị literal của API key DeepSeek. Ưu tiên dùng `apiKeyEnv` để tránh secret lọt vào cấu hình; giá trị literal không rỗng được ưu tiên hơn. |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Mỗi lần tìm kiếm đều phân giải tham chiếu credential này qua `ctx.credentials`; khi không có seam đó thì phân giải từ môi trường tiến trình. Khi giá trị bị thiếu, lệnh gọi thất bại với `WEB_PROVIDER_CREDENTIAL_MISSING`. |
| `baseURL` | `https://api.deepseek.com/anthropic/v1` | Địa chỉ gốc endpoint tương thích Anthropic; nối thêm `/messages`. Khi để trống sẽ fallback về `$DEEPSEEK_SEARCH_BASE_URL` ở bất kỳ tầng môi trường nào; cấm tái sử dụng `$DEEPSEEK_BASE_URL` thuộc về adapter LLM chat-completions. Khi không phân giải được, bên cung cấp không khả dụng. |
| `model` | `deepseek-v4-flash` | Tên model theo định dạng Anthropic. |
| `apiVersion` | `2023-06-01` | Giá trị header `anthropic-version`. |
| `maxTokens` | `4096` | Giới hạn số nguyên dương cho số token sinh ra trong request Messages. |
| `maxUses` | `5` | Giới hạn số nguyên dương cho số lần dùng server tool `web_search` mỗi request. |

```yaml
- id: web-search-deepseek
  name: '@deepseek-ai/dsh-web-search-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://gateway.internal/anthropic/v1
```

Mục ở trên là tầng base của phần Settings `web-search-deepseek`: tầng người dùng chồng lên trên sẽ tác động tới lần tìm kiếm **tiếp theo**, vì bên cung cấp chiếu phần này theo từng lần, chứ không cố định nó tại thời điểm đăng ký. Vì vậy khi endpoint hoặc model thay đổi, việc lựa chọn bên cung cấp của seam không bị gián đoạn. `apiKey` mang `role('secret')`, nên nó không xuất hiện trong response `describe()` ở bất kỳ tầng nào — tầng bề mặt cấu hình chỉ có thể biết miền credential có giữ giá trị cho tham chiếu được đặt tên bởi `apiKeyEnv` hay không, chứ không biết liệu một tầng nào đó có mang secret dạng literal hay không.

## Ánh xạ

Câu trả lời do bên cung cấp sinh ra mà DeepSeek trả về đều không được bên cung cấp này tin tưởng để dùng làm `content`, do đó `content` bị bỏ qua. `sources[]` đến từ các mục `web_search_result` nằm trong khối `web_search_tool_result`: `url` ← `url`, `title` ← `title`, `publishedAt` ← `page_age`. Các mục `cited_text` được nhận dạng theo URL, nằm riêng trong `citations[]` của khối văn bản; bên cung cấp liên kết chúng với kết quả tương ứng theo URL, khi không có trích đoạn thì `snippet` bị bỏ qua.

Kết quả được khử trùng lặp theo URL, vì một request có thể trình bày cùng một trang qua nhiều lần tìm kiếm. DeepSeek công khai `maxUses` chứ không phải núm điều chỉnh số lượng kết quả, do đó seam thực thi `maxResults`: cắt bớt `sources[]` và đặt `truncated`.

Thất bại của bên cung cấp trở thành `WEB_PROVIDER_ERROR`; việc bên gọi hủy trở thành `WEB_ABORTED`. Redirect HTTP bị từ chối trước khi chạm tới đích `Location`, và hiển thị dưới dạng `WEB_PROVIDER_ERROR`.

## Ghi log request

Các lần tìm kiếm do agent phát khởi sẽ thêm sự kiện session `web/deepseek-search-llm-request` chỉ dùng để ghi log vào session tương ứng ngay trước khi phát request. Sự kiện này chứa endpoint đã phân giải, phiên bản API, và body JSON chính xác gửi tới DeepSeek không kèm secret; không bao gồm header và credential. Nếu xử lý credential thất bại hoặc bị hủy trước khi phát request thì sự kiện không được tạo; nếu thất bại HTTP hoặc thất bại response xảy ra sau khi đã phát request thì lần thử request này vẫn được giữ lại bền vững. Khi bên cung cấp được gọi trực tiếp bằng chương trình ngoài agent, không có session phát khởi nào để ghi lại.

## Trải nghiệm model

### Request tìm kiếm hỗ trợ của DeepSeek

#### Model nhìn thấy gì

Model DeepSeek độc lập sẽ nhận nguyên văn `Perform a web search for the query: <query>` làm văn bản người dùng, và nhận một định nghĩa server tool nguyên bản `web_search`. Request này không thuộc về ngữ cảnh model của session.

#### Ảnh hưởng Token

Mỗi lần tìm kiếm phát sinh token đầu vào và đầu ra độc lập của bên cung cấp; `maxTokens` giới hạn output sinh ra, `maxUses` giới hạn số lần tìm kiếm nguyên bản.

#### Ảnh hưởng KV Cache

Độc lập với cache request của session. Chỉ dẫn hỗ trợ và định nghĩa tool nguyên bản có thể tạo thành tiền tố ổn định, nhưng mỗi lần query hoặc định tuyến model thay đổi sẽ ngăn việc tái sử dụng tính từ điểm khác biệt đầu tiên.

### Kết quả công cụ session gián tiếp

#### Model nhìn thấy gì

Thông qua [`dsh-tool-web`](../tool-web/README.md), model của session sẽ thấy URL, tiêu đề, ngày và snippet trích dẫn đã được khử trùng lặp từ khối tìm kiếm có cấu trúc; văn bản của bên cung cấp không được tin tưởng để dùng làm câu trả lời. Các thông báo lỗi cụ thể của bên cung cấp này bao gồm thông báo thiếu credential kèm hướng dẫn xử lý, `DeepSeek search credential resolution failed: <error>`, `DeepSeek search aborted`, `DeepSeek search request failed: <error>`, `DeepSeek returned no web_search_tool_result blocks; the request may not have triggered native web search` và `DeepSeek returned an unprocessable response body: <error>`; thất bại HTTP giữ nguyên thông báo của bên cung cấp. Việc bọc lỗi thuộc trách nhiệm bên tiêu thụ.

#### Ảnh hưởng Token

Việc đăng ký không trực tiếp phát sinh token session. Token kết quả tăng theo nguồn và snippet trả về, sau đó seam thực thi giới hạn số nguồn được yêu cầu.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới có thể nhìn thấy nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Giới hạn đã biết và việc còn hoãn lại

- **Một lần tìm kiếm cần một lượt model Messages đầy đủ**: phát sinh độ trễ và token sinh ra, và thực hiện tối đa `maxUses` lần tìm kiếm phía server; DeepSeek không công khai endpoint truy xuất chuyên dụng.
- **Tính khả dụng của credential động được phân giải bên trong thao tác**: ước định `available()` đồng bộ có thể xác nhận resolver tồn tại, nhưng không thể truy vấn kho credential bất đồng bộ. Do đó, bên cung cấp không có secret được chọn sẽ khiến tìm kiếm thất bại với `WEB_PROVIDER_CREDENTIAL_MISSING`; schema `web_search` ổn định vẫn giữ nguyên đăng ký. Việc bên gọi hủy có race condition cục bộ với bước tiền kiểm tra này, nhưng không thể ép buộc bất kỳ backend credential tùy ý nào tự dừng công việc.
- **Nguồn trả về vượt mức vẫn tiêu tốn token**: giao thức không có núm điều chỉnh số lượng kết quả, `maxResults` chỉ có thể bị seam cắt bớt sau khi nhận về.
- **Kết quả không được trích dẫn không có `snippet`**: chỉ khi trích dẫn (`cited_text`) trong khối `text` khớp URL của nó thì nguồn mới có snippet.
