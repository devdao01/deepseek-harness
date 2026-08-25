# Agent Note: Ranh giới giữa việc xếp hàng follow-up và các lần chạy có chủ sở hữu

Status: implemented

[English](2026-07-30-followup-enqueue-and-owned-runs.md) | Tiếng Việt

## Vấn đề

`Agent.followup()` sẽ định danh một tin nhắn người dùng rồi xếp nó vào hàng đợi, nhưng một follow-up đơn lẻ không sở hữu hoạt động diễn ra sau đó. Trước khi agent (tác tử) chuyển sang idle ở lần kế tiếp, steering (điều hướng giữa chừng), context được tiêm vào, việc chạy tiếp công cụ, việc khôi phục và các tin nhắn xếp hàng sau đó đều có thể tham gia vào hoạt động. Vì vậy, `MessageId` có thể chứng minh tin nhắn đã được inbox tiếp nhận, nhưng không định danh được assistant message nào hay `turn/end` nào là kết quả của đầu vào ấy.

[Quyết định one-send-one-turn](../simplification/2026-07-17-one-send-one-turn.md) đã loại bỏ khỏi API lõi thiết kế trả về handle hoàn tất cho mỗi lần send. Mọi tầng giao thức và tầng SDK từng ghép một yêu cầu prompt với một kết quả lượt đều phải dựng lên một cách nhân tạo mối quan hệ còn thiếu này ở phía dưới. Một khi hoạt động tiếp nhận thêm đầu vào, phép ghép đó sẽ trở nên nhập nhằng, đồng thời phơi bày cơ chế lượt như thể đó là kết quả ở cấp prompt.

## Quyết định

Giữ `Agent.followup(message): void` và chỉ để nó thực hiện việc xếp hàng. `Agent.whenIdle()` và `agent/status` vẫn dùng để quan sát vòng đời của toàn bộ agent; cả hai đều không quyết toán từng tin nhắn riêng lẻ. Tính bền vững của Inbox sẽ ghi lại tin nhắn đã được định danh cùng việc nó được tiếp nhận hay bị hủy, nhưng không quy các đầu ra sau đó về tin nhắn ấy.

Giao thức SDK tầng thấp phản hồi `session/prompt` bằng `{ messageId }` ngay khi xếp hàng thành công. Nó truyền các dữ kiện bền vững theo luồng qua `session.event`, công bố các chuyển trạng thái của toàn bộ agent qua `session.status`, và không bao gồm `session.finished`. Client tầng thấp có thể quan sát biên nhận đó cùng trạng thái idle sau đó, nhưng sẽ không nhận được kết quả prompt.

Chỉ khi sở hữu rõ ràng một khoảng hoạt động thì API tự động hóa tầng cao mới trả về `RunResult`. Phương thức `run()` của TypeScript SDK và Python SDK thu thập dữ liệu bắt đầu từ biên nhận inbox bền vững của tin nhắn đã gửi, cho tới khi toàn bộ agent chuyển sang `idle` ở lần kế tiếp; phản hồi cuối cùng của nó là assistant message được gửi cuối cùng trong khoảng đó, chứ không phải phản hồi được quy theo quan hệ nhân quả về prompt đã gửi. Python SDK còn trả về kind của lý do kết thúc ở lượt cuối cùng của session gốc dưới dạng [`finish_reason`](../bug-fix/2026-08-11-owned-run-finish-reason.md) ở cấp lần chạy, nhưng không quy nó về prompt đã gửi. CLI (giao diện dòng lệnh) chạy một lần thì sở hữu khoảng idle-tới-idle tương ứng. Các lần chạy sub agent tách biệt có thể báo cáo kết quả, bởi bên gọi sở hữu trọn vòng đời của agent con, và mọi steering đều thuộc về lần chạy đó.

