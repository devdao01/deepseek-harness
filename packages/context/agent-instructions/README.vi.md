# @deepseek-ai/dsh-agent-instructions

[English](README.md) | Tiếng Việt

Nạp các file chỉ thị workspace tương thích với `AGENTS.md` cho từng phiên. Plugin này sẽ tiêm chuỗi chỉ thị toàn cục người dùng ban đầu và chỉ thị dự án vào lịch sử bền vững, sau đó phát hiện các file lồng nhau, và báo cáo thay đổi hoặc gỡ bỏ tiếp theo sau các lệnh gọi công cụ filesystem thành công.

## Vòng đời

`agent/pre-step` đủ điều kiện đầu tiên của mỗi phiên trực tiếp sẽ tổ hợp baseline. Khi quyết định downstream cho phép một batch bước đầu không rỗng đi vào, plugin sẽ gộp baseline vào batch cuối cùng, ngay sau prompt trực tiếp đã được nhận, để prompt trực tiếp và baseline bền vững cùng đi vào bước 1 và cùng đến request đầu tiên. Quyết định bước đầu bị từ chối hoặc rỗng sẽ để baseline lại trong inbox `next-step` của agent (tác tử), chờ đánh thức tiếp theo. Loader sẽ đọc `$DSH_HOME/AGENTS.md` trước, sau đó với mỗi thư mục từ gốc dự án tới `agent.session.header.cwd`, đọc từng file ứng viên cơ sở đang tồn tại trước, rồi đọc từng file ứng viên overlay cục bộ đang tồn tại. Trong cùng một thư mục, nếu các file ứng viên có byte hoàn toàn giống nhau sau khi loại bỏ khoảng trắng đầu/cuối, chúng sẽ được gộp vào file ứng viên sớm nhất theo thứ tự đã cấu hình, do đó nếu `CLAUDE.md` chỉ là bản sao của `AGENTS.md` cùng cấp, nó chỉ được render một lần. Nếu ngữ cảnh workspace đã xếp hàng trước đó vẫn đang chờ, plugin sẽ xóa và thay thế đúng mục inbox đó, thay vì tích lũy các bản sao liên tục. Phiên được khôi phục sẽ giữ lại một baseline khả kiến tương thích, và chỉ thêm các chuyển đổi của file hiện tại; nếu việc phát hiện, mức ưu tiên, gốc dự án hoặc định danh ngân sách thay đổi, một baseline hoàn chỉnh thay thế rõ ràng baseline cũ sẽ được gộp vào batch bước vào.

Plugin này cũng theo dõi `tools/result` bất biến phát sinh sau khi các lệnh gọi bên thứ nhất `read`, `write` và `edit` thành công. Mỗi touch được chấp nhận sẽ kiểm tra scope hậu duệ mới đạt tới cùng mọi scope đã nạp trước đó. Mỗi tên ứng viên đã cấu hình là một scope độc lập trong thư mục chứa nó: file mới xuất hiện sẽ xếp hàng một mục thêm mới trong inbox agent; file đã thay đổi sẽ xếp hàng một mục thay thế; file biến mất hoặc trở thành bản trùng của một file ứng viên sớm hơn trong cùng thư mục sẽ xếp hàng một thông báo gỡ bỏ. Lệnh gọi native và sub-dispatch Code Mode dùng chung đường dẫn này: touch lồng nhau sẽ nổi lên theo từng lớp dọc theo token thực thi cha không minh bạch, cho tới khi kết quả cấp cao nhất được xác định. Touch phát sinh bên trong một bước agent loop (vòng lặp agent) phải chờ `step/end` bền vững rồi mới bắt đầu chiếu bất đồng bộ. Khi thực thi công cụ trực tiếp ngoài một bước đang mở, việc chiếu diễn ra ngay lập tức. Nhờ vậy quan hệ liền kề tool call/kết quả/bước được giữ nguyên mà không cần dựa vào thời gian filesystem. Việc phát hiện này đi theo hoạt động filesystem có cấu trúc, chứ không theo `cd` của shell, vì mỗi lệnh gọi bash cục bộ khởi động một shell mới, và việc phân tích cú pháp shell tùy ý cũng không đáng tin cậy.

