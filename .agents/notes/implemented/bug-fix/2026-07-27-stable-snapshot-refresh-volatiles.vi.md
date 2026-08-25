# Agent Note: Giá trị dễ biến động trong lúc refresh snapshot ổn định

Status: implemented

[English](2026-07-27-stable-snapshot-refresh-volatiles.md) | 中文

## Vấn đề

Việc so sánh snapshot ACP (Agent Client Protocol) chuẩn hóa UUID được sinh ra, alias cwd, locator spill, thời gian sự kiện nhúng và số byte bị lược bỏ, nhưng khi refresh ghi lại thì lại lưu bền giá trị gốc được sinh ra trong lần đó. Do đó, ngay cả khi quy ước so sánh coi hai bản log là bằng nhau, một lần refresh không thay đổi hành vi vẫn sẽ ghi đè fixture (dữ liệu chuẩn bị trước cho test) bằng giá trị ngẫu nhiên mới hoặc cách viết đường dẫn đặc thù của host.

Tiền đề cấu trúc cần thiết cho danh tính message yếu hơn việc căn chỉnh bản ghi: một sự kiện log không liên quan có thể phá vỡ việc căn chỉnh bản ghi, nhưng giá trị của message được kế thừa sau khi loại bỏ danh tính vẫn không đổi giữa log cha và log con. Chế độ ghi (recording) khi thay thế fixture hiện có cũng bắt đầu từ UUID message mới được sinh ra.

## Quyết định

Trước khi ghi vào fixture session lúc ghi hoặc refresh, tầng hỗ trợ snapshot dùng chung sẽ giao log có thể ghi vào fixture cho một thành phần chịu trách nhiệm xử lý có cấu trúc ID message. Thành phần này nhận diện vật mang surface qua predicate kiểu surface thẩm quyền của gói session, và nhận diện các bản sao message đã xếp hàng liên kết với các vật mang đó trong `agent/inbox/spliced`; sau đó loại bỏ `id` cấp cao nhất của mỗi message hoàn chỉnh và tính chỉ vân (fingerprint), đồng thời ghi lại cạnh liên kết giữa mỗi ID và chỉ vân trong tất cả log cha/con. Chỉ khi bậc (degree) của ID và chỉ vân đó đều bằng 1 trong cả đồ thị của lần sinh này lẫn đồ thị hiện có, UUID hiện có mới được tái sử dụng, sau đó chỉ ghi đè trường `id` của các message đã qua xác thực trong các vật mang đó. Message kế thừa lặp lại có cùng ID vẫn tính là một ứng viên; message mới, có thay đổi, nội dung trùng lặp, định dạng sai và có xung đột thì giữ ID của lần sinh này. Bộ ghi ACP, JSON-RPC và Web sẽ thực hiện bước này sau khi xóa header và token hóa cwd, do đó danh tính message phụ thuộc vào cách viết trong fixture, chứ không phải đường dẫn gốc của máy host.

Việc ghi lại khi refresh dùng `normalizeSessionLog` làm căn cứ phán đoán giá trị dễ biến động cho các giá trị lá đã căn chỉnh. Hệ thống chuẩn hóa bản ghi thu thập gốc bằng id, cwd và toàn bộ alias cwd của lần chạy này, và chuẩn hóa bản ghi fixture bằng ngữ cảnh header của fixture; việc thay thế theo nghĩa đen chỉ giới hạn ở session ID, giá trị cwd và đường dẫn spill được sinh ra trong lần chạy này. Sau khi bản ghi hiện có được căn chỉnh xong, hệ thống dựa trên các bản ghi đã chuẩn hóa này để so sánh đệ quy nút lá giữa bản ghi của lần sinh này và bản ghi hiện có: nút lá tương đương sau chuẩn hóa giữ giá trị gốc hiện có, nút lá khác nhau sau chuẩn hóa thì giữ giá trị ngữ nghĩa của lần sinh này. ID message hoàn chỉnh trong vật mang surface hoặc inbox không tham gia đường dẫn này, để tránh việc tái sử dụng theo vị trí và tái sử dụng theo cấu trúc mỗi bên tự cấp phát cùng một UUID đã commit.

