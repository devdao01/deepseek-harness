# Agent Note: Web session là bản ghi hội thoại con người được chiếu theo thứ tự log

Status: implemented

[English](2026-07-30-web-transcript-log-ordered-projection.md) | 中文

## Problem

Web client dựng session từ surface model-visible: `FoldAdapter` chạy `SurfaceManager` cốt lõi trên cửa sổ lịch sử và đọc `surface.nodes`. Một lần compaction (nén) thành công sẽ thay thế một dải surface bằng một checkpoint node, nên ngay khi việc thay thế đó được áp dụng, Web stream gộp mọi message mà nó che khuất thành một dòng ngữ cảnh xám mờ — đó là hội thoại mà user đã đọc rồi. Không có gì mất trong log; lỗi hoàn toàn nằm ở tầng chiếu (projection), và [terminal cùng host gateway đã được sửa theo cùng cách](2026-07-29-human-transcript-append-origin.md), còn browser thì được để lại cho lần thay đổi này.

Thứ tự surface còn khiến hai vấn đề khác trở thành vấn đề mang tính cấu trúc. Sau một lần thay thế, thứ tự đó không còn tăng dần theo seq — `SurfaceManager` ghép checkpoint có seq cao vào đúng vị trí dải mà nó che khuất — nên các node chỉ-thuộc-log được gộp vào mảng đó theo seq số học (dòng lệnh slash, frozen node bị ngắt) có thể bị đẩy trước checkpoint, và không bao giờ còn có thể xen kẽ trở lại vào phần đuôi được giữ lại. Hơn nữa, vì phân trang không còn tiêu tốn hạn mức `maxMessages` cho bản sao replacement, một trang giờ có thể mang một checkpoint mà `surfaceOp.start` nằm ngoài cửa sổ; fold cốt lõi từ chối dải đó, nên `nodes()` lùi về một lượt quét tuyến tính khoan dung, in ra một `console.error`, và phát một cờ `foldDegraded` mô tả lỗi đó.

## Decision

`TranscriptAdapter` thay thế `FoldAdapter`, và không bao giờ truy vấn thứ tự surface. Nó chiếu cửa sổ gốc theo thứ tự log: mỗi surface event có nguồn append (`isAppendSurfaceEvent`) rơi vào đúng vị trí log của chính nó, cộng thêm một nhãn `CompactionSummaryNode` cho mỗi checkpoint compaction đã được áp dụng. Vì vậy một lần compaction đã áp dụng sẽ giữ lại đoạn hội thoại mà nó che khuất ở phía model, nhãn báo cáo model bắt đầu không nhìn thấy đoạn lịch sử đó từ đâu, thay vì xóa nó đi. Bản sao replacement chỉ model-visible không đi vào bản ghi: `tool/result` đã bị cắt và `assistant/message` được sinh lại chỉ viết lại một node cho model, không đánh dấu bất kỳ ranh giới nào trong hội thoại. Mọi thứ bắt buộc phải gửi đúng nội dung model nhìn thấy vẫn đọc surface; đây là bản chiếu cho con người, và giờ cả hai đã tách biệt trên cả hai frontend.

Thứ tự node vốn tự nhiên tăng đơn điệu theo seq, dẫn tới ba hệ quả. Cặp `command/run` / `command/done` chỉ-thuộc-log gộp thành `CommandNode`, được chèn theo seq vào một mảng vốn đã đơn điệu — không có mỏ neo, không sắp xếp lại. `Session` giữ quyền sở hữu của frozen node bị ngắt, gộp chúng bằng một lần sắp xếp thông thường theo seq điểm số của chúng, mà giờ đây trùng khớp với thứ tự stream. Cửa sổ mà checkpoint tham chiếu tới có dải bị che khuất nằm ngoài cửa sổ thì không có dải nào cần giải quyết, nên nhãn render bình thường và không in ra log nào.