Việc đọc chỉ thị dùng provider tùy chọn `ctx.fs`. Plugin này không tĩnh tiêm `fs`, do đó cây sản phẩm không có provider vẫn có thể khởi động, việc nạp chỉ thị sẽ không làm gì cho tới khi provider xuất hiện. Nó sẽ resolve từng file ứng viên và thực hiện stat trên kết quả resolve, do đó sẽ theo symlink của thành phần cuối cùng của đường dẫn tới đích của nó: link trỏ tới một file thông thường sẽ nạp nội dung đích, đường dẫn thiếu hoặc đích không phải file (bao gồm link trỏ tới thư mục) được xác nhận là không tồn tại. Ngoại lệ resolve hoặc stat sẽ khiến scope của file ứng viên đó được đánh dấu là tạm thời không khả dụng. Việc hủy tiền tố và hủy công cụ động sẽ lan truyền tới resolve, dò metadata và đọc dạng stream. Lỗi provider sau khi file đã được nạp được coi là tạm thời không khả dụng, không phải bằng chứng file đã bị xóa.

## Cấu trúc prompt

Chỉ thị baseline là một message vai trò user bền vững, được đóng khung theo mẫu system-reminder quen thuộc:

```md
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: ~/.dsh/AGENTS.md

...

Instructions from: AGENTS.md

...
</system-reminder>
```

Scope mới đạt tới dùng một `user/message` bền vững có nguồn:

```md
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

...
</system-reminder>
```

Việc chỉnh sửa cùng một file bắt đầu bằng `Updated instructions from: <path>`, và nêu rõ dùng nội dung mới thay cho nội dung đã nạp trước đó. Khi file ứng viên biến mất hoặc trở thành bản trùng của một file ứng viên sớm hơn trong cùng thư mục, message sẽ là `Instructions removed: <path>`, theo sau bởi `The previously loaded instructions from this file no longer apply.`. Mọi văn bản `</system-reminder>` xuất hiện theo nghĩa đen trong nội dung chỉ thị hoặc trong đường dẫn, scope và metadata ngân sách hiển thị cho mô hình đều được escape, do đó văn bản do repo kiểm soát không thể đóng khung do plugin kiểm soát.

Plugin này kiểm soát toàn bộ khung `<system-reminder>`; mỗi `user/message` được tiêm sẽ được chuyển nguyên vẹn tới mô hình mà không qua wrapper của core.

## Trạng thái và làm mới

Văn bản hiển thị cho mô hình không chứa nhãn trạng thái ẩn. Mỗi sự kiện ngữ cảnh baseline hoặc động thay vào đó mang một nguồn `agent-instructions` có kiểu, chứa danh sách thay đổi `{ action, scope, path, digest? }`; baseline hoàn chỉnh còn mang `baseline: true`, cùng `baselineIdentity` được suy ra từ cấu hình phát hiện, ưu tiên, gốc dự án và ngân sách đã chuẩn hóa. `user/message` bền vững khớp sẽ xác nhận baseline đã xếp hàng cùng phiên bản ứng viên của nó. Pre-step của bước vào sẽ chờ mọi phép chiếu đã xếp hàng hoàn tất, rồi gộp ngữ cảnh vừa tổ hợp vào batch cuối cùng, ở vị trí ngay sau message đã nhận, và gỡ bỏ mọi bản sao vẫn đang chờ trong inbox; nếu bị từ chối, ngữ cảnh hiện tại tiếp tục xếp hàng. Nếu một listener viết đè message workspace đã nhận, mà không cho message thay thế đi vào, ranh giới tiếp theo sẽ tổ hợp lại ngữ cảnh hiện tại. Ngay cả khi kết quả composite tiếp theo bị chặn, các touch file lồng nhau thành công vẫn sẽ được gộp dưới token thực thi cha; kết quả cấp cao nhất sẽ giao các touch này cho bước phiên đang mở hiện tại, hoặc trực tiếp cho hàng đợi chiếu theo từng agent. `step/end` chỉ giải phóng các touch đã tạm giữ của nó sau khi ranh giới của chính nó đi vào lịch sử bền vững; việc chiếu tuần tự sẽ phối hợp theo sự kiện phiên khả kiến và trạng thái inbox hiện tại, rồi thay thế đúng một ngữ cảnh workspace đang chờ xử lý.

