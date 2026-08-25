# @deepseek-ai/dsh-tool-web

[English](README.md) | Tiếng Việt

Bộ công cụ web hướng tới model `web_search` và `web_fetch`, xây dựng trên nền [web capability seam](../web/README.md) (`ctx.web`). Nó chỉ chịu trách nhiệm về các vấn đề hướng tới model: tên công cụ, JSON Schema, tên tham số dạng snake_case, đoạn hướng dẫn prompt, giới hạn số lượng kết quả, định dạng kết quả, hiển thị HTML→markdown, và phép chiếu hiển thị UI — `presentCall`, `presentResult` (thẻ kết quả `card: 'web'` được phân biệt bằng `kind: 'search' | 'fetch'`), và `output.presentationMeta` mang theo nguồn tìm kiếm có cấu trúc hoặc tóm tắt lấy nội dung mà văn bản render bị mất mát (lossy) không thể mang được (xem [Agent Note web-result-card](../../../.agents/notes/implemented/feature/2026-07-30-web-result-card.md)). Mọi truy cập web đều đi qua `ctx.web`; gói này tuyệt đối không import bất kỳ bên cung cấp cụ thể nào. Cả hai công cụ đều không công khai timeout hướng tới model: ngân sách timeout hợp tác (collaborative) của lệnh gọi công cụ cho mỗi công cụ được khai báo tại đây qua cấu hình (`fetchTimeoutMs`／`searchTimeoutMs`, gắn thêm dưới dạng `ToolDefinition.timeoutMs`), do [`@deepseek-ai/dsh-tool-call-timeout-policy`](../../guard/timeout-policy/README.md) (tầng bọc `tools/execute`) thực thi; mỗi công cụ chỉ chuyển tiếp `exec.signal` cho seam.

Mỗi công cụ đăng ký độc lập; sản phẩm chỉ cần một trong hai công cụ có thể vô hiệu hóa công cụ còn lại qua cấu hình (`{ search: false }`／`{ fetch: false }`). Hướng dẫn tìm kiếm chỉ đề cập `web_fetch` khi lấy nội dung cũng được bật qua cấu hình; tổ hợp chỉ bật tìm kiếm sẽ yêu cầu model dùng snippet trả về và trích dẫn URL của nó.

## Công cụ

| Công cụ | Tham số | Hành vi |
|---|---|---|
| `web_search` | `query` (string) | Dùng để khám phá thông tin. Trả về câu trả lời tùy chọn và các URL nguồn. `max_results` **không** hướng tới model: công cụ đặt giới hạn (cấu hình `searchMaxResults`, mặc định 8) và truyền cho seam. |
| `web_fetch` | `url` (string) | Lấy nội dung tại một URL cụ thể. Nội dung HTML được render thành markdown (turndown, có bảng GFM／gạch ngang); nội dung dạng text được giữ nguyên. Trạng thái không phải 2xx được báo cáo, không phải lỗi. Timeout của lệnh gọi công cụ là chính sách triển khai (`dsh-tool-call-timeout-policy`), không phải tham số model. |

Cả hai công cụ đều chọn lập lịch song song, vì các lượt đọc từ bên cung cấp trả về nội dung mà không sửa đổi trạng thái của agent (tác tử) cha.

Kết quả service đã chuẩn hóa cũng là giá trị công cụ chuẩn: `WebSearchResult` và `WebFetchResult`. Bộ render nguyên bản giữ lại câu trả lời, nguồn và nội dung văn bản lấy được như mô tả bên dưới; giới hạn của bên cung cấp về số lượng kết quả tìm kiếm và kích thước nội dung vẫn là giới hạn khi lấy dữ liệu, không phải cắt bớt chỉ để hiển thị.

## Cấu hình

| Khóa cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `search` | `true` | Đăng ký `web_search`. |
| `fetch` | `true` | Đăng ký `web_fetch`. |
| `searchMaxResults` | `8` | Giới hạn số lượng nguồn trả về trong một lần gọi `web_search` (seam cắt bớt danh sách dài hơn từ bên cung cấp và đánh dấu). |
| `fetchTimeoutMs` | `30000` | Ngân sách timeout hợp tác cho lệnh gọi công cụ `web_fetch` (ms). |
| `searchTimeoutMs` | `30000` | Ngân sách timeout hợp tác cho lệnh gọi công cụ `web_search` (ms). |
| `fetchMaxOutputChars` | `200000` | Giới hạn số ký tự nguồn được chuyển đổi đồng bộ và giới hạn cho toàn bộ output của một lần `web_fetch` (tính gộp phần đầu trạng thái, phần thân đã render và footer); khi phần thân bị cắt bớt, thông báo cắt bớt sẽ được kèm theo nếu còn chỗ. |

