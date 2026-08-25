# Agent Note: Task Surface cho tương tác phiên có cấu trúc

Status: proposed

[English](2026-08-04-task-surface.md) | Tiếng Việt

## Vấn đề

Có những tác vụ khó hoàn thành bằng cách trao đổi tin nhắn văn bản qua lại. So sánh nhiều lựa chọn, sắp xếp lại thứ tự một kế hoạch, xem xét một bảng dữ liệu, hoặc điền một nhóm nhỏ các trường liên quan đến nhau — tất cả đều phù hợp hơn với một tương tác có cấu trúc diễn ra trong một lượt. Hiện tại, agent (tác nhân) có thể mô tả kiểu tương tác này, nhưng không thể yêu cầu Web client render nó nếu không bổ sung một thành phần sản phẩm vĩnh viễn hoặc sinh ra mã plugin client có thể thực thi.

Cả hai cách giải quyết tạm thời này đều đặt trách nhiệm sai chỗ. Thành phần chuyên dụng cho sản phẩm đòi hỏi mỗi dạng tác vụ mới phải thêm một cách kích hoạt và phát hành một phiên bản mới. Đối với một biểu mẫu chỉ cần một lượt, quyền hạn và chi phí vòng đời mà mã sinh ra nắm giữ vượt xa nhu cầu thực tế. Cách làm này còn biến giao diện hiển thị, thay vì kết luận của người dùng, thành sản phẩm lâu dài.

Hiện đang thiếu một quy ước định nghĩa UI tạm thời bằng một mô tả có giới hạn, có thể phát lại, và chỉ thuộc về một phiên và một lần gọi công cụ (tool call) cụ thể. Sản phẩm nên chịu trách nhiệm về việc kiểm tra hợp lệ, vị trí đặt, cơ chế tương tác và việc gửi (submit); agent nên chịu trách nhiệm về nội dung văn bản đặc thù cho tác vụ, dữ liệu, và việc lựa chọn trong số các thành phần được hỗ trợ.

## Đề xuất

Bổ sung **Task Surface**: một model khai báo (declarative), có version, được một plugin Web client thông thường render. Cung cấp cho model một công cụ (tool) ổn định là `show_task_surface` để phát hành model này. Sau khi gọi thành công, lượt hiện tại kết thúc. Người dùng chỉnh sửa và gửi (submit) bảng điều khiển đã render; Host ghi lại nội dung gửi thành một tin nhắn người dùng bình thường, hiển thị được, rồi bắt đầu lượt tiếp theo.

Khi đồng thời thỏa mãn các điều kiện sau, Task Surface là đường dẫn UI có cấu trúc mặc định:

- Tương tác thuộc về phiên hiện tại và tác vụ hiện tại;
- Hành vi có thể được biểu đạt bằng tập hợp thành phần đã khai báo;
- Không cần thực thi nền hoặc thêm quyền runtime mới;
- Kết quả lâu dài có giá trị là kết luận do người dùng gửi lên, chứ không phải bản thân bảng điều khiển.

Những gì được định nghĩa ở đây là một cách kích hoạt, không phải một tập quy tắc heuristic của sản phẩm. Agent sẽ gọi `show_task_surface` một cách tường minh. Người dùng có thể yêu cầu agent sử dụng Task Surface bằng ngôn ngữ tự nhiên bình thường. Sản phẩm sẽ không tự mở bảng điều khiển chuyên dụng dựa trên tên công cụ hay chủ đề tác vụ; việc sử dụng lặp lại cũng không tự động biến Task Surface thành một plugin.

Các câu hỏi chặn (blocking) ngắn gọn vẫn do [`ask_user_question`](../../implemented/feature/2026-07-29-ask-question-web-presentation.md) xử lý. Phần giải thích thuần văn bản vẫn nằm trong chat. Việc điều hướng xuyên phiên, hành vi chạy nền, dịch vụ mới, hoặc UI tùy chỉnh lâu dài thuộc về luồng công việc Generated Client Plugin.

## Model khai báo

`TaskSurfaceModelV1` dùng JSON. Nó gồm các khối nội dung, các trường nhập liệu và một nhãn nút gửi (submit label); không chứa mã, callback, selector, HTML, CSS, URL tới sản phẩm có thể thực thi, cũng không chứa ngôn ngữ biểu thức. Kiểu này không liên quan đến kiểu reducer tin nhắn `SurfaceManager`/`SurfaceOp` đã có trong core session; Task Surface là một giao thức tương tác của sản phẩm.

