# Agent Note: Giao diện Web cho phản hồi tin nhắn

Status: implemented

[English](2026-08-11-message-feedback-web-surface.md) | Tiếng Việt

## Vấn đề

[PR #2217](https://github.com/deepseek-harness/deepseek-harness/pull/2217) đã giao sidecar phản hồi tin nhắn bền vững cùng ba phương thức Host Remote của nó, nhưng nó nói rõ chỉ làm phần backend: không có gói client nào tiêu thụ `messageFeedback.list`, `put` hay `delete`, nên Web GUI không ghi nhận được đánh giá. Agent Note của nó để lại phần "gắn Remote aggregate ở client và UI" cho một người phụ trách khác. Issue #1326 yêu cầu đúng phần giao diện Web ấy, nhưng lại bị đóng khi backend đó được merge, trong khi nửa phần người dùng nhìn thấy vẫn chưa tồn tại.

Một nỗ lực full-stack trước đó, [PR #1010](https://github.com/deepseek-harness/deepseek-harness/pull/1010), có kèm tầng UI, nhưng nó dựa trên backend riêng và có hình thái khác: cả Session dùng một `revision` để compare-and-swap, RPC tên là `feedback.upsert`. Thứ #2217 rốt cuộc giao là `ifVersion` theo từng mục và `messageFeedback.put`, nên logic controller của #1010 không còn khớp hợp đồng; nhánh của nó cũng đã trôi dạt về mặt cấu trúc (nó sửa `packages/cordis/`, thư mục này đã được đổi tên thành `packages/extensions/`; `packages/session-feedback/` mới thêm ở cấp cao nhất xung đột với `packages/feedback/` sau khi hợp nhất). Nó bị đóng dưới dạng superseded thay vì rebase.

Khoảng trống chặn mọi UI nằm ở chỗ trình duyệt không chỉ đích danh được một mục tiêu phản hồi. Host chỉ chấp nhận nguồn append `assistant/message` được định địa chỉ bằng `MessageId`, nhưng `AssistantMessageNode` — node phía client biểu diễn đầu ra assistant đã hoàn tất — chỉ mang theo `seq`, `turn`, `step`, không có định danh tin nhắn. Chỉ `SteeringMessageNode` mới có `messageId`.

## Quyết định

Ba đường ghép, mỗi đường thuộc về nơi mà thẩm quyền của nó vốn đã nằm ở đó.

**Định danh tin nhắn trong node phía client.** `AssistantMessageNode` được thêm `messageId` tùy chọn, sao chép từ `event.data.message.id` khi node đó được vật chất hóa bởi một `assistant/message` đã hoàn tất. Nó vẫn khuyết trên phần đầu ra bị đóng băng do gián đoạn — những đầu ra chưa bao giờ hoàn tất, không trỏ tới bất kỳ tin nhắn bền vững nào — và cũng khuyết trên các sentinel tổng hợp mà bố cục trajectory dựng ra cho phần đầu ra chưa hoàn tất. Trường này để tùy chọn chính là để hai trường hợp trên không thể được biểu diễn thành mục tiêu phản hồi, thay vì che đậy bằng một giá trị giữ chỗ. `ui-conversation` và `ui-trajectory` mỗi bên vật chất hóa bản sao node của riêng mình, nên cả hai nhánh "đã hoàn tất" đều được cập nhật; nhánh "bị gián đoạn" được cố ý giữ nguyên. Điều này khớp với chính quy tắc mục tiêu của Host — nó lọc theo `isAppendSurfaceEvent` — nên client và Host thống nhất được với nhau về "cái gì là định địa chỉ được" mà không cần dùng chung mã.

**Slot khai báo thay vì phụ thuộc trực tiếp.** `ui-conversation` khai báo `conversation.chat.assistant-actions` (kiểu list, phạm vi session, owner là `{messageId}`), và ủy quyền nó làm con thứ hai của trình render node `turn-tail`, đặt song song với chuỗi `conversation.chat.turnTail` sẵn có. `TurnTailNodeView` render nó, và truyền kết quả vào `MessageIconActions` qua prop `extraActions` mới, ở vị trí giữa sao chép và rẽ nhánh. Khi thiếu `messageId` thì điểm render bỏ qua toàn bộ slot này, nên Turn bị gián đoạn không hiển thị bất kỳ điều khiển nào. Nhờ vậy gói phản hồi chỉ đóng góp một entry, không bao giờ chạm vào phần hiện thực của conversation; khi plugin đó bị gỡ khỏi phần lắp ráp trong `cordis.yml`, thanh thao tác này render rỗng với chi phí bằng không.

`extraActions` là một prop `ReactNode` chứ không phải một lỗ render-slot thứ hai, vì `MessageIconActions` là lớp vỏ dùng chung cho tin nhắn người dùng và tin nhắn assistant: phía assistant sẽ phân giải slot rồi truyền kết quả xuống dưới, còn đường đi của người dùng thì không hề hay biết về slot mà nó vĩnh viễn không nên render.

**CAS theo từng mục trong controller của mỗi session.** `@deepseek-ai/dsh-client-ui-message-feedback` giữ một `MessageFeedbackController` cho mỗi Session, lưu vào map với khóa là `MessageId`. Một lần `list` sẽ gieo dữ liệu cho toàn bộ điều khiển trong bản ghi hội thoại của Session đó. Mỗi lần mutation gửi phiên bản mà controller đó quan sát được lần cuối làm `ifVersion` — bằng `null` khi nó chưa biết bất kỳ mục nào, và đây đúng là điều kiện tiên quyết "phải không tồn tại" của Host.

Đường xử lý xung đột là chỗ khác biệt nhiều nhất so với #1010. `MessageFeedbackVersionConflict` mang theo mục `current` có thẩm quyền (hoặc `null`), nên bên thua cuộc đua hội tụ ngay từ chính phần phản hồi; còn #1010 đáp lại mỗi xung đột bằng một lần làm mới toàn bộ một cách mù quáng. Xung đột báo `current: null` sẽ xóa mục cục bộ, và đó chính là cách một đánh giá bị gỡ ở tab khác biến mất ở đây. Các mutation được tuần tự hóa ở đuôi theo từng Session, nên thao tác đang xếp hàng luôn được so với phiên bản đã commit, chứ không phải phiên bản đọc được ở thời điểm cú nhấp rơi xuống.

Việc đọc list được hoãn tới lần hover hoặc focus đầu tiên thay vì kích hoạt lúc mount, vì điều khiển sẽ mount một lần cho mỗi tin nhắn đã kết toán trong phần lịch sử hiển thị; đọc toàn bộ bản ghi hội thoại lúc mount sẽ khiến mỗi thanh tin nhắn phát ra một request. `connection/reset` chỉ làm mới trạng thái của những Session không còn `cold`, nên việc kết nối lại sẽ không hâm nóng các Session chưa ai xem.

Ngữ nghĩa chuyển đổi giữ cho hai động từ trung thực: nhấp lại vào một đánh giá đã ghi thì gọi `delete`, chuyển sang phía còn lại thì gọi `put` kèm theo ghi chú sẵn có, còn thao tác xóa trên một tin nhắn chưa có mục nào được biết đến sẽ trả về thành công ngay mà không phát lời gọi nào, vì nó vốn đã ở đúng trạng thái được yêu cầu.

**Gắn Remote.** `@deepseek-ai/dsh-api-remotes` giờ gắn `messageFeedbackRemote` song song với `goalsRemote`, và ghép hai disposer theo thứ tự ngược lại. Sản phẩm `./remote` được sinh ra đã tồn tại trong phần export của gói ở #2217, nên không cần thay đổi codegen; client gọi `ctx.remote.messageFeedback` và không bao giờ chạm tới tầng truyền tải. Kết quả nghiệp vụ đi qua ranh giới đó dưới dạng tagged union thông thường — gateway chỉ ném lỗi khi truyền tải thất bại — nên controller khớp mẫu trên `ok`, và dịch phần ném lỗi thành đúng cái hình thái kết toán mà điều khiển vốn đã render.

## Các phương án thay thế đã cân nhắc

**Tái sử dụng `conversation.chat.turnTail` thay vì thêm slot mới.** Bác bỏ: `turnTail` là một chuỗi có khóa theo Turn, mang theo `TurnTailOwnerProps {turn, seq, openFile}`, định địa chỉ ranh giới Turn chứ không phải định danh tin nhắn. Phản hồi cần `MessageId`, mà chuỗi thì được selector định tuyến mỗi lần một cái, còn thanh thao tác thì đúng là một danh sách gồm nhiều bên đóng góp độc lập với nhau.

**Đặt `messageId` vào trường `id` của node chat.** Bác bỏ: id đó là `"${turn}:${step}"`, và đang gánh vai trò keyed dispatch cùng React key ổn định. Nạp chồng nó sẽ ghép định danh node với định danh đầu ra của mô hình, hơn nữa một khi tồn tại sự kiện có nguồn replacement thì bản thân id tin nhắn cũng không duy nhất trên từng node.

**Giữ revision ở mức session của #1010.** Không khả thi: hợp đồng Host đã merge là `ifVersion` theo từng mục. Ngay cả khi coi là cách đơn giản hóa phía client thì nó cũng tệ hơn — một revision Session duy nhất sẽ khiến các chỉnh sửa từng mục không liên quan xung đột với nhau, và đây đúng là lý do mà Agent Note của #2217 ghi nhận khi chọn phiên bản theo từng mục.

**Rebase #1010.** Bác bỏ sau khi kiểm tra: 102 file, `mergeable: false`, một tầng backend và RPC trùng lặp đã bị #2217 thay thế bằng tên khác, cùng hai lần đổi tên thư mục kể từ đó. Chỉ tầng UI khoảng 1400 dòng của nó còn giá trị sót lại, mà tầng đó thì gọi `feedback.upsert` cùng revision vốn đã không còn tồn tại. Viết lại UI trên hợp đồng đã merge tốn ít công hơn là hòa giải nhánh đó, và bình luận đóng của #1010 ghi lại lý do này.

## Kết quả

Web GUI có thể ghi nhận đánh giá và ghi chú theo từng tin nhắn. Nửa phần người dùng nhìn thấy trong #1326 giờ đã tồn tại; Issue đó được mở lại chính vì lần merge backend đã đóng nó trong khi chưa có lối vào nào tồn tại.

`AssistantMessageNode.messageId` là tùy chọn, nên mọi bên đọc sẵn có biên dịch được mà không cần sửa, nhưng mọi bên tiêu thụ trong tương lai đều phải xử lý trường hợp khuyết chứ không được giả định tin nhắn đã hoàn tất. Hai điểm vật chất hóa song song vẫn là mối nguy trùng lặp: view thứ ba dựng node này sẽ phải nhớ sao chép id đó, mà không có cơ chế nào cưỡng chế điều ấy. Hôm nay chỉ view chat render điều khiển, dù node trajectory và waterfall giờ đều mang cùng một id.

Phản hồi vẫn vô hình với mô hình — sidecar này không đi vào log Session, cũng không vào ngữ cảnh mô hình hay telemetry — nên Model Experience của gói này là một mục `none` đã được kiểm toán, chứ không phải một khối có cấu trúc.

Sidecar này không phát khung thời gian thực, nên đánh giá ở tab thứ hai chỉ nổi lên khi kết nối lại hoặc ở lần phản hồi xung đột kế tiếp, chứ không phải ngay lập tức. Trình soạn ghi chú không kiểm tra trước `maxNoteBytes` (bằng 8192 trong bundle Web), nên ghi chú quá lớn sẽ thất bại lúc lưu với `note-too-large`, chứ không phải trong lúc gõ.

24 snapshot Web UI sẵn có nhận được hai nút đánh giá này trên 27 tin nhắn assistant, xác nhận rằng thanh thao tác này chạm tới mọi tin nhắn assistant đã kết toán trong phần lắp ráp đã phát hành, chứ không chỉ riêng fixture được kiểm thử.

Một bài Web E2E chuyên biệt phủ việc chấm điểm, ghi chú, khôi phục sau reload và thu hồi trên bundle đã phát hành. Nó phải hover lên điều khiển chưa chấm điểm sau khi reload rồi mới khẳng định trạng thái đã khôi phục, vì chính lần đọc list bị hoãn ấy mới làm giá trị của sidecar xuất hiện — bài test ghi lại thứ tự này chứ không đi vòng qua nó. Phá hỏng logic khôi phục list của controller sẽ khiến đặc tả này thất bại, nên khẳng định về tính bền vững này là có hiệu lực.
