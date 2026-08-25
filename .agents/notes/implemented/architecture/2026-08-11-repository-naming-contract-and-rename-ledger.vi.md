# Agent Note: Quy ước đặt tên của repository và sổ đổi tên trước phát hành

Status: implemented

[English](2026-08-11-repository-naming-contract-and-rename-ledger.md) | Tiếng Việt

## Vấn đề

Tốc độ phát triển của repository từng vượt tốc độ tiến hóa của một số tên gọi. Một vài tên package mô tả cách hiện thực ban đầu, chứ không mô tả năng lực mà nó cung cấp. Một số class dù thực tế đảm nhận trách nhiệm registry, runtime, engine, controller hay resolver nhưng tên vẫn dùng `Service`. Một số key `ctx` đặt tên registry ở dạng số ít, lại đặt tên một engine đơn lẻ ở dạng số nhiều. Còn có những provider rõ ràng làm việc qua service filesystem hoặc subprocess có thể thay thế được, hoàn toàn chạy được trong môi trường thực thi khác, nhưng tên lại dùng `local`.

Những tên gọi này không phải chuyện vặt. Tên nói cho người đóng góp biết một trách nhiệm bắt đầu từ đâu và kết thúc ở đâu. `Store` nghĩa là truy cập dữ liệu. `Registry` nghĩa là đăng ký và tra cứu. `Runtime` nghĩa là thực thi thời gian thực và vòng đời. Nếu cùng một từ đồng thời mang cả ba nghĩa, bên gọi buộc phải đọc phần hiện thực mới biết được object nào sở hữu policy, công việc hay trạng thái.

Repository còn từng dùng `SDK` theo hai nghĩa. Các client Python và TypeScript được hỗ trợ dùng giao thức JSON-RPC SDK. Còn toàn bộ dự án là DeepSeek Harness, không phải một dự án SDK. Bộ công cụ dự án SDK đã bị gỡ khiến nghĩa rộng kia mất căn cứ, nhưng câu chữ và tên gọi vẫn còn giữ lại một phần cách dùng cũ.

Cửa sổ cuối cùng trước khi phát hành phiên bản có tag đầu tiên khiến việc đổi tên ở cấp repository vẫn còn rẻ. Nếu tiếp tục giữ những cái tên mơ hồ về nghĩa, bộ từ vựng hình thành ngẫu nhiên sẽ trở thành một quy ước tương thích.

## Quyết định

Repository dùng toàn bộ tên hiện tại trong sổ này. Quyết định này chỉ đổi tên; trách nhiệm package, ranh giới service, hành vi, giá trị mặc định và mô hình dữ liệu đều giữ nguyên. Nếu một cái tên nào đó làm lộ ra một ranh giới bất hợp lý, thì cần viết một Agent Note proposed riêng, chuyên đề xuất việc đổi ranh giới.

Mỗi họ đã đổi tên chỉ có một bộ từ vựng. Khi sổ gọi tên một interface nào đó, thì thư mục, tên package NPM, import, tên plugin Cordis, key `ctx`, kiểu công khai, định danh event hoặc tool ghép chặt với nó, cấu hình, test, fixture (dữ liệu chuẩn bị cho test), ví dụ, tài liệu tham khảo được sinh ra và tài liệu hiện hành đều dùng tên hiện tại. Repository không giữ alias, package tương thích, key service trùng lặp, tên event kép hay resolver dự phòng, và từ chối tên cũ.

Cùng một họ sẽ không công khai hai bộ từ vựng.

### `SDK` chỉ mang một nghĩa

`SDK` chỉ giao thức client／server dựa trên JSON-RPC mà các SDK Python và TypeScript được hỗ trợ sử dụng. Repository giữ `@deepseek-ai/dsh-sdk-client`, `@deepseek-ai/dsh-sdk-protocol` và định danh giao thức `deepseek-harness-sdk-runtime`; server JSON-RPC thuộc cùng họ này. Bản thân DeepSeek Harness không phải là một SDK, còn bộ sinh dự án, bộ khởi động, công cụ hỗ trợ và package telemetry của bộ khởi động đã bị gỡ thì tiếp tục không tồn tại.

Quyết định này thay thế một phần ba quyết định hiện hành. Nó thay thế các tên nhóm `bash/`, `pty/` và `self-modification/` được giữ lại trong [quyết định gom nhóm lại package](2026-07-29-package-regrouping.md), cùng hai tên package tạm thời. Nó chỉ thay thế cách gọi toàn bộ repository là SDK trong [gỡ bộ công cụ dự án SDK](../simplification/2026-08-11-remove-sdk-project-toolchain.md); note đó vẫn chịu trách nhiệm mô tả phạm vi xóa và phần SDK runtime được giữ lại. Nó chỉ thay thế phần lý do đặt tên package trong [chính sách timeout cho lời gọi tool](2026-07-07-tool-call-timeout-policy.md); cơ chế timeout và vị trí `guard/timeout-policy/` của nó giữ nguyên.

Nếu package, đường dẫn hay kiểu trong các ghi chú đã implemented khác bị đổi tên mà ranh giới và lý do của chúng giữ nguyên, thì quyết định này không thay thế các ghi chú đó. Những ghi chú đó dùng tên đúng với thực tế đã hiện thực. Cả ba quyết định bị thay thế một phần đều liên kết ngược về quyết định này.

### Đặt tên theo đúng trách nhiệm thực tế

Dùng danh từ phổ biến và cụ thể. Tên phải mô tả trách nhiệm ổn định, chứ không phải cách hiện thực ban đầu, thư mục hiện tại hay phần mở rộng có thể xuất hiện trong tương lai. Không được thêm từ không truyền tải thông tin gì. Không được xóa từ dùng để giới hạn phạm vi chỉ để rút ngắn tên.

Package interface đặt tên theo năng lực. Package hiện thực thêm định ngữ về cơ chế, giao thức, môi trường hoặc nhà cung cấp để phân biệt các hiện thực khác nhau. Chỉ khi việc thực thi trên cùng một host là một phần của quy ước thì mới được dùng `local`. Nếu provider chỉ đơn thuần đọc những đường dẫn trông có vẻ cục bộ qua `ctx.fs` có thể thay thế được, hoặc khởi chạy công việc qua `ctx.subprocess` có thể thay thế được, thì không được dùng từ đó.

Nếu object là một engine, runtime, policy, controller, resolver, kho lưu trữ đơn lẻ hoặc cấu hình hiện hành, hãy dùng key `ctx` số ít. Nếu object là một registry, hoặc service sở hữu nhiều thành viên có tên, hãy dùng key số nhiều. Trách nhiệm của class và số ít／số nhiều của key phải nhất quán. Bản thân key số nhiều không chứng minh được object là registry; điều đó phải do thao tác và quyền sở hữu của nó quyết định. Không được để khai báo host và client không tương thích dùng chung một key `Context` của Cordis. Ngay cả khi hai bên dùng runtime context riêng biệt, việc gộp khai báo của TypeScript vẫn nhìn thấy đồng thời cả hai kiểu. Nếu dạng số nhiều tự nhiên đã thuộc về một mặt khác, hãy thêm hậu tố trách nhiệm.

Chỉ khi không có từ trách nhiệm nào chính xác hơn mô tả trung thực được object thì mới dùng `Service`. `GoalService` và `SessionTitleService` là những tên hợp lệ được giữ lại, vì mỗi cái đều sở hữu một domain service mà công việc của nó không quy giản chính xác về lưu trữ, đăng ký hay một cơ chế thực thi đơn lẻ được.

### Từ chỉ trách nhiệm chính là quy ước

