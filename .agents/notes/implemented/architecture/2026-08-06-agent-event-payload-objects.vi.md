# Agent Note: Sự kiện phạm vi Agent dispatch một đối tượng payload duy nhất

Status: implemented

[English](2026-08-06-agent-event-payload-objects.md) | Tiếng Việt

## Vấn đề

Các sự kiện phạm vi Agent xưa nay dùng tham số theo vị trí: chủ thể `agent` ở đầu, các trường riêng của sự kiện, và `next` ở cuối dành cho sự kiện waterfall/serial. Việc thêm trường mới hoặc loại bỏ các kiểu context (như `PreStepContext` và `RequestFailureContext`) đều buộc phải viết lại mọi listener và emitter xuyên các package, còn quy ước thì luôn nằm rải rác trong danh sách tham số thay vì tập trung trong một payload có tên.

## Quyết định

Mỗi sự kiện phạm vi Agent nhận đúng một đối tượng payload làm tham số đầu tiên. Payload luôn mang chủ thể (`agent`), các trường của sự kiện, và `signal` hủy khi sự kiện có tín hiệu hủy; `next` vẫn là tham số cuối cùng của sự kiện waterfall/serial. Các sự kiện bị ảnh hưởng gồm mười hai sự kiện `agent/*`, `agent-loop/config-start-failed` (sự kiện duy nhất không có chủ thể) và `goal/changed`.

`PreStepContext` và `RequestFailureContext` đã bị loại bỏ; các trường của chúng nằm trực tiếp trong payload của `agent/pre-step` và `agent/request-error`.

Quá trình dispatch được hợp nhất: `agentEvents(ctx, agent)` (cùng `emitAgentEvent` dùng một lần) tiêm chủ thể vào, khiến key mang phạm vi và trường `agent` của payload không thể phân kỳ; ngay cả khi một payload hợp lệ về cấu trúc tình cờ mang trường `agent`, chủ thể được tiêm vào vẫn được ưu tiên. `ReactLoopAgent` dựng dispatcher một lần trong constructor và định tuyến mọi emit, serial và waterfall qua nó, nhờ vậy việc dispatch trên đường nóng không phát sinh cấp phát nào.

## Các phương án đã cân nhắc

**Giữ chữ ký theo vị trí.** Việc thêm trường mới hoặc loại bỏ kiểu context vẫn sẽ buộc viết lại mọi listener và emitter, và quy ước vẫn tiếp tục nằm rải rác trong danh sách tham số thay vì tập trung trong một payload có tên.

**Dựng chủ thể thủ công tại từng điểm dispatch.** Thiết kế trung gian của loop gọi `ctx.waterfall(this.carrier, …)` với payload `{ agent: this, … }` dựng thủ công; cách đó tránh được cấp phát ở mỗi lần dispatch, nhưng lặp lại việc tiêm chủ thể và khiến key phạm vi phân kỳ với chủ thể trong payload. Dispatcher hợp nhất là điểm tiêm duy nhất cho mọi chế độ dispatch.

## Hệ quả

Chữ ký của listener đặt tên cho payload đầy đủ đúng một lần, nên việc mở rộng payload hoặc loại bỏ kiểu context chỉ là một thay đổi hình dạng duy nhất đối với toàn bộ listener và emitter. Sự gắn kết giữa chủ thể và phạm vi được dispatcher cưỡng chế trên từng chế độ dispatch, và đường nóng của loop vẫn không phát sinh cấp phát.
