# Agent Note: Luồng sản phẩm hoàn chỉnh của Workspace UI

Status: implemented

[English](2026-07-25-workspace-ui-product-flow.md) | 中文

## Problem

[Domain KV storage và Workspace entity](../../proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) đã định nghĩa entity bền vững, quy chuẩn đường dẫn và sổ cái Session có thứ tự của Workspace, nhưng chưa định nghĩa việc nối dây Host, khởi tạo dữ liệu lịch sử hay luồng GUI. GUI hiển thị đồng thời cả Workspace và Session; sau khi người dùng vào New Session phải nhập được ngay, kể cả khi chưa có Host Session, thậm chí chưa có Host Workspace.

Workspace chờ tạo, Session chờ tạo, việc giữ lại nội dung nhập và việc công bố entity Host phải có chủ sở hữu rõ ràng, và phải giữ cùng một identity trang khi RPC completion và Host frame đến theo bất kỳ thứ tự nào. Nếu trạng thái zero tạo Host Session sớm, trạng thái trang không có nội dung nhập sẽ đi vào vòng đời Host. Session lịch sử lại chỉ có `SessionHeader.cwd` nhẹ để phân nhóm, việc khởi tạo không thể đọc phần thân sự kiện.

## Decision

### Host và dữ liệu bền vững

Host cung cấp các nối dây GUI sau trên Workspace entity:

| RPC | Hành vi |
| --- | --- |
| `workspace.list` | Trả về Workspace đã có thứ tự bền vững, và lọc bỏ Session id không qua được kiểm tra header |
| `workspace.create({ path })` | Thu nạp thư mục đã tồn tại theo canonical path; tên hiển thị suy ra từ basename có thể trùng |
| `workspace.insertBefore({ workspaceId, beforeWorkspaceId? })` | Di chuyển một Workspace trong thứ tự registry bền vững, và trả về toàn bộ thứ tự đã commit |
| `workspace.delete({ workspaceId })` | Xóa bản ghi registry của Workspace, đồng thời giữ lại thư mục và log session; Session liên quan chuyển sang Ungrouped |
| `session.create({ workspaceId, sessionId? })` | Giải quyết cwd từ Workspace, tạo Session idempotent với id được cấp trước tùy chọn rồi attach |
| `session.create({ cwd })` | Dành cho bên gọi không phải Workspace, tạo Session Ungrouped |

Host stream đẩy các gia số Workspace và Session, bao gồm `host/workspace-removed`; Client sau khi kết nối lại sẽ lần lượt làm mới baseline của `workspace.list` và `session.list`. Quyền sở hữu và ranh giới an toàn của việc xóa bản ghi registry được định nghĩa trong [Agent Note xóa bản ghi registry Workspace](2026-07-27-workspace-registration-deletion.md).

`sessionIds` của Workspace là chỉ mục thành viên có thứ tự. Projection thành viên đồng thời yêu cầu id nằm trong chỉ mục và `SessionHeader.cwd` tương ứng sau khi canonical hóa bằng đúng Workspace path; SessionHeader không thêm `workspaceId`. Session có cwd khớp nhưng chưa vào chỉ mục vẫn giữ Ungrouped, id trúng chỉ mục nhưng header thiếu, cwd không hợp lệ hoặc cwd không khớp sẽ bị lọc bỏ. Cùng một Session bị hai Workspace chiếm chỉ mục là trạng thái hỏng và báo lỗi rõ ràng.

Workspace domain dùng durable marker để phân biệt "chưa từng khởi tạo" và "đã khởi tạo nhưng rỗng". Khi marker chưa được đặt, registry chỉ gọi `SessionPersistence.list()` để đọc metadata header, không gọi `load` hay `inspect`, cũng không đọc dữ liệu lịch sử hay giải mã phần thân sự kiện; cwd hợp lệ được nhóm theo canonical path, Session và nhóm Workspace trong nhóm đều khởi tạo giảm dần theo `createdAt` của header. Bootstrap có thể tái nhập (reentrant), chỉ ghi marker ở cuối cùng; sau khi marker được ghi, Session mới không đi qua `workspaceId` sẽ không còn được tự động thu nạp.

### Mô hình đối tượng Client

`Session` và `Workspace` là đối tượng frontend từ giai đoạn Intent của trang.

