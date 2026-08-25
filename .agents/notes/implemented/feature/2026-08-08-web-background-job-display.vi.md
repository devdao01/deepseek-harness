# Agent Note: Hiển thị tác vụ nền trên Web

Status: implemented

[English](2026-08-08-web-background-job-display.md) | Tiếng Việt

## Vấn đề

`ctx.jobs` vốn đã gánh toàn bộ công việc chạy dài mà harness khởi động ở nền — `bash`, `pwsh`, `pty-send`, và các subagent nền một lần — nhưng người đọc duy nhất của nó là model. [`dsh-tool-jobs`](../../../../packages/jobs/tool-jobs/README.md) phơi ra `job_list`, `job_output` và `job_kill`; ngoài ra không có gì khác quan sát registry này.

Vì thế con người ở phía Web không thấy được build đang chạy, không phân biệt được một tác vụ đã hoàn tất hay đã treo, và cũng không dừng được nó. Dấu vết duy nhất là tấm thẻ công cụ `run_in_background` in ra job id ở đâu đó sớm hơn trong transcript, và tấm thẻ đó về sau không bao giờ cập nhật nữa.

Header của phiên vốn đã là chỗ đặt hoạt động nền theo từng phiên: [`dsh-client-ui-subagent`](../../../../packages/client/ui-subagent/README.md) đóng góp danh mục subagent vào `conversation.session.header.actions`. Vị trí không có gì phải tranh cãi. Cái còn thiếu là bất kỳ kênh nào đưa trạng thái tác vụ tới trình duyệt.

## Quyết định

Trạng thái tác vụ đến trình duyệt dưới dạng **một khung ảnh chụp toàn phần cho mỗi phiên**, được đẩy ra tại mọi điểm commit trong registry làm thay đổi nội dung mà phiên đó nhìn thấy. Client giữ một bản gương last-wins, được render bởi một mục trên header. Không RPC, không polling, client không cần bất kỳ quản lý trạng thái hết hạn nào.

Lần này chỉ giao phần danh sách. Luồng output theo từng tác vụ và việc con người ngắt tác vụ là những giai đoạn độc lập, và hình dạng của kênh khiến cả hai đều không cần lật đổ nó.

### Hình dạng đường truyền

Một khung trong luồng mux:

```ts ignore-check
| { type: 'session/jobs'; sessionId: SessionId; jobs: JobView[] }
```

`JobView` là kiểu an toàn cho trình duyệt, do lớp vận chuyển sở hữu tại [`packages/host/apiproxy/src/api/jobs.ts`](../../../../packages/host/apiproxy/src/api/jobs.ts), đặt ngang hàng với các hợp đồng lĩnh vực khác, còn schema đường truyền nằm ngay bên cạnh trong `jobs.schema.ts`:

```ts
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'

export interface JobView {
  id: JobId
  kind: string
  label: string
  status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
  detail?: string
  startedAt: number
  finishedAt?: number
}
```

`JobId` lấy từ nhánh lá [`@deepseek-ai/dsh-jobs/brand`](../../../../packages/jobs/jobs/src/brand.ts) không phụ thuộc cordis — cùng một cách sắp xếp với import `@deepseek-ai/dsh-llm/brand` mà `api/subagents.ts` đang dùng, bởi lối ra gốc của `dsh-jobs` sẽ kéo theo `dsh-agent`, và dù chỉ dùng ở mức kiểu thì chương trình client cũng không chạm tới được. Giống mọi đường dẫn con không phải gốc khác trong repo này, nó có mục `paths` tường minh trong `tsconfig.base.json`; thiếu mục đó, bộ phân tích Typert sẽ phân giải specifier này về `lib/types/` và kết luận rằng tham chiếu đó không được export.

`kind` trên đường truyền là `string` chứ không phải `JobKind`. Ánh xạ kind được các plugin sản xuất mở rộng bằng declaration merging, nên bản build client không thể liệt kê tập đóng này; gặp kind không nhận ra, lớp trình bày đi theo một nhánh mặc định có tài liệu.

Ba trường của `JobSnapshot` bị bỏ đi có chủ ý: `ownerSession` (đã có trong `sessionId` của khung), `reported` (bit chuyển giao thông báo nội bộ, vô nghĩa với người dùng), và `outputLimitBytes` (chính sách trình bày cho model, do bên sản xuất sở hữu).

