# Agent Note: Thực thi hướng mục tiêu ở tầng Harness

Status: implemented

[English](2026-07-16-harness-level-loop.md) | 中文

## Vấn đề

Agent loop (vòng lặp agent) cụ thể chỉ sở hữu duy nhất một lượt: nó rút cạn phần input đã được tiếp nhận, thực thi một hoặc nhiều bước model và tool, rồi dừng lại. Các mục tiêu lớn thường cần một chính sách ở lớp ngoài để bắt đầu một lượt khác, giữ lại tiến độ, dừng khi chạm trần ngân sách, và giúp con người hiểu được trạng thái của nó. Prompt định kỳ, việc tiếp tục trong cùng session, và các lần thử Ralph với agent hoàn toàn mới đều lặp lại công việc, nhưng chúng không chia sẻ cùng trạng thái, quyền hạn, ký ức hay vòng đời.

Nếu gọi mọi hành động lặp lại là một «loop» dùng chung, ta sẽ che lấp những khác biệt đó. Công việc trong cùng session phải lưu bền mục tiêu của con người trong transcript (bản ghi văn bản) hiện có, đồng thời giữ lại ngữ cảnh hội thoại. Công việc kiểu Ralph phải chủ ý loại bỏ ngữ cảnh hội thoại, chỉ dùng workspace và một bản bàn giao có biên. Trạng thái hướng tới con người không được ngụ ý rằng chỉ cần mở lại session là ngầm cấp quyền cho thêm công việc. Các tuyên bố hoàn thành và bị chặn cũng cần một ranh giới tin cậy tường minh, chứ không thể được lén đưa vào bên trong trừu tượng của bộ lập lịch.

Vì vậy, repo này cần thực thi hướng mục tiêu nằm trên loop lượt/bước, nhưng không cần một dịch vụ loop dùng chung mang tính suy đoán, gộp chung lưu bền, đánh giá, ngân sách, lập lịch, bàn giao, tác vụ nền và UI vào một chỗ.

## Quyết định

Hai chính sách plugin tường minh, xây dựng trên các seam sẵn có:

1. **Mục tiêu trong cùng session** giữ một mục tiêu bền vững trong session hiện tại, và chỉ tiếp nhận các lượt tiếp diễn có quy thuộc mục tiêu khi trạng thái kích hoạt thời gian thực đang bật.
2. **Lần chạy Ralph với agent hoàn toàn mới** thực thi một workflow cố định ở tiền cảnh, trong đó mỗi Round sinh ra một sub agent có cấu trúc hoàn toàn mới, không mang theo hạt giống hội thoại.

Trong hệ thống không có họ package `packages/loop/`, không có `LoopDriver`, `LoopId`, `StopCondition` dùng chung, cũng không có tool `loop` dùng chung hướng tới model. Hai chính sách này dùng chung các điểm mở rộng agent, session, tool, workflow, subagent và UI thông thường của repo, nhưng không giả vờ rằng một vòng đời duy nhất có thể vừa vặn cho cả hai.

### Từ vựng và ranh giới chính sách

Phân cấp trong cùng session là **Goal → Goal Round → lượt → bước**. Một Goal Round là một chu kỳ tiếp diễn được tiếp nhận cho mục tiêu hiện tại, và được hiện thực hóa thành một lượt có nguồn gốc từ mục tiêu. Các lượt của con người hoặc các lượt không liên quan trong cùng session không tiêu tốn hạn mức Goal Round, còn một lượt vẫn có thể chứa nhiều bước model/tool.

Phân cấp với agent hoàn toàn mới là **Ralph Run → Ralph Round → lượt sub agent hoàn toàn mới → bước**. Một Ralph Round tạo ra một sub session. Cả transcript cha lẫn các transcript con trước đó đều không phải ngữ cảnh hạt giống; workspace dùng chung và một báo cáo có cấu trúc, có biên sẽ mang trạng thái xuyên các Round.

