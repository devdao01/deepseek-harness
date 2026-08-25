# Agent Note: Giới hạn cơ sở diff cho context ghi đè ở phía nhà cung cấp

Status: implemented

[English](2026-07-30-bounded-overwrite-diff-basis.md) | Tiếng Việt

## Vấn đề

`dsh-fs-local` trả về toàn bộ tệp cũ trong `FsWriteOutcome.before` để bên tiêu thụ sinh diff context cho thao tác ghi đè. Lần đọc trước này, vốn chỉ dùng để hiển thị, lại không có giới hạn: ghi đè tệp lớn có thể cấp phát cả tệp cũ; mà chỉ kiểm tra stat theo đường dẫn từ trước cũng không thực sự áp đặt được giới hạn, vì tiến trình bên ngoài có thể thay thế tệp hoặc làm tệp phình to trong khoảng giữa lúc stat và lúc đọc. Ngay cả khi tệp cũ rất nhỏ, nội dung thay thế lớn cũng khiến hunk context xấp xỉ kích thước của chính nội dung thay thế. Thay đổi lần này khép lại hạng mục giới hạn còn tạm hoãn được ghi trong [diff hunk áp dụng tại thời điểm trả kết quả](../../archived/architecture/2026-07-02-result-time-applied-hunk-diffs.md).

## Quyết định

`LocalFileSystem.Config.diffBasisMaxBytes` là một cấu hình triển khai kiểu số nguyên dương an toàn, không vượt quá giới hạn cấp phát Buffer và giải mã chuỗi của runtime, mặc định 10 MiB. Thao tác ghi đè chỉ cung cấp `before` khi nội dung thay thế UTF-8 nhỏ hơn hẳn giới hạn đó, và tệp cũ được mở để sinh cơ sở rốt cuộc cũng nhỏ hơn giới hạn đó. Việc đọc tệp cũ sẽ mở một file descriptor, kiểm tra chính descriptor đó, và đọc tối đa số byte đã cấu hình theo từng khối có thể đáp ứng việc hủy; vừa chạm biên là trả về `null`. Nếu kích thước thay đổi sau khi stat descriptor thì cũng trả về `null`, ngay cả khi kích thước cuối cùng vẫn dưới giới hạn, vì một tiền tố cục bộ sẽ trở thành cơ sở diff sai. Nội dung cũ là nhị phân hoặc UTF-8 không hợp lệ thì cũng trả về `null`; mọi errno ở giai đoạn descriptor cũng vậy — tệp cũ bị xóa hoặc trở nên không đọc được sau khi bên gọi kiểm tra trước và trước khi mở đọc cơ sở thì không được phép làm hỏng thao tác ghi mà bên gọi đã commit; chỉ việc hủy và các sự cố không phải errno mới tiếp tục lan lên trên. Không kết quả nào trong số này ngăn cản thao tác ghi nguyên tử.

Nhà cung cấp local sở hữu quyết định này, vì `before` là cơ sở tùy chọn, nỗ lực-tối-đa do nó cung cấp: khi cặp giới hạn đã cấu hình đã khiến nội dung thay thế không đủ điều kiện, nó có thể bỏ qua việc lấy nội dung cũ. `tool-fs` vẫn sở hữu việc tính diff, lưu giữ và hiển thị. Cấu hình này độc lập với `tool-fs.readStreamMinSize`; định tuyến đọc và hiển thị ghi đè là hai chính sách khác nhau, không cần dùng chung con số.

`before: null` yêu cầu bên tiêu thụ dùng phương án dự phòng nguyên-tệp sẵn có. Giới hạn này chỉ chặn chi phí lấy thêm nội dung cũ, và điều kiện hợp lệ của cặp nội dung context; nó không giới hạn nội dung thay thế mà bên gọi đang giữ, giá trị `after` được trả về, hay việc render dự phòng của bên tiêu thụ.

## Các phương án đã cân nhắc

**Giữ một ngưỡng ghi cứng bằng với ngưỡng stream của công cụ đọc.** Bác bỏ, vì ngưỡng đọc có thể cấu hình theo triển khai và thuộc quyền sở hữu của bên tiêu thụ. Hai hằng số cùng giá trị sẽ tạo ra một ràng buộc nhất quán không thể cưỡng chế, trong khi cơ sở ghi đè tự nó cũng là lựa chọn về bộ nhớ và hiển thị ở tầng triển khai.

**Nhà cung cấp chỉ giới hạn phía nội dung cũ, còn giới hạn diff nội dung mới thì đặt trong `tool-fs`.** Bác bỏ, vì khi cặp giới hạn đã cấu hình ở nhà cung cấp đã loại nội dung thay thế ra rồi, cách này vẫn đi lấy văn bản cũ; đồng thời nó xé cùng một quy tắc hợp lệ của `before` ra hai plugin. Bên tiêu thụ vẫn được tự do áp thêm giới hạn đầu ra.

**Tin vào kích thước của lần `probe()` đầu tiên rồi thực hiện đọc nguyên tệp thông thường.** Bác bỏ, vì kích thước đó có thể đã cũ trước khi đọc; việc đọc theo descriptor phải áp giới hạn lên đúng đối tượng mà nó thực sự đọc.

**Sinh diff context theo kiểu stream cho nội dung lớn tùy ý.** Bản sửa lỗi lần này không áp dụng, vì seam hệ thống tệp hiện tại trả về chuỗi `before`/`after` đầy đủ, và hiện thực diff hiện tại cũng tiêu thụ hai chuỗi này. Diff kiểu stream cần một giao thức liên gói và một thiết kế hiển thị riêng.

## Hệ quả

Triển khai có thể điều chỉnh chi phí phụ trội của cơ sở ghi đè mà không làm thay đổi định tuyến đọc. Khi chạm hoặc vượt giới hạn loại trừ, thao tác ghi đè vẫn thành công và vẫn hiển thị được qua phương án dự phòng nguyên-tệp, nhưng không còn cung cấp hunk context. Khi dưới giới hạn, ngoài nội dung thay thế của bên gọi, nhà cung cấp vẫn có thể giữ một lượng văn bản cũ xấp xỉ `diffBasisMaxBytes`. Với các thao tác ghi đè đủ điều kiện, việc đọc theo descriptor có giới hạn sẽ thêm một chuỗi open/stat/read, đồng thời ngăn việc thăm dò đường dẫn đã cũ biến chuỗi đó thành một lần cấp phát không giới hạn.
