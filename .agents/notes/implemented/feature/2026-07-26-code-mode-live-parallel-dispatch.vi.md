# Agent Note: Vòng đời dispatch thời gian thực của Code Mode, và thực thi song song tái sử dụng giao ước gốc

Status: implemented

[English](2026-07-26-code-mode-live-parallel-dispatch.md) | 中文

> Phạm vi: sự kiện `tool/code-dispatch-start`, trạng thái chạy của mỗi sub-call trong Web chat, và việc scheduler tầng bridge tái sử dụng giao ước concurrency gốc. Xây dựng trên [nền tảng phía host](2026-07-26-code-dispatch-ui-foundation.md) và [hàng sub-call trong chat](2026-07-26-code-mode-chat-subcall-rows.md); bản thân giao ước gốc thuộc về [Agent Note lời gọi tool song song](2026-07-10-parallel-tool-call-execution.md).

## Vấn đề

Sau khi nền tảng phía host và hàng sub-call trong chat đã giao, vẫn còn hai lỗ hổng. Hàng sub-call trước đây chỉ xuất hiện sau khi mỗi lần dispatch *settle*: trong lúc một lần dispatch đang chạy, UI hoàn toàn không hiển thị gì, khiến một sub-call chậm trông như thể lời gọi cha bị treo. Còn tầng bridge trước đây tuần tự hóa mọi lời gọi ràng buộc ("kể cả `Promise.all` cũng chỉ chạy một cái một lúc"), đây là cách triển khai tạm để lại từ thời tool chưa mang metadata concurrency: giờ đây `isConcurrencySafe` đã tồn tại, scheduler agent loop (vòng lặp agent thông minh) đã chạy các lời gọi anh em gốc trong pool concurrency có giới hạn từ lâu, còn một chương trình Code Mode đang chờ ba lần đọc độc lập lại phải trả giá độ trễ gấp 3 lần so với đường gốc.

## Quyết định

**Một cặp sự kiện vòng đời, một giao ước scheduler, dùng chung với gốc.**

- **Cặp sự kiện**: `tool/code-dispatch-start` (id cha/con, tên, tham số đã chuẩn hóa) chỉ được append khi scheduler thực sự khởi động một lời gọi, chứ không phải lúc submit, nên các lời gọi đang xếp hàng bị bỏ vì run settle sẽ không để lại log nào. Sự kiện `tool/code-dispatch` sẵn có settle cặp này (cùng `subCallId`); mỗi lời gọi đã khởi động sẽ settle đúng một lần (abort cũng sẽ settle qua pipeline dưới dạng kết quả `isError`). Timing chính là trường `time` của hai sự kiện này. Cả hai sự kiện vẫn chỉ dùng cho log; context model không bị ảnh hưởng; format vẫn giữ v0.
- **Scheduler tầng bridge**: các lời gọi đã submit được phân loại tại thời điểm khởi động qua `registry.executionMode` (dùng đúng giao ước `isConcurrencySafe` mà loop sử dụng, mặc định coi là không an toàn khi có lỗi), và khởi động nghiêm ngặt theo thứ tự submit. Mọi giai đoạn có thứ tự — append sự kiện start, `prepare` (pre-execute/guard), submit `finalize`/`finish` ở đầu hàng (post-execute + commit ngữ cảnh trì hoãn + append sự kiện settle) — do một driver kênh đơn thực thi độc quyền, nên các giai đoạn chính sách có thứ tự không bao giờ chồng lấn nhau, chỉ có giai đoạn around-dispatch/thân tool chạy song song, hoàn toàn khớp timing với loop gốc (`fillPool` await `startCall` trước rồi mới `commitReady`). Các lời gọi liên tiếp được phân loại là có thể song song có thể chồng lấn thực thi, giới hạn trên là `maxParallelSubCalls` (trường `Config`, được kiểm tra lại ngay cả khi construct trực tiếp ngoài kiểm tra schema Loader, giá trị mặc định 10, chính là giá trị mặc định của scheduler loop; đặt `1` sẽ khôi phục dispatch tuần tự); lời gọi độc quyền thì sẽ chờ pool trống, chạy riêng một mình, và rào chắn của nó giữ đến khi tự nó submit xong (bao gồm post-execute), khớp với nhóm độc quyền gốc. Khi run settle sẽ abort các dispatch đang chạy, và bỏ các dispatch đã xếp hàng nhưng chưa khởi động (lời gọi ràng buộc bị từ chối, không sinh sự kiện), sau đó chờ cho đến khi hoàn toàn dừng hẳn — bao gồm cả các commit đang trên đường đi khi chương trình return — rồi kết quả bên ngoài mới kết thúc lượt đó.
- **Phía client**: `ToolCallTree` của runtime lưu sự kiện start làm `RunningToolCall` con, và projection qua `subCalls` đệ quy của cha (component hàng suy ra vòng chỉ báo đang chạy từ hình dạng đó, hoàn toàn giống cách xử lý lời gọi đang chạy gốc). Sự kiện settle của nó sẽ thay thế tại chỗ mục tương ứng trong chỉ mục riêng, giữ nguyên thứ tự khởi động kể cả khi hoàn thành song song, và mang `time` của sự kiện start vào làm `callTime` (nguồn thời lượng). Sự kiện settle không tìm được start tương ứng (cửa sổ cắt giữa cặp sự kiện, hoặc log ghi trước khi sự kiện start được đưa vào) sẽ được append trực tiếp, nên log cũ vẫn render bình thường như trước.
- **Prompt SDK**: câu "các lời gọi thực thi theo thứ tự" hướng tới model được thay bằng giao ước thực tế (các lời gọi an toàn độc lập với nhau có thể chồng lấn dưới `Promise.all`; công việc phụ thuộc lẫn nhau nối tiếp bằng `await`); đây là thay đổi model có thể thấy, mọi snapshot Code Mode đều đã được ghi lại.

