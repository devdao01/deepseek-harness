# @deepseek-ai/dsh-tool-goal

[English](README.md) | Tiếng Việt

API điều khiển hướng tới model cho [`ctx.goals`](../goal/README.md): `get_goal`, `create_goal` và `update_goal`. [Agent Note về goal tool](../../../.agents/notes/implemented/feature/2026-07-19-model-facing-goal-tools.md) chịu trách nhiệm về việc tách quyền và trải nghiệm người dùng theo phong cách Codex.

## Tool

- `get_goal()` trả về goal hiện tại hoặc `null`, bao gồm id／revision compare-and-set, phase bền vững, số Round đã nhận／giới hạn của Goal Round, mọi blocker reason, và trạng thái bật tiếp diễn cục bộ theo tiến trình hiện tại.
- `create_goal(objective, max_goal_rounds?)` tạo một goal dựa trên lượt cấp cao nhất do con người trực tiếp khởi xướng. Model có thể suy luận ý định goal chạy dài hạn mà không cần cụm từ lệnh chính xác; lượt không phải của con người và subagent sẽ bị từ chối khi thực thi.
- `update_goal(goal_id, revision, action, objective?, max_goal_rounds?, blocked_reason?)` hỗ trợ `edit`, `pause`, `resume`, `complete` và `blocked`. Giá trị thay thế chỉ thuộc về `edit`; `blocked_reason` chỉ bắt buộc khi action là `blocked`, và được bền vững hóa với mã ổn định `model-reported`. Chuỗi rỗng và giá trị 0 dưới schema nghiêm ngặt được coi là bị bỏ qua, còn giá trị có ý nghĩa vẫn bị giới hạn theo từng action.

Mọi lệnh gọi đều loại trừ lẫn nhau (mutually exclusive), do đó một batch được model sắp xếp có thể quan sát được các thay đổi trước đó cùng revision mới của chúng. UI client nhận được thẻ chung thuần túy: `get_goal` dùng read, thay đổi dùng other. Thẻ thay đổi chọn giá trị action có ý nghĩa đầu tiên, nếu không thì hiển thị goal id, do đó giá trị đệm đã được chấp nhận không bao giờ tạo ra đầu vào rỗng.

Cả 3 giá trị chuẩn đều nhất quán với JSON gọn đã render cho bên gọi Native: `{ goal: null }` hoặc `{ goal: { id, revision, objective, phase, roundsStarted, maxGoalRounds, blockedReason? }, activation }`. Do đó, bên tiêu thụ lập trình không cần phân tích JSON đã render để nhận được cùng cấu trúc miền.

Khi một Goal Round tự chủ báo cáo thành công `complete` hoặc `blocked`, nó sẽ đánh dấu lần thực thi tool đó bằng `concludeTurn()`, khiến lượt vật lý dừng lại sau bước đó. Thay đổi trực tiếp của con người không bao giờ gây ra việc dừng này: assistant có thể xác nhận thay đổi, vòng lặp vẫn có thể nhận steering (dẫn dắt) đồng thời từ con người.

## Quyền

Thực thi yêu cầu đúng thực thể `exec.agent` đang hoạt động, initiator `AgentRegistry` mà nó kế thừa, trạng thái running và lượt còn mở. Create, edit, pause và resume còn yêu cầu có message `{ kind: 'user' }` đã được chấp nhận hoặc sự kiện steering trong lượt hiện tại của runtime root agent (tác tử gốc). Dòng dõi fork bền vững không hạ cấp root agent đã được khôi phục; quyền sở hữu subagent đang active thì có hạ cấp.

`{ kind: 'user' }` là bằng chứng từ host. `Agent.followup()` và `steer()` sẽ gán giá trị này khi bên gọi bỏ qua source, do đó plugin, scheduler và các bên sản xuất không phải con người khác phải truyền source riêng của mình, không được kế thừa quyền của người dùng.

Complete và blocked còn yêu cầu đúng Goal Round hiện tại: `user/message` có nguồn là goal, với id, revision và số Round bằng với goal hiện tại sau khi collapse. Trước khi đạt `blockedAfterConsecutiveRounds`, lệnh gọi blocked của Goal Round sẽ bị từ chối một cách máy móc; model phán đoán liệu cùng điều kiện có thực sự tiếp diễn hay không, và phải nêu rõ trong `blocked_reason`. Ủy quyền trực tiếp của con người có thể dừng goal ngay lập tức.

