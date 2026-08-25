# Agent Note: Công cụ khám phá grep và glob dựa trên Bash

Status: implemented
Archived: 2026-07-27

[English](2026-07-09-bash-backed-grep-glob-discovery.md) | 中文

## Vấn đề

Harness cần các tool `glob` và `grep` hướng-tới-model, nhưng nếu triển khai chúng như các phương thức của bên cung cấp `ctx.fs`, điều đó sẽ biến một tiện ích sản phẩm cục bộ thành một hợp đồng mà mọi backend filesystem đều phải triển khai. Việc khám phá workspace cục bộ vốn phù hợp tự nhiên với luồng công việc `rg` do tiến trình hỗ trợ; backend filesystem từ xa hoặc ảo có thể công bố API tìm kiếm riêng, có thể không chia sẻ được view `ripgrep` cục bộ, hoặc hoàn toàn không hỗ trợ khám phá. Trước khi seam đọc/ghi/sửa file chứng minh nhu cầu này, v1 không nên yêu cầu mọi backend filesystem phải triển khai tìm kiếm.

Đầu ra tìm kiếm cũng chịu ràng buộc bởi hai lớp ngân sách khác nhau. Tool cần đủ đầu ra thô từ `rg` để tính ra kết quả logic ổn định; còn model thì chỉ nên nhận bản xem trước có giới hạn, và có đường phục hồi khi kết quả đã định dạng vượt quá ngân sách nội tuyến. Chính sách lưu ra đĩa (spill) chung chỉ nhìn thấy kết quả tool cuối cùng, nên không thể phục hồi các match mà tool tìm kiếm đã lược bỏ. Tool tìm kiếm phải tự chịu trách nhiệm về việc giữ lại (retention) và cố gắng lưu kết quả đã định dạng ra đĩa.

## Quyết định

`glob` và `grep` là các tool hướng-tới-model có điều kiện trong `@deepseek-ai/dsh-tool-fs-search`, được hỗ trợ bởi bash seam, không trở thành phương thức mới của `ctx.fs`. Khi load plugin, package này chạy `command -v rg >/dev/null 2>&1`: trước tiên phân giải request qua `ctx.bash.resolve(request)`, rồi chạy qua `ctx.bash.run(spec)`; nếu lệnh thoát với mã khác 0, package ghi log cảnh báo, và không đăng ký cả tool lẫn phần system prompt. Nếu probe không khởi động được, timeout, bị abort, bị kill, hoặc không sinh ra mã thoát, việc load plugin sẽ thất bại rõ ràng, vì điều đó nghĩa là executor bash bị hỏng, chứ không phải binary tùy chọn bị thiếu. Sau khi đăng ký, luồng thực thi cũng gọi tuần tự `ctx.bash.resolve(request)` rồi `ctx.bash.run(spec)`, dùng template lệnh `rg` cố định do tool lắp ráp. Lớp tool chịu trách nhiệm về schema, kiểm tra tham số, escape shell, phân tích kết quả, định dạng kết quả, giữ lại (retention), bàn giao spill kết quả đã định dạng, và khai báo timeout. Executor bash chịu trách nhiệm phân giải giá trị mặc định và giới hạn của request, thực thi subprocess, kết thúc process group, dọn dẹp môi trường, thu thập đầu ra thô, và thay thế backend giữa các triển khai bash cục bộ, sandbox hay từ xa.

Các tool này không dùng `ctx.bash.start()`, cũng không tạo task nền hiển thị cho model. Từ góc nhìn của agent loop (vòng lặp tác tử), chúng là tool tiền cảnh thông thường: chỉ khi lệnh `rg` thoát, timeout, bị abort hoặc thất bại thì lời gọi tool mới trả về. `defineTool({ timeoutMs })` khai báo ngân sách gọi tool hợp tác, và `@deepseek-ai/dsh-timeout-policy` thực thi nó qua `exec.signal`; tool sẽ chuyển tiếp tín hiệu đó tới request bash trước `resolve()`/`run()`. Timeout riêng của backend bash vẫn là lớp giới hạn an toàn thứ hai; abort nào xảy ra trước sẽ có hiệu lực.

