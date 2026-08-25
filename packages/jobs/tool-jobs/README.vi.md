# @deepseek-ai/dsh-tool-jobs

[English](README.md) | 中文

Bộ điều khiển hướng tới mô hình cho `ctx.jobs`: ba công cụ độc lập với kind, thông báo hoàn tất và một phần prompt về công việc nền. Tải plugin này sẽ gắn controller mà `ctx.jobs.start()` yêu cầu.

## Công cụ

- `job_output(job_id, wait?, timeout_ms?)` mặc định đọc theo cách không chặn. Tác vụ dạng stream chỉ trả về phần tăng thêm kế tiếp; tác vụ đầu ra cuối cùng trả về kết quả sau khi kết thúc. Mỗi response đều kết thúc bằng `[status: ...]`. `wait: true` chờ tối đa đến giới hạn đã cấu hình, khi hết thời gian chờ tác vụ đang chạy vẫn giữ nguyên trạng thái sống.
- `job_list()` trả về các tác vụ mà bên gọi có thể thấy theo dạng `<id> [<kind>] <status> — <label>`.
- `job_kill(job_id, reason?)` ngay lập tức yêu cầu hủy và chuyển tiếp lý do đã ghi. Tác vụ đã kết thúc sẽ trả về snapshot không tiêu thụ.

Cả ba công cụ đều dùng thẻ UI chung: output và list dùng `read`, kill dùng `execute`.

Giá trị chuẩn của chúng lần lượt là `{ text, job }`, `PublicJobSnapshot[]` và `{ outcome: 'cancellation-requested' | 'already-finished', job }`. Snapshot công khai mang id, kind, label, status/detail cùng thời gian bắt đầu/kết thúc; nó cố ý bỏ qua `ownerSession` và bit thông báo `reported` nội bộ. Renderer nguyên bản giữ nguyên trạng thái và văn bản xác nhận nêu trên.

Khi bên sinh cung cấp `outputLimitBytes`, `job_output`, `job_kill` với tác vụ đã kết thúc, và thông báo hoàn tất sẽ áp giới hạn trên toàn bộ kết quả UTF-8 nguyên bản sau khi thêm trạng thái hoặc văn bản thông báo. Chỉ cần còn chỗ, việc đọc sẽ giữ lại phần đuôi của đầu ra cùng hậu tố điều khiển; thông báo hoàn tất có giới hạn thì trước tiên dành chỗ cho `background job <id>` và hướng dẫn thu thập `job_output`, sau đó dùng byte còn lại cho các trường khả biến kind, label, status, detail và dấu cắt ngắn. Một listener tiền-thực-thi sẽ nắm bắt các tác vụ mà bên gọi có thể thấy trước khi chính sách chạy; callback nội dung-cuối (final-content) do mỗi định nghĩa điều khiển tác vụ định nghĩa sẽ áp giới hạn của bên sinh lên các trường hợp từ chối văn bản đơn, đường tắt, chuẩn hóa công cụ hoặc thất bại pipeline, thay thế và chặn; kết quả chính sách nhiều khối có cấu trúc vẫn giữ nguyên hình thái. Dấu cắt ngắn hiện có của bên sinh sẽ được tái sử dụng, không thêm lặp lại. Bên sinh bỏ qua trường này giữ hành vi controller không giới hạn hiện có.

## Thông báo hoàn tất

Một lần hoàn tất chưa được báo cáo sẽ gửi `background job <id> (<kind>: <label>) finished [status: ...]. Read its output with job_output.` tới đúng chủ sở hữu. Khi áp giới hạn, ngay cả với ngưỡng sàn 64 byte hỗ trợ bởi PTY, tiền tố id ổn định và lệnh thu thập vẫn được ưu tiên hơn label/detail khả biến, do đó thông báo vẫn có thể hành động được. Việc kill hoặc read/wait đối với tác vụ đã kết thúc sẽ đánh dấu việc giao là đã báo cáo và ngăn thông báo lặp lại; teardown khi xả owner hay service cũng vậy.

Kênh nào mang thông báo phụ thuộc vào việc chủ sở hữu đang làm gì lúc đó. Chủ sở hữu bận sẽ đi qua kênh injection: thông báo vào inbox bước tiếp theo, và khi inbox đó còn nội dung, lượt (turn) không thể kết thúc, do đó nhiều tác vụ kết thúc đồng thời chỉ tốn một bước, chứ không chiếm mỗi tác vụ một lượt riêng. Chủ sở hữu rảnh thì được đánh thức bằng follow-up, vì thông báo đang chờ mà không ai nhận đồng nghĩa với việc mô hình sẽ không bao giờ biết đến việc hoàn tất. `completionDelivery: quiet` giữ cho chủ sở hữu rảnh cũng ở lại kênh injection, đúng thứ mà transcript xác định cần đến.

Việc đánh thức có giới hạn. Mỗi chủ sở hữu tối đa có thể mở `maxConsecutiveWakes` lượt qua đánh thức, sau đó thông báo hạ cấp thành injection; việc nhận bất kỳ tin nhắn nào do người dùng soạn sẽ khôi phục ngân sách đó. Đặt giới hạn vì chuỗi này có thể tự kích hoạt: một lượt được đánh thức có thể khởi động một tác vụ nền khác, mà việc hoàn tất của nó lại đánh thức cùng chủ sở hữu đó. Thông báo do plugin này tự xếp hàng sẽ không bao giờ bổ sung lại ngân sách vừa dùng.

