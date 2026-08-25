# Agent Note: Transcript Web đánh dấu nguồn ngữ cảnh, recall và steering

Status: implemented

[English](2026-08-04-web-context-source-and-steer-marks.md) | 中文

## Vấn đề

Mọi thứ mà bên sản xuất bổ sung vào phía hội thoại hướng-tới-model, khi vào transcript (bản ghi văn bản) Web thì chỉ còn lại hai hình thái vô danh. Mỗi `user/message` không phải của người dùng đã được ghi lại — danh mục skill (kỹ năng), snapshot runtime, chỉ dẫn `AGENTS.md` đã được đối chiếu, gợi ý guard, báo cáo subagent, snapshot xuyên session — đều bị nén thành cùng một dòng `Đã tiêm ngữ cảnh`, người đọc không mở rộng từng dòng để đọc JSON gốc thì không thể biết chính xác thứ gì đã được tiêm vào. Trường hợp steering (dẫn dắt giữa chừng) còn tệ hơn: nó render giống hệt bong bóng của prompt mở lượt, nên transcript không thể cho biết tin nhắn nào đã ngắt một lượt đang chạy.

Những sự phân biệt này vốn dĩ đã là sự thật bền vững. Mỗi bên sản xuất đều phải cung cấp `user/message.source` có thể mở rộng qua merge và ghi rõ chính mình trong đó, còn `agent/inbox/spliced` thì ghi lại tin nhắn có danh tính vào và ra khỏi `next-turn` hay `next-step`; chỉ có tầng hiển thị làm mất những sự thật này. Transcript terminal mà bộ UI Web này thay thế vốn đã viết ra nhà sản xuất của mỗi thẻ, nên đối diện cùng một log, phía Web đang là một bước lùi.

## Quyết định

Transcript đặt tên riêng cho ba vai trò mà tin nhắn không-phải-prompt có thể đảm nhận: tiêm ngữ cảnh, recall session, steering.

Chat Message Definition đính kèm một view `provenance` chứa vai trò và tên của nhà sản xuất cho mỗi `ContextMessageNode`; `contextProvenance()` chỉ tính view này dựa trên nguồn gốc đã persist. Nó trả về `role` (`inject`, hoặc `recall` với snapshot xuyên session) và `label` là tên nhà sản xuất. `ContextInjectionRow` dùng vai trò làm tiêu đề, và hiển thị tên đó cạnh tiêu đề theo hình học tóm tắt của `ToolRow`, nên trạng thái thu gọn đã trả lời được câu hỏi "cái gì được tiêm, do ai tiêm"; viewport cuộn 141px và giới hạn cắt bớt vẫn theo [quyết định về hiển thị mở rộng đã lưu trữ](../../archived/feature/2026-07-30-web-context-injection-disclosure.md), không thay đổi. Còn nội dung render trong viewport thì do trục hình thái độc lập được đưa vào bởi [quyết định về hình thái ngữ cảnh](2026-08-05-context-form-vocabulary.md) quyết định.

**Tên được đọc từ log, tuyệt đối không lấy từ bảng tên nhà sản xuất do client duy trì.** `agent-instructions` được đặt tên theo đường dẫn file chỉ dẫn đã đối chiếu và khử trùng lặp; `session-reference` được đặt tên theo tiêu đề session mà nó đọc; nguồn từ plugin được đặt tên theo id plugin mà nó ghi lại; các nguồn còn lại thì đặt tên theo `kind` của chính nó — đây chính là nhánh mặc định đã được ghi lại trong tài liệu của union type có thể mở rộng qua merge. Nguồn không có `kind` dễ đọc sẽ giáng cấp thành tiêm vô danh. Nhờ đó, nhà sản xuất mới hoặc được đổi tên không cần phát hành phiên bản client mới vẫn nhận diện được, không có tên nào lệch khỏi code, kết quả chiếu của session được khôi phục, fork hay từ log bên ngoài đều hoàn toàn nhất quán với session thời gian thực.

`recall` ghi đè `session-reference`, vì đây là nguồn duy nhất hiện tại đã publish có mang tài liệu từ một session khác vào session hiện tại. Hiện chưa có Web leaf nào mount `dsh-session-reference` — trước đây chỉ có host terminal dùng nó — nên nhánh này tồn tại vì tính khả chuyển của log, chứ không phải vì một bên sản xuất đã được đóng gói, bao phủ của nó đến từ unit test chứ không phải kịch bản Web đã lắp ráp.

Chat Inbox và Message Definition sẽ phát lại sự kiện `agent/inbox/spliced` bền vững; nếu một tin nhắn có nguồn là người dùng được nhận (claimed) từ `next-step` với cùng danh tính, `user/message` kế tiếp sẽ được chiếu thành `SteeringMessageNode`. `MessageItem` gắn nhãn `Chen ngang` cho tin nhắn bền vững loại này và bong bóng steering đang chờ. Tin nhắn được nhận từ lượt đã xếp hàng vẫn là `UserMessageNode`, tin nhắn next-step có nguồn không phải người dùng vẫn là ngữ cảnh. Điều này lật ngược một kết luận trong [quyết định đã lưu trữ về việc loại bỏ lối vào steer và trang trí chen ngang](../../archived/simplification/2026-07-31-web-ui-no-steer-entry-or-interjection-chrome.md). Lúc đó, huy hiệu bị loại bỏ vì composer không thể steer, nhãn trỏ tới một hành động mà người dùng không thể thực hiện. Sau đó composer nhận được cử chỉ Steer, nhưng note đó chưa được sửa đổi tương ứng; quyết định này cung cấp quyết định sản phẩm mà điều khoản "đưa lại" của nó yêu cầu, và đính chính sự thật đã lỗi thời còn sót lại trong đó. Nhãn này là trang trí steering duy nhất ở đây: chế độ composer, thao tác steer nghiêm ngặt của Queue dock, vòng đời của steering đang chờ vẫn thuộc về chủ sở hữu riêng của chúng.

