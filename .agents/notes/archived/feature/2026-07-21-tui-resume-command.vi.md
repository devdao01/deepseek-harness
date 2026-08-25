# Agent Note: Khôi phục phiên TUI cấp sản phẩm

Status: implemented

Archived: 2026-08-04

[English](2026-07-21-tui-resume-command.md) | 中文

## Problem

`/resume` ban đầu chỉ in ra một lệnh shell. Người dùng thao tác bằng bàn phím không thể xem tiêu đề hay kết quả, không thể phân biệt log bị hỏng với adapter bị thiếu, cũng không thể bàn giao terminal một cách an toàn. Việc phải thoát TUI rồi tự tay chạy lệnh còn che khuất trình tự thao tác cần thiết: chờ công việc hiện tại kết thúc và được flush, giải phóng UI và ứng dụng, rồi khôi phục danh tính gốc đã được persist — tuyệt đối không được âm thầm tạo ra một phiên thay thế.

## Decision

`/resume` sử dụng giao diện overlay tương tác sẵn có của TUI, nhưng hiển thị dưới dạng trang chọn lấp đầy toàn bộ viewport, thay vì một hộp thoại căn giữa. Trang phẳng này đặt ô tìm kiếm, dòng phạm vi workspace, các ứng viên và chân trang phím tắt vào một vùng màn hình ổn định, chỉ dòng hiện tại dùng màu nhấn. Trình soạn thảo tìm kiếm bám sát ngay sau biểu tượng tìm kiếm ở đầu dòng và xuất ra dấu con trỏ của pi-tui, do đó văn bản đang gõ ghép bởi bộ gõ terminal sẽ neo vào đúng ô nhập. Khi truy vấn không rỗng, lần nhấn Escape đầu tiên sẽ xóa truy vấn, lần thứ hai mới đóng trang chọn. Trang sắp xếp các ứng viên theo thời điểm hoạt động cuối cùng được ghi log, và hỗ trợ tìm theo tiêu đề hoặc id trong log. Mỗi ứng viên hiển thị: có phải phiên hiện tại hay không, có đang hoạt động hay không, đã được persist hay chưa, kết quả của lượt gần nhất, provider/model dùng gần nhất, và giai đoạn đích đã persist khi có; id được hiển thị như thông tin phụ. Phiên hiện tại và các phiên đã hoạt động trong runtime hiện tại vẫn hiển thị nhưng không thể chọn. Trang chọn mở ra ở workspace hiện tại, và có thể chuyển sang mỗi workspace khác thông qua phạm vi chuyển đổi mà [khôi phục xuyên workspace](2026-07-28-cross-workspace-resume.md) ghi lại.

`session-query.readSession()` cung cấp một bản log đầy đủ tách rời khỏi runtime, và được xác thực qua cùng ranh giới replay cốt lõi mà luồng khôi phục sử dụng. TUI gấp gọn tiêu đề và trạng thái đích từ log đó. Việc tải ứng viên thất bại chỉ ảnh hưởng đến dòng đó; sau khi chọn ứng viên, hệ thống sẽ kiểm tra lại log, workspace, routing, trạng thái rảnh của agent hiện tại, cùng quy tắc loại trừ đối với phiên hiện tại và các phiên đã hoạt động trong runtime hiện tại, để tránh danh sách cũ vượt qua kiểm tra sơ bộ. Khi thiếu adapter, hệ thống báo cáo phiên hoàn chỉnh nhưng routing không khả dụng. Kiểm tra sơ bộ này không khóa đích, cũng không loại trừ các tiến trình khác.

Sau khi qua kiểm tra sơ bộ, TUI sẽ flush phiên hiện tại, xác nhận lại lần nữa rằng agent của phiên đó vẫn đang rảnh, rồi dừng terminal và gọi `TuiRuntime.handoffResume` với id đã xác thực cùng workspace đích. Host `dsh` đã triển khai sẽ giải phóng ứng dụng gốc, và thay thế tiến trình hiện tại một cách nguyên tử bằng `process.execve` với tham số `--resume` đã chuẩn hóa, thay vì khởi động một tiến trình con. Ứng dụng được khôi phục phát hành cùng `SessionId`; quá trình replay thông thường sẽ khôi phục transcript (bản ghi văn bản), tiêu đề, việc cần làm và trạng thái đích đã persist. Hệ thống cố ý hủy kích hoạt trạng thái đích, còn TUI thì yêu cầu người dùng xác nhận tiếp tục hoặc thực hiện `/goal resume`.