- Session frontend cấp trước SessionId khi tạo, và giữ Intent target cùng `pendingPrompt` bên trong đối tượng; sau khi `session.create` của Host thành công vẫn là cùng một đối tượng Session.
- Workspace frontend chưa có WorkspaceId trước khi materialize, và giữ create input, phase và error bên trong đối tượng; sau khi `workspace.create` của Host thành công, cùng một đối tượng Workspace adopt view trả về.
- `SessionManager` và `WorkspaceManager` chịu trách nhiệm về chỉ mục đối tượng, baseline Host và gộp gia số; đối tượng là nguồn trạng thái duy nhất của Intent và Host view.
- `SessionRuntime` cung cấp đối tượng Session, selection thực, scope và list projection; `WorkspaceRuntime` phụ thuộc vào `SessionRuntime`, chịu trách nhiệm về Workspace mặc định, luồng New Session xuyên đối tượng và materialize Workspace.

Trang có tối đa một Session Intent frontend và một Workspace Intent chỉ đi kèm trong trạng thái zero Workspace. Intent chỉ tồn tại ở trang hiện tại, biến mất sau khi refresh; selection Session thực có thể khôi phục bền vững. Chọn Session thực hoặc khởi động Intent Session khác sẽ hủy tư cách tự động gửi của Intent cũ, nhưng Session đã được Host công bố và tin nhắn đã được chấp nhận sẽ không rollback.

Session tự giữ nội dung nhập đầu tiên và điều khiển một pipeline nội bộ: khi cần thì attach vào Workspace bằng id đã cấp trước, rồi gửi `pendingPrompt`. Cả thất bại của attach lẫn send đều rơi về cùng một Session. Phase/error tạo Workspace chỉ thuộc về đối tượng Workspace, Session không mô phỏng vòng đời Workspace.

### Luồng người dùng

Ứng dụng khi vào lần đầu sẽ chờ hai baseline Workspace và Session ready. Selection Session thực còn hợp lệ sẽ được khôi phục; nếu không sẽ vào New Session, và cố định chọn một Workspace gần nhất. Workspace gần nhất lấy `updatedAt` lớn nhất trong các Session thành viên, Workspace rỗng thì fallback về `createdAt`; suy diễn này chỉ quyết định target mặc định, không thay đổi thứ tự Workspace của Host, cũng không chọn lại lần hai khi hydration về sau.

Khi hoàn toàn không có Workspace, trang sẽ tạo một đối tượng Workspace frontend tên mặc định `workspace` và một Session frontend trỏ đến nó. Cả hai không ghi vào Host, composer luôn nhập được; chỉ khi gửi lần đầu mới lần lượt materialize Workspace, attach Session, gửi tin nhắn.

New Session ở top, dấu cộng inline của hàng Workspace và Workspace picker cuối cùng đều gọi cùng một action New Session: Workspace id tường minh trực tiếp thành target, nếu không chỉ định thì trước tiên dùng Workspace của Session hiện tại, sau đó dùng Workspace gần nhất; không có Workspace thực sẽ vào trang New Session trắng. Action Add workspace duy nhất của Workspace picker (xem [Note đường dẫn duy nhất](../simplification/2026-07-31-one-route-to-add-a-workspace.md); tại thời điểm quyết định này là hai action Use an existing folder và tạo theo tên) sẽ tạo ngay Workspace thực khi người dùng xác nhận thư mục, sau đó đổi target của Session frontend sang Workspace đó; kể cả người dùng không gửi tin nhắn, Workspace rỗng được tạo tường minh vẫn được giữ lại.

Tên hiển thị của Workspace mới lấy từ thư mục chứa nó. Các canonical path khác nhau có thể có cùng tên hiển thị suy từ basename (xem [quyết định định danh](../bug-fix/2026-07-31-same-basename-workspace-adoption.md)); thao tác đổi tên tường minh vẫn giữ kiểm tra trùng tên hiển thị. Di chuyển Session xuyên Workspace, thu nạp thủ công từ Ungrouped, và nhập riêng biệt tên hiển thị với tên thư mục vẫn không nằm trong phạm vi luồng này.

### Gửi lần đầu và khôi phục

`pendingPrompt` của Session frontend luôn giữ nguyên văn trước khi Host chấp nhận tin nhắn. Gửi lần đầu tiến hành theo thứ tự materialize Workspace, attach Session, gửi prompt:

1. Khi tạo Workspace thất bại, Workspace Intent giữ lại nội dung nhập và lỗi, Session vẫn trỏ tới đối tượng đó.
2. Khi Session tạo thất bại trước khi công bố, Session Intent quay về trạng thái có thể chỉnh sửa, thử lại bằng cùng một SessionId đã cấp trước.
3. `workspace-attach-failed` chứng minh Session đã được công bố; cùng đối tượng Session vào danh sách thực và giữ lại prompt, sau đó thử lại attach.
4. Khi gửi prompt thất bại, Session giữ lại prompt và chỉ thử lại gửi, không tạo lại Workspace hay Session.
5. Nếu trang chuyển sang Intent khác trong lúc tạo Session, Session cũ dù sau đó được công bố cũng không tự động gửi; nó giữ nguyên prompt gốc và lỗi hiển thị.

