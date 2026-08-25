# Agent Note: Intent draft echo lại trong cùng một tick

Status: implemented
Archived: 2026-07-26

[English](2026-07-26-intent-draft-same-tick-echo.md) | 中文

## Problem

hero composer ("Let's start building") là một textarea được kiểm soát (controlled), giá trị của nó lấy từ prompt được lưu giữ lại (retained) bởi Session Intent phía frontend, đọc từ snapshot **danh sách** phiên (`EmptyState` gắn `intent.prompt` thông qua `useSessions`). Đầu vào đi qua `SessionManager.updateIntent → Session.updatePendingPrompt`, hàm sau sẽ đồng bộ làm mới notifier **của chính Session** — nhưng snapshot danh sách mà composer thực sự dựa vào để render, chỉ biết được thay đổi này thông qua subscription intent watch trong `startIntent`, và subscription này lại gọi `markDirty()`, tức là một lần làm mới bị trì hoãn đến microtask.

Việc echo bị trì hoãn này vi phạm hợp đồng (contract) về input được kiểm soát đã được ghi lại trên Notifier (xem [Agent Note kiến trúc web client](../architecture/2026-07-19-gui-web-client-architecture.md)). React sẽ so sánh giá trị DOM với snapshot vẫn còn cũ ngay trong cùng tick với `onChange`, sau đó rollback textarea. Với gõ phím thông thường, điều này biểu hiện thành con trỏ bị nhảy; khi dùng bộ gõ (IME), nó phá hỏng luôn cả việc nhập liệu — mỗi lần cập nhật composition đều bị rollback và áp dụng lại dựa trên giá trị cũ, vì vậy gõ pinyin "nihao" sẽ tạo ra kết quả kiểu như "nnini hni hani hao你好". resident composer (`ConversationRoot`) không bị ảnh hưởng: draft của nó được lưu trong chat store (làm mới đồng bộ), hoặc lấy từ `updateSessionPrompt`, hàm này đọc trực tiếp từ snapshot Session, chứ không phải từ phép chiếu (projection) danh sách.

## Decision

`SessionManager.updateIntent` gọi `this.notifier.notifyNow()` ngay sau `updatePendingPrompt`, nhờ đó làm mới snapshot danh sách trong cùng tick với sự kiện thay đổi. Điều này tuân theo quy tắc kênh (channel) của Notifier: khi một input được kiểm soát của một cử chỉ người dùng chính là được render từ snapshot đó, việc echo trực tiếp cho nó dùng `notifyNow`; còn intent watch cho mọi trạng thái chuyển đổi intent còn lại (bất đồng bộ) vẫn giữ nguyên `markDirty`.

## Alternatives considered

**Đổi callback intent watch trong `startIntent` sang `notifyNow`.** Đây là kênh sai cho seam đó: watch này cũng kích hoạt khi Session thay đổi theo khung hình (frame-driven) (giai đoạn publish, gửi), và Agent Note kiến trúc cấm dùng `notifyNow` cho các nguồn frame-driven, vì điều đó sẽ phá vỡ việc batching.

**Cho `EmptyState` đọc prompt từ snapshot Session thay vì từ danh sách.** Điều này sẽ tái cấu trúc hợp đồng (contract) của slot (EmptyState cố tình gắn với nguồn dữ liệu `useSessions` tiêu chuẩn, và chưa có phạm vi session — Session phía frontend chỉ giới hạn trong trang), so với việc chỉ làm mới phép chiếu mà nó vốn đã đọc thì không mang lại lợi ích gì hơn.

**Dùng state không kiểm soát (uncontrolled) cục bộ trong `InputBar` để chặn rollback.** Cách này chỉ che giấu triệu chứng, từ bỏ nguồn sự thật duy nhất (single source of truth) cho draft (prompt được lưu giữ lại phải tồn tại xuyên suốt việc chuyển hướng workspace cũng như sau khi gửi/thử lại), và khiến mọi input khác được kiểm soát bởi snapshot danh sách phơi bày trước cùng một vấn đề.

## Consequences

Gõ trong hero composer (kể cả composition của IME) giờ đã echo đồng bộ. Gọi `updateIntent` trên trạng thái không có intent vẫn là no-op, không phát ra thông báo nào. Hàm hỗ trợ (helper) của composer trong snapshot web workspace-flow giờ khẳng định (assert) việc echo diễn ra trong cùng tick, thay vì chờ đợi nó, vì vậy nếu quay lại trạng thái echo bị trì hoãn thì cổng chắn (gate) snapshot không cần khóa sẽ thất bại; một unit test runtime cố định (pin) cùng một hợp đồng này tại seam của manager.
