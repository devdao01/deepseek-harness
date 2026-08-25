# @deepseek-ai/dsh-goal

[English](README.md) | Tiếng Việt

Trạng thái mục tiêu cùng session được nguồn hóa theo sự kiện (event-sourced). Dịch vụ này giữ lại một mục tiêu chưa hoàn thành hiện tại trong session hiện có của agent (tác tử), đồng thời coi quyền tiếp diễn thực thi là trạng thái bật tiếp diễn cục bộ theo tiến trình. [Agent Note về miền goal](../../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md) chịu trách nhiệm về lý do thiết kế; [danh mục kiểu goal](../../../docs/subsystems/goal.md) ghi lại hình dạng dữ liệu cụ thể.

## Cấu hình

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'
  config:
    defaultMaxGoalRounds: 256
```

`defaultMaxGoalRounds` phải là số nguyên an toàn dương. `create()` sẽ vật thể hóa (materialize) nội bộ giá trị mặc định triển khai này trước khi commit mục tiêu; giá trị lấy ở cấp request có thể ghi đè nó.

## Quy ước dịch vụ

`ctx.goals` chỉ chấp nhận đúng thực thể `Agent` đang hoạt động đã được đăng ký với id tương ứng. `get()` trả về `GoalView` tách rời khỏi trạng thái nội bộ; thay đổi dùng `GoalRef { id, revision }` làm cơ sở so sánh-và-đặt (compare-and-set) và từ chối tham chiếu lỗi thời. Dịch vụ phơi bày các động từ create, edit, pause, resume, complete, block và clear thông qua khối được sinh tự động trong [goal.md](../../../docs/subsystems/goal.md#cordis-surface). Giá trị mặc định khi tạo được phân giải nội bộ. `disarm()` là ngoại lệ chỉ dành cho vòng đời: nó gỡ bỏ quyền tiếp diễn cục bộ theo tiến trình, không ghi revision mới, cũng không phát sự kiện thay đổi.

Chỉ có tối đa một mục tiêu hiện tại. Thao tác tạo sẽ sinh ra mục tiêu với revision là 1, phase là active và bật tiếp diễn. Mục tiêu chưa hoàn thành phải được chỉnh sửa, chuyển đổi hoặc xóa; mục tiêu đã hoàn thành có thể được thay thế bằng một mục tiêu có id chưa từng dùng trên toàn cục. Chỉnh sửa giữ nguyên phase, blocker reason và activation. Pause, complete, block và clear đều tắt tiếp diễn. Block ghi lại một mã lower-kebab-case do chính sách tự định nghĩa và mô tả tự do đã chuẩn hóa; giới hạn nhà cung cấp, ngân sách cấu hình, lỗi thực thi và yêu cầu nhập liệu thủ công đều dùng chung một phase bền vững này, không mở rộng thêm trạng thái vòng đời. Resume chỉ chấp nhận mục tiêu có phase đã dừng, hoặc phase active nhưng đã tắt tiếp diễn, khi giới hạn Round cấu hình còn dung lượng; nó sẽ xóa blocker reason ban đầu. Mục tiêu có phase active và đã bật tiếp diễn sẽ từ chối các thao tác dư thừa.

Mỗi thay đổi đều thêm một sự kiện `goal/change` bền vững, mang theo snapshot đầy đủ sau khi thay đổi; clear dùng tombstone kèm revision. Do đó, trạng thái goal không phụ thuộc vào việc đặt vào, nhận, chấp nhận hay loại bỏ trong inbox. Session log là thẩm quyền bền vững duy nhất.

Replay nghiêm ngặt chỉ suy ra thay đổi vòng đời từ `goal/change`, và từ chối hình dạng sai, revision không liên tục, chuyển đổi vòng đời bất hợp pháp, timestamp không đơn điệu theo từng mục tiêu, và Goal Round đã nhận không liên tục. Chỉ sự kiện `user/message` có nguồn là goal và đã được nhận mới đẩy Round dương lên. Khi đồng hồ tường lùi lại, timestamp thay đổi bị giới hạn không sớm hơn lần cập nhật mục tiêu trước đó. Replay gia tăng giữ con trỏ tại sự kiện hỏng đầu tiên; `goal/changed` được kích hoạt sau khi sự kiện bền vững được commit, lỗi listener được cách ly xử lý.

Trạng thái bật tiếp diễn không bao giờ được bền vững hóa. Mỗi lần khởi tạo cache mới và mỗi lần kích hoạt `agent/session-start` đều tắt tiếp diễn, ngay cả khi replay tìm thấy mục tiêu bền vững có phase active. Driver tiếp diễn cũng gọi `disarm()` trước khi dỡ (unload) hoặc sau khi tính bền vững không chắc chắn. Do đó, session resume, fork và thay thế driver sẽ giữ lại mục tiêu, phase, revision và số Round đã nhận, nhưng không khởi động công việc; sau đó phải thông qua thay đổi resume tường minh để bật lại tiếp diễn.

Module đi kèm `./invariant` được phát hành riêng sẽ duy trì một collapse (gấp) độc lập cho mỗi session đã gắn kết. Nó từ chối các thay đổi goal có định dạng sai, revision không liên tục, chuyển đổi vòng đời bất hợp pháp, timestamp lùi lại, và Round đã nhận không liên tục trước khi sự kiện ứng viên đi vào log bền vững.

## Điểm mở rộng

Plugin chính sách gọi các động từ dịch vụ, và phản hồi sự kiện `goal/changed` có phạm vi giới hạn. Bên tiêu thụ tiếp diễn nhận Round dưới dạng sự kiện `user/message`, kèm `GoalMessageSource`; lượt thông thường của con người không bao giờ làm tăng `roundsStarted`. Bên tiêu thụ dùng interface và sự kiện `Agent`, không import `dsh-agent-loop`.

## Trải nghiệm model

### Thay đổi trạng thái mục tiêu

#### Model nhìn thấy gì

Thay đổi Goal không được tiêm vào ngữ cảnh model. Các tool như `get_goal` trả về trạng thái hiện tại; bên tiêu thụ tiếp diễn có thể render mô tả mục tiêu và trạng thái Round khi lên lịch công việc cho model. Nếu trong tương lai cần ngữ cảnh goal luôn hiển thị, việc này nên được triển khai bằng một plugin ngữ cảnh độc lập, thay vì đặt trong đường dẫn bền vững hóa.

#### Ảnh hưởng Token

Bản thân sự kiện thay đổi goal không làm tăng token của model. Kết quả tool và prompt lên lịch tiếp diễn tự phơi bày trạng thái sẽ được tính token riêng.

#### Ảnh hưởng KV Cache

Không ảnh hưởng đến KV Cache cho đến khi các thành phần khác phơi bày trạng thái goal như một đầu vào có thể nhìn thấy đối với model.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ chịu trách nhiệm về trạng thái, không chịu trách nhiệm lên lịch tác vụ**: package này không quyết định khi nào mục tiêu đã bật tiếp diễn sẽ tiếp tục, không thử lại lỗi bất thường, cũng không hủy lượt đang active; các chính sách này thuộc về bên tiêu thụ agent seam.
- **Chỉ có ngân sách theo số Round**: `maxGoalRounds` không đo lường token, tiền tệ, thời gian tường hay hạn ngạch nhà cung cấp.
- **Không có bộ đánh giá độc lập**: bên gọi ghi nhận complete hoặc block có quyền quyết định cuối cùng; việc xác thực có bộ đánh giá hỗ trợ hoãn lại cho tầng chính sách độc lập.
- **Chỉ có một mục tiêu hiện tại**: hệ thống cố tình không hỗ trợ mục tiêu song song hay cơ sở dữ liệu mục tiêu độc lập; lịch sử vẫn có thể đọc được trong session log sau khi thay thế hoặc clear.
- **Tin tưởng bên sản xuất trong tiến trình**: plugin có thể truy cập trực tiếp `Session` có thể thêm dữ liệu `goal/change` giả mạo. Replay nghiêm ngặt sẽ phát hiện bản ghi định dạng sai hoặc không nhất quán, và khiến việc truy cập goal thất bại kể từ bản ghi đó cho đến khi log được sửa; đây là phát hiện tính toàn vẹn, không phải cách ly plugin.
