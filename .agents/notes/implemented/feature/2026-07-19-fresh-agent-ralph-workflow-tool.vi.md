# Agent Note: Tool workflow Ralph dùng agent hoàn toàn mới

Status: implemented

[English](2026-07-19-fresh-agent-ralph-workflow-tool.md) | 中文

## Vấn đề

Mục tiêu cùng phiên (same-session goal) giữ lại hội thoại, để một agent (tác tử) tiếp tục hoàn thành mục tiêu bền vững; còn tool workflow tổng quát để model viết script điều phối dạng fan-out. Cả hai đều không phải mẫu hình Ralph: giao lặp lại cùng một mục tiêu cho một worker hoàn toàn mới mỗi lần, dùng workspace dùng chung làm bộ nhớ dài hạn, và chỉ truyền một bản bàn giao (handoff) nhỏ, tường minh giữa các Round, cho đến khi công việc hoàn thành hoặc chạm giới hạn.

Nếu thêm hành vi Ralph vào `dsh-agent-loop`, goal driver, hoặc ngôn ngữ workflow công khai hướng tới model, sẽ khiến một chính sách bị ràng buộc với cơ chế thực thi không liên quan. Để mỗi sub-agent kế thừa hội thoại cha cũng sẽ phá vỡ việc reset ngữ cảnh, và khiến việc replay phụ thuộc vào một tiền tố ngầm định ngày càng phình to. Tính năng này cần một chính sách cố định, có thể review được, tổ hợp từ các nguyên hàm plugin hiện có, đồng thời đảm bảo dừng hẳn hoàn toàn sau khi hủy, dữ liệu xuyên Round có giới hạn, giới hạn trên rộng rãi và có thể cấu hình, và không đưa vào trạng thái mục tiêu hướng-người-dùng mới.

## Quyết định

Thêm package tiêu thụ (consumer) độc lập `@deepseek-ai/dsh-tool-ralph` dưới `packages/workflow/`. Nó đăng ký `ralph({ objective, maxRounds? })`, có script workflow cố định, và chỉ phụ thuộc vào `ctx.tools`, `ctx.systemPrompt`, `ctx.workflowEngine` và `ctx.subagents`. Việc chạy Ralph không phải mục tiêu phiên, không tạo trạng thái mục tiêu, và không yêu cầu thêm nhánh trong agent loop cụ thể.

Tool này chỉ chạy ở foreground. Agent gọi đóng vai trò cha cho mỗi sub-agent để cung cấp cwd và phả hệ (lineage), lời gọi tool cha chờ toàn bộ lần chạy kết thúc, tín hiệu hủy của bước cha sẽ hủy workflow. Mỗi đường đi đều chờ `run.dispose()`, do đó trước khi lời gọi trả về, việc hủy sẽ trải qua sự hội tụ có giới hạn của worker thread engine và khiến sub-agent dừng hẳn hoàn toàn.

### Định tuyến bên cung cấp workflow theo từng lần chạy

`WorkflowStartRequest` có thêm `subagentProvider` tùy chọn. Worker thread engine giải quyết giá trị tường minh theo từng lần chạy này trước, rồi mới fallback về bên cung cấp đã cấu hình cho engine; trước khi publish lần chạy, nó yêu cầu tuyến đường đã chuẩn hóa được chọn phải đã đăng ký, và dùng kết quả cho mỗi lời gọi `agent()`. Script không thể quan sát hay thay thế tuyến đường này. Tool `workflow` thông thường không đặt trường này, cũng không expose tham số model mới, do đó hành vi workflow tổng quát và chính sách bên cung cấp giữ nguyên không đổi.

`subagentProvider` của plugin Ralph mặc định là `spawn`. Trước mỗi lời gọi, nó yêu cầu bên cung cấp có tên đã tồn tại, hỗ trợ output có cấu trúc và báo cáo `inheritsParentContext: false`; các bên cung cấp kiểu fork hoặc thiếu năng lực sẽ báo lỗi rõ ràng trước khi workflow khởi động. Việc tra cứu bên cung cấp được giữ lại trong thời gian lời gọi, vì đăng ký bên cung cấp trong phạm vi effect có thể thay đổi qua HMR (hot module replacement).

