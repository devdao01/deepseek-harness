# Agent Note: Session PTY bền vững

Status: implemented

[English](2026-07-16-persistent-pty-sessions.md) | 中文

## Vấn đề

Harness có thể chạy lệnh ở tiền cảnh lẫn nền, chỉnh sửa file và ủy thác công việc, nhưng không thể kéo dài một phiên hội thoại terminal tương tác xuyên các lần gọi tool. Mỗi lần chạy `bash` ở tiền cảnh đều khởi động một shell mới, nên cwd bên trong shell, biến export, trạng thái kích hoạt virtualenv, hàm, trạng thái job control và các tiến trình con tương tác đều kết thúc cùng lần gọi đó.

Khoảng trống này loại trừ những workflow mà trạng thái nằm trong terminal chứ không nằm trong file, ví dụ debug từng bước bằng `gdb`, khám phá trong REPL của Python hoặc Node, điều khiển các trình soạn theo dòng như `ed`, hoặc ngắt một lệnh tiền cảnh rồi quay lại shell ban đầu. Runtime [`ctx.jobs`](../../../../packages/jobs/README.md) dùng chung có thể giữ handle và output của thao tác nền, nhưng không cung cấp stdin tương tác hay ngữ nghĩa terminal.

Các tool `bash`, `read`, `write` và `edit` hiện có vẫn là lựa chọn mặc định đáng tin cậy cho những thao tác có biên, kiểm toán được. PTY là năng lực bổ sung cho những công việc thật sự cần trạng thái terminal, không hàm ý các tool đó có khiếm khuyết, càng không hàm ý phải gỡ bỏ chúng.

## Quyết định

Họ năng lực tùy chọn `packages/terminal/` cung cấp các session PTY bền vững, do agent (tác tử) sở hữu, hướng tới tương tác theo dòng. Nó tuân theo [mẫu năng lực](../../implemented/architecture/2026-06-13-capability-seams.md) của repo, cùng tồn tại với các tool lệnh và filesystem sẵn có, và không sửa đổi `agent-loop`.

Bản hiện thực hiện tại hỗ trợ shell tương tác và REPL theo dòng trên Linux và macOS. Ứng dụng terminal toàn màn hình, chuỗi phím, luồng điều khiển kích hoạt bởi BEL, khôi phục session sau khi mất tiến trình và chia sẻ session xuyên agent đều được hoãn lại rõ ràng.

### Cấu trúc package

| Package | Vai trò | ctx key |
|---|---|---|
| `dsh-terminal` | `TerminalSessionService`, `TerminalSessionId` được branded, registry backend, quy ước session cách ly theo owner và các kiểu kết quả | `ctx.terminals` |
| `dsh-terminal-bash` | Backend shell bền vững dựa trên `ctx.subprocess.spawnTerminal()`: trạng thái sẵn sàng, buffer terminal có biên, phân giải sandbox và vòng đời session nhận biết owner | Đăng ký backend trên `ctx.terminals` |
| `dsh-tool-terminal` | 6 tool hướng tới model, tích hợp runtime task cho việc gửi ở nền, chỉ dẫn sử dụng và ý đồ render UI | Đăng ký vào `ctx.tools` |

Việc phán định sẵn sàng vẫn thuộc hành vi của backend PTY, không phải một quy ước công khai thứ hai. Provider tiến trình terminal chỉ cung cấp các sự kiện nền tảng, ví dụ nhóm tiến trình tiền cảnh, và liệu có chứng minh được nhóm đó đang chờ input hay không; `dsh-terminal-bash` kết hợp những sự kiện đó với bằng chứng prompt và im lặng thành một kết quả gửi thống nhất.

### Quyền sở hữu và danh tính agent

`TerminalSessionService` lưu các session sống trong tiến trình, nhưng mỗi session đều do đúng `Agent` được truyền vào từ ngữ cảnh thực thi tool sở hữu. Dịch vụ đúc ra `TerminalSessionId` không trong suốt; `name` tùy chọn do model điền chỉ là metadata hiển thị, và chỉ duy nhất trong phạm vi owner đó. Mọi thao tác đều nhắm tới `sessionId`, còn `list`/`read`/`signal`/`kill` sẽ từ chối các bên gọi nằm ngoài owner.

Bản hiện thực không cung cấp session auto-start ở thời điểm nạp plugin. `terminal_open` chỉ tạo session trong lúc agent gọi tool, khi quyền sở hữu và session event-sourced tương ứng đã được xác định. Tính năng khởi động khai báo trong tương lai phải được kết hợp qua agent setup chưa phát hành, chứ không được tạo terminal chia sẻ toàn cục.