| Từ | Trường hợp phù hợp | Trường hợp không phù hợp |
|---|---|---|
| `Controller` | Object nhận lệnh hoặc ý định của người dùng, và thay đổi một trạng thái domain hoặc trạng thái trình bày đã có. Nó điều phối các chuyển trạng thái có giới hạn. | Object thực hiện công việc tùy ý, quản lý một nhóm provider, hoặc chỉ chuyển giá trị thành dạng hiển thị. |
| `Store` | Object sở hữu một tập dữ liệu, và chủ yếu cung cấp cho tập dữ liệu đó các thao tác tạo, đọc, cập nhật, xóa, snapshot hoặc đăng ký theo dõi. | Object kiểm tra máy trạng thái, thực thi quyền phán quyết, phân phối công việc, quyết định thứ tự ưu tiên của provider, hoặc điều phối nhiều domain. Việc bên trong class có một map không làm cho class đó thành một kho lưu trữ. |
| `Directory` | Object công khai các mục để phát hiện hoặc lựa chọn. Bên tiêu thụ sẽ truy vấn xem có những lựa chọn nào và đọc metadata của chúng. | Bên sản xuất có thể đăng ký hiện thực tùy ý vào đó, hoặc bên gọi thực thi công việc thông qua nó. Directory có thể được registry chống lưng, nhưng trách nhiệm đối ngoại của hai bên là khác nhau. |
| `Presenter` | Object chỉ chịu trách nhiệm chuyển giá trị domain hoặc tham số tool thành ý định render. Nó không sở hữu I/O, đăng ký theo dõi, thay đổi hay vòng đời. | Object đọc service, thay đổi trạng thái hoặc điều khiển thời điểm chạy công việc. Những trách nhiệm này thuộc về controller hoặc runtime. |
| `Registry` | Object sở hữu một tập mục đăng ký có tên và có tính động. Nó định nghĩa quy tắc tra cứu, quy tắc trùng lặp hoặc ưu tiên, vòng đời đăng ký và việc giải phóng tài nguyên. | Quy ước chính đối với bên gọi là phân phối, thực thi, hủy, thi hành policy hoặc điều phối. Runtime có thể chứa registry bên trong. |
| `Runtime` | Object chạy công việc thời gian thực. Nó sở hữu việc phân phối, hủy, phối hợp provider hoặc vòng đời thao tác xuyên suốt các lời gọi. | Object chỉ lưu bản ghi, trả về directory, phân giải một giá trị đơn lẻ hoặc giữ cấu hình. `Runtime` không phải từ thay thế đa dụng cho `Service`. |
| `Resolver` | Object tính toán hoặc định vị một câu trả lời dựa trên đầu vào được cung cấp, thường không sở hữu vòng đời của câu trả lời đó. | Object sở hữu tập hợp có thể thay đổi hoặc vòng đời thực thi chạy dài. |
| `Binder` | Object gắn một interface đã khai báo vào context hoặc vòng đời của bên gọi, và trả về giá trị đã ràng buộc. | Object sở hữu giá trị đã ràng buộc dưới dạng tập hợp, điều khiển trạng thái domain của chúng, hoặc chỉ chuyển đổi dữ liệu. |
| `Engine` | Object hiện thực một thuật toán domain hoặc một mô hình thực thi có trạng thái, ví dụ workflow, compaction hay đánh giá truy vấn. | Object chỉ chọn provider, hoặc chuyển tiếp request qua ranh giới giao thức. |
| `Policy` | Object quyết định cái gì được phép, được chọn, bị giới hạn hay được quan sát. | Object thực thi cơ chế mà quyết định cho phép. Policy và bên thực thi bắt buộc phải được đặt tên riêng. |
| `Executor` | Object chạy một request rõ ràng hoặc một spec đã phân giải trong phạm vi một năng lực. | Object sở hữu vòng đời ứng dụng rộng hoặc directory của provider. |
| `Gateway` | Object thích ứng ranh giới tiến trình, mạng, RPC hoặc API, và chuyển đổi giữa hai phía. | Object chỉ đăng ký service trong cùng tiến trình hoặc lưu metadata. |
| `Provider` | Object cung cấp một hiện thực cho một định nghĩa năng lực. Nếu có thể tồn tại nhiều provider, hãy thêm định ngữ về cơ chế hoặc nhà cung cấp. | Object là định nghĩa năng lực, registry của provider, hoặc runtime hướng tới bên tiêu thụ. |
| `Backend` | Object hiện thực một backend lưu trữ, truyền tải hoặc thực thi ở tầng dưới, có thể thay thế được, nằm sau một interface đã định nghĩa. | Object là service hướng người dùng, hoặc chỉ là một tham chiếu trả về từ một object thời gian thực nào đó. |
| `Handle` | Giá trị này là một tham chiếu tới một tài nguyên thời gian thực, và điều khiển hoặc quan sát tài nguyên đó. | Object tạo và quản lý cả một pool tài nguyên. Không được dùng `Owner` hay `Resource` mơ hồ; nếu `Handle` hoặc một trách nhiệm quản lý chính xác hơn phù hợp, thì phải dùng cái đó. |
| `Config` | Object sở hữu một giá trị cấu hình đã phân giải, hoặc một bản ghi cấu hình có ranh giới bị giới hạn chặt cùng quy ước cập nhật của nó. | Object lưu tập hợp đa dụng, thực hiện công việc, hoặc công khai các thiết lập không liên quan. |
| `Service` | Object sở hữu một domain service có trách nhiệm gắn kết, và không từ trách nhiệm chính xác nào ở trên mô tả trung thực được phạm vi trách nhiệm của nó. | Chỉ vì class kế thừa từ `Service` của Cordis mà dùng tên này, hoặc vì xác định trách nhiệm thật sự cần suy nghĩ thêm. |

Cách phán đoán thực dụng rất đơn giản. Nếu bên gọi chủ yếu gọi `register()` và nhận về hàm giải phóng tài nguyên, hãy dùng `Registry`. Nếu bên gọi chủ yếu gọi `run()`, `dispatch()`, `cancel()` hoặc `execute()`, hãy dùng `Runtime`, `Engine` hoặc `Executor`. Nếu bên gọi chủ yếu duyệt các lựa chọn, hãy dùng `Directory`. Nếu object chủ yếu ràng buộc một spec vào context và vòng đời do bên gọi sở hữu, hãy dùng `Binder`. Nếu object chỉ ánh xạ dữ liệu domain thành dữ liệu UI, hãy dùng `Presenter`. Nếu nó còn thay đổi trạng thái, thì nó không phải presenter.

### Dùng định ngữ bổ sung thêm thông tin

Nếu tên giao thức hoặc phương ngữ giúp phân biệt các hiện thực, thì phải giữ lại. Khi hiện thực phụ thuộc vào cơ chế tương ứng, hãy giữ `Bash`, `Pwsh`, `JSON-RPC`, `SQLite`, `JSONL`, `OpenTelemetry`, `Claude Code` và `E2B`. Khi mọi backend hiện tại đều đã dùng seam LLM (mô hình ngôn ngữ lớn), thì đừng thêm `LLM` vào tên backend compaction; trước khi xuất hiện một tên thuật toán cụ thể hơn, `basic` mới là cái tên trung thực và trung tính.

Không được bịa ra khái niệm `process sandbox`. Họ `sandbox` hiện tại đã đặt tên chính xác cho trách nhiệm sản phẩm của nó. Quyết định này không thay đổi trách nhiệm đó.

Từ viết tắt trong định danh PascalCase dùng dạng chỉ viết hoa chữ cái đầu: `Ui`, `Llm`, `JsonRpc` và `ApiProxy`. Trong câu chữ và trong tên package phù hợp thì dùng dạng viết hoa toàn bộ theo thông lệ: UI, LLM, JSON-RPC và API. `Typert` là cách viết sản phẩm chính xác duy nhất trong cả định danh lẫn câu chữ; không được viết thành `TypeRT`, `TypeRt`, cũng không được tách `Typert` theo cách khác ở bên trong.

Không được xóa định ngữ nhà cung cấp được giữ lại có chủ ý chỉ để tránh lặp. `dsh-subagent-dsh-sdk` chỉ provider DeepSeek Harness SDK, giúp tránh nhầm lẫn với các SDK khác. Class riêng tư của nó đổi tên thành `SdkSubagentProvider`, vì tên class còn cần nói rõ nó cung cấp cái gì.

### Ghi quy tắc vào tài liệu dự án

Hướng dẫn tạo package đi kèm `docs/cookbook/adding-a-package.md` chứa quy ước đầy đủ về từ chỉ trách nhiệm, còn `packages/AGENTS.md` liên kết tới quy ước đó. Bảng thuật ngữ và chỉ dẫn dự án ở gốc làm cho `SDK` và `Typert` mỗi từ chỉ còn một nghĩa. Agent Note này chịu trách nhiệm ghi lại lý do và các phương án bị bác; hướng dẫn chịu trách nhiệm ghi lại quy tắc mà người đóng góp cần tuân theo.

## Sổ đổi tên

Các bảng dưới đây ghi lại thay đổi về tên công khai và tên ở cấp repository. Cột `Tên hiện tại` ghi tên hiện hành. Biến cục bộ riêng tư tham chiếu cùng trách nhiệm cũng dùng cùng bộ từ vựng. Nếu việc thay thế trên diện rộng là không đúng, sổ sẽ chỉ rõ tên ở tầng dưới hoặc tên người dùng nhìn thấy được giữ lại.

### SDK runtime

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `@deepseek-ai/dsh-jsonrpc` | `@deepseek-ai/dsh-sdk-jsonrpc-server` | Nó là phía server của giao thức SDK. Chỉ dùng `jsonrpc` thì chỉ nói được cách mã hóa; còn `sdk-jsonrpc-server` nói rõ đồng thời họ, cơ chế và trách nhiệm. |
| `HarnessSdkServer` | `HarnessSdkJsonRpcServer` | Class này là một hiện thực của server JSON-RPC, không đại diện cho mọi server SDK có thể có. |

Giữ `@deepseek-ai/dsh-sdk-client`, `@deepseek-ai/dsh-sdk-protocol` và `deepseek-harness-sdk-runtime`. Loại trừ `@deepseek-ai/create-sdk`, `@deepseek-ai/dsh-scripts`, `@deepseek-ai/dsh-helper` và `@deepseek-ai/dsh-telemetry`; một quyết định gỡ bỏ riêng chịu trách nhiệm xóa các package này cùng đồ thị phụ thuộc chống lưng chúng.

