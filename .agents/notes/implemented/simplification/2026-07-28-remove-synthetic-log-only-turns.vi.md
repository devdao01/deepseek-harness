# Agent Note: Bỏ lượt tổng hợp dành cho sự kiện chỉ ghi log

Status: implemented

[English](2026-07-28-remove-synthetic-log-only-turns.md) | Tiếng Việt

## Vấn đề

Kho lưu phiên từng phơi bày `appendOutOfBand()`, cho phép plugin phát ra sự kiện chỉ ghi log đến muộn khi không có lượt agent (tác tử) nào đang chạy. Phương thức này bọc sự kiện bằng `turn/start` và `turn/end` rồi ghi xả xuống đĩa. Cách làm đó giữ lại quy tắc cũ "mọi sự kiện bền vững đều phải nằm trong một lượt", nhưng lại khiến cùng một định danh vừa biểu thị một lần chạy vòng lặp model, vừa biểu thị một bản cập nhật chỉ mang tính lưu trữ.

Khi quy tắc này được đưa ra, cơ chế khôi phục lưu trữ từng coi `turn/end` cuối cùng là ranh giới đã commit duy nhất. Ngày nay, bộ quét lưu trữ giữ lại mọi sự kiện hợp lệ và liên tục, còn khâu sửa lỗi sau sự cố cũng chỉ xử lý những lượt thực sự đang mở. Vì vậy, giữ lượt tổng hợp cho việc cập nhật tiêu đề sẽ thổi phồng số đếm lượt, tạo ra kết quả thực thi cho công việc chưa từng chạy model, và còn khiến phần metadata đến muộn chiếm mất số thứ tự của lượt kế tiếp.

Hàm trợ giúp dùng chung còn lặp lại chính sách nghiệp vụ. Bảng ánh xạ dấu hiệu của nó quy định sự kiện plugin nào đủ điều kiện, trong khi năng lực tiêu đề vốn đã sở hữu các quy tắc xử lý việc hủy, tính hoạt động và kết quả cũ. Chuyển sang một lớp bọc append dùng chung khác hoặc riêng cho tiêu đề thì vẫn giữ nguyên tầng gián tiếp về kiểu đó cho hai loại sự kiện literal.

## Quyết định

`SessionStore.appendOutOfBand()`, `OutOfBandSessionEventMap` và `OutOfBandSessionEventType` đều không còn tồn tại. Plugin sở hữu sự kiện chỉ ghi log sẽ append sự kiện đó qua `Session`; khi thao tác hứa hẹn tính bền vững, plugin chờ tường minh `ctx.sessions.flush(session)`. Hệ thống không mở lượt chỉ để có được điểm kiểm tra đó.

Bất biến phiên ở lõi tiếp tục cưỡng chế các quan hệ thực thi thuộc về lõi: số thứ tự lượt và bước, steering (điều hướng giữa chừng), việc bao đóng các sự kiện assistant, tool, todo và request header, cùng việc ghép cặp lời gọi tool với kết quả trong cùng một bước. Lõi cho phép sự kiện mở rộng có thể hợp nhất nằm giữa các lượt, vì chỉ plugin khai báo chúng mới biết những sự kiện này bị ràng buộc theo phạm vi thực thi hay có thể tồn tại độc lập. Bộ bất biến đi kèm của plugin vẫn chịu trách nhiệm về quan hệ sự kiện của chính nó.

Dịch vụ tiêu đề sẽ append trực tiếp `session/title` sau khi hoàn tất các kiểm tra sẵn có về trạng thái dịch vụ, bản sửa đổi, việc hủy và phiên đang hoạt động. Hàm trợ giúp model đi kèm sẽ append bản ghi literal `session/title-llm-request` của nó trước khi phát lời gọi. Lớp lưu trữ tiếp nhận cả hai qua đường `session/event` có giới hạn, và xả tại các điểm kiểm tra thông thường cũng như khi kết thúc vòng đời; cả hai đều không bị buộc phải xả chỉ vì nằm giữa các lượt. Do đó, tiêu đề dự phòng, bản ghi request trợ giúp hoặc tiêu đề đã chấp nhận từ nhà cung cấp có thể xuất hiện sau `turn/end` và trước `turn/start` kế tiếp. Compaction (nén ngữ cảnh) thủ công dùng chính khả năng nằm giữa các lượt đó để ghi cặp dấu `compaction/* { turn: null }`, nhưng xả tường minh phần nỗ lực đã khép lại, vì `/compact` cam kết hoàn tất lưu trữ trước khi cho phép prompt đang xếp hàng đi tiếp.

Việc fork phiên có thể kết thúc tại bất kỳ vị trí sự kiện ổn định nào nằm ngoài lượt đang mở, chứ không chỉ giới hạn ở `turn/end`. Nhờ đó, fork mặc định giữ lại tiêu đề độc lập và các bản ghi chỉ ghi log thuộc plugin khác, đồng thời vẫn từ chối cắt tiền tố ngay giữa quá trình thực thi đang hoạt động.

