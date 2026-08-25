# @deepseek-ai/dsh-session-persistence

[English](README.md) | Tiếng Việt

Lưu trữ session lâu bền là một năng lực seam. Service `SessionPersistence` trừu tượng (`ctx.sessionPersistence`) là Service Definition của nó. Nó yêu cầu backend lưu trữ phải lưu bền vững, tải lại và liệt kê session, nhưng không quy định triển khai lưu trữ cụ thể. Seam này dùng cách phân chia vai trò giống `dsh-shell` (xem [năng lực seam](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)): gói này đảm nhiệm Service Definition, các gói cùng cấp đảm nhiệm Service Provider, Consumer inject service này.

Đơn vị lưu trữ chính là `SessionEvent` hiện có (mô hình event sourcing: log là nguồn chân lý duy nhất), do đó không tồn tại một kiểu "tin nhắn lưu trữ" song song khác. Metadata không thuộc trạng thái hội thoại có thể replay (phiên bản định dạng, cwd, phả hệ, ranh giới seed, origin, độ sâu ủy quyền) được truyền riêng dưới dạng `SessionHeader`, kiểu này thuộc sở hữu của `dsh-session` và được re-export ở đây.

## API service (`ctx.sessionPersistence`)

| Phương thức | Quy ước |
|---|---|
| `locate(meta): SessionLocation \| undefined` | Giải quyết đích sản phẩm tuyệt đối cho mỗi session mà không thực hiện I/O hay thực thể hóa. Backend không có sản phẩm local độc lập trả về `undefined`. |
| `supportsRawArtifacts: boolean` | Nêu rõ backend có công khai một bản artifact nguyên văn cho mỗi session hay không. Consumer kiểm tra năng lực này trước khi gọi `readRaw`; `false` không có nghĩa là session bị thiếu. |
| `readRaw(id, signal?): Promise<SessionRawArtifact \| undefined>` | Đọc văn bản artifact nguyên văn của chính backend được hỗ trợ; chỉ giải mã mã hóa vật lý, không bao giờ tái tạo từ sự kiện. `undefined` chỉ có nghĩa là artifact được yêu cầu bị thiếu; backend không hỗ trợ sẽ từ chối. |
| `create(meta): Promise<void>` | Đăng ký metadata session mới. Có thể trì hoãn việc ghi vật lý đến lần `append` đầu tiên (thực thể hóa trễ). |
| `append(id, events): Promise<void>` | Lưu bền vững một batch. Chỉ nối thêm; sau bất kỳ lần sửa chữa nào, `seq` của sự kiện đầu tiên == next-seq đã lưu; dữ liệu không thể serialize JSON sẽ bị từ chối, kèm tên loại vi phạm. |
| `prepare(id, signal?): Promise<SessionPreparation>` | Giữ trước chính Session chưa publish được dùng để khôi phục. Bộ điều phối sẽ tái sử dụng kết quả kiểm tra trước đó nếu có thể, commit mọi việc khôi phục đang chờ, và giải phóng reservation chưa publish về cache có giới hạn khi dispose (giải phóng tài nguyên). |
| `load(id): Promise<{ meta; events }>` | Sau khi chuyển đổi bản ghi cũ được hỗ trợ trong cùng phiên bản định dạng, trả về log logic bất biến, cân bằng, và commit việc khôi phục nguội. Load thời gian thực flush snapshot của nó trước, và từ chối khi lượt đang mở; load nguội giữ lại lượt cuối bị gián đoạn, và đóng nó lâu bền bằng sự kiện tổng hợp `tool/result`/`step/end?`/`turn/end {interrupted}`. Chỉ loại bỏ mảnh đuôi bị rách. Bản ghi đã commit bị hỏng và bản ghi sai định dạng bị từ chối với `SessionPersistenceCorruptionError`; `version` định dạng không được hỗ trợ hoặc loại sự kiện mà bản build này không nhận ra và envelope không có cờ `ignorable` bị từ chối với `SessionFormatUnsupportedError`, thông báo nêu rõ hướng từ chối, và cung cấp đường dẫn log gốc khi backend giữ tệp riêng cho từng session. |
| `inspect(id, signal?): Promise<{ meta; events }>` | Trả về view logic đã nâng cấp, xác thực và deep-freeze, nhưng không commit việc khôi phục hay publish Session. View nguội nhận được closer khôi phục tổng hợp chỉ tồn tại trong bộ nhớ, đuôi bị rách vật lý giữ nguyên; view ở trạng thái thời gian thực là snapshot bất biến hiện tại, có thể chứa lượt đang mở. Triển khai dựa trên bộ điều phối sẽ giữ lại chính trạng thái nguội chưa publish đó trong LRU có giới hạn để dùng cho `prepare` sau này, nhưng sẽ loại bỏ và đọc lại khi revision đã lưu thay đổi. Kiểm tra cùng id dùng chung việc đọc đang diễn ra. |
| `readFrom(id, fromSeq, signal?): Promise<{ meta; events }>` | Trả về sự kiện đã lưu hợp lệ với `seq >= fromSeq`, không đi vào cache preparation, không cắt bớt, không tổng hợp closer, cũng không publish trạng thái bộ điều phối. `fromSeq` đạt hoặc vượt cuối đã lưu trả về danh sách sự kiện rỗng; `fromSeq` âm hoặc không phải số nguyên an toàn sẽ bị từ chối. Backend có thể định vị (SQLite) chỉ đọc phần đuôi, trừ khi việc chuyển đổi bản ghi cũ được hỗ trợ cần đọc bản ghi sớm hơn; backend tuần tự (JSONL) parse toàn bộ sản phẩm và bỏ qua về phía trước. Việc từ chối loại không xác định tuân theo cùng cách đọc: đọc định vị chỉ kiểm tra phần đuôi trả về, đường fallback tuần tự còn từ chối cả sự kiện bắt buộc không xác định dưới cửa sổ. Consumer cho checkpoint chỉ áp dụng sự kiện sau số thứ tự đã lưu. |
| `list(signal?): Promise<SessionHeader[]>` | Liệt kê nhẹ từ metadata, không parse toàn bộ log. Tín hiệu tùy chọn hủy công việc liệt kê của backend. Session thực thể hóa trễ với không sự kiện nào không xuất hiện trong `list`. |
| `listSnapshots(signal?): Promise<SessionPersistenceSnapshot[]>` | Trả về metadata nhẹ và một giá trị revision mang nhãn kiểu (branded), mờ (opaque) cho mỗi log, không tải log sự kiện. Revision giữ nguyên bằng nhau khi log và lưu trữ backend của nó không đổi; thay đổi sau append hoặc sửa chữa qua load có tính thay đổi; không xung đột chỉ vì hai kho lưu trữ dùng chung bộ đếm local. Tín hiệu tùy chọn yêu cầu hủy công việc phát hiện của backend; backend hạng nhất sẽ chờ mọi công việc liệt kê đã khởi động kết thúc trước khi từ chối, do đó khi lệnh gọi trả về từ chối, công việc liên quan đã dừng hẳn hoàn toàn. |