Khi cả đường dẫn và digest nội dung SHA-1 đều không đổi, sẽ không tiêm lặp lại. Cache provider theo từng phiên, từng scope chỉ lưu `{ path, version, digest, trimmedDigest }`: khi `FsVersion` không minh bạch của provider khớp với trạng thái khả kiến hợp lệ, việc đối chiếu sẽ bỏ qua việc đọc nội dung; version thay đổi sẽ kích hoạt việc đọc có giới hạn và xác nhận SHA-1 trước bất kỳ cập nhật khả kiến nào cho mô hình. `trimmedDigest` là SHA-1 của nội dung sau khi loại bỏ khoảng trắng, đồng thời cũng là key trùng lặp theo từng thư mục, do đó khi file ứng viên sớm hơn hội tụ nội dung với một file không đổi nào đó, file sau vẫn có thể bị gỡ bỏ. Việc khôi phục vẫn khả thi vì trạng thái SHA-1 được bền vững hóa trong nguồn có kiểu, và cache version trong bộ nhớ rỗng chỉ gây ra một lần đọc xác nhận. Compaction (nén) sẽ bật lại nó sau khi sự kiện ngữ cảnh của scope rời khỏi surface khả kiến, ngay cả khi version cache không đổi. Việc gỡ bỏ là tombstone, do đó khi file ứng viên xuất hiện trở lại sau đó sẽ được nạp lại. Thay đổi khả kiến cho mô hình chỉ đi vào nguồn, trạng thái pending và version cache khi đoạn văn bản chuyên biệt của file tương ứng giữ lại ít nhất một byte nội dung, hoặc nội dung gốc thực sự rỗng. Miễn là còn giữ lại bất kỳ byte nội dung nào, việc cắt bớt một phần vẫn ghi lại digest của nội dung đầy đủ; cắt xuống còn không byte vẫn có thể được xử lý ở touch tiếp theo, còn việc làm mới version với cùng digest chỉ cập nhật provider cache. Baseline vẫn có thể phát hành chẩn đoán ngân sách byte ngay cả khi danh sách thay đổi rỗng. Batch động nếu không có thay đổi nào có thể commit sẽ hoàn toàn không tiêm, và sẽ thử lại ở touch tiếp theo.

Bản thân sự kiện baseline ban đầu không bị viết đè. Thay đổi có kiểu của nó chỉ là trạng thái quyền uy khi sự kiện đó vẫn nằm trên surface phiên khả kiến. Khi compaction che khuất sự kiện đó, pre-step bước vào tiếp theo sẽ tổ hợp baseline hiện tại và ghi lại nó trong cùng request; cũng có thể thay bằng một touch filesystem thành công để thêm lại scope baseline không đổi, hoặc thêm phần thay thế/gỡ bỏ của nó. Nhãn scope trong bộ nhớ và version cache của provider chỉ đảm nhiệm chọn đối tượng để dò và tăng tốc việc dò. Pre-step đầu tiên sau khi khôi phục hoặc plugin được hot-reload sẽ giữ baseline khả kiến tương thích, và so sánh nó với các file được giữ lại trong bản render đầy đủ hiện tại. File không đổi và bị bỏ qua vì ngân sách sẽ không thêm gì cả; file mới thêm, chỉnh sửa, gỡ bỏ, hoặc không còn thuộc tập giữ lại theo ngân sách trong lúc agent offline sẽ thêm các chuyển đổi `set`, `replace` hoặc `remove`. Baseline khả kiến không tương thích sẽ bị thay thế bởi một baseline hiện tại hoàn chỉnh; nếu không có file ứng viên nào, baseline hiện tại đó sẽ là baseline rỗng tường minh. Không có file watcher, do đó thay đổi trên đĩa sẽ khả kiến ở lần touch `read`, `write` hoặc `edit` bên thứ nhất thành công tiếp theo, cũng như khi phiên được khôi phục đối chiếu baseline của nó, hoặc khi pre-step bước vào khôi phục baseline bị che khuất.

## Cấu hình

```ts
export interface Config {
  dshHome?: string
  projectRootMarkers?: string[]
  maxBytes: number
  maxSourceBytes?: number
  instructionFileCandidates?: string[]
  localInstructionFileCandidates?: string[]
}
```

