# Agent Note: Ma trận snapshot hook — test output kỳ vọng end-to-end bao phủ cả hai bridge

Status: implemented

Archived: 2026-07-26

[English](2026-07-04-hook-snapshot-matrix.md) | 中文

## Vấn đề

Hook bridge — [`dsh-hooks-claude`](../../../../packages/hooks/hooks-claude) (7 điểm hook Claude Code) và [`dsh-hooks-codex`](../../../../packages/hooks/hooks-codex) (5 điểm Codex) — ánh xạ lệnh hook bên ngoài vào seam chặn của harness. Chúng có bộ spec unit và coverage bao phủ sâu (mỗi nhánh quyết định, mỗi dialect payload, được chạy bằng mock seam), cộng thêm một e2e bị chặn bởi key (`hooks.e2e.ts`, chặn `PreToolUse` thời gian thực thật). Nhưng lớp snapshot transcript đầy đủ — khởi động subprocess `acp-agent` thật, phát lại session đã ghi hình mà không cần key, và diff stdout ACP (Agent Client Protocol) đã chuẩn hóa + log tái lưu bền vững với output kỳ vọng đã commit — chỉ bao phủ một hook duy nhất: việc chặn `UserPromptSubmit` của Claude (`hook-cc-promptsubmit-block`).

Đây chính xác là lớp mà unit test dùng mock về mặt cấu trúc không thể thay thế: nó kiểm chứng việc bridge thật dịch kết quả từ tiến trình hook thật thành quyết định seam thật, sau đó qua giao thức dây tự động hóa và log bền vững để kiểm tra phản ứng của agent loop thật. Một hồi quy trong việc dịch bridge hoặc cấu trúc loop, dù mọi unit test vẫn xanh, sẽ lọt qua ở mọi điểm ngoại trừ điểm hook duy nhất đó; còn với bridge Codex, ví dụ ACP thậm chí không load nó, do đó không có hook Codex nào có thể kích hoạt end-to-end.

## Quyết định

Triển khai gồm hai phần liên kết với nhau:

### 1. Ví dụ ACP load đồng thời cả hai bridge hook

`examples/acp-agent/cordis.yml` và `cordis.snapshot.yml` giờ load đồng thời `dsh-hooks-codex` và `dsh-hooks-claude`, mỗi cái trỏ đến file cấu hình riêng (Claude dùng `./hooks.json`, Codex dùng `./codex-hooks.json` — hai phương ngữ không thể dùng chung một file). Đây là một thay đổi giao diện sản phẩm thật, không chỉ để phục vụ test: ACP server đã giao (cũng như entry point `demo:acp`) giờ mang theo cả hai bridge.

Điều này an toàn, vì bridge sẽ **im lặng không làm gì (no-op)** khi file cấu hình không tồn tại: `apply()` bắt lỗi đọc, ghi log qua `ctx.logger`, không đăng ký gì cả — không listener, không sự kiện session. Ứng dụng `acp-agent` không đi kèm stdout logger, nên cảnh báo không đến được kênh ACP JSON-RPC. Các kịch bản chỉ cần hook Claude (hoặc project thật) chỉ cần cung cấp `hooks.json`; bridge Codex không tìm thấy `codex-hooks.json` sẽ tự động biến mất. Điều này đã được xác minh bằng thực nghiệm: khi cả hai bridge cùng load, mọi snapshot hiện có (đều không kèm `codex-hooks.json`) khớp từng byte.

Load đồng thời là yêu cầu tối thiểu để lớp snapshot có thể kiểm chứng mỗi phương ngữ trên cùng một ứng dụng thật đã giao cho sản phẩm. Việc ghi hình (khởi động `cordis.yml`) tự nhiên load cả hai, phát lại kế thừa theo cùng cách: `cordis.snapshot.yml` là overlay kiểu include của `cordis.yml`, chỉ thay thế entry llm (xem [cấu hình phát lại acp-agent từ một nguồn duy nhất](2026-07-04-single-source-acp-replay-config.md)), do đó bridge được thêm vào cây runtime sẽ xuất hiện trong cây phát lại mà không cần chỉnh sửa lần thứ hai.

### 2. Mỗi điểm hook × kết quả chính của nó có một kịch bản snapshot, bao phủ cả hai phương ngữ

Tổng cộng 13 kịch bản trong `examples/acp-agent/tests/snapshots/`, đặt tên theo dạng `hook-<dialect>-<point>-<outcome>`:

- **Viết tay, không có lượt model** (không cần key, không cần sidecar — script phát lại được suy ra rỗng; so sánh lượt `rejected` mang sự kiện `hook/*`): `hook-cc-promptsubmit-block`, `hook-codex-promptsubmit-block`.
- **Ghi hình từ API thật, hook hoạt động trong lúc ghi hình** (phản ứng của model với quyết định là một phần của transcript đã bắt được, sau đó phát lại không cần key): `hook-{cc,codex}-promptsubmit-context` (allow + gộp additionalContext), `hook-cc-pretool-deny` / `hook-codex-pretool-block` (deny → kết quả tool `isError`), `hook-cc-pretool-ask` (ask → hạ cấp thành deny kèm lý do yêu cầu phê duyệt), `hook-{cc,codex}-posttool-block` (chặn kèm feedback), `hook-{cc,codex}-posttool-context` (accept + additionalContext), `hook-{cc,codex}-stop-continue` (hook Stop có tính chặn ép buộc thêm một bước thông qua steering).

