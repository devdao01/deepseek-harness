# Agent Note: Ảnh Markdown từ xa trong Web

Status: implemented

[English](2026-07-30-web-remote-markdown-images.md) | 中文

## Vấn đề

Markdown của assistant có thể tham chiếu biểu đồ và ảnh chụp màn hình bằng cú pháp ảnh tiêu chuẩn, nhưng bộ render Web lại thay thế mỗi ảnh bằng văn bản thay thế (alt text) in nghiêng. Vì vậy, ngay cả khi địa chỉ đích là URL HTTP(S) tuyệt đối, hành vi ảnh Markdown thông thường vẫn không đạt được.

## Quyết định

`MarkdownText` render các địa chỉ đích ảnh HTTP(S) tuyệt đối thành phần tử `<img>` responsive, tải trễ (lazy-loaded), dùng giải mã bất đồng bộ và `referrerPolicy="no-referrer"`. Đường dẫn tương đối, đường dẫn cục bộ tuyệt đối, URL `file:` và các giao thức không được hỗ trợ vẫn theo fallback văn bản thay thế hiện có. HTML gốc vẫn bị vô hiệu hóa, nên assistant không thể lách qua component ảnh Markdown bằng cách viết tay thẻ `<img>`.

Component ảnh tái sử dụng chính sách URL tuyệt đối của bộ render, không thêm proxy host, định tuyến file cục bộ, dependency Session, bộ khử độc (sanitizer) hay bộ tải ảnh mới. Tin nhắn lịch sử đã hoàn thành, output đang stream, output một phần bị ngắt quãng, và mọi bên tiêu thụ khác của `MarkdownText` đều nhận cùng một hành vi.

## Các phương án thay thế đã cân nhắc

**Giữ mọi ảnh dưới dạng văn bản thay thế.** Phương án này giữ ranh giới mạng ở mức tối thiểu, nhưng không đáp ứng được nhu cầu sản phẩm về việc xem inline các sản phẩm hình ảnh được lưu trữ trên mạng.

**Chuyển tiếp ảnh từ xa qua proxy host.** Proxy có thể che giấu địa chỉ mạng của trình duyệt khỏi trang nguồn của ảnh, nhưng việc này khiến host thực hiện các request đi ra ngoài (outbound) tùy ý, và cần xây dựng riêng chính sách redirect, DNS, kích thước và nội dung. Tải trực tiếp ảnh HTTP(S) cho phép cơ chế kiểm soát của trình duyệt tiếp tục quan sát request đó; không gửi referrer giúp giảm việc lộ thông tin nguồn hội thoại.

**Hỗ trợ đường dẫn cục bộ trong cùng thay đổi này.** Nguồn Web không thể tải trực tiếp file trên host. Một triển khai an toàn cần một ranh giới quyền được đánh giá riêng, nên đường dẫn tương đối, đường dẫn cục bộ tuyệt đối và URL `file:` vẫn bị vô hiệu hóa.

**Cho phép ảnh `data:`.** URL `data:` lớn sẽ ghi lặp lại nội dung nhị phân dưới dạng văn bản vào transcript (bản ghi văn bản) bền vững. Chính sách chỉ cho phép HTTP(S) đã đủ đáp ứng nhu cầu hiện tại mà không mở rộng session log.

## Hệ quả

Phản hồi của assistant sẽ hiển thị ảnh từ xa trong lúc stream và khi phát lại, mà không thay đổi sự kiện session hay giao thức host. Trang nguồn từ xa vẫn có thể quan sát được request ảnh, địa chỉ mạng của client, và bất kỳ credential nào mà chính sách trình duyệt cho phép gửi tới trang nguồn đó. Địa chỉ đích cục bộ và không được hỗ trợ vẫn chỉ hiển thị văn bản thay thế không phát sinh request.
