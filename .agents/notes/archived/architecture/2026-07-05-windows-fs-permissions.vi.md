# Agent Note: Ngữ nghĩa quyền ghi trên Windows: kế thừa DACL, không phải bit chế độ quyền

Status: implemented
Archived: 2026-07-26

[English](2026-07-05-windows-fs-permissions.md) | 中文

Quyết định trong bản ghi này liên quan đến việc thay thế file đã được thay thế bởi [cơ chế bảo toàn DACL trên Windows](../bug-fix/2026-07-19-windows-atomic-write-dacl-preservation.md).

## Vấn đề

`writeFileAtomic` trong `@deepseek-ai/dsh-fs-local` bảo vệ nội dung đang ghi bằng bit chế độ quyền POSIX: tạo thư mục staging với `0o700`, mở file tạm với `0o600`, và file mới cũng mặc định dùng `0o600`. Trên POSIX, bất kể quyền của thư mục cha là gì, các thiết lập này đảm bảo nội dung tạm chỉ hiển thị cho chủ sở hữu.

Windows không có cơ chế tương đương khả dụng đằng sau cùng một API. `chmod` của Node trên Windows chỉ điều khiển thuộc tính chỉ đọc (mỗi chế độ mà gói này truyền vào đều bao gồm quyền ghi của chủ sở hữu, nên các lệnh gọi này là no-op vô hại), còn `stat().mode` báo cáo các bit quyền tổng hợp `0o666`/`0o444`. Trạng thái bảo mật thực sự được quyết định bởi DACL của file: file hoặc thư mục mới tạo sẽ kế thừa từ thư mục cha, còn thao tác thay thế cần được xử lý tường minh theo định nghĩa trong Agent Note đã thay thế văn bản này.

## Quyết định

Trên Windows, file mới dùng kế thừa thư mục thay vì bit chế độ quyền tổng hợp: thư mục staging được tạo bên trong thư mục cha của đích (`dirname(absolutePath)`), do đó cả nó và file tạm đều kế thừa DACL của thư mục đích. Việc thay thế file tuân theo [hợp đồng bảo toàn DACL](../bug-fix/2026-07-19-windows-atomic-write-dacl-preservation.md) nghiêm ngặt hơn.

Test chỉ khẳng định bit chế độ quyền trên POSIX. Độ phủ native trên Windows khóa vào hành vi thay thế do gói (package) này phụ trách; việc kế thừa cho file mới vẫn thuộc hợp đồng của hệ điều hành, không phải danh sách cho phép ACL dành riêng cho từng máy.

## Phương án khác

**Thiết lập tường minh DACL chỉ-chủ-sở-hữu cho file mới.** Không áp dụng, vì điều này sẽ phá vỡ tính kế thừa và khiến người dùng cố tình chia sẻ thư mục dự án bất ngờ. Thao tác ghi thay thế sẽ sao chép DACL hiện có của đích, chứ không tự thiết kế chính sách chỉ-chủ-sở-hữu.

**Xác minh ACL trong test.** Danh sách cho phép SID của `Get-Acl` hay xác minh bằng `icacls` kiểm tra cơ chế kế thừa của Windows và ACL `%TEMP%` của máy hiện tại, chứ không phải hành vi của gói; `icacls` còn bản địa hóa tên tài khoản đã biết, khiến việc phân tích dễ bị ảnh hưởng bởi ngôn ngữ/khu vực.

**Bỏ qua `chmod` trên Windows.** Thêm nhánh bảo vệ theo nền tảng cho các lệnh gọi no-op vô hại sẽ không thay đổi bất kỳ hành vi nào.

## Hệ quả

Bất kể quyền của thư mục cha là gì, POSIX vẫn tiếp tục giới hạn nội dung tạm chỉ cho chủ sở hữu. Đích mới trên Windows nếu nằm trong thư mục có quyền truy cập rộng sẽ kế thừa khả năng truy cập đó theo thiết kế; nếu đích thay thế có DACL nghiêm ngặt hơn, DACL đó sẽ được giữ nguyên.

Trên Windows, việc bảo toàn chế độ quyền khi thay thế sẽ suy biến thành no-op: file có thể ghi được thăm dò ra là `0o666`, và việc phát lại chế độ đó qua `chmod` sẽ khiến thuộc tính chỉ đọc tiếp tục ở trạng thái đã xóa. Vì thao tác phát hành sẽ thất bại trước khi chế độ tổng hợp phát huy tác dụng, nên trên Windows không thể thay thế đích chỉ đọc.
