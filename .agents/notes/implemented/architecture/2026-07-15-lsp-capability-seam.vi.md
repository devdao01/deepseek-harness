# Agent Note: Capability seam LSP và tool truy vấn hướng tới model

Status: implemented

[English](2026-07-15-lsp-capability-seam.md) | 中文

## Vấn đề

Harness đã có năng lực tìm kiếm văn bản và đọc file, nhưng cả hai đều không nhận diện được symbol chương trình. Việc khớp văn bản không thể phân biệt đáng tin cậy các hàm trùng tên, theo dõi alias import, liên kết interface với triển khai cụ thể, hay báo cáo kiểu suy luận. Do đó, agent (tác nhân) thiếu khả năng điều hướng ngữ nghĩa mà con người có được thông qua language server của editor trước khi sửa code.

Language Server Protocol (LSP) chạm tới ba bên chịu trách nhiệm: model cần một schema truy vấn ổn định, harness cần việc chọn provider và chuẩn hóa kết quả, còn triển khai cục bộ chịu trách nhiệm về tiến trình, JSON-RPC, workspace, đồng bộ và hành vi hệ thống file. Gộp cả ba lại sẽ khiến quy ước model bị gắn chặt vào subprocess cục bộ, và cản trở các provider gốc remote hay sandbox.

Nhiều language server hoạt động tốt nhất khi tài liệu được truy vấn đã mở theo đúng văn bản hiện tại. Client agent tương thích phải giới hạn trạng thái này, định nghĩa liệu việc đọc nội bộ có tính là quan sát của model hay không, và đảm bảo snapshot tài liệu cùng chỉ mục workspace của server nằm trong cùng một namespace hệ thống file.

## Quyết định

Xây dựng LSP thành một capability seam gồm ba package, bao gồm một tool model chỉ đọc và một triển khai provider cục bộ đa dụng:

1. `@deepseek-ai/dsh-lsp` tại `packages/lsp/lsp` chịu trách nhiệm về `ctx.lsp`, đăng ký và chọn provider, chuẩn hóa request và kết quả, kiểm soát thực thi, và lỗi LSP có cấu trúc.
2. `@deepseek-ai/dsh-lsp-stdio` tại `packages/lsp/lsp-stdio` adapt các language server stdio đã cấu hình vào seam này. Một instance plugin nhận một bảng server có tên, và đăng ký một provider cô lập cho mỗi tập lệnh cùng ánh xạ đuôi file sang language id.
3. `@deepseek-ai/dsh-tool-lsp` tại `packages/lsp/tool-lsp` chịu trách nhiệm về schema `lsp` hướng tới model, hướng dẫn prompt, validate tham số, giới hạn và định dạng kết quả, cùng phần hiển thị UI không phụ thuộc transport.

`dsh-lsp-stdio` là một host đa dụng, không phải catalog hay trình cài đặt language server. Deployment cấu hình tường minh lệnh và ánh xạ; preset trong tương lai thuộc về plugin tổ hợp hoặc overlay `cordis.yml`.

Model và seam chỉ công khai `goToDefinition`, `findReferences`, `goToImplementation` và `hover`; `ctx.lsp` không cung cấp phương thức JSON-RPC tùy ý. Các literal thao tác này khớp với cách đặt tên camelCase quen thuộc của Claude Code, còn tên tool và field `file_path` vẫn do harness tự định nghĩa.

Prompt định vị LSP như một công cụ truy vấn chính xác: `Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous or before a change requires precise definitions, implementations, or references.`

## Ranh giới package và trách nhiệm

`dsh-lsp` đăng ký provider theo id có gắn brand type và ánh xạ đuôi file sang language id. `registerProvider()` chiếm dụng id cùng tất cả đuôi file đã chuẩn hóa theo cách nguyên tử: nếu input không hợp lệ hoặc có xung đột thì không công bố trạng thái nào, hàm dispose (giải phóng tài nguyên) giải phóng toàn bộ những gì đã chiếm dụng. Provider plugin đăng ký qua `ctx.effect()`. Hệ thống chọn provider theo truy vấn, không phụ thuộc thứ tự; khi không có kết quả khớp thì trả về lỗi không khả dụng có cấu trúc. Phiên bản đầu tiên không cung cấp glob, language-id, hay selector định tuyến tường minh, cũng không khai báo tĩnh năng lực thao tác.

