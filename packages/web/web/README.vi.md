# @deepseek-ai/dsh-web

[English](README.md) | Tiếng Việt

**`WebRuntime`** (`ctx.web`) định nghĩa harness có những năng lực truy cập web nào (tìm kiếm web, lấy nội dung URL), và được triển khai qua nhiều bên cung cấp, không gắn ước định model với hình dạng API của một hãng cụ thể.

Gói này đảm nhận vai trò Service Definition cho năng lực web. Khác với shell/fs, nó bao trùm cả hai thao tác tìm kiếm và lấy nội dung trên cùng một seam, mỗi thao tác có thể có nhiều bên cung cấp:

| Gói | Trách nhiệm |
|---|---|
| `@deepseek-ai/dsh-web` (gói này) | Service Definition: service, registry bên cung cấp, chính sách lựa chọn, từ vựng request／kết quả, hệ thống phân loại `WebError` |
| `@deepseek-ai/dsh-web-search-exa` | Bên cung cấp tìm kiếm: Exa |
| `@deepseek-ai/dsh-web-search-perplexity` | Bên cung cấp tìm kiếm: Perplexity |
| `@deepseek-ai/dsh-web-fetch-http` | Bên cung cấp lấy nội dung: HTTP(S) công khai ẩn danh |
| `@deepseek-ai/dsh-tool-web` | Consumer: schema công cụ `web_search`／`web_fetch` hướng tới model, xây dựng trên nền `ctx.web` |

Tìm kiếm và lấy nội dung không dùng chung schema request hay logic nghiệp vụ, nhưng có chủ đích dùng chung một seam: `ctx.web` là tầng trung gian truy cập web duy nhất, sở hữu một chính sách lựa chọn bên cung cấp, một bộ từ vựng hủy／lỗi, và một giao diện cấu hình hướng tới sản phẩm về "harness này truy cập web như thế nào". Việc giữ cặp phương thức `Search`／`Fetch` song song là có chủ đích.

## Service API (`ctx.web`)

| Thành viên | Ngữ nghĩa |
|---|---|
| `registerSearchProvider(provider)`／`registerFetchProvider(provider)` | Đăng ký backend. Khi id trùng lặp trong cùng loại năng lực sẽ ném `WebError` `WEB_DUPLICATE_PROVIDER`. Trả về disposer. Được dispose (giải phóng tài nguyên) cùng lúc với fiber gọi. |
| `search(request, signal?)` | Phân giải bên cung cấp tìm kiếm và chạy một lần tìm kiếm. Thực thi `request.maxResults` trên kết quả (cắt bớt `sources[]`, đặt `truncated`). Ném `WebError` khi năng lực không thể chạy. |
| `fetch(request, signal?)` | Phân giải bên cung cấp lấy nội dung và lấy một URL. Response không phải 2xx là kết quả, không ném ngoại lệ. Ném `WebError` khi không thể lấy hoặc biểu diễn tài nguyên an toàn. |

Bên cung cấp đăng ký **năng lực**, không phải công cụ. `dsh-tool-web` là chủ sở hữu duy nhất của tên, mô tả, hướng dẫn prompt, JSON Schema và hiển thị hướng tới model.

## Lựa chọn

Việc lựa chọn tuyệt đối không phụ thuộc vào thứ tự đăng ký, cấu hình hay HMR (hot module replacement). Mỗi năng lực hoặc có id bên cung cấp tường minh (cấu hình `searchProvider`／`fetchProvider`, hoặc do biến môi trường `$DSH_WEB_SEARCH_PROVIDER`／`$DSH_WEB_FETCH_PROVIDER` cung cấp cùng trường), hoặc được tự động chọn khi chỉ có đúng một bên cung cấp khả dụng đã đăng ký. `search()`／`fetch()` sẽ phân giải bên cung cấp tại thời điểm thực thi:

| Trường hợp | Thực thi |
|---|---|
| id đã cấu hình đã đăng ký và `available()` | Chạy bên cung cấp đó |
| id đã cấu hình chưa đăng ký | `WEB_PROVIDER_CONFIGURED_MISSING` |
| id đã cấu hình đã đăng ký nhưng không khả dụng | `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` |
| Không có id, đúng một bên cung cấp khả dụng đã đăng ký | Chạy bên cung cấp đó |
| Không có id, không có bên cung cấp khả dụng | `WEB_PROVIDER_UNAVAILABLE` |
| Không có id, nhiều bên cung cấp khả dụng | `WEB_PROVIDER_AMBIGUOUS` |

Nhánh thất bại sẽ ném `WebError`; bên gọi định tuyến theo code có cấu trúc của nó (kèm chi tiết thông báo: id bị thiếu, tập ứng viên mơ hồ). `available()` của chính bên cung cấp là một kiểm tra cục bộ rẻ (credential có tồn tại hay không, cấu hình có phân giải được hay không), dùng cho việc lựa chọn tại thời điểm thực thi, và **cấm phát khởi network call**; `dsh-tool-web` không bao giờ gọi nó. Công cụ thực thi qua `ctx.web.search()`／`fetch()` và định tuyến theo code được ném ra, do đó việc lựa chọn bên cung cấp chỉ có một chủ thể duy nhất.

## Từ vựng

`WebSearchRequest` (`query`, `maxResults?`) → `WebSearchResult` (`content?`, `sources[]`, `truncated`); mỗi `WebSearchSource` có `url` bắt buộc và `title`／`snippet`／`publishedAt` tùy chọn (trích dẫn của Perplexity có thể chỉ có URL). `WebFetchRequest` (`url`) → `WebFetchResult` (`url` cuối cùng, `statusCode`, `body`, `truncated`); việc hủy được truyền dưới dạng tham số `AbortSignal` trực tiếp tùy chọn cho `search()`／`fetch()`. `WebFetchBody` là union phân biệt đóng (`html` | `text`) do đây sở hữu; bên tiêu thụ dùng `switch` để kiểm tra tính bao quát, do đó thêm kiểu mới sẽ khiến build thất bại cho tới khi được xử lý xong. Ước định đầy đủ xem tại `src/types.ts`, trong đó cũng có hệ thống phân loại code của `WebError`.

## Trải nghiệm model

Ảnh hưởng gián tiếp thông qua `dsh-tool-web`; công cụ đó giữ lại dữ liệu bên cung cấp đã chuẩn hóa có giới hạn, hoặc giữ nguyên các thất bại sau: bên cung cấp đã cấu hình bị thiếu, bên cung cấp không khả dụng, không có bên cung cấp, tồn tại nhiều bên cung cấp và `Error: <message>`; bản thân registry này không đóng góp prompt hay schema.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; thay đổi tiền tố request do các bên tiêu thụ nêu trên chịu trách nhiệm.

## Giới hạn đã biết và việc còn hoãn lại

- **Không có giao diện quan sát (observation)**: không có sự kiện thay đổi bên cung cấp hay truy vấn trạng thái năng lực; tính khả dụng chỉ có thể quan sát bằng cách thực thi `search()`／`fetch()` và định tuyến theo code `WebError` được ném ra, khi không có bên cung cấp thất bại là `WEB_PROVIDER_UNAVAILABLE` chung, không liệt kê lý do theo từng bên cung cấp (xem [Agent Note](../../../.agents/notes/archived/simplification/2026-07-04-drop-unconsumed-web-observation-surface.md)).
- **`WebSearchRequest` chỉ mang `query` + `maxResults`**: các điều khiển không phụ thuộc bên cung cấp (độ mới, điều kiện lọc domain, gợi ý vùng, độ sâu tìm kiếm) bị hoãn lại cho tới khi cả Exa lẫn Perplexity đều có thể hỗ trợ trung thực (xem [Agent Note về seam](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)).
- **`WebFetchBody` không có nhánh `pdf`**: hỗ trợ PDF có thể trích xuất text thuộc công việc bị hoãn lại rõ ràng; union đóng sẽ khiến việc thêm nhánh này trở thành thay đổi được compiler thực thi trên cả ba gói web.
- **Trích xuất trang do bên cung cấp hỗ trợ không thuộc phạm vi `fetch()`**: năng lực kiểu `web_extract` theo phong cách Firecrawl/Tavily bị hoãn lại, không mở rộng thao tác lấy nội dung.
