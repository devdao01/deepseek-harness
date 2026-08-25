# Agent Note: LLM catalog mang tính gợi ý và chọn model cấp session cho ACP

Status: implemented

[English](2026-07-15-llm-model-catalog-and-acp-selection.md) | 中文

> Quyết định về catalog vẫn còn hiệu lực. Việc chọn model cấp session của ACP (Agent Client Protocol) đã được thay thế bởi [ACP là giao thức chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md).

## Vấn đề

Adapter định tuyến theo provider cho phép chọn `provider + model` mỗi request, nhưng `LlmRuntime` chỉ expose việc định tuyến và gọi stream. UI không thể khám phá các provider đã đăng ký, cũng không biết adapter sẵn sàng gợi ý model nào. Do đó, client ACP không nhận được tùy chọn cấu hình session `model`; dù service LLM (mô hình ngôn ngữ lớn) đã hỗ trợ chuyển đổi lúc chạy, các tích hợp Zed, JetBrains và VS Code vẫn không có danh sách model.

Việc khám phá model không được biến thành việc validate request. Adapter DeepSeek viết tay sẽ forward nguyên trạng bất kỳ model ID nào tới endpoint công khai hoặc riêng tư, còn catalog cài đặt giới hạn của pi-ai là căn cứ có thẩm quyền cho việc phân giải request của chính nó. Coi catalog dùng chung như một whitelist sẽ phá vỡ năng lực endpoint riêng tư mà việc định tuyến theo provider cần giữ lại.

Việc chọn trong ACP cũng phải giữ nguyên chiều provider. Cùng một model ID có thể tồn tại dưới nhiều tuyến định tuyến; việc chuyển đổi adapter toàn cục hoặc template agent (tác nhân) sẽ khiến lựa chọn của một session editor rò rỉ sang các session khác. Biến prompt và định tuyến request phải thay đổi đồng thời; nếu việc chọn xảy ra trong lúc lắp ráp prompt bất đồng bộ, không thể để `{{model}}` biểu diễn một model trong khi request thực tế lại đến một model khác.

## Quyết định

### Khám phá mang tính gợi ý, không phụ thuộc provider

`LlmAdapter` thêm phương thức `providerInfo(provider)` và `listModels(provider)` bất đồng bộ. Kết quả không phụ thuộc provider của chúng lần lượt là `LlmProviderInfo { id, name }` và `LlmModelInfo { provider, id, name, description? }`. Triển khai mặc định dùng tên tuyến định tuyến làm tên provider, và không hiển thị model nào, nhờ đó giữ nguyên hành vi của các adapter hiện có.

`LlmRuntime.listProviders()` trả về bản sao metadata theo thứ tự đăng ký. `LlmRuntime.listModels(provider)` ủy quyền cho chủ sở hữu tuyến định tuyến, validate ID và tên không rỗng, và thất bại với `INVALID_CATALOG` khi provider không khớp hoặc model ID bị trùng lặp, cuối cùng trả về bản sao của giá trị. Provider không xác định vẫn thất bại với `NO_ADAPTER`. Metadata provider được validate nguyên tử trong lúc `registerAdapter()`, và lỗi hiển thị không để lại đăng ký một phần.

Tư cách thành viên catalog chỉ mang tính gợi ý. Nó điều khiển bộ chọn (selector) và chẩn đoán, nhưng không thay đổi việc định tuyến `stream()`, cũng không từ chối các request vốn dĩ hợp lệ. Quyền sở hữu provider vẫn mang tính loại trừ và gắn liền với vòng đời; model ID vẫn là input được truyền cho adapter tại thời điểm request.

`dsh-llm-pi-ai` ánh xạ các mục đã cài đặt do `getModels(provider)` của provider đã cấu hình trả về thành một catalog không phụ thuộc provider. Việc tra cứu catalog tại thời điểm request hiện có của nó vẫn là căn cứ có thẩm quyền, model không xác định vẫn thất bại với `UNKNOWN_MODEL`. `dsh-llm-deepseek` chấp nhận cấu hình `models` tùy chọn chứa các mục hiển thị, mặc định gồm `deepseek-v4-flash` với tên hiển thị `DeepSeek-V4-Flash` và `deepseek-v4-pro` với tên hiển thị `DeepSeek-V4-Pro`. Danh sách tường minh sẽ thay thế các giá trị mặc định này, danh sách rỗng sẽ tắt việc khám phá. Các mục này cải thiện trải nghiệm chọn cho các model công khai hoặc riêng tư đã biết, trong khi mọi model ID không nằm trong danh sách vẫn được truyền xuyên qua nguyên trạng.

### Việc chọn cấp session nằm trong frontend