Khi agent scope dispose (giải phóng tài nguyên), trước tiên hủy đăng ký, rồi chờ toàn bộ PTY thuộc sở hữu dừng hẳn hoàn toàn. Backend setup chưa phát hành cũng là một thao tác vòng đời được theo dõi: owner hoặc dịch vụ dispose sẽ hủy bỏ signal do dịch vụ tự sở hữu, chờ backend kết toán và rollback hoàn tất rồi mới trả về. Ngay cả khi backend reject, hoặc session được trả về thất bại khi rollback close, việc bên gọi hủy vẫn giữ nguyên `AbortSignal.reason` của nó; thất bại dọn dẹp đó không thay thế lý do của bên gọi, mà tiếp tục được theo dõi, chờ owner hoặc dịch vụ dispose lần sau xử lý. Thất bại rollback close do lifecycle dispose kích hoạt sẽ khiến cả spawn lẫn lifecycle dispose đó cùng reject, còn `TerminalBackendCleanupError` cho phép backend giữ lại thất bại dọn dẹp lúc khởi động của chính nó cho lifecycle dispose đó, mà không thay thế việc hủy của bên gọi. Nếu việc bên gọi hủy đã kết toán trước khi dispose bắt đầu, thất bại dọn dẹp đó tiếp tục được giữ lại như một owner activity được theo dõi, cho tới khi owner hoặc dịch vụ dispose lần sau tiêu thụ và báo cáo nó, nhờ vậy chính sách chế độ sandbox không nhầm thất bại dọn dẹp thành đã dừng hẳn hoàn toàn. Việc reload plugin backend hay tool sẽ không để sót session: quyền sở hữu tiếp tục nằm trong `TerminalSessionService` cho tới khi agent kết thúc, nhất quán với mẫu bản ghi do dịch vụ nắm giữ của [`ctx.jobs`](../../../../packages/jobs/jobs/README.md). Dịch vụ sẽ đồng bộ đặt chỗ trước session cho một lần gửi đang hoạt động, rồi mới trả về thao tác đó; việc gửi ở nền cũng hoàn tất đặt chỗ trước khi job id lộ ra bên ngoài. Lần gửi thứ hai sẽ thất bại với `SEND_ACTIVE`, nên output và việc hủy không thể vượt qua ranh giới sở hữu thao tác.

### Ranh giới bảo mật và tiến trình

Backend `shell` đã đăng ký chỉ ràng buộc cách terminal được khởi động, chứ không ràng buộc các lệnh được nhập vào sau đó. Vì vậy `dsh-terminal-bash` áp dụng hai lớp bảo vệ trước khi spawn:

- Nó chỉ cung cấp các giá trị ghi đè môi trường dành riêng cho terminal; provider tiến trình con được mount sẽ xóa các biến môi trường có tên trông giống credential trước, rồi mới hợp nhất các giá trị ghi đè đó.
- Nó yêu cầu `ctx.sandboxPolicy` dùng chung. Khi spawn, backend gấp chế độ session hiệu lực của owner trên nền giá trị mặc định của bên triển khai; `danger-full-access` sẽ khởi động shell trực tiếp, còn các chế độ hạn chế thì yêu cầu trong cùng thế giới thực thi phải có provider `ctx.sandbox`, và chỉ bọc argv của shell đúng một lần. Chế độ đó cùng workspace root đóng vai trò ranh giới tiến trình trong suốt vòng đời của PTY. Chỉ cần owner còn bất kỳ PTY nào đang mở hoặc còn spawn chưa phát hành, mọi thao tác ghi làm thay đổi `sandbox/mode` hiệu lực đều bị từ chối trước khi commit, kèm gợi ý hãy chờ thao tác tạo kết toán rồi đóng các session đó; các thao tác ghi không làm thay đổi chế độ hiệu lực vẫn hợp lệ. Việc đặt chỗ đang diễn ra này kéo dài từ backend setup cho tới khi phát hành xong, nên không tồn tại tình trạng tranh chấp kiểu hạ cấp rồi lại xuất hiện terminal có quyền rộng hơn. `danger-full-access` là lựa chọn không ràng buộc tường minh đã có sẵn, và không lập thêm bypass riêng cho PTY.

