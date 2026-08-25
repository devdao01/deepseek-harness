# Agent Note: Snapshot trạng thái terminal ngữ nghĩa của TUI

Status: implemented
Archived: 2026-08-04

[English](2026-07-18-tui-terminal-state-snapshots.md) | Tiếng Việt

## Vấn đề

TUI là một renderer có trạng thái. Kết quả cuối cùng người dùng nhìn thấy phụ thuộc vào việc phân tích ANSI, khung hình diff, xuống dòng, buffer cuộn ngược, vị trí viewport, chiều rộng terminal, tiêu điểm, trạng thái con trỏ, cùng ý đồ trình bày của từng tool. Unit test thu thập các mảnh `Terminal.write()` có thể kiểm chứng việc xử lý sự kiện, nhưng không kiểm chứng được hình ảnh cuối cùng terminal hiển thị. Cùng một hình ảnh cũng có thể sinh ra từ những mảnh ghi khác nhau, nên cố định các mảnh này sẽ tạo ra báo động giả.

Snapshot theo dòng của component dừng lại trước khi ANSI đi vào terminal, nên không bao phủ được việc di chuyển con trỏ, xóa màn hình, kiểu dáng, cách ghép lớp phủ và việc bố trí lại. Ảnh chụp raster thì kéo theo nhiễu về font và cách render theo nền tảng, vốn không liên quan gì đến cam kết của TUI. Việc dựng một luồng đầy đủ bằng cách nối trực tiếp các sự kiện phiên trông có vẻ hợp lý cũng còn một điểm mù nữa: kiểu test đó chỉ chứng minh renderer chấp nhận các hình thái dữ liệu này, chứ không chứng minh được agent loop (vòng lặp tác tử) và phần cài đặt tool trong môi trường sản phẩm sẽ sinh ra đúng những sự kiện đó.

Vì vậy, TUI dùng lại được cần một biểu diễn trạng thái terminal tất định và dễ review. Bản triển khai sản phẩm cung cấp nó còn phải chạy luồng model đã ghi qua ngăn xếp kỹ thuật đã lắp ráp, và giữ lại một lớp test phạm vi hẹp hơn bao phủ ranh giới tiến trình thật và PTY.

## Quyết định

Coverage của TUI dùng lại được chia thành hai tầng bổ trợ ở cấp package:

1. `packages/ui/tui/tests/tui.spec.ts` kiểm thử trực tiếp việc ánh xạ sự kiện, định tuyến input, giải phóng tài nguyên và hành vi khi lỗi.
2. `packages/ui/tui/tests/tui.snapshot.ts` gắn TUI sản phẩm vào một trình giả lập terminal không giao diện, bao phủ những trạng thái thoáng qua mà session log đầy đủ không giữ lại được: output đang stream, tool call chờ hoàn tất, lớp phủ, trạng thái mở rộng, việc bố trí lại khi compaction, lỗi và quá trình đóng.

[Quyết định về entry point cấu hình tường minh](../simplification/2026-08-03-explicit-config-dsh-entrypoint.md) đã loại bỏ tổ hợp TUI sản phẩm, luồng ứng dụng đã ghi và bộ test PTY. Bản triển khai cung cấp entry point terminal chịu trách nhiệm cho các tầng ứng dụng lắp ráp đó; test cấp package không tự nhận là cung cấp coverage sản phẩm.

### Phần replay ứng dụng đã bị loại bỏ

Bộ test ứng dụng đã xóa cung cấp cho mỗi kịch bản một `session.jsonl`, log phiên con tùy chọn `session.<n>.jsonl`, và `terminal.expected.txt`. Log chính cung cấp prompt `user/message` có nguồn từ người dùng và chuỗi `assistant/chunk` đã ghi. `dsh-llm-replay` dẫn xuất một script gọi model cho mỗi phiên và là ranh giới mock duy nhất trong test; agent loop, tool, worker, presenter và TUI đều dùng bản cài đặt sản phẩm.

Nếu thứ tự tool call không khớp, số sự kiện kỳ vọng không đủ, tool result báo lỗi, lượt kết thúc sai cách, vòng đời workflow không trọn vẹn, hoặc số phiên con chạy thật không khớp tập fixture (dữ liệu chuẩn bị cho test), bộ test này sẽ từ chối luồng đó. Các kiểm tra ấy vẫn là mô hình nghiệm thu cho bất kỳ bản triển khai terminal nào trong tương lai; chúng chỉ không còn được cung cấp dưới dạng fixture nữa.

Quy trình record đã bị loại bỏ dùng `DSH_SNAPSHOT=record` để ghi luồng model và `DSH_SNAPSHOT=refresh` để cập nhật output terminal dẫn xuất. Khi gỡ entry point sản phẩm, các chế độ này cũng bị gỡ khỏi kênh snapshot của repository; snapshot của TUI dùng lại được nay do các kịch bản cấp package viết trực tiếp.

### Phép chiếu terminal ngữ nghĩa

