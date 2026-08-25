# @deepseek-ai/dsh-session-query-sqlite

[English](README.md) | Tiếng Việt

Nhà cung cấp `ctx.sessionQuery` cụ thể. `SqliteSessionQueryEngine` kế thừa khả năng đọc chính xác, truy vết và lọc không phụ thuộc nhà cung cấp từ gói Service Definition, đồng thời hiện thực hai phương thức toàn văn của nó bằng SQLite FTS5. Việc tìm kiếm sử dụng kho ngữ liệu phiên logic ưu tiên nguồn trực tiếp, và nhóm kết quả liên phiên theo sự kiện có độ khớp cao nhất trong mỗi phiên.

## Quy ước tìm kiếm

`searchSessions(request, exec?)` trả về kết quả phân trang `SessionSearchHit` trên toàn kho ngữ liệu; `searchEvents(request, exec?)` trả về kết quả phân trang `SessionEventSearchHit` trong một phiên duy nhất. Truy vấn không được bỏ trống, khoảng trắng đầu và cuối bị loại bỏ, khoảng trắng bên trong được chuẩn hóa, và nội dung được xử lý như một cụm từ theo nghĩa đen. Cú pháp FTS5 như dấu ngoặc kép, `OR`, `NEAR` và `*` được coi là dữ liệu, không phải cú pháp MATCH khả thi hành. Bộ lọc metadata là các vị từ SQL tham số hóa được áp dụng trước khi xếp hạng. Để giữ SQLite FTS5 MATCH nằm trong ngữ cảnh vị từ ngoài cùng được hỗ trợ, một yêu cầu liên phiên biên dịch tối đa 14 vị từ lọc kết hợp giữa phiên và sự kiện; yêu cầu trong phạm vi một phiên biên dịch tối đa 13 vị từ lọc, vì vị từ phiên đích cố định đã chiếm một slot. Mỗi điểm đầu mút của một khoảng biên dịch thành một vị từ. Khi yêu cầu vượt quá bất kỳ ngân sách vị từ nào, hoặc vượt quá giới hạn 32.766 tổng số binding khả chuyển của SQLite (bao gồm cả truy vấn cố định và các giá trị phân trang), nó sẽ thất bại với `SESSION_QUERY_INVALID_FILTER` trước khi chuẩn bị câu lệnh.

Xếp hạng độ liên quan giữa bảng bền vững và bảng TEMP có thể so sánh trực tiếp: trước hết theo số span khớp được FTS5 làm nổi bật thực tế theo thứ tự giảm dần, sau đó theo độ dài code point của tài liệu đã lưu theo thứ tự tăng dần. Thời gian sự kiện, id phiên khi áp dụng và seq phá vỡ các trường hợp hòa còn lại. Kết quả liên phiên phơi bày sự kiện được chọn dưới dạng `bestMatch`; cả hai phạm vi đều suy ra văn bản thuần đã chuẩn hóa khoảng trắng từ vị trí làm nổi bật của FTS5 và giới hạn độ dài theo code point Unicode. Con trỏ (cursor) là giá trị mờ có kiểu được gắn nhãn (branded), ràng buộc với yêu cầu đã chuẩn hóa và với thực thể dịch vụ, và thất bại khi thế hệ (generation) liên quan thay đổi. Con trỏ trong phạm vi một phiên vẫn dùng tiếp được sau khi các phiên không liên quan thay đổi; con trỏ liên phiên thì không.

Mặc định, cả ba tầng bề mặt (`current`, `shadowed` và `log-only`) đều có thể tìm kiếm được. Truyền vào bộ lọc tầng bề mặt để thu hẹp phạm vi.

## Vòng đời nguồn và chỉ mục

Dịch vụ này cần `ctx.sessions` và quan sát động `ctx.sessionPersistence` tùy chọn. Một máy trạng thái tuần tự hóa so sánh các bản sửa đổi (revision) của ảnh chụp lưu trữ nhẹ có giới hạn theo nguồn, chỉ kiểm tra nhật ký mới hoặc đã thay đổi theo cách không sửa đổi nhật ký, trích xuất tài liệu ngữ nghĩa dùng chung, đối soát các thay đổi theo kiểu giao dịch, rồi chạy truy vấn. Session query không bao giờ gọi `load()` của backend lưu trữ — hàm sẽ sửa chữa sau sự cố; một chủ sở hữu đang hoạt động tham gia trong lúc kiểm tra không thể sửa đổi nhật ký của nó, và việc thử lại quan sát ổn định khiến kết quả ưu tiên nguồn trực tiếp. Các hàng TEMP trực tiếp vẫn ghi nhận tính sẵn sàng của lưu trữ, còn cơ sở bền vững sẽ được làm mới sau khi chủ sở hữu đang hoạt động đó rời đi. Truy vấn lặp lại và việc mở lại cùng một kho lưu trữ khi không có thay đổi sẽ không thực hiện kiểm tra nhật ký lưu trữ đầy đủ; việc chuyển kho lưu trữ, hoặc khi quan sát thấy nguồn được thêm mới, đã thay đổi, đã xóa hoặc được sửa chữa bởi một lần load bên ngoài, sẽ được đối soát ở lần quan sát ổn định kế tiếp. Nguồn hoặc giao dịch thất bại thì không có gì được commit, và lần tìm kiếm tiếp theo sẽ thử lại.