Do đó, «Round» là một vòng lặp chính sách ở lớp ngoài, không phải từ đồng nghĩa với mỗi lượt session. `dsh-agent-loop` cụ thể vẫn là engine lượt/bước. Driver trong cùng session dùng các sự kiện agent và session công khai; thứ duy nhất nó thêm vào core là thông báo quan sát trước khi hủy dùng chung `agent/cancel-requested`, mà bất kỳ chính sách vòng đời nào cần hội tụ hủy một cách an toàn đều có thể dùng.

`/loop` dựa trên thời gian hoặc thực thi định kỳ là chính sách thứ ba, và quyết định này không hiện thực hóa nó. Nó nên thuộc về bộ lập lịch, chứ không thuộc bất kỳ họ package mục tiêu nào.

### Cấu trúc package và các động từ sở hữu

| Package | Phân loại trong repo | Cấu trúc và động từ sở hữu |
|---|---|---|
| `@deepseek-ai/dsh-goal` | `packages/goal/goal/`, dịch vụ miền | Sở hữu `GoalId`, so sánh và hoán đổi `GoalRef`, `GoalSnapshot`, `GoalPhase` bốn trạng thái, `GoalBlockReason` có cấu trúc, `GoalActivation` cục bộ trong tiến trình, việc gấp lại khi replay, cùng các động từ `get`, `create`, `edit`, `pause`, `resume`, `complete`, `block`, `clear` và `disarm`. |
| `@deepseek-ai/dsh-tool-goal` | `packages/goal/tool-goal/`, bên tiêu thụ hướng tới model | Đăng ký `get_goal`, `create_goal` và `update_goal` loại trừ lẫn nhau; yêu cầu trong lượt root agent thời gian thực phải có một tin nhắn do con người gửi trực tiếp, và thu hẹp quyền của Round tự trị xuống còn báo cáo hoàn thành hoặc bị chặn kèm mã lý do máy có thể định tuyến. |
| `@deepseek-ai/dsh-goal-round-driver` | `packages/goal/goal-round-driver/`, chính sách tiếp diễn | Đặt chỗ, dựng hàng rào, tiếp nhận, quy thuộc, kết toán, hủy và rút cạn Goal Round trong cùng session cho tới khi dừng hẳn hoàn toàn, mà không import loop cụ thể. |
| `@deepseek-ai/dsh-commands` | `packages/interaction/commands/`, registry UI | Sở hữu `CommandDefinition` cho các lệnh dành riêng cho con người, việc khám phá, đăng ký theo phạm vi, phân phối trực tiếp, `CommandResult` và yêu cầu hủy. |
| `@deepseek-ai/dsh-command-goal` | `packages/goal/command-goal/`, bên sản xuất lệnh cho con người | Đăng ký cho TUI các thao tác `/goal` trạng thái, tạo, sửa, tạm dừng, tiếp tục và xóa, xây trên miền mục tiêu. |
| `@deepseek-ai/dsh-tool-ralph` | `packages/workflow/tool-ralph/`, bên tiêu thụ workflow cố định | Đăng ký `ralph({ objective, maxRounds? })`, xác thực provider có cấu trúc hoàn toàn mới và `RalphRoundReport` có biên, rồi trả về `complete`, `blocked` hoặc `budget-limited`. |

Xem các quy ước chi tiết tại các Agent Note [miền mục tiêu](2026-07-19-persisted-same-session-goal-domain.md), [sự kiện do mục tiêu sở hữu](../architecture/2026-07-31-goal-owned-durable-events.md), [tool mục tiêu hướng tới model](2026-07-19-model-facing-goal-tools.md), [driver Goal Round](2026-07-19-same-session-goal-round-driver.md), [registry lệnh](2026-07-19-plugin-command-registration.md), [lệnh mục tiêu cho con người](2026-07-19-human-goal-command.md) và [tool workflow Ralph](2026-07-19-fresh-agent-ralph-workflow-tool.md).

### Trạng thái mục tiêu bền vững và quyền thời gian thực

