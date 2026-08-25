# Agent Note: Hiển thị todo trên Web — kênh side effect của snapshot + hai mặt render

Status: implemented

[English](2026-07-23-web-todo-display.md) | Tiếng Việt

## Vấn đề

`todo_write` nối toàn bộ snapshot danh sách của `todo/write` vào session log; TUI render một panel plan thường trú (cầu nối ACP (Agent Client Protocol) chuyên dụng cho tự động hóa cố ý không trình bày todo). Client Web thì vứt bỏ hoàn toàn sự kiện này: luồng host mux vốn đã chuyển tiếp mọi sự kiện session, nhưng `todo/write` không phải kiểu surface (nó không bao giờ fold vào `ConversationSnapshot.nodes`), và cũng không có nhánh side effect nào tích lũy nó — trình duyệt vừa không có điểm tiêu thụ, vừa không có mặt hiển thị.

## Quyết định

Coi `todo/write` như một side effect của session để tiêu thụ, chứ không phải node surface, và render nó trên hai mặt tương ứng đúng với cách phân chia mà TUI đã vẽ sẵn.

### Kênh side effect, hội tụ với việc replay cửa sổ

`applyEventSideEffects` bổ sung một nhánh `todo/write` (toàn bộ danh sách, ghi sau đè ghi trước), và xóa sạch tại `turn/start` ([vòng đời plan phân định theo lượt](2026-07-28-todo-plan-clears-on-next-turn.md)). `rebuildDerivedFromWindow` quét qua cửa sổ từ plan rỗng, và chỉ khôi phục seed của trang cuối khi cửa sổ chưa từng phán định plan (không có `todo/write` và không có `turn/start`); ngược lại thì lấy kết quả fold của các lần ghi／`turn/start` trong cửa sổ làm chuẩn. Mọi caller của `installWindow` đều là yêu cầu trang cuối (`doOpen`, lần kéo lại để vá lỗ hổng của nó, `repairGap`; `loadOlder` chỉ nối về phía trước, không còn gieo seed), còn host với yêu cầu trang cuối thì hoặc kèm theo projection, hoặc bỏ qua khi không có plan nào đang hiệu lực — vì vậy trường bị thiếu chính là danh sách rỗng có thẩm quyền, cứ thế gán trực tiếp. Sự phân biệt này quan trọng trong tình huống rollback: nếu host sập trước khi persist lần ghi thời gian thực, log sẽ rỗng, lúc đó giữ lại giá trị cũ sẽ khiến plan đã bị rollback nằm mãi trên màn hình. `ConversationSnapshot.todos` là mặt đọc. Điều này tuân theo chính giao ước của sự kiện («trạng thái UI chỉ tồn tại trong log; tuyệt đối không đưa vào lịch sử phái sinh»): trình bày mỗi lần ghi như một node hội thoại sẽ khiến danh sách đã bị thay thế trông như vẫn còn hiệu lực.

### TodoPanel: danh sách được persist như một thanh ngang thường trú

Panel gắn qua slot `conversation.input.dock` (plugin đăng ký thông thường `todoDockEntry` dùng `ctx.slots.inject`, không phụ thuộc `ConversationController`, `order: 0` xếp phía trên thanh hàng đợi), ẩn khi danh sách rỗng, có thể thu gọn thành dòng tiêu đề gồm tiêu đề cộng các bộ đếm trạng thái nối bằng `·` (được bản địa hóa, dạng như `1 đã xong · 2 đang làm · 1 chờ xử lý`, đoạn có bộ đếm bằng không thì lược bỏ; trạng thái thu gọn không còn kèm phần thân của mục đang làm). Icon trạng thái lấy từ bộ todo của figma (vòng tick màu xanh lá／vòng mờ dần màu xanh dương／vòng nét đứt chưa bắt đầu), thẻ dùng bề mặt tip (`--dsw-specific-tip`, bo góc 14px, `width: calc(100% - 88px)`／`max-width: 776px` căn giữa; padding 6px ở đỉnh InputBar là khoảng cách tới thẻ nhập liệu). Nó đọc projection `todos` do host tính toán thông qua hook chuẩn `useProjection` mà dock entry cấp cho — không store, không service, không ctx. Component bên trong giữ props đầy đủ và độc lập framework; miếng adapter dock chỉ là một dòng bọc ngoài.

