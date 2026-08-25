# @deepseek-ai/dsh-session-title

[English](README.md) | Tiếng Việt

Tiêu đề phiên dựa trên log, cung cấp giá trị dự phòng tất định tức thời cùng một nhà cung cấp bất đồng bộ tùy chọn. Mỗi lần chỉnh sửa được chấp nhận là một sự kiện `session/title` chỉ ghi vào log; `foldSessionTitle()` và `ctx.sessionTitle.get()` chọn sự kiện mới nhất và trả về seq cùng dấu thời gian của sự kiện đó.

Chỉ các khối văn bản trong sự kiện `user/message` của người dùng mới đủ điều kiện. Prompt hợp lệ đầu tiên sẽ lên lịch giá trị dự phòng, sinh tiêu đề từ vài từ đầu của nó, chịu ràng buộc bởi giới hạn byte UTF-8 đã cấu hình. Hệ thống chuẩn hóa khoảng trắng, loại bỏ chuỗi điều khiển terminal, và việc cắt bớt không bao giờ cắt đứt một code point. Prompt rỗng và prompt không phải văn bản sẽ chờ đầu vào hợp lệ tiếp theo.

## Dịch vụ: `SessionTitleService` (khóa ctx: `sessionTitle`)

- `get(session)` gấp lấy tiêu đề được chấp nhận mới nhất từ log đang hoạt động hoặc log phát lại.
- `refresh(session, signal?)` hiện thực hóa giá trị dự phòng khi cần, rồi chạy tường minh nhà cung cấp đã đăng ký để xử lý các tin nhắn hợp lệ hiện tại. Lỗi từ nhà cung cấp hoặc việc hủy từ phía gọi đều khiến Promise trả về bị từ chối; việc hủy không hoàn tác sự kiện dự phòng đã được chấp nhận.
- `rename(session, title)` chấp nhận đồng bộ tiêu đề do người dùng chỉ định tường minh: chuẩn hóa văn bản, thay thế công việc tự động đang chạy, và nối thêm một sự kiện `session/title` có nguồn `user`. Tiêu đề mới nhất có nguồn người dùng sẽ ghim phiên đó — các tin nhắn người dùng sau đó không còn lên lịch chỉnh sửa tự động; `refresh` tường minh vẫn là cách gỡ ghim có chủ ý.
- `register(provider)` cài đặt nhà cung cấp tùy chọn duy nhất và trả về Cordis effect disposer có thể await. Lần đăng ký thứ hai sẽ ném lỗi ngay lập tức; dispose (giải phóng tài nguyên) nhà cung cấp sẽ hủy các lời gọi đang chờ và đang chạy, đợi chúng kết toán, rồi mới cho phép đăng ký nhà cung cấp khác.

Công việc tự động không bao giờ làm chậm phản hồi của agent (tác tử) chính. Nhà cung cấp chỉ khởi động khi yêu cầu được đánh dấu, do vòng lặp dựng nên, có tuyến định tuyến khớp chính xác với `request/header` đã ghi nhận hiện tại; quy tắc này áp dụng cả khi header không đổi nên không cần snapshot mới. Hoàn tất trễ sẽ nối trực tiếp qua `Session` một sự kiện thuần log độc lập mà không mở lượt. Lớp lưu bền quan sát sự kiện đó ngay lập tức và hoàn tất flush tại các checkpoint vòng đời thông thường; việc phát hành tiêu đề tự nó không ép flush. Lỗi tự động phát cảnh báo và giữ lại tiêu đề mới nhất. Bản chỉnh sửa toàn-tin-nhắn mới, dispose nhà cung cấp, dispose phiên và refresh tường minh đều hủy công việc cũ, và kết quả hoàn tất đã lỗi thời không thể nối thêm. Các lần refresh tường minh đồng thời sẽ đặt trước số hiệu chỉnh sửa trước khi nhà cung cấp làm việc; các yêu cầu dự phòng tự động／tường minh chồng lấn dùng chung một thao tác nối đang diễn ra cục bộ trong phiên. Dịch vụ và nhà cung cấp mô hình dựng sẵn mỗi bên nối kiểu sự kiện nguyên văn của riêng mình, nên không cần cờ ghi tiêu đề chung, khẳng định kiểu hay hàng đợi kết toán. Việc tháo dỡ dịch vụ sẽ hủy công việc đang xếp hàng và đợi các lời gọi không đáp ứng hủy kết toán xong trước khi hoàn tất gỡ tải.

