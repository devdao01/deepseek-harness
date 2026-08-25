# Agent Note: Ghép kênh nhiều phiên ACP đồng thời trên một connection

Status: implemented

[English](2026-06-14-acp-multi-session.md) | Tiếng Việt

> Agent Note này được viết vào thời kỳ ACP còn là lớp cầu nối cho editor, động lực xuất phát từ mô hình client đa phiên của Zed. [ACP như một giao thức chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) đã loại bỏ giao diện editor; bản thân quyết định ghép kênh không đổi, Agent Note này giờ trình bày nó theo quy ước tự động hóa.

## Vấn đề

Một client tự động hóa ACP (Agent Client Protocol) có thể giữ nhiều cuộc hội thoại trên cùng một child process agent (tác tử). Nếu lớp cầu nối chỉ hỗ trợ một phiên hoạt động, sẽ buộc phải khởi động thêm process, đồng thời ngăn một controller cha điều khiển nhiều subtask độc lập qua một kết nối duy nhất. Ghép kênh mang lại rủi ro cô lập: câu trả lời đã commit, hoàn tất prompt, hủy, yêu cầu quyền hạn và job id nền có thể dự đoán được đều tuyệt đối không được vượt qua ranh giới phiên.

## Quyết định

Lớp cầu nối ACP lưu các phiên đang hoạt động trong `Map<SessionId, SessionRecord>`. Callback ở phạm vi agent dùng `ownedRecord`: tra cứu `agent.session.id` trong map thuận, và chỉ chấp nhận khi bản ghi đó sở hữu chính xác đối tượng agent, để đối tượng cùng id từ bên ngoài không thể chiếm dụng phiên. Một bản ghi sở hữu agent của nó, một trigger giải phóng chính xác, và tùy chọn một prompt đang diễn ra cùng số turn bền vững quyết toán prompt đó. Header phiên sở hữu cwd của nó; lớp cầu nối không giữ trạng thái workspace hay client capability song song.

Mỗi callback `session/event` sẽ giải quyết bản ghi thuộc về nó trước khi gửi hoặc quyết toán bất kỳ điều gì. Mỗi phiên cho phép độc lập một prompt đang diễn ra. Prompt bắt lấy `turn/start` xuất phát từ tin nhắn người dùng của chính nó, và chỉ quyết toán khi `turn/end` khớp đến; các turn tự chủ do injected turn, plugin hoặc goal khởi tạo, cùng end đến muộn từ turn trước đã bị hủy, không thể resolve nó. `session/cancel` định vị đến một bản ghi, chỉ gọi đường hủy có nhận biết hàng đợi của agent đó.

Việc phân định quyền hạn dùng cùng phép kiểm tra agent chính xác trên map thuận. Bộ trả lời `approval/request` của ACP chỉ gửi yêu cầu chính sách máy một lần cho phiên sở hữu agent phát khởi yêu cầu, và ủy quyền yêu cầu bên ngoài hoặc yêu cầu không có call id ra ngoài. Lớp cầu nối không có hướng dẫn form, lựa chọn cấu hình, hay trạng thái tương tác người-máy nào khác.

Tác vụ bash nền mang một token owner mờ, giá trị bằng đúng id của phiên sở hữu nó. `job_output` và `job_kill` so sánh token của bên gọi với quyền sở hữu tác vụ của executor trước khi đọc hoặc chấm dứt; chỉ dựa vào job id có thể dự đoán được không thể có được quyền truy cập. Thông tin sở hữu được lưu cùng tác vụ của executor, nên việc reload plugin tool không xóa nó.

Khi tháo dỡ connection, map hoạt động được xóa sạch, mỗi prompt đang chờ được quyết toán ở trạng thái hủy, và mọi `AgentHandle` được dispose (giải phóng tài nguyên) song song. Mỗi handle dừng và chờ vòng lặp của nó hoàn tất, flush phiên nếu vẫn còn gắn kết, hủy đăng ký agent và loại bỏ phiên. Thao tác tháo dỡ được memoize hóa, dùng chung giữa việc client ngắt kết nối và plugin dispose.

## Phạm vi giao thức và workspace

