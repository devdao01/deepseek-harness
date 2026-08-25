# Agent Note: Hỗ trợ TUI trên Windows

Status: implemented
Archived: 2026-08-04

[English](2026-07-20-windows-tui-support.md) | 中文

## Vấn đề

Full-screen TUI ủy quyền input thô, render ANSI, sự kiện thay đổi kích thước terminal, và khôi phục terminal cho `ProcessTerminal` của pi-tui. Dependency này đã triển khai đường dẫn console gốc cho Windows, nhưng bài test smoke process thật của repo trước đây dùng các module `pty` và `termios` chỉ dành cho POSIX trong Python. Nếu bỏ qua bài test này trên Windows, đường dẫn sản phẩm được hỗ trợ này sẽ thiếu độ phủ test cho khởi động, input, tương tác, báo lỗi và khôi phục terminal.

Hợp đồng nền tảng của TUI phải dựa trên runtime được giao cho người dùng, chứ không phụ thuộc vào khả năng portable của một driver test nào đó. Chỉ khi sản phẩm có một dependency runtime không được hỗ trợ, hoặc đã chứng minh có khoảng trống về ngữ nghĩa, thì việc loại trừ một nền tảng mới có cơ sở.

## Quyết định

[`@deepseek-ai/dsh-tui`](../../../../packages/ui/tui/README.md) hỗ trợ terminal tương tác trên cả Windows, macOS và Linux. Sản phẩm tiếp tục dùng `ProcessTerminal` của pi-tui; trên Windows, nó bật virtual terminal input sau khi vào chế độ raw, và tránh việc refresh `SIGWINCH` vốn chỉ dành cho Unix. DeepSeek Harness không thêm logic từ chối theo nền tảng, cũng không áp dụng chế độ Windows bị giới hạn tính năng.

Bài test smoke Loader thật chọn ranh giới pseudo-terminal gốc theo host. macOS và Linux tiếp tục dùng driver Python POSIX PTY, còn Windows dùng `node-pty` và ConPTY. Cả hai driver nhận cùng lệnh khởi động, môi trường, kích thước terminal, các hành động input được kích hoạt theo marker, timeout, mã thoát kỳ vọng, và assertion đầu ra; cả 3 kịch bản smoke đều chạy trên mỗi nền tảng được hỗ trợ.

`node-pty` là dependency chỉ dùng cho test của examples workspace. Script cài đặt gốc đã qua review của dependency này được bật tường minh trong `pnpm-workspace.yaml`; package (gói) TUI sản xuất không thêm dependency hay lớp subprocess nào mới.

## Các phương án đã cân nhắc

- **Tuyên bố TUI không hỗ trợ Windows**: không được chấp nhận, vì terminal runtime đã ghim phiên bản đã triển khai tường minh input console Windows, và harness không có dependency sản xuất nào chỉ dành cho POSIX. Chỉ loại trừ Windows qua tài liệu, tương đương với việc từ bỏ một đường dẫn sản phẩm hiện có để né tránh khoảng trống của test harness.
- **Chạy driver POSIX qua MSYS, Cygwin hoặc WSL**: không được chấp nhận, vì việc này sẽ test một môi trường tương thích, chứ không phải đường dẫn console Windows gốc mà người dùng thực sự chạy.
- **Dùng `node-pty` trên mọi host**: không được chấp nhận, vì driver POSIX hiện có đã cung cấp đủ ranh giới cần thiết cho macOS và Linux; thay thế driver này sẽ mở rộng phạm vi thay đổi runtime mà không mang lại cải thiện nào cho hai host đó. Chọn driver theo từng nền tảng, chỉ bật đường dẫn runtime `node-pty` trên Windows, đồng thời dùng chung một hợp đồng kịch bản.
- **Dựa vào unit test cho renderer và snapshot terminal ngữ nghĩa**: không được chấp nhận, vì terminal giả lập không thể chứng minh việc Loader khởi động, input thô thật, thoát tiến trình, hoặc khôi phục terminal ở ranh giới hệ điều hành.

## Hệ quả

- Lane sản phẩm (artifact) Windows thực thi các kịch bản khởi động, tương tác có kịch bản, khôi phục sau lỗi cấu hình, và khôi phục terminal; bộ test này không bị bỏ qua trên bất kỳ nền tảng được hỗ trợ nào.
- Việc kiểm chứng ở cấp tiến trình trên Windows phụ thuộc vào ConPTY và `node-pty` đã ghim phiên bản; khi thay đổi dependency này hoặc script cài đặt được phép thực thi, phải có review ranh giới gốc.
- Triển khai nội bộ của hai driver PTY có thể khác nhau, nhưng input và assertion dùng chung sẽ giữ cho hợp đồng TUI có thể quan sát được của chúng nhất quán.
- Phạm vi hỗ trợ Windows bị giới hạn bởi phiên bản Node và pi-tui mà repo giao; các môi trường console Windows cũ không được hỗ trợ sẽ không có lớp tương thích.
