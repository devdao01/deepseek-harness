# @deepseek-ai/dsh-web-fetch-http

[English](README.md) | Tiếng Việt

Một `WebFetchProvider` cho HTTP(S) công khai ẩn danh, dùng cho [web capability seam](../web/README.md) của harness (`ctx.web`). Nó lấy nội dung tại một URL cụ thể, trả về mã trạng thái và nội dung đã giải mã có giới hạn độ dài.

Đây là một gói **triển khai (implementation)**: nó đăng ký bên cung cấp vào `ctx.web`, không sở hữu khóa đó, cũng không đăng ký công cụ hướng tới model. Nó là plugin dạng hàm／namespace (`inject: ['web']`).

## Phân chia trách nhiệm

Bên cung cấp sở hữu **việc lấy tài nguyên an toàn**: xác thực URL, truyền tải HTTP, chính sách redirect, timeout dự phòng cho tài nguyên, truyền tiếp abort, giới hạn byte, giải mã charset, phân loại content type và từ chối nội dung nhị phân. `@deepseek-ai/dsh-tool-web` sở hữu **việc hiển thị** (HTML→markdown, định dạng cắt bớt). Response HTTP không phải 2xx là một *kết quả* (mã trạng thái + phần thân đã giải mã), không phải lỗi; `WebError` chỉ dùng cho các thất bại không thể lấy hoặc biểu diễn tài nguyên một cách an toàn.

`timeoutMs` của bên cung cấp là timeout dự phòng cho tài nguyên, dùng cho bên gọi trực tiếp `ctx.web.fetch()` và các triển khai cấu hình sai, không phải ngân sách lệnh gọi công cụ hướng tới model. [`dsh-tool-call-timeout-policy`](../../guard/timeout-policy/README.md) sở hữu ngân sách lệnh gọi công cụ `web_fetch`, và làm cho `exec.signal` kích hoạt khi hết thời gian, để thực thi ngân sách đó.

Các triển khai công cụ web đã phát hành sẽ đặt timeout dự phòng của bên cung cấp cao hơn ngân sách công cụ, do đó lệnh gọi của model thường trả về `TOOL_TIMEOUT`. Nếu deadline ở tầng ngoài kích hoạt trước timeout dự phòng của bên cung cấp, bên cung cấp sẽ báo cáo `WEB_ABORTED`, sau đó chính sách tầng ngoài thay nó bằng `TOOL_TIMEOUT`. Do đó, `WEB_FETCH_TIMEOUT` cho thấy ngân sách của bên cung cấp cho bên gọi service trực tiếp đã cạn.

## Vệ sinh truyền tải (Transport hygiene)

- Chỉ chấp nhận URL `http:` và `https:`; từ chối credential trong URL (`WEB_BLOCKED_URL`) cũng như URL quá dài／sai định dạng (`WEB_INVALID_URL`).
- Thực thi độ dài URL tối đa, giới hạn byte response (`WEB_FETCH_TOO_LARGE`), giới hạn ký tự phần thân đã giải mã, timeout (`WEB_FETCH_TIMEOUT`) và giới hạn số lần redirect.
- Truyền tiếp tín hiệu abort của bên gọi (`WEB_ABORTED`) tới network request và việc đọc streaming.
- Chỉ theo redirect **cùng origin**; redirect khác origin thất bại với `WEB_REDIRECT_BLOCKED`, yêu cầu phát khởi một lệnh gọi công cụ mới (theo mẫu WebFetch của Claude Code).
- Gửi `User-Agent` sản phẩm tường minh, tuyệt đối không giả mạo trình duyệt.
- Content type không được hỗ trợ (ví dụ nhị phân) bị từ chối với `WEB_UNSUPPORTED_CONTENT_TYPE`.

## Cấu hình

| Khóa cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `maxUrlLength` | `2048` | Độ dài URL request tối đa được chấp nhận. |
| `maxResponseBytes` | `5_000_000` | Số byte tối đa của phần thân response. |
| `maxBodyChars` | `100_000` | Số ký tự tối đa của phần thân đã giải mã. |
| `timeoutMs` | `30_000` | Timeout lấy nội dung trong phạm vi timer của Node: timeout dự phòng cho tài nguyên đối với bên gọi trực tiếp `ctx.web.fetch()`, không phải ngân sách lệnh gọi công cụ hướng tới model (ngân sách đó thuộc về `dsh-tool-call-timeout-policy`). |
| `maxRedirects` | `5` | Số lần redirect cùng origin tối đa (`0` nghĩa là hoàn toàn không theo). |
| `userAgent` | `deepseek-harness/…` | Header `User-Agent`. |

Các giới hạn số được xác thực khi khởi tạo plugin: trừ `maxRedirects`, mỗi giới hạn phải là số dương hữu hạn; `maxRedirects` phải là số nguyên không âm. Giá trị không hợp lệ sẽ ném ngoại lệ, không âm thầm khởi tạo bên cung cấp với giới hạn vô lý.

## Trải nghiệm model

Ảnh hưởng gián tiếp thông qua [`dsh-tool-web`](../tool-web/README.md); công cụ đó đặt văn bản đã giải mã (giới hạn bởi `maxBodyChars`) của bên cung cấp này, hoặc markdown chuyển đổi từ HTML, vào tầng bọc kết quả lấy nội dung, và giữ lại thất bại của bên cung cấp; redirect, header và cơ chế truyền tải vẫn được ẩn đi.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; thay đổi tiền tố request do các bên tiêu thụ nêu trên chịu trách nhiệm.

## Giới hạn đã biết và việc còn hoãn lại

- **Bảo vệ SSRF／mạng riêng bị hoãn lại**: không chặn các đích riêng tư, loopback, link-local, multicast hay các đích không công khai khác, cũng không xác thực lại sau khi phân giải DNS hay xác thực lại từng chặng (xem [Agent Note web capability seam](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)). Trước khi tính năng này được triển khai, bên cung cấp này là một nguyên thủy SSRF; các triển khai có khả năng truy cập tới đích mạng nội bộ nhạy cảm **bị cấm bật nó**.
- **Chỉ giải mã nội dung dạng text**: bao gồm html/xhtml và `text/*` cùng họ JSON/XML; thiếu `Content-Type` hoặc bất kỳ loại nhị phân nào đều ném `WEB_UNSUPPORTED_CONTENT_TYPE`, việc giải mã PDF có thể trích xuất text thuộc công việc bị hoãn lại rõ ràng.
- **charset chỉ đến từ header `Content-Type`** (mặc định UTF-8): khai báo `<meta charset>` trong HTML bị bỏ qua; nhãn charset được khai báo nhưng không nhận diện được sẽ ném ngoại lệ, thay vì dự phòng.
