# Agent Note: pwsh UI presentation matches bash

Status: implemented

[English](2026-08-05-pwsh-ui-bash-parity.md) | Tiếng Việt

## Problem

[Quyết định căn chỉnh pwsh với bash](../../implemented/feature/2026-08-02-pwsh-tool-bash-parity.md) đã khiến `dsh-tool-pwsh` có hành vi hoán đổi được với bash về mặt thực thi, marker và tác vụ nền, nhưng đã cố tình hoãn lại một nửa hướng tới con người: một lệnh gọi pwsh foreground hoàn tất được hiển thị dưới dạng thẻ `console` fenced chung chung, trong khi lệnh gọi hoàn tất của công cụ bash được hiển thị dưới dạng thẻ terminal kèm pill trạng thái exit đã phân tích. Lộ trình chịu trách nhiệm xử lý khoảng trống này ([Windows chuyển sang dùng pwsh làm mặc định](../../implemented/feature/2026-08-01-windows-pwsh-default.md)) đã liệt kê "render TUI/GUI cho pwsh" là giai đoạn 2, nhưng gói TUI đã bị gỡ bỏ, khiến bề mặt Web trở thành UI duy nhất bị ảnh hưởng bởi khoảng trống này.

## Decision

`presentResult` của `dsh-tool-pwsh` giờ đây phản chiếu `dsh-tool-bash` theo từng lệnh gọi: kết quả foreground hoàn tất là một thẻ `terminal`, phần thân output là văn bản đã render sau khi loại bỏ marker, pill trạng thái exit là `exitCode`/`signal` đã phân tích; các ack nền và kết quả `isError` vẫn giữ thẻ `console` fenced chung; kết quả không phải một khối văn bản đơn vẫn giữ nguyên (`undefined`).

Việc phân tích được chia sẻ chứ không sao chép: `parseExitStatus`/`ParsedExitStatus` được di chuyển từ module render riêng tư của `dsh-tool-bash` sang gói Service Definition `@deepseek-ai/dsh-shell` (được export bởi index của gói này), và `render.ts` của `dsh-tool-bash` re-export lại nó, giúp phía tiêu thụ của source plane vẫn chỉ có một gốc import duy nhất. Bộ render của cả hai công cụ đều phát ra cùng một marker `[exit code: N]` / `[killed by signal: X]`, do đó một hàm phân tích ngược do Service Definition sở hữu sẽ không bao giờ trôi dạt giữa hai bản song sinh — cùng hình thái "chia sẻ chứ không sao chép" như [phần trích xuất shell-env](../../implemented/feature/2026-08-02-pwsh-tool-bash-parity.md) đã áp dụng khi xử lý registry `DSH_*`.

Bản thân thẻ trong Web UI không cần bất kỳ đoạn mã nào viết riêng theo từng công cụ: cầu nối thẻ terminal phía client (`terminal-card-model` của `dsh-client-ui-conversation`) ánh xạ bất kỳ view kết quả `card: 'terminal'` nào, nên thay đổi ở presenter của pwsh chảy thẳng qua cùng đường render mà bash đã có sẵn. Có một mục phân loại phía client cho dòng công cụ đã thu gọn: `classifyTool('pwsh')` giờ được xếp vào dòng thuộc họ shell (variant `bash`, có tiêu đề riêng `Pwsh`), thay vì dòng "Tool call" chung chung `others`. Một kênh trình duyệt keyless (`apps/web/tests/pwsh-terminal.e2e.ts`) dựng sẵn một session mà lệnh gọi/kết quả pwsh của nó được hiển thị bởi công cụ thật khi replay (api-proxy tính lại view từ nội dung args/result đã ghi lại), và ghim golden của thẻ terminal, bao gồm cả pill exit và chấm trạng thái chạy.

## Alternatives considered

**Import `parseExitStatus` từ `@deepseek-ai/dsh-tool-bash/src/render.ts`.** Bị bác bỏ: import workspace vẫn giữ tham chiếu ngoài trong artifact build, nên `tool-pwsh` sẽ thêm một phụ thuộc runtime cứng mới tới `tool-bash` trong mọi closure tiêu thụ (kể cả những tổ hợp cố tình chỉ gắn bản song sinh pwsh, không gắn bash), và việc một công cụ anh em phụ thuộc vào bản song sinh của nó chỉ vì một hàm sẽ đảo ngược quan hệ giữa các gói. Việc di chuyển seam đặt quy ước chia sẻ vào gói mà cả hai công cụ vốn đã phụ thuộc.

**Tạo mới một gói presentation chuyên dụng (ví dụ `@deepseek-ai/dsh-shell-present`).** Bị bác bỏ: tạo gói mới cho một hàm thuần túy phải trả giá bằng manifest (danh sách siêu dữ liệu), tái tạo module-graph/thư mục, và nội dung README; `@deepseek-ai/dsh-shell` đã nằm trong closure của cả hai công cụ, và đã sở hữu sự kiện `ShellRunResult` mà việc phân tích lại này tái dựng.

**Sao chép phần phân tích vào module render của `tool-pwsh` (bản song sinh thứ ba).** Bị bác bỏ: quy ước văn bản bị sao chép sẽ trôi dạt nếu không có triển khai dùng chung ([căn chỉnh pwsh với bash](2026-08-02-pwsh-tool-bash-parity.md)); việc phân tích và phát marker phải cùng tiến hóa ở cùng một chỗ, và chính việc phân tích là quy ước mà pill UI phụ thuộc vào.

## Consequences

- Các tổ hợp Windows dùng `dsh-tool-pwsh` giờ đây hiển thị lệnh gọi shell trong Web UI hoàn toàn giống với lệnh gọi bash: thẻ terminal có header cwd, output thô, pill trạng thái exit, chấm trạng thái chạy, và xử lý lỗi màu đỏ khi exit khác 0.
- `parseExitStatus` trở thành một phần của quy ước công khai của `@deepseek-ai/dsh-shell`; `dsh-tool-bash/src/render.ts` tiếp tục re-export nó, phía tiêu thụ công cụ bash không cần thay đổi gì.
- Giai đoạn 2 của lộ trình được thu hẹp: TUI đã bị gỡ bỏ (EOL), thẻ terminal tương ứng giờ đã được giao trên bề mặt Web. Tổ hợp mặc định Windows (giai đoạn 1) vẫn là giai đoạn chưa hoàn tất.
- Kiểm chứng: `dsh-shell` có các trường hợp biên phân tích dưới cổng độ phủ theo từng file; bộ test presenter của `tool-pwsh` phản chiếu bộ của `tool-bash` (khứ hồi sạch/khác 0/signal/timeout, output giống marker, thẻ chung nền/lỗi, fallback đa khối); bộ test row-model phía client ghim dòng họ shell `Pwsh`; kênh web `pwsh-terminal` là kịch bản keyless đã được lắp ráp.
