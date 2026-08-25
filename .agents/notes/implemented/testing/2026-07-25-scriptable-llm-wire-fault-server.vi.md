# Agent Note: Máy chủ lỗi tầng giao thức LLM có thể điều khiển bằng kịch bản

Status: implemented

[English](2026-07-25-scriptable-llm-wire-fault-server.md) | 中文

## Vấn đề

Test đơn vị của adapter dùng một máy chủ HTTP cục bộ để phân loại từng lỗi phía nhà cung cấp, còn test retry (thử lại) dùng một `LlmAdapter` được viết kịch bản trong cùng tiến trình để chứng minh khả năng phục hồi của các bước đã đóng. Cả hai ranh giới này đều không cung cấp một máy chủ có thể tái sử dụng để chạy đồng thời adapter HTTP bản phát hành, agent loop (vòng lặp tác tử) và chính sách retry; nhà phát triển cũng không thể chỉ sửa base URL và API key của ứng dụng hiện có để kết nối tới các lỗi truyền tải xác định.

Kết nối bị từ chối, kết nối bị reset trước sự kiện đầu tiên, EOF bình thường mà không nhận được `[DONE]`, hoàn thành hợp lệ nhưng không có nội dung, và kết nối bị reset sau khi đã xuất một phần nội dung — mỗi trường hợp cho ra kết quả adapter và phục hồi khác nhau. Coi tất cả chúng như lỗi mock thông thường sẽ che khuất việc ranh giới nhà cung cấp có giữ được các khác biệt này hay không, và liệu phần dữ liệu (shard) của yêu cầu thất bại có thực sự không lọt vào lịch sử model đã commit hay không.

## Quyết định

`@deepseek-ai/dsh-llm-mock-server` là một gói hỗ trợ (support package) riêng tư, cung cấp một máy chủ HTTP Node có thể import. Điểm vào nguồn `pnpm run mock:llm` trong repo cung cấp một tiến trình độc lập để tiêm lỗi thủ công; gói này không công khai lệnh binary có thể cài đặt. Nó chấp nhận đường dẫn gốc tương thích OpenAI và đường dẫn `/v1` chat-completions, xác thực bearer token tùy chọn, ghi lại yêu cầu, và tiêu thụ một hành vi tường minh cho mỗi yêu cầu được chấp nhận. Khi kịch bản cạn kiệt sẽ báo lỗi rõ ràng; chỉ khi đặt `repeatLast` thì hành vi cuối cùng mới được lặp lại.

Các hành vi yêu cầu bao phủ: reset socket, ngắt kết nối sau khi gửi header, ngắt kết nối sau khi gửi một phần nội dung, treo (stall), hoàn thành rỗng hợp lệ, đóng bình thường nhưng luồng bị cắt cụt, payload dị dạng, các lỗi HTTP điển hình, phản hồi văn bản/reasoning/tool-call đầy đủ, streaming chậm, và hoàn thành khi đạt giới hạn token. `connection_refused` thật sự được triển khai ở giai đoạn vòng đời listener của CLI (giao diện dòng lệnh), vì trình xử lý yêu cầu đã bind cổng thì không thể tự từ chối kết nối TCP của chính nó.

Mục kịch bản `random` sẽ thực hiện lại một lần chọn có trọng số cho mỗi yêu cầu. Máy chủ công khai và ghi log seed 32-bit không dấu của nó, cho phép bên gọi cung cấp trọng số tương đối, và đi kèm một cấu hình stress test thiên về kết quả thành công, trộn lẫn lỗi truyền tải, giao thức, nhà cung cấp, timeout và kết quả rỗng theo ngữ nghĩa. Cấu hình này dùng để tạo áp lực test có thể điều chỉnh, không phải ước tính tần suất sự cố thực tế trong production; `connection_refused` vẫn không nằm trong pool ngẫu nhiên theo từng yêu cầu.

Máy chủ chỉ báo cáo sự thật ở tầng giao thức, không phán đoán liệu có thể retry hay không. Test tổ hợp thực sự cho yêu cầu đi tuần tự qua `dsh-llm-deepseek`, `dsh-agent-loop` và `dsh-llm-retry`: theo chính sách mặc định hiện tại, kết nối bị từ chối, ngắt kết nối cứng, reset sau khi xuất một phần nội dung, timeout nhàn rỗi, và hoàn thành hợp lệ không có nội dung đều có thể phục hồi; EOF với nội dung một phần khi đóng bình thường vẫn được phân loại là `STREAM_CLOSED`, mặc định không retry. Gói này không thay đổi các chính sách đó.