Seam chỉ công khai `query(request, signal?)`, vì không có field nào cần tầng triển khai điền giá trị mặc định: `workspaceRoot` là bắt buộc, `languageId` lấy từ ánh xạ đã đăng ký, timeout và giới hạn kết quả do bên tiêu thụ chịu trách nhiệm. `query()` thực hiện việc chọn và suy luận mà không dùng logic fallback `??` ẩn, nên không có spec khả thi nào cần resolve. `dsh-tool-lsp` validate tham số model, và chỉ truyền `exec.signal` như một `AbortSignal` trần, nhất quán với web, và giúp `dsh-lsp` không phụ thuộc vào `dsh-tools`. Provider bị gỡ trước khi được chọn sẽ thất bại theo hướng không khả dụng; việc dispose sau đó tuân theo vòng đời hủy của provider đã chọn, không thay đổi định tuyến.

Quy ước như sau:

```ts
import type { Branded } from '@deepseek-ai/dsh-brand'

type LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
type LspProviderId = Branded<'LspProviderId'>

interface LspPosition {
  readonly line: number
  readonly character: number
}

interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}

interface LspQueryRequest {
  readonly operation: LspOperation
  readonly filePath: string
  readonly position: LspPosition
  readonly workspaceRoot: string
}

interface LspProviderQuery extends LspQueryRequest {
  readonly languageId: string
}

type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly { readonly uri: string; readonly range: LspRange }[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: { readonly contents: string; readonly range?: LspRange } | null }

interface LspProvider {
  readonly id: LspProviderId
  readonly extensionToLanguage: Readonly<Record<string, string>>
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}

interface LspService {
  registerProvider(provider: LspProvider): () => void
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
```

Khóa ánh xạ được chuẩn hóa thành đuôi file chữ thường có dấu chấm đứng đầu, và được chọn theo đuôi file cuối cùng của `filePath`; language id chỉ dùng để đồng bộ tài liệu. Vị trí và range trong seam được đếm theo UTF-16, bắt đầu từ 0. `findReferences` luôn bao gồm khai báo: provider tự thực thi ràng buộc này nội bộ, ánh xạ cục bộ đặt `context.includeDeclaration: true`, bên gọi không thể cấu hình. Union kết quả đóng thống nhất việc điều hướng thành vị trí, và `hover` thành nội dung hoặc `null`; kết quả điều hướng mang theo URI workspace chuẩn hóa của provider, để bên tiêu thụ có thể tương đối hóa URI file trong namespace của môi trường thực thi. Seam không công khai kiểu dữ liệu giao thức, tiến trình hay kiểm soát tài liệu, cũng không cung cấp cửa thoát request tùy ý.

`dsh-lsp-stdio` chịu trách nhiệm về cấu hình server, JSON-RPC, tiến trình và trạng thái tài liệu tạm thời cùng việc chuyển đổi giao thức. Nó đọc qua `ctx.fs`, khởi động qua `ctx.subprocess`, chỉ phụ thuộc vào package Service Definition của cả hai chứ không phụ thuộc provider cụ thể; [quyết định về consumer môi trường thực thi di động](2026-07-28-portable-execution-world-consumers.md) định nghĩa cặp ghép này. Khóa của bảng server là provider id. Plugin phân giải cài đặt cục bộ của từng server trước khi đăng ký; nếu ánh xạ sau đó không hợp lệ hoặc xung đột, plugin sẽ hủy đăng ký trước đó, và giữ pool tiến trình riêng cho từng provider. `dsh-tool-lsp` khi chạy chỉ inject `tools`, `lsp` và `systemPrompt`, lấy workspace từ `exec.agent?.session.header.cwd` thông qua hàm hỗ trợ nội bộ package `sessionCwd(exec)`, cách lấy giá trị này nhất quán với các tool hệ thống file, và cũng không import provider.

## Quy ước hướng tới model

Một tool `lsp` duy nhất nhận các tham số sau:

```ts
interface LspToolInput {
  readonly operation: 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
  readonly file_path: string
  readonly line: number
  readonly character: number
}
```

