# Agent Note: Khôi phục session xuyên workspace

Status: implemented

[English](2026-07-28-cross-workspace-resume.md) | Tiếng Việt

## Problem

`/resume` chỉ chạm tới được những session được tạo trong thư mục khởi động, nên muốn quay lại công việc hôm qua ở một project khác thì phải nhớ đường dẫn của nó, thoát TUI, rồi khởi động lại tại đó. Có hai nguyên nhân độc lập với nhau gây ra giới hạn này, và chỉ sửa một trong hai thì không thay đổi được gì.

Lưu trữ mới là nguyên nhân mang tính quyết định. Bản TUI composition đã phát hành đặt mặc định persistence root thành đường dẫn tương đối `./.sessions`, nên mỗi thư mục khởi động chiếm riêng một JSONL root rời rạc, cùng một `session-query.db` phái sinh cũng rời rạc. Session đến từ project khác không phải bị lọc bỏ khỏi danh sách — chúng đơn giản không tồn tại trong kho lưu trữ mà danh sách đọc. Backend JSONL vốn đã phân vùng theo cwd *bên trong cùng một* root, nên việc phân vùng bị chồng thành hai lớp: một lớp theo root, một lớp bên trong root.

Tiếp đó picker lại lọc thêm một lần nữa. Nó loại bỏ các bản ghi có `cwd` khác với session hiện tại trước khi hiển thị, còn `summarizeResumeCandidate` lại độc lập đánh dấu `cwd` khác nhau là `disabledReason: 'different workspace'`, nên một session bên ngoài dù thực sự có mặt trong kho lưu trữ thì vừa bị ẩn đi, vừa bị từ chối.

Cuối cùng, luồng khôi phục không bao giờ đổi thư mục. Host thực thi lại `dsh --resume=<id>` qua `process.execve`, và tiến trình đó kế thừa cwd. Giá trị cwd trong *header* của session được phục hồi từ log, nhưng `dsh-fs-local`, bộ thực thi bash cùng glob/grep lại phân giải đường dẫn dựa trên cwd của tiến trình, nên khôi phục một session bên ngoài sẽ vừa phát lại transcript (bản ghi văn bản) của nó, vừa tác động lên nhầm project.

## Decision

Cấu hình CLI (giao diện dòng lệnh) dùng chung cung cấp cùng một session root nằm dưới Harness home, picker có thêm phạm vi workspace, và quá trình bàn giao mang theo thư mục đích.

**Lưu trữ.** Base dùng chung nắm giữ giá trị mặc định trong `apps/cli/config/base.cordis.yml`: mục cấu hình `session-persistence-jsonl` của nó gọi `dshHomePath('sessions')` do app-boot cung cấp, hàm này dùng bộ phân giải `DSH_HOME` chuẩn cùng giá trị dự phòng tiêu chuẩn `~/.dsh`. Nhờ vậy TUI, Web và headless dùng chung một giá trị mặc định, không cần patch launcher hay slot riêng cho session. Nếu một overlay hoặc patch cá nhân khai báo root một cách tường minh, nó sẽ thay thế trọn vẹn phần `config` của mục đó và tiếp tục là lựa chọn có thẩm quyền cho bản triển khai.

**Là phạm vi, không phải loại trừ.** Workspace nằm ngoài workspace hiện tại là một phạm vi hiển thị, chứ không phải lý do vô hiệu hóa. `showResume()` tổng hợp mọi bản ghi, `ResumePicker` giữ một `scope` kiểu `'workspace' | 'all'`, mặc định là workspace hiện tại, nên tình huống thường gặp không thay đổi gì. Tab chuyển phạm vi; dòng phạm vi cho biết phạm vi đang có hiệu lực cùng số lượng ở phạm vi còn lại; trong phạm vi toàn bộ workspace, mỗi dòng đều báo workspace của chính nó, còn nhãn đó chỉ được đưa vào phần văn bản tìm kiếm được khi đang ở đúng phạm vi hiển thị nó. Chuyển phạm vi sẽ xóa truy vấn và mục đang chọn, để dòng được tô sáng luôn thuộc danh sách đang thấy; còn dòng workspace theo từng mục khiến mỗi mục trong phạm vi đó chiếm thêm một dòng trên terminal, và ngân sách số mục hiển thị đã tính đến điều này.

Vì vậy `summarizeResumeCandidate` bỏ `'different workspace'` và thêm `'session has no recorded workspace'`. Đây là một lý do từ chối thực sự mới, chứ không phải đổi tên: header không có `cwd` thì không chỉ ra thư mục nào để host bước vào, nên dù log của nó còn nguyên vẹn thì vẫn không thể hoàn tất việc bàn giao.

