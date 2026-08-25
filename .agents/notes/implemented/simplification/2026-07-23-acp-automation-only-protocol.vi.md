# Agent Note: ACP như một giao thức chỉ dành cho tự động hóa

Status: implemented

[English](2026-07-23-acp-automation-only-protocol.md) | Tiếng Việt

## Vấn đề

Lớp cầu nối (bridge) ACP (Agent Client Protocol) đã trở thành một bộ UI sản phẩm tương tác thứ hai. Nó chuyển đổi các sự kiện bền vững thành thẻ (card) editor, metadata terminal, diff, plan, tiêu đề, reasoning (suy luận), command, mode, model, bộ chọn quyền hạn, điều hướng session, và các câu hỏi hướng-tới-con-người. Những trách nhiệm này trùng lặp với TUI và Web client, đồng thời khiến lớp transport tự động hóa bị ràng buộc với UI service, truy vấn persistence, chính sách hiển thị và các quy ước riêng của editor.

ACP vẫn có một trách nhiệm hữu ích: một agent (smart agent) khác hoặc bộ điều khiển tự động hóa có thể khởi động process harness, tạo session cô lập, gửi văn bản hoặc hình ảnh nội tuyến (inline) được hỗ trợ với phạm vi hẹp, nhận câu trả lời văn bản/hình ảnh đã submit, hủy công việc và trả lời yêu cầu quyền hạn. Backend subagent ACP xuyên process phụ thuộc vào ranh giới giao thức chuẩn này.

Bộ snapshot khiến việc gỡ bỏ trở nên phức tạp hơn. Phần lớn kịch bản ACP kiểm thử agent backend đã composition, chứ không phải lớp hiển thị ACP; nếu xóa toàn bộ bộ này cùng với lớp cầu nối editor, sẽ mất một lượng lớn test hành vi không cần key.

## Quyết định

`@deepseek-ai/dsh-acp` là lớp transport tự động hóa nằm tại [`packages/acp/acp`](../../../../packages/acp/acp/README.md), độc lập với nhóm package `ui`. Giao thức công khai của nó cố ý giữ tinh gọn: đàm phán version, session hoàn toàn mới (mỗi session tối đa cho phép một prompt đang tiến hành), cập nhật văn bản/hình ảnh của assistant đã submit, hủy theo session, session đồng thời, và việc dọn dẹp tài nguyên do connection đảm nhiệm. Prompt giữ nguyên thứ tự giao thức đối với văn bản và hình ảnh raster được hỗ trợ, còn resource link được làm phẳng thành tham chiếu văn bản trong ngoặc vuông; lớp cầu nối sẽ từ chối thư mục đính kèm, MCP server, audio, embedded resource, prompt sai định dạng hoặc rỗng, session không xác định và prompt chồng lấn.

Khả năng hình ảnh phải thực sự tồn tại, chứ không chỉ dựa trên cấu trúc: chỉ khi persistent attachment store tồn tại, và provider/model chính xác đã cấu hình sau khi resolve rõ ràng hỗ trợ input hình ảnh, `initialize` mới công bố khả năng đó. Mỗi prompt hình ảnh đều kiểm tra lại route chính xác mới nhất của session, decode nghiêm ngặt toàn bộ block, và ủy thác toàn bộ batch hoàn chỉnh cho `AttachmentStore.saveImages()` trước khi phát hành user event. Việc hủy sẽ giữ chỗ và abort admission slot trước bất kỳ công việc bất đồng bộ nào, khiến prompt chỉ được settle (kết toán) sau khi các write đã khởi động ổn định, và không bao giờ phát hành message trễ; prompt trước khi vào Agent inbox sẽ không bị hủy, cũng không chờ công việc Agent không liên quan. Các write ghi theo content-addressing đã hoàn tất có thể vẫn không thể truy cập, vì việc rollback phá hủy đối với deduplication store là không đúng đắn. Lỗi chính sách hình ảnh do phía gọi có thể sửa được sẽ ánh xạ thành invalid argument, còn truy vấn routing, hỏng storage và lỗi persistence vẫn thuộc về lỗi nội bộ.

Lớp cầu nối chỉ phát ra văn bản và hình ảnh `assistant/message` đã submit. Mỗi session dùng một chuỗi Promise, đọc lại và xác thực tham chiếu hình ảnh của assistant một cách bất đồng bộ, chuyển đổi thành ACP base64 để giao khi vẫn giữ thứ tự block và message; nếu object bị thiếu hoặc hỏng sẽ khiến prompt giao thất bại, chứ không biến thành placeholder. Reasoning, phân đoạn thô, hoạt động tool, todo, plan, tiêu đề, cờ retry, metadata terminal, diff, vị trí và resource link vẫn nằm trong session log bền vững hoặc lớp transport chuyên dụng cho UI. Nó không cung cấp việc tải, liệt kê, xóa session, command, mode, bộ chọn config, chuyển model, đánh giá plan hay câu hỏi hướng-tới-con-người.

