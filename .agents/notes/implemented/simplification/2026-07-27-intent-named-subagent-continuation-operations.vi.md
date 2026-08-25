# Agent Note: Thao tác tiếp diễn subagent được đặt tên theo intent

Status: implemented

[English](2026-07-27-intent-named-subagent-continuation-operations.md) | Tiếng Việt

Việc triển khai dựa trên Activation hiện tại thuộc trách nhiệm của [subagent có thể tiếp diễn](../feature/2026-07-28-continuable-subagent-conversations.md). Nó giữ lại thao tác `followup` được đặt tên trong ghi chú này, trả về `MessageId` đã được chấp nhận, dùng tham số `Agent` trần làm quyền hạn parent trực tiếp online chính xác, và giới hạn sự tham gia của provider vào child có thể tiếp diễn chỉ còn `prepareContinuable`.

## Vấn đề

Sau khi gộp việc điều phối child có thể tiếp diễn vào `ctx.subagents`, việc phân phối cho provider và intent của bên gọi cùng tồn tại trong một dịch vụ công khai. `resume(name, request)` nhận descriptor, parent đã được xác thực quyền, id child bền vững và tín hiệu activation, trong khi chỉ continuation manager nội bộ mới có thể diễn giải đúng dữ liệu này. `sendMessage(...)` phơi bày từ ngữ ở tầng transport, thay vì intent `followup` mà `Agent` đã áp dụng; nó còn tách nguồn (source) và tín hiệu thành các tham số độc lập, mở rộng interface thao tác, trong khi mỗi bên gọi đều phải dùng cả hai một cách nguyên tử.

Ranh giới persistence cũng công khai đồng thời cả `SessionStore.flush()` lẫn `flushRequired()`. Cả hai thực hiện cùng một việc phân phối song song trong cùng phạm vi, chỉ khác nhau ở việc có chấp nhận snapshot listener rỗng hay không, do đó interface session đã mã hóa chính sách của một bên tiêu thụ thành thao tác thứ hai.

## Quyết định

`SubagentRuntime` tách biệt bốn intent thực thi: `start(name, request)` trả về một run one-shot thông thường, do bên nắm giữ chịu trách nhiệm; `startContinuable(spec)` thiết lập một child bền vững, và trả về id của nó cùng `MessageId` khởi tạo đã được chấp nhận; `followup(parent, childId, content, { source, signal })` gửi nội dung tiếp theo của parent; `reportFrom(child, content, { delivery, signal })` gửi nội dung đã chọn của child tới parent trực tiếp của nó. `followup` nhất quán với `Agent.followup()`, còn `SubagentRun.steer()` vẫn là năng lực có phạm vi hẹp hơn, chỉ cung cấp steering (dẫn hướng giữa chừng) cho một run đã được xác nhận vẫn đang chạy. Công cụ hướng tới model giữ tên ổn định `send_message` và `report`, và ủy quyền việc định tuyến cho phương thức intent tương ứng.

Request của bên gọi và request của provider được tách biệt nhau. `SubagentStartRequest` chứa dữ liệu one-shot do bên gọi cung cấp; `ResolvedSubagentStartRequest` sẽ bổ sung descriptor do dịch vụ resolve trước khi gọi `SubagentProvider.start()`. Khi tạo child có thể tiếp diễn, manager truyền `ContinuableCreateRequest` cho `SubagentProvider.prepareContinuable()` (tùy chọn), và chỉ nhận dữ liệu tạo tách biệt. `SubagentRuntime.resume()` và việc phân phối resume của provider đều không tồn tại: continuation manager nạp descriptor, xác thực quyền của parent, và chịu trách nhiệm thực thể hóa Agent, gửi prompt, khôi phục nguội (cold resume) và teardown.

`SessionStore.flush(session)` là barrier persistence duy nhất, và trả về `Promise<boolean>`. Nó resolve thành `true` sau khi ít nhất một listener trong phạm vi tham gia thành công; resolve thành `false` khi snapshot listener rỗng; sau khi mọi listener kết toán, nếu có lỗi, nó reject bằng lỗi của listener đăng ký sớm nhất. Kết quả tham gia không thể cho biết backend persistence đã chọn có thực sự lưu trạng thái hay chưa. Checkpoint thông thường có thể bỏ qua giá trị boolean này; continuation manager cũng coi flush cuối cùng là một barrier best-effort, cố ý bỏ qua kết quả tham gia, ghi log khi bị reject, và vẫn dispose (giải phóng tài nguyên) child cùng giải phóng quyền sở hữu.

## Các phương án thay thế đã cân nhắc

**Giữ việc phân phối resume của provider ở dạng công khai.** Ngoài continuation manager, không có bên gọi production nào khác đồng thời chịu trách nhiệm tra cứu descriptor, xác thực quyền parent trực tiếp, thực thể hóa Agent, quyền sở hữu Activation, và teardown theo thứ tự child-trước cần thiết để gọi an toàn. Một phương thức công khai sẽ phơi bày dữ liệu triển khai đã resolve mà không có intent gọi độc lập hợp lý; provider thay vào đó đóng góp dữ liệu tạo lần đầu tách biệt thông qua `prepareContinuable`, và không bao giờ tham gia vào cold resume.

**Giữ `sendMessage` trên dịch vụ.** Công cụ hướng tới model gửi thông điệp, nhưng thao tác dịch vụ biểu diễn một hành động tiếp theo, có thể là steering cho một activation đang chạy, hoặc khôi phục từ storage bền vững. `followup` nhất quán với interface `Agent` có cấu trúc, và không cam kết một tuyến định tuyến cụ thể nào.

**Giữ `flushRequired()`.** Phương thức thứ hai này chỉ đóng gói việc kiểm tra listener rỗng. Để barrier hiện có trả về liệu có listener tham gia hay không cho phép việc phân phối chỉ giữ một cách triển khai duy nhất, và để mỗi bên gọi tự quyết định việc thiếu listener có chấp nhận được hay không.

**Gộp khởi động thông thường và khởi động continuable.** Một cờ sẽ khiến cùng một phương thức hoặc chờ cho tới khi run one-shot do bên nắm giữ chịu trách nhiệm sẵn sàng rồi mới trả về, hoặc trả về ngay lập tức child bền vững và định danh thông điệp. Các phương thức tách theo intent không cần kiểu union giá trị trả về vẫn có thể giữ được sự khác biệt về quyền sở hữu và thời điểm.

## Ảnh hưởng

- Danh mục dịch vụ Cordis chỉ chứa các thao tác của bên gọi; provider có thể chọn tham gia vào việc tạo lần đầu child có thể tiếp diễn thông qua `SubagentProvider.prepareContinuable?()`, nhưng không nhận được quyền hạn vòng đời Agent hay thao tác resume công khai.
- Nguồn của thao tác tiếp theo và tín hiệu hủy bỏ được truyền qua cùng một options object, có hình dạng nhất quán với các hàm hỗ trợ được đặt tên theo intent trên `Agent`, đồng thời vẫn giữ được ngữ nghĩa gửi online và khôi phục từ storage bền vững.
- Tính bền vững của session chỉ có một barrier thao tác. Kết quả tham gia vẫn có thể quan sát được, nhưng không tuyến child có thể tiếp diễn nào coi bất kỳ sự tham gia listener nào là bằng chứng backend persistence đã lưu trạng thái.
- Schema `send_message` và `report`, định danh thông điệp đã chấp nhận, quyền sở hữu `AgentHandle`, từ vựng sự kiện bền vững và transcript (bản ghi văn bản) hiển thị cho model tuân theo việc triển khai dựa trên Activation được liên kết ở trên.
