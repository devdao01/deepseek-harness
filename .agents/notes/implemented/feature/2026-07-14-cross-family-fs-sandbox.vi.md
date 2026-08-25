# Agent Note: sandbox file liên họ — thống nhất quyền sở hữu chính sách, nhà cung cấp fs được sandbox hóa, và sự tương đương khi nâng quyền fs

Status: implemented

[English](2026-07-14-cross-family-fs-sandbox.md) | Tiếng Việt

## Vấn đề

Ngữ nghĩa mà `SandboxMode` khai báo bao trùm cả hiệu ứng lên file system, nhưng ban đầu chỉ có `ctx.shell` cưỡng chế chính sách đó. Các công cụ fs (`write`/`edit`) thay đổi file system của host ngay trong tiến trình thông qua `ctx.fs`, nơi mà việc bao bọc argv ở mức OS về mặt cơ chế là hoàn toàn vô nghĩa — [Agent Note về sandbox](2026-07-06-sandbox.md) § Công cụ trong tiến trình đã ghi lại điều này, và để phần cưỡng chế liên họ lại như một giai đoạn tạm hoãn, kèm một câu hỏi chưa có lời đáp: cưỡng chế trong tiến trình sẽ do từng seam tự biểu đạt, hay trở thành một năng lực thống nhất của harness. Agent Note này chính là giai đoạn đó, và đưa ra câu trả lời: một quyền sở hữu chính sách dùng chung, với việc cưỡng chế theo từng seam ở đúng tầng phù hợp của mỗi họ.

Lỗ hổng này không chỉ có một hình thái read-only. Chế độ sản phẩm của một agent (tác tử) lập trình bị giới hạn là `workspace-write`: bash vốn đã có thể ghi bên dưới thư mục gốc của workspace, còn mọi thứ ngoài đó đều bị từ chối, nên một cơ chế cưỡng chế fs chỉ biết từ chối tất cả sẽ tệ hơn hẳn so với việc tắt luôn các công cụ fs — mô hình sẽ thử `write` trong workspace, bị từ chối, rồi học cách đi vòng qua heredoc của `bash`. Vì vậy cưỡng chế liên họ phải bao trùm trọn thang chế độ, bao gồm cả phép phán định chứa đường dẫn mà `workspace-write` đòi hỏi (chuẩn hóa mục tiêu; thoát ra bằng `..`/symlink/đường dẫn tuyệt đối), cùng với cùng một cách nâng quyền như bash.

Họ cưỡng chế thứ hai còn phơi bày một vấn đề quyền sở hữu trong bố cục ban đầu. Giá trị mặc định của deployment (`mode` + `workspaceRoot`) được cấu hình trên `dsh-bash-sandbox`, còn sự kiện ghi đè theo từng session là `shell/sandbox-mode`, do bộ công cụ session-mode của `dsh-shell` gấp lại và ghi. Khi fs cưỡng chế cùng một bộ chính sách đó, thì hoặc fs phải đọc cấu hình và sự kiện của bash (một họ năng lực phụ thuộc vào cấu hình của plugin ngang hàng), hoặc mỗi họ giữ một bản sao riêng — hai bản `workspaceRoot` sẽ trôi dạt thành thế giới phân mảnh mà RFC sandbox đã cảnh báo: bash bị giới hạn ở một gốc, còn fs rào quanh một gốc khác.

## Quyết định

Ba phần phối hợp với nhau, tất cả đều được kết hợp trong `cordis.yml` lá, và không phần nào chạm tới `agent-loop`.

### `ctx.sandboxPolicy` — quyền sở hữu thống nhất cho mode và gốc workspace

`packages/sandbox/sandbox-policy/` (`@deepseek-ai/dsh-sandbox-policy`) đăng ký `ctx.sandboxPolicy`, chủ sở hữu duy nhất của chính sách sandbox của deployment:

