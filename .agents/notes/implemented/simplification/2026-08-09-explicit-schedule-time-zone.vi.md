# Agent Note: Ranh giới múi giờ Schedule tường minh

Status: implemented

[English](2026-08-09-explicit-schedule-time-zone.md) | Tiếng Việt

## Vấn đề

Đầu vào `at` theo giờ địa phương ngầm định biến một sự thật của trình duyệt thành trạng thái sản phẩm dùng chung. Việc bắt múi giờ mặc định lúc tạo Session đòi hỏi thêm Session header mới, quy tắc xung đột cho create／resume／fork, metadata JSONL, migration SQLite, plumbing tạo ở client, so sánh phía Host, cùng logic Schedule bị ghép chặt với đánh dấu time-context. Sau đó, việc đi lại, nhiều tab song song, thiếu provenance và Session cũ đều cần một giao thức xác nhận, chỉ để phán đoán xem bỏ qua trường đó có an toàn không.

Phần lớn độ phức tạp nằm ngoài Schedule. Mô hình vốn đã diễn giải ngôn ngữ tự nhiên trước khi gọi tool, nên giá trị mặc định lưu bền ở Session chỉ lặp lại một giả định chứ không củng cố ranh giới thời gian tuyệt đối.

## Quyết định

Múi giờ trình duyệt là provenance cục bộ theo yêu cầu. Web client lấy mẫu `Intl.DateTimeFormat().resolvedOptions().timeZone` cho mỗi lời nhắc. Host chấp nhận `clientTimeZone` tùy chọn, kiểm tra và chuẩn hóa `UTC` hoặc IANA Area/Location ngay tại ranh giới RPC, rồi ghi nó lên đúng thông điệp `user-rpc` đó. Giá trị không hợp lệ khiến lời nhắc bị từ chối nạp vào. Client không phải trình duyệt có thể bỏ qua nó.

Time-context suy ra sự thật trình duyệt là duy nhất, hỗn hợp hay khuyết từ các thông điệp user-rpc thô trong open turn. Múi giờ duy nhất được dùng để định dạng đồng hồ và báo cho mô hình diễn giải những ngày giờ không nêu rõ múi giờ theo múi giờ đó. Khi provenance hỗn hợp hoặc khuyết, mô hình được yêu cầu hỏi người dùng. Múi giờ của cấu hình hay tiến trình chỉ dùng làm fallback hiển thị, tuyệt đối không được trình bày như thẩm quyền của người dùng.

Schedule không chấp nhận múi giờ địa phương ngầm định. `at` phải hoặc là chuỗi tuân thủ RFC 3339 nghiêm ngặt kèm offset tường minh, hoặc là `{ date, time, time_zone }` chính xác. Ngay cả khi time-context vừa cho mô hình thấy múi giờ trình duyệt, dạng có cấu trúc vẫn đòi múi giờ của riêng nó. Schedule không import time-context, không kiểm tra provenance của user message, không đọc Session header và cũng không sinh lỗi xác nhận. Parser của nó kiểm tra giá trị tường minh, từ chối khoảng trống giờ mùa hè, chọn thời điểm đầu tiên khi có chồng lấn, và chỉ lưu `scheduledAt` UTC đã chuẩn hóa.

Không còn giữ trường múi giờ ở Session, xung đột múi giờ khi create／resume／fork, trường header JSONL, column hay migration SQLite, giá trị mặc định của kết nối, và cũng không còn phần trình bày Host／client riêng cho Schedule. Giả định của trình duyệt chỉ đi vào Schedule qua tham số tool tường minh của mô hình.

## Các phương án đã cân nhắc

**Lưu bền múi giờ trình duyệt đầu tiên làm mặc định bất biến của Session.** Cách này khiến các đầu vào địa phương về sau mang tính tất định, nhưng lại phát tán quyền sở hữu vào core và persistence; việc đi lại cùng nhiều tab song song vẫn cần xử lý bất khớp.

**Dùng múi giờ trình duyệt gần nhất làm trạng thái Session khả biến.** Cách này giảm nhắc xác nhận, nhưng cho phép một tab lặng lẽ thay đổi cách diễn giải của tab khác, và khiến replay phụ thuộc vào thứ tự cập nhật.

**Để Schedule kiểm tra thông điệp time-context mới nhất.** Prose snapshot (bản chụp văn bản) là chứng cứ mô hình nhìn thấy, không phải một seam gói có kiểu. Tiêu thụ nó sẽ ghép Schedule với AgentLoop history và lặp lại việc kiểm tra trên provenance thô.

**Để Host tiêm `time_zone` vào lời gọi tool.** Host không thể biết mô hình đang diễn giải biểu thức ngôn ngữ tự nhiên nào, cũng không biết người dùng có chỉ định một múi giờ khác hay không. Viết lại tham số của mô hình sẽ giấu ngữ nghĩa ở sai ranh giới.

**Yêu cầu mô hình hỏi người dùng với mọi thời điểm không nêu rõ múi giờ.** Làm vậy thì an toàn, nhưng lại ngắt quãng không cần thiết những tình huống địa phương phổ biến của trình duyệt. Chỉ dẫn cục bộ theo yêu cầu cung cấp giả định kỳ vọng, còn khi provenance hỗn hợp hoặc khuyết thì vẫn hỏi người dùng.

## Kiểm chứng

Test Host ghim việc chuẩn hóa alias, hành vi có thể bỏ qua và việc từ chối trước khi vào Agent (tác tử). Test client ghim việc lấy mẫu múi giờ trình duyệt một lần cho mỗi lời nhắc. Test time-context ghim việc suy ra các trường hợp duy nhất, hỗn hợp và khuyết trong turn hiện tại, cùng chính sách mô hình chính xác. Test Schedule ghim `time_zone` bắt buộc, offset nghiêm ngặt, kiểm tra lịch, múi giờ chuẩn tắc, từ chối khoảng trống, chọn thời điểm đầu tiên khi chồng lấn, và việc không tồn tại đường ngữ cảnh ngầm định. Kịch bản Web sau tổ hợp ghim Playwright vào `Asia/Shanghai`, gửi lời nhắc qua composer thật, quan sát cùng múi giờ đó trong yêu cầu mô hình, kiểm chứng lời gọi tool địa phương tường minh, và snapshot phản hồi nhắc thông thường.

Kiểm toán mã nguồn từ chối `SessionHeader.timeZone`, column `time_zone` trong persistence, lỗi xác nhận, việc Schedule import time-context, cùng cơ chế biên nhận độc lập.

## Hệ quả

- Không cần hệ thống con múi giờ Session lưu bền, ngôn ngữ tự nhiên theo giờ địa phương của trình duyệt vẫn hoạt động.
- Schedule có một ranh giới thời gian tuyệt đối tường minh và kiểm thử được độc lập.
- Việc đi lại và nhiều tab song song chỉ ảnh hưởng tới lời nhắc của riêng chúng; turn có provenance hỗn hợp sẽ hỏi người dùng thay vì đổi trạng thái dùng chung.
- Client không phải trình duyệt vẫn dùng được, nhưng phải cung cấp đủ ngữ cảnh ngôn ngữ tự nhiên hoặc tham số tool tường minh.
- Mô hình vẫn có thể diễn giải sai; tool chỉ bảo đảm giá trị lịch tường minh là hợp lệ và mang tính tất định.
