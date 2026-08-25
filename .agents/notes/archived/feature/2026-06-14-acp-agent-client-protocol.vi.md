# Agent Note: Hỗ trợ Agent Client Protocol (ACP) — điều khiển coding agent từ editor bên ngoài

Status: implemented
Archived: 2026-07-26

[English](2026-06-14-acp-agent-client-protocol.md) | 中文

> Đã được thay thế bởi [ACP như một giao thức chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md). Agent Note này ghi lại thiết kế lớp cầu nối hướng-editor đã bị loại bỏ.

## Vấn đề

Harness ban đầu chỉ phơi bày agent qua một vòng lặp readline. Giao diện đó có thể truyền văn bản, nhưng editor không thể tạo hoặc khôi phục phiên theo cách có cấu trúc, không thể liên kết việc hoàn tất prompt, không thể stream reasoning và hoạt động tool, không thể render UI riêng cho từng tool, không thể yêu cầu quyền, hay hủy một cuộc hội thoại mà không làm gián đoạn các cuộc hội thoại khác. ACP (Agent Client Protocol) định nghĩa các tương tác này dưới dạng JSON-RPC qua stdio, với Zed là client mục tiêu để đưa ra các quyết định tương thích cụ thể.

Lớp cầu nối phải giữ nguyên mọi ranh giới sở hữu vốn có của harness. Nó không được phụ thuộc vào một agent loop cụ thể, không được bỏ qua tool registry, không được thực thi lệnh shell trong editor, cũng không được phát minh ra một nguồn sự thật (source of truth) thứ hai cho phiên. stdout đồng thời cũng là kênh truyền tải giao thức, nên bất kỳ output log ngoài ý muốn nào cũng sẽ phá vỡ kết nối.

## Quyết định

`@deepseek-ai/dsh-acp` từng là plugin điều khiển UI/client (UI/client-driven) trong nhóm package `ui` (hiện nằm ở `acp`). Nó dùng `AgentSideConnection` của `@agentclientprotocol/sdk` (dựa trên stdin/stdout), chỉ điều phối các dịch vụ giao diện: factory tạo/khôi phục agent, việc lưu trữ phiên, tool registry, tương tác người dùng, và tùy chọn khả năng approval/bash. Nó không sửa đổi agent loop, cũng không phải là cài đặt của một capability seam.

Lớp cầu nối triển khai các đường phiên ổn định sau:

- `initialize` thương lượng phiên bản giao thức, khai báo hỗ trợ prompt kiểu text và `resource_link`, và khai báo khả năng `loadSession`.
- `session/new` xác thực đường dẫn tuyệt đối `cwd`, lưu nó vào `SessionHeader`, tạo agent qua `ctx.agents`, và trả về các tùy chọn cấu hình do tầng lắp ráp cung cấp.
- `session/load` xác thực cwd yêu cầu khớp với metadata đã lưu trữ trước khi khởi tạo agent, giữ nguyên id trong lúc khôi phục bất đồng bộ, replay các sự kiện user/assistant/tool dưới dạng ACP update, và báo cáo kết quả gộp config-option sau khi khôi phục.
- `session/prompt` chấp nhận text và resource link, từ chối nội dung không hỗ trợ hoặc rỗng, mỗi phiên chỉ cho phép một prompt đang xử lý (in-flight) tại một thời điểm, và chốt kết quả tại `turn/end` thuộc về prompt đó. Turn lỗi sẽ từ chối RPC; các lý do đóng turn khác được ánh xạ qua một bộ mã hóa/giải mã stop-reason ACP bao phủ toàn bộ.
- `session/cancel` gọi đường hủy agent có nhận biết hàng đợi (queue-aware), chỉ chốt kết quả prompt của phiên được nhắm tới.