Dòng in ra khi thoát là một khe ngữ cảnh do trình khởi chạy sở hữu, không phải một mẫu cấu hình; các host không hỗ trợ bàn giao tại chỗ sẽ nói rằng phiên vẫn có thể khôi phục, thay vì đưa ra một lệnh mà nó không thể xây dựng được. [Danh tính phiên và dòng thoát do trình khởi chạy sở hữu](../architecture/2026-07-28-launcher-owned-resume-identity.md) ghi lại lần chuyển giao quyền sở hữu này, và thay thế khóa cấu hình `resumeCommand` mà bản ghi này ban đầu đã đưa ra. TUI vẫn tuyệt đối không thực thi văn bản shell.

## Alternatives considered

**Để TUI tự tạo tiến trình lệnh khôi phục.** Bác bỏ: văn bản đó là nội dung hiển thị, không phải danh sách tham số đáng tin cậy, và TUI không sở hữu việc tháo dỡ ứng dụng hay vòng đời tiến trình. Giao diện host bị giới hạn chỉ nhận vào một `SessionId` đã xác thực.

**Xây dựng agent đã khôi phục ngay bên trong TUI hiện có.** Bác bỏ: thay thế agent được tạo từ cấu hình ở tầng hiển thị sẽ vượt qua quyền sở hữu Loader, khởi tạo plugin theo phạm vi, giải phóng tài nguyên persist và vòng đời terminal. Giải phóng ứng dụng gốc và thay thế tiến trình có thể tái sử dụng đường khởi chạy đã được hỗ trợ.

**Coi thiếu adapter như thiếu phiên.** Bác bỏ: tính hợp lệ của lưu trữ và khả dụng của routing hiện tại là hai sự thật độc lập với nhau. Bộ chọn sẽ giữ lại dòng đó và chỉ ra provider/model không khả dụng.

**Tiếp tục trạng thái kích hoạt của đích khi khôi phục phiên.** Bác bỏ: ý định được persist không có nghĩa là vẫn được ủy quyền tiếp tục thực thi sau khi vượt qua ranh giới người dùng hoặc tiến trình. Giai đoạn của đích sẽ được giữ lại, nhưng không tự động chạy tiếp.

## Consequences

- Kiểm tra sơ bộ không tuần tự hóa các tiến trình khác nhau; nhiều tiến trình có thể đồng thời chọn hoặc khôi phục cùng một phiên đã persist.
- `/resume` phụ thuộc vào `session-query` để phát hiện phiên và đọc log đầy đủ, nhưng việc persist và bàn giao host vẫn là tính năng tùy chọn; khi không có host, lệnh vẫn có thể dùng ở chế độ dự phòng.
- Việc thay thế tiến trình cố ý khởi động lại tổ hợp Loader. Hệ thống sẽ xây dựng lại trạng thái chỉ tồn tại trong runtime, còn trạng thái phiên chỉ được ghi trong log hoặc header phiên mới được giữ lại.

## Testing

Bộ test package TUI bao phủ điều hướng bàn phím, tìm theo tiêu đề/id, xóa tìm kiếm rồi hủy, từ chối khôi phục khi agent đang chạy, từ chối khôi phục phiên hiện tại và các phiên đã hoạt động trong runtime hiện tại, thiếu routing, dòng ứng viên bị hỏng, kiểm tra lại sơ bộ, cảnh báo khi không có host, và trình tự dừng terminal trước khi bàn giao host. Test session-query cố định việc xác thực log đầy đủ tách rời khỏi runtime. Test khôi phục agent-loop cố định danh tính phiên và lịch sử hoàn toàn nhất quán; bộ test replay tiêu đề, việc cần làm và đích cố định rằng các phép chiếu này đều có thể khôi phục, và trạng thái kích hoạt của đích đã bị hủy. Bản chụp nhanh ngữ nghĩa cấp package cố định trang chọn toàn màn hình và điểm neo con trỏ của bộ gõ; đơn vị triển khai TUI chịu trách nhiệm nghiệm thu việc bàn giao tiến trình và PTY của mình.
