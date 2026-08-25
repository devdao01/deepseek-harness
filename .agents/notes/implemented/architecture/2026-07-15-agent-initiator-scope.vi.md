# Agent Note: Phạm vi Agent khởi tạo dựa trên AsyncLocalStorage

Status: implemented

[English](2026-07-15-agent-initiator-scope.md) | 中文

## Vấn đề

Trong harness tồn tại hai khái niệm ngữ cảnh hữu ích nhưng khác nhau. Cordis `Context` chịu trách nhiệm chọn service, quy thuộc đăng ký và vòng đời; `agent.ctx` là một phạm vi đăng ký phẳng do một Agent đang sống sở hữu. Agent và danh tính session mô tả chủ thể của thao tác bất đồng bộ. Nếu biến `ctx.agent` gốc thành "Agent đang chạy hiện tại", điều đó sẽ gộp lẫn hai ý nghĩa này, và sẽ hỏng khi một tiến trình đơn chạy đồng thời nhiều Agent.

Hạ tầng nằm sâu trong tiến trình đôi khi cần lấy Agent khởi tạo đáng tin cậy bên dưới các tham số loop, tool và request được truyền tường minh, ví dụ như tầng transport nhận biết host, hàm hỗ trợ tracing, logger, hoặc client gateway. Yêu cầu mọi hàm hỗ trợ private phải forward `agent` sẽ gây lặp lại, còn một ô nhớ (slot) khả biến cấp tiến trình sẽ gây lỗi đồng thời khi vượt qua `await`. Tham số hiển thị với model cũng không phù hợp, vì model không được phép chọn session đáng tin cậy hay định tuyến request header. Vật mang thông tin này thuộc về Agent service, không phải ngữ cảnh tùy chọn hiển thị với model.

## Quyết định