### Shell và terminal

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `packages/bash/` | `packages/shell/` | Nhóm này chứa seam executor không phụ thuộc phương ngữ, hiện thực Bash và PowerShell, phần hỗ trợ môi trường cùng các công cụ shell. |
| `@deepseek-ai/dsh-bash`, `ctx.bash` | `@deepseek-ai/dsh-shell`, `ctx.shell` | PowerShell đã hiện thực seam này. Năng lực ở đây là thực thi shell, không phải Bash. |
| Các tên không phụ thuộc phương ngữ `BashExecutor`, `BashExecRequest`, `BashExecSpec`, `BashProcess`, `BashRunResult`, `BashSandboxInfo`, `BashProcessRead` và `BashProcessStatus` | Các tên `Shell*` tương ứng | Các kiểu này trải trên cả hiện thực Bash lẫn PowerShell. Kiểu ở tầng lá mô tả cú pháp hoặc hành vi Bash thì giữ `Bash`. |
| `BASH_SETTINGS_NAMESPACE`, namespace cài đặt `bash` | `SHELL_SETTINGS_NAMESPACE`, namespace cài đặt `shell` | Cả hai provider shell đều đăng ký phần cài đặt do năng lực này sở hữu. Hằng số và namespace lưu trữ bắt buộc phải dùng tên của năng lực. |
| `@deepseek-ai/dsh-bash-env`, `ctx.bashEnv`, `BashEnvRegistry` | `@deepseek-ai/dsh-shell-env`, `ctx.shellEnv`, `ShellEnvRegistry` | Công cụ Bash và PowerShell dùng chung registry môi trường này. |
| `docs/subsystems/bash.md` | `docs/subsystems/shell.md` | Trang tiểu hệ thống này ghi lại năng lực không phụ thuộc phương ngữ. |
| `packages/pty/` | `packages/terminal/` | Họ package này phụ trách các phiên terminal bền vững. Việc cấp phát PTY thô vẫn nằm ở tầng subprocess. |
| `@deepseek-ai/dsh-pty`, `ctx.pty`, `PtyService` | `@deepseek-ai/dsh-terminal`, `ctx.terminals`, `TerminalSessionService` | Bên gọi quản lý nhiều phiên terminal có tên, chứ không cấp phát PTY thô qua service này. |
| Các tên phiên và backend `Pty*` ở tầng cao được công khai | Các tên `Terminal*` | Trừu tượng công khai là phiên terminal. Giữ các tên `SubprocessTerminal*` ở tầng dưới, vì chúng đã nói rõ cơ chế bên dưới. |
| `@deepseek-ai/dsh-pty-local`, `LocalPtyBackend` | `@deepseek-ai/dsh-terminal-bash`, `BashTerminalBackend` | Provider này phụ thuộc vào prompt Bash và hành vi shell. `local` che giấu phương ngữ thực tế. |
| `@deepseek-ai/dsh-tool-pty` | `@deepseek-ai/dsh-tool-terminal` | Công cụ hướng model đã dùng `terminal_*`; package nên dùng cùng danh từ sản phẩm. |
| `tool-bash-persistent` trong họ PTY cũ | `shell/tool-bash-persistent/` | Công cụ này là công cụ Bash, nên đặt cùng với các công cụ shell. Giữ tên NPM của nó: `persistent` phân biệt nó với `bash` chạy một lần, còn `bash-terminal` sẽ gây nhầm lẫn giữa công cụ sản phẩm và họ phiên terminal. |
| `docs/subsystems/pty.md` | `docs/subsystems/terminal.md` | Trang này ghi lại phiên terminal, chứ không phải việc cấp phát PTY thô. |

Giữ các package ở tầng lá, id plugin, kiểu và công cụ chuyên cho Bash và PowerShell. Những tên phương ngữ này là chính xác.

### Language server và job

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `@deepseek-ai/dsh-lsp-local` | `@deepseek-ai/dsh-lsp-stdio` | Provider này truyền LSP qua stdio, thông qua service filesystem và subprocess có thể thay thế được. Nó không nhất thiết chạy cục bộ. |
| `packages/tasks/` | `packages/jobs/` | Họ này phụ trách các job công cụ chạy tách khỏi tiền cảnh. `jobs` ngắn gọn và tránh xung đột với khái niệm task hay todo của người dùng. |
| `@deepseek-ai/dsh-tasks`, `ctx.tasks`, `TaskService` | `@deepseek-ai/dsh-jobs`, `ctx.jobs`, `JobRegistry` | Service này đăng ký, sở hữu, quan sát, chờ và hủy nhiều job chạy nền. Nó là registry, không phải một task service đa dụng. |
| Các tên công khai `TaskId`, `TaskKindMap`, `TaskStart`, `TaskHooks`, `TaskOutcome`, `TaskSnapshot`, `TaskRead` và `TaskDoneListener` | Các tên `Job*` tương ứng | Các kiểu này thuộc domain job sau khi đổi tên. `JobId` ngắn hơn và rõ hơn `BackgroundTaskId` hay `BgTaskId`. |
| `@deepseek-ai/dsh-tasks-local`, `LocalTaskService` | `@deepseek-ai/dsh-jobs-local`, `LocalJobRegistry` | Đây là provider trong tiến trình của registry job. `local` ở đây có nghĩa rõ ràng, vì job và callback đều tồn tại trong cùng một tiến trình. |
| `@deepseek-ai/dsh-tool-tasks` | `@deepseek-ai/dsh-tool-jobs` | Bên tiêu thụ điều khiển registry job, nên dùng cùng danh từ domain. |
| `ToolTasks`, `toolTasks`, `ToolTasksConfigSchema`, `PublicTaskSnapshot`, `publicTask`, `validateTaskId` | Các tên `*Jobs`, `*Job*` và `validateJobId` tương ứng | Import, cấu hình chuyển tiếp, giá trị tool công khai và hàm hỗ trợ đều thuộc cùng một domain job. Giữ `Task` sau khi đã đổi tên package sẽ tạo ra bộ từ vựng thứ hai cho cùng một tính năng. |
| `task_output`, `task_list`, `task_kill` | `job_output`, `job_list`, `job_kill` | Các công cụ model này thao tác trên job, không phải task của người dùng. `run_in_background` trả về `JobId`. |
| `@deepseek-ai/dsh-client-ui-task`, `client/ui-task/` | `@deepseek-ai/dsh-client-ui-jobs`, `client/ui-jobs/` | Package client này trình bày tập hợp job chạy nền, chứ không phải một task của người dùng. |
| `TaskView`, khung trên đường truyền `session/tasks`, `tasksBySession` | `JobView`, khung trên đường truyền `session/jobs`, `jobsBySession` | Quy ước phía trình duyệt và bản phản chiếu của nó nên dùng cùng tên domain job như registry và tool. |
| `docs/subsystems/tasks.md` | `docs/subsystems/jobs.md` | Trang tiểu hệ thống này bắt buộc phải dùng bộ từ vựng job công khai. |

Giữ package LSP nền tảng, `ctx.lsp`, các kiểu giao thức LSP và công cụ LSP. Seam này công khai ngữ nghĩa language server một cách có chủ ý; thứ duy nhất sai là định ngữ của provider.

### Trigger đầu vào, trình bày tool, preset quyền và câu hỏi cho người dùng

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `@deepseek-ai/dsh-client-ui-slash`, `ui-slash/` | `@deepseek-ai/dsh-client-ui-input-trigger`, `ui-input-trigger/` | Client xử lý `/`, `@`, phân xử bàn phím, menu gợi ý và khởi chạy bằng chương trình, chứ không chỉ xử lý lệnh slash. |
| `ctx.slash`, `SlashService`, `SlashController`, `SlashSource` | `ctx.inputTriggers`, `InputTriggerService`, `InputTriggerController`, `InputTriggerSource` | Các tên này bao phủ mọi trigger được hỗ trợ, đồng thời giữ nguyên trách nhiệm service, controller và source hiện có. Các tên locale và kiểu công khai ghép chặt với nó cũng chuyển sang dùng `InputTrigger`. |
| `@deepseek-ai/dsh-agent-tool-mode`, plugin `tool-mode` | `@deepseek-ai/dsh-agent-tool-presentation`, plugin `tool-presentation` | Plugin này thay đổi cách tool được trình bày cho model, chứ không thay đổi hành vi thực thi. Giữ `Config.mode` cục bộ và `ToolPresentationMode`. |
| `packages/interaction/permission/` | `packages/interaction/permission-presets/` | Package này sở hữu các tổ hợp có tên của thiết lập sandbox và phê duyệt, chứ không phụ trách thực thi quyền. |
| `@deepseek-ai/dsh-permission`, `ctx.permission`, `PermissionService` | `@deepseek-ai/dsh-permission-presets`, `ctx.permissionPresets`, `PermissionPresetService` | Service này chọn và lưu preset. Service sandbox và phê duyệt mới phụ trách thực thi kết quả. |
| `@deepseek-ai/dsh-client-ui-permission` | `@deepseek-ai/dsh-client-ui-permission-presets` | UI chỉnh sửa và chọn preset quyền. |
| `docs/subsystems/permission.md` | `docs/subsystems/permission-presets.md` | Trang này ghi lại việc chọn preset, chứ không phải việc thực thi quyền. |
| `@deepseek-ai/dsh-user-interaction`, `user-interaction/` | `@deepseek-ai/dsh-user-questions`, `user-questions/` | Seam này chỉ hỗ trợ câu hỏi và câu trả lời theo lô. Phê duyệt, lệnh và chọn thư mục thuộc về các seam tương tác khác. |
| `ctx.userInteraction`, `UserInteractionService`, `UserInteractionProvider`, `UserInteractionError` | `ctx.userQuestions`, `UserQuestionService`, `UserQuestionProvider`, `UserQuestionError` | Các tên này nói rõ hình thức tương tác duy nhất được hỗ trợ. Giữ `AskUserQuestion*`, công cụ `ask_user_question` và `@deepseek-ai/dsh-tool-ask-user`. |
| `docs/subsystems/user-interaction.md` | `docs/subsystems/user-questions.md` | Trang này chỉ ghi lại câu hỏi và câu trả lời. |

Giữ `/permission`, phép chiếu `permissions`, namespace cài đặt `permission` và `permission/preset`; tất cả đều là từ vựng sản phẩm hoặc từ vựng lưu trữ chính xác. Giữ nguyên tên đầy đủ `PermissionPresetSettingsController`. Xóa `Preset` sẽ bỏ mất từ giới hạn phạm vi quyền của nó. Việc gỡ bỏ chế độ trình bày tool `both` vẫn được hoãn sang một đề xuất khác; lần đổi tên này không gỡ bỏ hành vi nào.

