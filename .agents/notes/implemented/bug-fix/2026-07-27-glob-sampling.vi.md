# Agent Note: Lấy mẫu kết quả glob vượt giới hạn xuyên toàn bộ cây thư mục

Status: implemented

[English](2026-07-27-glob-sampling.md) | 中文

## Vấn đề

Khi người dùng hỏi workspace chứa những gì, một agent (tác tử) đã mô tả một thư mục con nào đó như thể đó là toàn bộ dự án. Workspace đó có 22 mục cấp cao nhất và 11.485 file. `glob {"pattern":"*"}` khớp với 10.030 đường dẫn, nhưng 100 đường dẫn hiển thị inline lại đều nằm trong một cây con vừa mới giải nén gần đây, do đó model hoàn toàn không thấy 21 mục còn lại.

Ba hành vi riêng lẻ đều hợp lý đã cộng dồn lại tạo thành ấn tượng sai. Một mẫu glob không chứa `/` sẽ khớp tên file ở bất kỳ độ sâu nào, do đó `*` biểu thị mọi file trong cây thư mục, chứ không phải phép mở rộng của shell trên thư mục hiện tại. Cờ `--sort=modified` của Ripgrep sắp xếp tăng dần, do đó timestamp cũ được khôi phục từ gói lưu trữ giải nén sẽ khiến cây con đó xếp lên đầu. Sau đó, trang inline cắt thẳng phần đầu của thứ tự này mà không nói rõ nó chỉ đại diện cho một lát cắt tập trung vào một chỗ.

## Quyết định

Kết quả không vượt quá `globMaxResults` vẫn giữ nguyên đầy đủ, và nội dung được sắp xếp theo thời gian sửa đổi không đổi từng byte. Cấu hình bắt buộc `sampleOverCapGlobResults` không có giá trị dự phòng: `false` sẽ giữ lại phần đầu đã sắp xếp theo thời gian sửa đổi của kết quả vượt giới hạn, `true` sẽ lấy mẫu theo kiểu xoay vòng (round-robin) giữa các mục cấp cao nhất của kết quả đầy đủ. Trong chế độ lấy mẫu, mỗi mục sẽ nhận một vị trí trước, rồi mới có mục nhận vị trí thứ hai; nhóm đã dùng hết sẽ rút khỏi vòng xoay; thứ tự tương đối bên trong mỗi nhóm giữ nguyên ổn định; các nhóm được xác định dựa trên gốc tìm kiếm thực tế, kể cả khi `path` được chỉ định tường minh.

Trong chế độ lấy mẫu, footer sẽ nói rõ trang hiện tại là mẫu xuyên các mục, không phải phần đầu sắp xếp theo thời gian sửa đổi; khi số mục cấp cao nhất được chạm tới có thể cung cấp thêm thông tin, nó cũng sẽ báo cáo con số đó. Nếu số mục cấp cao nhất vượt quá số vị trí inline, footer sẽ yêu cầu model thu hẹp `path`. Chế độ giữ phần đầu dùng footer thông thường như khi đạt giới hạn.Khi spill thành công, cả hai chế độ đều giữ danh sách đã sắp xếp đầy đủ trong sản phẩm đó.

Prompt và schema sẽ nêu rõ cách sắp xếp kết quả vượt giới hạn do cấu hình chỉ định, việc mẫu không chứa `/` sẽ khớp ở bất kỳ độ sâu nào, và glob chỉ trả về file chứ không bao giờ trả về mục thư mục. Tổ hợp CLI (giao diện dòng lệnh) đi kèm sản phẩm chọn tường minh chế độ giữ phần đầu; các triển khai muốn trang đạt giới hạn có tính đại diện thì chọn chế độ lấy mẫu. Trong các triển khai lộ tool bash cho model, việc định vị thư mục vẫn thực hiện bằng thao tác shell thông thường: xem một thư mục dùng `ls`, tìm theo mẫu đường dẫn file chỉ định xuyên cây thư mục dùng glob. Luồng phát hiện skill (kỹ năng) vẫn dùng `ctx.fs.listDir` làm nguyên hàm provider nội bộ; quyết định này không thêm tool `list` hướng tới model nào.

## Các phương án đã cân nhắc

**Chỉ giữ phần đầu sắp xếp theo thời gian sửa đổi.** Bị bác bỏ sau khi đo lường hình thái sự cố thực tế. Một số triển khai cần cách sắp xếp ổn định này; nhưng triển khai coi trọng việc định vị workspace có thể chọn tường minh dữ liệu có tính đại diện, mà không cần yêu cầu model phải nghi ngờ liệu đây có phải lô đường dẫn duy nhất nó nhận được hay không.