### Giới hạn sub-agent workflow theo từng lần chạy

`WorkflowStartRequest` cũng thêm `maxTotalAgents` tùy chọn. Worker thread engine yêu cầu nó là số nguyên an toàn dương và không cao hơn giới hạn triển khai đã cấu hình, và nạp giá trị đã giải quyết vào giới hạn worker thread của lần chạy đó trước khi publish. Ralph dùng `maxRounds` đã giải quyết làm giới hạn này, do đó ngân sách Round của vòng lặp cố định sẽ không xung đột với giới hạn dự phòng sub-agent chạy loạn tổng quát. Tool workflow thông thường không đặt trường này và giữ giá trị mặc định của engine.

### Round và bàn giao (handoff) của Ralph

Phân cấp là: lần chạy Ralph → Round Ralph → lượt sub-agent hoàn toàn mới → bước. Mỗi Round Ralph tạo đúng một sub-agent qua bên cung cấp đã chọn. spawn cấp cho sub-agent đó một phiên độc lập không có seed, đồng thời giữ nguyên cwd của cha, do đó cây làm việc dùng chung là nguồn thẩm quyền bền vững, hội thoại cha và lịch sử sub-agent trước đó đều không lọt vào request.

Prompt cố định chỉ truyền mục tiêu bất biến, Round hiện tại và giới hạn, chỉ dẫn lấy workspace làm thẩm quyền, và báo cáo có cấu trúc trước đó. `RalphRoundReport` gồm `status: continue | complete | blocked`, `summary`, `evidence`, `nextSteps` và `blocker`. Chuỗi phải được chuẩn hóa; `continue` yêu cầu có bước tiếp theo và không có mục chặn; `complete` yêu cầu có bằng chứng và không có bước tiếp theo hay mục chặn; `blocked` yêu cầu mục chặn cụ thể. Trước khi báo cáo trở thành bản bàn giao tiếp theo, script kiểm tra ngữ nghĩa và kích thước tuần tự hóa; bên tiêu thụ còn kiểm tra lại giá trị kết thúc đã vật chất hóa một lần nữa qua seam workflow.

`maxRounds` mặc định là `256`, đồng thời cũng là giới hạn triển khai cho giá trị override do lời gọi cung cấp. `maxHandoffChars` và `maxResultChars` đều mặc định là `16384`. Cả ba đều là giá trị cấu hình số nguyên an toàn dương. Bàn giao quá lớn sẽ fail, chứ không bị cắt bớt âm thầm; `maxResultChars` giới hạn riêng văn bản thành công đầy đủ hướng tới cha, bao gồm văn bản bên ngoài và nhãn cắt bớt, và không thay đổi trạng thái xuyên Round. Sau khi Round cuối cùng được phép báo `continue`, script cố định trả về `budget-limited`; `complete` và `blocked` trả về ngay báo cáo cuối cùng cùng số Round đã bắt đầu.

Ngôn ngữ workflow ánh xạ sub-agent kết thúc bình thường nhưng không thành công thành `null`. Script cố định phát hiện giá trị đó trước khi kiểm tra báo cáo, và trả về `round-failed`, kèm Round thất bại, cùng bản bàn giao thành công trước đó nếu có; tool sẽ chuyển nó thành lỗi, thay vì hiểu lầm là báo cáo sai định dạng hoặc hết ngân sách. Ralph không thêm chính sách retry. Lỗi khởi động, truyền tải, worker thread và workflow nghiêm trọng vẫn là lỗi workflow tổng quát, vì các đường này trong seam workflow không mang theo sub-report có thể khôi phục.

### Model và UI

