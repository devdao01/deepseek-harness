# Agent Note: Đặt giới hạn trên cho batching ghi lưu bền phiên

Status: implemented

[English](2026-08-08-bounded-session-persistence-write-batching.md) | 中文

## Vấn đề

Phản hồi streaming có thể phát ra một lượng lớn sự kiện `assistant/chunk` trong thời gian ngắn. Trước đây, chỉ cần hàng đợi rảnh nhận được một sự kiện, bộ điều phối lưu bền sẽ lập tức lên lịch một lần append backend. Các sự kiện đến trong lúc append đó vẫn đang chạy sẽ dùng chung một batch tiếp theo, nhưng nếu backend đủ nhanh, vẫn có thể tạo ra rất nhiều lần append lưu bền nhỏ lẻ. Mỗi lần append JSONL đều tạo và đồng bộ một frame Zstandard hoặc hậu tố định dạng thô, còn mỗi lần append SQLite đều mở và commit một transaction, đồng thời tăng số phiên bản sửa đổi (revision) của phiên.

Bỏ các sự kiện chunk hoặc thay chúng bằng message đã lắp ráp hoàn chỉnh có thể giảm khối lượng lưu trữ logic, nhưng cũng sẽ làm thay đổi event log, replay, số thứ tự, timestamp, và seq chunk mà message assistant tham chiếu tới. Vấn đề khuếch đại ghi (write amplification) không đòi hỏi phải áp dụng phương án có thay đổi ngữ nghĩa lớn như vậy.

### Cơ sở định lượng

Fixture (dữ liệu chuẩn bị trước cho test) của repo cho thấy khối lượng dữ liệu logic có căn cứ cụ thể. Giải mã các dòng đã đóng gói trong [`goal-multi-turn-actions`](../../../../apps/web/tests/snapshots/goal-multi-turn-actions/session.jsonl) hiện tại, ta được 2.098 sự kiện, trong đó 2.017 là chunk (96,1%). Các dòng JSONL sau khi giải nén các chunk này tổng cộng 332.647 byte, chiếm 87,7% trong tổng 379.225 byte của toàn bộ sự kiện; việc đóng gói chunk giúp file đã commit trong repo giảm còn 89.176 byte và 182 dòng lưu trữ, trong đó có 23 dòng chunk đã đóng gói. [`permission-policy-context`](../../../../apps/web/tests/snapshots/permission-policy-context/session.jsonl) có 813 sự kiện, trong đó 746 là chunk (91,8%); các dòng JSONL sau khi giải nén các chunk này tổng cộng 118.935 byte, chiếm 64,4% trong tổng 184.821 byte của toàn bộ sự kiện. File đã đóng gói của nó là 84.917 byte, tổng 123 dòng lưu trữ, trong đó có 14 dòng đã đóng gói. Đây là các fixture xác định đã được đưa vào kiểm soát phiên bản, không đại diện cho phân bố tải sản xuất thực tế; nhưng chúng cho thấy tại sao xóa chunk lại giảm khối lượng dữ liệu logic, và cũng cho thấy bố cục dòng đóng gói hiện có đã loại bỏ phần lớn overhead bao gói JSON.

SQLite lưu mỗi sự kiện logic thành một dòng, do đó cùng một log logic sẽ giữ lần lượt 2.098 và 813 dòng sự kiện; batching không làm thay đổi các con số này. Mỗi batch append lưu bền của JSONL sẽ ghi một frame Zstandard và thực hiện một lần fsync, mỗi batch của SQLite sẽ thực hiện một transaction và tăng một lần revision phiên. File runtime không ghi lại ranh giới append ban đầu, do đó không thể coi số dòng lưu trữ của fixture là số lần fsync hay transaction.

Giới hạn trên của lịch trình là xác định. Khi phía ghi hoàn thành ngay lập tức mỗi thao tác, bộ điều khiển tức thời ban đầu có thể phát một lần append riêng cho mỗi sự kiện đến sau khi lần append trước đó hoàn thành. Một test bộ điều khiển tiếp nhận 20 sự kiện với khoảng cách 10 ms: cửa sổ cố định 200 ms sẽ giao toàn bộ 20 sự kiện cho một lần append. Với nhịp độ đến này, số lần append giảm từ 20 xuống còn 1, nhưng đây không phải tỷ lệ phổ quát. Sự kiện thưa, flush bắt buộc, ghi trước đó chậm hơn, và tốc độ đến khác nhau đều sẽ tạo ra kích thước batch khác nhau.

## Quyết định

