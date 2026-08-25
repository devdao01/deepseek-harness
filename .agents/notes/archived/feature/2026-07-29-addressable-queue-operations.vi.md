# Agent Note: Cung cấp thao tác sửa và xóa cho các mục hàng đợi đang chờ xử lý

Status: implemented

Archived: 2026-07-31

[English](2026-07-29-addressable-queue-operations.md) | 中文

## Vấn đề

Hàng đợi Web có thể render tin nhắn đang chờ xử lý, nhưng không thể sửa hoặc xóa một dòng cụ thể trong đó. `MessageId` không đủ để làm định danh địa chỉ hóa (addressing), vì bên gọi có thể đưa cùng một tin nhắn bất biến vào hàng đợi nhiều lần. Trình duyệt còn suy luận việc mục hàng đợi đã bị loại bỏ dựa trên sự kiện lượt và trạng thái, do đó khi thao tác trên dòng xảy ra tranh chấp (race) với việc driver nhận (claim) mục đó, hệ thống không thể đưa ra kết quả có tính thẩm quyền.

## Quyết định

**Mỗi mục được chấp nhận vào FIFO có một định danh riêng.** AgentLoop đúc (mint) một `InboxItemId` không minh bạch (opaque), và phát ra một `InboxItem` chứa id đó, `UserMessage` đã có định danh riêng, và cách đặt (`queued | steering`) được xác định tại thời điểm chấp nhận. Việc tái sử dụng cùng một `MessageId` sẽ tạo ra định danh inbox khác. Việc inject bỏ qua FIFO, do đó không nhận được định danh inbox.

**Ranh giới thay đổi dừng lại ở việc driver nhận (claim).** `Agent.updateInbox(id, action)` tìm kiếm đồng bộ trong FIFO queued đang chờ xử lý. Sửa sẽ thay thế nội dung đã đóng băng, đồng thời giữ nguyên `InboxItemId`, `MessageId`, nguồn gốc, chiến lược đánh thức và vị trí. Xóa sẽ phát ra sự kiện discard trạng thái cuối cho mục đã đưa vào hàng đợi đó. Mục steering (điều hướng giữa chừng) và mục đã bị driver nhận sẽ trả về `not-found`, do đó thao tác hàng đợi không bao giờ ghi đè input lượt đang hoạt động hoặc lịch sử bền vững.

**Sổ cái thời gian thực là trạng thái có thẩm quyền.** `agent/inbox/enqueue`, `update`, `dequeue` và `discard` cùng duy trì ảnh phản chiếu (mirror) phía Host của các mục queued. Update đồng bộ có thể tái nhập (reentrant) hoặc sự kiện trạng thái cuối có thể đến trước listener enqueue ở lớp ngoài; ảnh phản chiếu sẽ giữ lại kết quả chưa hiển thị này trong lượt dispatch hiện tại, và gộp nó vào khi xử lý enqueue, do đó thứ tự đăng ký listener không làm hệ thống công bố nội dung lỗi thời hoặc dòng không tồn tại. Giao thức gửi snapshot `session/queue` đầy đủ, thay vì đoán tăng dần (incremental). Kết nối lại sẽ gửi baseline hiện tại, mỗi lần thay đổi queued hoặc sự kiện trạng thái cuối sẽ thay thế nó toàn bộ. Client không thực hiện sửa lạc quan (optimistic edit), và không bao giờ loại bỏ dòng hàng đợi dựa trên sự kiện lượt bền vững hoặc thay đổi trạng thái.

**Địa chỉ hóa Queue yêu cầu Agent còn sống.** `session.updateQueue` chỉ truy vấn registry Agent đã được mount, không bao giờ khôi phục session nguội (cold): `InboxItemId` là định danh cục bộ theo tiến trình, không thể tiếp tục trỏ đến công việc sau khi restart hoặc giải phóng tài nguyên. Cả hai trường hợp Agent bị thiếu và mục đã được driver nhận đều trả về `queue-item-not-found`.

**Thao tác Web chỉ nhắm vào Queue.** Host loại trừ steering đang chờ xử lý khỏi `session/queue`; steering vẫn dùng đường dẫn transcript bền vững hiện có sau khi được tiêu thụ. QueueDock ẩn khi hàng đợi rỗng, render trực tiếp dòng đó khi chỉ có một mục đang chờ, và mặc định thu gọn thành tiêu đề `"<n> tin nhắn đang chờ"` có thể mở rộng hoặc thu gọn danh sách đầy đủ khi có từ hai mục đang chờ trở lên. Tiêu đề công bố `aria-expanded` và `aria-controls`; sau khi mở rộng, danh sách bị giới hạn chiều cao 180px và có thể cuộn. Khi đang có thao tác sửa hoặc thay đổi diễn ra, các dòng danh sách vẫn giữ hiển thị; sau khi hàng đợi rỗng, lần xuất hiện hàng đợi tiếp theo sẽ khôi phục trạng thái thu gọn mặc định. Dòng hiển thị công bố thao tác sửa và xóa, không cung cấp điều khiển gửi ngay. UI suy ra dòng hàng đợi và loại thay đổi từ hợp đồng runtime `SessionFace`, thay vì import trực tiếp plugin kết nối, do đó các plugin vẫn phối hợp thông qua service và snapshot. Chỉ khi mọi khối nội dung đều là văn bản mới cung cấp chức năng sửa; editor không được âm thầm loại bỏ khối không phải văn bản. Dòng đang sửa chỉ hiển thị thao tác lưu và hủy, thao tác bàn phím tương ứng lần lượt là Enter và Escape. Xóa sẽ loại bỏ đúng mục đã đưa vào hàng đợi đó.

