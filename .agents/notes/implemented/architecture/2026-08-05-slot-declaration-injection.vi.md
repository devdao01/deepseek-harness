# Agent Note: Inject theo khai báo slot và vòng đời reload

Status: implemented

[English](2026-08-05-slot-declaration-injection.md) | Tiếng Việt

## Vấn đề

Plugin phía client có thể đóng góp nội dung vào một slot trước hoặc sau plugin khai báo slot đó. Cơ chế inject service của Cordis không diễn đạt được phụ thuộc này: service chỉ có thể đóng vai trò tín hiệu thứ tự gián tiếp; các dependency trong manifest của client không quy định thứ tự kích hoạt; và ngay cả khi mọi service liên quan luôn được mount, slot vẫn có thể biến mất rồi xuất hiện lại. Vì vậy, việc đăng ký ngay lập tức sẽ tạo ra tình trạng tranh chấp với slot chưa được khai báo, còn việc chờ những service không liên quan lại ràng buộc chặt các tính năng đáng lẽ có thể reload độc lập.

Việc thay nóng ở cấp slot cũng đòi hỏi hai chủ sở hữu độc lập với nhau. Gỡ plugin khai báo phải gỡ toàn bộ đóng góp nằm dưới các slot con của nó; gỡ plugin đóng góp thì chỉ được gỡ những mục của chính plugin đó. Ngay cả khi việc biến mất và xuất hiện lại được gộp trong cùng một thông báo, một khai báo thay thế cho cùng một key vẫn thuộc về một vòng đời mới.

## Quyết định

`SlotRegistry.inject(name, callback)` lấy chính slot đã được khai báo làm dependency. Toàn bộ key của `SlotMap` được kiểm tra tĩnh; hệ thống không đưa vào bộ dựng namespace, service Cordis tổng hợp, hay `Context` riêng cho slot. Khi khai báo đã tồn tại thì callback chạy đồng bộ, ngược lại thì chờ; callback trả về một disposer đồng bộ, hoặc một iterable đồng bộ gồm nhiều disposer. Việc cài đặt iterable effect mang tính giao dịch: nếu một bước setup phía sau thất bại, hệ thống sẽ dispose theo thứ tự ngược lại tất cả effect đã yield trước đó.

Sổ cái này ghi lại declaration epoch độc lập với phiên bản các mục thông thường của slot. Mỗi lần một khai báo con được tạo ra hoặc bị thu gọn, epoch lại thay đổi. Lần inject sẽ ghi nhớ epoch đang hoạt động; khi epoch đó kết thúc, lần inject sẽ dispose các effect của callback; ngay cả khi trạng thái quan sát được sau cùng vẫn luôn là đã khai báo, callback cũng được chạy lại cho khai báo thay thế. Những thay đổi ở phần đóng góp thông thường không khởi động lại lần inject.

Phía khai báo và phía đóng góp giữ nguyên quyền sở hữu tự nhiên của mình. Bộ điều khiển inject và từng đóng góp đều chạy trên `Context` tại thời điểm plugin đóng góp gọi, nên dispose plugin đó sẽ gỡ đồng thời cả các mục đang chờ lẫn các mục đang hoạt động của nó. Cơ chế thu gọn phân tầng theo mục con vốn có của sổ cái slot sẽ gỡ các mục khi phía khai báo biến mất; sau đó, lần inject sẽ chạy disposer của nó để giải phóng tài nguyên ở tầng service, rồi tiếp tục chờ khai báo kế tiếp. Hệ thống không giữ lại `Context` của plugin khai báo làm nguồn capability, cũng không phơi bày nó cho phía đóng góp.

Mã reload động dùng fiber plugin Cordis thông thường làm đơn vị thay thế: kích hoạt module mới qua `ctx.plugin()`; trước khi mount module thay thế, dispose và chờ fiber cũ; các effect `slots.inject` và `slots.register` của fiber đó cũng thoát theo. Phần subscription của renderer sẽ quan sát thấy việc gỡ mục trong sổ cái và unmount component; không cần dựng cây fiber riêng cho slot.

