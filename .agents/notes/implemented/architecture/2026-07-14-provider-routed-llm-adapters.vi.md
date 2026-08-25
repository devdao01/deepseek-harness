# Agent Note: Adapter LLM định tuyến theo provider và backend pi-ai đa dụng

Status: implemented

[English](2026-07-14-provider-routed-llm-adapters.md) | 中文

## Vấn đề

`dsh-llm` đăng ký adapter theo tên model chính xác. Plugin cung cấp danh sách model khi Cordis khởi động, `LlmRuntime` lưu một adapter cho mỗi chuỗi trong danh sách, và `GenerateOptions.model` vừa chọn adapter vừa chọn model của provider. Cách này hoạt động khi cả hai adapter đi kèm đều chỉ nhắm tới cùng hai model DeepSeek, nhưng nó gộp lẫn hai quyết định độc lập: provider thượng nguồn nào sẽ nhận request, và provider đó nên chạy model nào.

Sự gộp lẫn này khiến các gateway provider không thể cung cấp một model catalog mở. Ví dụ, OpenRouter là một provider có rất nhiều model ID, và các endpoint tương thích OpenAI riêng tư cũng có thể thêm model mà không cần sửa cây plugin Harness. Hiện tại, mỗi model mới được chọn đều phải hoàn tất đăng ký trong lúc plugin khởi động. Cùng một model ID còn có thể tồn tại ở nhiều provider, nên chỉ đăng ký theo model thì không thể diễn đạt provider mà bên gọi mong muốn sử dụng.

`dsh-llm-pi-ai` không expose abstraction provider của pi-ai. Nó dựng inline model `openai-completions` của DeepSeek, áp patch payload riêng cho DeepSeek, và đánh dấu mỗi tin nhắn assistant được replay là DeepSeek. Bản thân pi-ai cung cấp catalog provider/model, có thể chọn API `openai-responses`, `anthropic-messages`, `google-generative-ai`, v.v., và giữ lại response ID riêng của provider, cùng chữ ký reasoning và tool cần cho các lượt tiếp theo. Chuyển đổi của Harness bỏ mất việc định tuyến provider/model và các field response riêng của provider, vì vậy chỉ thay inline model bằng truy vấn catalog sẽ dẫn đến replay cùng model và bàn giao xuyên provider không đầy đủ.

Cấu hình adapter cũng giả định chỉ tồn tại một API key và endpoint DeepSeek. Backend đa dụng cần cấu hình credential và override endpoint riêng cho từng provider, đồng thời vẫn để pi-ai xử lý các cơ chế xác thực theo môi trường như AWS, Google ADC, OAuth.

## Quyết định

### Provider là khóa đăng ký adapter

`GenerateOptions` và `LlmCallConfig` mang `provider: string` bên cạnh `model: string`, còn `AgentOptions` mang field tạo mới tương ứng (tùy chọn). Request agent loop chỉ hợp lệ khi cả hai giá trị đều khác rỗng; cả hai cũng được ghi vào log header của request. `agent/request` có thể trả về tổ hợp field đã thay thế ở bất kỳ bước nào, vì vậy một phiên có thể chuyển provider và model mà không cần thay đổi vòng đời plugin Cordis.

`LlmRuntime` đăng ký và phân giải adapter theo provider. `registerAdapter(providers, adapter)` kiểm tra toàn bộ danh sách provider trước khi sửa registry, trả về `DUPLICATE_ADAPTER` khi gặp trùng lặp, và dispose (giải phóng tài nguyên) toàn bộ như một effect. Model ID không phải là khóa đăng ký; việc validate hay forward vẫn do adapter được chọn đảm nhiệm. [Agent Note về LLM catalog và chọn model ACP](2026-07-15-llm-model-catalog-and-acp-selection.md) sau đó bổ sung interface khám phá `listProviders()` / `listModels()` mang tính gợi ý, nhưng không biến tư cách thành viên catalog thành quy tắc validate request.