`line` và `character` là tọa độ con trỏ UTF-16 dương, đếm từ 1; tool chuyển đổi chúng thành `LspPosition` đếm từ 0 trong seam, và chuyển vị trí hiển thị ngược lại. `findReferences` bao gồm khai báo, để tránh việc phân tích ảnh hưởng bỏ sót vị trí định nghĩa. Provider, language id, workspace root, giới hạn, timeout, khởi tạo và file thực thi đều không đi vào input của model.

Tool phải lấy `workspaceRoot` từ `header.cwd` của session, không có giá trị fallback; khi thiếu, nó thất bại với `LSP_WORKSPACE_REQUIRED` trước khi truy vấn hoặc khởi động. Provider cục bộ phân giải đường dẫn tương đối dựa trên root và chấp nhận trực tiếp đường dẫn tuyệt đối; cả hai loại đều được chuẩn hóa, và nếu đích nằm ngoài workspace chuẩn hóa thì bị từ chối trước khi khởi động.

Vị trí được nhóm ổn định theo file mà không áp dụng quy tắc đường dẫn host của harness, và được render thành `path:line:character`. URI `file:` hợp lệ nằm trong URI workspace chuẩn hóa của provider sẽ được chuyển thành đường dẫn tương đối, nằm ngoài thì chuyển thành đường dẫn tuyệt đối suy ra từ URI; URI sai định dạng và URI không phải `file:` được giữ nguyên. `maxLocations` mặc định là `100`, và báo cáo các mục bị bỏ qua; `maxResultChars` mặc định là `16_000`, giới hạn mỗi kết quả render đầy đủ, bao gồm cả metadata cắt bớt. Vị trí rỗng và hover `null` là phản hồi thành công không có kết quả; khi payload server thiếu hoặc sai định dạng, nó thất bại với lỗi có cấu trúc `LSP_MALFORMED_RESPONSE`.

Bộ hiển thị không phụ thuộc transport dùng `{ card: 'generic', kind: 'search', title, locations: [{ path: file_path, line }] }`, `title` được suy ra từ tham số và ghi rõ thao tác cùng con trỏ. Vì `FileLocation` không có character, vị trí theo dõi lấy trọng tâm ở dòng input, còn title giữ nguyên đầy đủ con trỏ; việc hiển thị vẫn là hàm thuần túy.

## Quy thuộc timeout

`dsh-tool-lsp` đính kèm một ngân sách `timeoutMs` có thể cấu hình vào định nghĩa tool, mặc định là `60_000`. `dsh-tool-call-timeout-policy` thực thi ngân sách này và cung cấp `exec.signal` truyền vào `ctx.lsp.query`; ngân sách này bao trùm toàn bộ vòng đời xếp hàng, mở, truy vấn và đóng, model không thể cấu hình.

Seam và provider không thêm deadline khởi động hay request. Bên gọi không phải là tool call không nhận được timeout ẩn, phải tự cung cấp `AbortSignal`, và dùng `deadline()` khi cần ngân sách.

Việc dispose provider xảy ra ngoài phạm vi thực thi tool, do đó `dsh-lsp-stdio` giữ `shutdownTimeoutMs` (mặc định `5_000`) để giới hạn `shutdown`/`exit`, và `killGraceMs` (mặc định `2_000`), đồng thời dùng để giới hạn thời gian ân hạn hủy request và thời gian ân hạn nâng cấp từ SIGTERM lên SIGKILL; việc dọn dẹp instance lỗi cũng dùng chung các ngưỡng này. Khi giá trị timer vượt quá phạm vi lập lịch `2_147_483_647` ms của Node, việc load plugin sẽ thất bại. Provider dùng `deadline()` và `timeoutOf()`, nhưng vẫn chịu trách nhiệm hủy request, gửi tín hiệu tiến trình và chờ đóng, vì thông báo timeout không tự chấm dứt công việc.

## Workspace, hệ thống file và đồng bộ tài liệu

