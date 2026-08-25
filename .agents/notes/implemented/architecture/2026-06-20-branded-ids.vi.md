# Agent Note: Dùng branded ID ở mọi nơi cần thiết

Status: implemented

[English](2026-06-20-branded-ids.md) | 中文

## Vấn đề

harness dùng cơ chế `Branded<B> = string & { readonly [BRAND]: B }` để brand hóa `CallId` (`packages/llm/llm/src/brand.ts`) và `SessionId` (`packages/core/session/src/types.ts`) dùng chung giữa agent (agent)/session; cơ chế này do package chỉ-chứa-kiểu `@deepseek-ai/dsh-brand` sở hữu, nằm ở `packages/util/brand/`, xem [README](../../../../packages/util/brand/README.md), và cung cấp cast factory chi phí bằng không cho mỗi kiểu. `dsh-brand` còn khai báo chính sách quản trị: *"Branding dùng cho id vượt ranh giới package và có thể bị nhầm lẫn; không phải mọi string đều cần brand."* Chính sách này đúng; vấn đề là nó chỉ được thực thi một nửa. Hai khoảng trống khiến các string có cấu trúc giống nhau nhưng sai về ngữ nghĩa vẫn vượt qua được type checker cho tới nay.

**Khoảng trống 1: ID vượt ranh giới chưa được brand trong bash seam.** ID của job chạy nền (background) là `string` trần trụi: `BashTask.id: string` (`packages/shell/shell/src/types.ts`), xuyên suốt executor seam dưới dạng `string` (`ShellExecutor.get`/`ownerOf`/`readOutput`/`kill(id: string)` trong `packages/shell/shell/src/index.ts`), rồi được tool hướng tới model kiểm tra và truyền đi dưới dạng `string` (`validateJobId`, `assertTaskAccess`, tham số schema `job_id` trong `packages/shell/tool-bash/src/index.ts`). Nó được sinh ra bởi bộ đếm riêng cho mỗi executor — `` `bash-${this.nextTaskId++}` `` trong `packages/shell/bash-local/src/index.ts` — có hình dạng **hoàn toàn giống** với giá trị mặc định của `SessionId`, đều là `name-N` (`` `session-${++counter}` `` trong `packages/core/session/src/index.ts`). ID job bash và ID session có thể dễ dàng bị đổi lẫn cho nhau tại các call site, mà compiler không hề phản ứng gì. Đây là ID hướng tới model (model sẽ truyền `job_id` trở lại `bash_output`/`bash_kill`), vì vậy sự nhầm lẫn này có thể bị chạm tới bởi input không đáng tin cậy.

**Owner token** của bash là một trường hợp con có liên quan: `ShellExecRequest.owner?: string` và `ShellExecSpec.owner: string | undefined` (`packages/shell/shell/src/types.ts`) được tài liệu mô tả là key cách ly *không minh bạch (opaque)* có chủ đích, nhưng ở mọi call site thực tế, giá trị này chính là `Agent.id`/`SessionId` dùng chung của agent sở hữu (`callerToken = (exec) => exec.agent?.id`, trong `packages/shell/tool-bash/src/index.ts`), chỉ khoác một tên cục bộ khác của seam. Nó được dùng trong so sánh kiểm soát truy cập (`owner !== callerToken(exec)`), vì vậy một string không khớp nhưng đúng kiểu ở đây chính là bug về cách ly cross-session, mà hệ thống kiểu hiện tại không thể bắt được. Đây chính là alias id dùng chung được [quyết định thống nhất agent/session id](../simplification/2026-06-20-unify-agent-and-session-id.md) bao phủ.

**Khoảng trống 2: ID *đã được brand* bị xói mòn tại ranh giới.** Ngay cả `CallId` và `SessionId` cũng thoái hóa thành `string` trần trụi đúng tại những nơi dễ bị nhầm lẫn nhất: kiểu key registry/store và tham số phương thức công khai. Các vị trí tiêu biểu bao gồm session storage, agent registry (cả hai đều lấy `SessionId` dùng chung làm key), map call-id ở lớp hiển thị tool, bản ghi session của ACP (Agent Client Protocol), và bộ điều phối persistence. Việc bỏ brand tại các vị trí key của collection khiến brand sẵn có trở nên vô giá trị khi tra cứu; giá trị của chúng chỉ được hiện thực hóa một phần.

## Quyết định

Thay đổi thuần về kiểu. Brand là cast chi phí bằng không; hành vi runtime, serialization, so sánh và định dạng giao thức (wire format) đều không đổi. Quyết định gồm ba phần, tất cả đều tuân theo chính sách sẵn có "không phải mọi string đều cần".