Model chỉ có thể cung cấp `objective` và `maxRounds` tùy chọn; việc chọn bên cung cấp, schema báo cáo, giới hạn bàn giao và script đều do bên triển khai kiểm soát. Đoạn prompt cố định giải thích chỉ dùng `ralph` khi người dùng tương tác trực tiếp yêu cầu rõ ràng Ralph hoặc lặp lại bằng agent hoàn toàn mới, và phân biệt nó với mục tiêu cùng phiên, delegation có giới hạn, và workflow fan-out tổng quát. Đây là hướng dẫn, không phải một máy trạng thái UX mục tiêu mới.

Hiển thị hướng tới người dùng dùng thẻ `ralph` tổng quát, và lấy mục tiêu làm input gốc; ACP (Agent Client Protocol) chỉ mang văn bản trợ lý đã commit. Văn bản bên ngoài cho hoàn thành thành công và bị chặn sẽ giải thích kết quả do worker báo cáo, không trình bày nó như một xác nhận độc lập. Transcript (bản ghi văn bản) phía cha chỉ giữ lại lời gọi tool gốc, cùng một báo cáo kết thúc thành công có giới hạn hoặc một lỗi, không có message sub-agent trung gian. Các tổ hợp headless, TUI và ACP đã phát hành sẽ tải plugin này cạnh workflow engine hiện có; JSON-RPC giữ nguyên, vì tổ hợp mặc định của nó không expose workflow.

## Kiểm thử

Unit test bao phủ việc giải quyết cấu hình và giới hạn lời gọi, từ chối do thiếu năng lực bên cung cấp, định tuyến request khởi động cố định và giới hạn sub-agent, kết quả kết thúc thành công toàn phần, giá trị bên ngoài khi sub-agent thông thường thất bại, giá trị biên sai định dạng và quá lớn, cắt bớt chính xác kết quả thành công, thứ tự hủy, dispose (giải phóng tài nguyên), ý định render, vòng đời prompt và hình dạng plugin theo namespace, đạt độ bao phủ 100% theo từng file. Test workflow engine chứng minh việc định tuyến bên cung cấp được kiểm tra đồng bộ, giới hạn sub-agent theo từng lần chạy có thể thấp hơn giới hạn triển khai, và việc override bên cung cấp chỉ chọn cho từng sub-agent mà không thay đổi giá trị mặc định cấu hình, bao gồm cả `lib/worker.cjs` đã build dưới Node thông thường.

Một integration test không cần key với stack thật điều khiển script cố định qua worker thread engine thật, bên cung cấp spawn, runtime output có cấu trúc và agent loop thật. Nó chứng minh định danh sub-agent khác nhau, không có `seedLength`, kế thừa cwd, cả hai sub-request đều không có nhãn lịch sử cha, báo cáo trước đó chỉ xuất hiện chính xác trong bàn giao của Round tiếp theo, chỉ sinh ra một event giai đoạn, kết thúc hoàn thành và cả hai sub-agent đều đã dispose. Cùng stack thật đó còn bao phủ kết quả bị chặn và hết giới hạn Round, báo cáo chưa chuẩn hóa và ngữ nghĩa không hợp lệ, bàn giao quá lớn, sub-agent thông thường thất bại nhưng vẫn giữ bàn giao hợp lệ trước đó, và sub-agent dừng hẳn hoàn toàn sau khi hủy. Một snapshot headless không cần key đã phát hành còn khởi động tổ hợp `examples/headless-agent` thật, gọi `ralph`, cố định transcript stream phía cha, và kiểm tra sự tồn tại của hai sub-session khác nhau, không có seed trong log bền vững, với bàn giao Round 1 chỉ xuất hiện ở Round 2. Test tool cố định hiển thị lời gọi/kết quả tổng quát, còn snapshot request header replay ACP cố định schema đã phát hành và bề mặt transcript hướng dẫn prompt.

## Các phương án thay thế đã cân nhắc

