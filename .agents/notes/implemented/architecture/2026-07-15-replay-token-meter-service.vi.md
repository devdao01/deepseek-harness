# Agent Note: Dịch vụ đo lường token kiểu replay

Status: implemented

[English](2026-07-15-replay-token-meter-service.md) | Tiếng Việt

## Vấn đề

Áp lực context không chỉ hữu ích cho compaction (nén). Backend compaction, bảo vệ tràn (overflow protection), hay các plugin chính sách request tương lai đều có thể cần trả lời cùng một câu hỏi: request bền vững đã tiêu thụ bao nhiêu token? Nếu giữ logic gấp (fold) này bên trong `dsh-compaction-basic`, sẽ lặp lại logic replay, khiến phía gọi chưa tải compaction không thể dùng đo lường, và cám dỗ phía gọi tái sử dụng kết quả quyết toán đã cũ.

Usage của provider cũng không phải câu trả lời đầy đủ. Nó chỉ mô tả một lần gọi thành công dưới đúng một envelope request, còn lớp bề mặt hiện tại sau đó vẫn có thể tăng, giảm hoặc bị thay thế. Session cũng có thể chuyển provider và model, log cũ có thể thiếu chunk seq cấu thành message assistant, trường usage cũng báo cáo riêng số lượng input, cache read, cache write, output và reasoning. Do đó, dịch vụ khả dụng phải kết hợp điểm neo chính xác mới nhất với việc định giá lại theo kinh nghiệm (heuristic) thận trọng, và phơi bày revision log mà mỗi kết quả đã tiêu thụ.

## Quyết định

### Một dịch vụ cụ thể cho họ LLM (Large Language Model)

`@deepseek-ai/dsh-token-meter` là package cụ thể duy nhất dưới `packages/llm/`, và đăng ký `ctx.tokenMeter`. Nó sẽ không được tách thành interface và backend cho tới khi xuất hiện implementation thứ hai. `TokenMeter` tự phơi bày `measure(session, requestHeader?)` và `estimateMessage(message)`; phía tiêu thụ gọi trực tiếp singleton service này.

Dịch vụ không có cấu hình. Việc ước tính dùng quy tắc kinh nghiệm cố định bốn ký tự mỗi token, cộng thêm chi phí cấu trúc. Dịch vụ không cung cấp profile model, cấu hình dung lượng, cấu hình mật độ, backend tokenizer, hay chính sách riêng theo ngôn ngữ. Việc truy vấn dung lượng chính xác theo provider/model do adapter chịu trách nhiệm riêng, xem chi tiết tại [Agent Note về context mô hình đã routing và chính sách compaction](2026-07-20-routed-model-context-and-compaction-policy.md).

### Gấp (fold) replay theo từng session

Mỗi session có một fold gia tăng cô lập. Fold đang hoạt động tiến lên qua `session/event`; mỗi lần đọc sẽ đuổi tới cuối log bền vững, do đó thứ tự listener, session seed, và reload dịch vụ không làm thay đổi câu trả lời. Fold theo dõi snapshot header request đầy đủ chuẩn hóa, ranh giới step, việc append và thay thế lớp bề mặt, usage assistant, và chunk seq mà mỗi message assistant tham chiếu. Sự kiện dị dạng tiếp theo sẽ thất bại theo kiểu transaction và giữ nguyên chưa đọc, không để trạng thái bị sửa nửa chừng.

`measure(session, requestHeader?)` chỉ đồng bộ fold một lần, và trả về áp lực dạng vô hướng (scalar) cùng giá node theo từng vị trí. `totalTokens` vẫn biểu thị áp lực request cùng response; `surfaceTokens` là tổng theo kinh nghiệm chỉ riêng cho lớp bề mặt, và bằng tổng `nodes[].tokens`. Việc ghi đè `requestHeader` chỉ thay đổi việc định giá áp lực, trường lớp bề mặt luôn mô tả session hiện tại. `estimateMessage(message)` không phụ thuộc trạng thái session, áp dụng trực tiếp quy tắc kinh nghiệm cố định. Mỗi kết quả là một snapshot tách biệt, bất biến sâu, chỉ mang một `logRevision`. Mỗi lần đo lường sẽ copy các node hiện tại, do đó chi phí là O(surface).