## Phương án thay thế đã cân nhắc

**Song song không giới hạn (để `Promise.all` chồng lấn mọi thứ).** Bác bỏ: thao tác ghi có thể sinh race condition; scheduler gốc sở dĩ tồn tại chính vì tuyên bố an toàn thuộc về tool, không thuộc về bên gọi. Gốc và Code Mode dùng chung một bộ từ vựng concurrency, đây là yêu cầu đã chốt.

**Phát sự kiện start tại thời điểm submit thay vì lúc vào pool.** Bác bỏ: phát start ngay khi submit sẽ hiển thị lời gọi đã xếp hàng nhưng chưa từng chạy thành "đang chạy", còn buộc phải thêm loại sự kiện kết thúc thứ ba "đã bỏ" để log tự nhất quán. Phát start khi vào pool giữ được bất biến *đã khởi động ⇔ settle đúng một lần*, và không cần loại sự kiện thứ ba.

**Tái sử dụng trực tiếp cách triển khai scheduler của loop.** Bác bỏ: loop schedule một batch đã được giải quyết hoàn chỉnh, và submit kết quả theo thứ tự model; còn scheduler tầng bridge thì schedule một luồng submit mở, kết quả của nó trả về cho chương trình, chứ không vào transcript (bản ghi văn bản). Do đó, hai bên chỉ dùng chung *giao ước* (phân loại, pool, rào chắn), chứ không dùng chung cơ chế triển khai.

## Hậu quả

Chương trình không cần bất kỳ API phía model mới nào, các lần đọc độc lập đã có độ trễ ngang gốc: `Promise.all` trở nên hữu ích hơn hẳn, hướng dẫn prompt cũng được sửa theo. Web UI hiển thị thời gian thực vòng chỉ báo đang chạy của mỗi sub-call: fixture (dữ liệu tiền đặt cho test) phát ra cặp sự kiện start/settle; jsdom chốt hình dạng đang chạy; test runtime chốt việc settle tại chỗ, hoàn thành không theo thứ tự và ghép cặp callTime. Span sub-call trên trajectory/waterfall lấy timing trung thực từ cặp sự kiện này. Việc phân định ranh giới spill ([spill log code-dispatch](2026-07-26-code-dispatch-log-spill.md)) lấy sự kiện settle làm điểm ranh giới duy nhất.
