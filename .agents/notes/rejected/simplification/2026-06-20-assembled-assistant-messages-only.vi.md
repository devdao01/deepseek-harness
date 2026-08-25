# Agent Note: Chỉ lưu bền vững các message assistant đã lắp ráp, không lưu phân mảnh (chunk) dạng streaming

Status: rejected — replay phân mảnh với độ trung thực cao, output một phần của luồng bị lỗi, và replay snapshot hiện đang phụ thuộc vào các sự kiện `assistant/chunk` đã được lưu bền vững. Chỉ khi có phương án replay hoặc artifact thay thế mà không mất thông tin thì mới có thể xóa phân mảnh.

[English](2026-06-20-assembled-assistant-messages-only.md) | Tiếng Việt

## Vấn đề

Log phiên chuẩn hiện tại lưu bền vững mọi `assistant/chunk` trong output streaming của model. [Agent Note về session persistence](../../implemented/architecture/2026-06-14-session-persistence.md) chọn phương án này để có độ trung thực replay ở cấp token và `seq` liên tục, nhưng cái giá phải trả ngày càng tăng: fixture JSONL (dữ liệu tiền đề cho test) bị chiếm phần lớn bởi vô số bản ghi tăng dần (increment) nhỏ lẻ, các kịch bản snapshot phải nhóm sự kiện phân mảnh lại để replay model, ACP (Agent Client Protocol) khi load phải dựng lại output assistant trước đó từ các phân mảnh, và bất kỳ bên đọc log nào trong tương lai đều phải phân biệt giữa lịch sử message bền vững và dấu vết (trace) cấp token.

Đối với các bước tổ hợp thành công nội dung hoàn chỉnh, agent loop đã append sẵn một `assistant/message`. Đây chính là sự kiện mà `deriveMessages()` dùng để dựng request tiếp theo gửi tới model. Nói cách khác, trạng thái phiên có thể khôi phục bình thường vốn đã có sẵn mà không cần phân mảnh; phân mảnh là sản phẩm phụ của việc render thời gian thực và test tất định (deterministic), không phải lịch sử phiên bắt buộc phải có. Luồng bị lỗi hoặc bị hủy thì khác: output assistant một phần có thể chỉ tồn tại dưới dạng phân mảnh, và một bước rỗng do đạt max-token có thể hoàn toàn không sinh ra `assistant/message`.

## Đề xuất

Ngừng lưu `assistant/chunk` trong log phiên chuẩn. Log bền vững giữ lại `assistant/message`, `tool/call`, `tool/result`, `usage` (nếu vẫn giữ), và ranh giới lượt (turn boundary). UI thời gian thực vẫn có thể nhận gia số token qua một sự kiện streaming được thiết kế rõ ràng là tạm thời (transient). Replay snapshot nên chuyển kịch bản model của nó sang file fixture đi kèm tường minh, hoặc suy ra từ artifact adapter đã ghi lại, thay vì coi phiên người dùng chuẩn như một cuộn băng token. Các kịch bản cần output một phần của luồng lỗi phải ghi lại output đó trong fixture replay.

`session/load` của ACP có thể replay message assistant trước đó dưới dạng khối nội dung hoàn chỉnh, thay vì mô phỏng lại luồng token gốc. Transcript (bản ghi văn bản) sau khi load không cần tái hiện từng delta lịch sử; nó phải thể hiện đúng nội dung assistant đã hoàn tất tương tự, và tiếp tục chạy dựa trên lịch sử hợp lệ phía nhà cung cấp.

## Tiêu chí nghiệm thu

- `SessionEventMap` loại bỏ `assistant/chunk`, hoặc đánh dấu nó là không-bền-vững nếu vẫn cần sự kiện thời gian thực mang tính chuyển tiếp.
- [Tài liệu session persistence](../../../../packages/session/session-persistence/README.md) không còn yêu cầu lưu nguyên văn từng phân mảnh streaming.
- `llm-replay` và snapshot ACP dùng định dạng fixture replay tường minh hoặc file đi kèm để lưu phân mảnh model.
- `session/load` render message assistant đã hoàn tất từ `assistant/message`.
- Log lưu trữ giảm đáng kể về kích thước, và sau khi xóa phân mảnh vẫn giữ `seq` liên tục, không để lại khoảng trống số thứ tự.
- Phiên bản định dạng phiên được refresh cùng với fixture đã ghi lại; theo chính sách định dạng tiền phát hành, log lưu trữ không đúng phiên bản hiện hành sẽ bị từ chối.

## Những gì bị từ bỏ

Phiên người dùng chuẩn sẽ không còn tái dựng được luồng token chính xác của các lượt cũ. Nó cũng sẽ mất output assistant một phần của các luồng bị lỗi hoặc bị hủy, trừ khi có sự kiện hoặc fixture khác ghi lại. Đối với các quy ước khôi phục, load và snapshot hiện tại, đây là mức mất thông tin quá lớn. Các test cần luồng tất định chính xác nên trực tiếp sở hữu fixture riêng, với điều kiện log phiên production vẫn giữ đủ độ trung thực cho việc khôi phục hiển thị với người dùng.

## Liên quan

Agent Note này thay thế quyết định về lưu bền vững phân mảnh trong [Session persistence](../../implemented/architecture/2026-06-14-session-persistence.md), và ảnh hưởng tới [ACP snapshot tests](../../implemented/testing/2026-06-19-acp-snapshot-tests.md) — plugin replay hiện tại của nó suy ra kịch bản từ các sự kiện `assistant/chunk`.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