## Quy ước về lỗi và vòng đời

Nếu khai báo đã tồn tại vào lúc tạo lần inject, thất bại ở bước setup của callback sẽ được báo cáo đồng bộ. Thất bại của callback xảy ra sau khi một khai báo trễ xuất hiện thì trước tiên sẽ hủy subscription và quay lui các effect đã thu thập, rồi mới báo cáo bên ngoài đợt làm tươi thông báo của slot, tránh để một bên đăng ký khiến các listener khác mất cơ hội được chạy. Gọi thẳng `slots.register()` để đăng ký vào một slot chưa khai báo vẫn ném ngoại lệ: inject là một cơ chế tường minh, không làm suy yếu việc kiểm tra tại thời điểm nạp.

Việc dispose một lần inject có tính lũy đẳng. Nó hủy subscription trước, rồi mới giải phóng các effect của callback đang hoạt động, tránh để thông báo sổ cái do quá trình tháo dỡ kích hoạt làm sống lại đóng góp đó. Phần teardown gắn với khai báo được đồng bộ với ranh giới sổ cái, nên tài nguyên tầng service được giải phóng trước bất kỳ lần đăng ký nào sau đó trong cùng một tick. Những lần inject đang chờ mà bị dispose cùng plugin thì không thể kích hoạt về sau.

## Phương án thay thế

**Dùng `ConversationController` hoặc service khác làm rào chắn thứ tự.** Sự tồn tại của service không xác định được khai báo tương ứng, và cũng không đi theo vòng đời reload của khai báo; ngoài ra, những bên đóng góp chỉ lo phần hiển thị sẽ phát sinh phụ thuộc package giả tạo.

**Bắc cầu mỗi khai báo thành một service Cordis `slot:<name>`.** Cách này làm ô nhiễm namespace của service, biến một key động viết sai chính tả thành trạng thái chờ service âm thầm, và ngụy trang trạng thái sổ cái thành năng lực nghiệp vụ. Cơ chế inject slot nguyên bản cung cấp đúng khả năng chờ đó mà không cần thay đổi cấu trúc topology của Cordis.

**Tạo một Cordis context hoặc fiber cho mỗi slot.** Cái mà phía đóng góp cần là giao của vòng đời plugin của chính nó với vòng đời khai báo, chứ không phải năng lực của phía khai báo. Context sở hữu bởi slot sẽ kéo theo vấn đề kế thừa capability và tháo dỡ hai cha, mà vẫn không cải thiện được quyền sở hữu sổ cái.

**Để `register()` chờ một cách ngầm định.** Việc thất bại ngay với mục tiêu chưa khai báo là một phép kiểm tra cấu hình có giá trị. Cơ chế inject tường minh phân biệt được đóng góp cố ý sắp thứ tự độc lập với tổ hợp sai.

**Chỉ dựa vào `spec(name) !== undefined` để xác định việc thay thế.** Việc thu gọn rồi khai báo lại có thể gộp thành một thông báo mà trạng thái cuối cùng luôn tồn tại, trong khi đóng góp cũ lúc đó đã bị gỡ. Declaration epoch giữ lại ranh giới vòng đời này.

## Ảnh hưởng

Phụ thuộc slot có thể được kiểm tra ngay tại điểm đăng ký, và đi theo việc thay thế khai báo mà không cần quy ước thứ tự riêng cho từng package. Việc dispose plugin động sẽ gỡ các mục đã render thông qua effect sẵn có của Cordis, còn việc thay thế khai báo cung cấp một hook ổn định cho HMR ở cấp slot về sau.

Runtime duy trì thêm một epoch đơn điệu cho mỗi slot được truy cập, và callback inject bắt buộc phải trả về thao tác dọn dẹp. Callback đăng ký nhiều mục thì dùng iterable effect, giúp setup và teardown giữ được tính nguyên tử. Sổ cái key phẳng dạng chấm phân tách và thẩm quyền tổ hợp duy nhất của `register()` vẫn giữ nguyên.
