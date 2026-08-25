# Agent Note: Chạy example trong CI từ lib đã build

Status: implemented

Archived: 2026-07-27

[English](2026-07-17-run-ci-examples-from-built-lib.md) | 中文

## Vấn đề

CI khởi động example và các dự án test load cấu hình Cordis thông qua `node --import tsx` cùng ánh xạ `paths` của tsconfig gốc. Cách này vừa thêm overhead chuyển đổi TypeScript, vừa thay đổi hành vi phân giải package: import sẽ phân giải tới mã nguồn workspace, thay vì đi qua `exports` của package vào `lib/` đã build.

Do đó, các test này không bao phủ mã và đường dẫn phân giải mà bên tiêu thụ đã cài đặt thực tế chạy. Ngay cả khi đồ thị export đã build của package không đầy đủ hoặc kết quả phân giải khác đi, CI vẫn có thể pass.

## Quyết định

Cơ chế thực thi gồm hai chế độ. `src` là chế độ mặc định cho phát triển local và dùng tsx; `lib` là chế độ CI nghiêm ngặt, khởi động bin đã build qua plain Node, không load tsx, cũng không dùng ánh xạ đường dẫn tsconfig.

- Khởi động example hoặc subprocess của `cordis.yml` đã commit vào repo trong CI dùng chế độ `lib`.
- Fixture (dữ liệu chuẩn bị trước cho test) TypeScript chỉ hiện thực đối tác ACP hoặc MCP, không load Cordis, được Node chạy trực tiếp. Chỉ những regression test kiểm chứng tường minh đường dẫn mã nguồn mới được giữ chế độ `src`.

### Cấu trúc phân giải

Mỗi cấu hình Cordis dùng để test phải có khả năng phân giải module trần (bare module) đi lên từ thư mục chứa file cấu hình.

- `examples/` là một thành viên pnpm workspace, cung cấp thư mục gốc phân giải `examples/node_modules` thống nhất.
- Mọi cấu hình Cordis dùng để test đã commit vào repo, bao gồm cấu hình snapshot và fixture test nội bộ package, đều đặt trong cây thư mục `examples/<agent>/` tương ứng. Cấu hình thuộc `packages/<group>/<package>/` được ánh xạ tới `examples/<agent>/tests/fixtures/<group>/<package>/cordis.yml`; driver test và assertion vẫn nằm trong package.
- Mỗi package được tham chiếu trong cấu hình Cordis mẫu đều được đăng ký đồng thời trong `examples/package.json` và trong `references` của `tsconfig.json` gốc, hỗ trợ phân giải tương ứng cho `lib` và `src`.

### Chiến lược khởi động

Harness test Loader dùng chung chọn `src` hoặc `lib` thông qua `DSH_EXAMPLE_MODE`. CI build trước rồi chọn `lib`; khi không đặt chế độ, vòng lặp phát triển local nhanh từ mã nguồn vẫn được giữ nguyên.

## Các phương án thay thế đã cân nhắc

- **CI tiếp tục dùng tsx**: không được chấp nhận, vì sẽ giữ lại overhead chuyển đổi và hành vi phân giải chỉ áp dụng cho mã nguồn.
- **Mọi môi trường chỉ dùng lib**: không được chấp nhận, vì phát triển local sẽ phải build trước mỗi lần chạy. Chế độ kép tránh đưa chi phí này vào vòng lặp phát triển.
- **Mỗi test tự dựng `node_modules` riêng**: không được chấp nhận, vì sẽ lặp lại scaffold của bên tiêu thụ. Lấy `examples/` làm gốc workspace cho phép mỗi cấu hình Cordis phân giải module qua cùng một đường dẫn thực và được khai báo tường minh.

## Hệ quả

- CI có thể kiểm chứng export của package đã build, không còn bị ảnh hưởng bởi phân giải module của tsx; phát triển local vẫn giữ vòng lặp mã nguồn không cần build.
- CI phải build trước khi chạy các test này; khi chạy thủ công chế độ `lib` có thể đọc phải artifact local đã cũ.
- Phân tích import TypeScript thông thường không nhận diện được dependency của cấu hình Cordis, do đó `examples/package.json`, `references` của tsconfig gốc và file cấu hình phải được giữ đồng bộ.
