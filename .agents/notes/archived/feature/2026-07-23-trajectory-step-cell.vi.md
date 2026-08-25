# Agent Note: Ô bước Trajectory và chrome danh sách lượt

Status: implemented

Archived: 2026-07-26

[English](2026-07-23-trajectory-step-cell.md) | 中文

## Problem

Tab trajectory cần hàng bước và chrome danh sách lượt có thể tái sử dụng, để hiển thị các khối assistant đã mở rộng, thời lượng tự thân, cột token Message, và công việc đang tiến hành. Nếu không gấp thời gian sự kiện phiên vào node phiên, và mở rộng các khối thành ô, UI sẽ không thể căn chỉnh theo chrome sản phẩm.

## Decision

[`@deepseek-ai/dsh-client-ui-trajectory`](../../../../packages/client/ui-trajectory/README.md) sở hữu chrome danh sách trajectory dạng hiển thị:

- [`TrajectoryCell`](../../../../packages/client/ui-trajectory/src/client/TrajectoryCell.tsx) — hàng bước cao 38px, kiểu User / Message / Tool (không có hàng Think, Call, Result). Khối reasoning bị bỏ qua (không có đồng hồ cấp khối). Mỗi cặp `tool-call` + `tool-result` được gấp thành một hàng Tool (`name ·` cùng tham số đã cắt ngắn), Time là `result.time − callTime` khi cả hai đầu đều đã biết. Hàng Message mang theo các cột token Input/Output/Think từ `assistant.usage`. Thời lượng tự thân Time dùng `+Ns` / `+N.1s`, khi thiếu là `—`. Trạng thái được chọn vẽ một vòng viền lõm 2px `--dsw-alias-brand-primary-new-colorprimary-new-color` (prop `selected`), và chưa được nối với việc chọn ở chat.
- [`TrajectoryTurn`](../../../../packages/client/ui-trajectory/src/client/TrajectoryTurn.tsx) / header / group header — nền thanh Turn dính (sticky) trải toàn bộ chiều rộng bằng `ghost-active-fill`; tiêu đề/nhãn cột và phần thân Message/Step nằm trong một luồng nội dung căn giữa `max-width: 880px`. Cột bên phải của ô dùng chung hình học với tiêu đề Turn (`320 = 4×71 + 3×12`); padding ô là 20/8.
- [`deriveTrajectoryLayout`](../../../../packages/client/ui-trajectory/src/client/layout.ts) mở rộng `blocks[]` của assistant thành các ô, ghép tool-call với tool-result thành Tool theo `callId`, gấp `partial` và `runningCalls` (loại trùng), chỉ gắn usage vào Message (bao gồm hàng dự phòng rỗng khi không có khối text), và dựng mô tả nhóm bằng khoảng thời gian đồng hồ tường + biểu đồ tần suất công cụ (`1.5s bash×6`). `user/message` không có turn trực tuyến, nên mỗi hàng User được gán vào turn assistant/steering tiếp theo, nếu không thì vào turn `partial` đang diễn ra, nếu không thì là `lastAssistantTurn + 1` (hoặc `1`). Node context không tạo ra ô, nhưng vẫn tiến con trỏ thời lượng Message.

[`ConversationNode`](../../../../packages/client/runtime/src/client/sessions/conversation.ts) mang theo `time` từ `SessionEvent.time`; `ToolResultNode.callTime` và `RunningToolCall.time` đến từ `tool/call` đã ghép cặp. Quy tắc thời lượng: User là `+0s`; Message = assistant.time − thời điểm bề mặt trước đó (bao gồm cả context bị bỏ qua); Tool = result.time − callTime khi cả hai đều đã biết; Tool đang tiến hành = `—`. Thời lượng tiêu đề nhóm là khoảng thời gian tuyệt đối từ sớm nhất → muộn nhất trong nhóm (khoảng thời gian đồng hồ tường; Tool đóng góp điểm bắt đầu và điểm bắt đầu + thời lượng tự thân).

## Alternatives considered

**Giữ lại ô Think cho các khối reasoning.** Bác bỏ: một `assistant/message.time` duy nhất không thể cho biết thời lượng tự thân của Think (trừ khi có đồng hồ cấp chunk); thay vì hiển thị `—`, tốt hơn là bỏ hẳn hàng này.

**Giữ hai hàng Call và Result tách biệt.** Bác bỏ: Result không có thời lượng tự thân đáng để hiển thị; một hàng Tool duy nhất mang toàn bộ khoảng call→result.

**Tích lũy thời lượng từ điểm bắt đầu của phiên/lượt.** Bác bỏ; cột Time là thời lượng tự thân của mỗi hàng.

**Gắn usage vào hàng đầu tiên sau khi mở rộng.** Bác bỏ; usage chỉ gắn vào Message.

**Dùng Date.now() để hiển thị thời lượng của công cụ đang tiến hành.** Hoãn lại; Time của công cụ đang tiến hành vẫn giữ là `—`.

## Consequences

Một khi fold phát ra `time`, tab Trajectory có thể render các hàng đã mở rộng, cả đã hoàn tất lẫn đang tiến hành, cùng với thời lượng tự thân. Phần bao phủ hướng hành vi nằm ở `packages/client/ui-trajectory/tests/{cell,layout,views}.spec.tsx`. Deep link chọn ở chat và đồng hồ cấp khối chi tiết hơn vẫn còn để lại cho sau.