Response RPC bị mất, Host frame đến trước completion, và completion đến trước Host frame đều hội tụ thông qua SessionId cấp trước và identity đối tượng. Manager thực hiện upsert có thứ tự trên Host view, khi materialize cục bộ ưu tiên giữ nguyên identity đối tượng gốc, không sinh ra hàng tạm thứ hai cùng id.

### Sidebar và sắp xếp

Nhóm Workspace dùng thứ tự bền vững do Host trả về. Bootstrap xác định thứ tự lịch sử một lần, Workspace mới tạo tường minh đặt lên đầu, `workspace.insertBefore` áp dụng bền vững thứ tự kéo-thả của người dùng; Session hoạt động không làm di chuyển nhóm Workspace.

Sổ cái Host giữ thứ tự thủ công `Workspace.sessionIds`: Session mới attach đặt lên đầu, hoạt động không thay đổi thứ tự đó. Trình duyệt nhóm có thể chuyển sang chế độ xem theo cập nhật gần nhất chỉ lưu cục bộ trên trình duyệt; khi `updatedAt` của Session tăng thì chế độ xem này sẽ đưa nó lên đầu, đồng thời vẫn cho phép điều chỉnh thủ công. Mỗi Workspace đang mở mặc định hiển thị năm Session, người dùng có thể tạm thời mở rộng các mục còn lại. Việc sắp xếp lại Workspace bền vững và thứ tự Session cục bộ trên trình duyệt xem [Thứ tự và thu gọn sidebar Workspace](2026-08-11-workspace-sidebar-order-and-folding.md).

Session trắng hiện tại hiển thị thành một hàng "New session", nhưng không hiển thị số lượng, nhãn thời gian hay menu hàng; các Session trắng khác giữ ẩn, và có thể được Workspace tương ứng tái sử dụng. Tìm kiếm sẽ loại trừ hàng trắng.

Session thực không thể quy về bất kỳ Workspace nào sẽ vào Ungrouped. `session-added` và `workspace-changed` của Host có thể đến theo bất kỳ thứ tự nào, việc gộp danh sách không phụ thuộc thứ tự frame.

Xóa bản ghi registry Workspace sẽ xóa nhóm của nó, nhưng không xóa hoặc đóng bất kỳ Session nào. Session đã ghi sổ (bao gồm Session hiện tại) sẽ ngay lập tức vào Ungrouped; sau khi refresh, baseline Workspace và Session độc lập sẽ tái dựng ra cùng kết quả.

### Ranh giới React và slot

Component React chỉ tiêu thụ `useSessions`, `useWorkspaces` và các hook theo phạm vi session, không sở hữu vòng đời entity. Zustand store chỉ giữ layout, view hiện tại, text composer của Session thực thông thường và trạng thái hiển thị thuần túy khác; Intent Session/Workspace, phase materialize, lỗi và prompt được giữ lại nằm ở tầng đối tượng runtime không dùng React.

Sidebar và conversation empty hero nhận được action chuẩn hóa qua slot: `startSession`, `updateSessionPrompt`, `sendSession`, `open` và `toggleSidebar`. Workspace picker tái sử dụng cùng component và action `createWorkspace`; owner chỉ cung cấp bật/tắt popover, điểm neo và callback khi chọn. Tầng hiển thị không trực tiếp gửi `host/workspace-changed`, sự kiện Host chỉ do mutation của Host và adapter stream tạo ra.

## Alternatives considered

**Lưu bản ghi trang độc lập cho Workspace và Session chờ tạo.** Phương án này cần thay thế identity và chuyển giao nội dung nhập, lỗi, focus và hàng sidebar sau khi materialize; trạng thái Intent của bản thân đối tượng có thể giữ nguyên tính liên tục của identity.

**Điều phối vòng đời đối tượng bởi tầng hiển thị hoặc root Zustand store.** Phương án này sẽ lặp lại trách nhiệm của Manager và service, và đưa trạng thái miền trở lại React. Action chuẩn hóa do runtime service cung cấp, slot chỉ tiêm interface hẹp cần cho hiển thị.

**Trạng thái zero tạo ngay Host Session hoặc Host persist Intent.** Trang chưa nhập nội dung sẽ vào vòng đời Host, và thay đổi ngữ nghĩa refresh; Session frontend chỉ giữ Intent page-local trước lần gửi đầu tiên.

