# Agent Note: Bản ghi phụ (sidecar) feedback message gắn liền vòng đời

Status: implemented

[English](2026-08-10-message-feedback-sidecar.md) | 中文

## Vấn đề

Lệnh `/feedback` hiện có ghi lại sự kiện `feedback/record` bất biến ở cấp Session. Trong `FEEDBACK_ONLY`, sự kiện này có thể giải phóng tiền tố telemetry đang chờ, do đó nó không phù hợp làm nguồn thẩm quyền cho một lượt thích/không thích và ghi chú tùy chọn có thể chỉnh sửa, gắn trên một message assistant cụ thể. Feedback message cần ngữ nghĩa cập nhật và xóa độc lập, và không được đi vào Session log thẩm quyền, không được làm thay đổi projection, không được đến ngữ cảnh model, hay ngầm biểu thị sự đồng ý telemetry.

Một bản ghi phụ chỉ được đánh index theo `SessionId` có thể tiếp tục tồn tại ngoài vòng đời của log mà nó mô tả, sau khi id đó được tái tạo lại với danh tính header khác. Revision cấp Session cũng sẽ khiến các chỉnh sửa của các message không liên quan xung đột với nhau, trong khi đọc/ghi storage-domain thông thường không cung cấp compare-and-swap xuyên tiến trình. Việc hủy (disposal) Session chỉ là tách khỏi live store, không phải xóa lưu bền; seam lưu bền Session hiện tại cũng không có thao tác xóa nào sở hữu cascade thật sự.

## Quyết định

`@deepseek-ai/dsh-message-feedback` sở hữu dịch vụ `ctx.messageFeedback`, và lưu feedback message thành một bản ghi phụ (sidecar) storage-domain cho mỗi Session. Bản ghi phụ này không phải là nội dung Session log, cũng không phải là projection Session. Nó không phát ra sự kiện `feedback/record`, cũng không thực hiện bàn giao telemetry; quy ước command-feedback và message-feedback vẫn độc lập với nhau.

Mỗi bản ghi khả dụng đều gắn với danh tính header Session đã được kiểm tra `{createdAt, cwd}`, chứ không chỉ `SessionId` của nó. Vòng đời không khớp được xử lý như không tồn tại: `list` trả về mục rỗng, `put` có thể thay thế dòng cũ bằng bản ghi mới gắn với danh tính hiện tại. Do đó, một id được tái sử dụng với danh tính header khác sẽ không kế thừa feedback cũ. Fork có danh tính Session riêng, và không sao chép bản ghi phụ: ngay cả khi seed của fork chứa cùng một message assistant, feedback vẫn chỉ thuộc về Session mà con người đã ghi nó.

`put` chỉ chấp nhận một `assistant/message` gốc-append (append-origin) không rỗng được quan sát bởi `SessionPersistence.inspect()`, và `MessageId` của nó phải trùng với mục tiêu. Message gốc-thay-thế (replacement-origin), bản ghi assistant rỗng chỉ mang usage, và mục tiêu không phải assistant đều bị từ chối. Việc kiểm tra dùng đường dẫn thẩm quyền an toàn khi nguội (cold-safe): nó không phát hành hay khôi phục Agent chỉ để xác thực feedback, cũng không commit sửa chữa log nguội. Đường dẫn nguội đã được `listSnapshots()` xác định trước rõ ràng là không tồn tại; một Session đã vào danh mục nhưng kiểm tra thất bại vẫn được xử lý như lỗi hạ tầng. Do đó, request rơi đúng vào cửa sổ cực ngắn từ live detach tới header materialization có thể trả về `session-not-found`, bên gọi sẽ retry sau khi materialization retirement hoàn tất.

Trước khi commit bản ghi phụ, `put` sẽ để log mục tiêu đi qua rào chắn bền vững (durability barrier) trước. Session live khớp danh tính đi qua checkpoint `ctx.sessions.flush` thẩm quyền, sau đó cả đường dẫn live và cold đều đọc lại vật lý từ số thứ tự không qua `SessionPersistence.readFrom`. Sau đó, danh tính header quan sát được sẽ được xác thực lại lần nữa với mục tiêu. Thiếu bên tham gia flush, danh tính thay đổi, mục tiêu biến mất hoặc đọc vật lý thất bại đều sẽ chặn việc ghi bản ghi phụ, do đó feedback đã commit sẽ không bao giờ đi trước message assistant lưu bền mà nó tham chiếu tới.

