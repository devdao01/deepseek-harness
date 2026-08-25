# Agent Note: Nạp các phiên đã được lưu bền vững từ trước khi cơ chế định danh tin nhắn ra đời

Status: implemented

[English](2026-07-28-load-pre-identity-session-messages.md) | 中文

## Vấn đề

Thay đổi tin nhắn bất biến có định danh đã thay thế bốn loại payload sự kiện lưu bền vững bằng giá trị tin nhắn đầy đủ. Các phiên v0 JSONL và SQLite hiện có vẫn giữ nguyên hình dạng ngay trước thay đổi đó: sự kiện user và steering (dẫn hướng giữa chừng) mang trực tiếp `content`/`source`, sự kiện assistant mang `content`/`provenance`, còn kết quả tool thì mang `callId`/`content`/`isError`. Header của các phiên này vẫn khớp với `SESSION_FORMAT_VERSION`, nhưng việc xác thực hình dạng hiện tại sẽ từ chối chúng, khiến luồng khôi phục không thể dựng được `Session` đang hoạt động.

Việc biểu diễn tin nhắn thay đổi mà không nâng version khiến các log này không thể phân biệt với log v0 hiện tại chỉ bằng header. Runtime cần một quy tắc import có phạm vi giới hạn, vừa khôi phục được dữ liệu do các backend chính chủ được hỗ trợ tạo ra, vừa không làm suy yếu việc xác thực đối với các sự kiện lỗi thời không liên quan hoặc sự kiện sai định dạng.

## Quyết định

`PersistenceCoordinator` sẽ chuẩn hóa bốn loại payload tin nhắn cụ thể từ trước khi có cơ chế định danh tin nhắn, ngay sau khi backend giải mã và trước khi xác thực tin nhắn hiện tại. Nó bọc các trường ngữ nghĩa sẵn có của payload vào bên trong hình dạng tin nhắn hiện tại được phân theo role, và gán cho chúng một `MessageId` xác định dùng cho việc import: `legacy-message:<session-id>:<event-seq>`. Việc thay thế nội dung của `tool/result` phiên bản cũ sẽ kế thừa id đã được import của đối tượng bị thay thế, nhờ đó giữ được bất biến hiện tại là chỉ ghi đè nội dung.

Cùng một phép chuẩn hóa này cũng được dùng cho `load`, `inspect`, việc claim phiên đang hoạt động của trạng thái đã nạp không có owner, và việc tiếp quản tiền tố (prefix) khi HMR (Hot Module Replacement). Do đó, việc so sánh tiền tố sẽ đối chiếu seed hình dạng hiện tại của phiên đang hoạt động với cùng một view lưu trữ đã được chuẩn hóa đó. Một lớp bọc trông giống hình dạng hiện tại nhưng thiếu trường hoặc trường không hợp lệ sẽ không được sửa; các loại sự kiện không được hỗ trợ, request header, version và quan hệ surface vẫn đi theo đường từ chối hiện có.

Việc nâng cấp này chỉ diễn ra khi đọc. Các bản ghi phiên bản cũ trong storage vẫn giữ nguyên; sau khi phiên được khôi phục, chỉ có các sự kiện có hình dạng hiện tại mới được nối thêm vào sau đó. Định danh xác định giúp việc nạp lặp lại cũng như log pha trộn giữa hình dạng cũ và mới tái tạo ra cùng một tập id tin nhắn mà không cần thực hiện giao dịch viết lại chuyên biệt cho từng backend.

## Các phương án thay thế đã cân nhắc

**Từ chối các log này theo lập trường tương thích tiền phát hành.** Đây là cách xử lý mặc định cho các thay đổi hình dạng v0 khác, nhưng ngay cả khi mọi trường phiên bản cũ đều ánh xạ rõ ràng sang biểu diễn tin nhắn hiện tại, nó vẫn khiến các phiên chính chủ thực tế không thể khôi phục được.

**Viết lại toàn bộ log lưu trữ tại chỗ.** Cách này sẽ làm chuẩn hóa sản phẩm lưu trữ, nhưng vi phạm quy ước lưu trữ chỉ-nối-thêm (append-only), đồng thời đòi hỏi triển khai riêng cơ chế thay thế nguyên tử (atomic) cho cả JSONL lẫn SQLite, biến một bản vá tương thích khi-đọc thành cả một hệ thống migration.

**Sinh id ngẫu nhiên mỗi lần nạp.** Các tin nhắn này sẽ thỏa mãn hình dạng kiểu dữ liệu, nhưng không giữ được định danh ổn định giữa các lần inspect, khôi phục, restart, và giữa các lần nối thêm pha trộn hình dạng cũ/mới.

## Hệ quả

Các phiên JSONL và SQLite từ trước khi có cơ chế định danh tin nhắn có thể được khôi phục, và giữ nguyên nội dung tin nhắn gốc, nguồn gốc, các trường provider/model của assistant, liên kết tool call, lỗi, metadata và việc thay thế surface. Ngoài ra ra, các sự kiện trả về không thể phân biệt được với snapshot tin nhắn được import theo hình dạng hiện tại, và vẫn được deep-freeze như bình thường.

Đây là một ngoại lệ import cùng-version tường minh, chứ không phải một lớp tương thích v0 tổng quát. Muốn thêm một ngoại lệ khác, phải cung cấp thêm một bộ ánh xạ đầy đủ và không mơ hồ tại ranh giới lưu trữ; dữ liệu hiện tại nếu sai định dạng vẫn sẽ bị hệ thống từ chối, chứ không đoán mò cách biến nó thành dữ liệu hợp lệ. Quy ước coordinator dùng chung sẽ xác thực việc nâng cấp này trên cả bản triển khai tham chiếu trong bộ nhớ, backend JSONL và SQLite, bao gồm cả tính xác định khi nạp lại, và việc kế thừa định danh khi thay thế kết quả tool.

## Liên quan

- [Tạo mỗi tin nhắn thành một giá trị bất biến có định danh](../architecture/2026-07-28-identified-immutable-message-values.md): note này chịu trách nhiệm cho quy ước định danh và tính bất biến của tin nhắn hiện tại.
- [Lưu trữ bền vững phiên như một dịch vụ trừu tượng](../architecture/2026-06-14-session-persistence.md): note này chịu trách nhiệm cho backend chỉ-nối-thêm và ranh giới khôi phục.
