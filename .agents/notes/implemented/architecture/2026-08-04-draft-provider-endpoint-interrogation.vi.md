# Agent Note: Truy vấn endpoint của provider ngay trong bản nháp

Status: implemented

[English](2026-08-04-draft-provider-endpoint-interrogation.md) | 中文

## Problem

Sau khi tuyến pi-ai trở thành [một khai báo thay vì tra cứu catalog](2026-08-03-pi-ai-declared-provider-catalog.md), người muốn kết nối một gateway tương thích OpenAI phải biết trước model id của nó mới cấu hình xong. Adapter không còn giới hạn người dùng trong catalog đã cài đặt — đó chính là mục đích của thay đổi ấy — nhưng điều đó cũng có nghĩa là không có gì cho người dùng biết endpoint đó thực sự phục vụ những gì, trong khi phần lớn các endpoint loại này công bố danh sách đó qua `GET /models`.

Câu trả lời hiển nhiên — một catalog động runtime được làm mới ở nền — đã bị từ chối cùng với lớp dưới: nó biến danh sách model của tuyến thành trạng thái biến đổi bên ngoài cần cache, ngữ nghĩa hết hạn và đường dẫn offline, trong khi nhu cầu sản phẩm hẹp hơn nhiều. Cái thực sự cần là *một lần truy vấn duy nhất*, câu trả lời được người dùng chấp nhận đưa vào `settings.yaml`, để `settings.yaml` luôn là nguồn sự thật duy nhất quyết định tuyến phục vụ những gì.

Điểm khó là đối tượng bị hỏi còn chưa tồn tại. Provider đang được thêm mới chưa có tuyến, chưa có profile đã lưu, cũng chưa có credential đã lưu; endpoint và key đều là giá trị form mà người dùng đang gõ dở. Trong khi đó mọi thao tác LLM (mô hình ngôn ngữ lớn) Service Definition hiện có đều lấy tuyến provider đã đăng ký làm khóa, nên không thao tác nào có thể mang được truy vấn này.

## Decision

Truy vấn dùng **settings namespace** làm khóa, thay vì tuyến provider:

- `ctx.llm.registerModelDiscovery(settingsNs, discover)` cho phép plugin adapter cấp năng lực "truy vấn endpoint" cho namespace mà nó sở hữu, `ctx.llm.discoverModels(settingsNs, request)` khởi phát truy vấn. Không có cách nào liệt kê những namespace nào đã đăng ký: giao diện không thể truy vấn sẽ biết được điều đó qua chính câu từ chối kia, còn một danh sách không ai tiêu thụ chỉ biến thành một trường protocol bắt buộc mà chẳng làm gì cả. Lấy namespace làm khóa là đúng, vì giao diện cấu hình đã có sẵn nó từ danh mục provider có thể cấu hình, và vì provider đang được thêm mới không có tuyến để chỉ đích danh.
- `LlmModelDiscoveryRequest` mang theo bản nháp — `provider` tùy chọn, `baseURL` tùy chọn, `api` tùy chọn, `apiKey` tùy chọn, cùng một signal — và `provider` với `baseURL` phải có ít nhất một để có thứ mà trả lời. Sở dĩ có `provider` là vì tuyến mà adapter đã mô tả sẽ tự trả lời trực tiếp từ registry của chính nó, hoàn toàn không cần mạng; chỉ những tuyến nó chưa mô tả mới thực sự chạm tới một endpoint. Đường này không ghi settings hay credentials. Việc đọc duy nhất là credential của tuyến được nêu đích danh trong request: giao diện cấu hình chỉ nhận được descriptor đã che thông tin nhạy cảm chứ không phải bí mật đã lưu, nên `apiKey` trong bản nháp chỉ tồn tại khi người dùng đang gõ nó; thiếu bước đọc này, tuyến đã cấu hình xong sẽ bị hỏi mà không có xác thực, chỉ đổi lấy một 401. Key vừa gõ được ưu tiên, vì đó chính là key đang được kiểm thử.
- `LlmDiscoveredModel` mọi trường ngoài `id` đều tùy chọn, vì phần lớn danh sách chỉ công bố id. Phản hồi là ứng viên chứ không phải catalog: giao diện chọn dùng một mục trong đó vẫn phải tự bổ sung năng lực mà adapter cần.
- `llm.discoverModels` gửi cùng một bản nháp đó qua lớp protocol. `apiKey` của nó là payload thứ ba, cũng là payload cuối cùng có thể mang bí mật (hai payload kia là `settings.update`/`mutate` và `credentials.set`), và tuyệt đối không bị lưu trữ hay phát lại. Nó thực sự đi kèm envelope gửi ra phía client giống như các payload mang bí mật khác, quan sát viên `subscribeEnvelopes()` nhìn thấy được; việc che thông tin nhạy cảm ở điểm quan sát đó là thay đổi của toàn bộ mặt cấu hình, không nên do riêng phương thức này quyết định. Ngoài lý do key, còn một lý do thứ hai để giới hạn nó chỉ truy cập được qua loopback: nó khiến host phát một GET tới URL do bên gọi chọn và báo lại kết quả, đây là năng lực dò quét mà một caller LAN ẩn danh không nên có. Mọi kiểu từ chối đều gộp về `model-discovery-failed`, message là văn bản riêng của adapter, details nêu đích danh endpoint bị hỏi, tuyệt đối không nêu đích danh credential đã cung cấp.