Service `ctx.agents` bắt buộc dùng `AsyncLocalStorage` gốc của Node để mang Agent khởi tạo. Nó lưu trực tiếp cùng một `Agent`, không đưa vào một frame chỉ có một field; một cờ đánh dấu chạy (running marker) private khác chỉ ghi lại phả hệ ranh giới lồng nhau, phục vụ việc hạch toán teardown, không mang danh tính. [Danh mục dữ liệu core](../../../../docs/subsystems/core.md#initiating-agent) nêu rõ kiểu dữ liệu được mang theo.

`currentInitiator()` dùng để đọc tùy chọn, `requireInitiator()` ném lỗi `no initiating agent is active`, `withInitiator(agent, operation)` giữ nguyên giá trị đồng bộ hoặc chính Promise mà thao tác trả về. `withoutInitiator(operation)` thiết lập một ranh giới xóa trắng, dùng cho công việc không được kế thừa Agent. Session vẫn được suy ra qua `agent.session`; lượt (turn), bước (step), tool call, `signal`, model, `cwd`, sandbox và ủy quyền vẫn do các bên quy thuộc hiện có quản lý.

`AgentLoop` đã inject `ctx.agents`, và bọc toàn bộ vòng đời `runLoop` cụ thể của từng driver bằng `agents.withInitiator(agent, ...)`. Các điểm vào private trong package cho loop, turn, step và tool call khôi phục cùng một Agent từ `ctx.agents`, suy ra `agent.session` một lần, rồi hàm hỗ trợ nội bộ của thao tác nắm giữ giá trị đó, tránh phải forward driver cụ thể hoặc `Session` qua các interface nông. Nếu bản thân `Session` chính là interface thực sự của hàm hỗ trợ tầng dưới, hàm đó vẫn giữ tham số `Session` hẹp, chứ không nhận `Context` rộng hơn chỉ để tra cứu ngầm.

Do đó, các driver chạy đồng thời dùng storage tách biệt nhau. Phần tiếp diễn bất đồng bộ của driver con mang Agent con; sau khi `withInitiator()` trả về, bên gọi lập tức khôi phục storage trước đó, trong khi bộ đếm chạy hoạt động vẫn tiếp tục theo dõi Promise được trả về cho tới khi nó kết thúc. Việc tạo mới, load từ persistence, và `setup(agentCtx)` (chưa công bố) nằm ngoài ranh giới driver con: việc tạo do Agent cha khởi xướng dùng danh tính của cha, còn `agentCtx.agent` xác định tường minh Agent con.

Danh tính ngầm không thay thế các quy ước tường minh. `ToolExecution.agent`, `AssembleContext.agent`, `GenerateOptions.sessionId`, quy thuộc tác vụ, request cha-con, `ctx.agent`, `agentCtx.agent`, chủ thể phê duyệt và hook, việc chọn `cwd`, hủy bỏ, thông điệp worker và tiến trình, bản ghi persist, và danh tính giao thức đều tiếp tục được truyền tường minh. Ranh giới remote sẽ ghi danh tính cần thiết vào request đã định kiểu, vì ALS chỉ có hiệu lực trong phạm vi tiến trình.

`AgentRegistry` quản lý một vòng đời có thứ tự cho các bên khởi tạo. Teardown trước tiên từ chối ranh giới mới; sau khi gỡ `ctx.agents`, các bên inject như AgentLoop bắt đầu rút cạn (drain), rồi registry chờ các ranh giới Promise hoạt động, cuối cùng gọi `AsyncLocalStorage.disable()`. Nếu một chuỗi gọi bất đồng bộ được kế thừa từ một ranh giới khởi động việc unload fiber Cordis sở hữu chính nó, phả hệ cờ chạy private sẽ giải phóng chuỗi ranh giới lồng nhau đó khỏi phạm vi rút cạn, nhờ đó tránh việc teardown phải chờ chính nó hoàn thành, trong khi vẫn tiếp tục rút cạn các ranh giới không liên quan. Trong lúc rút cạn bình thường, mã đang chạy vẫn có thể tiếp tục gọi `currentInitiator()` và `requireInitiator()` thông qua tham chiếu service đã giữ lại; sau dispose (giải phóng tài nguyên), các phương thức của bên khởi tạo sẽ ném lỗi `agent initiator scope is disposed`. Việc dispose root Context có thể đồng thời khởi động teardown của fiber cùng cấp, nên vẫn phải đếm ranh giới hoạt động ngoài thứ tự phụ thuộc của Cordis.

Phạm vi khởi tạo không chịu trách nhiệm quản lý công việc tách rời khỏi chuỗi trả về: việc rút cạn của registry chỉ theo dõi Promise mà `withInitiator()` hoặc `withoutInitiator()` trả về. Tài nguyên bất đồng bộ được tạo bên trong ranh giới sẽ kế thừa storage của nó cho tới khi tự kết thúc hoặc ALS bị vô hiệu hóa; seam sở hữu phải dừng tường minh công việc không nằm trong Promise trả về. Công việc tiền cảnh (foreground) thuộc về Agent đưa toàn bộ vòng đời vào giá trị trả về, và giữ nguyên quy ước hủy tường minh. Timer, queue và hạ tầng triển khai không liên quan khởi động dưới `withoutInitiator(operation)`; các ranh giới queue, worker, tiến trình và giao thức phải serialize danh tính, không thể trông cậy vào việc ALS tự lan truyền.

Tầng transport nhận biết host có thể suy ra header `X-Harness-Session-Id` (do bên triển khai sở hữu) từ `ctx.agents.requireInitiator().session.id`; schema và tham số hiển thị với model không chứa header này. Quyết định này không khiến các transport MCP hay Web sản xuất hiện có áp dụng header này. Transport giả (test double) dùng để chứng minh ranh giới đáng tin cậy, chứ không gán chính sách định tuyến của host cho seam không phụ thuộc provider hiện có.

Quyết định này mở rộng [quy ước phạm vi đăng ký Agent](2026-07-08-agent-scope-contexts.md) và [thiết kế runtime](2026-07-12-agent-scope-runtime-design.md) của nó, không thay đổi ý nghĩa tĩnh của `agent.ctx` trong đó.

## Xác thực

Test của Agent service khóa chặt việc đọc tùy chọn và bắt buộc, danh tính chính xác của giá trị đồng bộ và Promise xuyên realm, việc quan sát trạng thái kết thúc Promise dựng sẵn, đồng thời, ranh giới lồng nhau và xóa trắng, việc khôi phục sau khi ném lỗi đồng bộ hoặc Promise bị reject, thứ tự rút cạn thông thường và tái nhập cùng lỗi của tham chiếu đã giữ lại. Test tích hợp AgentLoop khóa chặt driver chạy đồng thời và lồng nhau, việc gọi không có Agent, việc khởi động lại AgentRegistry, việc hủy root Context, và việc loop/tool được lập lịch private trong package hoàn thành qua tra cứu ngầm. Việc kiểm tra tổ hợp, đồ thị module, build và closure runtime đảm bảo gói tổ hợp mặc định, trục chính SDK, closure runtime Python và harness AgentLoop trực tiếp đều được đấu nối qua `ctx.agents`, không cần thêm bên cung cấp nào khác.

Transport nhận biết host dưới dạng test double suy ra `X-Harness-Session-Id` ở nội bộ, và xác nhận rằng cả schema tool lẫn tham số được ghi log đều không chứa field danh tính. Service cố tình không rút cạn công việc bất đồng bộ nằm ngoài Promise mà thao tác ranh giới trả về; công việc đó vẫn do quy ước dừng tường minh của bên sở hữu quản lý.

## Phương án thay thế đã cân nhắc

**Truyền Agent qua mọi hàm.** Ranh giới public, worker, tiến trình, persistence và giao thức vẫn tiếp tục truyền tường minh, nhưng yêu cầu mọi hàm hỗ trợ private trong tiến trình đều mang Agent chỉ gây lặp lại việc forward, không tăng độ tin cậy. ALS chỉ giới hạn trong chuỗi gọi bất đồng bộ bên trong các ranh giới tường minh này.

**Biến `ctx.agent` thành giá trị động.** `ctx.agent` vốn đã biểu diễn Agent liên kết tĩnh với Cordis context có phạm vi Agent. Thay đổi ý nghĩa của context gốc sẽ trộn lẫn phạm vi đăng ký với phạm vi thực thi, và khiến hành vi đồng thời trở nên khó lường.

**Thêm service `ctx.agentExecution` độc lập.** Vật mang thông tin này không có backend, cấu hình hay kiểu danh tính riêng: nó lưu cùng một `Agent` mà `ctx.agents` đã quản lý, và AgentLoop vốn đã phụ thuộc vào service đó. Một bên cung cấp bắt buộc thứ hai sẽ tăng thêm việc đấu nối package, tổ hợp, vòng đời, danh mục sinh tự động và test harness, mà không tách ra được năng lực thực sự nào.

**Lưu frame có tên hoặc frame runtime đầy đủ.** Frame `{ agent }` chỉ có một field chỉ là bọc lại giá trị đó, trong khi Agent, session, inbox, hủy bỏ, turn, step, tool execution và persistence đều đã có nguồn chân lý riêng. Thêm nhiều field hơn sẽ tạo ra snapshot lỗi thời và thêm một bộ vòng đời khác; mang trực tiếp `Agent`, để tên phương thức xác định ranh giới, không cần lưu lại trạng thái trùng lặp.

**Bao gồm `AbortSignal`, `cwd`, sandbox hoặc ủy quyền cấp step.** Vòng đời và phạm vi quyền của các thứ này không khớp với ranh giới driver, và các seam hiện có đã truyền tường minh các giá trị này. Thêm năng lực điều khiển mới cần quyết định độc lập và quy ước vòng đời lồng nhau riêng.

**Dùng `currentAgent` cấp tiến trình.** Agent chạy đồng thời và subagent sẽ ghi đè lẫn nhau giữa các phần tiếp diễn bất đồng bộ thực thi, nên giá trị toàn cục khả biến chỉ đúng dưới đảm bảo tuần tự mà harness không có.

**Suy ra danh tính từ tham số hiển thị với model.** Không thể tin tưởng model hoặc input người dùng để chọn session, tenant, hay định tuyến sandbox.

**Thêm danh tính định tuyến cho mọi capability seam.** Điều này sẽ phát tán mối quan tâm của host vào API không phụ thuộc provider. Triển khai nhận biết host sở hữu header request của riêng nó, còn ranh giới public tiếp tục truyền tường minh danh tính.

## Hệ quả

Hạ tầng nằm sâu có thể lấy được một Agent khởi tạo đáng tin cậy trong phạm vi tiến trình, mà không cần mở rộng các request tool và capability hiện có. Driver chạy đồng thời và lồng nhau được cô lập tự động, AgentLoop không thêm service bắt buộc mới, và HMR (hot module replacement) hoặc việc dispose root Context sẽ đạt trạng thái dừng hoàn toàn trước khi vô hiệu hóa ALS.

Dependency này không xuất hiện trong chữ ký hàm, và mang theo một đối tượng Agent có năng lực điều khiển. Bên tiêu thụ phải giới hạn nó trong hạ tầng xuyên suốt (cross-cutting), coi sự tồn tại ngầm này là không chứng minh được sự sống còn cũng như không cấp quyền, và giữ nguyên việc kiểm tra hủy bỏ và quy thuộc tường minh. ALS còn có chi phí lan truyền thường trực, và cũng không thể vượt qua ranh giới worker, tiến trình, HTTP hay hàng đợi persistence.

Thiết kế hủy này cố ý phụ thuộc vào API [Stability 1 (thử nghiệm)](https://nodejs.org/api/async_context.html#asynclocalstoragedisable) `AsyncLocalStorage.disable()` của Node. Node yêu cầu gọi `disable()` trước khi instance ALS có thể được thu gom rác, điều này đặc biệt quan trọng khi HMR thay thế instance do AgentRegistry sở hữu; bộ bảo vệ trạng thái service sẽ ngăn việc tái nhập instance đó qua các ranh giới sau khi đã dispose.

Phạm vi này cố ý chỉ mang Agent, bỏ qua turn, step, `signal`, `cwd`, sandbox và ủy quyền. Nếu bên tiêu thụ thực sự không thể dùng các field tường minh hiện có, phải lập luận riêng để mở rộng; field lỗi thời cùng lắm chỉ gán nhãn sai cho dữ liệu telemetry, tuyệt đối không được cấp quyền điều khiển.
