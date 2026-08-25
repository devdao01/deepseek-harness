# @deepseek-ai/dsh-tool-todo

[English](README.md) | Tiếng Việt

Công cụ `todo_write` hướng tới model: danh sách công việc đầy đủ của agent (tác tử), mỗi lần gọi sẽ thay thế toàn bộ danh sách.

## Chức năng

Đăng ký một công cụ `todo_write(todos: [{ content, status }])` vào `ctx.tools`. Mỗi lần gọi model sẽ gửi toàn bộ danh sách, không có cập nhật một phần hay chỉnh sửa từng mục. Mỗi lần gọi sẽ thêm một sự kiện `todo/write` (bản snapshot toàn bộ danh sách) vào session log của agent gọi, cụ thể là gọi `agent.session.append('todo/write', { todos })`; danh sách hiện tại là sự kiện loại này mới nhất (khi replay, sự kiện ghi sau ghi đè sự kiện ghi trước).

`status` là một trong `pending`, `in_progress` hoặc `completed`.

## Chủ sở hữu duy nhất

Danh sách này thuộc về duy nhất phiên (session) agent đang gọi công cụ. Không có scope subagent／chia sẻ／swarm: bên gọi không phải agent (không có `exec.agent`) không có nơi nào để ghi vào danh sách, do đó sẽ bị từ chối. Đây là giới hạn scope có chủ đích, xem chi tiết trong Agent Note.

## Cấu hình

`allowParallelInProgress` là trường bắt buộc: mỗi tổ hợp phải chọn có cho phép nhiều todo cùng ở trạng thái `in_progress` hay không. Đây là lựa chọn ở tầng triển khai chứ không phải quy tắc cố định: việc có nhiều tác vụ đang hoạt động song song có hợp lý hay không phụ thuộc vào tình trạng đồng thời khi chạy mà công cụ không thể quan sát được. Agent có thể triển khai công việc song song sử dụng `true`, còn `false` thì bắt buộc kỷ luật chỉ một mục hoạt động tại một thời điểm.

Công tắc này thay đổi đồng thời cả hướng dẫn dành cho model lẫn đầu vào được chấp nhận — `true` yêu cầu model đánh dấu mọi tác vụ đang tiến hành và chấp nhận số lượng bất kỳ; `false` yêu cầu đúng một mục, và từ chối các lệnh gọi đánh dấu nhiều hơn với thông báo `Error: invalid todos: at most one task may be in_progress (got <n>)`. Bất biến (invariant) của log bền vững **không** đi theo cấu hình này: log được ghi khi cho phép song song vẫn phải replay được sau khi triển khai siết chặt chính sách, do đó bất biến giữ im lặng về số lượng đang hoạt động.

## Xác thực

Ngoài các kiểm tra kiểu／bắt buộc／enum theo schema, `execute` còn từ chối `content` rỗng hoặc trùng lặp, cũng như bất kỳ khóa mục nào ngoài `content`/`status` — hình dạng mục mở rộng (id, lồng nhau) sẽ báo lỗi rõ ràng thay vì bị làm phẳng âm thầm, đảm bảo snapshot ghi vào log khớp với những gì model tin rằng mình đã ghi. Đồng thời, có thể có bao nhiêu tác vụ ở trạng thái `in_progress` cùng lúc do tầng triển khai quyết định (xem § Cấu hình): tổ hợp chọn `true` cho phép công việc song song (subagent đồng thời, lệnh chạy nền) cùng lúc đánh dấu nhiều tác vụ là `in_progress`. Thứ tự của danh sách và việc cập nhật kịp thời do model chịu trách nhiệm theo mô tả công cụ.

## Hiển thị

Kết quả chuẩn hóa là `{ todos, counts: { pending, inProgress, completed } }`; bộ render Native của nó trả về xác nhận cập nhật gọn nhẹ. Công cụ cũng ghi sự kiện session đầy đủ `todo/write`. UI đăng ký luồng sự kiện và tự render danh sách bền vững này: [web client](../../client/ui-conversation) hiển thị thanh kế hoạch và dòng công cụ riêng dựa trên kế hoạch hiện đang hiệu lực (lần `todo/write` gần nhất không có `turn/start` muộn hơn sau nó) ([hiển thị](../../../.agents/notes/implemented/feature/2026-07-23-web-todo-display.md), [vòng đời](../../../.agents/notes/implemented/feature/2026-07-28-todo-plan-clears-on-next-turn.md)).

