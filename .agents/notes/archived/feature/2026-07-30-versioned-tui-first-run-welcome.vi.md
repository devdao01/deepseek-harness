# Agent Note: Màn hình chào mừng lần chạy đầu tiên có phiên bản hóa cho TUI

Status: implemented
Archived: 2026-08-03

[English](2026-07-30-versioned-tui-first-run-welcome.md) | 中文

## Vấn đề

`dsh` terminal đã bàn giao đi thẳng vào editor, không cung cấp cho những người thử nghiệm nội bộ lần đầu sử dụng bất kỳ ghi chú độ chín sản phẩm bền vững nào hay hướng dẫn kênh phản hồi. Phụ đề một dòng hiện có của banner `welcome` không đủ chỗ cho thông báo được chỉ định, nếu không sẽ chiếm chỗ của header phiên bình thường; nếu ghi onboarding vào session log, việc này còn tạo ra một lượt người dùng hoặc ngữ cảnh model-visible không liên quan đến công việc của người dùng.

Thông báo này còn cần tạo thành một bố cục thị giác DeepSeek có tính nhận diện, đồng thời không được sao chép đồ họa khởi động của sản phẩm khác, cũng không được duy trì một bản vẽ tay gần đúng lệch khỏi logo chính thức.

## Quyết định

Launcher `dsh` chính thức giữ một cờ xác nhận có phiên bản hóa dưới `DSH_HOME` đã được resolve. Nó kiểm tra cờ bất biến này trước khi khởi động, và chỉ mount một Consumer `ctx.tui.openOverlay()` do effect giữ, sau khi dịch vụ TUI thật đã sẵn sàng. Enter là thao tác xác nhận duy nhất: plugin tạo và đồng bộ cờ cố định theo từng phiên bản trước, rồi mới đóng overlay. Escape và input không nhận dạng được sẽ giữ overlay mở; Ctrl+C và Ctrl+D thoát qua đường thoát bình thường và không xác nhận. Việc giải phóng tài nguyên sẽ chờ tác vụ xác nhận đã được khởi động bởi Enter; giải phóng tài nguyên hoặc thoát tiến trình trước khi bấm Enter sẽ không ghi gì cả. Số phiên bản là một phần của tên file cờ, nên chỉ cần tăng số phiên bản thông báo được giữ tập trung là có thể khiến văn bản có sửa đổi thực chất hiển thị lại một lần, không cần di trú hay viết lại tài liệu cấu hình tổng hợp.

Cờ này thuộc trạng thái launcher, không phải session persistence, vì tư cách hiển thị vượt qua session và workspace, nhưng phạm vi chỉ giới hạn trong một thư mục chính Harness. Mỗi lần Enter sẽ đồng bộ một file ngẫu nhiên cùng thư mục trước, rồi mới thay thế cờ cố định một cách nguyên tử (atomic); các lần khởi động đồng thời phát hành cùng một sự thật bất biến, nên người ghi cuối cùng với cùng giá trị chiến thắng sẽ không làm mất cập nhật, cũng không cần khóa hay phụ thuộc vào settings stack. Thông báo này tuyệt đối không append session event, không inject ngữ cảnh model, cũng không tạo lượt người dùng; do đó, khôi phục session chỉ hiển thị thông báo khi thư mục chính Harness cùng đó chưa xác nhận phiên bản này, và tuyệt đối không replay thông báo từ session log.

SVG DeepSeek `24x24` chính thức được chỉ định được commit làm nguồn thị giác chân thực. Các bản raster terminal đầy đủ, gọn và tối thiểu tĩnh lấy mẫu chính xác path đó ở độ phân giải vuông giảm dần theo từng cấp, không vẽ lại đường viền. Các ô Unicode `▀`/`▄`/`█` giúp mỗi ô terminal giữ được hai pixel nguồn theo chiều dọc; locale rõ ràng chỉ hỗ trợ ASCII thì dùng fallback tương đương ở mức bit là `'`/`_`/`#`. Style ANSI hoàn toàn tách biệt với SVG và văn bản có thể chỉnh sửa: `ctx.tui` cung cấp vai trò ngữ nghĩa `brand`, dùng giá trị màu chính thức `#4D6BFE` khi true color khả dụng, ngược lại dùng màu xanh ANSI chuẩn; khi tắt màu thì dùng văn bản thuần. Banner khởi động thông thường giữ nguyên gradient hiện có.

