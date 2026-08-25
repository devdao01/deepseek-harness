# Agent Note: Chốt giữ yêu cầu đánh thức đến trong cửa sổ hội tụ hủy

Status: implemented

[English](2026-08-07-cancel-convergence-wake-latch.md) | Tiếng Việt

## Vấn đề

`Agent.cancel(cause, { keepInbox: true })` trả về ngay sau khi kích hoạt tín hiệu abort, nhưng driver đang hoạt động có thể chưa hội tụ về `idle`: việc tháo dỡ luồng stream LLM (mô hình ngôn ngữ lớn), hủy công cụ và ghi xuống đĩa `turn/end` đều diễn ra bất đồng bộ sau khi `abort()` trả về. Một yêu cầu gửi đánh thức (wake send) đến trong cửa sổ đó bị đặt vào `next-turn`, còn `wakeDriver()` trả về ngay lập tức đối với phase vẫn đang `running` — driver đang thoát cũng không bao giờ phát lại lần đánh thức này — nên tin nhắn cứ nằm chờ cho đến khi có wake send tiếp theo đến. Cùng một cửa sổ mất đánh thức này cũng tồn tại quanh hoạt động `runMaintenance` bị hủy. Nhiều test đã cố định hành vi nằm chờ ("chờ lần đánh thức tiếp theo"); lỗi này đồng thời phá vỡ đường tổ hợp `session.cancel` và `subagent.interrupt` (issue #1838). Quy ước hủy và gửi được định nghĩa bởi các quyết định sẵn có: [hủy lượt tường minh](../architecture/2026-07-16-explicit-turn-cancellation.md) và [gửi thống nhất](../architecture/2026-07-22-unified-send-and-coalesced-user-messages.md); bên tiêu thụ `keepInbox` trong môi trường production là [hàng đợi được giữ lại khi dừng Web](2026-07-31-web-stop-preserves-queue.md).

## Quyết định

Phase `running` mang một chốt giữ `wakeRequested`, đối xứng với trường `maintenance` phase sẵn có. `wakeDriver()` chốt lại khi hoạt động hiện tại không thể giao đánh thức — tác vụ maintenance không bao giờ đọc hàng đợi, hoạt động bị hủy sau khi hội tụ sẽ không khởi động lại — trong khi driver còn sống thì không cần chốt, vì nó tự nhận công việc đang chờ trong hàng đợi. Hoạt động đang thoát phát lại chốt tại chính ranh giới hội tụ của nó (`finally` của `kick` và `finally` của `runMaintenance`): vị trí này đảm bảo `turn/end N` được ghi trước khi driver phát lại mở `turn/start N+1`, và đảm bảo `whenIdle()` nhìn thấy driver phát lại thông qua vòng lặp `activityDone` của nó. Cả hai điểm phát lại chỉ thực thi khi `inbox.hasPending`, nên một đánh thức đã bị chốt nhưng bị gỡ khỏi inbox trước khi hội tụ sẽ không khởi động một driver rỗng. Còn khi agent (tác nhân) đã ở trạng thái idle, một đánh thức được gửi đến — dù tin nhắn bị xóa trước khi driver nhận — vẫn mở ra ranh giới lượt của chính nó: chuyển tiếp `idle → running → idle` này là một quy ước có thể quan sát được — cơ chế pause/disarm fallback của driver phiên đích phụ thuộc vào việc chuyển sang `idle` sau khi hủy đăng ký để kích hoạt (đặt bảo vệ vào trong `wakeDriver()` sẽ ức chế ranh giới đó). `cancel()` không kèm `keepInbox` sẽ xóa chốt cùng với inbox.

Điều kiện phân biệt `signal.aborted` là mấu chốt: nó phân biệt "công việc đã xếp hàng trước khi ngắt" — mà `keepInbox` để nằm chờ chờ đánh thức tiếp theo (quy ước nằm chờ của `keepInbox`) — với "đánh thức tường minh sau abort", loại này phải được thực thi sau khi hội tụ.

## Phương án thay thế

**Cho `cancel()` đặt phase về `idle` ngay lập tức.** Không dùng: driver vẫn đang triển khai việc dọn dẹp, làm vậy sẽ chồng lấn hai driver. Logic phát lại nằm trong `finally` của driver cũ, và `finally` đó từ đó không còn được thực thi nữa — 14 trong số 83 test thất bại, nhiều deadlock. Sửa nó đòi hỏi quyền sở hữu phase dựa trên định danh cộng thêm một rào chắn chờ ổn định hoàn toàn khi mở lượt, về mặt cơ chế nặng hơn hẳn, và về cơ bản chỉ là đổi hình thức của cùng một chốt.

**Chốt vô điều kiện cho mọi đánh thức không phải idle.** Không dùng: đánh thức trước khi ngắt sẽ tự động khởi động sau khi hủy có `keepInbox`, vi phạm quy ước nằm chờ của `keepInbox`; cả test "nằm chờ công việc đã xếp hàng" lẫn test steering (điều hướng giữa chừng) trong cửa sổ lỗi đều thất bại.

**Phát lại qua chuỗi promise (`activityDone.then(...)`).** Không dùng: việc phát lại sẽ chạy ngoài phạm vi quyết toán của chính hoạt động, vòng lặp của `whenIdle()` có thể resolve trước khi driver phát lại khởi động; sửa nó đòi hỏi thay thế `activityDone` đồng bộ tại thời điểm gửi, và phụ thuộc vào thứ tự phản ứng microtask — mong manh hơn một cờ đồng bộ.

**Chờ ổn định hoàn toàn trong adapter subagent (tác nhân con).** Không dùng vì nằm ngoài phạm vi issue: việc sửa thuộc về máy trạng thái hủy/đánh thức, không phải bên tiêu thụ.

## Ảnh hưởng

Phase `running` có thêm trường `wakeRequested`; `cancel()` không kèm `keepInbox` sẽ xóa nó cùng với inbox, và việc hủy `disposed` không bao giờ chốt — đánh thức đến sau khi dispose (giải phóng tài nguyên) bắt đầu vẫn nằm chờ, `whenIdle()` sẽ không chờ một lượt model đầy đủ trên một phiên đang bị tháo dỡ. Đánh thức rơi vào khoảng hở nhỏ hơn một microtask giữa lần kiểm tra `hasPending` cuối cùng của driver và lúc thoát vẫn nằm chờ — không có chốt được kích hoạt, vì phase là `running` và chưa abort; đóng khoảng hở đó cần chốt vô điều kiện, cố tình không nằm trong phạm vi lần này. Giữa lượt bị hủy và driver phát lại, việc chuyển trạng thái sẽ phát ra một cặp `idle → running` thoáng qua. Tin nhắn của wake send bị xóa trước khi bất kỳ driver nào nhận, vẫn mở ra một lượt rỗng đã hoàn tất, giữ nguyên ranh giới đánh thức có thể quan sát được.
