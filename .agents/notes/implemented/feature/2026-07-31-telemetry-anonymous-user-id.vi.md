# Agent Note: id người dùng ẩn danh cho telemetry ($DSH_HOME/.anonymous-user-id) và user.id trong OTel Resource

Status: implemented

[English](2026-07-31-telemetry-anonymous-user-id.md) | 中文

## Vấn đề

Session telemetry đã được mount mặc định ([Note mount mặc định](2026-07-31-web-telemetry-default-mount.md)), nhưng OTel Resource chỉ có `service.name`/`service.version`, không có bất kỳ định danh cấp người dùng nào — bên nhận không thể gộp nhóm theo người dùng, không thể đếm số người dùng hoạt động. Trước đây định hướng liên quan duy nhất là một quyết định chưa hiện thực về việc "suy ra user.id từ hash hostname/IP máy cục bộ". Cần trả về cho luồng dữ liệu OTel một danh tính người dùng ẩn danh có ngữ nghĩa rõ ràng.

## Quyết định

`getOrCreateAnonymousUserId()` trả về dòng UUID trần trong `$DSH_HOME/.anonymous-user-id` (được `resolveDshHome` phân giải, `$DSH_HOME` > `~/.dsh`), lần dùng đầu tiên sinh một UUID v4 ngẫu nhiên và ghi xuống đĩa; backend khi khởi tạo đưa nó vào `user.id` của Resource (thuộc tính người dùng chuẩn theo OTel semconv) và mang theo mỗi lô xuất dữ liệu một lần. Hiện thực ban đầu nằm trong `session-telemetry-otel`, vì lúc đó chưa tồn tại bên tiêu thụ thực sự thứ hai. `/feedback` sau này trở thành bên tiêu thụ đó, do đó [quyết định chia sẻ id](../architecture/2026-08-07-shared-feedback-telemetry-user-id.md) đã chuyển quyền sở hữu sang `@deepseek-ai/dsh-anonymous-user-id`, nhưng không thay đổi ngữ nghĩa lưu trữ, ẩn danh, đồng thời và mất mát được ghi lại trong Note này. [Định danh yêu cầu trực tiếp tới DeepSeek](2026-08-11-deepseek-request-user-id-header.md) là bên tiêu thụ thứ ba của cùng id này.

| Quyết định | Giá trị | Lý do |
|---|---|---|
| Nguồn gốc id | UUID v4 ngẫu nhiên, tuyệt đối không suy ra từ hostname/địa chỉ mạng/git remote | id suy ra được có thể tra ngược, tên gọi "ẩn danh" sẽ không đúng nghĩa |
| Hình thức lưu trữ | dòng UUID trần trong `.anonymous-user-id` + newline, không bọc JSON | danh tính là một sự kiện độc lập, không gắn theo cách đặt tên/định dạng file của riêng một luồng telemetry |
| Hình thức đọc/ghi | IO đồng bộ + memo trong tiến trình theo đường dẫn file đã phân giải | constructor của `OpenTelemetrySessionBackend` là đồng bộ (async sẽ buộc phải đổi hình dạng việc nạp plugin); một tiến trình chỉ IO đĩa một lần, xóa file khi đang chạy không ảnh hưởng tiến trình hiện tại |
| Khởi động đồng thời lần đầu | ghi độc quyền bằng `wx`, bên thua đọc lại id của bên thắng | Bao phủ trường hợp đồng thời thông thường (đọc lại đúng lúc trúng vào cửa sổ vi giây bên thắng đang tạo-ghi file vẫn có thể khiến mỗi tiến trình giữ một id riêng trong lần chạy đó — lần khởi động sau sẽ hội tụ về giá trị đã ghi đĩa — hệ quả ở cấp telemetry, chấp nhận được) |
| Ngữ nghĩa khi mất | File bị xóa → lần khởi động sau đổi id mới, chấp nhận mất mát | danh tính ẩn danh không có giá trị khôi phục; khả năng khôi phục đòi hỏi vật liệu suy ra được, xung đột với tính ẩn danh |
| Ghi thất bại | trả về id trong bộ nhớ theo kiểu best-effort | telemetry tuyệt đối không bị chặn vì home ở chế độ chỉ đọc |
| Vị trí báo cáo | thuộc tính Resource, không phải attributes theo từng bản ghi | mỗi lô một lần là đủ để bên nhận gộp nhóm theo chiều Resource; bơm theo từng bản ghi sẽ phải sửa quy ước seam và tăng dung lượng wire |
| Phụ thuộc semconv | không import package `@opentelemetry/semantic-conventions` | một hằng số chuỗi không đáng để thêm một dependency |
| Nơi đặt | `@deepseek-ai/dsh-anonymous-user-id`, được chia sẻ bởi backend OTel, `/feedback` và yêu cầu trực tiếp tới DeepSeek | các bên tiêu thụ dùng chung một hợp đồng lưu trữ, không phụ thuộc backend xuất dữ liệu |
| Công tắc riêng | không có | bất kỳ bên tiêu thụ nào cũng có thể tạo danh tính này; `DSH_TELEMETRY_DISABLED` sẽ dừng báo cáo telemetry, nhưng không vô hiệu hóa xác nhận phản hồi hay header yêu cầu DeepSeek |

## Các phương án thay thế đã cân nhắc

| Bị từ chối | Lý do một câu |
|---|---|
| id suy ra từ hash hostname/IP (định hướng trước đây) | có thể tra ngược tức là không ẩn danh; UUID ngẫu nhiên có ngữ nghĩa rõ ràng, người dùng đã chốt thay thế định hướng trước đó |
| user.id đặt vào attributes của mỗi record (kiểu Claude Code) | phải sửa quy ước seam session-telemetry hoặc bơm theo từng bản ghi, tăng dung lượng wire; mỗi lô một lần ở Resource đã đủ để gộp nhóm |
| Tách gói dùng chung trước khi `/feedback` cần đến id này (hiện thực ban đầu) | lúc đó bên tiêu thụ thực sự duy nhất là backend OTel; chỉ khi phản hồi trực tiếp cần cùng một id liên kết thì việc tách gói mới có cơ sở |
| AppCLIEntry đọc sẵn id rồi bơm qua config patch | mỗi điểm vào surface đều phải nối dây; đưa sự kiện thời gian chạy vào config sẽ lẫn lộn với cấu hình triển khai |
| Gắn vào `@deepseek-ai/dsh-home-paths` | paths là phép tính đường dẫn thuần túy, không IO; năng lực danh tính có lưu trữ bền vững sẽ làm ô nhiễm biên gói |

## Hệ quả

- Một `$DSH_HOME` là một người dùng ổn định trong luồng dữ liệu OTel; các home khác nhau về cấu trúc là người dùng khác nhau, không có cơ chế liên kết xuyên home.
- Luồng dữ liệu OTel, `/feedback` và yêu cầu trực tiếp tới DeepSeek dùng chung `.anonymous-user-id`.
- Xóa `.anonymous-user-id` tức là reset danh tính (có hiệu lực từ lần khởi động sau); khi home không ghi được thì mỗi tiến trình giữ riêng một id trong bộ nhớ cho đến khi khôi phục khả năng ghi.
- Trong phần follow-up về danh tính của [Note mount mặc định](2026-07-31-web-telemetry-default-mount.md), mục "id người dùng ẩn danh" được đóng lại bởi quyết định này; các quy tắc khử nhạy cảm theo chiều hostname/surface và track usage-metrics vẫn còn tồn đọng.
