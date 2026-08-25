# @deepseek-ai/dsh-tool-bash

[English](README.md) | Tiếng Việt

Công cụ `bash` phía mô hình, được đăng ký trên seam executor `ctx.shell`. Việc thực thi foreground luôn nằm sau seam này; các handle tiến trình background được đăng ký vào runtime `ctx.jobs` chung, và được điều khiển qua `job_output`, `job_list` và `job_kill`; các công cụ này do `@deepseek-ai/dsh-tool-jobs` cung cấp.

Cần nạp Service Provider executor (ví dụ `@deepseek-ai/dsh-bash-local`) cùng với registry [`@deepseek-ai/dsh-shell-env`](../shell-env/README.md); plugin sẽ giữ trạng thái chờ cho đến khi từng service được inject sẵn sàng (`inject: ['tools', 'bash', 'systemPrompt', 'bashEnv']`). Quy ước của công cụ là phương ngữ bash — hãy gắn executor có thể phân tích được bash.

Gốc package chỉ công khai quy ước plugin Cordis (`name`, `inject`, `Config`, `apply`); phần render kết quả và bộ thích ứng tiến trình background vẫn nằm bên trong package.

Plugin còn cung cấp đoạn prompt `tool:bash` (thứ tự 105): kiểm tra dấu hiệu `[exit code: N]` trong mỗi kết quả, khi phát hiện thất bại thì điều tra nguyên nhân trước rồi mới tiếp tục.

## Công cụ

### `bash`

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `command` | string (bắt buộc) | Chạy qua `bash -c`. Không giữ trạng thái giữa các lần gọi; hãy dùng `workdir`, đừng dùng `cd`. |
| `description` | string (bắt buộc) | Tóm tắt lệnh bằng một dòng thể chủ động (5–10 từ), chỉ dùng để hiển thị trên UI／log, không ảnh hưởng đến việc thực thi. |
| `timeoutMs` | number | Ghi đè thời gian timeout tính bằng mili giây. Executor sẽ áp dụng giá trị mặc định và giới hạn trên đã cấu hình. |
| `workdir` | string | Thư mục làm việc cho lần gọi này. Mặc định là định danh hệ thống tệp của cwd phiên agent (trợ lý thông minh) gọi (`session.header.cwd`), giúp mỗi phiên chạy trong workspace riêng của nó; `workdir` tương đối cũng được phân giải theo cùng định danh đó. |
| `run_in_background` | boolean | Trả về job id ngay lập tức; không áp dụng timeout. |
| `sandbox_permissions` | string enum | Chỉ hiển thị khi executor đã gắn có bật sandbox (`ctx.shell.sandboxMode` báo cáo một giá trị mặc định mang tính hạn chế): chế độ rộng hơn mà lệnh bị từ chối cần đến, lấy từ bộ từ vựng đích đóng `workspace-write`/`danger-full-access` (tuyệt đối không được thu hẹp về mặc định của executor; chế độ hiệu lực được xác định theo phiên, và khi thực thi sẽ dựa vào đó để kiểm tra xem có mở rộng nghiêm ngặt hay không, yêu cầu không mở rộng sẽ thất bại ngay và không phát prompt tới bất kỳ ai). |
| `justification` | string | Bắt buộc cung cấp cùng `sandbox_permissions` (thiếu bất kỳ mục nào cũng sẽ sinh lỗi xác thực): giải thích cho người dùng bằng một câu vì sao lệnh này cần quyền rộng hơn. |

Trước khi thực thi, `command`, `workdir` và `timeoutMs` sẽ được phân giải qua `ctx.shell.resolve()` dựa trên các giá trị mặc định trong cấu hình executor, nhờ vậy Service Definition (`ShellExecSpec`) nhận được giá trị `workdir`/`timeoutMs` tường minh. Lớp công cụ áp dụng mặc định thư mục làm việc dựa trên `session.header.cwd` của agent gọi, rồi mới gọi `resolve()`: vì N phiên dùng chung một executor, cwd theo từng phiên bắt buộc phải đến từ `exec.agent`; chỉ khi không lấy được cwd phiên thì executor mới lùi về cấu hình của chính nó／`process.cwd()`. Khi tồn tại chính sách sandbox, công cụ sẽ tái sử dụng `workspaceRoot` đã được chuẩn hóa làm mốc thư mục làm việc, tránh việc logic hạn chế và quá trình khởi động tiến trình cho ra kết quả phân giải khác nhau đối với cùng một cách viết đường dẫn phiên.

### Môi trường shell được quản lý