Việc triển khai của `dsh-llm-pi-ai` chỉ là một lệnh `GET {baseURL}/models` đơn giản, và chỉ giới hạn ở protocol tương thích OpenAI. Hình dạng danh sách của chúng là kiểu được ba bên — gateway, dịch vụ tự host, và endpoint chính thức — cùng thống nhất công nhận, và đây chính là kịch bản mà thao tác này tồn tại để phục vụ. Các protocol còn lại đều trả lời bằng `DISCOVERY_UNSUPPORTED`, để giao diện quay về điền tay, thay vì báo một response có hình dạng đoán sai thành một provider rỗng. `baseURL` được xử lý theo kiểu tiền tố chứ không phải URL cần resolve, nên các đường dẫn triển khai kiểu `https://gateway.example/openai/v1` vẫn giữ nguyên đoạn path của mình. Phản hồi được đọc dưới giới hạn bốn megabyte, và giới hạn đó áp lên số byte thực nhận được — endpoint là URL do người dùng tự điền, nên hệ thống sẽ xem `content-length` được khai báo như một gợi ý thiện chí, nhưng tuyệt đối không coi nó là ranh giới; điều này nhất quán với hình dạng hai giai đoạn mà `dsh-web-fetch` dùng khi đối diện với URL do chính bên gọi cung cấp.

### Vì sao không dùng cơ chế refresh của chính pi-ai

pi-ai cung cấp `createProvider({ fetchModels })` cùng `Models.refresh()` và `ModelsStore`, còn lớp dưới vốn đã dựng đối tượng pi-ai `Provider`. Nối truy vấn vào chúng nghĩa là mỗi lần hỏi phải dựng một provider và một collection dùng-một-lần-rồi-bỏ, trong khi toàn bộ mục đích của store đó — giữ catalog bền vững qua các lần chạy — lại trực tiếp mâu thuẫn với quyết định "`settings.yaml` sở hữu catalog". Hơn nữa nó cũng chẳng đổi lại được gì: **không một provider tích hợp sẵn nào của pi-ai triển khai `fetchModels`**, nên lệnh gọi HTTP và việc phân tích response của nó dù sao cũng vẫn là mã của package này. Fetch trực tiếp mới phản ánh đúng những gì đang thực sự xảy ra. Credential đã lưu của tuyến được chính plugin này lấy ra qua bộ resolver theo-từng-request của nó, và chỉ thực hiện trên đúng nhánh thực sự cần mạng, nên tuyến catalog trả lời mà không đụng tới credential, cũng không thất bại chỉ vì một key mà lần truy vấn này căn bản không cần dùng đến.

## Alternatives considered

**Lấy tuyến provider làm khóa.** Đối xứng với mọi thao tác LLM Service Definition khác, cũng giúp request bớt cần endpoint. Nhưng kịch bản làm nảy sinh tính năng này — thêm provider mới — lại không có tuyến, nên thao tác này chỉ khả dụng với những provider đã cấu hình xong, mà đó lại chính là những provider ít cần nó nhất.

