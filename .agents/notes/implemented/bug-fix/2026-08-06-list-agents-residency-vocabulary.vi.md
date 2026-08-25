# Agent Note: `list_agents` dùng `ready` cho các child có thể tiếp tục

Status: implemented

[English](2026-08-06-list-agents-residency-vocabulary.md) | 中文

## Vấn đề

`list_agents` chiếu trạng thái residency (trạng thái tồn tại trong tiến trình) của tiến trình child có thể tiếp tục thành `running | idle | complete`. `complete` đọc lên như một công việc đã đạt trạng thái cuối và kết quả nằm sẵn ở đâu đó, nhưng sự thật bên dưới chỉ có nghĩa là không có Activation nào còn residency: cuộc hội thoại vẫn nguyên vẹn, `send_message` vẫn có thể tiếp tục nó, và nó không khẳng định bất cứ điều gì về kết quả của child. Một model đọc thấy `complete` sẽ hợp lý mà đi tìm kết quả để thu thập, hoặc gửi công việc thay thế cho một cuộc hội thoại mà nó tưởng đã kết thúc.

Từ này đặc biệt dễ gây hiểu lầm khi xuất hiện cùng lúc với [việc chuyển giao kết quả settle do manager phụ trách](../feature/2026-08-06-manager-owned-subagent-settlement-delivery.md). Việc hoàn tất sẽ đến parent dưới dạng thông báo; danh sách dùng để nhớ lại các cuộc hội thoại đã lưu bền vững, chứ không phải để poll thông báo đó.

## Quyết định

Phần chiếu hướng tới model báo cáo `running | idle | ready`:

- **`running`** nghĩa là Agent còn residency có driver đang hoạt động.
- **`idle`** nghĩa là Agent còn residency nhưng đang ở giữa các lượt, có thể đang chờ agent mà nó đã khởi động.
- **`ready`** nghĩa là chỉ còn lại cuộc hội thoại đã lưu bền vững. `send_message` sẽ khởi động lượt tiếp theo trên cùng cuộc hội thoại đó; trạng thái này thể hiện có thể khôi phục chứ không phải trạng thái cuối, và cũng không có nghĩa là có kết quả đang chờ thu thập.

Mô tả tool sẽ nêu rõ những khác biệt này, và dẫn dắt model tránh việc poll: nó giải thích rằng khi child kết thúc, parent sẽ nhận được thông báo, còn danh sách dùng để nhớ lại mình đã khởi động những child nào. Vì bất kỳ snapshot nào cũng có thể race với một tiến trình khác hoặc một tin nhắn tiếp theo, `send_message` vẫn là kiểm tra có thẩm quyền tại thời điểm gửi.

Tầng service không đổi. `SubagentListEntry.activity` vẫn giữ `'running' | 'inactive'`, đối với các consumer như UI, đây là mô tả chính xác trạng thái residency của corpus. Adapter hướng tới model ánh xạ `inactive` thành `ready`, vì từ này diễn đạt hành động model có thể thực hiện, mà không bịa ra kết quả.

## Các phương án thay thế đã cân nhắc

**Giữ `complete`, và giới hạn nó bằng mô tả.** Một đoạn mô tả giải thích rằng `complete` không có nghĩa là đã hoàn tất, mỗi lần được đọc lại phải chống lại tên trạng thái đang hiển thị. Dòng mà model quét qua phải tự nó diễn đạt đúng sự khác biệt.

**Dùng `active | dormant`.** Cách này sẽ xóa mất sự khác biệt có ý nghĩa giữa một Agent còn residency đang ở giữa các lượt và một cuộc hội thoại chỉ còn tồn tại trong storage, đồng thời khiến trạng thái chỉ còn trong storage nghe có vẻ không dùng được. `ready` diễn đạt trực tiếp sự thật hữu ích: cùng cuộc hội thoại đó có thể nhận lượt tiếp theo.

**Bỏ hẳn trạng thái này.** Trạng thái residency vẫn hữu ích khi parent quyết định có gửi thêm công việc hay không. Bỏ nó chỉ là thay một trạng thái gây hiểu lầm bằng việc không có tín hiệu gì cả.

**Đổi tên giá trị activity ở tầng service.** `running | inactive` là đúng ở tầng service, và có các consumer không phải model. Việc khuấy động một hợp đồng dùng chung chỉ để sửa cách hiển thị của một adapter là không hợp lý; [Agent Note về catalog agent lưu bền vững](../feature/2026-07-22-durable-subagent-catalog-and-list-agents.md) tiếp tục sở hữu từ vựng service đó.

## Hệ quả

- Dòng hiển thị dùng `<id> [running] — <label>`, `<id> [idle] — <label>` hoặc `<id> [ready] — <label>`.
- Enum `status` trong output schema thay đổi cùng với hợp đồng hiển thị. Catalog tool được sinh ra sẽ mang mô tả mới; nó chỉ render `parameters` của mỗi tool, không bao giờ đưa output schema vào.
- Unit test cố định ba phép ánh xạ, cùng với các điều khoản mô tả dẫn dắt model chờ thông báo settle thay vì poll chính tool này.
- Kịch bản ACP `subagent-list-agents` lắp ráp toàn bộ sẽ render `ready` cho child đã settle và có thể khôi phục.
