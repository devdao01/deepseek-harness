# Agent Note: Lời nhắc bền vững, chỉ giới hạn trong Session

Status: implemented

[English](2026-08-05-durable-web-schedule.md) | Tiếng Việt

## Vấn đề

Lời nhắc được tạo trong hội thoại phải luôn thuộc về đúng Session đó và sống sót qua các lần khởi động lại tiến trình. Timer cục bộ trong tiến trình hay mục inbox không cung cấp được tính bền vững này, còn scheduler toàn cục hoặc cơ sở dữ liệu riêng lại mang vào hệ thống danh tính, lưu trữ và vòng đời thứ hai.

Agent bận rộn, thời gian chờ dài, thay đổi đồng hồ treo tường, Session ở trạng thái cold, fork, lỗi lưu trữ, đầu vào lịch tuyệt đối và việc giải phóng tài nguyên khiến một timeout đơn giản không đáp ứng được yêu cầu. Thiết kế phải phân biệt bản ghi bền vững với live wait có thể vứt bỏ, ngăn fork kế thừa các lời nhắc đang hoạt động của Session cha, và tránh để trạng thái trình bày hay múi giờ dành riêng cho Schedule lan sang các thành phần không liên quan.

## Quyết định

Overlay [`examples/web-schedule`](../../../../examples/web-schedule/README.md) nạp tường minh `@deepseek-ai/dsh-time-context` và `@deepseek-ai/dsh-schedule`; cây cấu hình Web mặc định giữ nguyên. Schedule chỉ quan sát Agent gốc được phát hành sau khi plugin nạp xong, rồi cài ba tool và một owner có thể vứt bỏ trong scope của Agent đó. Việc đọc cold history, các gốc đã phát hành, Agent con và các host khác đều không kích hoạt nó.

Ranh giới người dùng nhìn thấy là `session-local`: Session gốc chỉ chạy lời nhắc đúng giờ khi đang live, còn trong giai đoạn cold thì không gửi bất kỳ thông báo bên ngoài nào; lời nhắc quá hạn chỉ được xử lý sau khi Session đó live trở lại. Công việc đến hạn sẽ đợi Agent hoàn toàn idle, rồi đi vào hàng đợi lượt kế tiếp thông thường qua `followup()`; nó tuyệt đối không dẫn dắt lượt hiện tại giữa chừng, và cũng không có biên nhận Web riêng ([giao nhận theo lối hội thoại](../simplification/2026-08-09-conversational-schedule-delivery.md)).

| Tình huống | Sự kiện bền vững | Hành vi khi live | Kết quả người dùng thấy |
| --- | --- | --- | --- |
| Tạo và quản lý | `schedule/change` create／delete trong Session gốc | Tool ở scope Agent thực hiện checkpoint trước khi đọc và sau khi thay đổi | id ổn định, mục tiêu UTC, trạng thái và mô tả `session-local` |
| Đến hạn lúc đang bận | Bản ghi create đang hoạt động vẫn nằm trong fold | owner đợi idle maintenance, xếp một follow-up vào hàng đợi, rồi ghi thêm dispatch | Một lượt hội thoại thông thường sau đó |
| Nhiều bản ghi Every quá hạn | Mỗi bản ghi đang hoạt động giữ lại một mục tiêu sớm nhất chưa được chấp nhận và khớp neo | Một quyết định duy nhất chọn thời điểm phát sinh mới nhất cho từng bản ghi, rồi đẩy nó vượt qua thời điểm hiện tại | Một follow-up thông thường, trong đó mỗi bản ghi có một thời điểm phát sinh |
| Tiến trình dừng hoặc Session cold | Bản ghi create đang hoạt động vẫn nằm trong persistence | Không tồn tại timer hay quét nền nào; resume dựng lại owner | Mục tiêu tương lai tiếp tục chờ; mục tiêu quá hạn sẽ được thử |
| fork | event của cha nằm lại trong tiền tố kế thừa | fold của con bắt đầu từ `seedLength` | Công việc của cha không chuyển sang trạng thái hoạt động trong con |

### Quyền uy của Session log và các tool