## Bất biến mỗi backend phải tuân thủ

- **Chỉ nối thêm; lượt bị sự cố sẽ được đóng, chứ không cắt bớt.** Sự kiện đã flush không bao giờ bị ghi lại. Sự cố có thể để lại lượt cuối chưa đóng, các sự kiện của nó là thật và có thể lớn; `load` giữ lại chúng, và nối thêm lâu bền closer tổng hợp (thêm một `tool/result` kèm lỗi phân loại rủi ro cho mỗi lệnh gọi assistant chưa được trả lời, sau đó thêm `step/end?`+`turn/end {interrupted}`) để cân bằng log, và đảm bảo lịch sử được tải lại vẫn là một transcript (bản ghi văn bản) hợp lệ cho nhà cung cấp. Chỉ loại bỏ mảnh đuôi bị rách chưa bao giờ được ghi hoàn chỉnh.
- **Seq liên tục.** `load` từ chối khoảng trống `seq`/lỗi phân tích giữa log; `seq` đầu tiên của `append` phải bằng next-seq đã lưu.
- **Dữ liệu có thể serialize JSON.** `append` thực thể hóa mỗi batch trực tiếp/replay qua ranh giới JSON không mất dữ liệu một lượt dùng chung. Sự kiện `Session` đang hoạt động đã được deep-freeze, nhưng bộ điều phối ghi vẫn sao chép mỗi sự kiện vào buffer riêng của lưu trữ lâu bền.
- **Tính lâu bền.** `append` chỉ trả về sau khi batch đã lâu bền.

