# @deepseek-ai/dsh-web-search-exa

[English](README.md) | Tiếng Việt

`WebSearchProvider` được hỗ trợ bởi [Exa](https://exa.ai), dùng cho [web capability seam](../web/README.md) của harness (`ctx.web`). Nó gọi endpoint `POST /search` của Exa và yêu cầu nội dung tóm tắt highlight, ánh xạ `results[]` phẳng thành `WebSearchResult` đã chuẩn hóa bởi seam.

Đây là một gói **triển khai (implementation)**: nó đăng ký bên cung cấp vào `ctx.web`, không sở hữu khóa `ctx.web`, cũng không đăng ký công cụ hướng tới model (thuộc về `@deepseek-ai/dsh-tool-web`). Giống `@deepseek-ai/dsh-llm-deepseek`, nó là plugin dạng hàm／namespace (`inject: ['web']`), chịu trách nhiệm đăng ký backend, chứ không phải export mặc định một service.

## Cấu hình

| Khóa cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `apiKey` | `$EXA_API_KEY` | API key của Exa. Khi rỗng hoặc thiếu, bên cung cấp không khả dụng. |
| `baseURL` | `https://api.exa.ai` | Địa chỉ gốc endpoint; nối thêm `/search`. Khi không phân giải được, bên cung cấp không khả dụng. |
| `searchType` | `auto` | Chế độ truy xuất gửi dưới dạng `type` của Exa: `auto` (do Exa quyết định), `keyword` hoặc `neural`. |
| `numResults` | (chưa đặt) | Số lượng kết quả mặc định dùng khi request không có `maxResults`. Khi chưa đặt thì không gửi giá trị mặc định. Phải là số nguyên dương. |
| `highlightsPerResult` | `1` | Số câu highlight yêu cầu cho mỗi kết quả (`highlightsPerUrl` của Exa). Phải là số nguyên dương. |

```yaml
- id: web-search-exa
  name: '@deepseek-ai/dsh-web-search-exa'
  config:
    apiKey: !!js process.env.EXA_API_KEY
```

## Ánh xạ

Exa trả về `results[]` phẳng, không trả về câu trả lời sinh sẵn, do đó `content` bị bỏ qua. Mỗi kết quả được ánh xạ thành `WebSearchSource`: `url` ← `url`, `title` ← `title`, `snippet` ← mục `highlights[]` không rỗng đầu tiên (kết quả không có tóm tắt highlight sẽ thiếu snippet có thể mang theo được, và bị loại bỏ), `publishedAt` ← `publishedDate`. `maxResults` được yêu cầu ưu tiên hơn `numResults` mặc định đã cấu hình, và được gửi dưới dạng `numResults` của Exa, để tối ưu chi phí và độ trễ; giới hạn cuối cùng do seam thực thi. Thất bại của bên cung cấp (lỗi HTTP, lỗi mạng, phần thân response không phân tích được hoặc cấu trúc không khớp) hiển thị dưới dạng `WebError` `WEB_PROVIDER_ERROR`; request bị hủy hiển thị dưới dạng `WEB_ABORTED`. Redirect HTTP bị từ chối trước khi truy cập đích trỏ bởi `Location`, và hiển thị dưới dạng `WEB_PROVIDER_ERROR`.

## Trải nghiệm model

Ảnh hưởng gián tiếp thông qua [`dsh-tool-web`](../tool-web/README.md); công cụ đó giữ lại URL, tiêu đề, highlight đầu tiên và ngày xuất bản của bên cung cấp này (giới hạn bởi `maxResults`), hoặc đặt các thông báo lỗi chính xác `Exa search aborted`, `Exa search request failed: <error>` và `Exa returned an unprocessable response body: <error>` vào tầng bọc lỗi của bên tiêu thụ; câu trả lời sinh sẵn và các trường riêng của bên cung cấp không đi vào ngữ cảnh.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; thay đổi tiền tố request do các bên tiêu thụ nêu trên chịu trách nhiệm.

## Giới hạn đã biết và việc còn hoãn lại

- **Kết quả không có tóm tắt highlight không rỗng sẽ bị loại bỏ hoàn toàn**: không có snippet có thể mang theo được để ánh xạ, do đó số nguồn trả về có thể ít hơn số lượng yêu cầu.
- **Chỉ công khai `searchType`／`numResults`／`highlightsPerResult`**: các điều khiển khác của Exa (livecrawl, category, điều kiện lọc domain／ngày, nội dung đầy đủ) đang chờ trường Service Definition không phụ thuộc bên cung cấp (xem [Agent Note về seam](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)).
- **Phân loại việc hủy dựa trên hình dạng lỗi**: chỉ khi là `DOMException` có tên `AbortError` thì mới ánh xạ thành `WEB_ABORTED`; việc hủy mang lý do tùy chỉnh (ví dụ `TimeoutReason` của `dsh-timeout`) sẽ hiển thị dưới dạng `WEB_PROVIDER_ERROR`.