Trong một Cordis context, một provider chỉ có thể có một adapter sở hữu. `dsh-llm-deepseek` đăng ký `deepseek`; `dsh-llm-pi-ai` cũng có thể đăng ký `deepseek`, nhưng nạp cả hai chủ sở hữu cùng lúc là lỗi cấu hình, không áp dụng quy tắc thứ tự hay hành vi fallback. Nếu deployment chọn triển khai DeepSeek viết tay, cần loại `deepseek` khỏi cấu hình pi-ai; nếu deployment chọn triển khai DeepSeek của pi-ai, thì không mount `dsh-llm-deepseek`.

`dsh-llm-deepseek` loại bỏ danh sách đăng ký model, chấp nhận bất kỳ chuỗi model nào được định tuyến qua provider `deepseek`. Việc serialize request, endpoint `/chat/completions`, tùy chọn thinking, parse SSE (Server-Sent Events) và hành vi lỗi giữ nguyên; `options.model` vẫn được gửi nguyên trạng.

### Cấu hình provider pi-ai tường minh

`dsh-llm-pi-ai` nhận một danh sách cấu hình provider không rỗng. Tên provider trong danh sách phải duy nhất và phải tồn tại trong kết quả `getProviders()` của pi-ai. Mỗi mục cấu hình gồm tên provider, cùng các field tùy chọn `apiKey`, `baseURL`, headers, mức độ và ngân sách reasoning, cài đặt giữ cache, phương thức transport, timeout SDK, timeout idle stream của Harness, và `retryPolicy` do provider sở hữu. Adapter ép `maxRetries` của pi-ai về 0, để một lần gọi `stream()` chỉ phát ra một request provider có thể quan sát được; `dsh-llm-retry` thực thi policy đã phân giải tại extension point của bước lỗi agent. Credential không có giá trị toàn cục: key tường minh chỉ có hiệu lực với cấu hình sở hữu nó; khi không cung cấp key, pi-ai dùng biến môi trường chuẩn, OAuth token, chuỗi credential AWS, Google ADC, hoặc cơ chế xác thực môi trường gốc khác của provider. Key rỗng tường minh là cấu hình không hợp lệ, không fallback về xác thực môi trường.

Plugin đăng ký tất cả tên provider đã cấu hình vào cùng một `PiAiAdapter` qua một lần gọi tất-cả-hoặc-không-gì. Request chọn cấu hình tương ứng theo provider, và tra model trong `getModels(provider)` để lấy descriptor catalog. Provider không xác định sẽ khiến plugin load thất bại; model không xác định sẽ thất bại với `UNKNOWN_MODEL` trước khi có I/O mạng. Adapter không sửa đổi đối tượng catalog. Khi cấu hình cung cấp `baseURL`, adapter sao chép descriptor đã chọn và chỉ override `baseUrl`, để endpoint riêng tư vẫn giữ API, năng lực, cờ tương thích, giới hạn context và ánh xạ reasoning của pi-ai. Endpoint riêng tư phải triển khai đúng protocol của provider đã chọn, và model ID vẫn phải tồn tại trong catalog pi-ai đã cài đặt.

Adapter gọi `streamSimple()` của pi-ai, nên mỗi model trong catalog sẽ dùng đúng triển khai API đã đăng ký của nó; khi descriptor là `openai-responses`, hệ thống dùng OpenAI Responses thay vì Chat Completions. Temperature, số token tối đa, signal, session ID của Harness, cùng các tùy chọn stream chung trong cấu hình provider đều được truyền thẳng. Headers cấu hình được gộp với headers quy thuộc bắt buộc của Harness; khi có xung đột tên header dành riêng, headers quy thuộc của Harness được ưu tiên. Adapter không còn duy trì việc ghi đè payload riêng cho DeepSeek hay ma trận protocol riêng cho từng provider.

Tùy chọn stream chung của pi-ai không hỗ trợ stop sequence. Nếu tùy chọn `stop` của Harness đã được định nghĩa, `dsh-llm-pi-ai` sẽ từ chối request với `UNSUPPORTED_OPTION`, không âm thầm bỏ qua, cũng không thêm một bộ triển khai payload riêng cho provider thứ hai. `dsh-llm-deepseek` vẫn tiếp tục hỗ trợ `stop` qua serializer request gốc.

