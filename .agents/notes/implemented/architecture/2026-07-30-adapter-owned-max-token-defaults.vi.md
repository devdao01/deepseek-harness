# Agent Note: Giá trị mặc định max token do adapter sở hữu

Status: implemented

[English](2026-07-30-adapter-owned-max-token-defaults.md) | Tiếng Việt

## Problem

Adapter LLM (mô hình ngôn ngữ lớn) có thể tuần tự hóa `GenerateOptions.maxTokens` tường minh, nhưng không thể thiết lập một giá trị mặc định cho hội thoại có thể tái dựng thông qua cấu hình Cordis. Nếu chỉ áp dụng giá trị dự phòng trong khâu tuần tự hóa của bên cung cấp, yêu cầu ở tầng giao thức sẽ không nhất quán với `request/header` bền vững; còn nếu đưa mặc định của từng bên cung cấp vào agent loop (vòng lặp tác tử) thì lại chuyển chính sách triển khai và chính sách mô hình vào một bộ điều khiển vốn độc lập với bên cung cấp.

## Decision

`LlmResolvedModelInfo.defaultMaxTokens` mang giới hạn đầu ra tùy chọn cho một yêu cầu đơn lẻ của đúng một route bên cung cấp/mô hình, và giá trị này do adapter cấu hình. `LlmRuntime` kiểm tra nó phải là số nguyên an toàn dương, và chỉ điền vào `LlmCallConfig.maxTokens` khi bên gọi bỏ trống giá trị. Lời gọi sau khi chuẩn bị sẽ đánh dấu các trường `maxTokens` và `reasoningEffort` đã được điền là giá trị mặc định của adapter; giá trị yêu cầu tường minh hoặc tùy chọn agent không mang dấu này, nên được ưu tiên và không bị tự động điều chỉnh.

Agent loop vẫn chuẩn bị lời gọi trước khi ghi `request/header`, nên cấu hình có hiệu lực cùng các dấu chỉ ra trường nào được điền bởi mặc định của adapter sẽ trở thành dữ kiện yêu cầu bền vững trước khi phân phối. Trước waterfall (sự kiện thác nước) `agent/request` kế tiếp, agent loop sẽ loại bỏ các trường có dấu khỏi đề xuất, sau đó việc phân giải mô hình chính xác sẽ điền lại giá trị mặc định của route hiện tại. Nhờ vậy, việc đổi bên cung cấp/mô hình sẽ không khiến giá trị mặc định của adapter trước đó bị hiểu nhầm thành một ghi đè tường minh, còn giá trị tường minh của hội thoại thì được giữ lại. Khi gọi trực tiếp `LlmRuntime.stream()`, cùng giá trị mặc định đó cũng được phân giải tại ranh giới adapter cuối cùng. Trường này là giá trị mặc định của yêu cầu, không phải giới hạn cứng cho đầu ra của mô hình; adapter tiếp tục dùng mặc định riêng của bên cung cấp sẽ bỏ qua nó.

Adapter DeepSeek gốc công khai `maxTokens` trong cấu hình Cordis với giá trị mặc định là 256.000 token, và ánh xạ giá trị có hiệu lực thành `max_tokens`. Dung lượng context mặc định của nó là 1.000.000 token: cả hai mục cấu hình V4 dựng sẵn đều công bố đúng dung lượng này; các mục đã cấu hình không kèm dung lượng và các id truyền thẳng không được liệt kê thì kế thừa cùng một giá trị dự phòng ở cấp adapter.

## Alternatives considered

**Chỉ áp dụng giá trị mặc định trong khâu tuần tự hóa của DeepSeek.** Không chọn, vì giao thức của bên cung cấp sẽ chứa giá trị mà mô hình nhìn thấy nhưng lại thiếu trong header yêu cầu bền vững.

**Đặt `AgentOptions.maxTokens` trong từng ứng dụng đã phát hành.** Không chọn, vì ứng dụng sẽ nhân bản chính sách triển khai của adapter, hành vi của lời gọi LLM trực tiếp sẽ khác đi, và ngay cả khi chọn bên cung cấp khác thì giới hạn riêng của DeepSeek vẫn được giữ lại.

**Biểu diễn 256.000 như giới hạn cứng cho mỗi mô hình.** Không chọn, vì giá trị cấu hình là ngân sách yêu cầu mong muốn, và không thể chứng minh rằng mọi endpoint đã cấu hình đều từ chối đầu ra lớn hơn. Bên gọi tường minh vẫn có quyền quyết định cuối cùng.

**Để giá trị mặc định của bên cung cấp chi phối.** Không chọn cho các triển khai DeepSeek gốc, vì sản phẩm yêu cầu mọi endpoint tương thích đều dùng ngân sách hội thoại ổn định 256.000 token.

## Consequences

Hội thoại DeepSeek mặc định gửi `max_tokens: 256000`, header yêu cầu của session sẽ ghi lại giá trị đó cùng thông tin rằng giá trị này do adapter cung cấp. Bên triển khai có thể đổi giá trị mặc định của adapter qua `llm-deepseek.config.maxTokens`; giá trị theo từng agent và theo từng yêu cầu sẽ ghi đè lên nó. Đổi route sẽ điền lại giá trị mặc định của adapter khớp chính xác với route mới, thay vì tiếp tục dùng giá trị dẫn xuất từ DeepSeek. Các adapter khác giữ nguyên hành vi hiện có cho tới khi chủ động công bố `defaultMaxTokens`.

Với những endpoint cấp phát trước đầu ra của yêu cầu, ngân sách đầu ra 256.000 token sẽ chiếm một phần rất lớn trong context 1.000.000 token. Nếu bên triển khai dùng gateway hoặc mô hình chỉ hỗ trợ ngân sách nhỏ hơn thì phải hạ `maxTokens`; cấu hình tường minh vẫn tốt hơn giá trị dự phòng không được ghi tài liệu của bên cung cấp.
