# @deepseek-ai/dsh-acp

[English](README.md) | Tiếng Việt

Máy chủ [ACP (Agent Client Protocol)](https://agentclientprotocol.com) chỉ dành cho tự động hóa, cung cấp qua JSON-RPC stdio. Các client lập trình có thể tạo agent (tác tử) harness mới, gửi prompt dạng văn bản/hình ảnh, thu thập văn bản/hình ảnh assistant đã được commit, phản hồi các yêu cầu quyền một lần theo chính sách, và hủy công việc. Client chính trong repo là [`dsh-subagent-acp`](../../subagent/subagent-acp/README.md).

Gói này là bộ điều hợp (adapter) vận chuyển, không phải tích hợp UI hay capability seam. Nó không công khai điều hướng editor, phát lại transcript (bản ghi văn bản), lệnh, chế độ, bộ chọn cấu hình, thu thập thông tin, reasoning (suy luận), kế hoạch, tiêu đề hoặc hiển thị công cụ. Việc render tương tác và đặt câu hỏi cho người dùng thuộc về Web host và các module client.

## Plugin

`apply(ctx, config)` mở `AgentSideConnection` trên stdin/stdout và điều khiển `ctx.agents`. Stdout dành riêng cho các khung (frame) giao thức.

| Cấu hình | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| `provider` | Không có | Định tuyến provider ban đầu cho mỗi agent được tạo. |
| `model` | Không có | Model ban đầu cho mỗi agent được tạo. |

Cả hai trường đều tùy chọn để một agent/request listener khác có thể cung cấp mục tiêu. Một tổ hợp ACP có thể chạy được yêu cầu cả hai.

## Quy ước giao thức

| Phương thức | Hành vi |
|---|---|
| `initialize` | Thương lượng các phiên bản được hỗ trợ. Chỉ công bố khả năng prompt hình ảnh khi đã gắn bộ lưu trữ đính kèm bền vững, và provider/model chính xác đã cấu hình sau khi giải quyết hỗ trợ đầu vào hình ảnh một cách rõ ràng; ngữ cảnh âm thanh và nhúng luôn giữ false. Không công bố khả năng session, editor, terminal, filesystem hoặc MCP. |
| `authenticate` | Không thao tác gì vì máy chủ không công bố phương thức xác thực nào. |
| `session/new` | Tạo agent mới với đường dẫn tuyệt đối làm `cwd` chính; chấp nhận `additionalDirectories` và `mcpServers` rỗng, từ chối giá trị không rỗng. |
| `session/prompt` | Giữ thứ tự các khối văn bản và hình ảnh nội tuyến (inline) được hỗ trợ, render các liên kết tài nguyên thành tham chiếu văn bản trong ngoặc vuông, và từ chối âm thanh, tài nguyên nhúng, đầu vào sai định dạng/rỗng, hoặc gửi hình ảnh khi khả năng chưa được công bố. Nó xác thực toàn bộ lô hình ảnh và kiểm tra lại định tuyến chính xác mới nhất của session trước khi lưu bất kỳ thành viên nào; gửi toàn bộ hình ảnh trước sự kiện người dùng; mỗi session chỉ cho phép một yêu cầu đang xử lý và chờ được nhận, cũng như toàn bộ Agent rảnh rỗi và giao đầu ra có thứ tự hoàn tất sau khi tin nhắn được đưa vào hàng đợi. Báo cáo `end_turn` khi hoàn tất bình thường; báo cáo `cancelled` khi bị hủy ACP tường minh, giải phóng tài nguyên, hoặc prompt bị loại bỏ trong quá trình nhận (không có chỗ trống lượt). |
| `session/cancel` | Đánh dấu và dừng việc nhận đang diễn ra, nhưng không hủy hoặc chờ công việc hiện có không liên quan trên cùng Agent; chỉ sau khi prompt đó vào inbox của Agent mới hủy Agent được chỉ định và chờ khoảng thời gian riêng của nó hoàn tất. Không phát tin nhắn người dùng đến muộn, prompt kết thúc với `cancelled`. Hủy công việc tự chủ khi không có prompt nào đang xử lý; id không xác định là không thao tác. |
| `session/update` | Phát ra một `agent_message_chunk` cho mỗi khối văn bản hoặc hình ảnh không rỗng trong `assistant/message` đã commit, giữ nguyên thứ tự. Hình ảnh được đọc lại và xác thực tính toàn vẹn trước khi giao dưới dạng base64 nội tuyến. Bỏ qua các delta gốc và sự kiện không phải tin nhắn. |
| `session/request_permission` | Cung cấp tùy chọn cho phép/từ chối một lần cho các yêu cầu phê duyệt mang id tool call, do lớp cầu nối (bridge) sở hữu. Client có thể tự động trả lời. |

Một kết nối có thể có nhiều session. Lớp cầu nối dùng id session có gắn thương hiệu (branded) làm khóa ghi, và kiểm tra agent có phải cùng một đối tượng trước khi định tuyến sự kiện hoặc yêu cầu quyền. Mỗi session có chỗ trống prompt, workspace, đường dẫn hủy và bộ giải phóng tài nguyên riêng.

Đầu ra tin nhắn đã commit chủ động đánh đổi độ trễ thấp theo từng token để đổi lấy kết quả tự động hóa sạch. Các phân đoạn provider chưa commit và các lần thử lại không thể rò rỉ văn bản hoặc hình ảnh một phần; reasoning và hoạt động công cụ vẫn được giữ trong nhật ký session để các giao diện khác quan sát. Vì việc đọc file đính kèm là bất đồng bộ, mỗi session giao nội dung theo thứ tự tuần tự; khi hình ảnh đã commit bị thiếu hoặc hỏng, phản hồi prompt sẽ thất bại thay vì phát ra placeholder.

## Vòng đời

Việc client ngắt kết nối và Cordis giải phóng dùng chung một luồng dọn dẹp được ghi nhớ (memoized). Lớp cầu nối trước tiên từ chối session và prompt mới, hủy và chờ toàn bộ việc nhận prompt, hoạt động agent và giao đầu ra có thứ tự hoàn tất, sau đó chỉ drain các thế hệ con có thể tiếp tục nằm dưới Agent mà kết nối này thực sự sở hữu, rồi giải phóng các handle đó song song, và chờ tất cả kết quả hoàn tất trước khi báo lỗi. Các front-end khác chia sẻ ngữ cảnh này giữ nguyên rừng có thể tiếp tục và việc nhận của riêng chúng. Do đó, việc chỉ reload plugin ACP sẽ không để sót agent nào.

ACP yêu cầu mỗi phản hồi prompt phải mang `stopReason`, nhưng lớp cầu nối không khẳng định nó đại diện cho kết quả lượt dành riêng cho prompt. Khoảng thời gian thao tác bắt đầu khi prompt vào inbox của Agent, kết thúc sau khi việc nhận, toàn bộ Agent rảnh rỗi và giao đầu ra có thứ tự hoàn tất; lỗi công việc Agent không liên quan trước khi vào inbox không được quy cho prompt đó. Tin nhắn assistant đã commit được stream trong khoảng thời gian riêng, công việc steering (dẫn dắt giữa chừng) hoặc chèn xảy ra trước khi Agent vào trạng thái rảnh rỗi cũng có thể tham gia vào đó. Thứ tự ưu tiên khi hoàn tất lần lượt là: hủy tường minh, lỗi giao đầu ra, lỗi Agent trong khoảng thời gian, kết thúc lượt liên quan. Khi kết thúc do đạt giới hạn token thì hoàn tất với `end_turn`; lỗi model liên quan cũng chỉ từ chối prompt tại cùng ranh giới hoàn tất đầy đủ.

## Chạy

`pnpm --dir /path/to/deepseek-harness run demo:acp` khởi động tổ hợp máy chủ tự động hóa của repo. Harness cha có thể spawn nó thông qua [`@deepseek-ai/dsh-subagent-acp`](../../subagent/subagent-acp/README.md); các client ACP khác chỉ cần các phương thức cốt lõi ở trên.

## Trải nghiệm Model

### Văn bản và hình ảnh prompt

#### Model nhìn thấy gì

`session/prompt` giữ thứ tự văn bản/hình ảnh trong một tin nhắn người dùng; văn bản liền kề được nối lại, liên kết tài nguyên được biểu diễn dưới dạng tham chiếu `[resource_link name=… uri=…]` trong ngoặc vuông, model có thể dùng công cụ của chính mình để mở nó. Base64 hình ảnh nội tuyến bị loại bỏ ngay sau khi lô được nhận, do đó tin nhắn bền vững chỉ chứa tham chiếu đính kèm đã được xác thực. Metadata giao thức, khả năng client, lựa chọn quyền và id session không bao giờ đi vào yêu cầu model.

#### Tác động Token

Chi phí token prompt và hình ảnh phụ thuộc vào dữ liệu, và được giữ trong lịch sử của session đó cho đến khi nén ngữ cảnh (context compaction). Các session ACP song song giữ ngữ cảnh độc lập.

#### Tác động KV Cache

Chỉ nối thêm; tin nhắn người dùng mới nằm sau tiền tố yêu cầu có thể tái sử dụng, không làm mất hiệu lực các mục cache trước đó.

### Quyết định quyền

#### Model nhìn thấy gì

Không nhìn thấy trực tiếp gì cả. Công cụ liên quan ghi lại kết quả của nó qua đường dẫn kết quả công cụ thông thường: cho phép, từ chối, hủy hoặc không khả dụng.

#### Tác động Token

Chỉ kết quả của công cụ liên quan đóng góp token.

#### Tác động KV Cache

Chỉ nối thêm thông qua kết quả của công cụ liên quan.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ session mới**: không hỗ trợ tải, liệt kê, khôi phục, xóa và fork.
- **Chỉ hình ảnh raster và một workspace**: prompt hình ảnh yêu cầu bộ lưu trữ bền vững cùng với định tuyến chính xác đã khai báo rõ ràng hỗ trợ đầu vào hình ảnh; chỉ chấp nhận PNG, JPEG, WebP và GIF. Âm thanh, tài nguyên nhúng, thư mục bổ sung không rỗng và máy chủ MCP đều bị từ chối; liên kết tài nguyên chỉ được làm phẳng thành tham chiếu văn bản, không lấy nội dung của chúng.
- **Chỉ câu trả lời đã commit**: tiến trình thời gian thực, reasoning, hoạt động công cụ, kế hoạch, tiêu đề và mức sử dụng không được truyền qua giao thức.
- **Vòng đời do kết nối quản lý**: một kết nối giải phóng tất cả session của nó; chức năng đóng từng session riêng lẻ chưa được triển khai.