Các tool này khiến `path` nhất quán với tool tìm kiếm của Claude Code, nhưng ràng buộc việc phân giải vào bash workdir, chứ không phải `ctx.fs`. Tool suy ra workdir cho request bash từ `exec.agent?.session.header.cwd`, nhất quán với `dsh-tool-bash` và `dsh-tool-fs`; nếu phiên không có cwd, nó bỏ qua `request.workdir`, để backend bash áp dụng cwd đã cấu hình hoặc cwd của tiến trình qua `resolve()`. Với `grep`, `path` là mục tiêu ripgrep tùy chọn, có thể là file hoặc thư mục; khi bỏ qua thì dùng bash workdir đã phân giải. Với `glob`, `path` là thư mục gốc tìm kiếm tùy chọn; khi bỏ qua cũng dùng bash workdir đã phân giải. Giá trị `path` tương đối được phân giải dựa trên workdir đó. Khi có thể, đường dẫn trả về sẽ hiển thị dạng tương đối so với bash workdir đã phân giải; những đường dẫn này chỉ được bảo đảm có thể đọc tiếp khi triển khai đồng vị trí, tức bash workdir và gốc filesystem `read` trỏ vào cùng một workspace. v1 ghi lại yêu cầu triển khai này nhưng không thực hiện xác thực runtime xuyên dịch vụ. Tìm kiếm filesystem từ xa hoặc ảo tạm hoãn cho tới khi hình thành hợp đồng workspace/gốc dùng chung hoặc backend tìm kiếm riêng của bên cung cấp.

Package này không tiêm `fs`, mà tiêm `tools`, `systemPrompt` và `bash`; nó có chủ đích đọc `spillStore` bằng `ctx.get('spillStore')` thay vì tiêm tĩnh, vì việc lưu kết quả đã định dạng ra đĩa là tính năng tùy chọn. Các triển khai `@deepseek-ai/dsh-tool-fs` hiện có chỉ cần `read`/`write`/`edit` thì không cần load bash. Còn triển khai có load tính năng tìm kiếm thì phải đảm bảo executor bash có thể dùng `rg`, các tool này mới xuất hiện trong schema hiển thị cho model.

### Cấu trúc package

Package v1 giữ tinh gọn. Bố cục mã nguồn bên trong `@deepseek-ai/dsh-tool-fs-search` như sau:

```text
src/index.ts
src/glob.ts
src/grep.ts
src/search-core.ts
src/shell-quote.ts
```

`glob.ts` và `grep.ts` mỗi file chịu trách nhiệm kiểm tra tham số, dựng lệnh, phân tích kết quả, định dạng và đăng ký của riêng mình. `shell-quote.ts` là module hỗ trợ dùng chung, vì việc escape shell là ranh giới an toàn mà cả hai tool đều phải đi qua; `search-core.ts` là module dùng chung khác (bản sửa đổi so với phương án bốn file ban đầu khi triển khai): từ vựng lỗi `SEARCH_*`, chạy bash và lấy đầu ra thô, bàn giao spill kết quả đã định dạng, và hiển thị tương đối theo workdir, đều giống hệt nhau ở cả hai tool. Nếu lặp lại toàn bộ pipeline tinh vi này ở mỗi tool, đó chính là kiểu thiếu extraction mà quy ước đối xứng chỉ ra. Bộ dựng lệnh cấm tự ghép escape riêng, và cấm nối trực tiếp giá trị chưa escape do model kiểm soát vào lệnh shell.

### Schema và cấu hình

`glob` công bố hình dạng khám phá tinh gọn:

```ts
interface GlobArgs {
  pattern: string
  path?: string
}
```

`grep` công bố hình dạng tối giản kiểu OpenCode:

```ts
interface GrepArgs {
  pattern: string
  path?: string
  include?: string
}
```

Ngân sách thông thường không đi vào schema hiển thị cho model. `@deepseek-ai/dsh-tool-fs-search` có các trường cấu hình sau, có giá trị mặc định và được kiểm tra hợp lệ:

