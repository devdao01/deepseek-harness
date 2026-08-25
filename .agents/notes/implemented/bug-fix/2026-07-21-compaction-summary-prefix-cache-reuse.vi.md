# Agent Note: Lời gọi tóm tắt phát lại tiền tố hội thoại để tái dùng KV Cache

Status: implemented

[English](2026-07-21-compaction-summary-prefix-cache-reuse.md) | 中文

## Vấn đề

Việc nén (compaction) tự động kích hoạt giữa chừng hội thoại, đúng ngay sau khi vòng lặp đã làm nóng KV Cache của provider bằng request được định tuyến cuối cùng (`system` + `tools` + lịch sử phái sinh). Ngay sau đó, bộ tóm tắt mặc định phát ra một request phụ trợ *độc lập*, mà tiền tố của nó không chia sẻ bất kỳ phần nào với request đã được làm nóng kia: một prompt `system` chuyên dụng cho bộ tóm tắt, theo sau là phần lịch sử trước đó bị làm phẳng thành một chuỗi transcript (bản ghi văn bản) đã render duy nhất. Provider cache dựa trên chuỗi token tính từ đầu request, nên chỉ cần token đầu tiên khác đi (tức là một system prompt khác) là toàn bộ tiền tố đã cache trở nên vô hiệu. Vì vậy, mỗi lần nén phải trả chi phí xử lý prompt đầy đủ hai lần cho toàn bộ đoạn lịch sử được phát lại: một lần cho request hội thoại gây ra áp lực, một lần cho lời gọi tóm tắt, đúng vào lúc hội thoại lớn nhất thì cache lại mất tác dụng.

## Quyết định

Chỉ dẫn tóm tắt được chuyển từ **đầu** request (một prompt `system` hoàn toàn mới) xuống **cuối** hội thoại (thông điệp `user` cuối cùng). Lời gọi phụ trợ giờ đây tái tạo nguyên văn tiền tố của request được định tuyến cuối cùng và nối thêm một chỉ dẫn ở đuôi, nên nó là một phần mở rộng tiền tố thực sự của request đã được làm nóng, và provider sẽ tái dùng các token đã cache.

### `SummarizationInput` mang theo tiền tố được phát lại, không phải chuỗi đã render

`summarize()` (và `summarizeWithLlm` bên trong) nhận một `SummarizationInput` (`{ system?, tools?, messages }`) thay vì một chuỗi transcript phẳng. `region.ts` dựng nó bằng `session.requestHeader()` (`system` và `tools` bền vững) cộng với vùng bị che được ánh xạ qua `session.deriveEventMessage`, trong đó hàm này tạo ra các đối tượng `Message` giống hệt ở mức byte với nội dung mà `deriveMessages()` gấp vào request được định tuyến. `summarizeWithLlm` chuyển tiếp `system` và `tools` sang `GenerateOptions`, và gửi `[...input.messages, { role: 'user', content: COMPACTION_INSTRUCTION }]`. `tools` được mang theo cùng, kể cả khi bộ tóm tắt không bao giờ gọi bất kỳ tool nào: bỏ chúng đi sẽ làm chuỗi token ngắn lại, phá vỡ sự khớp với request đã cache.

### Chỉ dẫn là một thông điệp user ở đuôi

`COMPACTION_INSTRUCTION` bắt đầu bằng "You are now acting as a compaction engine…", chỉ thị model cô đọng *đoạn hội thoại phía trên*. Nó giữ nguyên tiêu đề có cấu trúc của các checkpoint trước đó, và ở vị trí mới này bổ sung hai quy tắc mà system prompt đặt phía trước trước đây không cần: không nhắc đến yêu cầu tóm tắt, và chỉ xuất ra văn bản checkpoint mà không gọi bất kỳ tool nào. Vùng bị che luôn kết thúc tại ranh giới có cặp tool cân bằng, nên nối thêm một thông điệp `user` phía sau nó là thứ tự thông điệp hợp lệ với cả adapter tương thích OpenAI lẫn adapter DeepSeek.

### Tái dùng cache là nỗ lực tối đa, còn tính đúng đắn thì được bảo đảm

