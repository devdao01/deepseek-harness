# Agent Note: Thêm khả năng liệt kê thư mục trực tiếp cho seam hệ thống file

Status: implemented
Archived: 2026-07-26

[English](2026-07-03-filesystem-directory-listing-seam.md) | 中文

## Vấn đề

`@deepseek-ai/dsh-fs` là seam bên cung cấp cho truy cập hệ thống file, backend cục bộ và các backend không cục bộ trong tương lai chia sẻ chung một hợp đồng `ctx.fs`. Trước thay đổi này, nó có thể resolve đường dẫn, stat mục tiêu, đọc văn bản, đọc văn bản dạng stream, ghi văn bản và chỉnh sửa văn bản. Điều này đã đủ cho các công cụ file hướng tới mô hình, nhưng chưa đủ cho các bên tiêu thụ không thuộc phía mô hình cần liệt kê thư mục mà không muốn import trực tiếp `node:fs`.

Áp lực trực tiếp đến từ việc nạp skill (kỹ năng): đọc một `SKILL.md` đơn lẻ đã có thể đi qua `ctx.get('fs')`, nhưng việc phát hiện những thư mục gốc skill nào chứa `<name>/SKILL.md` hoặc `<name>.md` vẫn cần liệt kê thư mục. Nếu chỉ thêm liệt kê thư mục vào `dsh-skill`, thì hoặc phải giữ dependency trực tiếp vào Node, hoặc phải phát minh một hàm hỗ trợ cục bộ dùng một lần bên ngoài ngăn xếp nhà cung cấp hệ thống file.

Quyết định này chỉ thêm năng lực bên nhà cung cấp, không liên quan đến thay đổi công cụ `ls`/`list` hướng tới mô hình hay cơ chế phát hiện skill. Các bên tiêu thụ đó cần các quyết định UX, prompt và chính sách độc lập.

## Quyết định

Thêm `FileSystem.listDir(target, signal?)` vào `@deepseek-ai/dsh-fs`.

`listDir` chỉ liệt kê một cấp thư mục. Nó trả về các mục con trực tiếp theo thứ tự tên ổn định, gồm các trường sau:

- `name`: basename của mục con;
- `type`: `file`, `directory`, hoặc `other`;
- `target`: `FsTarget` đã resolve của mục con;
- `version`: metadata nhẹ khi có sẵn;
- `size`: kích thước file thường khi có sẵn.

Nó không bao giờ đọc nội dung file. Duyệt đệ quy, khớp glob, phân trang, tìm kiếm, theo dõi file (file watching) và render hướng tới mô hình đều có chủ đích nằm ngoài phạm vi.

Backend cục bộ triển khai qua `readdir({ withFileTypes: true })`, `resolveLocalTarget`, và thăm dò metadata `stat`/`realpath`. Thứ tự kết quả có tính xác định (`name.localeCompare`), nhằm giữ đầu ra prompt/danh sách ổn định cho các bên tiêu thụ tương lai, và cải thiện tỷ lệ tái sử dụng prefix cache.

Mục con hỏng hoặc đã biến mất có thể được biểu diễn dưới dạng `type: 'other'` (không kèm `version`/`size`); chúng không làm hủy toàn bộ việc liệt kê. Khi gặp lỗi quyền hoặc lỗi I/O của backend trong lúc liệt kê thư mục hoặc resolve/thăm dò metadata mục con, toàn bộ việc liệt kê sẽ thất bại với mã lỗi `FsError` có cấu trúc:

- `FS_NOT_FOUND`: mục tiêu không tồn tại;
- `FS_NOT_DIRECTORY`: mục tiêu tồn tại nhưng không phải thư mục;
- `FS_PERMISSION_DENIED`: không đủ quyền;
- `FS_IO_ERROR`: lỗi I/O khác của backend;
- `FS_ABORTED`: lệnh gọi bị hủy.

## Phương án thay thế từng cân nhắc

**Thêm công cụ list hướng tới mô hình cùng lúc với việc thêm seam.** Bị bác bỏ. Prompt, schema, và hợp đồng render của nó độc lập với nguyên thủy bên nhà cung cấp.

**Để mỗi bên tiêu thụ tự liệt kê thư mục.** Bị bác bỏ. Điều này sẽ ràng buộc các gói sản phẩm như `dsh-skill` vào hành vi Node/hệ thống file cục bộ, bỏ qua các backend chính sách/từ xa/sandbox.

**Để `listDir` hỗ trợ dạng đệ quy hoặc glob.** Tạm thời bác bỏ. Việc phát hiện thư mục gốc skill chỉ cần mục con trực tiếp, và một phép liệt kê một cấp đơn giản là hợp đồng backend tối thiểu mà các bên tiêu thụ tương lai có thể tổ hợp một cách an toàn.

**Bỏ qua các mục con bị lỗi resolve metadata.** Bị bác bỏ. API cam kết trả về target mục con đã resolve, do đó lỗi quyền/IO khi resolve mục con thuộc về vi phạm hợp đồng. Mục con hỏng hoặc đã biến mất là ngoại lệ, vì chúng vẫn có thể được biểu diễn mà không tuyên bố sở hữu một file đã resolve đang hoạt động.

## Hệ quả

Mỗi backend hệ thống file giờ phải triển khai thêm một nguyên thủy bên nhà cung cấp. Đây là công việc nền tảng có chủ đích khi harness chưa được phát hành, nhưng cũng có nghĩa là các backend sandbox/từ xa trong tương lai cần định nghĩa hành vi liệt kê mục con trực tiếp tương đương.

Năng lực này vẫn dừng ở tầng nhà cung cấp. Trước khi bên tiêu thụ được triển khai, phiên ACP (Agent Client Protocol)/mô hình vẫn cần dùng các công cụ sẵn có như `bash` để liệt kê thư mục. Việc thiếu công cụ `listdir` hướng tới mô hình là hành vi dự kiến, không phải lỗi đấu nối.
