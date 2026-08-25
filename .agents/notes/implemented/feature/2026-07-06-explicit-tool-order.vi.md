# Agent Note: Thứ tự tool phía model tường minh

Status: implemented

[English](2026-07-06-explicit-tool-order.md) | Tiếng Việt

## Vấn đề

Trước đây, thứ tự tool phía model đi theo thứ tự đăng ký plugin, mà thứ tự đăng ký lại phụ thuộc vào việc tải module song song của các plugin độc lập với nhau. Race condition này tạo ra các request header khác nhau trong CI và khi ghi snapshot. Vì thứ tự ảnh hưởng đến byte request, cache và request header đã persist, nên cần một chính sách xác định tường minh.

## Quyết định

Logic lắp ráp system prompt chịu trách nhiệm định nghĩa quyền uy về thứ tự tool phía model, cũng giống như nó đã định nghĩa quyền uy về thứ tự section. `toolOrder?: string[]` trên `dsh-system-prompt` là chính sách tường minh tùy chọn:

- Các tool đã đăng ký có tên trong danh sách được sắp xếp theo vị trí trong danh sách.
- Tên trong danh sách không tương ứng với tool đã đăng ký nào là lỗi cấu hình. Lỗi hình dạng (thiếu rest entry hoặc tên trùng lặp) fail nhanh ngay tại service constructor; tên chưa đăng ký sẽ khiến mỗi lệnh gọi `assemble()` bị từ chối — đây là thời điểm sớm nhất mà tập tool đã đăng ký tồn tại và có thể kiểm tra được (plugin tool chỉ đăng ký sau khi service được khởi tạo), đồng thời cũng là thời điểm chung duy nhất (đăng ký có thể thay đổi bất cứ lúc nào; Cordis không có sự kiện "tất cả plugin đã tải xong"). Dưới agent loop (vòng lặp agent) đã phát hành, lượt đầu tiên sẽ thất bại trước khi bất kỳ request nào tới model được gửi đi — phạm vi ảnh hưởng chính xác xem phần "Hệ quả" bên dưới.
- Tool đã đăng ký nhưng không có trong danh sách sẽ được chèn vào vị trí của rest entry `'<unlisted-tools>'` (`TOOL_ORDER_REST`), cùng các tool chưa liệt kê khác được sắp xếp theo thứ tự từ điển (lexicographic) theo tên.
- Bất kỳ tool nào đã thu thập được đều không được dùng `TOOL_ORDER_REST` làm `ToolSchema.name` của nó; logic lắp ráp sẽ từ chối tên dự trữ này trước khi sắp xếp.
- Danh sách phải chứa đúng một rest entry, và không được có tên trùng lặp.
- Khi `toolOrder` không được thiết lập, thứ tự quyền uy là thứ tự từ điển thuần túy (so sánh theo code-unit, không phụ thuộc locale), do đó tính xác định được đảm bảo mà không cần cấu hình.

`assemble()` chuẩn hóa các tool từ provider về thứ tự quyền uy trước waterfall (sự kiện dạng thác) `system-prompt/assemble`, loại bỏ tận gốc sự khác biệt về thứ tự đăng ký. Waterfall bắt đầu từ danh sách xác định này; thứ tự bất biến này sau đó chảy vào request header, request đã đóng băng và kiểm tra khả năng tái dựng, mà không cần logic sắp xếp riêng cho loop.

Phạm vi được thu hẹp một cách cố ý: Agent Note này sửa race condition về thứ tự đăng ký, chứ không phải hành vi plugin. Listener của `system-prompt/assemble` vẫn có thể thêm, xóa hoặc sắp xếp lại tool — cũng như nó có thể chỉnh sửa section sau khi thứ tự section đã cố định — và chịu trách nhiệm về tính xác định của output của chính nó; quy ước waterfall đã yêu cầu listener phải xác định (bất biến khả tái dựng sẽ bắt được listener có hành vi không nhất quán giữa build và replay).

