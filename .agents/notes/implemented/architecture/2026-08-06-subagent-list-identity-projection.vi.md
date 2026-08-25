# Agent Note: Danh sách subagent đọc identity qua đơn vị projection

Status: implemented

[English](2026-08-06-subagent-list-identity-projection.md) | 中文

## Vấn đề

Trước khi viết lại, `SubagentRuntime.listChildren` đối với mỗi child trực tiếp có `header.origin === 'subagent'`, mỗi lần liệt kê đều thực hiện `listEvents` cộng `readEvent` để vật chất hóa toàn bộ log hai lần, và mỗi lần vật chất hóa lại kèm theo một lượt structuredClone toàn log, chỉ để bóc ra hai trường mode và label từ sự kiện descriptor. Vị trí của descriptor trong log không cố định — tiền tố fork có thể dài tùy ý, khung nén zstd không có chỉ mục theo seq — nên việc định vị không có đường tắt; đường này không hề có bất kỳ cache nào, chi phí phóng đại theo độ dài transcript (bản ghi văn bản) × số child × tần suất liệt kê. Nó còn biến session-query thành phụ thuộc cứng của việc liệt kê: những deployment không có query backend, `list_agents` bị từ chối toàn bộ với `SUBAGENT_CONTROL_SESSION_QUERY_UNAVAILABLE`, dù việc liệt kê thực chất chỉ cần sự thật ở header.

Cùng một căn nguyên còn có triệu chứng thứ hai: `hasSubagentDescriptor()` phía host quét own suffix của session đích trong mỗi lần phán định chủ sở hữu RPC gắn với Agent (tác tử), dù `SessionHeader.origin` đã trả lời phần lớn câu hỏi đó rồi.