| Trường | Mặc định | Vai trò |
|---|---:|---|
| `globMaxResults` | `100` | Số đường dẫn tối đa được giữ lại nội tuyến; nhất quán với giới hạn kết quả mặc định của `GlobTool` trong Claude Code. |
| `grepMaxMatches` | `250` | Số match phẳng tối đa được giữ lại nội tuyến; nhất quán với `head_limit` mặc định của `GrepTool` trong Claude Code. |
| `grepMaxLineBytes` | `2000` | Số byte tối đa giữ lại cho mỗi bản xem trước dòng match, áp dụng qua `TextRetainer({ kind: 'head', maxBytes: grepMaxLineBytes })`. |
| `rawOutputMaxBytes` | `20000000` | Số byte tối đa của stdout `rg` thô mà tool sẽ phân tích; nhất quán với buffer thô ripgrep của Claude Code. |
| `timeoutMs` | `30000` | Timeout gọi tool gắn vào cả hai định nghĩa tool và được `@deepseek-ai/dsh-timeout-policy` thực thi. |

`globMaxResults` và `grepMaxMatches` dùng `ItemRetainer({ kind: 'head' })`. `grepMaxLineBytes` áp dụng cho mỗi dòng match bằng `TextRetainer({ kind: 'head', maxBytes: grepMaxLineBytes })`, giúp việc cắt bản xem trước giữ ranh giới UTF-8. Điều này theo đúng ánh xạ của [thư viện giữ lại kết quả tool](../architecture/2026-07-06-tool-result-retention-library.md) cho các mục khám phá: thu thập kết quả đầy đủ, giữ lại các mục đầu trong kết quả nội tuyến, và đặt việc ánh xạ đường dẫn, gom nhóm, xem trước theo dòng ở bên ngoài retainer. `grep` v1 không công bố `case_insensitive`, `head_limit`, `offset`, `count`, nhiều dòng, dòng ngữ cảnh, chế độ đầu ra hay bộ lọc loại file. Nếu model cần ngữ cảnh xung quanh, có thể dùng `read` để đọc file chứa match; nếu cần kết quả tiếp theo, hãy làm theo gợi ý truy xuất trong locator spill được trả về.

Các con số của Claude Code chỉ là điểm tham chiếu cho hai lớp ngân sách, không phải tiền lệ cho schema hiển thị cho model. Tool tìm kiếm chuyên dụng của họ đệm tối đa 20 MB đầu ra ripgrep thô để xử lý nội bộ; dùng timeout ripgrep 20 giây trên nền tảng không phải WSL, 60 giây trên WSL, sau đó mới áp giới hạn riêng cho tìm kiếm trước khi model thấy kết quả: `GrepTool` mặc định `head_limit = 250`, và lưu bền vững kết quả đã định dạng vượt quá 20.000 ký tự; `GlobTool` mặc định tối đa 100 đường dẫn, và lưu bền vững kết quả đã định dạng vượt quá 100.000 ký tự. Agent Note này dùng cùng buffer thô và số lượng mặc định nội tuyến đó, đặt timeout tìm kiếm mặc định là 30 giây, và khôi phục kết quả đã định dạng qua đường `ctx.spillStore.saveText()` của harness này.

Trường `path` theo cùng cách phân biệt như Claude Code: `grep.path` là mục tiêu ripgrep dạng file hoặc thư mục, `glob.path` là gốc tìm kiếm thư mục. v1 không công bố tham số cwd/workdir riêng cho các tool này.

`include` là bộ lọc glob dương tính, không phải danh sách, cũng không phải cú pháp loại trừ. Hệ thống từ chối trước các mẫu include phân tách bằng dấu phẩy hoặc phủ định, và trả về lỗi tham số có cấu trúc. Mọi giá trị do model kiểm soát dùng trong lệnh shell, bao gồm `pattern`, `path` và `include`, đều phải đi qua module hỗ trợ escape shell riêng của package.

### Thực thi

