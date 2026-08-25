# Agent Note: README gốc ưu tiên sản phẩm

Status: implemented

[English](2026-07-22-product-first-root-readme.md) | Tiếng Việt

## Vấn đề

README gốc là cổng vào sản phẩm của repo. Cấu trúc ưu tiên sản phẩm và giọng văn hiện có của nó vẫn còn hiệu lực, nhưng khi runtime không ngừng mở rộng, các cổng vào cụ thể và tuyên bố về khả năng sẽ dần trở nên lỗi thời. Viết lại các phần mà sự thật vẫn đúng sẽ mở rộng phạm vi review, và bỏ đi cách diễn đạt vốn đã hiệu quả.

## Quyết định

Chừng nào sự thật đằng sau vẫn đúng, README gốc vẫn giữ nguyên cấu trúc, thứ tự và cách diễn đạt hiện có. Khi làm mới, chỉ sửa các tuyên bố đã lỗi thời và bổ sung thông tin cần thiết để trình bày những gì đã được giao; không tái cấu trúc toàn bộ câu chuyện chỉ vì repo tăng quy mô.

Một đoạn văn bản trước phần hướng dẫn cài đặt cảm ơn người dùng nội bộ (internal user), nói rõ tính năng và trải nghiệm vẫn còn cần hoàn thiện, và mời mọi người phản hồi trực tiếp về lỗi, điểm khó hiểu và bất tiện qua nhóm WeCom. Tuyên bố giai đoạn phát triển hiện có nói rõ DeepSeek Harness đang trong giai đoạn nội bộ (internal beta).

Phần cổng vào người dùng bổ sung ACP (Agent Client Protocol) automation server và Python/JSON-RPC SDK bên cạnh các cổng Web, TUI và Headless đã có. Sau khi cài đặt, TUI vẫn chỉ cần chạy một lệnh `dsh`; hướng dẫn Web yêu cầu build checkout hiện tại trước, rồi chạy `dsh web`, và nói rõ cách xử lý đường dẫn checkout tùy chỉnh hoặc tái sử dụng. Cả hai đường khởi động này phải có thể chạy nguyên trạng, một bên trên PTY thật, bên kia trên bản build production/HTTP smoke test. Đoạn về khả năng vẫn dùng lối viết danh sách ngắn gọn, bổ sung các nhóm khả năng đã được giao gồm PTY, LSP, Web, mục tiêu (goal), lập kế hoạch (planning), task, sandbox, phê duyệt (approval), cài đặt, credential, truy vấn session và telemetry, đồng thời nói rõ các tổ hợp khác nhau chỉ chọn dùng một phần trong số đó. Một mục danh sách liền kề nói về quy tắc session log chuẩn (authoritative), vì persistence, replay, truy vấn, telemetry và các loại interface khác nhau đều phụ thuộc vào nó.

Danh sách đầy đủ package và service vẫn do tài liệu sở hữu tương ứng duy trì. README tiếng Anh và tiếng Trung dùng cùng một cấu trúc kỹ thuật, nhưng phần cộng đồng vẫn trỏ tới kênh giao tiếp chính riêng cho từng nhóm đối tượng ngôn ngữ. Website tài liệu giữ [route cổng vào quick start riêng](../simplification/2026-08-11-quickstart-documentation-home.md), không trình bày lại trang chủ sản phẩm.

## Các phương án thay thế đã cân nhắc

**Viết lại README theo một câu chuyện sản phẩm mới.** Viết lại hoàn toàn có thể làm nổi bật mọi cổng vào và khả năng hiện có, nhưng cũng sẽ thay thế văn bản chính xác đã được review, gây ra thay đổi không cần thiết. Các sự thật hiện có có thể được đưa vào cấu trúc ưu tiên sản phẩm sẵn có.

**Trình bày repo như một danh sách SDK và package.** Cách này thể hiện ngay bề rộng triển khai thực tế, nhưng buộc người đọc mới phải tự suy ra sản phẩm từ tên package. Index package và bản đồ khả năng được sinh ra vẫn là danh sách chuẩn (authoritative).

**Dùng trang marketing dài với screenshot, badge và tutorial lặp lại.** Nội dung đa phương tiện có thể minh họa đường dùng sản phẩm ổn định, nhưng nội dung đó sẽ dần lỗi thời độc lập với lệnh và quy ước source code. README gốc giữ gọn nhẹ và liên kết tới ví dụ có thể chạy được cùng hướng dẫn do từng bên tự duy trì.

**Chiếu README gốc thành trang chủ website tài liệu.** Dùng chung một trang chủ có thể tránh hai câu chuyện song song, nhưng hướng dẫn người dùng của website tài liệu và cổng vào hướng tới sản phẩm/lập trình viên của repo có nhu cầu điều hướng và bảo trì khác nhau. Route gốc của tài liệu sẽ dẫn người đọc tới quick start.

## Kết quả

Người review có thể phân biệt giữa cập nhật sự thật và viết lại mang tính biên tập; các cập nhật sau này sẽ giữ nguyên cách diễn đạt hiện có, trừ khi ý nghĩa của nó không còn đúng hoặc không còn đầy đủ. Khi lệnh, cổng vào, tuyên bố giai đoạn phát hành hoặc nhóm khả năng cấp cao bị ảnh hưởng thay đổi, README vẫn phải được đồng bộ cập nhật; chi tiết đầy đủ tiếp tục được cung cấp qua liên kết, thay vì sao chép vào nội dung chính.