Việc truyền cấu hình theo tiền lệ của `persona`, với `toolOrder` song song: ứng dụng TUI, Headless và ACP chấp nhận khóa này trong cấu hình, và chuyển tiếp qua `dsh-agent-spine-demo` (schema của nó là giao của các schema chủ sở hữu) tới `SystemPrompt` sub-service. Có một chi tiết schemastery quan trọng: mảng schemastery mặc định là `[]`, nhưng `toolOrder` bị bỏ qua phải giữ ở trạng thái ABSENT (= thứ tự từ điển), chứ không biến thành một danh sách rỗng được cấu hình tường minh (không hợp lệ — thiếu rest entry), do đó mỗi schema trên đường truyền đều ép giá trị mặc định thành `undefined`.

## Phương án từng cân nhắc

- **Thứ tự đăng ký (hiện trạng)**: race condition khi tải song song, phụ thuộc môi trường host (gây rung lắc trong CI như đã nêu trên), không thể thấy được trong review.
- **Tuyến tính hóa đồ thị phụ thuộc plugin**: quan hệ này là thứ tự bán phần (partial order), các plugin tool độc lập không thể so sánh với nhau; sự rung lắc xảy ra ngay cả khi thứ tự bán phần đã được thỏa mãn đầy đủ.
- **Mỗi plugin gắn nhãn `weight` cho đóng góp tool của mình**: phân tán thứ tự vào từng plugin, vẫn cần một quy ước đánh số toàn cục không ai sở hữu (phân đoạn `order` của section đã cho thấy chi phí điều phối này cần phải làm thủ công).
- **Sắp xếp trong `ToolRuntime.schemas()` (tầng registry)**: cũng xác định như vậy, nhưng registry là một kho lưu trữ thành viên, được nhiều bên tiêu thụ ngoài việc lắp ráp; sắp xếp là mối quan tâm của việc kết hợp prompt, mà logic lắp ráp đã sở hữu chính sách kết hợp của section rồi.
- **Thêm cấu hình + phương thức `orderTools()` trên `LlmRuntime`, do loop gọi trước khi ghi header**: khả thi, nhưng chỉ để áp dụng một chính sách ở nơi xa mà lại thêm một phương thức service công khai và một thay đổi loop; mỗi bên kết hợp request trong tương lai đều phải nhớ gọi nó. Chuẩn hóa ngay tại nơi danh sách được sinh ra khiến danh sách không có thứ tự trở nên không thể biểu diễn, và không thêm interface mới.
- **Chuẩn hóa bên trong `llm.stream()`**: chạy sau khi sự kiện header đã được ghi (rung lắc vẫn còn tồn tại), và cần dựng lại request wrapper đã đóng băng sâu, âm thầm phá vỡ bất biến khả tái dựng.
- **Danh sách đầy đủ (không có rest entry)**: mỗi plugin tool mới được tải sẽ gây thất bại khi khởi động; rest entry bắt buộc giữ cho các tool chưa liệt kê vẫn xác định, và vị trí của chúng là tường minh.
- **Xác thực khi khởi động (bởi `dsh-app-boot` gọi `SystemPrompt.assertToolOrderSatisfied()` sau `loader.await()`)**: có thể biến cấu hình sai thành lỗi chết khi khởi động thay vì thất bại ở lượt đầu, nhưng phải trả giá bằng một phương thức service công khai cộng với sự khớp nối cấu trúc của boot glue chung vào một service đơn lẻ, và không thể thay thế việc kiểm tra tại thời điểm lắp ráp (bên gọi nhúng không bao giờ chạy app boot; đăng ký vẫn có thể thay đổi sau boot). Cũng không có sẵn sự kiện nào để mang theo kiểm tra này: Cordis v4 không có sự kiện dạng ready, `loader/entry-init`/`internal/status` kích hoạt giữa chừng quá trình tải (có race condition với việc đăng ký tool — chính là nguồn gây rung lắc mà Agent Note này muốn loại bỏ), còn các sự kiện vòng đời agent không xảy ra sớm hơn việc lắp ráp. Sau khi cân nhắc, chọn chỉ đặt một điểm kiểm tra tại `assemble()`, chấp nhận cái giá là thời điểm thất bại muộn hơn.