## Cấu hình

```yaml
- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'
  config:
    blockedAfterConsecutiveRounds: 3
```

Giá trị này phải là số nguyên an toàn dương. Nó vừa cung cấp giới hạn cứng tối thiểu để model tự báo cáo bị chặn, vừa quyết định con số được nêu rõ trong hướng dẫn model.

## Trải nghiệm model

### System prompt

#### Model nhìn thấy gì

Mô tả chính sách goal cố định giải thích loại ý định ngữ nghĩa nào của người dùng đáng để tạo goal, yêu cầu đọc ref chính xác trước khi cập nhật, giải thích cách bật lại tiếp diễn sau session resume／fork, và giới hạn việc khai báo hoàn thành／bị chặn. Ngưỡng đã cấu hình được chèn vào hướng dẫn này.

##### Chính sách Goal

```markdown
Use goal tools for one long-running completion objective in the current session. create_goal may infer goal intent from a direct human request in any language; do not create a goal for routine single-turn work. Call get_goal before update_goal and copy its exact goal_id and revision. After session resume or fork, an active goal is disarmed: when a human asks to continue or resume in any wording or language, use update_goal action resume to rearm it. Mark complete only when the objective is actually achieved. Mark blocked only after the same blocking condition persists for at least 3 consecutive goal rounds, and report that concrete condition in blocked_reason; difficulty, uncertainty, or useful remaining work is not blocked.
```

#### Ảnh hưởng Token

Khi việc đăng ký prompt của plugin này nằm trong phạm vi request, mỗi request sẽ phát sinh một chi phí đầu vào cố định nhỏ.

#### Ảnh hưởng KV Cache

Tiền tố giữ ổn định khi phạm vi plugin, ngưỡng cấu hình và văn bản hướng dẫn không đổi. Việc bật, dispose (giải phóng tài nguyên) hoặc thay đổi cấu hình có thể làm mất hiệu lực khả năng tái sử dụng của phần prompt này.

### Schema tool và kết quả

#### Model nhìn thấy gì

Schema [`get_goal`, `create_goal` và `update_goal`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-goal) được sinh tự động. Kết quả thành công là JSON gọn. Thay đổi sẽ thêm sự kiện `goal/change` bền vững vào miền goal, mà không đưa ngữ cảnh model vào hàng đợi. `activation` trong kết quả là giá trị quan sát thời gian thực, không bao giờ là căn cứ quyền hạn cho replay.

#### Ảnh hưởng Token

Chi phí schema cố định, cộng thêm một kết quả gọn cho mỗi lần gọi. Thay đổi bền vững không làm tăng thêm ngữ cảnh riêng có thể nhìn thấy đối với model.

#### Ảnh hưởng KV Cache

Tiền tố giữ ổn định khi định nghĩa và khả năng hiển thị của schema không đổi. Lệnh gọi và kết quả được nối thêm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục trước đó.

## Hạn chế đã biết và công việc hoãn lại

- **Ý định ngữ nghĩa vẫn do model phán đoán**: việc thực thi chỉ có thể chứng minh lượt hiện tại chứa một message do con người gửi trực tiếp, không thể chứng minh yêu cầu có đủ quan trọng để tạo goal hay không.
- **Điều kiện chặn có giống nhau hay không vẫn do model phán đoán**: runtime chỉ cưỡng chế đếm các Goal Round đã nhận không trùng lặp nhau, không phán đoán trở ngại có tương đương về ngữ nghĩa hay không; việc triển khai bộ đánh giá độc lập vẫn hoãn lại.
- **Không chịu trách nhiệm lên lịch hoặc trình bày trực tiếp cho con người**: các tool này chỉ thay đổi trạng thái; driver cùng session và [`dsh-command-goal`](../command-goal/README.md) là các bên tiêu thụ độc lập của cùng miền.
- **Quyền của Goal Round cần driver**: trừ khi driver tiếp diễn nhận lượt người dùng có nguồn là goal, nếu không đường dẫn `complete`／`blocked` tự chủ sẽ không được bật; chỉ gắn kết package này sẽ không tạo ra các lượt đó.
- **Đăng ký prompt và lọc độc lập với nhau**: một phạm vi nào đó có thể ẩn tool nhưng vẫn giữ hướng dẫn, trừ khi việc triển khai giới hạn cả hai đăng ký trong cùng một phạm vi.
