# Agent Note: Mặt bằng nghiệp vụ và lắp ráp lệnh Web (ui-commands / ui-skill / ui-subagent)

Status: implemented

[English](2026-07-25-web-command-surfaces-and-assembly.md) | 中文

> Phạm vi: cache mục lục lệnh và phân phối ba loại (ui-commands), luồng chọn popup, hai nguồn tham chiếu skill (kỹ năng) / subagent, định tuyến lệnh fixture (dữ liệu tiền đề kiểm thử) và nghiệm thu lắp ráp (snapshot slash-flow). Wire mang tải xem [Agent Note phạm vi session](2026-07-25-web-client-session-scope-and-provide-channel.md); trigger, menu và máy trạng thái input xem [Agent Note máy trạng thái input](2026-07-25-web-input-machine-and-slash-pipeline.md).

## Vấn đề

Pipeline đã sẵn sàng nhưng không có điểm hạ cánh cho tri thức lệnh: `ctx.commands` và `ctx.skills` phía host đã đầy đủ trong khi kênh web không có năng lực lệnh nào. Tầng nghiệp vụ phải trả lời:

- UI lệnh không chỉ có một hình thái (thực thi tại chỗ, bật hộp chọn popup, điền lại rồi tiếp tục gõ tham số) — gói nghiệp vụ lên sàn với sửa đổi khung sườn bằng không như thế nào;
- mục lục được kéo về khi nào: mỗi lần mở menu mới kéo thì quá chậm, cache thường trực thì phải có câu chuyện về vô hiệu hóa và kết nối lại;
- session luôn được agent (tác nhân) hậu thuẫn (Session+Agent sinh ra cùng lúc), mặt bằng lệnh client truy cập mục lục hiệu lực theo từng agent của host qua địa chỉ nào;
- nghiệm thu cấp lắp ráp: các tầng đã tách rời khi ghép lại, chuỗi chính người dùng nhìn thấy được chốt như thế nào.

## Quyết định

### ui-commands: `CommandUiRuntime` + `CommandDirectory` khóa theo session + `PopupSelectController` theo từng session

- Phép chiếu `ClientSessionContext { sessionId }` tự thân theo quy ước ui-input-trigger (types.ts): session luôn được agent hậu thuẫn, danh tính session chính là toàn bộ phép chiếu của năng lực lệnh; wire định địa chỉ bằng `{sessionId}` (`command.list` / `command.execute` đều vậy; host phân giải Agent từ header session).
- Mục lục phân vùng theo `SessionId`, single-flight theo từng key + epoch guard (lần kéo cũ không bao giờ ghi đè trạng thái mới), `commands/changed` vô hiệu hóa mềm toàn bộ key (snapshot cũ vẫn phục vụ, kéo lại nền), `connection/reset` vô hiệu hóa cứng toàn bộ key và làm nóng trước, Enter phải đợi key hiện tại sẵn sàng, thất bại giữ nguyên bản nháp chứ không hạ cấp. Hook làm nóng trước gắn vào hook `warm` của source — một lần cho toàn bộ roster khi scope sinh ra, tức phủ toàn bộ vòng đời session (năng lực session luôn hằng định suốt vòng đời).
- `register(contribution)` đăng ký lệnh client (descriptor + `available(projection)` + spec popupSelect); ứng viên tổng hợp = mục lục host + lọc theo khả dụng của contribution, rồi lọc theo query/vị trí, trùng tên giữa host/contribution thì fail loud.
- Ba loại lệnh được suy ra từ mặt bằng đăng ký, developer không khai báo vị trí: descriptor của host có `input` = **leadingInput** (điền lại `/name ␣` + claim, tiếp tục gõ tham số, chỉ ở đầu dòng); client đăng ký spec popupSelect = **popupSelect** (vỏ hộp chọn chính thức, nghiệp vụ không cần component nào); cả hai đều không có = **execute** (chọn là thực thi, không UI).
- Bảng quyết định phân phối: menu có thể kích hoạt cả ba loại; Space chỉ nhận diện leadingInput (tuyến phòng thủ chống kích hoạt nhầm: side effect không thể hoàn tác chỉ có lối vào tường minh); Enter với token trần mới execute/mở vỏ, leadingInput chấp nhận tham số theo sau.
- Popup của `popupFor(actx)`: search lọc cục bộ, select single-flight, khi mở thì bắt phép chiếu, onSelect thành công mới tiêu token qua sự kiện consume-token, thất bại thì giữ lại có thể thử lại, đổi session chỉ ẩn đi. Vỏ popup là tầng tạm thời (không vào máy trạng thái): khung giữ focus, Enter/↑↓/Escape thuộc về nó, click ngoài khung thì dismiss (click textarea đồng thời trả lại focus).

### Nguồn tham chiếu (chỉ thấy phép chiếu + root ctx với closure apply riêng)

