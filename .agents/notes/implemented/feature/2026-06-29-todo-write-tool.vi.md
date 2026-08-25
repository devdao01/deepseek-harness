# Agent Note: tool `todo_write` — đưa danh sách công việc của model thành trạng thái phiên theo mô hình event sourcing

Status: implemented

[English](2026-06-29-todo-write-tool.md) | Tiếng Việt

## Vấn đề

harness cung cấp cho model tool bash và subagent, nhưng không có cách nào để ghi lại danh sách công việc có cấu trúc. Danh sách todo phục vụ hai mục đích quan trọng ngang nhau: dẫn dắt model lập kế hoạch cho công việc nhiều bước và giữ rõ công việc đang hoạt động hiện tại; đồng thời cung cấp danh sách tiến độ theo thời gian thực cho host tương tác. Mọi agent (tác tử) coding tham khảo đã khảo sát, gồm claude-code, opencode, codex, oh-my-pi và pi, đều có một dạng chức năng nào đó như thế này; harness này trước đây thì không.

## Quyết định

Thêm một tool hướng model mới `todo_write(todos: [{ content, status }])`, trạng thái toàn danh sách của nó được lưu như một biến thể `todo/write` mới trong `SessionEventMap` trên log phiên theo mô hình event sourcing. Host tương tác render từ các sự kiện bền vững: TUI gấp gọn nó trực tiếp, web client chiếu nó vào `ConversationSnapshot.todos` ([hiển thị todo trên web](2026-07-23-web-todo-display.md)), còn [lớp cầu nối ACP (Agent Client Protocol) chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) có chủ đích bỏ qua việc hiển thị todo.

### Thay thế toàn danh sách, status ba trạng thái

Mỗi lần gọi, model gửi toàn bộ danh sách; danh sách mới thay thế danh sách cũ (last-write-wins khi replay). Đây là hình dạng chung mà claude-code V1, opencode và `update_plan` của codex đều dùng, cũng là hình dạng model được huấn luyện nhiều nhất — không có id từng mục, không có giao thức delta. `status` chính xác là `pending | in_progress | completed`, cùng bộ ba với `update_plan` của codex; khi bridge còn chiếu danh sách todo thành update `plan`, nó cũng khớp 1:1 với `PlanEntryStatus` của ACP, ánh xạ đó đã nghỉ hưu cùng [quy ước ACP chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md).

### Trạng thái nằm trên log phiên, không phải trong dịch vụ

Danh sách được thêm vào log dưới dạng sự kiện `todo/write`, mang theo snapshot đầy đủ `{ todos }`. harness theo mô hình event sourcing — lịch sử LLM (mô hình ngôn ngữ lớn), lệnh gọi tool và cấu trúc turn đều nằm trên log — nên danh sách todo cũng nằm ở đó. Điều này miễn phí có được tính bền vững, replay và tái tạo khi khôi phục: phiên được mở lại sẽ suy ra lại kế hoạch hiện tại từ `todo/write` gần nhất mà "sau nó không có `turn/start` muộn hơn" ([vòng đời dòng kế hoạch](2026-07-28-todo-plan-clears-on-next-turn.md)), không cần backend bền vững riêng, không cần dịch vụ in-memory khôi phục lại trạng thái, không cần đấu nối thêm. (Một dịch vụ trong bộ nhớ `ctx.todos` sẽ cần phát minh lại toàn bộ những điều trên.) (Bên tiêu thụ full log nhận trực tiếp bản tái tạo này; cửa sổ phân trang của web client thì nhận từ một projection do host tính toán trên trang cuối history — xem [chú thích hiển thị todo trên web](2026-07-23-web-todo-display.md).)

### Không phải sự kiện surface

`todo/write` có chủ đích bị loại khỏi `SurfaceEventType`. surface là projection tạo ra lịch sử tin nhắn LLM (`deriveMessages()`); việc ghi todo không tạo ra tin nhắn hội thoại. Vì vậy nó không mang `surfaceOp`, không gia nhập surface có thứ tự, không đi vào `deriveMessages()` — nó là trạng thái *UI* bền vững, có thể replay, truyền song song với hội thoại nhưng không thuộc về hội thoại. (Bất biến dev-mode vẫn yêu cầu nó nằm trong một turn chưa kết thúc, và nó luôn thỏa mãn điều đó: nó được thêm vào giữa chừng các bước của lệnh gọi tool.)

### Các trường bị loại bỏ so với claude-code V1: `activeForm`, id, priority

