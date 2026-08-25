# Agent Note: Trang tài liệu tự mang theo ảnh của nó

Status: implemented

[English](2026-08-06-doc-site-carries-its-images.md) | Tiếng Việt

## Vấn đề

`scripts/project-doc-site.ts` viết lại mọi đích tương đối trong repo không nằm trong manifest (tệp khai báo metadata) phát hành thành địa chỉ GitHub, đối với ảnh là `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`. Việc build site không copy bất kỳ file nào: `srcDir` là cây `.generated` dùng xong bỏ, VitePress không đặt `publicDir` (giá trị mặc định của nó `<srcDir>/public` lại nằm đúng trong cây bị xóa mỗi lần chạy phép chiếu), và thứ duy nhất được ghi vào là Markdown.

Điều này chỉ đúng với repo công khai. Repo này là riêng tư, mà `raw.githubusercontent.com` luôn trả 404 cho request chưa xác thực — phiên đăng nhập trên github.com cũng không thể xác thực nó, vì giao diện riêng của GitHub phục vụ blob riêng tư bằng một bộ địa chỉ được ký riêng khác. Kết quả là mọi ảnh trên site đều hỏng với mọi người đọc, mà không có gate nào nói ra điều đó: `verify-md-links` và việc xác thực phép chiếu kiểm tra xem file đích **có tồn tại trong repo hay không**, đó là câu hỏi khác với việc người đọc site có lấy được nó hay không.

## Quyết định

`rewriteMarkdown` được thêm tham số tùy chọn `placeImage(absPath): string`. Khi một trang tham chiếu đến một ảnh chưa được manifest phát hành như một trang, phép chiếu sẽ copy file đó vào cây được sinh ra, nằm cạnh trang đó, và viết lại tham chiếu thành `./<basename>`; sau đó Vite sẽ đóng gói nó như mọi tài nguyên site khác. Khả năng hiển thị của repo không còn ảnh hưởng đến các trang đã phát hành nữa.

Bản copy nằm cạnh trang, chứ không nằm trong một thư mục tài nguyên dùng chung. Mỗi cây route theo locale giữ một bản copy riêng, nên cùng một URL tương đối vẫn đúng ở cả `guide/` lẫn `en/guide/`, mà không cần tính tiền tố theo locale; khi manifest gỡ một trang xuống, tài nguyên của nó cũng biến mất theo. Một bảng ghi lại toàn bộ đường dẫn đã được chiếu — trang và ảnh được đối xử như nhau — nếu cùng một đường dẫn xuất hiện nguồn thứ hai sẽ ném lỗi, cùng lập trường với kiểm tra route trùng lặp sẵn có, thay vì để lần ghi cuối cùng âm thầm thắng.

Chỉ những file thường có đường dẫn thực nằm trong repo mới được copy, còn lại tất cả sẽ khiến phép chiếu fail và chỉ đích danh trang cùng đích. Việc viết lại liên kết chỉ cần biết đích **có tồn tại**, nhưng phát hành là copy byte của nó lên site, nên một tham chiếu thoát ra khỏi repo — qua `../..` hoặc symlink trỏ ra ngoài cây — sẽ đặt file trên máy build lên trang đã phát hành. `?query` hay `#fragment` đi kèm tham chiếu sẽ được giữ nguyên cùng URL sau khi đặt lại, nhất quán với cách GitHub luôn làm với branch; tên file được mã hóa phần trăm vì đích nằm ở vị trí đích inline trong Markdown.

`docsSourceFiles()` sẽ báo cáo cả ảnh đã được đặt lại, nên khi thay ảnh chụp màn hình, watcher của dev server sẽ chiếu lại, thay vì cứ phục vụ bản copy cũ cho đến khi ai đó chạm vào trang.

`placeImage` là tùy chọn vì `rewriteMarkdown` cũng được gọi trực tiếp bởi spec của chính nó, mà ở đó không hề có cây được sinh ra. Khi không truyền nó, fallback GitHub raw sẽ trỏ đến trang chủ nguồn công khai; điều này giữ cho seam này trung thực với các bên tiêu thụ chỉ viết lại text.

Bản gốc Markdown vẫn viết đường dẫn ảnh tương đối trong repo như bình thường, nên cùng một file hiển thị bình thường cả trên GitHub lẫn trên site. Không có tài liệu nào phải viết URL tuyệt đối trong site để chiều theo VitePress.

## Các phương án đã cân nhắc

**Đặt `publicDir` ra ngoài `.generated`, và dùng URL tuyệt đối trong site.** Phía phép chiếu có ít bộ phận động hơn, nhưng khi đọc cùng một Markdown đó trong repo, mọi tham chiếu ảnh sẽ hỏng, trong khi tài liệu gốc phải đọc được theo cả hai cách.

**Đặt ảnh vào branch assets, giống như GIF demo.** Branch đó tồn tại để giữ file nhị phân lớn ra khỏi lịch sử chính, mà địa chỉ raw của nó gặp đúng vấn đề khả năng hiển thị y hệt. Nó vẫn là nơi đúng đắn cho bản ghi màn hình; nhưng không giải quyết được vấn đề này.

**Đợi repo chuyển sang công khai.** Điều đó chỉ xóa triệu chứng, không làm site tự chủ được, và mỗi ảnh sẽ khiến site phụ thuộc ngầm vào tính khả dụng và giới hạn tốc độ của GitHub.

## Hệ quả

Ảnh trong tài liệu đã phát hành giờ hiển thị được với bất kỳ ai đọc, bất kể repo có công khai hay không, và việc build site cũng không còn phụ thuộc vào khả năng truy cập thời gian thực của GitHub cho ảnh. Cây được sinh ra sẽ thêm một bản copy ảnh được tham chiếu cho mỗi locale — bốn ảnh chụp màn hình trong hướng dẫn nhà cung cấp mô hình, mỗi locale khoảng 270 KB.

Ảnh được tham chiếu bởi tài liệu **chưa phát hành** không bị ảnh hưởng. Phép chiếu thuần văn bản sẽ resolve chúng tương đối theo trang chủ nguồn công khai; tài liệu không nằm trên site thì không có bản build site nào để mang tài nguyên của nó.

## Kiểm thử

`scripts/project-doc-site.spec.ts` bao phủ: placer nhận đường dẫn tuyệt đối đã resolve và URL nó trả về rơi vào đúng Markdown, tham chiếu đã đặt lại giữ nguyên fragment của nó, khi có placer thì liên kết của trang đã phát hành vẫn resolve về đúng route của chính nó, và fallback GitHub raw không đổi khi không truyền placer. `publishableImage` có phần bao phủ trực tiếp riêng: file thường trong repo được chấp nhận, còn symlink trỏ ra khỏi repo, đường dẫn ngoài repo và thư mục đều bị từ chối. `pnpm docs:check` sẽ build site kèm ảnh chụp màn hình của hướng dẫn nhà cung cấp mô hình, và fail khi nguồn bị thiếu; các file đã được copy cùng tham chiếu `./<basename>` của chúng đã được xác nhận trong `website/.generated` và `docs:dev` đang chạy (cả hai locale đều `naturalWidth > 0`).