```ts
interface TaskSurfaceModelV1 {
  version: 1
  title: string
  description?: string
  sections: TaskSurfaceSection[]
  fields?: TaskSurfaceField[]
  submit: { label: string }
}

interface TaskSurfaceSection {
  id: string
  title?: string
  layout?: TaskSurfaceLayout
  blocks: TaskSurfaceBlock[]
}

type TaskSurfaceLayout =
  | { kind: 'stack' }
  | { kind: 'grid'; columns: 2 | 3 }

type TaskSurfaceBlock =
  | { kind: 'markdown'; text: string }
  | { kind: 'metrics'; items: { label: string; value: string; detail?: string }[] }
  | { kind: 'table'; columns: { id: string; label: string }[]; rows: Record<string, string | number | boolean | null>[] }
  | { kind: 'diff'; path?: string; before: string | null; after: string; language?: string }
  | { kind: 'notice'; tone: 'neutral' | 'info' | 'warning'; text: string }

type TaskSurfaceField =
  | { kind: 'text'; id: string; label: string; multiline?: boolean; required?: boolean; initial?: string }
  | { kind: 'choice'; id: string; label: string; options: TaskSurfaceOption[]; initial?: string }
  | { kind: 'multi-choice'; id: string; label: string; options: TaskSurfaceOption[]; initial?: string[] }
  | { kind: 'toggle'; id: string; label: string; initial?: boolean }
  | { kind: 'order'; id: string; label: string; options: TaskSurfaceOption[]; initial?: string[] }

interface TaskSurfaceOption { id: string; label: string; detail?: string }
```

Renderer kiểm soát kiểu chữ, khoảng cách, bố cục đáp ứng (responsive layout), thứ tự focus, hành vi bàn phím và các token theme. Khi không chỉ định layout thì dùng `stack`; layout `grid` có sẵn số cột và sẽ gập lại khi chiều rộng khả dụng không đủ chứa. Khi gặp phiên bản không xác định hoặc nhánh union type không xác định, hệ thống sẽ dùng phương án dự phòng là kết quả công cụ thông thường (generic tool result), thay vì chỉ diễn giải một phần của nó.

Khối `markdown` tái sử dụng `MarkdownText`, và chỉ định tường minh chính sách URL của model. `MarkdownText` bổ sung `remoteImages: 'render' | 'alt-only'`; các tình huống thông thường vẫn mặc định dùng `render`, còn Task Surface luôn truyền `alt-only`, nên cú pháp ảnh chỉ render văn bản thay thế (alt text). HTML thô và media nhúng vẫn bị bỏ qua, không sinh bản xem trước liên kết tự động (auto link preview); không có thao tác tường minh nào của người dùng thì sẽ không giải tham chiếu (dereference) bất kỳ URL nào do model cung cấp. Các liên kết HTTP(S) thông thường vẫn có thể điều hướng sau khi người dùng chọn. Các tài nguyên ứng dụng cố định như phân đoạn tô sáng cú pháp (syntax highlighting) vẫn tuân theo chính sách tải thông thường của sản phẩm.

Phiên bản 1 cố ý không hỗ trợ trường điều kiện, lấy dữ liệu phía client, biểu đồ, tải tệp lên và trình xử lý sự kiện tùy ý. Việc thêm bất kỳ loại khối hay loại trường nào đều là một thay đổi giao thức, và phải bổ sung trong cùng thay đổi đó: parser, renderer, hành vi trợ năng (accessibility), phương án dự phòng, và fixture phát lại (dữ liệu tiền đề cho test).

Dịch vụ Task Surface có các giới hạn được định nghĩa qua config được kiểm tra bởi schema. Giá trị mặc định ban đầu: model đã chuẩn hóa không vượt quá 64 KiB, không quá 64 khối, không quá 32 trường, bảng không quá 200 hàng, nội dung gửi không quá 32 KiB. ID bên trong model phải duy nhất; giá trị trường phải khớp với khai báo của nó; trường không xác định sẽ bị từ chối. Các giới hạn này ràng buộc chi phí log, DOM và prompt, nhưng không thay đổi giao thức.

## Quy ước công cụ và trình bày

`show_task_surface` nhận `{ model: TaskSurfaceModelV1 }`. Host phân tích cú pháp và chuẩn hóa toàn bộ model; nếu phiên đó đã có một Task Surface đang mở, lệnh gọi sẽ bị từ chối; nếu không, hệ thống sinh ra `surfaceId` và trả về giá trị chuẩn (canonical value) kèm model đã chuẩn hóa `{ surfaceId, model }`. `presentationMeta` lưu bền `value.model`, để bộ chiếu (projector) và bộ thực thi (executor) không bị lệch nhau về kết quả chuẩn hóa. Kết quả Native sẽ chỉ rõ Surface này, và nêu rằng khi client không thể render bảng điều khiển thì có thể bỏ qua nó bằng một tin nhắn thông thường. Sau đó công cụ gọi `exec.concludeTurn()`, ngăn agent tiếp tục thực thi vượt qua điểm kiểm tra thủ công (checkpoint) bắt buộc.

Định nghĩa công cụ bỏ qua `isConcurrencySafe`. Theo quy ước hiện có của registry công cụ, việc bỏ qua trường này sẽ phân loại mỗi lần gọi là một rào chắn thứ tự độc quyền (exclusive ordering barrier), không cần thêm trường mới vào `ToolDefinition`. Công cụ này chỉ được lắp ráp vào profile Web có đồng thời gắn Host service và Web renderer. Phiên bản 1 hỗ trợ chế độ công cụ `native` và `both`; profile chỉ hỗ trợ `code` sẽ không công bố công cụ này cho model, vì việc phân phối theo Code Mode là một lệnh gọi lồng nhau (nested call), không thể truyền metadata trình bày vào kết quả ở lớp ngoài.

