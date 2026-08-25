# Agent Note: Kiểu union render-intent có nhãn dùng để hiển thị lời gọi công cụ

Status: implemented

[English](2026-07-02-tool-render-intent-union.md) | Tiếng Việt

> Kiểu union render-intent vẫn còn hiệu lực với tầng truyền tải UI; phần ánh xạ sang ACP (Agent Client Protocol) của nó đã được thay thế bởi [ACP là giao thức chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md).

## Vấn đề

Công cụ khai báo cách lời gọi của nó được render trong UI (thẻ lời gọi công cụ của trình soạn thảo) thông qua hai callback `presentCall`/`presentResult` trên `ToolDefinition`, trả về `ToolCallPresentation` / `ToolResultPresentation`, kèm một cấu trúc con `ToolTerminal` tùy chọn. Qua quá trình tiến hóa từng bước, các kiểu này đã trở thành một **tập hợp các trường tùy chọn**: phía lời gọi có `title`, `kind`, `rawInput`, `content`, `locations`, `terminal`; phía kết quả có `title`, `content`, `terminal`; trên `ToolTerminal` có `cwd`/`output`/`exitCode`/`signal`. Việc phân chia trách nhiệm mơ hồ, không rõ ràng:

- Trường `terminal` ở phía lời gọi và phía kết quả chồng lấn nhau, bridge phải ghép khối `content`, khối `terminal` và `rawInput` của mỗi lời gọi lại với nhau bằng logic điều kiện tạm bợ.
- Không có tài liệu nào nói rõ những tổ hợp nào là *hợp lệ*: một lời gọi `terminal` có đặt `content` mang nghĩa «phần mô tả phía trên thẻ»; một lời gọi generic có đặt `terminal` thì vô nghĩa nhưng vẫn biểu diễn được về mặt kiểu. Kiểu dữ liệu cho phép tồn tại những trạng thái vô nghĩa.
- Không thể biểu đạt khả năng mà trình soạn thảo cần nhất ở công cụ thao tác tệp: **thẻ diff** (`{path, oldText, newText}`, được Zed render thành diff nội tuyến / bản xem trước tệp mới). `ToolCallPresentation.content` dùng từ vựng `ContentBlock[]` của *LLM (mô hình ngôn ngữ lớn)* (text/image), nên công cụ hoàn toàn không thể yêu cầu hiển thị diff.

Một đề xuất trước đây đã bị bác bỏ về việc gộp bỏ phần trình bày do công cụ tự sở hữu đã hoãn phần render phong phú lại cho tới khi nó có thể «quay lại dưới dạng kiểu union render-intent có nhãn, sau khi từ vựng được kiểm chứng bởi ít nhất hai công cụ thật và hai bên tiêu thụ thật». Điều kiện đó nay đã được thỏa mãn bởi nhiều họ nhà sản xuất, cộng thêm các bên tiêu thụ là TUI và runtime của host/client (Web).

## Quyết định

Thay tập hợp trường tùy chọn bằng một **kiểu union phân biệt được, lấy `card` làm nhãn**. Công cụ khai báo một ý định render cho mỗi lời gọi/kết quả; bridge phân nhánh theo nhãn.

```ts ignore-check
type FileLocation = { path: string; line?: number }
type FileDiff = { path: string; oldText: string | null; newText: string } // oldText null ⇒ new file

// presentCall → ToolCallView
type ToolCallView = GenericCallView | TerminalCallView | DiffCallView
interface GenericCallView { card: 'generic'; title: string; kind?: ToolCallKind; rawInput?: unknown; content?: ContentBlock[]; locations?: FileLocation[] }
interface TerminalCallView { card: 'terminal'; title: string; description?: string; cwd?: string }
interface DiffCallView { card: 'diff'; title: string; diffs: FileDiff[]; locations?: FileLocation[] }

// presentResult → ToolResultView
type ToolResultView = GenericResultView | TerminalResultView
interface GenericResultView { card: 'generic'; title?: string; content?: ContentBlock[] }
interface TerminalResultView { card: 'terminal'; title?: string; output?: string; exitCode?: number; signal?: string }
```

`card` là **bắt buộc** trên mọi biến thể — một trường phân biệt thực thụ, không phải giá trị mặc định tùy chọn. Bridge thực thi `switch (view.card) { case 'generic': … case 'terminal': … case 'diff': … default: assertNever(view) }`. Kiểu union này **đóng** (theo [quy ước switch vét cạn](../../../../AGENTS.md)): ý định render thứ tư (bảng, biểu đồ) dù thế nào cũng cần mã bridge mới để render, nên một biến thể do plugin thêm vào nhưng bị bridge âm thầm bỏ qua còn tệ hơn một lỗi biên dịch. Thêm biến thể mới sẽ làm gãy biên dịch tại switch của bridge — đó chính là tín hiệu ta muốn.

### Vì sao union có nhãn tốt hơn tập hợp trường

- **Trạng thái không hợp lệ trở nên không thể biểu diễn.** Thẻ generic không thể mang đầu ra terminal; thẻ terminal không thể mang diff. Tập hợp trường cũ cho phép tất cả những tổ hợp đó.
- **Bên tiêu thụ phân nhánh thay vì ghép nối.** Mỗi loại thẻ một nhánh, sinh ra chính xác view mà thẻ đó cần, thay vì phải dung hòa năm trường tùy chọn có quan hệ tương tác không được tài liệu hóa.
- **`diff` trở thành ý định hạng nhất.** write/edit của `dsh-tool-fs` khai báo `card:'diff'` kèm `{path, oldText, newText}`, để UI đủ năng lực render thay đổi ngay trên dòng mà không cần xử lý đặc biệt theo tên công cụ.

### Ánh xạ phía nhà sản xuất

