# Agent Note: Tính bất biến của session do phía nguồn sở hữu và bất biến thức (invariant) chế độ dev

Status: implemented

[English](2026-06-11-dev-invariants-over-deep-readonly.md) | Tiếng Việt

## Vấn đề

Session log cần hai loại bảo vệ khác nhau: quyền sở hữu bất biến đối với từng fact đã lưu trữ, và việc kiểm tra các quan hệ giữa những fact đó trải dài theo thời gian và theo các quy ước dịch vụ. Nếu gộp cả hai vào một plugin dev tùy chọn, lịch sử ở môi trường production sẽ mất bảo vệ; nếu cố diễn đạt cả hai bằng kiểu TypeScript readonly, sẽ không tạo được ranh giới runtime, cũng không mô tả được các quy tắc quan hệ.

Session log là nguồn sự thật lâu dài (persistent source of truth) cho việc replay, tái tạo request, lưu trữ bền vững và lịch sử hiển thị cho người dùng. Code bên ngoài gói session phải có thể xem xét lịch sử, nhưng không được giữ một tham chiếu có thể sửa lại lịch sử sau đó; input nhận từ phía gọi cũng không được tiếp tục liên kết tới một đối tượng có thể thay đổi do phía gọi sở hữu.

Tính bất biến của từng giá trị đơn lẻ chỉ là một nửa của quy ước. Một log có thể chứa các bản ghi hoàn toàn bất biến, nhưng thứ tự của chúng, việc lồng turn/step, việc ghép cặp tool call, việc phân phối theo scope, hoặc request mô hình được tái tạo lại vẫn có thể sai. Những quy tắc này liên quan đến nhiều bản ghi hoặc nhiều dịch vụ, không thể thiết lập chỉ bằng cách đóng băng một đối tượng đơn lẻ.

Kiểu TypeScript readonly không phải là ranh giới runtime đầy đủ. Chúng biến mất khi chương trình chạy, việc ép kiểu (type cast) có thể bỏ qua chúng, còn `DeepReadonly<T>` đệ quy sẽ lan ra mọi phía tiêu thụ log và message, dù một số API xử lý request downstream cố ý sử dụng giá trị có thể thay đổi.

## Quyết định

Trách nhiệm được chia cho ranh giới lưu trữ luôn bật và các assertion (khẳng định) dev tùy chọn.

### Session sở hữu lịch sử bất biến

`Session` chỉ chấp nhận event sau khi một lượt duyệt đệ quy hoàn tất việc hiện thực hóa (materialize) một snapshot JSON không mất dữ liệu. Lượt duyệt này từ chối các giá trị không được hỗ trợ, và tạo ra các bản ghi tách biệt (detached), chính xác để đưa vào log, do đó việc xác thực và lưu trữ không quan sát các giá trị khác nhau từ getter có trạng thái, cũng không giữ lại tham chiếu lồng nhau do phía gọi sở hữu.

Các event đã được chấp nhận cùng toàn bộ con cháu của chúng được đóng băng sâu (deep-frozen) trước khi phát hành. `append()` trả về event đã đóng băng do Session sở hữu, listener `session/event` nhận cùng bản ghi đó, còn `session.events` trả về snapshot mảng đã đóng băng. Các mảng đã trả về trước đó sẽ không tăng lên do các lần append sau. Bản ghi seed đi qua cùng ranh giới xác thực, snapshot và đóng băng trước khi constructor thành công.

Bảo đảm này thuộc về `Session` chứ không phải một listener tùy chọn, vì mỗi tổ hợp đều phụ thuộc vào lịch sử đáng tin cậy. Dù có đăng ký plugin hỗ trợ dev hay không, deployment production, test tập trung, hay embedding tùy chỉnh đều nhận cùng ngữ nghĩa lưu trữ.

### Request phái sinh (derived) giữ tách biệt

`deriveMessages()` chiếu (project) các event bề mặt đã ghi thành các đối tượng `Message` tách biệt, đóng băng sâu, và trả về một snapshot mảng mới. Do đó việc lắp ráp request có thể kết hợp lịch sử phái sinh với các input khác mà không lộ ra đường quay lại log. Cache tái sử dụng an toàn các projection bất biến, thay vì clone lại toàn bộ lịch sử cho mỗi lần gọi mô hình.

### Plugin đồng hành do package sở hữu kiểm tra bất biến thức (invariant) về quan hệ