Khung này mang ảnh chụp toàn phần thay vì bản gia tăng, vì đúng lý do mà [`session/queue`](../../../../packages/host/apiproxy/src/api/events.ts) đã tự viết ra cho mình: khởi động, ngắt, kết toán, kết nối lại, và cả tab trình duyệt thứ hai, tất cả đều hội tụ qua cùng một giá trị có thẩm quyền. Tập tác vụ của một phiên chỉ ở mức một chữ số, nên khung rất nhỏ.

### Đăng ký thay đổi của registry tác vụ

`JobRegistry` sở hữu một phương thức quan sát:

```ts ignore-check
abstract onJobsChanged(listener: JobsChangedListener): () => void
```

Nó kích hoạt **sau** mọi điểm commit làm thay đổi nội dung mà `list(owner)` trả về: đăng ký ở cuối `start()`, chuyển sang `stopping` trong `kill()`, kết toán, và việc gỡ bỏ do `disposeOwner()` thực hiện. `owner` bằng `undefined` nghĩa là một tác vụ vô chủ đã thay đổi, do đó khung nhìn của mọi bên gọi đều đổi theo.

Listener phân mảnh theo owner chứ không theo từng tác vụ. Bên tiêu thụ duy nhất đẩy đi ảnh chụp toàn phần, bản ghi theo từng tác vụ nhận xong là bỏ — và hơn nữa, việc đăng ký theo từng tác vụ căn bản không diễn đạt được việc gỡ bỏ khi owner bị hủy, trừ phi bịa ra một trạng thái bia mộ chẳng nơi nào khác cần đến.

`onJobDone` không phải tập con của nó. Cái sau chuyển giao bản ghi trạng thái cuối và `Agent` owner chính xác theo ngữ nghĩa first-wins, và `dsh-tool-jobs` buộc bộ ngữ nghĩa này với `reported`; `onJobsChanged` là quan sát thuần túy, không hàm ý chuyển giao gì, cũng không đánh dấu bất cứ thứ gì là đã báo cáo. Lỗi do listener ném ra được bọc lại và không bao giờ được await, nhất quán với `onJobDone`; mỗi lần đăng ký là một effect trên fiber của bên gọi.

Việc hủy service cố ý không thông báo gì cả. Mỗi lần đăng ký `onJobsChanged` là một effect trên chính fiber của registry, nên đến lúc teardown dọn sạch store thì listener đã biến mất từ lâu; bên quan sát biết registry đã rời đi qua việc chính nó bị hủy, chứ không phải qua một tập rỗng cuối cùng.

### Lớp vận chuyển api-proxy

`mux()` đăng ký `ctx.jobs.onJobsChanged` và đẩy `session/jobs`; baseline đăng ký được phát ra ngay cạnh khung điều khiển `session/subscribed` sẵn có, để client kết nối lại đã ở trạng thái mới nhất trước khi render.

Lớp vận chuyển giữ bốn quy tắc:

- **Tuyệt đối không resume.** Đẩy thay đổi gọi `jobs.list(owner)` với đúng `Agent` mà listener đưa ra, nên ngay cả khi scope của owner đó đang bị tháo dỡ và tra cứu theo id đã không còn thấy, nó vẫn đúng. Còn baseline thì đọc `ctx.jobs.list(ctx.agents.get(session.id))` — cách đọc registry không kích hoạt resume, nên phiên không có Agent sống sẽ chỉ nhận đúng các tác vụ vô chủ. Cả hai đường đều không chạm tới [bộ phân giải Agent của `api-remotes`](../../../../packages/api/remotes/src/agent-lookup.ts), bởi bộ phân giải đó biến một truy vấn thành tác dụng phụ hồi sinh phiên nguội; liệt kê tác vụ không nên làm sống lại một phiên mà người dùng chỉ vô tình lướt qua.
- **Thay đổi vô chủ phải fan-out.** Khi `owner` là `undefined`, đẩy một ảnh chụp mới tới mọi phiên đã đăng ký, vì tác vụ vô chủ thì mọi bên gọi đều thấy.
- **Giữ tính tùy chọn.** Lớp vận chuyển đọc `ctx.get('jobs')`. Bộ hợp thành không gắn registry thì không phát khung nào, và client cũng không render mục đó — `sessionProjections` trong chính tệp này đã ở tư thế như vậy.
- **Không có thì không nói.** Baseline chỉ đẩy cho những phiên có danh sách khác rỗng; ở phía client, thiếu khóa nghĩa là danh sách rỗng. Lần thay đổi làm danh sách trở nên rỗng vẫn đẩy `[]`, vì đây là chuyển đổi duy nhất mà client không thể suy ra từ trạng thái "thiếu".

### Bản gương phía client