`fetchTimeoutMs`／`searchTimeoutMs` khai báo ngân sách timeout hợp tác cho mỗi công cụ (gắn thêm dưới dạng `ToolDefinition.timeoutMs`), do [`@deepseek-ai/dsh-tool-call-timeout-policy`](../../guard/timeout-policy/README.md) thực thi; schema hướng tới model không công khai tham số timeout. `fetchMaxOutputChars` đồng thời giới hạn khối lượng công việc chuyển đổi đồng bộ và kết quả render đầy đủ: chỉ chuyển đổi tối đa số ký tự nguồn này, sau đó áp giới hạn gộp cho phần đầu trạng thái, tiền tố đã chuyển đổi và thông báo cắt bớt. Giá trị mặc định để lại khoảng dư so với giới hạn phần thân 100.000 ký tự của bên cung cấp cục bộ, nhưng việc render bị phình to vẫn có thể khiến giới hạn cuối cùng cắt bớt kết quả.

```yaml
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
```

## Đăng ký ổn định

Việc đăng ký công cụ tuân theo **trạng thái bật** của sản phẩm, chứ không phải tính khả dụng của backend. Ngay cả khi bên cung cấp đã chọn bị thiếu, cấu hình sai, mơ hồ hoặc tạm thời không khả dụng, công cụ vẫn hiển thị; seam phân giải bên cung cấp tại thời điểm thực thi, việc thực thi thất bại với `WebError` có cấu trúc (ví dụ `WEB_PROVIDER_UNAVAILABLE`, `WEB_PROVIDER_AMBIGUOUS`), và `ToolRuntime.execute()` chuyển nó thành kết quả công cụ dạng lỗi mà model đọc được và hook／UI có thể định tuyến. Cách này tránh việc phải đưa thứ tự nạp plugin, trạng thái credential hay thời điểm HMR (hot module replacement) vào ước định hướng tới model, đồng thời vẫn giữ schema của model ổn định. Muốn gỡ bỏ hoàn toàn công cụ web, hãy vô hiệu hóa nó qua cấu hình tại đây.

Công cụ tuyệt đối không gọi `available()` của bên cung cấp, cũng không liệt kê các bên cung cấp; đường thực thi duy nhất là `ctx.web.search()`／`ctx.web.fetch()`, khi bên cung cấp không khả dụng, cơ chế lựa chọn sẽ ném `WebError` có cấu trúc tại thời điểm thực thi, mã lỗi của nó do công cụ nhận. Việc lựa chọn bên cung cấp hoàn toàn nằm trong seam, do một chủ thể duy nhất chịu trách nhiệm.

## Trải nghiệm model

### System prompt

#### Model nhìn thấy gì

Tìm kiếm và lấy nội dung đóng góp riêng biệt các hướng dẫn web-search và web-fetch dưới đây. Tìm kiếm sẽ chọn văn bản bật lấy nội dung hoặc chỉ tìm kiếm dựa trên cấu hình tại thời điểm đăng ký. Giới hạn công cụ theo scope không loại bỏ các đoạn được đăng ký độc lập này.

##### Hướng dẫn Web Search khi bật lấy nội dung

```markdown
Use the web_search tool to discover current information on the web. It returns an optional answer plus a list of source URLs. Follow up with web_fetch when you need the full content of a specific result, and cite the relevant URLs as markdown links.
```

##### Hướng dẫn Web Search khi chỉ có tìm kiếm

```markdown
Use the web_search tool to discover current information on the web. It returns an optional answer plus a list of source URLs. Use the returned source snippets when available, and cite the relevant URLs as markdown links.
```

##### Hướng dẫn Web Fetch

```markdown
Use the web_fetch tool to retrieve the content of a specific HTTP(S) URL (for example a result from web_search). It returns the page content decoded to text. Cite the URL as a markdown link when you use its content.
```

#### Ảnh hưởng Token

Mỗi công cụ được bật qua cấu hình sẽ tăng thêm một chi phí token hướng dẫn cố định cho mỗi request, ngay cả khi giới hạn ẩn schema của nó đi. Việc chuyển đổi trạng thái lấy nội dung không chỉ đăng ký hoặc gỡ bỏ đoạn lấy nội dung, mà còn thay đổi hướng dẫn tìm kiếm.

#### Ảnh hưởng KV Cache

Miễn là công cụ được bật, scope và văn bản hướng dẫn không đổi, tiền tố vẫn ổn định. Trạng thái bật qua cấu hình (bao gồm việc thay đổi nhánh hướng dẫn tìm kiếm do chuyển đổi trạng thái lấy nội dung) hoặc vòng đời plugin có thể làm mất hiệu lực việc tái sử dụng tính từ đoạn prompt thay đổi đầu tiên; giới hạn schema theo scope không loại bỏ đoạn này.

### Schema công cụ

#### Model nhìn thấy gì

