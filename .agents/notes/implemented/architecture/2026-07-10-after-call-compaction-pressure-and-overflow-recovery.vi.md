# Agent Note: Áp lực nén sau khi gọi và phục hồi tràn context

Status: implemented

[English](2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md) | Tiếng Việt

## Vấn đề

`agent/pre-step` chạy trước khi routing request cuối cùng, và cũng sớm hơn cả việc tạo ra output assistant, kết quả tool, context đệm và steering (dẫn hướng giữa chừng). Ngay cả khi nó nhận được prompt đã lắp ráp và tiền tố session, view áp lực vẫn chỉ là tạm thời, vì `agent/request` vẫn có thể thay đổi routing hoặc cấu hình gọi, tool schema cũng không được đóng băng cùng các input này. Việc thêm trường không thể khiến trạng thái trước khi gọi mô tả một lần gọi đã hoàn tất, mà còn khiến extension point tổng quát bị ràng buộc chặt với compaction (nén).

Lần gọi thành công cũng không phải tín hiệu áp lực duy nhất. Provider có thể từ chối request vì vượt cửa sổ context trước khi trả về usage, một số lần gọi thành công cũng không cung cấp usage. Do đó, hệ thống cần áp lực có thể replay sau khi gọi, cùng một đường phục hồi lỗi hẹp; khi việc nén không thể chứng minh đã đạt tiến triển hợp lệ, hệ thống phải giữ lại lỗi provider gốc.

## Quyết định

### Áp lực thành công chạy ở ranh giới pre-step tiếp theo

`agent/pre-step` nhận batch message độc quyền đã được nhận (claimed) cùng `{ turn, step, signal }`, và trả về quyết định reject/enter cuối cùng. Nó không mang theo prompt hay trường tiền tố chuyên dụng cho compaction.

Compact-basic sẽ bọc `agent/pre-step` trước mỗi request được đề xuất. Tại ranh giới step tiếp theo, output assistant trước đó, mọi kết quả tool đã phân phối hoặc tổng hợp, context sau tool và steering đều đã được lưu bền vững, do đó chính sách áp lực có thể thấy trạng thái đầy đủ của lần gọi thành công, đồng thời không tách rời tool call assistant khỏi kết quả của nó. Session không có header ở ranh giới ban đầu chưa có request đã routing hoàn tất, nên không thực hiện công việc áp lực. Compact-basic sẽ xử lý lỗi vận hành nội bộ, phát cảnh báo và tiếp tục ủy quyền, không reject step được đề xuất.

`dsh-compaction-basic` đọc model routing thực tế mới nhất chính xác từ header request bền vững, chỉ dùng nó để xác nhận đã tồn tại một routing hoàn tất, sau đó để singleton `ctx.tokenMeter` đo lường envelope log chuẩn và lớp bề mặt hiện tại. Áp lực tự động không fallback về `AgentOptions.model`. Session không có header chưa có request đã routing hoàn tất để đánh giá, nên không thực hiện công việc; bất kỳ tên model không rỗng nào đã được lưu bền vững đều dùng chung một estimator. Lỗi đo lường hoặc tóm tắt mang tính vận hành sẽ phát cảnh báo, và tiếp tục từ lớp bề mặt bền vững mới nhất: dùng lịch sử đầy đủ trước khi có bất kỳ thay thế nào xảy ra; nếu việc prune đã được ghi xuống đĩa thì dùng lớp bề mặt đã prune.

### Phục hồi request chỉ bao phủ ranh giới mô hình cuối cùng

`agent/request-error` biểu thị lỗi terminal từ ranh giới adapter cuối cùng. Việc chọn adapter, phân phối, khởi tạo iterator và exception khi lặp đều trở thành finish `error` hoặc `aborted` terminal trước khi agent loop (vòng lặp smart agent) tiêu thụ; finish terminal do adapter phát trực tiếp cũng đi qua cùng đường này. Việc lắp ráp prompt, request middleware, ghi log request, xử lý kết quả, tool, listener step và dọn dẹp vẫn thuộc lỗi thông thường. [Lỗi terminal của luồng LLM (Large Language Model)](2026-07-29-terminal-llm-stream-failures.md) quy định ranh giới chuẩn hóa này.

