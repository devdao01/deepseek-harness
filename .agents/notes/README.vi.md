# Agent Notes

[English](README.md) | 中文

Đây là nơi lưu trữ một loại tài liệu thiết kế. **Agent Note** ghi lại các quyết định hoặc đề xuất ảnh hưởng đến codebase này: phần *lý do vì sao* và *những gì đã bị từ bỏ* mà code và tài liệu không thể chứa đựng. File này quy định Agent Note được lưu ở đâu, khi nào cần viết một bản, và [định dạng bên trong file](#the-file-format).

## Bố cục và đặt tên

Mỗi Agent Note có hai chiều, đều được mã hóa trong **đường dẫn** của nó: `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`.

- **Vòng đời** (thư mục cấp cao nhất) là trạng thái của Agent Note; Agent Note di chuyển giữa các thư mục khi trạng thái thay đổi:
  - **`proposed/`**: đề xuất được đánh giá trước khi triển khai; chưa được xây dựng (hoặc chỉ xây dựng một phần).
  - **`implemented/`**: quyết định đã được bàn giao. File ghi lại quyết định đã đưa ra là gì, điều gì đã bị bác bỏ, và **luôn đồng bộ với nội dung thực tế đã bàn giao**: khi code sau này di chuyển file, đổi tên package, hoặc thay đổi tên khóa/giá trị mặc định, Agent Note được cập nhật đồng bộ trong cùng một thay đổi (chỉ giới hạn ở các sự kiện thực tế — đường dẫn, tên gọi, cấu trúc — chứ không phải bản thân quyết định). Xem [implemented/AGENTS.md](implemented/AGENTS.md).
  - **`rejected/`**: đề xuất bị bác bỏ sau khi thảo luận. Chỉ giữ lại khi cơ sở của quyết định đó vẫn còn giúp tránh một sai lầm hấp dẫn và có tác động lớn; nếu không, xóa toàn bộ bộ ba file tiếng Anh, tiếng Trung và bản ghi đi kèm.
- **Loại** (thư mục lồng bên trong) là *thể loại* của quyết định — xem [Phân loại](#classification) bên dưới.

Ngày trong tên file là thời điểm chủ đề đó **được đề xuất lần đầu** (căn cứ theo lịch sử git). Các Agent Note tham chiếu chéo lẫn nhau sử dụng liên kết Markdown tương đối (`[topic](../../implemented/architecture/2026-…-….md)`), không bao giờ dùng văn bản thuần hay đánh số, nhờ đó vừa có thể kiểm tra máy móc, vừa giữ được tính hợp lệ khi di chuyển giữa các thư mục.

Cây thư mục vòng đời đang hoạt động chính là danh sách công việc: duyệt qua các thư mục vòng đời/loại của nó, hoặc tìm kiếm trong repo là đủ. Không thêm `INDEX.md` tập trung; lý do thiết kế xem tại [Agent Note không có index](implemented/process/2026-07-19-remove-generated-agent-note-index.md). Các bản ghi đã triển khai có giá trị định hướng tương lai thấp sẽ được chuyển vào cây thư mục đóng băng riêng biệt [`archived/`](archived/AGENTS.md) được mô tả bên dưới.

<a id="classification"></a>

## Phân loại

Mỗi Agent Note thuộc về một loại được mã hóa theo đường dẫn trong tập hợp đóng tại `scripts/agent-note-tree.ts`; cổng kiểm phân loại từ chối các thư mục khác. Thêm loại mới đòi hỏi cập nhật đồng thời tập hợp chuẩn và mục này. Xem [Phân loại Agent Note](implemented/process/2026-06-20-agent-note-classification.md).

| Loại | Phạm vi bao phủ |
|---|---|
| `feature` | Năng lực mới hướng tới người dùng hoặc mô hình. |
| `bug-fix` | Sửa lỗi hoặc bù đắp khoảng trống được phát hiện qua báo cáo hậu sự cố (postmortem). |
| `simplification` | Loại bỏ code, hành vi, hoặc phạm vi bên ngoài mà không tăng thêm năng lực. |
| `architecture` | Các quyết định mang tính cấu trúc về **mã nguồn được bàn giao**: quan hệ giữa các package, từ vựng runtime. |
| `process` | Công cụ, chính sách, hoặc quy trình làm việc **xung quanh** code — cổng kiểm, trình quản lý package, vendor hóa — không liên quan đến hành vi runtime. |
| `testing` | Hạ tầng và chiến lược kiểm thử. |

Ranh giới giữa `architecture` và `process`: **architecture** liên quan đến mã nguồn chúng ta bàn giao; **process** liên quan đến công cụ và quy trình xung quanh mã nguồn. (`refactor` bị loại trừ có chủ đích: nó chồng lấn với `simplification`, và tiêu chí phân biệt của loại sau — "hành vi có thể quan sát được có thay đổi hay không" — đã bao phủ nó rồi.)

## Lưu trữ và xóa

Khi một quyết định được ghi trong Agent Note implemented đã hoàn toàn được triển khai, và cơ sở quyết định của nó khó có khả năng còn định hướng cho công việc tương lai, hãy lưu trữ (archive) nó. Nếu các phương án thay thế, ranh giới sở hữu, đảm bảo phủ định, ngữ nghĩa persistence hoặc giao thức, quy tắc an toàn, hoặc điều kiện tái áp dụng trong đó vẫn còn giá trị, thì tiếp tục giữ nó như một bản ghi đang hoạt động. Không bao giờ lưu trữ Agent Note proposed: đề xuất đã lỗi thời nên chuyển thành rejected. Chỉ giữ lại Agent Note rejected khi nó vẫn còn giúp tránh một sai lầm có khả năng xảy ra; nếu không, xóa luôn cả ba file tiếng Anh, tiếng Trung và bản ghi đi kèm. Hãy dùng quy trình đã được hiệu chỉnh [`dsh-archive-agent-notes`](../skills/dsh-archive-agent-notes/SKILL.md), không phán đoán dựa trên số từ, thời gian tồn tại, hay hạn ngạch mục tiêu.

Đường dẫn lưu trữ được mã hóa dưới dạng `archived/{class}/yyyy-mm-dd-topic-title.md`; ở đây `implemented` bị lược bỏ có chủ đích vì chỉ Agent Note implemented mới có thể được lưu trữ. Thay đổi lưu trữ sẽ di chuyển đầy đủ bộ ba file tiếng Anh, tiếng Trung và bản ghi đi kèm, giữ nguyên `Status: implemented`, chèn cùng một dòng `Archived: YYYY-MM-DD` ngay sau dòng trạng thái đó trong file của cả hai ngôn ngữ, ghi lại bản ghi đi kèm, và sửa hoặc xóa các liên kết trỏ vào. Khi lưu trữ, chỉ được phép thực hiện đúng những thay đổi nội dung này.

Sau khi đóng gói lưu trữ, mỗi bộ file lưu trữ bị đóng băng vĩnh viễn. Cấm chỉnh sửa, dịch, định dạng lại, cập nhật, di chuyển hoặc xóa, cũng không được coi đó là căn cứ có thẩm quyền cho hành vi hiện tại. Cổng kiểm tài liệu bỏ qua các file nguồn đã lưu trữ, bao gồm cả các liên kết đi ra từ đó; khi tài liệu đang hoạt động có chủ đích tham chiếu đến lịch sử, vẫn có thể liên kết tới Agent Note đã lưu trữ. [`verify-archived-agent-notes`](../../scripts/verify-archived-agent-notes.ts) thực thi cây thư mục loại đóng, cặp ba file đầy đủ, metadata lưu trữ, hash của bản ghi đi kèm, và manifest (danh sách metadata) nội dung đóng băng chỉ được phép thêm vào. [Agent Note về chính sách lưu trữ](implemented/process/2026-07-26-frozen-agent-note-archive.md) ghi lại căn cứ thiết kế.

## Khi nào cần viết một bản

Mỗi thay đổi không tầm thường đều phải thêm mới hoặc cập nhật ít nhất một Agent Note trong cùng một PR (Pull Request). Nếu thay đổi làm thay đổi hành vi, kiến trúc, quy ước liên file hoặc liên package, quy trình hoặc công cụ, chiến lược kiểm thử, định dạng lưu trữ trên đĩa, định dạng giao thức (wire format) hoặc định dạng cấu hình, hoặc bất kỳ quyết định nào khác mà maintainer có thể hợp lý xem xét lại, thì đó là thay đổi không tầm thường. Đề xuất cho công việc quan trọng trong tương lai bắt đầu từ `proposed/`; các quyết định đã được đưa ra bắt đầu từ `implemented/`. Chọn thư mục loại phù hợp với quyết định (xem [Phân loại](#classification)).

Cập nhật Agent Note đã sở hữu quyết định đó là đủ để thỏa mãn quy tắc; không tạo bản ghi trùng lặp. Chỉ những chỉnh sửa thuần túy máy móc hoặc cục bộ, không liên quan đến thay đổi về hành vi, quy ước, cấu trúc, quy trình hoặc lý do, mới được miễn trừ. Agent Note không bao giờ được chỉnh sửa thành một *quyết định khác*: dùng Agent Note mới để thay thế bản ghi cũ, và giữ cho hai bản ghi liên kết lẫn nhau, trừ khi sau đó bản ghi cũ được gộp hoàn toàn theo quy tắc bên dưới. Chỉnh sửa Agent Note trong `implemented/` để theo dõi vị trí hiện tại của quyết định đã có là bắt buộc, không phải bị cấm; xem [implemented/AGENTS.md](implemented/AGENTS.md).

Một Agent Note implemented đã bị thay thế hoàn toàn có thể được gộp vào bản ghi hiện đang sở hữu quyết định đó, và xóa file gốc. Trước khi xóa, bản ghi hiện tại phải lưu giữ mọi căn cứ quyết định, phương án thay thế, tác động, xác minh bắt buộc và khoảng trống phạm vi bao phủ đã được nêu rõ mà chỉ bản ghi đó có; sửa mọi liên kết trỏ vào; và xóa file đối chiếu tiếng Trung cùng bản ghi nhất quán trong cùng một thay đổi. Các bản ghi chỉ bị thay thế một phần không đủ điều kiện này: giữ lại cả hai bản ghi, liên kết lẫn nhau, đồng thời cập nhật mọi sự kiện vẫn còn áp dụng. Việc gộp không được viết lại file cũ thành một quyết định trái ngược, cũng không được để lịch sử git trở thành bản sao duy nhất của căn cứ quyết định.

Chỉ khi một tính năng đã hoàn toàn biến mất khỏi code sản xuất, cấu hình, schema, định dạng persistence hoặc giao thức, hành vi migration và tương thích, tài liệu hiện tại không còn mô tả nó là khả dụng, và không có test nào thực thi nó như một hành vi được hỗ trợ, thì Agent Note thêm tính năng đó mới có thể được gộp vào bản ghi loại bỏ theo sau. Căn cứ của quyết định loại bỏ và các test xác nhận tính năng đó không còn tồn tại có thể được giữ lại. Bản ghi sở hữu quyết định loại bỏ phải giữ lại động lực ban đầu, lý do vì sao động lực đó không còn đủ để biện minh cho việc giữ lại tính năng, các phương án thay thế ngoài việc loại bỏ hoàn toàn, năng lực bị từ bỏ, điều kiện để tái áp dụng, và xác minh chứng minh đã loại bỏ triệt để. Danh sách triển khai đã lỗi thời và các test chỉ xác minh hành vi đã bị xóa không thuộc về bằng chứng xác minh hiện tại. Chỉ loại bỏ một phương thức truyền tải, giá trị mặc định, cách triển khai, hoặc cách hiển thị thuộc dạng thay thế một phần. Việc vẫn còn dữ liệu persistent hoặc xử lý tương thích nào đó cũng tương tự như vậy.

<a id="the-file-format"></a>

## Định dạng file

Mỗi Agent Note đang hoạt động tuân theo một định dạng thống nhất bên trong file, được thực thi bởi `pnpm run verify-agent-note-format` ([scripts/verify-agent-note-format.ts](../../scripts/verify-agent-note-format.ts), một phần của `doc-sync` (cổng kiểm đồng bộ tài liệu)); động lực thiết kế của định dạng này và các phương án thay thế bị bác bỏ xem tại [Agent Note về định dạng thống nhất](implemented/process/2026-07-05-uniform-agent-note-format.md). Bản ghi lưu trữ giữ nguyên định dạng tại thời điểm đóng gói lưu trữ, cộng thêm dòng ngày lưu trữ nêu trên.

### Khối tiêu đề

Ba dòng đầu tiên của mỗi Agent Note nghiêm ngặt như sau:

```markdown
# Agent Note: <title>

Status: <status>
```

theo sau là một dòng trống. Giá trị của `Status:` có ba dạng, và phải khớp với thư mục vòng đời chứa file — cổng kiểm sẽ đối chiếu chéo:

- `Status: proposed`
- `Status: implemented`
- `Status: rejected — <why, in one line>`

Dòng trạng thái không kèm ngày, không kèm chú thích trong ngoặc: tên file ghi lại ngày đề xuất lần đầu, git ghi lại mọi thứ còn lại; những chú thích kiểu "được chấp nhận dưới dạng sửa đổi" thuộc về nội dung chính văn (nêu sửa đổi ở nơi trình bày quyết định). Lý do bác bỏ là trạng thái duy nhất có nội dung, vì khi người đọc tra cứu một Agent Note bị bác bỏ, kết luận chính là điều họ đang tìm.

### Khung chính văn

Chính văn của mỗi Agent Note bắt đầu bằng `## Problem`: động lực, viết theo cách không phụ thuộc vào giải pháp để có thể đứng độc lập. Nội dung tiếp theo phụ thuộc vào vòng đời; các mục cố định dùng đúng những tên chuẩn sau đây và chỉ những tên này, còn các mục kỹ thuật thực sự đặc thù (cấu trúc package, quy ước giao thức, schema, v.v.) có thể tự do sắp xếp giữa các mục bắt buộc.

#### `proposed/`

```markdown
## Problem
## Proposal
…bespoke sections…
## Alternatives considered
## Acceptance criteria
## Risks
```

`## Proposal` mô tả thay đổi được đề xuất, có thể hợp lý dùng thì tương lai — kế hoạch, các bước migration và các vấn đề còn để ngỏ thuộc về đây khi công việc chưa hoàn thành. `## Acceptance criteria` nêu rõ trạng thái quan sát được nào đồng nghĩa với việc hoàn thành. `## Risks` bao phủ những gì có thể sai và những gì thay đổi này chủ động từ bỏ.

#### `implemented/`

```markdown
## Problem
## Decision
…bespoke sections…
## Alternatives considered
## Consequences
```

`## Decision` mô tả thực tế đã bàn giao bằng thì hiện tại, và toàn bộ file được giữ đồng bộ với nó theo yêu cầu của [implemented/AGENTS.md](implemented/AGENTS.md). `## Consequences` ghi lại cả cái giá phải trả **lẫn** lợi ích của sự đánh đổi. Các tiêu đề thuộc giai đoạn đề xuất là thuật ngữ đặc tả (spec) ở đây, và cổng kiểm sẽ từ chối chúng: `## Proposal`, `## Plan`, `## Migration plan` và `## Acceptance criteria` không được xuất hiện trong Agent Note implemented (lý do xem [danh sách kiểm tra slop](../../docs/AGENTS.md)). Các mục `## Testing`, `## Deferred` hoặc `## Related` được phép khi trình bày sự kiện ở thì hiện tại.

#### `rejected/`

Agent Note bị bác bỏ là một đề xuất đã đóng băng: giữ lại tất cả các mục có tại thời điểm đề xuất (bao gồm `## Acceptance criteria` hoặc `## Plan`), kết luận được viết trên dòng `Status:`. Chỉ áp dụng khối tiêu đề, phần mở đầu `## Problem`, mục `## Proposal`, và mục "Phương án thay thế đã cân nhắc" bên dưới là bắt buộc.

### Phương án thay thế đã cân nhắc — bắt buộc

Mỗi Agent Note đều phải có mục `## Alternatives considered`: mỗi phương án thay thế thực sự và lý do nó không được chọn, mỗi phương án dùng một đoạn văn mở đầu in đậm, hoặc với những phương án gây tranh cãi nhiều hơn thì dùng tiểu mục `### Why not <X>?`. Ghi lại quyết định mà không ghi lại nó đã đánh bại phương án nào chính là mời gọi tranh cãi lặp lại — đây chính xác là vấn đề mà Agent Note nhằm ngăn chặn.

Phương án thay thế là những gì được ghi lại, không phải bịa ra. Với Agent Note có ngày trước 2026-07-05 mà phương án thay thế không thể tái dựng lại từ bản ghi, dùng đúng chú thích sau để thay cho mục này; cổng kiểm chỉ chấp nhận chú thích này đối với các file có trước khi quy chuẩn định dạng ra đời:

```markdown
<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
```

### Di chuyển giữa các vòng đời

Di chuyển file giữa các thư mục vòng đời nghĩa là cập nhật dòng `Status:` trong cùng một thay đổi và đáp ứng yêu cầu khung của thư mục đích — nếu không cổng kiểm sẽ thất bại. Cụ thể, `proposed/` → `implemented/` viết lại `## Proposal` thành `## Decision` ở thì hiện tại, gộp `## Acceptance criteria` và `## Risks` vào `## Consequences` (hoặc gộp vào một mục `## Testing`/`## Verification` ở thì hiện tại, mô tả những gì hiện đang khóa chặt hành vi đó), và thay kế hoạch bằng những gì thực sự đã được bàn giao — nói cách khác, biến việc viết lại theo yêu cầu của [implemented/AGENTS.md](implemented/AGENTS.md) thành một quy tắc có thể kiểm tra máy móc. `proposed/` → `rejected/` chỉ cần thêm lý do vào dòng `Status:` và đóng băng file.

### File đối chiếu tiếng Trung

File đối chiếu `.zh.md` giữ cùng cấu trúc theo từng mục với file đối chiếu tiếng Anh của nó, theo [quy ước i18n](../../docs/i18n/README.md); các đánh dấu tiêu đề được kiểm tra máy móc (dòng `# Agent Note: ` và `Status:`) giữ nguyên tiếng Anh, không dịch. Cổng kiểm định dạng bỏ qua file `.zh.md`; cổng kiểm cặp đôi kiểm tra tính nhất quán giữa chúng.
