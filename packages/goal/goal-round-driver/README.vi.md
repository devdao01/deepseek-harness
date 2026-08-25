# @deepseek-ai/dsh-goal-round-driver

[English](README.md) | Tiếng Việt

Driver tiếp diễn cùng session cho [`ctx.goals`](../goal/README.md). Nó phơi bày dịch vụ `Agent` và session, chuyển các mục tiêu có phase active và đã bật tiếp diễn thành các [Goal Round](../../../docs/glossary.md#goal-round) liên tục; [Agent Note về driver cùng session](../../../.agents/notes/implemented/feature/2026-07-19-same-session-goal-round-driver.md) ghi lại lý do thiết kế về race condition và vòng đời.

## Lắp ráp

```yaml
- id: goal
  name: '@deepseek-ai/dsh-goal'

- id: tool-goal
  name: '@deepseek-ai/dsh-tool-goal'

- id: goal-round-driver
  name: '@deepseek-ai/dsh-goal-round-driver'
```

Plugin này không có cấu hình có thể điều chỉnh. `maxGoalRounds` thuộc về định nghĩa mục tiêu, còn ngưỡng chặn hướng tới model thuộc về [`dsh-tool-goal`](../tool-goal/README.md); việc lặp lại bất kỳ giá trị nào trong driver có thể tạo ra các chính sách phân kỳ.

## Quy ước Round

Khi thực thể agent (tác tử) hoạt động tương ứng ở trạng thái idle, và goal có phase active, đã bật tiếp diễn và còn dung lượng, driver trước tiên tạo checkpoint cho các thay đổi goal đang chờ xử lý, sau đó đặt trước (reserve) `roundsStarted + 1`, tương ứng với `{ goalId, revision }` hiện tại. Nó xếp hàng một prompt `<goal_round>`, kèm theo `GoalMessageSource`. Listener `agent/pre-step` xác thực bản ghi đã nhận đầy đủ cùng goal hiện tại, trước và sau các listener downstream; chỉ khi `user/message` thực sự bước vào (enter step) mới tăng `roundsStarted`. Việc đặt trước bị từ chối do lỗi thời sẽ không tiêu thụ số Round.

`MessageId` xác định message đã đặt trước thông qua việc chèn và nhận từ inbox bền vững; nó không xác định kết quả của lượt đó. Message của con người không tiêu thụ giới hạn goal. Nếu công việc của con người đi vào inbox trước khi đặt trước, hoặc tham gia cùng batch đang chờ với việc đặt trước, công việc tự động sẽ nhường lại cho đến khi agent vào trạng thái idle; prompt tự động đang chờ trong batch hỗn hợp sẽ bị từ chối, chỉ đặt trước lại sau checkpoint đó.

Prompt được giữ lại sẽ chỉ rõ mục tiêu đã trích dẫn JSON và `round/maxGoalRounds`, coi workspace hiện tại, kết quả tool và trạng thái session bền vững là thông tin có thẩm quyền, yêu cầu cung cấp bằng chứng trước khi hoàn thành, và yêu cầu giữ mục tiêu ở trạng thái active khi công việc vẫn chưa hoàn thành. Trích dẫn có thể giữ lại văn bản mục tiêu nhiều dòng hoặc giống thẻ (tag-like) dưới dạng dữ liệu. Thay đổi vòng đời goal vẫn phải đi qua kiểm tra quyền độc lập của `dsh-tool-goal`.

## Checkpoint Idle

Khi toàn bộ agent vào trạng thái idle, phase và revision goal bền vững có thẩm quyền. Goal có phase active, đã bật tiếp diễn và còn dung lượng sẽ đặt trước Round tiếp theo; hoàn thành, tạm dừng, chặn và chỉnh sửa đều ngăn tiếp diễn. Driver không phân loại hoạt động trước đó bằng cách liên kết goal message với `turn/end`, do đó lỗi nhà cung cấp và giới hạn token không thuộc về kết quả goal ở cấp prompt.

## Vòng đời và tính bền vững

`goal/changed` tạo ra nghĩa vụ bền vững. Trước khi xếp hàng công việc, driver chờ `ctx.sessions.flush()`, và kiểm tra lại revision của goal cũng như đầu vào cạnh tranh sau khi chờ. Lỗi flush đến qua `agent/error` sẽ tắt tiếp diễn, tránh khởi động thêm một Round.

Khi plugin này được tải vào một agent hiện có, nó sẽ không bao giờ kế thừa trạng thái bật tiếp diễn. `GoalService.disarm()` gỡ bỏ quyền cục bộ theo tiến trình, mà không thay đổi phase, revision hay lịch sử bền vững; sau đó việc resume do người dùng ủy quyền tường minh sẽ ghi lại việc bật lại tiếp diễn. Sau khi session resume và fork, miền goal áp dụng cùng quy tắc thông qua `agent/session-start`.

Việc hủy sẽ loại bỏ công việc đang chờ trong inbox, hoặc để lại trạng thái aborted trong phạm vi agent. Tại checkpoint idle tiếp theo, driver sẽ tạm dừng những goal có nỗ lực đã đặt trước hoặc đã được nhận, tránh việc tự khởi động lại sau khi hủy; hủy không liên quan đến nỗ lực goal chỉ thu hồi quyền tiếp diễn cục bộ theo tiến trình. Nếu thay đổi pause thất bại, driver sẽ quay về tắt tiếp diễn. Việc teardown plugin sẽ đóng việc nhận mới, tắt tiếp diễn cho mọi goal đang active, hủy công việc đang tiến hành với cause là `parent`, và chờ driver cùng agent hoàn toàn dừng ổn định trong khi event guard vẫn còn hiệu lực.

## Trải nghiệm model

### Prompt Goal Round

#### Model nhìn thấy gì

Mỗi Round đã được nhận là một khối `<goal_round>` vai người dùng được giữ lại, trong đó chỉ rõ mục tiêu đầy đủ và số Round dương. Các message người dùng trước đó, snapshot trạng thái goal, đầu ra assistant và bản ghi tool vẫn được giữ trong cùng lịch sử session.

#### Ảnh hưởng Token

Mỗi Round đã được nhận sẽ thêm một khối chỉ dẫn cố định và mục tiêu. Các request tiếp theo sẽ gửi lại Round đã giữ, cho đến khi compaction (nén) che khuất nó; không tạo agent mới, cũng không sao chép tiền tố hội thoại.

#### Ảnh hưởng KV Cache

Chỉ nối thêm (append-only) trong một epoch: mỗi Round đã được nhận sẽ mở rộng hội thoại hiện có sau tiền tố có thể tái sử dụng. Compaction có thể thay thế hậu tố lịch sử phái sinh và di chuyển ranh giới có thể tái sử dụng.

## Hạn chế đã biết và công việc hoãn lại

- **Không có bộ đánh giá độc lập**: chính sách goal hướng tới model tự phán đoán bằng chứng đã đủ để hoàn thành hay chưa, và blocker có ngữ nghĩa không đổi hay không; việc xác thực có bộ đánh giá hỗ trợ vẫn hoãn lại.
- **Chỉ thực thi trong cùng một session**: package này cố tình không spawn agent mới, không fork tiền tố session, cũng không triển khai kiểu nỗ lực độc lập theo phong cách Ralph; luồng công việc đó thuộc về một tầng plugin riêng.
- **Race condition khi dỡ hàng đợi đã nhận**: việc dỡ (unload) plugin của Cordis là bất đồng bộ. Một prompt goal đã được agent inbox chấp nhận có thể khởi động trước khi teardown bắt đầu và tiêu thụ Round của nó; sau đó teardown sẽ hủy request, tắt tiếp diễn của goal và chờ dừng ổn định hoàn toàn. Sẽ không có Round tiếp theo nào được khởi động thêm.
- **Chỉ có giới hạn Round, không phải ngân sách tài nguyên**: chính sách token, tiền tệ, thời gian và hạn ngạch nhà cung cấp vẫn độc lập. Sự kiện session tương ứng không được gán cho goal message, cũng không được ánh xạ thành mã chặn goal.
- **Trường hợp bất thường không tự động thử lại**: lỗi tạm thời từ nhà cung cấp và lỗi bền vững hóa cần người dùng ủy quyền resume về sau, chứ không áp dụng chính sách thử lại ngầm định.