Sandbox giới hạn tác dụng phụ của tiến trình cục bộ, nhưng không khiến input shell tùy ý tự động an toàn: lời gọi mạng và các tác dụng phụ bên ngoài khác vẫn do chính sách triển khai quản trị. Mô tả tool sẽ nêu rõ rằng session PTY khó kiểm toán hơn tool dùng một lần, và chỉ nên dùng khi thật sự cần trạng thái bền vững hoặc stdin tương tác.

Nguyên thủy terminal tiến trình con cục bộ chỉ dùng các năng lực công khai của `node-pty`: PID tiến trình con, thông báo `data` và `exit`, `write` và `kill`. Nó không giả định truy cập được master fd gốc, cũng không gọi `waitpid` từ TypeScript. Bộ kiểm tra tiến trình theo nền tảng nằm dưới nguyên thủy này suy ra nhóm tiến trình tiền cảnh và danh tính cha-con qua `/proc` trên Linux và qua `ps` trên macOS. [Quyết định về môi trường thực thi khả chuyển](../architecture/2026-07-28-portable-execution-world-consumers.md) chịu trách nhiệm định nghĩa cách tách tiến trình／bên tiêu thụ này.

### 6 tool hướng tới model

| Tool | Công dụng | Kết quả |
|---|---|---|
| `terminal_open` | Tạo session cách ly theo owner từ kiểu backend đã đăng ký | `{ sessionId, name, type, motd }` |
| `terminal_send` | Gửi văn bản, tùy chọn commit bằng Enter, rồi chờ sẵn sàng hoặc đăng ký một tác vụ nền | Viewport có biên, trạng thái chờ và trạng thái session; chế độ nền còn trả về `jobId` |
| `terminal_read` | Đọc một trang có biên từ scrollback được giữ lại | `{ text, totalLines, lineBegin, lineEnd, truncated }` |
| `terminal_signal` | Gửi một signal được phép tới nhóm tiến trình tiền cảnh hiện tại | `{ delivered, targetPgid }` |
| `terminal_close` | Đóng một session và chờ cây tiến trình dừng hẳn hoàn toàn | `{ killed }` |
| `terminal_list` | Liệt kê các session sống của bên gọi | Tóm tắt session cách ly theo owner |

Quy ước render UI chính xác và không mang thông tin vị trí. `terminal_send` chỉ dùng thẻ gọi và thẻ kết quả kiểu terminal cho việc gửi ở tiền cảnh; dạng nền dùng thẻ `execute` dùng chung. `terminal_open`, `terminal_read`, `terminal_signal`, `terminal_close` và `terminal_list` lần lượt dùng các thẻ dùng chung `execute`, `read`, `execute`, `delete` và `read`. Không tool PTY nào phát ra `locations`.

`terminal_send({ sessionId, text, submit?, run_in_background? })` coi `text` là byte UTF-8, và phần hiện thực tool sẽ đặt mặc định `submit` thành `true` ở giai đoạn phân giải. Khi `submit` là true, nó ghi văn bản trước rồi ghi chuỗi Enter của nền tảng; khi là false thì chỉ ghi văn bản, giúp ký tự điều khiển và mảnh REPL gửi được mà không cần heuristic nội dung ngầm. Việc hủy sẽ đánh dấu input đang xếp hàng là đã hủy trước khi gửi signal tới nhóm tiến trình tiền cảnh thật, nên ngay cả khi bước kiểm tra bất đồng bộ trước khi ghi kết toán sau đó, input ấy vẫn không thể chạy. Lần gửi bị hủy sẽ giữ lại đặt chỗ của nó cho tới khi việc gửi signal tiền cảnh bất đồng bộ kết toán, nhờ đó lần gửi kế tiếp không trở thành đích của signal ấy. `enableRunInBackground` mặc định là true; khi đặt thành false, `run_in_background` bị gỡ khỏi schema, và bên gọi dù cố nhồi tham số chưa khai báo này vào luồng thực thi cũng sẽ bị từ chối.

Việc gửi ở tiền cảnh trả về phần render tăng thêm có biên và hai sự kiện độc lập: `waitReason` (`stdin_read | inferred_idle | timeout | session_exit`) và `sessionStatus` (`running`, hoặc `exited` kèm mã thoát hay signal). `session_exit` chỉ việc tiến trình shell cấp cao nhất của PTY thoát ra, chứ không chỉ một lệnh tiền cảnh tùy ý mà shell tiêu thụ trạng thái. `dsh-tool-terminal.maxResultBytes` mặc định là 262144; giá trị nhỏ hơn 64 sẽ bị từ chối, để đảm bảo xác nhận tạo giữ được id do registry cấp; mỗi kết quả UTF-8 văn bản đơn vẫn chịu giới hạn này sau khi đã cộng thêm lỗi tool hoặc pipeline đã chuẩn hóa, phần chờ, session, phân trang, cắt bớt, lớp bọc trạng thái task dùng chung, chính sách từ chối hoặc đoản mạch, cùng phần thay thế hay chặn ở post-execute; callback `finalizeContent` ở cuối chuỗi mà terminal tự định nghĩa sẽ giữ nguyên nội dung nhiều khối có cấu trúc mà chính sách chủ ý trả về. Bộ render sẽ chừa chỗ cho phần hậu tố và giữ ranh giới code point, chứ không coi giới hạn payload của backend là giới hạn cuối cùng cho kết quả hướng tới model.