- `Config`: `mode` (union `SandboxMode` đóng, mặc định `read-only`) và `workspaceRoot` (mặc định là cwd của tiến trình, được phân giải thành đường dẫn tuyệt đối). Cấu hình sai sẽ báo lỗi rõ ràng lúc nạp.
- Sự kiện ghi đè theo từng session `sandbox/mode`, cùng với phép gấp thuần túy của nó (`effectiveSandboxMode(events)`), đường ghi (`setSandboxMode(session, mode)`) và `SANDBOX_MODES`. Sự kiện này là trạng thái chính sách — được cả hai họ tiêu thụ — nên nó thuộc về đây, chứ không thuộc seam của bất kỳ năng lực nào. Hình thái và ngữ nghĩa chỉ ghi log (log-only) của nó tuân theo tiền lệ `approval/*`.
- `resolve({ session?, mode? })` trả về `SandboxExecutionPolicy` đầy đủ cho một lời gọi: mode được phê duyệt tường minh > kết quả gấp của session > `defaultMode`, còn cwd bất biến trong session > giá trị dự phòng `workspaceRoot` đã cấu hình.
- Giữ lại các accessor `defaultMode` / `workspaceRoot` làm giá trị dự phòng của deployment và căn cứ để khai báo năng lực.

Bản thân `dsh-bash-sandbox` không còn mang bất kỳ cấu hình sandbox nào — nó inject `sandboxPolicy`, và chỉ dùng giá trị dự phòng của deployment trong đó khi được gọi trực tiếp. `dsh-tool-bash` và `dsh-tool-fs` truyền session hiện tại cho `ctx.sandboxPolicy.resolve()`, nên cả hai đều lấy được cùng một mode hiệu lực và cùng một gốc cwd trong mỗi lời gọi; preset `dsh-permission-presets` và cầu nối ACP (Agent Client Protocol) ghi qua setter đã được di trú. Các seam sở hữu việc thực thi bash và fs vẫn không phụ thuộc vào session — phụ thuộc vào session thuộc về package chính sách và bên tiêu thụ công cụ.

### `dsh-fs-sandbox` — cưỡng chế ngay bên trong nhà cung cấp

`packages/fs/fs-sandbox/` (`@deepseek-ai/dsh-fs-sandbox`) phản chiếu cách tách `bash-local`/`bash-sandbox`: `SandboxedFileSystem extends LocalFileSystem`, đăng ký làm `ctx.fs`, inject `sandboxPolicy`. Các thao tác đọc (`resolve`/`stat`/`readText`/`streamText`/`listDir`) đi thẳng qua nguyên trạng — mọi chế độ đều cho phép đọc. Hai thao tác thay đổi sẽ cưỡng chế theo mode trước khi ủy thác cho phép ghi nguyên tử kế thừa được:

- `read-only` từ chối thẳng `writeText`/`editText`.
- `workspace-write` rào mục tiêu đã chuẩn hóa trong tập gốc ghi được — `writableRoots(policy)` trong `dsh-sandbox`: gốc workspace cộng thêm thư mục tạm của nền tảng (`/tmp`, `os.tmpdir()`), mỗi cái được realpath — chính là tập mà profile Seatbelt cấp, nên hàng rào fs là phương ngữ thứ tư của cùng một ý nghĩa chế độ đó, bên cạnh các profile bwrap/Landlock/Seatbelt, và vì thế sẽ không xuất hiện sự bất đối xứng kiểu «công cụ write không ghi được `/tmp` còn bash thì được». Cách viết đường dẫn chuẩn hóa dùng đường tắt kiểm tra chứa theo từ vựng; khi Windows biểu diễn cùng một thư mục bằng đường dẫn khác biệt về hoa thường, tên file dài hoặc tên ngắn 8.3, hệ thống sẽ duyệt ngược từng cấp thư mục tổ tiên và so sánh định danh file system, thay vì làm yếu đi biên giới bằng cách đoán quan hệ chứa theo tiền tố văn bản. Mục tiêu được chuẩn hóa lại ngay lập tức trước khi ủy thác (`resolve` thực hiện realpath trên tổ tiên sâu nhất còn tồn tại), nên nếu có symlink tổ tiên bị tráo đổi kể từ lúc công cụ phân giải mục tiêu đó thì sẽ bị bắt được.
- `danger-full-access` ủy thác mà không rào.

Từ chối là `FS_SANDBOX_DENIED` có cấu trúc, mang theo mode hiệu lực — khác với `FS_PERMISSION_DENIED` (EACCES của host là thế giới đang từ chối; ở đây là chính sách đang từ chối). Không suy đoán từ văn bản: hàng rào trong tiến trình biết chính xác nó đã từ chối cái gì. Vật mang theo từng lời gọi là một `SandboxExecutionPolicy` tùy chọn ở cuối tham số của `writeText`/`editText` (phía file system tương ứng với `ShellExecRequest.sandboxPolicy`); seam này vẫn không phụ thuộc session, còn backend cục bộ trần thì bỏ qua nó. `FileSystem.sandboxMode` là sự thật về năng lực (là `undefined` ở lớp cơ sở và trên `fs-local`, là giá trị mặc định trên `SandboxedFileSystem`), nên tầng công cụ khai báo việc nâng quyền theo sự thật của tổ hợp.

