# @deepseek-ai/dsh-bash-local

[English](README.md) | Tiếng Việt

Service Provider local cho seam thực thi `@deepseek-ai/dsh-shell`, dựng trên service [`@deepseek-ai/dsh-subprocess`](../../subprocess/subprocess/README.md): `LocalBashExecutor` với mỗi lệnh gọi sẽ spawn `bash -c <command>` như một nhóm tiến trình được quản lý thông qua `ctx.subprocess`, và đảm nhiệm mọi trách nhiệm ở tầng Bash (điền giá trị mặc định lệnh và trần giới hạn, timeout và phân loại hủy, môi trường terminal phù hợp với mô hình, và việc hợp nhất stdout/stderr hướng tới mô hình khi đọc ở background). Cơ chế nhóm tiến trình như output có giới hạn dùng file spill làm phương án dự phòng, dọn dẹp credential, leo thang kill và dispose (giải phóng tài nguyên) do service subprocess đảm nhiệm.

Thư mục gốc của gói export plugin `LocalBashExecutor` mặc định và có tên, cùng `Config` của nó.

## Cấu hình

```yaml
- id: bash
  name: '@deepseek-ai/dsh-bash-local'
  config:
    cwd: /path/to/workspace   # default: process.cwd()
    timeoutMs: 120000          # default foreground timeout
    maxTimeoutMs: 600000       # cap for per-call overrides
    maxOutputBytes: 64000      # per-stream in-memory cap; overflow spills to disk
    maxSpillBytes: 67108864    # per-stream full-output spill cap
    graceMs: 3000              # kill escalation and post-exit pipe-drain grace
```

## Hành vi

- **Mỗi lệnh gọi đều spawn, không giữ trạng thái shell**: mỗi lệnh gọi khởi động một `bash -c` không đăng nhập mới, và không đọc file rc.
- **Mục cấu thành là một lớp, không phải giá trị cuối cùng**: khi có nhà cung cấp settings trong cấu thành, executor này đăng ký [namespace `bash`](../shell/README.md) của năng lực đó với mục ở trên làm base, do đó đoạn của người dùng trong `settings.yaml` sẽ chồng lên trên, và lệnh tiếp theo chạy theo ngân sách mới. Giá trị mà schema không thể xác định (số dương hữu hạn, trần bộ đếm thời gian của `graceMs`) sẽ bị từ chối khi ghi, executor đang chạy giữ lại đoạn khả dụng cuối cùng của nó; khi không có nhà cung cấp, hoặc nhà cung cấp tách rời, cái chạy chính là mục cấu thành.
- **Áp dụng ngân sách cấu hình trên nhóm tiến trình được quản lý**: `resolve()` điền `workdir`/`timeoutMs`/`stdoutMaxBytes` từ cấu hình, mỗi lần spawn đều truyền cho service trần byte tường minh, trần spill và `graceMs`. Khoảng ân hạn này phải là số dương hữu hạn, và không được lớn hơn [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md), để Node có thể biểu diễn nó bằng một bộ đếm thời gian. Việc kết thúc nhóm tiến trình, giải phóng pipe sau khi thoát, giữ đuôi và file spill có giới hạn là cơ chế của [`dsh-subprocess-local`](../../subprocess/subprocess-local/README.md). `ShellExecRequest.stdoutMaxBytes` ở foreground có thể tăng ngân sách bắt stdout cho một lần gọi của bên gọi đáng tin cậy nào đó; stderr và chạy background vẫn dùng `maxOutputBytes`.
- **Phân loại timeout và hủy**: `run()` hợp nhất timeout đã kẹp theo cấu hình với tín hiệu của bên gọi qua cùng một deadline; chỉ timeout của chính executor báo cáo `timedOut`, việc hủy từ upstream báo cáo `aborted`, lệnh tự bị chấm dứt bởi tín hiệu thì không báo cáo cả hai (xem [Agent Note thư viện timeout](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
- **Môi trường terminal phù hợp với mô hình**: `NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` ngăn pager và màu ANSI phá hỏng kết quả. Các giá trị này được hợp nhất như env thông thường, tuân theo quy tắc dọn dẹp credential và kênh `DSH_*` của service; mục tường minh của bên gọi vẫn được ưu tiên. Chi tiết xem [Agent Note stdin/env](../../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md) và [Agent Note môi trường quản lý](../../../.agents/notes/implemented/feature/2026-07-10-agent-session-identity-and-log-location.md).
- **Tiến trình background**: `start()` trả về ngay handle `ShellProcess` đang hoạt động và không áp dụng timeout; `readOutput()` hợp nhất việc đọc stdout/stderr dựa trên offset thành một delta tiêu thụ liên tục, và đặt nó dưới marker `[stderr]` khi có stderr. Tiến trình đang chạy thuộc về service subprocess, có thể sống sót qua việc nạp lại executor, và bị chấm dứt cùng chờ thoát khi service dispose. Job id, quyền sở hữu, polling và thông báo thuộc về [runtime `ctx.jobs`](../../jobs/jobs/README.md) chung, tầng tool sẽ đăng ký handle đó vào đây.

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp qua `dsh-tool-bash`; tool đó render đuôi stdout/stderr có giới hạn của executor này, delta tiến trình background, đường dẫn file spill và lỗi hạ tầng.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; thay đổi tiền tố request do bên tiêu thụ có tên đảm nhiệm.

## Hạn chế đã biết và công việc hoãn lại

- **Bản thân không cung cấp cách ly**: executor này luôn chạy lệnh với quyền của tiến trình harness; triển khai cần cách ly có thể cấu thành [`dsh-bash-sandbox`](../bash-sandbox/README.md), chính sách allow/deny/ask theo từng lệnh gọi thuộc về `tools/pre-execute`.
- **Không có shell hay PTY lâu bền**: mỗi lệnh gọi khởi động một `bash -c` không đăng nhập mới; chỉ giữ lại cwd lâu bền và session terminal tương tác vẫn tiếp tục hoãn lại, đến khi có workflow thực tế cần chúng.
- **Chỉ hỗ trợ POSIX**: binary `bash` đã được hardcode, ngữ nghĩa nhóm tiến trình của service bên dưới cũng là POSIX; không hỗ trợ Windows.
- **Thông báo spawn background thất bại chỉ giao một lần**: service subprocess không buffer output nào cho tiến trình chưa từng thực sự chạy, do đó executor tiêm `spawn failed: …` vào đúng một delta `readOutput()`; bên đọc bỏ lỡ delta đó không thể khôi phục lại.

Quy tắc heuristic dọn dẹp credential và lưu ý giữ lại spill được ghi lại tại [`dsh-subprocess-local`](../../subprocess/subprocess-local/README.md); các cơ chế đó thuộc sở hữu của nó.