### Trạng thái định tuyến assistant và replay đã được ghi log

Tin nhắn assistant mang `provider` và `model` của request, cùng trạng thái replay của adapter (tùy chọn, JSON-serializable). Sự kiện session `assistant/message` thành công ghi lại các field này, và `deriveMessages()` khi trả về tin nhắn assistant cũng bao gồm chúng. Tin nhắn user, system, context và kết quả tool không mang các field định tuyến assistant. Field provider/model là dữ liệu có thẩm quyền của agent loop; adapter chỉ sở hữu payload trạng thái replay không minh bạch (opaque) của riêng nó.

Đoạn kết thúc `finish` thành công có thể mang trạng thái replay dưới dạng `ReplayEnvelope`: metadata cấp response không minh bạch, cộng thêm các mục theo-từng-block (tùy chọn) được căn chỉnh với chuỗi block đã phát ra. `BlockAssembler` chỉ đưa ra một quyết định giữ/bỏ cho cả nội dung và metadata — khi việc lắp ráp do max-token loại bỏ một tool call, mục dữ liệu ở cùng vị trí cũng bị loại bỏ theo — nên trạng thái mà agent loop đính kèm vào nguồn gốc model của tin nhắn assistant đã lắp ráp luôn mô tả đúng các block đã lưu, xem [quyết định căn chỉnh trạng thái replay max-token](../bug-fix/2026-08-15-max-token-replay-state-alignment.md). Agent loop không expose hook viết lại response. Response lỗi hoặc bị hủy sẽ không tạo ra tin nhắn assistant bình thường, do đó không đi vào lịch sử model ở các lượt sau.

Trạng thái replay của pi-ai được điền bằng một phép chiếu tối thiểu có phiên bản của `AssistantMessage` thành công của nó: một nửa response (API/provider/model nguồn, response ID/model, stop reason), cùng chữ ký text, chữ ký thinking và chữ ký tool call theo từng block. Nó không lặp lại text hay tham số tool đã có sẵn trong content block của Harness, cũng không chứa thông tin chẩn đoán, timestamp, usage hay lỗi. Trong các request sau, `LlmRuntime` chỉ trao trạng thái replay cho adapter đích khi provider lịch sử và provider đích hiện đang thuộc cùng một instance adapter. Khi có thể khôi phục response lịch sử, adapter kết hợp nội dung do Harness ghi lại với trạng thái replay, và chịu trách nhiệm cho các chuyển đổi xuyên model hoặc xuyên provider cần thiết. Nội dung đã persist vẫn giữ vai trò có thẩm quyền: nếu adapter nhận trạng thái replay không thể dùng được — kind hoặc phiên bản không xác định, metadata sai định dạng, hoặc cấu trúc block không còn khớp nội dung — nó sẽ hạ cấp tin nhắn đó thành chuyển đổi không phụ thuộc provider và kèm chẩn đoán; các adapter khác chỉ nhận được nội dung không phụ thuộc provider cùng các field provider/model.

Trạng thái này thuộc loại input replay hiển thị với model, do đó tuân theo [quy tắc có thể tái dựng request](2026-07-05-reconstructable-requests.md) hiện có: nó tồn tại đồng thời trong đoạn kết thúc `finish` và trong nguồn gốc model của `assistant/message` đã lắp ráp được dẫn xuất. Resume và fork giữ nguyên trạng thái này. Khi compaction (nén) che tin nhắn assistant, trạng thái replay của nó cũng bị loại khỏi surface đang hoạt động; bản tóm tắt là nội dung không phụ thuộc provider bình thường.

### Lan truyền target trong mọi bên tạo request

Mỗi đường chọn model đều mang cả provider lẫn model: agent khai báo, cấu hình ứng dụng ACP (Agent Client Protocol) và stdio, request initialize JSON-RPC, override và kế thừa của subagent, override subagent trong workflow, và bản tóm tắt compaction trực tiếp. Subagent trước tiên kế thừa cả hai field từ agent cha, sau đó mới áp override của request. Tập biến của system prompt thêm `provider` bên cạnh `model`.