Trước khi việc phục hồi chạy, step lỗi đã đóng. Listener chịu trách nhiệm sửa trạng thái bền vững, trả về `{ kind: 'retry' }`, và dừng việc ủy quyền waterfall (chuỗi sự kiện dạng thác). Sau đó loop sẽ đóng turn lỗi, và mở một turn retry từ log bền vững, không phát thông báo idle ở giữa. Chính sách retry và số lần đếm do plugin tự sở hữu; compaction-basic xóa bộ đếm tràn của agent tương ứng khi chuỗi đạt trạng thái cuối `agent/settled`. Cả hai adapter DeepSeek đều chuẩn hóa lỗi giới hạn context của provider đã nhận diện thành `CONTEXT_WINDOW_EXCEEDED`. [Quyết định retry action](../simplification/2026-07-27-request-error-retry-action.md) quy định ranh giới trả về này.

Nếu việc hủy xảy ra sau khi tool call assistant đã được lưu bền vững, nhưng trước khi mọi lời gọi hoàn tất phân phối, loop sẽ ghi một cặp `tool/call` tổng hợp cùng `tool/result` aborted cho mỗi lời gọi chưa được phân phối, sau đó vào đường abort thông thường. Do đó lớp bề mặt sẽ không để lại tool call bền vững mồ côi chỉ vì việc hủy thắng cuộc đua (race).

### CompactionEngine phơi bày ý định, không sở hữu việc quyết toán token

`CompactionEngine.compactIfNeeded(agent, trigger, signal)` nhận `trigger: 'pressure' | 'context-overflow'`. Interface không thêm phương thức estimate hay kiểu token; `ctx.tokenMeter` tiếp tục là chủ sở hữu quyết toán có thể tái sử dụng.

Với `pressure`, compaction-basic sẽ resolve cặp target provider/model bền vững tương ứng dung lượng và chính sách target chính xác mà adapter duy trì, rồi áp dụng ngưỡng và ngân sách phần đuôi giữ lại thu được vào một kết quả `ctx.tokenMeter.measure()` thống nhất. Nếu chưa đạt ngưỡng áp lực, hệ thống trả về ngay, không thực hiện prune. Khi áp lực đạt điều kiện, `ctx.toolResultPruner` tùy chọn sẽ viết lại các kết quả tool quá lớn trong lớp bề mặt hiện tại, compaction-basic đo lại qua cùng meter đó; nếu áp lực đã giảm xuống mức an toàn thì bỏ qua lời gọi mô hình, ngược lại thì chọn phạm vi từ lớp bề mặt đã prune và tạo tóm tắt. Việc định giá phạm vi, đo lường event nguồn được tham chiếu, số token bị che khuất và việc từ chối tóm tắt không thu nhỏ đều được thực hiện bởi cùng một singleton meter. Giá trị mặc định chung giữ nguyên: tỷ lệ ngưỡng `0.8`, tỷ lệ lịch sử giữ lại `0.16`, provider/model tóm tắt `''`, `maxTokens: 8192`, `compactionRetries: 1` và `auto: true`; mục `modelPolicies` tùy chọn có thể ghi đè các giá trị này theo đúng tổ hợp provider/model.

Với việc tràn đã chuẩn hóa, compaction-basic không yêu cầu metadata dung lượng, và bỏ qua áp lực dạng vô hướng (scalar) cùng ngân sách token giữ lại thông thường. Nó thực hiện prune trước, rồi chọn phạm vi đầu cân bằng lớn nhất từ cặp tool trong khi vẫn giữ lại đơn vị không thể chia nhỏ mới nhất; khi tồn tại phạm vi, mới thử một lần nén tóm tắt thu nhỏ dưới cùng signal đó. Listener tự động sẽ chụp snapshot trước cho `session.surface.replaceGeneration`, khi prune hoặc tóm tắt làm generation tăng lên thì trả về `{ kind: 'retry' }`. Quy tắc này vẫn đúng ngay cả khi prune đã ghi xuống đĩa trước còn công việc tóm tắt sau đó ném lỗi; việc hủy vẫn luôn được ưu tiên. Backend nếu chỉ trả về kết quả mà không thay thế lớp bề mặt thì không được phép cấp phép retry; chỉ khi prune đã đạt tiến triển, ngay cả khi không có `CompactionResult`, mới được phép cấp phép retry.

`maxOverflowRetries` là tùy chọn và mặc định là `1`; `0` chỉ tắt việc phục hồi tràn, không tắt kiểm tra áp lực. `auto: false` sẽ không đăng ký bất kỳ listener tự động nào. Lỗi không chuẩn hóa, hết số lần thử, signal đã bị hủy từ trước, thiếu model routing, không có phạm vi an toàn, generation không đổi, và lỗi phục hồi xảy ra trước bất kỳ lần thay thế nào, đều sẽ được ủy quyền cho listener tiếp theo. Nếu không có phục hồi tiếp theo, loop sẽ báo cáo đối tượng lỗi provider gốc cùng code của nó. Lỗi phục hồi sau khi generation đã tăng sẽ cấp phép retry dựa trên tiến triển bền vững; ngay cả khi công việc phục hồi hoàn tất đồng thời, việc hủy hoặc dispose (giải phóng tài nguyên) vẫn có quyền ưu tiên cao nhất.

