# dsh-session

[English](README.md) | 中文

Log phiên và kho lưu trữ trong bộ nhớ theo kiểu event-sourced. `Session` là nguồn sự thật chỉ-thêm (append-only) duy nhất cho toàn bộ lịch sử tương tác của agent (tác tử), lịch sử tin nhắn LLM (mô hình ngôn ngữ lớn) được *dẫn xuất* từ nó. Bên trên log gốc duy trì một tầng **surface** (hình chiếu có thứ tự sinh ra sự kiện tin nhắn), để dẫn xuất và compaction (nén) hiệu quả hơn.

Điểm vào phụ trợ tùy chọn `@deepseek-ai/dsh-session/invariant` đăng ký kiểm tra dấu vết quan hệ của gói này vào `ctx.invariants`: số thứ tự tăng đơn điệu, lượt/bước đóng, và cặp lệnh gọi/kết quả công cụ trong cùng một bước. Khi load hoặc reload, nó sẽ replay phiên hiện có; việc xác thực kho lưu trữ, snapshot, đóng băng, xác thực sự kiện nguồn được tham chiếu và việc nhận vào surface vẫn luôn do gói phiên gốc chịu trách nhiệm.

## Service: `SessionStore` (ctx key: `sessions`)

Tạo và giữ instance `Session` event-sourced. Ở đây cố tình không triển khai persistence: plugin đăng ký `session/event`, flush khi `session/flush`, và có thể phản chiếu vòng đời `session/created`/`session/disposed` theo cặp.

### API công khai

- `ctx.sessions.create(id?, { seed?, meta? }?)` xác thực seed/header bền vững và sinh bản sao tách rời, bổ sung version và id, dùng thời gian hiện tại khi chưa cung cấp `createdAt`, công bố phiên và gắn nó vào fiber gọi. Việc tái tạo bền vững sẽ cung cấp `createdAt`, `seedLength` và `delegationDepth` nguyên gốc.
- `ctx.sessions.flush(session)` phân phối một checkpoint bền vững song song cần chờ hoàn thành qua phạm vi mà phiên bắt giữ. Mỗi listener đều khởi động; lệnh gọi chờ tất cả kết thúc trước khi báo cáo lỗi. Đối tượng chưa công bố, đã tách rời và cũ sẽ bị từ chối.
- `ctx.sessions.fork(source, boundary?, childSessionId?): Session`: giải quyết đối tượng phiên thời gian thực hoặc id, chọn seed tính đến (bao gồm) số thứ tự sự kiện `boundary` (mặc định là sự kiện cuối cùng hiện tại), yêu cầu tiền tố đã chọn không có lượt mở khi kết thúc, rồi tạo phiên con thời gian thực với metadata dòng dõi.
- `ctx.sessions.get(id: SessionId): Session | undefined`
- `ctx.sessions.list(): Session[]`

#### Nâng cao: nguyên thủy vòng đời dọn dẹp có thứ tự

Chỉ dùng vòng đời tách rời khi việc dọn dẹp phải xếp thứ tự với một tài nguyên khác:

- `prepare(id?, options?)` xác thực và xây dựng, nhưng không công bố.
- `enter(session)` thực hiện kiểm tra xung đột, công bố mà không thông báo, và trả về hàm tách rời idempotent gắn với mục đó. Cho phép chuẩn bị đồng thời cùng một id, nhưng chỉ một mục có thể vào thành công; hàm tách rời cũ không thể gỡ bản thay thế của nó.
- `announce(session)` phát đúng một lần cạnh tạo, và từ chối thông báo lặp hoặc tái nhập. Yêu cầu tách rời trong lần phân phối đó sẽ được trì hoãn, sau đó mới phát cạnh giải phóng theo cặp; mục chưa thông báo sẽ không phát bất kỳ cạnh vòng đời nào.

`dsh-agent-loop` dùng cách tách này để đảm bảo flush cuối cùng của vòng lặp diễn ra trước khi phiên tách rời; xem chi tiết trong [Agent Note quyền sở hữu](../../../.agents/notes/implemented/architecture/2026-06-18-agent-lifecycle-and-ownership-contracts.md).

### Sự kiện service thời gian thực

