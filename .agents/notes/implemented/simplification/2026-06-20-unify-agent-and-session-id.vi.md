# Agent Note: Hợp nhất agent id với session id

Status: implemented

[English](2026-06-20-unify-agent-and-session-id.md) | Tiếng Việt

## Vấn đề

Một cặp agent (tác tử) / phiên đang sống cần dùng chung một identity để định tuyến registry, event sourcing và lưu trữ bền vững. Việc để factory nhận hai đầu vào độc lập `agentId` và `sessionId` cho phép tạo ra những cặp giá trị mà không đường dẫn production nào dùng được, đồng thời buộc mọi bên tiêu thụ phải chọn hoặc chuyển đổi giữa hai tên gọi cho cùng một vòng đời.

ACP (Agent Client Protocol) dùng cùng một giá trị cho cả hai identity. Stdio và hook cũng làm việc trên luồng sự kiện phiên và trực tiếp cần agent đang sống tương ứng; không đường dẫn production nào gắn lại một đối tượng agent đang sống vào nhiều phiên, hay điều khiển một phiên qua nhiều agent id.

[Runtime phạm vi agent](../architecture/2026-07-12-agent-scope-runtime-design.md) dùng cùng một `AgentCreationTransaction` để thực hiện tạo mới và khôi phục, và các mục agent/phiên chia sẻ cùng quy tắc xung đột mục cuối cùng. Identity thứ hai không đại diện cho một trạng thái sống, rollback hay dừng hẳn riêng biệt; nó chỉ thêm API và trạng thái chuyển đổi quanh cùng một transaction.

Identity của phiên cũng chỉ có một nơi sở hữu duy nhất là `Session.header.id`; `Session.id` là accessor dẫn xuất, không phải trạng thái độc lập cần kiểm tra lặp lại.

## Quyết định

Registry id của agent bằng session id của nó. `CreateAgentOptions` nhận một `sessionId`, dùng chung cho cả hai mục registry cuối cùng; khi khôi phục thì đăng ký agent bằng `resumeSessionId`; việc tạo subagent trong tiến trình dùng session id con; còn `Session.id` được dẫn xuất từ `header.id`. Lần chạy ACP từ xa không có cặp agent/phiên cục bộ: nó giữ một id vòng đời do bên cha đúc ra, còn session id cục bộ của giao thức server con vẫn chỉ dùng nội bộ trong các lời gọi ACP. Transaction tạo mới hiện có, kiểm tra xung đột mục cuối cùng và ngữ nghĩa tách mục chính xác đều giữ nguyên; chỉ những map và trường có nhiệm vụ duy nhất là chuyển đổi giữa các id cục bộ là biến mất.

Đường dẫn do cấu hình điều khiển giữ `agents[].id` như một nhãn cấu hình ổn định, chứ không phải identity định tuyến trạng thái sống. Khởi động mới thông thường sẽ đúc ra id tổ hợp `${label}-session-${randomUUID()}`, để những lần khởi động lại có lưu trữ bền vững không xung đột. Ứng dụng gắn chặt có thể đúc trước và truyền vào một `sessionId` chính xác: lần dùng đầu tiên sẽ tạo nó, còn khi dịch vụ lưu trữ bền vững đã tồn tại thì việc gắn lại AgentLoop sẽ khôi phục lịch sử đã vật chất hóa dưới cùng identity đó. `resumeSessionId` thì yêu cầu một identity đã được lưu trữ bền vững sẵn. Hai đầu vào id chính xác này loại trừ lẫn nhau. Stdio dùng dạng «khôi phục hoặc tạo mới», để agent do cấu hình tạo ra và UI chia sẻ một identity mờ đục qua các lần tải lại vòng lặp, thay vì đoán theo tiền tố. Log có thể dùng nhãn ổn định, còn mọi tra cứu trạng thái sống và lưu trữ bền vững đều dùng chung một `SessionId`.

`agent/created` và `agent/disposed` được giữ lại. Chúng là các sự kiện vòng đời công bố theo cặp, không phải bí danh identity; nếu sau này phát hiện không có bên tiêu thụ nào và muốn gỡ bỏ, phải tìm kiếm lại trước rồi đưa ra một đề xuất riêng.

## Các phương án đã cân nhắc

**Giữ identity định tuyến và identity ghi log tách biệt.** Một nhãn cấu hình ổn định cộng với hội thoại bền vững hoàn toàn mới đúng là hữu ích, nhưng không cần tới hai identity sống: nhãn có thể tiếp tục làm metadata cấu hình/hiển thị, còn `SessionId` tổ hợp cho mỗi lần chạy đảm nhiệm định tuyến và lưu trữ bền vững. Giữ hai id sẽ khiến map chuyển đổi tồn tại mãi, cho phép những cặp giá trị bất khả thi, mà chẳng thêm năng lực vòng đời nào.

## Kiểm chứng

- Việc tạo/khôi phục agent và tạo subagent chỉ mang theo một identity, và `Session` cũng chỉ lưu nó ở một chỗ.
- Transaction tạo mới tiếp tục bao phủ xung đột mục cuối cùng, tách mục chính xác, rollback và dừng hẳn, mà không cần trạng thái vòng đời riêng cho identity.
- ACP, stdio, hook, quy thuộc bash, lưu trữ bền vững và lineage dùng trực tiếp `SessionId` dùng chung. Backend subagent ACP đúc id vòng đời của nó trong không gian tên của bên cha, vì session id do server con trả về chỉ hợp lệ cục bộ trên server đó; ACP bridge xác thực quy thuộc `Agent` chính xác dựa trên map phiên xuôi; JSON-RPC chỉ chuyển tiếp các sự kiện vòng đời có cờ `local` bằng true được lưu trong snapshot dịch vụ, lấy bên cha ủy nhiệm từ event carrier có phạm vi, và không giữ lại identity con hay cache lineage.
- Chiến lược khôi phục hoặc tạo mới do cấu hình điều khiển là tường minh, và được bao phủ trong kịch bản khởi động lại có lưu trữ bền vững.
- Việc tìm kiếm listener trong production xác nhận `agent/created`/`agent/disposed` cùng ngữ nghĩa công bố của chúng được giữ lại.

## Hệ quả

Điều này loại trừ các thiết kế actor đa phiên tiềm năng và bàn giao phiên, đồng thời biến identity phiên do client chọn và đã lưu trữ bền vững thành identity của registry. Nếu identity định tuyến độc lập trở thành nhu cầu thực sự, sẽ cần một thiết kế vòng đời tường minh, chứ không phải để bên gọi cung cấp một cặp giá trị không bị ràng buộc.