Stream `schedule/change` phiên bản 1 là nguồn quyền uy bền vững duy nhất của Schedule. Bản ghi create sở hữu một id có brand không tái sử dụng trong Session, prompt đã trim, trường phân biệt quy tắc và mục tiêu UTC. delete và dispatch một lần là các chuyển đổi kết thúc. Every dispatch lưu id cùng thời điểm quyết định, giúp fold đẩy bản ghi đó vượt thẳng qua các thời điểm phát sinh đã bỏ lỡ. Decoder nghiêm ngặt và fold thuần sẽ từ chối phiên bản không xác định, trường thừa, id dùng lại, dispatch sai hình dạng, cũng như các chuyển đổi nhắm vào bản ghi không hoạt động. Session thông thường fold toàn bộ stream; fork chỉ fold các event từ vị trí `SessionHeader.seedLength` trở đi.

Union quy tắc hiện tại chấp nhận prompt khác rỗng và đúng một selector. `after_seconds` là delay số nguyên an toàn dương, bản ghi của nó là `{ id, kind: 'after', prompt, afterSeconds, scheduledAt }`. `at` có thể là giá trị tuân thủ nghiêm ngặt RFC 3339 kèm `Z` hoặc offset dạng số, hoặc là object có cấu trúc `{ date, time, time_zone }` với múi giờ tường minh; bản ghi của nó là `{ id, kind: 'at', prompt, scheduledAt }`. `every_seconds` là số nguyên an toàn không nhỏ hơn 300, và bản ghi `{ id, kind: 'every', prompt, everySeconds, scheduledAt }` của nó luôn khớp với dãy bắt đầu từ thời điểm tạo cộng thêm một khoảng. Dispatch một lần chỉ lưu id; Every dispatch lưu `id + acceptedAt`. Giá trị tool suy ra `scheduled` hoặc `overdue`, và bao gồm `deliveryMode: 'session-local'`.

Một FIFO ở scope Agent tuần tự hóa các giao dịch quản lý và giao dịch đến hạn của live owner trên toàn tuyến, từ preflight tới post-append barrier. Mỗi lần tool đọc đều đợi `ctx.sessions.flush(session)` trước. create sẽ cố gắng từ chối đầu vào sai hình dạng trước khi vào FIFO, sau đó thực hiện preflight, cấp id, ghi thêm bản ghi rồi checkpoint lần nữa. delete kiểm tra id trước khi vào FIFO, thực hiện preflight trước khi phán định bản ghi có đang hoạt động hay không, và chỉ checkpoint lại sau khi ghi thêm. list và delete không tìm thấy tuyệt đối không trả lời dựa trên một hậu tố live chưa được xác nhận. barrier thất bại sẽ trả về `persistence_uncertain`, thay vì đoán xem eager write đã commit hay chưa.

Mỗi lần preflight quản lý thành công cũng yêu cầu live owner tính toán lại. Nhờ đó, nếu một post-append trước đó bị từ chối, list về sau vẫn có thể xác nhận bản ghi create được giữ lại và arm nó, mà không cần timer thử lại persistence riêng.

### Ranh giới thời gian tuyệt đối tường minh

Việc diễn giải ngôn ngữ tự nhiên và việc phân tích của Schedule được tách bạch một cách có chủ ý ([đơn giản hóa múi giờ](../simplification/2026-08-09-explicit-schedule-time-zone.md)). Mỗi prompt từ trình duyệt chỉ mang theo múi giờ IANA đã được Host kiểm tra trên đúng user message bền vững tương ứng của nó. Time-context sẽ báo cho model rằng hãy diễn giải các ngày và giờ không nêu rõ múi giờ theo múi giờ đó. Schedule không import plugin đó, cũng không lưu múi giờ của Session: model phải chuyển kết quả diễn giải của mình thành giá trị RFC 3339 kèm offset, hoặc thành object cục bộ có `time_zone` tường minh.

Schedule kiểm tra chính xác hình dạng lịch, offset, tên múi giờ, cùng một thời điểm nằm nghiêm ngặt trong tương lai và có năm gồm bốn chữ số. Giờ địa phương rơi vào khoảng trống của giờ mùa hè (DST) sẽ bị từ chối; khi gặp khoảng chồng lấn thì chọn thời điểm sớm hơn ở lần xuất hiện đầu tiên. Sau khi tạo thành công, chỉ `scheduledAt` UTC đã chuẩn hóa được lưu, không lưu offset gốc, trường cục bộ hay múi giờ.

### Ngữ nghĩa tốc độ cố định có giới hạn

Every là khoảng thời gian có độ dài cố định, chứ không phải quy tắc lịch. Mục tiêu đầu tiên là thời điểm tạo cộng một khoảng. Khi ra quyết định đến hạn, phép chia nguyên sẽ chọn ra điểm mới nhất của dãy không muộn hơn đồng hồ treo tường đã lấy mẫu, cùng điểm đầu tiên của dãy sau đó. Thời điểm phát sinh được chọn chỉ trình bày một lần, và bản ghi được đẩy thẳng tới mục tiêu tương lai, nên Session cold tuyệt đối không tích lũy các tác vụ phát lại, và công việc của model bị trì hoãn cũng tuyệt đối không làm dãy đó trôi lệch.

