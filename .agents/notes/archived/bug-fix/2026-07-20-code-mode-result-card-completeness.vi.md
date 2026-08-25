# Agent Note: Đảm bảo nội dung thẻ kết quả Code Mode đầy đủ

Status: implemented
Archived: 2026-07-26

[English](2026-07-20-code-mode-result-card-completeness.md) | 中文

## Vấn đề

Công cụ `run_code` lớp ngoài lưu bền vững đầy đủ nội dung render, nhưng trình hiển thị UI của nó lại bỏ qua nội dung này, thay vào đó dựng lại thân thẻ dựa trên phép chiếu `presentationMeta` chỉ chứa log. Các lần chạy chỉ có kết quả trông có vẻ đúng, vì khi thân trình hiển thị rỗng, bên tiêu thụ sẽ quay về dùng `tool/result.content`. Chỉ cần chương trình in ra một dòng log, trình hiển thị sẽ cung cấp nội dung không rỗng, việc quay về dừng lại ngay, và giá trị trả về sẽ biến mất khỏi thẻ đã hoàn tất. Khi log đã bắt được khiến phép chiếu cũ trở nên không rỗng, bản xem trước đầu/cuối cuối cùng do chính sách ghi đầu ra sinh ra cũng bị ảnh hưởng bởi cùng sự tách trách nhiệm này.

Lệnh gọi Code lồng nhau không bao giờ tự sinh thẻ riêng. Vì vậy, việc sinh metadata cho lệnh gọi lớp ngoài chỉ để dựng lại thẻ không đầy đủ này còn che giấu ranh giới dự kiến rằng mỗi lệnh gọi lớp ngoài chỉ sinh đúng một thẻ.

## Quyết định

Pipeline registry công cụ chuẩn chịu trách nhiệm về nội dung lớp ngoài cuối cùng hướng tới mô hình. Khi thành công, renderer đầu ra của `run_code` render log đã bắt được trước, rồi mới render giá trị trả về hoặc dấu không-có-đầu-ra tường minh. Thất bại runtime và từ chối theo chính sách trước khi thực thi được `ToolRegistry` chuẩn hóa thành nội dung lỗi, quá trình đó không gọi renderer này. Chặn post-execute xảy ra sau khi render thành công, và thay thế kết quả bằng nội dung lỗi; các chính sách post-execute khác và quyết định ghi đầu ra có thể thay thế nội dung trước khi lưu bền vững.

`run_code` không cung cấp `presentResult`. Cơ chế quay về kết quả chung sẵn có sẽ giữ tiêu đề chương trình đang chờ hoàn tất, và render `tool/result.content` cuối cùng thô; phép chiếu bền vững, có thể phát lại, đã qua xử lý post-policy này là nguồn duy nhất cho nội dung kết quả trong thẻ. Do đó, proxy API host không cung cấp view kết quả riêng, tránh việc tuần tự hóa lặp lại cùng nội dung trong cả `event.data.content` lẫn `view.view.content`. Phép chiếu `presentationMeta` chỉ chứa log dư thừa tiếp tục bị loại bỏ.

Việc phân phối lồng nhau giữ nguyên. Lệnh gọi có gắn dấu `exec.parent` sẽ phát ra sự kiện `tool/code-dispatch` (mang theo nội dung render đầy đủ), nhưng không sinh thẻ giao diện tương ứng với `tool/call` hay `tool/result`, do đó một lệnh gọi `run_code` lớp ngoài vẫn chỉ sinh đúng một thẻ.

## Kiểm thử

Unit test công cụ thông qua registry chuẩn bao phủ trường hợp chỉ có log, chỉ có kết quả, log và kết quả cùng tồn tại, không có đầu ra, ghi kết quả xuống đĩa, và kết quả thất bại, sau đó cố định nội dung bền vững cũng như sự thật rằng trình hiển thị kết quả không tồn tại. Test hồi quy host mux dùng trình hiển thị chỉ-có-lệnh-gọi, chứng minh khung kết quả mang đúng một lần nội dung gốc, và không chứa view. Các trường hợp này chứng minh metadata cũ không thể thay thế nội dung cuối cùng, đồng thời không khiến host lặp lại nội dung đó.

Snapshot backend ACP (Agent Client Protocol) không cần key và snapshot TUI Code Mode thực thi một chương trình lớp ngoài: chương trình thực hiện hai lệnh gọi bash lồng nhau, ghi log `captured output`, và trả về `CODE_ONE+CODE_TWO`. Nhật ký bền vững của ACP cố định kết quả đầy đủ; giao diện TUI chỉ hiển thị đúng một thẻ lớp ngoài đã hoàn tất, chứa hai dòng nội dung này, và không có thẻ lồng nhau.

## Phương án khác

**Nối giá trị trả về vào metadata log:** không áp dụng. Metadata sẽ trùng lặp với renderer, và cần duy trì riêng một hợp đồng định dạng ổn định cho từng loại JSON root; việc thay thế nội dung theo post-policy hoặc bản xem trước khi ghi đầu ra vẫn có thể bị bỏ sót.

**Hợp nhất metadata trình bày với `result.content`:** không áp dụng. Nội dung render đã bao gồm log; việc hợp nhất sẽ gây trùng lặp, còn cần phụ thuộc vào logic khử trùng lặp mong manh.

**Chuyển tiếp `result.content` qua trình hiển thị kết quả chung:** không áp dụng. Sự kiện bền vững đã mang nội dung đó, bên tiêu thụ UI cũng đã có cơ chế quay về nội dung gốc chung. Host mux sẽ tuần tự hóa view kết quả thuộc sở hữu công cụ ngay cạnh sự kiện, do đó việc chuyển tiếp chỉ nhằm dựng lại cơ chế quay về này, nhưng lại render lặp nội dung trong cùng một khung; chỉ worker mặc định cho phép ngân sách payload có thể thay đổi tối đa 64 MiB trước khi render.

**Tạo một thẻ cho mỗi lần phân phối lồng nhau:** không áp dụng. Giá trị trung gian có chủ đích chỉ tồn tại trong lúc thực thi, không bao giờ hướng tới mô hình. Nhiều thẻ sẽ phơi bày dấu vết triển khai, thay vì thao tác Code Mode đơn nhất mà mô hình và người dùng gọi.

## Ảnh hưởng

TUI và JSON-RPC/Web hiển thị qua cơ chế quay về kết quả chung, cho thấy đúng nội dung đầy đủ mà mô hình nhận được và bản lưu bền vững để phát lại, bao gồm cả bản xem trước ghi đầu ra theo post-policy. API host giữ tiêu đề chương trình đang chờ hoàn tất, đồng thời không lặp lại kết quả gốc trong một payload view riêng biệt. Kết quả `run_code` mới không còn mang metadata log tùy chọn, nhưng không cần nâng phiên bản định dạng phiên: bản ghi hiện có vẫn còn hiệu lực, vì logic trình bày sẽ đọc nội dung render đã được lưu bền vững bên trong chúng.