ACP (Agent Client Protocol) buộc phải trả về `stopReason` theo quy định của giao thức. Tầng cầu nối của nó xử lý tuần tự các prompt trong mỗi ACP session, bảo đảm mỗi lúc chỉ có một prompt đang được xử lý, chờ toàn bộ agent chuyển sang idle, còn các trường hợp khác thì báo `end_turn` chung. Lượt kết thúc vì chạm giới hạn token không được quy về prompt: chúng quyết toán bằng `end_turn`. Lỗi mô hình trên lượt gắn với prompt đó sẽ lập tức từ chối prompt kèm chính lỗi ấy (lỗi được quy về đúng lượt mà nó thuộc về), còn slot không có lượt (prompt đã được tiếp nhận rồi bị loại bỏ) sẽ quyết toán bằng `cancelled` khi idle, đứng ngang hàng với việc hủy ACP tường minh hoặc dispose (giải phóng tài nguyên).

Việc chạy tiếp Goal chỉ giữ lại `MessageId`, dùng để nhận diện tin nhắn goal đã được xếp hàng bền vững và đã được tiếp nhận. Nó tiến lên dựa trên trạng thái goal bền vững khi toàn bộ agent chuyển sang idle, chứ không ánh xạ tin nhắn sang kết quả lượt.

## Các phương án đã cân nhắc

**Ánh xạ `MessageId` sang lượt đã tiếp nhận nó.** Một lượt có thể dùng steering và context được tiêm vào, lại còn có thể chạy tiếp qua nhiều bước mô hình/công cụ. Phép ánh xạ đó chỉ định danh được việc tiếp nhận, chứ không xác lập được quy kết nhân quả cho đầu ra kết quả hay lý do dừng.

**Trả về handle hoàn tất phân biệt theo từng follow-up.** Handle như vậy ám chỉ tồn tại một ranh giới kết quả trong vòng đời agent dùng chung, trong khi ranh giới đó thực tế không thành lập. Nó hoặc bỏ sót công việc có ảnh hưởng tới hoạt động, hoặc âm thầm hấp thụ các đầu vào không liên quan đến sau.

**Dùng `turn/end` cuối cùng quan sát được trước khi vào idle.** Với những khoảng có chủ sở hữu rõ ràng, đây là một quan sát hữu ích ở cấp lần chạy; nhưng nếu đặt tên nó là kết quả của tin nhắn đã gửi thì lại một lần nữa đưa ra tuyên bố nhân quả sai.

## Kiểm chứng

- Test của Agent và inbox ghim việc follow-up chỉ xếp hàng, việc tiếp nhận hoặc hủy bền vững, và quan sát idle của toàn bộ agent.
- Test của giao thức SDK, TypeScript SDK và Python SDK ghim biên nhận `{ messageId }`, `session.status`, sự vắng mặt của `session.finished`, cùng việc thu thập `RunResult` từ biên nhận tới idle mà không kèm `status` hay `reason` ở cấp prompt; test của Python SDK còn ghim riêng quan sát `finish_reason` ở cấp lần chạy của nó.
- Test của ACP, CLI chạy một lần, chạy tiếp goal và subagent ghim những ranh giới hoạt động khác nhau mà từng bản tích hợp thực sự sở hữu.
- Test của bên tiêu thụ ghim rằng không bản tích hợp production nào suy ra kết quả follow-up bằng cách liên kết `MessageId` với `turn/end`.

## Hậu quả

Khoảng hoạt động có chủ sở hữu có thể bao gồm steering, context được tiêm vào hoặc công việc khác được gửi trước khi vào idle, nên phản hồi cuối cùng, lý do kết thúc và các sự kiện của nó cố ý bao phủ rộng hơn tin nhắn ban đầu. Kết quả của SDK và ACP vẫn không bao gồm lỗi mô hình ở cấp prompt và phân loại chạm giới hạn token; bên gọi có thể kiểm tra các dữ kiện ở cấp lần chạy hoặc dữ kiện bền vững, nhưng không thể tuyên bố rằng những dữ kiện đó có quy kết nhân quả. Khi thực thi đồng thời nhiều thao tác tự động hóa trên cùng một session, bắt buộc phải áp dụng chiến lược tuần tự hóa hoặc sở hữu tường minh, không được dựa vào kết quả ngầm định theo từng prompt.
