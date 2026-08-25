# Agent Note: Đồng hồ đo context không nhìn thấy compaction

Status: implemented

[English](2026-08-05-context-meter-blind-to-compaction.md) | Tiếng Việt

## Vấn đề

Vòng tròn, tỉ lệ phần trăm và tiêu đề `~đã dùng / dung lượng` của [đồng hồ đo context](../feature/2026-08-05-composer-context-meter-breakdown.md) trong composer đều lấy từ `contextPressure.pressureTokens`, tức quy mô prompt mới nhất mà provider báo về. Con số này chỉ nhúc nhích khi có một request báo cáo mức sử dụng, mà compaction (nén ngữ cảnh) thì không báo cáo mức sử dụng: `compaction-basic` sinh bản tóm tắt qua lời gọi `ctx.llm.stream()` trực tiếp, chỉ ghi thêm `compaction/start`, `compaction/summary`, `user/message` dùng để thay thế và `compaction/end` — không có `assistant/message`, cũng không có phân mảnh mức sử dụng.

Thế là đồng hồ đứng yên bất động trước đúng thao tác duy nhất được thiết kế để thay đổi nó. Chạy một lần `compactNow` qua agent loop (vòng lặp tác tử) thật:

```
BEFORE compact:  ring=4%  header=~4227/100000   rows=[system 18, tools 0, messages 4365]
AFTER  compact:  ring=4%  header=~4227/100000   rows=[system 18, tools 0, messages  286]
```

Các dòng chi tiết thành phần rút ra từ phép gấp bề mặt giảm 93%. Còn vòng tròn — phần tử chính có thể thao tác, và cũng chính là lý do người dùng mở bảng ra ngay sau khi nén — thì không hề động đậy, và phải chờ chạy trọn thêm một lượt nữa mới nhúc nhích. Lúc này tiêu đề trên bảng chênh với các dòng chi tiết hơn một bậc độ lớn, đúng vào thời điểm người đọc dễ cộng dồn các dòng chi tiết nhất.

## Quyết định

`contextPressure` công bố tử số thứ hai `projectedTokens`: dựa trên mẫu của provider, cộng thêm phần định giá lại theo heuristic cho lượng tăng giảm của bề mặt kể từ lúc lấy mẫu, chặn dưới ở mức không. Phép gấp này mang theo bề mặt đã được tính giá qua `surface-fold.ts` dùng chung, và ghi lại `sampledSurfaceTokens` vào lúc mẫu mức sử dụng đáp xuống — thời điểm ghi là **trước** khi chính event đó gia nhập bề mặt, nhờ vậy `assistant/message` neo đúng vào bề mặt mà request của chính nó thực sự mang theo. `stateVersion` được nâng lên 3.

Chỉ phần chênh lệch là ước lượng. Điểm neo giữ nguyên giá trị chính xác của provider, nhờ đó chặn được việc bộ ước lượng đánh giá thấp một cách hệ thống với văn bản CJK và JSON Schema lọt vào con số mức chiếm dụng, đồng thời vẫn để con số này phản ứng ngay khi nội dung đáp xuống hoặc khi một đoạn nào đó bị che. `contextOccupancy` đọc `projectedTokens` và lui về mẫu thô, nên phép chiếu khôi phục từ checkpoint không chứa trường này sẽ thoái lui về hành vi cũ chứ không biến mất hẳn.

Điều này lật lại một nửa của [quyết định về đồng hồ đo context](../feature/2026-08-05-composer-context-meter-breakdown.md): «vòng tròn, tiêu đề và tổng chiều dài thanh tiến trình giữ giá trị chính xác của provider». Thứ mà quyết định đó thực sự muốn bảo vệ — đừng co giãn các dòng chi tiết heuristic theo tỉ lệ với tổng của provider để rồi ngụy tạo độ chính xác — thì vẫn được bảo vệ: các dòng chi tiết vẫn không bị co giãn, tiêu đề vẫn không bằng tổng của chúng. Cái thay đổi là nhận thức này: «chính xác theo provider, nhưng mô tả một request từ trước hai lần nén» không phải là con số thật hơn.

## Phương án thay thế