Gói domain an toàn cho trình duyệt import primitive `Branded` từ `@deepseek-ai/dsh-brand` theo kiểu chỉ-loại (type-only), và sở hữu cả ba ID của Task Surface. Theo [quy ước kết quả công cụ chuẩn (canonical tool output)](../../implemented/architecture/2026-07-20-canonical-tool-output-contract.md), giá trị chuẩn chỉ tồn tại trong lần thực thi này. Do đó, việc phát lại (replay) thông qua `output.presentationMeta(args, value)` sẽ lưu bền tải trọng (payload) có gắn nhãn sau đây cùng với `tool/result.meta`:

```ts
import type { Branded } from '@deepseek-ai/dsh-brand'

type TaskSurfaceId = Branded<'TaskSurfaceId'>
type TaskSurfaceSubmissionId = Branded<'TaskSurfaceSubmissionId'>
type TaskSurfaceDismissalId = Branded<'TaskSurfaceDismissalId'>

interface TaskSurfacePresentationMeta {
  kind: 'dsh/task-surface'
  version: 1
  surfaceId: TaskSurfaceId
  model: TaskSurfaceModelV1
}
```

Công cụ này giữ nguyên [render intent](../../implemented/architecture/2026-07-02-tool-render-intent-union.md) chung. Dòng Web có key (keyed) đọc metadata đã gắn nhãn vốn có sẵn trên `ToolResultNode`, không cần thêm nhánh render-intent hay registry trình bày mới. Client không hỗ trợ Task Surface sẽ render nội dung kết quả thông thường.

Plugin Web tuân theo quy ước [toolview](../../implemented/architecture/2026-07-23-toolview-dissolution.md) và [đăng ký slot](../../implemented/architecture/2026-07-22-slot-type-chain-implementation.md), cung cấp hai mục đăng ký tĩnh có phạm vi phiên (session-scoped). Một mục `conversation.chat.toolview` với key là `show_task_surface` sẽ render lần gọi transcript (bản ghi văn bản) bền vững thành một tóm tắt gọn gàng và chỉ đọc lại được (read-only replay). Một mục `TaskSurfaceDock` trong `conversation.input.dock` hiện có là điểm gắn (mount point) duy nhất có thể thao tác được: nó đọc projection đang hoạt động, gọi `getActive` với danh tính chính xác, và sở hữu các thao tác trường, bản nháp (draft), gửi (submit) và đóng (close). Dock độc lập với việc phân trang transcript, nên ngay cả khi `ToolResultNode` nằm ngoài cửa sổ lịch sử đã tải, Surface đang hoạt động vẫn có thể thao tác được.

Dock tuân theo ngữ nghĩa dự phòng (fallback) của composer chain hiện có. Bất kỳ sự tiếp quản (takeover) `conversation.composer` nào cũng sẽ ẩn stack composer dự phòng, bao gồm cả `TaskSurfaceDock`, nhưng không unmount nó; sau khi kết thúc tiếp quản, cùng một chủ sở hữu bản nháp (draft owner) sẽ xuất hiện trở lại. Bên tiếp quản sẽ không có được các thao tác Task Surface, cũng không tạo ra một editor khác.

Model không thể chọn tab phiên, thứ tự Dock, panel chi tiết, modal, vị trí pixel hay z-index. Sau này dù có thay đổi vị trí đặt, đó cũng chỉ là quyết định của renderer, không làm thay đổi model được ghi trong log. Dòng transcript sẽ không bao giờ trở thành một editor thứ hai, nên cùng một Surface sẽ không xuất hiện tình trạng tranh chấp giữa các chủ sở hữu bản nháp hay chủ sở hữu việc gửi.

## Quy ước gửi (submit)

Domain Task Surface công bố ba thao tác qua tầng truyền tải (transport) của Host. Chỉ có `submit` mới tiếp nhận (accept) tin nhắn người dùng:

```ts ignore-check
type TaskSurfaceSubmissionPhase = 'queued' | 'claiming'

interface TaskSurfacePendingSubmission {
  submissionId: TaskSurfaceSubmissionId
  messageId: MessageId
  phase: TaskSurfaceSubmissionPhase
}

interface TaskSurfaceService {
  getActive(input: { sessionId: SessionId; surfaceId: TaskSurfaceId }): Promise<GetActiveTaskSurfaceResult>
  submit(input: SubmitTaskSurfaceRequest): Promise<SubmitTaskSurfaceResult>
  dismiss(input: DismissTaskSurfaceRequest): Promise<DismissTaskSurfaceResult>
}

interface SubmitTaskSurfaceRequest {
  sessionId: SessionId
  surfaceId: TaskSurfaceId
  submissionId: TaskSurfaceSubmissionId
  values: Record<string, JsonValue>
  note?: string
}

type SubmitTaskSurfaceResult =
  | { accepted: true; messageId: MessageId; phase: 'queued' }
  | { accepted: false; reason: 'not-open' | 'stale' | 'invalid-submission' | 'submission-pending' }

type GetActiveTaskSurfaceResult =
  | {
      active: true
      callId: CallId
      surfaceId: TaskSurfaceId
      model: TaskSurfaceModelV1
      pending: TaskSurfacePendingSubmission | null
    }
  | { active: false; reason: 'not-open' }

interface DismissTaskSurfaceRequest {
  sessionId: SessionId
  surfaceId: TaskSurfaceId
  dismissalId: TaskSurfaceDismissalId
}

type DismissTaskSurfaceResult =
  | { dismissed: true; eventSeq: number }
  | { dismissed: false; reason: 'not-open' | 'stale' | 'submission-pending' }
```

Host xác định chính xác lần gọi thành công của `show_task_surface`, xác thực lại (re-validate) giá trị gửi lên dựa trên model đã lưu bền, rồi tiếp nhận phản hồi qua hàng đợi phiên (session queue) thông thường. Phản hồi đó trở thành một tin nhắn có vai trò người dùng (user role), sử dụng nguồn tin nhắn (message source) có thể mở rộng qua hợp nhất khai báo (mergeable):

```ts ignore-check
interface TaskSurfaceCorrelation {
  version: 1
  submissionId: TaskSurfaceSubmissionId
  callId: CallId
  surfaceId: TaskSurfaceId
  values: Record<string, JsonValue>
}

interface TaskSurfaceUserMessageSource {
  kind: 'user'
  rpcId: RpcId
  taskSurface: TaskSurfaceCorrelation
}
```

Mục giao thức `session/queue` đã mang theo toàn bộ `Message`. Projection phía client sẽ được mở rộng tường minh để giữ lại nguồn của nó, không còn làm mất thông tin liên kết (correlation) nữa:

```ts ignore-check
interface QueuedMessage {
  id: InboxItemId
  messageId: MessageId
  placement: 'queued' | 'steering'
  source: MessageSource
  content: readonly ContentBlock[]
  preview: string
  text: string | null
}
```

Gói domain an toàn cho trình duyệt sở hữu `TaskSurfaceId`, ID gửi và đóng, `TaskSurfaceCorrelation`, cùng hình thái của việc gửi đang chờ xử lý (pending submission). ApiProxy sở hữu phần mở rộng truyền tải, chịu trách nhiệm kết hợp thông tin liên kết với `rpcId`. Việc giữ `kind: 'user'` giúp duy trì bong bóng tin nhắn người dùng thông thường và ngữ nghĩa prompt; các trường bổ sung cung cấp thông tin liên kết bền vững. Nội dung tin nhắn là một bản tóm tắt dễ đọc do sản phẩm định dạng, gồm tiêu đề bảng điều khiển, các nhãn và giá trị đã gửi, cùng ghi chú tùy chọn. Model nhận được cùng một văn bản đó. Nguồn có cấu trúc không phải là một chỉ thị ẩn thứ hai.

Vỏ sản phẩm (product shell) chịu trách nhiệm về việc thu gọn và đóng. Thu gọn là trạng thái view cục bộ, không gửi đi bất kỳ nội dung nào. Khi không có submission đang chờ xử lý, `taskSurface.dismiss({ sessionId, surfaceId, dismissalId })` sẽ thêm một sự kiện phiên `task-surface/dismissed`, nhưng không khởi động lượt mới; sự kiện chính xác đó sẽ đóng projection, và cập nhật Dock cùng dòng transcript. Việc thử lại (retry) sẽ tái sử dụng `dismissalId` và trả về kết quả ban đầu, không thêm sự kiện mới. Khi việc gửi đang ở giai đoạn `queued` hoặc `claiming`, thao tác đóng sẽ bị vô hiệu hóa, và Host cũng sẽ từ chối các yêu cầu như vậy bằng `submission-pending`.

Việc gửi ở ranh giới client mang tính giao dịch (transactional). Việc tiếp nhận thành công sẽ trả về `messageId` chính xác ở giai đoạn `queued`; trong cả hai giai đoạn `queued` và `claiming`, Dock sẽ vô hiệu hóa mọi thay đổi, và chỉ khi tin nhắn người dùng khớp đã được lưu bền thì bản nháp đã lưu bền mới bị xóa. Nếu yêu cầu bị từ chối, giá trị sẽ được giữ lại để người dùng tiếp tục chỉnh sửa, và lý do trả về sẽ được hiển thị. Việc double-click và việc thử lại truyền tải sẽ tái sử dụng `submissionId` và trả về kết quả của lần gọi đầu tiên; chừng nào lần gửi đầu tiên vẫn đang được xử lý, một submission ID khác sẽ nhận `submission-pending`. Đối với một Surface đã được chấp nhận, Host chỉ tiếp nhận đúng một tin nhắn người dùng.