Mô hình mối đe dọa được viết trong README của package: một hàng rào chính sách nằm trong mã tin cậy, nhắm vào những đường dẫn mà mô hình kiểm soát được, chứ không phải một biên kernel — thao tác là của chính seam, chỉ có đường dẫn mục tiêu là không tin cậy, nên «chuẩn hóa trước rồi phán định chứa» là đủ để phủ trọn bề mặt lời gọi này (tiền lệ «containment, not a security boundary» của `code-runtime`). Việc cách ly ở mức kernel đối với mã không tin cậy vẫn là trách nhiệm của `ctx.shell`. Điều kiện tranh chấp còn sót lại giữa lúc resolve và lúc gọi system call được thu hẹp bằng việc chuẩn hóa lại tại chỗ, và chỉ có nguyên thủy của nền tảng (`openat2` `RESOLVE_BENEATH`) mới loại bỏ được hoàn toàn, nhưng ở đây không đáng để trả giá về tính khả chuyển.

### Sự tương đương ở tầng công cụ — một dấu hiệu từ chối, một quy trình nâng quyền

`dsh-tool-fs` phân giải session hiện tại thành chính sách đầy đủ và truyền nó cho mỗi lần thay đổi, đồng thời ánh xạ `FS_SANDBOX_DENIED` thành dấu hiệu mà mô hình đã quen từ bash: `[sandbox: file access denied under <mode> mode]`. Khi `ctx.fs.sandboxMode` báo về một chế độ bị giới hạn lúc đăng ký, `write` và `edit` khai báo cùng các trường `sandbox_permissions` + `justification`, giải thích cho mô hình cùng một cách thử lại trong cùng lượt, và xử lý cùng một yêu cầu `ctx.approval` trước khi thực thi — bốn kết quả cùng văn bản fail-closed nguyên văn của chúng được kế thừa từ [Agent Note về sandbox](2026-07-06-sandbox.md) § Nâng quyền (lúc thực thi sẽ kiểm tra xem có phải là mở rộng nghiêm ngặt so với mode hiệu lực của lời gọi hay không; việc cấp quyền chỉ thay đổi mode của lời gọi hiện tại, và giữ nguyên gốc session của nó; không sinh ra bất kỳ sự kiện session mới nào).

Phần dùng chung nằm trong `dsh-sandbox`, package sở hữu kiểu mode: `WIDER_MODES`, enum mục tiêu nâng quyền, kiểm tra cặp tham số, bộ dựng dấu hiệu từ chối/nhắc, và `approveEscalation` — phần điều phối fail-closed có thứ tự. `approveEscalation` nhận một approver theo cấu trúc tối thiểu (`EscalationApprover`, generic theo kiểu agent và call-id), chứ không phải kiểu của service phê duyệt, nên `dsh-sandbox` không phát sinh phụ thuộc vào package approval hay agent: mỗi công cụ truyền `ctx.approval`, agent, call id và tên công cụ của chính nó vào làm nguyên liệu. Cả `dsh-tool-bash` lẫn `dsh-tool-fs` đều dùng chúng; cổng phát hiện trùng lặp liên file bảo đảm nguồn duy nhất không bị lệch.

Tổ hợp [`examples/acp-agent`](../../../../examples/acp-agent/cordis.yml) nạp `dsh-sandbox-policy` và `dsh-fs-sandbox`, chuyển cấu hình `mode`/`workspaceRoot` sang mục chính sách, và bỏ đi cổng chặn cũ vốn vô hiệu hóa toàn bộ stack fs khi ở chế độ bị giới hạn; `fs-observation-policy` (read-before-edit) xếp chồng lên trên đó một cách trực giao. System prompt vẫn không nêu chế độ sandbox — dấu hiệu sẽ dạy mô hình về biên giới đúng vào lúc điều đó thực sự quan trọng, theo nguyên tắc bằng chứng thời gian thực đã nêu trong Agent Note về sandbox.