**Chuyển sang chiếu `measure().totalTokens`.** Service đo lường vốn đã tổng hợp đúng đại lượng này (điểm neo `baseline` cộng `surfaceDeltaTokens` có dấu), và phản ứng đúng — đo thực tế trước và sau cùng lần nén đó là 4383 → 304. Nhưng nó là một service dựng trên trạng thái phát lại riêng tư, không phải một phép gấp thuần túy, nên phép chiếu không gọi được. Muốn tái tạo điểm neo của nó bên trong `ProjectionDefinition` thì `_estimateProviderAssistant` phải truy cập ngẫu nhiên các event phân mảnh được tham chiếu theo seq (`session.events[seq]`), thứ mà `apply(state, event)` không có. Lấy tổng bề mặt tại thời điểm lấy mẫu làm điểm neo chính là phiên bản khả thi của cùng ý tưởng đó trong một phép gấp thuần túy theo từng event.

**Ghi bù một bản ghi mức sử dụng tổng hợp khi nén kết thúc.** Cách này quả thực đẩy được chính `pressureTokens`, nhưng mức sử dụng duy nhất mà quá trình nén có trong tay là mức sử dụng của chính request tóm tắt — một prompt hoàn toàn khác. Ghi nó thành quy mô prompt của cuộc hội thoại này chẳng khác nào viết một lời nói dối vào log bền vững, chứ không chỉ vào một chỗ hiển thị nào đó.

**Để UI tự làm phép trừ: lộ ra `sampledSurfaceTokens`, rồi đọc `contextBreakdown.messageTokens`.** Cách này xé phép tính số học của một con số ra ba nơi: hai phép chiếu và phía client. Chủ sở hữu của từ vựng là host, nên chính host phải công bố giá trị đầy đủ.

## Ảnh hưởng

Mức chiếm dụng giờ tiến theo từng event bề mặt, chứ không còn nhảy một lần mỗi lượt, nên khi kết quả tool sinh ra trong một lượt thì vòng tròn sẽ leo liên tục thay vì đợi hết lượt mới nhảy — và nó cũng tụt xuống ngay khoảnh khắc phép nén đáp xuống. Cái giá phải trả là có thêm khung chiếu trên đường truyền: `contextPressure` đẩy một khung mỗi event bề mặt, tức đúng tần suất mà `contextBreakdown` vốn đã chạy.

Các dòng chi tiết thành phần trên bảng vẫn không cộng ra được con số ở tiêu đề, nhưng giờ chỉ còn một lý do giải thích được thay vì hai: các dòng chi tiết mang sai số của bộ ước lượng, còn điểm neo của tiêu đề thì không. Đòn bẩy còn lại là độ chính xác ước lượng (làm trọng số có nhận biết CJK trong `estimate.ts`), và nó không đụng tới seam nào.

`sampledSurfaceTokens` dựa trên một tiền đề: giữa request của một bước và báo cáo mức sử dụng của nó sẽ không có nội dung mới gia nhập bề mặt. Agent loop tiếp nhận steering (điều hướng giữa chừng) và context trước `buildRequest`, và chỉ xả kết quả tool sau `assistant/message`, nên tiền đề này thành lập; kể cả sau này nó không còn đúng thì sai số cũng bị giới hạn trong phạm vi một message và tự hiệu chỉnh ở mẫu kế tiếp.

## Kiểm thử

`packages/llm/token-meter/tests/token-usage-projection.spec.ts` bao phủ việc giá trị chiếu tiếp tục được cập nhật trong lúc bề mặt tăng trưởng và qua một lần nén (mẫu đứng yên còn giá trị chiếu thu nhỏ lại), cùng với việc chặn ở mức không khi sai số heuristic kéo con số xuống âm. `packages/client/ui-conversation/tests/context-meter.client.spec.tsx` chốt chuyện vòng tròn đọc giá trị chiếu, còn `chat-stats.spec.tsx` chốt thứ tự ưu tiên và đường lui của `contextOccupancy`. Bộ số đầu-cuối phía trên lấy từ việc chạy `BasicCompactionEngine.compactNow` trên một `AgentLoop` thật đã gắn registry phép chiếu.
