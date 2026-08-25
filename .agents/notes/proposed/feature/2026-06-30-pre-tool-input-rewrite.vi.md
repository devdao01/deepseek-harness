# Agent Note: Ghi đè đầu vào trước khi thực thi tool — thiết kế nhất quán

Status: proposed

[English](2026-06-30-pre-tool-input-rewrite.md) | Tiếng Việt

## Vấn đề

[Agent Note về các điểm mở rộng chặn](../../implemented/feature/2026-06-30-interception-extension-points.md) định nghĩa `tools/pre-execute` là một cổng cho phép/từ chối/hỏi đối với việc thực thi, tại thời điểm đó định danh của lần thực thi đã được bảo vệ và tham số đã được đóng băng sâu. Hook `PreToolUse` của Claude Code còn cung cấp `updatedInput`, nên một cầu nối trung thực cần một cơ chế ghi đè tường minh. Việc ghi đè không thể là một lối thoát khả biến vào đối tượng thực thi hiện có: nó phải giữ được sự nhất quán giữa lịch sử được lưu trữ, bản ghi kiểm toán, tầng hiển thị và giá trị thực sự được thực thi.

## Bản chất vấn đề: ba bên đọc tham số trước khi thực thi

Trong agent loop (vòng lặp tác tử), tham số của lời gọi tool đã được ghi vào log và được bên tiêu thụ thời gian thực đọc trước khi tool thực thi:

1. **`assistant/message`** được nối thêm trước khi phân phối tool — đây là nguồn lịch sử model khi `deriveMessages()` phát lại, nên nó mang tham số lời gọi tool do chính model xuất ra.
2. **`tool/call`** là bản ghi kiểm toán được lưu trữ, được nối thêm trước `ctx.tools.execute()`.
3. **Tầng hiển thị cho con người đọc `tool/call.arguments`**: bộ render UI truyền các tham số này cho `presentResult`; `dsh-tool-bash` từ đó suy ra tiêu đề thẻ, rawInput, cwd cũng như cách xử lý terminal/nền.

Nếu chỉ ghi đè ở tầng thực thi, UI sẽ hiển thị một lệnh trong khi lệnh thực chạy lại là lệnh khác, và kết quả sẽ được render đối chiếu với tham số sai. Hiện tại registry ngăn kiểu hỏng hóc này bằng cách: structured-clone `arguments` và đóng băng sâu, đặt các thuộc tính định danh của lần thực thi thành không ghi được, và không phơi bày bất kỳ test shim hay đường lắng nghe nào có thể thay thế chúng. Thiết kế ghi đè phải duy trì ranh giới định danh được bảo vệ này, chứ không làm suy yếu nó.

## Đề xuất

Ghi đè là một «giao dịch nhất quán trước khi tạo định danh». Khi hook cung cấp `updatedInput`, giá trị hiệu lực phải được xác định trước khi registry dựng `ToolExecution` bất biến của nó, và phải phản ánh nguyên tử tới cả ba bên đọc:

- Sự kiện kiểm toán `tool/call` ghi lại tham số sau khi ghi đè (tham số gốc được giữ trong một trường đi kèm, làm dấu vết kiểm toán — hook đã sửa lời gọi, cả tham số gốc lẫn tham số có hiệu lực đều là sự thật đáng lưu lại).
- `assistant/message` trong lịch sử được suy dẫn phải khớp với lần thực thi thực tế. Các phương án cần đánh giá: ghi đè tại chỗ khối lời gọi tool trong thông điệp assistant (thay đổi điều model «thấy chính mình đã nói»), hoặc ghi một bản đính chính riêng để lần yêu cầu kế tiếp mang theo. Mô hình của Claude Code là để model thấy rằng ghi đè đã có hiệu lực.
- Tầng hiển thị (`presentCall`/`presentResult`) đọc tham số sau khi ghi đè, để UI hiển thị đúng nội dung thực sự chạy.

Mở rộng ngay tại điểm kích hoạt hiện tại của `PreToolDecision` là chưa đủ: lúc đó hai bản ghi lưu trữ đã tồn tại và định danh thực thi đã được bảo vệ. Phần hiện thực phải dời quyết định liên quan lên trước thời điểm ghi log, hoặc bổ sung một điểm quyết định ghi đè chuyên biệt và sớm hơn để xử lý lời gọi model đang chờ. Sau khi agent loop ghi tham số có hiệu lực vào lịch sử và bản kiểm toán, nó mới dựng đối tượng thực thi bất biến thông thường và chạy pipeline cho phép/từ chối/hỏi cùng pipeline tool hiện có như bình thường.

## Các phương án đã cân nhắc

### Vì sao không sửa trực tiếp đối tượng thực thi?

Cho phép listener pre-execute gán `exec.arguments` chỉ đem lại việc ghi đè ở tầng thực thi, còn lịch sử model, bản kiểm toán và tầng hiển thị sẽ không thay đổi theo. Giữ định danh được bảo vệ khiến hành vi cục bộ kiểu này trở nên không thể biểu đạt. Trước khi giao dịch nhất quán được hiện thực, cầu nối CC/Codex ghi log và phát cảnh báo về `updatedInput` thay vì tuyên bố đã đáp ứng; dấu `TODO(pre-tool-input-rewrite)` tại điểm phân phối của vòng lặp đánh dấu giai đoạn sớm hơn còn thiếu.

## Tiêu chí nghiệm thu

- Việc ghi đè được yêu cầu phải được giải quyết trước khi tạo định danh `ToolExecution`, và phản ánh nguyên tử tới cả ba bên đọc: `tool/call` kiểm toán ghi tham số sau khi ghi đè (tham số gốc giữ trong trường đi kèm), lịch sử được suy dẫn khớp với lần thực thi thực tế, và tầng hiển thị render tham số sau khi ghi đè.
- `ToolExecution.arguments` có hiệu lực vẫn được đóng băng sâu và không ghi được xuyên suốt pre-policy, guard, phân phối, post-policy và quan sát cuối cùng; không đưa vào bất kỳ shim khả biến nào.
- Cầu nối CC/Codex đáp ứng `updatedInput` và không còn ghi cảnh báo kiểu trung thực nhưng suy giảm.

## Rủi ro

- Ghi đè khối lời gọi tool trong `assistant/message` sẽ thay đổi điều model «thấy chính mình đã nói»; liệu có nhà cung cấp nào từ chối thay đổi này khi phát lại hay không là một câu hỏi mở cần xác định bằng thực nghiệm, và phải giải quyết trước khi chốt cấu trúc quyết định.
- Giai đoạn ghi đè sớm hơn làm thay đổi quan hệ thứ tự giữa `assistant/message`, `tool/call`, sự kiện kiểm toán của hook và lần thực thi; thiết kế phải cố định thứ tự này mà không làm suy yếu tính khép kín của lượt hay tính liền kề giữa lời gọi và kết quả.

## Câu hỏi mở

- Việc ghi đè khối lời gọi tool trong `assistant/message` có phá vỡ kỳ vọng khi phát lại của một số nhà cung cấp không? Hay một bản đính chính riêng thì an toàn hơn?
- Tham số gốc có nên được giữ lại trên sự kiện `tool/call` (kiểm toán) không? Nếu có thì đặt ở trường nào?
- Quyết định ghi đè nên dời lên trước thời điểm ghi log, hay trở thành một điểm mở rộng chuyên biệt và sớm hơn? Các hook cho phép/từ chối pre-tool hiện có làm sao tránh chạy hai lần?
- Điều này tương tác thế nào với luồng quyền `ask` trong tương lai (người dùng phê duyệt một lời gọi đã bị ghi đè)?