Cấu hình compaction thêm `summarizationProvider` bên cạnh `summarizationModel`. Khi cả hai giá trị đều rỗng thì kế thừa, khi cả hai đều khác rỗng thì chọn target tường minh; chỉ cấu hình một trong hai sẽ khiến việc load thất bại. Kế thừa ưu tiên dùng target của request được ghi gần nhất, nếu không có sẽ fallback về tùy chọn tạo agent. `compaction/summary` dùng envelope gọi model hiện có để ghi lại cả hai field.

Runtime JSON-RPC nhận tường minh cả provider lẫn model. Fallback tiện lợi của nó chỉ mount `dsh-llm-deepseek` khi provider `deepseek` chưa có chủ sở hữu đăng ký; các provider thiếu khác sẽ thất bại trực tiếp, không đoán adapter.

Định dạng session trên đĩa vẫn dùng phiên bản `0` cố định trong giai đoạn pre-release, và không cam kết tương thích. Việc validate seed/load sẽ từ chối request header và tin nhắn assistant thiếu field provider/model bắt buộc, không chấp nhận định dạng cũ vốn đã không thể tái dựng request.

## Phương án thay thế đã cân nhắc

**Tiếp tục dùng tên model làm khóa registry, và thêm adapter wildcard.** Cơ chế wildcard sẽ tạo ra thứ tự fallback giữa đăng ký chính xác và plugin bắt-tất-cả, khiến quyền sở hữu trùng lặp phụ thuộc vào thứ tự listener; nếu không thêm quy ước khác, vẫn không thể phân biệt cùng một model ID ở các provider khác nhau.

**Mã hóa provider và model vào một chuỗi.** Các giá trị như `openai/gpt-*` của OpenRouter đã có sẵn tiền tố kiểu provider và dấu gạch chéo. Quy ước dấu phân cách sẽ làm rò rỉ cú pháp định tuyến vào mọi bộ chọn model và cần quy tắc escape; hai field tường minh rõ ràng hơn, và cũng có thể ghi log riêng biệt.

**Thêm `backend + provider + model`.** Khóa backend có thể cho phép `dsh-llm-deepseek` và triển khai DeepSeek của pi-ai cùng tồn tại, và chuyển đổi theo từng request. Quy tắc deployment cuối cùng được chọn là một provider ứng với một adapter sở hữu: các triển khai khác nhau của cùng một thượng nguồn là phương án thay thế được chọn bởi tổ hợp plugin. Chiều định tuyến thứ ba sẽ tăng gánh nặng cho mỗi request và cấu hình mà không có bên tiêu thụ hiện tại.

**Để `dsh-llm-pi-ai` tự động đăng ký tất cả provider của pi-ai.** Cách này sẽ chiếm dụng credential môi trường và tên provider mà deployment không có ý định expose, và xung đột với các adapter gốc như `dsh-llm-deepseek`. Cấu hình tường minh cho phép soát xét năng lực và phạm vi credential.

**Mount một instance plugin pi-ai cho mỗi provider.** Instance độc lập có thể cô lập cấu hình, nhưng sẽ lặp lại khai báo plugin và không thể đạt tính nguyên tử cho việc đăng ký cấu hình. Vốn dĩ mỗi request đã cung cấp provider cho cùng một adapter, nên interface vòng đời của cấu hình đã được validate có phạm vi nhỏ hơn.

**Chấp nhận descriptor model pi-ai inline tùy ý.** Cách này có thể hỗ trợ model ID riêng tư nằm ngoài catalog, nhưng sẽ expose schema model và tương thích của pi-ai thành cấu hình Harness, và yêu cầu adapter validate tổ hợp riêng cho từng protocol. Phiên bản hiện tại hỗ trợ endpoint tùy chỉnh bằng cách override `baseURL` của model trong catalog; chỉ khi thực sự xuất hiện nhu cầu deployment ngoài catalog mới quyết định riêng có hỗ trợ descriptor tùy chỉnh hay không.

## Tác động