Căn nguyên nằm ở chỗ [quyết định durable-subagent-catalog](../feature/2026-07-22-durable-subagent-catalog-and-list-agents.md) đặt sự kiện descriptor (`subagent/descriptor`) làm thẩm quyền duy nhất, bền vững cho catalog, nhưng lại không cấu hình bất kỳ lớp cache nào cho việc đọc descriptor, và chấp nhận rõ ràng việc đọc kép theo-từng-child như "đường cơ sở đúng đắn không có chỉ mục". [web subagent conversations](../feature/2026-07-27-web-subagent-conversations.md) (#1569) đã đưa "có phải subagent hay không" vào header (`SessionHeader.origin`), việc phán định identity không còn cần đọc log; mode và label thì vẫn phải quét.

## Quyết định

mode và label được gấp lại bởi `subagent` projection unit mới (hai nhánh identity thuần túy); unit này là thẩm quyền duy nhất cho quy tắc gấp; `listChildren` không còn phụ thuộc session-query — việc liệt kê là hợp nhất live-preferred tự quản của subagent, việc lấy giá trị đi theo bậc thang ba cấp "tính xong thì dừng": live child đồng bộ đọc cache watermark sẵn có của registry (zero log read); cold child trước tiên hỏi checkpoint tùy chọn của `sessionProjectionCache` — nếu lấy được identity đã qua seq gate thì coi là giá trị chốt; nếu không, thực hiện một lượt `persistence.inspect` đọc toàn bộ cộng `registry.restore` gấp lại. Không chỉ mục, không tự xây cache, không ghi ngược.

Có ba lối thoát để loại bỏ việc quét theo-từng-child: nâng mode/label lên header (đường ghi gánh chịu); xây dữ liệu dẫn xuất bền vững cho projection (bậc thang checkpoint, hoặc落 giá trị theo việc tái xây chỉ mục truy vấn, đối soát ở đầu đọc); tính lại lúc đọc (live đi cache watermark, cold một lượt đọc toàn bộ). Note này chọn con đường thứ ba. "Giá trị落 theo chỉ mục truy vấn" đã bị退役 hoàn toàn: hạ tầng truy vấn bị buộc phải biết từ vựng miền nghiệp vụ, trong khi bên tiêu thụ duy nhất chỉ cần tính lại lúc đọc là đủ — zero read của live child được ăn sẵn từ cache watermark sẵn có của session-projection, một lượt đọc toàn bộ của cold child được "tính xong thì dừng" chấp nhận rõ ràng. Hai con đường đầu và lý do退役 xem ở phần các phương án đã cân nhắc.

Điểm chính:

- **Danh sách subagent không phụ thuộc session-query**: việc liệt kê do hợp nhất live-preferred tự quản của subagent hoàn tất, mode/label lấy giá trị qua `ctx.sessionProjections`; deployment không có query backend vẫn liệt kê bình thường.
- **Lấy giá trị theo bậc thang ba cấp "tính xong thì dừng"**: live child đọc `sessionProjections.snapshot()` (cache watermark sẵn có của registry, zero log read); cold child trước tiên đọc `sessionProjectionCache.cachedSnapshot(header)` tùy chọn, nếu values chứa identity `subagent` khác null và qua seq gate (`seq >= seedLength ?? 0`) thì dùng thẳng; nếu không, một lượt `persistence.inspect` đọc toàn bộ cộng `registry.restore({}, events, 0)` gấp lại; hết cách thì thôi — không tự xây cache, không ghi ngược, không chỉ mục.
- **`subagent` projection unit là thẩm quyền duy nhất cho quy tắc gấp**: live snapshot, cold restore, việc gấp detached của GUI history đều tính qua registry, không tồn tại logic diễn giải descriptor thứ hai.
- **header, descriptor (v2), session-persistence, session-projection(-cache), session-query(-sqlite) đều zero thay đổi**; dữ liệu tồn kho lần đầu bị liệt kê sẽ được tính một lượt `inspect` để lấy giá trị chính xác, không có trạng thái xuống cấp unknown, không cần migration.

Quan hệ với các Note sẵn có:

- Note này thay thế hai thiết kế trong phần đường đọc liệt kê của [durable-subagent-catalog](../feature/2026-07-22-durable-subagent-catalog-and-list-agents.md): việc liệt kê qua `sessionQuery.traceSession`, và việc đọc sự kiện descriptor theo-từng-child (đọc kép `listEvents` cộng `readEvent` chính xác, phân loại chẩn đoán tại chỗ). Ngữ nghĩa dòng diagnostic được giữ nguyên, phân loại đổi thành do liệt kê suy ra từ việc thiếu giá trị projection và activity; sự kiện descriptor vẫn là thẩm quyền bền vững duy nhất và đầu vào gấp cho mode/label, quy ước xác thực restore và activation không đổi. Thuộc dạng thay thế một phần, hai Note giữ liên kết chéo lẫn nhau.
- Quy ước registry (`ProjectionDefinition`, `snapshot`, `restore`) của [session-projection RFC](../../proposed/architecture/2026-07-27-session-projection-and-command-log.md) zero thay đổi, Note này chỉ thêm cho nó một mục đăng ký unit identity `subagent`, và trở thành một instance tiêu thụ nữa của hai cách đọc sẵn có là snapshot (live) và restore (cold) — việc đọc lạnh của GUI history vốn đã cùng kiểu. Quy tắc gấp chỉ đăng ký một bản duy nhất tại registry; mọi mặt tiêu thụ đều tính qua registry, không tồn tại logic gấp thứ hai.

### `subagent` projection unit

Đặt cạnh `subagentTiming` sẵn có ([projection.ts](../../../../packages/subagent/subagent/src/projection.ts), [projection-types.ts](../../../../packages/subagent/subagent/src/projection-types.ts)), key là `subagent`:

```ts ignore-check
export type SubagentIdentityProjection =
  | { mode: 'one-shot'; label?: string; seq: number }
  | { mode: 'continuable'; label: string; seq: number }

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    subagent: SubagentIdentityProjection | null
  }
}
```

- Projection thuần túy chỉ là identity, **hệ thống projection không có kênh lỗi**: unit không bao giờ ném lỗi; payload hỏng, phiên bản không nhận diện được và cả log không có descriptor đều cho cùng một kết quả gấp là **sentinel null có thể serialize** — mục trong map là `SubagentIdentityProjection | null`, không phải optional, không phải undefined/thiếu key. Lý do: việc push onChanged của registry đi qua JSON serialize, trường undefined bị stringify loại bỏ, việc xác thực frame phía client sẽ từ chối nhận, và bên tiêu thụ lưu identity cũ sẽ vĩnh viễn không được cập nhật; null thì vượt qua frame nguyên vẹn, bên tiêu thụ dùng sentinel để thay thế identity cũ. Kỷ luật phán định: mặt tiêu thụ coi null và undefined (chỉ có thể sinh ra khi mất key ở ranh giới JSON) đều là không có giá trị. "Tính ra không có" được hiển thị thế nào là việc của bên tiêu thụ tự lo (xem ánh xạ bốn trạng thái của `listChildren` bên dưới).
- Độ mạnh của label do schema descriptor quyết định: label của continuable bắt buộc phải phân tích được, còn one-shot vốn đã tùy chọn; việc phân định mode/label hoàn toàn nhất quán với quy ước mạnh của dòng child bên dưới (dòng không mang `seq` — đó là bằng chứng own-suffix nội bộ của projection).
- Identity mang theo `seq`: seq của sự kiện `subagent/descriptor` đã gấp ra identity đó, cả hai nhánh đều bắt buộc có, sentinel null thì không — `seq >= header.seedLength ?? 0` chứng minh identity được gấp từ chính hậu tố của child, chứ không phải descriptor tổ tiên bị replay lại từ seed fork. State có thêm `seq` khiến `stateVersion` của unit tăng lên 2, dòng checkpoint tồn kho theo quy ước registry sẽ bị coi là lệch phiên bản và mất hiệu lực, buộc phải落 về thẩm quyền để gấp lại.
- Quy tắc gấp: `subagent/descriptor` last-wins, cùng kỷ luật descriptor-reset như `subagentTiming` — descriptor tổ tiên trong tiền tố fork bị descriptor của chính mình ghi đè. Payload hỏng hoặc phiên bản không nhận diện được cũng theo last-wins: reset về sentinel null thay vì giữ lại identity trước đó, fork của tổ tiên khỏe mạnh sẽ không kế thừa identity không đứng vững của chính mình.

### Liệt kê: hợp nhất live-preferred tự quản của subagent

Việc liệt kê của `listChildren` ([list-children.ts](../../../../packages/subagent/subagent/src/list-children.ts)) không đi qua bất kỳ dịch vụ truy vấn nào: hai nguồn `ctx.sessions.list()` và `ctx.get('sessionPersistence')?.list()` được hợp nhất theo id, bản ghi live ghi đè toàn bộ bản ghi persistence cùng id, không xác thực nhất quán với header. Toàn bộ những gì việc liệt kê cần đều là sự thật ở header:

- Lọc: `header.origin === 'subagent' && header.parentSession === parentSessionId`.
- `hasChildren`: cùng một bộ vật liệu hợp nhất đó nhìn xuống thêm một lớp — tồn tại `origin === 'subagent'` mà `parentSession` là hậu duệ trực tiếp của child đó.
- `activity`: bản ghi live là `running`, chỉ tồn tại ở persistence là `inactive`.
- Sắp xếp: `createdAt` tăng dần, sau đó theo id child tăng dần (nhất quán với quy ước cũ).
- **persistence vắng mặt thì lùi về liệt kê chỉ-live, không báo lỗi**: deployment không có persistence, cold child vốn đã không thể resume, việc liệt kê ra live child vẫn có ý nghĩa. (So sánh: cách triển khai cũ từ chối toàn bộ khi sessionQuery vắng mặt.)
- persistence liệt kê thất bại khiến toàn bộ lượt liệt kê thất bại; cô lập theo-từng-child chỉ tác dụng lên việc đọc lạnh theo-từng-child.

### Lấy giá trị: bậc thang ba cấp "tính xong thì dừng"

Với mỗi child được liệt kê ra, việc lấy giá trị mode/label đi theo bậc thang ba cấp — tính xong thì dừng, không tự xây cache, không ghi ngược (cấp thứ ba cùng kiểu với việc đọc lạnh của `session.history` bên apiproxy):

| Cấp | Cách đọc | Chi phí |
| --- | --- | --- |
| 1: live child | `ctx.sessionProjections.snapshot(session).values.subagent` | zero log read — cache watermark sẵn có của registry, lấy giá trị đồng bộ |
| 2: cold child, cache hit | `sessionProjectionCache.cachedSnapshot(header)` tùy chọn, values chứa identity `subagent` khác null và `identity.seq >= header.seedLength ?? 0` mới được dùng thẳng — own descriptor một khi đã được append thì bất biến, seq gate chứng minh giá trị đó được gấp từ chính hậu tố của child, bất kể watermark của dòng | zero log read |
| 3: cold child, phương án chốt | `persistence.inspect(id)` đọc toàn bộ + `registry.restore({}, events, 0).snapshot.values.subagent` | mỗi lần liệt kê một lượt đọc toàn bộ để tính lại |

- Quy ước lỗi: `ctx.sessionProjections` không được gắn là lỗi cấu hình, `listChildren` kiểm tra vô điều kiện trước khi liệt kê và thất bại rõ ràng với `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE` — deployment có zero children cũng thất bại chắc chắn như nhau, không để danh sách trống che giấu vấn đề cấu hình. Session store cũng vậy: `ctx.get('sessions')` (đọc global nghiêm ngặt, không đi qua property proxy theo phạm vi của bên gọi) vắng mặt sẽ thất bại với `SUBAGENT_CONTROL_SESSION_STORE_UNAVAILABLE`. Ánh xạ wire của hai mã lỗi khác nhau: apiproxy chỉ dựng mặt wire riêng cho `PROJECTIONS_UNAVAILABLE`, còn `SESSION_STORE_UNAVAILABLE` đi qua phương án chốt internal chung — bản thân tổ hợp apiproxy tự inject `sessions`, lỗi đó không thể xảy ra trong deployment của nó, việc ánh xạ riêng sẽ vi phạm nguyên tắc need.
- cache là lớp tăng tốc thuần túy, tùy chọn: dịch vụ vắng mặt thì phán rỗng và bỏ qua — không mã lỗi, không đưa vào kiểm tra cấu hình (đối lập với quy ước rõ ràng của `sessionProjections`). Bất kỳ lỗi nào từ cấp thứ hai (kể cả một dòng unit nào đó trong cache bị nhiễm độc khiến `viewCheckpoint` nổ) đều âm thầm rơi xuống cấp thứ ba — cache là dữ liệu dẫn xuất, sự cố của nó không tạo ra phán quyết `corrupt`, quyết định cuối cùng thuộc về việc gấp lại từ thẩm quyền; dòng checkpoint có mặt cắt sớm hơn descriptor thì key `subagent` tự nhiên vắng mặt, tự động rơi xuống đáy, không cần xử lý đặc biệt; sentinel null trong dòng cũng không được tính — đều rơi xuống cấp thứ ba, do việc gấp lại từ thẩm quyền phán quyết. Checkpoint theo count/interval trong cửa sổ tạo mới có thể落 identity tổ tiên bị replay từ seed fork vào dòng — seq của tổ tiên nằm trong khoảng seed, bị seq gate từ chối, cũng rơi xuống cấp thứ ba để phán quyết.
- Cô lập theo-từng-child: đọc lạnh thất bại của một child đơn lẻ chỉ khiến dòng đó thành diagnostic `unavailable`, lần liệt kê sau tự nhiên thử lại, không ảnh hưởng sibling (xem ánh xạ bốn trạng thái).
- Bằng chứng vòng đời của đường lạnh: kết quả của bước chuẩn bị phải vẫn chỉ đúng vòng đời tại thời điểm liệt kê — tập trường bằng chứng cùng kiểu với kiểm tra SOURCE_CONFLICT cũ, bảy trường (version, id, createdAt, cwd, parentSession, seedLength, delegationDepth); session cùng id bị xóa rồi phát hành lại thì dòng thư mục trỏ về parent cũ bị xuống cấp thành `corrupt`, không rò rỉ owner mới của child.
- Số luồng đọc lạnh song song bị giới hạn ở hằng số 4 — cái nó ràng buộc là một lượt quét chỉ-đọc của phương tiện cục bộ, không phải hành vi deployment; khi xuất hiện persistence backend nối mạng thì nâng cấp thành trường `Config` đã được xác thực.
- Chi phí đọc lạnh được ghi nhận trung thực: khi cache không được gắn hoặc không hit, mỗi lần liệt kê cold child phải trả một lượt đọc toàn bộ, chi phí tỷ lệ với kích thước transcript của nó; định án là "tính xong thì dừng", không tự xây cache. Việc đọc toàn bộ qua `inspect()` đi theo [giai đoạn chuẩn bị Session](2026-08-05-session-preparation.md) của đọc lạnh, việc đọc lặp lại trong thời gian ngắn cùng id có thể trúng LRU tái sử dụng của nó, nhưng việc liệt kê không phụ thuộc vào điều này. live child xuyên suốt là zero log read.
- Hủy: mỗi lượt đọc persistence kiểm tra signal của bên gọi trước và sau; việc đọc chốt sau khi abort bị từ chối và quy về mã lỗi ổn định `CANCELLED`.

### Mô hình thẩm quyền

- session log là thẩm quyền duy nhất; phương án này không thêm bất kỳ persistence dẫn xuất nào — không giá trị chỉ mục, không tự có checkpoint, không memo tiến trình; checkpoint của `sessionProjectionCache` mà cấp thứ hai đọc là dữ liệu dẫn xuất của một thành phần tổ hợp sẵn có, phương án này chỉ đọc không ghi. Giá trị lấy ra tính xong rồi bỏ, độ mới của giá trị chính là trạng thái live hoặc revision persistence tại thời điểm đọc (own descriptor một khi đã append thì bất biến — identity trong cache một khi qua seq gate thì không có vấn đề cũ, gate đề phòng chính là identity tổ tiên bị replay từ seed).
- Đường ghi của Session và persistence hoàn toàn không cảm nhận việc liệt kê và tiêu thụ projection: không có listener sự kiện ghi ngược, không có việc gấp khi ghi.
- Việc liệt kê và lấy giá trị không tạo thành nguồn xác thực thứ hai, cũng không làm lộ child chưa được phát hành — hai nguồn chỉ nhìn thấy bản ghi live đã phát hành và bản ghi persistence đã lưu xuống, nhất quán với quy tắc mà durable-subagent-catalog đã đặt ra cho các mặt đọc dẫn xuất.

### Hình dạng dòng `listChildren` và mặt tiêu thụ

`SubagentListEntry` **cấu trúc dữ liệu hoàn toàn giữ nguyên so với trước khi viết lại** — hai nhánh child và diagnostic, phân định `kind`, ba giá trị reason, quy ước mạnh mode/label của nhánh child đều được giữ lại; thay đổi chỉ nằm ở nguồn thông tin của chẩn đoán: hệ thống projection không có kênh lỗi, diagnostic do việc liệt kê suy ra từ việc thiếu giá trị projection và activity, bản thân việc liệt kê zero phân tích sự kiện. "Không có thì chờ đọc cứng" đảm bảo bậc thang chắc chắn tính ra được mode/label với dữ liệu khỏe mạnh.

```ts ignore-check
export type SubagentListEntry =
  | ({
    readonly kind: 'child'
    readonly id: SessionId
    readonly activity: 'running' | 'inactive'
    readonly hasChildren: boolean
  } & (
    | { readonly mode: 'one-shot'; readonly label?: string }
    | { readonly mode: 'continuable'; readonly label: string }
  ))
  | {
    readonly kind: 'diagnostic'
    readonly id: SessionId
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
  }
```

Với mỗi child được liệt kê ra, kết quả lấy giá trị theo bậc thang được ánh xạ thành dòng theo bốn trạng thái:

| Kết quả lấy giá trị theo bậc thang | Dòng |
| --- | --- |
| Snapshot chứa identity `subagent` khác null | dòng child |
| Snapshot có, `subagent` là sentinel null hoặc key vắng mặt, và child **inactive** | dòng diagnostic, reason `corrupt` (tàn tích đã định: descriptor không có, hỏng hoặc phiên bản không nhận diện được, không phân loại chi tiết hơn) |
| Snapshot có, `subagent` là sentinel null hoặc key vắng mặt, và child **running** | dòng không xuất hiện (cửa sổ tạo mới: descriptor chưa kịp append, cùng cửa sổ omit với cách triển khai cũ) |
| Đọc toàn bộ ở cold thất bại | dòng diagnostic, reason `unavailable` |

- `unsupported` không còn được sinh ra: type và enum wire vẫn giữ thành viên đó theo quy tắc "cấu trúc dữ liệu giữ nguyên hiện trạng", Note này lưu lại rằng nó không còn được sinh ra nữa.
- Tàn tích đã định thiếu descriptor được chuyển từ omit của cách triển khai cũ sang diagnostic `corrupt` — session con hỏng, chết trong thư viện thì vẫn hiển thị được, không âm thầm biến mất, đây chính là động lực ban đầu để giữ lại diagnostic.
- fold/schema của bất kỳ unit đã đăng ký nào ném lỗi trên log của child đó cũng được thu nạp thành dòng diagnostic của child đó, reason `corrupt` — dữ liệu hỏng có tính xác định, khớp với ánh xạ ngữ nghĩa `SESSION_QUERY_CORRUPT_SESSION`→`corrupt` của cách triển khai cũ; live và cold được đối xử như nhau, cô lập theo-từng-child, sibling và bản thân việc liệt kê không bị ảnh hưởng. Nó trực giao với "không có giá trị + running → omit": cửa sổ tạo mới là "chưa có dữ liệu", fold ném lỗi là "dữ liệu hỏng" — child running bị nhiễm độc cũng ra dòng `corrupt` thay vì omit.

Các lệch chuẩn biên đã biết (được chấp nhận có chủ đích, ghi lại trong Note này):

- fork child chết trong cửa sổ phát hành, nếu seed có descriptor tổ tiên thì last-wins sẽ cho ra identity tổ tiên, khiến nó hiện nhầm thành dòng child; việc restore vẫn thất bại theo thẩm quyền gấp own-suffix (`NOT_RESUMABLE`). Cách triển khai cũ dựa vào lọc `seedLength` để omit nó; projection unit không nhìn thấy header, chấp nhận lệch chuẩn cấp tàn tích này (`subagentTiming` cũng có kiểu phơi bày tương tự sẵn có).
- own suffix xuất hiện nhiều descriptor, cách triển khai cũ phán corrupt, hiện tại last-wins lấy cái cuối cùng (quy ước nhà cung cấp vốn đã đảm bảo đúng một cái).
- header live/persisted xung đột, cách triển khai cũ là corrupt theo-từng-child; hiện tại việc liệt kê ưu tiên live, không xác thực nhất quán, xung đột không còn bị phát hiện, thành dòng theo bản ghi live.
- đọc nguồn của storage hỏng thất bại (ví dụ surface hỏng bị đọc lạnh toàn bộ từ chối nhận), cách triển khai cũ ánh xạ `corrupt` theo-từng-child, hiện tại thống nhất thành dòng `unavailable` (phía đọc không thể phân biệt nguyên nhân).
- parent không rõ, cách triển khai cũ qua session-query ném not-found ("parent session … was not found"); hiện tại việc hợp nhất tự quản với parent không tồn tại sẽ cho tập con rỗng, việc liệt kê trả về danh sách rỗng, thao tác tiếp theo trên wire rơi vào subagent-not-found ở cấp child — thay đổi ngữ nghĩa và câu chữ âm thầm, được chấp nhận rõ ràng.
- cửa sổ sự kiện muộn hơn ở rung 2: dòng cache vừa đúng lúc落 sau descriptor tự sở hữu đầu tiên, log sau đó append descriptor tự sở hữu thứ hai (hoặc payload malformed đặt sentinel null), và tiến trình crash trước checkpoint tiếp theo — sau đó rung 2 của việc liệt kê lạnh dựa vào gate seq≥seedLength tiếp tục cung cấp identity cũ trong dòng (giá trị của descriptor tự sở hữu đầu tiên), lệch với việc gấp lại từ thẩm quyền (last-wins cái thứ hai), và trong lúc rung 2 đang hit thì không kích hoạt gấp lại, không thể phát hiện. Ba điều kiện biên: ① tiền đề là cùng một child xuất hiện descriptor tự sở hữu thứ hai, vi phạm quy ước "chỉ append đúng một lần" của nhà cung cấp đã lập tài liệu, thuộc loại dữ liệu hỏng, cùng gốc với lệch chuẩn nhiều descriptor; ② cần đồng thời hai điều kiện "hỏng + crash lỡ mất checkpoint" (cả hai điểm mandatory turn/end lẫn disposal, cùng điểm throttle count/interval đều chưa kịp); ③ child khỏe mạnh (đúng một descriptor tự sở hữu) không bị ảnh hưởng — seq gate cho qua đúng identity thật duy nhất. Điều kiện tự phục hồi: bất kỳ lần chạy live nào của child đó (checkpoint mandatory turn/end) hoặc bất kỳ thời điểm nào kích hoạt cache.write đều sẽ ghi đè toàn dòng bằng fold mới (whole-record replace), rung 2 lập tức cung cấp đúng trở lại; đường thẩm quyền (gấp lại ở rung 3, live snapshot, việc gấp khi resume) từ đầu đến cuối đều đúng, lệch chỉ tồn tại trong lúc đọc liệt kê khi liên tục lạnh và dòng chưa được cập nhật lại. Không chọn sửa ở mức cơ chế: đối soát gate cần biết seq cuối log, đường lạnh zero read không lấy được; dòng cache mang revision là opaque token, không so sánh được và đổi schema xuyên miền — theo tôn chỉ chung "cache không bao giờ là thẩm quyền" mà xếp vào mục chấp nhận.

Mặt tiêu thụ: việc xử lý diagnostic của wire, tool, GUI **hoàn toàn giữ nguyên, zero thay đổi** (description và output schema của `list_agents` không đổi; plugin này chỉ thu hẹp yêu cầu tải — inject bỏ `sessionQuery`). Về hành vi chỉ có apiproxy thay đổi: việc quét `hasSubagentDescriptor()` ở đoạn tuyến đã bị xóa, `hasSubagentOwner` chỉ nhìn `header.origin` — tồn kho trước #1569 không có `origin` không còn được công nhận là chủ sở hữu subagent, vốn dĩ nó cũng không vào catalog, lập trường pre-release chấp nhận điều này; `subagents.history` và `session.history` được căn chỉnh cùng nguồn — live child dùng sự kiện trong bộ nhớ và snapshot watermark của registry, cold child dùng `inspectServable` đọc trực tiếp persistence và gấp detached, không qua dịch vụ truy vấn, các nhánh lỗi SESSION_QUERY_* theo đó退役, hình dạng wire không đổi (câu chữ JSDoc của `history` đổi thành hai nhánh live bộ nhớ/cold log bền vững).

### Điểm thay đổi trong mã nguồn

| Khu vực | Tệp | Thay đổi |
| --- | --- | --- |
| subagent | projection.ts, projection-types.ts, index.ts | unit `subagent` mới và việc đăng ký |
| subagent | list-children.ts và các type liên quan | viết lại thành liệt kê tự quản + ánh xạ bốn trạng thái theo bậc thang projection; xóa phụ thuộc session-query, cỗ máy đọc sự kiện và phân loại tại chỗ theo-từng-child; mã lỗi `SUBAGENT_CONTROL_SESSION_QUERY_UNAVAILABLE` đổi thành `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE`; thêm phụ thuộc tùy chọn dsh-session-projection-cache (lớp tăng tốc đọc thuần túy, vắng mặt thì bỏ qua) |
| host/apiproxy | api-proxy.ts | xóa `hasSubagentDescriptor`, việc phán định chủ sở hữu chỉ nhìn `header.origin`; `subagents.history` và `session.history` cùng nguồn — live dùng sự kiện bộ nhớ và snapshot watermark của registry, cold dùng `inspectServable` đọc trực tiếp persistence và gấp detached, không qua dịch vụ truy vấn, các nhánh lỗi SESSION_QUERY_* theo đó退役 |
| tool | tool-subagent-control/list-agents.ts | thu hẹp yêu cầu tải (inject bỏ `sessionQuery`); schema hiển thị cho model, mô tả và render zero thay đổi |
| wire/client | api/subagents.ts, runtime sessions/service.ts, GUI | type, hình dạng dòng và xử lý diagnostic **zero thay đổi**; api/subagents.ts chỉ đổi câu chữ JSDoc của `history` thành hai nhánh |
| core/session, session-persistence, session-projection(-cache), session-query(-sqlite) | — | **zero thay đổi** |

## Các phương án đã cân nhắc

**Đưa mode/label vào SessionHeader.** Đảm bảo zero read mạnh nhất — việc liệt kê chỉ cần nhìn header là ra dòng ngay. Nhưng thay đổi hình dạng header sẽ lan truyền tới hai persistence backend và việc kiểm tra tương thích header; tồn kho SQLite bị từ chối nhận thẳng, tồn kho JSONL chỉ có thể xuống cấp unknown hoặc backfill. Câu trả lời của việc tính lại lúc đọc cho tồn kho là "lần đầu liệt kê tính một lượt `inspect`", không đụng đến định dạng bền vững.

**Bậc thang projection-cache (`cachedSnapshot ?? coldSnapshot` cộng ghi ngược fail-soft).** Cơ chế khả thi — bậc thang checkpoint của session-projection-cache vốn được thiết kế cho việc đọc lạnh. Nhưng ghi ngược checkpoint là cả một bộ điều phối persistence và vô hiệu hóa dữ liệu dẫn xuất do việc liệt kê khởi động (floor/identity/putSoft); cái bị bác bỏ chính là bộ điều phối này với vai trò cơ chế chính. Bậc thang thứ ba ở bản chốt sau này tái sử dụng cơ hội cache đó chỉ theo kiểu chỉ-đọc làm cấp thứ hai — không ghi ngược, không điều phối, vắng mặt thì bỏ qua.

**Thêm nguyên thủy đọc có giới hạn cho persistence để cứu vãn tồn kho.** Mở nguyên thủy persistence mới cho một vấn đề chỉ xảy ra một lần; bị thay bằng việc đọc `inspect` lúc đọc — lượt đọc toàn bộ lần đầu tồn kho bị liệt kê chính là việc lấy giá trị luôn.

**Cho phép mode/label của dòng list tùy chọn.** Dữ liệu khỏe mạnh chắc chắn tính ra được; cho tùy chọn chỉ đẩy độ phức tạp xử lý dữ liệu rác ra toàn bộ bên tiêu thụ — mỗi mặt tiêu thụ đều phải mọc thêm nhánh lọc và trạng thái hiển thị unknown. Quy ước mạnh cộng với "không tính ra thì omit" thì sạch hơn.

**Xóa hẳn dòng diagnostic.** Việc xóa đẩy tính hiển thị của thư viện hỏng ra chỗ dòng âm thầm biến mất, wire/tool/GUI ngược lại phải tự gánh việc thay đổi quy ước và snapshot; trong khi giữ lại chỉ cần việc liệt kê suy ra phân loại từ việc thiếu giá trị projection và activity, chi phí zero. Session con hỏng, chết trong thư viện bắt buộc phải hiển thị được, đó chính là động lực ban đầu để có diagnostic, giữ lại thì mặt tiêu thụ zero thay đổi toàn bộ.

**Kênh lỗi tính toán của registry (per-unit chịu lỗi cộng trường phụ `failures`).** Để báo cáo cho bên tiêu thụ biết về việc hỏng, phiên bản không nhận diện được, cho registry bắt lỗi từ unit và đính kèm trạng thái lỗi per-key bên cạnh snapshot. Bị bác bỏ: failure không phải là giá trị, cũng không nhất thiết phải là một kênh — unit không bao giờ ném lỗi, việc vắng mặt tự nó đã là tín hiệu, "cùng lắm là tính ra không có", còn hiển thị thế nào là việc bên tiêu thụ tự cân nhắc. Một quan sát độc lập: `emit` của vendor cordis ([vendor/cordis/src/events.ts](../../../../vendor/cordis/src/events.ts)) không bắt lỗi nào từ listener, khi driver projection gắn vào `session/event` thì lỗi unit sẽ thoát ra dọc theo emit — điều này càng làm nặng thêm kỷ luật "unit không bao giờ ném lỗi", nhưng việc sửa khả năng chịu lỗi của emit không thuộc phạm vi Note này.

**Giá trị落 xuống theo preparation của chỉ mục query.** Giá trị projection được gấp và落 vào dòng chỉ mục session trong quá trình tái xây đối soát của sqlite backend, việc đọc ở trạng thái ổn định là zero log: mặt đọc hàng loạt `projectionsFor`, giá trị dòng lưu theo registry `(key → stateVersion)` với đối soát vô hiệu hóa và SCHEMA bump. Toàn bộ退役: hướng đi sai — hạ tầng truy vấn bị buộc phải biết từ vựng miền nghiệp vụ (cột projection, đối soát registry), trong khi bên tiêu thụ duy nhất là danh sách subagent chỉ cần tính lại lúc đọc là đủ; sau khi bên tiêu thụ về không, bộ persistence dẫn xuất này không còn lý do tồn tại. `SESSION_QUERY_PROJECTIONS_UNAVAILABLE` bị xóa cùng mặt đọc.

**subagent tự parse tay cộng memo tiến trình cộng gieo hạt khi tạo.** Để gỡ phụ thuộc session-query, để package subagent tự parse sự kiện descriptor, dùng memo trong-tiến-trình để tránh đọc toàn bộ lặp lại, gieo giá trị ban đầu khi tạo. Bị bậc thang đã giao thay thế: live đi cache watermark của `sessionProjections`, cold đi `registry.restore`, tái sử dụng thẩm quyền gấp duy nhất này của registry, không còn xuất hiện logic diễn giải descriptor thứ hai, cũng không đưa vào cache trạng thái tiến trình hay thời điểm gieo hạt.

**DeepReadonly cho mặt output của session-query (thử nghiệm cải tạo đường đọc).** Làm output truy vấn công khai bất biến sâu, để chốt chặt việc mượn bất biến ở lớp type. Bị phủ quyết bằng thực chứng: 3 chỗ TS2589 (khởi tạo type quá sâu) cộng 17 chỗ lan truyền vị trí mảng (bên tiêu thụ dùng phương thức mảng và toán tử spread bị buộc phải sửa theo); bất biến ở tầng sâu đã được đảm bảo bởi deep freeze thời gian chạy của core/session, việc cải tạo đường đọc này không được đưa vào Note này.

## Kiểm chứng

`packages/subagent/subagent/tests/list-children.spec.ts` được viết lại theo quy ước này: liệt kê chỉ-live khi không có persistence, dịch vụ query và runtime đang tiếp tục chạy; registry vắng mặt dù zero children vẫn báo rõ ràng `SUBAGENT_CONTROL_PROJECTIONS_UNAVAILABLE`; live child xuyên suốt zero `inspect`, cold child mỗi lần liệt kê đúng một lần; nhiều descriptor thì last-wins lấy cái cuối; payload hỏng và phiên bản không rõ được gấp thành `corrupt`; đọc lạnh thất bại ánh xạ thành `unavailable` và lần liệt kê sau tự thử lại; descriptor tổ tiên trong seed fork thành dòng theo identity đó (ghim lệch chuẩn thứ nhất); fork thông thường và hậu duệ không có subagent origin không vào danh sách cũng không tính vào `hasChildren`; sắp xếp theo `createdAt`→id; nhà cung cấp không được gắn không ảnh hưởng đến việc liệt kê; nén và không nén cho kết quả song sinh nhất quán; ba trường hợp pre-abort, persistence liệt kê và hủy đọc lạnh đều quy về `CANCELLED`; danh sách rỗng và mã lỗi ổn định. Đầu dò hai đường unit thù địch (`apply` đầu độc lười, `view` gây nổ) chứng minh rằng bất kỳ unit đã đăng ký nào ném lỗi khi fold/schema trên log của child đó, trên cả hai đường lấy giá trị live và cold đều được thu nạp thành dòng `corrupt` của child đó, sibling và bản thân việc liệt kê không bị ảnh hưởng. Ví dụ cấp thứ hai: identity own-seq dùng thẳng zero `inspect`, identity tổ tiên trong seed fork (seq nằm trong khoảng seed) bị gate từ chối rơi xuống đáy, dòng không có identity (sentinel null hoặc thiếu key) rơi xuống đáy, dịch vụ cache vắng mặt rơi xuống đáy, dòng cache bị nhiễm độc âm thầm rơi xuống đáy và gấp lại; việc giả mạo lifecycle của đường lạnh theo từng trường trong bảy trường bằng chứng (`it.each`) lần lượt bị xuống cấp thành `corrupt`. Test list-agents của `tool-subagent-control` được cập nhật theo việc thu hẹp yêu cầu tải; `optional-session-query.spec.ts` bị xóa cùng phụ thuộc biến mất; snapshot không cần key sẵn có (`subagent-list-agents` v.v.) zero thay đổi, ghim đường khỏe mạnh trên wire và mặt hiển thị cho model không đổi; snapshot không cần key mới `subagent-diagnostic` (examples/headless-agent) ghim ánh xạ bốn trạng thái của phân loại diagnostic — các thay đổi hiển thị cho model như tàn tích thiếu descriptor thành dòng `corrupt`.

## Hệ quả

- Việc liệt kê của live child xuyên suốt zero log read; cold child khi cache không được gắn hoặc không hit thì mỗi lần liệt kê một lượt `inspect` đọc toàn bộ, chi phí tỷ lệ với kích thước transcript của nó, lặp lại theo tần suất liệt kê — định án là "tính xong thì dừng", không tự xây cache, không ghi ngược, đọc toàn bộ lặp lại trong thời gian ngắn cùng id có thể trúng LRU của giai đoạn chuẩn bị nhưng việc liệt kê không phụ thuộc vào nó.
- Danh sách subagent không còn yêu cầu query backend: deployment thuần live và không có persistence đều liệt kê được; `SUBAGENT_CONTROL_SESSION_QUERY_UNAVAILABLE` biến mất, việc tải plugin `list_agents` không còn yêu cầu `sessionQuery`.
- Việc diễn giải identity chỉ tồn tại ở một unit duy nhất đã đăng ký trong registry: bậc thang ba cấp của việc liệt kê và việc đọc lạnh của GUI history đều đi qua các cách đọc sẵn có của registry và cache (snapshot, cachedSnapshot, restore), không có việc gấp đường vòng nào khác; nếu sau này có mặt tiêu thụ nào đó vòng qua registry để tự viết tay việc gấp, giá trị ở các mặt đọc sẽ trôi dạt lệch nhau — đây là kỷ luật mà thiết kế này yêu cầu duy trì, không phải điều cơ chế đảm bảo.
- Cô lập theo-từng-child được khôi phục: đọc lạnh của một child đơn lẻ thất bại chỉ mất dòng đó, sibling khỏe mạnh không bị ảnh hưởng; persistence liệt kê thất bại vẫn khiến toàn bộ lượt liệt kê thất bại.
- Ngữ nghĩa chẩn đoán và liệt kê để lại sáu lệch chuẩn biên (identity tổ tiên hiện nhầm của fork chết non, lấy cái cuối khi nhiều descriptor, xung đột header không còn bị phát hiện, đọc nguồn hỏng chuyển từ `corrupt` sang `unavailable`, parent không rõ chuyển từ not-found sang danh sách rỗng, cửa sổ sự kiện muộn ở rung 2), ngữ nghĩa đầy đủ xem danh sách lệch chuẩn biên đã biết; bốn điểm đầu là lệch hiển thị hoặc phân loại của dữ liệu cấp tàn tích, một điểm parent không rõ là thay đổi ngữ nghĩa truy vấn âm thầm, một điểm cửa sổ rung 2 là lệch cung cấp giá trị cache có thể tự phục hồi dưới điều kiện kép hỏng cộng crash; việc xác thực restore đều không bị ảnh hưởng, được chấp nhận rõ ràng.
- Tồn kho trước #1569 không có `origin` không còn được công nhận là chủ sở hữu subagent; vốn dĩ nó cũng không vào catalog, lập trường pre-release không có cam kết tương thích.

## Liên quan

- [durable-subagent-catalog và list_agents](../feature/2026-07-22-durable-subagent-catalog-and-list-agents.md) — bị Note này thay thế một phần: descriptor vẫn là thẩm quyền bền vững và đầu vào gấp cho mode/label, việc liệt kê và lấy giá trị đổi thành hợp nhất tự quản cộng bậc thang projection.
- [session projections và log vòng đời lệnh](../../proposed/architecture/2026-07-27-session-projection-and-command-log.md) — thẩm quyền của quy ước registry; Note này thêm cho nó một unit identity `subagent`, và trở thành một instance tiêu thụ của hai cách đọc sẵn có snapshot/restore.
- [web subagent conversations](../feature/2026-07-27-web-subagent-conversations.md) — nguồn gốc của `SessionHeader.origin` (#1569), nửa đầu của việc loại bỏ log khỏi việc phán định identity; việc đọc lạnh history của nó (tiền tố inspect cộng gấp registry) là tiền lệ cùng kiểu cho bậc thang lấy giá trị của Note này.
- [giai đoạn chuẩn bị Session có thể tái sử dụng trước khi phát hành](2026-08-05-session-preparation.md) — việc đọc lạnh `inspect()` và tái sử dụng LRU; mô hình chi phí của việc đọc toàn bộ cold child được xây trên đó.
