# Agent Note: dsh cho agent biết vị trí source code của chính nó

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-dsh-system-prompt-source-path.md) | 中文

## Problem

CLI `dsh` là một giao diện tự tham chiếu (self-referential): bộ công cụ `cordis` của nó cho phép agent (tác nhân) xem và chỉnh sửa chính runtime harness (khung tác nhân) mà nó đang chạy trên đó. Nhưng trước đây agent không có cách nào biết source code này nằm ở đâu trên đĩa. `dsh` thường được gắn vào PATH dưới dạng symlink, và được khởi chạy từ bất kỳ working directory nào (dự án đang được xử lý), do đó cả cwd lẫn `argv` đều không thể tin cậy để trỏ đến thư mục checkout của harness. Thiếu đường dẫn này, việc "đọc source code của chính mình" chỉ có thể dựa vào phỏng đoán.

## Decision

Launcher `dsh` (`apps/cli/src/tui.ts`) tính toán thư mục gốc checkout của harness từ module URL của chính nó — `fileURLToPath(new URL('../../..', import.meta.url))`, đi lên ba cấp từ `apps/cli/{src,lib}` — do đó bất kể `dsh` được khởi chạy bằng cách nào (symlink trong PATH, cwd bất kỳ), nó vẫn có thể phân giải ra vị trí source thật. Sau khi `boot()` đưa cây plugin vào đúng vị trí, launcher gọi một helper mới từ `dsh-app-boot`, `addHarnessSourceSection(ctx, sourceRoot)`, hàm này đăng ký một đoạn prompt toàn cục `harness:source` với nội dung `Your own source code is the checkout at <path>; you can read it there to learn how dsh works and how to extend it.`. Đoạn này có order là `-99`, ngay sau phần mở đầu về danh tính harness (`-100`) và trước persona triển khai (`0`).

Logic có thể test được đặt trong `dsh-app-boot` thay vì `apps/cli`, vì `apps/*` không chịu ràng buộc của cổng độ phủ (coverage gate), còn `packages/*` thì có. Việc phân giải service `systemPrompt` tùy chọn, đăng ký đoạn prompt đó, trả về disposer (bộ giải phóng tài nguyên) — tất cả những việc này thuộc phạm vi mà độ phủ 100% theo từng file có hiệu lực; launcher chỉ giữ lại lớp keo mỏng đó — tính toán đường dẫn, gọi helper — được bao phủ bởi e2e PTY của CLI. Khi cây plugin đã dựng không có service `systemPrompt`, helper này là một no-op trả về `undefined`.

## Scope

Chỉ CLI `dsh` mới thêm đoạn prompt này. Các demo bin (`dsh-cli-demo`, `dsh-acp-demo`) khởi động nguyên trạng cây plugin đã commit của chúng, không nhận đoạn source: chúng không phải là giao diện tự chỉnh sửa, và thư mục checkout của chúng cũng không phải là một sự thật mà model cần biết.

## HMR

Đoạn này được đăng ký gắn với fiber của chính service `systemPrompt` đã dựng (qua `ctx.get('systemPrompt')`), do đó việc reload HMR (hot module replacement) ở môi trường dev đối với plugin system-prompt sẽ làm mất nó cho đến lần boot tiếp theo. HMR ở môi trường production theo dõi cấu hình chứ không phải artifact build lib, vì vậy đây chỉ là một khiếm khuyết nhỏ giới hạn ở môi trường dev, có thể chấp nhận được.

## Alternatives considered

**Đăng ký đoạn này bên trong constructor của service system-prompt.** Như vậy nó sẽ xuất hiện trong mọi deployment, chứ không chỉ CLI tự tham chiếu, và thư mục gốc source sẽ phải đi xuyên qua cấu hình mới tới được constructor. Đường dẫn này là một sự thật của launcher, nên launcher phải chịu trách nhiệm tiêm nó vào.

**Giữ toàn bộ việc này trong `apps/cli/src/tui.ts`.** apps không chịu ràng buộc của cổng độ phủ, do đó logic đăng ký và nhánh thiếu service sẽ được phát hành ở dạng chưa được test. Việc tách helper đã được test ra `dsh-app-boot` giữ cho cổng kiểm soát có hiệu lực; phần keo của launcher được diễn tập bởi bài smoke test PTY không cần key của CLI.

**Thêm một key cấu hình cordis.yml mới cho đường dẫn này.** Đường dẫn này không phải là một lựa chọn triển khai (deployment) — về mặt cơ chế nó chính là vị trí của bản thân launcher. Một key cấu hình sẽ dẫn đến một đường dẫn điền tay bị lỗi thời, và thêm một nút điều khiển không có không gian thay đổi hợp lý.

**Phân giải từ `process.cwd()` hoặc `process.argv[1]`.** cwd là dự án của người dùng, còn symlink trong PATH sẽ khiến `argv[1]` trở thành đường dẫn của chính symlink đó; `import.meta.url` là chỗ bám duy nhất nắm được vị trí source thật.

## Consequences

Prompt hệ thống của agent giờ đây sẽ nêu rõ thư mục checkout của chính nó, do đó bộ công cụ `cordis` không cần một bước khám phá nào để có thể đọc và chỉnh sửa source của harness. `dsh-app-boot` thêm một dependency chỉ-về-kiểu (type-only) tới `dsh-system-prompt` cho việc declaration merging của `ctx.get('systemPrompt')` (peer dependency (dependency ngang hàng) + dev, nhất quán với mẫu type import có side-effect của package acp); không có dependency runtime nào. Đoạn này là văn bản model có thể nhìn thấy, được ghim nguyên văn trong unit test của app-boot, và được khẳng định end-to-end qua bài smoke test PTY không cần key của CLI — bài test này khởi động `dsh` với cấu hình đã viết kịch bản, chạy một turn (lượt), rồi đọc lại đường dẫn từ prompt hệ thống `request/header` đã được lưu bền vững. Dòng này nằm trước nội dung thay đổi theo từng request, nên nó không gây xáo trộn KV Cache giữa nhiều turn.
