# Agent Note: Kiểm tra định dạng API Key trước khi nó đi vào HTTP header

Status: implemented

[English](2026-08-06-api-key-format-validation.md) | Tiếng Việt

## Vấn đề

Một API Key chứa ký tự mà HTTP header value không thể mang theo từng được mọi lối vào cấu hình chấp nhận, và chỉ thất bại khi dựng request — cách rất xa cái ô nhập đã gây ra nó.

Dán một Key chứa emoji, chữ Trung–Nhật–Hàn hay dấu câu toàn phần vào trang cài đặt model trên Web, việc lưu vẫn báo thành công. Lượt đầu tiên lập tức thất bại với lỗi `Cannot convert argument to a ByteString because the character at index 7 has a value of 55357 which is greater than 255` — trong đó chỉ số và code point là chi tiết nội bộ của UTF-16, không kèm hành động nào có thể thực hiện, mà lại còn để lộ code point của một ký tự trong Key. `llm-deepseek` sinh ra câu này vì `fetch` dựng header `Bearer` bên trong khối `try` ở [adapter.ts](../../../../packages/llm/llm-deepseek/src/adapter.ts), còn khối `catch` đó gán nhãn `TRANSPORT` cho mọi thất bại; nhãn này lại nằm trong `DEFAULT_RETRYABLE_CODES`, nên một lỗi vĩnh viễn và tất định còn bị thử lại ba lần.

Cùng đầu vào đó trên `llm-pi-ai` còn tệ hơn. Nhánh dò tìm của nó dựng đúng header ấy bằng `fetch` trần trong [discovery.ts](../../../../packages/llm/llm-pi-ai/src/discovery.ts), rồi bọc mọi thất bại thành `could not reach <url>`, khiến một lỗi Key cục bộ bị báo thành không tới được mạng. Nhánh dò tìm này chạm tới được từ trước khi lưu: `ProviderEditor` đưa thẳng `keyDraft` do người dùng nhập vào request dò tìm, nên nút «lấy danh sách model» sẽ gửi Key không hợp lệ đi trước khi bất cứ thứ gì kịp ghi xuống đĩa.

Ký tự trắng thì lọt qua mọi lớp kiểm tra. `ProviderEditor` chỉ xét `keyDraft.length`, nên một Key gồm ba dấu cách vẫn được lưu, rồi sau đó dùng `Bearer` cộng vài dấu cách để xác thực. Cả hai adapter đều không kiểm tra Key đến từ credential hay từ biến môi trường — mà đó lại chính là đường ghi của trang Models, tức đường mà người dùng thực sự đi.

## Quyết định

Một quy tắc duy nhất định nghĩa thế nào là Key hợp lệ: **sau khi trim thì không rỗng, và mọi ký tự đều nằm trong `[\x21-\x7E]`** — ASCII in được, không có dấu cách.

Một khẳng định này phủ hết mọi đầu vào đã được báo cáo: rỗng, khoảng trắng đầu/cuối, khoảng trắng ở giữa, ký tự điều khiển C0, emoji, chữ Trung–Nhật–Hàn, dấu câu toàn phần. Nó cũng đúng là ràng buộc đã gây ra lỗi ByteString, nên những thất bại này hội tụ về cùng một định nghĩa, chứ không phải hai bản sửa tình cờ liên quan tới nhau.

Quy tắc thứ hai hẹp hơn dùng để nhận ra trường hợp dán nguyên dòng biến môi trường: đầu vào khớp `^[A-Z][A-Z0-9_]*=[^=]` hoặc bị bọc bởi cặp dấu nháy đầu–cuối sẽ bị từ chối. Việc giới hạn tiền tố phải viết hoa toàn bộ giúp Key thật miễn nhiễm — dạng như `sk-` sẽ đứt mạch khớp định danh ngay tại dấu gạch nối — còn việc đòi hỏi ký tự sau dấu phân tách phải khác `=` thì giúp phần padding của base64 cũng miễn nhiễm. Nó báo đúng lỗi định dạng như trường hợp ký tự bất hợp lệ, chứ không có câu riêng: người đọc nó sẽ làm bước tiếp theo y hệt nhau, nên tách riêng một câu chỉ nêu thêm một nguyên nhân mà không đổi việc cần làm.