`dsh-lsp-stdio` chuẩn hóa và đọc file thông qua `ctx.fs` trong môi trường thực thi của language server. Nó yêu cầu đích workspace là một thư mục, dùng containment riêng của provider để từ chối file nguồn nằm ngoài workspace, tiêu thụ `streamText`, và áp giới hạn `maxDocumentBytes` khi các đoạn (chunk) đến. Việc validate checksum file thông thường và giải mã UTF-8 vẫn do provider chịu trách nhiệm, còn giới hạn tài liệu do bên tiêu thụ giao thức chịu trách nhiệm. Nó gộp việc hủy của bên gọi và việc dispose của provider cho mỗi thao tác hệ thống file, theo dõi các lượt tra cứu workspace chưa vào hàng đợi, và chờ các lượt tra cứu đó kết thúc trong lúc dispose. Nó không gửi `fs/observed`: chỉ kết quả LSP hiển thị với model, nên truy vấn không thỏa mãn chính sách đọc-trước-khi-ghi.

Output của tool `read` có cửa sổ và số dòng, đi vào transcript (bản ghi văn bản) và đã bị quan sát, không phù hợp để dùng làm file nguồn. Việc đọc bên trong `tool-lsp` cũng sẽ đẩy trách nhiệm đồng bộ riêng của provider sang bên tiêu thụ, và loại trừ các provider không phải cục bộ.

Provider cục bộ áp dụng quy trình mở tạm thời ưu tiên tương thích cho mỗi truy vấn. Nó chấp nhận `Full` hoặc `Incremental` kiểu cũ của `textDocumentSync`, cũng chấp nhận tùy chọn có `openClose: true`; khi năng lực đồng bộ thiếu, là `None`, hoặc rõ ràng không tương thích, nó thất bại với lỗi không hỗ trợ trước `didOpen`.

1. Phân giải file nguồn qua `ctx.fs` và kiểm tra nó nằm trong workspace, sau đó đọc luồng văn bản hiện tại qua cùng provider đó, đồng thời áp giới hạn byte tài liệu.
2. Gửi `textDocument/didOpen` với phiên bản `1`, văn bản đầy đủ và language id đã cấu hình. Việc ghi này vẫn có thể hủy; ghi thất bại hoặc bị hủy sẽ làm instance mất hiệu lực, và chờ việc chấm dứt tiến trình có giới hạn hoàn tất trước khi pool có thể tái sử dụng nó.
3. Gửi request được yêu cầu: `textDocument/definition`, `textDocument/references`, `textDocument/implementation`, hoặc `textDocument/hover`.
4. Nếu `didOpen` thành công, thử gửi `textDocument/didClose` trong khối `finally` sau khi request hoàn tất hoặc bị hủy. Ghi đóng thất bại sẽ không ghi đè lên kết quả hay lỗi đã xác định, nhưng sẽ làm instance mất hiệu lực, và chờ việc chấm dứt tiến trình có giới hạn hoàn tất.

Tài liệu được đóng sau mỗi lần gọi, nên phiên bản đầu tiên không cần `didChange`, `didSave`, cache nội dung, listener thay đổi, hay LRU tài liệu. Hàng đợi provider của mỗi workspace có thể hủy, và thực thi tuần tự toàn bộ vòng đời đọc file nguồn, mở, truy vấn và đóng, nên truy vấn đang chờ chỉ đọc byte hiện tại khi đến lượt; instance cũng thực thi vòng đời giao thức tuần tự. Các workspace khác nhau có thể chạy song song. Chỉ mục workspace của server vẫn chịu trách nhiệm cho các file đã đóng mà truy vấn nhảy tới.

Đích workspace chuẩn hóa phải là một thư mục. Khóa đích của nó cung cấp identity cho pool tiến trình, đường dẫn tiến trình cung cấp cwd, còn URI `file:` do provider sở hữu cung cấp `rootUri` và mục `workspaceFolders` duy nhất; khi các provider hệ thống file phân giải alias về cùng một khóa, chúng chia sẻ instance. Vị trí kết quả có thể nằm ngoài workspace, nhưng đường dẫn bên ngoài không thể trở thành nguồn truy vấn. Hệ thống file không thể chia sẻ đường dẫn với provider subprocess đã mount là lỗi tổ hợp, không phải lý do để tạo thêm package LSP khác.

## Vòng đời server cục bộ và hành vi giao thức