### Điểm cưỡng chế: nhà cung cấp, chứ không phải intent gate

Bản phác thảo liên họ ban đầu trong Agent Note về sandbox đặt phần cưỡng chế fs lên các sự kiện `fs/write-intent`/`fs/edit-intent`. Agent Note này chuyển sang cưỡng chế trong nhà cung cấp, dựa trên hai sự thật cơ chế: intent slot là ô quyết định đơn, đến trước được trước (đã bị `dsh-fs-observation-policy` chiếm giữ, và quy ước của nó nói rõ rằng xuất hiện bên quyết định thứ hai tức là cấu hình sai), và sự kiện intent chỉ được `dsh-tool-fs` phát ra — một bên gọi trực tiếp `ctx.fs` (một plugin được Cordis mount, một công cụ tùy biến) sẽ đi vòng qua chúng, trong khi cưỡng chế ở mức nhà cung cấp thì theo cấu tạo mà phủ mọi bên gọi.

### Ngoài phạm vi

- **Chính sách mạng của `ctx.web`** — ngữ nghĩa mà `SandboxMode` khai báo chỉ bao trùm hiệu ứng lên file system; trao một núm vặn mạng chỉ dành cho web trong khi `curl` của bash vẫn thông suốt sẽ là một biên giới giả. Hãy bàn lại khi có backend bash nào cưỡng chế được chính sách mạng (bwrap `--unshare-net`, Landlock ABI v4+).
- **Bên tiêu thụ `subagent-acp`** — giai đoạn hoãn lại không đổi trong RFC sandbox.
- **Thêm gốc ghi được trong một session đơn lẻ** — chính sách sau khi phân giải mang theo một `SessionHeader.cwd` chính; `additionalDirectories` của ACP vẫn là một bài toán thiết kế riêng về cầu nối và chính sách.
- **Runtime sandbox thống nhất theo từng công cụ** — tiếp tục bị bác bỏ vì lý do đã nêu trong RFC sandbox.

## Các phương án đã cân nhắc

- **Cưỡng chế trên các sự kiện intent `fs/*` (bản phác thảo ban đầu của Agent Note về sandbox)** — bị bác bỏ vì hai sự thật cơ chế ở § Điểm cưỡng chế: slot duy nhất, đến trước được trước và đã bị chiếm, cùng việc bị đi vòng bởi bên gọi trực tiếp `ctx.fs`. Cưỡng chế ở mức nhà cung cấp phủ mọi bên gọi, và phản chiếu đúng hình thái thay hiện thực của bash.
- **Thực hiện trong `tools/pre-execute`** — bác bỏ: listener nhìn thấy chuỗi đường dẫn thô của mô hình trước khi `resolve()` chạy, nên nó sẽ phải hiện thực lại việc mặc định hóa cwd và chuẩn hóa symlink, mà vẫn còn tranh chấp với lần resolve thật. Điều này khiến nó không dùng được cho `workspace-write`, vì chế độ này cần phán định trên đường dẫn chuẩn hóa.
- **Kiểm tra nội tuyến trong `dsh-tool-fs`** — bác bỏ: chỉ phủ đường đi qua công cụ (đúng kiểu bị đi vòng như sự kiện intent), và lặp lại một tầng tri thức về resolve chồng lên trên mục tiêu chuẩn hóa vốn đã có.
- **Thêm một cờ `mode` lên `dsh-fs-local` thay vì một backend ngang hàng** — bác bỏ: sự thật về năng lực phải là sự thật của tổ hợp, đúng như `dsh-bash-local` so với `dsh-bash-sandbox`; một cờ cấu hình sẽ khiến phần khai báo của công cụ phụ thuộc vào cấu hình, trong khi họ bash đã xác lập hình thái package ngang hàng.
- **Thay đổi fs ở mức kernel thông qua tiến trình con helper bị giới hạn** — bác bỏ: mỗi lần ghi lại phải khởi động một tiến trình; vùng tới hạn đọc-khớp-ghi của `editText` sẽ buộc phải chuyển nguyên khối vào tiến trình con mới giữ được tính nguyên tử; còn bề mặt đe dọa (thao tác tin cậy, tham số đường dẫn không tin cậy) thì không cần tới kernel — một hàng rào trong mã tin cậy đã là câu trả lời trọn vẹn, trong khi việc cách ly mã không tin cậy vẫn thuộc `ctx.shell`.
- **Cấu hình chính sách theo từng họ kèm kiểm tra nhất quán lúc nạp** — bác bỏ: một sự thật mà hai nơi sở hữu, rồi vá bằng một phép kiểm tra buộc phải liệt kê mọi họ cưỡng chế trong tương lai; service chính sách khiến sự trôi dạt trở nên không thể biểu đạt, thay vì chỉ phát hiện ra nó.
- **Giữ sự kiện ghi đè trong `dsh-shell` dưới tên `shell/sandbox-mode`** — bác bỏ: sự kiện này là trạng thái chính sách được cả hai họ tiêu thụ; giữ cách đặt tên theo bash sẽ buộc `dsh-fs-sandbox` phụ thuộc vào từ vựng của bash. Ở giai đoạn tiền phát hành, việc đổi tên này là một cuộc di trú nằm trong cùng một thay đổi, kèm ghi lại snapshot, không có shim nào.
- **Import phần điều phối nâng quyền từ package approval/agent vào `dsh-sandbox`** — bác bỏ: điều đó sẽ đảo ngược phân tầng (một package từ vựng nền tảng lại phụ thuộc vào package UI/agent). Approver theo cấu trúc giữ cho logic có nguồn duy nhất trong `dsh-sandbox`, còn phụ thuộc thì nằm lại ở tầng công cụ vốn đã có sẵn chúng.
- **Một object mutation-options hợp nhất trên seam fs** (hình thái được phác thảo ban đầu cho vật mang theo từng lời gọi) — bác bỏ vì gây ma sát: nó sẽ tách `signal` vào một gói tùy chọn chỉ dành cho thao tác thay đổi, trong khi các thao tác đọc vẫn giữ tham số theo vị trí. Một `SandboxExecutionPolicy` tùy chọn ở cuối thì khớp với kiểu mang-và-bỏ-qua của bash, và giữ cho `signal` đối xứng trên toàn seam.
- **Thêm ngay quyền cấp gốc ghi được bổ sung trên `SandboxPolicy`** — vẫn hoãn như cũ: `writableRoots()` hiện được suy ra từ ý nghĩa của mode; việc cấp quyền tạm thời là bài toán phạm vi nâng quyền mà RFC sandbox để lại.

