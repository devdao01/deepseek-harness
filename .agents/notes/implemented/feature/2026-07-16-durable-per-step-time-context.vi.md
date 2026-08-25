# Agent Note: Ngữ cảnh thời gian theo từng bước, bền vững

Status: implemented

[English](2026-07-16-durable-per-step-time-context.md) | 中文

## Vấn đề

Một đồng hồ chỉ tồn tại trong request có thể cho model biết thời gian hiện tại, nhưng thay thế giá trị đó trong system prompt sẽ xóa mất bằng chứng mà suy luận nhạy cảm với thời gian trước đó dựa vào. Trong một lượt (turn) gồm nhiều bước (step), request cần giữ lại các lần đọc đã dùng ở các bước trước. Hệ thống phải có khả năng dựng lại request sau khi khởi động lại, và nén tự động (compaction) cũng phải tính đến đúng ngữ cảnh thời gian mà model thực sự nhận được.

Cache refresh cục bộ theo tiến trình sẽ khiến thời gian hiển thị phụ thuộc vào trạng thái không thể giữ lại sau khi khôi phục. Ngôn ngữ tự nhiên đến từ trình duyệt cũng cần được quy về múi giờ của request: múi giờ tiến trình phía server không thể suy ra vị trí người dùng, còn giá trị mặc định có thể thay đổi ở cấp phiên hoặc kết nối sẽ khiến việc di chuyển hoặc các tab đồng thời diễn giải lại một prompt khác.

## Quyết định

`@deepseek-ai/dsh-time-context` là một plugin chức năng cần bật rõ ràng, nằm tại `packages/context/time-context/`. Tổ hợp mặc định không bật nội dung tiết lộ và chi phí token của nó; overlay Schedule Web sẽ gắn nó, để model có thể diễn giải ngày giờ chưa xác định múi giờ theo múi giờ trình duyệt đính kèm request hiện tại.

Plugin này gắn trước (prepend) một listener `agent/pre-step`, và ủy thác xuống downstream trước. Khi quyết định downstream tiến vào một bước và cần sinh một lần đọc, plugin sẽ gộp message cuối cùng của quyết định đó với các message người dùng bền vững đã có trong lượt đang mở, suy ra thông tin nguồn múi giờ trình duyệt từ đúng message user-rpc nguồn, và nối thêm một lần đọc vào quyết định đó. Khi quyết định bị từ chối, listener fail, hoặc tín hiệu đã bị hủy, sẽ không ghi lại gì cả. Việc steering (chỉ dẫn giữa chừng) được nhận sau batch hiện tại vẫn thuộc về bước tiếp theo thông thường, và nhận lần đọc mới khi bước đó bắt đầu.

Mỗi prompt Web đều lấy mẫu múi giờ IANA của trình duyệt. Host kiểm tra và chuẩn hóa giá trị đó, rồi gắn nó vào đúng nguồn message người dùng bền vững. Trong lượt đang mở chỉ có duy nhất một múi giờ có thể giải quyết được cho request; nhiều múi giờ sẽ tạo ra kết quả `mixed` đã sắp xếp; không có múi giờ nào thì là `unavailable`. Request giải quyết thành công sẽ báo cho model diễn giải ngày giờ chưa xác định múi giờ theo múi giờ đó. Khi thông tin nguồn hỗn tạp hoặc không có sẵn, model sẽ nhận chỉ dẫn yêu cầu người dùng làm rõ.

Thông tin nguồn gắn với message này không được sao chép sang `SessionHeader`, giá trị mặc định của kết nối, hay trạng thái Schedule. Time-context chỉ chịu trách nhiệm hướng dẫn model. Các tool nhận trường lịch cục bộ tường minh vẫn phải tự định nghĩa ranh giới riêng; do đó Schedule yêu cầu `time_zone`, thay vì import lần đọc từ plugin này ([quyết định](../simplification/2026-08-09-explicit-schedule-time-zone.md)).