### Typert, API gateway và tool

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `packages/typert/type-meta/`, `@deepseek-ai/dsh-type-meta` | `typert/protocol/`, `@deepseek-ai/dsh-typert-protocol` | Package này sở hữu giao thức Typert Remote, decorator, binding, codec, logic tra cứu và quy ước context. Nó không phải metadata kiểu đa dụng. |
| `GatewayService` trong package giao thức | `TypertRemoteService` | Base class này đánh dấu các service trong cùng tiến trình cần được export ra Remote. Nó không phải API gateway. |
| Các binding `bindTypeRTGateway`, `typertGateway` | `bindTypertRemote`, `typertRemote` | Các binding này công khai service Typert Remote, chứ không phải một service API gateway cụ thể. |
| Các định danh `TypeRT*` công khai và các định danh dạng camelCase `typeRT*` | `Typert*` và `typert*` | `Typert` là cách viết sản phẩm chuẩn duy nhất. |
| Interface giao thức `TypeRTService` | `TypertRegistryContract` | Interface do giao thức này sở hữu là interface đảo ngược phụ thuộc mà class cụ thể hiện có `TypertRegistry` hiện thực. Hậu tố khác giúp tránh xung đột import và khai báo. |
| `ToolRegistry` | `ToolRuntime` | Class này sở hữu việc trình bày, policy phê duyệt và bảo vệ, phân phối, hủy, kiểm tra, kết thúc và quan sát. Đăng ký chỉ là một thành phần bên trong. |
| `ToolRegistryScheduler`, `TOOL_REGISTRY_SCHEDULER` | `ToolRuntimeScheduler`, `TOOL_RUNTIME_SCHEDULER` | Scheduler điều khiển việc phân phối của runtime, chứ không phải việc đăng ký. |

Giữ `@deepseek-ai/dsh-tools` và `ctx.tools`. Giữ `@deepseek-ai/dsh-api-gateway`, thư mục `gateway/` của nó, `ctx.typertGateway` cùng `TypertGatewayService`; service này đúng là một API gateway thực thụ. Các định danh `TypeRT*` bên trong nó vẫn phải tuân theo quy tắc viết `Typert*`.

### Chỉ dẫn workspace, telemetry, danh tính và môi trường khởi động

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| Host `ctx.workspace` | Host `ctx.workspaceRegistry` | `WorkspaceRegistry` sở hữu nhiều workspace, nhưng Client `ctx.workspaces` đã dùng một kiểu không tương thích. Ngay cả khi runtime context của hai bên độc lập, hai khai báo vẫn bị gộp vào cùng một interface `Context` của Cordis lúc biên dịch. Hậu tố trách nhiệm chỉ rõ đây là service host và tránh được xung đột đó. Giữ `@deepseek-ai/dsh-workspace`, `WorkspaceRegistry`, `Workspace` và các tên giao thức `workspace.*`. |
| `@deepseek-ai/dsh-workspace-context`, `context/workspace-context/` | `@deepseek-ai/dsh-agent-instructions`, `context/agent-instructions/` | Package này nạp các file `AGENTS.md` và `CLAUDE.md` phân tầng cho agent (tác tử). Nó không phải context workspace đa dụng. |
| Tên plugin và tên nguồn bền vững `workspace-context` và `workspace-instructions` | `agent-instructions` | Nguồn được ghi lại là một loại chỉ dẫn agent cụ thể. Thay các tên công khai `WorkspaceInstruction*` bằng `AgentInstruction*`. Thuật ngữ này không bao gồm system message, developer message hay user message. |
| `ctx.telemetry`, abstract class `Telemetry` | `ctx.sessionTelemetry`, `SessionTelemetryBackend` | Service này thu thập telemetry sổ cái của session và giao cho backend báo cáo. Nó không phải service metric hay trace ở cấp repository. |
| `TelemetryBackend` | `SessionTelemetrySink` | Đối tượng ở tầng dưới này tiếp nhận các bản ghi đã phát ra. `Sink` dùng để phân biệt nó với service backend mang tính điều phối. |
| `TelemetryCoordinator`, `TelemetryRecord`, `TelemetrySeverity`, `TelemetrySharingStatus` và `TelemetryCapture` | Các tên `SessionTelemetry*` tương ứng | Các kiểu công khai này chỉ thuộc về telemetry của session. |
| `telemetry/record` | `session-telemetry/record` | Tên event bắt buộc phải nói rõ domain mà nó thuộc về. |
| `TelemetryOtel`, `TelemetryMode`, plugin `telemetry-otel` | `OpenTelemetrySessionBackend`, `SessionTelemetryMode`, plugin `session-telemetry-otel` | Tên provider nói rõ đồng thời cơ chế OpenTelemetry và phạm vi session. Giữ tên package `dsh-session-telemetry` và `dsh-session-telemetry-otel`. |
| `docs/subsystems/telemetry.md` | `docs/subsystems/session-telemetry.md` | Trang này ghi lại telemetry của session, chứ không phải khả năng quan sát ở cấp repository. |
| `session/user-id/`, `@deepseek-ai/dsh-user-id` | `identity/anonymous-user-id/`, `@deepseek-ai/dsh-anonymous-user-id` | Giá trị này là một id tương quan ngẫu nhiên dùng chung cho telemetry, phản hồi và request DeepSeek. Nó không thuộc domain Session, cũng không phải danh tính người dùng đã xác thực. |
| `USER_ID_FILE_NAME`, `.userid`, nhãn phản hồi `User` | `ANONYMOUS_USER_ID_FILE_NAME`, `.anonymous-user-id`, nhãn phản hồi `Anonymous user` | File và UI không được ám chỉ danh tính tài khoản. Giữ hàm `AnonymousUserId` hiện có và thuộc tính OTel chuẩn `user.id`. |
| `util/environment/`, `@deepseek-ai/dsh-environment` | `util/launch-environment/`, `@deepseek-ai/dsh-launch-environment` | Package này chụp lại một snapshot phân tầng bất biến lúc khởi động. Nó không phải API môi trường đa dụng. |
| Các tên công khai `Environment*`, `createEnvironmentSnapshot`, `environmentOf`, `DSH_ENVIRONMENT_KEY` | `LaunchEnvironment*`, `createLaunchEnvironmentSnapshot`, `launchEnvironmentOf`, `DSH_LAUNCH_ENVIRONMENT_KEY` | Các tên này nói rõ vòng đời và mục đích của snapshot. |
| `ctx.launcherEnvironment` | `ctx.launchEnvironment` | Giá trị này mô tả việc khởi động ứng dụng, chứ không chỉ mô tả thành phần bộ khởi động. Giữ các nhãn nguồn `process`, `project-env` và `user-env`. |

### Lịch, workflow, goal và compaction

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `@deepseek-ai/dsh-tool-schedule`, `schedule/tool-schedule/`, plugin `tool-schedule` | `@deepseek-ai/dsh-schedule`, `schedule/schedule/`, plugin `schedule` | Package này sở hữu domain Schedule bền vững, hàng rào lưu trữ, công cụ quản trị, bộ định thời, các vòng tiếp theo và vòng đời runtime. `tool-` chỉ mô tả một phần trong đó. |
| `ScheduleOwner` | `ScheduleRuntime` | Object theo từng agent này chạy bộ định thời thời gian thực, phép chiếu lưu trữ, phân phối, chờ nhàn rỗi và giải phóng tài nguyên. `Owner` không nói lên trách nhiệm thực thi này. Các tên riêng tư `owner*` ghép chặt với nó cũng chuyển sang `runtime*`. |
| `WorkflowService`, `ctx.workflows` | `WorkflowEngine`, `ctx.workflowEngine` | Một engine phụ trách phân tích và thực thi chương trình workflow. Key số nhiều gợi ý sai rằng đây là registry. Giữ `@deepseek-ai/dsh-workflow` cùng các event và tool của workflow. |
| `@deepseek-ai/dsh-workflow-workerthread`, `WorkerWorkflowEngine` | `@deepseek-ai/dsh-workflow-worker-thread`, `WorkerThreadWorkflowEngine` | `worker thread` là cơ chế Node chính xác, quy tắc chính tả của repository yêu cầu dùng từ đầy đủ. |
| `@deepseek-ai/dsh-goal-session`, `goal/goal-session/` | `@deepseek-ai/dsh-goal-round-driver`, `goal/goal-round-driver/` | Plugin này điều khiển các Goal Round trong cùng một session. Nó không lưu goal, cũng không định nghĩa session. Giữ `GoalService`, nguồn goal, event và quy ước. |
| `packages/compact/` | `packages/compaction/` | Nhóm này là một họ domain được đặt tên bằng danh từ. `compact` vẫn là động từ lệnh hướng người dùng. |
| `@deepseek-ai/dsh-compact`, `ctx.compact`, `CompactService` | `@deepseek-ai/dsh-compaction`, `ctx.compaction`, `CompactionEngine` | Object này chạy thuật toán và vòng đời compaction. Nó là engine, không phải service đa dụng. |
| Các event `compact/*` và tiền tố domain công khai | `compaction/*` | Event và kiểu domain dùng dạng danh từ. Giữ các thao tác dạng động từ, ví dụ `compactNow`, `compactRegion` và `compactIfNeeded`. |
| `@deepseek-ai/dsh-compact-basic`, `BasicCompactService`, các tên công khai `BasicCompact*` | `@deepseek-ai/dsh-compaction-basic`, `BasicCompactionEngine`, các tên `BasicCompaction*` tương ứng | `basic` mộc mạc nhưng chính xác. `compaction-llm` không thêm thông tin gì, vì họ hiện thực hiện tại đều đã dùng LLM. |
| `@deepseek-ai/dsh-compact-tool-result-prune`, `ToolResultPruneService`, `ctx.toolResultPrune` | `@deepseek-ai/dsh-compaction-tool-result-pruner`, `ToolResultPruner`, `ctx.toolResultPruner` | Plugin này là chủ thể thực thi việc cắt tỉa kết quả tool. Danh từ `pruner` nói rõ trách nhiệm đó. |