### Bất biến thuộc về mọi tầng, heuristic thuộc về tầng có con người

Quy tắc về tập ký tự là một bất biến. Ký tự không phải ASCII **không thể** truyền trong header value với bất kỳ provider nào, nên việc thực thi nó trong trình duyệt, trong từng resolver và ở mỗi lần đọc credential là sự nhất quán về cấu trúc, không phải nhất quán theo quy ước.

Quy tắc về hình dạng là phỏng đoán về cách con người dán, nên **chỉ chạy trong trình duyệt**. Phía trước `llm-pi-ai` là OpenAI, Anthropic cùng bất kỳ gateway khai báo thủ công nào, và repo này không nắm được định dạng Key của chúng; nếu quy tắc đó chạy trong resolver, một gateway cấp Key dạng `TENANT1=abc` sẽ khóa chặt người dùng không còn lối thoát — trang cài đặt từ chối nó, mà file `.env` viết tay cũng bị từ chối lúc đọc. Giới hạn heuristic ở đúng tầng diễn ra thao tác dán thì biến môi trường luôn còn là lối ra.

### «Không có Key» là một trạng thái cấu hình, không phải thiếu sót

Quy tắc tác động lên giá trị *đã được cung cấp*; còn chuyện rốt cuộc có cung cấp hay không thì từng bên gọi tự quyết định.

**Không nêu tên credential.** Profile pi-ai bỏ qua `apiKeyEnv` có thể xác thực bên ngoài đường credential do harness nắm giữ. `routeAuth` trong [provider.ts](../../../../packages/llm/llm-pi-ai/src/provider.ts) giữ lại phần xác thực của chính provider trong catalog dựng sẵn, chính là để cơ chế khám phá ambient nguyên bản của provider tiếp tục hoạt động; còn `openai-codex` đi kèm catalog đó thì xác thực bằng OAuth. `namesCredential` mang sự phân biệt này; việc bỏ qua không phải một giá trị cần kiểm tra.

**Ô nhập để trống trong Web UI.** Ngay cả khi Key của một provider đã được lưu, ô nhập đó vẫn mở ra ở trạng thái trống — dòng chữ của `keyStored` ghi «đã cấu hình — nhập giá trị mới để thay thế» — nên để trống nghĩa là *giữ nguyên giá trị đã lưu*. `ProviderEditor` bỏ qua hoàn toàn `credentials.set` khi bản nháp rỗng, và điều này giữ nguyên: để trống thì tuyệt đối không chặn việc gửi biểu mẫu, nếu không thì chỉ đổi một base URL cũng phải nhập lại Key.

**Giá trị phân giải ra chỉ chứa khoảng trắng.** Cả hai adapter đều coi đó là bất hợp lệ, vì nó không thể xác thực cho request. Trong trình duyệt, đây cũng là lỗi ở cấp trường nhập: trường nhập là nơi con người vừa gõ vào, và âm thầm vứt bỏ thứ họ gõ không bao giờ là câu trả lời đúng.

Vì vậy `normalizeApiKey` nhận `string`, tuyệt đối không phải `string | undefined`.

### Quy tắc sống ở đâu

`normalizeApiKey` là một module của Service Definition `dsh-llm`, đặt ngang hàng với [attribution.ts](../../../../packages/llm/llm/src/attribution.ts) vốn đã đảm nhận phần việc header dùng chung. Cả hai adapter đều dựa vào seam này và đều cần quy tắc đó, nên nó có hai bên tiêu thụ hiện hữu chứ không phải một bên tiêu thụ giả định. Nó trả về giá trị đã trim, hoặc một lý do (`empty`, `illegalCharacters`).

Cả hai adapter cũng cần đúng cùng một câu chẩn đoán «từ chối một credential đã lưu», chỉ khác nhau ở tiền tố tên package. `LlmError` được khai báo trong `index.ts` của Service Definition, nên `assertUsableApiKey(raw, pkg, ref)` sống ngay cạnh nó, và không adapter nào phải giữ thêm một bản riêng. Bản thân module khẳng định vẫn giữ nguyên trạng thái không phụ thuộc: đưa `LlmError` vào `api-key.ts` sẽ tạo vòng lặp với việc `index.ts` tái xuất nó.