Dịch vụ Task Surface ghi lại trạng thái điều phối (coordination state) của một submission đã được chấp nhận là `pending.phase: 'queued'`, và client có thể liên kết nó thông qua trường `source` được giữ lại trên dòng vẫn còn trong hàng đợi. Khi Agent lấy lần gọi đó ra khỏi hàng đợi để tiếp nhận như một prompt thông thường, dịch vụ trước tiên sẽ đồng bộ đổi cùng một bản ghi đang chờ đó thành `claiming`, rồi ApiProxy mới phát hành snapshot hàng đợi thông thường không còn chứa dòng đã được nhận (claimed) đó nữa. Dịch vụ sẽ giữ trạng thái nhận trong tiến trình (in-process claiming state) này trong suốt quá trình tiếp nhận bất đồng bộ và khi kết nối lại, cho đến khi `user/message` bền vững khớp được phát hành, hoặc Agent báo cáo việc bị hủy bỏ ở trạng thái cuối (terminal discard).

`user/message` khớp sẽ đóng projection bền vững và xóa trạng thái nhận (claim state). Khi việc từ chối, hủy, hoặc dispose (giải phóng tài nguyên) xảy ra trước khi lưu bền, hệ thống sẽ báo cáo việc bị hủy bỏ, xóa trạng thái nhận, và giữ Surface ở trạng thái mở. Dock sẽ không bao giờ diễn giải việc dòng hàng đợi biến mất thành một trong hai kết quả đó, mà sẽ đọc lại `getActive`: `pending.phase: 'claiming'` sẽ giữ trạng thái vô hiệu hóa, `pending: null` sẽ khôi phục bản nháp, `not-open` sẽ đóng Dock. `getActive` sẽ hợp nhất lần gọi đang hoạt động được suy ra từ log với bản ghi đang chờ duy nhất trong tiến trình này. Bản ghi đó thuộc về trạng thái điều phối, không phải là nguồn thẩm quyền bền vững thứ hai; sau khi Host khởi động lại, trạng thái nhận chưa được gửi (unsubmitted claim state) sẽ không còn tồn tại, và Surface vẫn đang mở trong log sẽ khôi phục về trạng thái có thể chỉnh sửa.

Đối với dòng có mang thông tin liên kết Task Surface, `session.updateQueue` sẽ từ chối `edit` và `steer`. Việc chỉnh sửa (edit) sẽ khiến nội dung đã định dạng bị lệch khỏi giá trị có cấu trúc mà nguồn tin nhắn mang theo, còn steering (dẫn hướng giữa chừng) sẽ lưu bền một `steering/message` không phù hợp với vòng đời gửi. Khi dòng vẫn còn trong hàng đợi thì `remove` được phép; nó sẽ báo cáo việc bị hủy bỏ và khôi phục về Surface đang mở. Sau khi dòng được nhận (claimed) thì nó đã rời khỏi hàng đợi chung, và thay đổi hàng đợi sẽ trả về `queue-item-not-found`. Dịch vụ Task Surface sẽ giữ một bản ghi đang chờ theo kiểu single-flight cho đến khi được gửi hoặc bị hủy bỏ.

## Vòng đời và khôi phục

Log phiên là nguồn chân lý (source of truth). Một đơn vị `taskSurface` nhỏ trong [hệ thống projection phiên](../architecture/2026-07-27-session-projection-and-command-log.md) hiện có sẽ gộp (fold) metadata kết quả Surface của lần gọi thành công cùng với nguồn tin nhắn người dùng theo sau, để cho ra trạng thái sau:

```ts ignore-check
interface TaskSurfaceProjection {
  active: { callId: CallId; surfaceId: TaskSurfaceId } | null
}
```

Một phiên tối đa chỉ có thể có một Task Surface đang mở. Kết quả thành công sẽ mở nó; tin nhắn người dùng Task Surface khớp hoặc sự kiện đóng sẽ đóng nó lại. Tin nhắn người dùng thông thường tiếp theo cũng sẽ đóng nó, đây là một đường vòng (bypass) tường minh; trước khi một trong các sự kiện trên đóng lần gọi đang hoạt động, việc gọi lại `show_task_surface` sẽ thất bại. Rollback và fork sẽ suy ra lần gọi đang hoạt động bằng cách gộp log tương ứng; các giai đoạn hàng đợi thoáng qua (transient) sẽ không được sao chép, và cũng không có cơ sở dữ liệu Surface riêng biệt nào tham gia vào việc này.