Nén tự động luôn neo vào phần đầu bề mặt, nên vùng bị che chính là phần đầu của request được định tuyến, và tiền tố được phát lại khớp hoàn toàn với nó — đây là trường hợp bảo đảm trúng cache. `compactRegion` thủ công ở đoạn giữa vẫn phát lại đúng tiền tố thật và giữ tính đúng đắn, nhưng từ bỏ việc tái dùng, vì vùng bị che của nó không phải phần đầu của request. `summarizationProvider`/`summarizationModel` đã cấu hình, nếu khác với định tuyến của hội thoại, cũng từ bỏ việc tái dùng; đây là đánh đổi rõ ràng của bên triển khai, không phải khiếm khuyết. Việc phân giải đích (giá trị ghi đè đã cấu hình → header được định tuyến mới nhất → tùy chọn của agent (trợ lý), nếu không thì ném lỗi) giữ nguyên.

## Phương án khác đã cân nhắc

- **Giữ system prompt của bộ tóm tắt nhưng tái dùng phần còn lại** — bác bỏ: khe system chính là vùng token mà provider cache trước tiên, nên một system prompt tóm tắt khác biệt sẽ làm vô hiệu toàn bộ tiền tố bất kể phía sau là gì. Chỉ khi đưa chỉ dẫn ra khỏi phần đầu thì cache mới được khôi phục.
- **Chỉ gửi vùng bị che mà không kèm header `system`/`tools`** — bác bỏ: chuỗi có header khác biệt vẫn rẽ nhánh khỏi request đã cache ngay tại token đầu tiên, nên hiệu quả cache không hề tốt hơn, mà còn mất đi khung cần thiết cho việc tóm tắt.
- **Bỏ `tools` khỏi request tóm tắt** (model không bao giờ gọi tool nào) — bác bỏ: schema của tool là một phần của chuỗi token đã cache; bỏ chúng đi sẽ khiến mọi token phía sau lệch khớp, phá vỡ việc tái dùng.
- **Lập một session con tóm tắt chuyên phát ra `assistant/chunk` phục vụ phát lại snapshot** — bác bỏ: sự kiện `compaction/summary` bền vững đã ghi lại vị trí và toàn bộ đầu ra của lời gọi cục bộ thành công, còn dấu hiệu gọi tường minh giúp ngăn việc phát lại coi template hoặc đầu ra từ xa là luồng cục bộ.

## Hệ quả

- **`dsh-compaction-basic`** sở hữu `SummarizationInput`; chữ ký hook `summarize(input, agent, signal?)` được bảo vệ có thay đổi (chấp nhận được trước khi phát hành), và `region.ts` bổ sung `buildSummarizationInput`, hàm này gấp `deriveEventMessage` trên các seq bị che sau tiền tố header.
- **Loại bỏ bề mặt render vô dụng.** Đường làm phẳng cũ (`renderTranscript` / `renderContentBlocks` cùng spec của chúng trong `dsh-compaction`) không còn bên tiêu thụ nào, nên bị xóa cùng với các export của chúng.
- **Mục Model Experience trong README** giờ mô tả request phụ trợ của `dsh-compaction-basic` là tiền tố được phát lại cộng với một thông điệp chỉ dẫn nén ở đuôi, và mô tả hiệu ứng KV Cache của nó là tái dùng tiền tố hội thoại đã được làm nóng.
- **Đầu ra checkpoint có khung không thay đổi**, nên `user/message` đã ghi và mọi snapshot request hội thoại đều không bị ảnh hưởng; chỉ hình dạng của request phụ trợ là thay đổi.

## Kiểm thử

- **Unit:** `compaction-basic.spec.ts` khẳng định lời gọi phụ trợ chuyển tiếp `system`/`tools`/các thông điệp dẫn đầu, và nối chỉ dẫn nén làm thông điệp cuối cùng, đồng thời `compactRegion` phát lại tiền tố header được định tuyến mới nhất. Các khẳng định nội dung hiện có đọc đầu vào của bộ tóm tắt qua các thông điệp được phát lại chứ không qua chuỗi transcript.
- **Vòng lặp:** `compact-loop-repro.spec.ts` phân loại request tóm tắt dựa theo chỉ dẫn nén trong thông điệp user ở đuôi, còn test khôi phục sau tràn tiếp tục cố định số lượng request hội thoại và request tóm tắt trong vòng lặp thật.
- **Snapshot:** phát lại không cần khóa sẽ dựng lại một luồng thành công chuẩn tắc từ `compaction/summary` có dấu hiệu; [Agent Note về compaction-seam](../feature/2026-06-18-compaction-capability-seam.md) chịu trách nhiệm về quy ước dấu hiệu bền vững.
