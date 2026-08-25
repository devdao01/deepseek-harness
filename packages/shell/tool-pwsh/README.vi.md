# @deepseek-ai/dsh-tool-pwsh

[English](README.md) | Tiếng Việt

Công cụ `pwsh` hướng mô hình, được đăng ký bên trên seam executor `ctx.shell`. Hướng tới các tổ hợp Windows mà `ctx.shell` được hậu thuẫn bởi executor PowerShell (như `@deepseek-ai/dsh-pwsh-local`); quy ước của công cụ là phương ngữ PowerShell: đường dẫn `C:\...` nguyên bản và biến `$env:NAME`. Hành vi khớp với `dsh-tool-bash` theo từng lệnh gọi — thực thi foreground và `run_in_background` qua runtime tác vụ chung, quản lý môi trường `DSH_*` qua registry `shell-env` dùng chung, render từ chối sandbox và mặt nâng quyền `sandbox_permissions` trong cùng lượt, cùng câu chuyện render marker/cắt bớt của bash (thoát sạch không sinh marker).

Cần executor đã nạp và plugin `shell-env`; công cụ giữ trạng thái pending cho tới khi cả hai đều hiện diện (`inject: ['tools', 'bash', 'systemPrompt', 'bashEnv']`).

Gốc package chỉ export quy ước plugin Cordis (`name`, `inject`, `Config`, `apply`); phần render kết quả (`src/render.ts`) và bộ thích ứng tác vụ background (`src/background.ts`) phản chiếu cấu trúc của công cụ bash, và có thể truy cập qua export `./src/*` của package.

Plugin còn đóng góp đoạn prompt `tool:pwsh` (order 105): thoát khác 0 được báo cáo bằng marker `[exit code: N]`, còn ngắt trên Windows kết thúc bằng exit 1 không kèm signal.

## Công cụ

### `pwsh`

| Arg | Type | Notes |
|---|---|---|
| `command` | string (required) | Chạy qua `pwsh -Command`. Không giữ trạng thái giữa các lệnh gọi — dùng `workdir`, đừng dùng `cd`. |
| `description` | string (required) | Tóm tắt một dòng thể chủ động về lệnh (5-10 từ), chỉ dùng để hiển thị trên UI/log — không ảnh hưởng đến việc thực thi. |
| `timeoutMs` | number | Giá trị ghi đè timeout (mili giây). Executor áp dụng giá trị mặc định và giới hạn trên đã cấu hình. |
| `workdir` | string | Thư mục làm việc cho lần gọi này. Mặc định lấy cwd phiên của agent (trợ lý thông minh) gọi (`session.header.cwd`), giúp mỗi phiên chạy trong workspace riêng; `workdir` tương đối được phân giải dựa trên cùng danh tính đó. |
| `run_in_background` | boolean | Trả về job id ngay lập tức; không áp dụng timeout. |
| `sandbox_permissions` | string enum | Chỉ hiển thị khi đã gắn executor sandbox (`ctx.shell.sandboxMode` đã được định nghĩa). Chế độ sandbox rộng hơn dùng để thử lại một lần đối với lệnh vừa bị sandbox từ chối — hãy lấy chế độ rộng hơn hẹp nhất vừa đủ, yêu cầu `justification` và phải được người dùng phê duyệt qua `ctx.approval` **trước khi** thực thi. Yêu cầu không mở rộng hoặc không được phê duyệt sẽ fail-closed, không chạy bất cứ thứ gì. |
| `justification` | string | Bắt buộc cung cấp cùng `sandbox_permissions`: giải thích cho người dùng bằng một câu vì sao chính lệnh này cần quyền truy cập rộng hơn. |

`command`, `workdir` và `timeoutMs` được phân giải qua `ctx.shell.resolve()` theo các giá trị mặc định trong cấu hình executor trước khi thực thi. Giá trị mặc định của workdir được lấy ở lớp công cụ từ `session.header.cwd` của agent gọi, trước khi `resolve()` chạy — cwd của mỗi phiên bắt buộc phải đến từ `exec.agent`, vì N phiên dùng chung một executor; chỉ khi không có cwd phiên thì executor mới lùi về cấu hình của chính nó / `process.cwd()`.

### Managed shell environment

Mỗi lệnh gọi pwsh foreground và background từ mô hình đều nhận một bộ môi trường `DSH_*` đáng tin cậy vừa thu thập qua registry [`dsh-shell-env`](../shell-env/) dùng chung: `DSH_HOME` (đường dẫn tuyệt đối tới thư mục chính của Harness), `DSH_SHELL=1`, `DSH_SESSION_ID` của agent, và `DSH_SESSION_JSONL` khi backend lưu trữ đang hoạt động định vị được JSONL. Các plugin đóng góp dữ kiện `DSH_*` vào `ctx.shellEnv` đối xử với lệnh gọi pwsh và lệnh gọi bash như nhau. Ảnh chụp được truyền qua kênh chuyên dụng `ShellExecRequest.dshEnv`; `process.env` không bao giờ bị sửa đổi. Phần mô tả chỉ dạy quy ước `$env:DSH_*` chung, chứ không nêu đích danh các biến liên quan đến lưu trữ.