Kho lưu trữ phiên ghép cặp việc tạo đã thông báo với việc giải phóng, phát thông báo chỉ-thêm sau khi commit và chứa lỗi theo từng listener, đồng thời cung cấp checkpoint bền vững cần chờ. Chữ ký chính xác và hành vi phạm vi xem khối sinh tự động trong [session.md](../../../docs/subsystems/session.md#cordis-surface); payload xem [danh mục persistence](../../../docs/persistence-catalog.md).

### Class: `Session`

Class thông thường (không phải service Cordis). Phiên đang hoạt động được tạo qua `ctx.sessions.create()`, phiên replay hoặc kiểm tra ở trạng thái tách rời được tạo qua `Session.create()`; factory ở trạng thái tách rời không phát sự kiện vòng đời, cũng không gắn phiên vào fiber.

- `session.append(type, data, opts?)` sẽ tạo snapshot và đóng băng dữ liệu bền vững cùng metadata surface, xác thực hình thái đánh dấu, seq sự kiện nguồn được tham chiếu, tính toàn vẹn của việc ghi đè thay thế, và chỉ việc viết lại `tool/result` một lần chỉ sửa nội dung, sau đó commit đồng bộ, rồi thông báo bên quan sát với việc chứa lỗi độc lập lẫn nhau. Việc append tái nhập trên phiên đã gắn kết sẽ bị từ chối, kiểm tra thời gian chạy cũng bao trùm union type mở rộng và log đã load.
- `session.deriveMessages()` chỉ hình chiếu tăng dần một lần cho mỗi mục surface mới, và trả về một mảng mới chứa tin nhắn đầy đủ, có định danh và đóng băng mà các mục đó lưu trữ. Nguồn model của tin nhắn assistant giữ lại provider và model đã sinh ra tin nhắn đó, cùng trạng thái replay riêng của adapter. Việc viết lại surface sẽ tái tạo hình chiếu; không có cơ chế quay lại log gốc.
- `session.deriveEventMessage(event)` là hình chiếu theo từng sự kiện chuẩn tắc dùng cho việc tái tạo và kiểm tra request.
- `session.surface` công khai view `SessionSurface` chỉ đọc, do bộ quản lý surface tăng dần duy nhất của phiên sở hữu; `replaceGeneration` thay đổi mỗi khi có commit viết lại.
- `session.events` là snapshot đóng băng được cache và làm mất hiệu lực theo append; sự kiện đã chấp nhận giữ trạng thái đóng băng sâu.
- `session.seq`, `session.id`: số thứ tự hiện tại và danh tính có kiểu chỉ đọc.
- `session.header: SessionHeader`: metadata tạo tách rời, đóng băng sâu (`version`, `id`, `createdAt`, cùng `cwd`/`parentSession`/`seedLength`/`delegationDepth` tùy chọn). Lúc xây dựng sẽ xác thực bản ghi bền vững, và yêu cầu id trong đó khớp với `session.id`.

### Tiện ích JSON không mất mát

Giá trị bền vững cần một cách biểu diễn đã được chấp nhận, không thể kiểm tra rồi đọc lại lần hai. `isJsonValue(value)` là hàm phán đoán boolean; `snapshotJsonValue(value)` xác thực và sao chép giá trị thông thường trong một lượt lặp, input không hợp lệ trả về `undefined`, lỗi từ getter sẽ lan truyền ra ngoài. Hàm phụ trợ snapshot chấp nhận số JSON hữu hạn ngoại trừ `-0` (JSON sẽ viết lại nó thành `0`), mảng thông thường dày đặc, object thông thường hoặc object có prototype null; nó từ chối tham chiếu vòng, số vô hướng không được hỗ trợ và prototype đặc biệt trước khi chuẩn hóa, đồng thời không áp giới hạn độ sâu ngăn xếp gọi hàm.

Việc import sự kiện phiên tách riêng quyền sở hữu khỏi việc xác thực tin nhắn. `snapshotSessionEvent(event)` clone sự kiện đã mượn trước, rồi xác thực và đóng băng tin nhắn có định danh bên trong. `adoptSessionEvent(event)` thực hiện xử lý tin nhắn tương tự tại chỗ (in-place) và trả về sự kiện gốc; bên gọi chỉ được dùng hàm này khi chuyển giao đồ thị đối tượng độc quyền, và đồ thị đối tượng đó không chia sẻ đối tượng con có thể thay đổi với sự kiện khác.

### Codec kho lưu trữ hàng dạng phân đoạn (`chunk-rows.ts`)

[Codec kho lưu trữ](src/chunk-rows.ts) dùng chung chuyển đổi không mất mát giữa chuỗi sự kiện và hàng gọn nhẹ. Nó giữ nguyên từng chữ các sự kiện không nhận diện được, và từ chối hàng được mã hóa sai hình thái; backend persistence quyết định có bật ghi đóng gói (packed write) hay không.

### Kiểu Surface

Gói này sở hữu hình chiếu surface có thứ tự, xác thực thay thế, replay, và type guard phân biệt sự kiện nguồn append với sự kiện thay thế. [Danh mục kiểu surface](../../../docs/subsystems/session.md#surface-types) sở hữu hình dạng chính xác và ngữ nghĩa trường. Transcript (bản ghi văn bản) hướng đến con người phải hình chiếu sự kiện nguồn append, chứ không phải `session.surface`, vì việc thay thế đã áp dụng sẽ che phủ lịch sử mà người đọc đã thấy; bên tiêu thụ hướng đến model tiếp tục đọc `session.surface`.

### Tái tạo request header (`request-header.ts`)

`request/header` ghi lại snapshot chuẩn hóa đầy đủ của việc đóng gói request phi-lịch sử, với lý do `initial`, `resume` hoặc `change`. Bản đồ `adapterDefaults` tùy chọn của nó đánh dấu giá trị `reasoningEffort` hoặc `maxTokens` có hiệu lực được điền bởi việc phân giải model chính xác, để đề xuất request tiếp theo có thể phân biệt chúng với thiết lập hội thoại tường minh. `foldRequestHeader()` chọn snapshot mới nhất; sự kiện gia tăng phiên bản cũ và lý do `fallback` đã bị gỡ bỏ sẽ bị từ chối. Xem chi tiết trong [Agent Note request có thể tái tạo](../../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md).

`user/message` lưu trực tiếp `UserMessage` đầy đủ, bao gồm định danh được tạo trước khi định tuyến inbox hoặc vào bước. Bất kể là prompt trực tiếp của người, injection tổng hợp, hay Goal Round đã vào, nó đều trình bày nguyên trạng `content`; `source` có kiểu là kênh duy nhất phân biệt ba loại này, và mang theo sự kiện bền vững riêng của từng lĩnh vực. `assistant/message` và `tool/result` cũng lưu trữ giá trị tin nhắn đầy đủ. Việc thực thi lượt vẫn được bao bởi `turn/start` và `turn/end`; `agent.inject()` xếp hàng input cho đến khi một pre-step sau đó nhận nó, và trả về nó trong quyết định enter.

`tool/result` lưu bền vững một tin nhắn kết quả công cụ có định danh, vai trò user, cùng định danh lỗi nội bộ tùy chọn và metadata trình bày tùy chọn. `value` chuẩn tắc khi công cụ thành công và thông điệp lỗi chuẩn tắc dễ đọc cho con người chỉ tồn tại cục bộ tại thời điểm thực thi; nội dung lỗi đã render là tin nhắn có thẩm quyền khi replay.

### Từ vựng sự kiện phiên (`types.ts`)

[Danh mục sự kiện log persistence](../../../docs/persistence-catalog.md) được sinh tự động liệt kê từng thành viên loại sự kiện log chỉ-thêm, payload, đánh dấu surface và vị trí khai báo. Việc ghi sổ token đọc bản ghi `assistant/chunk { type: 'usage' }` của mỗi bước; nếu không có phân đoạn usage, sẽ dùng `assistant/message.usage` làm phương án dự phòng cho bước đã commit. Lần thử request model thất bại không có tin nhắn assistant. Mỗi `assistant/message` đều ghi lại provider, model và trạng thái replay tùy chọn.

`SessionEventMap` có thể mở rộng qua merge: plugin dùng declaration merging để thêm kiểu riêng (`compaction/*` của compaction seam, `llm/retry` phi-surface của việc khôi phục có giới hạn, `hook/*` của lớp cầu nối hook); thành viên gộp sẽ xuất hiện trong cùng danh mục. Plugin sở hữu bất biến quan hệ cho sự kiện gộp của mình, kể cả việc sự kiện chỉ-log thuần có được phép xuất hiện giữa các lượt hay không. Bên sinh ra cần persistence sẽ append qua `Session`, rồi chờ `ctx.sessions.flush(session)`, không cần bịa ra một lượt thực thi.

Gói này còn định nghĩa `TurnEndReasonMap`, tức union type có thể mở rộng qua merge, gắn nhãn bằng `kind`, dùng cho việc kết thúc lượt. `turn/start` chỉ mang số thứ tự lượt; lô `user/message` đã vào sau đó ghi lại input của nó, còn `llm/retry` ghi lại việc khôi phục request.

Lượt thời gian thực bị gián đoạn kết thúc bằng `{ kind: 'aborted', reason: AgentCancelCause }`, giữ lại lý do hủy có kiểu trong transcript bền vững. Persistence sẽ import kết quả hủy thô trong định dạng cũ được hỗ trợ thành `{ kind: 'aborted', reason: { kind: 'legacy' } }`, vì bản ghi đó không giữ lại bên gọi. Lượt thất bại mang `{ kind: 'error', error }`; chỉ việc khôi phục sau crash mới tổng hợp `{ kind: 'interrupted' }`.

Mỗi `SessionEvent` có ba trường cấp cao nhất tùy chọn (metadata cấu trúc):

- `sourceEventSeqs?: number[]`: seq sự kiện sớm hơn được tham chiếu làm nguồn (ví dụ seq `assistant/chunk` mà `assistant/message` tham chiếu, hoặc mục thay thế compaction tham chiếu mục đã bị che phủ). Với `assistant/message`, sự tồn tại của `[]` biểu thị stream provider đã biết là rỗng; bỏ qua nghĩa là sự kiện cũ hoặc bên ngoài không ghi lại stream nguồn. Sự kiện surface khác nếu có trường này thì yêu cầu danh sách không rỗng.
- `surfaceOp?: SurfaceOp`: cách sự kiện đi vào surface. Sự kiện phi-surface (ranh giới, phân đoạn, usage, lỗi) không chứa trường này.
- `ignorable?: true`: đánh dấu bên đọc có thể an toàn bỏ qua sự kiện khi không nhận diện được loại sự kiện; thiếu trường này nghĩa là bắt buộc, loại sự kiện không nhận diện được sẽ khiến việc tái tạo phiên bị từ chối ([cơ chế](../../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md)).

### Kiểu metadata (`types.ts`)

- `SessionHeader`: metadata phiên, được ghi một lần khi công bố thành `Session.header`; trạng thái tách rời và đóng băng sâu đảm bảo bất biến tại thời điểm chạy: `{ version, id, createdAt, cwd?, parentSession?, seedLength?, delegationDepth? }`. Persistence loader có thể trả về bản sao tách rời có thể thay đổi của cùng kiểu dữ liệu. Kiểu này cùng `SessionId` thuộc về gói này, vì `Session.header` dùng nó làm kiểu; backend persistence chỉ re-export chứ không sở hữu nó, nếu không sẽ hình thành phụ thuộc vòng giữa các gói.

### Điểm mở rộng

- Plugin persistence: đăng ký `session/event` (ghi trì hoãn), và xả (drain) khi `session/flush` (cần chờ) cùng fiber dispose (giải phóng tài nguyên). Backend bền vững đọc log và reload vào phiên thời gian thực; các backend này lưu ước định metadata (`SessionHeader`, `session.header`) cùng với log.
- Replay/fork: `create(id, { seed })` xác thực và đóng băng log định dạng hiện tại liên tục, rồi tái tạo surface; request header phải chứa provider/model, tin nhắn assistant phải chứa thông tin nguồn gốc provider/model. Tầng persistence chịu trách nhiệm xử lý tương thích khi đọc trước khi xây dựng seed định dạng hiện tại đó. `fork(source, boundary?, childSessionId?)` chọn tiền tố lượt đã hoàn thành và ghi lại dòng dõi.
- Compaction: `dsh-compaction-basic` append một `user/message` thay thế cho checkpoint tóm tắt, còn `dsh-compaction-tool-result-pruner` append một `tool/result` thay thế chỉ sửa nội dung. Chính sách ranh giới ghép cặp công cụ và cache của nó thuộc về [`dsh-compaction` seam](../../compaction/compaction/README.md); gói này sở hữu tư cách thành viên surface có thứ tự, xác thực thay thế và `replaceGeneration`.

## Trải nghiệm model

### Lịch sử tin nhắn dẫn xuất

#### Model nhìn thấy gì

Model nhận nguyên trạng tin nhắn đầy đủ từ mục surface `user/message`, `assistant/message` và `tool/result`. Định danh, vai trò, nguồn gốc và khối nội dung của chúng đều giống giá trị được xác định lúc tạo; hình chiếu không sinh ra định danh. Việc đóng gói prompt chỉ thay đổi cách trình bày hướng đến người; ngữ cảnh tiền tố và dấu phân cách request đã nằm trong nội dung sự kiện. Lệnh gọi công cụ nằm trong tin nhắn assistant. Phân đoạn, ranh giới, usage, bản ghi hook, bản ghi todo và các sự kiện chỉ-log khác không thêm tin nhắn.

#### Ảnh hưởng Token

Mục surface được append sẽ được gửi lại ở các bước tiếp theo. Thao tác surface `replace` sẽ gỡ mục bị che phủ khỏi input tương lai, nhưng không xóa bản ghi log gốc của nó.

#### Ảnh hưởng KV Cache

Mục surface được append giữ nguyên tiền tố có thể tái sử dụng. Ngay cả khi log sự kiện bên dưới vẫn chỉ-thêm, thao tác `replace` cũng sẽ làm mất hiệu lực khả năng tái sử dụng cache kể từ tin nhắn bị che phủ đầu tiên.

### Kết quả sửa chữa sau crash

#### Model nhìn thấy gì

Nếu việc khôi phục phát hiện yêu cầu công cụ của assistant không có `tool/call` bền vững, kết quả tổng hợp `TOOL_NOT_STARTED` của nó có nội dung `The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.`. Nếu `tool/call` bền vững không có kết quả, kết quả `TOOL_OUTCOME_UNKNOWN` của nó có nội dung `The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.`.

#### Ảnh hưởng Token

Gia tăng token cho phiên không hư hại là bằng không. Khi khôi phục, mỗi lệnh gọi được sửa chữa sẽ thêm văn bản lỗi được giữ lại, dành riêng cho rủi ro cụ thể.

#### Ảnh hưởng KV Cache

Giữ chỉ-thêm; nội dung hiển thị mới nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực mục KV Cache hiện có.

### Request header đã ghi lại

#### Model nhìn thấy gì

Phiên sẽ tái tạo system prompt, schema công cụ, cấu hình lệnh gọi và tiền tố phiên mà vòng lặp thực sự đã gửi. Sự kiện request header không thêm bản sao thứ hai vào lịch sử tin nhắn; tiền tố được đặt trước bên ngoài `deriveMessages()`.

#### Ảnh hưởng Token

Việc ghi log không sinh ra token trùng lặp. Tiền tố, văn bản system và schema được tái tạo vẫn sinh ra chi phí bình thường theo từng request.

#### Ảnh hưởng KV Cache

Ghi log không gây mất hiệu lực, việc tái tạo chính xác giữ tiền tố request nhất quán. Nếu request header sau đó thay đổi tiền tố, prompt hoặc schema, có thể làm mất hiệu lực khả năng tái sử dụng kể từ chỗ khác biệt đầu tiên.

## Hạn chế đã biết và việc còn hoãn lại

- **Cấu trúc nhánh/cây phiên** (kiểu cây mục pi): hoãn lại trừ khi cần vượt ra ngoài năng lực `fork()` dựa trên ranh giới.
- **`fork()` chỉ cắt tại ranh giới ổn định của phiên thời gian thực**: tiền tố đã chọn khi kết thúc không được có lượt mở, và phiên nguồn phải nằm trong kho lưu trữ; [fork API](../../../.agents/notes/implemented/feature/2026-06-30-session-store-fork-api.md) không hỗ trợ fork một phiên đã bền vững nhưng chưa được load.
- **`SESSION_FORMAT_VERSION` cố định là `0`**: giai đoạn trước phát hành không cam kết tính tương thích rộng rãi; `Session` chỉ chấp nhận hình dạng seed hiện tại, backend từ chối mọi phiên bản khác và nêu rõ hướng (phiên bản mới hơn báo "được ghi bởi harness mới hơn, hãy nâng cấp"; phiên bản cũ hơn nêu rõ chưa có đường nâng cấp). Loại sự kiện không nhận diện được cũng bị từ chối, trừ khi envelope có đánh dấu `ignorable`; cơ chế phiên bản xem [Agent Note cơ chế phiên bản session-log](../../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md). Việc nâng cấp import kho lưu trữ có phạm vi giới hạn nên do ranh giới persistence chịu trách nhiệm ([chính sách](../../../AGENTS.md), [khôi phục tin nhắn trước khi có cơ chế định danh tin nhắn](../../../.agents/notes/implemented/bug-fix/2026-07-28-load-pre-identity-session-messages.md)).
- **`TurnEndReasonMap` không chứa biến thể `refusal`/`max_turn_requests` được ACP (Agent Client Protocol) đặt tên**: bị ràng buộc bởi bên sinh ra; chỉ thêm khi adapter hoặc vòng lặp lần đầu sinh ra các biến thể này.