`openAt: startup` là giá trị mặc định: việc kích hoạt dịch vụ sẽ import `node:sqlite` và mở handle; nếu chỉ mục không hợp lệ, nó sẽ thất bại trước khi dịch vụ được công bố. `openAt: first-search` công bố dịch vụ ở trạng thái ACTIVE mà không import module SQLite và không mở handle; các lần tìm kiếm đồng thời đầu tiên dùng chung một promise sẵn sàng, và khi dispose (giải phóng tài nguyên) dịch vụ trước bất kỳ lần tìm kiếm nào thì cũng không import module hay mở handle. Chế độ này hỗ trợ các tổ hợp cần đầu ra khởi động Node 22 sạch bằng cách hoãn cảnh báo thử nghiệm của SQLite đến lần tìm kiếm thực sự đầu tiên; nó không triệt tiêu cảnh báo tại thời điểm đó. Cơ sở dữ liệu không hợp lệ cũng khiến lần tìm kiếm đầu tiên thất bại, thay vì làm việc kích hoạt dịch vụ thất bại. `openAt: never` tắt tìm kiếm toàn văn cho triển khai đó: `searchSessions` và `searchEvents` thất bại với `SESSION_QUERY_SEARCH_DISABLED` trước cả khi chuẩn hóa bất kỳ yêu cầu nào, node:sqlite không bao giờ được import hay mở, không có quan sát nguồn hay đối soát nào chạy, trong khi toàn bộ khả năng đọc chính xác, lọc và truy vết kế thừa trên `ctx.sessionQuery` vẫn dùng được.

Các hàng FTS bền vững nằm trong một cơ sở dữ liệu phái sinh chuyên dụng. Các bảng TEMP cục bộ theo kết nối giữ những hàng trực tiếp; các hàng này che khuất cơ sở lưu trữ của cùng một phiên và làm nó hiện lại sau khi chủ sở hữu trực tiếp biến mất. Gỡ lưu trữ sẽ ẩn các hàng bền vững nhưng không loại bỏ bộ nhớ đệm; gắn lại sẽ đối soát bộ nhớ đệm. Đóng hoặc mở lại cơ sở dữ liệu sẽ xóa toàn bộ lớp phủ trực tiếp nhưng giữ lại các hàng bền vững.

Cơ sở dữ liệu này tuy có thể bỏ đi và dựng lại, nhưng thao tác reset được bảo vệ: mọi phiên bản schema đã nhận diện đều từ chối các bảng người dùng không xác định trước khi thay đổi journal mode; chỉ những schema không tương thích đã được nhận diện và có chứa bảng phái sinh mới được dựng lại tại chỗ. Cơ sở dữ liệu không liên quan hoặc cơ sở dữ liệu chuẩn tắc sẽ bị từ chối. Tuyệt đối không trỏ `path` vào cơ sở dữ liệu session-persistence. Trên hệ thống tệp hỗ trợ chế độ quyền POSIX, thư mục và cơ sở dữ liệu còn thiếu sẽ được tạo ở dạng chỉ chủ sở hữu truy cập được (`0700` và `0600` trước umask của tiến trình), các tệp đồng hành của SQLite kế thừa chế độ quyền của cơ sở dữ liệu; các chế độ quyền hiện có được giữ nguyên. Mỗi đường dẫn chỉ mục phái sinh chỉ được sở hữu bởi một dịch vụ duy nhất trong một tiến trình; không hỗ trợ tiến trình ghi bên ngoài hay tiến trình thứ hai, vì trạng thái thế hệ và che khuất TEMP do kết nối nắm giữ.

## Cấu hình