Plugin JSONL và SQLite chính thức (first-party) công khai `writeBatchMaxDelayMs`, giá trị của nó phải là số nguyên dương không vượt quá giới hạn timer của Node, mặc định là `200`. Mỗi plugin sẽ phân giải giá trị này khi load, rồi truyền cho `PersistenceCoordinator`; hành vi batching vẫn chỉ do bộ điều phối chịu trách nhiệm.

Mỗi phiên đang hoạt động có một `SessionWriteBehind` riêng của gói. Khi hàng đợi chờ xử lý của nó chuyển từ rỗng sang không rỗng, bộ điều khiển sẽ khởi động một cửa sổ cố định. Các sự kiện tiếp theo sẽ gia nhập batch đó nhưng không reset thời hạn: đây là gộp có giới hạn (bounded merge), không phải debounce. Khi đến thời hạn, bộ điều khiển sẽ giao toàn bộ tiền tố (prefix) đang chờ cho cơ chế serialize theo id hiện có, và ghi theo đường dẫn `appendBatch`. Cùng một phiên tại một thời điểm chỉ có tối đa một lần ghi đang hoạt động. Các sự kiện được tiếp nhận trong lúc ghi đó sẽ tạo thành tiền tố chờ mới, có thời hạn cố định riêng; nếu thời hạn đó hết hạn trước khi lần ghi trước hoàn thành, tiền tố mới sẽ bắt đầu ghi ngay sau khi lần ghi trước hoàn tất.

`writeBatchMaxDelayMs` chỉ giới hạn thời gian bộ điều khiển chủ động chờ để batching. Việc lập lịch của event loop, khởi tạo, các thao tác serialize trước đó và I/O backend đều có thể trì hoãn thời điểm hoàn thành lưu bền, do đó tùy chọn này không đưa ra SLA cứng nào về thời điểm hoàn thành fsync hay mất dữ liệu khi crash.

`session/flush` sẽ hủy phần chờ còn lại, và đóng vai trò như một rào chắn (barrier) dừng hẳn hoàn toàn dùng chung. Nó sẽ chờ lần thử ghi đang hoạt động trước khi hoàn thành, và xả hết mỗi sự kiện được tiếp nhận trong lúc rào chắn đang chạy. Việc phiên nghỉ hưu (retire) và dispose (giải phóng tài nguyên) backend dùng chung rào chắn này, do đó teardown vòng đời sẽ không bao giờ phải chờ timer batching. Chiến lược checkpoint vẫn sẽ thiết lập rào chắn bắt buộc trước các yêu cầu model và side effect công cụ ở top-level.

Mỗi sự kiện vẫn được lưu bền theo đúng thứ tự và hình thái ban đầu. Bộ điều khiển sẽ sao chép mỗi sự kiện khi tiếp nhận; bất kỳ `assistant/chunk`, `seq`, `time`, metadata surface hay bản ghi lưu trữ nào cũng sẽ không bị xóa hoặc ghi đè. Do đó, JSONL có thể mã hóa nhiều sự kiện hơn trong một frame append, SQLite có thể chèn nhiều dòng sự kiện hơn trong một transaction, mà không cần thay đổi định dạng đĩa hay phiên bản schema của bất kỳ bên nào.

Sau khi append nền thất bại, bộ điều khiển sẽ khôi phục toàn bộ batch về trước tất cả các sự kiện chờ mới hơn, báo cáo lỗi đó một lần, và tạm dừng tự động retry. Sự kiện đầu tiên được tiếp nhận sau đó sẽ mở một cửa sổ cố định mới; flush tường minh, retire hoặc dispose sẽ retry ngay lập tức, và nếu lỗi lại xảy ra thì sẽ lộ lỗi đó ra cho phía gọi. Cách này tránh được vòng lặp lỗi do timer điều khiển, đồng thời giữ nguyên ranh giới flush có thể khôi phục hiện có.

Quyết định này chỉ thay thế nhịp lập lịch tức thời trong [gộp lưu bền thời gian thực vào một bộ điều khiển flush duy nhất](../simplification/2026-07-23-collapse-persistence-flush-state.md). Đối với việc dùng một bộ điều khiển cho mỗi phiên đang hoạt động, giữ lại batch lỗi, serialize theo id, retire và dispose dừng hẳn hoàn toàn, Agent Note gốc vẫn là bản ghi thẩm quyền. Ranh giới hook backend vẫn do [bộ điều phối ghi lưu bền dùng chung](2026-06-18-shared-persistence-write-coordinator.md) định nghĩa.

## Phương án thay thế

