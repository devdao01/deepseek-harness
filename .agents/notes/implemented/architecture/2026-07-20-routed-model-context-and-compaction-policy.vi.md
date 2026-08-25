# Agent Note: Context mô hình đã routing và chính sách compaction

Status: implemented

[English](2026-07-20-routed-model-context-and-compaction-policy.md) | Tiếng Việt

## Vấn đề

Khi một tiến trình routing request tới các mô hình có dung lượng khác nhau, việc nén (compaction) không thể áp dụng an toàn cùng một cửa sổ context toàn cục. Cùng một model id cũng có thể tồn tại dưới nhiều provider, adapter còn có thể chấp nhận id động không nằm trong danh mục đề xuất. Dung lượng sai sẽ khiến việc nén kích hoạt quá muộn và gây tràn vốn có thể tránh được, hoặc khiến việc nén kích hoạt quá sớm và loại bỏ context hữu ích.

Hai chủ sở hữu cấu hình trực quan đều không thể tự giải quyết vấn đề một cách độc lập. Compact-basic là plugin tùy chọn, không biết adapter chấp nhận những model nào. Adapter LLM (Large Language Model) sở hữu routing model, nhưng không thể phụ thuộc vào plugin nén tùy chọn, cũng không nên hấp thụ ngưỡng, giữ lại, bộ tóm tắt và chính sách retry chuyên dụng cho phía tiêu thụ. Thiết kế này vừa cần fact dung lượng có thẩm quyền và chính sách compaction tùy chọn theo từng đích, vừa không được xây dựng thêm một registry model thứ hai.

## Quyết định

### Adapter sở hữu dung lượng routing chính xác

`LlmAdapter.resolveModel(provider, model, signal?)` trả về một bản ghi metadata tổng hợp routing chính xác, trong đó `LlmModelContext` tùy chọn nằm dưới trường `context`. `LlmRuntime.resolveModelInfo()` chọn phía sở hữu routing đã đăng ký, xác thực `contextWindow` là số nguyên dương, và trả về metadata tách biệt khỏi trạng thái nội bộ của adapter. Truy vấn này độc lập với `listModels()`: model động không nằm trong danh mục vẫn có thể có metadata dung lượng, còn thiếu `context` chỉ có nghĩa adapter không thể mô tả dung lượng.

Adapter DeepSeek viết tay cho phép mỗi model đã cấu hình cung cấp `contextWindow` tùy chọn, và hỗ trợ `defaultContextWindow` cấp adapter. Dung lượng model chính xác được ưu tiên; mục model chưa cung cấp dung lượng và id truyền qua chưa liệt kê sẽ kế thừa giá trị mặc định của adapter, nếu giá trị mặc định cũng không tồn tại thì bỏ qua `context`. Cả hai mục model tích hợp sẵn đều công khai dung lượng chính xác 256.000 token. Adapter pi-ai resolve dung lượng từ cùng một descriptor danh mục, descriptor này cũng dùng để resolve model request có thẩm quyền.

### Đo lường token giữ tính độc lập với model

`dsh-token-meter` không có cấu hình, cũng không có profile model. Nó sở hữu một fold replay cố định, và trả về áp lực token ước tính tuyệt đối, cùng giá trị token ước tính của node lớp bề mặt theo vị trí. Sau khi loại bỏ dung lượng toàn cục, việc đo lường vẫn có thể tái sử dụng khi chưa load compaction-basic, đồng thời tránh biến việc quyết toán replay thành một registry model thứ hai.

### Compact-basic resolve đặc tả đích

Compact-basic sở hữu chính sách phía tiêu thụ. Trường cấp cao nhất định nghĩa giá trị mặc định; `modelPolicies` chứa các ghi đè một phần được khóa theo đúng tổ hợp `{ provider, model }`. Đích trùng lặp, trường chưa biết hoặc trường không hợp lệ đều sẽ khiến plugin load thất bại. `thresholdRatio` mặc định là `0.8`, chính sách giữ lại mặc định là `retainRatio: 0.16`; phía gọi cũng có thể dùng `retainTokens` tuyệt đối thay thế, nhưng hai hình thức giữ lại loại trừ lẫn nhau. Sau khi hoàn tất kế thừa, nếu tỷ lệ giữ lại không nhỏ hơn tỷ lệ ngưỡng, plugin cũng sẽ load thất bại, vì không có dung lượng model nào khiến chính sách này có hiệu lực.

Với việc kiểm tra áp lực chủ động, compaction-basic đọc routing request bền vững mới nhất, resolve dung lượng adapter và chính sách đích chính xác của nó, rồi quy đổi tỷ lệ thành `ResolvedCompactSpec`. Mỗi lần kiểm tra đều resolve lại, do đó khi cùng một session chuyển provider hoặc model, dung lượng và chính sách sẽ thay đổi ngay lập tức. Nếu ngân sách giữ lại tuyệt đối không nhỏ hơn ngưỡng đã quy đổi, hệ thống sẽ thất bại tại thời điểm dung lượng đích lần đầu cho phép so sánh cả hai.