Một session có nhiều nhất một mục tiêu hiện hành. Mỗi thay đổi đều được commit qua sự kiện bền vững `goal/change`; sự kiện đó mang theo snapshot đầy đủ có gắn phiên bản, hoặc một bia mộ xóa có số revision, và trạng thái hộp thư đến không tham gia vào đó. Session log là nguồn sự thật bền vững duy nhất, nên việc lưu bền, khôi phục và `SessionStore.fork()` thông thường sẽ mang theo mục tiêu, không cần cơ sở dữ liệu thứ hai hay bản ghi hủy nhân tạo.

Các phase bền vững chỉ gồm `active`, `paused`, `blocked` và `complete`. Mục tiêu bị chặn bắt buộc mang theo `GoalBlockReason`, trong đó có `code` kebab-case chữ thường ổn định và `message` khác rỗng, con người đọc được; giới hạn sử dụng, cạn Round, model thất bại và chính sách từ chối đều là mã lý do, chứ không phải phase vòng đời bổ sung. Trạng thái kích hoạt độc lập là `armed` hoặc `disarmed`, và không bao giờ được lưu bền. Việc tạo và tiếp tục tường minh sẽ kích hoạt mục tiêu; các chuyển đổi dừng, khởi động session, replay khi fork, thay thế driver và tháo dỡ driver đều để mục tiêu ở trạng thái chưa kích hoạt.

Sự tách bạch này khiến việc khôi phục session vừa quan sát được vừa hợp trực giác. Mở lại session không bao giờ tự khởi động công việc mục tiêu. Prompt tiếp theo của con người, ví dụ «tiếp tục», «khôi phục mục tiêu» hoặc yêu cầu tương đương trong bất kỳ ngôn ngữ nào, sẽ cấp cho model của root agent đang chạy một lượt mới; trong lượt đó, model có thể đọc mục tiêu và gọi `update_goal(..., action: 'resume')`. `/goal resume` là đường lệnh trực tiếp của con người. Yêu cầu xác thực lúc chạy đến từ một lượt trực tiếp của con người theo thời gian thực; chính sách prompt để model diễn giải liệu cách diễn đạt có ngữ nghĩa cấp quyền tạo hay tiếp tục hay không.

Session fork sẽ kế thừa tiền tố mục tiêu bền vững, vì đó là kết quả replay tự nhiên. Fork bắt đầu ở trạng thái chưa kích hoạt, nên kế thừa không đồng nghĩa với quyền thực thi, và trong lịch sử cũng không chèn bản ghi hủy mục tiêu tổng hợp.

`defaultMaxGoalRounds` có thể cấu hình và mặc định là `256`. Hạn mức này chỉ tính các Goal Round đã được tiếp nhận. `blockedAfterConsecutiveRounds` được cấu hình riêng trong chính sách tool của model và mặc định là `3`; nó chỉ là cận dưới máy móc trước khi Round tự trị báo cáo bị chặn lặp lại, chứ không phải một bộ đánh giá mức độ tương đồng ngữ nghĩa.

### Tiếp diễn trong cùng session

Driver Goal Round sở hữu nhiều nhất một đặt chỗ đang chờ cho mỗi agent thời gian thực cụ thể. Nó chỉ tiếp nhận đặt chỗ khi mục tiêu đang hoạt động và đã kích hoạt, agent đang rảnh, không tồn tại công việc cạnh tranh của con người, thay đổi mới nhất đã qua checkpoint kiểm tra tính bền vững, id mục tiêu / số revision / Round chính xác vẫn khớp, và chính sách trước bước ở hạ nguồn chấp nhận. Hàng rào `agent/pre-step` của nó sẽ kiểm tra những sự kiện đó cả trước lẫn sau các listener hạ nguồn, ngăn việc chỉnh sửa, tạm dừng, tin nhắn con người hoặc gỡ tải cạnh tranh khiến công việc lỗi thời bị tiếp nhận.