Overlay hiển thị căn giữa, dùng chiều rộng terminal khả dụng; chiều cao thì theo nội dung thực tế, chỉ giới hạn tối đa ở 90% viewport. Terminal rộng đặt icon đầy đủ cạnh title và body; terminal trung bình và hẹp xếp chồng icon gọn hoặc tối thiểu lên trên body; khi chiều cao không đủ, icon bị loại bỏ trước, rồi mới giảm không gian body. Body có thể cuộn, còn title và thao tác duy nhất giữ cố định. Mọi locale dùng chung một văn bản tiếng Trung được giữ tập trung, nội dung trích dẫn được nâng thành đoạn thị giác độc lập, nhưng không thay đổi chuỗi đó. Sau khi đóng overlay bằng Enter, quyền sở hữu modal được trả lại cho FIFO manager hiện có; manager này khôi phục editor, đồng thời giữ nguyên banner khởi động, transcript (bản ghi văn bản) và hành vi focus bình thường.

## Xác minh

Unit test tập trung chốt hash của SVG được chỉ định và văn bản tiếng Trung, việc tăng phiên bản, xác nhận độc quyền đồng thời, cờ định dạng sai, retry lưu trữ, hành vi Escape, fallback ASCII, lựa chọn phân cấp theo chiều rộng, render có giới hạn và cuộn khi chiều cao thấp. Các case Loader/PTY thật bao phủ 60, 80, 120, 160 cột cùng một viewport chiều cao thấp, tạo ra snapshot terminal ngữ nghĩa, chứng minh rằng cùng một `DSH_HOME` sau lần khởi động đầu tiên, khởi động lại sẽ ẩn hiển thị, và chứng minh khôi phục session không append bất kỳ message hoặc lượt người dùng nào bắt nguồn từ thông báo; lifecycle event của thoát terminal bình thường giữ nguyên không đổi.

## Các phương án thay thế từng cân nhắc

**Tái sử dụng phụ đề `welcome` của TUI.** Đây là header một dòng thoáng qua, chức năng bình thường là nhận diện session chưa có tiêu đề. Body và thao tác cần thiết hoặc sẽ bị cắt bớt, hoặc sẽ chiếm vĩnh viễn giao diện khởi động bình thường.

**Sao chép đồ họa khởi động hoặc bố cục của Claude Code.** Hệ thống phân cấp thị giác rõ ràng của nó là bằng chứng sản phẩm hữu ích, nhưng đồ họa, layout và xử lý thương hiệu thuộc về sản phẩm khác. SVG DeepSeek chính thức cung cấp nguồn thương hiệu trực tiếp, còn bố cục terminal được suy diễn độc lập dựa trên văn bản và ràng buộc responsive của thông báo này.

**Vẽ tay một con cá voi nguyên bản.** Đường viền vẽ tự do có thể có tính nhận diện, nhưng vẫn có thể không nhất quán với thân, không gian âm bên trong, vây và đuôi của logo chính thức. Lấy mẫu raster chính xác path có thể thể hiện rõ ràng giới hạn terminal, và giúp mỗi cấp có thể truy vết về cùng một tài nguyên nguồn.

**Lưu boolean trong session event hoặc tài liệu settings dùng chung.** Vòng đời trạng thái session không đúng, còn làm ô nhiễm lịch sử replay hoặc model-visible. Tài liệu tổng hợp để ghi một sự thật bất biến, cần gánh chịu khóa đọc-sửa-ghi xuyên tiến trình; cờ phiên bản thay thế nguyên tử không tồn tại vấn đề mất cập nhật.

**Cho phép Escape hoặc thao tác nhắc lại sau.** Cả hai đều khiến hủy và xác nhận không thể phân biệt, hoặc đưa vào chính sách nhắc lại mà thông báo này không cần. Thoát tiến trình bình thường vẫn là đường hủy bỏ, và sẽ khiến phiên bản này giữ trạng thái chưa xác nhận.

## Hệ quả

Mỗi thư mục chính Harness sẽ nhận một thông báo trong mỗi phiên bản văn bản, và chỉ ngừng hiển thị sau khi người dùng bấm Enter xác nhận thành công. Người bảo trì có thể chỉnh sửa văn bản tiếng Trung dùng chung cho mọi locale và phiên bản trong một file owner nhỏ, cũng có thể cập nhật SVG chính thức và các bản raster tĩnh dẫn xuất trong một owner thị giác độc lập, không cần tìm bản sao body đầy đủ trong từng snapshot.

Terminal không thể hiển thị trực tiếp vector SVG, nên độ trung thực khi hiển thị bị giới hạn bởi độ phân giải. Cấp nhỏ hơn giữ được đường viền đã lấy mẫu, nhưng chắc chắn mất chi tiết tinh xảo; terminal chiều cao thấp ưu tiên đảm bảo body dễ đọc và thao tác luôn có thể chạm tới, thay vì hiển thị đồ họa thương hiệu. Trong giai đoạn tiền phát hành, định dạng cờ cố ý dùng mỗi phiên bản một file; cờ cũ vô hại, cũng không cần reader tương thích ngược.
