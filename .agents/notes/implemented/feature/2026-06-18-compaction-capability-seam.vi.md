# Agent Note: Nén (compaction) như một capability seam (giao ước trừu tượng + backend cơ bản)

Status: implemented

[English](2026-06-18-compaction-capability-seam.md) | Tiếng Việt

## Vấn đề

Hội thoại của agent chạy dài sẽ tăng trưởng vô hạn. Khi event log tích lũy thêm lượt, lịch sử tin nhắn phái sinh cuối cùng sẽ tiệm cận cửa sổ ngữ cảnh của model, và model dừng sinh giữa chừng phản hồi (`max-tokens`), hoặc suy giảm chất lượng. **Nén ngữ cảnh (context compaction)** là biện pháp giảm nhẹ cho việc này: thay một mảng lịch sử cũ hơn bằng một bản tóm tắt ngắn gọn, giữ nguyên vẹn ngữ cảnh gần đây.

[Bề mặt session](../architecture/2026-06-18-session-surface.md) chính là hạ tầng được xây cho mục đích này: một phép chiếu có thứ tự dựng trên event log, kèm thao tác `surfaceOp: { op: 'replace', start, end }` được thiết kế riêng để che một dải mục và chèn nội dung thay thế, với `sourceEventSeqs` liệt kê từng event nguồn, cho phép replay xác minh rằng bản thay thế có tham chiếu tới mọi event mà nó gỡ bỏ. Phần còn lại là plugin *quyết định nén cái gì và tạo ra bản tóm tắt*.

Hai lực chi phối thiết kế. Thứ nhất, chiến lược nén và phép đo token tái dùng được biến đổi độc lập: phép đo thuộc về [service `ctx.tokenMeter`](../architecture/2026-07-15-replay-token-meter-service.md) của họ LLM (mô hình ngôn ngữ lớn), còn việc sinh tóm tắt có thể dùng lời gọi model, template hoặc service từ xa. Thứ hai, `SurfaceEventType` là tập đóng gồm các loại event sinh ra tin nhắn (`user/message`, `assistant/message`, `tool/result`); chỉ những loại này mới mang được `surfaceOp`. Do đó một event `compaction/*` chuyên biệt **không thể** xuất hiện trên surface, và cả compiler lẫn ranh giới append/seed luôn bật của Session đều từ chối gắn `surfaceOp` lên nó.

## Quyết định

### Nén là một capability seam, với vai trò Service Definition và Service Provider tách rời

Theo [Agent Note về capability seam](../architecture/2026-06-13-capability-seams.md), nén được phát hành thành các package riêng, để giao ước, thuật toán và (về sau) API phía consumer tiến hóa độc lập:

1. **Giao diện** — `@deepseek-ai/dsh-compaction`: `CompactionEngine` trừu tượng, sở hữu khóa `ctx.compaction`, từ vựng `CompactionResult`, các session event `compaction/*`, hệ phân loại thất bại thủ công và nguồn tin nhắn checkpoint chuẩn tắc. Nó khai báo `compactIfNeeded()`, `compactNow()` và `compactRegion()` là **phương thức trừu tượng** — giao ước nói nén *làm gì*, không nói *làm thế nào*.
2. **Hiện thực** — `@deepseek-ai/dsh-compaction-basic`: `BasicCompactionEngine` cụ thể, tiêu thụ `ctx.tokenMeter`, và sở hữu vòng duyệt giữ lại từ đuôi về đầu, việc sinh tóm tắt qua `ctx.llm.stream()`, phép thay thế surface, khóa, xử lý áp lực trước mỗi bước, cùng khôi phục tràn ngữ cảnh chuẩn tắc. `summarize()` là hook con duy nhất của nó; việc tính giá và replay vẫn thuộc về meter.
3. **Service đồng hành không cần model** — `@deepseek-ai/dsh-compaction-tool-result-pruner`: một service cụ thể, tùy chọn, viết lại các node `tool/result` hiện quá lớn trước khi backend chọn phạm vi tóm tắt. Nó không phải hiện thực nén thứ hai và cũng không hiện thực `CompactionEngine`.
4. **Consumer hướng người dùng** — `@deepseek-ai/dsh-command-compact` đăng ký `/compact` không tham số qua `ctx.commands`, và gọi thao tác `compactNow()` độc lập backend. Đây là lệnh cho người dùng điều khiển trực tiếp, không phải công cụ hướng model.

