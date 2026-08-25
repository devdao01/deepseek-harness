# Agent Note: Hành động retry khi request lỗi

Status: implemented

[English](2026-07-27-request-error-retry-action.md) | Tiếng Việt

## Vấn đề

Việc khôi phục request tới model do `agent/request-error` quyết định nội bộ, nhưng lại được truyền đạt qua `Agent.retry()`. Câu lệnh công khai này chỉ hiệu lực trong một cửa sổ waterfall (sự kiện kiểu thác nước) hẹp và khi hệ thống rảnh, còn ở các trạng thái chạy khác thì bị từ chối, đồng thời buộc `ReactLoopAgent` phải giữ lại một cửa sổ retry có thể thay đổi bên cạnh kết quả waterfall. Plugin khôi phục là bên gọi duy nhất trong môi trường production, nên năng lực agent (tác tử) đang hoạt động ở phạm vi rộng hơn lại phơi bày trạng thái và hành vi không liên quan đến quyết định chính sách của nó.

## Quyết định

`agent/request-error` trả về `RequestErrorAction`, trong đó hành động chịu trách nhiệm xử lý là `{ kind: 'retry' }`; giá trị mặc định `undefined` sẽ giữ lượt thất bại ở trạng thái kết thúc. Listener không sở hữu lỗi đó thì gọi `next()`. Listener sở hữu lỗi đó thực hiện mọi bước khắc phục cần chờ, rồi trả về trực tiếp hành động retry mà không ủy quyền tiếp.

Sau khi waterfall kết toán, vòng lặp đọc hành động đó, đóng lượt thất bại và mở một lượt retry từ lịch sử bền vững. Vòng lặp kiểm tra lại tín hiệu lượt khi sử dụng hành động này, nên dù listener sau đó trả về hành động retry, việc hủy hoặc dispose (giải phóng tài nguyên) xảy ra trong quá trình khôi phục vẫn ngăn được retry. Quá trình khôi phục ném exception thì không sinh ra hành động nào.

Cả `Agent` lẫn `ReactLoopAgent` đều không phơi bày phương thức `retry()`. Công việc mới thông thường đi vào qua `followup()`, `steer()` và `inject()`; chỉ khi request tới model thất bại và đã được xử lý thì mới có thể mở một lượt retry không có prompt.

## Các phương án đã cân nhắc

**Giữ `Agent.retry()` làm câu lệnh khôi phục.** Kiểm tra bảo vệ lúc chạy có thể giới hạn câu lệnh này trong cửa sổ lỗi request, nhưng giao diện vẫn phơi bày một thao tác chạy lại không prompt lúc rảnh mà không có bên tiêu thụ nào trong production, và vòng lặp vẫn phải lấy lại quyết định vốn đã được waterfall chuyển tải thông qua trạng thái phụ có thể thay đổi.

**Trả về hành động kết thúc tường minh.** `undefined` đã biểu thị giá trị mặc định khi waterfall không xử lý, và có thể kết hợp trực tiếp qua `next()`. Thêm một giá trị `{ kind: 'fail' }` nữa không mang lại hành vi hay thông tin quy thuộc nào khác biệt.

## Hệ quả

Quyền sở hữu việc khôi phục, khắc phục bất đồng bộ và quyết định retry dùng chung một đường trả về có kiểu. Giao diện agent đang hoạt động và vòng lặp cụ thể không còn năng lực chạy lại không prompt lúc rảnh cùng trạng thái cửa sổ retry. Bên gọi nếu không gửi prompt tiếp theo thì không thể khởi động lại một công việc không phải request bất kỳ đã thất bại; còn chính sách tạm thời và chính sách tràn ngữ cảnh vẫn giữ lượt retry được đánh số, dựng lại từ lịch sử bền vững, ngân sách riêng của chính sách có giới hạn và mức ưu tiên hủy.

Các bài test agent-loop tập trung cố định chuỗi retry, việc lỗi chưa xử lý giữ trạng thái kết thúc, khôi phục thất bại và tình huống tranh chấp khi hủy. Bộ test llm-retry và compaction-basic cố định phần hành động trả về thuộc chính sách của riêng chúng, còn các bài test tích hợp ACP (Agent Client Protocol), goal-round-driver và plan-mode cố định việc lượt kế tiếp tiếp nhận công việc.