`glob` dựng lệnh `rg --files` cố định, dùng gốc thư mục tìm kiếm đã phân giải làm gốc (dùng `path` nếu được cung cấp, ngược lại dùng bash workdir): `rg --files --glob <pattern> --sort=modified --no-ignore --hidden`, cộng thêm loại trừ đối với các metadata VCS `.git`, `.svn`, `.hg`, `.bzr`, `.jj` và `.sl`. Điều này vừa nhất quán với việc khám phá file ẩn/bị bỏ qua và sắp xếp theo thời gian sửa đổi của Claude Code, vừa tránh việc tìm kiếm rộng bao gồm cả file nội bộ VCS. Tool phân tích từng dòng đường dẫn, khi có thể sẽ ánh xạ kết quả thành đường dẫn tương đối so với bash workdir, đẩy từng đường dẫn vào `ItemRetainer({ kind: 'head', maxItems: globMaxResults })`; khi kết quả giữ lại đạt giới hạn, nó sẽ định dạng danh sách đường dẫn đầy đủ đã sắp xếp làm sản phẩm spill.

`grep` dựng lệnh `rg --json` cố định theo từng dòng, chạy trên mục tiêu file/thư mục được cung cấp (dùng `path` nếu có, ngược lại dùng bash workdir), nhờ đó phân tích được đường dẫn file, số dòng và nội dung dòng mà không cần tách theo dấu hai chấm. Nó tiêu thụ bản ghi `match`, coi JSON sai định dạng hoặc bản ghi match sai định dạng là `SEARCH_FAILED`; khi có thể, ánh xạ đường dẫn kết quả thành đường dẫn tương đối so với bash workdir; áp dụng giữ lại bản xem trước theo dòng qua `grepMaxLineBytes`, đẩy từng match vào `ItemRetainer({ kind: 'head', maxItems: grepMaxMatches })`, sau đó chỉ gom nhóm theo file các match đã giữ lại trong đầu ra nội tuyến. Sản phẩm spill lưu danh sách match đã định dạng đầy đủ, chứ không chỉ phần đuôi bị lược bỏ, nên gợi ý truy xuất trỏ tới cùng kết quả logic mà model đã thấy.

Đầu ra thô của `rg` là chi tiết truyền tải nội bộ. Tool yêu cầu `stdoutMaxBytes: rawOutputMaxBytes`, và phân giải qua `ctx.bash.resolve()`; chỉ khi executor trả về stdout không bị cắt trong giới hạn đó, tool mới phân tích `stdout.text`. Nếu stdout vượt quá `rawOutputMaxBytes`, hoặc executor vẫn trả về `stdout.truncated`, tool sẽ thất bại với lỗi tìm kiếm rõ ràng, yêu cầu model thu hẹp `pattern`, `path` hoặc `include`. Tool không bao giờ công bố đầu ra `rg` thô hoặc đường dẫn spill thô của bash cho model.

Chỉ stdout là nguồn phân tích. Đối với mẫu không hợp lệ, `rg` biến mất tại runtime sau khi đăng ký, và các lỗi tìm kiếm, stderr đóng vai trò văn bản chẩn đoán; nếu bash cắt stderr, tool sẽ dùng phần đuôi stderr đã giữ lại và thêm ghi chú cắt bớt, không đọc `stderr.spillPath`.

Nếu `ctx.bash.run()` báo `aborted` do timeout của tool hoặc trigger hủy từ bên gọi, tool sẽ trả về thất bại có cấu trúc, thay vì giả vờ không có match. Nếu timeout riêng của bash xảy ra trước, tool cũng sẽ thất bại với thông báo timeout rõ ràng. Tool chịu trách nhiệm về ngữ nghĩa thoát khác 0 của ripgrep: mã thoát 0 nghĩa là có match và thành công; mã thoát 1 nghĩa là không có match nhưng thành công; mẫu không hợp lệ, `rg` biến mất tại runtime, hoặc không thể truy cập workdir tìm kiếm nghĩa là thất bại.

Thất bại tìm kiếm dùng lớp con `HarnessError` và mã `SEARCH_*` riêng của package, chứ không dùng `FsErrorCode`, vì các tool này không phải là thao tác của bên cung cấp `ctx.fs`. Từ vựng v1 gồm `SEARCH_INVALID_PATTERN`, `SEARCH_FAILED`, `SEARCH_RAW_OUTPUT_OVERFLOW` và `SEARCH_ABORTED`. Lỗi kiểm tra tham số của model như thiếu trường bắt buộc, chuỗi rỗng, hoặc giá trị `include` dạng phủ định/danh sách không được hỗ trợ, vẫn được xử lý như lỗi tham số tool thông thường.