### TodoRow: dòng theo từng lời gọi, qua keyed toolview slot

Dòng hội thoại chuyên dụng cho `todo_write` là một plugin đăng ký thông thường (`todoToolview`, gắn bởi `apply`), đăng ký vào slot keyed `tool.call.toolview` qua `ctx.slots.inject`, tuân theo cùng vòng đời khai báo như ví dụ bash, nhưng thuộc cấp độ sản phẩm. Phần tóm tắt được suy ra từ args của lời gọi (`N/M done · first active item`, bộ đếm `+<n>` cho các mục active còn lại đặt trong ô `summarySuffix` không co lại của `ToolRow`); args không phân tích được thì lùi về phần tóm tắt dòng thông thường; nhấp vào sẽ mở cột details với args gốc. Todo không thêm bất kỳ `ToolEventView` nào — việc trình bày thuộc về client, danh sách thường trú render từ sự kiện session chứ không phải từ thẻ tool.

## Các phương án đã cân nhắc

- **Fold lần ghi todo vào `nodes` như một mục surface** — cửa sổ replay sẽ render mọi danh sách đã bị thay thế; sự kiện này được thiết kế có chủ đích là kiểu phi surface.
- **Hardcode panel vào `ConversationRoot`** — vị trí ban đầu trước khi có input-dock slot; dock chính là chỗ mà kiến trúc này dành cho «thanh ngang luôn mở phía trên composer», hardcode sẽ đi vòng qua cơ chế disposal và định thứ tự của slot registry.
- **Đặt panel vào cột details** — details slot chỉ chứa một mục và do lựa chọn điều khiển, vòng đời khác với một thanh ngang luôn mở.
- **View do host tính toán (một `ToolEventView` cho todo)** — việc trình bày thuộc về client; giao thức đã mang sẵn toàn bộ snapshot trong payload sự kiện.

## Hệ quả

Tính đúng đắn của replay do một đường dẫn code duy nhất nắm giữ: mọi thay đổi về việc dựng lại cửa sổ trong tương lai đều tự nhiên giữ cho todos nhất quán; fixture (dữ liệu chuẩn bị cho test) ở lượt 71 của fx-alpha cộng với `packages/client/ui-conversation/tests/todo-panel.client.spec.tsx` cố định toàn bộ chuỗi này (tóm tắt và trạng thái dòng, nội dung panel dock, vòng thu gọn — mở lại). `todos` là trường bắt buộc của `ConversationSnapshot`, nên fake được kịch bản hóa trong spec phải kèm theo nó. Cầu nối ACP chuyên dụng cho tự động hóa cố ý không trình bày todo; các mặt Web render cùng một sự kiện, chỉ thêm một trường giao thức chứ không thêm kiểu sự kiện. Chính trường do host cung cấp này là căn cứ để dựng lại khi tải nguội: trang cuối của history kèm theo `todos` — plan đang hiệu lực trên toàn bộ log (lần `todo/write` gần nhất mà sau đó không có `turn/start` nào muộn hơn), được tính độc lập với cửa sổ phân trang (cùng tư thế backscan như khi ghép cặp với view) — nhờ vậy khi mở lại session, nếu plan vẫn còn hiệu lực và lần ghi cuối nằm trước cửa sổ thì plan vẫn được khôi phục như thường; giá trị này được giữ qua các lần lật trang về trước, mọi lần ghi sau đó vẫn đè lên như thường, `turn/start` muộn hơn sẽ xóa sạch, còn khi phản hồi trang cuối không kèm projection thì đặt lại về rỗng.