Mỗi mục message đều mang phiên bản (version) không minh bạch (opaque) riêng, cùng timestamp `createdAt` và `updatedAt` do Host cấp phát. `put` chỉ so sánh `ifVersion` của bên gọi với mục tiêu, do đó chỉnh sửa một message không làm mục khác mất hiệu lực. Ngay cả khi giá trị mục tiêu đã giống nhau, việc so sánh vẫn thực hiện nghiêm ngặt, nhờ đó ngăn request cũ đi vòng qua chu kỳ giá trị ABA; xung đột sẽ trả về mục hiện tại thẩm quyền, bên gọi không cần đọc lại lần hai để phối hợp. Request không có thay đổi nhưng mang version khớp sẽ giữ nguyên version và timestamp; cập nhật thực sự giữ `createdAt`, thay version, và đảm bảo `updatedAt` không lùi lại. Xóa một mục đã không còn tồn tại cũng thành công tương tự. Version là token chỉ có thể so sánh bằng nhau, không phải bộ đếm mà bên gọi có thể sắp thứ tự hay tự tổng hợp.

Hàng đợi thay đổi phân theo Session bao phủ kiểm tra vòng đời, đọc bản ghi phụ, phán xử xung đột và ghi toàn dòng. Điều này khiến các thay đổi trên cùng một instance dịch vụ được serialize, và giữ quy ước compare-and-swap theo từng message trong một tiến trình Host duy nhất. Việc hủy plugin (disposal) sẽ đóng việc tiếp nhận, xả hết công việc đã vào hàng đợi, rồi đóng storage domain. API storage-domain nền tảng không cung cấp ghi có điều kiện xuyên tiến trình, do đó việc triển khai không cam kết tính nhất quán tuyến tính xuyên tiến trình hay ngăn mất cập nhật.

`maxNoteBytes` là lựa chọn triển khai bắt buộc, dùng để giới hạn độ dài byte UTF-8 của ghi chú tùy chọn; Web Host bundle đặt tường minh giá trị này là `8192`. Gói này công bố trực tiếp các quy ước `messageFeedback.list`, `messageFeedback.put` và `messageFeedback.delete` của Host qua `TypertRemoteService` và `@Remote`. Việc gắn tổng hợp Remote phía client và UI thuộc trách nhiệm của các ranh giới riêng của chúng và vẫn được hoãn lại; lớp thích ứng phía sau chỉ là bên tiêu thụ mỏng của quy ước Host này.

Dịch vụ không giả lập cascade xóa. `session/disposed` và `host/session-removed` biểu thị việc tách khỏi quyền sở hữu live, không phải xóa lưu bền, và lưu bền Session hiện tại cũng không có interface xóa. Do đó, sau khi xóa log ngoài băng (out-of-band), bản ghi phụ có thể vẫn còn tồn tại; `{createdAt, cwd}` khác nhau sẽ ngăn các bản ghi tồn dư như vậy trở thành feedback của một Session tái sử dụng id đó về sau.

## Các phương án đã cân nhắc

**Append các chỉnh sửa vào Session log và suy ra projection.** Không được chấp nhận, vì metadata UI có thể chỉnh sửa sẽ trở thành lịch sử thẩm quyền và ở gần cuộc hội thoại, fork sẽ replay và kế thừa nó, việc xóa cần tombstone, và việc tái sử dụng `feedback/record` sẽ âm thầm ghép chấm điểm message với sự đồng ý telemetry.

**Đánh index theo `MessageId` toàn cục, sao chép khi fork, hoặc dùng một revision Session.** Không được chấp nhận, vì id message chỉ có ý nghĩa trong phạm vi vòng đời của một Session, cuộc hội thoại sau fork cần đánh giá độc lập của con người, và thay đổi trên message không liên quan không nên tạo ra xung đột giả.

**Mở rộng compare-and-swap xuyên tiến trình cho `KvTable` trong lần thay đổi này.** Không được chấp nhận, vì các backend storage-domain hiện có không có nguyên hàm ghi có điều kiện chung. Hàng đợi trong tiến trình phù hợp với topology Host đơn được hỗ trợ; đảm bảo đa tiến trình thực sự cần quy ước nguyên tử cấp backend, thuộc công việc độc lập.

**Xóa feedback khi Session bị hủy (disposal).** Không được chấp nhận, vì disposal bao gồm cả đường dẫn detach thông thường lẫn rollback. Coi nó như xóa lưu bền sẽ làm mất feedback trong khi Session log vẫn còn tồn tại; việc dọn dẹp phải chờ thẩm quyền xóa Session thực sự.

## Hệ quả

Feedback message được lưu bền cục bộ và có thể chỉnh sửa độc lập, mà không làm thay đổi lịch sử khả kiến với model hay hành vi telemetry. Các bên gọi đồng thời trong cùng một Host nhận được phát hiện xung đột theo từng message và kết quả có thể retry an toàn; triển khai nhiều bên ghi dùng chung một gốc lưu trữ vẫn chưa được hỗ trợ. Danh tính header khác nhau sẽ khiến bản ghi cũ bị coi là không tồn tại, nhưng không thu hồi nó; quy ước này không thể phân biệt các log clone giữ nguyên cùng `{createdAt, cwd}`. Quy ước Host Remote hiện đã khả dụng; việc lắp ráp phía client và UI có thể vẫn là bên tiêu thụ mỏng, không đảm nhận ngữ nghĩa lưu bền hay concurrency.
