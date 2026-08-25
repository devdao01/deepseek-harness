# Agent Note: Dòng ngữ cảnh diff của TUI giữ màu trung tính

Status: implemented
Archived: 2026-08-04

[English](2026-07-31-tui-diff-context-line-accounting.md) | 中文

## Vấn đề

Khi kết quả diff của filesystem trả về, mỗi `FileDiff.oldText` và `FileDiff.newText` đều chứa thay đổi đã áp dụng cùng 3 dòng ngữ cảnh trước và sau nó. TUI render mọi dòng ở phía cũ thành dòng xóa, mọi dòng ở phía mới thành dòng thêm, kể cả phần ngữ cảnh giống nhau ở cả hai phía. Do đó, một chỉnh sửa một dòng sẽ hiển thị thành xóa 7 dòng và thêm 7 dòng, footer cũng lặp lại các tổng bị thổi phồng đó.

## Quyết định

TUI so sánh mỗi `FileDiff` khi cả văn bản trước và sau thay đổi đều khả dụng. Dòng thêm và dòng xóa vẫn được đánh dấu lần lượt bằng `+` màu xanh và `-` màu đỏ; các dòng ngữ cảnh giống nhau dùng tông màu chữ thường đã làm mờ, với tiền tố trung tính gồm hai khoảng trắng. Footer chỉ tổng hợp các dòng được phân loại là thêm hoặc xóa. `maxDiffEditLength` đặt giới hạn cho phép so sánh chính xác dựa trên tổng số dòng thêm và xóa, mặc định là 1000. Khi vượt giới hạn, TUI render toàn bộ phía cũ thành nội dung xóa, toàn bộ phía mới thành nội dung thêm, đánh dấu footer là kết quả gần đúng, và cache lại kết quả đó để tránh so sánh lặp lại ở các lần vẽ lại sau. Kết quả tool xóa cache view đang chờ xử lý trước khi phát sinh view đã chốt, ngay cả khi presenter sửa đổi và tái sử dụng cùng một đối tượng view.

Khi `oldText` là `null`, renderer không thể phân biệt giữa việc tạo file, ghi đè đang chờ xử lý, và trường hợp fallback do văn bản cũ không khả dụng. Vì vậy, nó hiển thị và tính mọi dòng không rỗng ở phía mới là dòng thêm, nhưng không khẳng định rằng các dòng này vốn không tồn tại trong file đã có sẵn. Khi nội dung mới rỗng, sẽ không render các dòng thêm hư cấu.

Hành vi này vẫn chỉ là cách diễn giải của phía tiêu thụ đối với hợp đồng `FileDiff` hiện có. Công cụ filesystem vẫn lưu lại các đoạn thay đổi trước/sau kèm ngữ cảnh, nên các bên tiêu thụ khác vẫn có được ngữ cảnh định vị, và các log phiên hiện có cũng sẽ áp dụng cách hiển thị TUI đã sửa khi replay. TUI và `dsh-tool-fs` dùng chung một package `diff` được bảo trì, không cần đưa vào một cài đặt diff theo dòng thứ hai.

## Phương án đã cân nhắc

**Loại bỏ ngữ cảnh khỏi metadata kết quả filesystem.** Không áp dụng: hunk đã áp dụng kèm ngữ cảnh là đầu ra có chủ đích của bên sản xuất, phục vụ các editor có khả năng tương ứng; thay đổi nội dung này sẽ khiến mọi bên tiêu thụ mất thông tin, đồng thời log phiên cũ vẫn gây hiểu lầm trong TUI.

**Mở rộng `FileDiff` với nhãn theo dòng được lưu trữ.** Không áp dụng: các nhãn này có thể được suy ra một cách xác định từ cặp văn bản trước/sau hiện có; lưu trữ nhãn chỉ cho một renderer sẽ mở rộng hợp đồng cross-package và hợp đồng log phiên một cách không cần thiết.

**Không dùng thuật toán diff, khớp các dòng giống nhau theo vị trí.** Không áp dụng: việc chèn và xóa sẽ làm dịch chuyển ngữ cảnh phía sau, nên khớp theo vị trí sẽ phân loại sai các hunk hợp lệ.

**Cho mọi phép so sánh chạy đến khi hoàn tất.** Không áp dụng: view tool đang chờ xử lý có thể chứa chuỗi cũ/mới do model sinh ra với độ dài không giới hạn, một phép so sánh Myers không giới hạn có thể chặn renderer terminal đồng bộ.

## Hệ quả

Card diff của TUI phân biệt ngữ cảnh dùng để minh chứng với chính thay đổi, footer `+A -R` chính xác báo cáo đúng số lượng dòng thay đổi thực tế. Việc replay các diff có ngữ cảnh hiện có nhận được cách render đã sửa mà không cần migrate. Hunk filesystem tại thời điểm có kết quả bị giới hạn bởi phạm vi ngữ cảnh; view đang chờ xử lý không giới hạn thì hoặc hoàn tất so sánh trong ngân sách độ dài chỉnh sửa đã cấu hình, hoặc giảm cấp thành render tuyến tính được đánh dấu rõ là kết quả gần đúng.

Test TUI tập trung bao phủ ngữ cảnh trung tính, tổng chính xác, việc tạo file rỗng, fallback có giới hạn, việc vô hiệu cache khi kết quả đến, và việc tái sử dụng cache khi vẽ lại. Terminal snapshot tổ hợp `advanced-cards` cố định kiểu ngữ cảnh trung tính, màu ngữ nghĩa của dòng thay đổi, footer kết quả chính xác, và fallback gần đúng ở cả trạng thái card thu gọn và mở rộng.