`maxBytes` là bắt buộc, do đó mỗi triển khai phải chọn tường minh ngân sách prompt. `maxSourceBytes` giới hạn mỗi file chỉ thị nguồn trước khi render, mặc định 1 MiB. `projectRootMarkers` mặc định `['.git']`, `instructionFileCandidates` mặc định `['AGENTS.md', 'CLAUDE.md']`. Mọi file ứng viên đang tồn tại trong mỗi thư mục dự án đều được nạp, file có nội dung khớp với file ứng viên sớm hơn sau khi loại bỏ khoảng trắng xung quanh sẽ bị loại bỏ. Do đó, với thiết lập mặc định, `AGENTS.md` và `CLAUDE.md` có nội dung giống nhau chỉ được render một lần (dưới dạng `AGENTS.md`), còn các file cùng cấp thực sự khác nhau thì cả hai đều được áp dụng. `localInstructionFileCandidates` mặc định `['AGENTS.local.md', 'CLAUDE.local.md']`, sẽ nạp overlay hiện có của chúng cùng với file cơ sở trong cùng thư mục (render sau chúng), và áp dụng cùng việc khử trùng lặp theo thư mục; danh sách rỗng sẽ vô hiệu hóa overlay. Ứng viên trong cả hai danh sách phải là tên file trong cùng thư mục, do đó mục rỗng, `.`/`..` và mục chứa `/` hoặc `\` sẽ bị bỏ qua.

File toàn cục của người dùng luôn là `$DSH_HOME/AGENTS.md`, không có overlay cục bộ; hai danh sách ứng viên chỉ kiểm soát scope dự án. `$DSH_HOME` mặc định `~/.dsh`, các tiền tố `~`, `~/...` và kiểu Windows `~\...` đã cấu hình sẽ được mở rộng dựa trên thư mục home của hệ điều hành. Ngân sách render không dương hoặc không hữu hạn sẽ vô hiệu hóa cả nạp baseline lẫn nạp động; `maxSourceBytes` đã cấu hình phải là số nguyên dương.

## Ngân sách và đọc có giới hạn

Việc render sẽ ưu tiên giữ lại file chỉ thị cụ thể nhất. Nó sẽ loại bỏ hoàn toàn các file rộng hơn trước, rồi cắt bớt file cụ thể nhất, và phát ra thông báo khả kiến `Workspace instruction budget ...` chỉ rõ tên đường dẫn đã bị bỏ qua và đã bị cắt bớt. Số byte sau render không bao giờ vượt quá `maxBytes`.

Ngay cả khi metadata provider bỏ qua kích thước, hoặc file tăng kích thước sau khi dò metadata, nội dung chỉ thị vẫn được đọc thông qua `streamText()` dưới `maxSourceBytes`. File quá lớn sẽ bị bỏ qua; trong quá trình đối chiếu động, nó sẽ tạm thời không khả dụng, thay vì bị gỡ bỏ. Plugin này không giữ cache cấp tiến trình, không bao giờ cache văn bản chỉ thị. Cache scope cục bộ theo phiên của nó chỉ dùng version provider như một tín hiệu vô hiệu hóa nhanh; sau khi vô hiệu hóa, SHA-1 được tính từ việc đọc có giới hạn vẫn là định danh nội dung xuyên provider được lưu trong nguồn message có cấu trúc.

## Trải nghiệm mô hình

### Ngữ cảnh baseline

#### Nội dung mô hình nhìn thấy

Lịch sử được suy ra của request đầu tiên chứa một message vai trò user bền vững, theo thứ tự từ rộng đến cụ thể, chứa chuỗi chỉ thị toàn cục người dùng và chỉ thị dự án có giới hạn. Khi baseline khả kiến tương thích, việc khôi phục sẽ tái sử dụng message đó.

##### Mẫu chỉ thị baseline

```markdown
<system-reminder>
The following workspace instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.

Instructions from: ~/.dsh/AGENTS.md

<user-global-instructions>

Instructions from: AGENTS.md

<project-instructions>
</system-reminder>
```

#### Ảnh hưởng Token

Baseline sau render chỉ thêm một lần, và được giữ trong lịch sử được suy ra cho đến khi compaction. `maxBytes` giới hạn toàn bộ message, file rộng hơn bị bỏ qua trước khi file cụ thể nhất bị cắt bớt, chuỗi chỉ thị rỗng không tạo token.

#### Ảnh hưởng KV Cache

Chỉ thêm vào, sau tiền tố có thể tái sử dụng hiện có. Khi định danh baseline khả kiến tương thích, việc khôi phục vẫn giữ khả năng tái sử dụng; định danh không tương thích sẽ thêm một baseline thay thế hoàn chỉnh, do đó thay đổi phát hiện, ưu tiên, gốc dự án hoặc ngân sách chỉ ảnh hưởng đến khả năng tái sử dụng từ vị trí lịch sử đó trở đi.

### Ngữ cảnh scope mới phát hiện

#### Nội dung mô hình nhìn thấy

Sau khi lệnh gọi công cụ filesystem bên thứ nhất thành công đạt tới thư mục sâu hơn, request tiếp theo sẽ chứa một `user/message` có nguồn, được giữ lại, chứa file chỉ thị mới áp dụng.

##### Mẫu chỉ thị bổ sung

```markdown
<system-reminder>
Additional instructions from: packages/app/AGENTS.md

