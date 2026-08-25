# `@deepseek-ai/dsh-llm-mock-server`

[English](README.md) | 中文

Máy chủ HTTP/SSE (Server-Sent Events) tương thích OpenAI, có thể lập kịch bản, dùng để kiểm thử adapter LLM (mô hình ngôn ngữ lớn) thật, agent loop (vòng lặp agent) và chiến lược phục hồi mà không cần key của provider. Nó chấp nhận `POST /chat/completions` và `POST /v1/chat/completions`; mỗi request được chấp nhận sẽ tiêu thụ một hành vi đã cấu hình theo thứ tự đến. Phương thức request, đường dẫn, Bearer token và JSON không hợp lệ sẽ không tiêu thụ mục kịch bản.

Entry point của thư viện export `startMockLlmServer(options)`, các kiểu hành vi và kiểu telemetry (đo lường từ xa), trọng số áp lực ngẫu nhiên mặc định, giới hạn trên mà timer của Node cho phép, và một handle đang chạy kèm `baseURL` đã gắn, `randomSeed` tự sinh hoặc được cấu hình tường minh, request đã thu thập và `close()` idempotent. Việc đóng sẽ cưỡng bức chấm dứt các kết nối bị treo.

## Sử dụng độc lập

Chạy entry point nguồn từ repo này:

```sh
pnpm run mock:llm -- \
  --port 8000 \
  --api-key mock-key \
  --sequence partial_disconnect,success \
  --partial-text "discard this half"
```

Trỏ adapter DeepSeek đã phát hành tới máy chủ; nó sẽ thêm `/chat/completions` vào base đã cấu hình:

```sh
DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1 \
DEEPSEEK_API_KEY=mock-key \
pnpm dsh --profile headless "test provider recovery"
```

Script của repo sẽ ghi JSONL ra stdout: bản ghi `ready` mang theo base URL kết thúc bằng `/v1` và seed ngẫu nhiên, các bản ghi request/kết quả tiếp theo đặt tên cả hành vi trong kịch bản lẫn hành vi cụ thể thực sự được chọn. Gói hỗ trợ riêng tư này không công khai lệnh nhị phân có thể cài đặt.

## Kịch bản hành vi

`--sequence` là danh sách FIFO phân tách bằng dấu phẩy. Khi cạn kiệt sẽ trả về HTTP 500 có cấu trúc; `--repeat-last` sẽ tường minh tái sử dụng mục cuối cùng.

| Hành vi | Kết quả giao thức |
|---|---|
| `connection_reset` | Hủy socket trước khi gửi header HTTP |
| `stream_disconnect` | Gửi header SSE, rồi reset kết nối trước sự kiện đầu tiên |
| `partial_disconnect` | Gửi phần tăng dần văn bản, rồi reset socket |
| `stall` | Gửi header SSE, và giữ trạng thái rảnh cho tới khi client/server hủy |
| `empty` | Gửi stop hợp lệ không có nội dung và `[DONE]` |
| `empty_body` / `stream_eof` / `partial_eof` | Kết thúc bình thường, nhưng thiếu ranh giới `[DONE]` bắt buộc |
| `malformed_json` / `malformed_event` | Gửi JSON SSE không hợp lệ hoặc hình dạng phân mảnh provider không hợp lệ |
| `rate_limit` / `server_error` / `service_unavailable` | Trả về lỗi JSON 429/500/503 hướng tới retry |
| `auth_error` / `invalid_request` / `context_overflow` / `quota_exceeded` | Trả về lỗi kết thúc hoặc lỗi provider cần phục hồi riêng |
| `success` / `slow_success` / `reasoning_success` | Gửi stream phản hồi văn bản đầy đủ, có thể trễ hoặc gửi reasoning trước |
| `tool_call_success` / `max_tokens` | Hoàn tất bằng tool call hoặc lý do kết thúc `length` |
| `wrong_content_type` | Gửi phần thân SSE hợp lệ với content type `application/json` |
| `random` | Chọn hành vi request cụ thể ngẫu nhiên theo seed có trọng số |

`connection_refused` chỉ có thể dùng trong CLI, và phải là mục đầu tiên. Nó sẽ trì hoãn việc bind vào cổng khác 0 do bên gọi chỉ định, nên request trong thời gian `--listen-delay-ms` sẽ nhận bị từ chối TCP thật; các mục còn lại bắt đầu sau khi listener khởi động.

## Chế độ ngẫu nhiên

Dùng các mục `random` lặp lại để thực hiện chạy hỗn hợp mở:

```sh
pnpm run mock:llm -- \
  --port 8000 \
  --sequence random \
  --repeat-last \
  --seed 42 \
  --random-weights 'success=60,slow_success=10,connection_reset=5,stream_disconnect=5,partial_disconnect=10,empty=5,server_error=5'
```

Bỏ qua `--seed` sẽ sinh một seed, và in ra trong bản ghi `ready`. `--random-weights` chấp nhận các mục `behavior=weight` tương đối, không âm, và yêu cầu ít nhất một hành vi cụ thể có trọng số dương. Giá trị mặc định được export là một phân phối áp lực chủ yếu là thành công, bao gồm reset, disconnect, đầu ra một phần, hoàn tất rỗng, stall, 429/5xx, cắt cụt sạch và JSON sai định dạng; nó dùng để tạo áp lực kiểm thử, không phải để ước tính tần suất sự cố production. `connection_refused` bị loại trừ, vì bộ xử lý request đã bind không thể tạo ra sự từ chối thật.

Khi trọng số ngẫu nhiên bao gồm `stall`, hãy cấu hình timeout rảnh của stream ngắn hơn cho client đang kiểm thử, để scenario kết thúc đúng lúc.

## Kiểm soát thời gian và nội dung

CLI công khai `--success-text`, `--partial-text`, `--reasoning-text`, `--chunk-size`, `--chunk-delay-ms`, `--disconnect-delay-ms`, `--retry-after-ms`, `--request-id`, `--tool-name` và `--tool-arguments`. Độ trễ tính bằng mili giây là số nguyên có giới hạn trong phạm vi timer của Node; `retryAfterMs` còn phải là số dương. Thư viện chấp nhận cùng các tùy chọn dạng camel-case. `apiKey` tùy chọn sẽ xác thực chính xác `Authorization: Bearer <token>`; khi bỏ qua thì chấp nhận bất kỳ token nào.

## Trải nghiệm model

Không có. Máy chủ kiểm thử này thay thế hành vi giao thức của provider, không gọi model thật.

#### Ảnh hưởng KV Cache

Không có; request kết thúc cục bộ, không bao giờ đến được cache của provider.

## Hạn chế đã biết và công việc hoãn lại

- **Trọng số ngẫu nhiên mô hình hóa áp lực kiểm thử, không phải tần suất sự cố production**: bên gọi cần phân phối riêng cho từng môi trường phải cung cấp trọng số đã được đo lường, và ghi lại seed đã phát ra.
- **Kịch bản request thực thi theo thứ tự đến**: các bên gọi đồng thời dùng chung một con trỏ, nên việc phân bổ lỗi xác định theo từng session cần một instance máy chủ độc lập.
- **Việc từ chối kết nối thật xảy ra ở giai đoạn vòng đời listener**: độ trễ CLI phải chồng lấn với lần thử của client; việc chọn ngẫu nhiên theo cấp request chỉ có thể reset các kết nối đã được chấp nhận.
