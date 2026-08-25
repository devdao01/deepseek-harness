# Agent Note: Executor PowerShell và tool pwsh

Status: implemented

[English](2026-08-01-pwsh-tool-and-executor.md) | Tiếng Việt

## Vấn đề

Trên mỗi nền tảng, harness chỉ nói một phương ngữ shell duy nhất: `bash`. Máy chủ Windows chỉ có thể chạy nó qua WSL hoặc lớp đệm Git-Bash, còn executor `dsh-bash-local` được ship thì chỉ dành cho POSIX (hardcode `bash`, ngữ nghĩa process group là của POSIX). Lộ trình Windows — để máy chủ mặc định dùng `pwsh`, sau đó mới làm phần render pwsh cho TUI/GUI — không có nền tảng thực thi: không có bản hiện thực PowerShell cho seam executor bash, cũng không có tool hướng model để dạy model phương ngữ PowerShell. Tool bash cũng lớn hơn mức thực sự cần thiết cho hình dung Windows-first — đặc biệt là bản sinh đôi PTY bền vững, một bề mặt mang hình dạng bash mà tool `pwsh` đến nay vẫn không phải gánh. Hình dung tối thiểu ban đầu cũng không có tác vụ chạy nền và nâng quyền sandbox: phần chạy nền đến cùng [quyết định parity](2026-08-02-pwsh-tool-bash-parity.md), còn bề mặt sandbox (render từ chối cộng với nâng quyền `sandbox_permissions`) đến cùng [quyết định Windows ACL sandbox](2026-08-08-windows-acl-restricted-token-sandbox.md) — tool tối thiểu khi đó được cắt gọt theo tư thế Windows danh nghĩa danger-full-access, và tiền đề này chấm dứt khi PR (Pull Request) sandbox bật lại cách ly và phê duyệt trên Windows.

## Quyết định

Thêm hai package mới dưới `packages/shell/`:

- **`@deepseek-ai/dsh-pwsh-local`** — bản hiện thực cục bộ của seam executor `ctx.shell`, dựa trên `ctx.subprocess`, phản chiếu `dsh-bash-local` theo từng lời gọi: `resolve()` lấy mặc định từ config và đặt trần, `run()` hợp nhất timeout bị config kẹp lại với signal của bên gọi qua một deadline, `start()` trả về handle chạy nền theo kiểu tiêu thụ, với process thuộc quyền sở hữu của service subprocess. Chuỗi lệnh được truyền như một tham số argv duy nhất cho `pwsh -NoLogo -NoProfile -NonInteractive -Command`, do PowerShell tự phân tích, không tồn tại tầng trích dẫn shell nào. Việc phân giải file thực thi (`resolvePwshPath`) là một hàm thuần của `(configured, env, platform)`: trước hết là config tường minh, rồi trên Windows dò các vị trí cài PowerShell 7, các mục PATH (đã bóc dấu nháy) và Windows PowerShell 5.1, ngược lại trả về tên lệnh trần `pwsh` để process khi khởi chạy tự phân giải theo PATH.
- **`@deepseek-ai/dsh-tool-pwsh`** — tool hướng model dựa trên `ctx.shell`, với quy ước là phương ngữ PowerShell, phản chiếu `dsh-tool-bash` theo từng lời gọi: chạy foreground và `run_in_background` qua job runtime dùng chung, quản lý môi trường `DSH_*` qua registry [`dsh-shell-env`](../feature/2026-08-02-pwsh-tool-bash-parity.md) dùng chung, cơ chế render marker/cắt bớt của bash (thoát sạch thì không sinh marker), và — kể từ quyết định Windows ACL sandbox — bề mặt render từ chối sandbox cùng nâng quyền `sandbox_permissions`, cộng thêm các quy ước ConstrainedLanguage và named pipe riêng của Windows trong mô tả tool. Quyết định parity đã thay thế phần mô tả tool theo hình dung tối thiểu của Agent Note này.

Độ phủ vitest trên Windows cố ý nằm ngoài phạm vi thay đổi này: kênh Windows CI của repo lo phần build/static gate, độ phủ unit chạy trên Linux, và bộ test của hai package chạy ở đó với `pwsh` thật (runner do GitHub host cài sẵn) hoặc tự bỏ qua khi thiếu. Danh sách loại trừ `windowsUnsupportedPackages` của vitest được thu hẹp từ `packages/shell/*` xuống chỉ những package thực sự cần bash, nhờ đó bộ test pwsh cũng chạy được trực tiếp trên máy dev Windows.

Lộ trình sau quyết định này — để máy chủ Windows mặc định dùng `pwsh` (tắt bash) và phần render pwsh cho TUI/GUI — đã được ghi riêng thành [quyết định mặc định pwsh trên Windows](2026-08-01-windows-pwsh-default.md).

## Phương án thay thế

**Thêm chế độ pwsh vào `dsh-bash-local`.** Bác bỏ: danh tính của một executor chính là shell mà nó spawn; nhồi phương ngữ thứ hai vào cùng một package sẽ nhân đôi bề mặt config (công tắc `shell`) lẫn ma trận test, và những điểm kỳ quặc của mỗi phương ngữ (thông tin signal trên Windows, miền trích dẫn) nên thuộc về tài liệu của chính package tương ứng.

**Thêm tham số phương ngữ vào `dsh-tool-bash`.** Bác bỏ: bản thân quy ước mà model nhìn thấy chính là phương ngữ (đường dẫn, biến, sự thật về exit đều khác nhau), nên tham số phương ngữ hoặc khiến schema thay đổi theo điều kiện, hoặc ép một tool phải dạy hai phương ngữ; cặp sinh đôi độc lập giữ cho quy ước hướng model trung thực — và mang bề mặt dùng chung (chạy nền, sandbox, render) bằng cách phản chiếu chứ không phải bằng bản hiện thực dùng chung.

**Đấu nối ngay vào tổ hợp CLI (giao diện dòng lệnh) được ship.** Bác bỏ: gắn `tool-pwsh` + `pwsh-local` vào `base.cordis.yml` trước khi quyết định mặc định Windows đáp đất sẽ làm thay đổi bảng kê được ship; thay đổi này ship năng lực và điểm đấu nối (dependency của `apps/cli`, project tsconfig), không chuyển đổi bất kỳ mặc định nào.

## Hệ quả

- Seam executor bash có bản hiện thực thứ hai, native cho Windows, với quy ước request/spec nhất quán, nhờ đó các bên tiêu thụ hướng model ngoài `tool-pwsh` (cầu nối hook, plugin trong tiến trình) chạy được PowerShell mà không cần lớp đệm phương ngữ.
- `tool-pwsh` là tool shell Windows-first mà model nhìn thấy: hành vi có thể hoán đổi với tool bash trên các công việc foreground, chạy nền và sandbox hóa — bao gồm nâng quyền `sandbox_permissions` trong cùng lượt qua `ctx.approval` — với phần hướng dẫn prompt phát biểu chính xác quy ước marker, từ vựng từ chối/nâng quyền sandbox, cùng ranh giới ConstrainedLanguage và named pipe.
- Ngữ nghĩa Windows khác biệt tại những chỗ nền tảng khác nhau: kết thúc cưỡng bức báo exit code 1 và không có signal (nên thông tin trạng thái `signal`/`killed` chỉ có trên POSIX), PowerShell xuất ra CRLF, và test chuẩn hóa chúng.
- CLI thêm hai workspace dependency và hai project tsconfig, nhưng không gắn plugin nào — quyết định tổ hợp để dành cho đề xuất mặc định Windows.
