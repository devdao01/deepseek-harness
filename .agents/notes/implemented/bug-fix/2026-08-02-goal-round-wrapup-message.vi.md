# Agent Note: Message kết lại của Goal Round

Status: implemented

[English](2026-08-02-goal-round-wrapup-message.md) | Tiếng Việt

## Vấn đề

Khi Goal Round tự chủ báo `update_goal` là `complete` hoặc `blocked`, lượt vật lý kết thúc ngay tại kết quả của tool, và sau lời gọi đó model không còn cơ hội nói gì nữa. Phiên kết thúc trên một tấm thẻ `update_goal` trơ trụi, và cảm nhận của anh em test nội bộ là agent đang nói dở câu thì im bặt: đoạn text trước khi model gọi tool thường báo trước sẽ có một bản tường trình ("Mục tiêu đã đạt, đánh dấu hoàn thành:") mà rồi chẳng bao giờ có phần tiếp, bởi kỳ vọng chuẩn của tool-use là sau kết quả tool còn một message assistant nữa, trong khi cả prompt của Goal Round lẫn mô tả tool đều không nói rằng lời gọi này là điểm dừng. Việc dừng cứng đến từ [quyết định về goal tool](../feature/2026-07-19-model-facing-goal-tools.md), và note này thay thế điều khoản dừng lượt trong đó.

## Quyết định

Khi Goal Round `complete` hoặc `blocked` thành công thì không còn gọi `concludeTurn()` nữa. Thay vào đó tool đính kèm vào chính kết quả của mình một phần ngữ cảnh kết lại: một message user với source là `{ kind: 'plugin', plugin: 'tool-goal' }`, mang chỉ dẫn `<goal_complete>`/`<goal_blocked>`, yêu cầu model viết cho người dùng một message kết lại có căn cứ và không gọi tool nữa. Sau đó lượt kết thúc theo đường dừng thông thường của agent loop khi không có lời gọi tool nào, nên không phát sinh nguyên thủy mới nào của loop, và ngữ nghĩa steering không bị ảnh hưởng. Thay đổi trực tiếp từ con người vẫn giữ nguyên như cũ, không chèn chỉ dẫn. Cái giá phải trả là thêm một request model cho mỗi vòng đời goal, chứ không phải mỗi lượt.

Cách diễn đạt của chỉ dẫn được chọn bằng cách lấy mẫu A/B trên `deepseek-v4-pro` với các transcript Goal Round đã tái dựng: chỉ dẫn có cấu trúc (kết quả, kiểm chứng, sản phẩm, bước tiếp theo) luôn nhỉnh hơn về mức độ đầy đủ so với kiểu tối giản "tóm tắt lại đi"; bổ sung điều khoản grounding "lấy bằng chứng trong phiên làm chuẩn" khiến các chi tiết không có căn cứ lùi từ khẳng định sự thật xuống thành gợi ý có dè dặt; còn nhóm đối chứng không có chỉ dẫn thì phần kết lại có phương sai rất lớn, bao gồm cả việc bịa ra chi tiết ở mức file một cách chắc như đinh đóng cột.

Để bằng chứng keyless có thể viết thành script, hạ tầng snapshot được bổ sung một khả năng: `dsh-llm-replay` sẽ phân giải placeholder `{{fromRequest:<regex>}}` trong các mục script dựa trên request thời gian thực, bởi vì một file đi kèm tĩnh không thể nào biết trước goal id sinh ngẫu nhiên mà model phải điền lại vào `update_goal`.

## Kiểm chứng

Test của package `tool-goal` ghim phần ngữ cảnh được chèn bởi hai action ở trạng thái cuối (source, nhãn, objective, điều khoản cấm gọi tool tiếp) cùng việc không tồn tại `concludesTurn`, và cả đường không-chèn khi con người trực tiếp pause và complete, với độ phủ file 100%. Unit test của `llm-replay` ghim quy ước placeholder: lần khớp cuối cùng thắng khi lấy capture, quay về dùng toàn bộ phần khớp khi không có nhóm capture, và báo lỗi rõ ràng với các pattern không khớp, không hợp lệ hoặc không đóng. Snapshot ACP keyless mới `goal-wrapup` điều khiển ứng dụng thành phẩm đi hết create → lượt đầu tiên → complete tự chủ, và khẳng định đồng thời trong log phiên bền vững lẫn luồng stdout của ACP rằng có phần chèn kết lại nguồn plugin, có message assistant kết lại trong cùng lượt, và lượt kết thúc với `completed`.

## Các phương án từng cân nhắc

- **Hiển thị text hoàn thành ngay trên thẻ UI của `update_goal`** — từ chối: hiện tại `complete` không mang theo bất kỳ text tự do nào; thêm tham số `summary` sẽ đẩy bản tường trình hướng tới người dùng đi qua kênh tham số của tool, mà vẫn cắt mất lời nói tự nhiên của model sau phần kết quả.
- **Giữ `concludeTurn()` và thêm một nguyên thủy loop kiểu "thêm một bước thuần text"** — từ chối: thêm cơ chế `agent-loop` mới cho một hành vi mà đường dừng thông thường vốn đã làm được (chỉ cần không có kết quả nào kết thúc lượt).
- **Viết chỉ dẫn vào trong nội dung kết quả của tool** — từ chối: output chuẩn của goal tool là JSON gọn được tiêu thụ bằng chương trình; trộn chỉ dẫn dạng văn xuôi vào đó sẽ làm rối tung quy ước phía model với giá trị có thể phát lại của tool.

## Consequences

Mỗi goal tự chủ đều kết thúc bằng một message kết lại hướng tới người dùng, thay vì một tấm thẻ tool trơ trụi, đổi lại là một request model cho mỗi vòng đời goal. `concludeTurn()` giữ nguyên ngữ nghĩa loop của nó, nhưng mất đi bên gọi duy nhất ngoài phần output có cấu trúc của subagent. Các kịch bản snapshot giờ có thể dùng `{{fromRequest:...}}` để script hóa những giá trị chỉ tồn tại lúc chạy, mở khóa độ phủ keyless cho bất kỳ luồng tool kiểu "phản hồi lại id" nào, không chỉ riêng goal.
