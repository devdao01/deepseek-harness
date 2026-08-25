# Agent Note: Job runtime chạy nền (`ctx.jobs`) và tool kiểm soát job dùng chung

Status: implemented

[English](2026-06-20-generic-long-running-tool-runtime.md) | 中文

## Vấn đề

bash chạy nền trước đây đảm nhận hai trách nhiệm cùng lúc: executor bash vừa chạy process, vừa quản lý job id, quyền sở hữu, đọc theo phần (incremental read), hủy, listener hoàn tất và tool điều khiển hướng tới model. Subagent chạy nền mới cần cùng một quy ước vòng đời và tương tác. Nếu mỗi capability chạy lâu tự triển khai quy ước này riêng, sẽ lặp lại logic cách ly, dọn dẹp, thông báo và hành vi prompt, còn khiến model phải học các giao thức thu thập và dừng khác nhau cho mỗi producer.

Job registry, tool điều khiển và thông báo hoàn tất cùng tạo thành một capability của harness. bash và subagent chỉ cung cấp các hook đặc thù cho việc thực thi, không sở hữu hành vi job tổng quát.

## Quyết định

Nhóm package `jobs/` sở hữu ngữ nghĩa job chạy nền:

- `@deepseek-ai/dsh-jobs` đăng ký công việc đang chạy dưới dạng `ctx.jobs`, và sở hữu job id, ủy quyền, snapshot, đọc, hủy, chờ, listener hoàn tất và dọn dẹp.
- `@deepseek-ai/dsh-tool-jobs` công khai `job_output`, `job_list` và `job_kill`, inject thông báo hoàn tất, và cung cấp hướng dẫn system prompt cho job chạy nền.

Tool chạy lâu là producer. `dsh-tool-bash` chuyển đổi (adapt) `ShellProcess` thành output theo phần và hủy process. `dsh-tool-subagent` chuyển đổi child run thành output cuối cùng và giải phóng child run. bash và subagent capability seam giữ độc lập, không phụ thuộc vào session hay job registry.

`JobRegistry` là Service Definition trong `@deepseek-ai/dsh-jobs`; Service Provider trong tiến trình là `LocalJobRegistry` trong `@deepseek-ai/dsh-jobs-local` (việc tách này được ghi trong [Agent Note quy ước job registry](2026-07-26-job-registry-seam.md)).

## Quy ước runtime

Kiểu literal xem [trang subsystem job](../../../../docs/subsystems/jobs.md). Producer gọi `ctx.jobs.start()`, truyền kind, label, `Agent` sở hữu tùy chọn, `outputLimitBytes` dương tùy chọn và một hàm `run()`. Runtime hoàn tất mọi công việc tiền kiểm có thể thất bại trước khi gọi `run()`, và chỉ gọi `run()` một lần. Sau khi `run()` trả về hook, quá trình đăng ký sẽ không thực hiện thêm bước nào có thể thất bại nữa mà commit trực tiếp; producer không thể khởi động công việc mà không có job id để thu thập.

Service Provider trong tiến trình còn sở hữu cơ chế giới hạn nhận (bounded admission), lý do được ghi trong [quyết định giới hạn tiếp nhận job chạy nền](../bug-fix/2026-08-11-bounded-background-job-admission.md). Cấu hình `maxConcurrentJobsPerOwner` của nó phải là số nguyên an toàn dương, mặc định là `10`; `start()` suy dẫn số lượng hoạt động cho từng đối tượng `Agent` chính xác từ bản ghi `running` và `stopping`, trong khi mọi job không có owner dùng chung một bucket cấp service. Việc từ chối do vượt dung lượng xảy ra trước `run()` và trước khi cấp id; job ở trạng thái stopping chỉ giải phóng chỗ khi producer settle (kết toán) `done`. Service Provider không xếp hàng hay chiếm quyền (preempt) job, cũng không giữ bản đếm thay đổi thứ hai.