Giữ lại `session/request_permission` dùng một lần. Đây là kênh chính sách máy dành cho agent do lớp cầu nối sở hữu, chứ không phải UI phê duyệt hướng-tới-con-người: bên trả lời chỉ chấp nhận cùng agent object đã đăng ký trong session map hiện tại của lớp cầu nối; request không thuộc agent hiện tại của lớp cầu nối, hoặc request không liên kết với lời gọi cụ thể, sẽ tiếp tục được ủy thác; lỗi RPC sẽ ánh xạ thành kết quả `unavailable` với mặc định từ chối khi có sự cố. Client có thể chọn cho phép một lần, từ chối một lần hoặc hủy, lớp cầu nối sẽ không bao giờ chuyển đổi phản hồi đó thành ủy quyền bền vững. Chính sách hỏi vẫn thuộc quyền sở hữu của approval seam và producer của nó; [`dsh-subagent-acp`](../../../../packages/subagent/subagent-acp/README.md) sẽ dùng kênh này theo cách lập trình hóa.

Composition ứng dụng bao gồm agent core, persistence, chính sách checkpoint và lớp transport ACP. Nó không mount command, truy vấn session, tham chiếu session, plan mode, bộ chọn quyền hạn hay user interaction service cho ACP.

Lớp transport gọi vào interface service của agent, session và approval, không phụ thuộc vào agent loop (vòng lặp smart agent) cụ thể. Việc thực thi tool vẫn nằm trong harness; ACP không bao giờ ủy thác việc thực thi shell cho editor. stdout chỉ chuyển tải JSON-RPC đã đóng khung, do đó app không mount stdout logger, và lớp cầu nối cũng không monkey-patch process output.

Việc ngắt kết nối và dispose (giải phóng tài nguyên) của plugin dùng chung một ranh giới ổn định hoàn toàn đã ghi nhớ (memoized). Khi transport đóng, dù thành công hay thất bại, đều sẽ hủy admission của prompt và agent, xả cạn output có thứ tự, settle các prompt đang chờ thành trạng thái đã hủy, dispose từng agent do lớp cầu nối sở hữu, và chờ vòng lặp cùng dọn dẹp session hoàn tất. Nếu quy trình tạo thất bại trong cuộc đua với việc đóng, nó sẽ dispose handle chưa phát hành của mình.

## Ranh giới snapshot

Bộ snapshot ACP vẫn khởi động ví dụ ACP đã composition, và giữ lại các kịch bản dùng để chốt hành vi backend. Chỉ những kịch bản được điều khiển qua các phương thức UI đã bị xóa mới bị chuyển ra khỏi bộ này; vì ACP không còn tải session, việc khôi phục checkpoint ngữ nghĩa được thực hiện qua ví dụ headless `stream-json`.

Test giao thức và vòng đời chốt bộ mã hóa/giải mã lý do dừng, đàm phán version, khả năng hình ảnh thật, tạo session mới, admission văn bản/hình ảnh có thứ tự, làm phẳng resource link, xác thực toàn bộ thành viên trước khi ghi, không có base64 nội tuyến trong sự kiện bền vững, từ chối prompt rỗng hoặc không được hỗ trợ, quy thuộc quyền hạn dựa trên cùng agent object, cô lập đa session, settle prompt sau output có thứ tự, giao hình ảnh assistant đã xác thực, hủy trong lúc admission mà không tạo followup trễ hoặc không hủy công việc Agent không liên quan, loại trừ lỗi không liên quan trước khi vào inbox, lỗi khi đóng transport, dọn dẹp reload riêng của ACP, và tháo dỡ ổn định hoàn toàn. Snapshot composition không cần key gửi một PNG nội tuyến thật qua ví dụ ACP có thể chạy, và chỉ chốt tham chiếu bền vững của nó trong session log. Test smoke build artifact và test smoke stdio thật đều từ chối bất kỳ output phụ nào trộn vào stdout. Nhánh trong `session/new` thất bại trong cuộc đua đóng stdio thật vẫn được miễn yêu cầu coverage, vì transport trong bộ nhớ không thể tái hiện thứ tự này; nhánh đó sẽ dispose handle chưa phát hành, còn test dispose xung quanh chốt bất biến không rò rỉ tài nguyên.

## Phương án thay thế đã cân nhắc