**Bàn giao.** Ngoài `SessionId`, `TuiResumeHost.handoff` còn nhận thêm `cwd` đích. `preflightResume` phân giải cả hai cùng lúc và trả về cùng lúc, nên bên gọi không thể suy diễn lại một thư mục cũ đã lỗi thời từ chính dòng mà nó đã hiển thị — bản ghi có `cwd` thay đổi trong khoảng giữa lúc hiển thị danh sách và lúc preflight sẽ được khôi phục trong thư mục *vừa đọc lại được*, và đó cũng là lý do hành vi "từ chối cwd đã thay đổi" trước đây nay trở thành bàn giao kèm đường dẫn mới. Host đã phát hành đổi thư mục trước khi áp dụng dispose (giải phóng tài nguyên): thư mục không truy cập được phải bị từ chối ngay khi bên gọi vẫn còn khôi phục được terminal, vì sau khi tháo dỡ thì không còn chủ sở hữu nào để báo cáo. Việc khôi phục luôn dùng interface `dsh --resume` mặc định, vì `meta` sẽ từ chối các tùy chọn cấp cha; quá trình bàn giao đã bước vào thư mục đích được lưu bền vững rồi.

## Alternatives considered

**Patch `persistenceRoot` từ launcher `dsh` thay vì đổi giá trị mặc định của composition bundle.** Bị bác sau khi phát hiện rằng loader patch gán trọn vẹn `config`. Lớp overlay `~/.dsh/config.yaml` cá nhân vốn đã patch mục `tui-agent` bằng một cấu hình cục bộ, và đó chính là lý do `persistenceRoot` ngay từ đầu lùi về giá trị mặc định của bundle; patch từ launcher hoặc sẽ bị lớp overlay đó xóa mất, hoặc phải đè lên nó, khiến overlay vĩnh viễn không còn đặt được trường này nữa. Đặt giá trị mặc định trong bundle thì chịu được mọi patch cục bộ và giữ cho dữ kiện này chỉ có một nơi sở hữu.

**Giữ `./.sessions` và quét thêm root nằm trong Harness home.** Bị bác: hai root nghĩa là hai chỉ mục SQLite và một danh sách hợp nhất — trong đó trạng thái hoạt động và nguồn thẩm quyền về phiên bản của từng dòng lại không giống nhau, tất cả chỉ để giữ lại phần khả kiến của log mà quyết định không di trú vốn đã chấp nhận từ bỏ.

**Di trú các log cục bộ theo project hiện có sang root dùng chung.** Bị bên yêu cầu bác bỏ. Session nằm dưới `./.sessions` của project vẫn còn trên đĩa, vẫn khôi phục được bằng cách chạy `dsh --resume <id>` một cách tường minh từ thư mục đó, chỉ là không còn xuất hiện trong `/resume` nữa.

**Trải toàn bộ workspace thành một danh sách phẳng.** Bị bác: cách này đánh mất giá trị mặc định "project này" mà đại đa số tình huống mong muốn, và trong một thư mục home bận rộn thì session của project hiện tại sẽ phải tranh giành sự chú ý với những session không liên quan.

**Để host suy ra thư mục từ header session sau khi phục hồi.** Bị bác: header session là trạng thái hướng tới model và prompt, chỉ được phục hồi *sau* khi khởi động, trong khi thư mục phải được bước vào *trước* `execve`. Truyền nó một cách tường minh giữ cho trật tự này luôn hiện rõ tại seam.

## Consequences

- Những session đã nằm sẵn dưới `./.sessions` cục bộ theo project sẽ biến mất khỏi `/resume`. Đây là cái giá được chấp nhận khi không di trú.
- Khôi phục một session có thể làm thay đổi thư mục làm việc của tiến trình, nên khôi phục session bên ngoài không đơn thuần là phục hồi transcript — mọi công cụ phân giải đường dẫn đều dịch chuyển theo.
- Harness home giờ lưu log session của mọi project trên máy này. Mức tăng trưởng của nó không còn bị ràng buộc bởi một checkout đơn lẻ, và ghi chú này cũng không đưa ra chính sách lưu giữ nào.

## Testing

Các bài test TUI phủ: phạm vi mặc định ẩn workspace khác nhưng vẫn báo số lượng của chúng, Tab hiển thị chúng kèm nhãn workspace theo từng dòng, nhấn Tab lần nữa để quay lại thì xóa truy vấn và mục đang chọn, tìm kiếm theo nhãn workspace, bản ghi không có cwd vẫn hiển thị nhưng không chọn được, và bàn giao nhận đồng thời id lẫn workspace được đọc lại tại thời điểm preflight. Ca kiểm thử "từ chối cwd đã thay đổi" trước đây nay khẳng định rằng bàn giao mang theo thư mục mới. Bài test PTY trên CLI đã build kiểm chứng giá trị mặc định của cấu hình dùng chung cùng chỉ mục truy vấn phái sinh theo từng tiến trình. Snapshot TUI không cần khóa cố định hai phạm vi của picker, bao gồm dòng phạm vi, dòng workspace theo từng mục, và gợi ý Tab ở footer. Một lần khôi phục xuyên workspace thực hiện thủ công đã xác minh ở mức tiến trình rằng thư mục làm việc của tiến trình sau khi thay thế đúng là workspace đích.