Phía client không thể import bất kỳ thứ nào trong số đó: package client chỉ reference package client, nên `packages/client/ui-settings-models` phản chiếu khẳng định này trong `apiKey.ts` của chính nó và giữ phần văn bản đã bản địa hóa, hệt như `validateDeepSeekModels` phản chiếu schema `catalogModel` phía host. Hai bên nêu đích danh nhau trong comment.

### Mỗi nơi làm gì

| Vị trí | Hành vi |
|---|---|
| `dsh-llm` | Sở hữu `normalizeApiKey`, `assertUsableApiKey` và `INVALID_CREDENTIAL_CODE`, trong đó hằng cuối cố ý không nằm trong `DEFAULT_RETRYABLE_CODES`. |
| `llm-deepseek` `resolveApiKey` | Chuẩn hóa giá trị trả về từ seam credential hoặc từ biến môi trường, từ chối bằng `INVALID_CREDENTIAL`, thông điệp chỉ rõ trang cài đặt model, và tuyệt đối không hiển thị lại Key. |
| `llm-pi-ai` `resolveApiKey` | Chuẩn hóa cả đường credential lẫn đường biến môi trường. Profile không chỉ định credential nào vẫn trả về `undefined`, các tuyến ambient và OAuth không bị ảnh hưởng. |
| `llm-pi-ai` `discoverModels` | Chuẩn hóa trước khi dựng header, khiến Key bất hợp lệ trở thành lỗi credential chứ không phải endpoint không truy cập được. Lần dò tìm không kèm Key vẫn giữ nguyên trạng thái không xác thực. |
| `ui-settings-models` | Phản chiếu quy tắc về tập ký tự, bổ sung heuristic về hình dạng, trim `keyDraft` trước khi dò tìm và trước `credentials.set`, đồng thời sửa lại phép xét giá trị rỗng của `stringAt`. Ô nhập để trống vẫn là thao tác rỗng có thể gửi được; ô nhập chỉ chứa khoảng trắng thì là lỗi ở cấp trường. Cả việc gửi biểu mẫu **lẫn việc dò tìm endpoint** đều bị chặn, nên một khóa bị từ chối sẽ không tốn một vòng khứ hồi vô ích để đổi lấy câu trả lời vốn đã ghi ngay trên trường nhập; lỗi được trình bày ngay tại trường, nhất quán với mẫu `modelFailure` sẵn có. |

`ProviderEditor` phục vụ cả hai bố cục DeepSeek và pi-ai, nên một thay đổi phía client phủ được cả hai provider. `CustomProviderCard` mang cùng bộ phán định cho các tuyến khai báo thủ công.

`credentials-local` cố ý giữ nguyên. Nó lưu đủ loại credential, mà ASCII in được là ràng buộc của HTTP header chứ không phải ràng buộc của kho credential; hành vi sẵn có của nó — từ chối mọi giá trị mà cú pháp dotenv không biểu diễn được — giữ nguyên như cũ.

## Các phương án từng cân nhắc

**Cho client và host dùng chung một module kiểm tra.** Bị bố cục source plane bác bỏ: package client chỉ reference package client cộng thêm `vendor/cordis` và `runtime-diagnostics/invariants`, nới nó ra tới mức chạm được package host sẽ đụng phải việc gộp hai bản `Context` mà chính sự phân tách này sinh ra để cách ly. Phản chiếu một dòng khẳng định ở mỗi bên kèm bộ test riêng chính là hình thái đã định ở đây.

**Giữ một helper ném lỗi riêng trong `llm-deepseek` và `llm-pi-ai`.** Kế hoạch ban đầu đúng là giữ mỗi bên một bản, chỉ khác tiền tố tên package trong thông điệp, kèm một miễn trừ cho bộ phát hiện trùng lặp để cho cặp này đi qua. Phương án bị bác bỏ trước cả khi triển khai: `LlmError` được khai báo trong Service Definition, nên package đó hoàn toàn có thể tự sở hữu câu chẩn đoán này, còn một miễn trừ ở đó lại đúng là thứ che đi chính sự trùng lặp mà nó định che.

