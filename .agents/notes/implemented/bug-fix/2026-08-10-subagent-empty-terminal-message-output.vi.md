# Agent Note: Giữ lại output của subagent sau tin nhắn kết thúc rỗng bằng cùng một quy tắc lựa chọn

Status: implemented

[English](2026-08-10-subagent-empty-terminal-message-output.md) | 中文

## Vấn đề

Khi một bước `max-tokens` chỉ lắp ráp được các block tool call, agent loop (vòng lặp tác nhân) sẽ nối thêm một `assistant/message` có nội dung rỗng, vì `BlockAssembler.blocks()` sẽ loại bỏ tool call bị cắt cụt; tin nhắn này chỉ ghi lại usage. Ba bên tiêu thụ độc lập lựa chọn output của sub agent, và mỗi bên đều coi bản ghi usage này là output. `readResult` của driver trong tiến trình và việc capture `subagent/end` của Activation có thể tiếp tục lựa chọn `assistant/message` cuối cùng mà không lọc, còn observer của backend SDK ưu tiên bất kỳ `assistant/message` nào hơn văn bản đã tích lũy. Trong một lượt nhiều bước bị `max-tokens` cắt cụt, tin nhắn rỗng cuối cùng đó khiến `SubagentResult.output`, kết quả tool, telemetry và `subagent/end.lastAssistantMessage` đều bỏ lỡ câu trả lời từng phần thực sự. Driver trong tiến trình cũng không có phương án fallback dùng văn bản streaming, nên một sub agent bị hủy mà văn bản duy nhất của nó chỉ tồn tại trong sự kiện `assistant/chunk` cũng sẽ báo cáo `[]`.

## Quyết định

`dsh-subagent` sở hữu quy tắc lựa chọn chuẩn duy nhất trong `src/assistant-output.ts`: chọn tin nhắn assistant không rỗng cuối cùng; nếu không có, chọn luồng `text-delta` đã tích lũy; bỏ qua tin nhắn có nội dung rỗng. `AssistantOutputFold` gia tăng xử lý luồng sự kiện phiên qua `push(event)`, xử lý luồng chỉ-có-chunk qua `pushText(text)`, và hoàn tất lựa chọn qua `collect()`. `finalAssistantOutput(events)` áp dụng quy tắc này lên toàn bộ hậu tố (suffix) của sự kiện, dùng cho cả `readResult` trong tiến trình lẫn Activation capture. Backend SDK gấp (fold) sự kiện thông báo; backend ACP không phơi bày tin nhắn assistant đầy đủ, mà gấp trực tiếp văn bản chunk thô. `SubagentResult.output` định nghĩa quy ước kết quả, `subagent/end.lastAssistantMessage` dùng chung quy tắc đó. Khi sub agent không tạo ra bất kỳ loại output nào trong hai loại trên, các trường lifecycle của cả lần chạy one-shot lẫn continuable đều sẽ để trống mặc định, chứ không phải mảng rỗng. Kết quả `max-tokens` hoặc `aborted` vẫn giữ nguyên lý do kết thúc thực tế.

Tool delegation ở foreground dùng chung quy tắc lựa chọn này. Kết quả không phải `completed` vẫn là kết quả tool `isError`, nhưng tin nhắn của nó sẽ đính kèm văn bản từng phần của sub agent ngay sau tiêu đề lý do kết thúc, để model cha nhận được đồng thời cả thông tin thất bại lẫn output đã có.

## Xác nhận

Test backend SDK không cần key dùng `FAKE_EMPTY_MESSAGE` để phát ra một tin nhắn kết thúc chỉ ghi usage. Snapshot ACP `subagent-max-tokens-partial` ghi lại một sub agent: nó stream văn bản và một lần tool call, kết thúc ở bước max-tokens chỉ chứa tool call, log đã lưu bền vững chứa một tin nhắn usage rỗng, và trả về văn bản từng phần thông qua kết quả tool lỗi ở phía cha. Unit test bao phủ tin nhắn kết thúc rỗng, hủy, thứ tự tin nhắn, tin nhắn không rỗng nhưng không có văn bản, và việc loại trừ nội dung khỏi kết quả tool.

## Các phương án thay thế đã cân nhắc

**Mỗi bên tiêu thụ tự sửa tại chỗ, không tách hàm hỗ trợ dùng chung.** Bị bác bỏ vì: ba lần lựa chọn độc lập đã lệch nhau, trong khi các bên quan sát cùng một lần chạy phải thống nhất về output của nó.

**Cho loop không nối thêm tin nhắn rỗng nữa.** Bị bác bỏ vì: tin nhắn này ghi lại usage, và giữ lại bước đó trong log lưu bền vững ("model-visible ⟺ đã ghi log"); thay đổi sự kiện phiên chỉ để xử lý việc lựa chọn output sẽ ảnh hưởng đến mọi bên tiêu thụ replay và projection.

**Coi tin nhắn có nội dung rỗng là lỗi.** Bị bác bỏ vì: văn bản streaming mới chính là câu trả lời từng phần thực sự của sub agent, và lý do kết thúc đã cho bên tiêu thụ biết lượt bị cắt cụt.

## Hệ quả

Sub agent nhiều bước bị `max-tokens` cắt cụt sẽ báo cáo văn bản trước đó của nó; sub agent trong tiến trình bị hủy giữ lại văn bản đã stream trước khi bị dừng; sự kiện `subagent/end` của cả lần chạy one-shot lẫn continuable đều nhất quán với `SubagentResult.output`. Tin nhắn có nội dung không rỗng nhưng không chứa văn bản (ví dụ chỉ có reasoning) vẫn được ưu tiên hơn văn bản streaming, vì quy tắc kiểm tra độ dài nội dung, chứ không kiểm tra có văn bản hay không. Tin nhắn không rỗng cũng vẫn được ưu tiên hơn văn bản stream ra sau nó: khi sub agent bị hủy trong lúc đang stream bước tiếp theo, kết quả báo cáo là tin nhắn hoàn chỉnh trước đó, còn lý do kết thúc thì ghi lại việc bị cắt cụt.
