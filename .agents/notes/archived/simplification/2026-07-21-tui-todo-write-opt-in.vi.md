# Agent Note: Ship the TUI without `todo_write`; keep it a one-line opt-in

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-tui-todo-write-opt-in.md) | Tiếng Việt

## Problem

File `cordis.yml` của tui-agent xuất xưởng có nạp `@deepseek-ai/dsh-tool-todo`, mặc định phơi bày `todo_write` cho mô hình. Công cụ này là một tiện ích theo dõi tác vụ, không phải năng lực lập trình cốt lõi như `bash` hay các công cụ hệ thống tệp `read`/`write`/`edit`; phần lớn phiên TUI không bao giờ gọi tới nó, nhưng nạp sẵn khiến danh sách công cụ trong giao thức và system prompt của mỗi lượt đều phình to theo. Trong khi đó, việc render kế hoạch của TUI là hướng sự kiện: `packages/ui/tui/src/index.ts` lắng nghe sự kiện phiên `todo/write`, còn `TodoComponent.render` không trả về gì khi danh sách rỗng, nên entry này vốn đã dung nạp được cả việc thiếu lẫn có mặt công cụ đó, không hề có ràng buộc runtime nào với plugin.

## Decision

File `cordis.yml` của tui-agent không còn nạp `tool-todo`; `todo_write` chuyển thành tùy chọn bật. Cấu hình phủ `code-mode.cordis.yml` kế thừa tổ hợp nền, nên SDK do nó sinh ra cũng không còn chứa `todo_write`. Bật nó chỉ cần một mục cấu hình — thêm `@deepseek-ai/dsh-tool-todo` vào `cordis.yml` (hoặc cấu hình phủ cá nhân trong `~/.dsh`) — sau đó mô hình vẫn ghi lại snapshot `todo/write` của toàn bộ danh sách như cũ, và TUI vẫn render kế hoạch như cũ. Kiểu `TodoItem` và sự kiện `todo/write` vẫn nằm trong `@deepseek-ai/dsh-session`, phần render kế hoạch của TUI cũng giữ nguyên đường nối, nên cả hai nhánh mặc định (tắt) và tùy chọn bật (bật) đều là công dân hạng nhất. Các ví dụ cùng loại acp-agent, headless-agent, jsonrpc-agent vẫn xuất xưởng kèm công cụ này.

## Alternatives considered

**Giữ `todo_write` trong cấu hình TUI mặc định xuất xưởng.** Bác bỏ: đây là tiện ích tùy chọn bật chứ không phải công cụ cốt lõi, nạp sẵn nó sẽ tiêu ngân sách danh sách công cụ và prompt của mỗi lượt cho một tính năng mà đa số phiên đều bỏ qua. Các ví dụ vẫn mang theo nó giữ lại độ phủ tổ hợp thực tế cho plugin.

**Xóa luôn phần render kế hoạch của TUI và các bài kiểm thử todo cùng với mục cấu hình mặc định.** Bác bỏ: yêu cầu là hỗ trợ đồng thời cả trường hợp bật lẫn tắt, mà `TodoComponent` hướng sự kiện vốn đã render kế hoạch với ràng buộc plugin bằng không, nên xóa nó chẳng khác nào vứt bỏ vô ích một năng lực đang dùng được. Thay vào đó, nhánh bật giữ lại phần phủ chuyên biệt.

## Testing

`examples/tui-agent/tests/tui.snapshot.ts` quyết định có nạp `ToolTodo` hay không dựa trên công tắc `enableTodo` theo từng kịch bản: chỉ kịch bản `todo-plan` nạp nó (bằng chứng cho nhánh bật, với `session.jsonl`/`terminal.expected.txt` cố định kế hoạch được render), mọi kịch bản còn lại chạy tổ hợp mặc định không có todo. `tests/harness.ts` biến `ToolTodo` thành một tùy chọn `todo`, và chỉ `tests/todo-write.e2e.ts` bật nó, nên e2e todo có khóa vẫn điều khiển công cụ thật, còn các bộ kiểm thử còn lại giữ nhất quán với ngăn xếp công nghệ xuất xưởng. Bài `tests/tui-keyless-smoke.e2e.ts` không cần khóa khởi động `cordis.yml` thật và không khẳng định gì về todo, nên việc khởi động mặc định không bị ảnh hưởng.

## Consequences

Danh sách công cụ trong giao thức và system prompt của TUI mặc định giảm đi một công cụ; phiên nào muốn theo dõi tác vụ chỉ cần thêm một mục cấu hình plugin. `examples/tui-agent/composition.md` (đã sinh lại) cùng bảng entry leaf của nó không còn liệt kê `tool-todo`, và bản tóm tắt do người duy trì thủ công trong `scripts/gen-doc-graphs.ts` cũng đã bỏ nó. Bản thân gói `@deepseek-ai/dsh-tool-todo` không thay đổi, vẫn được các ví dụ acp/headless/jsonrpc mang theo khi xuất xưởng, nên nhu cầu độ phủ của nó được đáp ứng ở đó. Muốn khôi phục về mặc định thì chỉ cần thêm lại mục cấu hình `cordis.yml` đó và bật lại công tắc tùy chọn trong snapshot/harness.