**Gắn năng lực này lên `LlmAdapter`.** Adapter phải qua đăng ký tuyến mới tiếp cận được, nên vấn đề vẫn y hệt; hơn nữa điều này sẽ khiến một instance adapter phải trả lời câu hỏi về endpoint mà nó không hề phục vụ.

**Để host đọc profile đã lưu, thay vì nhận bản nháp.** Với provider đã cấu hình xong, sẽ không có bí mật nào băng qua lớp protocol. Nhưng như vậy thì việc thêm provider mới buộc phải lưu trước một cấu hình chưa dùng được, và một form đã đổi endpoint nhưng chưa lưu sẽ âm thầm đi hỏi địa chỉ cũ. Nhận bản nháp giúp những gì người dùng thấy khớp với những gì bị hỏi — credential là ngoại lệ duy nhất, vì đó là trường không bao giờ hiển thị ra giao diện, nên không thể nào đưa vào bản nháp được.

**Truy vấn từng protocol của pi-ai.** Danh sách của Anthropic tình cờ dùng chung lớp envelope với OpenAI, còn của Google thì không. Chỉ hỗ trợ vài loại dễ sẽ khiến phạm vi bao phủ trở nên tùy tiện; tệ hơn, một hình dạng response bị đoán sai sẽ không phân biệt được với "provider đó không có model nào". Một protocol tuyên bố rõ là không thể bị truy vấn sẽ đưa người dùng về điền tay — đó chính là đường lùi đã định sẵn.

**Dùng `response.text()` để đệm toàn bộ response rồi mới kiểm tra độ dài.** Đơn giản hơn, nhưng giới hạn chỉ có hiệu lực sau khi các byte đã đến hết, trong khi endpoint là một URL bất kỳ do người dùng tùy tiện điền.

## Consequences

Người kết nối gateway có thể hỏi thẳng nó phục vụ những gì, mà không phải lục tài liệu của nó; câu trả lời đến dưới dạng ứng viên, do người dùng tự chọn, chứ không bị âm thầm ghi vào cấu hình. Seam vì vậy có thêm một registry được giữ cố tình rất nhỏ: mỗi namespace một bản, không lưu trữ, vòng đời không vượt quá fiber.

Cái giá phải trả: lớp protocol có thêm một payload mang bí mật thứ ba, giao diện chỉ-ghi của mặt cấu hình từ hai phương thức tăng lên ba. Phạm vi discovery được chia theo protocol chứ không theo provider — một gateway tương thích Anthropic dù danh sách của nó có thể parse được vẫn phải điền tay. Và vì không có khâu nào chạy lại truy vấn này, độ mới của danh sách model vẫn chỉ dừng ở lần chỉnh sửa gần nhất; điều này cùng một sự đánh đổi mà lớp dưới đã cố tình chấp nhận.

## Testing

`packages/llm/llm/tests/topology.spec.ts` bao phủ registry: mỗi namespace một bản, giải phóng theo fiber (resource release), loại bỏ id trùng lặp và không dùng được mà không tự ý bù năng lực, cùng hai kiểu từ chối `NO_DISCOVERY`/`INVALID_DISCOVERY`. `packages/llm/llm-pi-ai/tests/discovery.spec.ts` điều khiển việc dò tìm nhắm vào server HTTP cục bộ — gồm danh sách có và không có năng lực được công bố, đường dẫn triển khai được giữ nguyên, không có credential, tuyến đã cấu hình tự lấy credential khi bản nháp không mang key và key vừa gõ đè lên nó, tuyến catalog trả lời mà hoàn toàn không parse credential, các dòng bị loại bỏ, phân biệt 401/403 với lỗi server, response không phải danh sách và không phải JSON, endpoint không thể tới được, bên gọi hủy, protocol không được hỗ trợ, cùng hai hình thái "độ dài khai báo" và "streaming" của giới hạn kích thước. `packages/host/apiproxy/tests/api-proxy-config.spec.ts` bao phủ RPC này trên một proxy thật: bản nháp đến đầy đủ tại namespace của nó, các trường vắng mặt vẫn vắng mặt, không có namespace hay credential nào bị ghi, và lỗi hiển thị dưới dạng `model-discovery-failed` mà lỗi đã serialize không chứa credential.