Múi giờ trình duyệt đã giải quyết cũng được dùng để định dạng timestamp trong lần đọc. Khi thông tin nguồn của request hỗn tạp hoặc không có sẵn, hệ thống dùng giá trị fallback `timeZone` đã cấu hình; nếu bỏ qua cấu hình đó, hệ thống dùng múi giờ tiến trình Node được giải quyết một lần khi plugin tải, đồng thời vẫn giữ chính sách yêu cầu làm rõ. Mỗi giá trị fallback đều được `Intl.DateTimeFormat` kiểm tra.

Mỗi lần đọc đều dùng đúng nguồn snapshot `{ kind: 'plugin', plugin: 'time-context', form: 'snapshot', sections: [{ name: 'time-context', text: <same text> }] }`. Module bất biến đi kèm sẽ kiểm tra hình dạng snapshot, suy lại thông tin nguồn trình duyệt của lượt hiện tại từ message user-rpc gốc, và kiểm tra múi giờ timestamp đã render cùng đường cơ sở (baseline) thời lượng đã trôi qua.

Cấu hình tùy chọn `refreshIntervalMs` phải là số nguyên an toàn, không âm. Khi bỏ qua hoặc đặt `0`, mỗi bước đủ điều kiện và đã bắt đầu đều được tiêm. Khi đặt số dương, plugin quét các event phiên gốc, tìm lần đọc plugin mới nhất; nó tiêm khi không có lần đọc nào, đồng hồ tường bị lùi lại, hoặc event đã đạt đến khoảng thời lượng tương ứng. Timestamp của event vẫn là căn cứ phán đoán sau khi nén và khôi phục, không cần cache cục bộ theo tiến trình. Overlay Schedule Web bỏ qua khoảng này, để mỗi bước request đều nhận chỉ dẫn múi giờ trình duyệt hiện tại.

### Văn bản và đường cơ sở thời lượng

Lần đọc đã giải quyết ở bước đầu tiên có dạng:

```text
Time sampled while preparing turn <turn>, step 1: <timestamp-in-browser-zone>
Browser time zone for this request: <iana-zone>. Interpret otherwise-unqualified dates and times in this zone.
Elapsed since the preceding model-visible message: <duration-or-unavailable>.
```

Các biến thể hỗn tạp và không có sẵn sẽ thay dòng thứ hai bằng chỉ dẫn yêu cầu làm rõ. Đường cơ sở là message người dùng, trợ lý, hoặc kết quả tool đã được lưu bền vững gần nhất trước đó. Prompt đề xuất cho bước đó chưa được nối thêm, do đó phiên mới có thể báo `unavailable`.

Lần đọc ở các bước sau sẽ thay số bước ở dòng đầu tiên, và kết thúc bằng dòng sau:

```text
Elapsed since the preceding step context: <duration-or-unavailable>.
```

Đường cơ sở của nó là event time-context trước đó trong lượt đang mở. Khi thiếu đường cơ sở, báo `unavailable`; thời lượng dùng đơn vị giây nguyên gọn, và bị giới hạn về không khi đồng hồ tường bị lùi lại.

### Tính bền vững và dựng lại

Bước đã bắt đầu sẽ nối thêm message trả về của nó sau `step/start`, trước khi request được suy ra, rồi mới nối thêm lần đọc thời gian. Khi bước chuẩn bị tiếp theo thất bại, lần đọc có thể vẫn còn trong lịch sử, vì nó ghi lại việc bước bắt đầu, chứ không phải việc truyền thành công. Mỗi lần đọc được giữ lại như một node surface thông thường, cho đến khi nén che nó đi. Khoảng số dương cho phép các request sau tái sử dụng lịch sử hiện có mà không thêm lần đọc mới.