Chỉ những `user/message` đã được tiếp nhận, có Round dương và có nguồn gốc mục tiêu mới được tính vào một Round. Đặt chỗ cũ sẽ kết thúc một lượt bị chặn không có bước nào và không tiêu tốn hạn mức. Revision mục tiêu chạy song song sẽ thắng việc kết toán của Round cũ.

Sau khi một lượt thông thường hoàn tất, chỉ khi mục tiêu vẫn hoạt động, đã kích hoạt và còn dưới hạn mức thì mới lên lịch một Round khác. Hủy sẽ tạm dừng. Giới hạn tốc độ hoặc cạn hạn ngạch sẽ chặn với mã `usage-limited`; cạn hạn mức dùng `round-limit`; hàng đợi thất bại dùng `queue-failed`; lỗi lượt, dừng do max-token, chính sách từ chối và kết quả kết thúc không xác định dùng các mã chặn tương ứng. Plugin khôi phục yêu cầu, được kết hợp độc lập, có thể thử lại các lỗi provider tạm thời trong cùng một lượt; driver mục tiêu không bao giờ tự ý phát động một Round khác sau một kết quả kết thúc bất thường. Sau đó con người có thể cấp quyền tiếp tục bằng ngôn ngữ thông thường hoặc `/goal resume`.

### Tương tác giữa con người và model