**Không lưu bền sự kiện chunk streaming.** Không được áp dụng ở đây: điều này sẽ thay đổi vị thế thẩm quyền của event sourcing và ngữ nghĩa khôi phục, chứ không chỉ thay đổi nhịp ghi vật lý. Trước khi một phương án thay thế không mất thông tin định nghĩa độc lập được replay, fork, liên kết tham chiếu sự kiện gốc, thứ tự và hành vi khi crash, [quyết định từ chối chỉ giữ message assistant đã lắp ráp](../../rejected/simplification/2026-06-20-assembled-assistant-messages-only.md) hiện có vẫn là quy tắc bảo vệ. [Quyết định dòng đóng gói](2026-07-26-packed-chunk-rows-by-default.md) vẫn là tối ưu dung lượng lưu trữ JSONL đi kèm.

**Chỉ ghi lưu bền tại các checkpoint ngữ nghĩa.** Không áp dụng: phương án này sẽ tối đa hóa batching, nhưng khiến cửa sổ mất dữ liệu thông thường khi crash phụ thuộc vào một chính sách gắn riêng khác. Ghi nền có giới hạn sẽ lưu bền tiến độ giữa các checkpoint, trong khi flush bắt buộc tiếp tục cung cấp cam kết thứ tự mạnh hơn.

**Reset cửa sổ debounce theo sự kiện mới nhất.** Không áp dụng: phản hồi streaming liên tục không ngừng có thể trì hoãn vô thời hạn lần ghi đầu tiên. Cửa sổ cố định được khởi động bởi sự kiện chờ đầu tiên cung cấp giới hạn trên thực sự cho việc chủ động chờ gộp.

**Triển khai timer riêng cho JSONL và SQLite.** Không áp dụng: lập lịch, giữ lại lỗi, race flush và teardown đều là các vấn đề vòng đời không phụ thuộc backend. Triển khai lặp lại các cơ chế này sẽ tái tạo lại sự trôi dạt triển khai mà `PersistenceCoordinator` đã loại bỏ.

## Xác minh

Test bộ điều khiển dùng đồng hồ giả để chứng minh cửa sổ 200 ms cố định và không reset, rào chắn flush tức thời và có thể chia sẻ, các sự kiện được tiếp nhận trong lúc rào chắn đang chạy, batch đuôi đã vượt quá thời hạn cửa sổ sau lần ghi đang hoạt động, giữ lại batch lỗi có thứ tự, tạm dừng tự động retry, và retry tường minh đối với lỗi nền xảy ra chồng lấn. Test bộ điều phối xác minh bộ điều khiển này trong các đường dẫn thông báo phiên, retire, thu hồi xung đột và teardown. Bộ test JSONL và SQLite tiếp tục bao phủ định dạng lưu trữ, transaction, khôi phục và quy ước lưu bền dùng chung.

## Hệ quả

Các đợt sự kiện tần suất cao thường sẽ giảm số lần append lưu bền, đồng thời giữ nguyên hoàn toàn số lượng sự kiện logic. Mức giảm phụ thuộc vào tốc độ đến của sự kiện và độ trễ backend: các sự kiện đợt nằm trong cùng cửa sổ 200 ms sẽ trở thành một batch, trong khi flush bắt buộc và sự kiện thưa vẫn có thể tạo ra batch nhỏ.

Quyết định này không giới hạn số lượng sự kiện hoặc số byte đang chờ tích lũy do backend chậm, cũng không giảm số dòng SQLite hay log logic đã giải mã. Nếu muốn thiết lập giới hạn trên bộ nhớ đã được xác minh hoặc chính sách lưu giữ logic, cần định nghĩa riêng ngữ nghĩa lỗi và replay cho việc đó, thay vì đưa thêm một quy tắc timer ngầm khác.

Sự kiện sau khi tiếp nhận có thể chỉ tồn tại trong bộ nhớ trong khoảng thời gian cửa sổ cấu hình, và sau đó cũng có thể như vậy trong lúc chờ lập lịch hoặc chờ backend hoàn thành công việc. Việc triển khai có thể chọn giá trị nhỏ hơn để rút ngắn cửa sổ mất dữ liệu thông thường, hoặc chọn giá trị lớn hơn để tăng cường batching. Ranh giới bền vững tường minh giữ nguyên không đổi, và sẽ bỏ qua việc chờ.

Module deep mới thống nhất chịu trách nhiệm về timer, lần ghi đang hoạt động, tiền tố chờ, tạm dừng retry và rào chắn. `PersistenceCoordinator` tiếp tục chịu trách nhiệm khởi tạo và serialize theo định danh; backend vẫn chỉ chịu trách nhiệm về nguyên hàm lưu trữ bền vững. `SESSION_FORMAT_VERSION` và `SCHEMA_VERSION` của SQLite đều không đổi.
