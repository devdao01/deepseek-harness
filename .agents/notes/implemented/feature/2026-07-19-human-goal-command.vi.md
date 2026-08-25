# Agent Note: Lệnh `/goal` hướng tới người dùng

Status: implemented

[English](2026-07-19-human-goal-command.md) | 中文

## Vấn đề

Miền mục tiêu cùng phiên (same-session goal domain) và tool model cung cấp máy trạng thái cùng đường ngữ nghĩa ngôn ngữ tự nhiên, nhưng vẫn chưa đủ để thành một UX hướng tới người dùng. Người dùng cần kiểm tra giai đoạn hiện tại chính xác và ngân sách Round mà không cần hỏi model, cần tạm dừng hoặc xóa công việc rõ ràng mà không tiêu tốn lượt (turn) của model, và cần kích hoạt lại một mục tiêu đang hoạt động đã khôi phục sau khi phiên khôi phục, qua quyết định cần thiết của người dùng. Nếu triển khai các thao tác này riêng lẻ trong từng UI, sẽ lặp lại logic phân tích, khiến các giao diện lệch nhau, và có thể giao lệnh không xác định hoặc không khả dụng cho model xử lý.

Lệnh này cũng phải tuân thủ hai loại trạng thái trong thiết kế mục tiêu. Giai đoạn bền vững, mô tả mục tiêu, số revision và Round đến từ log phiên; trạng thái kích hoạt cục bộ theo tiến trình quyết định mục tiêu đang hoạt động có thể tự tiếp tục hay không. Nếu chỉ hiển thị "đang hoạt động" sau khi khôi phục, sẽ che giấu sự thật rằng mục tiêu đã có chủ đích bị đặt về chưa kích hoạt, đang chờ ủy quyền của người dùng.

## Quyết định

`@deepseek-ai/dsh-command-goal` tại `packages/goal/command-goal/` là bên sản xuất lệnh (command producer) được xây dựng trên `ctx.commands` và `ctx.goals`. Nó đăng ký một định nghĩa `goal` toàn cục, do đó mỗi adapter lệnh trong tổ hợp đều phát hiện cùng một lệnh; ứng dụng không tương thích nên bỏ qua bên sản xuất này, thay vì che đăng ký của nó tại adapter. Handler nhận đúng agent (tác tử) mục tiêu từ command dispatch, đọc hoặc thay đổi mục tiêu của agent đó qua domain service, và trả về output UI dạng văn bản thuần trực tiếp. Nó không import bất kỳ adapter hay agent loop (vòng lặp tác tử) cụ thể nào.

