# Agent Note: Chỉ giữ lại một primitive dừng công khai duy nhất

Status: implemented

[English](2026-06-20-public-agent-stop-api.md) | 中文

## Vấn đề

Handle `Agent` công khai phơi bày hai cách dừng công việc đang chạy chồng lấp lên nhau: `abort()` chỉ nhắm vào step, và `cancel()` nhận biết queue. Cái trước giữ lại input đã xếp hàng, cái sau ban đầu chỉ phơi bày hành vi mặc định chung, sẽ xóa cả công việc đã xếp hàng lẫn steering (dẫn dắt giữa chừng), đồng thời hủy turn đang hoạt động. `cancel(cause, { keepInbox: true })` giờ có thể ghi đè chính sách dừng Web trong production mà không cần phơi bày turn holder riêng tư. ACP (Agent Client Protocol) giữ lại cancel chung, còn bên sở hữu lifecycle tháo dỡ agent (smart agent) qua `AgentHandle.dispose()`. Không có bên gọi production nào cần một abort trần, chỉ nhắm step riêng lẻ.

Sự khác biệt về hành vi thực sự tồn tại, nhưng code thực sự được giao không cần một động từ hẹp hơn độc lập. AgentLoop sở hữu một cancellation holder riêng tư cho toàn bộ turn. `cancel(cause, options?)` mang theo nguyên nhân tường minh và có kiểu `user` hoặc `parent`; hành vi mặc định chung của nó bỏ input đang chờ xử lý, còn `keepInbox` giữ lại công việc đang chờ cho turn tiếp theo. Dispose (giải phóng tài nguyên) vẫn là một sự gián đoạn lifecycle riêng biệt. Quy ước đầy đủ về quy thuộc và lan truyền nằm ở [Agent Note hủy turn tường minh](../architecture/2026-07-16-explicit-turn-cancellation.md).

Interface công khai thừa khiến loop phải mang một động từ công khai vốn dĩ thuộc về việc tháo dỡ nội bộ. `cancel()` có option có thể diễn đạt chính sách của bên gọi mà không cần phơi bày thao tác dưới dạng holder thứ hai.

## Quyết định

`cancel()` là primitive *dừng* công khai duy nhất trên `Agent`. Bên sở hữu lifecycle dùng `AgentHandle.dispose()` để dừng và hủy đăng ký agent; bên không sở hữu dùng `cancel()` chung để từ bỏ công việc hiện tại và đã xếp hàng, hoặc dùng `keepInbox` để hủy turn đang hoạt động mà giữ lại công việc đang chờ. Việc triển khai giữ lại một turn cancellation holder riêng tư, nhưng nó không thuộc quy ước `Agent` hướng tới plugin. [Quyết định dừng Web](../bug-fix/2026-07-31-web-stop-preserves-queue.md) là bên tiêu thụ `keepInbox` trong production.

`whenIdle()` **được giữ lại** như primitive quan sát công khai cho trạng thái dừng hoàn toàn ổn định (resolve khi agent thoát trạng thái `running` và dừng hoàn toàn ổn định, resolve ngay nếu đã idle, đợi loop thoát sau dispose). Nó không phải động từ dừng; nó là cách để bên không sở hữu quan sát *sự hoàn tất* của việc dừng mà không cần dispose agent. Bên tiêu thụ đang hoạt động của nó là ACP và test agent chờ settle thông qua quy ước công khai này (`packages/acp/acp/tests`, `packages/core/agent-loop/tests`); cầu nối ACP trong production sở hữu agent của nó và hủy chúng qua `AgentHandle.dispose()`, nên bản thân `packages/acp/acp/src` không có lệnh gọi `whenIdle()` nào.

`abort()` công khai không còn tồn tại, disposer vẫn là bất đồng bộ và đợi loop dừng. Test xác minh việc hủy thông qua nguyên nhân có kiểu công khai và signal API tường minh, không đụng vào bên trong holder.

## Phương án thay thế từng cân nhắc

**Đồng thời loại bỏ `whenIdle()`**: hình thức được đề xuất ban đầu, bị bác bỏ sau khi xác minh tiền đề đối chiếu với code: nó là primitive dừng hoàn toàn ổn định mang tính chịu tải, xử lý an toàn việc settle của bên đợi và race điều kiện với turn thay thế, buộc bên tiêu thụ phải tự quan sát thủ công chuyển tiếp `running`→`idle` chính là đường đi mong manh mà pattern phòng thủ đã cảnh báo.

## Xác minh

`Agent` không còn phơi bày `abort()` công khai, còn `cancel()`, `whenIdle()` và `steer()` được giữ lại; ACP hủy gọi `cancel()` chung, dừng Web gọi `cancel(..., { keepInbox: true })`, còn việc tháo dỡ thông qua dispose của handle để đợi dừng hoàn toàn ổn định. `whenIdle()` resolve cho observer không sở hữu khi dừng hoàn toàn ổn định; test suite bao phủ hai đường dừng được hỗ trợ này là cancellation và dispose.

## Hệ quả

Plugin có thể dùng `keepInbox` để hủy turn đang hoạt động trong khi vẫn giữ lại prompt đã xếp hàng, nhưng không thể chỉ hủy riêng một step model／tool mà để turn đó tiếp tục chạy. Use case chỉ nhắm step cần bên tiêu thụ cụ thể và quy ước hẹp hơn; việc phơi bày cơ chế loop riêng tư vẫn thiếu lý do chính đáng.

## Liên quan

Agent Note này chỉ loại bỏ động từ dừng dư thừa. Steering giữa turn vẫn là một đường gửi message được giữ lại có chủ đích; quan sát dừng hoàn toàn ổn định vẫn thực hiện qua `whenIdle()`. Interface gửi message cuối cùng gồm `followup()`, `steer()` và `inject()`; dừng và quan sát vẫn thực hiện qua `cancel()` và `whenIdle()`.