Chỉ khi envelope request chuẩn hóa cần đo lường bằng đúng điểm neo của lần gọi thành công gần nhất, dịch vụ mới tái sử dụng usage của provider. Bất kỳ thay đổi nào ở provider, model, system prompt, tiền tố, tool hay cấu hình gọi đều sẽ kích hoạt việc định giá lại đầy đủ theo kinh nghiệm. Thay đổi lớp bề mặt so với điểm neo khớp sẽ giữ delta có dấu, bao gồm giá trị âm sau khi thay thế thu nhỏ. Request thành công tiếp theo sẽ thay thế điểm neo trước đó, kể cả khi provider hoặc model đã đổi.

Usage cộng dồn các bucket input, cache read, cache write và output không chồng lấn nhau, không cộng thêm số lượng reasoning một lần nữa. Mỗi lần gọi mô hình thành công đều ghi một `assistant/message`, kể cả lần gọi không có nội dung và lần gọi đạt giới hạn token, kèm chunk seq trước đó chính xác. Danh sách `sourceEventSeqs` rỗng tường minh biểu thị luồng provider đã biết là rỗng; danh sách bị thiếu trong log cũ sẽ thận trọng coi output assistant bền vững là output của provider.

### compaction-basic tiêu thụ đo lường, nhưng không sở hữu đo lường

`dsh-compaction-basic` yêu cầu `ctx.tokenMeter`; `CompactionEngine` không thêm phương thức hay kiểu token. Cấu hình, transaction theo vùng và tóm tắt được giữ riêng ở các module độc lập, bản thân dịch vụ đăng ký listener tự động, còn `summarize()` vẫn là hook con duy nhất. Meter singleton được dùng nhất quán cho áp lực, giữ lại, nội dung bị che khuất, event nguồn được tham chiếu và việc định giá từ chối tóm tắt không thu nhỏ.

Quyết định liên hợp ngưỡng và giữ lại của compaction tự động chỉ dùng một lần đo lường thống nhất. Transaction theo vùng sẽ thực hiện đo lường sau khi append lock `compaction/start` bền vững, đo lại lần nữa sau khi hoàn tất tóm tắt bất đồng bộ, rồi so sánh vector node lớp bề mặt tách biệt. Thay đổi lớp bề mặt xảy ra trong khoảng thời gian đó sẽ chặn việc thay thế; `logRevision` có thể tiến lên vì fact log thuần túy không liên quan, mà không làm mất hiệu lực phạm vi đã chọn chưa thay đổi.

Chính sách compaction dùng giá trị mặc định cấp dịch vụ: tỷ lệ ngưỡng `0.8`, tỷ lệ phần đuôi giữ lại `0.16`, `summarizationProvider: ''`, `summarizationModel: ''`, `maxTokens: 8192`, `compactionRetries: 1`, `maxOverflowRetries: 1` và `auto: true`. Trường cấp cao nhất áp dụng cho mỗi đích routing; mục provider/model chính xác trong `modelPolicies` có thể ghi đè một phần các trường này. Việc kiểm tra áp lực dùng dung lượng do adapter sở hữu resolve làm chuẩn để quy đổi các tỷ lệ này, `retainTokens` có thể thay thế `retainRatio`; giá trị giữ lại phải nhỏ hơn ngưỡng cuối cùng. Provider và model tóm tắt phải cùng được đặt hoặc cùng để rỗng; tổ hợp rỗng sẽ resolve đích request được ghi gần nhất trước, rồi mới dùng tổ hợp trong `AgentOptions`.