## Hệ quả

Những gì đã bàn giao — mỗi tầng ở § Kiểm thử tự ghim phần của mình:

- Dưới `read-only`, `write`/`edit` trả về dấu hiệu `[sandbox: file access denied under read-only mode]`, và đĩa không bị đụng tới; `read`/`listDir` hành xử giống `dsh-fs-local`.
- Dưới `workspace-write`, các thay đổi rơi vào bên dưới gốc workspace và thư mục tạm, còn ngoài đó thì bị từ chối; ma trận chứa — đi ngược bằng `..`, đường dẫn tuyệt đối trỏ ra ngoài, một thư mục symlink có sẵn nằm trong workspace nhưng trỏ ra ngoài, file mới tạo dưới một symlink như vậy, và các dạng bí danh tương đương của đường dẫn gốc — từ chối mọi kiểu thoát ra trên đĩa thật, đồng thời cho phép những đường dẫn mà file system xác định là cùng một thư mục.
- Một thay đổi fs bị từ chối, khi thử lại một lần kèm `sandbox_permissions` + `justification`, sẽ được nhắc qua chuỗi phê duyệt đã kết hợp; một lần cấp quyền cho phép đúng lời gọi đó chạy ở chế độ rộng hơn và phần ghi rơi xuống đĩa; rejected/cancelled/unavailable mỗi cái sinh ra văn bản fail-closed nguyên văn của nó mà không thực hiện thay đổi nào.
- Một lần chuyển preset `permission` chi phối cả hai họ cùng lúc: sau khi session đổi mode, lời gọi bash kế tiếp và thay đổi fs kế tiếp đều tuân theo mode mới từ cùng một phép gấp `sandbox/mode`.
- Các session đồng thời có gốc cwd khác nhau mang theo chính sách khác nhau qua cùng một bộ instance service; cả hai họ đều không cache gốc của một session nào đó để dùng cho lời gọi kế tiếp.
- Một lời gọi `ctx.fs.writeText` trực tiếp mà không đóng dấu theo từng lời gọi sẽ bị rào theo giá trị mặc định của deployment.
- Các trường nâng quyền trên `write`/`edit` chỉ tồn tại đúng khi `ctx.fs` được mount là loại bị giới hạn, và không tồn tại dưới `dsh-fs-local`.
- `agent-loop` không bị đụng tới — mọi thứ đều dựa trên `ctx.sandboxPolicy`, seam `ctx.fs`, phép merge `SessionEventMap` và pipeline thực thi công cụ.

