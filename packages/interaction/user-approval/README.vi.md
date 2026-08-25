# @deepseek-ai/dsh-user-approval

[English](README.md) | 中文

Seam phê duyệt một lần độc lập với kênh. `ctx.approval.request(req)` trả về `allowed-once`, `rejected`, `cancelled` hoặc `unavailable`; khi thiếu người trả lời hoặc thất bại sẽ đóng theo hướng từ chối, và ủy quyền cũng chỉ áp dụng cho thao tác được yêu cầu. Chữ ký sự kiện chính xác xem khối được sinh ra trong [approval.md](../../../docs/subsystems/approval.md#cordis-surface).

Mỗi request đều phải thuộc về một lượt (turn) agent (tác tử) chưa kết thúc. Service sẽ nối thêm một cặp bản ghi kiểm toán `approval/asked` và `approval/decided`, còn mô hình chỉ thấy kết quả công cụ đã ghi log phát sinh từ đó. Request đã bị hủy sẽ phân giải thành `cancelled`; nếu việc nối thêm bản ghi kiểm toán thất bại trước khi commit, Promise sẽ bị reject, chứ không trả về một quyết định chưa được ghi lại.

Người trả lời là một listener waterfall (sự kiện dạng thác) của `approval/request`. Để trả lời request agent mà mình phụ trách, hãy trả về một kết quả; nếu không thì gọi `next()` để ủy quyền. Listener giới hạn theo agent chỉ nhận request của agent đó; mỗi triển khai nên tổ hợp một người trả lời cuối cùng, vì thứ tự các listener cùng cấp không phải là cơ chế ưu tiên chính sách. Lớp cầu nối tự động hóa ACP (Agent Client Protocol) cung cấp quyết định máy một lần cho các session mà nó phụ trách.

`ApprovalPolicy` là `'ask'` hoặc `'never'`. Giá trị thực tế lấy từ sự kiện `approval/policy` cuối cùng, và dự phòng về cấu hình; `setApprovalPolicy()` là đường ghi. `'never'` sẽ từ chối request trước khi điều phối tương tác. Cả hai chính sách đều đóng góp toàn bộ ý nghĩa hiện tại của mình vào snapshot ngữ cảnh runtime an toàn cho cache.

Pipeline công cụ điều phối các quyết định `ask` qua seam này, và đóng theo hướng từ chối khi seam này thiếu; công cụ bash sandbox cũng dùng nó khi thử lại nâng quyền. Lớp cầu nối tự động hóa ACP trả lời các lệnh gọi thuộc agent của chính nó dựa theo chính sách máy của client. Sự kiện kiểm toán vẫn chỉ ghi log, do đó mô hình chỉ thấy kết quả mà bên tiêu thụ phát khởi request trả về. Chi tiết xem [Agent Note về seam phê duyệt](../../../.agents/notes/implemented/feature/2026-07-06-approval-seam.md) và [Agent Note về sandbox](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

## Trải nghiệm mô hình

### Ngữ cảnh chính sách phê duyệt hiện tại

#### Những gì mô hình thấy

Lần đầu request và mỗi khi chính sách hiệu lực thay đổi, một snapshot ngữ cảnh runtime đầy đủ sẽ được nối thêm sau lịch sử được giữ lại. Dưới `ask`, nội dung ngữ cảnh phê duyệt sẽ giải thích rằng hệ thống có thể tham vấn người trả lời đã cấu hình, khi thiếu người trả lời khả dụng thì đóng theo hướng từ chối. Dưới `never`, nó sẽ giải thích về việc từ chối chắc chắn và hậu quả không nâng quyền. Request không thay đổi sẽ giữ nguyên snapshot trước đó, không thêm tin nhắn khác.

##### Đóng góp của chính sách Ask

```markdown
Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.
```

##### Đóng góp của chính sách Never

```markdown
Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).
```

#### Ảnh hưởng Token

Thêm một tin nhắn ngữ cảnh ngắn gọn khi lần đầu request và khi chính sách thực sự thay đổi; request không đổi không thêm token chính sách lặp lại.

#### Ảnh hưởng KV Cache

Chỉ thêm vào cuối sau lịch sử được giữ lại. Việc chuyển đổi `ask`/`never` giữ nguyên tiền tố hệ thống và hội thoại ổn định, không viết lại tin nhắn wire đầu tiên.

### Kết quả công cụ

#### Những gì mô hình thấy

`approval/asked` và `approval/decided` chỉ ghi log. Mô hình chỉ thấy kết quả công cụ cho phép, từ chối, hủy hoặc không khả dụng cuối cùng do bên tiêu thụ phát khởi request đưa ra; UI quyền hướng tới con người không thuộc ngữ cảnh.

#### Ảnh hưởng Token

Không phát sinh token kiểm toán lặp lại. Từ chối có thể thay thế kết quả công cụ bình thường bằng một thông báo lỗi ngắn gọn được giữ lại, còn cho phép sẽ giữ lại kết quả bình thường của bên tiêu thụ.

#### Ảnh hưởng KV Cache

Chỉ thêm vào cuối; nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Request chỉ có hiệu lực trong một lượt chưa kết thúc**: gọi khi rảnh rỗi hoặc giữa các lượt sẽ ném lỗi trước khi kiểm toán; workflow phê duyệt bền vững ngoài lượt vẫn còn hoãn lại.
- **Chỉ tồn tại ủy quyền một lần**: từ vựng kết quả có `allowed-once`, nhưng không có `allow-always`, quy tắc đã ghi nhớ, thu hồi hay kho lưu ủy quyền; chính sách session chỉ có `ask`/`never`.
- **Request không mang tham số công cụ**: người trả lời sẽ thấy tên công cụ, lý do và id lệnh gọi tùy chọn; kênh máy ACP yêu cầu id lệnh gọi, và sẽ ủy quyền các request không có id.
- **Không có người trả lời tích hợp sẵn**: triển khai headless hoặc tổ hợp không đầy đủ sẽ trả về `unavailable` và đóng theo hướng từ chối; bản thân service không bao giờ nhắc con người.