`dsh-lsp-stdio` khởi động lazy một server theo `(provider id, canonical workspace target)`, và gộp các lần khởi động qua single-flight. Khi load plugin, nó gọi `ctx.subprocess.resolveExecutable()` với môi trường đã cấu hình; khi lệnh không khả dụng thì thất bại trước khi đăng ký. Truy vấn đầu tiên khởi động server qua pipe giao thức thô, không qua shell, và thu thập phần đuôi stderr có giới hạn. `maxMessageBytes` mặc định là `16_000_000`, `maxStderrBytes` mặc định là `1_000_000`, `maxDocumentBytes` mặc định là `4_000_000`. Sự cố crash làm truy vấn hiện tại thất bại và không replay; truy vấn sau đó có thể thay thế tiến trình. Mỗi truy vấn khởi động tối đa một tiến trình, nên MVP không đặt bộ đếm khởi động lại xuyên request.

Khởi tạo dùng `processId: null`, vì client và server có thể nằm ở namespace tiến trình khác nhau. Nó khai báo `general.positionEncodings: ['utf-16']`, `workspace: { workspaceFolders: true, configuration: true }`, `textDocument.hover.contentFormat: ['markdown', 'plaintext']`, và `linkSupport: true` cho definition lẫn implementation, nhưng không hỗ trợ đăng ký động. Thao tác và năng lực đồng bộ do server trả về mới là nguồn chân lý. Khi server bỏ qua `positionEncoding`, mặc định là `utf-16`; các giá trị khác đều là lỗi giao thức. Cấu hình có thể cung cấp tùy chọn khởi tạo và phản hồi `workspace/configuration`, nhưng client từ chối `workspace/applyEdit`, không bao giờ thực thi lệnh hay chỉnh sửa.

Kết quả điều hướng ánh xạ trực tiếp `Location`, và ánh xạ `targetUri` cùng `targetSelectionRange` của `LocationLink` thành vị trí thống nhất. Vị trí phải là số nguyên không âm. Việc chuẩn hóa `hover` chỉ chấp nhận cấu trúc `MarkupContent` và `MarkedString` hợp lệ, giữ nguyên giá trị chuỗi, render giá trị có gắn nhãn ngôn ngữ thành code block có hàng rào (fenced), và nối các mảng bằng một dòng trống. Tool hướng tới model áp dụng `maxResultChars` sau khi render.

Tín hiệu hủy được truyền tới mọi giai đoạn của truy vấn, và sau khi tạo request id còn gửi thêm `$/cancelRequest`. Server không phản hồi sẽ bị chấm dứt và chờ đóng; việc tuần tự hóa instance đảm bảo không có công việc đang thực thi khác bị ảnh hưởng lây. Dispose sẽ từ chối và hủy công việc, thử đóng êm dịu (graceful), nâng cấp xử lý qua quy trình chấm dứt có giới hạn, và chờ dừng hoàn toàn.

## API bị hoãn lại có chủ đích

Thao tác symbol bị hoãn vì cần schema khác và trùng lặp với việc đọc hoặc tìm kiếm; tool workspace symbol trong tương lai phải nhận một từ khóa tìm kiếm. Call hierarchy bị hoãn vì mức độ hỗ trợ không đồng đều, `prepareCallHierarchy` vẫn là bước chuẩn bị nội bộ, không phải thao tác của model.

Diagnostics cần các quy tắc độ mới (freshness), tích lũy và transcript riêng. Các năng lực thay đổi như rename, code action và format cần tool riêng, và tích hợp preview, quyền hạn và chính sách ghi.

Provider tin tưởng server đã cấu hình. Khả năng nhìn thấy hệ thống file và cô lập tiến trình của nó hoàn toàn phụ thuộc vào môi trường thực thi đã mount; LSP không thêm chính sách sandbox độc lập.

## Phương án thay thế

**Sao chép schema thống nhất của Claude Code.** Các thao tác con trỏ của nó đã xác thực các kịch bản cốt lõi, nhưng symbol và call hierarchy cần tham số khác. Sao chép cả chín thao tác sẽ cố định một interface chưa được xác thực, do đó seam này chỉ căn chỉnh theo bốn truy vấn ngữ nghĩa.

**Cho phép provider đăng ký tool.** Server đã tải sẽ kiểm soát schema model và prompt, không thể duy trì quy ước thống nhất giữa provider cục bộ và remote.

