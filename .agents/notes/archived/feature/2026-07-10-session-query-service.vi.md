# Agent Note: Dịch vụ truy vấn phiên chính xác

Status: implemented
Archived: 2026-07-27

[English](2026-07-10-session-query-service.md) | 中文

## Vấn đề

Lịch sử phiên tồn tại ở hai nơi: đối tượng `SessionStore` hiện hành và một backend lưu bền vững tùy chọn. Nếu không có dịch vụ thống nhất, các bên tiêu thụ cần kiểm tra chính xác buộc phải tự lặp lại việc phân xử ưu tiên active/persisted, xử lý vòng đời lưu bền vững, phân loại surface cho sự kiện thô, theo dõi quan hệ, và clone phòng thủ. Giữa các checkpoint, trạng thái đã lưu bền vững có thể lạc hậu so với active log đang chạy, nên chỉ dựa vào persisted không phải là nguồn đáng tin cậy cho trạng thái hiện tại.

Tìm kiếm toàn văn liên quan tới vấn đề này, nhưng ở quy mô lớn hơn nhiều. Nếu đặt việc phối hợp bên cung cấp, đồng bộ, vô hiệu hóa (invalidation), sắp xếp và trạng thái con trỏ vào dịch vụ đọc chính xác, sẽ tạo ra một cỗ máy trạng thái thứ hai cạnh chủ sở hữu cơ sở dữ liệu cụ thể.

## Quyết định

`@deepseek-ai/dsh-session-query` sở hữu dịch vụ trừu tượng duy nhất `ctx.sessionQuery` hướng tới một corpus logic thống nhất. Nó triển khai cụ thể `listSessions()`, `filterSessions(filters)` không phụ thuộc bên cung cấp, `listEvents(sessionId)`, `filterEvents(sessionId, filters)`, `readEvent(request)` có giới hạn, `traceSession(sessionId)` và `traceEvent(request)`, trong khi các backend cụ thể triển khai hai phương thức tìm kiếm toàn văn của nó. [Quyết định về dịch vụ truy vấn phiên thống nhất](../../archived/architecture/2026-07-23-unified-session-query-service.md) sở hữu cấu trúc tô-pô này, [Quyết định về nhà cung cấp tìm kiếm SQLite](2026-07-10-sqlite-session-query-provider.md) sở hữu hành vi tìm kiếm, [Quyết định về truy vết](2026-07-13-session-query-tracing.md) sở hữu ngữ nghĩa quan hệ dòng dõi và sự kiện.

Dịch vụ này quan sát động binding tùy chọn `ctx.sessionPersistence`, nhưng không giữ cache persisted hay listener vô hiệu hóa. Mỗi thao tác liệt kê xuyên corpus sẽ yêu cầu metadata chuẩn từ backend active, sau đó phủ lên một danh sách active store mới. Các mục có id khớp nhau được hợp nhất thành một `SessionRecord`: header active được ưu tiên, `live`/`persisted` mỗi bên tự báo cáo tính khả dụng nguồn riêng của mình. Header bất biến không khớp nhau sẽ sinh ra `SESSION_QUERY_SOURCE_CONFLICT`.

Việc đọc mục tiêu chính xác trước tiên kiểm tra active store, chụp snapshot header active và event log. Đường này không bao giờ truy vấn persisted, nên lỗi backend lưu bền vững không khiến lịch sử active đã biết trở nên không đọc được. Nếu không có mục tiêu trong active store, dịch vụ liệt kê metadata persisted hiện tại, chứng minh id đó tồn tại, tải nó, và từ chối nếu header liệt kê/tải không khớp nhau. Mọi header và event trả về đều đi qua một ranh giới structured-clone.

## Ngữ nghĩa Surface

`dsh-session` xuất khẩu `foldSurface(events)`, `SurfaceManager` dùng cùng hàm chuyển đổi để duy trì cache tăng dần của nó. Fold trả về cả tập seq sự kiện hiện tại tách biệt lẫn tập seq thực sự bị loại bỏ do mỗi lần thay thế. `listEvents()` và `traceEvent()` tận dụng kết quả đó để phân loại từng sự kiện thô, nhờ vậy kết quả kiểm tra không lệch với suy diễn model-history về ngữ nghĩa thay thế theo vị trí.

`readEvent()` trả về mục tiêu đầy đủ cộng với các sự kiện thô lân cận theo seq liên tục. `before` và `after` mặc định bằng không, mỗi bên bị giới hạn bởi `readWindowMax` (mặc định 50). Kết quả mang theo `SessionHeader` đã clone thay vì bản ghi tính khả dụng nguồn, vì việc đánh dấu cờ persisted cho mục tiêu active sẽ vi phạm bảo đảm "đọc chính xác active không phụ thuộc vào tình trạng khỏe mạnh của persisted".

## Ranh giới an toàn

Dịch vụ này là hạ tầng đáng tin cậy ở cấp context, không phải lớp phân quyền. Các tool lịch sử hướng-tới-model hoặc UI cho người dùng trong tương lai sẽ áp đặt phạm vi bên gọi/phiên tường minh. Dịch vụ này không thêm tool hướng-tới-model, cũng không thay đổi surface của transcript (bản ghi văn bản) hay snapshot.

## Các phương án thay thế đã cân nhắc

- **Đặt việc phân giải corpus logic trực tiếp trong từng bên tiêu thụ**: bác bỏ. Ưu tiên nguồn, xử lý xung đột, vòng đời dịch vụ tùy chọn, clone và phân loại surface là các quy tắc đúng đắn dùng chung.
- **Chỉ truy vấn persisted**: bác bỏ. Checkpoint có thể lạc hậu so với active log hiện tại.
- **Cache metadata persisted và lắng nghe ghi/xóa**: bác bỏ. Đọc chính xác có thể hỏi thẳng nguồn chuẩn, còn việc vô hiệu hóa cache đưa vào trạng thái vòng đời và tương tranh trước khi quy mô yêu cầu điều đó.
- **Đặt đăng ký bên cung cấp vào dịch vụ đọc chính xác**: bác bỏ. Package SQLite sở hữu một vòng đời đối chiếu/giao dịch riêng; nếu không có bên cung cấp thứ hai chứng minh sự cần thiết, registry chỉ làm tách trạng thái đó ra.

## Hệ quả

Triển khai đọc chính xác kế thừa chỉ có một biến trạng thái phân giải nguồn: dịch vụ lưu bền vững đang được mount hiện tại. Nó không có hàng đợi bên cung cấp, fingerprint, registry trích xuất, thế hệ quan sát (observation generation), hay cập nhật chỉ mục dẫn xuất; các backend cụ thể tự sở hữu trạng thái tìm kiếm toàn văn của riêng mình. Đọc chính xác, quét ngữ nghĩa và truy vết sự kiện vẫn khả dụng ở triển khai chỉ dùng active, và mang tính xác định khi có persisted.

Việc liệt kê xuyên corpus, truy vết dòng dõi và thao tác sự kiện persisted đều thực hiện I/O backend ở mỗi lần gọi. Đây là chủ đích: tính đúng đắn đến từ trạng thái chuẩn hiện hành, trong khi các phương thức tìm kiếm toàn văn hướng-tới-quy-mô dùng chỉ mục dẫn xuất SQLite của backend cụ thể.
