# Agent Note: Làm giàu vòng đời Subagent — lastAssistantMessage (chỉ quan sát)

Status: implemented
Archived: 2026-07-26

[English](2026-06-30-subagent-observe-enrich.md) | 中文

## Vấn đề

Hệ thống con hook ([Agent Note về interception seam](2026-06-30-interception-seams.md)) cho phép plugin quan sát và chặn agent (tác tử) tại các điểm mốc vòng đời. Cả Claude Code lẫn Codex đều phơi bày hook **SubagentStart / SubagentStop**, và hook của CC mang theo tin nhắn cuối cùng của subagent. harness đã phát sự kiện vòng đời `subagent/start` và `subagent/end` ([subagent capability seam](2026-06-21-subagent-capability-seam.md)), nhưng payload của chúng cực kỳ tối giản (`provider`, `id`, và `stopReason` khi kết thúc), không đủ để tầng bridge hook báo cáo subagent đã tạo ra kết quả gì mà không cần truy cập riêng vào run đang hoạt động.

Agent Note này làm giàu payload end. Nó cố ý giới hạn ở phạm vi **chỉ quan sát**: không thay đổi control flow, không đưa vào waterfall (sự kiện dạng thác nước). Các quyết định subagent-stop ảnh hưởng đến run (tiếp tục, thay đổi injection của run) thuộc về một cuộc tái thiết kế lớn hơn khác, nằm ngoài phạm vi của Agent Note này.

## Quyết định

**Thêm `lastAssistantMessage` vào `SubagentRunEndInfo` — đầu ra cuối cùng của agent con.** Trên đường kết thúc bình thường, đây là `SubagentResult.output` chỉ đọc, đã được định kiểu, giúp bên quan sát thấy được subagent đã tạo ra gì mà không cần giữ run. Trong trường hợp bị hạ tầng từ chối (không tồn tại `SubagentResult`), trường này sẽ vắng mặt, sự kiện báo cáo `stopReason: 'error'`. Provider và listener là các bên cộng tác đáng tin cậy trong cùng tiến trình, tuân thủ hợp đồng mượn payload bất biến.

Cả hai sự kiện vẫn là **`emit`** thông thường. `SubagentService.start()` bất đồng bộ gắn kết quả quan sát vào run của provider đã sẵn sàng, phát `subagent/start`, rồi trả về run đó; do đó listener trong tiến trình có thể truy cập agent con đã được công bố thông qua `ctx.agents.get(info.id)`, trong khi provider từ xa không cần có mục tương ứng trong registry cục bộ. Không có sự kiện nào được phát khi provider khởi động bị từ chối. Callback vẫn chỉ mang tính quan sát, và việc cách ly theo từng listener đảm bảo một subscriber gặp exception không chặn run đang hoạt động hay bỏ đói các listener sau đó.

## Các phương án thay thế đã cân nhắc

**Nhãn phân loại subagent `agentType`** (tương ứng với `subagent_type` của CC trong harness), đặt trên request và cả hai payload vòng đời. Bản nháp ban đầu từng có nó; đã bị loại bỏ trong quá trình review, vì đó là khái niệm của Claude Code, không phù hợp với seam của chính chúng ta (không có logic nào ở đây giải thích nó, bên tiêu thụ duy nhất là tầng bridge phương ngữ CC). Tầng bridge CC thay vào đó điền trực tiếp giá trị mặc định `"general-purpose"` của chính Claude Code cho matcher `agent_type` của SubagentStart/Stop, do đó Agent Note này chỉ giao **một** làm giàu duy nhất: `lastAssistantMessage`.

**`subagent/end` dạng control-flow**: hoãn lại; xem phần dưới.

## Vì sao chỉ quan sát, và điều gì bị hoãn lại

`subagent/end` dạng control-flow (một waterfall được await, trả về quyết định dừng/tiếp tục, nhất quán với các interception seam khác) đòi hỏi: chuyển `subagent/end` từ emit sang waterfall, tái cấu trúc `SubagentService.start` để await listener trước khi kết toán, triển khai năng lực `resume` trong provider chạy trong tiến trình để "tiếp tục" có thể thực sự chạy lại agent con. Điều này thuộc về cuộc tái thiết kế subagent chạy nền/steering (dẫn dắt giữa chừng) đã bị hoãn lại từ [Agent Note về capability seam](2026-06-21-subagent-capability-seam.md) (cùng cuộc tái thiết kế đó cũng sẽ hợp nhất cách xử lý tool chạy lâu giữa subagent và bash). Agent Note này giao phần làm giàu chỉ-quan-sát mà tầng bridge hook cần ngay bây giờ; các neo `FIXME(subagent-continuation)` / `TODO` đánh dấu vị trí mà phiên bản control-flow sẽ đặt vào khi cuộc tái thiết kế diễn ra.

## Hệ quả

Tầng bridge hook (hoặc plugin gốc) giờ đây có thể chuyển tiếp `lastAssistantMessage` của agent con tới trình xử lý SubagentStop bằng cách subscribe vào emit sẵn có, không cần giao diện control-flow mới. Bổ sung từ vựng được ghi lại trong [docs/core-data-structures/subagent.md](../../../../docs/core-data-structures/subagent.md) (phần diễn giải sự kiện) và cả hai README của subagent; catalog đã được tái sinh. Hành vi production không thay đổi — cách sự kiện được kích hoạt vẫn hoàn toàn giống trước đây, chỉ thêm một trường tùy chọn vào payload end — do đó không cần cập nhật snapshot hay test e2e.