## Các phương án thay thế đã cân nhắc

**Bản địa hóa tên nhà sản xuất tại client.** Một từ điển dùng id plugin làm khóa thực sự đọc dễ hơn `@deepseek-ai/dsh-system-prompt`, nhưng nó sẽ âm thầm lệch khỏi thực tế mỗi khi đổi tên, mỗi khi thêm nhà sản xuất mới đều phải sửa client, và hoàn toàn không thể đặt tên cho log từ bên ngoài. Tên nhà sản xuất mà log đã ghi lại đáng tin cậy hơn nhãn do client tự bịa ra.

**Đăng ký hiển thị theo kind của nguồn.** Quyết định về hiển thị mở rộng đã hoãn slot view ngữ cảnh được keyed cho tới khi xuất hiện nhu cầu hiển thị riêng của từng nguồn. Việc đặt tên cho một dòng không cấu thành hiển thị độc lập, còn một registry dùng "nhà sản xuất đang được mount" làm khóa sẽ thất bại đúng ở chỗ quan trọng nhất — log khôi phục mà nhà sản xuất không còn được mount vẫn phải render được.

**Tính vai trò và tên ở phía host.** Cách đó cần đính kèm một view cho mỗi bản sao sự kiện, lặp lại sự thật mà nguồn bền vững đã nêu, và thêm một trường wire cho mỗi tin nhắn ngữ cảnh. Thay vào đó, phần chiếu tính một lần cho mỗi node, cùng chỗ với các sự thật suy ra khác của transcript.

**Cho steering một dòng riêng thay vì bong bóng có nhãn.** Steering là một tin nhắn người dùng đến giữa lượt; dạng dòng riêng sẽ phá vỡ nhịp đọc canh phải, và lặp lại thao tác copy, fork trên bong bóng chỉ để thêm bằng-không thông tin mới.

**Mở rộng cùng bộ tên đó sang bảng trajectory.** Không nằm trong phạm vi lần này: ô ngữ cảnh của bảng đó có cách suy ra văn bản riêng, còn issue yêu cầu là mặt hội thoại.

## Kiểm thử

- Bao phủ unit của `packages/client/runtime` cố định từng loại nguồn, fallback khi trường tên thiếu/rỗng/sai kiểu, giáng cấp vô danh khi nguồn không có kind dễ đọc, và việc dựng lại steering trên cả đường reset lẫn đường append thời gian thực.
- Bao phủ jsdom của `packages/client/ui-conversation` cố định tiêu đề theo vai trò, tên nhà sản xuất cạnh tiêu đề, việc tên đó vẫn giữ nguyên sau khi mở rộng, và thanh tiêu đề không vai trò.
- Output kỳ vọng Web đã lắp ráp không cần key mang thanh tiêu đề có tên, nên các định danh này cũng được xác thực trong transcript đã lắp ráp, chứ không chỉ qua test component.

## Hệ quả

- **Một phần đã bị thay thế.** Điều khoản về nhãn steering trong quyết định này không còn mô tả đúng master: [quyết định loại bỏ nhãn](../simplification/2026-08-10-web-remove-steering-interjection-caption.md) đã xóa nhãn `Chen ngang` / `Interjection`, steer giữa lượt giờ chỉ có thể nhận diện qua vị trí của nó trong luồng tin nhắn. Việc đặt tên nguồn ngữ cảnh và recall trong quyết định này vẫn còn hiệu lực, phần chiếu `SteeringMessageNode` không đổi.
- Người đọc có thể quy kết ngay từng tin nhắn không-phải-prompt trong transcript; ngay cả khi đối diện log mà phiên bản client này chưa từng thấy nhà sản xuất của nó, thanh tiêu đề vẫn trung thực.
- Miễn là nguồn chỉ mang id plugin, tên nhà sản xuất trong UI sẽ hiển thị dưới dạng tên package (`dsh-tool-skill`, `@deepseek-ai/dsh-system-prompt`). Đây là cái giá của việc từ chối bảng tên client; nhà sản xuất muốn nhãn đẹp hơn phải tự ghi nhãn đó vào trường nguồn.
- `ContextMessageNode` thêm một trường bắt buộc, nên mọi nơi tạo node này — kể cả fixture (dữ liệu chuẩn bị trước cho test) — đều phải cung cấp nó.
- Ngay cả khi agent loop (vòng lặp tác nhân thông minh) giờ đã ghi steering đã được nhận vào dưới dạng `user/message`, `SteeringMessageNode` vẫn là node hiển thị độc lập; danh tính của nó đến từ lịch sử inbox bền vững, chứ không phải từ một sự kiện tin nhắn độc lập.
- Cho tới khi có một host mount `dsh-session-reference`, nhánh `recall` trong các Web leaf đã publish không có nhà sản xuất nào, chỉ có thể đến được qua log được ghi ở nơi khác.
