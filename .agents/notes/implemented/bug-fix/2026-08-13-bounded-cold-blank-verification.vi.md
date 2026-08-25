# Agent Note: Xác minh có giới hạn các session lạnh trống

Status: implemented

[English](2026-08-13-bounded-cold-blank-verification.md) | Tiếng Việt

## Vấn đề

Cây session của Web sẽ ẩn Session trống, và tái sử dụng mục trống đang chọn hiện tại làm New Session. Session đã attach có thể suy ra trạng thái trống từ event log trong bộ nhớ, nhưng `session.list` thường không tải từng cold log. Nếu coi mọi Session lạnh đã materialize là không trống, sẽ lộ ra những Session trống còn sót lại từ phiên bản cũ; ngược lại, nếu coi `blank: true` trong projection cache là sự thật hiện tại, có thể che giấu cuộc hội thoại thật khi log đã tiến xa hơn nhưng cache fail-soft vẫn còn cũ.

Cùng danh sách lạnh này trước đây còn dùng mtime của artifact JSONL làm `updatedAt`. Mở một Session sẽ append `session/end-seed`, nên chỉ cần mở lên xem — dù không có prompt thật của người dùng — cũng làm mtime mới lại, và đẩy Session đó lên trước những cuộc hội thoại vừa dùng gần đây.

## Decision

`dsh-host-apiproxy` đăng ký projection `sessionListMetadata`, chứa `blank` và `lastPromptAt`. Tóm tắt cho Session đã attach dùng thẳng cùng một bộ hàm để gộp (fold) event log thời gian thực. `blank` chỉ chuyển đơn điệu từ true sang false tại `turn/start`; `lastPromptAt` chỉ được cập nhật tại `user/message` có source kind là `user`.

Tóm tắt lạnh tin tưởng `blank: false` trong cache, vì tiền tố checkpoint đã chứa `turn/start` sẽ luôn giữ trạng thái không trống. Cả `blank: true` trong cache lẫn cache miss đều không chứng minh được rằng log hiện tại đang trống. Khi lớp persistence phơi bày artifact vật lý qua `locate()`, và kích thước quan sát được không vượt ngưỡng đủ điều kiện `coldBlankProbeMaxBytes` (mặc định 1 KiB cho mỗi Session), gateway gọi `readFrom(id, 0)`, gộp metadata danh sách chính xác từ tiền tố đã lưu. File vượt ngưỡng, backend không cung cấp vị trí, artifact đã biến mất, và lỗi đọc — tất cả đều sinh ra `blank: false`, giữ cho Session vẫn hiển thị.

`updatedAt` lấy giá trị muộn hơn giữa `createdAt` và `lastPromptAt`. Lượt đọc artifact đủ điều kiện cung cấp `lastPromptAt` chính xác mà không tốn thêm I/O; các trường hợp cache miss khác hoặc checkpoint đã cũ chỉ khiến Session bị xếp hơi cũ hơn, chứ không bị đẩy lên do một lượt ghi file không liên quan. Sau mỗi lượt đọc lạnh bất đồng bộ, gateway sẽ kiểm tra lại real-time store một lần nữa; nếu Session đó đã được khôi phục trong lúc có request khác, kết quả lạnh sẽ được thay bằng tóm tắt đã attach.

## Alternatives considered

**Tin tưởng `blank: true` trong cache.** Bị bác bỏ, vì projection cache cố ý cho phép log bền vững tiến xa hơn checkpoint. Nếu xảy ra crash hoặc lỗi ghi fail-soft sau `turn/start` đầu tiên, cuộc hội thoại thật sẽ bị ẩn đi, và client còn có thể tái sử dụng nó làm New Session.

**Đọc từng cold log một.** Bị bác bỏ, vì độ trễ của danh sách và I/O sẽ tăng theo tổng số byte của toàn bộ cuộc hội thoại đã lưu. Phép kiểm tra đủ điều kiện dựa trên kích thước vật lý chỉ nhắm vào những artifact lịch sử nhỏ, có thể xác minh với chi phí thấp; các mục lớn hơn, chưa biết thì được hạ cấp về hướng giữ hiển thị. Phép kiểm tra này cố ý không thêm một thao tác persistence riêng chỉ để "làm cho ngưỡng và việc đọc trở nên atomic": tăng trưởng đồng thời có thể làm tăng chi phí đọc của một lượt dò, nhưng sự kiện mới thêm vào chỉ có thể giữ nguyên trạng thái hiển thị, hoặc biến kết quả trống thành không trống.

**Lưu trạng thái trống và thời điểm gần nhất vào persistence index có thẩm quyền.** Tạm hoãn, vì dòng đầu tiên của JSONL là bất biến, đòi hỏi thêm một artifact bền vững thứ hai kèm yêu cầu ghi tuần tự; còn SQLite thì cần thêm trường schema. Thiết kế index chính xác rộng hơn vẫn thuộc trách nhiệm của [đề xuất hoạt động gần nhất](../../proposed/architecture/2026-07-29-durable-last-activity-index.md).

**Tiếp tục sắp xếp JSONL theo mtime.** Bị bác bỏ, vì mtime ghi nhận mọi lượt ghi artifact, kể cả việc chỉ mở lên xem, chứ không phải prompt thật gần nhất của người dùng; sai lệch theo hướng đó sẽ đẩy một Session chưa hề được thao tác lên đầu danh sách.

## Consequences

Những artifact JSONL trống, nhỏ, đã tồn tại từ trước giờ có thể bị ẩn mà không cần phụ thuộc vào việc projection cache có tồn tại hay không, còn cache cũ cũng không thể che giấu một `turn/start` đã lưu. Với mỗi Session mà cache chưa chứng minh được là không trống, và kích thước vật lý quan sát được nằm trong ngưỡng cấu hình, danh sách lạnh có thể đọc artifact của nó. Với backend Zstandard JSONL được giao mặc định, ngưỡng này so sánh trên số byte đã nén.

Artifact trống vượt ngưỡng, cùng những Session trống từ các backend không cung cấp vị trí, sẽ vẫn hiển thị. Với artifact không được đọc, cache thời điểm gần nhất bị thiếu hoặc trễ sẽ rơi về `createdAt`. Đây đều là các bước hạ cấp thận trọng: UI có thể hiển thị dư một bản ghi trống, hoặc xếp một Session hơi thấp hơn, nhưng sẽ không che giấu cuộc hội thoại thật, cũng không đẩy một session lên đầu chỉ vì được mở lên xem.

Projection riêng của gateway là một effect của gateway fiber; gỡ gateway sẽ xóa key đó. Test unit chốt (pin) các trường hợp: đủ điều kiện ở ranh giới kích thước, từ chối `true` cũ, tái sử dụng `false` đơn điệu, thời điểm gần nhất chính xác cho log nhỏ, race giữa việc attach real-time, hướng fallback, thời điểm gần nhất của prompt thật, và việc fiber bị hủy. Snapshot Web không cần khóa (keyless) sẽ khởi động bản lắp ráp JSONL nén của bản phát hành, gieo một artifact lạnh trống nhỏ khi chưa có cache row, và xác minh rằng sidebar không hiển thị nó.
