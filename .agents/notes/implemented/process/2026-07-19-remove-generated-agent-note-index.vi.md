# Agent Note: Không cần tạo index vẫn có thể tìm thấy Agent Note

Status: implemented

[English](2026-07-19-remove-generated-agent-note-index.md) | 中文

## Vấn đề

Một index Agent Note được commit vào repo sẽ lặp lại các sự kiện đã được mã hoá trong đường dẫn lifecycle/category của từng file, ngày trong tên file, và H1. Bất kỳ nhánh nào thêm, di chuyển hoặc đổi tên các Agent Note không liên quan đến nhau đều sẽ ghi đè lên cùng một file được sinh ra, khiến sản phẩm này trở thành điểm nóng xung đột merge có thể lường trước.

So với việc duyệt cây thư mục lifecycle/category hoặc tìm kiếm trong repo, danh sách theo thứ tự thời gian tập trung này mang lại giá trị khám phá hạn chế; nhưng generator, renderer, lệnh và kiểm tra độ mới của nó vẫn tạo thành gánh nặng bảo trì.

## Quyết định

Cây thư mục hệ thống file tổ chức theo lifecycle/category chính là danh sách Agent Note. [README.md](../../README.md) tiếp tục là điểm vào và quy ước được bảo trì thủ công, còn việc duyệt cây thư mục thông thường và tìm kiếm repo đảm nhiệm việc khám phá nội dung.

`scripts/agent-note-tree.ts` giữ tập lifecycle/category khép kín cùng bộ duyệt cấu trúc. `verify-agent-note-classification` kiểm tra cây thư mục đó, từ chối các thư mục cũ và `INDEX.md` ở thư mục gốc, nhưng không render danh sách tập trung hay kiểm tra độ mới của nó.

## Phương án khác

**Giữ lại index được sinh ra và commit vào repo, giải quyết xung đột bằng cách sinh lại.** Việc sinh lại giúp cơ giới hoá quá trình giải quyết xung đột, nhưng không ngăn được các nhánh không liên quan sửa cùng một sản phẩm, cũng không giảm được nhiễu review phát sinh từ đó.

**Cung cấp lệnh sinh index theo yêu cầu, không commit vào repo.** Cách này tránh được xung đột trên file đã commit, nhưng vẫn cần bảo trì renderer và lệnh, trong khi việc duyệt cây thư mục và tìm kiếm repo đã bao phủ đường khám phá đó.

**Khôi phục index được bảo trì thủ công.** Nó vẫn gây tranh chấp file dùng chung, đồng thời tái tạo lại các lỗi về tính toàn vẹn và thứ tự mà cơ chế sinh tự động đã tránh được.

## Ảnh hưởng

- Khi thêm, di chuyển hoặc đổi tên Agent Note, không còn phải sửa một file được sinh ra bao trùm toàn bộ corpus.
- Gate phân loại thực hiện ít công việc hơn, topology gate tài liệu cũng không cần thêm process hay stage.
- Người đọc không còn một trang duy nhất theo thứ tự thời gian, thay vào đó dùng cây thư mục lifecycle/category hoặc tìm kiếm repo.
