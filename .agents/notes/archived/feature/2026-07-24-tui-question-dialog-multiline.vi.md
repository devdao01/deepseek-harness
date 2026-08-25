# Agent Note: TUI QuestionDialog render tùy chọn theo dạng nhiều dòng

Status: implemented

Archived: 2026-08-04

[English](2026-07-24-tui-question-dialog-multiline.md) | 中文

## 问题

`ctx.userInteraction.ask()` phải đảm bảo nội dung câu hỏi, phần bổ sung `detail`, nhãn tùy chọn, mô tả, thông tin kiểm tra và điều khiển đều có thể đọc được trong giới hạn chiều rộng và chiều cao đã cấu hình. Bảng câu hỏi cũng nằm ngay phía trên editor: nếu đặt nó ở mép terminal, quyết định đang chờ xử lý sẽ đồng thời tách rời khỏi cả transcript (bản ghi văn bản) kích hoạt quyết định đó và phần nhập liệu tiếp theo.

## 决策

TUI render câu hỏi đang chờ xử lý như một modal nội tuyến nằm giữa khu vực transcript/trạng thái và editor, đồng thời vẫn dùng chung FIFO với overlay của mô hình và overlay của plugin:

- `InlineModalComponent` áp dụng `questionDialogWidth` và `questionDialogMaxHeight` trong luồng component thông thường. Sau khi dành chỗ cho editor, hệ thống còn giới hạn chiều cao thực tế của câu hỏi theo viewport hiện tại, do đó khi thay đổi kích thước cửa sổ, editor vẫn nằm dưới câu hỏi.
- `renderOptionBlock` xuống dòng mỗi nhãn xuống dưới tiền tố con trỏ/số thứ tự, và render mô tả mờ trên một dòng khác có cùng thụt lề. Tiêu đề tiến trình, câu hỏi, gợi ý đáp án tùy chỉnh, văn bản kiểm tra và dòng cuối cũng bị ràng buộc theo giới hạn chiều rộng; việc cắt bằng dấu ba chấm cuối cùng chỉ dùng như ranh giới an toàn cho tiền tố hoặc nội dung không thể tách khác.
- Khi nội dung câu hỏi hoặc `detail` vượt quá không gian dành cho phần đầu, phần đầu sẽ trở thành một viewport dòng phân trang với dòng trạng thái riêng `… lines A-B/N • PgUp/PgDn`. Page Up và Page Down sẽ duyệt qua hai viewport dòng này: điều hướng tiến sẽ lật hết trang nội dung câu hỏi/`detail` trước, rồi mới sang trang tùy chọn được chọn quá khổ; điều hướng lùi theo thứ tự ngược lại. Điều này đảm bảo nội dung `detail` của việc rà soát kế hoạch luôn có thể truy cập được, không bị giới hạn chiều cao chặn lại.
- Trước khi `windowBlocks` chạy, ngân sách dòng tùy chọn sẽ trừ đi padding, dòng tiêu đề, dòng vị trí và dòng chân trang. Cửa sổ tuân thủ cả `maxQuestionOptions` lẫn ngân sách dòng còn lại, giữ mục đang chọn luôn hiển thị, và render các tùy chọn bị lược bớt thành nhãn `↑ N more`/`↓ N more`. Nếu các phần tử giao diện cố định khiến số dòng tùy chọn ít hơn bốn dòng, phần đầu gọn sẽ chuyển thành bộ phân trang theo dòng, nhờ đó chứa được nội dung đang chọn, trạng thái phân trang, và hai nhãn tùy chọn trên dưới.
- Khi một khối đang chọn vượt quá không gian được cấp, nó sẽ trở thành một viewport dòng có dòng trạng thái `lines A-B/N • PgUp/PgDn`. Page Up và Page Down có thể hiển thị từng dòng nội dung đã xuống dòng, đồng thời ngăn khối đó che khuất nhãn tùy chọn, thông tin kiểm tra hoặc điều khiển.

Test package cố định giới hạn số lượng và chiều cao, thứ tự phân trang của phần đầu và khối đang chọn, việc xuống dòng ở chiều rộng hẹp, hành vi chọn, cũng như vị trí câu hỏi so với phần nhập liệu editor được giữ lại. Bản chụp nhanh ngữ nghĩa TUI cố định bố cục terminal đã lắp ráp, việc chuyển đổi phân trang của phần đầu/chi tiết và tùy chọn đang chọn, cũng như trạng thái kiểm tra.

## 备选方案

**Chỉ cắt ngang bằng dấu ba chấm.** Giữ mỗi tùy chọn một dòng, chỉ có thể gợi ý là văn bản bị mất, không thể làm mô tả đọc được, cũng không thể xử lý giới hạn theo chiều dọc. Cách triển khai này sẽ xuống dòng nội dung có thể đọc được, chỉ giữ dấu ba chấm làm ranh giới an toàn cuối cùng.

**Gộp nhãn và mô tả rồi xuống dòng.** Dòng gộp sẽ ghép chiều rộng của cả hai lại với nhau, bên nào cũng có thể chiếm không gian của bên kia. Render tách dòng giúp chiều rộng của cả hai có thể dự đoán được.

**Giữ câu hỏi như một overlay ở mép dưới terminal.** Tùy theo transcript và chiều cao viewport, một bảng neo ở mép terminal có thể xuất hiện sau editor, cũng có thể che khuất phần tử giao diện phía dưới. Modal nội tuyến giữ được thứ tự, trong khi trình quản lý modal vẫn tiếp tục chịu trách nhiệm về focus và quyền sở hữu FIFO.

**Đẩy việc xử lý ranh giới xuống pi-tui.** Lớp cắt overlay chung không thể nhận biết ranh giới tùy chọn, nội dung đang chọn, điều khiển hay quan hệ với editor nội tuyến. Do đó, hộp thoại chịu trách nhiệm về ngữ nghĩa này sẽ áp dụng quy tắc số lượng, số dòng và phân trang.

**Chỉ dùng giới hạn số lượng tùy chọn.** `maxQuestionOptions` vẫn là giới hạn số lượng công khai, nhưng chỉ dựa vào nó không thể chứa các khối đã xuống dòng. Hộp thoại sẽ thực thi đồng thời cả giới hạn số lượng lẫn giới hạn số dòng.

## 后果

- Mô tả sẽ chiếm thêm dòng, do đó số tùy chọn hiển thị có thể ít hơn `maxQuestionOptions`; nhãn sẽ cho biết số tùy chọn bị lược bớt.
- Nội dung câu hỏi dài hơn và `detail` rà soát kế hoạch vẫn có thể truy cập trong bảng bị giới hạn chiều cao, đổi lại Page Up và Page Down phải dùng chung với phân trang tùy chọn đang chọn.
- Khối đang chọn vượt quá không gian sẽ dành riêng một dòng thông tin trạng thái; muốn đọc các dòng ngoài trang hiện tại phải dùng Page Up hoặc Page Down.
- Trong viewport thấp hơn, câu hỏi nội tuyến có thể đẩy các dòng transcript trước đó ra khỏi vùng hiển thị. Khi thấp hơn chiều cao tối thiểu đã cấu hình, phương án dự phòng cuối cùng có thể gấp các dòng phía trên vào sau một nhãn dòng ẩn rõ ràng, để điều khiển nhập liệu và editor vẫn khả dụng.
- Schema hướng mô hình, nhãn đang chọn, hành vi hủy/hủy bỏ, cũng như đường dẫn elicitation của ACP (Agent Client Protocol) đều giữ nguyên không đổi.
