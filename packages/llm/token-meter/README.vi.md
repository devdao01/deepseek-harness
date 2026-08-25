# @deepseek-ai/dsh-token-meter

[English](README.md) | 中文

Đo lường token có nhận thức về replay (phát lại) thông qua dịch vụ singleton `ctx.tokenMeter`. Nó tiến hành một fold (gấp/rút gọn) cách ly cho từng phiên từ nhật ký bền vững, do đó compaction (nén) và các plugin nhạy cảm với áp lực khác có thể chia sẻ việc đo lường mà không cần phụ thuộc vào `CompactionEngine`.

## Cấu hình

Bộ ước lượng không có mục cấu hình nào. Nó cố ý dùng một quy tắc heuristic (suy nghiệm) cố định: mỗi token được ước tính bằng bốn ký tự, cộng thêm chi phí cấu trúc của role, block và trường envelope (bao bọc) của request. Bất kỳ key cấu hình nào cũng sẽ bị từ chối; capability của model thuộc về adapter sở hữu chính xác route nhà cung cấp/model, có thể lấy qua `ctx.llm.resolveModelInfo().context`.

## Quy ước đo lường

`ctx.tokenMeter` phơi bày trực tiếp hai thao tác:

- `measure(session, requestHeader?)` trả về áp lực request và lớp bề mặt (surface) đã định giá hiện tại trên cùng một revision (bản sửa đổi) nhật ký đã tiêu thụ.
- `estimateMessage(message)` dùng quy tắc heuristic cố định để định giá một message.

`measure()` sẽ đồng bộ một lần, và trả về một snapshot (ảnh chụp) độc lập và bất biến sâu. `totalTokens` là áp lực request và response (phản hồi), `surfaceTokens` chỉ là tổng heuristic ở lớp bề mặt, bằng tổng `nodes[].tokens`. Việc ghi đè `requestHeader` chỉ ảnh hưởng đến trường áp lực; trường bề mặt vẫn mô tả phiên hiện tại. Mỗi lần gọi sẽ clone (nhân bản) các node có vị trí, do đó việc đo lường có độ phức tạp O(surface).

fold theo dõi snapshot đầy đủ của request header, ranh giới bước (step), phần thêm và thay thế ở lớp bề mặt, message assistant thành công, mức sử dụng của nhà cung cấp, và seq của chunk mà mỗi message assistant tham chiếu tới. Chỉ khi request envelope chuẩn của lệnh gọi thành công gần nhất khớp với envelope đã đo, và tổng của nó không thấp hơn điểm neo (anchor) heuristic đầy đủ của lệnh gọi đó, mức sử dụng của nhà cung cấp mới được tái sử dụng; các thành công sau đó sẽ thay thế điểm neo cũ hơn. Nếu không, sẽ thực hiện ước lượng đầy đủ cho envelope và bề mặt hiện tại. Thay đổi ở lớp bề mặt giữ giá trị có dấu tương đối so với điểm neo khớp, kể cả delta âm sau khi thay thế thu nhỏ.

Việc đo mức sử dụng sẽ cộng các bucket (nhóm) input, cache-read, cache-write và output không chồng lấp; không cộng lại reasoning (suy luận) một lần nữa. Mỗi lệnh gọi thành công sẽ ghi lại một điểm neo assistant, kể cả lệnh gọi không có nội dung. Danh sách `sourceEventSeqs` rỗng tường minh biểu thị luồng nhà cung cấp trống đã biết; bản ghi cũ thiếu danh sách này thì fold sẽ thận trọng coi output assistant bền vững là output của nhà cung cấp.

## Chiếu (projection) phiên

Khi tổ hợp cung cấp `ctx.sessionProjections`, token-meter sẽ đăng ký ba đơn vị thông qua một child fiber (fiber con) tùy chọn.

`tokenUsage` mang `uncachedInputTokens`, `outputTokens`, `cacheReadTokens` và `cacheWriteTokens` từ toàn bộ nhật ký bền vững. Ngay cả khi request sau đó thất bại, chunk mức sử dụng vẫn được tính vào; mức sử dụng của message assistant cuối cùng trong cùng `(turn, step)` sẽ thay thế mẫu đó, chứ không đếm trùng. Reasoning vẫn là một hạng mục con của output. Chỉ giữ lại một mẫu mới nhất duy nhất, dựa vào một tính chất thứ tự của session log: một khi một step muộn hơn đã báo cáo mức sử dụng, nhật ký hợp lệ sẽ không bao giờ báo cáo mức sử dụng cho step sớm hơn nữa.

`contextPressure` mang `pressureTokens` tùy chọn (kích thước prompt mới nhất do nhà cung cấp báo cáo, là tổng input chưa cache cộng cache read và write), `projectedTokens` (đã dự phóng) tùy chọn, và `contextWindow` tùy chọn từ bản ghi `request/context` mới nhất. Trước khi nhà cung cấp báo cáo mức sử dụng, cả hai con số đều còn thiếu; khi adapter của route chưa công bố capability thì capability cũng còn thiếu. Output không được tính vào đó, do đó trong khi stream output của một turn, `pressureTokens` không thay đổi, cho tới khi request tiếp theo báo cáo mức sử dụng thì mới tiến lên.