- **ui-skill**: `skill.list({sessionId})` định địa chỉ theo session (host phân giải project root từ header session); cache mục lục khóa theo sessionId, single-flight, hook `warm` làm nóng khi sinh ra, `connection/reset` xóa sạch toàn bộ. Chọn cho ra kết quả text (`/name ` nguyên văn, quyết định tham chiếu văn bản thuần túy); `lexicon` cung cấp danh sách tên từ snapshot đã settle của CatalogFetch (chưa nóng thì `undefined`), `subscribeLexicon` thông báo cho listener theo session khi settle và khi vô hiệu hóa. Không có hook match (tham chiếu không tham gia phán quyết lệnh). Tham chiếu skill đi cùng nguyên văn như một prompt thông thường (ngoài mặt bằng lệnh; tool-skill không đổi, mục lục tiền tố session cung cấp liên kết cộng tác).
- **ui-subagent**: ứng viên không tốn RPC nào (snapshot sessions.list lọc theo parentId/running); chọn cho ra kết quả text (`@name ` nguyên văn); `lexicon` cũng suy ra từ snapshot, `subscribeLexicon` chuyển tiếp kênh thay đổi của list store (phía model biểu diễn đang chờ lên dự án nghiệp vụ).

### Định tuyến lệnh fixture và lắp ráp

- fixture connection bổ sung định tuyến lệnh (fixture + fake-api): giàn keyless có thể chạy trọn luồng lệnh (mục lục, thực thi, chọn popup).
- lắp ráp apps/web gắn toàn bộ gói mới; tsconfig path map / tập reference được bổ sung đầy đủ; catalog/docs được sinh lại theo wire và sự kiện.

### Nghiệm thu cấp lắp ráp: snapshot slash-flow

`apps/web/tests/slash-flow.snapshot.ts` chốt chuỗi chính người dùng nhìn thấy được (keyless đã lắp ráp, gói mock không thay thế transcript (bản ghi văn bản) sau lắp ráp): khi chưa có session composer bị vô hiệu hóa → tạo Workspace và vào session blank đã được hiện thực hóa → menu `/` chọn `/echo` leadingInput → lệnh thực thi nhưng vị trí blank không lật, danh sách vẫn hiển thị `New Session` → prompt thường đầu tiên được tiếp nhận thành công thì cùng hàng đó mới chuyển chính thức; textarea gắn với cùng session đó giữ nguyên trong suốt quá trình chuyển blank → active. `workspace-flow.snapshot.ts` còn chốt việc tạo/tái sử dụng hàng blank, việc điền lại sau khi prompt đầu tiên bị từ chối, và việc draft được mang theo qua input machine cùng hàng blank cũ bị ẩn đi khi chuyển Workspace trước khi gửi prompt đầu tiên.

## Phương án thay thế đã cân nhắc

| Phương án bị loại | Lý do ngắn gọn |
|---|---|
| Phân phối inline trong prompt (văn bản lệnh đi cùng message vào host để phân giải) | Gây nhầm lẫn mặt bằng lệnh/message; việc thực thi lệnh độc lập với hàng đợi message là ngữ nghĩa host đã có sẵn |
| Vật chất hóa skill thành cầu nối của command | skill có mục lục riêng; đăng ký N lần là đường vòng; hình thức thẻ tự nhiên tránh mặt bằng lệnh |
| RPC `skill.invoke` | host không có thao tác này; tham chiếu skill là văn bản thường đi cùng prompt |
| Loại tham chiếu ContentBlock mới | chi phí toàn chuỗi (adapter/UI/compaction (nén)); văn bản chính là bản thân + bản ghi occurrence có cấu trúc là đủ |
| Từng gói client tự báo cáo mục lục lệnh | host là nguồn thật duy nhất; client chỉ đọc descriptor, `commands-changed` đẩy vô hiệu hóa |
| Trục phân biệt `requires: 'none' \| 'agent'` (mục lục agentless + truy vấn địa chỉ đôi) | session luôn agent-backed nên mục lục lưỡng cư không có chủ; toàn bộ trục bị loại bỏ, chờ nhu cầu thật mở lại |
| Slot commandresult / commandpanel chuyên dụng | kết quả đi qua notice; vỏ popup là lớp nổi trong khung; kết quả phong phú vào sổ ghi chờ |
| Mục lục theo agent-type làm nguồn `@` | không có registry theo loại; snapshot session thời gian thực đã phủ đủ |
| Họ lớp PickAction/EnterCommand (kế thừa lớp cho sản phẩm pick) | giá trị runtime xuyên gói phá vỡ độ thuần khiết của bundle client; interface dữ liệu thuần + phương thức closure tương đương |

## Hậu quả

- Lên sàn lệnh nghiệp vụ = đăng ký ở host + một lệnh `command.register` phía client (popupSelect) hoặc không cần đăng ký gì (execute/leadingInput tự suy ra), sửa đổi khung sườn bằng không; cái giá là ngữ nghĩa ba loại tập trung trong ui-commands, loại thứ tư giả định nghĩa là phải sửa nó.
- Cache mục lục thường trực + đẩy vô hiệu hóa đổi lấy độ trễ menu bằng không và phán quyết Enter đáng tin cậy; cái giá là ba đường vô hiệu hóa (khung change, kết nối lại, epoch guard) đều cần test chốt lại.
- Định địa chỉ bằng sessionId cho phép mục lục hiệu lực theo từng agent của host (global + scoped shadows) lên wire trực tiếp, client trình bày nguyên trạng.
- Nợ đã biết: vỏ popupSelect hiện chưa có bên tiêu thụ nghiệp vụ nào lên sàn (chọn model v.v. sẽ đến cùng công việc `selectModel` của host dưới dạng live-mutation, khi đó làm mẫu tích hợp); nhát cắt thứ hai của hàng đợi (thao tác Inbox từng mục), thẻ kết quả phong phú, khả năng cấu hình roster vào sổ ghi chờ kích hoạt.
