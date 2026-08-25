# Agent Note: Giao Schedule theo lối hội thoại

Status: implemented

[English](2026-08-09-conversational-schedule-delivery.md) | Tiếng Việt

## Vấn đề

Schedule vốn đã giao lời nhắc đến hạn bằng cách xếp hàng một lượt agent (tác tử) tiếp theo thông thường. Một biên nhận Web lưu bền thứ hai lại biểu diễn cùng một lần kích hoạt lời nhắc thông qua phép chiếu Schedule, sự kiện thành công được lưu bền, lịch sử Host cùng dữ liệu đồng hành live, việc nâng cấp cùng số thứ tự ở phía client, slot view sự kiện tổng quát và một renderer chuyên biệt. Đường đi này rải UI xác nhận của một tính năng ra khắp session, persistence, Host, runtime client, UI hội thoại và một gói bổ sung.

Biên nhận đó còn khiến "giao" mang nghĩa thứ hai. Ngay cả khi lượt mô hình thất bại, nó vẫn hiển thị, trong khi bản thân cuộc hội thoại không có câu trả lời nhắc thành công nào. Người dùng cần cuộc hội thoại theo lịch tiếp diễn; họ không cần một dấu lưu bền riêng để chứng minh rằng dispatch nội bộ đã được thử.

## Quyết định

Lời nhắc đến hạn sẽ chờ idle maintenance phase của agent rồi mới gọi `followup()`. Thao tác này mở một lượt thông thường sau đó và hiển thị qua transcript hội thoại thông thường (bản ghi văn bản); Schedule tuyệt đối không gọi `steer()`, và cũng tuyệt đối không ngắt lượt hiện tại.

`schedule/change` vẫn là trạng thái Schedule lưu bền duy nhất. Thao tác dispatch của nó ghi lại rằng lượt tiếp theo đã được xếp hàng đồng bộ, điều này ngăn việc replay khởi động lại thông thường sau khi dispatch được lưu bền. Dispatch không biểu thị mô hình thành công, người dùng xác nhận hay thông báo bên ngoài. Cửa sổ sập hẹp giữa lúc xếp hàng và lúc dispatch được lưu bền vẫn giữ ngữ nghĩa ít nhất một lần.

Schedule không phơi bày phép chiếu trình bày, dữ liệu đồng hành Host, node sự kiện trình duyệt, slot khóa theo sự kiện hay renderer phía client. Persistence của session giữ nguyên quy ước `flush()` dùng chung, và không tồn tại sự kiện thành công do Schedule dẫn dắt. Overlay Web được bật tường minh chỉ nạp `@deepseek-ai/dsh-schedule`.

## Các phương án đã cân nhắc

**Giữ biên nhận nhận biết commit.** Ngay cả khi mô hình thất bại, nó vẫn chứng minh được dispatch đã tới persistence, nhưng đó là kết quả hiện thực chứ không phải lời nhắc của người dùng. Giao thức xuyên thành phần và logic gộp cùng số thứ tự đến sau của nó không tương xứng với giá trị này.

**Render sự kiện `schedule/change` thô ngay trong hội thoại.** Cách này tránh được thẻ theo miền, nhưng vẫn phơi bày chuyển đổi trạng thái nội bộ thành thông điệp hướng tới người dùng, và chỉ vì Schedule mà cần một cơ chế trình bày sự kiện nội bộ tổng quát.

**Coi dispatch là lời nhắc đã giao thành công.** Dispatch xảy ra trước yêu cầu mô hình, nên không chứng minh được câu trả lời assistant tồn tại hay đã được đọc. Gọi nó là đã giao là phóng đại sự thật lưu bền.

**Chen ngang lượt hiện tại khi lời nhắc đến hạn.** Chen ngang làm đổi đường đi của yêu cầu đang chạy và khiến kích hoạt theo lịch cắt ngang công việc không liên quan. Chờ hoàn toàn idle rồi dùng `followup()` giúp mỗi lời nhắc lần lượt vào một lượt tiếp theo thông thường.

## Kiểm chứng

Test vòng đời của gói ghim việc chờ idle, quyền sở hữu maintenance, thứ tự lượt tiếp theo trước dispatch, thất bại xếp hàng đồng bộ, dispatch độc lập với mô hình và replay khởi động lại. Kịch bản Web sau tổ hợp sinh snapshot cho dòng assistant được tạo ra và khẳng định rằng dispatch Schedule đã lưu bền không có history view đặc biệt. Kiểm toán mã nguồn và phụ thuộc từ chối các ký hiệu trình bày, sự kiện, sidecar, slot, gói renderer và mục cấu hình overlay còn sót lại sau khi gỡ.

## Hệ quả

- Hiện thực của Schedule chỉ liên quan tới gói của chính nó, phần tổ hợp thông thường và đấu nối danh mục; session, persistence, Host, runtime client và UI hội thoại không mang hành vi riêng của Schedule.
- Người dùng chỉ thấy lời nhắc qua phản hồi mô hình thông thường trong hội thoại. Lượt mô hình thất bại vẫn là lượt thất bại, không xuất hiện biên nhận thành công mâu thuẫn với nó.
- Bên tiêu thụ cần giao hàng bên ngoài hoặc xác nhận đã giao phải dùng một ranh giới sản phẩm khác, và bên đó sở hữu ngữ nghĩa thông báo cùng xác nhận của riêng mình.