**Đánh hơi `TypeError` trong khối `catch` của adapter.** Cách này chỉ phân loại lỗi ByteString sau khi sự đã rồi, còn bản thân việc dựng header vẫn không được bảo vệ. Nó phụ thuộc vào cách hành văn của thông điệp lỗi Node, nên sẽ âm thầm hỏng theo phiên bản runtime; nó cũng chẳng giúp được `llm-pi-ai` — bên đó dựng header của request bên trong pi-ai SDK. Từ chối ngay trước khi giao Key ra thì có hiệu lực đồng thời cho cả hai adapter lẫn nhánh dò tìm.

**Thực thi trong `credentials-local.set`.** Cách này chặn được mọi bên ghi trong một lần, kể cả file chỉnh tay. Nó thất bại vì provider đó lưu đủ mọi loại credential, mà một quy tắc bắt nguồn từ cách mã hóa HTTP header thì không thuộc về nó.

**Cho heuristic về hình dạng chạy luôn trong resolver.** Đối xứng hơn, và chặn được cả dòng biến môi trường viết thẳng vào `.env`. Bị bác bỏ vì rủi ro khóa chặt đã nói ở trên: một lần phán nhầm trong resolver sẽ khiến người dùng không còn đường đi, còn một lần phán nhầm trong trình duyệt thì vẫn còn lối biến môi trường.

**Dò tìm provider lúc lưu để chứng minh Key dùng được.** Cách này khép lại đúng chuyện được báo cáo ban đầu — lưu thì báo thành công, tới lượt đầu tiên mới thất bại. Bị bác bỏ vì vượt phạm vi, và trên codebase lúc đó cũng không dựng được: với những provider mà pi-ai vừa hay có sẵn catalog, `discoverModels` sẽ đoản mạch về catalog dựng sẵn trước cả khi có lời gọi mạng nào, nên chẳng xác minh được gì về Key; còn thẻ DeepSeek thì hoàn toàn không có bước dò tìm. Giá trị của bộ xác minh nằm ở chỗ phân biệt «Key bị từ chối» với «không kết nối được», mà đó đúng là sự phân biệt được thay đổi lần này làm cho đáng tin cậy; dựng bộ xác minh trước thì chỉ thu được một bộ xác minh không phân biệt nổi kết quả của chính nó. Các sản phẩm cùng loại cũng không xác minh lúc lưu, nên một lời gọi mạng chặn luồng lúc lưu sẽ là hành vi gây bất ngờ, chứ không phải một chỗ còn thiếu.

## Hệ quả

Key sai định dạng bị từ chối ngay tại trường nhập đang giữ nó; Key sai định dạng đã lưu thì thất bại với `INVALID_CREDENTIAL`, thông điệp chỉ rõ nơi cần sửa và không chứa mảnh nào của Key. Vì code này nằm ngoài `DEFAULT_RETRYABLE_CODES`, một lỗi credential tất định không còn bị thử lại ba lần như thể nhiễu truyền tải nhất thời. Nhánh dò tìm của `llm-pi-ai` báo Key bất hợp lệ là lỗi credential, chứ không phải endpoint không truy cập được.

Heuristic về hình dạng có thể từ chối một Key thật. Khớp mọi dạng «định danh viết hoa toàn bộ nối với `=`» sẽ phủ rộng hơn dự kiến: một Key base64 viết hoa toàn bộ kết thúc bằng padding (`ABCD==`) sẽ trúng dạng gán giá trị mà nó vốn không giống. Đòi hỏi ký tự sau dấu phân tách phải khác `=` là đủ để loại phần padding ra — padding của base64 chỉ xuất hiện ở cuối. Hình thái còn lại (tên viết hoa, một dấu `=`, rồi tới giá trị) là thứ mà các provider đã biết không cấp phát, và quy tắc này chỉ chạy trong trình duyệt, nên người dùng nào vẫn đụng phải nó thì có thể đặt credential qua biến môi trường. Cái giá còn lại là một lần từ chối gây bối rối đối với một loại Key mà chưa ai từng báo cáo.