Giữ `/compact`, package lệnh, cùng package định nghĩa compaction và package provider vốn độc lập với nhau. Đề xuất gộp các package này vẫn bị bác. Lần đổi tên này chỉ đổi từ vựng, không đổi ranh giới package đó.

### Cài đặt, credential, module client và các trách nhiệm lõi nhỏ hơn

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| Abstract class `Settings` | `SettingsProvider` | Class này cung cấp settings thông qua một năng lực có thể thay thế được. Giữ package, key và event. |
| `@deepseek-ai/dsh-settings-local`, `SettingsLocal` | `@deepseek-ai/dsh-settings-file`, `FileSettingsProvider` | Hiện thực này dùng file làm backend thông qua seam filesystem. `file` nói rõ cơ chế, còn `local` thì không. |
| Abstract class `Credentials` | `CredentialProvider` | Class này phân giải các tham chiếu credential. Giữ tên package, key và event. |
| `CredentialsLocal` | `LocalCredentialProvider` | Provider này đọc trạng thái tiến trình host và `.env`, nên việc chạy cục bộ thuộc về quy ước của nó. |
| `ClientModuleHostService`, `ctx.clientModuleHost` | `ClientModuleRegistry`, `ctx.clientModules` | Service này sở hữu nhiều module client đã đăng ký. Giữ package và `ClientModuleLoader` phía trình duyệt. |
| `AgentDefaultModelService` | `AgentDefaultModelConfig` | Object này lưu một lựa chọn model mặc định. Nó không chạy service, cũng không phải registry đa dụng. Giữ package, key, namespace cài đặt và kiểu của nó. |
| `SessionReferenceService`, `ctx.sessionReferences` | `SessionReferenceResolver`, `ctx.sessionReferenceResolver` | Nó phân giải một tham chiếu session từ URI hoặc đầu vào, chứ không sở hữu tập hợp các tham chiếu. |
| `SessionQueryService`, `SessionQuerySqlite` | `SessionQueryEngine`, `SqliteSessionQueryEngine` | Các class này thực thi mô hình truy vấn và hiện thực SQLite của nó. Giữ tên package, key và tool. |
| `@deepseek-ai/dsh-session-export`, `session-export/`, Loader id `session-export`, `ctx.sessionExport` | `@deepseek-ai/dsh-session-log-export`, `session-log-export/`, Loader id `session-log-download`, `ctx.sessionLogDownload` | Tên package npm dùng ngữ nghĩa xuất Session log, vì npm cấm tên package chứa `download`. Loader id và API trình duyệt giữ `download`, vì chúng mô tả tác dụng phụ trên trình duyệt. |
| `SessionExportDownloadController`, các kiểu trình duyệt `SessionExport*` khác, `useSessionExport`, `SessionExportHeader` | `SessionLogDownloadController`, các kiểu `SessionLogDownload*` tương ứng, `useSessionLogDownload`, `SessionLogDownloadHeaderAction` | Controller này sở hữu bước kiểm tra trước, việc gộp request trùng lặp, trạng thái popup và việc lưu trên trình duyệt. `ExportDownload` diễn đạt trùng lặp cùng một hành động, và component này đóng góp một Header action, chứ không phải toàn bộ Header. |
| `CommandService` trong package lệnh của host | `CommandRuntime` | Object này đăng ký và thực thi lệnh host xuyên suốt các lời gọi thời gian thực. Giữ package, key, kiểu và event của nó. |
| `TokenMeterService` | `TokenMeter` | Object này đo lượng token sử dụng. `Service` không bổ sung thông tin về phạm vi. |
| `LlmService` | `LlmRuntime` | Object này chọn provider và chạy các request model thời gian thực. Giữ package, key, adapter và event. |

### Web server của Host, dữ liệu session và thực thi mã

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `HttpServerService`, `ctx.httpServer` | `WebServer`, `ctx.webServer` | Server này sở hữu route HTTP và route nâng cấp WebSocket. `Web` bao được cả hai; `Http` ở đây có phạm vi quá hẹp. Giữ `packages/host/webserver`, `@deepseek-ai/dsh-host-webserver`, `WebRoute` và `WebUpgradeRoute`. |
| Nhãn tiểu hệ thống tài liệu `http-server` | `web-server` | Nhãn tiểu hệ thống bắt buộc phải cùng phạm vi với service. |
| `SessionPersistenceJsonl` | `JsonlSessionPersistence` | Đưa định ngữ hiện thực lên trước, đồng thời giữ trọn vẹn trách nhiệm năng lực. |
| `SessionPersistenceSqlite` | `SqliteSessionPersistence` | Dùng cùng thứ tự đặt tên provider như JSONL. |
| `@deepseek-ai/dsh-session-title-first-message-llm`, chu kỳ kích hoạt `first-message` | `@deepseek-ai/dsh-session-title-first-prompt-llm`, chu kỳ kích hoạt `first-prompt` | Điều kiện kích hoạt là prompt đầu tiên của người dùng, chứ không phải một message bất kỳ trong session log. |
| `@deepseek-ai/dsh-session-title-all-messages-llm`, chu kỳ kích hoạt `all-user-messages` | `@deepseek-ai/dsh-session-title-all-prompts-llm`, chu kỳ kích hoạt `all-prompts` | Backend làm mới dựa trên prompt của người dùng. `all messages` sẽ bao gồm nhầm cả message của assistant và event của tool. |
| `@deepseek-ai/dsh-code-runtime-worker`, `WorkerCodeRuntime` | `@deepseek-ai/dsh-code-runtime-worker-thread`, `WorkerThreadCodeRuntime` | Hiện thực này dùng worker thread của Node. Chỉ dùng `worker` thì phạm vi quá rộng. |
| `SubprocessService` | `SubprocessRuntime` | Service này sở hữu việc thực thi và vòng đời của các subprocess thời gian thực. Giữ package và key của nó. |
| `LocalSubprocessService` | `LocalSubprocessRuntime` | Provider này chạy tiến trình và cây tiến trình trên cùng host. |
| `E2BSubprocessService` | `E2BSubprocessRuntime` | Provider này chạy subprocess trong runtime E2B. |

Giữ trọn họ phép chiếu session và bộ từ vựng `SessionProjection*`. Phép chiếu là mô hình đọc được duy trì liên tục; `Reducer` chỉ nói được thao tác gộp của nó và sẽ làm mờ trách nhiệm cache và tra cứu. Giữ `SessionTitleService`, policy checkpoint, tên package lưu trữ, context thời gian và context tmux.

### Filesystem, skill, subagent và provider Web

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `@deepseek-ai/dsh-fs-policy` | `@deepseek-ai/dsh-fs-observation-policy` | Package này định nghĩa những quan sát filesystem nào có thể ủy quyền cho thao tác tiếp theo. Nó không phải policy filesystem hay policy sandbox hoàn chỉnh. |
| `FsPolicyExec` | `FsObservationActor` | Giá trị này biểu thị chủ thể thực thi của quan sát và thao tác mà policy gắn với. Bản thân nó không thực thi policy. |
| `SkillService` | `SkillRegistry` | Service này đăng ký provider và phân giải skill (kỹ năng) từ directory của chúng. |
| `@deepseek-ai/dsh-skill-local`, `LocalSkillProvider`, provider id `local` | `@deepseek-ai/dsh-skill-filesystem`, `FileSystemSkillProvider`, provider id `filesystem` | Provider này phát hiện file skill thông qua `ctx.fs`, vốn có thể nằm cục bộ hoặc từ xa. Cơ chế của nó là truy cập filesystem, chứ không phải tính cục bộ. |
| `SubagentService` | `SubagentRuntime` | Service này chọn provider và sở hữu hành vi spawn, khôi phục, theo dõi tiếp, hủy và quyết toán thời gian thực. |
| `@deepseek-ai/dsh-subagent-spawn`, `SpawnProvider` | `@deepseek-ai/dsh-subagent-spawn-in-process`, `SpawnInProcessProvider` | Provider này khởi chạy agent con ngay trong tiến trình hiện tại. Provider id trong cấu hình vẫn là `spawn`. |
| `@deepseek-ai/dsh-subagent-fork`, `ForkProvider` | `@deepseek-ai/dsh-subagent-fork-in-process`, `ForkInProcessProvider` | Provider này fork một agent ngay trong tiến trình hiện tại. Provider id trong cấu hình vẫn là `fork`. |
| `@deepseek-ai/dsh-subagent-inprocess`, `subagent-inprocess/` | `@deepseek-ai/dsh-subagent-in-process-driver`, `subagent-in-process-driver/` | Package này chứa logic driver in-process dùng chung, chứ không phải một provider thứ ba. |
| `SdkProvider` riêng tư, nằm trong `dsh-subagent-dsh-sdk` | `SdkSubagentProvider` | Định ngữ package lặp lại là có chủ ý, và tên class còn phải nói rõ rằng nó cung cấp subagent thông qua SDK. |
| `WebService`, `WebServiceConfig` | `WebRuntime`, `WebRuntimeConfig` | Object này chọn provider và chạy các thao tác tìm kiếm và fetch thời gian thực. Giữ package, key, package provider và tool của model. |
| `@deepseek-ai/dsh-web-fetch-local`, `LocalFetchProvider`, `LocalFetchLimits`, provider id `local-http` | `@deepseek-ai/dsh-web-fetch-http`, `HttpFetchProvider`, `HttpFetchLimits`, provider id `http` | Provider này thực hiện fetch HTTP trực tiếp. `local` chỉ nói mã tình cờ chạy ở đâu, chứ không nói nó cung cấp cơ chế nào. |