## Hệ quả

- Mọi lần lắp ráp được xây dựng từ registry đều bắt đầu với thứ tự tool xác định trên bất kỳ host nào; nếu không có listener chuyên gia nào cố ý thay đổi, mỗi sự kiện `request/header` và request tới model đều kế thừa thứ tự đó.
- `PromptAssembly.tools` ban đầu là quyền uy, do đó listener waterfall bắt đầu từ thứ tự phía model; thứ tự đăng ký provider không thể quan sát được trước extension point hợp tác này.
- Fixture (dữ liệu test cố định) duy nhất trong bộ snapshot khóa cứng request header là `text-turn`, mang theo thứ tự tool quyền uy mới; theo đúng thiết kế khóa cứng header, các snapshot ACP khác vẫn thay thế phần lớn header bằng `{{system}}`/`{{tools}}`.
- Việc sắp xếp lại tool thuần túy giữa các bước được ghi lại như mọi thay đổi header khác: một snapshot `request/header` đầy đủ với lý do là `'change'`. Thứ tự quyền uy ổn định sẽ ngăn thời điểm đăng ký tạo ra kiểu thay đổi này trên đường thông thường.
- Khóa `toolOrder` truyền dọc theo chuỗi chuyển tiếp app → `agent-core` → `SystemPrompt`, do đó khi triển khai chỉ cần đặt nó trong cấu hình app cạnh `persona`; `dsh-llm` và agent loop không cần thay đổi.
- Tên tool gõ sai chính tả hoặc chưa được tải trong `toolOrder` sẽ khiến lượt thất bại khi lắp ráp prompt, chứ không phải khi khởi động: loop lắp ráp bên trong lượt (sau `turn/start`, trước `step/start`), do đó việc từ chối này sẽ rơi vào catch bên ngoài của lượt — lượt kết thúc hoàn toàn với lý do `error` mang theo message đó, `agent/error` cũng mang theo message đó, không mở bước nào, không ghi `request/header`, không gửi request tới adapter, agent quay về trạng thái idle. Mỗi lượt đều thất bại theo cùng cách cho đến khi cấu hình được sửa; bản thân tiến trình vẫn tiếp tục chạy (tuân theo quy tắc của repo: tham chiếu cấu hình tường minh không được âm thầm bỏ qua — điểm kiểm tra đặt ở giai đoạn lắp ráp vì không có thời điểm chung nào sớm hơn).
- Khi tool provider trả về tên rest entry dự trữ, việc lắp ráp prompt thất bại với cùng hình thái như tên đã liệt kê nhưng chưa xác định. Điều này ngăn giá trị sentinel biến thành một tool thật gây mơ hồ, và giữ vững quy ước sắp xếp "không bao giờ bỏ tool".

## Kiểm thử

Test system prompt bao phủ: thứ tự mặc định theo từ điển, vị trí danh sách/rest, tính vô can của thứ tự provider, tên trùng nhau, danh sách không hợp lệ, tên chưa xác định hoặc dự trữ, danh sách quyền uy trước waterfall, và quy tắc tool do listener thêm vào không bị sắp xếp lại. Test loop khóa cứng: dưới các thứ tự đăng ký khác nhau, thứ tự đã ghi và đã phân phối nhất quán, cấu hình được chuyển tiếp qua agent-core và hai app, request được đóng băng sâu, và lượt thất bại cân bằng khi cấu hình tên chưa xác định (không có bước, không có header, không gọi adapter). Snapshot replay chỉ giữ danh sách quyền uy đầy đủ trong header `text-turn` cố định; các fixture khác tiếp tục dùng `{{tools}}`.