Việc hiển thị lệnh gọi tool vẫn do chính tool đảm nhiệm. `presentCall` và `presentResult` của tool trả về các biến thể ý định render `generic`, `terminal`, hoặc `diff`; lớp cầu nối switch trên union type đó và ánh xạ sang ACP. Tool không có presenter nhận về fallback dạng chung (generic). Terminal card cho bash dùng quy ước cổng khả năng (capability-gated) của Zed là `_meta.terminal_info`, `_meta.terminal_output`, và `_meta.terminal_exit`; harness vẫn thực thi lệnh qua `ctx.bash`, giữ nguyên sandbox, việc làm sạch môi trường, quyền sở hữu và cwd. Client không hỗ trợ extension này sẽ nhận nội dung văn bản thông thường. Tool filesystem cung cấp diff card và vị trí file, không cần hardcode nhánh theo tên tool trong lớp cầu nối.

Việc xử lý quyền là một answerer trên [seam phê duyệt người dùng (user approval seam)](2026-07-06-approval-seam.md), chứ không phải chính sách "hỏi mỗi lần gọi tool" trong ACP. `approval/request` thuộc về agent của lớp cầu nối và mang call id sẽ trở thành `session/request_permission` trên phiên editor của agent đó, cung cấp lựa chọn allow/reject một lần. Yêu cầu bên ngoài hoặc yêu cầu không có call id được ủy quyền xuống hạ nguồn; answerer thiếu hoặc lỗi sẽ giữ nguyên trạng thái reject khi có sự cố. Plugin khởi tạo việc hỏi (ví dụ chính sách trước-thực-thi hoặc nâng quyền bash) sở hữu quyền quyết định "có hỏi hay không".

Khi `ctx.permission` được lắp ráp, lớp cầu nối phơi bày một `permission` select từ bảng preset do deployment cung cấp. Các preset đã phát hành `workspace-write` và `danger-full-access` mỗi cái đóng gói một sandbox mode cùng một chính sách approval; tổ hợp knob hợp lệ không khớp preset nào sẽ tạo ra trạng thái `custom` chỉ có thể chuyển sang chứ không chọn được trực tiếp. `session/set_config_option` xác thực và ghi hai sự kiện knob thuộc quyền sở hữu qua `PermissionService.set()`. Chuyển đổi trong lúc turn đang mở sẽ được append ngay lập tức; chuyển đổi khi rảnh rỗi (idle) được xếp chồng trong phản hồi và neo vào giai đoạn lắp ráp yêu cầu trước turn mở tại lần `agent/prompt-submit` tiếp theo. Trước thời điểm đó nó chỉ tồn tại trong bộ nhớ, nên sau khi crash, hệ thống khôi phục lại kết quả gộp đã lưu trữ. ACP session mode không được mô hình hóa, vì config option là bề mặt giao thức hướng tới tương lai; `AcpConfig.model` vẫn ở cấp kết nối.

Lớp cầu nối còn cung cấp `UserInteractionProvider` dựa trên ACP: yêu cầu `ask_user_question` trở thành một form dẫn dắt trên phiên thuộc về nó. Ngữ nghĩa của select, multi-select, mô tả tùy chọn, và ghi đè câu trả lời tùy chỉnh đều được giữ nguyên.

Quyền sở hữu vòng đời là tường minh. Lớp cầu nối giữ một `AgentHandle` cho mỗi phiên đang hoạt động. Việc ngắt kết nối và Cordis dispose (giải phóng tài nguyên) sẽ hủy các prompt đang chờ xử lý, dispose song song mọi handle, chờ vòng lặp dừng hoàn toàn và ghi lưu trữ được flush, rồi mới xóa bản ghi. Lỗi thông báo luồng được cách ly, nên client biến mất không làm hỏng turn của agent. Tầng lắp ráp ứng dụng ACP không tải stdout logger; một test bảo vệ để stdout chỉ chứa JSON-RPC đã đóng khung (framed).

Hợp đồng giao thức hiện tại xem tại [README của package `dsh-acp`](../../../../packages/acp/acp/README.md).

## Phương án thay thế từng cân nhắc