- **Brand hóa ID job bash.** Thêm `BashTaskId = Branded<'BashTaskId'>` cùng factory cùng tên trong `packages/shell/shell/src/types.ts` (package *sở hữu* ID này), import `Branded` từ `@deepseek-ai/dsh-brand`, theo cách hoàn toàn giống với `SessionId`. Nguyên thủy brand nằm trong package tiện ích không phụ thuộc `dsh-brand`, chính là để `dsh-shell` chỉ cần phụ thuộc vào nó là có thể brand hóa ID của riêng mình, mà không cần đưa `dsh-llm` (hay `dsh-session`) vào để lấy `Branded`. Áp dụng xuyên suốt `BashTask.id`, các phương thức Service Definition của `ShellExecutor` (`get`/`ownerOf`/`readOutput`/`kill`), điểm sinh giá trị trong `dsh-bash-local` (brand hóa đầu ra bộ đếm một lần tại thời điểm tạo), và bề mặt kiểm tra/truy cập của `dsh-tool-bash` (`validateJobId` trả về `BashTaskId`; `job_id` được brand tại ranh giới tool nơi string của model đến).

- **Đúc brand `OwnerToken` độc lập.** Thêm `OwnerToken = Branded<'OwnerToken'>` trong `packages/shell/shell/src/types.ts`; chú thích kiểu cho `ShellExecRequest.owner` / `ShellExecSpec.owner` / `ShellExecutor.ownerOf` là `OwnerToken | undefined`. Consumer của `dsh-tool-bash` cast `id` (`SessionId`) dùng chung của agent thành `OwnerToken` tại ranh giới — đây là nơi duy nhất hai bộ từ vựng giao nhau. Service Definition của bash không bao giờ import `dsh-session`. (Lý do xem phần tiếp theo.)

- **Ngăn brand bị xói mòn.** Lan truyền brand sẵn có vào các kiểu key `Map` và tham số phương thức công khai được liệt kê ở khoảng trống 2: `Map<SessionId, Session>`, `Map<SessionId, Agent>`, `get(id: SessionId)`, `Map<CallId, …>`, bề mặt `SessionId` của ACP, `Map<SessionId, …>` của bộ điều phối. Đây là phần có khối lượng máy móc lớn nhất trong thay đổi, cũng là chìa khóa để brand *sẵn có* thực sự phát huy tác dụng tại điểm tra cứu (chứ không chỉ được chú thích trên trường struct).

Hình dạng minh họa (mẫu factory hoàn toàn giống ba brand sẵn có):

```ts ignore-check
import type { Branded } from '@deepseek-ai/dsh-brand'

/** A background bash task handle (generated `bash-N` by the local executor). */
export type BashTaskId = Branded<'BashTaskId'>
export function BashTaskId(id: string): BashTaskId {
  return id as BashTaskId
}

/** A bash task's opaque isolation key — the consumer's owner identity, NOT the bash seam's. */
export type OwnerToken = Branded<'OwnerToken'>
export function OwnerToken(id: string): OwnerToken {
  return id as OwnerToken
}
```

## Phương án thay thế từng cân nhắc

### Tại sao không chú thích kiểu `owner` là `SessionId`?

Con đường tắt hiển nhiên là chú thích kiểu `owner` trực tiếp là `SessionId` — nó đúng là *luôn luôn* là session id. Chúng tôi bác bỏ phương án này. bash executor seam là một capability seam (Service Definition `dsh-shell`, Service Provider `dsh-bash-local`, Consumer `dsh-tool-bash`), owner token của nó được *ghi rõ trong tài liệu là cố tình không minh bạch (opaque)*: executor "không bao giờ diễn giải nó (không có access policy trong seam — đó là trách nhiệm của consumer)" (`packages/shell/shell/src/types.ts`). Chú thích kiểu trường của Service Definition là `SessionId` sẽ đưa từ vựng của `dsh-session` vào một package đáng lẽ không nên biết *ý nghĩa* của owner token — điều này sẽ khiến backend executor tổng quát bị coupling với session model, và vi phạm thiết kế token không minh bạch. Executor sandbox hóa hoặc remote thay thế `dsh-bash-local` không nên kế thừa phụ thuộc vào session. Brand `OwnerToken` độc lập giữ cho seam decoupled: `dsh-shell` chỉ biết "owner là một loại opaque token có brand nào đó", còn consumer `dsh-tool-bash` — bên đã quyết định access policy — là ranh giới duy nhất cast `SessionId` của nó thành `OwnerToken`. Brand này vẫn mang lại lợi ích an toàn (không thể truyền `BashTaskId` hay string trần vào vị trí owner), mà không tạo ra coupling.

## Ngoài phạm vi / khả năng mở rộng