Bộ tóm tắt mặc định sẽ lần lượt resolve cấu hình tường minh, routing được ghi nhận gần nhất, và agent options. Vì middleware `llm/stream` trực tiếp có thể route lại lời gọi hỗ trợ này, `compaction/summary.{provider, model}` ghi lại đích cuối cùng `GenerateOptions` có thể thay đổi được quan sát sau khi phân phối, chứ không phải giá trị ứng viên trước waterfall.

## Kiểm thử

Test đơn vị bao phủ ranh giới chuẩn hóa của adapter cuối cùng, số thứ tự retry và việc reset của turn đã đóng, việc hủy và dispose, thứ tự ranh giới step, áp lực envelope đã routing, prune có điều kiện áp lực, prune giải phóng áp lực độc lập, tạo tóm tắt từ input đã prune, thu nhỏ tràn cân bằng, tiến triển prune đã ghi xuống đĩa trước lỗi tiếp theo, chứng minh generation, giới hạn trên, ủy quyền và routing lời gọi hỗ trợ. Test loop thực tế bao phủ quá trình tái dựng request retry sau khi nén qua prune hoặc tóm tắt, đối với cả tràn dạng ném lỗi và tràn inband.

## Các phương án thay thế từng cân nhắc

- **Thêm trường chuyên dụng cho compaction vào pre-step** — không chấp nhận, vì session bền vững chuẩn và token meter đã sở hữu input đo lường; vòng đời tổng quát không cần mang theo envelope thứ hai.
- **Retry cùng số thứ tự step** — không chấp nhận, vì việc phục hồi sẽ append event bền vững sau ranh giới lỗi. Step mới giữ được lồng cân bằng và khả năng tái dựng.
- **Retry chỉ cần `compactIfNeeded` trả về kết quả** — không chấp nhận, vì backend tùy chỉnh có thể báo cáo thành công mà không thay đổi trạng thái mô hình nhìn thấy. `replaceGeneration` mới là bằng chứng có thẩm quyền.
- **Để compaction-basic parse cách diễn đạt của provider** — không chấp nhận, vì việc phân loại thuộc về adapter, và phải bao phủ cả kiểu phát ném lỗi lẫn kiểu inband.
- **Fallback về `AgentOptions.model` khi không có routing bền vững** — không chấp nhận, vì chính sách tự động phải mô tả một request đã hoàn tất và đã được ghi lại. Việc kiểm tra áp lực và phục hồi khi không có header sẽ ủy quyền nguyên trạng.

## Hệ quả

Việc kiểm tra áp lực của pre-step tiếp theo mô tả request đã routing hoàn tất trước đó, bao gồm kết quả tool bền vững và input mới nhận. Việc prune không cần model tùy chọn sẽ loại bỏ khối lượng output tool có thể dự đoán trước khi chọn tóm tắt, và cũng có thể tự tạo ra tiến triển đủ để retry. Khi không có điểm neo usage thành công, việc tràn đã chuẩn hóa cung cấp đường dự phòng. Việc phục hồi có giới hạn trên rõ ràng, tuân theo việc hủy, và giữ tính đơn điệu: chỉ retry khi generation của lớp bề mặt mô hình nhìn thấy đã thay đổi.

Cái giá phải trả là thực hiện công việc áp lực trong waterfall pre-step dùng chung, và cần adapter liên tục duy trì việc phân loại tràn. Cách diễn đạt của provider và mật độ ký tự theo kinh nghiệm (heuristic) vẫn là rủi ro bảo trì. Việc nén lớp bề mặt vẫn không thể sửa trường hợp chỉ riêng envelope đã vượt cửa sổ, cũng không thể chia nhỏ node không phải tool và không thể chia nhỏ, hay sửa trường hợp đơn vị tool phần còn lại không thể prune vẫn quá lớn. Nếu kết quả tool dạng văn bản có thể loại bỏ là khối lượng chính, bộ prune tùy chọn vẫn có thể sửa được cặp tool vốn không thể chia nhỏ.

[Vòng đời inbox pre-step đã nhận (claimed)](2026-07-31-claimed-pre-step-inbox-lifecycle.md) đã thay thế cách kích hoạt post-step ban đầu của bản ghi này. Việc tách dịch vụ, token meter độc lập, quy ước phạm vi cân bằng, lock được ghi trong log, việc thay thế tóm tắt và hook `summarize()` con duy nhất đều được giữ nguyên.
