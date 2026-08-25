# Agent Note: Ngừng phản chiếu ranh giới persistence thành sự kiện agent

Status: implemented

[English](2026-06-20-remove-agent-boundary-mirror-events.md) | 中文

## Vấn đề

Loop ghi transcript (bản ghi văn bản) canonical trong `SessionEvent`, đồng thời cũng phát ra một nhóm sự kiện phản chiếu ranh giới `agent/*` thời gian thực song song: `agent/turn-start`, `agent/turn-end`, `agent/step-start` và `agent/step-end`. Các sự kiện phản chiếu này buộc bên tiêu thụ phải chọn giữa hai nguồn sự thật cho cùng một sự kiện bền vững. ACP (Agent Client Protocol) đã chọn log session cho việc settle prompt và output đã commit, vì đó là bản ghi duy nhất bền vững, có thể replay được; tiêu thụ phản chiếu thời gian thực đòi hỏi phải điều hòa thời điểm của nó với ranh giới đã lưu sẵn trong log. UI stdio là bên tiêu thụ production duy nhất còn render ranh giới turn từ sự kiện phản chiếu; nó đã render tool call và tool result từ `session/event`.

Sự trùng lặp này không miễn phí. Mỗi thay đổi lifecycle cần cập nhật đồng thời sự kiện session, sự kiện phản chiếu, tài liệu, invariant, test và kỳ vọng snapshot. Sự kiện ranh giới trùng lặp còn khiến quan hệ trước sau của sự kiện thất bại trở nên tế nhị: một turn có thể đã được persist đóng lại trước khi listener `agent/turn-end` thời gian thực kịp chạy, nên listener thất bại sau ranh giới không còn vị trí hợp lệ nào để chèn vào trong log, chỉ có thể báo cáo ra ngoài băng (out of band).

## Quyết định

Dùng `session/event` làm luồng ranh giới/transcript thời gian thực duy nhất. Bên tiêu thụ cần render turn, tool call, tool result, message assistant và ranh giới bền vững đều subscribe thống nhất vào `session/event`, suy ra UI từ chính bộ từ vựng sự kiện mà lớp persistence sử dụng.

Bốn sự kiện phản chiếu ranh giới bền vững — `agent/turn-start`, `agent/turn-end`, `agent/step-start`, `agent/step-end` — đã bị loại khỏi phân loại sự kiện agent (smart agent). UI muốn lấy agent handle tại ranh giới sẽ giữ lại đối tượng đích thời gian thực từ `agent/created`/`agent/disposed`, và so sánh trực tiếp session của nó; `dsh-ui-stdio` theo đó đánh dấu header `[main turn N]` cho agent do app sở hữu, các session khác thì render id bền vững của chúng. Bản ghi canonical vẫn là log session theo event sourcing.

Phản chiếu step (hoàn toàn không có bên tiêu thụ) bị loại bỏ trước tiên trong [Agent Note ngữ nghĩa domain sự kiện](../architecture/2026-06-30-event-domain-semantics.md); Agent Note đó khi ấy giữ lại phản chiếu turn với lý do UI stdio cần lấy handle `Agent` tại ranh giới turn. Quyết định này hoàn thành phần việc còn lại: `dsh-ui-stdio` là REPL test có thể bỏ đi bất cứ lúc nào, cách render của nó có thể tự do thay đổi, nên "ui-stdio cần nó" không còn là lý do để giữ lại phản chiếu — nó đọc `session/event`, chỉ giữ lại đối tượng đích thời gian thực của riêng mình.

## Phạm vi: loại bỏ gì, không loại bỏ gì

Đã loại bỏ (phản chiếu ranh giới bền vững — mỗi cái đều lấy log session làm nguồn sự thật): `agent/turn-start`, `agent/turn-end`, `agent/step-start`, `agent/step-end`.

Giữ lại — không phải phản chiếu ranh giới bền vững, nên không nằm trong phạm vi quyết định này:

- `agent/steering` — không phải ranh giới, nên không nằm trong phạm vi quyết định này. Nó phản chiếu bản ghi điều khiển bền vững `steering/message`, không phải ranh giới, sau này bị loại bỏ bởi quyết định kế tiếp của riêng nó: [Loại bỏ emit phản chiếu `agent/steering`](../../archived/simplification/2026-07-04-remove-agent-steering-mirror.md).
- `agent/stream-chunk` — luồng token thời gian thực. Không nằm trong phạm vi quyết định này (nó phản chiếu `assistant/chunk` bền vững, không phải ranh giới), sau này bị loại bỏ bởi quyết định kế tiếp của riêng nó: [Ngừng phản chiếu luồng token thành sự kiện agent](../../archived/simplification/2026-07-02-remove-stream-chunk-mirror.md).
- `agent/created`, `agent/disposed`, `agent/status`, `agent/error`, `agent/queued` — sự kiện lifecycle/điều khiển không thuộc dữ liệu transcript. Đặc biệt `agent/queued`, nó là xác nhận inbox được kích hoạt trước khi bất kỳ sự kiện bền vững nào tồn tại (công việc đã xếp hàng bị hủy có thể không bao giờ vào log), nên nó có chủ đích chỉ được giữ lại như sự kiện thời gian thực.

## Phương án thay thế từng cân nhắc

- **Loại bỏ luôn cả `agent/steering`** — phạm vi của đề xuất ban đầu; bị loại trừ vì vượt phạm vi: nó phản chiếu bản ghi điều khiển bền vững `steering/message`, không phải ranh giới, sau này bị loại bỏ bởi [quyết định của riêng nó](../../archived/simplification/2026-07-04-remove-agent-steering-mirror.md) (`agent/stream-chunk` cũng bị loại bỏ bởi [Agent Note phản chiếu phân mảnh stream](../../archived/simplification/2026-07-02-remove-stream-chunk-mirror.md)).
- **Giữ lại phản chiếu turn cho UI stdio** — lập trường ban đầu của [Agent Note ngữ nghĩa domain sự kiện](../architecture/2026-06-30-event-domain-semantics.md); bị bác bỏ ở đây, vì `dsh-ui-stdio` là REPL test có thể bỏ đi bất cứ lúc nào, không phải bên tiêu thụ mang ràng buộc then chốt, và nó đã đổi sang render ranh giới dựa trên `session/event` cộng đối tượng đích thời gian thực của riêng mình.

## Hệ quả

Plugin không còn có thể quan sát ranh giới turn/step qua sự kiện tiện lợi lấy `Agent` làm tham số đầu tiên. Nó cần subscribe `session/event`; nếu cần đối tượng thời gian thực, thì tra cứu qua `ctx.agents` theo id chia sẻ, hoặc giữ lại đối tượng mà nó đã sở hữu sẵn. Đây là đánh đổi có thể chấp nhận: bên tiêu thụ ranh giới không nên phụ thuộc vào một nguồn sự kiện thứ hai có thể trôi dạt khỏi log bền vững.
