# Agent Note: Mọi route /api dùng chung một ranh giới tin cậy trình duyệt ở tầng vận chuyển

Status: implemented

[English](2026-07-28-api-browser-trust-boundary.md) | Tiếng Việt

## Vấn đề

Host Web GUI phục vụ `/api` bằng HTTP thuần (mặc định `127.0.0.1:3080`, hỗ trợ `--host 0.0.0.0`), mà trên mặt này lại có những phương thức ở mức thực thi mã từ xa — agent (tác tử) do `session.prompt` điều khiển có thể chạy bash. Trình duyệt biến người vận hành thành "kẻ đại diện bị lừa" để tấn công loại API cục bộ này theo hai cách kinh điển: một trang độc hại phát POST "simple request" xuyên site (`text/plain` — gửi đi mà không qua CORS preflight), tác dụng phụ vẫn thực thi như thường, chỉ là không đọc được phản hồi; và sau khi DNS rebinding, origin kết nối thẳng vào socket với tư cách "cùng origin", CORS mất tác dụng hoàn toàn, chỉ còn header `Host` là để lộ tên miền của kẻ tấn công. Trước quyết định này, kiểm tra tin cậy trình duyệt duy nhất trong hệ thống (`isTrustedNativeDialogRequest`: socket loopback, cùng origin, Host loopback) chỉ canh đúng một route mang tính trang trí — `host.pickDirectory`, hộp thoại native của nó bật lên trên màn hình của host — còn mọi phương thức thực sự có hậu quả nghiêm trọng đều không được bảo vệ. Phòng thủ theo từng RPC cũng không sống nổi qua trình duyệt thư mục trong ứng dụng: lý do tồn tại của nó chính là phục vụ các client từ xa hợp lệ, mà quy tắc loopback thì đúng là sẽ từ chối chúng.

## Quyết định

Thực hiện kiểm tra tin cậy trình duyệt một lần cho toàn bộ tiền tố `/api` ở tầng vận chuyển — chia làm hai phần:

- **Hàng rào kiểu media (dsh-host-apiproxy)**: mỗi POST tới `/api` phải khai báo `application/json`, nếu không sẽ bị từ chối bằng 415 trước khi parse. "Simple request" xuyên site vì thế không còn tồn tại: mọi nỗ lực xuyên site đều bị đẩy vào một lần CORS preflight mà server này không bao giờ đáp lại.
- **Hàng rào authority (dsh-client-connection, `src/api-request-trust.ts`)**: `Host` của mỗi request phải là địa chỉ loopback, hoặc khớp với một mục `trustedHosts` (mục dạng `host:port` có port thì khớp chính xác, mục không có port thì khớp mọi port, cả hai đều qua chuẩn hóa WHATWG; phòng thủ rebinding). Cố ý không mở lối tắt cho request không có dấu hiệu: dưới HTTP thuần, các thao tác đọc của trình duyệt (EventSource, ảnh, điều hướng — những header này chỉ gửi tới đích tin cậy) đều không mang `Origin` lẫn Fetch-Metadata, nên một request không dấu hiệu có thể là thao tác đọc do trang bị rebind khởi phát và phản hồi bị đọc trộm, mà Host là header duy nhất rebinding không giả mạo được; client không phải trình duyệt thì đi qua bằng địa chỉ loopback, IP literal LAN suy ra được, hoặc authority đã khai báo. Nếu có `Origin` thì nó phải trùng khít với Host authority; `sec-fetch-site: cross-site` luôn bị từ chối. Mục `trustedHosts` không phải là authority chuẩn hóa thuần túy sẽ làm plugin nạp thất bại — nếu không, parse theo WHATWG sẽ lặng lẽ cấp quyền cho một hostname gõ sai, hoặc khuếch đại việc cấp quyền theo port chính xác. `host.pickDirectory` mất người canh riêng, đi chung một hàng rào với các request khác.

Hai ranh giới cố ý để ngoài phạm vi: khả năng tiếp cận do cấu hình bind của webserver (`host: 127.0.0.1 | 0.0.0.0`) kiểm soát; xác thực cho triển khai từ xa thật sự là việc hoãn lại, được ghi trong README của connection — hàng rào này là phòng thủ kẻ đại diện bị lừa, không phải tầng xác thực. Kiểm tra socket loopback của người canh cũ bị bỏ chứ không tổng quát hóa: một khi bind đã diễn đạt khả năng tiếp cận và `trustedHosts` đã điểm danh authority từ xa, địa chỉ socket chẳng cung cấp thêm được gì mà hàng rào header không bao phủ.

## Các phương án thay thế đã cân nhắc

- **Phòng thủ theo từng RPC (giữ nguyên hiện trạng).** Bác bỏ: danh sách người canh sẽ mãi chạy theo danh sách phương thức, những phương thức giá trị cao nhất vốn dĩ chưa hề được canh, còn quy tắc loopback trên RPC browse lại phá hỏng chính các triển khai từ xa mà chúng sinh ra để phục vụ.
- **Header CORS và bỏ credentials.** Bác bỏ: ta vốn không muốn có bất kỳ thao tác đọc xuyên origin nào, đáp lại preflight chỉ mở rộng bề mặt phơi bày; từ chối preflight vừa mạnh hơn hẳn vừa đơn giản hơn.
- **Làm token xác thực ngay bây giờ.** Bác bỏ trong thay đổi này: việc cấp phát, lưu trữ, xoay vòng token là một mặt sản phẩm thực thụ; hàng rào bịt được lỗ hổng kẻ đại diện bị lừa từ trình duyệt ngay hôm nay mà không cần quyết trước thiết kế xác thực.

## Hệ quả

- Mọi phương thức `/api` trong tương lai đều tự nhiên nằm trong phạm vi bao phủ; không tồn tại quyết định tin cậy theo từng route có thể bị quên.
- Authority phục vụ ra ngoài của các triển khai không loopback phải được đưa vào phạm vi tin cậy, nếu không request sẽ bị từ chối. dsh CLI giữ được URL LAN `--host 0.0.0.0` mà nó công bố bằng cách suy ra IP literal LAN của máy vào dòng connection (mục không có port — Host là IP literal thì không thể là tên miền bị rebind, và port bind có thể do hệ điều hành cấp), đồng thời cung cấp `dsh web --trusted-host` để khai báo authority có tên; các tổ hợp không do CLI khởi động thì tự khai báo `trustedHosts`. Tự động hóa không phải trình duyệt đi qua cùng hàng rào đó: địa chỉ loopback, IP LAN suy ra được hoặc authority đã khai báo thì qua được; bí danh DNS chưa khai báo sẽ bị từ chối.
- Client phải gắn nhãn `application/json` cho body của POST (client của chính chúng ta xưa nay vẫn thế; các test fetch trần đã bổ sung header đó).
- Giả định "mạng tin cậy" của triển khai `0.0.0.0` không xác thực chuyển từ ngầm định thành thành văn.