`outputLimitBytes` là chính sách hiển thị do producer sở hữu, không phải buffer của registry. Registry kiểm tra hợp lệ giá trị này, và chiếu (project) nguyên trạng vào `JobSnapshot`; controller job tổng quát thêm metadata trạng thái hoặc thông báo của riêng nó, rồi mới áp dụng giới hạn này lên toàn bộ output hướng tới model. Khi bỏ qua giá trị này, hành vi controller hiện có được giữ nguyên, vì vậy runtime không áp đặt mặc định ngầm định lên các danh mục producer không liên quan.

Producer hướng tới model sẽ công khai id đã commit trong giá trị thành công chuẩn, thường là `{ kind: 'background', jobId }`; Native renderer vẫn có thể giữ cách diễn đạt dễ đọc cho con người. Lời gọi chạy nền bị hủy từ trước sẽ thất bại, thay vì trả về no-op, vì không tồn tại job nào có thể thực hiện lời hứa của handle đó. Một khi quá trình đăng ký đã phát hành id, việc hủy sẽ thuộc quyền sở hữu của controller riêng của job đó và job runtime; sau đó việc gọi hủy tool sản sinh không được phép chấm dứt job đã phát hành. `job_kill`, giải phóng tài nguyên của owner và tháo dỡ service đều yêu cầu hủy; thực thi ở foreground vẫn gắn với `exec.signal` của lời gọi.

Hook producer định nghĩa ba trách nhiệm:

- `cancel(reason?)` yêu cầu chấm dứt đồng bộ, có tính idempotent (bất biến khi lặp lại), và phải khiến `done` hoàn tất.
- `done` không bao giờ reject, và chỉ hoàn tất sau khi producer đã giải phóng tài nguyên job.
- `readOutput()` tùy chọn trả về phần output tiếp theo dạng tiêu thụ (consumptive). Bỏ qua hook này tức là tuyên bố đây là job có output cuối cùng, kết quả chấm dứt của nó đến từ `JobOutcome.output`.

Trạng thái gồm `running`, `stopping`, `completed`, `killed` và `failed`. Thông tin đặc thù của producer như mã thoát hoặc lý do dừng nằm trong `detail`, registry không diễn giải các thông tin này. Job kind tạo thành một string union có thể hợp nhất mở rộng; job id có brand và được sinh theo dạng `<kind>-N`, mỗi kind có bộ đếm riêng.

Runtime gắn một continuation cho `done`, ghi lại kết quả chấm dứt đầu tiên, khiến bên chờ hoàn tất việc chờ, và gọi lần lượt từng listener hoàn tất, đồng thời cách ly lỗi của mỗi listener. Việc settle ưu tiên kết quả đầu tiên đóng vai trò then chốt trong quá trình hủy tài nguyên: nếu `cancel` ném lỗi, runtime sẽ buộc đánh dấu bản ghi là failed và cảnh báo rằng công việc có thể còn sót lại, thay vì chờ mãi mãi một promise có thể không bao giờ hoàn tất. Kết quả producer sau đó không thể ghi đè chẩn đoán này, cũng không thể thông báo lặp lại. Nếu sau khi `cancel` trả về mà `done` cuối cùng không hoàn tất, việc hủy tài nguyên vẫn sẽ bị block, vì runtime không thể phân biệt tình huống này với việc dừng chậm nhưng hợp lệ.

Đăng ký job không phải là effect của tool fiber của producer. Do đó, reload plugin tool hay controller sẽ không chấm dứt công việc do agent (agent) và backend sở hữu. Khi service job tự giải phóng, nó sẽ hủy mọi job chưa chấm dứt và chờ producer tuân thủ quy ước.

## Ủy quyền và vòng đời owner

job id hiển thị toàn cục và có thể đoán được trong runtime, vì vậy registry ủy quyền cho mỗi lần truy cập. `get`, `read`, `wait` và `kill` nhận `Agent` gọi; `list` chỉ trả về job mà caller đó có thể thấy. Job có owner chỉ cho phép truy cập từ đúng session tương ứng. Job không có owner mở cho các caller không phải agent, và chấm dứt cùng với service job.