### Giao ước phụ thuộc `dsh-session` và `dsh-llm` — một sai lệch có chủ đích

Agent Note về capability seam quy định package Service Definition «chỉ phụ thuộc cordis» (đúng với `dsh-shell`, vì từ vựng của nó tự chứa). Nén **không thể** tuân thủ điều này: các động từ của nó tác động lên `Session` do agent sở hữu (`compactRegion(start, end, agent)`), và đầu ra của nó dùng từ vựng nội dung (`CompactionResult.summary: ContentBlock[]`). Không tham chiếu `Session`/`SessionEvent` (từ `dsh-session`) và `ContentBlock` (từ `dsh-llm`) thì không thể diễn đạt được giao ước.

Đây không phải mùi khớp nối, mà là lĩnh vực mà giao ước thuộc về. Nguyên tắc chỉ dẫn «chỉ cordis» xưa nay vẫn là cách viết tắt của «giao diện chỉ phụ thuộc những gì giao ước thực sự cần gọi tên, tuyệt đối không phụ thuộc hiện thực». Bản thân `dsh-session` và `dsh-llm` là package giao diện/từ vựng, không phải hiện thực; `dsh-compaction` vẫn không import bất kỳ backend nào. Bất biến thực sự của seam — *consumer và hiện thực tiến hóa độc lập sau lưng một service trừu tượng* — vẫn nguyên vẹn.

### Ba thao tác trừu tượng, thuật toán nằm ở backend

Đặt toàn bộ thuật toán (vòng duyệt giữ lại, cộng token, trích xuất văn bản) làm phương thức cụ thể trên giao diện sẽ khớp nối lại giao ước vào một chiến lược duy nhất: backend muốn chiến lược giữ lại khác hoặc thứ tự event khác sẽ phải chống chọi với mã cụ thể kế thừa. Đặt cả ba thao tác là trừu tượng sẽ đưa mọi quyết định *làm thế nào* về backend, và giữ giao diện thuần là lời khai báo *làm gì*. Phép đo token hoàn toàn không phải hook nén; service singleton cho phép nhiều consumer chia sẻ phép gấp replay theo từng session.

`compactIfNeeded(agent, trigger, signal)` nhận lý do kích hoạt tường minh `'pressure' | 'context-overflow'` và một signal hủy. Nó chỉ đọc request đã định tuyến được lưu bền mới nhất; không có header thì không làm gì, và mọi đích provider/model đã định tuyến đều dùng bộ ước lượng singleton. `compactNow(agent, signal)` yêu cầu agent ở trạng thái idle, và thực hiện một lần thu gọn cân bằng có hiệu lực ngay cả khi chưa đạt áp lực; trả về `null` khi không tồn tại phạm vi như vậy, và không ghi gì cả. `compactRegion(start, end, agent, signal?)` lấy `agent.session` làm danh tính session duy nhất, và giữ signal tùy chọn cho các caller tường minh. Bộ tóm tắt mặc định lần lượt phân giải đích từ cấu hình tường minh, đích đã định tuyến được ghi nhận gần nhất, rồi tới tùy chọn của agent, và ghi lại cặp provider/model sau mỗi lần định tuyến `llm/stream`. Nó phát lại tiền tố của request đã định tuyến và nối chỉ thị nén thành tin nhắn user ở đuôi, nhờ đó tái dùng KV Cache đang nóng của provider; xem [Agent Note về cache tiền tố tóm tắt](../bug-fix/2026-07-21-compaction-summary-prefix-cache-reuse.md). Kết quả mang `llmStreamCall: true`, vì khi sinh ra nó đã thực hiện đúng một lời gọi qua LLM service của ngữ cảnh này; lớp con chỉ đặt cờ đó khi thỏa cùng điều kiện, bởi chỉ riêng `rawOutput` được giữ lại thì không đủ để xác định đường gọi. Lời gọi này đặt `GenerateOptions.purpose` độc lập provider thành `compaction`; adapter có thể ánh xạ mục đích này thành metadata truyền tải ẩn với model, và adapter DeepSeek sẽ gửi `x-deepseek-harness-compact: 1`.