[Quyết định bao đóng lượt](../../archived/architecture/2026-06-15-turn-enclosure-invariant.md) chung trước đây giờ chỉ còn phù hợp để giải thích vì sao cơ chế tổng hợp từng được đưa vào. [Quyết định chèn ngữ cảnh](../architecture/2026-07-24-separate-context-injection-from-turn-execution.md) xác lập ngữ nghĩa hiện tại: một lượt biểu thị một lần chạy vòng lặp model. [Quyết định compaction thủ công xếp hàng](../feature/2026-07-30-queued-manual-compaction.md) áp dụng quy tắc đó cho cặp dấu nhiều sự kiện bền vững, và sở hữu ngữ nghĩa đánh dấu cùng tiếp nhận của nó.

## Các phương án đã cân nhắc

**Giữ lượt tổng hợp không có bước nào.** Cách này giúp log giữ được sự thống nhất về hình thức và tái dùng `turn/end` làm điểm xả, nhưng lại báo cáo những lần thực thi chưa từng xảy ra, làm nhiễu số thứ tự lượt, đồng thời buộc mọi bên tiêu thụ lượt phải lọc bỏ các bản ghi chỉ mang tính lưu trữ. Tính bền vững vốn đã có ranh giới `session/flush` riêng.

**Giữ một hàm trợ giúp append bền vững dùng chung ở lõi mà không dùng lượt tổng hợp.** Phương thức chạy `append()` rồi `flush()` bản thân nó rất nhỏ, nhưng dấu hiệu tiếp nhận và cam kết đồng thời của nó vẫn dồn chính sách của plugin vào kho lưu phiên. Bên sở hữu sự kiện vốn đã có điểm append literal trực tiếp và có kiểu; bên gọi thực sự cần rào chắn bền vững thì có thể chờ thao tác `session/flush` sẵn có tại ranh giới đó.

**Lưu tiêu đề dưới dạng metadata phiên có thể thay đổi.** Cách này tránh được sự kiện nằm giữa các lượt, nhưng lại dựng lên một bộ giao thức thứ hai về thay đổi, phát lại, lưu trữ và fork bên ngoài log chỉ-append. Tiêu đề vẫn dùng sự kiện có thể phát lại, ghi sau đè ghi trước.

**Yêu cầu mọi sự kiện plugin khai báo với lõi về tư cách tồn tại độc lập.** Cách này giữ được danh sách tiếp nhận tập trung, nhưng lại khiến việc thiếu khai báo hàm ý một quan hệ thực thi mà lõi không thể xác minh. Kiểu union mở rộng có thể hợp nhất vốn đã trao quyền sở hữu ngữ nghĩa cho plugin khai báo sự kiện; bộ bất biến đi kèm của plugin đó mới là nơi cưỡng chế đúng.

## Kiểm chứng

Bài test bất biến ở lõi chấp nhận sự kiện plugin chưa biết nằm giữa các lượt, đồng thời tiếp tục từ chối sự kiện thực thi dựng sẵn nằm ở vị trí đó. Bộ bất biến đi kèm của hook, plan-mode, phân phối Code Mode và phê duyệt sẽ từ chối sự kiện theo phạm vi thực thi của chúng khi không có lượt nào đang mở; còn bộ đi kèm của compaction thì thêm phần chấp nhận cặp dấu thủ công `turn: null` cân bằng nằm giữa các lượt, và yêu cầu owner dạng số khớp với một lượt đang mở. Bài test dịch vụ tiêu đề phiên cố định một sự kiện dự phòng được append trực tiếp trong các tình huống làm mới đồng thời, từ chối phiên đã tách rời và chấp nhận bản sửa đổi mới nhất. Bài test khứ hồi JSONL và SQLite giữ lại tiêu đề được append sau `turn/end` thông qua việc xả theo vòng đời lưu trữ; bài test fork giữ lại phần đuôi chỉ ghi log độc lập, đồng thời từ chối ranh giới nằm trong lượt đang mở. Một ảnh chụp ACP (Agent Client Protocol) không cần khóa, đã lắp ráp đầy đủ, sẽ hoãn tiêu đề do model sinh ra tới sau `turn/end`, và cố định một tiêu đề độc lập từ nhà cung cấp mà không có lượt tổng hợp. Danh mục API và tương đương kiểu được sinh ra không chứa bất kỳ ký hiệu nào đã bị gỡ bỏ.

## Hệ quả

Số đếm lượt và kết quả trở lại chỉ mô tả các lần chạy vòng lặp model. Sự kiện độc lập và cặp dấu compaction thủ công chiếm seq của phiên, nhưng không chiếm số thứ tự lượt; chúng đi vào lớp lưu trữ có giới hạn như mọi lần append khác, và chỉ khi thao tác hứa hẹn tính bền vững thì bên sở hữu sự kiện mới cần yêu cầu rào chắn bền vững tường minh. Lỗi plugin thông thường không còn thất bại vì quy tắc bao đóng mặc định của lõi, nên mọi plugin cần quan hệ thực thi đều phải tự khai báo và tự kiểm thử quan hệ đó. Năng lực tiêu đề giữ nguyên thứ tự bản sửa đổi và việc lưu trữ theo vòng đời, đồng thời giảm được trạng thái ở lõi; còn compaction thủ công có được quyền kiểm soát tính bền vững mà không sinh ra lượt tổng hợp hay xung đột số thứ tự lượt.