`foldDegraded` biến mất khỏi `ConversationSnapshot`, kéo theo đó là các phần độn sentinel, phép toán `baseSeq` mà chúng cần, và `degradedSeqs()`. Chúng tồn tại chỉ để thỏa mãn assertion `seq === index` của fold cốt lõi và sống sót khi nó throw lỗi; fold mà chúng mô tả không còn chạy nữa. Xóa cờ này là một phần của việc sửa lỗi, chứ không phải dọn dẹp sau khi sửa — bản thân `degradedSeqs()` gần như đã là một bản chiếu theo thứ tự log, chỉ là nó tồn tại như điểm rơi sau khi throw lỗi, chứ không phải chủ đích ban đầu.

Văn bản tóm tắt của nhãn, số lượng mục đã bị thay thế, và số token ước tính bị che khuất, tất cả đều lấy từ event `compaction/summary` mà checkpoint tham chiếu tới, không bao giờ lấy từ payload checkpoint đã đóng khung — đó là phong bì chỉ thị viết cho model. Khi việc cắt cửa sổ để event đó nằm ngoài cửa sổ thì các field này không khả dụng, cùng kiểu giảm nhẹ mềm (soft fallback) như tool result không có lời gọi; trang tiếp theo bổ sung event đó sẽ giải quyết được các field này.

[Lệnh compaction thủ công](../feature/2026-07-30-queued-manual-compaction.md) trả về seq của summary event dưới dạng `CommandResult.sourceEventSeq` cho kết quả thành công, còn `command/done` thì lưu bền tham chiếu tùy chọn này. Chat chỉ ghép cặp lệnh thành công có tên `/compact` mà tham chiếu của nó khớp đúng với `CompactionSummaryNode.summaryEventSeq` của duy nhất một `CompactionSummaryNode` đã được load. Lệnh đang chạy trước tiên render thành `compact · Compacting context…`; sau khi checkpoint được áp dụng, cùng một React key sẽ render một mục mở rộng `compact` thu gọn tại đúng vị trí message stream của checkpoint, hiển thị số lượng mục và ước tính token. Khi input bị từ chối, không có lịch sử để nén, bị hủy, hoặc thất bại vẫn dùng dòng lệnh chung, giữ nguyên toàn bộ văn bản mà handler đã soạn. Compaction tự động không có tham chiếu lệnh, tiếp tục dùng nhãn "context đã nén" độc lập.

Việc tham chiếu event tường minh quan trọng vì compaction thủ công cho phép chèn ngữ cảnh bền trong lúc summary chạy bất đồng bộ: dòng lệnh và dòng checkpoint không đảm bảo nằm cạnh nhau. Event vòng đời lệnh thêm một field tùy chọn, nhưng transaction compaction, phong bì RPC, và surface model-visible đều không đổi; log bền pre-release không có field này tiếp tục dùng cách giảm nhẹ mềm hai dòng như trước, không cần migration.

## Nhận diện checkpoint: cùng một khai báo, được ghim tại thời điểm biên dịch

Việc nhận diện cần ba điều kiện đồng thời thỏa mãn, nhất quán với terminal: `event.type === 'user/message'`, nguồn plugin checkpoint từ khe hở compaction, **và** `isReplacementSurfaceEvent(event)`. Một `user/message` có nguồn plugin append là ngữ cảnh được chèn — thẻ tham chiếu chéo session — không phải compaction.