### Chạy kiểm tra áp lực tự động sau khi công việc bước bền vững thành công

Kiểm tra áp lực cho lời gọi thành công chạy ở `agent/pre-step` kế tiếp; lúc đó phản hồi trước, kết quả công cụ, ngữ cảnh đệm và steering (dẫn hướng giữa chừng) đã được lưu bền, còn request kế tiếp thì chưa được phái sinh. `dsh-compaction-basic` đo request đã ghi chuẩn tắc qua `ctx.tokenMeter`, nên request kế tiếp thấy được mọi bản thay thế mà không cần phong bì phủ suy đoán. Khi áp lực đạt điều kiện, phép viết lại tùy chọn `ctx.toolResultPruner` chạy trước khi chọn phạm vi tóm tắt; compaction-basic đo lại surface bền vững, và bỏ qua việc sinh tóm tắt nếu việc tỉa bớt đã đưa áp lực về mức an toàn.

Tràn ngữ cảnh chuẩn tắc từ provider đi theo đường khác. Bước thất bại được đóng trước, và `agent/request-error` nhận lỗi request nguyên bản. compaction-basic tự giữ số lần tràn theo từng agent, tỉa bớt trước khi cưỡng bức một lần thu gọn có hiệu lực và cân bằng, và chỉ trả về `{ kind: 'retry' }` khi `session.surface.replaceGeneration` tăng; điều này bao gồm cả tiến triển đạt được chỉ nhờ tỉa bớt khi không có phạm vi tóm tắt. Sau đó vòng lặp đóng lượt thất bại, mở một lượt thử lại được đánh số mới, và dựng lại request từ log bền vững. Không có bản thay thế, mọi thất bại khôi phục trước khi thay thế, việc hủy, mức trần đã cạn hoặc lỗi không liên quan đều giữ nguyên thất bại gốc từ provider. Nếu việc tỉa bớt đã đẩy generation tiến lên mà công việc tóm tắt sau đó thất bại, quá trình khôi phục sẽ thử lại từ chính surface đã tỉa và lưu bền đó, trừ khi việc hủy hoặc dispose (giải phóng tài nguyên) xảy ra trước. Quyết định vòng đời đầy đủ nằm ở [Agent Note về khôi phục sau lời gọi](../architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md).

```
assistant/message → tool/result/context/steering → step/end
claim the next batch → await waterfall agent/pre-step  ⟵ pressure compaction before the next request
enter → next step/start

provider overflow → step/end
await waterfall agent/request-error  ⟵ forced compaction between attempts
retry → next numbered step/start      ⟵ derives from the replacement surface
```

### Việc giữ lại độc lập với lượt; cân bằng cặp công cụ là bộ bảo vệ cấu trúc duy nhất

Nén tự động kiểm tra sau **mỗi** bước thành công, chứ không phải mỗi lượt một lần. Điều này tối quan trọng để sống sót qua các lượt mất kiểm soát: một lượt ReAct dày đặc công cụ sẽ nối thêm một `assistant/message` + một `tool/result` mỗi bước, nên surface tăng trưởng ngay trong một lượt. Lần kiểm tra pre-step kế tiếp có thể nén các cặp công cụ đã đóng từ sớm trước khi lần thực thi tiếp theo mở thêm một bước; nếu request vượt giới hạn trước, thì tràn được provider xác nhận vẫn là cơ chế dự phòng.