Model đầy đủ vẫn được lưu trong `tool/result.meta` tương ứng; projection chỉ mang theo danh tính đang hoạt động. `TaskSurfaceDock` tồn tại độc lập với dòng lịch sử, và sẽ phản ứng theo danh tính đó. `taskSurface.getActive({ sessionId, surfaceId })` sẽ đọc chính xác lần gọi đó từ log phiên, xác thực lại metadata của nó, hợp nhất bản ghi điều phối đang chờ của dịch vụ Task Surface, rồi trả về `{ callId, surfaceId, model, pending }`. Khi lần gọi không tồn tại hoặc đã đóng thì trả về `not-open`. Do đó, ngay cả khi kết quả nằm ngoài đoạn cuối lịch sử, việc làm mới (refresh) và kết nối lại vẫn có thể khôi phục Surface có thể thao tác được cùng giai đoạn đang chờ trong cùng tiến trình, mà không cần sao chép model vào mọi baseline projection.

Plugin Web lưu các giá trị chưa gửi trong một slot store có giới hạn, được lưu bền theo từng phiên, với key là `surfaceId`; các giá trị này sẽ không bao giờ đi vào log phiên, prompt hay bộ nhớ dài hạn. Giá trị đã gửi được lưu trong tin nhắn người dùng đã được tiếp nhận, nên ngay cả khi bản nháp trên trình duyệt bị mất, kết luận cũng không bị xóa.

## Ranh giới gói và phụ thuộc

Năng lực này được tách thành nhiều gói tại những điểm mà trách nhiệm thay đổi:

| Gói | Trách nhiệm |
|---|---|
| `packages/core/agent` và `packages/core/agent-loop` | Cung cấp kết quả trạng thái cuối (terminal result) chung cho các mục inbox lượt tiếp theo đã được nhận (claimed), để bên quan sát Host có thể phân biệt việc tiếp nhận bền vững và việc hủy bỏ mà không cần dùng kiểu chuyên dụng của Task Surface |
| `packages/task-surface/task-surface` | Model an toàn cho trình duyệt, các ID có kiểu gắn nhãn (branded type), kiểu liên kết (correlation) và kiểu đang chờ (pending), parser, các giới hạn, bộ xác thực/định dạng khi gửi, phần mở rộng sự kiện phiên, đơn vị projection, và quy ước dịch vụ Host |
| `packages/task-surface/tool-task-surface` | `show_task_surface`, kết quả chuẩn (canonical output), metadata trình bày, render intent chung, kiểm tra Surface đang hoạt động, và hành vi `concludeTurn()` |
| `packages/client/runtime` | Projection `source` chung cho tin nhắn trong hàng đợi, và truy cập projection đang hoạt động có phạm vi phiên |
| `packages/client/ui-primitives` | Chính sách `MarkdownText.remoteImages` không phụ thuộc vào Task Surface, bao gồm nhánh ảnh `alt-only` và test chính sách URL |
| `packages/client/ui-task-surface` | `TaskSurfaceDock` tĩnh và có thể thao tác, dòng transcript chỉ đọc có key, renderer Web khai báo tiêu thụ model Task Surface và dùng `MarkdownText` ở chế độ `alt-only`, draft store phân theo phiên, và client gửi (submit) |
| `packages/host/apiproxy` | Truyền tải đọc/gửi/đóng Surface đang hoạt động đã định kiểu, mở rộng và truyền nguồn tin nhắn người dùng, giới hạn thao tác hàng đợi, và định tuyến kết quả nhận và kết quả cuối; ủy quyền việc xác thực, điều phối đang chờ và tiếp nhận cho dịch vụ Task Surface |

`ui-task-surface` phụ thuộc vào gói domain Task Surface an toàn cho trình duyệt, connection và runtime phía client, locale, quy ước slot do `ui-conversation` khai báo, `ui-slots` dùng để đăng ký, và `ui-primitives`; `ui-primitives` không phụ thuộc ngược lại vào Task Surface. ApiProxy phụ thuộc vào quy ước dịch vụ Task Surface và kết quả trạng thái cuối chung của AgentLoop. Gói Agent lõi (core) không import kiểu Task Surface.

Việc triển khai này phụ thuộc vào log tin nhắn hiện có, kết quả công cụ chuẩn, render intent có gắn nhãn, projection phiên, slot store khai báo theo phạm vi phiên và vòng đời slot; không phụ thuộc vào việc tạo plugin client tại runtime. Luồng Generated Client Plugin có thể dùng Task Surface để hiển thị biểu mẫu xem xét, nhưng không giao thức nào sở hữu hay kích hoạt giao thức còn lại.

## Các giai đoạn triển khai

1. Triển khai model/parser, chính sách URL của model `MarkdownText`, đơn vị projection, `show_task_surface`, metadata trình bày, dòng Web chỉ đọc, `TaskSurfaceDock` tĩnh, đọc Surface đang hoạt động, và phương án dự phòng chung với các khối chỉ đọc.
2. Bổ sung các trường, bản nháp lưu bền, gửi/đóng đã được Host xác thực, thông tin liên kết có kiểu gắn nhãn, truyền nguồn khi xếp hàng phía client, điều phối `queued`/`claiming` của Task Surface, báo cáo trạng thái cuối cho lần gọi đã được nhận, giới hạn thao tác hàng đợi, và việc tiếp nhận tin nhắn người dùng hiển thị được.
3. Chỉ bổ sung các loại thành phần có cơ sở tác vụ thực tế, và có ít nhất hai bên tiêu thụ hoặc có phương án dự phòng chung rõ ràng. Một thao tác người dùng tường minh riêng biệt có thể khởi động luồng viết plugin client sinh ra, nhưng chỉ tạo ra một phương án ứng viên, không bao giờ trực tiếp biến mã đó thành triển khai chính thức.