Trước khi tái sử dụng, phải đảm bảo bố cục bản ghi logic hoàn chỉnh được căn chỉnh, ngoại trừ các trường hợp tương đương hiện có về chunk đã đóng gói và tiêu đề chèn thêm. Các chuỗi tương đương sau chuẩn hóa nhưng có thay đổi tạo thành một song ánh (bijection) trong toàn bộ log: một chuỗi được sinh ra trong lần này chỉ ánh xạ tới một chuỗi hiện có, và ngược lại, do đó ID xuất hiện lặp lại xuyên các bản ghi vẫn giữ được liên kết. Khi xuất hiện bản ghi không khớp không thể giải thích hoặc xung đột ánh xạ, log đó sẽ tắt việc tái sử dụng chuỗi đã chuẩn hóa.

Trường đối tượng được căn chỉnh theo key. Chỉ khi độ dài mảng tương ứng bằng nhau mới căn chỉnh các phần tử của chúng; nếu không thì lấy mảng của lần sinh này làm chuẩn. Chuỗi luôn được coi là nút lá không thể tách. Việc căn chỉnh thời gian của chunk đã đóng gói hiện có và xử lý tiêu đề chèn thêm vẫn giữ độc lập, vì chúng căn chỉnh sự kiện logic, chứ không phải giá trị bên trong một bản ghi đơn.

## Các phương án đã cân nhắc

**Dùng UUID và tên file spill xác định trong triển khai snapshot.** Việc thay thế tính ngẫu nhiên dùng trong môi trường sản xuất sẽ làm suy yếu thuộc tính an toàn mà test cần xác minh, hoặc buộc việc triển khai lưu trữ và phê duyệt phải đưa vào hành vi chỉ dùng cho test.

**Commit fixture đã chuẩn hóa.** Log session đã token hóa sẽ không còn là input replay gốc, và sẽ gây ra một đợt di trú fixture quy mô lớn không liên quan tới lỗi ghi lại.

**Giữ nguyên toàn bộ bản ghi khi dạng chuẩn hóa của cả bản ghi không đổi.** Cách này đơn giản hơn, nhưng khi một trường khác trong cùng bản ghi có thay đổi ngữ nghĩa, nó cũng sẽ ghi đè trường ngẫu nhiên trong đó. Giữ theo nút lá giúp các quyết định này độc lập với nhau.

## Hệ quả

Việc ghi và refresh không còn ghi đè UUID message duy nhất và không đổi chỉ vì một sự kiện khác làm thay đổi bố cục bản ghi xung quanh, bất kể việc ghi đó do ACP, JSON-RPC hay Web đảm nhận. Việc refresh lặp lại cũng sẽ giữ lại giá trị fixture đã căn chỉnh mà bộ chuẩn hóa phân loại là dễ biến động; các loại giá trị dễ biến động mới được thêm vào bộ chuẩn hóa sau này cũng sẽ tự động kế thừa hành vi ghi lại này. Khi cấu trúc còn mơ hồ, hệ thống vẫn dùng chiến lược thận trọng: khi bản ghi không thể khớp, ánh xạ chuỗi xung đột, kích thước mảng thay đổi, chuỗi vừa có thay đổi ngữ nghĩa vừa có thay đổi dễ biến động, message định dạng sai, hoặc ID hay chỉ vân trong đồ thị message không duy nhất, đều dùng giá trị của lần sinh này, tránh mạo hiểm tái sử dụng dữ liệu chưa được căn chỉnh.

Unit test tập trung cố định mọi hình thái message surface mà predicate thẩm quyền của gói session nhận diện được, liên kết inbox/surface lưu bền, liên kết message cha/con trong phạm vi kịch bản, khớp message có thể ghi vào fixture kèm cwd, chèn sự kiện không liên quan, cách ly message định dạng sai, sự mơ hồ của đồ thị message trên cả hai trục ID và chỉ vân, việc ghi lại do một bên xử lý duy nhất đảm nhận, hành vi xử lý đệ quy đối tượng và mảng, xung đột ánh xạ, alias cwd của lần chạy này, chuỗi dễ biến động và trường ngữ nghĩa của lần sinh này. Test refresh keyless chứng minh rằng giá trị dễ biến động trong UUID phê duyệt, alias cwd, đường dẫn spill và việc đọc sự kiện không làm thay đổi bất kỳ byte nào của fixture đã commit.
