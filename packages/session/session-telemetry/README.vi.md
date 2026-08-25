# @deepseek-ai/dsh-session-telemetry

[English](README.md) | Tiếng Việt

Telemetry Service Definition khai báo quy ước backend `SessionTelemetrySink`, bộ điều phối bắt giữ chuyển bản ghi session cho bất kỳ backend SDK báo cáo nào triển khai quy ước đó. Phía bắt giữ có thể theo sát sự kiện session thời gian thực, hoặc replay tiền tố log session có thẩm quyền theo yêu cầu. Gói này ngừng xử lý ngay sau khi gọi `emit()`: batch, thử lại, xếp hàng và chiến lược mất dữ liệu đều thuộc về SDK của chính backend đó, gói này không quy định cũng không bọc chúng. Cơ sở thiết kế và các lựa chọn thay thế bị bác bỏ xem [Agent Note hồi sinh](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md), [gửi có cổng phản hồi](../../../.agents/notes/implemented/feature/2026-08-05-feedback-gated-session-telemetry.md) và [replay phản hồi không buffer](../../../.agents/notes/implemented/simplification/2026-08-06-buffer-free-feedback-telemetry.md).

## Quy ước backend

`SessionTelemetrySink` có ba thành viên: `emit(record)` phải xếp hàng và không được chặn, vì nó chạy đồng bộ trong `session/event` hoặc trong lần replay log có thẩm quyền tường minh; `flush()` tùy chọn là gợi ý sau khi kết thúc lượt, bên gọi không chờ kết quả, hầu hết backend bỏ qua nó và dùng lịch batch thông thường của SDK; `shutdown()` giải phóng bản ghi đã xếp hàng, và kết thúc sau khi SDK dừng, dispose (giải phóng tài nguyên) sẽ chờ nó. Triển khai cung cấp `flush()` phải sắp xếp thứ tự giữa flush đồng thời và việc giải phóng cuối cùng của `shutdown()`. `SessionTelemetryBackend` đăng ký API này dưới khóa context `sessionTelemetry`: mỗi context chỉ cho phép một triển khai, nạp lặp lại sẽ throw. Backend dựng `SessionTelemetryCoordinator` với kiểu bắt giữ `live` hoặc `on-demand`, và gọi `captureSession(session, throughSeq?)` tại trigger do chính nó chọn.

