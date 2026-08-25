# Agent Note: Chi phí render phiên dài trên TUI: chia sẻ quét thời gian bước và cache dòng của card

Status: implemented
Archived: 2026-08-04

[English](2026-08-03-tui-long-session-render-costs.md) | 中文

## Vấn đề

Trong một phiên dài đã khôi phục (196k sự kiện, 2.2k bước, 1.8k thẻ tool), TUI render transcript mất khoảng 12 giây, việc hiển thị lại một lần gõ phím mất khoảng 800 mili giây. Profiling hiệu năng cho thấy cả hai khoản chi phí đều đến từ đường render, không phải từ việc tải phiên (zstd + parse + gieo bề mặt khoảng 1.7 giây):

- Footer thời gian của mỗi bước gọi `stepTimingAt`, và hàm này replay lại toàn bộ event log từ index 0 cho mỗi footer, nên độ phức tạp của lần render đầu tiên là O(số bước × số sự kiện), chiếm khoảng 6 giây CPU.
- pi-tui render lại mọi component ở mỗi khung hình, và dựa vào cache dòng riêng của từng component (`Text`/`Markdown` của nó cache theo `(text, width)`). `ToolCardComponent.render()` và `ContextCardComponent.render()` khởi tạo các instance `new Text(...)`/`new Markdown(...)` dùng-một-lần-rồi-bỏ, và việc khởi tạo diễn ra bên trong `render(width)`, nên mỗi khung hình, tức là mỗi lần gõ phím, đều wrap lại đầu ra của mọi thẻ đã chốt.

## Quyết định

`packages/ui/tui/src/chat/timing.ts` không còn dùng `stepTimingAt`, thay bằng `StepTimingTracker`: mỗi lần mount giao diện chat sẽ tạo một accumulator trong `createTuiChat`, rồi truyền qua `StreamingAssistantComponent` xuống mỗi `StepTimingComponent`. Mỗi truy vấn đẩy con trỏ tiến lên, quét các sự kiện được thêm vào sau truy vấn trước, và lưu trạng thái bucket của từng bước trong một map, nên mọi tổng footer chỉ cần O(số sự kiện). Khi truy vấn, hệ thống cộng dồn bucket chưa đóng vào thời điểm truy vấn; các bước được chốt tại `step/end` của chúng. Tracker này yêu cầu log phiên chỉ được append, tức tuân theo hợp đồng `seq = độ dài log`.

`ToolCardComponent` và `ContextCardComponent` cache các dòng đã render theo khóa chiều rộng. Gọi bất kỳ phương thức sửa đổi trạng thái nào (`updateResult`, `setVisibility`, `setExpanded`) hoặc `invalidate()` (cascade toàn cây của pi-tui) sẽ xóa cache, nên thay đổi trạng thái chắc chắn sẽ render lại; các trường hợp khác, kể cả mỗi khung hình gõ phím, đều trả về dòng đã cache. Điều này khôi phục lại quy ước vốn có của chính pi thượng nguồn: dùng các subcomponent thường trú; khi render tùy biến thì dùng tường minh `cachedWidth`/`cachedLines`, ví dụ `bash.ts` của pi `coding-agent`. Còn ở đây, thân hàm `render(width)` mệnh lệnh trước đây đã làm mất hiệu lực của quy ước này.

Đo trên phiên 196k sự kiện này (tmux, 200×50): thời gian sẵn sàng của prompt sau khi khôi phục giảm từ 12.2 giây xuống 7.2 giây; thời gian hiển thị lại trung vị cho mỗi lần gõ phím giảm từ 796 mili giây xuống 17 mili giây (ngang bằng phiên mới).

## Phương án thay thế từng cân nhắc

- **Đánh index offset của `step/start`, giữ nguyên việc replay từng footer**: cách này loại bỏ `findIndex`, nhưng mỗi footer vẫn phải quét mảng dùng chung để tìm khoảng thuộc về bước đó; một lần duyệt dùng chung của tracker đạt cùng mức cải thiện độ phức tạp với ít trạng thái bổ sung hơn để ghi nhớ.
- **Tái cấu trúc card thành subcomponent thường trú của pi-tui** (phong cách chính của pi thượng nguồn): chi phí ở trạng thái ổn định là như nhau, nhưng thay đổi cần thiết cho việc xử lý trạng thái card lớn hơn, so với cache theo khóa chiều rộng thì không mang lại lợi ích bổ sung.
- **Cache bên trong `Container.render` của pi-tui**: sai tầng: phạm vi patch cho mã bên thứ ba nhúng vào sẽ mở rộng, trong khi thượng nguồn đã quy ước để mỗi component tự sở hữu cache của mình.

## Hệ quả

- Độ trễ nhập liệu không còn tăng theo tổng lượng output của tool nữa; chi phí còn lại cho mỗi khung hình là việc duyệt cây và ghép dòng của pi-tui, tuyến tính theo số dòng render. Chi phí render khi khôi phục giờ do bố cục ban đầu một lần của pi-tui (khoảng 4 giây với 196k sự kiện) và việc tải (khoảng 1.7 giây) chi phối, cả hai đều tuyến tính.
- Tracker này dùng trực tiếp thời gian sự kiện đã ghi log, không còn cắt ngang khi gặp `time > at` giữa chừng quét như cài đặt cũ đã loại bỏ; vì giá trị `at` của mỗi footer khác nhau, việc quét dùng chung không thể áp dụng kiểu cắt ngang này; khi đồng hồ hệ thống lùi lại, mỗi bucket đều bị chặn dưới bằng không, nên tổng thu được có thể khác với tổng dưới cách cắt ngang cũ.
- `render()` của card không còn là hàm thuần túy theo `(state, width)` ở mỗi lần gọi nữa, các phương thức sửa đổi trạng thái phải xóa `linesCache`. Nếu quên xóa khi thêm phương thức sửa đổi trạng thái mới, giao diện sẽ hiển thị dòng cũ; test cache trong `packages/ui/tui/tests/transcript-card-cache.spec.ts` cố định hợp đồng cho các phương thức sửa đổi trạng thái hiện có.
- `StepTimingTracker` giả định tọa độ bước không bị tái sử dụng sau `step/end`; `step/start` lặp lại cho một bước đã đóng sẽ bị bỏ qua, không khởi động lại bước đó.
