# Agent Note: Extension tương tác TUI được nắm giữ bởi effect

Status: implemented
Archived: 2026-08-04

[English](2026-07-22-tui-interactive-extension-service.md) | 中文

## Vấn đề

Plugin Cordis có thể đăng ký lệnh người dùng qua `ctx.commands`, nhưng các lệnh cần tương tác terminal không có ranh giới trình bày được hỗ trợ chính thức. Nó chỉ có thể giữ trạng thái không tương tác, hoặc bắt lấy cây pi-tui riêng của TUI, trạng thái focus, renderer và vòng đời tắt (shutdown lifecycle). Kiểu ràng buộc này khiến extension phụ thuộc vào chi tiết triển khai nội bộ của một entry cụ thể, khiến các overlay được phát triển độc lập tranh giành focus với nhau, và dẫn đến việc gỡ bỏ plugin không thể loại bỏ đáng tin cậy UI đang xếp hàng hoặc đã hiển thị.

## Quyết định

`@deepseek-ai/dsh-tui` đã được mount cung cấp `ctx.tui` sau khi terminal khởi động thành công. Dịch vụ này chỉ thuộc về terminal và agent (tác tử) đã được gắn kết tại thời điểm mount, biến mất trước khi terminal bị tháo dỡ, và khiến các plugin inject nó unmount/reload theo tính khả dụng của nhà cung cấp. Các entry khác không mô phỏng dịch vụ này.

`ctx.tui.openOverlay()` là nguyên thủy extension tương tác đầu tiên và duy nhất. Nó nhận một factory component, các tùy chọn layout bị giới hạn, và một tín hiệu abort tùy chọn. Factory nhận một host đã đóng băng, chứa viewport hiện tại, hàm theme ngữ nghĩa, escape văn bản hiển thị, redraw, đóng, và tín hiệu vòng đời. Nó không nhận `TUI` của pi-tui, handle overlay, editor, cây transcript (bản ghi hội thoại), bộ điều khiển focus, hay đối tượng terminal.

Một overlay manager riêng tư xử lý tuần tự các yêu cầu tích hợp sẵn và yêu cầu từ plugin theo thứ tự FIFO. Bộ chọn mô hình và panel câu hỏi của `ctx.userInteraction` dùng chung manager này, do đó mọi tương tác dạng modal chỉ có một chủ sở hữu focus. Khi đóng overlay đang hoạt động, hệ thống trước tiên khôi phục focus trước đó của pi-tui, rồi mới kích hoạt yêu cầu tiếp theo trong hàng đợi. Trạng thái overlay là trạng thái trình bày cục bộ theo tiến trình (process-local): nó không được thêm vào nhật ký phiên, cũng không được tái tạo lúc khôi phục (resume).

Các phương thức dịch vụ chạy qua service proxy có thể theo dõi của Cordis. Trước khi chấp nhận một yêu cầu, nó đăng ký một effect vào fiber của plugin gọi; do đó khi bên gọi thực hiện dispose (giải phóng tài nguyên), yêu cầu đang xếp hàng sẽ bị loại bỏ hoặc overlay đang hoạt động sẽ đóng lại, và chờ cùng một kết quả hoàn tất. Khi TUI tắt, hệ thống sẽ từ chối yêu cầu mới trước, rồi dispose fiber dịch vụ, để các plugin phụ thuộc cùng effect của chúng hoàn toàn tĩnh lặng, sau đó mới hoàn tất công việc tích hợp sẵn còn lại, cuối cùng mới rút cạn và dừng terminal.

Việc xây dựng, render, xử lý input và xử lý lỗi của component đều chạy trong ranh giới bắt ngoại lệ. Bất kỳ thất bại nào cũng sẽ đóng yêu cầu tương ứng với kết quả `error`, báo cáo một lỗi hiển thị trong terminal, và để hàng đợi tiếp tục xử lý. Component thuộc mã nguồn của gói đáng tin cậy: dòng render của nó có thể chứa style ANSI, nhưng phải gọi `host.display()` trước khi thêm văn bản không đáng tin cậy.

## Kiểm chứng

Test manager cố định việc chấp nhận FIFO, hủy, đóng lặp lại, kết quả đóng, callback được bảo vệ, năng lực host, và độ phủ theo từng file. Test vòng đời Cordis cố định quyền sở hữu của bên gọi, nhà cung cấp biến mất và khôi phục, từ chối trong lúc unmount, và việc dọn dẹp đạt được tĩnh lặng hoàn toàn. Test tích hợp terminal mô phỏng bao phủ sự phối hợp giữa overlay của plugin và câu hỏi tích hợp sẵn, khôi phục focus input của editor, remount terminal, rollback khởi động, và dịch vụ biến mất. Các test tương tác TUI hiện có tiếp tục pass thông qua đường dẫn dùng chung, bao phủ bộ chọn mô hình và panel câu hỏi.

## Phương án thay thế đã cân nhắc

**Phơi bày trực tiếp đối tượng pi-tui.** Điều này sẽ trao cho plugin mức độ tự do tối đa, nhưng biến trạng thái focus, render và tháo dỡ vốn riêng tư thành hợp đồng tương thích công khai, và không thể phân xử giữa các overlay được nạp độc lập.

**Thêm callback tương tác vào định nghĩa lệnh.** Lệnh vẫn là mục domain không phụ thuộc phương thức truyền tải, dù TUI là bên tiêu thụ duy nhất đã được giao. Thêm trạng thái terminal vào `ctx.commands` sẽ khớp luồng phát hiện và điều phối với một triển khai trình bày cụ thể.

**Xây dựng một lần toàn bộ khung slot và action cho TUI.** Action, thay thế editor, renderer transcript, khu vực trạng thái và nhà cung cấp autocomplete có các quy tắc tổ hợp và xung đột khác nhau. Đưa chúng vào một API rộng trước khi được xác minh bởi các bên tiêu thụ cụ thể sẽ cố định sớm những quy tắc này.

**Lưu bền vững overlay đang mở như sự kiện phiên.** Trình bày dạng modal không phải trạng thái phiên hiển thị với mô hình, và trạng thái component tùy ý cũng không thể phát lại. Plugin có dữ liệu bền vững nên ghi lại dữ liệu đó qua dịch vụ domain riêng của mình, và tái tạo lại trình bày khi thích hợp.

## Hệ quả

Plugin tương tác có được một entry nhỏ và ổn định, với quản lý focus xác định và cơ chế dọn dẹp do Cordis nắm giữ; TUI tiếp tục kiểm soát vòng đời terminal và triển khai nội bộ của pi-tui. Hộp thoại tích hợp sẵn và extension không thể chồng lấn, cũng không để lại focus mất chủ.

API này có chủ đích chỉ bao phủ overlay dạng modal. Lệnh người dùng vẫn đăng ký trên `ctx.commands`; action, slot, thay thế editor, renderer sự kiện và nhà cung cấp autocomplete cần được thiết kế hợp đồng riêng, chờ các bên tiêu thụ thực tế xác định thứ tự và ngữ nghĩa sở hữu của chúng. Việc xử lý tuần tự FIFO cũng có nghĩa là một overlay bị kẹt sẽ chặn công việc modal tiếp theo, cho đến khi chủ sở hữu của nó đóng, hủy, hoặc unmount overlay đó.
