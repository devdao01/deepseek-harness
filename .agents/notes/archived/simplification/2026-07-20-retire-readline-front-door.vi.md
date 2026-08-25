# Agent Note: Loại bỏ front-end readline và ví dụ repl-agent

Status: implemented
Archived: 2026-07-26

[English](2026-07-20-retire-readline-front-door.md) | Tiếng Việt

## Vấn đề

Kho mã đồng thời cung cấp hai front-end terminal tương tác: kênh readline hướng dòng (`@deepseek-ai/dsh-stdio`) và [`@deepseek-ai/dsh-tui`](../feature/2026-07-17-dedicated-full-screen-tui-front-door.md) toàn màn hình. Sau khi TUI được đưa vào, vai trò tương tác của readline đã trở nên thừa — `demo:tui` thay thế `demo:repl` trong trải nghiệm agent lập trình — còn vai trò thực sự còn lại của nó (pipe và tự động hóa) đã được ứng dụng tác vụ một lần `@deepseek-ai/dsh-cli-demo` đảm nhiệm tốt hơn (nhập tác vụ, đầu ra `text`/`json`/`stream-json` nguyên bản của DSH, persistence, xử lý tín hiệu).

Sự trùng lặp này mang tính cấu trúc chứ không chỉ ở bề mặt: `dsh-stdio-demo` mang theo một seam lựa chọn `TerminalMode` (`auto`/`readline`/`tui`), khoảng 1.000 dòng unit test readline, một cú pháp transcript văn bản readline (các dòng `[tool call] …`) đang được kiểm thử khói demo trong CI và hai e2e built-bin dùng grep để khớp, cùng một tổ hợp ví dụ bị đảo ngược: leaf `tui-agent` chủ lực lại được định nghĩa như một include patch lên chính leaf `repl-agent` mà nó thay thế.

## Quyết định

Xóa front-end readline và ví dụ repl-agent; chỉ giữ lại ba nguyên mẫu front-end: **TUI tương tác** (chỉ TTY, fail nhanh khi chạy dưới pipe), **CLI tác vụ một lần** (tác vụ truyền qua `-p`/tham số vị trí, phục vụ pipe và tự động hóa) và **server** (ACP / JSON-RPC).

- `packages/ui/stdio` và `examples/repl-agent` đã bị xóa. `packages/examples/stdio-demo` được đổi tên thành `@deepseek-ai/dsh-tui-demo` (`packages/examples/tui-demo`) và luôn nạp `dsh-tui`; seam `TerminalMode`/`resolveTerminalMode`/`ui.mode` bị xóa theo. Bin từ chối luồng không phải TTY **trước khi** khởi động loader (ngoại lệ ném ra trong giai đoạn tổ hợp bên trong cây Loader chỉ được ghi log theo từng entry chứ không ném lại, nếu không việc khởi động dưới pipe sẽ lắng xuống thành một tiến trình rảnh không có UI thay vì thoát với mã khác 0).
- `examples/tui-agent/cordis.yml` giờ sở hữu tổ hợp lập trình ngay trong file (kiểu include patch đảo ngược đã biến mất); lớp phủ Code Mode của nó include cấu hình nền của chính nó. `examples/cordis-agent` chuyển sang ứng dụng TUI.
- `examples/echo-agent` chuyển sang ứng dụng tác vụ một lần `dsh-cli-demo`; `dsh-cli-demo` bổ sung `-p/--prompt` làm dạng cờ cho một tác vụ đơn (loại trừ lẫn nhau với tham số vị trí).
- Các e2e lập trình có khóa nhưng không liên quan UI (`full-loop`, `coding-task`, `resume`, `compaction`, `todo-write`, `code-mode` cùng harness dùng chung của chúng) được chuyển nguyên trạng từ `examples/repl-agent/tests/` sang `examples/tui-agent/tests/` — chúng lắp ráp toàn bộ stack bằng chương trình và không bao giờ chạm tới UI nào.
- Giao diện chạy `stdio` của trình hướng dẫn SDK đổi thành `tui` (`RunInterface = 'acp' | 'tui' | 'embed'`), đóng góp mục cấu hình `dsh-tui` thay vì `dsh-stdio`; file `index.ts` được sinh ra kiểm tra TTY trước `startSDK`, với cùng lý do fail nhanh trước khi khởi động như bin tui-demo.