**Tiếp tục dùng ACP làm UI editor cho đến khi Web đạt năng lực tương đương.** Không chấp nhận, vì việc này sẽ để lại hai bộ quy ước tương tác cần tiến hóa song song, và khiến quy ước của editor tiếp tục tồn tại trong ranh giới tự động hóa.

**Giữ lớp cầu nối editor sớm thông qua ranh giới service nghiêm ngặt.** Không chấp nhận, mặc dù lớp cầu nối đó đã dùng đúng interface service, render intent riêng của tool, bên trả lời approval và user interaction, việc thực thi tự sở hữu của harness, và composition giữ stdout sạch. Thẻ terminal của nó là phần chiếu Zed `_meta` chỉ dùng để hiển thị, được cổng hóa theo khả năng, và cung cấp fallback văn bản, thay vì dùng `terminal/create` của ACP, do đó việc thực thi shell chưa bao giờ rời khỏi harness. Phần chiếu này lấy mỗi id terminal dùng để hiển thị từ id call ổn định theo từng lần gọi để tránh xung đột; vì bộ hiển thị kết quả thuần túy nhận content block, chứ không phải thông tin thoát có cấu trúc, nó khôi phục exit code hoặc signal từ dấu trạng thái đã render. Test round-trip của dấu và test fallback `console` không có khả năng tường minh chốt cả hai quy ước này. Các ranh giới này vẫn nhất quán, nhưng không thể khiến thẻ editor, điều hướng session, bộ chọn config và câu hỏi hướng-tới-con-người trở thành trách nhiệm đáng có của giao thức tự động hóa.

**Thay ACP bằng subagent RPC riêng tư.** Không chấp nhận, vì ACP đã cung cấp giao thức process kiểu hóa, có thể互操作 (interoperable), và được backend subagent xuyên process sử dụng.

**Loại bỏ yêu cầu quyền hạn máy cùng với các tính năng tương tác khác.** Không chấp nhận, vì agent cha tự động hóa phải trả lời quyết định chính sách một-lần của agent con; đây là luồng điều khiển giữa các agent, chứ không phải lớp hiển thị.

**Xóa bộ snapshot ACP, hoặc migrate mọi kịch bản trong lần thay đổi này.** Không chấp nhận, vì phần lớn kịch bản kiểm thử backend và vẫn có giá trị, trong khi việc migration harness đầy đủ là một thay đổi test độc lập. Chỉ những kịch bản được điều khiển qua các phương thức UI đã bị xóa mới rời khỏi bộ này.

**Công bố hỗ trợ hình ảnh chỉ vì ACP SDK có image block.** Không chấp nhận, vì từ vựng giao thức không chứng minh được rằng deployment hiện tại có thể lưu trữ byte bền vững, cũng không chứng minh route chính xác đã cấu hình chấp nhận input thị giác. Khi chưa biết, khả năng tại initialize là false; admission prompt sẽ kiểm tra lại route thời gian thực.

**Làm phẳng hình ảnh nội tuyến và hình ảnh assistant thành marker, hoặc lưu base64 ACP bền vững vào session event.** Không chấp nhận, vì marker sẽ âm thầm mất ý định của model/user, còn base64 sẽ biến log bền vững thành kho lưu trữ nhị phân. ACP chuyển đổi qua lại giữa block giao thức của chính nó và tham chiếu `ImageBlock` bền vững sẵn có tại ranh giới transport.

**Tạo RichContent service tổng quát cho ACP, MCP và Web.** Không chấp nhận, vì `ContentBlock` core và attachment seam đã sở hữu hợp đồng dùng chung. Mỗi entry point chỉ giữ lại việc parse giao thức, chứng minh khả năng và điều phối vòng đời; giới hạn batch dùng chung và xác thực hình ảnh vẫn nằm trong `AttachmentStore.saveImages()`.

## Kết quả

ACP có quy ước tinh gọn phù hợp cho agent và tự động hóa, trong khi TUI và Web sở hữu tương tác và hiển thị hướng-tới-con-người. Package này inject ít service, dependency, nhánh giao thức và trạng thái vòng đời hơn, và không còn định vị bản thân là entry point editor tổng quát.

Client tự động hóa nhận được văn bản/hình ảnh đã submit đầy đủ, thay vì token delta hoặc tool UI có cấu trúc. Khi cần reasoning, thông tin tool trace, tiêu đề hoặc trạng thái phong phú hơn, chúng cần xem session log bền vững hoặc API khác. Việc chỉ hỗ trợ session hoàn toàn mới cũng có nghĩa là bên gọi cần duyệt session bền vững hoặc resume session phải dùng host API, chứ không phải ACP.

Do đó, test snapshot backend vẫn bị ràng buộc với lớp transport ACP, mặc dù đối với hành vi được kiểm thử, lớp transport đó chỉ là yếu tố phụ trợ.