## Các phương án thay thế đã cân nhắc

**Thêm cách kích hoạt và bảng điều khiển chuyên dụng cho sản phẩm.** Không áp dụng, vì mỗi dạng tác vụ mới sẽ khiến hành vi của agent bị ràng buộc chặt (couple) với thành phần sản phẩm đã phát hành. Mã sản phẩm nên định nghĩa một bộ từ vựng thành phần được chấp nhận và chính sách đặt vị trí; agent thì lựa chọn tường minh trong số đó.

**Render HTML, CSS hoặc JavaScript tùy ý từ lệnh gọi công cụ.** Không áp dụng, vì điều này sẽ biến tương tác tạm thời thành mã plugin client có thể thực thi, nhưng lại không có vòng đời build, preview, đánh giá, phê duyệt hay rollback mà mã cần có.

**Mở rộng `userInteraction.ask()` bằng biểu mẫu lớn.** Quy ước này không áp dụng cách làm đó. `ask()` là một thao tác request/response chặn (blocking), phù hợp cho trường hợp một công cụ đang chạy cần nhận được câu trả lời ngắn gọn trước khi tiếp tục thực thi. Task Surface sẽ kết thúc lượt hiện tại, có thể tiếp tục ở trạng thái mở sau khi refresh, và gửi kết quả thành tin nhắn người dùng hiển thị được tiếp theo.

**Đăng ký một `conversation.view` động cho mỗi lần gọi.** Không áp dụng, vì sổ đăng ký view (view ledger) là toàn cục, còn phạm vi render của nó lại chia theo phiên; đồng thời, danh tính tác vụ tạm thời sẽ trở thành danh tính đăng ký. Một Dock tĩnh có phạm vi phiên đảm nhận việc tương tác, một dòng tĩnh có key tóm tắt lần gọi đã được ghi lại; cả hai mục đăng ký đều không dùng danh tính của lần gọi.

**Chỉ giữ model trong giá trị công cụ chuẩn.** Không áp dụng, vì giá trị chuẩn không được lưu bền. Việc phát lại yêu cầu ghi model đã chuẩn hóa vào `presentationMeta`.

**Lưu bảng điều khiển vào bộ nhớ dài hạn.** Không áp dụng, vì bố cục và trạng thái bản nháp không phải là sự kiện có thể tái sử dụng. Chính sách bộ nhớ hiện có có thể giữ lại kết luận do người dùng gửi.

## Tiêu chí nghiệm thu