Mỗi lần gọi bash foreground hay background do mô hình khởi tạo đều nhận được một bộ biến môi trường `DSH_*` đáng tin cậy vừa thu thập, thông qua registry [`dsh-shell-env`](../shell-env/README.md) dùng chung: `DSH_HOME` (đường dẫn tuyệt đối tới home của Harness), `DSH_SHELL=1`, `DSH_SESSION_ID` của agent, và `DSH_SESSION_JSONL` khi backend lưu trữ đang hoạt động định vị được. Quy ước của registry — bên đóng góp đăng ký, cơ chế báo lỗi tường minh cho khóa trùng／khóa chưa khai báo, việc giữ lại mục dựng sẵn và ví dụ đóng góp — được ghi trong README của package đó. Ảnh chụp được truyền qua kênh chuyên dụng `ShellExecRequest.dshEnv`; executor cục bộ sẽ xóa mọi `DSH_*` kế thừa trước rồi mới hợp nhất, nhờ đó harness lồng nhau và các agent cha／con chạy song song sẽ không rò rỉ danh tính cũ, và tuyệt đối không sửa đổi `process.env`. Mô tả công cụ chỉ dạy quy ước `$DSH_*` chung, không nêu đích danh biến chuyên dụng cho lưu trữ, cũng không thêm đoạn system prompt cố định.

Văn bản kết quả lần lượt chứa stdout, đoạn `[stderr]` tùy chọn, và các dấu hiệu về từ chối sandbox, timeout, tín hiệu, mã thoát cùng cắt bớt nếu có. Timeout và trạng thái thoát cuối cùng được báo cáo riêng; thoát khác 0 vẫn là kết quả do mô hình diễn giải, không trở thành `isError`. Kết quả bị cắt bớt sẽ liên kết tới tệp spill đầy đủ an toàn, hoặc báo cáo rằng tệp không khả dụng. Chỉ các sự cố hạ tầng như lỗi spawn và hủy bỏ mới sinh ra `isError`.

Giá trị thành công chuẩn cho tiến trình foreground đã hoàn tất là `{ kind: 'foreground', ...ShellRunResult }`, còn tác vụ đã phát hành là `{ kind: 'background', jobId }`. Native renderer giữ nguyên văn bản nói trên, bao gồm chuỗi chính xác `started background job <id>`; bên tiêu thụ theo hướng lập trình dùng các trường có kiểu, không cần phân tích các chuỗi này. Giới hạn luồng của executor vẫn là giới hạn thu thập của `ShellRunResult`, và mang theo đường dẫn spill của nó.

Khi `run_in_background` là true, plugin này sẽ tiền kiểm `ctx.jobs.start()` trước khi spawn, đăng ký agent gọi làm bên nắm giữ, và thích ứng handle `ShellProcess` trả về thành các hook hủy／hoàn tất／xuất tăng dần chung. Runtime tác vụ chịu trách nhiệm về job id, cách ly giữa các phiên, thông báo hoàn tất, chờ đợi và dọn dẹp dispose (giải phóng tài nguyên); plugin này chỉ ánh xạ các sự kiện thoát／sandbox của bash thành đầu ra tác vụ và chi tiết kết quả. `enableRunInBackground: false` sẽ gỡ bỏ tham số này và từ chối các lệnh gọi cưỡng bức chạy nền khi thực thi.

## Hiển thị UI

Công cụ nắm giữ ý định render `presentCall`/`presentResult` của riêng nó. Lệnh gọi foreground là thẻ terminal, gồm lệnh, mô tả, cwd, đầu ra và trạng thái thoát sau khi phân tích. Vì thẻ hiển thị trạng thái thoát bằng một pill độc lập, các dấu hiệu `[exit code: N]` / `[killed by signal: …]` bị tiêu thụ trong quá trình phân tích sẽ được loại khỏi đầu ra; mọi dấu hiệu khác (cắt bớt, timeout, sandbox) đều được giữ lại trong đầu ra. Việc khởi động background chỉ trả về job id nên dùng thẻ thực thi chung; các công cụ `job_*` chung nắm giữ thẻ riêng của chúng. Những presenter này là hàm thuần túy, có thể phát lại an toàn.

## Công cụ chỉ dựng request bằng tham số có tên

`ShellExecRequest` mang theo `stdoutMaxBytes`, `stdin`, `env` thông thường và `dshEnv` được quản lý — tất cả đều tùy chọn — dành cho các plugin in-process đáng tin cậy và registry môi trường của công cụ này. Công cụ phía mô hình không công khai `stdoutMaxBytes`, `stdin` hay `env`: nó dựng request bằng các trường lệnh／thư mục làm việc／timeout／tín hiệu／sandbox có tên, cộng với `dshEnv` thu thập từ registry. Các khóa mô hình dư thừa sẽ bị bỏ qua, không thể thay thế giá trị được quản lý. Cú pháp shell có thể cung cấp hành vi tương đương ở mức lệnh, còn executor cục bộ sẽ xóa thông tin xác thực và giá trị `DSH_*` cũ khỏi môi trường. Xem [stdin/env Agent Note](../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md).