**Đặt một lớp trước listener `tools/execute`, hỏi quyền cho mọi lệnh gọi thuộc về ACP**: bị bác bỏ. Cách này sẽ hardcode chính sách quyền vào lớp cầu nối UI, hỏi ngay cả khi không chính sách nào yêu cầu, và không thể phục vụ các yêu cầu approval phát sinh sau khi việc thực thi đã bắt đầu. Seam user-approval dùng chung tách biệt cơ chế, chính sách hỏi, và answerer UI.

**Inject `agentLoop` cụ thể**: bị bác bỏ. Việc tạo, khôi phục, quan sát khi rảnh rỗi và giải phóng agent là các thao tác sở hữu cấp giao diện trên `dsh-agent`; plugin UI không cần phụ thuộc vào ngoại lệ quy tắc.

**Thực thi bash qua ACP `terminal/*`**: bị bác bỏ. Cách này sẽ chuyển việc thực thi ra ngoài harness, bỏ qua sandbox, làm sạch credential, quyền sở hữu tác vụ, phân giải cwd và log phiên. Metadata terminal chỉ dùng để hiển thị.

**Biểu diễn preset quyền dưới dạng ACP session mode**: bị bác bỏ. Bảng preset do deployment định nghĩa đã là một config-option select, còn session mode là giao diện di sản mà ACP v2 dự định loại bỏ.

**Chiếm quyền stdout theo kiểu phòng thủ**: bị bác bỏ. Monkey-patching cấp tiến trình vượt ngoài quyền sở hữu side-effect của Cordis, và cạnh tranh với kênh truyền tải giao thức. Tầng lắp ráp ứng dụng sở hữu tính sạch của stdout.

## Hệ quả

Editor có thể tạo, load, gửi prompt, hủy, render, hỏi, và cấu hình lại nhiều phiên harness qua một kết nối ACP duy nhất, không phụ thuộc vào cài đặt vòng lặp cụ thể nào. Log sự kiện phiên vẫn là nguồn sự thật lâu dài cho việc replay, chốt kết quả prompt, cwd và cấu hình theo từng phiên. Việc hiển thị tool và kênh trả lời của con người vẫn là hợp đồng plugin có thể mở rộng, không phải hành vi riêng của ACP.

Lớp cầu nối có chủ đích không triển khai khả năng liệt kê/xóa/khôi phục/đóng phiên, chuyển tiếp MCP, thư mục đính kèm, prompt cho tài nguyên hình ảnh/âm thanh/nhúng, plan, slash command, cập nhật mức sử dụng, ủy quyền filesystem cho editor, hay tiểu giao thức thực thi terminal của ACP. Việc chọn model runtime đã được bổ sung sau đó thông qua tùy chọn cấu hình phiên chuẩn, xem [Agent Note về danh mục LLM và lựa chọn ACP](../architecture/2026-07-15-llm-model-catalog-and-acp-selection.md).

Lựa chọn cấu hình lúc rảnh rỗi là thật trong phản hồi thời gian thực, nhưng không có tính bền vững cho đến khi được neo vào turn mở tại lần `agent/prompt-submit` tiếp theo. Crash trước ranh giới đó sẽ làm mất lựa chọn đang chờ xử lý; đây là cái giá để giữ sự kiện phiên khép kín trong turn và an toàn khi replay.

## Kiểm chứng

Bộ test ACP bao phủ codec giao thức trong bộ nhớ, việc replay khi tạo/load, chốt kết quả prompt chính xác, cuộc đua khi hủy (cancel race), nội dung không hỗ trợ, hiển thị tool, fallback khả năng terminal, ánh xạ kết quả quyền, xác thực và lưu trữ config-option, cách ly nhiều phiên, dừng hoàn toàn sau khi ngắt kết nối/giải phóng, và dọn dẹp HMR (hot module replacement). Snapshot test và built-bin test xác thực tầng lắp ráp ứng dụng, e2e test dùng API thật sẽ tự động bỏ qua khi không có key.