Cùng một ghi đè đích chính xác còn có thể chọn provider/model tóm tắt, giới hạn trên output tóm tắt, số lần retry hội tụ, và giới hạn trên retry tràn. Tất cả đều thuộc về vấn đề compaction, sẽ không đi vào bất kỳ provider LLM nào.

### Lỗi áp lực chuyên dụng theo đích vẫn giữ khả năng tổ hợp tùy chọn

Adapter thiếu metadata dung lượng vẫn là routing LLM hợp lệ. Việc kiểm tra áp lực chủ động thủ công sẽ trả về lỗi cấu hình chuyên dụng theo đích; listener tự động chỉ cảnh báo một lần theo đúng routing, và tiếp tục giữ lại toàn bộ lịch sử. Khi dung lượng đã resolve phơi bày ngân sách giữ lại tuyệt đối không hợp lệ, hệ thống cũng sẽ chặn cảnh báo lặp lại theo routing; các lỗi vận hành khác vẫn hiển thị riêng ra bên ngoài. Việc tràn đã chuẩn hóa mà provider xác nhận không cần metadata dung lượng: nó bỏ qua ngưỡng chủ động và ngân sách giữ lại thông thường, thử một lần thu nhỏ tối đa và cân bằng, và giữ lại lỗi provider gốc khi việc thay thế không thể chứng minh tiến triển.

## Kiểm thử

Test dịch vụ bao phủ metadata context tách biệt khỏi trạng thái nội bộ adapter, output adapter không hợp lệ, tính độc lập với danh mục và hành vi mặc định khi thiếu. Test adapter bao phủ dung lượng chính xác của DeepSeek, dung lượng mặc định, việc resolve model chưa liệt kê và dung lượng không hợp lệ, cùng việc resolve descriptor chính xác của pi-ai. Test compaction bao phủ việc quy đổi tỷ lệ, ghi đè provider/model chính xác, việc từ chối tỷ lệ hợp nhất không hợp lệ khi load, việc xác thực ngân sách tuyệt đối tại runtime, việc chuyển provider của cùng model id, việc chặn cảnh báo chuyên dụng theo đích, và việc phục hồi tràn không phụ thuộc dung lượng. Fixture (dữ liệu tiền đặt cho test) Loader sẽ từ chối cấu hình dung lượng token-meter đã bị loại bỏ, còn ví dụ thì cấu hình dung lượng trên adapter.

## Các phương án thay thế từng cân nhắc

- **Đặt dung lượng và toàn bộ chính sách vào compaction-basic** — không chấp nhận, vì compaction-basic sẽ copy lại kiến thức model của adapter, model động chưa liệt kê cần đăng ký song song, và dung lượng cũng sẽ biến mất khi chưa cài đặt compaction.
- **Đặt chính sách compaction vào từng adapter LLM** — không chấp nhận, vì adapter phải độc lập với phía tiêu thụ tùy chọn, còn chính sách tóm tắt và retry cũng không phải fact của provider.
- **Coi `listModels()` là nguồn có thẩm quyền** — không chấp nhận, vì năng lực discovery chỉ là thông tin gợi ý, một số adapter cố ý chấp nhận id động. Metadata về tính đúng đắn không được biến quan hệ thành viên selector thành whitelist routing.
- **Thêm fold theo từng model cho token-meter** — không chấp nhận, vì thuật toán replay có thể dùng chung, chỉ có dung lượng và chính sách phía tiêu thụ thay đổi. Nhiều fold sẽ lặp lại trạng thái, mà không cải thiện việc ước tính.
- **Xây registry context model độc lập** — không chấp nhận, vì adapter đã sở hữu việc resolve routing có thẩm quyền. Một registry thứ hai sẽ đưa vào vấn đề thứ tự vòng đời, key trùng lặp và trôi (drift), mà không có backend độc lập.

## Hệ quả

- Dung lượng có một chủ sở hữu có thẩm quyền duy nhất tại quy ước provider, còn chính sách compaction ở lại trong plugin tiêu thụ tùy chọn.
- Cùng một instance compaction-basic có thể xử lý an toàn các cửa sổ khác nhau, việc chuyển provider, và cùng model id dưới các provider khác nhau, mà không cần truy vấn metadata discovery.
- Tổ hợp chỉ-LLM và chỉ-meter vẫn hoạt động bình thường; load compaction-basic sẽ không khiến adapter phát sinh phụ thuộc ngược.
- Deployment DeepSeek có thể đặt dung lượng chính xác theo từng model, cũng có thể để mục model chưa cung cấp dung lượng và id truyền qua chưa liệt kê dùng `defaultContextWindow`.
- Giá trị mặc định theo tỷ lệ sẽ tự nhiên quy đổi theo model, đồng thời vẫn có thể dùng giá trị giữ lại tuyệt đối theo đích chính xác để đáp ứng hành vi chuyên dụng của deployment.

Bản ghi này thay thế phần dung lượng toàn cục và chính sách không có model trong [Agent Note về dịch vụ đo lường token kiểu replay](2026-07-15-replay-token-meter-service.md), quyết định đo lường single-fold giữ nguyên không đổi.