Snapshot lưu `SessionId` đã brand của owner để phục vụ ủy quyền, còn thao tác vòng đời giữ đúng instance `Agent` còn sống. Hai công dụng định danh này khác nhau: sự bằng nhau của session cấp quyền truy cập, còn identity đối tượng chính xác quyết định ai nhận dọn dẹp và thông báo hoàn tất. Việc tái sử dụng agent hoặc session id không thể chuyển hướng dọn dẹp hay thông báo của scope cũ sang instance thay thế.

Job đầu tiên của một owner sẽ gắn một effect bất đồng bộ vào `owner.ctx`. Khi scope của agent giải phóng, nó sẽ hủy mọi job chưa chấm dứt của owner đó, chờ bản ghi chấm dứt của chúng, và gỡ bỏ snapshot của chúng. Effect này có thể tồn tại qua nhiều lần reload producer, và gia nhập ranh giới dừng hẳn (quiescence) hiện có của agent. Job service giữ lại effect disposer, để khi service reload có thể tách callback khỏi scope của agent vẫn còn sống, sau khi tài nguyên toàn cục đã bị hủy.

Đối với producer tuân thủ quy ước, `AgentHandle.dispose()` chỉ hoàn tất sau khi công việc chạy nền thuộc về nó đã dừng. Công việc cần tồn tại lâu hơn agent phải được khởi động ở dạng không có owner; để tồn tại qua các lần khởi động lại runtime thì cần thiết kế job bền vững riêng.

## API service

`JobRegistry` cung cấp:

- `start(spec)`: đăng ký nguyên tử (atomic) qua tiền kiểm và giới hạn nhận của Service Provider.
- `get(id, caller?)` và `list(caller?)`: snapshot không tiêu thụ (non-consumptive).
- `read(id, caller?)`: đọc theo phần dạng tiêu thụ hoặc kết quả cuối cùng có tính idempotent.
- `kill(id, caller?, reason?)`: hủy.
- `wait(id, timeoutMs, caller?, signal?)`: chờ chấm dứt có giới hạn.
- `onJobDone(listener)`: quan sát trong phạm vi effect, với việc phân phối chính xác cho owner và cách ly listener.
- `attachController(name)`: cổng đảm bảo tính khả dụng của tool controller.

`wait` trả về snapshot chấm dứt khi job hoàn tất, trả về snapshot hiện tại khi hết thời gian chờ. Hủy một lần chờ chỉ hủy đúng lần chờ đó. Nếu việc settle đã giao thông báo chấm dứt cho bên chờ đó, snapshot chấm dứt vẫn được ưu tiên. Bên chờ tự hủy đăng ký đồng bộ khi bị hủy, vì vậy nếu việc settle xảy ra trong cùng tick, sẽ không có việc chặn thông báo hoàn tất thay cho một reader thực chất chưa nhận được gì.

Nếu producer khi tải lên không có bất kỳ job controller nào, caller vẫn có thể khởi động công việc mà không thể thu thập hay dừng lại. Vì vậy, `dsh-tool-jobs` gọi `attachController()` xuyên suốt vòng đời của nó; khi không có controller nào gắn vào, `start()` sẽ thất bại trước khi producer bắt đầu thực thi. Kiểm tra này xảy ra tại thời điểm khởi động chứ không phải tại thời điểm plugin tải, vì các plugin anh em có thể kích hoạt đồng thời. Controller tùy chỉnh không phải model có thể tự gắn vào, không cần registry biết tên tool.

## API điều khiển hướng tới model

`dsh-tool-jobs` đăng ký ba tool độc lập với kind, dùng UI card tổng quát:

- `job_output(job_id, wait?, timeout_ms?)` đọc output, và luôn thêm `[status: ...]`. Job dạng streaming chỉ trả về output kể từ lần đọc trước; job có output cuối cùng trả về kết quả sau khi settle. Trừ khi chỉ định `wait: true`, việc đọc sẽ không block; timeout chờ có mặc định do cấu hình plugin cung cấp và giới hạn trên. Timeout chờ sẽ báo cáo trạng thái vẫn đang chạy, không dừng job.
- `job_list()` trả về job mà caller có thể thấy theo dạng `<id> [<kind>] <status> — <label>`, không có job nào thì trả về `(no background jobs)`.
- `job_kill(job_id, reason?)` yêu cầu hủy ngay lập tức. Lý do đã ghi lại (tùy chọn) sẽ được chuyển tiếp cho producer. Job đã chấm dứt sẽ báo cáo trạng thái hiện có; nếu thao tác hủy của producer ném lỗi, lời gọi sẽ thất bại và job vẫn tiếp tục chạy.

Đọc dạng streaming dùng chung một con trỏ tiêu thụ (consumption cursor) trong phạm vi một job, vì model sở hữu được xem là reader dự kiến. UI hoặc nhiều reader độc lập cần API quan sát không tiêu thụ riêng; dùng chung con trỏ này sẽ khiến các reader tiêu thụ output của nhau.

System prompt yêu cầu model giữ lại job id, tiếp tục xử lý công việc độc lập trong khi công việc chạy nền vẫn đang chạy thay vì busy-poll hay khởi động lại cùng job nhiều lần, thu thập các job liên quan trước khi đưa ra câu trả lời cuối cùng, và chấm dứt công việc không còn quan trọng. Khi hoàn tất, hệ thống sẽ giao một tin nhắn đã ghi lại đến session của owner chính xác: owner đang bận sẽ đi qua đường inject, owner rảnh sẽ được đánh thức, chính sách giới hạn của việc này do [quyết định đánh thức owner rảnh](../feature/2026-08-11-background-job-completion-wakes-an-idle-owner.md) chịu trách nhiệm.

Khi việc đọc hoặc chờ giao job đã chấm dứt, bên chờ vẫn đang chờ nhận thông báo tại thời điểm settle, hoặc model chấm dứt job một cách tường minh, runtime sẽ đánh dấu job chấm dứt là `reported`. Job đã báo cáo sẽ không inject thông báo hoàn tất dư thừa. Lỗi listener được ghi lại độc lập, không chặn các listener tiếp theo, cũng không bị chờ bởi bên chờ hay quá trình hủy tài nguyên. Khi snapshot mang `outputLimitBytes`, `dsh-tool-jobs` sẽ giữ ranh giới UTF-8, và tái sử dụng dấu cắt bớt (truncation marker) sẵn có của producer, không thêm lặp lại. Việc đọc sẽ dành chỗ cho hậu tố trạng thái và giữ lại phần đuôi output; thông báo hoàn tất sẽ dành chỗ trước cho tiền tố ổn định `background job <id>` và chỉ dẫn `job_output`, rồi mới cắt bớt kind, label, status, detail có thể thay đổi, thậm chí cắt bớt cả chính dấu cắt bớt, để giới hạn nhỏ nhất của PTY vẫn có thể xác định được job cần thu thập. Job controller giải quyết giới hạn producer mà caller có thể thấy trong listener pre-execute chạy đầu tiên, trước khi policy có cơ hội từ chối hay short-circuit việc phân phối; sau đó áp dụng giới hạn này qua callback `finalizeContent` cuối cùng do định nghĩa job, khiến lỗi tool đã chuẩn hóa, lỗi pipeline ngoài và kết quả policy dạng văn bản đơn không thể vượt qua ranh giới này; kết quả policy đa khối được cấu trúc có chủ đích vẫn do policy sở hữu hình dạng và kích thước của nó.

## Producer bật tường minh

Mỗi producer tự quyết định thông qua cấu hình có giá trị mặc định, xem schema của nó có công khai `run_in_background` hay không. `dsh-tool-bash`, `dsh-tool-terminal` và mỗi instance `dsh-tool-subagent` đều dùng `enableRunInBackground`, mặc định là true. Instance bị vô hiệu hóa sẽ bỏ qua tham số này; vì bộ kiểm tra tham số tổng quát cho phép key chưa khai báo, nó còn từ chối tại thời điểm thực thi khi tham số chạy nền bị ép truyền vào. Bỏ qua schema tức là tuyên bố capability không khả dụng; kiểm tra thực thi chịu trách nhiệm thực thi ràng buộc này.