Khi `run_in_background: true`, `dsh-tool-terminal` đăng ký lần gửi đang diễn ra trên `ctx.jobs`, và trả về `jobId` ngay lập tức. Bên sản xuất ghi `maxResultBytes` vào snapshot của task, giúp `job_output`, trạng thái cuối do kill trả về và thông báo hoàn tất vẫn áp cùng giới hạn đó lên kết quả đầy đủ sau khi cộng thêm metadata dùng chung. `job_output(wait: true)` chịu trách nhiệm chờ, đọc output tăng thêm và ghi lại kết quả cuối cùng; `job_kill` sẽ phân giải PGID tiền cảnh hiện tại và gửi `SIGINT` thật, kể cả khi ứng dụng đã tắt `ISIG` của terminal, và các bước leo thang tiếp theo vẫn chỉ đi qua đường teardown do backend PTY sở hữu. Nếu giao diện task đối ngoại không tồn tại, chế độ nền phải thất bại trước khi ghi input. Thiết kế không thêm tool `sleep` riêng cho PTY hay API đánh thức dùng chung.

`terminal_read` phân trang lùi từ dòng được giữ lại mới nhất. Backend áp giới hạn số dòng và byte UTF-8 lên cả scrollback được giữ lại lẫn payload trang trả về, nên một dòng cực dài đơn lẻ không thể lách giới hạn của backend; sau đó tool lại giới hạn toàn bộ trang đã render, bao gồm cả metadata phân trang và cắt bớt. `truncated` dùng để phân biệt mất dữ liệu được giữ lại với phần viewport tăng thêm thông thường.

`terminal_signal` nhận tập đóng `SIGINT | SIGTERM | SIGKILL | SIGTSTP | SIGHUP`. Backend phân giải nhóm tiến trình tiền cảnh của terminal khi thực thi. Khi nhóm đích là shell cấp cao nhất, nó từ chối `SIGKILL` và hướng dẫn bên gọi dùng `terminal_close`; khi phân giải nhóm tiến trình thất bại thì thao tác thất bại luôn, thay vì gửi signal tới một PID phỏng đoán.

### Phát hiện sẵn sàng cục bộ

Backend cục bộ trước tiên nhận diện OSC prompt marker riêng do bash được điều khiển phát ra khi khởi động, và chỉ tuyên bố prompt đã sẵn sàng khi phần đuôi in được sau marker gần nhất bằng đúng `PS1` được điều khiển; ngoài ra, nó còn chạy 3 tầng fallback có biên. Việc giữ lại phần đuôi đó giữa các data callback cho phép thích ứng với trường hợp marker và prompt được giao riêng rẽ; nếu input hoặc output được echo lại nằm sau một prompt trước đó đến muộn, yêu cầu đuôi bằng đúng sẽ từ chối prompt ấy, khiến nó không thể hoàn tất lần send hiện tại. Marker được gỡ bỏ trước khi output đến model, giúp các lệnh shell thông thường trên cả hai nền tảng đều không cần chờ ngưỡng im lặng cố định. Startup chưa phát hành sẽ không coi im lặng không output là sẵn sàng; timeout sẽ từ chối spawn. Nếu việc bên gọi hủy thắng trong lúc startup, backend sẽ đóng session riêng và ném nguyên `AbortSignal.reason`; PGID tiền cảnh chưa quan sát được sẽ không còn ghi đè lý do hủy bằng lỗi tra cứu. Mọi tham số thời gian đều là trường cấu hình đã được kiểm định: `pollIntervalMs`, `exactProbeAfterMs`, `idleSilenceMs`, `handoffGraceMs` và `timeoutMs`.