## Xác minh

Test của gói bao phủ tất cả các hành vi yêu cầu, giải mã yêu cầu UTF-8 xuyên nhiều shard, xác thực HTTP không tiêu thụ kịch bản, kịch bản cạn kiệt và lặp lại, dọn dẹp kết nối bị treo, phân tích CLI và giới hạn độ trễ, base URL IPv6, khả năng tái lập seed ngẫu nhiên, xác thực trọng số, telemetry đơn kết quả, dọn dẹp vòng đời, và plugin bất biến đi kèm dưới cổng coverage theo từng file. Bộ test tích hợp retry đi qua adapter HTTP/SSE (Server-Sent Events) thật, xác minh số lần yêu cầu chính xác, các bước retry được đánh số, phần thân yêu cầu hoàn toàn nhất quán, shard một phần thất bại không bị rò rỉ, phục hồi từ kết quả rỗng theo ngữ nghĩa, phân loại EOF bình thường, phục hồi timeout, phục hồi từ connection refused thật sau khi listener khởi động trễ, và cạn kiệt retry có giới hạn.

## Các phương án thay thế đã cân nhắc

**Triển khai máy chủ bằng Python**: không áp dụng. API HTTP và socket chuẩn của Node đã đủ để phơi bày mọi lỗi cần thiết, còn TypeScript cho phép máy chủ, trình phân tích CLI, test, build gói, lint và coverage đều ở lại trong bộ công cụ hiện có của repo. Đưa thêm một runtime thứ hai sẽ tăng phụ thuộc môi trường và tiến trình con mà không tăng cường sự cô lập giao thức.

**Tiếp tục dùng các máy chủ mock nội tuyến độc lập trong test adapter**: không áp dụng. Các fixture (dữ liệu tiền cấu hình cho test) này không thể khởi động như máy chủ độc lập để ứng dụng hiện có kết nối tới, và sẽ khiến các bộ test khác nhau lặp lại việc triển khai hành vi, ngẫu nhiên hóa, telemetry và dọn dẹp kết nối. Gói hỗ trợ cho phép các test dùng chung một triển khai, mà không nâng nó lên thành API sản phẩm.

**Chỉ dùng mock `LlmAdapter` trong cùng tiến trình**: không áp dụng. Nó sẽ bỏ qua fetch, phân tích trạng thái HTTP và header, phân khung SSE, chấm dứt socket, và watchdog nhàn rỗi của adapter — đúng những ranh giới mà cơ sở hạ tầng test này cần bao phủ.

**Công khai lệnh binary workspace có thể cài đặt**: không áp dụng. pnpm sẽ liên kết binary của các phụ thuộc trước khi sản phẩm build của repo tồn tại, khiến việc cài đặt sạch bị ghép chặt với sản phẩm chỉ dùng cho test. Lệnh nguồn trong repo hỗ trợ cùng khả năng tiêm lỗi thủ công mà không thêm interface cài đặt gói mới.

**Sửa chính sách retry mặc định cùng lúc với máy chủ**: không áp dụng. Máy chủ dùng để bộc lộ ngữ nghĩa hiện có, không phải để quyết định chính sách. Việc có mở rộng khả năng phục hồi sang `STREAM_CLOSED` hay không cần một quyết định riêng, cân nhắc chi phí, độ trễ và rủi ro sinh lại nội dung trùng lặp.

## Hệ quả

Nhà phát triển chỉ cần sửa cấu hình URL/key của nhà cung cấp là có thể tái hiện chuỗi lỗi; test tự động thì có thể giữ lỗi tầng socket xác định thông qua kịch bản tường minh và seed. Cùng một bộ fixture giao thức giờ có thể bộc lộ khác biệt giữa reset cứng, cắt cụt bình thường và hoàn thành rỗng sau phục hồi, mà không ghép nối nội dung của nhiều lần thử hay sửa đổi lịch sử model.

Máy chủ bổ sung một gói hỗ trợ riêng tư và một bộ từ vựng hành vi, cả hai phải đồng thời tương thích với test trực tiếp và ví dụ CLI trong repo. Kịch bản thực thi theo thứ tự yêu cầu đến được chia sẻ có chủ đích giữa mọi client; giá trị mặc định của chế độ ngẫu nhiên đại diện cho trọng số stress test, không phải quy luật vận hành thực tế; để mô phỏng chính xác connection refused, client cần điều phối thời điểm thử với khoảng thời gian trước khi listener bắt đầu lắng nghe.