Giữ `@deepseek-ai/dsh-subagent-dsh-sdk`, provider id `dsh-sdk` của nó, họ provider ACP (Agent Client Protocol) bên ngoài, Codex và Claude Code, tên package tool của subagent, package filesystem chính và backend, tool và event của filesystem, cùng badge và package tool của skill.

### Hook, guard, Plan Mode, extension và chẩn đoán

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `@deepseek-ai/dsh-hooks-claude`, `ClaudeHookConfig`, `parseClaudeConfig`, phương ngữ `claude` | `@deepseek-ai/dsh-hooks-claude-code`, `ClaudeCodeHookConfig`, `parseClaudeCodeConfig`, phương ngữ `claude-code` | Cầu nối hook này hướng tới Claude Code, chứ không phải mọi sản phẩm Anthropic hay Claude. |
| `@deepseek-ai/dsh-repeat-tool-guard`, plugin／nguồn `repeat-tool-guard` | `@deepseek-ai/dsh-repeat-tool-reminder`, plugin／nguồn `repeat-tool-reminder` | Plugin này thêm lời nhắc cho model, chứ không chặn lời gọi tool, cũng không thi hành quyết định bảo vệ nào. |
| `@deepseek-ai/dsh-timeout-policy` | `@deepseek-ai/dsh-tool-call-timeout-policy` | Định ngữ `tool-call` đầy đủ nói rõ policy này giới hạn đối tượng nào, mà không biến plugin thành một tool hướng model. Giữ thư mục `guard/timeout-policy/` và plugin id `timeout-policy` của nó; quy ước thư mục `packages/*/tool-*` vẫn chỉ áp dụng cho package đăng ký tool. |
| `PlanModeService` | `PlanModeController` | Object này điều khiển các chuyển trạng thái vào và ra khỏi plan mode, chứ không phải một runtime thực thi đa dụng. |
| `packages/self-modification/` | `packages/extensions/` | Nhóm này chứa các công cụ kiểm tra và mount plugin của repository. `extensions` nói rõ trách nhiệm ổn định của package, mà không tuyên bố rằng agent sẽ tự sửa chính mình. Giữ tên package `tool-cordis` và tên plugin của repository. |
| `packages/support/` | `packages/test-support/` | Nhóm này chỉ chứa hạ tầng test, và đường dẫn của nó bắt buộc phải nói rõ điều đó. |
| `invariants/` trong họ support cũ | `runtime-diagnostics/invariants/` | Dù các preset được giao không bao gồm kiểm tra bất biến, chúng vẫn có thể chạy trong chẩn đoán production, nên không thuộc phần hỗ trợ test. |
| `InvariantService` | `InvariantRegistry` | Object này sở hữu các kiểm tra bất biến đã đăng ký. Giữ `@deepseek-ai/dsh-invariants` và `ctx.invariants`. |
| `packages/client/test-runtime/` | `packages/test-support/client-runtime/` | Package này là hạ tầng test phía client. Nếu tên NPM hiện có đã nói rõ quy ước này thì giữ lại. |

Giữ tên package, key, event và tool của MCP, Todo, Plan Mode. Quyết định này đổi tên class controller, chứ không đổi tên tính năng sản phẩm.

### Tiện ích, E2B, Host, package tổ hợp, ví dụ và ứng dụng

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `util/paths/`, `@deepseek-ai/dsh-paths` | `util/home-paths/`, `@deepseek-ai/dsh-home-paths` | Các hàm hỗ trợ này phân giải đường dẫn dưới thư mục home của Harness, chứ không phải một thư viện path đa dụng. Tên hàm đã mô tả chính xác đường dẫn trả về thì giữ nguyên. |
| `util/retention/`, `@deepseek-ai/dsh-retention` | `util/output-retention/`, `@deepseek-ai/dsh-output-retention` | Policy này giữ lại output của lệnh và tool, chứ không phải một framework lưu giữ dữ liệu đa dụng. |
| `E2BSandboxService` | `E2BRuntime` | Class này tạo, tái sử dụng và giải phóng môi trường thực thi E2B mà adapter filesystem và subprocess sử dụng. Trách nhiệm của nó rộng hơn một handle sandbox đơn lẻ, nhưng cụ thể hơn một owner đa dụng. Giữ `@deepseek-ai/dsh-e2b`, `ctx.e2b` và nhóm `e2b/`. |
| `@deepseek-ai/dsh-frontend-static` | `@deepseek-ai/dsh-host-frontend-static` | Package này là plugin Host phục vụ tài nguyên frontend. Tiền tố này giúp phân biệt nó với mã ứng dụng frontend. |
| `PluginInventoryService` | `PluginInventoryGateway` | Class này chỉ phụ trách thích ứng cây Loader thời gian thực sang RPC `pluginInventory/list`. Nó không sở hữu service trong cùng tiến trình, cache, lịch sử hay đường sửa đổi. `Gateway` mô tả chính xác vai trò hiện tại. |
| `@deepseek-ai/dsh-jsonrpc-demo` | `@deepseek-ai/dsh-sdk-jsonrpc-demo` | Ví dụ này minh họa việc dùng SDK runtime qua JSON-RPC, thuộc đúng nghĩa duy nhất của SDK. |
| `@deepseek-ai/dsh-frontend` | `@deepseek-ai/dsh-web-frontend` | Ứng dụng này là frontend Web. Giữ thư mục vật lý `apps/web/` của nó. |

Giữ các tiện ích atomic-write, brand, native-command, timeout, bộ chọn thư mục, `dsh-base`, `dsh-web-app`, phần khởi động ứng dụng, các tên CLI (giao diện dòng lệnh), cùng package `headless`, package tổ hợp và định danh của ví dụ. `headless` là bản chất sản phẩm được kỳ vọng, và trong tương lai cũng có thể hỗ trợ nhiều hơn việc thực thi một lần.

### Runtime client và UI