Plugin không đóng góp gì vào việc lắp ráp system prompt hay `request/header`. Việc dựng lại request lấy toàn bộ tiền tố surface bền vững tại mỗi `step/start`, do đó request lịch sử có thể khôi phục đúng thời gian và chính sách trình duyệt mà model đã thấy.

## Các phương án thay thế đã cân nhắc

- **Thay thế giá trị system prompt động**: không áp dụng, vì việc thay thế sẽ xóa các lần đọc trước đó, và thay đổi request lịch sử sau khi dựng lại.
- **Lưu bền vững múi giờ mặc định cấp phiên**: không áp dụng, vì sự thật trình duyệt chỉ thuộc về một prompt; việc di chuyển và các tab đồng thời không được phép thay đổi ý nghĩa dùng chung, cũng không được lan trạng thái múi giờ vào các quy ước phiên, fork và persistence.
- **Sao chép múi giờ trình duyệt sang một nguồn ngữ cảnh có thẩm quyền thứ hai**: không áp dụng, vì message user-rpc gốc đã sở hữu giá trị đó, bất biến có thể suy lại chính sách trực tiếp.
- **Để Schedule ngầm tiêu thụ lần đọc**: không áp dụng, vì ngữ cảnh ngôn ngữ tự nhiên không phải giá trị mặc định định kiểu ổn định, và điều này sẽ ràng buộc bộ giải quyết thời gian tuyệt đối với lịch sử AgentLoop. Model sẽ thay vào đó truyền offset hoặc múi giờ tường minh.
- **Chỉ dùng múi giờ tiến trình**: không áp dụng, vì vị trí triển khai không thể suy ra múi giờ người dùng ở xa. Nó vẫn có thể dùng làm giá trị fallback hiển thị khi thông tin nguồn của request thiếu hoặc hỗn tạp.
- **Chỉ cung cấp thời gian qua tool**: không áp dụng, vì suy luận thời gian thông thường sẽ sinh ra vòng gọi qua lại (round-trip) có thể tránh được, cũng không đảm bảo có lần đọc trước mỗi bước.
- **Gắn time-context theo mặc định**: không áp dụng, vì nội dung tiết lộ, tính mới và chi phí lịch sử vẫn thuộc chính sách tổ hợp.

## Kiểm chứng

Unit test và test agent loop (vòng lặp tác tử) thật cố định việc định dạng timestamp, suy ra múi giờ trình duyệt duy nhất/hỗn tạp/thiếu, hiển thị fallback, hai loại đường cơ sở thời lượng đã trôi qua, ranh giới khoảng, lập lịch qua nhiều lượt và sau khôi phục, hành vi đồng hồ tường bị lùi, quy thuộc steering, hủy, kiểm tra snapshot chính xác và dựng lại request. Test Host/client cố định việc lấy mẫu trình duyệt, cũng như kiểm tra và chuẩn hóa khi prompt bắt đầu. Kịch bản lắp ráp Schedule Web không cần key gửi một prompt trình duyệt thật, quan sát cùng múi giờ trong request model, và xác nhận model truyền múi giờ đó tường minh cho `schedule_create`.

## Hệ quả

- Ý nghĩa múi giờ trình duyệt thuộc về request và có thể dựng lại bền vững, không cần thay đổi schema phiên, fork, JSONL hay SQLite.
- Model nhận giả định địa phương trình duyệt đã yêu cầu ở mỗi bước request Schedule Web; khi thông tin nguồn hỗn tạp hoặc thiếu, nó sẽ hỏi thay vì đoán.
- Tool vẫn giữ ranh giới tường minh: ngữ cảnh giúp model chọn trường, nhưng không trở thành giá trị mặc định ẩn ở seam gói.
- Ngữ cảnh thời gian chỉ nối thêm và được giữ lại đến khi nén; khoảng dương làm giảm tăng trưởng lịch sử, nhưng cũng có thể khiến request sau thiếu chỉ dẫn múi giờ trình duyệt mới.