### Lưu kết quả đã định dạng ra đĩa (spill)

`ctx.spillStore` là dịch vụ tùy chọn, chỉ dùng cho kết quả đã định dạng hướng-tới-model. Đây là mẫu lời gọi spill do chính tool sở hữu đầu tiên trong codebase; thiết kế này có chủ đích, vì việc giữ lại của tìm kiếm thuộc chính sách cấp mục: `globMaxResults` giới hạn số đường dẫn, `grepMaxMatches` giới hạn số match, và lúc này tool vẫn đang giữ kết quả logic đầy đủ. `dsh-spill-policy` chung sẽ giới hạn số byte văn bản cuối cùng ở giai đoạn `tools/post-execute`; lúc đó tool tìm kiếm đã lược bỏ các đường dẫn hoặc match tiếp theo, chính sách không thể phục hồi chúng.

Khi số kết quả logic do tìm kiếm sinh ra vượt quá giới hạn nội tuyến, và `ctx.spillStore` tồn tại, tool sẽ lưu kết quả đã định dạng đầy đủ qua `saveText()`. Chủ sở hữu spill là id header phiên của agent gọi (`exec.agent?.session.header.id`); khi thiếu chủ sở hữu đó, việc tìm kiếm sẽ giữ lại kết quả nội tuyến, và báo rằng kết quả đầy đủ không thể lưu. Nguồn gốc spill là danh tính thực thi tool: `{ toolName: exec.name, callId: exec.callId, label: 'result' }`. Tên file gợi ý là `grep-results.txt` và `glob-results.txt`; backend spill vẫn coi chúng là gợi ý, không phải đường dẫn.

Nếu kho lưu spill không tồn tại, lời gọi không có chủ sở hữu phiên, hoặc việc lưu thất bại, tool vẫn trả về trang nội tuyến và footer, nêu rằng kết quả đầy đủ không thể lưu. Việc kho lưu spill kết quả đã định dạng không khả dụng không bao giờ được biến một tìm kiếm thành công thành kết quả `isError`.

Luồng đầu ra thô của bash và sản phẩm spill tìm kiếm đã định dạng là hai sản phẩm khác nhau. Stdout thô của `rg` chỉ được phân tích trong bộ nhớ, trong giới hạn stdout bash đã yêu cầu; sản phẩm spill đã định dạng là locator phục hồi ổn định, hướng-tới-model, do `ctx.spillStore.saveText()` sinh ra.

### Hình dạng kết quả

Kết quả `glob` bị giới hạn kèm spill định dạng thành công sẽ trả về trang nội tuyến cùng thông báo spill:

```text
<first N paths>

(Showing N of M paths. Full sorted result stored at: /.../session-abc123/9f8e7d-glob-results.txt. Use read with offset/limit, or grep this path to search within it.)
```

Kết quả `grep` bị giới hạn kèm spill định dạng thành công sẽ trả về các match bản xem trước đã gom nhóm cùng thông báo spill:

```text
Found N of M matches

<file>
Line 12: ...

(Full grep result stored at: /.../session-abc123/9f8e7d-grep-results.txt. Use read with offset/limit, or grep this path to search within it.)
```

Nếu kết quả logic đầy đủ không vượt quá giới hạn nội tuyến, hệ thống sẽ không tạo sản phẩm spill định dạng. Nếu kết quả logic đầy đủ quá lớn nhưng không thể spill định dạng, footer sẽ nêu rằng kết quả đã bị giới hạn, kết quả đầy đủ không thể lưu. Số lượng `truncated`/bị lược bỏ là sự thật về ngân sách, không có nghĩa là tìm kiếm không hoàn chỉnh; timeout, biểu thức chính quy không hợp lệ, `rg` biến mất tại runtime, không thể truy cập workdir, tràn đầu ra thô, bỏ qua file nhị phân và lỗi phân tích, vẫn thuộc phạm vi lỗi hoặc trường không hoàn chỉnh của tool.