**Cung cấp giá trị mặc định cho tùy chọn lấy mẫu.** Bị bác bỏ. Không có bằng chứng phạm vi toàn sản phẩm ủng hộ việc coi bất kỳ cách sắp xếp nào là quy ước ngầm định, do đó mỗi tổ hợp đều phải tự chọn, cấu hình sai sẽ thất bại lúc load.

**Lấy mẫu toàn bộ kết quả.** Bị bác bỏ. Kết quả đầy đủ không mất bất kỳ thông tin nào do cắt bớt, do đó sắp xếp theo thời gian sửa đổi vẫn hữu ích cho các câu hỏi quan tâm tới thời gian mới cũ. Chỉ khi việc cắt lấy phần đầu đã không còn mô tả được toàn cảnh mới bắt đầu lấy mẫu.

**Đổi thành sắp xếp mới nhất trước.** Bị bác bỏ. Điều này chỉ thay đổi cây con nào trong tập kết quả có thể chiếm ưu thế; vừa hủy bỏ quy ước cũ nhất trước hiện có, vừa không làm trang bị giới hạn có tính đại diện hơn.

**Chỉ lấy mẫu khi độ lệch vượt ngưỡng.** Bị bác bỏ. Hiện chưa có bằng chứng ủng hộ một ngưỡng thống nhất áp dụng cho mọi triển khai, model cũng không thể phán đoán được đang dùng quy ước sắp xếp nào. Giới hạn hiện có là điểm chuyển đổi có thể giải thích rõ ràng.

**Cân bằng đệ quy dưới cấp cao nhất.** Tạm hoãn. Cân bằng theo đoạn đường dẫn đầu tiên đã sửa được sự cố quan sát được; cân bằng ở tầng sâu hơn cần chiến lược đánh đổi độ sâu và độ rộng chưa có căn cứ.

**Thêm tool `list` hướng tới model.** Bị bác bỏ sau khi đánh giá triển khai. Tổ hợp lập trình mặc định đã cung cấp bash tổng quát, model cũng hiểu `ls`; một tool trùng lặp sẽ tăng vĩnh viễn token chiếm dụng của schema và prompt, và kéo theo các quy ước về sắp xếp, phân trang, symbolic link, escape, UI và snapshot mà không có lợi ích an toàn hay chính sách độc lập nào. Triển khai tinh gọn không cung cấp tool bash cho model cũng sẽ không có được năng lực định vị thư mục nhờ thay đổi này.

**Từ chối `*`, hoặc âm thầm thêm mỏ neo thư mục gốc vào trước mẫu không chứa dấu phân cách.** Bị bác bỏ. Cùng hành vi "khớp tên file ở bất kỳ độ sâu nào" khiến `*.ts` có thể tìm kiếm hiệu quả xuyên cây thư mục. Ghi lại quy tắc này giúp giữ nguyên ngữ nghĩa Ripgrep vốn hoạt động bình thường.

## Ảnh hưởng

Trong chế độ lấy mẫu, trang glob vượt giới hạn không còn dùng đường dẫn inline để trả lời câu hỏi phán đoán mới cũ theo thời gian; footer sẽ nói rõ điều này, sản phẩm spill vẫn giữ view sắp xếp đầy đủ. Việc lấy mẫu chỉ cân bằng đoạn đường dẫn đầu tiên dưới gốc tìm kiếm, do đó một cây con có kết quả dày đặc nằm sâu bên trong một mục cấp cao nhất vẫn có thể chiếm ưu thế. Chế độ giữ phần đầu giữ nguyên rủi ro tập trung như một lựa chọn triển khai tường minh.

Giao diện tool không mở rộng thêm. Mỗi tổ hợp đều phải đặt `sampleOverCapGlobResults`; thay đổi giá trị này sẽ thay đổi prompt, mô tả schema của glob và render Native khi vượt giới hạn. Output chuẩn giữ lại `root`, để chế độ lấy mẫu khôi phục được cơ sở nhóm của nó; kết quả không vượt giới hạn giữ nguyên không đổi.

## Kiểm thử

Test gói khóa chặt cấu hình bắt buộc, hai chế độ vượt giới hạn cùng mô tả prompt và schema của chúng, hai trường hợp kết quả tập trung và trải đều, gốc tường minh, số nhóm vượt giới hạn số tham số JavaScript, nhóm cạn kiệt, số vị trí ít hơn số nhóm, và đường dẫn ngoài thư mục làm việc. Kịch bản `fs-glob-sampling` ACP (Agent Client Protocol) bật tường minh lấy mẫu, khởi động tổ hợp Loader/app/local-bash thực tối giản, và cho plugin tìm kiếm thực kết nối với fixture (dữ liệu chuẩn bị trước cho test) tiến trình `rg` xác định; kết quả của nó bao phủ 4 mục cấp cao nhất, chứ không chỉ trả về phần đầu của một cây con.