UX cho con người theo hình thái gọn nhẹ trong [trình phân phối TUI công khai của OpenAI Codex tại commit `678157a`](https://github.com/openai/codex/blob/678157acaa819d5510adfe359abb5d0392cfe461/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L750-L805): `/goal` hiển thị trạng thái, `/goal <objective>` tạo mục tiêu, còn `edit`, `pause`, `resume` hoặc `clear` thực hiện thao tác vòng đời trực tiếp. Permalink tới commit đó giúp cú pháp thu được từ nghiên cứu vẫn kiểm chứng được khi Codex tiến hóa. Trạng thái bao gồm phase bền vững, số Round đã tiếp nhận/hạn mức, và trạng thái đã kích hoạt/chưa kích hoạt theo thời gian thực. Trạng thái trực tiếp và output lệnh không đi vào lịch sử của model; các thay đổi miền đã được chấp nhận vẫn tái dựng được, vì dịch vụ mục tiêu ghi lại chúng.

Model chỉ nhận `get_goal`, `create_goal` và `update_goal`. Khi yêu cầu trực tiếp của con người rõ ràng đòi hỏi khối lượng công việc nhiều Round, model có thể tạo mục tiêu, và có thể suy ra ý định đó từ bất kỳ ngôn ngữ nào. Nó không được biến công việc một lượt thường ngày thành mục tiêu. Code yêu cầu trong lượt root agent thời gian thực hiện tại phải có một tin nhắn do con người gửi trực tiếp; việc diễn giải ngữ nghĩa vẫn là phán đoán của model. Round mục tiêu tự trị có thể báo cáo `complete` hoặc `blocked` cho đúng Goal Round hiện tại, nhưng không được sửa, tạm dừng, tiếp tục hay thay thế mục tiêu của con người.

TUI mặc định mount registry lệnh dùng chung và toàn bộ stack mục tiêu, và phơi bày `/goal` qua một bên sản xuất. ACP (Agent Client Protocol) mount miền mục tiêu, tool của model và driver trong cùng session, nhưng chủ ý bỏ qua mặt phẳng lệnh cho con người. Mọi lệnh hợp lệ đã đăng ký đều có thể được mọi command adapter đã kết hợp khám phá và gọi; nếu một plugin không tương thích với một ứng dụng nào đó, tổ hợp của ứng dụng đó sẽ bỏ qua bên sản xuất lệnh, thay vì dựa vào việc che mặt ở tầng registry. Trục agent không có UI đòi hỏi phải chọn tham gia tường minh, để một bên gọi đơn lẻ không âm thầm biến thành thao tác nhiều Round. Các điểm vào chạy CLI (giao diện dòng lệnh) headless và JSON-RPC không tiêu thụ mặt phẳng lệnh; sau khi mount stack mục tiêu, văn bản thông thường của con người vẫn có thể cấp quyền cho tool mục tiêu của model.

### Thực thi Ralph với agent hoàn toàn mới

Ralph là một tool model hạng nhất nằm trong plugin riêng, cho thấy chính sách thực thi cố định phức tạp có thể được kết hợp mà không cần một core loop mới. Plugin này sở hữu một kịch bản workflow cố định xây trên `ctx.workflowEngine` và `ctx.subagents`; nó không tạo trạng thái mục tiêu session, cũng không thêm nhánh nào cho `dsh-agent-loop`.

Mỗi Round dùng `WorkflowStartRequest.subagentProvider` tường minh, mặc định là `spawn`. Provider đó phải tồn tại, hỗ trợ output có cấu trúc, và khai báo rằng nó không kế thừa ngữ cảnh cha. Ralph còn truyền hạn mức Round đã phân giải làm `WorkflowStartRequest.maxTotalAgents`; engine luồng công việc sẽ xác thực hai chính sách theo mỗi lần chạy trước khi phát hành công việc, nên provider cấu hình sai hoặc hạn mức engine thấp hơn quy mô Ralph được yêu cầu sẽ thất bại trước khi tạo lần chạy. Sub agent kế thừa cwd và phả hệ, nhưng chỉ nhận mục tiêu bất biến, Round/hạn mức hiện tại, chỉ dẫn lấy workspace làm thẩm quyền, và bản báo cáo chuẩn hóa trước đó.

Báo cáo bao gồm trạng thái, tóm tắt, bằng chứng, bước kế tiếp và văn bản mô tả điểm chặn. Cả bên trong kịch bản cố định lẫn ranh giới bên tiêu thụ đều xác thực các bất biến riêng theo trạng thái và kích thước tuần tự hóa. `maxRounds` có thể cấu hình, mặc định `256`, và đóng vai trò cận trên cho giá trị ghi đè khi gọi. `maxHandoffChars` mặc định `16384`; báo cáo quá lớn sẽ thất bại, chứ không bị cắt bớt âm thầm. `maxResultChars` mặc định riêng là `16384`, và giới hạn toàn bộ văn bản thành công hướng tới cấp cha, bao gồm cả văn bản lớp ngoài và dấu cắt bớt.

Sub agent thất bại thông thường sẽ kết thúc lần chạy và không thử lại. Kịch bản cố định sẽ báo cáo Round thất bại, và mang về bản bàn giao thành công trước đó nếu có; tool trả trạng thái đó dưới dạng lỗi, chứ không nhầm thành báo cáo dị dạng hay cạn ngân sách. Lỗi hạ tầng workflow chí mạng có thể kết toán trước khi kịch bản trả về trạng thái đó; việc truyền tải lý do phong phú hơn và chính sách thử lại đều được hoãn lại.

Tool này nằm ở tiền cảnh và chỉ tồn tại trong tiến trình. Lệnh gọi tool ở cấp cha sẽ chờ kết quả kết thúc, lan truyền việc hủy tới engine luồng công việc, và chờ `run.dispose()`, nên công việc con đã dừng hẳn hoàn toàn trước khi trả về. Model chỉ thấy một lần gọi, cùng một kết quả kết thúc thành công có biên hoặc một lỗi; văn bản lớp ngoài cho trường hợp hoàn thành và bị chặn sẽ nêu rõ rằng kết quả do worker báo cáo, chứ không trình bày như một chứng nhận độc lập. Hội thoại của sub agent trung gian không đi vào transcript cha.

### Phả hệ thiết kế bên ngoài

Codex cung cấp UX mục tiêu tối thiểu, quan sát được, được áp dụng ở đây: một mục tiêu bền vững gắn vào cuộc chat, cùng các điều khiển đặt, xem, sửa, tạm dừng, tiếp tục và xóa. Bản hiện thực này tiếp nhận khả năng khám phá đó, nhưng dùng bản ghi mục tiêu theo event sourcing, phạm vi plugin và kiểm tra quyền lúc chạy của repo này.

[Claude Code goals](https://code.claude.com/docs/en/goal) hiện tại càng xác nhận thêm sự khác biệt giữa «mục tiêu khởi động lượt kế tiếp sau lượt trước» và `/loop` định kỳ. Claude Code còn dùng một bộ đánh giá bằng model nhỏ độc lập sau mỗi lượt. Bản hiện thực này tiếp nhận sự phân biệt chính sách, nhưng chủ ý không sao chép bộ đánh giá đó: input của bộ đánh giá, quyền truy cập tool, kiểm tra tất định, lựa chọn provider, cách ly và quyền hạn đòi hỏi các quy ước plugin được thiết kế riêng, chứ không phải một tầng tự chứng nhận ngầm.

Sản phẩm bên ngoài chỉ là đối tượng so sánh, không phải mục tiêu tương thích. Việc nghiên cứu mã nguồn cục bộ giúp xác định ranh giới, còn giao diện bàn giao thì tuân theo các quy tắc của repo này: «mọi thứ đều là plugin», mọi nội dung model nhìn thấy đều được ghi log, giá trị mặc định được phân giải tường minh, và tháo dỡ sau khi dừng hẳn hoàn toàn.

### Kiểm chứng

Sáu Agent Note sở hữu tương ứng đã ghi lại độ bao phủ ở mức unit, tích hợp, tiến trình, snapshot, hủy, replay và runtime sau khi build. Stack này kiểm chứng việc gấp bản ghi mục tiêu nghiêm ngặt, cạnh tranh so sánh-và-hoán-đổi, kế thừa khi fork session, trạng thái chưa kích hoạt sau khi khôi phục, quyền trực tiếp của con người bằng ngôn ngữ tự nhiên, hạn mức và ngưỡng chặn có thể cấu hình, quy thuộc Goal Round chính xác, khám phá lệnh theo phạm vi adapter và cách ly transcript. Các snapshot không cần khóa đã phát hành bao phủ việc tạo/kiểm tra mục tiêu của model qua ứng dụng headless, việc thực thi vòng đời nhiều Round trong cùng session và hủy qua ACP, cùng việc thực thi hai Ralph Round thật qua ứng dụng headless; các test lệnh tập trung cố định trạng thái `/goal` trực tiếp mà không cần lượt model. Snapshot Ralph sẽ khởi động engine luồng công việc, provider spawn, runtime output có cấu trúc và agent loop, sau đó kiểm tra các log con khác biệt nhau và không có hạt giống cùng bản bàn giao một chiều có biên chính xác, đồng thời cố định luồng sự kiện ở cấp cha. Test stack thật tập trung còn bao phủ kết quả hoàn thành, bị chặn và chạm hạn mức Round, báo cáo dị dạng và quá lớn, sub agent thất bại thông thường có giữ lại bản bàn giao hợp lệ trước đó, các sự kiện phase đơn lẻ, và việc sub agent dừng hẳn hoàn toàn sau khi hủy. Mã nguồn package tiếp tục chịu ràng buộc của cổng bao phủ 100% theo từng file của repo, còn test binary sau khi build bao phủ việc phân giải sản phẩm đã cài đặt. Kinh nghiệm hiện thực đã được ghi vào chính sách test gốc: mọi thay đổi không tầm thường mà model hoặc con người nhìn thấy đều phải mang theo snapshot không cần khóa từ ví dụ thật trong cùng PR (Pull Request), chứ không thể dựa vào độ bao phủ chỉ ở mức package hoặc chỉ dùng fixture (dữ liệu chuẩn bị cho test) mock.

## Các phương án đã cân nhắc

- **Hiện thực hóa một năng lực loop dùng chung nguyên bản** — không áp dụng, vì `Evaluator`, `BudgetPolicy`, `RoundHandoff`, `GoalReflector`, quyền sở hữu tác vụ nền, lưu bền và lập lịch không tạo thành một trừu tượng bắt buộc nhất quán. Xây dựng toàn bộ trước khi có bên tiêu thụ cụ thể đầu tiên sẽ sinh ra giao diện rộng, mang tính suy đoán, và lặp lại các cơ chế session, workflow, subagent cùng task sẵn có.
- **Chỉ hiện thực mục tiêu trong cùng session** — không áp dụng, vì việc lặp với ngữ cảnh hoàn toàn mới khác biệt về bản chất, và cũng là minh chứng quan trọng cho kiến trúc plugin. Ralph nên là bên tiêu thụ workflow cố định với việc reset ngữ cảnh tường minh.
- **Đặt Ralph vào driver Goal Round** — không áp dụng, vì mục tiêu trong cùng session chủ ý giữ lại một đoạn hội thoại, còn Ralph thì chủ ý loại bỏ hội thoại. Gộp cả hai sẽ làm mờ nhòe trạng thái kích hoạt, replay, bàn giao và UI.
- **Coi fork là sub agent Ralph hoàn toàn mới** — không áp dụng, vì fork mang theo tiền tố hội thoại. Sub agent hoàn toàn mới cộng với trạng thái workspace và một báo cáo tường minh thì dễ giới hạn và replay hơn, đồng thời không cần bản ghi hủy tổng hợp.
- **Sao chép bộ đánh giá của Claude Code vào bản hiện thực mục tiêu đầu tiên** — không áp dụng, vì bộ đánh giá bằng model chỉ đọc transcript là một chính sách hữu ích, nhưng không phải chứng chỉ hoàn thành đáng tin cậy phổ quát. Hệ thống vẫn phải hỗ trợ được đánh giá tất định và cách ly, nên bộ đánh giá được hoãn lại cho tới khi quyền hạn và quy ước provider của nó được thiết kế xong.
- **Tự động tiếp diễn sau khi khôi phục session** — không áp dụng, vì mở session là hành vi quan sát, không phải quyền tiêu tốn tài nguyên. Hệ thống khôi phục trạng thái bền vững, còn trạng thái kích hoạt thì chờ prompt mới của con người.
- **Định tuyến `/goal` qua model** — không áp dụng, vì trạng thái và điều khiển vòng đời tường minh nên là thao tác UI tất định, tốn không token; prompt ngôn ngữ tự nhiên thông thường vẫn là đường ngữ nghĩa của model.
- **Thêm chế độ mục tiêu hoặc Ralph cho agent loop cụ thể** — không áp dụng, vì các seam hàng đợi, prompt, session, hủy, workflow và subagent công khai đã hỗ trợ được cả hai chính sách. Quan sát cancel-requested dùng chung là bổ sung phối hợp duy nhất ở core.

## Hệ quả

- Thực thi hướng mục tiêu được bàn giao mà không cần một đối tượng «loop» quá tải duy nhất: việc tiếp diễn trong cùng session và việc lặp với agent hoàn toàn mới có các quy ước tường minh, kiểm thử được độc lập.
- Lịch sử mục tiêu bền vững có thể replay và fork, còn trạng thái kích hoạt cục bộ trong tiến trình ngăn việc vô tình bắt đầu công việc khi khôi phục.
- Con người nhận được UX nhỏ gọn theo hình thái Codex; model nhận được một bộ tool gọn, trong đó các thao tác sửa đổi đòi hỏi trong lượt root agent thời gian thực hiện tại phải có một tin nhắn do con người gửi trực tiếp; các bản triển khai có thể gỡ bỏ độc lập từng năng lực.
- Ralph cho thấy chính sách cố định không tầm thường có thể được hiện thực hoàn toàn dưới dạng plugin nằm trên các nguyên thủy workflow và subagent sẵn có.
- Hạn mức Round mặc định rộng rãi, nhưng vẫn do bên triển khai kiểm soát. Nó giới hạn số lần lặp, chứ không giới hạn token, giá tiền, thời gian tiêu tốn hay tác dụng phụ bên ngoài.
- Bộ đánh giá, ngân sách, bộ phản tư, tác vụ nền, CLI và kiến trúc loop-session dùng chung trong đề xuất ban đầu chủ ý không đi vào API công khai đã hiện thực.

## Giới hạn đã biết và các hạng mục tạm hoãn

- **Đánh giá độc lập** — cả trạng thái hoàn thành/bị chặn trong cùng session lẫn trạng thái kết thúc của Ralph đều là tuyên bố của model hoặc worker. Bộ đánh giá độc lập, Round phản hồi do bộ đánh giá dẫn dắt, chứng chỉ hoàn thành, bộ kiểm tra tất định, verifier đối kháng và các quy ước tiêu chuẩn/bộ thực thi/cách ly đều được hoãn lại.
- **Ngân sách tổng hợp** — `maxGoalRounds` và `maxRounds` của Ralph là những giới hạn khối lượng công việc tổng hợp duy nhất. Không tồn tại chính sách kiểm soát vào cho token, tiền tệ, thời gian tiêu tốn, mức dùng provider hay giá theo từng Round.
- **Không có runner tự trị bền vững** — các sự kiện mục tiêu trong cùng session được lưu bền, nhưng việc kích hoạt và lập lịch chỉ tồn tại trong tiến trình, và chủ ý chờ input của con người sau khi khôi phục. Ralph nằm ở tiền cảnh, và không thể khôi phục sau khi mất tiến trình. Việc thu thập ở nền, khôi phục sau khi khởi động lại và thực thi thường trú không người giám sát đều được hoãn lại.
- **Không có bộ lập lịch theo thời gian** — `/loop` theo khoảng thời gian, cron, bảo trì chủ động, cùng lập lịch trên cloud hoặc desktop đều nằm ngoài phạm vi quyết định này.
- **Không có log loop dùng chung hay khôi phục thế giới thực thi** — replay session sẽ tái dựng lịch sử mục tiêu, nhưng không khôi phục file, tiến trình, môi trường, credential hay tác dụng phụ bên ngoài trước đó. Ralph lấy workspace hiện tại làm thẩm quyền, và không có log xuyên các lần chạy.
- **Không có bộ phản tư mục tiêu** — sự kiện concern, heuristic tự động phát hiện không tiến triển, việc sửa đổi mục tiêu do bộ phản tư độc lập thực hiện, phát hiện mẫu bị kẹt và `loop_split` đều chưa được hiện thực. Con người có thể trực tiếp sửa, tạm dừng, xóa hoặc tiếp tục mục tiêu.
- **Chính sách Ralph vẫn còn hẹp** — mỗi Round tạo một sub agent hoàn toàn mới; việc fan-out trong một Round, tách vai trò bộ đánh giá/worker, chọn provider/model động và cấm gọi đệ quy tool Ralph ở mức cấu trúc đều cần API chính sách riêng. Chỉ dẫn trong prompt không phải là cưỡng chế thực thi.
- **Ralph không thử lại sub agent thất bại** — thất bại thông thường sẽ giữ lại Round thất bại và bản bàn giao hợp lệ trước đó, còn lỗi hạ tầng workflow chí mạng có thể kết thúc trước khi trạng thái đó khả dụng. Số lần thử lại, backoff và việc truyền tải thất bại phong phú hơn cần thiết kế chính sách và ranh giới riêng.
- **UI khả chuyển vẫn còn mộc mạc** — TUI render trạng thái mục tiêu dạng văn bản thuần và thẻ Ralph dùng chung. ACP chỉ chuyển tải văn bản trợ lý đã commit; hệ thống không có thành phần trạng thái liên tục, output lệnh có thể kết nối lại, hay trình soạn mục tiêu dạng modal, và ACP, CLI headless cùng JSON-RPC cũng không có mặt phẳng lệnh.