| Tên cũ | Tên hiện tại | Lý do |
|---|---|---|
| `SlotsService` | `SlotRegistry` | Object này sở hữu các khai báo slot có tên và các mục đăng ký. |
| `SessionsService` | `SessionRuntime` | Object này sở hữu trách nhiệm điều phối session client thời gian thực, chứ không phải một danh sách session thụ động. |
| `WorkspacesService` | `WorkspaceRuntime` | Object client này điều phối việc chọn và thao tác workspace thời gian thực. Nếu sổ không gọi đích danh yêu cầu đổi một key `ctx` hiện có, thì key đó giữ nguyên. |
| `WorkspaceGroupBy`, `WorkspaceOrderBy`, `workspaceExpansion`, `setWorkspaceExpanded`, `expandedProjects`, `projectLabel`, `recentSessionOrder`, `recentSessionUpdatedAt`, `syncRecentSessions`, `setRecentSessionOrder`, `retainWorkspaceKeys`, `workspaceKey` | `SessionGroupBy`, `SessionOrderBy`, `groupExpansion`, `setGroupExpanded`, `expandedGroups`, `workspaceLabel`, `sessionOrderByAccount`, `sessionUpdatedAtByAccount`, `syncSessionOrderAccount`, `setSessionOrder`, `retainAccountKeys`, `accountKey` | Các tên này mô tả trạng thái xem của danh sách session. Account của nó bao gồm cả workspace thật, mục chưa gom nhóm và danh sách phẳng. Do đó, `Workspace`, `project` và `recent` trỏ sai đối tượng hoặc sai cơ chế. Giữ `WorkspaceViewState`; store đó vẫn thuộc về trình duyệt workspace. |
| `LocaleService` | `LocaleRuntime` | Object này điều phối việc định nghĩa locale, lựa chọn, lưu trữ và phát tán thay đổi. |
| `ThemeService` | `ThemeRuntime` | Object này điều phối theme, phân giải tùy chọn, nhận biết hệ thống và phát tán thay đổi. |
| `LayoutService` | `LayoutController` | Object này điều khiển trạng thái layout UI hiện tại. |
| `@deepseek-ai/dsh-client-ui-model` | `@deepseek-ai/dsh-client-ui-model-selection` | Package này điều khiển việc chọn model cho session. Tên số ít `model` có phạm vi quá rộng. |
| `ModelService`, `ctx.models` | `ModelDirectoryResolver`, `ctx.modelDirectories` | Thao tác công khai duy nhất của nó `directoryFor(sessionId)` phân giải và giữ lại một directory cho mỗi session thời gian thực. Nó không có API đăng ký, nên dùng `Registry` là không chính xác. Mỗi `ModelDirectory` vẫn là một directory model tùy chọn hướng tới bên tiêu thụ. |
| `SettingsScopeService` | `SettingsScopeBinder` | Thao tác duy nhất của nó ràng buộc một spec namespace vào tầng truyền tải và vòng đời của bên gọi, rồi trả về `SettingsScopeController`. Giữ `ctx.settingsScope`; nó đặt tên cho một năng lực ràng buộc đơn lẻ, chứ không phải tập hợp các scope. |
| `@deepseek-ai/dsh-client-ui-models` | `@deepseek-ai/dsh-client-ui-settings-models` | Package này sở hữu bảng cài đặt Models. Giữ `ModelsSettingsStore`; nó giữ một view model cài đặt có thao tác dữ liệu và khả năng đăng ký theo dõi, đúng là một kho lưu trữ. |
| `@deepseek-ai/dsh-client-ui-plugin-config`, `client/ui-plugin-config/` | `@deepseek-ai/dsh-client-ui-settings-plugins`, `client/ui-settings-plugins/` | Package này sở hữu section cài đặt Plugins, chứ không phải một hệ thống cấu hình plugin đa dụng. Tên đích được xếp vào họ `ui-settings-*` và dùng tên sản phẩm số nhiều của section đó. |
| `PluginConfigSection`, `PluginConfigSectionProps`, `PluginConfigSectionInjected`, `PluginSettingsTabRow`, `PluginConfigKey`, `settings.pluginConfig` | `PluginsSettingsSection`, `PluginsSettingsSectionProps`, `PluginsSettingsSectionInjected`, `PluginsSettingsTabEntry`, `PluginsSettingsLocaleKey`, `settings.plugins` | Section này sở hữu phần trình bày cài đặt Plugins và danh sách tab. Giá trị metadata biểu thị một slot entry, chứ không phải một dòng render. Mỗi thẻ vẫn chỉnh sửa cấu hình của một plugin. |
| `@deepseek-ai/dsh-client-ui-plugins`, `client/ui-plugins/`, Loader id `ui-plugins`, `client-ui-plugins-invariant` | `@deepseek-ai/dsh-client-ui-settings-plugin-inventory`, `client/ui-settings-plugin-inventory/`, Loader id `ui-settings-plugin-inventory`, `client-ui-settings-plugin-inventory-invariant` | Package tham gia sau này sở hữu tab Plugin Inventory chỉ đọc trong section cài đặt Plugins. `ui-plugins` có phạm vi quá rộng, và cũng không phân biệt được danh sách này với phần cài đặt plugin chỉnh sửa được. |
| `PluginSettingsSection`, `PluginSettingsSectionProps`, `PluginSettingsSectionInjected`, `PluginsKey`, `settings.plugins` trong package `ui-plugins` cũ | `PluginInventorySettingsTab`, `PluginInventorySettingsTabProps`, `PluginInventorySettingsTabInjected`, `PluginInventoryLocaleKey`, `settings.pluginInventory` | Component này giờ đóng góp một tab, chứ không phải một section cài đặt. Các tên còn lại nói rõ chủ đề danh sách và tránh xung đột với `PluginsSettingsSection` cùng namespace locale `settings.plugins` của nó. Giữ tên slot dùng chung `settings.plugins.tab`; cả hai tab đều đóng góp nội dung vào section Plugins qua slot này. |
| `@deepseek-ai/dsh-client-ui-feedback`, `client/ui-feedback/`, Loader id `ui-feedback`, `client-ui-feedback-invariant` | `@deepseek-ai/dsh-client-ui-message-feedback`, `client/ui-message-feedback/`, Loader id `ui-message-feedback`, `client-ui-message-feedback-invariant` | Package này hiển thị điểm đánh giá và phần ghi chú cho message của assistant qua Remote `messageFeedback`. Tên cũ trông như còn bao cả command feedback và những giao diện phản hồi khác có thể xuất hiện sau này, nhưng thực tế thì không. |
| `FeedbackController`, `FeedbackStatus`, `FeedbackView`, `FeedbackActionResult`, `FeedbackInjected`, `FeedbackActionProps`, `FeedbackActions`, `FeedbackKey` trong package `ui-feedback` cũ | `MessageFeedbackController`, `MessageFeedbackStatus`, `MessageFeedbackView`, `MessageFeedbackActionResult`, `MessageFeedbackInjected`, `MessageFeedbackActionProps`, `MessageFeedbackActions`, `MessageFeedbackKey` | Các tên này được export từ package Client. Thêm định ngữ `Message` để chúng không tuyên bố đại diện cho toàn bộ domain phản hồi. Giữ `Controller`: object này nhận các thao tác đánh giá và ghi chú, đồng thời điều phối trạng thái nạp, sửa đổi, xung đột, kết nối lại và giải phóng của một Session. |
| `agent-loop-store.ts`, `bash-store.ts`, `web-search-store.ts` | `agent-loop-card-controller.ts`, `bash-card-controller.ts`, `web-search-card-controller.ts` | Mỗi module đều export một card controller. Trường `SnapshotStore` riêng tư không làm cho module trở thành kho lưu trữ. |
| `card-store.ts` | `card-form.ts` | Module này sở hữu form tạm, phép chuyển đổi trường và các thao tác của form. Snapshot store mà nó trả về là adapter trình bày, chứ không phải trách nhiệm chính của module. |
| `@deepseek-ai/dsh-client-ui-question` | `@deepseek-ai/dsh-client-ui-user-questions` | UI trình bày seam câu hỏi cho người dùng, chứ không phải một domain câu hỏi tùy ý. |
| `@deepseek-ai/dsh-client-ui-command`, `ui-command/` | `@deepseek-ai/dsh-client-ui-commands`, `ui-commands/` | Package này trình bày và chạy một tập lệnh. |
| `@deepseek-ai/dsh-client-ui-directory-picker`, `client/ui-directory-picker/`, Loader id `ui-directory-picker`, `client-ui-directory-picker-invariant` | `@deepseek-ai/dsh-client-ui-directory-picker-browse`, `client/ui-directory-picker-browse/`, Loader id `ui-directory-picker-browse`, `client-ui-directory-picker-browse-invariant` | Package client nay đã tách thành hai cách trình bày bộ chọn thư mục là `browse` và `native`. Package không có định ngữ thực chất chỉ là hiện thực browse, chứ không phải định nghĩa chung của cả hai. Tên đích nhất quán với họ backend Host, và không đổi ranh giới. |
| `ctx.command`, `CommandService`, `CommandServiceContract` phía client | `ctx.commandUi`, `CommandUiRuntime`, `CommandUiContract` | Host đã sở hữu `ctx.commands`. Service client này là runtime UI cho việc phát hiện và thực thi lệnh. `CommandUiSpec` hiện có đã xác lập cách viết hoa `Ui`. |
| `ConversationService` | `ConversationController` | Object này điều khiển trạng thái hội thoại hiện tại và các thao tác của người dùng. |
| `InputService` | `SessionInputResolver` | Interface này phân giải diện mạo đầu vào cho một phạm vi session. Nó không phải registry đầu vào toàn cục, cũng không phải service thực thi. Giữ `InputHub` làm hub cụ thể, và giữ `ctx.conversation.input` làm interface đối ngoại. |

Bên trong định danh PascalCase dùng `Ui`, không dùng `UI`. Trừ khi sổ yêu cầu đổi tên rõ ràng, các tên package client còn lại giữ nguyên. Tạm thời giữ từ vựng kết nối client và Host `ApiProxy` đã bị deprecated; mặt phẳng API sẽ thay thế chúng, mà đổi tên trên một bề mặt đã lên kế hoạch gỡ bỏ chỉ làm tăng khối lượng thay đổi.

## Các tên được giữ lại một cách rõ ràng

Những tên đã được thảo luận dưới đây giữ nguyên, vì phạm vi hiện tại là chính xác, hoặc vì đổi tên sẽ tạo ra khái niệm giả:

- Giữ trọn họ sandbox và `ctx.sandbox`. Không được đưa vào `processSandbox`.
- Giữ `@deepseek-ai/dsh-api-gateway`, `ctx.typertGateway` và `TypertGatewayService`.
- Giữ các tên phép chiếu session. Phép chiếu không chỉ là hàm quy giản.
- Giữ `@deepseek-ai/dsh-session-stats`, `sessionStats` và `SessionStatsProjection`. Các tên này biểu thị chính xác số liệu thống kê toàn session và mô hình đọc được duy trì liên tục mang chúng.
- Giữ `GoalService`; nó sở hữu máy trạng thái goal, quyền phán quyết, hành vi so sánh rồi đặt giá trị, event và thao tác từ xa, chứ không chỉ là kho lưu trữ.
- Giữ `SessionTitleService`; trách nhiệm của nó là một domain service được nhiều provider tiêu đề dùng chung.
- Giữ `PermissionPresetSettingsController`, dù nó rất dài. Mỗi từ đều đang giới hạn trách nhiệm của nó.
- Giữ `ModelsSettingsStore`; quy ước chính của nó là một mô hình dữ liệu cài đặt có các thao tác lưu trữ.
- Giữ `InputHub`; nó là hub cụ thể chống lưng cho `SessionInputResolver`.
- Giữ `dsh-subagent-dsh-sdk` và provider id `dsh-sdk`; định ngữ lặp lại giúp tránh nhập nhằng.
- Giữ `headless`; dù runtime về sau có hỗ trợ nhiều hơn việc dùng một lần, định danh sản phẩm này vẫn chính xác.
- Giữ các tên Host `ApiProxy` và kết nối client đã deprecated, cho tới khi phương án thay thế bằng API gỡ bỏ chúng.
- Cả server Host lẫn năng lực Web không phụ thuộc provider đều giữ `Web`. Chỉ provider fetch trực tiếp mới dùng `HTTP`.
- Giữ `E2B` làm tên package và tên context, không đổi thành `E2B sandbox`.
- Giữ tên MCP, Todo, phần khởi động ứng dụng, package tổ hợp nền tảng, package tổ hợp web-app và CLI. Giữ năng lực bộ chọn thư mục và tên backend Host; chỉ đổi tên phần trình bày `browse` không định ngữ ở Client.
- Giữ `@deepseek-ai/dsh-client-ui-directory-picker-native`; hậu tố của nó nói rõ đây là cách trình bày dùng bộ chọn native bên cạnh biến thể `-browse` đã đổi tên. Giữ `SURFACE_PACKAGES`; trong bộ tự chọn của directory picker, nó là ánh xạ package cho mặt trình bày phía client, và đối chiếu với `BACKEND_PACKAGES`.
- Giữ `@deepseek-ai/dsh-host-plugin-inventory`, `ctx.pluginInventory`, Remote `pluginInventory/list` cùng các kiểu payload `PluginInventory*`. Chúng đặt tên chính xác cho danh sách chỉ đọc do Host sở hữu; chỉ class adapter và tên trình bày phía client có phạm vi quá rộng mới cần sửa.
- Giữ `ConfigurablePluginsTab`. Tab này render các plugin có cấu hình chỉnh sửa được, chứ không sở hữu toàn bộ section cài đặt Plugins.
- Giữ slot dùng chung `settings.plugins.tab`. Nó thuộc về section cài đặt Plugins. Package danh sách chỉ đổi locale namespace của chính nó thành `settings.pluginInventory`, chứ không tạo ra một slot tab riêng.
- Giữ năng lực `@deepseek-ai/dsh-message-feedback`, Remote `messageFeedback`, assistant-action entry id `feedback`, hook key `feedback` và locale namespace `feedback`. Interface chứa chúng vốn đã giới hạn phạm vi về phản hồi cho message hoặc slot assistant-message cục bộ. Chỉ sửa tên package Client và tên UI được export vốn có phạm vi quá rộng.
- Giữ `RemoteFailure`, `RemoteResult` và `SessionRemotes`. Hai cái đầu là giá trị kết quả do Typert mang, cái sau là một nhóm namespace Remote mà cụm Session phía client sử dụng. Không cái nào là store, controller, registry hay runtime.
- Giữ lệnh người dùng `/export`, route Host `/api/session.export`, `DownloadsApi` và thao tác `sessionLog` của nó. Lệnh mô tả hành động của người dùng, route Host xuất bản lưu trữ, còn API thì phân loại phần tải xuống HTTP trực tiếp. Controller Client đã đổi tên sở hữu bước tải xuống độc lập trên trình duyệt.
- Tên file test giữ `.client` và `.host`. Chúng xác định mặt biên dịch mà test đi vào, chứ không tuyên bố trách nhiệm sản phẩm.

