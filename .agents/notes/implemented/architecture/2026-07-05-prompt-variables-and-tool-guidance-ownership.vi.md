# Agent Note: Quyền sở hữu biến prompt và hướng dẫn công cụ

Status: implemented

[English](2026-07-05-prompt-variables-and-tool-guidance-ownership.md) | Tiếng Việt

## Vấn đề

Prompt hệ thống sau khi lắp ghép tồn tại bốn khiếm khuyết, cùng thuộc một loại: những sự kiện mà harness đã biết lại bị viết lại thủ công ở nơi khác, rồi trôi lệch.

**Mô hình không thể biết tên của chính mình.** `AgentOptions.model` điều khiển mọi yêu cầu, nhưng không có đoạn văn bản prompt nào mang nó theo — mà cũng không thể mang: các section trong `dsh-system-prompt` mang tính toàn cục theo ngữ cảnh, trong khi tên mô hình lại khác nhau theo từng agent (tác tử), và `assemble()` hoàn toàn không nhận bất kỳ đầu vào theo từng agent nào.

**Hướng dẫn công cụ là văn bản viết tay trong leaf YAML.** Hướng dẫn sử dụng shell/subagent/todo_write nằm trong chuỗi persona của coding-agent và của ACP (Agent Client Protocol) — hai bản sao đã trôi lệch (bản của ACP đã bị cắt bớt) — trong khi `dsh-tool-fs` và `dsh-tool-web` lại đóng góp hướng dẫn của riêng chúng qua `ctx.systemPrompt.section()`. Nạp hoặc gỡ một plugin công cụ đồng nghĩa với việc phải sửa tay persona của từng bản triển khai, và biểu ngữ chào mừng của terminal cũ cũng liệt kê thủ công bộ công cụ.

**Persona được render sau hướng dẫn công cụ.** Agent loop (vòng lặp tác tử) nối chuỗi `agent.options.systemPrompt` vào sau các section đã lắp ghép, thành ra mô hình đọc «Use the read tool…» trước rồi mới tới «You are a coding agent» — trái với quy ước identity-first (Claude Code, Codex), và là một con đường tổ hợp thứ hai nằm ngoài pipeline section.

**Mô tả của công cụ fork là giả.** `dsh-tool-subagent` mã hóa cứng một đoạn mô tả được viết cho ngữ nghĩa spawn — «a separate agent that works in its own context … it does not see this conversation» — trong khi thể hiện `subagent_fork` (mà agent con kế thừa các lượt đã hoàn tất của agent cha) lại nhận đúng cách diễn đạt ấy; văn bản YAML sửa lời nói dối này theo kênh ngoài luồng. Vấn đề nhỏ: `PromptSection.name` được tài liệu ghi là «(diagnostics / dedup)», nhưng các mục trùng lặp lại được chấp nhận một cách âm thầm.

## Quyết định

**Một nguyên tắc: mỗi sự kiện trong prompt có đúng một bên sở hữu.** Tên mô hình và không gian làm việc là sự kiện cấu hình/phiên → harness phơi bày chúng dưới dạng biến, persona tham chiếu tới chúng. Ngữ nghĩa của từng công cụ và thời điểm dùng nó → `description` của công cụ. Thói quen xuyên lời gọi mà description không thể chứa → section prompt của package. Tên sản phẩm và phần mô tả danh tính SDK → section tĩnh `harness:identity`. Vai trò và hành vi của bản triển khai → persona của bản triển khai.

### Ngữ cảnh lắp ghép

`SystemPrompt.assemble(context)` nhận một `AssembleContext` có thể mở rộng bằng hợp nhất. `dsh-system-prompt` khai báo bộ chọn `scope` tùy chọn dùng cho định tuyến scoped, còn `dsh-agent` gắn thêm trường `agent` tùy chọn đã định kiểu vào đó thông qua declaration merging (một cạnh `agent → system-prompt` ở tầng kiểu, không tạo vòng phụ thuộc lúc chạy). Vòng lặp gọi `assembleContextFor(agent)` ở mỗi bước, khiến hai trường cùng chỉ tới một agent; bên cung cấp văn bản section có thể đọc ngữ cảnh đó, và waterfall (sự kiện thác nước) `system-prompt/assemble` cũng nhận nó, để listener lọc hoặc mở rộng theo từng agent.

### Biến prompt

Plugin đăng ký giá trị `{{name}}` qua `ctx.systemPrompt.variable(name, provider)`. Quá trình lắp ghép phân giải chúng vào một bản đồ biến mà waterfall nhìn thấy được. Giai đoạn render từ chối các trường hợp sau: tham chiếu tới thuộc tính tự có không xác định, bên cung cấp đã đăng ký trả về `undefined`, tham chiếu đầy đủ sai định dạng, và tham chiếu không cân bằng nhưng vẫn chứa `}}` đóng; một `{{` lẻ không khớp thì được giữ nguyên như văn bản, và giá trị sau khi thay thế sẽ không bị quét lại. Giai đoạn đăng ký từ chối tên biến không hợp lệ hoặc trùng lặp, tên section cũng phải duy nhất.