**Công khai phương thức LSP tùy ý.** Cửa thoát JSON-RPC sẽ làm rò rỉ payload giao thức, và cho phép thay đổi chưa qua review hoặc thực thi lệnh; union thao tác giữ đóng.

**Công khai `resolve(request)` / `query(spec)`.** Khi không có field nào cần điền giá trị mặc định, resolve chỉ expose việc chọn provider, còn việc công khai spec có thể tồn tại kéo dài đến sau khi provider dispose hoặc bị thay thế. Một thao tác duy nhất giúp việc chọn và gọi dùng chung vòng đời đăng ký.

**Bọc signal thành đối tượng execution context của LSP.** Web truyền `AbortSignal` trần; chỉ bọc riêng field này sẽ tạo ra sự bất đối xứng vô nghĩa. Chỉ khi thực sự cần thêm một field khác, `query()` mới đưa vào đối tượng context.

**Đọc qua tool `read` hướng tới model.** Bị từ chối, vì output của tool có cửa sổ và số dòng, sẽ đi vào transcript và đã bị quan sát. Provider tiêu thụ trực tiếp toàn bộ văn bản dạng stream qua cùng môi trường thực thi `ctx.fs` mà subprocess sử dụng.

**Giữ tài liệu luôn mở.** Đồng bộ hình ảnh phản chiếu (mirror editing) cần quy thuộc phiên bản, `didChange` bao phủ mọi đường dẫn, khôi phục HMR, loại bỏ và quy tắc trạng thái lỗi thời. Mở tạm thời tránh đưa bộ máy trạng thái này vào MVP.

**Cấu hình timeout theo từng giai đoạn.** Timer lồng nhau sẽ tạo ra các phân loại và ngân sách cạnh tranh lẫn nhau. Một deadline do bên gọi chịu trách nhiệm bao trùm toàn bộ truy vấn; chỉ việc dọn dẹp ngoài lệnh gọi giữ giới hạn cục bộ.

**Không gửi `didOpen`.** Giao thức tuy cho phép, nhưng mức hỗ trợ không đồng đều và có thể dùng trạng thái server lỗi thời. Mở tạm thời cung cấp snapshot hiện tại rõ ràng.

**Thêm định tuyến hoặc chọn kết quả khớp đầu tiên.** Thứ tự đăng ký và thời điểm HMR không phải ngữ nghĩa sản phẩm, còn bảng định tuyến sẽ lặp lại quyền sở hữu đuôi file duy nhất. Do đó, khi đuôi file trùng lặp, việc đăng ký sẽ thất bại.

**Truy vấn đồng thời trong một instance.** Khi việc hủy thất bại, việc chấm dứt tiến trình dùng chung sẽ giết cả công việc không liên quan. Việc tuần tự hóa trong instance giới hạn phạm vi ảnh hưởng; các instance khác nhau vẫn có thể chạy song song.

**Tích hợp sẵn preset hoặc khám phá qua PATH.** Catalog sẽ khiến host đa dụng phải gánh chính sách ngôn ngữ, còn cơ chế khám phá không thể suy luận tham số, language id hay cấu hình khởi tạo. Deployment cấu hình provider tường minh, plugin tổ hợp có thể đóng gói preset.

## Kiểm thử