## Quyền và nâng quyền

Trừ khi executor có bật sandbox ([`dsh-bash-sandbox`](../bash-sandbox/)) hạn chế lệnh, còn lại lệnh sẽ chạy với toàn bộ quyền của executor. Sandbox chỉ-từ-chối sẽ báo cáo việc từ chối như một sự kiện kết quả, và ở đây được render thành dấu hiệu từ chối; chính sách cho phép／từ chối／hỏi theo từng lệnh gọi do waterfall (sự kiện kiểu thác nước) `tools/pre-execute` đảm nhiệm (xem docs/architecture.md).

Lệnh gọi bash cần nâng quyền sẽ phân giải `ctx.approval` trước khi thực thi. `allowed-once` chỉ áp dụng chế độ được yêu cầu cho đúng lần gọi đó; khi phê duyệt bị từ chối, bị hủy, không khả dụng hoặc thiếu ngữ cảnh phê duyệt, lệnh hoàn toàn không được thực thi và trả về lỗi khác nhau. Sau khi bị từ chối thật sự, mô hình có thể thử lại chính lệnh đó một lần trong cùng lượt, với chế độ hẹp nhất đủ đáp ứng nhu cầu kèm lý do; bản thân prompt phê duyệt chính là bước xin sự đồng ý. Tuyệt đối không được suy đoán trước việc nâng quyền; vô hiệu hóa hoặc từ chối phê duyệt là kết quả cuối cùng. Lý do được nêu trong [Agent Note về sandbox](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

## Chuyển chế độ theo từng phiên

Với executor có bật sandbox, mỗi lần gọi sẽ lần lượt phân giải chế độ theo nâng quyền một lần, ghi đè theo phiên, rồi mặc định của executor. Các lệnh gọi không bật sandbox và không có agent thì không mang ghi đè theo phiên. Bên sở hữu chính sách đóng góp chế độ thường trú hiện hành và không phân biệt năng lực cụ thể; kết quả từ chối vẫn chịu trách nhiệm về chế độ hiệu lực riêng cho thao tác đó cùng hướng dẫn thử lại. Xem [phép tính gộp của `dsh-shell`](../shell/README.md) và [quy ước chuyển chế độ sandbox](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

## Trải nghiệm mô hình

### System prompt

#### Nội dung mô hình nhìn thấy

Mọi request trong phạm vi đăng ký của plugin này đều chứa hướng dẫn bash bên dưới. Bên sở hữu chính sách đóng góp trạng thái sandbox hiện hành thông qua ngữ cảnh runtime an toàn với cache của chính nó, mà không thay đổi đoạn văn này. Giới hạn công cụ theo phạm vi có thể ẩn schema, nhưng không gỡ bỏ đoạn được đăng ký độc lập này.

##### Hướng dẫn Bash

```markdown
Check the [exit code: N] marker on every bash result; investigate failures before moving on.
```

#### Ảnh hưởng token

Trong thời gian plugin hoạt động, mỗi request phát sinh một khoản chi phí đầu vào cố định nhỏ, không phụ thuộc vào chế độ sandbox hay việc chuyển chế độ.

#### Ảnh hưởng KV Cache

Chỉ cần phạm vi đăng ký và văn bản prompt không đổi thì tiền tố có thể tái sử dụng ổn định. Việc kích hoạt hoặc dispose plugin có thể làm mất hiệu lực tái sử dụng bắt đầu từ đoạn prompt này; chuyển chế độ sandbox thì không.

### Schema công cụ

#### Nội dung mô hình nhìn thấy

Mô hình sẽ nhìn thấy [`bash` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-bash) được sinh ra. Trường đó chỉ xuất hiện khi bên sản xuất này bật `run_in_background`; `sandbox_permissions` và `justification` chỉ xuất hiện khi executor đã gắn khai báo hỗ trợ sandbox. Giới hạn công cụ theo phạm vi agent có thể gỡ bỏ định nghĩa dành cho agent đó.

#### Ảnh hưởng token

Mỗi request mà công cụ hiển thị đều phát sinh chi phí schema cố định; hỗ trợ sandbox sẽ thêm các trường nâng quyền cùng đoạn mô tả điều kiện của chúng.

#### Ảnh hưởng KV Cache

Chỉ cần khả năng hiển thị, hỗ trợ background và năng lực sandbox của executor giữ nguyên thì tiền tố có thể tái sử dụng ổn định. Khi giới hạn, cấu hình hoặc executor thay đổi, việc tái sử dụng có thể mất hiệu lực bắt đầu từ định nghĩa công cụ thay đổi đầu tiên.

### Kết quả foreground

#### Nội dung mô hình nhìn thấy

Renderer xuất phần đuôi stdout tùy theo dữ liệu trước, rồi mới đến `[stderr]` tùy chọn và phần đuôi stderr. Khi không có đầu ra, nó xuất chính xác `(no output)`. Các dòng điều kiện có dạng chính xác là `[output truncated; full output: <path-or-(unavailable)>]`, `[sandbox: file access denied under <mode> mode]`, `[timed out after <timeoutMs>ms]`, `[killed by signal: <signal>]` và `[exit code: <exitCode>]`; nguyên văn các dòng nâng quyền sandbox và lỗi runner được liệt kê trong [`dsh-bash-sandbox`](../bash-sandbox/README.md).

#### Ảnh hưởng token

Trước khi gọi thì token kết quả bằng không. Đầu ra của mỗi luồng đều có giới hạn, còn mỗi dòng đã xuất sẽ được giữ trong lịch sử cho đến khi nén (compaction).

#### Ảnh hưởng KV Cache

Chỉ ghi thêm; nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

### Ngữ cảnh và kết quả tác vụ background

#### Nội dung mô hình nhìn thấy

Việc khởi động trả về chính xác `started background job <jobId>`. Bên sản xuất này cung cấp cho runtime tác vụ chung phần đầu ra tiến trình tăng dần, `[some output was dropped from memory; full output: <paths-or-(unavailable)>]` tùy chọn, các sự kiện sandbox, cùng chi tiết kết thúc như `exit code: <exitCode>` hoặc `signal: <signal>`. [`dsh-tool-jobs`](../../jobs/tool-jobs/README.md) chịu trách nhiệm về dòng trạng thái mô hình nhìn thấy, thông báo hoàn tất, danh sách và phản hồi hủy.

#### Ảnh hưởng token

Xác nhận khởi động rất ngắn và được giữ lại; đầu ra thu thập được tùy theo dữ liệu và bị giới hạn bởi bộ đệm luồng của executor. Việc đọc theo kiểu tiêu thụ không lặp lại đầu ra trước đó.

#### Ảnh hưởng KV Cache

Chỉ ghi thêm; nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

### Lỗi công cụ

#### Nội dung mô hình nhìn thấy

Lỗi xác thực và lỗi chính sách được chuẩn hóa thành `Error: <message>`. Các thông báo ổn định của package này gồm `invalid command: expected a non-empty string`, `invalid description: expected a non-empty string`, `invalid timeoutMs: expected a positive number, got <value>`, `invalid escalation: sandbox_permissions requires a justification`, `invalid escalation: justification is only valid together with sandbox_permissions`, `invalid justification: expected a non-empty sentence`, `background execution is disabled for this bash tool`, `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`, `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`, `sandbox escalation to "<mode>" is not strictly wider than this call's current "<mode>" mode`, các biến thể phê duyệt không khả dụng／bị từ chối／bị hủy, cùng `tool call aborted`.

#### Ảnh hưởng token

Chỉ các lệnh gọi thất bại mới làm tăng những token được giữ lại này; khi nâng quyền bị từ chối thì lệnh không chạy, nên không có thêm đầu ra lệnh.

#### Ảnh hưởng KV Cache

Chỉ ghi thêm; nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Pill trạng thái thoát khi phát lại được phân tích từ văn bản kết quả**: nếu dòng cuối của đầu ra tình cờ đúng bằng `[exit code: N]` / `[killed by signal: …]`, phát lại phiên sẽ hiển thị sai pill và dòng đó bị mất khỏi phần thân thẻ, vì bộ phân tích coi nó là dấu hiệu do chính nó tiêu thụ; đây là vấn đề tồn đọng đã biết, chỉ ảnh hưởng đến phần hiển thị.
- **Công cụ `bash` không áp dụng ngân sách `timeout-policy`**: theo [Agent Note về timeout-policy cho lệnh gọi công cụ](../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.md), nó giữ lại đường đi `BASH_TIMEOUT` do executor nắm giữ.
- **Tiến trình background không có timeout của executor**: khi không còn cần công việc nữa, bên gọi phải dùng `job_kill`, hoặc dựa vào dispose của bên nắm giữ／service.
