# Agent Note: Drop the TUI `/cancel` slash command

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-tui-remove-cancel-command.md) | Tiếng Việt

## Problem

TUI cung cấp hai cách hoàn toàn giống nhau để hủy một lượt đang chạy: phím tắt `Esc` (và `Ctrl+C`), và một lệnh slash `/cancel`. Cả hai đều gọi `agent.cancel('cancelled from terminal')` với cùng một lý do; khi rảnh, `/cancel` chỉ in ra thông báo "The agent is already idle." còn phím tắt thì im lặng. Dòng trạng thái khi đang chạy vốn đã chỉ rõ phím tắt đó (`Enter sends steering, Esc cancels`), và việc hủy bằng phím không cần gửi nội dung từ editor, nên lệnh slash này chỉ là con đường thứ hai — và khó phát hiện hơn — dẫn tới cùng một hiệu ứng: một mảnh giao diện tự nó không mang hành vi nào.

## Decision

`/cancel` đã bị gỡ bỏ. Hủy một lượt đang chạy là năng lực chỉ do phím tắt cung cấp (`Esc`, hoặc `Ctrl+C` khi đang chạy), và điều này đã được nêu trong gợi ý ở dòng trạng thái cùng danh sách phím tắt của `/help`. Mục tự động hoàn thành trong `baseCommands`, dòng lệnh trong `/help`, nhánh `case '/cancel'` trong hàm xử lý submit của editor, cùng thông báo "already idle" mà nó sở hữu đều đã bị xóa; mọi lệnh slash còn lại (`/help`, `/clear`, `/reasoning`, `/tools`, `/redraw`, `/reload`, `/resume`, `/exit`, `/skill:<name>`) giữ nguyên. Gõ `/cancel` sẽ rơi vào cảnh báo `Unknown command:` chung, giống như bất kỳ chuỗi slash không nhận diện được nào khác.

## Alternatives considered

**Giữ `/cancel` như một bí danh dễ phát hiện.** Bác bỏ: cả dòng trạng thái khi đang chạy lẫn `/help` đều đã chỉ rõ `Esc`, nên một bí danh dạng gõ tay sẽ thêm một đường mã cần bảo trì và một thông báo theo trạng thái rảnh cho thao tác mà một phím đơn đã làm được trực tiếp hơn. Không có bên tiêu thụ nào cần kích hoạt hủy thông qua việc submit từ editor.

## Testing

`packages/ui/tui/tests/tui.spec.ts` khẳng định `agent.cancelled` chứa `'cancelled from terminal'`, được điều khiển bởi phím `Esc`/`Ctrl+C` trong lượt đó — đây là năng lực hủy duy nhất. Các snapshot `errors-and-help` và `disposed-terminal` cố định các dòng `/help` không chứa `/cancel`; độ phủ theo từng file của `packages/ui/tui/src` giữ ở mức 100%.

## Consequences

Không còn có thể hủy một lượt thông qua việc submit từ editor; hủy chỉ do phím tắt cung cấp. Đây là việc gỡ bỏ ròng một đường dư thừa cùng thông báo trạng thái rảnh của nó, nhất quán với hình thái nguyên thủy đơn nhất mà các năng lực dừng còn lại đã tuân theo ([public stop surface](2026-06-20-public-agent-stop-surface.md)). Muốn khôi phục việc hủy bằng cách gõ lệnh thì phải đưa trở lại cả mục tự động hoàn thành, nhánh trong hàm xử lý submit và bài kiểm thử riêng của nó.