## Chiếu (projection) session

Khi tổ hợp có mount `ctx.sessionProjections` ([`@deepseek-ai/dsh-session-projection`](../../session/session-projection/README.md)), gói này đăng ký đơn vị chiếu `todos` trong một sub-plugin được inject: `init` = `null` (chưa có lần ghi nào), `apply` = lấy toàn bộ bảng từ mỗi `todo/write`, và xóa về `null` tại mỗi `turn/start` (kế hoạch hiện đang hiệu lực; `turn/end` giữ lại danh sách vừa hoàn thành; các sự kiện còn lại đều trả về cùng một tham chiếu trạng thái), `view` = đồng nhất (identity), `stateVersion` = 2. Khóa này được hợp nhất vào `SessionProjectionMap` trong gói này (qua lối ra `/types` của gói Service Definition); framework điều khiển đơn vị này, còn bên mang giá trị cung cấp nó qua trang cuối lịch sử và các khung đẩy `session/projection`. Các tổ hợp không mount registry không bị ảnh hưởng. Lý do vòng đời xem tại [xóa kế hoạch todo ở lượt tiếp theo](../../../.agents/notes/implemented/feature/2026-07-28-todo-plan-clears-on-next-turn.md).

## Hình dạng export

Plugin dạng hàm／namespace: export `name`/`inject`/`apply`, không cung cấp export mặc định. Một `export default` ngoài ý muốn sẽ bị `unwrapExports` của Loader gộp thành export mặc định và khiến `inject` bị mất (xem [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Trải nghiệm model

### Schema công cụ

#### Model nhìn thấy gì

Model sẽ nhìn thấy [schema `todo_write`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-todo) được sinh ra.

#### Ảnh hưởng Token

Mỗi request công cụ có thể nhìn thấy đều có chi phí token schema cố định.

#### Ảnh hưởng KV Cache

Miễn là định nghĩa và khả năng hiển thị không đổi, tiền tố sẽ giữ ổn định. Vòng đời plugin hoặc giới hạn scope có thể làm mất hiệu lực việc tái sử dụng cache tính từ schema này.

### Lịch sử gọi công cụ và kết quả

#### Model nhìn thấy gì

Mỗi lần gọi công cụ của assistant đều giữ nguyên toàn bộ danh sách thay thế trong tham số. Khi thành công, trả về nguyên văn `Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.`. Văn bản lỗi ổn định là ``Error: invalid todo: `content` must be a non-empty string``, `Error: invalid todos: duplicate content "<content>"`, `Error: todo_write requires an owning agent session`, và — chỉ khi triển khai đặt `allowParallelInProgress: false` — `Error: invalid todos: at most one task may be in_progress (got <n>)`. Sự kiện session đầy đủ `todo/write` là trạng thái dành cho UI và replay, không phải là tin nhắn thứ hai gửi tới model.

#### Ảnh hưởng Token

Lượng token sử dụng tăng theo danh sách đầy đủ mà model gửi mỗi lần, và các tham số của những lần gọi này được giữ lại cho đến khi nén (compaction). Bản thân kết quả rất nhỏ và có hình dạng cố định.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only); nội dung mới có thể nhìn thấy nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV-cache hiện có.

## Giới hạn đã biết và việc còn hoãn lại

- **Chỉ có scope một chủ sở hữu duy nhất**: danh sách thuộc về phiên agent gọi duy nhất; scope subagent／chia sẻ／swarm là giới hạn có chủ đích (xem mục "Chủ sở hữu duy nhất"), bên gọi không phải agent sẽ bị từ chối.
- **Hình dạng mục được giữ tối giản có chủ đích**: `content` cộng `status` ba trạng thái; việc thay thế toàn bảng không cần id ổn định, mức ưu tiên hay trường active-form.
- **Thay thế toàn bảng là thao tác duy nhất**: không có cập nhật một phần, cũng không có công cụ đọc lại; model phải gửi lại toàn bộ danh sách ở mỗi lần gọi.