- Ở chế độ công cụ `native` hoặc `both`, model thực tế có thể gọi một schema `show_task_surface` ổn định; lệnh gọi kết thúc lượt hiện tại; Web client có năng lực tương ứng có thể render cùng một model đã chuẩn hóa cả khi chạy thời gian thực lẫn sau khi phát lại; chế độ chỉ hỗ trợ `code` sẽ không công bố công cụ này cho model.
- `TaskSurfaceDock` tĩnh là editor duy nhất, vẫn có thể thao tác ngay cả khi kết quả đang hoạt động nằm ngoài cửa sổ lịch sử đã tải; toolview có key luôn là bản tóm tắt và phát lại chỉ đọc của transcript. Việc tiếp quản composer sẽ ẩn Dock vẫn đang mounted, giữ lại bản nháp của nó, và hiển thị lại cùng một chủ sở hữu sau khi tiếp quản được giải phóng.
- Mỗi thao tác gửi ứng với một `submissionId` sẽ tạo ra đúng một tin nhắn người dùng hiển thị được, được tiếp nhận qua hàng đợi thông thường để bắt đầu lượt tiếp theo, đồng thời vẫn giữ `source.kind: 'user'` và duy trì liên kết chính xác có kiểu gắn nhãn tới lần gọi đó; thao tác đóng ghi lại một sự kiện log, không khởi động lượt mới.
- Dòng hàng đợi phía client giữ lại nguồn tin nhắn đã liên kết. `getActive` có thể công bố `queued` hoặc `claiming` trước và sau khi kết nối lại trong cùng tiến trình; sau khi lưu bền xong sẽ đóng projection, còn việc hủy bỏ tường minh sẽ xóa trạng thái đang chờ và giữ Surface ở trạng thái mở. Việc dòng hàng đợi biến mất tự nó không làm thay đổi bất kỳ trạng thái UI nào. Hệ thống sẽ từ chối chỉnh sửa và steering, và thao tác xóa chỉ thành công trước khi được nhận (claim).
- Refresh, kết nối lại, chuyển phiên, fork và rollback đều sinh ra trạng thái vòng đời do log quyết định; `getActive` có thể khôi phục model và giai đoạn đang chờ nằm ngoài đoạn cuối lịch sử, không có bảng điều khiển, trạng thái đang chờ hay bản nháp nào bị rò rỉ sang phiên khác.
- Khi gặp phiên bản không được hỗ trợ, metadata sai định dạng, hoặc client thiếu năng lực, hệ thống sẽ dùng phương án dự phòng là nội dung kết quả công cụ có thể đọc được kèm đường vòng bằng tin nhắn thông thường; lệnh gọi lồng nhau, cũng như lệnh gọi phát sinh khi đã có một Surface khác đang hoạt động, đều không thể mở Surface, và sẽ kết thúc bằng thất bại.
- Schema giao thức sẽ xác thực chuỗi ID, domain API luôn công bố ID có kiểu gắn nhãn. Parser của model sẽ bắt buộc xác thực hình thái layout có gắn nhãn, giá trị trường, và các giới hạn về số byte cũng như số lượng đã cấu hình trước khi bảng điều khiển có thể tương tác được. Test trình duyệt chứng minh: cú pháp ảnh sẽ biến thành văn bản thay thế, HTML thô và media nhúng sẽ không được render, và sẽ không có yêu cầu tới URL do model cung cấp trước khi người dùng thao tác tường minh.
- Test thành phần bao phủ thao tác thuần bàn phím, khôi phục focus, tên trợ năng (accessible name), bố cục màn hình hẹp, cả hai theme, và giao diện sản phẩm tiếng Trung lẫn tiếng Anh.
- Test tổ hợp trình duyệt không cần key bao phủ: hiển thị, sự phân chia trách nhiệm giữa Dock và dòng chỉ đọc, khôi phục ngoài cửa sổ, chỉnh sửa, thử lại sau khi bị từ chối tiếp nhận, chuyển đổi từ `queued` sang `claiming`, hủy bỏ, bàn giao bền vững không có khoảng trống có thể chỉnh sửa, các thao tác hàng đợi bị cấm, đóng, kết nối lại, và tính idempotent khi gửi hai lần.
- Snapshot tiền tố (prefix) cho thấy: dù model đặc thù cho tác vụ thay đổi thế nào, cũng chỉ tồn tại đúng một định nghĩa công cụ ổn định; chỉ có tham số gọi và kết luận người dùng theo sau là thay đổi.
- Khi unmount plugin Web, Fiber sở hữu nó sẽ thực hiện dispose đối với Dock, dòng công cụ và draft store, nhưng không làm thay đổi transcript bền vững.

## Rủi ro

Lô thành phần đầu tiên có thể nhỏ đến mức không đáp ứng được tác vụ thực tế, cũng có thể lớn đến mức tiến hóa thành một khung ứng dụng thô sơ. Việc có nên thêm thành phần mới hay không nên do bằng chứng sử dụng thực tế quyết định; v1 không cung cấp ngôn ngữ biểu thức hay hành vi mạng.

Chính sách Markdown của Task Surface loại bỏ ảnh inline, media và bản xem trước liên kết tự động. Liên kết thông thường vẫn có ích, nhưng chỉ có thể điều hướng hoặc gửi yêu cầu sau khi người dùng thao tác tường minh.

Ngay cả khi đã đặt giới hạn byte, bảng lớn và Markdown vẫn có thể sinh ra DOM tốn kém. Renderer phải ảo hóa (virtualize) hoặc cắt bớt nội dung khi cần, đồng thời vẫn giữ phương án dự phòng có thể đọc được và số đếm rõ ràng.

Khi điền nhiều trường, tin nhắn gửi do sản phẩm định dạng có thể quá dài. Bộ định dạng cần dùng một định dạng gọn, xác định (deterministic), giữ lại mọi giá trị đã gửi, đồng thời tránh việc lặp lại hiển thị đầy đủ model.

Việc giữ trạng thái nhận trong tiến trình cho đến khi hoàn tất việc bàn giao bền vững sẽ thêm một bất biến (invariant) ở trạng thái cuối. Mỗi đường thoát của việc tiếp nhận đều phải sinh ra một `user/message` khớp hoặc một sự hủy bỏ tường minh, nếu không việc kết nối lại có thể khiến Dock bị vô hiệu hóa vĩnh viễn.

Bản nháp được lưu bền cục bộ trên trình duyệt có thể giữ lại văn bản chưa gửi nhạy cảm. Store cần tuân thủ giới hạn byte đã quy định, dùng key phân theo phiên, xóa tường minh sau khi gửi thành công, và áp dụng cùng chính sách lưu trữ với bản nháp phiên hiện có.

Dock và dòng transcript hiển thị cùng một lần gọi với hai vai trò khác nhau. Việc giữ dòng công cụ ở chế độ chỉ đọc, và để Dock là chủ sở hữu thay đổi duy nhất, có thể tránh xung đột bản nháp, nhưng cái giá phải trả là sẽ có một biểu diễn tóm tắt thứ hai xuất hiện trong lúc Surface đang hoạt động.
