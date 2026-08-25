# Agent Note: Bắt buộc mang identity nhận diện `User-Agent` trong request tới provider

Status: implemented

[English](2026-06-21-mandatory-app-attribution-headers.md) | Tiếng Việt

## Vấn đề

Request tới provider LLM (Large Language Model) nên nhận diện được sản phẩm đã phát ra request đó. Điều này có giá trị đối với hỗ trợ kỹ thuật phía provider, điều tra lạm dụng, debug tương thích, và phân tích lưu lượng. Trước Agent Note này, harness mới chỉ làm được một phần: adapter DeepSeek viết tay gửi một hằng số `User-Agent` được copy thủ công (`packages/llm/llm-deepseek/src/adapter.ts`), còn adapter song sinh dựa trên pi-ai lại hoàn toàn không gửi header riêng của harness (`packages/llm/llm-pi-ai/src/adapter.ts`). Do đó adapter mới có thể lặng lẽ bỏ qua identity nhận diện, còn adapter dựa trên thư viện cũng có thể lệch khỏi adapter viết tay — dù [Agent Note về adapter song sinh](2026-06-13-twin-llm-adapters.md) tồn tại chính là để bảo đảm quy ước provider ở cả hai implementation là đáng tin cậy.

Yếu tố kích hoạt trực tiếp đến từ tài liệu [App Attribution](https://openrouter.ai/docs/app-attribution) của OpenRouter. OpenRouter tạo trang ứng dụng và xếp hạng dựa trên `HTTP-Referer` cùng các header dùng để hiển thị và phân loại. Điều này có giá trị, nhưng đây không phải cơ chế identity ứng dụng trong chuẩn HTTP. Rủi ro nằm ở chỗ: nếu coi bộ header chính xác của OpenRouter là chuẩn chung, rồi để các header đặc thù của provider bị rò rỉ vào request kết nối trực tiếp tới DeepSeek, các adapter OpenAI/Anthropic/Vertex tương lai, server test, hoặc proxy ghi log các trường không xác định vô thời hạn.

## Khảo sát

- **Cơ chế của OpenRouter là đặc thù riêng của provider đó.** Tài liệu hiện tại của họ nói rằng attribution ứng dụng được theo dõi qua `HTTP-Referer` (bắt buộc), `X-OpenRouter-Title` và `X-OpenRouter-Categories`; `X-Title` chỉ được chấp nhận vì lý do tương thích ngược. Tài liệu tham chiếu API của họ nói các header này là tùy chọn, và nói chúng giúp ứng dụng có thể được khám phá (discoverable) trên OpenRouter. Đây là một quy ước cụ thể của OpenRouter, không phải chuẩn IETF hay chuẩn API tương thích OpenAI.
- **Trong hệ sinh thái công cụ agent (smart agent), `HTTP-Referer` là một quy ước nhận biết OpenRouter, chứ không phải quy ước agent phổ quát.** Nó phổ biến đến mức SDK và ví dụ của OpenRouter phơi bày trực tiếp header này, các framework hướng tới OpenRouter thường cần một cách để truyền nó qua. Nhưng các protocol agent như ACP (Agent Client Protocol) đàm phán tên, version và năng lực trong message initialize riêng của chúng, còn request tới provider mô hình vẫn cần identity ở tầng HTTP. Do đó "được chấp nhận trong thế giới agent" có nghĩa là "được tích hợp OpenRouter nhận diện", chứ không phải "có thể mang theo được (portable) giữa các runtime agent hay provider khác nhau".
- **Các agent lập trình nhận diện sản phẩm và version trong `User-Agent`.** Các implementation công khai khác nhau ở chi tiết môi trường và header bổ sung đặc thù của provider, nhưng identity sản phẩm là quy ước chung; không tồn tại một định dạng chính xác phổ quát.
- **Header identity client chuẩn hóa chung là `User-Agent`.** RFC 9110 mục 10.1.5 định nghĩa `User-Agent` là identity của phần mềm user agent, nói rằng nó dùng cho báo cáo khả năng tương tác (interoperability) và phân tích, và nói user agent nên gửi nó trên mỗi request (trừ khi được cấu hình để không gửi). Đây là header chuẩn duy nhất ánh xạ trực tiếp tới "sản phẩm nào đang phát ra request HTTP này".
- **`Referer` là chuẩn, nhưng `HTTP-Referer` của OpenRouter không phải trường chuẩn.** RFC 9110 mục 10.1.3 định nghĩa `Referer` là URI nguồn gốc để lấy target URI, và dành nhiều nội dung để thảo luận về giới hạn quyền riêng tư. OpenRouter thì yêu cầu `HTTP-Referer`, dùng nó làm định danh URL ứng dụng. Tên gọi và ý nghĩa này đặc thù riêng của OpenRouter, dù nó có hình dạng giống dạng biến môi trường CGI của header `Referer` chuẩn.
- **`From` là chuẩn, nhưng không phù hợp làm giá trị mặc định bắt buộc.** RFC 9110 mục 10.1.2 định nghĩa `From` là địa chỉ email của người chịu trách nhiệm cho user agent. Agent dạng bot nên gửi nó để server có thể liên hệ người vận hành, nhưng agent không phải bot không nên gửi nó nếu chưa được người dùng cấu hình tường minh, vì lý do quyền riêng tư và chính sách bảo mật. Harness sau này có thể hỗ trợ thông tin liên hệ người vận hành, nhưng không được tự bịa ra hay bắt buộc toàn cục.
- **Trường `user` hoặc `metadata` trong request body không phải app attribution.** Một số API mô hình phơi bày định danh người dùng cuối ổn định, metadata request, tag, hoặc header dự án/tài khoản. Những thứ này hữu ích cho việc giám sát lạm dụng, tính phí nội bộ, dashboard, hoặc trace, nhưng chúng hoặc nhận diện người dùng cuối thay vì sản phẩm, hoặc là schema body đặc thù riêng của provider, hoặc không bảo đảm được truyền qua các gateway tương thích OpenAI. Chúng không thể thay thế header identity ứng dụng tĩnh.
- **Header telemetry của SDK nhận diện SDK, không nhận diện ứng dụng.** SDK chính thức và bên thứ ba thường gửi header thư viện/version. Những header này giúp người bảo trì SDK debug client của họ, nhưng chúng không thể nhận diện harness với vai trò là ứng dụng, trừ khi ứng dụng cung cấp tường minh một lớp attribution sản phẩm.
- **pi-ai có hook header hỗ trợ sẵn.** `StreamOptions.headers` của `@earendil-works/pi-ai` sẽ hợp nhất header của phía gọi sau cùng (ghi đè giá trị mặc định của provider), do đó adapter dựa trên thư viện không cần bọc thêm hay thay đổi upstream vẫn có thể thỏa mãn cùng quy ước trên đường dây (wire) như adapter viết tay. Bộ test mock server xác nhận header đến được đường dây ở cả hai adapter.

## Quyết định

Tại ranh giới adapter LLM, việc nhận diện ứng dụng độc lập với provider là bắt buộc, và chỉ dùng header `User-Agent` chuẩn. Quy tắc: mỗi adapter LLM cấp sản phẩm phải gửi một identity ứng dụng tĩnh, không bí mật trên mỗi request HTTP tới provider, và mỗi adapter có test chứng minh `User-Agent` đến được đường dây (mock server xác nhận header nhận được; với adapter dựa trên thư viện, xác nhận qua hook header của thư viện đưa vào cùng mock server đó). Quy tắc này ràng buộc app attribution, không ràng buộc identity request đặc thù riêng của provider; [quyết định về header request identity của DeepSeek](../feature/2026-08-11-deepseek-request-user-id-header.md) chịu trách nhiệm riêng cho header user và session của họ.

App attribution của OpenRouter cố ý chưa được implement. `HTTP-Referer`, `X-OpenRouter-Title`, `X-Title` và `X-OpenRouter-Categories` là các header hiển thị sản phẩm đặc thù riêng của OpenRouter, không phải attribution request mô hình độc lập với provider. Chúng có thể được đề xuất sau này bởi một adapter OpenRouter hoặc một mode OpenRouter tường minh, kèm theo các quyết định riêng, test và tài liệu về quyền riêng tư/sản phẩm của chính chúng. Trước khi đó, ngay cả khi request nhắm tới OpenRouter, hệ thống vẫn chỉ gửi `User-Agent` attribution dùng chung được quyết định trong note này.

Identity độc lập với provider do `dsh-llm` sở hữu (`packages/llm/llm/src/attribution.ts`), không phải từng adapter. `AppIdentity` chỉ chứa các fact sản phẩm công khai cần thiết để dựng `User-Agent`, giá trị `APP_IDENTITY` mặc định như sau:

- Token sản phẩm cho `User-Agent`: `deepseek-harness` (giữ tính liên tục với giá trị trên đường dây trước Agent Note này và identity repo/tổ chức)
- Version: đọc qua `createRequire` từ manifest (metadata clean) của package sở hữu, không bao giờ copy hằng số thủ công
- URL ứng dụng: `https://github.com/deepseek-ai/deepseek-harness` — trang chủ repo

Giá trị mặc định là bắt buộc và không được để trống. Deployment white-label ghi đè bằng cách truyền `AppIdentity` riêng của họ vào `attributionHeaders(identity)` — hook ghi đè chính là tham số hàm, không cần pipeline cấu hình deployment cho tới khi có phía tiêu thụ cần — khi bỏ qua sẽ fallback về giá trị mặc định của harness thay vì tắt attribution. Không có API theo từng request nào cho phép model, prompt người dùng, session id, cwd, email người dùng, chủ sở hữu API key, hay identity máy cục bộ ảnh hưởng tới các trường này.

Mapping trên đường dây (`attributionHeaders`; tên header viết thường trong code — tên trường HTTP không phân biệt hoa thường trên đường dây):

| Đích | Mapping |
|---|---|
| Tất cả adapter dựa trên HTTP | `User-Agent: {product}/{version} (+{url})` — chú thích `+url` trong ngoặc tuân theo cú pháp product/comment thận trọng của RFC 9110. |
| Endpoint DeepSeek trực tiếp | `User-Agent` dùng cho app attribution; `x-deepseek-harness-user-id` và `x-deepseek-harness-session-id` có điều kiện được quản lý riêng như identity request bởi quyết định đặc thù DeepSeek. Không gửi header đặc thù OpenRouter trừ khi tài liệu DeepSeek ghi nhận quy ước tương đương. |
| Endpoint OpenRouter | Hiện tại chỉ `User-Agent`. Theo quyết định này không gửi `HTTP-Referer`, `X-OpenRouter-Title`, `X-Title` hay `X-OpenRouter-Categories`. |
| Provider tương lai | Chỉ `User-Agent`, trừ khi có Agent Note đặc thù riêng của provider đó sau này chấp nhận header bổ sung. Không được tương tự hóa và tái sử dụng `HTTP-Referer`. |

Việc phát hiện endpoint nằm ngoài phạm vi của Agent Note này, vì không có mapping đặc thù nào theo endpoint được chấp nhận ở đây. Nếu sau này hỗ trợ OpenRouter, việc phát hiện phải tường minh: hoặc là một package provider OpenRouter chuyên biệt, hoặc cấu hình `provider: 'openrouter'` / `attributionTarget: 'openrouter'` tường minh, chứ không phải bất kỳ đoạn path hay tên model tùy ý nào.

## Xác minh

Các quy ước đã được triển khai:

- `dsh-llm` ghi lại tài liệu quy ước attribution `User-Agent` bắt buộc cho tác giả `LlmAdapter` (JSDoc của `LlmAdapter`, README của package, và mục quy ước adapter (adapter contract) trong `docs/subsystems/llm-streaming.md`).
- Hàm hỗ trợ dùng chung (`attributionHeaders` / `userAgent`) dựng identity ứng dụng và giá trị `User-Agent` chuẩn từ metadata package, adapter không cần copy hằng số version thủ công.
- `dsh-llm-deepseek` gửi `User-Agent` dùng chung trên mỗi request, bộ test mock server của nó xác nhận giá trị chính xác.
- `dsh-llm-pi-ai` gửi cùng `User-Agent` qua hook `StreamOptions.headers` của pi-ai, bộ test mock server của nó xác nhận giá trị chính xác.
- Theo quyết định này, không có adapter nào gửi header attribution đặc thù OpenRouter (`HTTP-Referer`, `X-OpenRouter-Title`, `X-Title`, `X-OpenRouter-Categories`).
- Không có trường app attribution nào mang bí mật, path cục bộ, session id, văn bản prompt, output mô hình, email người dùng, hay định danh ổn định theo từng người dùng.
- README của adapter nêu rõ chính sách attribution `User-Agent`, và tường minh tránh ghi nhận app attribution của OpenRouter là hành vi đã implement.

## Các phương án thay thế từng cân nhắc

**Triển khai app attribution của OpenRouter ngay bây giờ.** Quyết định này bác bỏ. Gửi `HTTP-Referer` cộng `X-OpenRouter-Title` có thể thỏa mãn xếp hạng OpenRouter, nhưng các header này là tính năng sản phẩm đặc thù của provider, không phải attribution request mô hình độc lập với provider được chuẩn hóa bởi quyết định này. Hỗ trợ chúng nên là một quyết định adapter/mode OpenRouter tường minh sau này, thay vì ẩn trong hàm hỗ trợ attribution dùng chung đầu tiên.

**Gửi header của OpenRouter tới mọi provider.** Bị bác bỏ. Điều này sẽ coi một quy ước tùy chỉnh của OpenRouter như chuẩn chung, và gửi header có ý nghĩa gây hiểu nhầm tới các provider không yêu cầu các trường đó. Nó còn có rủi ro coi `HTTP-Referer` như một trường URL ứng dụng chung, dù HTTP chuẩn đã có `User-Agent` cho identity sản phẩm, `Referer` cho một khái niệm ngữ cảnh duyệt web khác.

**Chỉ dùng identity tài khoản/dự án của provider.** Bị bác bỏ. Header tổ chức/dự án, API key, tài khoản cloud và định danh dự án tính phí nhận diện ai trả tiền hoặc ai sở hữu request, chứ không phải ứng dụng nào đang gửi lưu lượng. Chúng cũng không phơi bày title/category ứng dụng công khai, không giúp gateway như OpenRouter dựng xếp hạng ứng dụng.

**Chỉ dùng trường `user`/`metadata` của người dùng cuối.** Agent Note này bác bỏ. Những trường này có giá trị cho giám sát lạm dụng và hỗ trợ khách hàng, nhưng mô tả người hoặc tenant đứng sau request. App attribution phải là identity sản phẩm tĩnh, có thể gửi an toàn trên mỗi request.

**Chỉ bật attribution qua cấu hình.** Bị bác bỏ. Setting mặc định tắt chính là nguyên nhân khiến adapter liên tục trôi (drift). Chính sách là attribution mặc định bắt buộc cộng giá trị công khai có thể ghi đè, chứ không phải attribution tùy chọn.

**Dùng token đặt tên theo SDK (`deepseek-harness-sdk`).** Từng được cân nhắc cho token `User-Agent`, vì stack client runtime được hỗ trợ dùng tên SDK. `deepseek-harness` thắng thế, vì nó gọi tên sản phẩm DeepSeek Harness, nhất quán với identity repo/tổ chức và scope package, và giữ attribution trên đường dây ổn định mà không gọi toàn bộ sản phẩm là một SDK.

## Hệ quả

**Provider nhìn thấy lưu lượng đến từ harness.** Đây chính là mục đích, nhưng có nghĩa là các deployment trước đây bị lẫn trong lưu lượng SDK chung nay trở nên có thể nhận diện được. Biện pháp giảm thiểu: chỉ gửi dữ liệu sản phẩm công khai tĩnh, và cho phép fork/deployment white-label truyền `AppIdentity` riêng của họ.

**Mức hỗ trợ header khác nhau giữa các thư viện client.** Adapter viết tay set header trực tiếp; adapter dựa trên pi-ai phụ thuộc vào việc pi-ai tiếp tục tôn trọng `StreamOptions.headers` (hợp nhất sau cùng, ghi đè giá trị mặc định của provider). Test mock server ở cấp đường dây là hàng rào bảo vệ: nếu pi-ai nâng cấp và không còn gửi header này, bộ test sẽ báo đỏ. Điều này tạo áp lực có ích lên abstraction: một adapter provider không thể set header bắt buộc thì không thể implement đầy đủ quy ước LLM của harness.

**Xếp hạng OpenRouter chưa được hưởng lợi.** `User-Agent` là baseline đúng đắn cho identity HTTP độc lập với provider, nhưng nó sẽ không tạo trang ứng dụng hay xếp hạng OpenRouter, vì OpenRouter yêu cầu `HTTP-Referer` để đạt được tính năng sản phẩm đó. Đây là cố ý: việc tham gia thị trường ứng dụng công khai là một quyết định sản phẩm độc lập, không phải điều kiện tiên quyết cho attribution request bắt buộc.