[ACP v1 cho phép rõ ràng nhiều phiên đồng thời trên một connection](https://github.com/agentclientprotocol/agent-client-protocol/blob/01beb5fb5eec60e9f516a80d85eb03594bac61e3/docs/get-started/architecture.mdx#L16-L24), mỗi phiên mới mang theo `cwd` chính của riêng nó. Cầu nối này hiện thực việc ghép kênh ở cấp phiên đó, trong đó bao gồm cả các workspace chính khác nhau như [quyết định cwd theo phiên](../architecture/2026-07-02-fs-per-session-cwd.md) đã ghi lại; nó không tạo một child process agent cho mỗi phiên.

Dự án đa gốc bên trong một phiên là một khả năng tùy chọn khác: ACP [định nghĩa root hiệu lực là `cwd` chính cộng `additionalDirectories`](https://github.com/agentclientprotocol/agent-client-protocol/blob/01beb5fb5eec60e9f516a80d85eb03594bac61e3/docs/protocol/v1/session-setup.mdx#L313-L367). Lớp cầu nối tự động hóa không công bố bất kỳ khả năng đa gốc nào, và từ chối `additionalDirectories` không rỗng; như [quy ước package](../../../../packages/acp/acp/README.md#protocol-contract) đã ghi lại, mỗi phiên mới hoàn toàn có đúng một workspace.

[Transport chuẩn là mỗi kết nối stdio một child process agent](https://github.com/agentclientprotocol/agent-client-protocol/blob/01beb5fb5eec60e9f516a80d85eb03594bac61e3/docs/protocol/v1/transports.mdx#L17-L42); do đó nhiều connection cần nhiều child process hoặc transport tùy chỉnh, còn quyết định này đảm bảo có nhiều phiên bên trong một connection. Trong connection đó, `ctx.sandboxPolicy` phân giải `cwd` của mỗi phiên thành root `workspace-write` của riêng nó, nên dịch vụ bash và filesystem dùng chung có thể phục vụ các dự án đồng thời mà không cấp quyền ghi xuyên dự án. Điều này không thêm `additionalDirectories` của ACP; nó chỉ loại bỏ giới hạn root cấp process khỏi đường "mỗi phiên một root chính" vốn đã được hỗ trợ.

## Phương án thay thế đã cân nhắc

**Một phiên hoạt động cho mỗi connection**: bị phủ quyết. Tăng chi phí process, và ngăn controller cha lập trình ghép kênh công việc có thể hủy độc lập.

**`ctx.extend()` cho mỗi phiên**: bị phủ quyết. Sub-context tự nó không tạo ra sub-plugin fiber, nên listener vẫn thuộc về fiber của lớp cầu nối. Cài đặt thực tế của lớp cầu nối dùng listener toàn cục cộng phép giải ghép kênh O(1) tường minh, cùng bản ghi thuộc sở hữu từng phiên; vòng đời agent do `AgentHandle` quản lý.

**Dùng danh tính đối tượng agent làm quyền sở hữu tác vụ bash**: bị phủ quyết. Đối tượng agent sau khi khôi phục hoặc thay thế có thể hợp lệ đại diện cho cùng một phiên bền vững. Token phiên mờ mới là danh tính xuyên ranh giới, cần sống sót sau khi plugin reload.

## Hậu quả

N phiên có thể đồng thời trả về câu trả lời đã commit, gửi prompt, yêu cầu quyền hạn và chạy tác vụ nền mà không đan xen hoặc quyết toán xuyên phiên. Việc hủy trong một phiên không ảnh hưởng đến các phiên lân cận. Lớp cầu nối phải trả giá bằng map tường minh và test cô lập, nhưng nó không thêm một tập listener cho mỗi phiên, nhờ đó tránh được listener phình to trong suốt kết nối dài.

Lớp cầu nối không phơi bày phương thức giao thức để đóng độc lập một phiên hoạt động đơn lẻ. Mọi bản ghi bị loại bỏ đồng loạt khi tháo dỡ connection; việc điều hướng và khôi phục phiên thuộc về host API, không thuộc giao thức tự động hóa này.

## Kiểm chứng

Bộ test đa phiên vận hành các phiên đồng thời bằng cách điều phối câu trả lời đã commit theo tuyến, các prompt đang diễn ra độc lập, hủy có định hướng và tháo dỡ dùng chung; bộ test biên phê duyệt và output bao phủ việc định tuyến quyền hạn và việc từ chối các đối tượng agent không giống nhau. Test bash của tool chứng minh một phiên không thể đọc hay chấm dứt tác vụ nền của phiên khác.