`dsh-agent-loop` đăng ký hai biến dựng sẵn, đều là phép chiếu thuần của agent trong ngữ cảnh: `model` (= `options.model`) và `cwd` (= `session.header.cwd`). Persona mẫu viết `powered by the {{model}} model` — tên mô hình chỉ được khai báo đúng một lần trong khóa cấu hình `model:`. `{{cwd}}` chỉ được minh họa trong ví dụ ACP: mỗi phiên ACP mang theo cwd của client, còn agent stdio được cấu hình tạo sẵn thì không có cwd (một persona tuyên bố `{{cwd}}` ở đó sẽ làm lượt đó thất bại — đây là chủ ý). Biến ở lại trên plugin loop (khác với section bên dưới): chúng là sự kiện lúc chạy của agent do vòng lặp này điều khiển, và một vòng lặp thay thế sẽ tự cung cấp biến của riêng nó.

### Persona như section order-0

`dsh-system-prompt` sở hữu `harness:identity` với order `-100` và `deployment:persona` cấu hình được với order 0, nên cả hai vẫn sống sót khi vòng lặp bị thay thế. Việc render prompt chỉ có một con đường duy nhất là `renderPrompt(assembly)`, nhờ đó header của yêu cầu đã định tuyến ghi lại đúng prompt, để `ctx.tokenMeter` phát lại sau đó phục vụ áp lực nén (compaction). `deployment:persona` ở phạm vi agent che khuất giá trị mặc định toàn cục, cho phép bên cung cấp subagent cài persona trước khi phát hành. Khoảng order theo quy ước là: identity `-100`, persona `0`, hướng dẫn công cụ `100–199`.

### Quyền sở hữu hướng dẫn công cụ

Ngữ nghĩa của từng công cụ và hướng dẫn lựa chọn nằm trong description của công cụ. Section prompt chỉ mang các thói quen xuyên lời gọi, ví dụ kiểm tra dấu hiệu mã thoát của bash hoặc ưu tiên công cụ hệ thống tệp thay vì lệnh shell. `todo_write` và các công cụ subagent không cần section, vì description của chúng đã chứa đủ quy ước. Persona của bản triển khai chỉ chứa vai trò và hành vi.

### Bộ mô tả lịch sử hội thoại của subagent

`SubagentProvider.inheritsParentContext` mô tả việc khởi tạo lịch sử hội thoại, chứ không phải phạm vi, dịch vụ, công cụ hay quyền. spawn và ACP đặt nó là `false`; fork đặt là `true`. `dsh-tool-subagent` dẫn xuất mô tả công cụ và mô tả tham số prompt từ cờ này, bao gồm cả điểm fork kế thừa các lượt đã hoàn tất nhưng không kế thừa lượt đang diễn ra. Sự kiện vòng đời của bên cung cấp giữ cho cách diễn đạt này đồng bộ với việc đăng ký bên cung cấp theo kiểu phản ứng; động cơ thiết kế xem [Agent Note về sự kiện vòng đời bên cung cấp](2026-07-05-subagent-provider-lifecycle-events.md).

## Các phương án đã cân nhắc

- **Để vòng lặp tự ghép một dòng văn bản identity**: mã hóa cứng văn bản hướng tới mô hình ngay trong package buộc phải giữ tinh gọn («dùng plugin, đừng sửa vòng lặp»), đồng thời tạo ra một con đường tổ hợp thứ hai nằm ngoài pipeline section. (identity đúng là được giao dưới dạng literal trong mã — nhưng như một section thông thường do `dsh-system-prompt` đăng ký, và waterfall `system-prompt/assemble` vẫn là van thoát khi bản triển khai cần gỡ nó.)
- **Tiêm tên mô hình qua waterfall `agent/request`**: văn bản prompt sẽ được ghép ở hai nơi, và persona render sớm hơn cũng có thể không khớp với header đã định tuyến cuối cùng. Plugin yêu cầu sở hữu định tuyến trễ cũng phải sở hữu luôn phần khai báo mô hình đó xuất hiện sớm hơn trong prompt.
- **Viết tay tên mô hình trong mỗi persona**: trùng lặp với khóa `model:` ở ngay dòng trên, và sẽ âm thầm sai sự thật sau khi sửa cấu hình; chính là căn bệnh mà quyết định này chữa trị.
- **Nội suy lỏng lẻo (giữ nguyên hoặc thay bằng rỗng khi tham chiếu không xác định)**: một lỗi chính tả `{{modle}}` (hoặc một chỗ trống) sẽ được gửi tới mô hình, và chỉ bị phát hiện khi rà soát transcript (bản ghi văn bản).
- **Viết cách diễn đạt cho từng thể hiện subagent trong cấu hình**: văn bản hướng tới mô hình lại quay về từng bản triển khai × thể hiện, lặp lại đúng sự trôi lệch của việc viết tay hướng dẫn trong leaf YAML. **Chọn cách diễn đạt theo tên bên cung cấp**: bản thân `providerName` là cấu hình, nên sau khi đổi tên bên cung cấp sẽ âm thầm nhận cách diễn đạt sai.
- **Phân giải bên cung cấp tại thời điểm `apply` (yêu cầu thứ tự nạp)** và **chỉ dùng section để mang cách diễn đạt subagent (phân giải lười tại thời điểm assemble)**: là các phương án thay thế cho sự kiện vòng đời bên cung cấp; cả hai đều bị bác bỏ trong [Agent Note về sự kiện vòng đời bên cung cấp](2026-07-05-subagent-provider-lifecycle-events.md).

