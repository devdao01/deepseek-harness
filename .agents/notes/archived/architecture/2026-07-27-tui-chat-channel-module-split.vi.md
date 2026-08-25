# Agent Note: Tách module kênh chat dsh-tui

Status: implemented
Archived: 2026-08-04

[English](2026-07-27-tui-chat-channel-module-split.md) | 中文

## Problem

`packages/ui/tui/src/index.ts` đã vượt quá 2000 dòng, phần lớn trong đó là một factory `createTuiChat` đơn lẻ: một closure khoảng 1600 dòng, giữ khoảng bốn mươi biến có thể thay đổi cùng số lượng closure lồng nhau tương ứng. Chọn mô hình, hàng đợi ask-user-question, khôi phục phiên đều quấn vào cùng một scope này, khiến người đọc không thể nắm bắt bất kỳ mối quan tâm đơn lẻ nào mà không phải nạp toàn bộ file vào đầu, và các thay đổi không liên quan đến nhau cũng dễ xung đột. Một đợt trước đã nhóm `src/` thành `components/`, `session/`, `extension/`, nhưng bản thân file entry cùng các file liên quan đến input nằm rải rác ở cấp cao nhất (`autocomplete.ts`, `file-autocomplete.ts`, `skill-invocation.ts`, `xml-tool-output.ts`) chưa được động tới.

## Decision

Các cơ chế con gắn kết với kênh chat được tách ra khỏi `createTuiChat`, chuyển vào `src/chat/`, mỗi cái là một factory nhận gói dependency tường minh, thay vì closure bắt giữ scope entry:

- `chat/model-command.ts` — `createModelController`: lệnh `/model` thực thi theo hàng đợi, overlay chọn mô hình kèm mức độ suy luận (reasoning-effort), và việc phân giải context window của mô hình đã chọn. Giữ cache context window để dòng prompt và view trạng thái đọc.
- `chat/questions.ts` — `createQuestionQueue`: provider tương tác người dùng cùng overlay ask-user-question FIFO chỉ một cái tại một thời điểm.
- `chat/resume.ts` — `createResumeController`: bộ chọn `/resume`, đọc tóm tắt từng ứng viên, kiểm tra trước trước khi bàn giao, bàn giao terminal, và lệnh gợi ý khôi phục được lưu bền vững.
- `chat/helpers.ts` — các hàm hỗ trợ không trạng thái (`formatCwd`, `gitBranch`, suy dẫn surface/tool call, thẻ tham chiếu phiên), `HintEditor`, và các hằng số hiển thị banner.
- `chat/channel.ts` — `ChatChannelDeps` (bề mặt cộng tác dùng chung cho mỗi bộ điều khiển con) và `ChannelNotice` (được trộn vào bởi các bộ điều khiển cần báo cáo kết quả). Mỗi `*Deps` kế thừa từ đây, để bề mặt dùng chung chỉ định nghĩa một chỗ.

`src/` được tổ chức lại theo đó, để `chat/` tập hợp mọi mối quan tâm liên quan đến kênh chat: các bộ điều khiển con nêu trên, cộng với các file input trước đây và các file `session/` cũ (`timing.ts`, `tokens.ts`) đều chuyển vào dưới `chat/`. `xml-tool-output.ts` chuyển vào dưới `components/`. Interface ranh giới host/tiến trình (`TuiRuntime`, `TuiResumeHost`) chuyển vào `src/runtime.ts`. Sau khi tách, `src/` gồm `chat/`, `components/`, `extension/`, cùng các file cấp cao nhất `index.ts` / `config.ts` / `prompt.ts` / `runtime.ts` / `invariant.ts`; `index.ts` giảm từ 2067 dòng xuống còn khoảng 1530 dòng, giờ chịu trách nhiệm dựng và đấu nối ba bộ điều khiển này.

Quy ước cho gói dependency của bộ điều khiển: các collaborator có giá trị ổn định (`ctx`, `resolved`, `palette`, `overlayManager`, cùng các dịch vụ riêng của từng bộ điều khiển) được destructure một lần; các callback kênh (`appendNotice`, `requestRender`, `isDisposed`, `agentStatus`) vẫn giữ trên `deps`, để bộ điều khiển luôn gọi triển khai hiện tại của kênh. JSDoc của `channel.ts` nêu rõ quy tắc này.

## Alternatives considered

- **Hàm tự do nhận đối tượng ngữ cảnh có thể thay đổi dùng chung.** Bác bỏ: điều đó sẽ phơi bày lại đúng mớ hỗn độn bốn mươi trường mà việc tách này đang muốn xóa bỏ, chỉ đổi tên tham số.
- **Đồng thời tách bộ điều khiển trạng thái/hoạt ảnh đếm giờ.** Trì hoãn: `runningStatus` được đọc trực tiếp bởi hoạt ảnh con trỏ prompt trong `updatePromptValues`, đặt ranh giới bộ điều khiển ở đây sẽ khiến trạng thái nội bộ của nó rò rỉ ngược qua getter — một khe hở lợi ích ít ỏi. Nó vẫn nằm inline trong `index.ts`.

## Consequences

Mỗi mối quan tâm giờ có thể đọc và test độc lập, bề mặt dependency dùng chung chỉ định nghĩa một lần, thay vì sao chép vào ba interface. Cái giá: `index.ts` chịu trách nhiệm dựng các bộ điều khiển này và đấu nối gói callback truyền vào; bộ điều khiển mô hình là một tham chiếu chuyển tiếp `let` (closure `updatePromptValues` bắt giữ nó, nhưng nó phải chờ đến khi `appendNotice`/`overlayManager` sẵn sàng mới được dựng), do đó có một chỗ tắt `prefer-const` có lý do chính đáng và một lần vẽ khung hình đầu bị trì hoãn.

## Testing

Hành vi không đổi: các test gói hiện có và snapshot TUI đều pass mà không cần ghi lại, đây chính là hợp đồng của lần refactor này.