Cái giá phải trả và những giới hạn đã chấp nhận:

- **Hàng rào fs là biên chính sách, chứ không phải biên kernel.** Bề mặt đe dọa của nó là những đường dẫn do mô hình chọn, chứ không phải tiến trình host đối kháng; TOCTOU còn sót lại giữa lúc resolve và lúc gọi system call được thu hẹp chứ không bị loại bỏ, và README đã nói đúng như vậy. Biên kernel vẫn thuộc về bash.
- **`dsh-bash-sandbox` phát sinh phụ thuộc cứng vào `ctx.sandboxPolicy`.** Mỗi tổ hợp có sandbox hoặc phải thêm một mục `cordis.yml`, hoặc sẽ báo lỗi rõ ràng lúc nạp — đây là một bước đặt nền có chủ đích ở giai đoạn tiền phát hành; các ví dụ được cập nhật trong cùng một thay đổi.
- **Sự tương đương giữa hàng rào và runner là suy ra được, chứ không phải được khẳng định.** Cả hàng rào fs lẫn profile Seatbelt đều lấy tập ghi được của mình từ `writableRoots`, và một unit test tương đương ghim các tập đó; một profile runner nào thay đổi tập ghi được của nó mà không đi qua hàm đó thì sẽ trôi dạt.
- **Dấu hiệu và phần dạy về nâng quyền nay phục vụ cả hai họ.** Việc đổi câu chữ là một chỉnh sửa phối hợp nằm sau một bộ dựng trong `dsh-sandbox`; cổng phát hiện trùng lặp và các snapshot đã ghim duy trì nguồn duy nhất, cái giá là fs và bash không thể cố ý tách nhau về câu chữ nếu không tách bộ dựng đó ra.

## Kiểm thử

- Unit: `dsh-sandbox` ghim thang nâng quyền, bộ dựng dấu hiệu, kiểm tra cặp tham số, và chuỗi fail-closed có thứ tự của `approveEscalation` (không mở rộng, không có approval, không có agent, từng kết quả), cộng thêm `writableRoots`/`canonicalPath`. `dsh-sandbox-policy` ghim giá trị dự phòng của deployment, việc phân giải mode/gốc theo session, thứ tự ưu tiên của mode tường minh, phép gấp/setter, việc từ chối mode lúc nạp, và độ an toàn với HMR (thay thế module nóng). `dsh-fs-sandbox` ghim hàng rào thực thi theo chính sách và ma trận chứa trên file system thật (bên trong, thư mục tạm, đường dẫn tuyệt đối ra ngoài, `..`, thư mục symlink trỏ ra ngoài, file mới tạo bên dưới nó, đường dẫn bằng đúng gốc, gốc file system, gốc kết thúc bằng dấu phân cách, các dạng bí danh tương đương), cộng thêm ghi đè theo từng lời gọi và độ an toàn với HMR. `dsh-tool-fs` ghim cổng khai báo, việc phân giải chính sách đầy đủ, ánh xạ dấu hiệu từ chối, và toàn bộ ma trận nâng quyền (cấp quyền, từ chối, không có service, không có agent, cặp tham số, chốt chặn khi không bị giới hạn). `dsh-tool-bash`, `dsh-bash-sandbox` và `dsh-permission-presets` dùng chung bộ công cụ chính sách này.
- e2e không cần khóa: một Cordis context thật tạo hai agent, với session có gốc cwd khác nhau; hệ thống chạy đồng thời các công cụ bash và fs đã phát hành chính thức, rồi kiểm chứng qua kết quả quan sát được từ bên ngoài rằng mỗi bên ghi thành công trong project của mình, còn hai lần ghi chéo project đều bị từ chối.
- Snapshot: ví dụ acp-agent kết hợp `dsh-sandbox-policy` + `dsh-fs-sandbox`; header đã ghim mang theo các trường nâng quyền fs và tên sự kiện `sandbox/mode`, ghi lại một lần.