Tất cả các bản ghi Every quá hạn khác nhau đều tham gia cùng một lô, mỗi bản ghi cung cấp một thời điểm phát sinh mới nhất và dùng chung một `acceptedAt`. Hệ thống không có cooldown, cổng chặn, hạn ngạch hay dấu thời gian lô được giữ lại xuyên bản ghi. Giới hạn tối thiểu 5 phút ràng buộc tần suất đánh thức và tần suất request tới model. Nếu điểm dãy kế tiếp vượt quá phạm vi lưu trữ năm bốn chữ số, dispatch sẽ kết thúc bản ghi đó.

Biểu thức lịch và biểu thức Cron bị loại trừ có chủ ý ([đơn giản hóa tính chu kỳ có giới hạn](../simplification/2026-08-09-bounded-fixed-rate-schedule.md)); hỗ trợ những biểu thức này đòi hỏi thêm ngôn ngữ lịch nhạy cảm với múi giờ, dependency bộ định trị, phạm vi kiểm tra và chính sách phát lại tzdata, tất cả đều không liên quan gì đến lời nhắc theo tốc độ cố định.

### Vòng đời giao nhận khi live

Owner ở scope Agent suy ra mục tiêu sớm nhất từ fold bền vững. Mục tiêu quá dài được chia đoạn bằng timer có giới hạn, và mỗi lần wake đều đọc lại đồng hồ treo tường, nên đồng hồ lùi lại sẽ không kích hoạt sớm, còn nhảy tới thì tạo thành overdue. Lời nhắc một lần đã đến hạn được ưu tiên, mỗi lần chỉ nạp vào một cái; ngược lại, tất cả bản ghi Every quá hạn sẽ vào cùng một lô theo thời gian mục tiêu và thứ tự tạo. Nếu Agent đang bị một lượt nào đó hoặc một maintenance task khác chiếm giữ, `runMaintenance()` sẽ từ chối lần nhận quyền này; các bản ghi vẫn giữ trạng thái hoạt động, và một lần chờ `whenIdle()` sẽ kích hoạt lần thử khác. preflight bị từ chối, hay lỗi framing／xếp hàng đã được cô lập, cũng khiến chúng giữ trạng thái hoạt động, nhưng không khởi động timer thử lại riêng.

Đường đi được nạp vào sẽ flush toàn bộ persistence đang chờ và nhận quyền một pha idle thực sự. Nó fold lại đúng hậu tố của Session, lấy mẫu decision clock, dựng framing lời nhắc cố định bằng các giá trị đã escape JSON, xếp đồng bộ một `followup()` vào hàng đợi, rồi ghi thêm dispatch trước khi nhả maintenance. Lời nhắc một lần sẽ ghi thêm một dispatch kết thúc chỉ chứa id. Lô tốc độ cố định sẽ ghi thêm một chuyển đổi `id + acceptedAt` cho mỗi bản ghi tham gia. Input gây ra lần đánh thức sẽ ở trạng thái parked cho đến khi maintenance nhả ra, nên trước khi dispatch vào được log thì message chưa bị nhận; sau đó owner sẽ thực hiện checkpoint cho dispatch.

dispatch ghi lại việc được nạp vào hàng đợi, chứ không phải việc model hoàn thành hay người dùng đã nhận được lời nhắc. Lỗi dựng framing hoặc lỗi xếp hàng đồng bộ sẽ không ghi thêm dispatch. Lỗi append khiến owner đó rơi vào trạng thái fault, vì message có thể đã vào hàng đợi rồi. Việc dispose Agent hoặc plugin sẽ hủy timer, dừng nhận việc mới, thu hồi đăng ký tool và đợi công việc đang chạy, đồng thời không xóa bản ghi bền vững. Nếu sập sau khi follow-up được nạp vào nhưng trước khi dispatch bền vững, lời nhắc có thể lặp lại sau khi khôi phục; thiết kế này không cam kết exactly-once.

## Các phương án đã cân nhắc

**Dùng `ctx.jobs`.** Task sở hữu công việc, kết quả và thông báo cục bộ trong tiến trình, chứ không phải trạng thái Session log và follow-up hội thoại.