Trên Linux, bộ kiểm tra đọc PGID tiền cảnh của terminal thuộc shell từ `/proc/<shellPid>/stat`, liệt kê mọi tiến trình và luồng trong nhóm tiến trình đó, rồi kiểm tra syscall hiện tại của chúng. Tier 1 chỉ trả kết quả dương khi quan sát được việc chờ stdin: `read(0)` trực tiếp, tham số `select`/`pselect6` hoặc `poll`/`ppoll` được phép đọc và có chứa fd 0, hoặc epoll interest list có chứa fd 0. Việc chờ đã tồn tại từ trước khi terminal có input không đại diện cho trạng thái sẵn sàng sau khi ghi: phải quan sát được cùng PGID đó thoát khỏi trạng thái chờ ấy trước, rồi lại vào trạng thái chờ lần nữa thì lần send này mới hoàn tất; PGID tiền cảnh thay đổi thì tạo thành bằng chứng mới. Bộ nhớ tiến trình không đọc được và syscall không nhận diện được đều là miss, và không bao giờ được dùng làm phỏng đoán dương. Bảng kiến trúc chỉ chứa các syscall number tương ứng với định nghĩa Linux UAPI; kiến trúc không được hỗ trợ sẽ bỏ qua Tier 1.

macOS không có tầng syscall chính xác. Bất kỳ khoảng im lặng output nào của nhóm tiến trình tiền cảnh đều trả về `inferred_idle`, kể cả Python và `gdb`; PGID của terminal suy ra từ `ps` chỉ dùng để gửi signal, chứ không dùng làm bằng chứng «chỉ shell mới có thể idle». Logic kiểm tra tiến trình thuần túy có thể inject được, và đã được unit test trên Linux, đồng thời được một macOS CI job điều khiển qua PTY thật và đường dẫn bảng tiến trình thật.

Tier 2 trả về `inferred_idle` sau khi không có output liên tục trong `idleSilenceMs`, nên các lệnh sleep hoặc bị chặn ở mạng có thể trông như đã ready. Nếu trước đó đã thấy prompt marker, Tier 2 sẽ chờ thêm `handoffGraceMs`, giúp việc bàn giao tiền cảnh của bash rơi đúng vào ranh giới im lặng vẫn kết thúc bằng quy thuộc `stdin_read` chính xác, thay vì tụt xuống suy luận yếu hơn; khoảng ân hạn này là trường cấu hình do bên triển khai sở hữu, và được kiểm định là ít nhất phải phủ một `pollIntervalMs` — khoảng ân hạn ngắn hơn chu kỳ polling thì không chứa nổi một vòng poll sẵn sàng, nên không thể thay đổi bất kỳ kết quả nào. Nó chỉ ràng buộc những lần send đã thấy marker, đánh đổi bằng độ trễ trả về của riêng tình huống tương tác đó, chứ không phải của mọi lần send. Tier 3 trả về `timeout` sau `timeoutMs`, tránh để lệnh gọi tool tiền cảnh chiếm giữ agent vô hạn. Kết quả giữ nguyên các phân biệt này; bên gọi có thể chờ qua `ctx.jobs`, gửi signal tới nhóm tiền cảnh, hoặc chẩn đoán từ một session khác.

Sau khi một lần send settle ở bất kỳ tầng nào, `TerminalSendOperation.append` sẽ không nhận output nữa, và từ đó output của tiến trình con không đi vào operation đã settle ấy; nó vẫn đi vào scrollback, cũng như vào bất kỳ lần send nào đang hoạt động tại thời điểm đó. Vì vậy, các test chờ một dấu hiệu xuất hiện trên chính operation mà chúng khởi động phải đặt `idleSilenceMs` và `timeoutMs` cao hơn thời gian khởi động của bản thân tiến trình con; nếu không, trên macOS runner tải cao, việc khởi động interpreter sẽ kết thúc lần send này trước khi dấu hiệu được in ra.

Thông báo data của `node-pty` đi vào cùng một terminal parser. Carry state của parser xử lý các chuỗi điều khiển vắt qua nhiều callback và ký tự carriage return nằm ở cuối callback; do đó, ngay cả khi CRLF bị tách ra, cũng chỉ sinh một dòng mới, chứ không tạo dòng trống làm thay đổi phân trang. Bản hiện thực chuẩn hóa output theo dòng, nhưng không hứa hẹn vận hành đúng ứng dụng toàn màn hình.

### Output model nhìn thấy và tính bền vững

Các sự kiện bền vững `tool/call` và `tool/result` hiện có là nguồn sự thật cho văn bản model gửi đi và output đã render trả về cho model. `terminal_open` trả MOTD qua kết quả tool được ghi lại; kết quả `send`/`read`/`list`/`signal`/`close` ở tiền cảnh cũng được ghi qua cùng đường đó. Package PTY không ghi lặp luồng byte thô vào sự kiện session tùy chỉnh.