Model sẽ nhìn thấy [schema `web_search` và `web_fetch`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-web) được sinh ra. Số lượng kết quả và ngân sách timeout thuộc về cài đặt triển khai, không phải tham số model.

#### Ảnh hưởng Token

Mỗi request đều phát sinh chi phí token schema cố định; vô hiệu hóa qua cấu hình sẽ loại bỏ đồng thời schema và hướng dẫn, còn giới hạn theo scope chỉ loại bỏ schema.

#### Ảnh hưởng KV Cache

Miễn là định nghĩa và khả năng hiển thị không đổi, tiền tố vẫn ổn định. Trạng thái bật qua cấu hình, vòng đời plugin hoặc giới hạn theo scope có thể làm mất hiệu lực việc tái sử dụng tính từ token schema thay đổi đầu tiên.

### Kết quả tìm kiếm

#### Model nhìn thấy gì

Sau câu trả lời tùy chọn của bên cung cấp là `Sources:`, tiếp theo là các dòng có nội dung phụ thuộc dữ liệu nhưng định dạng nghiêm ngặt là `- [<title-or-url>](<url>)`, có thể kèm hậu tố ` — <snippet> (<publishedAt>)`. Khi không có cả câu trả lời lẫn nguồn, kết quả hiển thị `No results found.`. Khi danh sách bị cắt bớt tới giới hạn sẽ thêm `(Showing the first <count> sources. Refine the query for more.)`; mỗi kết quả kết thúc bằng `Cite the relevant URLs above as markdown links in your answer.`.

#### Ảnh hưởng Token

Kết quả phụ thuộc dữ liệu sẽ được gửi lặp lại cho đến khi nén (compaction), số lượng nguồn bị giới hạn bởi `searchMaxResults`.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới có thể nhìn thấy nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

### Kết quả lấy nội dung

#### Model nhìn thấy gì

Hình dạng chính xác khi lấy nội dung thành công là `Fetched <finalUrl> (HTTP <statusCode>)`, một dòng trống, và phần thân đã giải mã do bên cung cấp trả về. Khi xảy ra cắt bớt, sẽ thêm một dòng trống nữa và `(Content truncated. Fetch a more specific URL or section for the full text.)`; thất bại trở thành `Error: <message>`. Query và URL được giữ lại trong lịch sử lệnh gọi.

#### Ảnh hưởng Token

Giới hạn của bên cung cấp giới hạn kích thước phần thân; tham số và kết quả lệnh gọi được giữ lại sẽ được gửi lặp lại cho đến khi nén, chính sách timeout có thể thay kết quả đến muộn bằng một lỗi ngắn gọn.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới có thể nhìn thấy nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

### Lỗi tham số

#### Model nhìn thấy gì

Đầu vào rỗng trở thành chính xác `Error: query must be a non-empty string` hoặc `Error: url must be a non-empty string`.

#### Ảnh hưởng Token

Chỉ những lệnh gọi thất bại mới tăng thêm các token được giữ lại này.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới có thể nhìn thấy nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Giới hạn đã biết và việc còn hoãn lại

- **Chuyển đổi HTML→markdown sẽ hạ cấp trên đầu vào mà GFM không thể biểu diễn an toàn**: [turndown](https://github.com/mixmark-io/turndown) (có bảng GFM／gạch ngang) chuyển đổi qua DOM thực tối đa `fetchMaxOutputChars` ký tự nguồn. Một cơ chế bảo vệ từ vựng thận trọng ở 512 tầng sẽ truyền thẳng nguyên trạng phần thân sâu hoặc lồng nhau mơ hồ dưới dạng HTML thô, ngoại lệ khi chuyển đổi cũng được xử lý tương tự; `colspan` của bảng bị bỏ qua, vì GFM không thể biểu diễn ô trải nhiều cột. Các giới hạn này tránh chặn event loop, cũng tránh việc thuộc tính số không đáng tin cậy làm phình to output ([quyết định phụ thuộc đã lưu trữ](../../../.agents/notes/archived/simplification/2026-07-26-turndown-for-tool-web-html-markdown.md)).
- **Giao diện hướng tới model được giữ tinh gọn có chủ đích, việc mở rộng bị hoãn lại**: `max_results` giữ ở dạng giới hạn cấu hình (không phải tham số model), `web_fetch` chỉ nhận `url` (không có chế độ `format`／`prompt`／tóm tắt LLM (mô hình ngôn ngữ lớn)); cả hai được liệt kê là bước tiếp theo trong [Agent Note về seam](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md).
- **Không có chính sách quyền riêng cho web**: cả hai công cụ đều thực thi trực tiếp mà không yêu cầu `ctx.approval`; các triển khai cần xác nhận phải thêm chính sách `tools/pre-execute`, gói này không định nghĩa việc cấp quyền URL／domain bền vững.
