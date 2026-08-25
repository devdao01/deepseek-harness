# Agent Note: Thanh chi tiết Web tuân theo vòng đời của phiên hiện tại

Status: implemented

[English](2026-07-29-web-details-session-lifecycle.md) | Tiếng Việt

## Vấn đề

Mục chi tiết do phạm vi phiên sở hữu, còn chiều rộng lưới ưa dùng của nó lại do phạm vi gốc sở hữu. Khi chọn một phiên khác, hệ thống thay thế nội dung chi tiết nhưng không đóng chiều rộng ưa dùng đó ở phạm vi gốc, nên owner mới kế thừa thông tin hình học hiển thị đã cũ. Hero và các trạng thái chưa chọn khác không render phần chi tiết thuộc phạm vi phiên; track của chúng cần được suy ra bằng chiều rộng bằng không, nhưng không được vì thế mà trở thành owner giả trong phép so sánh.

## Quyết định

`AppFrame` đọc id phiên hiện tại và cờ `blank` trong phần tóm tắt của nó từ bản chiếu phiên có thẩm quyền. Nó chỉ ghi lại id phiên không-blank được chọn sau cùng khi phiên đó có khả năng sở hữu phần chi tiết, nên Hero và các trạng thái chưa chọn khác vừa không kích hoạt việc đóng, vừa không thay thế owner phiên sau cùng; ở những trạng thái này, chiều rộng render của track thanh chi tiết được suy ra bằng không, còn chiều rộng ưa dùng được lưu vẫn giữ nguyên. Phiên đầu tiên giữ giá trị ưa dùng khởi tạo của layout store, mà [quyết định đã lưu trữ về giá trị mặc định của khả năng hiển thị](../../archived/bug-fix/2026-07-30-web-details-default-closed.md) chọn là đóng; khi quay lại cùng phiên đó thì khôi phục chiều rộng hiện tại của nó; khi chọn một phiên khác, hệ thống trước tiên đóng chiều rộng ưa dùng của thanh chi tiết lưu ở phạm vi gốc thông qua layout store, rồi mới vẽ. Mục chat được chọn theo từng phiên vẫn do store phạm vi phiên sở hữu, như mô tả trong [chuẩn hệ thống slot](../architecture/2026-07-22-slot-type-chain-implementation.md).

Layout store là trạng thái nhất thời, thanh chi tiết giữ trạng thái đóng khi khởi động. Nó không đọc cũng không ghi `localStorage`, nên tải lại trang sẽ khôi phục giá trị mặc định của sidebar và giữ thanh chi tiết đóng, không cần ngoại lệ đường cơ sở phiên. Việc đóng và mở lại thanh chi tiết thủ công trong cùng một phiên không thay đổi vẫn giữ nguyên hành vi cũ. Effect vòng đời này không làm thay đổi [luồng New Session do Workspace sở hữu](../feature/2026-07-25-workspace-ui-product-flow.md), bản nháp composer, việc điều hướng phiên hay tỉ lệ co giãn của chain nhường chỗ.

## Các phương án đã cân nhắc

**Đóng thanh chi tiết ngay trong handler click của New Session.** Bị bác bỏ vì: bề mặt chưa chọn không có phần chi tiết thuộc phạm vi phiên, nên không được sửa thông tin hình học. Việc thanh chi tiết có đóng hay không phải do phép so sánh ngay sau đó giữa hai owner phiên đã xác định quyết định.

**Lưu bền vững thông tin hình học của panel theo từng phiên.** Bị bác bỏ vì: quy ước sản phẩm cần loại bỏ context đã cũ, chứ không phải thêm một bảng ánh xạ lưu các chiều rộng. Lưu hình học theo phiên còn khiến thanh chi tiết mở lại khi người dùng quay về, trái với hành vi rời đi là đóng đã được chọn.

**Giữ bố cục lưu bền vững sau khi đường cơ sở phiên sẵn sàng.** Bị bác bỏ vì: như vậy là hiện thực lại vòng đời khởi động trong component hiển thị chỉ để kiểm chứng trạng thái hiển thị đã cũ. Giá trị mặc định nhất thời làm cho việc tải lại có tính xác định mà không cần cờ sẵn sàng.

**Coi mọi thay đổi của bản chiếu hiện tại đều là chuyển phiên.** Bị bác bỏ vì: việc hiện thực hóa lúc khởi động, Hero, xóa mục chọn và mục chọn mất hiệu lực đều không phải là chuyển tiếp giữa hai owner phiên.

## Hệ quả

Thanh chi tiết giữ trạng thái đóng khi khởi động, kể cả lúc phiên đầu tiên được hiện thực hóa. Thao tác mở tường minh sẽ dùng chiều rộng mặc định theo quy ước. Chuyển sang phiên khác sẽ quên chiều rộng chi tiết sau khi kéo, vì thao tác đóng ghi giá trị không, và khi mở lại thì dùng giá trị mặc định đó. Trạng thái chưa chọn sẽ suy ra chiều rộng render của track bằng không, đồng thời giữ nguyên thông tin hình học ưa dùng; khi quay lại cùng phiên qua những trạng thái này thì chiều rộng của nó được khôi phục. Tải lại trang sẽ quên thông tin hình học của sidebar và đưa thanh chi tiết về trạng thái đóng. Test hành vi bố cục bao phủ giá trị mặc định ban đầu, lần hiện thực hóa đầu tiên, việc chuyển phiên trực tiếp cũng như chuyển qua trung gian Hero, việc quay lại cùng phiên, và trường hợp không tồn tại kho lưu bố cục; còn e2e trình duyệt không cần khóa thì điều khiển chính các chuyển tiếp owner đó qua tổ hợp đã bàn giao, đồng thời kiểm tra đầy đủ các track lưới và lỗi trình duyệt.
