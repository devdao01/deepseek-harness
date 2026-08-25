# @deepseek-ai/dsh-host-directory-picker

[English](README.md) | Tiếng Việt

Việc chọn thư mục workspace cho host web GUI là một capability seam. Dịch vụ trừu tượng `DirectoryPicker` (`ctx.directoryPicker`) là Service Definition của nó. Dịch vụ này chỉ cung cấp một phương thức: `capability()`, trả về một discriminated union mô tả operator chọn thư mục bằng cách nào. Tương tác người dùng khác nhau giữa các backend, chứ không chỉ khác nhau về triển khai: `{ kind: 'native', pick(signal) }` mở một bộ chọn OS native trên màn hình host ([`-native`](../directory-picker-native/README.md)); `{ kind: 'browse', list(path?), createDirectory(path, name) }` cung cấp các thao tác liệt kê và tạo dùng cho trình duyệt trong ứng dụng, cũng có thể phục vụ client từ xa không truy cập được hộp thoại OS ([`-browse`](../directory-picker-browse/README.md)). Bên tiêu thụ phân nhánh theo `capability().kind`; union được suy ra từ map `DirectoryPickerCapabilities` có thể mở rộng gộp lại, backend mới thêm biến thể riêng của nó vào đó thông qua declaration merging. Khi gặp kind không xác định, bên tiêu thụ sẽ ẩn lối vào chọn thư mục, thay vì báo lỗi. Đối tượng năng lực phải giữ ổn định trong suốt vòng đời dịch vụ. Mỗi package backend còn cung cấp lối vào browser, đăng ký tương tác phù hợp trong directory-flow slot của ui-workspace, do đó một cấu hình lắp ráp sẽ đồng thời chọn cả năng lực host và luồng client. Việc lắp ráp cần chọn tương tác tại runtime nên dùng [`-auto`](../directory-picker-auto/README.md), nó kiểm tra tình huống host một lần tại thời điểm khởi động, và gắn kết dòng backend phù hợp.

Khi nguyên thủy duyệt (browse) thất bại sẽ ném ra `DirectoryPickerError` đã gán kiểu (`directory-unreadable`／`directory-exists`／`directory-create-failed`, mỗi loại mang theo `path` của đối tượng gây lỗi), gateway tiêu thụ sẽ ánh xạ 1:1 chúng thành mã lỗi giao thức. Dòng `DirectoryEntry` mang cờ `hidden` do host quyết định (theo quy ước tiền tố dấu chấm của POSIX), chính sách hiển thị để lại cho client; `DirectoryListing.crumbs` là chuỗi tổ tiên bắt đầu từ gốc hệ thống file, mỗi crumb là một đích có thể nhảy tới. Lý do thiết kế, việc phân tách với `ctx.fs`, phán quyết chính sách xem tại [Agent Note về directory-picker capability seam](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.md).

## Trải nghiệm model

Không có. Seam này phục vụ việc chọn thư mục cho GUI host. Không có nội dung nào ở đây đi vào request của model.

#### Ảnh hưởng KV Cache

Không có; package này không lắp ráp cũng không gửi request nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Không hỗ trợ nhiều thư mục gốc** — quy ước duyệt mỗi lần liệt kê chỉ công bố một chuỗi tổ tiên; việc giới hạn gốc có thể duyệt theo từng triển khai (cũng như việc liệt kê các ổ đĩa Windows tại cấp trên gốc ổ đĩa) sẽ chờ đến khi xuất hiện bên tiêu thụ cần đến, xem Agent Note về DirectoryPicker.