Văn bản kết quả gồm stdout, đoạn `[stderr]` tùy chọn, rồi đến các marker cắt bớt, từ chối sandbox (kèm gợi ý nâng quyền trong cùng lượt khi tổ hợp có công khai năng lực nâng quyền), timeout, signal và thoát nếu có. Thoát sạch (0, không signal) không sinh marker; thân rỗng được render thành `(no output)`. Việc cắt bớt sẽ liên kết tới một tệp spill đầy đủ an toàn, hoặc báo cáo rằng nó không khả dụng. Timeout được báo cáo độc lập với trạng thái thoát cuối cùng; thoát khác 0 vẫn là kết quả để mô hình diễn giải chứ không phải `isError`. Trên Windows, việc buộc kết thúc sẽ kết thúc bằng exit 1 không kèm signal, nên `[killed by signal: …]` chỉ áp dụng cho POSIX. Chỉ lỗi hạ tầng — lỗi spawn và hủy bỏ (`tool call aborted`) — mới sinh ra `isError`.

Dạng thành công chuẩn là `{ kind: 'foreground', ...ShellRunResult }` cho tiến trình foreground đã hoàn tất (chiếu các dữ kiện `sandbox` của executor khi có — `mode`/`denied`, tùy chọn `enforcement`/`runnerFailed`) hoặc `{ kind: 'background', jobId }` cho tác vụ đã phát hành. Renderer giữ chính xác `started background job <id>` cho ack background; bên tiêu thụ theo hướng lập trình dùng các trường có kiểu chứ không phân tích văn bản đã render.

Khi `run_in_background` là true, plugin này tiền kiểm `ctx.jobs.start()` trước khi spawn, đăng ký agent gọi làm owner, và thích ứng handle `ShellProcess` trả về thành các hook cancel/done/xuất tăng dần chung. Runtime tác vụ chịu trách nhiệm về job id, cách ly giữa các phiên, thông báo hoàn tất, chờ đợi và dọn dẹp dispose (giải phóng tài nguyên); plugin này chỉ ánh xạ các dữ kiện thoát của pwsh vào đầu ra tác vụ và chi tiết kết quả. `enableRunInBackground: false` sẽ gỡ bỏ tham số và từ chối các lệnh gọi background cưỡng bức khi thực thi.

## UI presentation

Công cụ sở hữu ý định trình bày `presentCall`/`presentResult` của riêng nó. Lệnh gọi foreground là thẻ `terminal` mang theo lệnh, mô tả và cwd tùy chọn; lệnh gọi `run_in_background` là thẻ `generic` mang lệnh gốc, phản chiếu cách trình bày background của công cụ bash. Kết quả foreground đã hoàn tất cũng là thẻ `terminal`: marker thoát trở thành pill trạng thái thoát của thẻ (`exitCode`/`signal`), phần thân đã gỡ marker trở thành đầu ra của thẻ — hoàn toàn khớp với câu chuyện thẻ terminal của công cụ bash, thông qua bộ phân tích trạng thái thoát dùng chung của `@deepseek-ai/dsh-shell`. Ack background và lỗi thực thi vẫn giữ thẻ `generic`, bọc đầu ra render trong hàng rào `console`. Những presenter này là hàm thuần túy và có thể phát lại.

## Trải nghiệm mô hình

### System prompt

#### Nội dung mô hình nhìn thấy

Mọi request trong phạm vi đăng ký của plugin này đều chứa hướng dẫn pwsh bên dưới. Giới hạn công cụ theo phạm vi có thể ẩn schema, nhưng không gỡ bỏ đoạn được đăng ký độc lập này.

##### Pwsh guidance

```markdown
Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on. On Windows a killed process settles as `[exit code: 1]` without a signal marker; treat a bare exit 1 after an interruption as a termination, not a command failure.
```

#### Ảnh hưởng token

Chi phí đầu vào cố định và nhỏ trên mỗi request trong thời gian plugin được kích hoạt.

#### Ảnh hưởng KV Cache

Tiền tố ổn định khi phạm vi đăng ký và văn bản prompt không đổi. Việc kích hoạt hoặc giải phóng plugin có thể làm mất hiệu lực tái sử dụng của đoạn prompt này.

### Schema công cụ

#### Nội dung mô hình nhìn thấy

Mô hình nhìn thấy [`pwsh` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-pwsh) được sinh ra. Giới hạn công cụ theo phạm vi agent có thể gỡ bỏ định nghĩa dành cho agent đó.

#### Ảnh hưởng token

Chi phí schema cố định trên mỗi request mà công cụ hiển thị.

#### Ảnh hưởng KV Cache

Tiền tố ổn định khi khả năng hiển thị và định nghĩa công cụ không đổi. Thay đổi về giới hạn hoặc cấu hình có thể làm mất hiệu lực tái sử dụng kể từ token thay đổi đầu tiên.

### Kết quả foreground

#### Nội dung mô hình nhìn thấy