Một registry host có thể mang nhiều lần gắn của plugin này — mỗi agent preset một lần. Registry sẽ định tuyến mỗi lần kết thúc tới các listener mà chuỗi scope của owner có thể tới, do đó một lần gắn dưới một preset sẽ không bao giờ thấy agent của preset khác, bất kể có bao nhiêu preset được gắn, mỗi agent mỗi lần hoàn tất chỉ đọc được một thông báo. Cùng cơ chế định tuyến này cũng quyết định controller của lần gắn này phục vụ agent nào: agent trong tổ hợp không tải `tool-jobs` hoàn toàn không thể khởi động công việc nền.

## Cấu hình

| key | mặc định | ý nghĩa |
|---|---|---|
| `waitTimeoutMs` | `30000` | thời gian chờ dùng khi `wait: true` bỏ qua `timeout_ms` |
| `maxWaitTimeoutMs` | `600000` | giới hạn trên của thời gian chờ mà mô hình có thể cho |
| `completionDelivery` | `wakeup` | `wakeup` mở một lượt cho chủ sở hữu rảnh; `quiet` giữ thông báo tiếp tục chờ nhận |
| `maxConsecutiveWakes` | `3` | số lượt mà một chủ sở hữu có thể mở qua đánh thức, vượt quá thì thông báo hạ cấp thành injection |

Khi giá trị mặc định cao hơn giới hạn trên, plugin sẽ thất bại lúc tải.

## Trải nghiệm mô hình

### Prompt hệ thống

#### Những gì mô hình thấy

Mỗi request trong scope đăng ký của plugin này đều chứa hướng dẫn sau đây. Khi lọc công cụ theo scope agent (tác tử), công cụ có thể bị ẩn, nhưng phần prompt đăng ký độc lập sẽ không bị gỡ bỏ.

##### Hướng dẫn về tác vụ nền

```markdown
Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.
```

#### Ảnh hưởng Token

Trong lúc kích hoạt, mỗi request sẽ phát sinh một khoản chi phí token đầu vào nhỏ và cố định.

#### Ảnh hưởng KV Cache

Chỉ cần scope plugin và văn bản hướng dẫn không đổi, tiền tố sẽ giữ ổn định. Kích hoạt hoặc giải phóng có thể làm mất hiệu lực tái sử dụng kể từ phần prompt này.

### Schema công cụ

#### Những gì mô hình thấy

Khi bộ công cụ này hiển thị, sẽ thấy các schema [`job_output`, `job_list` và `job_kill`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-jobs) đã sinh.

#### Ảnh hưởng Token

Khi công cụ hiển thị, mỗi request sẽ phát sinh chi phí token schema cố định.

#### Ảnh hưởng KV Cache

Chỉ cần định nghĩa công cụ và khả năng hiển thị không đổi, tiền tố sẽ giữ ổn định. Vòng đời đăng ký hoặc giới hạn scope có thể làm mất hiệu lực tái sử dụng kể từ token schema đầu tiên thay đổi.

### Kết quả và thông báo

#### Những gì mô hình thấy

Đọc sẽ trả về đầu ra hoặc `(no new output)`, tiếp theo là `[status: <status>]` và detail tùy chọn. Danh sách rỗng trả về `(no background jobs)`. Kill trả về `requested cancellation of job <id>` hoặc trạng thái kết thúc hiện có. Tác vụ có owner chưa báo cáo khi hoàn tất sẽ dùng thông báo nêu trên.

#### Ảnh hưởng Token

Kết quả và thông báo được giữ lại trong lịch sử cha trước khi compaction (nén). Đọc dạng stream không lặp lại đầu ra đã tiêu thụ; `outputLimitBytes` do bên sinh cung cấp sẽ giới hạn mỗi lần đọc đầy đủ hoặc thông báo. Dưới `wakeup`, thông báo đến chủ sở hữu rảnh còn mua thêm một lần request mô hình mà người dùng không yêu cầu, số lượng được giới hạn theo từng chủ sở hữu bởi `maxConsecutiveWakes`; thông báo đến chủ sở hữu bận thì chỉ thêm một bước vào lượt mà nó đã trả tiền.

#### Ảnh hưởng KV Cache

Chỉ thêm vào cuối; nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV-cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Kết thúc rơi vào cửa sổ nghỉ hưu của driver vẫn khiến thông báo mắc kẹt**: giữa lần kiểm tra inbox cuối cùng của vòng lặp lượt và lúc driver commit pha idle, chủ sở hữu đọc vẫn là bận, do đó thông báo đi theo injection mà không ai đánh thức. steer cũng có cùng lỗ hổng này; việc bịt nó thuộc về `agent-loop`.
- **Ngân sách đánh thức đã dùng không tự phục hồi theo thời gian**: chỉ có đầu vào do người dùng soạn mới có thể bổ sung, do đó một agent không người trông chừng đã cạn ngân sách sẽ phải chờ đến khi có lý do khác mở lượt tiếp theo mới nhận được các thông báo còn lại.
- **Thông báo đang chờ nhận ở chủ sở hữu rảnh không thể tồn tại sau khi chủ sở hữu đó bị giải phóng**: việc hủy khi giải phóng sẽ xóa sạch inbox chưa nhận, log giữ lại cặp chèn/hủy này như một bản ghi.
- **Đọc dạng stream chỉ có một bên tiêu thụ duy nhất**: các observer độc lập cần một bộ API runtime khác.
- **Tác vụ không owner không có cách ly session**: bên gọi bên ngoài phải tự cung cấp chính sách hoặc tránh dùng các tác vụ này.
