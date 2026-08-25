# Agent Note: Gộp persistence thời gian thực vào một flush controller duy nhất

Status: implemented

[English](2026-07-23-collapse-persistence-flush-state.md) | Tiếng Việt

[Quyết định bounded write batching](../architecture/2026-08-08-bounded-session-persistence-write-batching.md) đã thay thế nhịp điệu lập lịch tức thời trong Agent Note này. Các quyết định về sở hữu single-controller, giữ lại khi thất bại, tuần tự hóa theo id, retirement và giải phóng tài nguyên khi dừng hoàn toàn vẫn còn hiệu lực.

## Vấn đề

Persistence coordinator từng dùng các buffer, container khởi tạo và container retirement độc lập với nhau, cùng một chuỗi thao tác theo id, để biểu diễn vòng đời ghi của một session đang hoạt động. Các cấu trúc này đều phản ánh cùng một sự thật: liệu `Session` đó còn thao tác khởi tạo hay sự kiện nào phải hoàn tất trước khi có thể giải phóng trạng thái của nó hay không. Việc xả (drain) chỉ do checkpoint kích hoạt cũng khiến mỗi sự kiện ở lại trạng thái dễ mất cho đến khi một plugin khác yêu cầu `session/flush`, mặc dù backend có thể bắt đầu công việc persistence mà không chặn phía sinh sự kiện đồng bộ.

## Quyết định

Mỗi `Session` đang hoạt động có một mục vòng đời chứa phần khởi tạo và một write controller riêng của package. Controller này chịu trách nhiệm cho `pending`, bộ đếm giờ batch cố định, một lượt ghi đang hoạt động (tùy chọn), tạm dừng tự động thử lại, và một flush barrier dùng chung. Listener `session/event` sao chép các sự kiện đã đóng băng vào `pending`; sự kiện đầu tiên thiết lập deadline cố định, các sự kiện sau đó gia nhập nhưng không reset deadline. Một lượt ghi lấy ra một tiền tố ổn định của các mục đang chờ; các sự kiện được nhận trong lúc ghi vẫn ở lại hàng đợi pending và tạo thành một batch kế tiếp độc lập, có giới hạn riêng.

`session/flush` là một barrier dừng hoàn toàn, tức thì. Nó chờ khởi tạo hoàn tất, hủy bộ đếm giờ batch, chờ mọi lượt thử đang hoạt động kết thúc, và xả các sự kiện pending, bao gồm cả những sự kiện được nhận trong lúc barrier đang chạy. Lỗi ghi ở nền được ghi log nhưng không từ chối phía sinh sự kiện đồng bộ; hệ thống khôi phục batch đầy đủ, giữ nguyên thứ tự, và tạm dừng tự động thử lại. Sự kiện mới mở ra một cửa sổ cố định mới; flush tường minh, retirement, hoặc hủy tài nguyên backend sẽ thử lại ngay lập tức, và phơi bày lỗi cho phía gọi nếu lỗi lại xảy ra.

Khởi tạo chỉ đi vào chuỗi thao tác theo id hiện có một lần, và gọi thao tác core chưa tuần tự hóa khi giữ được lượt thực thi của mình. Chuỗi thao tác này vẫn tách biệt với controller đang hoạt động, vì các lời gọi công khai `create`, `append`, `load` có thể xảy ra race dù không có đối tượng `Session`, nên vẫn cần được tuần tự hóa theo định danh.

Việc sửa chữa sau crash chỉ áp dụng cho các định danh nguội (cold). Với các định danh đang hoạt động, `load(id)` sẽ chụp nhanh (snapshot) các sự kiện chính thức đang có trong bộ nhớ trước khi chờ flush hoàn tất, trả về các sự kiện này cùng với `SessionState.meta` (tức header thực sự được dùng bởi lượt ghi persistence) — nếu lượt (turn) vẫn còn mở, nó từ chối lần load này mà không đọc hay sửa chữa storage. Việc load nguội trước tiên chiếm giữ đồng bộ định danh tương ứng bên trong chuỗi thao tác theo id, rồi mới chờ đọc tiền tố đã lưu trữ hoặc thực hiện ghi sửa chữa; trước khi việc chiếm giữ này được giải phóng, ranh giới publish `session/created` sẽ từ chối và rollback việc publish một session đang hoạt động cùng id. Việc HMR (Hot Module Replacement) tiếp quản vẫn được xử lý độc lập bởi `loadStored` và kiểm tra cwd của coordinator, sẽ cắt bỏ phần lưu trữ bị rách nhưng không đóng lượt chính thức đang hoạt động.

Map controller đang hoạt động đồng thời cũng là registry retirement. Khi retirement thành công, hệ thống xả và gỡ bỏ controller của nó; khi retirement thất bại, controller vẫn ở lại trong map. Việc hủy tài nguyên backend sẽ dừng nhận sự kiện, flush mọi controller còn tồn tại, chờ các thao tác theo id còn lại hoàn tất, rồi mới đóng backend. Không cần thêm một tập retirement riêng để phát hiện lại công việc chưa hoàn thành.