Service này còn mang thành viên `sharing` bắt buộc của [`SessionTelemetrySharingStatus`](#the-sharing-disclosure): mỗi backend phải tiết lộ chính sách chia sẻ ở cấp triển khai cho surface xác nhận hướng tới người dùng (văn bản xác nhận của lệnh `/feedback`). Bên tiêu thụ chỉ render "chưa cấu hình" khi không có service telemetry nào được gắn. Seam sở hữu từ vựng này (`full` | `feedback-only` | `disabled`), do đó bất kỳ backend nào cũng có thể tiết lộ chính sách mà không cần phụ thuộc gói OTel.

<a id="the-sharing-disclosure"></a>

## Tiết lộ chia sẻ

Văn bản xác nhận của một mục phản hồi đã ghi sẽ báo cáo session có được chia sẻ hay không và chia sẻ như thế nào, đọc từ `sharing` của backend đã gắn. Backend thiết lập thuộc tính này theo cấu hình triển khai của nó: `full` (mỗi sự kiện được bàn giao ngay khi xảy ra), `feedback-only` (không bàn giao gì cho đến khi sự kiện `feedback/record` giải phóng tiền tố chưa giải phóng trước đó của nó) hoặc `disabled` (hoàn toàn không bàn giao gì). Bên tiêu thụ ánh xạ trạng thái thành văn bản hướng tới người dùng; việc tiết lộ không bao giờ khẳng định đã đầu tư đầu — bàn giao là xếp hàng không chặn, batch, thử lại và chiến lược mất dữ liệu vẫn thuộc SDK backend.

## Điểm bắt giữ

Trong chế độ `live`, toàn bộ đăng ký của bộ điều phối đều thông qua effect của fiber bên cấu thành: `session/created` (nhận nuôi: ghi header, và đọc lại log từ ranh giới constructor qua projection; seed constructor từ fork hoặc khôi phục không bao giờ được phát lại trên firehose, cũng không bao giờ được export lại), `session/event` (projection, deep copy, che dấu, rồi bàn giao; không I/O), `session/flush` (chuyển tiếp gợi ý `flush()` tùy chọn và trả về void; tác vụ song song mà loop đang chờ không bao giờ được chờ telemetry), `session/disposed` (bắt bản ghi vận hành `shutdown` của session đó tại ranh giới kết thúc của chính nó, sau đó rút lui nó), `agent/error` (chuyển tiếp bus thời gian thực duy nhất; từ vựng sự kiện session cố tình không bao gồm bản ghi lỗi vận hành), một effect dispose (bắt shutdown của mọi session còn sống, rồi chờ `shutdown()` của backend; thất bại chỉ phát cảnh báo, không throw), và một lượt quét nhận nuôi trên `ctx.sessions.list()` (hot reload không phát lại `session/created`). Trong chế độ `on-demand`, bộ điều phối chỉ đăng ký effect dispose: `captureSession()` đọc log có thẩm quyền, đến ranh giới số thứ tự tùy chọn (bao gồm cả ranh giới); gợi ý flush và sự kiện vận hành ở lại local.

## Waterfall che dấu (sự kiện chuỗi thác)

Mỗi bản ghi ngay sau khi projection sẽ đi qua waterfall `sessionTelemetry/record`, đây là điểm mở rộng che dấu của Service Definition. Bản thân gói này không mang theo quy tắc nào: `next()` ở lớp trong cùng chuyển tiếp bản ghi nguyên trạng, do đó khi chưa gắn listener, bản ghi đến backend đúng như lúc bắt được. Dữ liệu export sạch đến mức nào phụ thuộc chính xác vào việc bên triển khai đã gắn quy tắc gì. Listener xếp chồng bằng cách biến đổi giá trị trả về của `next()`; trả về mà không gọi `next()` tức là thay thế toàn bộ logic bên dưới nó; listener throw sẽ chặn bản ghi đó theo kiểu fail-closed trong phạm vi cô lập của bộ điều phối. Việc bắt giữ thời gian thực chạy waterfall khi nối thêm; việc bắt giữ theo yêu cầu chạy waterfall dùng quy tắc đang gắn tại thời điểm replay log có thẩm quyền. Việc che dấu chỉ tác động lên bản sao gửi ra ngoài; log session có thẩm quyền không bao giờ bị ghi lại.

## Con trỏ handoff

Một `WeakMap<Session, seq>` phạm vi module ghi seq cao nhất đã bàn giao (không phải đã đầu tư đầu) của mỗi session. Việc bắt giữ thời gian thực tiến con trỏ khi nối thêm; việc bắt giữ theo yêu cầu chỉ tiến con trỏ khi `captureSession()` bàn giao tiền tố được yêu cầu cho backend. Tiền tố chưa bắt giữ chỉ ở lại trong log có thẩm quyền, do đó việc nạp lại bộ điều phối không làm tăng trạng thái khôi phục riêng của telemetry. Khi replay, bộ điều phối chỉ bàn giao lại sự kiện sau con trỏ (sự kiện tại và trước con trỏ vẫn dùng để tái tạo trạng thái projection phân đoạn); khi thiếu con trỏ sẽ giảm cấp an toàn về việc bàn giao lại từ ranh giới constructor của session (`Session.firstLiveSeq`, seq 0 với session sinh ra trong tiến trình này), được đầu nhận hấp thụ bằng khử trùng lặp dựa trên `(session.id, event.seq)`. Seed constructor không bao giờ được export lại: lịch sử của session được khôi phục đã được tiến trình trước phát ra với cùng id, còn tiền tố kế thừa của session được fork nằm trong luồng của session cha (đầu nhận ghép lại dựa trên `session.parent_id` + `session.seed_length`). Cái giá chấp nhận theo đó nhất quán với việc đầu tư nhiều nhất một lần (at-most-once): khôi phục không backfill bản ghi mà tiến trình trước không đầu tư được; triển khai cần yêu cầu backfill cần một outbox trì hoãn, không phải replay. Đây là một ngoại lệ có chủ đích và phạm vi rất hẹp đối với kỷ luật "đăng ký là effect": mục biến mất cùng session của nó, giá trị là mực nước đơn điệu, mất nó không bao giờ là lỗi.

## Projection phân đoạn cố định

Mỗi `(turn, step)` chỉ phát ra `assistant/chunk` đầu tiên; các phân đoạn còn lại bị bỏ khi bắt giữ, và không bao giờ tiến con trỏ. Chỉ một phân đoạn đó chính là tín hiệu "luồng đã bắt đầu": `step/start`, sự tồn tại của phân đoạn đầu tiên, sự tồn tại của `assistant/message`, cộng với lý do của `turn/end`, đủ để phân biệt "request chưa bao giờ bắt đầu" với "luồng chết yểu giữa chừng" mà không cần lưu lượng phân đoạn, và độ trễ token đầu tiên (time-to-first-token) vẫn tính được. Việc lược bỏ phân đoạn khiến khoảng trống `seq` trong luồng export trở thành bình thường: khoảng trống không bao giờ là tín hiệu mất mát. Mọi loại sự kiện còn lại đều được chuyển tiếp đầy đủ, kể cả loại sự kiện do plugin mà gói này chưa từng biết đến hợp nhất vào.

## Bản ghi logic

`SessionTelemetryRecord` gồm: `channel` (`ledger` | `ops`), `time` (mili giây epoch), `severity` (mức nghiêm trọng đã ánh xạ sẵn: `tool/result.isError`, lý do lỗi của `turn/end` và `agent-error` ánh xạ thành ERROR, bản ghi đã bắt khác ánh xạ thành INFO, còn chính sách `sessionTelemetry/record` có thể chỉ định WARN), `attributes` chỉ chứa thông tin danh tính (`session.id`, `event.type`, `event.seq`, thêm `session.cwd`/`session.parent_id`/`session.seed_length` khi có trong header), và `event.data` deep copy đầy đủ làm `body`, tuân theo nội dung đã che dấu. Bản ghi vận hành mang `sessionTelemetry.op` (`agent-error` | `shutdown`) và `session.id`, và cố tình không có `event.seq`/`event.type`: chúng là tín hiệu để cảnh báo, không phải mục để cộng dồn; `agent-error` chuẩn hóa mọi giá trị throw thành body bản ghi ổn định `{ name, message }`. Việc đầu tư sau khi bàn giao do SDK backend đảm nhiệm; trùng lặp vẫn có thể xảy ra (nhận nuôi lại không có con trỏ, SDK thử lại), do đó đầu nhận khử trùng lặp dựa trên `(session.id, event.seq)`.

## Trải nghiệm mô hình

Không có. Gói này chỉ quan sát luồng session, và bàn giao bản sao đã che dấu cho backend báo cáo; nó không bao giờ đóng góp bất kỳ nội dung nào vào request mô hình.

#### Ảnh hưởng KV Cache

Không có; gói này không cấu thành cũng không gửi request cho nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Đầu tư theo kiểu cố gắng hết sức (best-effort)**: con trỏ đánh dấu đã bàn giao chứ không phải đã đầu tư; session bị tháo dỡ trong cửa sổ nạp lại không thể nhận nuôi lại; nội dung còn nằm trong hàng đợi backend khi sự cố xảy ra sẽ mất. Outbox lâu bền (spool, con trỏ theo từng sink, at-least-once) hoãn lại đến khi có bên triển khai đưa ra yêu cầu tường minh về mất dữ liệu khi sự cố; xem [Agent Note hồi sinh](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md).
- **Không tích hợp sẵn quy tắc che dấu**: khi chưa gắn listener `sessionTelemetry/record`, bản ghi rời tiến trình đúng như lúc bắt được, kể cả credential nhúng trong nội dung tệp hoặc output lệnh; bên triển khai export ra collector dùng chung tự chịu trách nhiệm về bộ quy tắc của mình.
- **Che dấu theo yêu cầu dùng trạng thái hiện tại**: sự kiện chưa bắt giữ chỉ tồn tại trong log session có thẩm quyền. `captureSession()` sau đó sẽ dùng chính sách đang gắn tại thời điểm đó, deep copy và che dấu giá trị hiện tại của nó; không có snapshot telemetry tại thời điểm bắt giữ hay spool trước-bắt-giữ lâu bền.