`compactIfNeeded` giữ lại phần đuôi gồm những đơn vị surface hoàn chỉnh nhỏ nhất mà kích thước ước lượng đạt tới ngân sách token giữ lại sau khi phân giải, và nén các node cũ hơn. Một đơn vị là một bước đã đóng hoàn chỉnh hoặc một tin nhắn không thuộc bước nào. Nếu điểm cắt token rơi vào giữa một bước, phạm vi giữ lại sẽ mở rộng cho tới khi điểm cắt thỏa cân bằng cặp công cụ. Cân bằng được kiểm theo thứ tự surface, chứ không theo số thứ tự log, vì bản tóm tắt thay thế có số thứ tự mới ở vị trí surface cũ. `dsh-compaction` export các hàm trợ giúp cho cạnh trước và sau; miễn `replaceGeneration` không đổi, cache theo từng session của nó chỉ gấp thêm các node đuôi surface mới, không đọc event khi log chỉ tăng trưởng thuần, và dựng lại tư cách thành viên hiện tại cùng trạng thái cân bằng sau khi thay thế. `compactRegion` từ chối những ranh giới tách rời lời gọi công cụ khỏi kết quả của nó. Lượt đang diễn ra không được ưu đãi giữ lại đặc biệt.

Vì vậy một lượt mất kiểm soát được nén y hệt mọi lịch sử khác: các bước *đã đóng* từ sớm của nó được tóm tắt, còn các bước gần đây giữ nguyên. Khi thứ duy nhất còn nén được chỉ còn một bước đuôi đang mở không thể tách (lời gọi công cụ của nó chưa có kết quả), thì nén từ chối thực hiện (trả về `null`) và thử lại sau khi bước đó đóng.

**Tràn do một đơn vị đơn lẻ vẫn nằm ngoài phạm vi.** Việc chọn phạm vi tóm tắt không thể tách một đơn vị bất khả phân. Bộ tỉa tùy chọn có thể sửa được một cặp công cụ đã đóng khi nội dung kết quả công cụ dạng văn bản có thể gỡ bỏ chiếm phần lớn không gian, và phần còn lại sau khi tỉa không còn vượt hạn. Riêng áp lực từ phong bì, các node phi công cụ quá khổ bất khả phân như `user/message` được dán vào, và các đơn vị công cụ mà phần dư không tỉa được vẫn quá lớn thì vẫn không thuộc phạm vi nén; giới hạn những đơn vị đó là một mối quan tâm khác.

### Neo ở đầu: một checkpoint tự động, luôn ở đầu

Nén tự động luôn bắt đầu từ đầu surface, gộp checkpoint trước đó với lịch sử mới nén, nên chỉ giữ một checkpoint tự động. Do đó `shadowedRange` mang tính vị trí chứ không phải khoảng số thứ tự: một số thứ tự tóm tắt mới hơn có thể chiếm một vị trí surface cũ hơn. `shadowedSeqs` ghi lại thứ tự surface có thẩm quyền. Nén thủ công ở khoảng giữa có thể để lại nhiều checkpoint.

### Bất biến hội tụ xấp xỉ

`resolveConfig` cung cấp các giá trị mặc định dùng được: tỉ lệ ngưỡng `0.8`, tỉ lệ đuôi giữ lại `0.16`, phần ghi đè provider/model cho tóm tắt để rỗng, `maxTokens: 8192`, `compactionRetries: 1`, `maxOverflowRetries: 1` và `auto: true`. Chính sách provider/model chính xác tùy chọn sẽ ghi đè một phần các mặc định cấp cao nhất; áp lực co giãn tỉ lệ theo dung lượng do adapter LLM sở hữu tuyến đường đó báo cáo, còn `retainTokens` có thể thay cho phần giữ lại theo tỉ lệ. Lượng giữ lại phải thấp hơn ngưỡng cuối cùng. Hội tụ vẫn mang tính động, vì trần đầu ra của provider có thể bị tiêu thụ bởi token suy luận (reasoning) ẩn hoặc tường minh, và kích thước bản tóm tắt cũng không dự đoán được. Nếu áp lực vẫn cao hơn ngưỡng, `compactIfNeeded()` sẽ nén lại checkpoint đầu theo số lần thử lại đã cấu hình, nhưng mỗi bản tóm tắt được commit phải nhỏ hơn phần nội dung nó che. Tràn không cần metadata dung lượng và sẽ bỏ qua ngưỡng cùng chiến lược đuôi giữ lại, thực hiện một lần thu gọn đầu tối đa và cân bằng, để lại đơn vị bất khả phân mới nhất. Ranh giới quyền sở hữu do [Agent Note về ngữ cảnh model đã định tuyến và chính sách nén](../architecture/2026-07-20-routed-model-context-and-compaction-policy.md) quy định.

