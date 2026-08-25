# Agent Note: Timing của bước TUI theo sau tin nhắn cuối cùng của bước đó

Status: implemented
Archived: 2026-08-04

[English](2026-07-27-tui-step-timing-trails-tool-cards.md) | 中文

## Vấn đề

Bản tóm tắt timing của mỗi bước (`Model wait … · Completed …`) vốn là phần tử con của component tin nhắn assistant, vì vậy nó render trực tiếp ngay bên dưới văn bản assistant. Khi một bước kích hoạt tool call, tool card (thẻ công cụ) sẽ được thêm vào vùng chat *sau* tin nhắn assistant, khiến hàng timing bị đặt phía trên chúng — nằm trước một tin nhắn so với output cuối cùng thực sự của bước đó. Bản tóm tắt này vốn có ý nghĩa chốt lại (close out) một bước, vì vậy nó xuất hiện sai vị trí ở mọi bước có chứa tool call.

## Quyết định

Bản tóm tắt timing giờ là một `StepTimingComponent` độc lập, không còn là phần tử con của `AssistantMessageComponent`. `StreamingAssistantComponent` giữ tham chiếu đến nó và expose qua `timing`, nhưng renderer gắn nó vào vùng chat như một node cùng cấp (sibling), nằm ngay sau tin nhắn assistant. Mỗi khi `tool/call` hoặc `tool/result` của bước đang mở hiện tại thêm một card, `trailStreamingTiming()` sẽ di chuyển footer đó về lại cuối vùng chat, để nó luôn theo sau tin nhắn cuối cùng của bước đó. Tại thời điểm `step/end`, footer này được chốt lại tại chỗ (lúc này nó đã ở cuối) và giữ nguyên vị trí khi output của các bước tiếp theo được nối thêm vào.

Thứ tự sự kiện khiến điều này chính xác một cách chặt chẽ: trong một bước, loop sẽ thêm `tool/call` và `tool/result` trước, rồi mới thêm `step/end`, vì vậy footer được định vị lại trong khi `streaming` vẫn đang được set, sau đó mới đóng băng khi bước kết thúc.

## Phương án thay thế

**Giữ timing bên trong tin nhắn assistant, thay vào đó sắp tool card lên phía trên nó.** Đã bác bỏ: tool card nên nằm sau văn bản assistant đã yêu cầu chúng; di chuyển chúng lên trên tin nhắn assistant để nằm dưới phần timing sẽ làm sai lệch thứ tự của transcript (bản ghi văn bản).

**Tính lại một footer duy nhất ở cuối cho toàn bộ lượt (turn), thay vì mỗi bước một footer.** Đã bác bỏ: lượt có nhiều bước sẽ hiển thị thời gian hoàn tất riêng của từng bước, gộp chúng lại sẽ mất đi việc phân nhóm theo từng bước mà các test timing hiện có đã cố định.

**Chỉ định vị lại footer trong handler `step/end`.** Đã bác bỏ: tool card được render trước `step/end`, vì vậy footer chỉ di chuyển khi bước kết thúc dù đã nằm ở cuối, nhưng lại không theo dõi được việc render lại giữa chừng của bước, hơn nữa footer ở trạng thái đang chạy (chưa hoàn tất) trong lúc streaming vẫn sẽ nằm phía trên tool card.

## Hệ quả

- Ở các bước có tool call, bản tóm tắt timing render bên dưới tool card, cả trong lúc lượt đang chạy lẫn sau khi hoàn tất; các snapshot package liên quan (`untrusted-controls`, `cordis-tools-pending`, `advanced-cards-*`, `code-mode-pending`, `dynamic-workflow-pending`, `surface-before-compaction`) và transcript mẫu (`todo-plan`, `bash-terminal-card`, `code-mode`, `parallel-file-reads`, `dynamic-workflow`, `cordis-dynamic-toolchain`, `code-mode-dispatch-spill`) đã cố định (pin) thứ tự mới này.
- Một unit test khẳng định (assert) rằng thời gian hoàn tất xuất hiện sau output công cụ của một bước; với thứ tự trước khi sửa, test này sẽ thất bại.