`HeadlessTerminal` trong package hiện thực đúng interface `Terminal` của pi-tui như terminal tiến trình, và chuyển mỗi lần ghi ANSI cho trình phân tích `@xterm/headless` đã ghim phiên bản. Trước khi đọc trạng thái, code snapshot sẽ chờ khung hình đồng bộ ổn định. Điểm kiểm tra output stream sẽ đóng băng interval của loader, đồng thời vẫn giữ một khoảng chờ theo đồng hồ thật vượt qua một tick hoạt ảnh, nhờ đó cố định được trạng thái ngữ nghĩa chứ không phải một glyph loading mà scheduler tình cờ render ra.

Mỗi expected output chiếu kích thước terminal, buffer đang hoạt động và tọa độ viewport, trạng thái vòng đời và con trỏ, từng dòng, dấu xuống dòng cùng các khoảng kiểu dáng khác mặc định thành văn bản. Các card có nhiều nội dung cuộn thì bắt buffer đã dùng; lớp phủ thì bắt viewport nhìn thấy được. Văn bản và kiểu dáng tách rời nhau, nên người review phân biệt được thay đổi nội dung với thay đổi trình bày mà không cần giải mã byte ANSI.

Mỗi điểm kiểm tra còn cưỡng chế tính độc lập với theme trên toàn bộ trạng thái terminal: cấm màu RGB, cấm các mục bảng màu ngoài ANSI 0–15, và cấm cả màu nền tường minh. Dòng được chọn dùng màu mặc định của terminal để đảo màu, nên vẫn hoạt động. Cả hai bộ test đều có danh sách khép kín, sẽ từ chối kịch bản thiếu, điểm kiểm tra thiếu và file expected output còn sót lại.

### Ma trận kịch bản bắt buộc

| Tầng | Kịch bản | Cam kết được cố định |
|---|---|---|
| Thoáng qua | Output stream và lời gọi cấp cao đang chờ | Suy luận và văn bản đang diễn ra, cùng các card Code Mode, workflow và Cordis đang chờ mà log đầy đủ không giữ lại |
| Thoáng qua | Card, tương tác, bố cục, thất bại và đóng | Họ card thu gọn và mở rộng, kiểm tra câu hỏi, việc thay thế khi compaction, bố trí lại theo kích thước, trợ giúp và lỗi, khôi phục con trỏ và việc dừng terminal |

## Các phương án từng cân nhắc

- **Snapshot các lần ghi terminal thô**: không chọn, vì render diff có thể thay đổi ranh giới ghi ngay cả khi hình ảnh không đổi, và các chuỗi con trỏ cùng xóa màn hình rất khó review.
- **Snapshot các dòng render của component trước khi đi vào output terminal**: không chọn, vì nó không kiểm thử được việc phân tích ANSI, di chuyển con trỏ, lớp phủ, hành vi viewport, cũng như tương tác giữa các component độc lập trong cùng một khung hình.
- **Dựng toàn bộ luồng đầy đủ bằng cách nối các sự kiện phiên**: không chọn, vì chuỗi sự kiện viết tay có thể lệch khỏi agent loop, việc thực thi tool, việc gắn kết phiên con hay hành vi worker, mà test trình bày vẫn xanh. Việc dựng sự kiện trực tiếp chỉ dùng cho các trạng thái thoáng qua của renderer.
- **Dùng lại expected output trên stdout của ACP làm căn cứ phán định cho TUI**: không chọn, vì luồng model đã ghi thì độc lập với phương thức transport, còn cách trình bày thì không. Bản triển khai terminal có expected output riêng, đồng thời vẫn dùng lại được cùng bộ từ vựng replay JSONL.
- **Commit ảnh chụp raster**: không chọn, vì font, số đo glyph, khử răng cưa và theme của terminal chủ sẽ khiến kết quả phụ thuộc nền tảng, đồng thời làm việc review thay đổi kiểu dáng ngữ nghĩa khó hơn.
- **Chỉ dùng test end-to-end trên PTY**: không chọn, vì output PTY thô là một chuỗi thao tác vẽ theo lịch sử chứ không phải trạng thái cuối cùng có thể truy vấn. Test PTY giữ lại Loader thật, ranh giới input và dọn dẹp, còn trình giả lập lo phần coverage trạng thái trên diện rộng.

## Hệ quả

- Khi việc ánh xạ sự kiện hoặc trình bày của TUI hỏng, snapshot cấp package sẽ thất bại; chúng không thay thế được transcript đường đi tool của ứng dụng đã lắp ráp.
- Hồi quy hình ảnh của TUI tạo ra diff ô và kiểu dáng dễ đọc, còn fixture JSONL giữ lại đúng những mảnh model đã kích hoạt đường đi sản phẩm.
- Trình giả lập dùng API buffer đang được đề xuất của xterm. Khi nâng cấp xterm phải chạy lại và review phép chiếu ngữ nghĩa; các hành vi đặc thù của terminal vẫn cần được bao phủ bởi smoke test PTY do bản triển khai cung cấp terminal đó sở hữu.
- Expected output cố ý cố định hành vi xuống dòng và viewport ở kích thước chỉ định. Thay đổi bố cục có chủ đích sẽ cập nhật và review snapshot ngữ nghĩa cấp package.