`SessionListState` mang `jobsBySession: Readonly<Record<SessionId, readonly JobView[]>>`, do `SessionManager` sở hữu, được gấp lại từ các khung theo last-wins; tập đã bị làm rỗng được lưu thành khóa vắng mặt, khiến "thiếu" và `[]` là cùng một cách biểu diễn.

Nó đặt ở trạng thái danh sách chứ không phải trên `Session` vì ba lý do: mục header vốn đã đọc trạng thái danh sách qua `useSessions`; không có gì cần kiểu đệm trước khi khởi tạo như `session/queue` (không có hành vi composer nào phụ thuộc vào tác vụ); và sau này khi thêm chỉ báo vào thanh bên cũng không phải mở thêm kênh thứ hai.

Hai chỗ dọn dẹp giữ cho nó trung thực. Khi đăng ký lại, manager vứt bỏ bản gương của phiên đó — quy tắc mà `session/queue` đã tuân theo, vì baseline mới đang trên đường tới, mà thế hệ này không phát baseline cho tập rỗng, nên danh sách còn sót lại sẽ thành bóng ma. Vứt lần nữa khi `host/session-removed`: việc hủy owner đã gỡ bản ghi ở phía registry, nhưng sự kiện đó rơi trên luồng mux còn khung này đi theo luồng host, và hai bên không có thứ tự tương đối với nhau.

### Mục trên header

[`@deepseek-ai/dsh-client-ui-jobs`](../../../../packages/client/ui-jobs/README.md) đăng ký một mục trong `conversation.session.header.actions`, xếp sau danh mục subagent. Hợp đồng trình bày thuộc về README của chính nó; quyết định đáng ghi lại ở đây là: khi phiên không có tác vụ thì control hoàn toàn không render; huy hiệu hoạt động bị bỏ đi khi bằng không, để phiên chỉ còn lịch sử vẫn giữ một lối vào yên lặng; các dòng ở trạng thái cuối vẫn hiển thị, vì `detail` của tác vụ thất bại là chỗ duy nhất đọc được lý do thất bại.

Do đó một subagent nền một lần đang chạy sẽ xuất hiện đồng thời ở đó và trong danh mục subagent. Hai nơi trả lời hai câu hỏi khác nhau — danh mục lo việc đi vào transcript của phiên con, còn danh sách này là tay nắm duy nhất mà khả năng ngắt có thể gắn vào — nên chặn `kind: 'subagent'` ở đây sẽ khiến giai đoạn làm chức năng ngắt vừa khéo không có lối vào cho đúng nhóm tác vụ này.

### Những điều cố ý không làm

**Không đường dẫn Web nào gọi `ctx.jobs.read()`.** Nó tiêu thụ con trỏ output duy nhất, nên trình duyệt đọc một lần là lặng lẽ lấy mất những byte mà `job_output` của model sẽ không bao giờ thấy. Đây phải là một bất biến có test bảo vệ chứ không phải một quy ước, vì sự cố của nó hoàn toàn vô hình tại điểm gọi.

**Không làm chức năng ngắt.** Giai đoạn đó còn nợ một seam cùng một quyết định hiện chưa có lời giải: `kill()` đánh dấu việc chuyển giao trạng thái cuối là đã báo cáo, nên nếu viết chức năng con-người-ngắt theo đúng hợp đồng hôm nay, model sẽ cứ tưởng tác vụ của nó vẫn đang chạy.

**Không mang mực nước output trên khung.** Kênh gia tăng của giai đoạn output mới là chỗ trường neo nên xuất hiện; thêm bây giờ chỉ là một trường không có người đọc.

## Phương án thay thế

**Khung tín hiệu cộng với kéo bằng RPC, tức hình dạng của danh mục subagent.** Đẩy một tín hiệu `jobs-changed` không payload, chống dội rồi đọc lại trạng thái có thẩm quyền bằng một RPC đơn nguyên. Danh mục subagent làm đúng như vậy, và cái giá phải trả bày ra rõ mồn một trong [`SessionManager`](../../../../packages/client/runtime/src/client/sessions/manager.ts): `catalogInflight` để chống bay kép, `catalogStale` để kéo bù một lần khi khung thành viên rơi vào giữa chừng một request, `updateCatalogActivity` vừa vá tại chỗ vừa ghi một bản vào request đang bay để phản hồi cũ hơn khung bị ghi đè, `parentAvailableOverride` phát lại một `false` đã hết hạn, rồi khi kết nối lại còn phải kéo lại từng danh mục đang mở. Bộ máy này tồn tại vì thẩm quyền của danh mục bị chẻ đôi — huyết thống bền vững đến từ projection, còn mức độ hoạt động là mẫu lấy tại thời điểm phản hồi — mà tác vụ thì không có nửa bền vững kia, nên không nên thừa kế mức phức tạp này. Nó còn hỏng đúng vào thời khắc mà giai đoạn output quan tâm nhất: tác vụ kết toán, luồng output đóng ngay lập tức, nhưng trạng thái phải đợi chống dội cộng một vòng khứ hồi mới tới, và trong cửa sổ đó UI hiển thị một tác vụ đang chạy với luồng đã chết.

