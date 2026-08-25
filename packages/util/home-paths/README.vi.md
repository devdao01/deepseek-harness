# dsh-home-paths

[English](README.md) | Tiếng Việt

Công cụ hỗ trợ đường dẫn hệ thống file dùng chung cho dữ liệu người dùng của DeepSeek Harness.

## Thư mục gốc DSH

`resolveDshHome()` phân giải thư mục gốc duy nhất của DeepSeek Harness. Thứ tự ưu tiên từ cao xuống thấp là: đường dẫn được cấu hình tường minh, `$DSH_HOME`, `~/.dsh`. Harness lưu toàn bộ dữ liệu người dùng dưới cùng một thư mục gốc này.

`dshHomePath(...segments)` dùng quy tắc đường dẫn theo nền tảng của Node để nối các đoạn subpath vào thư mục gốc đã phân giải. Khi không truyền đoạn đường dẫn nào, hàm trả về chính thư mục gốc.

`dshHomeDisplay()` biểu diễn thư mục gốc hiện tại dưới dạng ký hiệu, dùng cho các đường dẫn hiển thị tới người dùng: thư mục gốc mặc định được biểu diễn là `~/.dsh`, bất kỳ thư mục gốc nào đã được cấu hình sẽ biểu diễn là `$DSH_HOME`. Nó không bao giờ để lộ đường dẫn tuyệt đối của máy.

`DSH_HOME_DIR_NAME` định nghĩa tên thư mục dữ liệu người dùng mặc định: `.dsh`.

`defaultDshHome()` dùng quy tắc đường dẫn theo nền tảng của Node để nối thư mục home của hệ điều hành với `.dsh`, và trả về thư mục gốc mặc định của DeepSeek Harness.

`expandHomePath()` dùng thư mục home của hệ điều hành để mở rộng các tiền tố `~`, `~/...` và kiểu Windows `~\...`. Nó giữ nguyên các đường dẫn không có dấu ngã (~) và dạng `~user/...`.

## Đường dẫn theo dõi (watch)

`canonicalizeWatchPath()` cung cấp một cách biểu diễn ổn định cho đường dẫn đích, dùng cho watcher hệ thống file nguyên bản. Nó phân giải qua `fs.realpath()` tổ tiên hiện có sâu nhất trong cây, rồi nối lại phần hậu tố còn thiếu, do đó ngay cả khi file hay thư mục chưa được tạo, đường dẫn vẫn có thể được theo dõi. Đặc biệt, các alias 8.3 của Windows không thể trộn lẫn với đường dẫn dài do backend watcher nguyên bản phát ra.

Gói này cố tình giữ quy mô nhỏ và không phụ thuộc harness, để các gói sản phẩm chia sẻ ước định (convention) đường dẫn dữ liệu người dùng mà không cần phụ thuộc lẫn nhau.

## Giới hạn đã biết và việc còn hoãn lại

- **Phạm vi mở rộng được giữ hẹp một cách cố ý**: chỉ riêng `~`, `~/...` và `~\...` mới dùng thư mục home hiện tại của hệ điều hành; các dạng chỉ định người dùng khác như `~alice/...`, biến môi trường và biểu thức shell được giữ nguyên không đổi.
- **Chuẩn hóa chỉ đọc, không bao giờ sửa đổi**: `canonicalizeWatchPath()` thực hiện dò tìm `realpath` và lan truyền mọi lỗi trừ lỗi đường dẫn không tồn tại; bên gọi vẫn chịu trách nhiệm tạo thư mục, cấp quyền, và áp dụng chính sách tin cậy lên đường dẫn kết quả.