Cái mà chương trình `packages/client/*` không thể chạm tới là **root** của `dsh-compaction`, chứ không phải package này. Root đó chạm tới root của `dsh-session`, mà khai báo `Context` merge của cordis ở đó gộp `sessions: SessionStore` phía host, xung đột với `sessions: ISessions` phía client — `TS2717`, tức là quy tắc mỗi bên một program trong [development.md](../../../../docs/development.md#typescript-project-layout); điều này vẫn đúng ngay cả với type-only import, vì xung đột này là fact của compiler chứ không phải của bundler.

Câu trả lời có sẵn của repo này cho tình huống đó là một leaf subpath không chứa cordis, và lần thay đổi này thêm một cái mới: `COMPACT_CHECKPOINT_SOURCE` và `isCompactCheckpointSource` giờ nằm ở `packages/compaction/compaction/src/checkpoint.ts`, nó không import cordis, cũng không augment module nào (tức là hình dạng của `dsh-commands/brand` / `dsh-llm/message`), còn package root thì re-export cả hai, nên mỗi bên tiêu thụ phía host — chat helper của terminal, bản chiếu của `dsh-session-reference` — đều không cần thay đổi. Adapter ghim literal của nó vào khai báo đó bằng type-only import:

```ts
import type { CompactionCheckpointSource } from '@deepseek-ai/dsh-compaction/checkpoint'
const COMPACT_PLUGIN: CompactionCheckpointSource['plugin'] = 'compact'
```

Đổi tên plugin id của Service Definition giờ sẽ gây lỗi biên dịch ở client: `TS2322: Type '"compact"' is not assignable to type '"compaction"'`. Import này bắt buộc phải giữ **type-only** — bất kỳ value import nào từ package `@deepseek-ai` mà không phải platform module cũng không phải wire layer inline-safe đều sẽ bị cổng kiểm tra độ tinh khiết của client (`packages/client/tsdown.client.ts`) từ chối, và chính thông báo lỗi của nó ghi lại rằng type-only import sẽ bị xóa (erased) và không bao giờ chạm tới cổng đó. Type-only leaf import cũng cần một mục `paths` trong `tsconfig.base.json` và `{"path": "../../compaction/compaction"}` trong `references` của `packages/client/runtime/tsconfig.json`: quy tắc `rootDir` của composite vẫn áp dụng cho các import bị xóa, và chẩn đoán khi thiếu reference đó là `TS6059`/`TS6307`.

`packages/client/ui-conversation/tests/conversation-node-definitions.client.spec.ts` là nửa còn lại về hành vi, dùng checkpoint và bản ghi nguồn gốc để lái Definition compaction, và chứng minh rằng trang cũ được load sau đó có thể bổ sung dữ liệu summary còn thiếu. Definition chỉ type-only import leaf path này, giữ cho client tiếp tục cách ly khỏi package root của compact và khỏi việc merge `Context` phía host mà nó có thể chạm tới thông qua root đó.

Do đó khác biệt với terminal là rất hẹp: cả hai frontend đều nhận diện checkpoint từ cùng một khai báo — terminal value-import `isCompactCheckpointSource` ở phía host (nơi không cổng nào áp dụng), client thì ghim type.

## Vì sao mỏ neo vị trí của #835 tồn tại, và vì sao nó bị hòa tan chứ không phải bị mất

Nhánh compaction thủ công dạng hàng đợi chưa được merge sửa cùng một lỗi xen kẽ đó theo một cách khác: ghi một mỏ neo cho mỗi event — đuôi surface tại thời điểm append — và chuyển hướng mỏ neo bị che khuất sang checkpoint. Cơ chế này tồn tại để mỏ neo vị trí sống sót qua việc **sắp xếp lại** surface. Bản ghi hội thoại con người không bao giờ bị sắp xếp lại, nên mỏ neo không có gì cần chuyển hướng: tiền đề bị loại bỏ, còn cách sửa không bị vứt bỏ. Cơ chế này không tồn tại trong codebase này.

## Alternatives considered

**Value-import predicate này từ leaf mới**, và thêm `dsh-compaction` vào whitelist `INLINE_SAFE` của client. Từ chối: cái client cần là plugin id, không phải predicate — một type là đủ, và import bị xóa vốn dĩ không bao giờ chạm tới cổng độ tinh khiết, nên không cần mở gì cho nó cả. Whitelist chỉ có ý nghĩa với value import, và ở đó nó là một sự đánh đổi tồi: `INLINE_SAFE` khớp theo *tiền tố* của module specifier, nên mở package đó ra sẽ mở luôn cả root của nó — nơi import cordis.

**Một quy tắc thuần dựa trên hình dạng** — bất kỳ `user/message` dạng replacement nào cũng là compaction. Từ chối: điều đó đúng hôm nay chỉ vì compaction là bên sản sinh duy nhất của `user/message` dạng replacement, một khi điều này thay đổi thì không có cơ chế nào bắt được nữa. Bài test pin đó chỉ tốn một file để loại bỏ chính xác rủi ro này.

**Đánh dấu checkpoint ở phía host**, qua projection hoặc wire protocol. Từ chối: cách này hợp với quy tắc "phối hợp qua cordis service" nhất, nhưng client hiện đang gộp `SessionEvent` gốc, nên điều này đồng nghĩa với thay đổi thỏa thuận wire protocol — cái giá phải trả không tương xứng cho một predicate thuần túy.

**Chuyển quyền sở hữu frozen node vào adapter** (`nodes(extraNodes)`), như nhánh chưa merge kia đã làm. Từ chối: node bị ngắt đến từ việc quét dọn `turn/end` mà `Session` đã chạy trên cửa sổ, và trên một bản ghi đơn điệu theo seq, hình thức đơn giản chính là đúng — adapter trả về node, session gộp frozen node theo seq. Mở rộng chữ ký adapter không đổi được gì, còn tách rời việc quét dọn khỏi sản phẩm của nó.

**Giữ `foldDegraded` như một cờ phòng thủ.** Từ chối: nó mô tả một lỗi cụ thể của một fold không còn chạy nữa. Một cờ mà bên tiêu thụ không thể hành động dựa vào, chỉ có thể chạm tới qua `console.error`, là một thỏa thuận giả.

**Ghép cặp dòng `/compact` gần nhất với checkpoint kế tiếp.** Từ chối: giữa hai thứ đó có thể rơi vào việc chèn ngữ cảnh, và bản ghi vòng đời chạy đồng thời hoặc sai định dạng cũng phải giảm cấp mà không lấy nhầm checkpoint khác. Kết quả lệnh thì chỉ đích danh event summary có thẩm quyền; khi tham chiếu mơ hồ thì không ghép cặp gì cả.

**Phân tích số lượng mục và số token từ văn bản kết toán tiếng Anh.** Từ chối: văn bản của handler là văn bản trình bày, không phải thỏa thuận dữ liệu ổn định. Nhãn đọc trực tiếp payload `compaction/summary` có cấu trúc vốn đã giữ sẵn hai giá trị đó.

## Consequences

Compaction không còn xóa lịch sử Web; một session bị nén nhiều lần hiển thị theo thứ tự log, mỗi lần compaction đã áp dụng một nhãn, và cùng một cửa sổ render giống hệt nhau ở thời gian thực lẫn sau khi khôi phục nguội. Khoảng hở phân trang được đóng lại một cách có cấu trúc thay vì được phòng thủ, `ConversationSnapshot` mất đi một field đã publish, điều này chạm tới mười ba file.

`ConversationNode` thêm nhánh thứ tám, nên mỗi bên tiêu thụ vét cạn (exhaustive) có thêm một nhánh: `MessageItem` render nhãn qua `CompactionItem` mới, layout trajectory mở rộng nhánh "không cell" của nó để nhãn không đóng góp cell nhưng vẫn đẩy con trỏ thời gian đã tiêu tốn.

Thỏa thuận hiệu năng không đổi, và giờ dễ diễn đạt hơn: một lần append hiện thực hóa một node, việc không đổi bất kỳ node nào giữ nguyên tham chiếu mảng của lần trước — nên cơn bão phân mảnh (sharding) tốn chi phí bằng không, `nodes()` thậm chí không tính lại — các node không đổi vẫn giữ nguyên identity đối tượng của chúng. Cửa sổ vẫn tăng theo độ dài session chứ không theo surface, đây chính là sự đánh đổi mà lần sửa này tồn tại để thực hiện; một lần compaction trong quá khứ giới hạn đúng quy mô chiếu cho các session dài mà nó phục vụ.

Kịch bản Web e2e giờ gieo (seed) một vòng đời lệnh thủ công thật xoay quanh transaction compaction mà nó ghi lại trên chính turn đó, nên baseline aria được cố định toàn bộ hành vi qua host thật và browser thật: câu hỏi đã ghi và toàn bộ output của tool vẫn còn trên màn hình, ngay sau đó đúng một dòng `compact` báo cáo quy mô, mở rộng ra sẽ hiển thị summary chính xác. Bản ghi (recording) tự nó không bị đụng vào, giữ nguyên tính chân thực của model — replay suy ra compaction thủ công từ chính surface của bản ghi.

## Deferred

[Quyết định về hiển thị tiến trình compaction đã lưu trữ](../../archived/feature/2026-07-30-compaction-progress-visibility.md) của terminal dùng nhãn độc lập thời gian thực để điều khiển một chỉ báo đơn ô, và không thay đổi bản chiếu Web này.
