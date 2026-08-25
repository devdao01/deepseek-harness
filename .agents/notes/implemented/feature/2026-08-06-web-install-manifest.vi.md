# Agent Note: Metadata manifest cài đặt cho Web

Status: implemented

[English](2026-08-06-web-install-manifest.md) | Tiếng Việt

## Vấn đề

Sản phẩm build Web đã có tiêu đề tài liệu và favicon, nhưng lại không có manifest (bản kê khai metadata) để trình duyệt phát hiện danh tính cài đặt ổn định, ranh giới khởi chạy hay cách trình bày sau khi cài. Việc thêm loại metadata này cũng có thể ngụ ý những khả năng mà ứng dụng không có: service worker sẽ khiến người ta tưởng ứng dụng cung cấp cam kết ngoại tuyến, còn một giá trị ngôn ngữ hay bảng màu duy nhất sẽ mô tả sai một UI song ngữ vốn có khả năng phân giải theme sáng và tối.

## Quyết định

Điểm vào Web liên kết tới `/manifest.webmanifest`, và Vite sẽ sao chép nó từ `apps/web/public/` vào sản phẩm build production. Manifest đặt tên sản phẩm là `DeepSeek Harness`, cung cấp tên rút gọn `DSH` cho giao diện trình duyệt sau khi cài, đồng thời cố định `id`, `start_url` và `scope` là `/`. Nó yêu cầu `display: "fullscreen"`, để những trình duyệt hỗ trợ chế độ này có thể giao toàn bộ vùng hiển thị khả dụng cho giao diện kiểu trình soạn thảo sau khi cài, đồng thời không làm thay đổi tab thông thường; trình duyệt có thể áp dụng thiết lập ghi đè của người dùng, hoặc lùi về chế độ hiển thị khác. Mục biểu tượng của nó tái sử dụng `/favicon.svg`, coi đó là một SVG với kích thước `any` và mục đích `any`.

Lựa chọn này kế thừa phương án toàn màn hình của code-server, nhưng không sao chép mục ghi đè hiển thị `window-controls-overlay` của họ. DSH không có thanh tiêu đề tuỳ biến, cũng không bố trí giao diện xoay quanh các nút điều khiển cửa sổ gốc, nên dùng loại ghi đè đó sẽ thay thế chế độ toàn màn hình mà chưa triển khai bố cục an toàn cần thiết.

Manifest cố ý không chứa `lang`, `theme_color` hay `background_color`. Giao diện sản phẩm hỗ trợ song ngữ và không được định nghĩa bởi một ngôn ngữ duy nhất trong manifest; bất kỳ giá trị màu tĩnh nào cũng có thể không khớp với một trong các bảng màu mà ứng dụng phân giải ra. Vì vậy, metadata theme vẫn nằm ngoài manifest cài đặt.

Tính năng này không thêm service worker, chiến lược cache hay phương án dự phòng ngoại tuyến. Manifest chỉ cung cấp metadata cài đặt; việc có đủ điều kiện cài đặt hay có hiển thị lối vào cài đặt hay không vẫn do chính sách của trình duyệt quyết định. Phương án dự phòng [`dsh-host-frontend-static`](../../../../packages/host/frontend-static/README.md) thực tế được bàn giao nhận diện `.webmanifest` là `application/manifest+json`, nên cùng một tài nguyên khi được phục vụ qua tổ hợp HTTP thực tế cũng hợp lệ, chứ không chỉ hợp lệ trong thư mục đầu ra của Vite.

## Kiểm chứng

Test sản phẩm build Web phân tích manifest đầu ra và cố định toàn bộ đối tượng metadata, gồm tên hiển thị cho người dùng, tên rút gọn, biểu tượng, danh tính đường dẫn gốc, ranh giới khởi chạy và chế độ hiển thị, đồng thời xác minh `index.html` của bản build production vẫn giữ liên kết đó. Test tổ hợp với Loader thật của `dsh-host-frontend-static` cung cấp một fixture (dữ liệu chuẩn bị trước cho test) `.webmanifest` và cố định kiểu media `application/manifest+json` của nó.

## Các phương án từng cân nhắc

**Thêm service worker và tuyên bố ứng dụng hỗ trợ ngoại tuyến.** Không áp dụng, vì chỉ cache vỏ ứng dụng mà không định nghĩa việc truyền tải phiên, chính sách vô hiệu hoá, hành vi khi thất bại và ngữ nghĩa nâng cấp sẽ tạo ra một cam kết ngoại tuyến gây hiểu lầm và không đầy đủ.

**Khai báo một `lang` duy nhất.** Không áp dụng, vì không ngôn ngữ nào đủ để mô tả một giao diện sản phẩm song ngữ; bỏ qua trường này tránh việc tuyên bố rằng trải nghiệm sau khi cài thuộc độc quyền một locale nào đó.

**Chọn một bộ màu nền và màu theme tĩnh.** Không áp dụng, vì ứng dụng phân giải bảng màu sáng và tối lúc chạy, nên chọn bất kỳ giá trị cố định nào cũng là biết rõ nó không khớp với một trong các trạng thái được hỗ trợ.

**Bàn giao ngay các biến thể biểu tượng raster và maskable.** Không áp dụng cho đến khi một mục tiêu cài đặt được hỗ trợ chứng minh favicon vector hiện có không đáp ứng yêu cầu của nó. Biến thể mới chỉ là phần mở rộng gia tăng cho manifest, không phải điều kiện tiên quyết để công bố danh tính hiện tại.

**Chỉ khẳng định các trường đường dẫn gốc và trường hiển thị trong sản phẩm build.** Không áp dụng, vì việc tên sản phẩm, tên rút gọn hay biểu tượng bị xoá hoặc thay đổi cũng là một hồi quy của trải nghiệm cài đặt đã bàn giao. Mỗi khi metadata manifest thay đổi, test cố ý đòi hỏi một thay đổi tường minh.

## Hệ quả

Trình duyệt hỗ trợ cơ chế này có thể phát hiện danh tính cài đặt ổn định lấy đường dẫn gốc làm phạm vi cùng tuỳ chọn toàn màn hình, mà ứng dụng không phải cam kết hành vi ngoại tuyến. Khi triển khai bản build này dưới một tiền tố đường dẫn, phải đồng thời xem xét lại liên kết manifest theo đường dẫn tuyệt đối, cũng như danh tính, khởi chạy, phạm vi và URL biểu tượng. Sau này có thể thêm biến thể do yêu cầu biểu tượng riêng của từng trình duyệt; mỗi thay đổi metadata có chủ đích đều đồng bộ cập nhật cam kết chính xác về sản phẩm build.