## Các phương án đã cân nhắc

**Địa chỉ hóa dòng thông qua `MessageId`.** Không được áp dụng, vì cùng một tin nhắn bất biến có thể được gửi lặp lại; sửa hoặc xóa theo định danh tin nhắn sẽ không thể xác định nên thao tác lên lần đưa vào hàng đợi nào.

**Thay đổi lạc quan trong trình duyệt.** Không được áp dụng, vì driver nhận hoặc client khác có thể hoàn thành trước thao tác của Host. Chờ snapshot có thẩm quyền giúp thể hiện ranh giới quyền sở hữu một cách rõ ràng, và để `queue-item-not-found` báo cáo tranh chấp thực sự.

**Đưa steering đang chờ xử lý vào giao thức thay đổi hàng đợi.** Không được áp dụng, vì QueueDock không có tương tác steering, còn việc sửa hoặc xóa input lượt đang hoạt động sẽ mở rộng chức năng này vượt ra ngoài bên tiêu thụ hiện tại. Hợp đồng gửi này nên do tương tác steering chuyên dụng chịu trách nhiệm.

**Công bố thao tác đưa lên đầu chỉ ở tầng giao thức.** Không được áp dụng, vì hiện tại không có tương tác sản phẩm nào sắp xếp lại Queue. Công bố một thao tác không có bên tiêu thụ hiện tại sẽ đưa vào ngữ nghĩa sắp xếp và test cho một mục đích mang tính suy đoán.

**Khôi phục Agent nguội để thao tác hàng đợi.** Không được áp dụng, vì định danh session bền vững không giữ lại thông tin xác thực địa chỉ hóa inbox cục bộ theo tiến trình. Khôi phục chỉ có thể nhận được `not-found` sau khi tạo ra trạng thái thời gian thực không liên quan.

## Xác minh

Test hợp đồng AgentLoop chặn việc chấp nhận prompt khi sửa và xóa đúng mục queued, từ chối thay đổi trên mục steering, và kiểm chứng lượt độc lập tương ứng cùng sự kiện vòng đời trạng thái cuối. Test schema và proxy của Host bao phủ snapshot có thẩm quyền chỉ chứa mục queued, thứ tự thay đổi đồng bộ có thể tái nhập, kết nối lại, từ chối Agent nguội, lỗi not-found có kiểu, và vận chuyển RPC. Test runtime client và QueueDock bao phủ việc chiếu (projection) không lạc quan, hiển thị một dòng, mặc định thu gọn nhiều dòng, buộc giữ hiển thị trong lúc tương tác, reset sau khi rỗng, mở rộng, sửa chỉ với văn bản, lối vào lưu và hủy, xóa, tranh chấp loại bỏ, và vô hiệu hóa sửa với nội dung hỗn hợp. Kịch bản trình duyệt không cần key sẽ bắt tiêu đề thu gọn mặc định trước, sau đó mở rộng hàng đợi, và thao tác sửa/xóa được công bố thông qua việc lắp ráp Web đã build và giao thức HTTP／SSE thật.

## Hậu quả

Công việc queued nhận được thao tác dòng chính xác, nhưng không vì thế mà trở thành lịch sử session bền vững. Định danh đưa vào hàng đợi một lần là thông tin xác thực địa chỉ hóa thời gian thực cục bộ theo tiến trình, sẽ biến mất khi được nhận, hủy, dispose hoặc restart; kết nối lại chỉ có thể khôi phục các mục queued vẫn đang được Agent hoạt động giữ. Việc sửa loại trừ nội dung hỗn hợp, cho đến khi editor có thể giữ được từng khối; steering đang chờ xử lý không thuộc giao diện thao tác này.

Hiện tại, giao thức mang theo snapshot hàng đợi đầy đủ mỗi khi có thay đổi. Hàng đợi được kỳ vọng luôn ngắn, do đó hệ thống ưu tiên khôi phục xác định và hội tụ đa client, thay vì giao thức thay đổi tăng dần.