## Các phương án thay thế đã cân nhắc

**Đặt `glob`/`grep` trên `ctx.fs`.** v1 không dùng: điều này buộc mọi backend filesystem phải thêm API tìm kiếm, và biến hành vi ripgrep cục bộ thành một phần của seam bên cung cấp. Tìm kiếm là hành vi sản phẩm hữu ích, nhưng không thuộc nguyên thủy lưu trữ văn bản chung như `readText` hay `writeText`.

**Spawn ripgrep trực tiếp từ `dsh-fs-local`.** v1 của Agent Note này không dùng: spawn trực tiếp cho ranh giới argv gọn nhất, kiểm soát stdout/stderr và dừng sớm, nhưng sẽ lặp lại những gì bash seam đã đảm nhiệm, gồm dọn dẹp môi trường, kết thúc process group, truyền lan timeout, thay thế sandbox/executor từ xa, và thu thập đầu ra có giới hạn. Nếu tìm kiếm dựa trên bash bị chứng minh là phụ thuộc quá nhiều vào chuỗi shell, hoặc phải hỗ trợ đầu ra streaming tiền cảnh, phương án này vẫn là tối ưu hợp lý.

**Streaming dừng sớm qua `ctx.bash.start()`.** Không dùng: `start()` tạo ra ngữ nghĩa task nền hiển thị cho model, gồm task id, token chủ sở hữu, `bash_output`, `bash_kill`, thông báo hoàn tất, và không có timeout tích hợp. `grep` cần kết quả tool tiền cảnh, không phải luồng công việc bash nền.  Nếu sau này bắt buộc phải streaming tìm kiếm, trừu tượng đúng là thêm handle tiến trình streaming tiền cảnh vào seam bash/process, chứ không mượn API task nền công khai.

**Công bố đường dẫn spill thô của bash cho model.** Không dùng: đường dẫn spill thô của bash chứa stdout `rg` thô (với grep là bản ghi `rg --json`), không phải kết quả tìm kiếm đã định dạng ổn định. Tìm kiếm chỉ coi stdout thô là truyền tải nội bộ; model phục hồi bằng kết quả đã định dạng lưu qua `ctx.spillStore.saveText()`.

**Thêm `spillStore.saveFile()` trước cho việc chuẩn hóa đầu ra bash.** v1 của Agent Note này không dùng: khi chuẩn hóa bash trong tương lai, `saveFile()` có thể giúp di chuyển file spill do executor hiện có tạo ra vào kho lưu spill phạm vi phiên, nhưng tìm kiếm chỉ cần lấy stdout `rg` thô có giới hạn trong bộ nhớ trước khi tạo sản phẩm hướng-tới-model. `saveText()` đã đủ để lưu kết quả tìm kiếm đã định dạng.

**Dựa vào `dsh-spill-policy` chung.** Không dùng: spill post-execute chung chỉ nhìn thấy kết quả tool cuối cùng. Nếu `grep`/`glob` trả về trang đầu tiên nội tuyến, chính sách chung không thể phục hồi kết quả bị lược bỏ. Tool tìm kiếm phải tự lưu kết quả đã định dạng đầy đủ trước khi trả về văn bản có giới hạn cho model.

**Công bố schema `GrepTool` đầy đủ của Claude Code.** v1 không dùng: `output_mode`, cờ ngữ cảnh, nhiều dòng, `head_limit`, `offset`, `case_insensitive` và bộ lọc loại sẽ biến giao diện hướng-tới-model thành một lớp bọc ripgrep. Harness này giữ ngân sách thông thường và cơ chế tiếp tục ở chính sách triển khai và sản phẩm spill.

**Giữ tìm kiếm dừng sớm và bỏ qua sản phẩm spill định dạng.** Đề xuất này không dùng: dừng sớm hiệu quả hơn, nhưng không cho model đường để kiểm tra kết quả tiếp theo. v1 được chọn ưu tiên khả năng phục hồi kết quả và sự đơn giản khi triển khai, với `timeoutMs`, `rawOutputMaxBytes`, giới hạn backend bash và sản phẩm spill định dạng làm dự phòng an toàn.