## Ngoài phạm vi

- Thêm biến khác (`date`, platform, trạng thái git): sổ đăng ký khiến mỗi biến trở thành một đóng góp một dòng của plugin sở hữu sự kiện đó; Agent Note này không nhận biến nào trong số đó.
- Cấu hình `cwd` cho agent stdio tạo sẵn (giúp persona stdio dùng được `{{cwd}}` và lưu trữ bền vững phân vùng theo đường dẫn thật): hoãn tới khi phương án cwd theo phiên được bàn lại.

## Bất biến đã giao

- Prompt của tui-agent render lần lượt identity, persona với tên mô hình đã nội suy, rồi tới hướng dẫn fs/shell/web, qua một con đường lắp ghép duy nhất.
- Mô tả của subagent fork và fresh phản ánh việc bên cung cấp có kế thừa các lượt hội thoại đã hoàn tất hay không; công cụ xuất hiện, biến mất và được diễn đạt lại theo thay đổi vòng đời của bên cung cấp.
- Tham chiếu biến không xác định, không có giá trị, sai định dạng hoặc không cân bằng sẽ chỉ rõ tên section và ném ngoại lệ; section, biến và đăng ký công cụ trùng lặp cũng ném ngoại lệ.
- Phát lại snapshot không liên quan tới prompt: nó lập chỉ mục luồng phân mảnh đã ghi theo lượt và bước, không so sánh yêu cầu đã phát đi.

## Hệ quả

- Mỗi sự kiện trong prompt đã lắp ghép nay có đúng một bên sở hữu, và văn bản công cụ duy trì thủ công trong leaf YAML đã bị loại bỏ: nạp hoặc gỡ một plugin công cụ không còn đòi hỏi sửa persona của bất kỳ bản triển khai nào.
- `{{model}}` phản ánh `AgentOptions.model` tại thời điểm lắp ghép. Nếu một plugin đổi mô hình trong waterfall `agent/request`, thì tuyên bố của prompt cho bước đó trở nên lỗi thời; nếu một plugin cung cấp mô hình ở đó (options.model không đặt — con đường dự phòng được ghi trong tài liệu vòng lặp), biến sẽ không có giá trị lúc render, và persona chứa `{{model}}` sẽ thất bại trước khi waterfall chạy. Cách khắc phục cho cả hai là như nhau, và chính là bản thân quy tắc sở hữu: plugin sở hữu sự kiện mô hình ràng buộc trễ phải khai báo nó sớm trên waterfall `system-prompt/assemble` (`assembly.variables['model'] = …`) — một bên sở hữu, hai nơi khai báo; một bài kiểm thử vòng lặp cố định con đường supply theo kiểu đầu-cuối. Đã chấp nhận.
- Khi một bên cung cấp đã ràng buộc không tồn tại (chưa kích hoạt, đã gỡ, đang nạp lại HMR (thay thế module nóng)), công cụ subagent không tồn tại, và yêu cầu tới mô hình trong khoảng thời gian đó sẽ không chứa nó. Đây là trạng thái trung thực — phương án thay thế là đăng ký một công cụ mà cả description lẫn việc thực thi đều không đáng tin.
- Tính nghiêm ngặt đồng nghĩa persona có thể làm lượt hội thoại thất bại lúc render (ví dụ dùng `{{cwd}}` trên phiên không có cwd). Thất bại này được kiểm soát — lượt đó kết thúc với `error`, vòng lặp vẫn sống — và đó là một lỗi soạn thảo mà ta muốn phơi bày rõ ràng.
- Hiện chưa có cú pháp thoát cho `{{name}}` theo nghĩa đen trong văn bản prompt; nếu một prompt thật sự cần, khi đó hãy bổ sung.