## Bộ điều phối ghi

`PersistenceCoordinator` đảm nhiệm trạng thái và tuần tự hóa theo từng id, controller ghi có giới hạn riêng cho mỗi session đang hoạt động, thực thể hóa trễ, sửa chữa đuôi bị sự cố, tiếp quản session và dispose dừng hẳn hoàn toàn. Backend hạng nhất cấu thành một bộ điều phối, triển khai giao diện hook lưu trữ nhỏ `PersistenceBackend`, và ủy quyền các phương thức có trạng thái của nó. Nhờ đó JSONL và SQLite dùng chung tính đúng đắn vòng đời, trong khi vẫn giữ nguyên tố lưu trữ khác nhau; xem [Agent Note về bộ điều phối](../../../.agents/notes/implemented/architecture/2026-06-18-shared-persistence-write-coordinator.md), [đơn giản hóa flush controller](../../../.agents/notes/implemented/simplification/2026-07-23-collapse-persistence-flush-state.md) và [quyết định batch ghi có giới hạn](../../../.agents/notes/implemented/architecture/2026-08-08-bounded-session-persistence-write-batching.md).

Mỗi `session/event` sao chép sự kiện vào controller của session. Sự kiện đang chờ đầu tiên mở cửa sổ batch cố định; sự kiện sau đó tham gia vào batch nhưng không reset deadline. `writeBatchMaxDelayMs` đã cấu hình chỉ giới hạn khoảng chờ có chủ đích này, không giới hạn event loop, khởi tạo, thao tác tuần tự hóa hay độ trễ backend. Sự kiện được nhận trong khi ghi tạo thành một batch có giới hạn mới. `session/flush` hủy chờ, và đóng vai trò rào chắn dừng hẳn hoàn toàn dùng chung, giải phóng sự kiện được nhận trong khi rào chắn đang chạy. Lỗi ghi ở background chỉ ghi log một lần, giữ lại batch với thứ tự không đổi, và tạm dừng thử lại tự động; sự kiện mới mở cửa sổ cố định mới, còn flush tường minh hoặc tháo dỡ backend sẽ thử lại ngay lập tức, và phơi lỗi cho bên gọi nếu thất bại lần nữa.

Sửa chữa sự cố chỉ áp dụng cho trạng thái nguội. Với id có session đang hoạt động, `load(id)` chụp snapshot log trong bộ nhớ có thẩm quyền, chờ snapshot đó lâu bền, và chỉ trả về khi đã cân bằng; lượt mở trong session đang hoạt động sẽ bị từ chối, không nhận closer gián đoạn tổng hợp. Với id nguội, việc kiểm tra chỉ đọc, xác thực, đóng băng và dựng một Session chưa publish một lần; chỉ khi revision nguồn vẫn là hiện tại thì việc kiểm tra lặp lại mới tái sử dụng object graph đó. `prepare(id)` thực hiện cùng xác thực trước khi sửa chữa, giữ trước chính Session đó, commit mọi sửa chữa đuôi bị rách hoặc lượt bị gián đoạn đang chờ, và trả về nó để publish. Việc tiếp quản HMR (thay thế module nóng) đọc qua `loadStored`, áp dụng kiểm tra cwd của bộ điều phối, và không bao giờ đóng lượt đang hoạt động.

Đọc từ backend sẽ chuyển đổi bản ghi cũ được hỗ trợ rõ ràng trong cùng phiên bản định dạng trước khi xác thực bản ghi hiện tại. Tin nhắn trước cơ chế định danh tin nhắn nhận id xác định `legacy-message:<session-id>:<event-seq>`; việc thay thế nội dung kết quả tool kế thừa id sau khi nhập đích của nó. `turn/start` trước react-loop loại bỏ trigger đã lỗi thời, sự kiện steering (dẫn dắt giữa chừng) `steering/message` đã bị loại bỏ được chuyển thành `user/message` có định danh tương ứng; `turn/end` phiên bản cũ ánh xạ lý do kết thúc, nhưng không bịa ra bên gọi mà bản ghi cũ không ghi lại. Bộ điều phối dùng cùng view đã chuyển đổi này cho `load`, `inspect`, `readFrom`, việc nhận quyền sở hữu trạng thái vô chủ, và việc tiếp quản tiền tố HMR. Lưu trữ vẫn chỉ nối thêm: việc đọc không ghi lại bản ghi cũ, sự kiện được nối thêm sau đó dùng định dạng hiện tại. Đây là ngoại lệ nhập liệu có phạm vi giới hạn do các quyết định [tin nhắn trước cơ chế định danh](../../../.agents/notes/implemented/bug-fix/2026-07-28-load-pre-identity-session-messages.md) và [session trước react-loop](../../../.agents/notes/implemented/bug-fix/2026-08-04-load-pre-react-loop-sessions.md) quy định, không phải một cam kết migration v0 tổng quát.