**Chỉ polling khi popover mở, không đụng seam.** Nhẹ công nhất, và là lựa chọn duy nhất không chạm vào `JobRegistry`. Nó không hỗ trợ nổi một bộ đếm thường trực trên trigger nếu không polling thường trực, mà hai giai đoạn sau đằng nào cũng cần một kênh đăng ký thay đổi thực thụ, nên nó tiết kiệm được một tuần rồi trả lại đúng chừng ấy.

**Đơn vị session-projection dựa trên sự kiện tác vụ bền vững.** Đơn vị projection gấp trên các sự kiện phiên đã commit, nên hướng này trước hết phải làm vòng đời tác vụ trở nên bền vững — `job/started` … `job/settled` như một cặp ngoặc mở-đóng độc lập, với [`session/end-seed`](../../../../packages/core/session/src/types.ts) cuối cùng đánh dấu các ngoặc mở chưa ghép đôi là lịch sử chết, hoàn toàn giống cách đã làm với ngoặc compaction. Ở phía client nó quả thật tiết kiệm hơn: `dsh-tool-todo` trình diễn trọn bộ mẫu này bằng một đơn vị mười lăm dòng, còn khung `session/projection` sẵn có, khối history-tail và cache checkpoint bền vững đều đủ sức gánh dữ liệu này mà không cần mặt đường truyền mới, không cần đăng ký ở lớp vận chuyển, không cần trạng thái ở manager. Bác bỏ nó, vì làm vậy là đem một lần thay đổi định dạng bền vững ra đổi lấy một danh sách trên trình duyệt, và nó cũng không mở rộng được sang đúng giai đoạn cần nó nhất: [`spill/`](../../../../packages/spill/README.md) tồn tại chính là để output công cụ cực lớn nằm ngoài log, nên output tác vụ dạng luồng dù thế nào cũng không thể cưỡi trên sự kiện bền vững. Nếu lịch sử tác vụ bền vững sau này tự nó đứng vững được về mặt giá trị, thiết kế hiện tại không ngăn việc xem xét lại.

**Tái dùng `PublicJobSnapshot` của `dsh-tool-jobs`.** Các trường gần như đã đúng, nhưng nó thuộc mặt phẳng điều khiển hướng tới model. Chương trình trình duyệt import kiểu đường truyền từ một gói tool sẽ ghép nối phần trình bày ở client với các quyết định hướng tới prompt, và kéo một gói host-only vào bản build của client.

**Gộp vào danh mục subagent thành một bảng "hoạt động" hợp nhất.** Một lối vào thay vì hai. Lý do bác bỏ là `SubagentCatalogAction` đã dài 605 dòng, và chủ đề của nó là cây huyết thống phiên bền vững bao gồm cả phiên con đã kết thúc; tác vụ ở lĩnh vực tiến trình là một mô hình dữ liệu thứ hai, với danh tính, vòng đời và tập hành động khả dụng đều khác, mà nhánh mở rộng lười, hợp đồng thời lượng và token của danh mục sẽ phải viết lại toàn bộ mới chứa nổi chúng.

**Danh sách tác vụ toàn cục của host xuyên mọi phiên.** Là cách đọc theo nghĩa đen của "hiển thị mọi tác vụ đang chạy". Bác bỏ vì hàng rào phân quyền của registry là theo phiên owner, nên đọc toàn cục cần một quy tắc truy cập mới, và danh sách toàn cục cũng không nên xuất hiện trong header của một phiên nào đó — nó cần chỗ riêng trong thanh bên. Thiết kế hiện tại không ngăn việc bổ sung sau này; khung theo từng phiên chính là cùng một tập dữ liệu.

## Kiểm thử

[Kịch bản web e2e](../../../../apps/web/tests/background-job-list.e2e.ts) là bằng chứng đầu-cuối, và không cần khóa: một lệnh gọi bash `run_in_background` thật đăng ký vào `ctx.jobs`, bộ đếm và các dòng trên header xuất hiện mà không cần bất kỳ thao tác nào của người dùng, và sau khi giết tác vụ đó qua registry, danh sách đang mở lật sang phần detail do bên sản xuất đưa ra. Nó khẳng định toàn bộ chuỗi chuyển giao, chứ không phải một tầng nào trong đó.