- `dsh-tool-fs` read → `generic` (`kind:'read'`, kèm một `location` follow-along); write → `diff` (`oldText:null`); edit → `diff` (`oldText:old_string || null`, `newText:new_string ?? ''`). Cách này tương ứng từng trường với các nhánh Read/Write/Edit trong `toolInfoFromToolUse` của `claude-agent-acp`.
- `dsh-tool-bash` chạy ở tiền cảnh → lời gọi `terminal` + kết quả `terminal`; `run_in_background` → `generic`. Các công cụ điều khiển `job_*` thông dụng có thẻ generic riêng.
- `dsh-tool-todo` → `generic`.

### Quyền sở hữu phương án dự phòng của terminal

`TerminalResultView` chỉ mang `output`/`exitCode`/`signal`. UI không có năng lực terminal cần một phương án dự phòng dạng văn bản bọc trong hàng rào ` ```console `; phần suy diễn đó được chuyển sang **bridge** (bọc `output` trong khối mã có hàng rào trên nhánh không có năng lực), thay vì để công cụ mã hóa hai lần. Nhờ vậy kết quả của công cụ bash giữ một hình thái có cấu trúc duy nhất, đồng thời bảo toàn từng byte hành vi kiểm soát theo năng lực đã có.

Ý định terminal chỉ dùng để hiển thị. Harness vẫn thực thi lệnh qua dịch vụ bash của chính nó, nhờ đó giữ được sandbox, việc dọn sạch môi trường, quyền sở hữu tác vụ và cwd theo từng phiên; UI chỉ trình bày lời gọi đã hoàn tất, tuyệt đối không trở thành một backend thực thi thứ hai.

### Tính thuần túy của hàm được giữ nguyên

`presentCall`/`presentResult` vẫn là hàm thuần của `args` (riêng `presentResult` còn có result) — chúng chạy cả trong luồng phát trực tiếp lẫn khi phát lại nhật ký phiên, nên phải có tính tất định khi phát lại. Mỗi view chỉ được suy ra từ args: diff của write theo kiểu tệp mới (`oldText:null`), vì tại thời điểm gọi, công cụ chưa có nội dung cũ; diff của edit là `old_string`→`new_string`.

## Các phương án đã cân nhắc

- **Xóa hoàn toàn phần trình bày do công cụ tự sở hữu**: chính là đề xuất collapse đã bị bác bỏ mà Agent Note này thay thế; kết luận của chính nó là hoãn lại cho tới khi có hai công cụ thật và hai bên tiêu thụ thật rồi mới làm kiểu union này, và điều kiện đó nay đã thỏa mãn.
- **Để UI thực thi ý định terminal**: bác bỏ. Làm vậy sẽ đi vòng qua chính sách bash và quy ước sở hữu của harness, đồng thời chẻ việc thực thi lệnh sang các backend khác nhau. Thẻ terminal mô tả phần thực thi mà harness sở hữu, tuyệt đối không ủy quyền thực thi ở phía client.
- **Kiểu union có thể mở rộng bằng cách hợp nhất** (mô hình `ContentBlockMap`): bác bỏ. Ý định render mới dù thế nào cũng cần mã bridge mới để render, nên một biến thể do plugin thêm vào nhưng bị bridge âm thầm bỏ qua còn tệ hơn lỗi biên dịch mà union đóng gây ra tại switch `assertNever` của bridge.
- **Giữ nguyên tập hợp trường tùy chọn**: chính là hiện trạng đã được mổ xẻ ở mục «Vấn đề»: trạng thái không hợp lệ vẫn biểu diễn được, tương tác giữa các trường không có tài liệu, và hoàn toàn không thể yêu cầu thẻ diff.

## Hệ quả

Ý định render mới sẽ làm gãy biên dịch tại switch của bridge — đây là chủ ý: mã render phải tồn tại trước loại thẻ. Các tổ hợp thẻ/trường không hợp lệ nay không thể biểu diễn, phần suy diễn dự phòng của bash thuộc về bridge, còn công cụ chỉ trả về một hình thái có cấu trúc duy nhất. Ngưỡng để có thẻ thứ tư (bảng, biểu đồ) là phải viết nhánh bridge của nó trong cùng một thay đổi.

## Không thuộc mục tiêu

- **Phát trực tiếp `terminal_output_delta` theo từng gia số** và **phân loại lệnh**: là phần việc tiếp theo mà chính Agent Note về render terminal đã hoãn lại, Agent Note này không đề cập.

## Liên quan

- Thay thế quyết định hoãn lại trong đề xuất trước đây đã bị bác bỏ về việc gộp bỏ phần trình bày do công cụ tự sở hữu (đã bác bỏ — «chờ hai công cụ thật và hai bên tiêu thụ thật, rồi làm kiểu union render-intent có nhãn»). Điều kiện đó nay đã thỏa mãn; Agent Note này chính là kiểu union đó.
- Được [diff hunk đã áp dụng tại thời điểm kết quả](../../archived/architecture/2026-07-02-result-time-applied-hunk-diffs.md) (đã lưu trữ) mở rộng: ghi chú đó bổ sung một kênh `meta` bền vững, giúp write/edit xuất ra `DiffResultView` tại thời điểm kết quả (thay đổi sau khi áp dụng: hunk theo ngữ cảnh kèm các dòng ngữ cảnh / mỗi vị trí `replace_all` một hunk, hoặc diff toàn tệp khi tạo mới) — việc tách giá trị/trình bày và kênh `presentationMeta` bền vững nay thuộc quyền sở hữu của [quy ước đầu ra công cụ chuẩn tắc](2026-07-20-canonical-tool-output-contract.md).
- Gộp `ToolTerminal` vào view `terminal` có nhãn mà tầng truyền tải UI hiện dùng.