Phiên được fork kế thừa nguyên vẹn các sự kiện tiêu đề trong hạt giống. Nhịp tin-nhắn-đầu-tiên không tự động sinh lại tiêu đề cho phiên con; nhịp toàn-tin-nhắn có thể nối thêm bản chỉnh sửa mới sau khi phiên con nhận prompt người dùng tiếp theo.

## Cấu hình

Mọi giới hạn đều bắt buộc; thư viện không cung cấp giá trị mặc định.

| Khóa | Quy ước |
|---|---|
| `fallbackMaxWords` | Số từ tối đa, số nguyên dương, phân tách bằng khoảng trắng trong giá trị dự phòng tất định. |
| `fallbackMaxBytes` | Số byte UTF-8 tối đa, số nguyên dương, cho phép ở giá trị dự phòng; không được vượt quá `maxTitleBytes`. |
| `maxTitleBytes` | Số byte UTF-8 tối đa, số nguyên dương, để chấp nhận tiêu đề từ bất kỳ nguồn nào. |

## Quy ước nhà cung cấp

Nhà cung cấp cung cấp một id ổn định có kiểu gắn nhãn, chế độ tự động (`first-prompt` hoặc `all-prompts`) và `generate(request)`. Yêu cầu mang theo phiên đang hoạt động, toàn bộ tin nhắn hợp lệ tính đến một bản chỉnh sửa cố định, tuyến định tuyến của yêu cầu chính đã ghi nhận hiện tại nếu có, và tín hiệu hủy. Kết quả gồm tiêu đề không rỗng, các seq tin nhắn nguồn không trùng lặp và có thứ tự trong yêu cầu đó, cùng tuyến nhà cung cấp／mô hình tùy chọn đã dùng để sinh tiêu đề. Dịch vụ chuẩn hóa và xác thực trước khi kết quả được lưu bền.

Xem [cấu trúc dữ liệu tiêu đề phiên](../../../docs/subsystems/session-title.md) và [quyết định đã triển khai](../../../.agents/notes/implemented/feature/2026-07-21-log-backed-session-titles.md).

## Trải nghiệm mô hình

### Trạng thái tiêu đề phiên

#### Nội dung mô hình nhìn thấy

Không có. `session/title` chỉ ghi vào log và không bao giờ đi vào giao diện phiên, `deriveMessages()`, system prompt, schema công cụ hay tiền tố yêu cầu.

#### Ảnh hưởng token

Giá trị dự phòng và các bản chỉnh sửa của nhà cung cấp đã được chấp nhận không thêm token vào yêu cầu agent chính. Yêu cầu phụ trợ độc lập của nhà cung cấp tùy chọn được mô tả trong tài liệu của gói nhà cung cấp tương ứng.

#### Ảnh hưởng KV Cache

Không ảnh hưởng yêu cầu chính; sự kiện tiêu đề không làm thay đổi nội dung tái dựng hay khóa cache.

## Hạn chế đã biết và phần tạm hoãn

- Xóa tiêu đề (gỡ ghim trở lại tiêu đề tự động mà không cần `refresh` tường minh), tìm kiếm và chỉ mục danh sách không thuộc dịch vụ này.
- Registry nhà cung cấp cố ý chỉ chấp nhận tối đa một triển khai, nên nếu một bản triển khai muốn kết hợp nhiều chiến lược tiêu đề cạnh tranh nhau, nó phải viết một nhà cung cấp tự chịu trách nhiệm về thứ tự ưu tiên.