Việc gửi ở nền tái sử dụng đường thông báo hoàn tất tác vụ nền và đường kết quả `job_output` sẵn có, nên bất kỳ output nào đi vào các request model tiếp theo cũng được lưu bền như vậy. Byte terminal thô chỉ tồn tại như trạng thái có biên trong tiến trình, không được lưu bền và không khôi phục được. Transcript (bản ghi văn bản) sink opt-in trong tương lai phải có quy ước lưu giữ, credential và quyền riêng tư độc lập.

### Teardown cây tiến trình

Handle terminal của tiến trình con sở hữu tiến trình terminal cấp cao nhất và session của nó. Khi đóng, nó bắt các hậu duệ theo quan hệ bắc cầu theo PID cha, theo thứ tự tiến trình con trước, gửi `SIGTERM` rồi chờ, sau đó quét lại các tiến trình con fork ra trong lúc tắt, gửi `SIGKILL` tới hợp của cả hai tập, và xác minh mọi hậu duệ không phải zombie đều đã rời bảng tiến trình trước khi dừng tiến trình cấp cao nhất. Tiến trình zombie trên Linux khớp danh tính thì đã không còn việc gì thực thi được, nên được coi là đã dừng hẳn hoàn toàn. Mỗi PID được bắt đều kèm danh tính khởi động của tiến trình, tránh việc tái sử dụng PID khiến signal leo thang bị gửi tới tiến trình không liên quan.

Teardown báo cáo riêng việc tiến trình cấp cao nhất thoát và việc dọn dẹp các tiến trình còn sống. Session PTY không tuyên bố thành công chỉ vì shell đã thoát: nó sẽ gọi `SubprocessTerminalHandle.terminate()` và chờ toàn bộ session dừng hẳn hoàn toàn, nếu dọn dẹp thất bại thì lan truyền ra ngoài và liệt kê những tiến trình còn sống. Lần close thất bại không bị cache vĩnh viễn: registry và session cục bộ đều chỉ xóa lần thử thất bại đó khi hàng rào đóng vẫn đang trỏ tới chính lần thử ấy, nhờ vậy các lần close tường minh hoặc close theo vòng đời sau đó sẽ thử lại, và không can nhiễu vào các lần thử song song mới hơn. Ngay cả khi một lần close thất bại, dịch vụ dispose vẫn dọn sạch registry backend, đặt chỗ và owner detacher của nó.

### Kết hợp và triển khai

Tổ hợp ví dụ giữ nguyên opt-in, và dùng giá trị mặc định an toàn:

```yaml
plugins:
  '@deepseek-ai/dsh-sandbox-local':
  '@deepseek-ai/dsh-sandbox-policy':
    config:
      mode: workspace-write
      workspaceRoot: .
  '@deepseek-ai/dsh-terminal':
  '@deepseek-ai/dsh-subprocess-local':
  '@deepseek-ai/dsh-terminal-bash':
    config:
      scrollbackLines: 10000
      scrollbackMaxBytes: 4194304
      maxReadBytes: 262144
      pollIntervalMs: 50
      exactProbeAfterMs: 150
      idleSilenceMs: 3000
      handoffGraceMs: 500
      timeoutMs: 30000
      disposeGraceMs: 3000
  '@deepseek-ai/dsh-tool-terminal':
    config:
      enableRunInBackground: true
      maxResultBytes: 262144
```

Package cung cấp chỉ dẫn tool ngắn gọn, nói rõ về trạng thái bền vững, cách ly theo owner, kết quả idle không chắc chắn, việc dọn dẹp, và ưu tiên dùng các tool một lần sẵn có khi không cần tương tác. Ví dụ nền tảng đã phát hành không mount PTY: PTY chỉ được opt-in qua tổ hợp chuyên dụng, còn ACP (Agent Client Protocol) và overlay snapshot headless sẽ kiểm chứng nó. Một khi instance `dsh-tool-terminal` được bật, 6 tool và `run_in_background` sẽ bật mặc định; bên triển khai có thể chỉ tắt riêng tham số nền qua cấu hình.

### Công việc tạm hoãn