`ctx.jobs` không viết lại schema của producer. Bundle chỉ chuyển tiếp cấu hình của producer mà nó sở hữu. Nếu lời gọi chạy nền tới `start()` mà không có controller nào gắn vào, cổng phòng thủ của runtime sẽ khiến nó thất bại trước khi thực thi.

## Tích hợp producer

bash seam công khai `resolve`, `run` và `start`. `start(spec)` trả về một `ShellProcess`, cung cấp đọc theo phần, hủy, sự kiện thoát, và promise dừng hẳn không reject. Executor cục bộ chỉ giữ handle của process đang hoạt động để khi tự giải phóng có thể chấm dứt và chờ process. Lời gọi foreground tiếp tục dùng trực tiếp `resolve` và `run`.

Đối với bash chạy nền, `dsh-tool-bash` đăng ký agent gọi làm owner. Hook của nó ánh xạ `kill()` thành hủy, ánh xạ `done` thành `JobOutcome` completed hoặc killed, và ánh xạ `readOutput()` thành output theo phần có giới hạn của process, cùng với spill và thông báo sandbox. Tool job tổng quát sở hữu id, dòng trạng thái, danh sách, chờ và thông báo hoàn tất.

Đối với subagent chạy nền, `dsh-tool-subagent` tạo một `AbortController` do job sở hữu, và khởi động provider trong starter của job. Bất kể provider phát hành trước hay sau, việc hủy đều hủy cùng một signal. `done` chờ đồng thời kết quả child run và việc giải phóng child run, ánh xạ output đã hoàn tất thành kết quả cuối cùng, ánh xạ việc hủy thành `killed`, và ánh xạ các lý do dừng khác hoặc lỗi hạ tầng thành `failed`. Lịch sử child trung gian được giữ trong child session, không công khai qua `readOutput()`.

## Phương án thay thế

### Chia tool điều khiển theo từng capability

Cung cấp tool output/stop riêng cho bash và subagent sẽ lặp lại id, cách ly, dọn dẹp, thông báo và hướng dẫn, đồng thời tăng gánh nặng schema và giao thức lên model. Runtime thống nhất giữ lại hành vi đặc thù thực thi trong producer, mà không cần sao chép vòng đời job.

### Trừu tượng hóa ngay backend job runtime

Quy ước `JobStart.run()` hiện tại truyền callback trong tiến trình và đối tượng `Agent` chính xác. Backend bền vững sẽ thay đổi identity, khởi động lại, quyền sở hữu và ngữ nghĩa quan sát, vì vậy khi đưa vào registry giữ lại dạng một service cụ thể duy nhất, thay vì cố định sai ranh giới. [Agent Note quy ước job registry](2026-07-26-job-registry-seam.md) sau đó đã tách quy ước khỏi triển khai trong tiến trình mà không thay đổi các ngữ nghĩa trong tiến trình này.

### Để consumer chịu trách nhiệm event ủy quyền hoặc dọn dẹp

Để consumer chịu trách nhiệm kiểm tra sẽ khiến việc cách ly ở mỗi interface mới không nhất quán hoặc bị bỏ sót. Phát sóng event dọn dẹp sẽ buộc mỗi listener lọc mọi agent, và không cung cấp disposer đăng ký. Tập trung ủy quyền cộng với một effect trong phạm vi owner, cung cấp cùng một hàng rào bảo vệ cho mỗi consumer, cùng hook vòng đời có thể chờ, có thể gỡ bỏ.

### Chặn output hoặc tool chờ riêng biệt

Block mặc định sẽ khiến parent task bị tuần tự hóa trong khi công việc chạy nền đang chạy. Chỉ chờ mà không đọc sẽ tăng thêm một lời gọi model không trả về thông tin hữu ích cùng schema. `job_output(wait: true)` thể hiện tường minh việc block, và gộp nó với việc giao kết quả.

