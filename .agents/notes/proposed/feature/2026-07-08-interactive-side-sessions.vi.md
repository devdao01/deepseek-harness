# Agent Note: Phiên phụ tương tác và ghi hợp nhất trở lại

Status: proposed

[English](2026-07-08-interactive-side-sessions.md) | 中文

## Vấn đề

Người dùng có thể muốn khám phá một câu hỏi xuất phát từ phiên đang hoạt động mà không làm thay đổi ngữ cảnh chính của phiên hiện tại. Các nguyên thủy hiện có không cung cấp được hình thái sản phẩm này: [fork lưu trữ phiên](../../implemented/feature/2026-06-30-session-store-fork-api.md) tạo ra một phiên chưa gắn kết, còn [fork subagent](../../implemented/feature/2026-06-21-subagent-capability-seam.md) là một tác vụ do model điều khiển, transcript (bản ghi văn bản) của nó bị gập lại thành một kết quả tool. Cả hai đều không thể cho người dùng một cuộc hội thoại độc lập, cũng không thể vừa ghi lại kết luận trong phiên cha vừa ghi lại phiên phụ đã sinh ra kết luận đó.

## Đề xuất

**Phiên phụ (side session)** là một phiên hoạt động bình thường, được fork từ lượt hoàn tất cuối cùng của phiên nguồn, gắn với agent (tác tử) của riêng nó, được định vị là cố vấn chỉ-đọc, và có thể **hợp nhất ghi trở lại** một ghi chú cô đọng.

- **Fork và gắn kết:** tạo phiên con bằng tiền tố các lượt đã hoàn tất cân bằng của phiên cha, và đánh dấu `parentSession` cùng `seedLength` trong metadata của nó. Việc này kết hợp `ctx.agents.create({ seed, meta })`; không thêm service core hay phương thức lưu trữ phiên mới.
- **Định vị cố vấn:** sau khi tạo, tiêm một `context/message` có nguồn từ plugin, báo cho phiên con biết chỉ được giải thích, không được thực thi thay đổi hay tiếp tục tác vụ. Giữ system prompt giống hệt từng byte, có thể giữ lại prefix cache của nhà cung cấp trên lịch sử được kế thừa.
- **Hợp nhất ghi trở lại:** yêu cầu phiên con đưa ra một handback có giới hạn độ dài, sau đó tiêm một `context/message` có nguồn từ plugin vào phiên cha. Request tiếp theo của phiên cha nhìn thấy tin nhắn này ở vị trí được ghi trong log, giữ được khả năng replay và [khả năng dựng lại request](../../implemented/architecture/2026-07-05-reconstructable-requests.md), không cần thêm sự kiện phiên mới.
- **Hiển thị:** cách gọi, chuyển đổi phiên và render handback thuộc về giao diện của client đầu tiên sở hữu nó. Agent Note này chỉ quy định cơ chế không liên quan đến giao diện.

Việc sản phẩm hóa rollback, view cây phiên, tool phiên phụ hướng-về-model, cùng metadata `forkName`/`mergedInto` đều không nằm trong phạm vi Agent Note này. Một spike adapter thật đã xác minh được sự cô lập log nguồn, ngữ cảnh kế thừa, tương tác phiên con nhiều lượt, và khả năng nhìn thấy của việc hợp nhất ghi trở lại trong lượt tiếp theo của phiên cha.

## Các phương án thay thế đã cân nhắc

- **Dùng seam subagent:** bác bỏ. Phiên phụ do người dùng điều khiển, client có thể nhìn thấy, và có thể tồn tại lâu hơn một lượt của phiên cha; subagent là một lần chạy do model điều khiển, trả về một kết quả tool.
- **Sửa system prompt của phiên con:** mặc định bác bỏ, vì bất kỳ thay đổi byte nào cũng sẽ làm mất hiệu lực prefix cache kể từ token số không. Bên triển khai vẫn có thể chọn cách cô lập mạnh hơn này.
- **Thêm sự kiện `sidechat/*` mới:** hoãn lại. `context/message` đã gắn nhãn nguồn đã ghi bền vững nội dung, bên sản xuất và đầu vào replay; chỉ khi có một giao diện cần render khác biệt thì sự kiện chuyên dụng mới có lý do chính đáng.
- **Gắn kết một protocol interface ngay bây giờ:** bác bỏ. UI hiện tại thuộc về client. Việc hiển thị thời gian thực cuối cùng phải được suy ra từ tin nhắn bền vững, để việc replay render ra cùng bản ghi.

## Tiêu chí nghiệm thu

- Fork không làm thay đổi phiên nguồn, phiên con được tạo có tiền tố lượt đã hoàn tất cân bằng, `parentSession`, `seedLength`, và system prompt giống hệt từng byte.
- Định vị cố vấn thêm đúng một `context/message` có nguồn từ plugin vào đầu lịch sử append của phiên con, chứ không sửa system prompt của nó.
- Hợp nhất ghi trở lại thêm đúng một `context/message` có giới hạn độ dài, nguồn là `plugin: sidechat`; request tiếp theo và việc replay của phiên cha nhìn thấy nó ở cùng vị trí.
- Phiên cha và phiên con chạy đồng thời, không có nhiễu xuyên giữa log và luồng.
- Test đơn vị bao phủ fork/attach và hợp nhất ghi trở lại; test snapshot đi kèm cùng giao diện gắn kết đầu tiên.

## Rủi ro

- Hành vi chỉ-đọc chỉ mang tính khuyến nghị cho đến khi cổng từ chối `tools/pre-execute` được thực thi bắt buộc; [điểm chặn mở rộng](../../implemented/feature/2026-06-30-interception-extension-points.md) có thể thêm cổng đó mà không cần thay đổi cơ chế này.
- Fork từ một phiên nguồn đã qua nén (compaction) sẽ ra một view đã nén của nó, nên giao diện gắn kết nên báo cho người dùng biết phiên con kế thừa là bản tóm tắt chứ không phải các lượt đã bị thay thế.
- Handback lặp lại nhiều lần sẽ tiêu tốn ngữ cảnh của phiên cha. Giới hạn độ dài của mỗi lần hợp nhất ràng buộc kích thước một ghi chú; việc dọn dẹp các lần hợp nhất về sau thuộc trách nhiệm của nén ngữ cảnh.