**Trì hoãn Create Workspace tường minh đến lần gửi đầu tiên.** Sau khi người dùng xác nhận, sidebar vẫn chưa thấy Workspace rỗng thực, ngữ nghĩa "tạo Workspace" và "chuẩn bị Session" bị trộn lẫn; chỉ có Intent zero Workspace do hệ thống tự động tạo mới trì hoãn materialize.

**Liên tục suy diễn Workspace động theo cwd.** Phương án này không thể biểu diễn Workspace rỗng, tên hiển thị ổn định và thứ tự tường minh, cũng sẽ tự động thu nạp bên gọi không phải Workspace; cwd chỉ dùng cho một lần bootstrap lịch sử và kiểm tra hai chiều thành viên.

**Client sắp xếp lại theo lô theo thời gian sau khi Session list đến.** Màn hình đầu sẽ hiển thị thứ tự Host trước rồi nhảy toàn bộ, kết nối lại cũng có thể thay đổi vị trí; thứ tự thuộc sở hữu của sổ cái bền vững Host, Client chỉ gộp cập nhật từng mục.

**Thêm workspaceId vào SessionHeader.** Nó sẽ tạo ra hai trường quy thuộc bền vững cùng với chỉ mục Workspace và yêu cầu ghi kép; header giữ sự thật cwd của bản thân Session, chỉ mục Workspace chịu trách nhiệm quy thuộc tường minh.

## Verification

- Trạng thái zero hoàn toàn không có Workspace không ghi vào Host và cho phép nhập; Create Workspace tường minh tạo ngay và hiển thị Workspace rỗng.
- Session và Workspace frontend giữ nguyên identity đối tượng trước và sau materialize, nội dung nhập, lỗi, focus và projection sidebar luôn đến từ tầng đối tượng.
- Lần gửi đầu tiên tiến hành theo thứ tự Workspace, Session, prompt, mỗi giai đoạn thành công không rollback, nội dung nhập không mất trước khi prompt được chấp nhận, thử lại tạo dùng cùng SessionId.
- Workspace list chỉ đọc header hoàn thành một lần bootstrap có thể tái nhập; registry rỗng đã khởi tạo khi khởi động lại không khởi tạo lại lần hai, đọc thành viên đồng thời kiểm tra cả chỉ mục và cwd canonical.
- Target mặc định ban đầu chỉ xác định một lần sau khi cả hai baseline ready; nhóm Workspace không sắp xếp lại do hydration hoặc Session hoạt động, thứ tự kéo-thả Workspace tường minh vẫn giữ nguyên sau khi kết nối lại.
- Session trắng hiện tại có thể hiển thị thành hàng New Session duy nhất, đồng thời không lộ các session trắng có thể tái sử dụng khác, cũng không hiển thị số lượng Session.
- UI và Host sẽ chấp nhận các thư mục có canonical path khác nhau nhưng basename giống nhau thành Workspace độc lập, còn thao tác đổi tên tường minh sẽ từ chối tên hiển thị trùng lặp; Session chỉ có cwd, cwd lịch sử không hợp lệ và Session chưa attach giữ Ungrouped.
- Xóa Workspace đã xác nhận chỉ xóa bản ghi registry, giữ lại Session hiện tại, thư mục, file và log session, và giữ trạng thái đó sau khi refresh; test cấp package chốt các trường hợp race giữa response một chiều／frame／baseline và hành vi rollback khi thất bại.
- Snapshot keyless runnable bao phủ trạng thái zero, tạo tường minh và gửi lần đầu; test cấp package bao phủ bootstrap, kiểm tra thành viên, sắp xếp, idempotent, khôi phục khi thất bại và thứ tự frame bất kỳ.

## Consequences

- SessionHeader không ghi thời điểm hoạt động cuối cùng, bootstrap lịch sử chỉ có thể khởi tạo thứ tự thủ công của Host theo `createdAt`; chế độ xem theo cập nhật gần nhất tùy chọn của trình duyệt sẽ bắt đầu xây dựng từ bản tóm tắt Session sau hydration.
- Session thiếu cwd lịch sử, thư mục không hợp lệ hoặc realpath thất bại sẽ ở lại Ungrouped; giai đoạn này chưa có lối vào thu nạp thủ công.
- Refresh trang sẽ loại bỏ Intent Workspace/Session chưa materialize và nội dung nhập chưa được Host chấp nhận, đây là giao ước page-local.
- Create Workspace tường minh ghi đĩa ngay lập tức, người dùng rời đi mà không gửi cũng để lại Workspace rỗng.
- Host Session trước sự kiện đầu tiên vẫn tuân theo ngữ nghĩa persist lười biếng hiện có; Intent frontend không thay đổi hành vi Session rỗng sau khi Host khởi động lại.