Việc chọn thuộc quyền sở hữu của frontend cung cấp nó (hiện tại là bộ chọn `/model` của TUI), chứ không thuộc `LlmRuntime` hay `AgentOptions`: đó là các đối tượng cấp deployment hoặc cấp tạo mới, thay đổi chúng sẽ ghép các session chạy đồng thời lại với nhau. Mỗi tùy chọn không minh bạch (opaque) mang theo cặp provider/model đầy đủ, vì cùng một model ID có thể xuất hiện dưới nhiều tuyến định tuyến.

Tầng transport tự động hóa của ACP không phải là bên tiêu thụ catalog. Nó cung cấp một target provider/model tùy chọn cho agent mới được tạo thông qua cấu hình deployment, không hiển thị bộ chọn model hay interface tùy chọn cấu hình.

### Tính nhất quán prompt/request và việc persist

`installModelSelection` (nằm trong `dsh-agent`) cài đặt listener `system-prompt/assemble` và `agent/request` có phạm vi agent cho lựa chọn do frontend sở hữu. Việc lắp ráp prompt chụp lại snapshot của tổ hợp đã chọn một lần mỗi bước, ghi đè biến `provider` và `model` đã lắp ráp sau các listener prompt ở tầng dưới; listener request áp dụng cùng snapshot đó sau các listener request ở tầng dưới. Do đó, việc chọn xảy ra trong lúc lắp ráp bất đồng bộ sẽ có hiệu lực từ bước tiếp theo, mà không làm text prompt và định tuyến bị tách rời. Các field cấu hình gọi khác giữ nguyên.

Request header vẫn là nguồn chân lý được persist. Khi một lựa chọn thực sự được sử dụng, snapshot `request/header` đầy đủ hiện có sẽ ghi lại nó; frontend trước tiên khởi tạo lựa chọn của mình từ request header cuối cùng đã gộp (collapsed), sau đó mới fallback về tùy chọn tạo mới. Lựa chọn chưa từng được request sử dụng cố ý chỉ được giữ trong bộ nhớ, vì nó chưa bao giờ trở thành trạng thái hiển thị với model.

## Phương án thay thế đã cân nhắc

**Chỉ trả về chuỗi model.** Giá trị chỉ-model sẽ mất đi việc định tuyến provider, và một khi hai provider expose cùng một ID sẽ gây mơ hồ.

**Biến catalog thành whitelist bắt buộc.** Điều này xung đột với việc truyền xuyên bất kỳ model nào của adapter viết tay và các deployment riêng tư. Việc validate có thẩm quyền của request vốn dĩ thuộc về adapter được chọn.

**Lưu lựa chọn vào `AgentOptions` hoặc `LlmRuntime`.** Đây là các đối tượng cấp tạo mới hoặc cấp deployment. Thay đổi chúng sẽ ghép các session chạy đồng thời lại với nhau, và bỏ qua đường thay thế `agent/request` vốn có ghi log.

**Persist ngay lập tức một sự kiện session model-selection mới.** Lựa chọn UI chưa được sử dụng thì chưa ảnh hưởng đến bất kỳ request model nào. Việc ghi lại request header hiện có khi target được tiêu thụ vừa giữ đúng quy tắc "hiển thị với model khi và chỉ khi có log", vừa không đưa vào một nguồn chân lý thứ hai.

## Kết quả

- Bất kỳ adapter nào cũng có thể expose danh sách model động, mà không cần làm rò rỉ kiểu dữ liệu thư viện provider vào LLM Service Definition.
- Bên tiêu thụ catalog phải hiểu việc thiếu dữ liệu là "không hiển thị", chứ không phải "request không hợp lệ".
- Adapter pi-ai sẽ expose catalog provider đã cài đặt của nó; deployment DeepSeek viết tay liệt kê tường minh các tùy chọn đã biết, đồng thời vẫn giữ hỗ trợ cho bất kỳ model nào.
- Bên tiêu thụ catalog hướng tới con người sở hữu tương tác chọn riêng của mình. ACP dùng target deployment cố định, không mở rộng phạm vi giao thức chỉ để khám phá model.
- Request header vẫn tương thích với hình thái session dựa trên định tuyến theo provider; không cần sự kiện JSONL hay phiên bản định dạng mới.
- Việc đọc catalog có thể bất đồng bộ, và mỗi bên gọi sẽ nhận một bản sao giá trị độc lập.

## Kiểm thử

Unit test bao phủ bản sao giá trị catalog và metadata sai định dạng, phép chiếu catalog của pi-ai và DeepSeek, việc định tuyến request theo provider/model, và việc căn chỉnh biến prompt; listener được cài đặt trong ngữ cảnh có phạm vi agent, nhờ đó đạt được cô lập giữa các agent. Test transport ACP xác nhận độc lập hành vi forward target provider/model cố định; bộ test TUI bao phủ tương tác bộ chọn và việc khôi phục dựa trên request header.