Mục trong claude-code V1 là `{ content, status, activeForm }`; về sau (V2) thêm id, dependency và quyền sở hữu — nhưng chỉ để hỗ trợ *cụm* agent (backend đĩa, khóa bảo vệ, thay đổi từng mục). Tool này giữ mục ở tập tối thiểu: `{ content, status }`. Không có `activeForm` (nhãn thì hiện tại tiếp diễn) — UI hiển thị `content` trực tiếp; không có id — thay thế toàn danh sách không cần định danh ổn định; không có priority — nó chỉ từng là yêu cầu của format giao thức (wire format) `PlanEntry` của ACP, được tổng hợp thành hằng số thay vì được mô hình hóa ở ranh giới bridge, và đã ra đi cùng projection đó. Mỗi trường bị loại bỏ, mỗi lần gọi của model sẽ tạo ra ít hơn một mục.

### Một chủ sở hữu duy nhất — không có cơ chế cụm (YAGNI)

Mỗi danh sách thuộc về phiên agent gọi nó, lệnh gọi không phải agent bị từ chối. Không có phạm vi dùng chung, resolver hay giao thức delta. Danh sách xuyên agent cần delta log từng mục và lựa chọn phạm vi tường minh, nên được để lại cho một thiết kế độc lập trong tương lai.

### Xác thực: con đường trung dung chi phí thấp

schema bắt buộc type/required/enum. Ngoài ra, `execute` từ chối `content` rỗng hoặc trùng lặp, và từ chối nhiều hơn một task đang hoạt động khi `allowParallelInProgress` là `false`. Việc sắp xếp thứ tự và giữ danh sách cập nhật vẫn được giao cho model qua mô tả tool. Việc ghi bị từ chối trả về kết quả `isError`, để model tự sửa. Chiến lược triển khai bắt buộc phải áp dụng, cùng với việc bất biến bền vững độc lập với chiến lược đó, được xử lý bởi [Agent Note in-progress song song](2026-07-26-todo-parallel-in-progress.md).

## Vì sao không có mục cordis-catalog / không có `@mode`

`todo/write` là thành viên của `SessionEventMap`, không phải một sự kiện `interface Events` hạng nhất của cordis. Trình sinh catalog (`scripts/gen-cordis-catalog.ts`) quét khai báo `interface Events`; biến thể `SessionEventMap` đi cùng emit `session/event` sẵn có, không tạo ra dòng catalog mới. Do đó nó không mang nhãn `@mode` (trình sinh chỉ yêu cầu nhãn đó cho thành viên của `interface Events`) — thêm vào sẽ vô nghĩa.

## Kiểm thử

Bốn cấp độ:
- **Unit test** — sự kiện phiên (append/snapshot-clone/last-write-wins/not-on-surface); tool (hình dạng schema, xác thực tham số qua `ctx.tools.execute` thật, xác thực giá trị, việc thêm và thay thế sự kiện, từ chối lệnh gọi không phải agent, `presentCall`, an toàn HMR (hot module replacement)); và việc gấp gọn ở TUI.
- **Đường Loader thật** — plugin chạy qua `Loader.unwrapExports`, khẳng định hình dạng export namespace tồn tại (nó có `inject`, nên một default export vô tình sẽ sập khi nạp — postmortem/0001).
- **Tích hợp toàn vòng lặp** — một mock model được kịch bản hóa gọi `todo_write` qua agent loop (vòng lặp tác tử) thật; sự kiện `todo/write` được ghi xuống, lần gọi thứ hai thay thế nó.
- **Khôi phục/replay** — `todo/write` bền vững được gấp lại thành danh sách task hiện tại.
- **e2e cần khóa API + snapshot** — prompt thật gợi ra `todo_write`; snapshot đã lắp ráp chốt cả sự kiện log và việc render tương tác.

## Phương án thay thế đã cân nhắc

- **Dịch vụ `ctx.todos` trong bộ nhớ** — cần phát minh lại tính bền vững, replay và tái tạo khi khôi phục mà log đã cho miễn phí.
- **Giao thức delta từng mục** — chỉ cần khi có danh sách nhiều chủ sở hữu dùng chung, ngoài phạm vi hiện tại; thay thế toàn danh sách đơn giản hơn, và nhất quán với các cài đặt tham khảo.
- **Đặt tool trong `core/`** — `todo_write` là tool mở rộng đăng ký trên `ctx.tools`, không thuộc trục chính; nó nằm trong nhóm `packages/todo/` riêng của mình như các họ tool khác.

## Hậu quả

Danh sách todo là trạng thái phiên bền vững, có thể replay: host tương tác suy ra lại nó từ `todo/write` bền vững mới nhất, log (chứ không phải bộ nhớ plugin) là nguồn sự thật duy nhất. Thay thế toàn danh sách nghĩa là mỗi lần cập nhật cần một lệnh gọi tool, last-write-wins; không có giao thức delta cần điều phối. Sự kiện không đi vào surface của model, nên việc cập nhật todo không bao giờ làm nhiễu lịch sử model được suy ra — model chỉ thấy lệnh gọi tool và kết quả của chính mình.