**Mở rộng bash seam trước, thêm reader đầu ra thô.** Không dùng: một API `readRawOutput(ref, maxBytes)` có thể di động sẽ thêm vòng đời tham chiếu, quyền hạn và ngữ nghĩa lưu trữ ở backend. Request `stdoutMaxBytes` theo từng lần chạy là seam hẹp hơn: tìm kiếm hoặc nhận stdout đầy đủ trong `rawOutputMaxBytes`, hoặc thất bại rõ ràng.

**Luôn đăng ký, chỉ báo thiếu `rg` khi thực thi.** Không dùng: schema tool hiển thị cho model là lời cam kết rằng triển khai có thể thử năng lực đó. Nếu executor bash không tìm thấy ripgrep lúc load, giao diện an toàn hơn là hoàn toàn không có tool `glob`/`grep` hoặc hướng dẫn prompt. Với trường hợp môi trường thay đổi sau khi đăng ký, việc phân loại thiếu `rg` tại thời điểm thực thi vẫn đóng vai trò fallback phòng thủ.

## Kiểm thử

- Test bao phủ việc dò `rg` lúc đăng ký (dò thành công sẽ đăng ký hai tool và phần system prompt; dò khác 0 sẽ bỏ qua tool và phần system prompt và phát cảnh báo; dò thất bại do hạ tầng sẽ từ chối load plugin), chứng minh `exec.signal` bị abort sẽ tới được backend bash (qua assertion tham chiếu spec giống nhau và kết quả `SEARCH_ABORTED`), và bao phủ việc dựng lệnh/escape (mẫu độc hại, đường dẫn có khoảng trắng, giá trị bắt đầu bằng dấu gạch ngang, dấu ngoặc kép, xuống dòng, ký tự đại diện glob: cả assertion đơn vị lẫn round-trip `bash -c` thật cho từng giá trị độc hại), dùng `grep.path` làm mục tiêu file và thư mục, dùng `glob.path` làm gốc tìm kiếm thư mục, xử lý mẫu không hợp lệ, không có match, đầu ra `rg --json` sai định dạng, cắt bản xem trước dòng match, tràn đầu ra thô, timeout/abort, spill định dạng thành công/thất bại, mã lỗi `SEARCH_*` riêng của package, và bất biến không có task nền.
- Bao phủ trực tiếp tiền lệ spill do tool bậc nhất tự sở hữu: backend spill tồn tại, backend spill thiếu, `saveText()` thất bại, và thiếu chủ sở hữu spill.
- Package này bao phủ hình dạng export của plugin namespace (`name`, `inject`, `Config` và `apply`, không có default export) qua đường Loader thật.
- Integration test với executor thật (`dsh-bash-local` + `rg` thật) xác thực thế giới bên ngoài: mẫu độc hại vẫn ở trạng thái lười (inert), phân giải cwd theo từng phiên, loại trừ metadata VCS, sắp xếp theo thời gian sửa đổi, và phân loại stderr ripgrep thật. Nếu PATH của tiến trình test không có `rg`, test này sẽ tự bỏ qua (biện pháp tương thích CI tương tự việc bỏ qua e2e không có key); test executor giả bao phủ việc thiếu `rg` lúc đăng ký và lúc thực thi, và được cổng độ phủ 100% theo từng file bảo đảm.
- Vẫn còn khoảng trống snapshot cho thông báo spill hiển thị trong transcript: khi tính năng này được merge đã ghi lại giải thích khoảng trống, không có snapshot. Lớp snapshot phát lại cây acp-agent; thêm plugin tìm kiếm vào đó sẽ thay đổi system prompt đã lắp ráp, buộc phải ghi lại lại mọi kết quả kỳ vọng bằng key thật, mà môi trường triển khai không có key. Văn bản transcript chính xác của thông báo spill được cố định bởi unit test (`formatGlobOutput`/`formatGrepOutput` và các test spill chạy qua registry); phiên tiếp theo có key nên gắn plugin vào cây acp-agent và chạy một lần `test:snapshot:record`.

## Hệ quả