## Các phương án đã cân nhắc

**Giữ tên hiện có và thêm một bảng thuật ngữ.** Không áp dụng. Bảng thuật ngữ không làm cho cái tên `BashExecutor` do PowerShell hiện thực trở nên đúng với thực tế, cũng không làm `ToolRegistry` cho thấy nó sẽ thực thi và cưỡng chế policy tool. Bản thân định danh bắt buộc phải mang được sự phân biệt hữu ích.

**Thêm tiền tố nhóm cho mọi package NPM.** Không áp dụng. Tên NPM phẳng không cần sao chép lại cây thư mục. Thêm tiền tố một cách máy móc chỉ làm tên dài hơn, không giải thích được trách nhiệm của package.

**Gọi toàn bộ repository là SDK.** Không áp dụng. Dự án này là một agent harness (khung tác tử). SDK là stack client／server JSON-RPC được hỗ trợ mà client Python và TypeScript sử dụng. Một từ hai nghĩa sẽ khiến tên package và câu chữ sản phẩm trở nên nhập nhằng.

**Mọi class service của Cordis đều dùng `Service`.** Không áp dụng. Việc kế thừa Cordis chỉ là một sự thật về hiện thực. Tên class bắt buộc phải nói cho bên gọi biết object đó phụ trách đăng ký, lưu trữ, phân giải, điều khiển hay chạy công việc.

**Thay `Service` bằng `Runtime` một cách đồng loạt.** Không áp dụng. Chỉ khi object sở hữu việc thực thi hoặc vòng đời thời gian thực thì `Runtime` mới đúng. Registry, store, directory, controller, resolver, engine và object cấu hình đều nên giữ tên trách nhiệm chính xác hơn.

**Ưu tiên tên ngắn nhất.** Không áp dụng. Chỉ sau khi phạm vi đã rõ ràng thì ngắn gọn mới có giá trị. `PermissionPresetSettingsController` giữ `Preset`; `JobId` ngắn vì `Job` đã cho biết domain; `BgTaskId` tuy ngắn nhưng lại tối nghĩa.

**Dùng tên rộng cho những tính năng có thể xuất hiện trong tương lai.** Không áp dụng. Hãy đặt tên theo trách nhiệm hiện tại ổn định. Nếu tương lai muốn đổi ranh giới, có thể đổi tên object thêm lần nữa trước khi phát hành, hoặc viết một đề xuất khác sau khi phát hành. Cái tên mơ hồ bắt mọi người đọc hôm nay phải trả chi phí hiểu cho một tương lai chưa được xây.

**Đổi tên `dsh-compact-basic` thành `dsh-compaction-llm`.** Không áp dụng. `LLM` không thêm được sự phân biệt nào trong họ backend hiện tại. `basic` khiêm tốn hơn về ý định, và không tuyên bố có một thuật toán mà thực tế không tồn tại.

**Đổi tên phép chiếu session thành reducer.** Không áp dụng. Quy giản chỉ là cách xây dựng phép chiếu. Package này còn sở hữu giá trị mô hình đọc, cache và quy ước tra cứu.

**Đổi tên công cụ Bash bền vững thành `bash-terminal`.** Không áp dụng. Tên đó xung đột với họ phiên terminal. Chuyển `tool-bash-persistent` sang `shell/` là đủ để sửa vị trí thuộc về của nó, đồng thời tên hiện có vẫn phân biệt được nó với công cụ Bash chạy một lần.

**Vừa áp dụng sổ vừa đổi tên hoặc tách ranh giới.** Không áp dụng. Người review bắt buộc phải xác nhận được rằng hành vi không đổi. Khiếm khuyết ranh giới thực sự cần đề xuất, test và phân tích hệ quả riêng.

**Giữ alias cho tên cũ.** Không áp dụng. Không có bên tiêu thụ đã phát hành nào cần những alias này. Alias sẽ giữ lại hai bộ từ vựng, khiến lần phát hành đầu tiên mang theo một cuộc migration mà chưa từng có người dùng nào cần.

## Kiểm chứng

- Mọi ánh xạ trong sổ đều xuất hiện trong repository. Mỗi họ chỉ có một bộ từ vựng công khai; trong cùng một context Cordis không có package tương thích, alias re-export, key `ctx` trùng lặp, plugin id kép, event id kép, alias tool cũ hay resolver dự phòng.
- Hành vi runtime, ranh giới package, giá trị mặc định, policy, ngữ nghĩa lưu trữ và hành vi model đều tương đương, ngoại trừ chỗ bản thân định danh nhìn thấy được.
- Thư mục package, tên NPM, import, manifest (danh mục metadata), tham chiếu và path của TypeScript, cấu hình Cordis, plugin id, key service, event, tool, tên RPC, tên lưu trữ được sổ gọi đích danh, fixture, snapshot, ví dụ, directory được sinh ra và câu chữ hiện hành đều dùng bộ từ vựng đã hiện thực.
- Các Agent Note hiện ở trạng thái implemented dùng tên và đường dẫn đúng thực tế. Ghi chú gom nhóm lại package ghi danh sách nhóm và tên package mục tiêu, ghi chú gỡ bỏ SDK giới hạn `SDK` về giao thức runtime, ghi chú chính sách timeout ghi lý do đặt tên package.
- Hướng dẫn tạo package đi kèm chứa quy ước về từ chỉ trách nhiệm, `packages/AGENTS.md` liên kết tới quy ước đó, bảng thuật ngữ ghi lại các từ được chọn và cách viết `Typert`, còn câu chữ dự án ở gốc gọi sản phẩm là DeepSeek Harness, chứ không phải DeepSeek Harness SDK.
- Bộ công cụ dự án SDK đã gỡ tiếp tục không tồn tại.
- `pnpm run check:ci` bao phủ typecheck ở mặt phẳng mã nguồn, build, kiểm tra vệ sinh package, kiểm tra tài liệu tham khảo được sinh ra, các snapshot bị ảnh hưởng, việc ghép cặp bản dịch, `doc-sync` và lint. Smoke test cho Python runtime ở dạng phát hành và phần CI bắt buộc bao phủ runtime đã đóng gói cùng các đường dẫn nền tảng.

## Hệ quả

Repository giữ một bộ từ vựng cho mỗi họ đã đổi tên. Tên trên đĩa cũ, giá trị giao thức, tên tool và mục cấu hình được sổ gọi đích danh không còn hoạt động. Các resolver sở hữu có khả năng nhận ra cấu hình lỗi thời sẽ báo lỗi rõ ràng, thay vì chấp nhận đồng thời cả hai dạng.

Một số tên dài hơn. Từ được thêm chỉ có ý nghĩa khi nó ngăn được việc mô tả sai quyền hạn hay cơ chế. Nếu các từ trong tên không đều giới hạn trách nhiệm, thì tên dài vẫn là sai.

Hậu tố trách nhiệm không thay thế được việc kiểm tra hành vi. Hướng dẫn tạo package giữ lại cách phán đoán trực tiếp trong quyết định này: kiểm tra xem bên gọi thực hiện thao tác gì, object sở hữu vòng đời nào, và object điều khiển thất bại hay policy nào.

Các nhánh dựa trên đường dẫn cũ và symbol cũ sẽ cần giải quyết xung đột. Đây là chi phí một lần của việc gỡ bỏ từ vựng cũ trước khi phát hành mà không giữ alias tương thích.
