# Agent Note: TUI hoãn thử lại việc phân giải model context khi có race điều kiện đăng ký adapter

Status: implemented
Archived: 2026-08-04

[English](2026-07-30-tui-adapter-registration-race.md) | 中文

## Problem

Cordis kích hoạt plugin theo tính khả dụng của service chứ không theo thứ tự cấu hình, do đó TUI (mà `inject` của nó chỉ yêu cầu service `llm`) có thể mount trước khi một plugin adapter đã được cấu hình như `dsh-llm-pi-ai` hoàn tất việc đăng ký định tuyến provider. Bộ điều khiển model của TUI phân giải context window của model đã chọn ngay khi mount; khi route của agent trỏ tới một provider chưa được đăng ký, `resolveModelInfo` từ chối với `NO_ADAPTER`, khiến mỗi phiên mới đều in ra `Could not resolve model context: no adapter registered for provider "…"` — một lỗi giả cho một cấu hình hoàn toàn bình thường (adapter hoàn tất đăng ký chỉ vài mili giây sau đó, và hội thoại vẫn hoạt động bình thường).

## Decision

Bộ điều khiển model của TUI coi việc reject `NO_ADAPTER` trong quá trình phân giải context window là trạng thái tạm thời (transient) chứ không phải lỗi: nó lặng lẽ hoãn lần phân giải này, và phân giải lại ở lần commit `llm/adapters-updated` kế tiếp — đây vốn là thông báo registry không mang payload mà `LlmService` phát ra tại mỗi điểm commit route. Nếu một lần commit vẫn thiếu route đó, việc chờ sẽ lại bị hoãn tiếp, nên các thay đổi topology không liên quan vẫn im lặng. Bất kỳ thay đổi mục tiêu nào cũng sẽ quay lại phân giải và xóa trạng thái chờ đang treo, do đó trạng thái hoãn không bao giờ trở nên lỗi thời so với lựa chọn hiện tại; mọi lỗi phân giải khác vẫn được in thông báo như bình thường.

## Alternatives considered

**Cho TUI chờ đến khi khởi động ổn định (settled) rồi mới phân giải.** TUI không phụ thuộc vào Loader (test và các bên nhúng chạy trong môi trường không có Loader), và trạng thái "đã ổn định" không quan sát được từ bên trong plugin; đưa Loader coupling vào cho một lần phân giải chỉ mang tính hiển thị sẽ đảo ngược hướng phụ thuộc.

**Dùng timer để polling hoặc thử lại.** Timer chỉ có thể đoán độ trễ kích hoạt, vẫn báo lỗi sai khi gặp adapter chậm, và còn đưa vào một tham số có thể chỉnh nhưng không ai sở hữu. Registry vốn đã công bố mỗi lần commit qua `llm/adapters-updated`; đăng ký lắng nghe sự kiện này vừa chính xác vừa không tốn chi phí.

**Điều chỉnh thứ tự cấu hình để adapter load trước.** Thứ tự dòng trong Loader không mang ngữ nghĩa về load (việc kích hoạt vốn được thiết kế để dẫn dắt bởi service), nên điều này không thể diễn đạt được bằng cấu hình.

**Hoàn toàn ẩn đi lỗi NO_ADAPTER.** Như vậy thì adapter bị thiếu vĩnh viễn (gõ sai tên provider) sẽ không bao giờ lộ ra trên đường dẫn context window. Việc hoãn thử lại vẫn giữ được tín hiệu: tên provider sai vẫn sẽ biểu hiện tương tự `model unset` trong bộ chọn, và thất bại rõ ràng khi dispatch, trong khi race điều kiện lúc khởi động sẽ tự hóa giải.

**Đổi sang phân giải context window mỗi lần gửi tin nhắn, thay vì lúc mount.** Đường dẫn gửi vốn đã phân giải theo từng bước (`prepareCall()`), và chỉ báo (indicator) hiển thị liên tục chứ không chỉ khi gửi; phân giải giá trị hiển thị theo mỗi lần gửi sẽ khiến chỉ báo trống trơn cho đến tin nhắn đầu tiên, và lặp lại I/O của adapter cho một giá trị chỉ thay đổi khi route thay đổi.

## Consequences

Các provider thực sự cấu hình sai sẽ không còn in lỗi phân giải context lúc khởi động nữa — nó sẽ lộ ra ở lần dispatch đầu tiên, đó mới là nơi lỗi này có thể được xử lý. Bộ điều khiển đăng ký lắng nghe mỗi lần commit `llm/adapters-updated`, nhưng chỉ hành động khi có một lần chờ đang bị hoãn; disposer của listener được giải phóng qua `detach()` của bộ điều khiển trong `detachListeners()` của channel, đối xứng với các listener channel cùng cấp. Có ba test TUI bao phủ: lần phân giải bị hoãn vẫn im lặng với các commit không liên quan, và hoàn tất khi commit cho route đó đến; thay đổi mục tiêu loại bỏ trạng thái chờ cũ; sau khi channel detach, registry commit không còn quay lại phân giải nữa.