Chờ dùng nguyên thủy deadline dùng chung, không dùng chính sách timeout tool tổng quát. Timeout chờ là một quan sát thành công, sẽ trả về `[status: running]`; chính sách tổng quát sẽ thay nó bằng lỗi timeout. Sau khi job trả về job id, không có lời gọi tool nào bị timeout kiểm soát vòng đời job.

### Để runtime sở hữu đầu nhận output

Đầu nhận kiểu push có thể tập trung buffer, nhưng bash đã sở hữu buffer có giới hạn, cắt bớt và spill file phía sau executor seam. Định dạng pull sẽ giữ được quyền sở hữu này khi định dạng output theo phần. Backend bền vững sở hữu storage có thể đủ để xem lại interface producer.

### ID ngẫu nhiên, promote, hoặc event session vòng đời

Ủy quyền chứ không phải tính không thể đoán được mới là ranh giới truy cập, và id không dùng để suy dẫn đường dẫn filesystem; id có brand sinh theo thứ tự có thể giữ transcript (bản ghi văn bản) dễ đọc. Việc promote job foreground thành job chạy nền cần quy ước tương tác người dùng mà SDK chưa quy định. Khởi động, đọc và thông báo đã được ghi lại như event tool và context, vì vậy event session job chuyên dụng sẽ lặp lại các sự kiện hướng tới model.

## Kiểm thử

Test đơn vị cố định tính nguyên tử của tiền kiểm, id được cấp theo kind, giới hạn nhận theo bucket owner chính xác và không owner, chỗ giữ `stopping`, giải phóng trạng thái cuối, kiểm tra hợp lệ và chiếu giới hạn output, giới hạn byte UTF-8 của kết quả hoàn chỉnh, đọc dạng streaming và cuối cùng, timeout chờ và race điều kiện hủy, hủy, việc settle ưu tiên kết quả đầu tiên, cách ly listener, chặn thông báo, cách ly owner, instance owner đã cũ, dọn dẹp owner, hủy tài nguyên service và cổng phòng thủ không có controller. Test producer bao phủ ánh xạ process bash, hủy khởi động subagent, ánh xạ chấm dứt và giải phóng. Snapshot bao phủ schema tool điều khiển cố định, hướng dẫn prompt, và một đường ACP hoàn chỉnh có tổ hợp: giới hạn cấu hình từ chối job Bash chạy nền thật thứ hai, và cung cấp hành động khôi phục `job_kill`.

## Hệ quả

Lệnh bash và subagent dùng chung một bộ từ vựng id, danh sách, định dạng thông báo, thói quen prompt và tool điều khiển. Producer chạy lâu mới chỉ cần triển khai hook thực thi, không cần triển khai lại cả một họ registry và tool. [Sổ tay công cụ](../../../../docs/cookbook/adding-a-tool.md) hướng producer tới quy ước này.

Một owner chính xác duy nhất không thể tiếp tục tăng vô hạn công việc do Task nắm giữ trong tiến trình, owner khác cũng sẽ không tiêu tốn hạn mức của nó. Yêu cầu hủy sẽ tiếp tục chiếm dung lượng cho tới khi producer thực sự giải phóng tài nguyên, vì vậy thay công việc dừng chậm bằng công việc mới sẽ không vượt quá ngân sách tài nguyên thời gian thực đã cấu hình.

bash chạy nền có owner sẽ dừng cùng agent của nó, không còn tồn tại lâu hơn agent. Process chạy nền không có timeout executor; caller phải chấm dứt công việc không liên quan, hoặc dựa vào việc owner/service giải phóng. Đọc dạng streaming chỉ hỗ trợ một consumer; nếu `cancel` của producer trả về mà không khiến `done` hoàn tất, vẫn có thể block việc hủy tài nguyên. Job bền vững, con trỏ quan sát độc lập và việc promote foreground vẫn thuộc thiết kế riêng.