**Lưu lời nhắc vào cơ sở dữ liệu riêng hoặc scheduler toàn cục.** Cách này chạy được cả với Session cold, nhưng cần thêm hệ thống ánh xạ danh tính thứ hai, quét lúc khởi động, ownership lease, giao thức xử lý sập và chính sách thông báo.

**Lưu bền vững múi giờ của Session rồi suy ra `at` cục bộ.** Cách này khiến một giá trị mặc định về diễn giải lan vào Session core, create／fork của Host, định dạng lưu trữ, client và các trường hợp khôi phục không khớp. Việc hướng dẫn model theo giờ địa phương của request cùng ranh giới tool tường minh đã loại bỏ ràng buộc này.

**Giữ lại biên nhận Web bền vững riêng.** dispatch là sự kiện hàng đợi nội bộ, chứ không phải lời nhắc của người dùng. Render một câu trả lời assistant thông thường vừa tránh được ngữ nghĩa giao nhận thứ hai, vừa gỡ được mã Schedule khỏi tầng Host và client.

**Thêm một engine quy tắc chu kỳ đa dụng.** Khoảng thời gian có độ dài cố định chỉ cần phép tính trên mốc neo. Trừu tượng chu kỳ dùng chung, cổng nạp toàn cục và bộ định trị lịch sẽ mở rộng phạm vi phát lại và trạng thái runtime, mà không phục vụ được hành vi sản phẩm đã giữ lại.

**Nhận quyền dispatch trước `followup()`, hoặc thêm fencing exactly-once.** claim-first sẽ âm thầm mất lời nhắc khi xếp hàng thất bại. exactly-once xuyên tiến trình đòi hỏi lease, outbox, acknowledgement và ranh giới idempotent phía dưới, vượt quá phạm vi Session-local này.

**Tiếp quản gốc sẵn có hoặc đăng ký tool toàn cục.** Tiếp quản muộn khiến thứ tự nạp plugin kích hoạt những timer không nhìn thấy được, và phơi tool ra ngoài các tổ hợp gốc được hỗ trợ.

## Kiểm chứng

Test của package cố định, với coverage 100% theo từng tệp, phần phát lại nghiêm ngặt, chuyển đổi trạng thái một lần và Every, phép tính neo lúc tạo, chỉ bắt kịp lần mới nhất, xử lý lô nhiều bản ghi, hậu tố fork, tái sử dụng id, profile offset và lịch cục bộ, kiểm tra IANA, khoảng trống và chồng lấn giờ mùa hè, ranh giới thời gian, chia đoạn timer, thay đổi đồng hồ treo tường, việc nạp vào khi overdue, framing cố định, lỗi xếp hàng và lỗi append, khôi phục barrier, rollback đăng ký và dispose dừng hẳn hoàn toàn. Property test so sánh phép tính Every với phần phát lại ở các khoảng và các quãng bỏ qua khác nhau. Test restart JSONL ở chế độ production chứng minh một lời nhắc overdue sẽ dispatch qua vòng đời Agent thật, và sau khi restart lần nữa thì không dispatch lặp lại. Test Host／client cố định việc lấy mẫu múi giờ trình duyệt và việc kiểm tra gắn với prompt. Kịch bản Web đã lắp ráp, không cần khóa, phủ trường hợp At theo giờ địa phương của trình duyệt, cùng lô Every hai bản ghi quá hạn được giao qua follow-up assistant thông thường, cả hai đều không có UI biên nhận.

## Hệ quả

- Trạng thái lời nhắc sống sót qua các lần khởi động lại nhờ persistence Session thông thường, không cần cơ sở dữ liệu mới hay service công khai.
- Session cold không làm việc và không gửi thông báo bên ngoài; sau khi mở lại có thể giao phần việc overdue.
- Không cần trạng thái múi giờ Session bền vững, cũng không cần dependency từ Schedule sang time-context, mà đầu vào thời gian tuyệt đối vẫn có tính tất định.
- Người dùng thấy đầu ra hội thoại thông thường; dispatch tuyệt đối không phóng đại thành công của model hay acknowledgement.
- Mỗi gốc live chỉ tăng thêm một timer suy ra từ fold, một lần chờ idle tùy chọn và một operation đang bay.
- Tính chu kỳ theo tốc độ cố định bị ràng buộc bởi tối thiểu 5 phút, chỉ bắt kịp lần mới nhất, và mỗi bản ghi quá hạn chỉ đóng góp một thời điểm phát sinh trong một lô; tính chu kỳ theo lịch vẫn nằm ngoài ranh giới sản phẩm này.