Tuân theo chính sách "không phải mọi string đều cần brand", cố ý giữ phạm vi hẹp. Mỗi mục dưới đây là ứng viên brand tương lai hợp lý, kèm lý do trì hoãn chứ không phải cam kết:

- **`ModelId`** (`GenerateOptions.model`, key của registry adapter `LlmRuntime`): một key tra cứu vượt package thực sự (config → agent → llm → adapter); ứng viên brand tiếp theo hợp lý, chỉ tạm chưa đưa vào để kiểm soát phạm vi ảnh hưởng của quyết định này.
- **`ToolName`** (key của `ToolRuntime`): do tác giả định nghĩa, con người đọc được, và hiếm khi bị nhầm với ID khác; ứng viên yếu nhất, có thể không đáng để brand.
- **`ErrorCode`** (`HarnessError.code`): một từ vựng đóng (`ABORTED`, `NO_ADAPTER`……), không phải ID theo từng instance; nếu làm, string literal union sẽ phù hợp hơn brand.
- **Số thứ tự dạng số**: số turn, số step và `seq` của event là `number` chứ không phải `string`, `Branded<string>` không áp dụng được; có thể dùng biến thể song song `number & { readonly [BRAND]: B }` để brand chúng, nhưng chúng là số thứ tự vị trí, hiếm khi vượt ranh giới, lợi ích thấp.
- **Kiến tạo có kiểm tra**: brand factory là cast thuần túy, không kiểm tra runtime, và mỗi ranh giới (`sessionId` của ACP, `call.id` do provider phát hành, fallback chuỗi rỗng trong `dsh-llm-deepseek`) hiện đều tin tưởng string trần. Một tiện ích đi kèm như `SessionId.parse()` / `isValid()` để ném lỗi khi input sai định dạng tại ranh giới đúng là một khoảng trống, nhưng đó là thay đổi *hành vi runtime*, có vấn đề thiết kế riêng (thế nào tính là "sai định dạng"? thất bại thì sẽ ra sao?), nên được xử lý trong một quyết định độc lập, không nên gộp vào thay đổi thuần kiểu này.

## Xác thực

Các bất biến đã được hiện thực hóa như sau: `BashTaskId` và `OwnerToken` được định nghĩa trong `dsh-shell`, và xuyên suốt end-to-end qua Service Definition, điểm sinh giá trị trong `dsh-bash-local` và tool hướng tới model trong `dsh-tool-bash`, và `dsh-shell` không thêm phụ thuộc vào `dsh-session`; không có bất kỳ collection nào lấy branded id trong phạm vi (`CallId`/`SessionId`/`BashTaskId`) làm key mà dùng `string` trần; tham số phương thức công khai và chữ ký export giữ nguyên brand; mỗi ranh giới nơi string thô đi vào (call id do provider phát hành, session id của ACP, `job_id` do model cung cấp) đều xây dựng brand qua cast factory, không phải các `as` cast rải rác.

## Hệ quả

- **Thay đổi mang tính máy móc trên hai bề mặt interface.** Việc lan truyền brand liên quan đến bash seam (Service Definition + Service Provider + Consumer) cũng như interface session id của ACP và bộ điều phối persistence. Phạm vi thay đổi rộng nhưng mức độ nghiêm trọng thấp: vị trí bị bỏ sót sẽ là lỗi compile chứ không phải bug âm thầm. Xét từ hành vi có thể quan sát, đây là thay đổi thuần kiểu — không có khác biệt về snapshot hay hành vi e2e. Nó nằm cạnh [quyết định thống nhất id agent/session](../simplification/2026-06-20-unify-agent-and-session-id.md), vì cả hai đều chạm tới ranh giới session id / owner-token; `OwnerToken` vẫn giữ độc lập với id đã thống nhất vì lý do decoupling nêu trên.
- **Brand không kiểm tra hợp lệ.** Brand là bảo vệ chống nhầm lẫn, không phải chứng minh tính đúng đắn: một session id *sai* miễn là vẫn có định dạng string đúng thì vẫn vượt qua type checker như trước. Quyết định này không đóng khoảng trống đó (xem "Ngoài phạm vi") — nó chỉ ngăn chặn loại lỗi *danh mục* này: truyền vào *loại* id sai.
- **"Nên dừng ở đâu" vẫn là vấn đề thuộc về đánh giá.** Brand hóa `BashTaskId` nhưng không brand `ToolName`, brand `OwnerToken` nhưng không brand `ModelId`, là đánh giá theo gu về những string nào "có thể bị nhầm lẫn". Người review hợp lý có thể muốn nhiều hơn hoặc ít hơn; chính sách trong `brand.ts` là căn cứ phán quyết, quyết định này nghiêng về id hướng tới model hoặc dùng cho kiểm soát truy cập.