- Test package cố định hướng phụ thuộc của ba package, việc inject runtime, và ranh giới chỉ giao tiếp qua `ctx.lsp`.
- Test tool cố định bốn thao tác, việc validate tọa độ, giới hạn cấu hình và cờ bị bỏ qua, prompt và hiển thị UI.
- Test registry cố định việc chiếm dụng/giải phóng nguyên tử, việc chọn không phụ thuộc thứ tự, và các lỗi có cấu trúc: không khả dụng, đã giải phóng, xung đột và thao tác không hỗ trợ.
- Test bằng stdio server cố định chính xác năng lực khởi tạo, bốn ánh xạ giao thức, việc chuẩn hóa `Location`/`LocationLink` và `hover`, và việc ánh xạ `findReferences` sang `references.includeDeclaration`.
- Test đồng bộ cố định thương lượng và chuyển đổi UTF-16, các dạng `textDocumentSync` được hỗ trợ và bị từ chối, việc chặn và thất bại của ghi mở, cặp mở/đóng tạm thời, ghi đóng thất bại và việc từ chối phản hồi lỗi.
- Test timeout cố định một ngân sách `TOOL_TIMEOUT`, không phân loại lỗi hủy thượng nguồn, LSP không có deadline ẩn, và việc dọn dẹp bị giới hạn và chờ hoàn tất.
- Test vòng đời cố định single-flight khởi động, việc tuần tự hóa toàn bộ vòng đời và truy vấn đang xếp hàng đọc file nguồn mới nhất, chạy song song xuyên workspace, hàng đợi có thể hủy, việc thay thế không replay sau crash, việc tháo dỡ tiến trình sau lỗi stdin, và dừng hoàn toàn sau dispose.
- Test host hệ thống file cố định yêu cầu session cwd, containment và render URI riêng của provider, việc đọc tài liệu có giới hạn, văn bản nguồn không định dạng và việc không gửi `fs/observed`.
- Test e2e với server TypeScript thật, không cần key và phiên bản cố định, bao phủ bốn thao tác; cấu hình có thể chạy dùng cùng một ánh xạ provider tường minh.
- Snapshot bao phủ schema hiển thị với model, prompt, kết quả và gợi ý bỏ qua; smoke test artifact build bao phủ việc phân khung (framing) và dọn dẹp.
- Tài liệu package và kiến trúc bao phủ cấu hình, ranh giới bảo mật và hướng dẫn search/read; trong cùng một thay đổi, nhóm package `packages/lsp/` mới cần được thêm vào khối bố cục repo của AGENTS.md, bảng nhóm của packages/README.md và architecture.md.

## Tác động

Mỗi language server xử lý việc hỗ trợ phương thức, diễn giải năng lực và thời điểm sẵn sàng chỉ mục khác nhau; LSP không có tín hiệu "hoàn tất chỉ mục" thống nhất. Server không có năng lực đồng bộ mở tạm thời tương thích sẽ không được hỗ trợ, kể cả khi nó có thể truy vấn tài liệu đã đóng. Server được hỗ trợ vẫn có thể trả về kết quả rỗng hoặc không đầy đủ, do đó tool không cam kết tính đầy đủ xuyên server. E2e cố định với TypeScript chỉ thiết lập một đường cơ sở tương thích, không đại diện cho cam kết xuyên ngôn ngữ.

Việc mở tạm thời sẽ phân giải lặp lại và tạo ra thông báo. Việc tuần tự hóa trong instance sẽ tăng độ trễ cho các agent chạy đồng thời, còn tiến trình workspace chạy lâu dài sẽ tiếp tục chiếm bộ nhớ cho tới khi dispose.

Quyền sở hữu đuôi file trong cùng một runtime mang tính loại trừ lẫn nhau. Ngay cả khi language id khác nhau, hai provider cũng không thể cùng chiếm `.ts`; đây là giới hạn MVP được chấp nhận có chủ đích. Hướng mở rộng dự kiến là thêm một selector do deployment cấu hình phía trên việc đăng ký, cho phép nới lỏng việc chiếm dụng loại trừ lẫn nhau, đồng thời không thêm việc chọn provider vào input của model, cũng không thay đổi `LspProvider.query`.

Cột con trỏ UTF-16 hoàn toàn khớp với giao thức, nhưng model khó đếm chính xác trong văn bản chứa ký tự ngoài BMP. Vị trí không hợp lệ hoặc không nằm trên symbol có thể trả về kết quả rỗng, do đó văn bản lỗi và ví dụ prompt phải giải thích quy ước tọa độ, đồng thời tránh khuyến khích model dùng LSP một cách tràn lan.

Cặp provider hệ thống file/subprocess ghép đôi sẽ căn chỉnh snapshot truy vấn với chỉ mục server, nhưng điều đó không khiến language server đáng tin cậy trở nên an toàn. Containment chuẩn hóa sẽ từ chối nguồn truy vấn nằm ngoài workspace tại thời điểm phân giải, nhưng luồng mở không đảm bảo thêm tính ổn định của handle định danh trong lúc đường dẫn bị thay thế đồng thời; bản thân server nhận được quyền do môi trường thực thi cấu hình, vẫn có thể đọc các đường dẫn khác hoặc dùng cache.
