# Agent Note: Truy vết quan hệ trong session query

Status: implemented

[English](2026-07-13-session-query-tracing.md) | 中文

## Vấn đề

Quan hệ phiên được mã hóa rải rác trong header bất biến, thao tác surface theo vị trí, và mảng tham chiếu seq event nguồn đã ghi log. Nếu bên tiêu thụ tự dựng lại các quan hệ này trực tiếp, họ phải tự triển khai lại thứ tự ưu tiên ngữ liệu, gấp (fold) surface, xử lý log sai định dạng, thứ tự phả hệ (lineage) có tính xác định, và clone. Quan hệ thay thế theo vị trí và quan hệ tham chiếu event nguồn biểu diễn ý nghĩa khác nhau, do đó gộp cả hai thành một loại cạnh (edge) chung cũng sẽ làm mất ý nghĩa đó.

## Quyết định

`ctx.sessionQuery`, ngoài đọc chính xác, còn công khai `traceSession(sessionId)` và `traceEvent({ sessionId, seq })`. Cả hai đều là view một lần dựa trên ngữ liệu "ưu tiên dữ liệu thời gian thực" hiện có: truy vết phiên đọc một lần toàn bộ danh sách ngữ liệu, truy vết event đọc một lần log logic và thực hiện một lần gấp (fold) surface chuẩn. Service không giữ lại phả hệ, chỉ mục ngược hay trạng thái thay thế sau khi lời gọi kết thúc.

`SessionLineageTrace` trả về mục tiêu, các phiên cha đã biết được sắp xếp từ cha trực tiếp đến cha ngoài cùng, và cây hậu duệ đệ quy; các node cùng cấp được sắp xếp theo thời gian tạo trước, rồi theo session id. `complete: true` mang theo node gốc đã biết; `complete: false` mang theo id cha đầu tiên không thể giải quyết được. Vòng lặp (cycle) nối với mục tiêu sẽ fail với `SESSION_QUERY_INVALID_LINEAGE`.

`SessionEventTrace` giữ tách biệt quan hệ thay thế theo vị trí và quan hệ tham chiếu event nguồn. `replacedBy` là bên thay thế trực tiếp theo vị trí, `replacementChain` truy theo chuỗi các bên thay thế đến node cuối cùng, còn `replacedEventSeqs` liệt kê các node surface thật bị mục tiêu loại bỏ trực tiếp. `sourceEventSeqs` giữ thứ tự nguồn trực tiếp trong log, còn `derivedEventSeqs` liệt kê theo thứ tự log các tham chiếu ngược trực tiếp tiếp theo. Truy vấn không tiếp tục truy theo các event nguồn được tham chiếu lên trên.

## Ranh giới kiểm tra

Truy vết event kiểm tra mục tiêu có tồn tại hay không trước khi phân tích surface. Sau đó, cả danh sách event lẫn truy vết đều dùng cơ chế gấp surface một lượt (single-pass) của `dsh-session`, để chấp nhận hoặc từ chối toàn bộ log đã tải: seq event bắt đầu từ không và liên tục; nhãn surface phù hợp với phạm vi áp dụng của loại event; chỉ loại event surface mới có thể tham chiếu seq event nguồn; mảng hiện diện phải không rỗng và không trùng lặp; mỗi nguồn phải có seq sớm hơn; mỗi lần thay thế theo vị trí phải chỉ định và tham chiếu đầy đủ các node surface mà nó loại bỏ. Bất kỳ vi phạm quy ước nào cũng dùng `SESSION_QUERY_INVALID_SURFACE`; hệ thống không có tiêu chuẩn surface yếu hơn chỉ dùng để phân loại.

Mọi bản ghi và mảng trả về đều tách biệt khỏi trạng thái nội bộ. Truy vết event thời gian thực đã biết không bao giờ truy vấn persistence; truy vết event đến từ dữ liệu persistence giữ nguyên kiểm tra nhất quán danh sách/tải mà việc đọc chính xác yêu cầu. Phả hệ phiên tất yếu thuộc thao tác liên ngữ liệu (cross-corpus), do đó cũng giữ nguyên ngữ nghĩa lỗi persistence liên ngữ liệu.

## Các phương án thay thế đã cân nhắc

- **Công khai hàm hỗ trợ truy vết độc lập**: không áp dụng, vì thứ tự ưu tiên nguồn và ranh giới tách trạng thái thuộc về `ctx.sessionQuery`; công khai hàm hỗ trợ sẽ dụ bên gọi vòng qua ranh giới đó.
- **Gộp cạnh thay thế và cạnh tham chiếu event nguồn.** Không áp dụng, vì thay thế theo vị trí có thể che một node surface, đồng thời tham chiếu một input cấu tạo không nằm trên surface, và bên tiêu thụ cần phân biệt hai ý nghĩa này.
- **Trả về mọi event nguồn được tham chiếu bắc cầu (transitively)**: không áp dụng, vì điều này sẽ che khuất bằng chứng được ghi log trực tiếp, làm phình to kết quả, và khiến một cạnh sai định dạng ở xa làm thay đổi output vốn cục bộ.
- **Trả về kết quả truy vết theo kiểu "cố gắng hết sức" cho danh sách event nguồn sai định dạng**: không áp dụng, vì kết quả cục bộ trông có vẻ hợp lý về cấu trúc sẽ tỏ ra có thẩm quyền. Khi quy ước quan hệ chuẩn bị hỏng, kiểm tra chính xác sẽ báo lỗi rõ ràng.

## Hệ quả

Bên tiêu thụ có được view quan hệ có tính xác định mà không cần cache hay đưa vào một bản ngữ liệu thứ hai. Truy vết event thực hiện kiểm tra và cấp phát toàn log mỗi lần gọi, còn truy vết phả hệ liệt kê toàn bộ ngữ liệu logic mỗi lần gọi. Các chi phí này giữ nguồn sự thật rõ ràng, và độc lập với API tìm kiếm toàn văn và lọc mang nội dung.

Tính năng này có unit test và test ở tầng service bao phủ, nhưng không có fixture (dữ liệu tiền đề cho test) snapshot hay end-to-end, vì nó không đưa vào bên tiêu thụ hướng tới model, thay đổi transcript (bản ghi văn bản), hay giao thức xuyên tiến trình nào.