These instructions apply to work under `packages/app`. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

<nested-instructions>
</system-reminder>
```

#### Ảnh hưởng Token

Mỗi scope được phát hiện sẽ thêm token lịch sử có giới hạn, cho tới khi compaction. So sánh trạng thái phiên khả kiến với version/digest sẽ ngăn nội dung không thay đổi; Code Mode sẽ trì hoãn cùng message này đến sau kết quả `run_code` bên ngoài và bước bền vững sở hữu nó.

#### Ảnh hưởng KV Cache

Chỉ thêm vào; nội dung khả kiến mới nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV-cache hiện có.

### Ngữ cảnh chỉ thị đã thay đổi hoặc bị gỡ bỏ

#### Nội dung mô hình nhìn thấy

File đã thay đổi sẽ tạo ra `Updated instructions from: <path>` cùng nội dung thay thế. File ứng viên biến mất hoặc trở thành bản trùng của một file ứng viên sớm hơn trong cùng thư mục sẽ tạo ra thông báo gỡ bỏ bên dưới.

##### Thông báo gỡ bỏ

```markdown
<system-reminder>
Instructions removed: packages/app/AGENTS.md

The previously loaded instructions from this file no longer apply.
</system-reminder>
```

#### Ảnh hưởng Token

Mỗi thay đổi hoặc gỡ bỏ đã xác nhận là một message lịch sử được giữ lại, chịu giới hạn bởi `maxBytes`. Lỗi provider không thêm message, cập nhật bị bỏ qua vì ngân sách vẫn có thể được xử lý ở touch filesystem tiếp theo.

#### Ảnh hưởng KV Cache

Chỉ thêm vào; nội dung khả kiến mới nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV-cache hiện có.

## Giới hạn đã biết & công việc hoãn lại

- **Việc phát hiện đi theo công cụ fs có cấu trúc, không theo điều hướng shell**: lệnh `bash` đổi thư mục sẽ không kích hoạt phát hiện chỉ thị lồng nhau, vì cú pháp shell và trạng thái shell theo từng lệnh gọi không phải là một seam filesystem đáng tin cậy.
- **Làm mới do touch thúc đẩy**: không có watcher; chỉnh sửa bên ngoài sẽ khả kiến ở lần `read`, `write` hoặc `edit` bên thứ nhất thành công tiếp theo, khi quá trình khôi phục đối chiếu baseline khả kiến, hoặc khi pre-step bước vào khôi phục baseline bị che khuất.
- **Ngữ nghĩa ứng viên cố ý giữ đơn giản**: không diễn giải tên viết thường, `.claude/rules/` và import `@path`; scope dự án mặc định nạp overlay `AGENTS.local.md`/`CLAUDE.local.md`, nhưng scope toàn cục người dùng `$DSH_HOME` không có overlay cục bộ, các tên tùy chỉnh khác cần cấu hình ứng viên tường minh.
- **Khử trùng lặp theo thư mục dựa trên nội dung**: chỉ gộp các file ứng viên cùng cấp khi byte hoàn toàn giống nhau sau khi loại bỏ khoảng trắng đầu/cuối. Nếu `CLAUDE.md` là symlink tới `AGENTS.md` cùng cấp, nó sẽ resolve ra cùng nội dung, và bị gộp như mọi bản trùng khác; bản sao thực thể độc lập trôi dạt khỏi `AGENTS.md` sẽ được nạp đầy đủ cùng với nó.
- **File chỉ thị dạng symlink sẽ được theo dõi xuyên ranh giới tin cậy**: file ứng viên có thành phần cuối cùng là symlink sẽ được resolve và nạp đích của nó, do đó một repo được clone có thể trình bày nội dung file ngoài cây như hướng dẫn workspace mức ưu tiên thấp hơn (nó không bao giờ ghi đè chỉ thị system, developer, hoặc chỉ thị trực tiếp của người dùng). Khi nạp một repo không đáng tin cậy, hãy dùng cổng kiểm chính sách filesystem hoặc sandbox OS để giới hạn `ctx.fs`.
- **Nội dung chỉ thị bị giới hạn nhưng không được tóm tắt**: file rộng vượt ngân sách sẽ bị bỏ qua, file cụ thể nhất có thể bị cắt bớt; plugin này không bao giờ yêu cầu mô hình nén văn bản chỉ thị.