### Thay thế surface: event `compaction/*` chỉ tồn tại trong log; một `user/message` mang bản tóm tắt

Vì `SurfaceEventType` là tập đóng, bản tóm tắt không thể đi ké trên event `compaction/*`. Thay vào đó backend nối thêm **một `user/message` duy nhất**, kèm `source: COMPACT_CHECKPOINT_SOURCE` và `surfaceOp: { op: 'replace', start, end }`; `content` của nó là bản tóm tắt (có khung), còn `sourceEventSeqs` phủ cả các mục bị che *và* các event ghi sổ. Giao diện export nguồn đó cùng `isCompactCheckpointSource()`, để consumer nhận diện được checkpoint thu từ lưu bền hoặc từ nhân bản mà không cần phụ thuộc vào danh tính package backend. Các event `compaction/*` ghi lại khóa, bản tóm tắt, khoảng được chọn, các seq bị che, số token và lời gọi model, nhưng không gia nhập surface. Thay đổi surface nằm **bên trong** khóa, và `compaction/end` là event được nối cuối cùng:

```
compaction/start    → log-only. Acquires the lock.
[summarize older range via the backend]
compaction/summary  → log-only. Records the raw summary, local-call marker, range, shadowed seqs, and token count.
user/message     → canonical checkpoint source + surfaceOp { op:'replace', start, end }.
                   THE surface mutation (framed summary).
                   deriveMessages() renders it as a user-role message.
compaction/end      → log-only. Releases the lock (carries `error` on a recoverable failure).
```

`deriveMessages()` sau đó sinh ra `[summary_as_user_message, ...retained_entries]`. Việc tái dùng `user/message` là trung thực chứ không phải chống chế: bản tóm tắt đúng *là* ngữ cảnh vai user.

### Đóng khung checkpoint + gộp tăng dần (riêng tư với backend)

Backend cơ bản bọc bản tóm tắt thành ngữ cảnh checkpoint đã định sẵn, và đánh dấu để gộp tăng dần ở lượt kế tiếp. Bản tóm tắt thô được giữ trên `compaction/summary`. Việc đóng khung là chiến lược của backend; seam chỉ cam kết rằng một tin nhắn user thay thế mang bản tóm tắt có thể được đóng khung, và dùng nguồn checkpoint chuẩn tắc.

### Chặn bằng khóa được ghi log, cộng với phân loại sự cố / thất bại có thể khôi phục

Cặp event `compaction/start … compaction/end` gánh hai trách nhiệm:

1. **Mồ côi do sự cố phát hiện được + đầu vào tóm tắt đã ghi log** (chính yếu). Việc sinh tóm tắt là một lời gọi model chậm, được lưu bền *sau* `compaction/start`. Sự cố giữa chừng khi sinh tóm tắt sẽ để lại một `compaction/start` không có `compaction/end` khớp — một bản mồ côi phát hiện được. Việc nhả khóa sau cùng (thay vì trước tiên) biến cửa sổ sự cố từ *hỏng âm thầm* thành mồ côi phát hiện được.
2. **Ngăn nén đồng thời.** Mọi điểm vào tự động, thủ công và theo phạm vi tường minh đều từ chối khi có một `compaction/start` chưa khớp đang hoạt động. Cặp dấu hiệu đó chính là khóa duy nhất; không có mutex cục bộ trong tiến trình gánh trùng cùng trách nhiệm.

Khóa này chỉ loại trừ một tác vụ nén khác, không loại trừ các sự kiện không liên quan. Dấu hiệu của nó là một mốc thời điểm chứ không phải một vùng chứa độc quyền, nên một thao tác splice inbox bền vững vẫn có thể xuất hiện giữa cặp start và end thủ công độc lập. Công việc tự động đòi hỏi toàn bộ surface trong lượt của nó phải giữ ổn định. Công việc thủ công chỉ xác thực lại đúng dải vị trí được chọn, để phần ngữ cảnh chỉ-nối-thêm bên ngoài dải đó vẫn hiển thị sau khi thay thế.