Khi session đang hoạt động phát ra `session/disposed`, bộ điều phối chờ controller của nó, thực hiện drain cuối cùng theo cách tuần tự, sau đó giải phóng trạng thái do chính đối tượng `Session` đó sở hữu. Việc rút lui thất bại giữ controller lại trong map session đang hoạt động, để việc tháo dỡ backend có thể thử lại. Việc tháo dỡ backend dừng nhận sự kiện trước, flush từng controller còn lại, chờ thao tác theo từng id, và chỉ đóng handle lưu trữ sau cùng.

`locate` không có tác dụng phụ, `listSnapshots` nhẹ, và `readStoredRevision` theo id vẫn do backend đảm nhiệm, vì chúng mô tả cấu trúc lưu trữ và danh tính revision, chứ không phải điều phối ghi. `listSnapshots(signal?)` chuyển cùng tín hiệu do bên gọi truyền vào tới luồng phát hiện của backend, cho phép observer hủy mà không phải rời khỏi công việc đó.

Hook `PersistenceBackend<TornMarker>` (quy ước duy nhất giữa bộ điều phối và lưu trữ):

| Hook | Trách nhiệm |
|---|---|
| `name` | Nhãn backend cho `AggregateError` khi dispose thất bại. |
| `loadStored(id, signal?)` | Đọc tiền tố đã lưu theo id trên toàn bộ phạm vi lưu trữ. Dùng cho khôi phục/tải, inspect không sửa đổi, tiếp quản session đang hoạt động, và phát hiện xung đột create. Tín hiệu tùy chọn thuộc về việc đọc chỉ quan sát. Metadata trả về xác định `id`; `revision` xác định chính xác header và sự kiện trả về; `tornMarker` mờ chỉ tồn tại khi và chỉ khi phải cắt bớt đuôi bị rách. |
| `readStoredRevision(id, signal?)` | Đọc revision hiện tại giới hạn theo nguồn của một id mà không tải log sự kiện. Dùng biểu diễn revision giống `loadStored`; trả về `undefined` khi id không tồn tại. |
| `loadStoredFrom?(id, fromSeq, signal?)` | Việc đọc phần đuôi có thể định vị tùy chọn phục vụ `readFrom`: trả về header và sự kiện đã lưu với `seq >= fromSeq`, không sửa đổi, không đánh dấu rách. SQLite triển khai nó (`WHERE seq >= ?`); backend không triển khai dùng fallback của bộ điều phối — `loadStored` cộng bỏ qua về phía trước. |
| `appendBatch(meta, events, isMaterialized)` | Nối thêm lâu bền batch liên tục; thực thể hóa trễ nguyên tử khi chưa thực thể hóa. |
| `commitRepair(meta, tornMarker, closers)` | Làm cho việc sửa chữa sự cố lâu bền: cắt bớt đuôi bị rách (khi và chỉ khi `tornMarker !== undefined`; marker có thể falsy, ví dụ seq/offset `0`), và nối thêm `closers`. Không yêu cầu tính nguyên tử. Dùng bởi load (cắt bớt + closer) và tiếp quản session đang hoạt động (chỉ cắt bớt). |
| `list(signal?)` | Liệt kê toàn bộ metadata đã lưu, tuân theo tín hiệu hủy tùy chọn. |
| `close?()` | Tháo dỡ vòng đời tùy chọn (ví dụ đóng handle db), được chờ sau khi dispose drain xong. |