Lệnh này tuân theo hình thái gọn nhẹ được trình bày trong [triển khai phân phối TUI tại commit `678157a` của repo công khai OpenAI Codex](https://github.com/openai/codex/blob/678157acaa819d5510adfe359abb5d0392cfe461/codex-rs/tui/src/chatwidget/slash_dispatch.rs#L750-L805): truy vấn trạng thái không tham số, mô tả mục tiêu dạng tự do, và các control `clear`, `edit`, `pause` hoặc `resume`. Liên kết cố định đến commit giúp cú pháp đã khảo sát vẫn có thể kiểm chứng khi Codex tiếp tục phát triển. Repo này giữ nguyên trạng thái event-sourced riêng, chính sách đếm Round và quy tắc kích hoạt sau khôi phục của riêng mình, không sao chép hành vi SQLite, ngân sách token hay tự khôi phục của Codex.

### Cú pháp và các động từ vòng đời

`/goal` báo cáo mô tả mục tiêu, giai đoạn bền vững hướng tới người dùng, `roundsStarted/maxGoalRounds`, trạng thái kích hoạt cục bộ theo tiến trình `armed` hoặc `disarmed`, và các lệnh có ý nghĩa ở trạng thái hiện tại. Khi không có mục tiêu hiện tại, nó báo cáo sự thật đó cùng cách dùng đầy đủ. Đọc trạng thái không thêm event phiên.

`/goal <objective>` tạo một mục tiêu đang hoạt động và đã kích hoạt. Mục tiêu đã hoàn thành có thể được thay thế, khi đó một định danh mục tiêu mới được tạo qua quy tắc domain hiện có. Bất kỳ mục tiêu chưa hoàn thành nào cũng khiến lệnh fail trực tiếp, và nhắc người dùng dùng chỉnh sửa trực tiếp hoặc xóa rõ ràng. Command service tổng quát có chủ đích không cung cấp API xác nhận dạng modal; nếu âm thầm thực hiện xóa rồi tạo hai bản ghi bền vững, điều đó tương đương với việc tạo ra sự đồng ý phá hủy từ hư không, và để lộ một khoảng cửa sổ thất bại không nguyên tử (non-atomic).

`/goal edit <objective>` chỉnh sửa mục tiêu chưa hoàn thành hiện tại, nhưng không thay đổi giai đoạn hay trạng thái kích hoạt của nó. Nếu mục tiêu đã hoàn thành, nó tạo một mục tiêu đang hoạt động mới, vì domain không cho phép khôi phục trạng thái đã hoàn thành, và mô tả mục tiêu mới nên có định danh mục tiêu mới. Dùng riêng `edit` sẽ trả về lỗi thay vì khởi động một trình soạn thảo, vì quy ước lệnh phi cấu trúc có thể di chuyển được không có trình soạn thảo dạng modal.

`/goal pause`, `/goal resume` và `/goal clear` dùng view hiện tại để gọi động từ domain compare-and-swap tương ứng. Resume áp dụng cho cả giai đoạn bền vững đã dừng, lẫn mục tiêu đang hoạt động nhưng chưa kích hoạt sau khi khôi phục phiên, fork, hoặc thay thế driver. Quy tắc domain vẫn từ chối giới hạn Round đã cạn, việc resume lặp lại trên mục tiêu đã hoạt động và đã kích hoạt, chuyển giai đoạn bất hợp lệ, và định danh lỗi thời. Clear sẽ xóa con trỏ hiện tại, trong khi log phiên giữ lại bia mộ (tombstone) mang số revision và snapshot trước đó.

Từ control được khớp không phân biệt hoa thường ASCII sau khi loại bỏ khoảng trắng hai đầu. Chỉ khi chiếm trọn phần hậu tố mới được coi là control; mọi văn bản không rỗng khác đều là mô tả mục tiêu. Điều này giữ quy tắc lệnh dạng tự do có thể dự đoán được: `/goal pause after verification` là một mô tả mục tiêu, chứ không phải lệnh pause bị phân tích một phần.

### Ranh giới output và thất bại

Output trạng thái bỏ qua id gắn brand và số revision compare-and-swap, vì chúng thuộc chi tiết phối hợp model/plugin, không phải mục điều khiển của người dùng. Output chứa trạng thái kích hoạt, vì sự thật đó thay đổi việc công việc có tiếp tục hay không; mục tiêu bị chặn còn chứa mã chính sách bền vững và giải thích hướng tới người dùng của nó. Gợi ý lệnh được suy ra từ trạng thái chính xác: mục tiêu đang hoạt động và đã kích hoạt cung cấp pause, mục tiêu đang hoạt động nhưng chưa kích hoạt hoặc đã tạm dừng/bị chặn cung cấp resume, mục tiêu đã hoàn thành cung cấp thay thế hoặc xóa.

Thất bại `GoalError` dự kiến trở thành một `CommandResult.error` ổn định, không chứa id gắn brand, để chẩn đoán domain không rò rỉ chi tiết nội bộ compare-and-swap ra giao diện hướng tới người dùng, và thao tác bất hợp lệ không bao giờ lọt vào lịch sử model. Trạng thái hiện tại chịu trách nhiệm cung cấp đường khôi phục có thể thực thi, cụ thể theo trạng thái. Các ngoại lệ khác vẫn là lỗi lệnh mà adapter nhìn thấy được; nếu coi lỗi chương trình là lỗi domain thông thường sẽ che giấu vấn đề. Command handler chỉ thực hiện thay đổi domain đồng bộ, do đó việc hủy request sẽ được registry lệnh quyết định trước khi thay đổi bắt đầu, không tồn tại tác dụng phụ bất đồng bộ thoát ra ngoài cần rollback.

Input slash tổng quát, văn bản trạng thái và lỗi không được lưu bền vững. Thay đổi mục tiêu thành công sẽ nối thêm event `goal/change` do domain sở hữu, và không đưa ngữ cảnh model vào hàng đợi. Lệnh này không đưa vào một bản ghi audit thứ hai có thể không nhất quán với event domain.

### Tổ hợp ứng dụng

`agent-spine-demo` chấp nhận đối tượng tổ hợp `goals` tùy chọn, chứa cấu hình chủ sở hữu cho cả miền mục tiêu và tool model. Khi bỏ qua hoặc đặt `false`, stack đó không được gắn. Với bên gọi một lần không giao diện (headless), việc chọn tham gia rõ ràng rất quan trọng: API kết quả của chúng kết thúc sau một lượt vật lý liên kết với lời gọi, không thể âm thầm biến thành thao tác mục tiêu logic chạy lâu dài.

Package ứng dụng TUI đưa ra lựa chọn sản phẩm ngược lại. Nó mặc định để `goals` dùng giá trị mặc định của chủ sở hữu, và gắn miền mục tiêu, tool model, driver cùng phiên, command registry và bên sản xuất này; `goals: false` sẽ gỡ toàn bộ stack một cách nhất quán. [Ứng dụng tự động hóa ACP (Agent Client Protocol)](../simplification/2026-07-23-acp-automation-only-protocol.md) cũng mặc định gắn miền mục tiêu và tool model, nhưng có chủ đích bỏ qua command service. Closure runtime Python SDK giao bên sản xuất này, lệnh và stack mục tiêu, để `cordis.yml` bên ngoài có thể tổ hợp cùng lệnh.

## Kiểm thử

Bộ test của bên sản xuất dùng command registry thật, goal service thật, agent registry thật và log phiên thật. Nó bao phủ export an toàn của Loader, phát hiện registry, dispose (giải phóng tài nguyên), trạng thái rỗng, phân tích mô tả mục tiêu, từ chối thay thế mục tiêu chưa hoàn thành, chỉnh sửa trực tiếp, thay thế mục tiêu đã hoàn thành, mọi lệnh control ở trạng thái không có mục tiêu, pause/resume/clear, mỗi giai đoạn bền vững, hiển thị mã/giải thích bị chặn, hiển thị đã kích hoạt/chưa kích hoạt, lỗi domain đã được làm sạch, thất bại bất ngờ và ghi lại thay đổi bền vững. Test tổ hợp ứng dụng bao phủ việc chọn tham gia rõ ràng ở thân chính, giá trị mặc định TUI, việc tắt nhất quán, cấu hình domain/tool được chuyển tiếp, phát hiện lệnh, closure runtime đóng gói và việc lắp ráp tool model đã mở rộng. Snapshot backend ACP tiếp tục cố định schema tool mục tiêu, không liên quan đến lệnh hướng tới người dùng này.

## Các phương án thay thế đã cân nhắc

- **Để model xử lý `/goal` như văn bản thông thường** — không áp dụng, vì các thao tác trạng thái và vòng đời trực tiếp sẽ tiêu tốn lượt model, có thể bị diễn giải lại, và không thể cung cấp khả năng phát hiện lệnh có tính xác định.
- **Triển khai handler riêng trong từng UI** — không áp dụng, vì cú pháp, hành vi lỗi và định dạng trạng thái mục tiêu sẽ lệch nhau, và việc triển khai tùy chọn cũng không thể thêm/bớt năng lực này như một effect thống nhất.
- **Thêm xác nhận chỉnh sửa và thay thế dạng modal cho `ctx.commands`** — không áp dụng, vì quy ước liên giao diện hiện có là input phi cấu trúc cộng output trực tiếp; thiết kế cần cho một giao thức tương tác tổng quát vượt xa phạm vi một bên sản xuất này.
- **Âm thầm thay thế mục tiêu chưa hoàn thành** — không áp dụng, vì điều này sẽ tổ hợp xóa và tạo mà không có tính nguyên tử hay ý định phá hủy rõ ràng.
- **Expose id và số revision mục tiêu trong trạng thái hướng tới người dùng** — không áp dụng, vì thao tác của người dùng luôn diễn ra trong một handler đồng bộ nhắm vào đúng view hiện tại; các trường này chỉ làm nhiễu triển khai, không tránh được race condition ở nơi khác.
- **Bật mục tiêu vô điều kiện trong thân không có UI** — không áp dụng, vì quy ước kết thúc của SDK/CLI một lần là API lượt vật lý, không phải API thao tác mục tiêu.

## Hệ quả

- TUI expose lệnh `/goal` hình thái Codex do một plugin có thể gỡ bỏ cung cấp.
- Trạng thái hướng tới người dùng phân biệt giai đoạn bền vững và trạng thái kích hoạt thời gian thực, và báo cáo chính xác giới hạn Round mục tiêu.
- Pause, resume, clear, tạo và chỉnh sửa trực tiếp không tiêu tốn lượt model, trong khi thay đổi đã chấp nhận vẫn có thể dựng lại từ log phiên.
- Phiên sau khi khôi phục chờ quyết định của người dùng; `/goal resume` là đường lệnh nghĩa đen (literal), còn prompt thông thường bằng bất kỳ ngôn ngữ nào có thể ủy quyền cho đường tool model.
- Tổ hợp headless giữ hành vi một lượt, trừ khi chọn tham gia mục tiêu rõ ràng và tự định nghĩa quy ước kết thúc chạy dài của riêng mình.

## Giới hạn đã biết và các việc tạm hoãn

- Quy ước lệnh có thể di chuyển được không có trình soạn thảo dạng modal hay tương tác xác nhận; chỉnh sửa trực tiếp và xóa rõ ràng là lựa chọn có chủ đích cho đến khi có nguyên hàm tương tác liên giao diện tổng quát.
- `/goal` không nhận giới hạn Round theo từng lệnh. Cấu hình triển khai có giá trị mặc định; sau khi nhận chỉ dẫn trực tiếp của người dùng, tool model đã được ủy quyền có thể chỉnh sửa giới hạn.
- TUI render văn bản thuần có thể di chuyển được, không phải một component trạng thái mục tiêu cập nhật liên tục. Output lệnh có thể kết nối lại và chỉ báo trạng thái riêng cho adapter bị hoãn lại.
- Server tự động hóa ACP, CLI headless và điểm vào chạy JSON-RPC không tiêu thụ command registry.
- Lệnh này quan sát và thay đổi trạng thái, nhưng không xác thực việc hoàn thành hay bị chặn. Việc xác thực dựa trên bộ đánh giá được hoãn lại cho một tầng chính sách độc lập có quy ước quyền hạn và cách ly rõ ràng.
