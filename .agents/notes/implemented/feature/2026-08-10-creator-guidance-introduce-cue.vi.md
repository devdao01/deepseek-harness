# Agent Note: Gợi ý dẫn dắt chế độ sáng tạo rơi vào động tác giới thiệu trên chip preset

Status: implemented

[English](2026-08-10-creator-guidance-introduce-cue.md) | 中文

## Vấn đề

Việc tạo preset diễn ra bên trong một session chế độ sáng tạo, nhưng khu vực cài đặt không truyền đạt rõ đường dẫn này. Lối tạo mới nằm tách biệt khỏi nhóm danh sách; nhóm tùy chỉnh biến mất hoàn toàn khi không có thành viên nào; sau khi bấm vào lối vào, người dùng bị đưa thẳng tới màn hình session mới mà không có bất kỳ dấu hiệu nào cho biết điều gì đã thay đổi: chip preset tạm giữ (staged) được render giống hệt như khi người dùng tự tay chọn nó. Người dùng phản hồi rằng họ không hiểu luồng đã di chuyển, và cũng không hiểu rằng session sắp bắt đầu chính là nơi để xây dựng preset (#2184).

## Quyết định

Nhóm tùy chỉnh giờ luôn thường trực trên màn hình kể cả khi rỗng — tiêu đề nhóm cộng lối tạo mới, lối vào chuyển vào bên trong nhóm, trở thành chỉ dẫn thường trực "preset của bạn sẽ xuất hiện ở đây", thay vì trôi nổi bên dưới danh sách.

Lựa chọn tạm giữ từ một màn hình khác mang theo một cờ dùng-một-lần `introduce` qua seat store (`stage(id, introduce)`), chip dựa vào đó để tự giới thiệu: biểu tượng preset mờ dần vào trong 150ms, ngay khi ổn định thì tên hiện dần từng ký tự lệch nhịp. Việc lệch nhịp có hai mức trần — tên tiếng Trung ngắn đi theo nhịp 40ms mỗi ký tự, đồng thời chia sẻ một cửa sổ hiển thị tổng 200ms (`min(40, 200/(n-1))`), khiến tên Latin dài và tên tiếng Trung hoàn thành trong cùng khoảng thời gian, thay vì kéo dài toàn bộ hoạt ảnh theo số ký tự. Hoạt ảnh do CSS đảm nhiệm; component chỉ chịu trách nhiệm kích hoạt, và xác nhận gợi ý sau khi một vòng kết thúc, do đó cờ này sẽ không phát lại ở những lần lắp tiếp theo. `prefers-reduced-motion` và tên hiển thị rỗng sẽ xác nhận ngay lập tức, không phát hoạt ảnh.

Gợi ý này thuần túy thuộc tầng hiển thị: nó là trạng thái seat-store phía client, không bao giờ là sự kiện session, vì tổ hợp khả kiến với model đã được chính preset tạm giữ mang theo.

## Phương án thay thế đã từng cân nhắc

**Bật toast hoặc hộp thông báo trên màn hình session mới.** Nó có thể giải thích nhiều hơn, nhưng không trỏ vào đâu cả — chip mới là đối tượng mà người dùng sau này phải tìm lại; một hộp thông báo có thể đóng lại chỉ dạy người dùng nhớ về chính hộp thông báo đó, chứ không phải điều khiển. Động tác giới thiệu đặt hành động ngay trên chính điều khiển.

**Nhịp cố định mỗi ký tự.** Bản triển khai đầu tiên dùng vô điều kiện 60ms mỗi ký tự; tên preset tiếng Anh có thời lượng dài gấp ba lần tên tiếng Trung bốn chữ, đọc lên giống như bị khựng chứ không phải nhấn mạnh. Cửa sổ hiển thị dùng chung khiến thời lượng trở thành thuộc tính của gợi ý, chứ không phải của ngôn ngữ.

**Phát hoạt ảnh chọn bên trong hộp thoại cài đặt trước khi rời đi.** Việc đóng hộp thoại tự nó đã là một phần của cử chỉ này — rời khỏi cài đặt chính là cách luồng diễn đạt "công việc diễn ra trong session" — bất kỳ hoạt ảnh nào phát ở đó cũng sẽ bị cắt cụt, hoặc trì hoãn chính bước chuyển mà nó định giải thích.

## Hệ quả

Dòng thời gian giới thiệu tồn tại ở hai nơi và phải nhất quán: `INTRO_TEXT_DELAY_MS` của component và thời lượng hoạt ảnh CSS của `.introIcon`. Hằng số của component là nguồn cho độ trễ theo ký tự và thời gian chờ xác nhận; comment CSS chỉ rõ sự ràng buộc này. Seat store có thêm một trạng thái UI (`introduce`), mỗi lần tạm giữ đều quyết định tường minh giá trị này; khu vực cài đặt giờ render cả nhóm không có thành viên — hình thái này giờ được chốt bởi golden và unit test của khu vực cài đặt.

## Kiểm thử

Component test chốt việc lệch nhịp có trần (tên Latin 11 ký tự đi bước 20ms, tên tiếng Trung 4 ký tự đi nhịp 40ms, ký tự đơn không lệch nhịp), thời điểm xác nhận, và đường bỏ qua cho reduced-motion cùng tên rỗng. `apply.spec.ts` chạy đầu-cuối việc tạm giữ xuyên màn hình: bản nháp chế độ sáng tạo mang theo cờ tạm giữ gợi ý, một lần xác nhận sẽ xóa nó, xác nhận lặp lại giữ snapshot nguyên trạng. `agent-preset-authoring` web e2e giữ nhóm tùy chỉnh rỗng trong golden (tiêu đề cộng lối tạo mới).