- **Đặt Ralph vào driver mục tiêu cùng phiên** — Từ chối, vì Goal Round có chủ đích giữ nguyên cùng một đoạn hội thoại, trong khi thuộc tính định nghĩa của Ralph là mỗi Round dùng ngữ cảnh hoàn toàn mới; gộp hai thứ này sẽ khiến vòng đời mục tiêu không thể tách khỏi việc điều phối sub-agent.
- **Expose cờ `fresh` hoặc lặp trên tool workflow tổng quát** — Từ chối, vì API script do model viết nên giữ tính tổng quát và độc lập bên cung cấp; giao thức báo cáo cố định và chính sách dừng của Ralph xứng đáng có một bên tiêu thụ có thể review riêng.
- **Dùng `subagent_fork` để dễ replay** — Từ chối, vì các round đã hoàn thành được kế thừa là trạng thái bàn giao ngầm định, ngày càng phình to, và vi phạm quy ước ngữ cảnh hoàn toàn mới. Workspace cộng một báo cáo có cấu trúc đã đủ để replay, không cần chèn bản ghi hủy nhân tạo.
- **Để tool gọi trực tiếp seam subagent** — Từ chối, vì workflow engine hiện có đã sở hữu điều phối foreground, sub-agent có cấu trúc, lan truyền hủy, kết thúc worker thread, event, và trách nhiệm dispose cùng chờ dừng hẳn hoàn toàn. Tái sử dụng nó thể hiện việc tổ hợp plugin, thay vì xây dựng một runtime vòng lặp thứ hai.
- **Cắt bớt âm thầm báo cáo lớn** — Từ chối, vì việc cắt bớt có thể xóa bằng chứng trạng thái hoặc bước tiếp theo, nhưng vẫn trông có vẻ như một bản bàn giao có thẩm quyền. Bên sinh ra phải phát hành báo cáo hợp lệ trong ranh giới cấu hình.

## Hệ quả

- Việc lặp lại bằng agent hoàn toàn mới trở thành một tool model hạng nhất, và được triển khai hoàn toàn như một plugin có thể gỡ bỏ trên các seam hiện có.
- Goal Round và Ralph Round vẫn là hai khái niệm khác nhau: cái đầu là một lượt tiếp tục cùng phiên, cái sau là một sub-agent hoàn toàn mới trong workflow foreground.
- Workspace trở thành bộ nhớ xuyên Round có thẩm quyền, do đó worker phải kiểm tra và xác minh workspace, chứ không thể tin vào bản bàn giao mang tính tường thuật.
- Giới hạn Round rộng rãi cho phép nhiều công việc tự trị, trong khi cấu hình triển khai vẫn giới hạn số sub-agent, và mỗi bàn giao luôn bị ràng buộc kích thước.
- Định tuyến bên cung cấp và giới hạn sub-agent theo từng lần chạy có thể giảm trở thành mối quan tâm tường minh khi khởi động workflow, nhưng không mở rộng script hay bộ tool workflow tổng quát.

## Giới hạn đã biết và các việc tạm hoãn

- Trạng thái hoàn thành và bị chặn do chính worker tự khai báo. Bộ đánh giá độc lập, Round phản hồi do bộ đánh giá điều khiển, chứng chỉ hoàn thành hoặc verifier đối kháng đều được cố ý hoãn lại.
- Lần chạy nằm ở foreground và chỉ tồn tại trong tiến trình. Không có thu thập nền, persistence/khôi phục, lập lịch hay khôi phục sau khởi động lại.
- Số Round là ngân sách tổng hợp duy nhất. Ngân sách token, tiền tệ, thời lượng và mức dùng bên cung cấp vẫn thuộc chính sách độc lập trong tương lai.
- Mỗi Round tạo một sub-agent. Fan-out trong Round, tách vai trò đánh giá/worker, chọn bên cung cấp hoặc model động, và log xuyên lần chạy đều bị hoãn lại.
- Sub-agent thông thường thất bại sẽ kết thúc lần chạy và không retry, đồng thời giữ lại Round thất bại và bàn giao thành công trước đó. Lỗi hạ tầng workflow nghiêm trọng có thể kết thúc trước khi script cố định trả về trạng thái đó; thêm retry hay truyền tải lỗi phong phú hơn cần thiết kế chính sách và ranh giới độc lập.
- Prompt hướng dẫn model không gọi đệ quy Ralph; giới hạn tool sub-agent có cấu trúc cần thiết kế API chính sách con workflow riêng.
