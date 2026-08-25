# Agent Note: Schedule tốc độ cố định có giới hạn

Status: implemented

[English](2026-08-09-bounded-fixed-rate-schedule.md) | Tiếng Việt

## Vấn đề

Người dùng cần lời nhắc lặp lại đơn giản, nhưng [lời nhắc bền vững, chỉ trong phạm vi Session](../feature/2026-08-05-durable-web-schedule.md) ban đầu lại dùng một tầng định kỳ coi khoảng cố định và biểu thức lịch như một hệ thống con tổng quát. Nó thêm vào ngôn ngữ Cron cùng bộ đánh giá, việc tìm thời điểm xảy ra nhạy múi giờ, quy tắc replay tzdata, cổng kiểm soát nạp vào 300 giây xuyên bản ghi, bằng chứng cổng được lưu bền, trường giao trễ, và trạng thái cạn cổng. Ngay cả khi hành vi được yêu cầu chỉ là "lặp lại mỗi N giây", những cơ chế này vẫn làm phình giao thức lưu bền và live owner.

Session ở trạng thái cold hoặc busy cũng không thể replay hiệu quả từng khoảng đã lỡ. Làm vậy sẽ tạo ra một hàng tồn lượt mô hình mà quy mô phụ thuộc vào thời gian ngừng hoạt động; còn nếu chuyển sang dời mục tiêu kế tiếp theo thời điểm giao, thì tốc độ cố định sẽ bị trôi.

## Quyết định

Selector định kỳ duy nhất được giữ lại là `every_seconds`, với giá trị phải là số nguyên an toàn tối thiểu bằng 300. Khi tạo, mục tiêu đầu tiên được lưu là thời điểm tạo cộng thêm một khoảng. Mỗi lần dispatch đều lưu id bản ghi và một `acceptedAt` do đồng hồ treo tường xác định; phép toán số nguyên thuần chọn ra thời điểm xảy ra mới nhất không muộn hơn thời điểm quyết định đó và thẳng hàng với mốc neo lúc tạo, rồi tiến thẳng tới mục tiêu thẳng hàng đầu tiên sau nó. Hệ thống không liệt kê, không lưu bền và không replay các thời điểm xảy ra đã lỡ.

Khi không có lời nhắc một lần nào đến hạn, mọi bản ghi Every quá hạn khác nhau đều tham gia cùng một lô follow-up theo thời gian mục tiêu và thứ tự tạo. Mỗi bản ghi đóng góp đúng một thời điểm xảy ra mới nhất, và mọi dispatch trong lô đó dùng chung một thời điểm quyết định. Lời nhắc một lần đã đến hạn vẫn được ưu tiên, nên lời nhắc đơn lẻ đã cam kết sẽ không bị lấp trong lô định kỳ.

Tối thiểu 5 phút là thuộc tính của chính từng quy tắc Every, không phải cổng toàn cục. Hệ thống không tồn tại `lastRecurringAcceptedAt`, `deliveryNotBefore`, thời gian chờ, hạn ngạch, trạng thái cạn cổng hay trừu tượng bản ghi định kỳ tổng quát. Nếu phép toán không biểu diễn được mục tiêu UTC kế tiếp với năm bốn chữ số, lần dispatch cuối cùng sẽ kết thúc bản ghi đó.

Biểu thức lịch và biểu thức Cron, cùng các phụ thuộc bộ đánh giá, parser, canonicalizer, tìm kiếm múi giờ, chứng minh tần suất, bản ghi lưu bền và biến thể dispatch, test, snapshot cùng các mục khai báo bên thứ ba tương ứng đều đã bị gỡ. Decoder phiên bản 1 nghiêm ngặt sẽ từ chối các bản ghi Cron cũ ở giai đoạn tiền phát hành, thay vì migrate chúng hoặc chấp nhận qua tàn dư tương thích.

## Các phương án đã cân nhắc

**Giữ cổng kiểm soát nạp vào định kỳ toàn cục.** Cổng dùng chung có thể ràng buộc tổng số lượt mô hình, nhưng lại khiến các lời nhắc không liên quan làm trễ lẫn nhau và cần lịch sử xuyên bản ghi được lưu bền. Việc xử lý theo lô vốn đã gộp mọi bản ghi tốc độ cố định quá hạn hiện tại vào một yêu cầu mô hình, còn khoảng tối thiểu của từng quy tắc thì ràng buộc tần suất đánh thức.

**Replay từng thời điểm xảy ra đã lỡ.** Cách này giữ được mọi sự kiện danh nghĩa, nhưng sẽ tạo hàng tồn vô hạn sau thời gian ngừng hoạt động và không phù hợp thói quen dùng lời nhắc. Chỉ đuổi theo lần mới nhất sẽ truyền đạt được công việc đang đến hạn mà không giả vờ rằng Session luôn ở trạng thái live.

**Tiến từ thời điểm dispatch.** Phép toán này đơn giản hơn, nhưng biến tốc độ cố định thành vòng lặp trễ bị trôi. Giữ mục tiêu kế tiếp thẳng hàng với mốc neo mới duy trì được khoảng mà người dùng đã đặt.

**Giữ Cron làm một nhánh tùy chọn.** Ngay cả khi bị cô lập sau selector, Cron vẫn cần cú pháp lịch, phụ thuộc, chính sách múi giờ và giờ mùa hè, kiểm chứng replay và phạm vi test đồ sộ. Khoảng cố định đã đủ phục vụ các tình huống định kỳ thiết thực mà không phát tán những phức tạp này.

**Mỗi lượt chỉ dispatch một bản ghi Every.** Cách này xử lý tuần tự những công việc quá hạn không liên quan, khiến nhiều lượt kế tiếp chỉ để xử lý nhóm bản ghi này. Một lô vừa giữ được các lời nhắc độc lập với nhau, vừa ràng buộc số yêu cầu mô hình.

## Kiểm chứng

Decoder nghiêm ngặt và test bất biến từ chối các quy tắc và hình thức dispatch không được hỗ trợ. Test miền và test thuộc tính chứng minh việc kiểm tra tần suất tối thiểu, phép toán neo theo thời điểm tạo, chỉ chọn lần mới nhất, việc tiến tới và việc cạn phạm vi. Test runtime chứng minh lời nhắc một lần được ưu tiên, mọi bản ghi Every quá hạn dùng chung một lô, mỗi bản ghi chỉ có một thời điểm xảy ra, thứ tự cố định, và không lặp xử lý hàng tồn ngay lập tức. Snapshot Web sau tổ hợp chứng minh rằng một lô gồm 2 bản ghi quá hạn tạo ra một phản hồi assistant thông thường cùng hai chuyển đổi lưu bền dùng chung thời điểm, và không tồn tại sidecar UI Schedule. Kiểm toán mã nguồn, phụ thuộc và danh mục sinh tự động từ chối tàn dư Cron và cổng toàn cục.

## Hệ quả

- Union quy tắc lưu bền gồm After, At và Every; union selector của tool gồm `after_seconds`, `at` và `every_seconds`.
- Khi mở lại Session đã cold lâu ngày, chỉ phát sinh công việc nhắc hiện tại, không kích hoạt dồn dập hàng loạt lượt lịch sử.
- Nhiều bản ghi Every quá hạn dùng chung một yêu cầu mô hình, nhưng không dùng chung trạng thái lập lịch và không làm trễ lẫn nhau.
- Tính định kỳ dựa trên lịch cần một ranh giới sản phẩm trong tương lai, chứ không phải mã tương thích ngủ đông.
