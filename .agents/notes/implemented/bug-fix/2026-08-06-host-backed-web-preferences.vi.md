# Agent Note: Lưu bền vững tùy chọn người dùng Web thông qua Host settings

Status: implemented

[English](2026-08-06-host-backed-web-preferences.md) | 中文

## Vấn đề

Tùy chọn Appearance, Language và chế độ Enter khi bận của Web trước đây được lưu trong `localStorage` của trình duyệt. Storage của trình duyệt có phạm vi theo origin, nên mở lại `dsh web` ở một cổng khác sẽ chọn một phân vùng lưu trữ khác và mất lựa chọn đã chọn, dù cả hai tiến trình dùng chung một DSH home. Đây là các tùy chọn sản phẩm cấp người dùng; việc chọn phiên, bản nháp, trạng thái mở rộng/thu gọn và các trạng thái tạm thời khác của trình duyệt vẫn giữ nguyên trong trang.

Bản triển khai theme đầu tiên chỉ chuyển Appearance sang Host settings, nhưng lại chờ một RPC ban đầu trước khi cung cấp `ThemeRuntime`. Vì vậy request settings chậm hoặc không khả dụng sẽ khiến trang đã lắp ráp bị treo. Bản triển khai đó cũng chỉ thiết lập subscription sau khi đọc, có thể bỏ lỡ thông báo invalidation trong khoảng thời gian đó; nó ghi mà không kèm theo namespace revision, và cho phép các lần ghi đã xếp hàng từ plugin đã được release vẫn đến được Host.

## Quyết định

Nửa Host thuộc từng domain đăng ký ba schema: `locale.preference` tùy chọn (`zh` hoặc `en`, để trống thì để trình duyệt tự quyết định), `ui-theme.preference` (`light`, `dark` hoặc `system`, mặc định `system`), và `ui-conversation.busyEnter` (`queue` hoặc `steer`, mặc định `queue`). Provider settings cục bộ lưu lựa chọn tường minh vào `$DSH_HOME/settings.yaml`, khi dùng home mặc định thì đường dẫn này phân giải thành `~/.dsh/settings.yaml`. API proxy phơi bày tường minh ba namespace này, song song với các Web settings khác; chỉ đăng ký chúng, không bao giờ vượt ranh giới cấu hình đó.

Client runtime cung cấp cho mỗi namespace một lifecycle `bindSettingsScope` — bản mirror phía trình duyệt của seam settings owner phía Host. Nó cài listener `settings/changed` và `connection/reset` trước khi bắt đầu đọc ban đầu ở background, nên bất kỳ transport settings nào cũng không chặn việc kích hoạt plugin, và thông báo invalidation cũng không rơi vào khoảng trống đọc-trước-subscribe-sau; nó còn publish một store snapshot cho domain service subscribe (state, giá trị section, revision, khả năng ghi, chế độ host/in-memory). Bộ decoder mặc định xác thực từng section đến dựa trên wire schema serialize của chính namespace đó (khôi phục qua dsh-client-schema-form), nên mỗi domain không cần mang theo wire validator tự viết tay. Domain service nhận scope như một collaborator constructor bình thường, publish ngay giá trị mặc định tạm thời của riêng mình: locale suy ra từ trình duyệt, theme hệ thống và Queue; sau đó áp dụng section Host đã được chấp nhận, nhưng không ghi ngược lại; các service được khởi tạo mà không có scope — từ điển độc lập hoặc policy fixture (dữ liệu chuẩn bị sẵn cho test) — chỉ ở lại cục bộ trong tiến trình.

Thay đổi của người dùng cập nhật đồng bộ cho service đang chạy, và xếp hàng một thao tác đường dẫn `settings.mutate` thông qua `scope.set`. Scope xử lý tuần tự các thao tác, gửi kèm revision namespace mới nhất đã biết dưới dạng `expectedRevision`, ghi lại revision của mỗi lần ghi thành công, và chỉ cho phép kết quả settle của lần ghi mới nhất được publish lại thành state đang chạy. Khi lần ghi mới nhất bị từ chối hoặc thất bại, scope sẽ nạp lại state từ Host. Việc release plugin từ chối công việc mới, bỏ qua thao tác đã xếp hàng, ngăn thao tác đang chạy publish state, và đợi thao tác đó settle xong mới cho plugin đạt trạng thái dừng hoàn toàn.

Trình duyệt remote không thể gọi API cấu hình chỉ dành cho request loopback, nên tùy chọn của nó chỉ giữ trong tiến trình. Id theme bên thứ ba động vẫn là phần mở rộng trong-tiến-trình nằm ngoài schema Host tích hợp sẵn; xóa một theme sẽ reset registry đang chạy, nhưng không thay thế tùy chọn tích hợp sẵn đã lưu bền vững trước đó.

