# Agent Note: Số token đầu ra tối đa của SDK

Status: implemented

[English](2026-07-28-sdk-max-output-tokens.md) | Tiếng Việt

## Vấn đề

SDK Python và TypeScript có thể chọn nhà cung cấp và model, nhưng lại không giới hạn được đầu ra của model hội thoại. Ngay cả khi host chấm điểm yêu cầu một ngân sách đầu ra cố định, runtime vẫn bỏ qua `GenerateOptions.maxTokens` và để giá trị mặc định của nhà cung cấp quyết định. `compaction-basic.maxTokens` chỉ giới hạn lời gọi tóm tắt khi nén, không thể gánh vác trách nhiệm này.

## Quyết định

SDK ở tầng cao phơi bày một giới hạn đầu ra tùy chọn ở cấp tiến trình: Python đặt tên là `max_tokens`, TypeScript đặt tên là `maxTokens`, còn payload giao thức `initialize` dùng chung thì dùng `maxTokens`. Server JSON-RPC từ chối mọi giá trị không phải số nguyên dương an toàn, và lưu giới hạn đã qua kiểm tra cùng với định tuyến nhà cung cấp/model.

Mỗi root Agent do SDK tạo ra đều nhận giới hạn này qua `AgentOptions.maxTokens`. Agent loop (vòng lặp tác tử) đặt nó vào `LlmCallConfig` khởi tạo; bước chuẩn bị lời gọi cuối cùng sẽ giữ lại giá trị tường minh, hoặc điền vào giá trị mặc định của adapter ứng với đúng model đó, rồi ghi giới hạn có hiệu lực vào header của request, và dựng lại request hội thoại cho từng lần điều phối từ chính header đã lưu bền vững đó. Do vậy, khi bỏ qua tùy chọn của SDK thì giá trị mặc định của adapter được chọn hoặc của tuyến nhà cung cấp sẽ được áp dụng.

Subagent chạy trong cùng tiến trình kế thừa nhà cung cấp, model và giới hạn đầu ra của cấp cha. Một `SubagentStartRequest.agentOptions.maxTokens` tường minh (bao gồm cả giá trị cấu hình qua `dsh-tool-subagent`) sẽ ghi đè giá trị kế thừa cho cấp con đó và toàn bộ hậu duệ của nó. Nhà cung cấp chạy ngoài tiến trình tự nắm giữ cấu hình cho runtime độc lập của mình; vì vậy `subagent-dsh-sdk` phơi bày một `maxTokens` tùy chọn riêng và truyền vào thông qua chính lần bắt tay SDK của runtime con đó.

Nén, sinh tiêu đề session, tìm kiếm web và các lời gọi phụ trợ khác vẫn tiếp tục dùng giới hạn đầu ra độc lập của riêng chúng. `maxTokensAsSuccess` vẫn chỉ phụ trách ánh xạ kết quả, không đặt hay thay đổi giới hạn nào.

## Các phương án đã cân nhắc

**Chỉ đặt biến môi trường của adapter.** Giá trị dự phòng riêng tư của bộ tuần tự hóa chỉ áp dụng cho adapter DeepSeek, không xuất hiện trong header request của session, không có tác dụng với request bị chặn hay với adapter khác, và cũng dễ bị lẫn với giá trị mặc định của nhà cung cấp. Giá trị mặc định do adapter nắm giữ có thể chuyển sang phơi bày qua metadata ứng với đúng model, rồi điền vào cấu hình request không phụ thuộc nhà cung cấp trước khi ghi log.

**Thêm `maxTokens` vào từng `session/prompt`.** Sửa theo từng lượt sẽ làm phình định dạng giao thức, và kéo theo các phép biến đổi cấu hình request mà ca chấm điểm hiện tại không cần. Tùy chọn khởi tạo runtime cho phép mọi session trong cùng một tiến trình SDK có chung một ngân sách nhất quán, tái lập được.

**Tái dùng `compaction-basic.maxTokens`.** Giá trị dành cho nén điều khiển việc sinh tóm tắt, chứ không phải request hội thoại thông thường. Dùng chung sẽ ghép hai loại ngân sách token khác nhau lại với nhau, khiến việc chỉnh một bên âm thầm làm thay đổi bên kia.

## Hệ quả

Bên gọi SDK có thể giới hạn đầu ra của model mà không cần sửa composition Cordis, và việc tạo Agent trực tiếp cũng dùng đúng bộ quy ước `AgentOptions` đã qua kiểm tra ấy. Giới hạn này hiển thị trong header request được lưu bền vững, và đến với adapter của nhà cung cấp dưới dạng `GenerateOptions.maxTokens`; bộ tuần tự hóa DeepSeek ánh xạ nó thành `max_tokens`.

Một runtime SDK chỉ có duy nhất một giới hạn mặc định. Bên gọi cần giới hạn khác nhau thì nên chạy các thực thể runtime riêng biệt, hoặc ghi đè tường minh cho một cấp con trong cùng tiến trình thông qua agent options. Khi chạm giới hạn thì vẫn sinh ra lý do dừng `max-tokens` như hiện có; còn ánh xạ nó thành `ok` hay `error` thì vẫn do chính sách triển khai quyết định.
