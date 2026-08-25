# Agent Note: Parity giữa tool pwsh và bash

Status: implemented

[English](2026-08-02-pwsh-tool-bash-parity.md) | Tiếng Việt

## Vấn đề

`dsh-tool-pwsh` được ship trong nền tảng native Windows đầu tiên là một hình dung cố ý tối thiểu — chỉ foreground (mỗi lời gọi khởi động một process mới; không có session PTY bền vững), môi trường được quản lý chỉ gồm ba khóa `DSH_*` hardcode, và một câu chuyện marker lệch khỏi tool bash mà không hề khai báo («luôn in `[exit code: N]`»). Quy ước mà model nhìn thấy đã tách rời khỏi bản hiện thực: phần mô tả hứa hẹn một báo cáo đường dẫn spill mà renderer chưa bao giờ thực thi, README công bố những export không tồn tại và phần render mà tool không làm, còn chính test của tool thì đóng đinh hành vi lỗi. Hình dung tối thiểu cũng khiến seam contributor `DSH_*` bị trùng lặp do vắng mặt: plugin đóng góp sự thật môi trường vào `ctx.shellEnv` hoàn toàn vô tác dụng với các lời gọi pwsh.

## Quyết định

`dsh-tool-pwsh` giờ phản chiếu `dsh-tool-bash` theo từng lời gọi, và phần văn bản mà model nhìn thấy mô tả chính xác hành vi này:

- **Hành vi render hoàn toàn giống bash**: stdout, đoạn `[stderr]` có đánh dấu, thông báo cắt bớt kèm đường dẫn spill, thân rỗng render thành `(no output)`, marker exit chỉ dành cho exit khác không — thoát sạch thì không sinh marker. Phần mô tả và phần prompt `tool:pwsh` phát biểu chính xác điều này («Non-zero exits are reported as `[exit code: N]` markers»), cố ý không sao chép cách diễn đạt «every result» trong prompt của bash vốn mâu thuẫn với chính phần render của nó.
- **`run_in_background` được đấu nối qua job runtime dùng chung**, hoàn toàn giống tool bash: tiền kiểm, đăng ký owner, điều khiển `job_output`/`job_kill` và cùng một ánh xạ kết quả. Đằng sau đó là handle `start()` mà `pwsh-local` đã phản chiếu sẵn từ trước.
- **Môi trường `DSH_*` được dùng chung chứ không sao chép**: `ShellEnvRegistry` chuyển từ `dsh-tool-bash` sang package mới, không phụ thuộc tool, là `@deepseek-ai/dsh-shell-env` (`ctx.shellEnv` + các sự thật dựng sẵn + bên đóng góp lưu trữ bền vững theo session), và cả hai tool shell đều tiêm nó vào. Bên đóng góp đối xử với lời gọi pwsh y hệt lời gọi bash; do đó, quyền sở hữu môi trường dùng chung không thuộc về bất kỳ tool shell hướng model nào.
- **Thực tế Windows được đóng đinh ở những chỗ bash không có tương ứng**: mỗi lệnh chạy dưới một đoạn mã nạp trước đặt output UTF-8, để bản dự phòng Windows PowerShell 5.1 không phá hỏng output phi ASCII qua collector giải mã bằng UTF-8; prompt nêu rõ việc kết thúc cưỡng bức trên Windows quyết toán bằng exit 1 và không sinh marker signal.
- **Ngoài phạm vi, không đổi**: shell PTY bền vững (backend chỉ có trên Linux/macOS; ConPTY thuộc lộ trình). Nâng quyền sandbox được ship sau cùng [quyết định Windows ACL sandbox](2026-08-08-windows-acl-restricted-token-sandbox.md) — tool pwsh giờ mang bề mặt render từ chối sandbox và nâng quyền `sandbox_permissions` trong cùng lượt, cộng thêm quy ước ConstrainedLanguage của Windows trong phần mô tả của nó. Thẻ terminal riêng cho pwsh kèm pill exit đã được ship riêng cùng quyết định [parity trình bày UI pwsh với bash](2026-08-05-pwsh-ui-bash-parity.md).

