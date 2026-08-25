# Agent Note: `dsh migrate`/`dsh upgrade` gieo lượt đầu bằng skill

Status: implemented

Archived: 2026-08-03

[English](2026-07-28-dsh-guided-skill-session-commands.md) | 中文

## 问题

Có hai luồng lặp lại đều bắt đầu bằng việc người dùng tự tay gọi một skill nào đó và trả lời câu hỏi của nó: di trú từ một agent lập trình khác, và nâng cấp checkout hiện tại. Cả hai đều yêu cầu người dùng biết skill đó tồn tại, và gõ `/skill:dsh-migrate` hoặc `/skill:dsh-upgrade` làm lượt đầu tiên của phiên. Một lệnh điểm vào chuyên dụng, nếu có thể đưa người dùng thẳng vào phiên được hướng dẫn đó, sẽ tiết kiệm được bước phát hiện này.

## 决策

`dsh migrate` và `dsh upgrade` khởi động TUI thông thường với một phiên hoàn toàn mới, lượt đầu tiên tự động gọi một skill built-in (`dsh-migrate`, `dsh-upgrade`), hiệu quả tương đương với việc người dùng gõ `/skill:<name>` rồi nhấn Enter.

Việc gieo mầm tái sử dụng đường dẫn skill TUI hiện có, thay vì thêm một đường mới. `createTuiChat` đã có `invokeSkill(name, instructions)` — chính là mã chạy khi gõ `/skill:<name>`, bao gồm cả thông báo "skill không xác định". Bộ khởi chạy truyền tên skill cho TUI qua một khe ngữ cảnh khởi động mới `INITIAL_SKILL_KEY` (`tuiInitialSkill`), nhất quán với `CONFIGURED_AGENT_IDENTITIES_KEY`/`TUI_GOODBYE_MESSAGE_KEY`: `ctx.provide` là kênh duy nhất từ argv của bộ khởi chạy đi vào các plugin được mount bởi Loader. `apply()` của TUI đọc khe đó và gấp vào `config.initialSkill`; sau khi `ui.start()` thành công, `createTuiChat` gọi một lần `invokeSkill(config.initialSkill, '')` khi giá trị đó được thiết lập.

**Độ mới được kiểm soát ở bộ khởi chạy, chứ không phải ở TUI.** `runSkillSession` luôn tạo phiên hoàn toàn mới, và chỉ cung cấp khe đó khi `resumeSessionId === undefined`, do đó khi `dsh --resume <id>` sau này khôi phục phiên đó, nó là một phiên TUI thông thường, không tiêm lại lần nữa. TUI giữ tính tổng quát: nó chỉ gọi một lần skill nhận được khi khởi động.

**`migrate`/`upgrade` không chấp nhận bất kỳ tùy chọn giao diện mặc định nào** (`upgrade` còn có thêm [ngưỡng thử nghiệm](2026-07-31-experimental-subcommand-gate.md) `--experimental`). Chúng không mang `--resume`, `--config` hoặc `-p`; điểm vào phiên mới được hướng dẫn không có gì để khôi phục hoặc cấu hình lại. Bất kỳ tùy chọn giao diện mặc định nào bị rò rỉ đều báo lỗi rõ ràng, nhất quán với mẫu từ chối `web`/`meta` trong adapter Commander. Hai mode dùng chung một discriminant `SkillSessionInvocation` (`mode: 'migrate' | 'upgrade'`); `bin.ts` ánh xạ mode thành `dsh-${mode}`.

Skill `dsh-migrate` được đóng gói sẵn trong `skills/` (bàn giao qua `DSH_BUNDLED_SKILL_DIR`, giống `dsh-upgrade`). Nếu không nói rõ agent nguồn, nó sẽ hỏi trước đó là agent nào (opencode/pi/Claude Code/Codex), rồi ánh xạ từng năng lực — chỉ thị workspace, override cá nhân, skills, hooks, MCP, API/env — sang tương đương DSH tương ứng, và triển khai dựa trên bề mặt thực tế của repo (cầu nối `hooks-claude`/`hooks-codex`, `~/.dsh/{config.yaml,.env,AGENTS.md,skills/}`, `AGENTS.md`/`CLAUDE.md`, `mcporter`); khi một năng lực không có tương đương, nó sẽ nói rõ điều đó.