`projectedTokens` là "prompt của request tiếp theo sẽ tốn bao nhiêu": trên nền mẫu đó, cộng thêm việc định giá lại theo heuristic phần tăng giảm ở lớp bề mặt kể từ lúc lấy mẫu, được kẹp giới hạn dưới ở mức 0, fold dùng chung một `surface-fold.ts` mà dịch vụ đo lường replay lại. Chỉ phần gia tăng là được ước lượng, nên con số này vừa được neo vào chỉ số đọc của nhà cung cấp, vừa có thể phản ứng ngay khi nội dung được chốt — hoặc khi compaction che khuất một đoạn. Trường hợp sau chính là lý do trường này tồn tại: compaction sinh ra bản tóm tắt qua lệnh gọi `ctx.llm.stream()` trực tiếp, tự nó không thêm mức sử dụng nào, do đó nếu chỉ dựa vào `pressureTokens` sẽ liên tục báo cáo kích thước prompt trước khi nén, cho đến khi hoàn thành trọn một turn nữa. Hiển thị tỷ lệ chiếm dụng đọc `projectedTokens`.

`contextBreakdown` mang `systemTokens`, `toolsTokens` và `messageTokens` theo heuristic, mô tả thành phần của context chứ không phải kích thước tính phí của nhà cung cấp. Con số envelope được định giá lại theo nguyên tắc bản mới thắng tại mỗi `request/header`; con số message replay lại `surface-fold.ts` — chính là fold có vị trí mà `measure()` chạy trên đó — do đó nó bằng `measure().surfaceTokens` tại mọi ranh giới sự kiện, và compaction sẽ thu nhỏ nó giống như thu nhỏ request tiếp theo. Cả ba con số đều dùng quy tắc heuristic cố định của dịch vụ đo lường, đều là giá trị ước lượng: cộng lại không bằng `projectedTokens` — điểm neo của nhà cung cấp trong con số sau chính là biểu hiện của sai số mà các dòng chi tiết này vẫn còn mang (định giá theo "4 ký tự ≈ 1 token", văn bản CJK và JSON schema sẽ bị ước tính thấp nghiêm trọng). Hãy coi chúng là **thành phần** gần đúng để hiển thị, chứ không phải tổng.

Cả ba đơn vị đều dùng baseline (đường cơ sở) chiếu chuẩn, khung thời gian thực, kho giá trị theo nguyên tắc seq cao thắng, và đường dẫn checkpoint (điểm kiểm tra) JSON. Gỡ bỏ token-meter sẽ xóa cả ba key này. Tổ hợp không có seam (đường nối) chiếu sẽ giữ nguyên hành vi sẵn có của dịch vụ đo lường.

### Tỷ lệ chiếm dụng context là giá trị gần đúng có chủ đích

Các trường tỷ lệ chiếm dụng này đều theo nguyên tắc bản mới thắng và độc lập với nhau, **không phải** là một lần quan sát nguyên tử (atomic) cho một request duy nhất. Khi đổi model, capability mới sẽ được ghép với mẫu của route trước, cho đến khi request tiếp theo báo cáo mức sử dụng; còn `pressureTokens` mô tả request cuối cùng, chứ không phải bề mặt hiện tại — `projectedTokens` đẩy mẫu đó theo phần tăng giảm của bề mặt tới thời điểm hiện tại, nhưng điểm neo của nó vẫn là request sớm hơn đó.

Đây là lựa chọn có chủ đích. Tỷ lệ phần trăm chiếm dụng là con số tham khảo hướng tới người dùng, không phải bản ghi tính phí, cũng không phải đầu vào để chặn cổng (gate): không có khâu nào trong harness ra quyết định dựa vào nó, compaction thì đọc trực tiếp `measure()`. UI tính tỷ lệ chiếm dụng bằng cách lấy áp lực đo được chia cho capability được giải quyết riêng cho model đã chọn.

[Agent Note](../../../.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.md) ghi lại lần so sánh đã bác bỏ phương án "giữ cặp giá trị này nguyên tử". Bên tiêu thụ cần con số chính xác tại cùng một ranh giới nên gọi `measure()` tại ranh giới request của chính mình, thay vì đọc từ projection này.

## Tổ hợp

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-basic'
```

Cả hai plugin đều có giá trị mặc định khả dụng. meter giữ tính độc lập với route model và compaction tùy chọn. Việc triển khai sẽ cấu hình capability trên adapter LLM (Large Language Model), và cấu hình chiến lược nén trên `dsh-compaction-basic`.

## Trải nghiệm model

Ảnh hưởng gián tiếp thông qua các bên tiêu thụ như `dsh-compaction-basic`; bản thân dịch vụ này không thêm prompt, message, schema, tool hay lệnh gọi model nào.

#### Ảnh hưởng KV Cache

Không làm mất hiệu lực trực tiếp; thay đổi prefix (tiền tố) request do các bên tiêu thụ nêu trên chịu trách nhiệm.

## Hạn chế đã biết và công việc hoãn lại

- **Quy tắc heuristic cố định là giá trị gần đúng**: nội dung không thể tái sử dụng mức sử dụng của nhà cung cấp được định giá theo số ký tự cộng chi phí cấu trúc, thay vì dùng tokenizer chính xác của nhà cung cấp hoặc request serializer (bộ tuần tự hóa).
- **Mỗi lần đo đều clone lớp bề mặt hiện tại**: snapshot nhất quán và bất biến khiến việc đọc có độ phức tạp O(surface), bao gồm cả việc kiểm tra áp lực dưới ngưỡng.
- **Mức sử dụng của nhà cung cấp chỉ được tái sử dụng cho envelope chuẩn hoàn toàn giống nhau**: thay đổi prompt, prefix, tool, nhà cung cấp, model hoặc cấu hình gọi sẽ cố ý quay về ước lượng heuristic đầy đủ.
- **Xử lý thận trọng với bản ghi cũ thiếu source event seq**: message assistant không có `sourceEventSeqs` không thể phân biệt output của nhà cung cấp với việc listener viết lại, do đó fold sẽ không khẳng định là luồng trống đã biết hay luồng chunk chính xác.