Ranh giới vòng đời làm cho trạng thái sự cố có nghĩa rõ ràng:

- **Vòng đời hiện tại:** một `compaction/start` treo lơ lửng sau `session/end-seed` mới nhất là khóa bền vững đang hoạt động, và báo busy.
- **Vòng đời sau đó:** một `session/end-seed` mới hơn do constructor ghi ra chứng minh rằng start chưa khớp cũ hơn đã cũ, nên việc khôi phục, fork và tiếp quản không bị kẹt mãi bởi một bên ghi đã chết.
- **Thất bại có thể khôi phục:** sau khi start đã ghi xuống, backend sẽ thử đúng một lần `compaction/end { error }`. Thất bại khi tóm tắt hoặc khi kiểm tra ổn định sẽ giữ nguyên surface của session, đồng thời lưu lại lần thử thất bại trong log. Nếu việc nối event đóng thất bại, start chưa khớp sẽ tiếp tục chặn một cách có chủ ý.

`compaction/end` giữ trường `error?` của nó (nhất quán với lỗi tự chứa của `tool/result` — một event là đủ để phân biệt thành công với thất bại, không cần đối chiếu event anh em). Không có event `compaction/error` riêng.

**Phần sửa chữa session lõi vẫn không biết gì về nén — đây là chủ đích.** `interruptedTurnClosers` không bao giờ được dạy về `compaction/*`. Ranh giới vòng đời `session/end-seed` tổng quát đã cung cấp bằng chứng mà chủ sở hữu nén cần; bất biến nén và backend chịu trách nhiệm diễn giải nó, không cần thêm phần sửa chữa riêng cho plugin vào lõi.

## Các phương án từng cân nhắc

- **Toàn bộ thuật toán làm phương thức cụ thể của giao diện** — bác bỏ, vì nó khớp nối lại giao ước vào một chiến lược giữ lại duy nhất. Cả ba thao tác đều trừu tượng; phép đo tái dùng được thuộc về một service riêng của họ LLM, và `summarize()` là hook duy nhất của basic.
- **Thực hiện nén trên `agent/request` hoặc trên một callback vòng lặp riêng cho nén** — bác bỏ, vì cái trước quan sát một request tạm thời, còn cái sau khớp nối vòng đời tổng quát vào chiến lược nén. Việc phát lại pre-step trên request bền vững trước đó, cộng với khôi phục tràn chuẩn tắc, đã phủ cả lời gọi thành công lẫn bị từ chối.
- **Một boolean `compact` hoặc một map metadata request không định kiểu** — bác bỏ, vì nhiều loại lời gọi phụ trợ sẽ biến thành các cờ loại trừ lẫn nhau, còn map mở thì vứt bỏ từ vựng được compiler kiểm tra. Một trường phân biệt `purpose` có kiểu có thể mở rộng cho các loại lời gọi khác mà không phải thêm trường mới vào `GenerateOptions`.
- **Event `compaction/error` riêng** — bác bỏ: `compaction/end` giữ trường `error?`, nhất quán với lỗi tự chứa của `tool/result` — một event là đủ để phân biệt thành công với thất bại, không cần đối chiếu event anh em.
- **Dạy phần sửa chữa lượt ở lõi nhận biết `compaction/*`** — bác bỏ: ranh giới end-seed tổng quát đã phân biệt được lịch sử của vòng đời trước; vá module lõi cho mỗi cặp event `xxx/start … xxx/end` trong tương lai chính là kiểu khớp nối mà kiến trúc capability seam sinh ra để tránh.

## Hệ quả