- Hỗ trợ TUI toàn màn hình, chuỗi phím có tên, ngắt bằng BEL, tool resize terminal và snapshot alternate-screen đều cần kiểm chứng riêng cho quy ước hướng tới model.
- Việc khởi động khai báo theo từng agent cần điểm kết hợp agent-setup; vẫn cấm session toàn cục ở thời điểm nạp plugin.
- Việc khôi phục session sau khi mất tiến trình harness cần owner ngoài tiến trình và giao thức có phiên bản.
- Chính sách egress mạng và việc rollback tác dụng phụ bên ngoài nằm ngoài phạm vi PTY, tiếp tục là công việc bảo mật riêng.
- Hỗ trợ Windows/ConPTY cần một backend có quyền sở hữu tiến trình gốc Windows và ngữ nghĩa signal tương ứng.

## Phương án thay thế

**Thay thế `bash`, tool filesystem hoặc tool task bằng PTY.** Bác bỏ. Tool dùng một lần có quy ước kiểm định, phê duyệt, sandbox, giới hạn output và phát lại mạnh hơn. PTY chỉ phục vụ trạng thái tương tác.

**Thêm chế độ bền vững cho `bash`.** Bác bỏ. Việc trả về theo trạng thái sẵn sàng thay vì theo lúc tiến trình thoát, việc giữ cây tiến trình xuyên các lần gọi, và việc phơi bày stdin tương tác tạo thành quy ước sở hữu và thất bại khác biệt.

**Yêu cầu lấy master fd gốc từ `node-pty`.** Bác bỏ. API công khai của nó không phơi bày master fd. Thay vào đó, adapter terminal của tiến trình con cục bộ suy ra nhóm tiền cảnh và các hậu duệ từ metadata tiến trình của OS được hỗ trợ, và coi metadata không đọc được là detector miss.

**Gửi signal tới toàn bộ thành viên của POSIX session thuộc PID gốc.** Bác bỏ. `node-pty` có thể phơi bày PID helper thuộc session của trình khởi chạy, nên việc dọn dẹp theo SID có thể gửi signal tới các tiến trình harness hoặc desktop không liên quan. Cây hậu duệ có kiểm định danh tính khởi động PID thì hẹp hơn, với ranh giới an toàn được bảo đảm bởi cấu trúc.

**Phát hành registry `TerminalIdleDetector` có thể thay thế.** Bác bỏ. Các sự kiện tiền cảnh riêng của nền tảng đến từ nguyên thủy tiến trình terminal được mount, còn việc phán định sẵn sàng theo prompt／im lặng vẫn là một chính sách riêng tư bên trong `dsh-terminal-bash`. Việc thay thế môi trường thực thi filesystem／tiến trình con chính là điểm mở rộng cần thiết.

**Thêm tool `sleep` riêng cho PTY.** Bác bỏ. `ctx.jobs` đã sở hữu việc chờ có biên, hủy, thông báo hoàn tất và thu thập hướng tới model. Một cơ chế đánh thức dùng chung thứ hai sẽ vượt qua ranh giới agent loop (vòng lặp agent) và lặp lại quy ước đó.

**Bao gồm xử lý TUI sequence và BEL.** Bác bỏ. Prototype nguồn coi các đường này là nhạy cảm với timing, và vẫn ghi nhận các thất bại alternate-screen và tương tác chưa giải quyết. PTY theo dòng đã đủ chứng minh giá trị cốt lõi, không cần đưa hành vi chưa được kiểm chứng vào tầng nền tảng.

**Áp dụng daemon ngoài tiến trình ngay lập tức.** Năng lực trong tiến trình ban đầu không áp dụng, vì các điểm vào chạy thường trú hiện tại đã đủ duy trì Cordis context. Việc khôi phục xuyên tiến trình hoặc gắn kèm nhiều client sẽ khiến daemon trở nên hợp lý, nhưng cả hai đều đã được hoãn lại.

## Kiểm chứng