Renderer xuất phần đuôi stdout tùy theo dữ liệu, rồi đến `[stderr]` tùy chọn và phần đuôi stderr. Các dòng điều kiện có dạng chính xác là `[output truncated; full output: <path>]`, `[sandbox: file access denied under <mode> mode]` cộng gợi ý nâng quyền `[sandbox: escalation available — …]` (chỉ khi tổ hợp có công khai năng lực nâng quyền), `[timed out after <timeoutMs>ms]`, `[killed by signal: <signal>]` và `[exit code: <exitCode>]` (chỉ với thoát khác 0); thân rỗng được render thành `(no output)`.

#### Ảnh hưởng token

Trước khi gọi thì token kết quả bằng không. Đầu ra của mỗi luồng có giới hạn, còn mỗi dòng đã phát ra sẽ nằm trong lịch sử cho đến khi nén.

#### Ảnh hưởng KV Cache

Chỉ ghi thêm; nội dung mới xuất hiện đi sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache đã có.

### Kết quả background

#### Nội dung mô hình nhìn thấy

Việc khởi động background được render chính xác thành `started background job <id>`; các lần đọc và trạng thái tiếp theo đi qua các công cụ `job_output`/`job_kill` chung, bao gồm thông báo spill khi đọc lossy lúc việc cắt bớt trong bộ nhớ làm mất các byte chưa đọc.

#### Ảnh hưởng token

Ack là một dòng ngắn cố định; đầu ra tác vụ có giới hạn theo từng lần đọc.

#### Ảnh hưởng KV Cache

Chỉ ghi thêm; nội dung mới xuất hiện đi sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache đã có.

### Lỗi công cụ

#### Nội dung mô hình nhìn thấy

Lỗi kiểm tra và lỗi hạ tầng được chuẩn hóa thành `Error: <message>`. Các thông báo ổn định của package này gồm `invalid command: expected a non-empty string`, `invalid description: expected a non-empty string`, `invalid timeoutMs: expected a positive number, got <value>`, `invalid escalation: sandbox_permissions requires a justification`, `invalid escalation: justification is only valid together with sandbox_permissions`, `invalid justification: expected a non-empty sentence`, `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`, các lỗi nâng quyền dùng chung (không rộng hơn một cách nghiêm ngặt, không có service phê duyệt, không có agent để định tuyến, không có kênh phê duyệt, người dùng từ chối, đã hủy), `run_in_background is disabled for this deployment (enableRunInBackground: false)`, `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs` và `tool call aborted`.

#### Ảnh hưởng token

Chỉ những lệnh gọi thất bại mới thêm các token được giữ lại này; lệnh gọi bị hủy không sinh ra đầu ra lệnh.

#### Ảnh hưởng KV Cache

Chỉ ghi thêm; nội dung mới xuất hiện đi sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache đã có.

## Hạn chế đã biết và việc tạm hoãn

- **Chế độ ngôn ngữ và bắt named-pipe dưới sandbox Windows** — Dưới [sandbox Windows ACL](../../sandbox/sandbox-windows-acl/README.md), pwsh read-only sẽ khởi động ở ConstrainedLanguage, vì việc ghi vào thư mục tạm bị từ chối, khiến probe AppLocker của PowerShell thất bại và bị xử lý theo hướng fail-closed: `Add-Type`, các lệnh gọi tĩnh .NET ngoài lõi (`[System.IO.*]::`, `[math]::`), đối tượng COM và reflection đều thất bại với lỗi "only core types", và không thể gỡ chế độ này từ bên trong. Thư mục tạm riêng của workspace-write cho phép probe hoàn tất, nên nó giữ FullLanguage trừ khi chính sách máy chủ quy định khác. Cả hai chế độ hạn chế đều từ chối mở named-pipe, nên việc spawn stdio kiểu pipe bên trong lệnh bị hạn chế sẽ thất bại với EPERM. Mô tả công cụ dạy mô hình hai quy ước này; README của backend chịu trách nhiệm mô tả đầy đủ các hạn chế.
- **Không có shell bền hay PTY** — Mỗi lệnh gọi đều khởi động một `pwsh -Command` hoàn toàn mới; backend PTY hiện chỉ giới hạn ở Linux/macOS, còn shell bền ConPTY trên Windows thuộc công việc trong lộ trình.
- **Quy ước phương ngữ PowerShell** — Mô hình phải viết PowerShell (đường dẫn nguyên bản, biến `$env:`), chứ không phải bash; không có việc dịch phương ngữ.
- **Danh tính cwd phiên không được chuẩn hóa** — Mốc workdir lấy trực tiếp giá trị gốc của cwd trong header phiên, khác với danh tính đã qua chuẩn hóa sandbox-root của công cụ bash. Dưới executor cách ly, gốc workspace của chính sách **sẽ** được chuẩn hóa (do service chính sách dùng chung thực hiện), nên khi cwd phiên gốc khác với dạng đã chuẩn hóa của nó, workdir và gốc cách ly có thể không khớp — khoảng cách parity này để dành giải quyết khi trích xuất phần nền chung cho các công cụ shell.
