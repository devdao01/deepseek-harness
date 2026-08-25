# @deepseek-ai/dsh-sdk-jsonrpc-server

[English](README.md) | Tiếng Việt

Plugin `jsonrpc` cung cấp JSON-RPC phân tách bằng ký tự xuống dòng qua stdio, cho phép các SDK client ngoài tiến trình điều khiển harness agent (tác nhân). [`HarnessSdkJsonRpcServer`](src/server.ts) đảm nhiệm các phương thức và thông báo giao thức; transport và các kiểu giao thức có tên nằm trong [`dsh-sdk-protocol`](../protocol/README.md), được chia sẻ với SDK client; [`jsonrpc-demo`](../../examples/jsonrpc-demo/README.md) cung cấp ứng dụng `cordis.yml` bao quanh.

## Lắp ráp

`inject: ['agents']`. Server lấy hoặc tạo một agent theo `sessionId`. Server chỉ chuyển tiếp sự kiện hoàn thành subagent nếu cờ `local` — được ghi lại khi service chụp snapshot vòng đời — bằng true; tên nhà cung cấp, id con và phả hệ được lưu bền vững đều không chứng minh được tính local. Các adapter đã đăng ký được ưu tiên; tuyến `deepseek-official` khi chưa có adapter nào đảm nhiệm sẽ gắn `dsh-llm-deepseek`, còn bất kỳ nhà cung cấp nào khác chưa có adapter đảm nhiệm sẽ khiến khởi tạo thất bại. Các năng lực khác do `cordis.yml` bao quanh cung cấp.

## Cấu hình

`maxTokensAsSuccess` mặc định là `false`, và chỉ ảnh hưởng đến trạng thái được ánh xạ theo triển khai trên `subagent.finished`; prompt của root session không có trạng thái theo từng prompt. `JsonRpcConfig.input`, `output` và `exit` là các hook transport chỉ dùng cho runtime; môi trường production dùng stdio của tiến trình và `process.exit`.

## Stdout chính là giao thức

Stdout chỉ mang các frame JSON-RPC. Triển khai không được kết hợp stdout logger; thông tin chẩn đoán phải ghi vào stderr.

## Ngữ nghĩa đóng và thoát

Plugin đáp ứng `shutdown`, flush các response và dispose (giải phóng tài nguyên) root context, đưa agent, subscription và persistence do SDK giữ đạt trạng thái dừng hẳn hoàn toàn, sau đó thoát với mã 0. Thoát do EOF và tín hiệu được app bin xử lý, và app bin cũng dispose root context. Chỉ gỡ cài đặt plugin này sẽ dừng service nhưng không thoát tiến trình.

## Ghi chú về giao thức

Giá trị ổn định của giao thức cho `initialize.serverInfo.name` là `deepseek-harness-sdk-runtime`. `initialize.maxTokens` là số nguyên dương tùy chọn, sẽ trở thành giới hạn output tối đa cho mỗi request của agent do SDK tạo ra và các thế hệ con trong cùng tiến trình của nó; giá trị không hợp lệ khiến khởi tạo thất bại, còn khi bỏ qua thì không gửi giới hạn SDK, và áp dụng giá trị mặc định của adapter hoặc tuyến nhà cung cấp đã chọn. `session/prompt` xếp một tin nhắn người dùng có định danh vào hàng đợi và trả về ngay `{ messageId }`. Server phát trực tuyến mỗi sự kiện lâu bền dưới dạng `session.event`, và phát mỗi lần chuyển trạng thái trong toàn bộ vòng đời agent dưới dạng `session.status`; nó không gán một tin nhắn trợ lý cụ thể hay `turn/end` cho prompt đó. Các request độc lập trên cùng session vẫn có thể tiếp tục xếp thêm công việc vào hàng đợi. Thư mục gốc persistence và persona do `cordis.yml` cung cấp.

## Trải nghiệm mô hình

### Tin nhắn người dùng của SDK

#### Mô hình thấy gì

Với mỗi `session/prompt` được chấp nhận, mô hình hội thoại nhận nguyên vẹn `contentBlocks` do bên gọi cung cấp như một tin nhắn người dùng trong session SDK đó. Gói này không thêm văn bản system prompt hay tool schema; những nội dung đó đến từ các plugin trong `cordis.yml` bao quanh.

#### Ảnh hưởng Token

Token của tin nhắn người dùng, tùy thuộc vào dữ liệu, sẽ đi vào lịch sử session được giữ lại và được gửi lại ở các lượt sau, cho đến khi một gói khác nén (compaction) nó. Frame JSON-RPC, thông báo session và bản ghi nội bộ của server không làm tăng token ngữ cảnh của mô hình.

#### Ảnh hưởng KV Cache

Chỉ nối thêm; nội dung mới hiển thị nằm sau tiền tố request có thể tái sử dụng, không làm mất hiệu lực các mục KV Cache hiện có.

## Hạn chế đã biết và công việc hoãn lại

- **Giao thức không có phương thức đóng theo từng session hoặc hủy prompt**: agent do SDK tạo ra sẽ tồn tại cho đến khi tiến trình đóng.
- **Không có kết quả theo từng prompt**: `MessageId` chỉ xác định việc được nhận vào inbox; client sở hữu khoảng thời gian hoạt động tự động phải tự định nghĩa và quan sát khoảng đó.
- **Độ tinh khiết của stdout do triển khai đảm bảo**: cấu hình bao quanh vẫn có thể nạp stdout logger và phá hỏng kênh JSON-RPC; plugin này không kiểm tra hay phủ quyết logger cùng cấp.
- **Adapter tự động gắn chỉ hỗ trợ DeepSeek**: `initialize` có thể tái sử dụng bất kỳ model adapter nào đã đăng ký trước, nhưng hành vi fallback duy nhất là gắn `dsh-llm-deepseek`.