### Chiến lược kiểm thử: PTY chỉ dùng cho TUI

Pipe vẫn là môi trường kiểm thử mặc định. Kiểm thử tiến trình con điều khiển bằng PTY **chỉ** được phép khi đối tượng kiểm thử chính là TUI: `examples/tui-agent/tests/tui-keyless-smoke.e2e.ts` (bổ sung kịch bản khởi động lớp phủ Code Mode, thay cho kiểm thử khói qua pipe của repl-agent để trở thành bằng chứng tổ hợp không cần khóa cho lớp phủ này) và kiểm thử khói khởi động PTY tối thiểu trong `examples/cordis-agent` (front-end của nó chính là TUI). Tất cả phần còn lại chuyển sang chạy qua pipe bằng bin tác vụ một lần:

- `examples/echo-agent/tests/echo.e2e.ts` chứng minh việc khởi động Loader + vòng gọi công cụ với mô hình mock thông qua transcript `stream-json`, thay vì khớp các dòng transcript văn bản readline.
- Cổng kiểm thử khói demo trong CI (`scripts/run-gates.ts`, AGENTS.md) chạy `demo:echo --output-format stream-json -p "echo ci smoke"` và phân tích transcript theo cấu trúc.
- Việc TUI từ chối khởi động dưới pipe (thoát khác 0 + gợi ý trỏ sang CLI tác vụ một lần) được bao phủ bởi `apps/cli/tests/built-bin.e2e.ts` (bộ bảo vệ TTY của `dsh` dưới Node thuần); bằng chứng vòng echo dưới Node thuần và bằng chứng fail nhanh khi thiếu cấu hình nằm trong bộ built-bin của `cli-demo`.
- `packages/context/time-context/tests/time-context.e2e.ts` chạy một lượt tác vụ một lần; việc render elapsed qua nhiều lượt vẫn do unit test của nó bao phủ.

## Tổn thất được chấp nhận

- **Hội thoại nhiều lượt qua pipe trong một tiến trình** — kênh readline có thể kịch bản hóa nhiều lượt qua stdin; bin tác vụ một lần chỉ chạy một tác vụ mỗi tiến trình. Tính liên tục nhiều lượt được bao phủ bởi `RESUME_SESSION_ID`/e2e resume và các hội thoại PTY kịch bản hóa của TUI.
- **`ask_user_question` ngoài TTY** — provider readline là hiện thực terminal ngoài TTY duy nhất của `ctx.userInteraction`. Các lần chạy headless hoặc tự động hóa ACP mà mô hình gọi `ask_user_question` sẽ khiến lời gọi công cụ đó thất bại, trừ khi tổ hợp của chúng cung cấp provider tương ứng; Web đã có provider phi terminal được bàn giao.

## Các phương án đã cân nhắc

- **Giữ `dsh-stdio` như một kênh thuần pipe/tự động hóa và chỉ xóa demo repl** — không chọn: vai trò tự động hóa của nó lặp lại `dsh-cli-demo` với các cam kết yếu hơn (transcript phi cấu trúc, phán đoán heuristic để thoát theo EOF, so với một lượt persistence dứt điểm và đầu ra thuần định dạng của bên kia).
- **Viết lại kiểm thử khói qua pipe thành điều khiển bằng PTY** — không chọn: PTY là môi trường dễ dao động và phức tạp hơn, chỉ dành riêng cho đúng một bề mặt mà pipe không thể chứng minh (takeover/khôi phục trên TTY thật).

## Hệ quả

- Một front-end tương tác (TUI), một front-end tự động hóa (CLI tác vụ một lần), hai server; ứng dụng terminal không còn seam lựa chọn chế độ.
- Khoảng 1.000 dòng unit test readline bị xóa cùng hành vi của chúng; cú pháp transcript văn bản readline biến mất khỏi mọi cổng kiểm tra.
- Quyết định này thay thế phần đóng gói của [fold the stdio UI helper](2026-07-04-fold-stdio-ui-helper.md) (gói bị gộp nay đã bị xóa), và sửa đổi tổ hợp được mô tả trong [Agent Note về front-end TUI](../feature/2026-07-17-dedicated-full-screen-tui-front-door.md) (không còn lựa chọn `auto`; `tui-agent` sở hữu tổ hợp lập trình).