## Phương án thay thế

**Giữ hình dung tối thiểu, chỉ sửa phần khai báo.** Bác bỏ: quy ước văn bản sao chép từ bash sẽ trôi dạt khi thiếu bản hiện thực tương ứng; tool tối thiểu cộng với khai báo chính xác vẫn khiến lời gọi pwsh không có thực thi nền, không có sự tương đương cho contributor, và để lại một câu chuyện marker lệch chuẩn mà lần nào cũng phải biện hộ lại.

**Từ chối phương ngữ executor không khớp ngay lúc load.** Đã thử và rút lại trước khi merge: thêm nhãn `ShellDialect` (`bash` | `powershell`) vào `ShellExecutor`, hai tool shell sẽ ném lỗi khi executor được gắn nói phương ngữ khác. Cách này ép mọi bản hiện thực executor — kể cả mọi fake trong test và ví dụ — phải khai báo dialect, thêm nhiễu cho mọi test tool shell chỉ vì một lan can bảo vệ mà cả trong repo lẫn trong các cách triển khai hợp lý đều không có mục tiêu nào để chặn (tổ hợp được ship luôn ghép tool-pwsh với `dsh-pwsh-local`, tool-bash với `dsh-bash-local`). Quy ước ghép đôi được chuyển sang ghi trong README của từng tool.

**Trích xuất một nền chung hoàn toàn dùng chung cho bản hiện thực tool (trừu tượng hóa phương ngữ shell, hai lá mỏng).** Đã cân nhắc rồi hoãn: việc trích xuất shell-env và phản chiếu cấu trúc (cặp sinh đôi `render.ts`/`background.ts`) chính là nền móng mà nó cần đứng lên; chưa làm nền chung đầy đủ chừng nào chưa xuất hiện phương ngữ thứ ba hoặc cặp sinh đôi PTY bền vững để hình thái của trừu tượng hóa trở nên quan sát được.

## Hệ quả

- Tool bash và pwsh có hành vi hoán đổi được trên các công việc shell foreground, chạy nền và sandbox hóa (bề mặt sandbox đến cùng quyết định Windows ACL sandbox), và mỗi câu trong prompt/mô tả của pwsh đều có renderer chống lưng — bài kiểm tra «grep đối chiếu với mã nguồn» của reviewer đã pass.
- Việc căn chỉnh cũng từng diễn ra theo chiều ngược lại một lần: cơ chế hủy foreground có cấu trúc của tool pwsh (`HarnessError('tool call aborted', TOOL_ABORTED)`, với name là `AbortError`) được chuyển ngược về tool bash, thay thế `Error('command aborted')` không mã lỗi của nó — đây là thay đổi mà model nhìn thấy và được ghi log, được đóng đinh bằng test kiểm tra hình dạng chính xác ở cả hai phía và fixture cancel-tool-calls (dữ liệu chuẩn bị cho test).
- `@deepseek-ai/dsh-shell-env` trở thành package mới được ship; config `dshHome` của `dsh-tool-bash` chuyển sang đó, nên tổ hợp nào gắn tool shell cũng phải gắn `shell-env` (các package tổ hợp ở nhánh chính đã làm vậy).
- Ngữ nghĩa riêng của Windows (chuẩn hóa CRLF, kết thúc cưỡng bức exit-1/signal-null, tự gửi signal chỉ có trên POSIX) vẫn được test đóng đinh như trước.
- Cổng kiểm tra độ phủ theo từng file của tool pwsh do bộ test executor fake có thể viết kịch bản (`tests/tools.spec.ts`) đảm nhiệm; bộ test tích hợp với pwsh thật và bộ test tổ hợp Loader tự bỏ qua trên máy chủ không có `pwsh`, nhất quán với cách phân công của bộ test bash.
- Giai đoạn parity trong đề xuất lộ trình đã được ship; giai đoạn trình bày thẻ terminal được ship cùng quyết định [parity trình bày UI pwsh với bash](2026-08-05-pwsh-ui-bash-parity.md) (bản thân TUI đã bị gỡ bỏ), và giai đoạn còn lại là tổ hợp mặc định trên Windows.