- Tên provider là khóa sở hữu định tuyến trong phạm vi deployment: hai provider có thể dùng chung chuỗi model, nhưng mount hai adapter cho cùng một provider sẽ thất bại lúc load, không tạo ra thứ tự fallback.
- Việc chọn model không còn thay đổi đồ thị plugin Cordis. Adapter kiểu catalog có thể chấp nhận bất kỳ model catalog đã cài đặt nào được chọn sau khi khởi động, còn adapter DeepSeek gốc sẽ forward bất kỳ model ID DeepSeek nào.
- `baseURL` tùy chỉnh giữ nguyên protocol và năng lực của model catalog đã chọn, nhưng không làm cho model ID ngoài catalog trở nên hợp lệ. Endpoint riêng tư phải triển khai đúng protocol tương ứng với mục catalog đó.
- Credential, tùy chọn transport, timeout SDK của pi-ai, cùng cơ chế timeout idle `streamIdleTimeoutMs` mặc định năm phút đều được cô lập theo cấu hình từng provider. Hệ thống vô hiệu hóa retry ẩn của provider; retry có giới hạn do chính sách phục hồi agent được tổ hợp riêng đảm nhiệm.
- API stream chung của pi-ai không thể diễn đạt stop sequence, nên `dsh-llm-pi-ai` sẽ từ chối stop sequence; adapter DeepSeek gốc vẫn hỗ trợ stop sequence.
- Trạng thái replay chỉ có thể mang theo được khi provider lịch sử và provider đích cùng thuộc một instance adapter. Adapter chịu trách nhiệm khôi phục xuyên provider và xuyên model; các adapter khác chỉ nhận lịch sử không phụ thuộc provider, không có trạng thái không minh bạch.
- JSONL session pre-release hiện tại yêu cầu cả request header lẫn tin nhắn assistant đều chứa provider/model. Định dạng cũ vẫn dùng phiên bản `0`, nhưng sẽ bị từ chối, không thực hiện migrate.

## Kiểm thử

- Unit test bao phủ xung đột registry, tái dựng request, validate session, phân giải cấu hình, forward tùy chọn cho một request đơn, việc chọn API gốc bao gồm cả OpenAI Responses, chuyển đổi, validate replay, ánh xạ lỗi, hủy bởi bên gọi, kết thúc transport do idle timeout, viết lại nội dung, và phân phối replay giữa cùng instance lẫn khác instance.
- Test agent loop/session không cần key và snapshot ACP bao phủ việc persist metadata provider/model, lan truyền resume và fork, override workflow/subagent, và transcript (bản ghi) hiển thị với người dùng không đổi; test e2e DeepSeek có cổng key giữ độ bao phủ stream thực của provider và gọi tool tiếp theo.
- JSDoc công khai, README package, tài liệu kiến trúc và hệ thống con, catalog sinh tự động, ví dụ, fixture (dữ liệu chuẩn bị trước cho test) session và tài liệu Python SDK song hành đều thống nhất dùng target provider/model, và được xác thực bởi các gate tài liệu và tương đương kiểu dữ liệu của repo.

## Rủi ro

Đây là một thay đổi phá vỡ API pre-release bao trùm toàn repo: việc dựng request chỉ-theo-model, đăng ký adapter, protocol ứng dụng, fixture, và định dạng sự kiện phiên bản 0 đã persist đều thay đổi đồng thời, không cung cấp alias tương thích. Quy tắc loại trừ lẫn nhau giữa các provider cố ý cấm hai triển khai của cùng một thượng nguồn cùng tồn tại trong một context. Việc nâng cấp dependency pi-ai có thể thay đổi catalog provider/model được chấp nhận, nên lock file và ma trận e2e của adapter định nghĩa tập hợp đã được xác thực. Endpoint `baseURL` tùy chỉnh kế thừa các giả định protocol của model catalog đã chọn, không thể sửa các proxy không tương thích. Descriptor model ngoài catalog và nội dung đa phương thức vẫn chưa được hỗ trợ. Trạng thái replay của pi-ai có thể chứa chữ ký reasoning được mã hóa không minh bạch; provider cần thông tin đó để duy trì tính liên tục, nên hệ thống persist trạng thái này, nhưng không render hay ghi log nó ngoài phạm vi bản ghi session hiện có.