Mỗi lệnh hook chỉ xuất ra chuỗi literal cố định (không timestamp/pid/`$RANDOM`/lặp lại cwd); bộ chuẩn hóa snapshot sẽ xóa trường duy nhất không ổn định mà `hook/result` mang theo (`durationMs`). Kịch bản `Stop` tự giới hạn bằng file đánh dấu (`.stop_fired`), để force-continue không lặp vô hạn — guard chống lặp `stop_hook_active` vẫn là một `TODO` của bridge, do đó hook Stop không điều kiện sẽ force-continue ở mỗi bước.

Kịch bản chặn `PostToolUse` tự giới hạn tại đúng cơ chế mà nó chứng minh. Hook Claude lưu bền vững một đánh dấu workspace sau lần từ chối đầu tiên, do đó cho phép một lần gọi khôi phục; prompt Codex khởi tạo một lần gọi và báo cáo kết quả inject. Mỗi output kỳ vọng cố định đúng một lần gọi bị chặn, không lặp lại vòng chặn/thử lại.

### Ba điểm hook cố ý bị loại khỏi ma trận snapshot

Được phát hiện trong quá trình xây dựng ma trận, được ghi lại ở đây vì các thiếu sót này là quyết định chứ không phải sơ suất:

- **`SessionStart` và `SubagentStart`** inject ngữ cảnh thông qua `void runPoint(...).then(agent.inject())` tách rời và cố gắng hết sức, không gắn với lượt nào. `context/message` sinh ra sẽ chạy đua với công việc mà nó lẽ ra phải đi trước (request model đầu tiên / lượt đầu tiên của item con) và rơi vào vị trí log không xác định. Output kỳ vọng đã ghi lại thậm chí không thể tái hiện trong chính lần phát lại của nó — kiểm tra độ ổn định phát lại 10 lần cho cả hai đều cho kết quả 10/10 lần thất bại. Chúng tiếp tục nằm trong coverage unit của bridge, nơi trực tiếp thao tác seam mà không có race điều kiện thời gian. (Nếu trong tương lai việc inject được đổi thành gắn với lượt và có tính xác định — hướng mà `TODO(session-start-gating)` chỉ ra — chúng có thể chấp nhận snapshot test.)
- **`SubagentStop`** chỉ quan sát: handler `subagent/end` của nó không truyền lượt (do đó không có sự kiện log `hook/*`), cũng không thực hiện inject. Nó không ghi gì vào transcript, do đó output kỳ vọng sẽ giống hệt từng byte với lần chạy không có hook, không bao giờ chứng minh được thất bại — một guard không cắn trúng vấn đề. Nó tiếp tục do coverage unit chịu trách nhiệm (`bridge.spec.ts` đã khẳng định lệnh gọi chỉ mang tính quan sát).

Vì vậy, ma trận này bao phủ mọi điểm hook có dấu vết transcript xác định, có thể quan sát được, trên cả hai phương ngữ.

## Hậu quả

- Giờ đây, mỗi ánh xạ seam bridge có transcript quan sát được trong cả hai dialect đều được bảo vệ ở lớp transcript đầy đủ trên ứng dụng thật — kể cả bridge Codex trước đây hoàn toàn không có coverage end-to-end. Output kỳ vọng đã ghi lại phản ứng thật của model đối với lượt bị từ chối/bị chặn/bị ép tiếp tục, trong khi transcript viết tay chỉ có thể đoán mò phản ứng đó.
- Kịch bản chặn `UserPromptSubmit` có thể viết mà không cần key (không có lượt model); các kịch bản còn lại phát lại không cần key từ fixture đã ghi hình. `pnpm run test:snapshot:record` sinh lại fixture kiểu ghi hình từ API thời gian thực, và tự bỏ qua khi thiếu key giống mọi kịch bản ghi hình khác.
- Nguyên tắc "chứng minh sẽ chuyển đỏ khi có lỗi" vẫn đúng: can thiệp vào output cấu hình hook (ví dụ đổi lý do từ chối) sẽ khiến kịch bản tương ứng chuyển đỏ khi phát lại — tiến trình hook chạy thật trong lúc phát lại (chỉ có model được phát lại), do đó output kỳ vọng bảo vệ đường dẫn hook→seam→loop thực tế, chứ không phải mock của nó.
- Ví dụ `acp-agent` giờ load một bridge Codex mà thông thường sẽ no-op (project điển hình không có `codex-hooks.json`), đây chính xác là hành vi thất bại mềm dẻo như mong đợi, không phải cái giá phải trả.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