## 测试

`apps/cli/tests/args.spec.ts` thêm việc định tuyến (discriminant trần) cho `migrate`/`upgrade`, cùng mã thoát 1 cho bất kỳ tùy chọn rò rỉ nào ở mỗi subcommand.

`packages/ui/tui/tests/tui.spec.ts` thêm hai case pseudo-terminal trong khối describe skill hiện có: khi thiết lập `config.initialSkill`, nội dung skill đã render được gửi làm lượt đầu tiên mà không cần người dùng nhập; skill khởi tạo không xác định được báo cáo dưới dạng thông báo và không gửi gì. `runSkillSession` tự nó là một lắp ráp bên trong khối `v8 ignore` module, giống `runTui`/`runMeta`.

Không có bản chụp nhanh PTY không cần khóa: theo phán quyết của maintainer về phạm vi của thay đổi này, độ phủ unit cộng xác minh tương tác đã đủ, và việc gieo mầm đi qua đường render `/skill:` đã có bản chụp nhanh sẵn. Cả hai lệnh đều đã được xác minh tương tác trong tmux từ một cwd tạm: `dsh migrate` tải `dsh-migrate` và hỏi agent nguồn; `dsh upgrade` tải `dsh-upgrade`, skill này đưa vào `dsh-customize` và bắt đầu phát hiện checkout.

## 考虑过的替代方案

**Điền sẵn ô nhập và để người dùng nhấn Enter.** Đã bác bỏ: cần thêm một seam điền sẵn editor mới, và vẫn cần một lần bấm phím. Tự động gửi tái sử dụng `invokeSkill`, đạt được điểm vào một lệnh duy nhất như mong muốn.

**Gieo mầm bằng chỉ thị ngôn ngữ tự nhiên ("dùng skill dsh-migrate...") thay vì `/skill:<name>`.** Bác bỏ ở đây: đường gọi skill theo chữ nghĩa sẽ render nội dung skill vào lượt đầu tiên một cách tất định, hoàn toàn nhất quán với lệnh thủ công, mà không phụ thuộc vào việc mô hình tự chọn tải skill đó.

**Hỗ trợ `--resume` trên `migrate`/`upgrade`.** Đã bác bỏ: chúng là điểm vào hướng dẫn một lần. Phiên được khôi phục là phiên TUI thông thường có thể đến được qua giao diện mặc định `dsh --resume <id>`; tiêm lại skill khi khôi phục sẽ lặp lại lượt đầu tiên.

**Đọc `INITIAL_SKILL_KEY` bên ngoài TUI (giống như `agent-loop` đọc `CONFIGURED_AGENT_IDENTITIES_KEY`), thay vì trong `apply()` của TUI.** Không cần thiết: `initialSkill` là trường `Config` của TUI được tiêu thụ trong `createTuiChat`, do đó gấp khe đó vào cấu hình ngay tại điểm vào TUI có thể đặt nó cạnh các lần đọc runtime khác do bộ khởi chạy nắm giữ (`tuiResumeHost`, `tuiGoodbyeMessage`), và không đụng đến bất kỳ plugin nào khác.

## 后果

Di trú hoặc nâng cấp từ bất kỳ vị trí nào chỉ cần một lệnh duy nhất, và skill hướng dẫn đã được gọi. Khe skill khởi tạo bộ khởi chạy→TUI có thể được tái sử dụng bởi bất kỳ lệnh phiên được hướng dẫn nào trong tương lai; hợp đồng của TUI là "gọi skill có tên này một lần khi khởi động", còn chiến lược độ mới/khôi phục nằm ở phía bộ khởi chạy — nơi sở hữu danh tính phiên. [Lệnh slash skill TUI](2026-07-21-tui-skill-slash-command.md) vẫn là cơ chế đó; note này thêm một lần gọi tự động do bộ khởi chạy điều khiển ở trên nó, không thay thế nó.
