# Thực hành: Thêm adapter LLM (mô hình ngôn ngữ lớn)

[English](adding-an-llm-adapter.md) | 中文

Cách kết nối một nhà cung cấp mô hình mới. Triển khai tham khảo: `packages/llm/llm-deepseek` (HTTP trực tiếp, SSE (Server-Sent Events) được `eventsource-parser` chia khung) và `packages/llm/llm-pi-ai` (bọc thư viện LLM). Hãy đọc trước tài liệu `StreamChunk` trong `packages/llm/llm/src/types.ts` — nó ghi lại các quy ước giao thức mà cả hai adapter đều đã được kiểm chứng.

## Hình thái cơ bản

```ts ignore-check
class MyAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> { … }
}

export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config: z<Config> = z.object({ apiKey: z.string(), … })

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(…))
}
```

Việc đăng ký dựa trên hiệu ứng (effect), có thể hỗ trợ HMR (hot module replacement) an toàn; mỗi tuyến nhà cung cấp chỉ tương ứng với một adapter, đăng ký trùng lặp sẽ ném ngoại lệ, còn đăng ký nhiều tuyến thì hoặc tất cả đều thành công, hoặc tất cả đều thất bại. `options.provider` dùng để chọn adapter, `options.model` là ID mô hình của nhà cung cấp, do đó adapter có danh mục mô hình động không cần cấu hình lại vòng đời vẫn có thể cung cấp mô hình mới. Khóa bí mật được quản lý theo cách bản địa của Cordis: Config kiểu schemastery có cơ chế dự phòng biến môi trường, được tiêm qua `!!js process.env.MY_KEY` trong cordis.yml. Tuyệt đối không đọc file khóa bí mật tự quy ước trong code.

## Nghĩa vụ giao thức (các quy ước đã được cả hai triển khai kiểm chứng)

- Phát `usage` **trước** `finish`; sau `finish` **không phát thêm bất kỳ nội dung nào**. Cách làm ổn định: đệm finish/usage cho đến khi gặp cờ kết thúc luồng của nhà cung cấp, rồi flush thống nhất (có thể xử lý trường hợp nhà cung cấp gửi một mảnh chỉ chứa usage ở cuối).
- `arguments` của lệnh gọi công cụ luôn là chuỗi JSON thô trong suốt quá trình; các mảnh stream gửi dưới dạng `argumentsDelta`. Nếu nhà cung cấp của bạn trả về object đã được parse sẵn, hãy stringify lại tại thời điểm `block-end`.
- Gán `index` cho các khối theo thứ tự xuất hiện đầu tiên trong luồng; mỗi lần delta của cùng một khối tái sử dụng index đó.
- Lỗi chỉ có đúng hai đường hợp lệ: **ném (throw)** từ `stream()` (lỗi truyền tải và giao thức — dùng `LlmError` với code ổn định), hoặc kết thúc luồng bằng `finish {kind: 'error' | 'aborted'}` (lỗi nội tại phía nhà cung cấp). Bên tiêu thụ phải xử lý cả hai; hãy chọn đường phù hợp theo loại lỗi và ghi tài liệu rõ ràng.
- Tuân thủ `options.signal` (truyền nó vào fetch hoặc SDK của bạn).
- Nếu một trường nào đó trong `GenerateOptions` mà nhà cung cấp của bạn không hỗ trợ được (ví dụ nhận danh sách `stop` khi nhà cung cấp không hỗ trợ stop sequences): hãy ném `LlmError(..., 'UNSUPPORTED')`, không được âm thầm bỏ qua.
- Nếu nhà cung cấp cần response ID, chữ ký, hoặc metadata bản địa khác cho các lệnh gọi tiếp theo, hãy phát phần chiếu JSON tối giản, không mất mát của nó dưới dạng `finish.replayState`. Khi tái tạo lịch sử phải xác thực trạng thái đó. `LlmRuntime` chỉ truyền trạng thái này khi tuyến nhà cung cấp lịch sử và tuyến nhà cung cấp mục tiêu hiện đang được sở hữu bởi đúng cùng một instance adapter; việc khôi phục cùng mô hình, khác mô hình, hay khác nhà cung cấp có hợp lệ hay không là do adapter quyết định. Khi trạng thái bị thiếu, tuyệt đối không được suy đoán việc phát lại bản địa chỉ dựa trên tên nhà cung cấp/mô hình.

Công tắc chế độ suy luận (thinking mode) đặc thù của nhà cung cấp vẫn đặt trong Config của adapter. Metadata mô hình chính xác dùng một seam năng lực (capability seam) duy nhất, không phụ thuộc nhà cung cấp: triển khai `resolveModel()`, trả về danh tính nhà cung cấp/mô hình cùng các trường `context` và `reasoning` tùy chọn; chỉ khai báo `defaultEffort` khi có giá trị mặc định được cấu hình chỉ định; tuân thủ `AbortSignal` tùy chọn được truyền vào khi resolve mô hình. Cường độ suy luận (reasoning) là một ID không minh bạch (opaque), có thứ tự, được adapter ánh xạ sang request của nhà cung cấp. Hãy giữ nguyên danh sách tùy chọn hợp lệ do adapter cung cấp, bao gồm cả `off` khi adapter định nghĩa nó khi hỗ trợ; không được để lộ cách viết cụ thể của giá trị giao thức cuối cùng, cũng không được tự động điều chỉnh giá trị không được hỗ trợ. ID không cần phải giống với biểu diễn giao thức của nó.

## Cấu trúc triển khai

Hãy để các kiểu định dạng giao thức (wire format), việc tuần tự hóa request, việc phân tích cú pháp phía truyền tải, việc chuyển đổi mảnh (chunk) và lớp adapter mỗi phần đảm nhận trách nhiệm độc lập; [`llm-deepseek`](../../packages/llm/llm-deepseek/README.md) là bố cục tham khảo.

## Xác thực

Tuân theo [chiến lược kiểm thử của repo](../testing.md), chiến lược này chịu trách nhiệm về độ phủ adapter, kiểm tra nhà cung cấp thật, và yêu cầu đối với các entry đã phát hành.