Bộ điều phối khẳng định id đã lưu, và so sánh cwd đã lưu/session đang hoạt động trước khi sửa chữa hoặc tiếp quản session đang hoạt động. Đường `inspect()` của nó nắm quyền sở hữu giá trị backend mới, chỉ xác thực và đóng băng một lần, và giữ lại nhiều nhất một số Session chưa publish theo cấu hình mà không gọi `commitRepair`. Chỉ khi revision của nguồn được giữ lại vẫn bằng `readStoredRevision` thì hệ thống mới tái sử dụng hoặc sửa chữa nó; nếu không, bộ điều phối sẽ đọc lại. Việc kiểm tra độ mới này không tăng thêm tính loại trừ ghi xuyên tiến trình. Thử lại revision chỉ hội tụ khi log lâu bền không đổi trong một lượt đọc và kiểm tra lại; việc ghi liên tục từ bên ngoài có thể làm chậm `load`, `inspect` hoặc `prepare`. `tornMarker` hoàn toàn mờ: bộ điều phối chỉ kiểm tra `!== undefined`, và chuyển nó nguyên trạng cho `commitRepair`, không bao giờ kiểm tra giá trị (backend JSONL dùng offset byte cần cắt bớt, backend SQLite dùng seq cần xóa). Backend bên thứ ba có thể triển khai trực tiếp service trừu tượng mà không dùng bộ điều phối, nhưng phải cung cấp cùng khả năng kiểm tra không sửa đổi và revision snapshot nhẹ đáng tin cậy. Chi tiết xem [Agent Note về bộ điều phối ghi](../../../.agents/notes/implemented/architecture/2026-06-18-shared-persistence-write-coordinator.md).

## Kiểu metadata và vị trí

Re-export từ `dsh-session`: `SessionHeader` (metadata session bất biến: `version`, `id`, `createdAt`, `cwd?`, `parentSession?`, `seedLength?`, `origin?`, `delegationDepth?`). `SessionLocation` là `{ readonly kind: string; readonly path: string }`; path của nó là đích backend tuyệt đối, không chứng minh sản phẩm đã tồn tại hay chứa lượt chưa flush.

## Trải nghiệm mô hình

### Lịch sử hội thoại đã khôi phục

#### Mô hình thấy gì

Seam này không thêm prompt hay schema. Việc khôi phục sẽ khôi phục sự kiện bề mặt đã lưu thành lịch sử tin nhắn; header request đã lưu tái tạo lời gọi trước đó, loop mới cấu thành system prompt, tool và tiền tố session hiện tại cho request tiếp theo. Sửa chữa sự cố đánh dấu request assistant không có lệnh gọi lâu bền là `TOOL_NOT_STARTED`; có lệnh gọi lâu bền nhưng không có kết quả sẽ trở thành `TOOL_OUTCOME_UNKNOWN`, văn bản của nó cho phép mô hình thử lại công việc chỉ đọc hoặc idempotent, nhưng yêu cầu xác minh tác dụng phụ hoặc hỏi người dùng, thay vì thử lại mù quáng.

#### Ảnh hưởng Token

Bằng không token trong quá trình lưu trữ lâu bền thông thường. Sau khôi phục, lượng token dùng cho lịch sử được giữ lại sẽ được tính lại, và lượng token cho envelope request hiện tại vẫn được tính như bình thường; mỗi lệnh gọi đã sửa chữa sẽ thêm một đoạn văn bản lỗi được giữ dưới dạng tham chiếu.

#### Ảnh hưởng KV Cache

Lưu trữ lâu bền không sửa đổi tiền tố request hiện tại. Chỉ khi lịch sử tái tạo, envelope hiện tại và tuyến mô hình khớp nhau thì loop khôi phục mới tái sử dụng được cache của nhà cung cấp; kết quả sửa chữa sau sự cố chỉ được nối thêm, không ghi lại lịch sử trước đó.

## Hạn chế đã biết và công việc hoãn lại

- **Không có giao diện xóa hay giữ lại**: cắt tỉa session đã lưu là bảo trì backend ngoài băng thông.
- **`list()` không phân trang và không lọc**: nó trả về header của mỗi session đã lưu; phù hợp với lưu trữ local, không có chỉ mục ở quy mô lớn.
- **Closer tổng hợp khi sửa chữa là phương án duy nhất cho sự cố**: backend phải tổng hợp closer `tool/result`/`step/end`/`turn/end` khi load; không có việc khôi phục lượt bị gián đoạn một phần mà tiếp tục chạy trước khi đóng nó.