`dsh-invariants` đăng ký dịch vụ `ctx.invariants` có thể cấu hình, bản thân nó không chứa kiểm tra sản phẩm nào. Mỗi package phát hành một plugin đồng hành `./invariant` sở hữu; `dsh-session`, `dsh-agent`, `dsh-scope` và `dsh-agent-loop` hiện thêm các quy tắc cần theo dõi trạng thái hoặc quan sát một seam khác: số thứ tự tăng đơn điệu, lồng turn và step, ghép cặp tool call/result, các chuyển trạng thái agent (smart agent) hợp lệ, phân phối theo scope đúng chủ thể, và sự bằng nhau giữa request do loop xây dựng với request được tái tạo từ tiền tố session log của nó. Việc bật toàn cục và bộ lọc regex tên package thuộc về dịch vụ này (xem [Dịch vụ bất biến thức do package sở hữu](2026-07-19-package-owned-invariant-service.md)).

Khi plugin đồng hành session được gắn vào một session đã có sẵn hoặc một session được khởi tạo bằng bản ghi seed, nó sẽ replay lại log bất biến để tái dựng trạng thái theo dõi. Dịch vụ cung cấp cho mỗi đóng góp một fiber con có thể dispose (giải phóng tài nguyên), nên hot reload giữa chừng turn là an toàn, đồng thời không trao cho logic chẩn đoán quyền sở hữu đối với việc lưu trữ session.

## Các phương án thay thế từng cân nhắc

### Kiểu deep-readonly toàn diện

Một đề xuất đồng hành đã bị bác bỏ sẽ áp dụng kiểu `DeepReadonly<T>` đệ quy lên các interface log và message công khai, biến các đường đọc session (`events`, listener `session/event`, `deriveMessages()`) thành deep-readonly, trong khi vẫn giữ waterfall (chuỗi sự kiện dạng thác) đang diễn ra có thể thay đổi. Điều này có thể cung cấp phản hồi cho editor, nhưng không cung cấp bảo đảm runtime: kiểu TypeScript bị xóa khi chạy, code plugin có thể vượt qua bằng cách ép kiểu. Nó còn đẩy kiểu readonly vào các phía tiêu thụ vốn cố ý cần chỉnh sửa. Bảo vệ quyền sở hữu ở runtime tại ranh giới `Session` bảo vệ mọi phía gọi mà không cần lan truyền kiểu như vậy.

### Chỉ đóng băng ở chế độ dev

Chỉ đóng băng lịch sử khi plugin bất biến thức được cài đặt sẽ khiến bảo đảm cốt lõi phụ thuộc vào cách tổ hợp. Code có thể qua được test dev nhưng phá vỡ lịch sử ở môi trường production hoặc trong tổ hợp tập trung đã bỏ qua plugin đó. Vì vậy tính bất biến lưu trữ luôn được bật, còn việc kiểm tra quan hệ tốn kém hơn vẫn là hỗ trợ dev tùy chọn.

### Chỉ clone khi phái sinh message

Tách `deriveMessages()` bảo vệ được đường request phổ biến nhất, nhưng các phía đọc khác của `session.events`, giá trị trả về của append, và listener event session vẫn có thể sửa lịch sử bền vững. Log phải tự bảo vệ ranh giới của chính nó; projection phái sinh là một ranh giới cô lập bổ sung, không phải thay thế.

## Hệ quả

- Mỗi event session (trực tiếp hoặc seed) đã được chấp nhận đều được tách khỏi input do phía gọi sở hữu và bất biến sâu trước khi bất kỳ observer nào nhận được nó.
- `session.events` phơi bày snapshot bất biến ổn định, thay vì một mảng riêng tư liên tục tăng trưởng.
- Việc sửa đổi phía request không thể chạm tới lịch sử đã lưu trữ thông qua message phái sinh.
- Bản build dev có thể bật assertion về quan hệ mà không thay đổi hành vi lưu trữ; dispose hoặc lọc một plugin đồng hành không làm suy yếu tính bất biến của log.
- `dsh-invariants` cấu hình trạng thái bật toàn cục cùng danh sách regex cho phép/chặn theo tên package; mỗi kiểm tra vẫn do package sản phẩm của nó sở hữu và kiểm thử.
- Ranh giới runtime tạo ra chi phí snapshot đệ quy và đóng băng một lần cho mỗi event đã chấp nhận; các phía đọc và projection cache sau đó tái sử dụng bản ghi bất biến đã sở hữu.