- Test bao phủ theo từng file cố định việc cách ly theo owner, đặt chỗ đồng thời, việc hủy trong lúc kiểm tra trước khi ghi, việc hủy spawn chưa phát hành và teardown theo kiểu chờ, việc từ chối thay đổi chế độ sandbox, việc dọn dẹp vòng đời có thể thử lại, các tầng sẵn sàng, việc từ chối trạng thái chờ stdin có trước khi ghi và prompt trước đó đến muộn, việc khoảng ân hạn bàn giao có cấu hình vượt lên trên idle fallback qua một vòng poll cùng việc từ chối khi thấp hơn `pollIntervalMs`, carry state của sanitizer, giới hạn kết quả UTF-8 đầy đủ, tích hợp task, schema và render intent chính xác.
- Fixture (dữ liệu chuẩn bị cho test) tiến trình con bao phủ việc chờ stdin ở tiến trình không phải leader và luồng không phải luồng chính, zombie dừng hẳn hoàn toàn, trạng thái tiến trình không đọc được, bảng syscall được hỗ trợ, kiến trúc không được hỗ trợ và việc từ chối dương tính giả; cùng bộ unit test đó bao phủ logic bộ kiểm tra macOS qua injection.
- Test với `node-pty` thật và test bên tiêu thụ PTY cùng nhau bao phủ trạng thái shell, chính sách sandbox dùng chung, việc làm sạch môi trường, `SIGINT` tiền cảnh ở raw mode, tiến trình hậu duệ bỏ qua `SIGTERM`, và việc dừng hẳn hoàn toàn ngay khi dispose trả về, trên các host được hỗ trợ.
- Test `cordis.yml` do Loader điều khiển mount tổ hợp ba package thật. Snapshot ACP và headless cố định 6 schema, kết quả có biên và lỗi qua overlay opt-in; snapshot TUI cố định cách hiển thị thẻ terminal và thẻ generic.
- Quy ước package, sơ đồ kiến trúc, trang hệ thống con, catalog được sinh ra và website API cùng mô tả một giao diện đã phát hành.

## Hệ quả

**Có được trạng thái terminal bền vững mà không cần làm suy yếu tool dùng một lần.** Trạng thái shell và REPL có thể giữ lại xuyên các lần gọi tool, trong khi `bash`, `read`, `write` và `edit` tiếp tục sở hữu quy ước kiểm định, phê duyệt và phát lại hẹp hơn.

**Ngoài Tier 1 trên Linux, mọi kết luận idle đều là heuristic.** Im lặng output không phân biệt được prompt, sleep và I/O mạng. Kết quả có kiểu giữ lại sự không chắc chắn, còn timeout có biên, việc chờ task và signal giúp model vẫn nắm được quyền kiểm soát.

**Ranh giới giữa quy thuộc chính xác và quy thuộc suy luận là một đánh đổi độ trễ, không phải một race có thể loại bỏ.** Việc quy thuộc phụ thuộc vào kernel công bố bàn giao tiền cảnh trước hay sau khi chạm ngưỡng im lặng, nên mọi khoảng ân hạn cố định đều là một canh bạc về lập lịch. `handoffGraceMs` giao ván cược đó cho cấu hình triển khai: tăng nó lên có thể đổi lấy quy thuộc `stdin_read` chính xác trên host chậm hoặc tải cao, đánh đổi bằng độ trễ trả về khi tương tác sau khi đã thấy prompt marker; giảm xuống thì ngược lại. Các test không nên phụ thuộc vào kết quả thắng thua thì hãy dùng token không xuất hiện trong phần echo input, và khẳng định output do tiến trình con sinh ra trong lần send kế tiếp, thay vì khẳng định đường quy thuộc.

**Trạng thái bền vững có thể lệch khỏi nhận thức của model.** Model có thể quên cwd hoặc REPL đang hoạt động. Tóm tắt session và output được giữ lại giúp phục hồi, nhưng không prompt nào có thể biến việc lưu bền trạng thái thành hành vi tất định.

**Tiến trình hậu duệ đã daemon hóa có thể rời khỏi cây tiến trình mà provider cục bộ bắt được.** Tiến trình được reparent trước teardown thì không còn phát hiện được từ tiến trình gốc `node-pty`. Nguyên thủy terminal cục bộ chấp nhận khoảng trống dọn dẹp này, không mạo hiểm gửi signal theo SID tới các tiến trình không liên quan.

**Shell có thể gây tác dụng phụ bên ngoài.** Sandbox session và việc làm sạch môi trường giảm mức phơi bày cục bộ, nhưng không thể thu hồi một lần push, lời gọi API hay tin nhắn đã gửi. Bên triển khai không chấp nhận được các tác dụng phụ này phải bỏ qua PTY hoặc bổ sung chính sách mạng.

**Mất tiến trình sẽ hủy trạng thái terminal.** Session trong tiến trình không sống sót qua việc harness crash hay restart, và scrollback thô cũng không được lưu bền. Công việc quan trọng phải được commit vào file hoặc hệ thống bền vững khác.

**`node-pty` là phụ thuộc native của `dsh-subprocess-local`.** Việc cài đặt, các phiên bản Node được hỗ trợ, mức khả dụng của prebuild và hành vi theo nền tảng đều cần chạy smoke test trên sản phẩm build ở từng OS được hỗ trợ.