Giới hạn ở ASCII in được thì chặt hơn yêu cầu của bản thân tầng truyền tải: header value hoàn toàn có thể mang `\x80`–`\xFF`. Cho latin-1 đi qua sẽ khiến `é` lọt lưới và đổi lại một lỗi 401 mơ hồ, thay vì một lần từ chối cục bộ có giải thích, nên việc siết chặt là cố ý. Nếu có provider nào cấp Key latin-1 thì quy tắc này cần được nới ra.

Khẳng định về tập ký tự tồn tại hai bản, mỗi source plane một bản. Bố cục cấm chia sẻ nó; hai bên đều có test riêng và nêu đích danh bản sinh đôi của mình trong comment.

Key đã lưu từ phiên bản trước sẽ được đọc qua `resolveApiKey`, nên một giá trị cũ bất hợp lệ sẽ thất bại ngay từ lúc phân giải chứ không đợi tới lúc gửi request. Chẩn đoán tốt lên, nhưng với người đang giữ loại giá trị này thì điểm thất bại xảy ra sớm hơn.

Cái giá lớn nhất nếu làm sai chuyện này là coi «không chỉ định» thành «bất hợp lệ»: một quy tắc áp lên `undefined` sẽ chặt đứt mọi tuyến dựa vào khám phá ambient hoặc xác thực OAuth, còn một ô nhập rỗng mà chặn việc gửi biểu mẫu sẽ khiến mọi thay đổi cài đặt khác đều phải nhập lại Key. Cả hai điểm này đều được test chốt lại, chứ không chỉ trông cậy vào sự cẩn thận.

## Kiểm thử

`packages/llm/llm/tests/api-key.spec.ts` chạy `normalizeApiKey` và `assertUsableApiKey` qua trọn bảng đầu vào — rỗng, toàn khoảng trắng, có khoảng trắng đầu/cuối, có dấu cách ở giữa, ký tự điều khiển C0, emoji, chữ Trung–Nhật–Hàn, ký tự toàn phần, latin-1, cùng các ký tự biên của ASCII in được — và chốt rằng một lần từ chối mang theo `INVALID_CREDENTIAL` và không chứa bất kỳ phần nào của Key.

`packages/llm/llm-deepseek/tests/` phủ đường credential đã lưu theo kiểu đầu-cuối trong `dynamic-config.spec.ts` qua seam credential thật (không phải stub). `packages/llm/llm-pi-ai/tests/` phủ nhánh dò tìm, bao gồm việc lần dò tìm không kèm Key sẽ không phát ra header `authorization`.

`packages/client/ui-settings-models/tests/` dùng chính bảng đó cộng thêm các ca về hình dạng để chốt `apiKeyFailure`, và chạy cả hai thẻ: ô nhập để trống thì gửi được và không ghi credential, ô nhập chỉ chứa khoảng trắng thì lỗi ngay tại trường, Key bất hợp lệ hoặc bị bọc dấu nháy thì chặn cả việc gửi lẫn việc dò tìm, Key có khoảng trắng đầu/cuối thì được trim trước `credentials.set` và trước khi dò tìm, và tuyến khai báo thủ công có thể tạo mà hoàn toàn không cần Key.

Trạng thái cuối mà người dùng nhìn thấy thì được chốt tại đúng nơi nó thực sự được lắp ráp: `examples/headless-agent/tests/headless.snapshot.ts` cho ứng dụng one-shot chạy với một khóa đã lưu mà HTTP header không mang nổi, tái sử dụng đúng bộ composition không khóa của kịch bản anh em missing-credential, và ghi lại rằng lượt đó kết thúc bằng `INVALID_CREDENTIAL`, thông điệp có thể hành động, không chứa khóa cũng không chứa chữ `ByteString`. Test ở cấp package không chứng minh được điều này, còn web e2e thì chỉ phủ nửa phần trình duyệt.