- **Package**: `packages/compaction/compaction` cung cấp giao diện, `compaction-basic` cung cấp backend, `compaction-tool-result-pruner` cung cấp phép viết lại tất định tùy chọn, và `command-compact` cung cấp `/compact` hướng người dùng. `packages/llm/token-meter` sở hữu riêng phép đo có nhận biết replay.
- **Điểm mở rộng tự động**: `agent/pre-step` (`@mode waterfall`) xử lý áp lực trước khi phái sinh request, còn `agent/request-error` (`@mode waterfall`) xử lý thất bại request cuối cùng sau khi bước thất bại đã đóng. Payload của pre-step mang batch đã nhận, lượt, bước và signal (xem [quyết định về event payload-object](../architecture/2026-08-06-agent-event-payload-objects.md)), chứ không mang payload prompt/tiền tố riêng cho nén.
- **`SessionEventMap`** nhận thêm `compaction/start` / `compaction/summary` / `compaction/end` qua declaration merging có thể gộp mở rộng; `SurfaceEventType` **không** bị đụng tới. Đây là session event chứ không phải cordis `Events`, nên cổng phân loại event không cần mục mới.
- **`dsh-compaction`** sở hữu `COMPACT_CHECKPOINT_SOURCE`, `isCompactCheckpointSource(source)`, `toolPairingBalancedBefore(session, seq)` và `toolPairingBalancedAfter(session, seq)`. Dấu hiệu này dùng để nhận diện bản tóm tắt thay thế xuyên qua các hiện thực backend. Phép kiểm cạnh surface có cache ngăn `compactRegion` và `compactIfNeeded` tách đôi cặp lời gọi/kết quả công cụ, kiểm tư cách thành viên hiện tại theo seq, trả lời cả hai cạnh từ một chuỗi cân bằng duy nhất tại mỗi điểm cắt, và từ chối các seq cũ hoặc thiếu cùng các kết quả mồ côi.
- **`dsh-session`** xác thực phép thay thế theo vị trí, độ phủ đầy đủ của các event nguồn được tham chiếu, và phép viết lại `tool/result` một node chỉ đổi nội dung, thông qua trình quản lý surface duy nhất. Plugin đồng hành lo bất biến của nó coi kết quả công cụ mới nối thêm là một lần thực thi, đòi hỏi phải có bước đang mở và lời gọi đang chờ, còn thành phần đồng hành của nén duy trì quan hệ giữa owner lượt dạng số và cặp event owner `null` độc lập.
- **Đấu nối**: `examples/tui-agent/cordis.yml` lần lượt nạp `dsh-token-meter`, `dsh-compaction-tool-result-pruner`, `dsh-compaction-basic` không cần cấu hình, rồi nạp `dsh-command-compact`; các mặc định ở cấp service khiến việc tổ hợp dùng được mà không phải lặp lại chính sách số học.

## Kiểm thử

- **Unit test:** dùng Loader thật và plugin invariant để phủ việc giữ lại nguyên đơn vị, cấu hình và replay của bộ tỉa, thứ tự block phong phú, việc bảo toàn metadata, sự hội tụ, hai kết cục của `compaction/end`, việc từ chối đuôi đang mở, khôi phục tràn chỉ-tỉa và có-tóm-tắt, bằng chứng generation, các mức trần và việc giữ nguyên lỗi gốc.
- **Test vòng lặp:** test ghim pre-step xảy ra sau `step/end` trước đó và trước `step/start` kế tiếp, dùng định tuyến `agent/request` thực tế, đóng bước thất bại, cấp số thử lại mới, và phủ đầy đủ tổ hợp tràn dạng ném/nội dòng → nén → dựng lại để thử lại.
- **Test thủ công:** ghim việc tuần tự hóa maintenance, thứ tự dấu hiệu, việc chèn phần giữ lại, phân loại dấu hiệu chưa khớp đang hoạt động / đã cũ, việc hủy, thất bại khi đóng / flush, ánh xạ lệnh và luồng TUI xếp hàng, tất cả không cần khóa model.
- **e2e có khóa:** model thật và phiên bash thật kích hoạt nén dưới các giới hạn đã hạ thấp, ghi lại đầy đủ cặp `compaction/start…end`, thu nhỏ surface, và hoàn thành tác vụ.
- **Snapshot:** kịch bản tràn ngữ cảnh đã lắp ráp chỉ phái sinh lời gọi từ `compaction/summary` khi `llmStreamCall: true` chứng minh LLM service cục bộ đã thực hiện lời gọi phụ trợ; các block được dựng lại chuẩn tắc ghim toàn bộ quá trình khôi phục mà không ghim cách provider chia nhỏ delta.