## Phương án thay thế

**Giữ nguyên việc ghi trễ chỉ do checkpoint kích hoạt.** Cách này có thể tạo batch lớn hơn, nhưng khiến tính bền vững (persistence) phụ thuộc vào một checkpoint policy được gắn riêng, và tối đa hóa cửa sổ mất dữ liệu do crash giữa các checkpoint. Lập lịch nền có giới hạn vẫn gộp được các sự kiện dồn dập và persist tiến độ giữa các barrier bắt buộc.

**Dùng một flush promise cho toàn bộ phạm vi coordinator.** Cách móc nối này phù hợp cho một file đơn, nhưng một promise toàn cục sẽ tuần tự hóa các session không liên quan với nhau. Mỗi session đang hoạt động có một controller riêng, vừa cho phép thao tác backend của các session khác nhau tiến triển độc lập, vừa được chuỗi thao tác theo id bảo vệ cho các thao tác trên cùng một định danh.

**Khóa vĩnh viễn lỗi ghi nền đầu tiên.** Cách này khiến mỗi lần flush sau đó nhận được kết quả xác định, nhưng sẽ ngăn cơ chế thử lại khi hủy tài nguyên hiện có phục hồi sau lỗi lưu trữ tạm thời. Giữ lại batch nhưng không khóa lỗi giúp giữ được cả khả năng quan sát lẫn khả năng thử lại.

**Từ chối load cho mọi session đang hoạt động.** Cách này an toàn, nhưng khiến các bên tiêu thụ persistence và test không thể dùng snapshot của một session đang hoạt động đã đóng sẵn có. Chụp snapshot trước rồi mới flush cung cấp cho phía gọi một điểm tuyến tính hóa ổn định: flush thành công chứng minh chính snapshot đó đã được persist, và đường dẫn đang hoạt động không bao giờ gọi việc sửa chữa sau crash.

## Kiểm chứng

- Test cho controller dùng fake clock để chứng minh cửa sổ cố định không bị reset, sau đó chặn lượt append đầu tiên, nhận một sự kiện khác trong lúc ghi đó, và quan sát thấy batch persistence thứ hai được thực thi tự động mà không cần gọi `session/flush`.
- Các quy ước coordinator dùng chung vẫn bao phủ việc tiếp quản session đang hoạt động, xung đột, sửa chữa sau crash, và giải phóng tài nguyên cho session lẫn backend trên các backend in-memory, JSONL và SQLite.
- Test lỗi và hủy tài nguyên khiến các batch ghi thất bại vẫn ở trạng thái pending, thử lại các batch này trước khi đóng, và chứng minh rằng controller vẫn đang thực thi sẽ trì hoãn việc đóng backend.
- Quy ước backend dùng chung persist một lượt đang hoạt động vẫn còn mở, chứng minh `load` sẽ từ chối và không ghi sự kiện đóng tổng hợp, sau đó hoàn tất lượt đó và cho owner của nó retire, cuối cùng load lại đúng chính xác lượt đã hoàn tất đó.
- Test hồi quy AgentLoop cho `resume()` chạy đua với một lượt đang hoạt động vẫn còn mở, và chứng minh rằng agent ban đầu vẫn có thể hoàn tất lượt đó và persist nó, không có ranh giới `interrupted` nào bị chèn vào giữa chừng.
- Một backend được kiểm soát sẽ chặn `loadStored`, thử publish một session cùng id trong lúc thao tác sửa chữa đang giữ quyền chiếm dụng định danh, và chứng minh rằng rollback không để lại controller sót lại, sau đó có thể khôi phục thành công một session đã đóng.
- Quy ước nhận chủ sở hữu (unowned claim) thiết lập `createdAt` khác nhau cho `Session` đang hoạt động, và chứng minh rằng cả load đang hoạt động lẫn load nguội sau đó đều trả về đúng header đã được lưu trữ ban đầu.

## Hệ quả

Mục session đang hoạt động đặt phần khởi tạo cùng với một controller; controller này chịu trách nhiệm cho sự kiện pending, bộ đếm giờ, lượt ghi đang hoạt động, tạm dừng thử lại và flush barrier. Coordinator vẫn giữ trạng thái định danh đã persist, các Session nguội đã sẵn sàng, các bên chờ retirement định danh, và chuỗi thao tác theo id trong các container độc lập, vì các vòng đời này vẫn tồn tại ngay cả khi không có Session đang hoạt động nào có thể ghi. Ghi có giới hạn rút ngắn cửa sổ mất dữ liệu do crash trong trường hợp thông thường, tạo ra ít batch backend hơn so với lập lịch tức thời, đồng thời không thay đổi các barrier bắt buộc.

`session/flush` không còn quyết định khi nào persistence thông thường bắt đầu. Nó vẫn là ranh giới quan sát thứ tự và lỗi mà loop cùng checkpoint policy sử dụng, nên checkpoint thành công vẫn có nghĩa là mọi sự kiện được nhận trước khi checkpoint hoàn tất đều đã được persist.