| Khóa | Mặc định | Quy ước |
|---|---:|---|
| `path` | bắt buộc | Đường dẫn SQLite của chỉ mục phái sinh chuyên dụng; hỗ trợ `:memory:`. Trên hệ thống tệp POSIX, các đường dẫn hệ thống tệp còn thiếu sẽ được tạo ở dạng chỉ chủ sở hữu truy cập được. |
| `openAt` | `startup` | `startup` mở trước khi hoàn tất kích hoạt dịch vụ; `first-search` hoãn việc nạp module SQLite và mở handle đến lúc tìm kiếm; `never` tắt tìm kiếm toàn văn (thất bại với `SESSION_QUERY_SEARCH_DISABLED` có kiểu), các thao tác đọc kế thừa vẫn dùng được. |
| `journalMode` | `wal` | `wal`, `delete`, `truncate` hoặc `persist`. |
| `defaultLimit` | `20` | Kích thước trang khi yêu cầu bỏ qua `limit`; tối đa là `Number.MAX_SAFE_INTEGER - 1`. |
| `maxLimit` | `100` | Kích thước trang tối đa được chấp nhận trong yêu cầu; tối đa là `Number.MAX_SAFE_INTEGER - 1`. |
| `snippetChars` | `240` | Độ dài snippet tối đa tính theo code point Unicode. |
| `readWindowMax` | `50` | Số sự kiện thô tối đa cho `before` hoặc `after`, dùng cho `readEvent()` kế thừa. |
| `persistedInspectConcurrency` | `4` | Số lần kiểm tra nhật ký lưu trữ đồng thời tối đa cho thao tác đọc hàng loạt kế thừa; phải là số nguyên an toàn dương. |

## Bộ tách token và giới hạn

Chỉ mục này dùng FTS5 `unicode61`. Đánh đổi ở đây là khả năng truy hồi theo token/cụm từ chứ không phải truy hồi chuỗi con tùy ý: `AI` không khớp với token `BRAID`. Khi cần quét chuỗi con theo nghĩa đen với độ linh hoạt về khoảng trắng, hãy dùng `ctx.sessionQuery.filterEvents()` với mệnh đề `text`. Truy vấn từ chối NUL; các dấu làm nổi bật dành riêng và NUL trong tài liệu được chuẩn hóa trước khi lập chỉ mục, khiến dấu hiển thị không thể xung đột với văn bản nguồn.

Tín hiệu hủy (abort signal) dừng công việc đã xếp hàng và đi xuyên qua việc liệt kê ảnh chụp cũng như các lần kiểm tra không sửa đổi ở dạng nguyên vẹn. Một khi công việc nguồn đã bắt đầu, máy trạng thái tuần tự hóa sẽ tự chờ promise của backend đó, ngay cả khi backend bỏ qua việc hủy, sau đó mới kiểm tra tín hiệu trước khi khởi động bất kỳ công việc liệt kê, kiểm tra, đối soát hay truy vấn nào tiếp theo. Do đó, bên gọi chỉ quan sát thấy việc hủy sau khi công việc backend đã khởi động dừng hẳn hoàn toàn, còn các lần tìm kiếm sau đó không thể vào serializer khi việc dọn dẹp đó chưa hoàn tất. API đồng bộ `DatabaseSync` của Node không thể ngắt các câu lệnh metadata hay MATCH đang thực thi trên luồng JavaScript; hệ thống kiểm tra tín hiệu ngay trước và ngay sau các lời gọi không thể chiếm quyền này.

## Trải nghiệm mô hình

Không có. Backend tìm kiếm đáng tin cậy này chỉ trả về kết quả khớp cho bên gọi, không đăng ký prompt, schema, tool hay message hướng tới mô hình.

#### Ảnh hưởng tới KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu tới nhà cung cấp.

## Giới hạn đã biết và phần tạm hoãn

- **Không có ủy quyền bên gọi**: đây là dịch vụ đáng tin cậy trong phạm vi ngữ cảnh; tool của mô hình hoặc UI phải tự thực thi chính sách truy cập của mình.
- **Thực thi truy vấn đồng bộ**: `DatabaseSync` chặn luồng JavaScript trong lúc thực thi MATCH và không thể ngắt câu lệnh đang chạy.
- **Truy hồi theo token, không phải chuỗi con tùy ý**: tokenizer `unicode61` không khớp chuỗi con nằm trong token lớn hơn; hãy dùng `filterEvents()` để quét theo nghĩa đen.
- **Chỉ mục phái sinh một chủ sở hữu**: mỗi đường dẫn chỉ mục chỉ được thuộc về một dịch vụ duy nhất trong một tiến trình; không hỗ trợ tiến trình ghi bên ngoài và chia sẻ đa tiến trình.