Việc kiểm tra áp lực tự động chạy trước khi phái sinh request tại `agent/pre-step`, và đo lường envelope bền vững chuẩn do provider/model thực sự được chọn của `agent/request` trước đó tạo ra. Session không có header chưa có request đã routing hoàn tất để đánh giá, nên không thực hiện công việc; bất kỳ đích routing nào cũng có thể dùng estimator singleton này. Luồng phục hồi tràn chuẩn hóa dùng cùng kết quả đo lường để buộc chọn phạm vi, và chỉ retry sau khi việc thay thế lớp bề mặt đã được chứng minh.

## Kiểm thử

Test đơn vị bao phủ việc ước tính cố định, việc envelope mất hiệu lực và thay thế điểm neo, ranh giới replay, snapshot bất biến, áp lực đã routing, hội tụ (convergence), chứng minh generation tràn và rollback. Fixture (dữ liệu tiền đặt cho test) Loader/Include thật xác thực đường load token-meter không cấu hình và compaction-basic theo đúng thứ tự phụ thuộc.

## Các phương án thay thế từng cân nhắc

- **Giữ việc ước tính bên trong `CompactionEngine`** — không chấp nhận, vì việc đo lường có phía tiêu thụ và ngữ nghĩa replay độc lập với compaction; nó còn buộc mỗi bộ nén phải phơi bày cùng một bộ API không liên quan.
- **Tách token meter thành interface và backend heuristic ngay lập tức** — không chấp nhận, vì hiện chỉ có một implementation. Một dịch vụ cụ thể duy nhất vẫn giữ seam cho tương lai, đồng thời tránh package và cấu hình mang tính suy đoán.
- **Đặt cửa sổ theo khóa model và profile mật độ vào meter** — không chấp nhận, vì việc ước tính replay không sở hữu fact routing hay dung lượng model. Adapter sở hữu routing công khai dung lượng, còn compaction-basic sở hữu chính sách ngưỡng và giữ lại riêng cho phía tiêu thụ.
- **Giữ đo lường vô hướng và lớp bề mặt tách biệt** — không chấp nhận, vì phía tiêu thụ phải thực hiện hai lần đọc và khớp revision number cho một quyết định. Chỉ đọc giá trị vô hướng có thể tránh việc copy node khi dưới ngưỡng, nhưng API tách rời sẽ tạo ra cửa sổ race condition ở phía tiêu thụ; snapshot thống nhất chấp nhận chi phí copy O(surface) để đổi lấy tính nhất quán kết quả.
- **Chuyển usage của provider giữa các envelope khác nhau** — không chấp nhận, vì model, tool, tiền tố và cấu hình gọi đều là fact request. Khi không khớp sẽ định giá lại toàn bộ request hiện tại.

## Hệ quả

- Áp lực token có một chủ sở hữu nhận biết replay dùng chung cho compaction và các plugin tương lai.
- Giá trị mặc định khiến meter trở thành mục tổ hợp không cần cấu hình; deployment cấu hình dung lượng trên từng adapter routing, và cấu hình ghi đè chính sách tùy chọn trên compaction-basic.
- Việc định giá theo kinh nghiệm cố định vẫn chỉ là ước tính hành vi provider, không phải tokenizer chính xác hay bộ serialize request.
- Mỗi lần đo lường copy lớp bề mặt hiện tại kèm thông tin vị trí, do đó chi phí là O(surface), kể cả khi kiểm tra áp lực có thể kết thúc dưới ngưỡng.
- Khi gặp ranh giới bền vững dị dạng, việc đo lường sẽ thất bại rõ ràng. Điều này biến việc replay hỏng thành lỗi tích hợp có tên, thay vì để áp lực trôi (drift) âm thầm.
- Việc kiểm tra áp lực sau step đọc routing, tool và ranh giới tiền tố đã ghi chính xác; với các request bị từ chối trước khi xuất hiện điểm neo usage thành công, việc phân loại tràn của provider vẫn là đường dự phòng do adapter duy trì.