- `glob` và `grep` là các tool hướng-tới-model có điều kiện trong `@deepseek-ai/dsh-tool-fs-search`, không phải phương thức của bên cung cấp `ctx.fs`, cũng không thuộc plugin gốc `@deepseek-ai/dsh-tool-fs` hiện có. Chỉ đăng ký khi executor bash tìm thấy `rg`; package này tiêm `tools`, `systemPrompt` và `bash`, không tiêm `fs`, và giữ `ctx.spillStore` tùy chọn, đọc bằng `ctx.get('spillStore')`.
- Schema nghiêm ngặt là `glob(pattern, path?)` và `grep(pattern, path?, include?)`; giới hạn tìm kiếm và timeout là các trường Config có giá trị mặc định và được kiểm tra hợp lệ (`globMaxResults`, `grepMaxMatches`, `grepMaxLineBytes`, `rawOutputMaxBytes`, `timeoutMs`).
- Tool thực thi qua `ctx.bash.resolve(request)` → `ctx.bash.run(spec)`, chuyển tiếp `exec.signal`, không bao giờ gọi `ctx.bash.start()`, cũng không bao giờ công bố task id của bash. Nếu `exec.agent?.session.header.cwd` tồn tại, workdir của request bash lấy từ đó; `spec.workdir` đã phân giải quyết định việc thực thi và hiển thị đường dẫn tương đối.
- Tool yêu cầu bash seam `stdoutMaxBytes: rawOutputMaxBytes`, chỉ phân tích stdout không bị cắt trong giới hạn, và coi đầu ra thô vượt giới hạn hoặc vẫn bị cắt là thất bại tìm kiếm rõ ràng; không bao giờ công bố đầu ra `rg` thô cho model.
- Khi khả dụng, kết quả đã định dạng đầy đủ nhưng quá lớn sẽ được lưu qua `ctx.spillStore.saveText()`, còn kết quả nội tuyến vẫn có giới hạn; khi spill thất bại, backend thiếu hoặc thiếu chủ sở hữu, hệ thống giữ lại kết quả nội tuyến và báo phần còn lại chưa được lưu, không bao giờ trả về `isError`.
- README của package, thư mục cấu hình được sinh ra và JSDoc export sẽ ghi lại các trường Config và mã `SEARCH_*`; ví dụ tui-agent sẽ cung cấp plugin tool có điều kiện (cây acp-agent chờ hoàn tất việc ghi lại snapshot nói trên); README nhóm fs sẽ ghi lại tính khả dụng của `rg` cũng như yêu cầu triển khai đồng vị trí bash/filesystem.

## Rủi ro

Ở chế độ mẫu rộng, `grep` chạy đầy đủ có thể chậm hơn tìm kiếm dừng sớm. v1 chấp nhận chi phí này để đơn giản hóa triển khai và phục hồi kết quả đầy đủ, đồng thời ràng buộc bằng timeout của tool, timeout của bash, `rawOutputMaxBytes` và giới hạn đầu ra. Nếu thực tế chạy quá chậm, vẫn có thể dùng ripgrep trực tiếp hoặc phương án streaming tiền cảnh thay thế.

Việc dựng lệnh shell là ranh giới an toàn nhạy cảm nhất. `ctx.bash` nhận chuỗi lệnh thay vì vector argv, nên triển khai phải tập trung xử lý escape shell, và test với mẫu độc hại, đường dẫn có khoảng trắng, mẫu bắt đầu bằng dấu gạch ngang, dấu ngoặc kép, xuống dòng và ký tự đại diện glob.

v1 giả định triển khai bash và filesystem đồng vị trí. Nếu bash tìm kiếm một workspace, còn tool `read` phân giải đường dẫn dựa trên gốc khác, đường dẫn trả về có thể không đọc tiếp được. Package này ghi lại yêu cầu này nhưng không xác thực lúc chạy.

Locator spill do backend chịu trách nhiệm. Backend cục bộ hiện tại trả về đường dẫn filesystem cục bộ, phù hợp với triển khai mà `read`/`grep` có thể mở các file này; triển khai từ xa hoặc giới hạn workspace có thể dùng backend khác, để locator và gợi ý truy xuất của nó trỏ tới cơ chế truy xuất được hỗ trợ.