Bên dưới nó, [`jobs-local`](../../../../packages/jobs/jobs-local/tests/jobs.spec.ts) ghim cả bốn điểm commit của đăng ký thay đổi, khả năng dung thứ bên quan sát ném lỗi, và việc hủy đăng ký trên cả hai đường hủy tường minh lẫn tháo dỡ fiber; [`api-proxy-jobs`](../../../../packages/host/apiproxy/tests/api-proxy-jobs.spec.ts) ghim quy tắc "chỉ phát baseline khi khác rỗng", ba lần đẩy thay đổi, các trường nội bộ bị loại bỏ, fan-out vô chủ, đảm bảo không resume, và bộ hợp thành không có registry; các bộ test phía client ghim phép gấp last-wins, cách biểu diễn khóa vắng mặt, hai chỗ dọn dẹp, cùng thứ tự sắp xếp, thời lượng và hành vi đóng của component.

## Hệ quả

**Bỏ sót một điểm commit sẽ làm sót dòng.** Nếu một ngày nào đó việc gỡ bỏ trong `disposeOwner()` không còn kích hoạt đăng ký, client sẽ giữ mãi những tác vụ đã không còn tồn tại cho tới khi phiên biến mất. Hình dạng ảnh chụp toàn phần khiến chuyện này có thể phục hồi chứ không hỏng hẳn — lần thay đổi chính đáng kế tiếp sẽ sửa nó — nhưng đường hủy là đường dễ quên nhất, nên nó có test riêng đi kèm.

**Fan-out cho tác vụ vô chủ rất dễ làm sót.** Chỉ đẩy tới phiên chứa owner của thay đổi thì đúng với tác vụ có chủ, nhưng lại sai một cách âm thầm với tác vụ vô chủ vốn thấy được ở mọi nơi. Bug này chỉ lộ ra trong các bộ hợp thành có tạo tác vụ vô chủ, nên bộ test của lớp vận chuyển bao phủ nó trực tiếp.

**Tập hợp của UI không bằng tập hợp của registry.** Header hiển thị "một phiên nhìn thấy được gì", nên tác vụ do phiên khác sở hữu sẽ không bao giờ xuất hiện ở đây dù registry có nó; và vì registry là cục bộ theo tiến trình, một lần khởi động lại sẽ xóa sạch mọi danh sách, trong khi các thẻ `run_in_background` đã khởi động chúng vẫn còn nằm trong transcript. Tác vụ vô chủ là tình huống ngược lại: chúng vào danh sách của mọi phiên, đúng như `list(caller)` báo cáo chúng cho mọi bên gọi.

**Các dòng trạng thái cuối sẽ dồn lại.** Registry giữ tác vụ đã kết toán cho tới khi owner bị hủy, nên một phiên dài chạy nhiều lệnh nền sẽ tích thành danh sách dài. Nếu điều này thực sự thành lời than phiền, việc đặt giới hạn cho phần đuôi trạng thái cuối là thay đổi ở lớp trình bày chứ không phải thay đổi giao thức.

**`stopping` hôm nay gần như không thể chạm tới.** Chỉ có `job_kill` của model mới sinh ra nó, nên trạng thái này được render nhưng hiếm khi thấy trước lúc chức năng con-người-ngắt ra đời. Đưa vào kiểu union ngay bây giờ là vì để nó ở ngoài sẽ khiến giai đoạn đó biến thành một lần thay đổi đường truyền.

**Một subagent đang chạy có hai lối vào.** Đây là điều chấp nhận có chủ ý, và giới hạn trong đúng trường hợp ủy nhiệm nền một lần. Nếu khi dùng thực tế nó đọc lên như nhiễu, cách sửa nằm ở lớp trình bày — có thể cho dòng danh mục tham chiếu tới tác vụ đó, thay vì bắt danh sách tác vụ ẩn kind này đi.

**Đường dẫn con không phải gốc khi thêm mới bắt buộc phải bổ sung mục `paths`.** `@deepseek-ai/dsh-jobs/brand` phải được đăng ký vào `tsconfig.base.json` trước thì bộ phân tích Typert mới chấp nhận tham chiếu đó. Sự cố của nó biểu hiện thành một lỗi "not exported by" khó hiểu, phát ra từ một generator ở xa chỗ thay đổi, nên mục này là một thành phần bắt buộc khi thêm đường dẫn con mới, chứ không phải một tối ưu hóa.