## Các phương án thay thế đã cân nhắc

**Giữ `localStorage`, và sao chép giá trị giữa các cổng.** Một origin không thể liệt kê storage của origin khác, và Host relay sẽ phải triển khai lại toàn bộ dịch vụ settings xoay quanh định dạng riêng của trình duyệt.

**Mirror Host settings vào `localStorage`.** Có thêm một nguồn thẩm quyền thứ hai sẽ đòi hỏi định nghĩa thêm quy tắc xung đột khi khởi động và khi invalidation, đồng thời vẫn giữ lại chính phân vùng đã gây ra lỗi này. Tài liệu Host settings là nguồn lưu bền vững duy nhất và có thẩm quyền.

**Chờ lần đọc đầu tiên để tránh render tạm thời.** Việc vẽ trang không nên bị điều kiện hóa bởi cấu hình đã sẵn sàng hay chưa. Lần đọc ở background có thể gây ra một lần hội tụ thực tế, nhưng nó cô lập lỗi và giữ lại các đường fallback trình duyệt/hệ thống/mặc định sẵn có.

**Để mỗi domain có bộ điều khiển settings riêng.** Quy tắc concurrency, revision, thất bại, invalidation và release giống hệt nhau; bản triển khai theme trước đây đã tạo ra sự lệch lifecycle do sao chép các quy tắc này. Để domain sở hữu schema giúp tránh đưa policy sản phẩm vào runtime dùng chung.

**Bộ điều khiển tùy chọn theo từng trường với cặp callback sync/persist.** Bản lifecycle dùng chung đầu tiên đồng bộ từng trường vô hướng qua callback `sync` do domain cung cấp, còn service ghi ngược lại qua callback `persist` được inject. Cặp callback phụ thuộc lẫn nhau này buộc việc khởi tạo phải chia làm hai giai đoạn — writer ban đầu mặc định là no-op, sau đó được thay thế qua `bindPersistence` — mỗi trường mới thêm vào namespace vốn phải mang theo một bộ điều khiển riêng và một lần đọc toàn tài liệu, và mỗi domain đều khai báo lại một validator viết tay mà wire schema đã đăng ký vốn đã diễn đạt sẵn. Namespace scope publish một snapshot cho service subscribe và nhận ghi trực tiếp, nên cặp callback này lẫn giai đoạn khởi tạo thứ hai đều không còn cần thiết.

**Chuyển mỗi mục `localStorage` sang settings.** Phiên hiện tại, bản nháp, trạng thái mở rộng panel, trạng thái hiển thị trajectory và các mục tương tự thuộc về trạng thái tức thời của instance trình duyệt, chứ không phải cấu hình người dùng. Nâng chúng lên thành settings sẽ đồng bộ trạng thái điều hướng ngắn hạn giữa các tab và cổng mà không có bất kỳ hợp đồng sản phẩm nào cho việc đó.

## Hệ quả

Lựa chọn Appearance, Language và Enter khi bận sẽ đi theo DSH user home, xuyên qua các lần reload, các cổng và origin loopback. Thay đổi phát sinh từ việc sửa trực tiếp `settings.yaml` sẽ hội tụ qua luồng invalidation hiện có, còn các mục cũ `dsh.theme`, `dsh.locale` và `dsh.conversation.busyEnter` sẽ không còn được đọc lẫn được ghi.

Khi khởi động có thể thoáng thấy giá trị mặc định của domain trước khi lần đọc ở background settle xong. Lỗi đọc ngắn hạn sẽ giữ nguyên giá trị mặc định đó hoặc giá trị đúng trước đó trong tiến trình; khi kết nối lại sẽ thử lại. Khi ghi bị từ chối, giao diện có thể phục hồi rõ rệt về tùy chọn đã lưu bền vững sau khi giá trị cục bộ vừa thay đổi ngay lập tức.

Unit test có mục tiêu bao phủ việc đăng ký schema, thứ tự lắng nghe trước rồi mới đọc, kích hoạt không chặn, việc chấp nhận section đã qua xác thực bằng schema, ghi có thứ tự kèm revision, cô lập phản hồi lỗi thời, phục hồi sau lỗi, dừng hoàn toàn khi release, và chế độ chỉ-in-memory ở phía remote. Scope theo từng namespace cũng mang được section nhiều trường, nên các mặt cấu hình sau này có thể tái dùng chung lifecycle này mà không cần tự lắp tay việc đồng bộ describe/mutate. Kịch bản Web settings không cần key ghi cả ba tùy chọn qua UI, xác thực tài liệu YAML và xác nhận `localStorage` cũ trống, reload lại, rồi khởi động một Host khác trên cổng khác nhưng dùng cùng DSH home.
