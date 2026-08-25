# Agent Note: Tự động hoàn thành tham chiếu tệp trong TUI

Status: implemented

Archived: 2026-08-04

[English](2026-07-23-tui-file-reference-autocomplete.md) | 中文

## 问题

TUI cung cấp tham chiếu `@session` có cấu trúc, nhưng người dùng khi chỉnh sửa prompt lại không thể phát hiện đường dẫn workspace một cách đáng tin cậy. Yêu cầu người dùng nhớ chính xác đường dẫn sẽ gây phiền toái không cần thiết cho các yêu cầu hướng tệp; nếu đính kèm trực tiếp mọi tệp được chọn, thì sẽ chiếm ngữ cảnh trước khi mô hình kịp phán đoán nội dung có liên quan hay không, và che khuất các quan sát `read` thông thường trong transcript (bản ghi văn bản) công cụ.

## 决策

TUI duy trì một chỉ mục đường dẫn workspace của host có giới hạn dung lượng và có thể hủy, với gốc là thư mục làm việc của phiên đang hoạt động. Gõ `@` tại ranh giới token sẽ khớp mờ (fuzzy match) tệp và thư mục; truy vấn chứa `/` sẽ liệt kê trực tiếp thư mục được chỉ định, chấp nhận thư mục sẽ tiếp tục hoàn thành, đường dẫn chứa khoảng trắng dùng dạng `@"path with spaces"`. Mục cấu hình kiểm soát số lượng kết quả, kích thước chỉ mục cũng như các thư mục bị loại trừ theo tên cơ sở. Mặc định loại trừ `.git` và `node_modules`; việc duyệt không theo symlink thư mục, cũng không phân giải tệp ignore.

Chọn tệp chỉ thay đổi văn bản trong editor. Tin nhắn người dùng khi gửi giữ nguyên cách viết `@path` tự nhiên, không mang nội dung được tiêm vào, không có ngữ cảnh ẩn hay đối tượng tham chiếu. Khi đăng ký công cụ `read` hướng mô hình, TUI sẽ thêm một đoạn system prompt cố định, giải thích rằng đường dẫn `@` là tham chiếu tường minh của người dùng, chỉ thị cho mô hình gọi `read` khi cần nội dung, và cấm mô hình khẳng định đã kiểm tra tệp trước khi gọi. Kết quả công cụ sẽ làm mất hiệu lực chỉ mục mờ có thể tái sử dụng, do đó các tương tác sau đó có thể thấy được những thay đổi có thể đã xảy ra trong workspace.

Việc đề cập phiên có cấu trúc giữ nguyên cách chuẩn bị snapshot hiện có. Khác với tệp, phiên được tham chiếu không có công cụ truy xuất phía mô hình thông dụng; nếu đơn giản hóa `@session` thành nhãn giống đường dẫn, mô hình sẽ không thể lấy được nội dung của nó.

## 备选方案

**Tiêm trực tiếp nội dung tệp đã chọn.** Cách này sẽ tốn token trước khi xác định được tính liên quan, có thể bắt giữ nội dung cũ trước khi thực thi đến tham chiếu đó, và bỏ qua chuỗi lệnh gọi/kết quả `read` có thể kiểm toán.

**Yêu cầu dùng công cụ tìm tệp bên ngoài.** Phụ thuộc vào `fd`, `rg --files` hoặc file thực thi khác sẽ khiến hành vi hoàn thành cơ bản thay đổi theo cài đặt của host, đồng thời tăng độ phức tạp của việc xử lý hủy và hỗ trợ đa nền tảng.

**Dùng thao tác liệt kê thư mục thông thường của dịch vụ hệ thống tệp để phát hiện.** Seam đó được tối ưu cho các thao tác hệ thống tệp chính xác hướng mô hình, và có thể đại diện cho một không gian tên từ xa; chỉ mục mờ đệ quy sẽ tăng số lượt qua lại với provider và ghép độ trễ editor với chính sách công cụ.

**Thêm chức năng tìm kiếm tệp xuyên package mới.** TUI hiện là bên tiêu thụ duy nhất, và hành vi này thuộc về hiển thị editor chứ không phải năng lực mô hình; thêm một bộ giao diện, triển khai và các package tiêu thụ mới sẽ tách seam này quá sớm.

## 影响

Người dùng có thể phát hiện và chèn đường dẫn, còn bản thân thao tác chọn không tốn chi phí cao, nội dung mô hình có thể nhìn thấy cũng chỉ giới hạn ở đường dẫn. Mô hình vẫn có thể tự quyết định có kiểm tra tệp hay không, mọi lần kiểm tra đều có thể dựng lại được qua transcript công cụ đã ghi log. Khi có `read`, chỉ thị cố định sẽ làm tăng nhẹ system prompt của TUI; các yêu cầu cần nội dung tệp sẽ thêm một lượt qua lại công cụ.

Việc hoàn thành cố ý mang tính gợi ý có giới hạn: workspace quá lớn có thể bỏ sót các đường dẫn vượt quá giới hạn chỉ mục cấu hình, tệp bị bỏ qua vẫn có thể xuất hiện, các triển khai hệ thống tệp từ xa hoặc ảo phải làm cho thư mục làm việc host của TUI khớp với không gian tên `read`, nếu không cần cung cấp một giao diện hoàn thành khác. Test package cố định cú pháp token, thứ tự sắp xếp, ranh giới, hủy, mất hiệu lực, hành vi chỉ gửi đường dẫn, menu hiển thị và hoàn thành bằng bàn phím; đơn vị triển khai TUI chịu trách nhiệm nghiệm thu Loader và PTY của mình.
