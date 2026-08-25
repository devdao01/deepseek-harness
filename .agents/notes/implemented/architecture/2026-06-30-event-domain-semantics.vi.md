# Agent Note: Ngữ nghĩa domain sự kiện — session là log sự thật, agent là kênh sự kiện thời gian thực

Status: implemented

[English](2026-06-30-event-domain-semantics.md) | Tiếng Việt

## Vấn đề

harness mở rộng agent loop (vòng lặp tác nhân) thông qua hệ phân loại sự kiện Cordis (xem [Agent Note về hệ phân loại sự kiện microkernel](2026-06-11-microkernel-event-taxonomy.md)). Khi hệ phân loại đó lớn dần, ranh giới giữa ba domain sự kiện trở nên mờ nhạt:

- `session/*` mang log bền vững, theo kiểu event-sourced (`SessionEventMap`).
- `agent/*` mang tín hiệu thời gian thực lúc chạy, truyền handle `Agent` cho plugin.
- `tools/*` mang registry công cụ và pipeline thực thi.

Hai vấn đề thúc đẩy việc chốt ngữ nghĩa. Thứ nhất, một số ranh giới lượt/bước đồng thời tồn tại như `SessionEvent` bền vững (`turn/start`, `turn/end`, `step/start`, `step/end`) và emit `agent/*` được phản chiếu (`agent/turn-start`, `agent/turn-end`, `agent/step-start`, `agent/step-end`). Consumer có hai nguồn sự thật cho cùng một sự kiện, mỗi thay đổi vòng đời phải cập nhật cả hai nơi. Thứ hai, hệ thống con hook cần một bề mặt đăng ký mạch lạc và có tài liệu — tác giả plugin (và các cầu nối hook Claude Code/Codex xây trên đó) phải biết nên lắng nghe sự kiện session hay sự kiện agent, và vì sao, mà không cần đọc mã vòng lặp.

Bộ từ vựng này là nền tảng cho quyết định chặn, log `hook/*` bền vững, và các cầu nối Claude Code, Codex.

## Quyết định

**Ba domain, mỗi domain một vai trò, thống nhất bằng một quy tắc ranh giới.**

- **`session/*`——log sự thật bền vững, có thể replay.** Sở hữu `SessionEventMap`; mỗi bản ghi chỉ chứa JSON (không có đối tượng sống). Mỗi lần append kích hoạt một emit `session/event`, cộng `session/flush` là checkpoint bền vững song song. Đây cũng là nguồn transcript (bản ghi văn bản) thời gian thực: consumer muốn render hoặc phản hồi sự kiện đã xảy ra đăng ký tại đây, nên render thời gian thực và projection replay dùng chung một đường.
- **`agent/*`——bề mặt thời gian thực lúc chạy.** Luôn mang `Agent` sống. Waterfall (sự kiện dạng thác nước) chặn (`agent/pre-step`, `agent/request`, `agent/request-error`) chịu trách nhiệm biến đổi, từ chối hoặc phục hồi; `agent/turn-stopping` được await để quan sát ranh giới dừng; emit tức thời báo cáo vòng đời, trạng thái, việc chèn/nhận/loại bỏ trong inbox, và lỗi. Ranh giới lượt và bước không nằm ở đây——chúng là sự kiện session bền vững, đọc từ `session/event`; luồng token (`assistant/chunk`) và steering (dẫn dắt giữa chừng) giữa lượt hiển thị dưới dạng `user/message` cũng tương tự.
- **`tools/*`——registry công cụ và pipeline thực thi.**

**Quy tắc ranh giới:** Sự thật bền vững, có thể replay là `SessionEvent`; tín hiệu chặn thời gian thực hoặc tức thời/đối tượng sống là sự kiện Cordis `agent`/`tools`. Ranh giới lượt hoặc bước là sự thật bền vững, do đó tồn tại trong log session và đọc từ `session/event`——không được phản chiếu thành emit `agent/*`.

**Áp dụng quy tắc vào việc phản chiếu ranh giới:** Toàn bộ bốn phản chiếu ranh giới——`agent/turn-start`, `agent/turn-end`, `agent/step-start`, `agent/step-end`——bị **loại bỏ**. Không có consumer sản xuất nào cần lấy `Agent` sống tại ranh giới: cầu nối ACP (Agent Client Protocol) liên kết prompt đang xử lý của nó với đúng cặp sự kiện `session/event` `turn/start`/`turn/end` tương ứng, các consumer transcript khác cũng dẫn xuất ranh giới từ luồng bền vững. Xem [Agent Note về loại bỏ sự kiện phản chiếu ranh giới agent](../simplification/2026-06-20-remove-agent-boundary-mirror-events.md), quyết định thuộc trách nhiệm của nó. Loại bỏ emit cũng đơn giản hóa `closeStep`/`closeTurn` của vòng lặp (mỗi cái chỉ cần một lần append, không cần emit ghép cặp).

## Hậu quả

- Vòng lặp không còn emit bất kỳ phản chiếu ranh giới nào; `closeStep` chỉ append `step/end`, `closeTurn` chỉ append `turn/end`. `Session.append` chịu trách nhiệm cách ly observer post-commit, nên observer ranh giới ném exception không thể thay đổi kết quả lượt hay làm đói consumer tiếp theo; thất bại chấp nhận sự kiện hoặc thất bại xác thực nội bộ vẫn ném ra ngoài trước khi ranh giới vào log.
- Test trước đây quan sát ranh giới qua emit đã bị loại bỏ, giờ quan sát sự kiện session bền vững `turn/start`/`turn/end`/`step/start`/`step/end`——hành vi chúng chốt (thứ tự ranh giới, đếm bước) không đổi; chỉ là nguồn đọc chuyển sang nguồn chuẩn. Các test cho trường hợp *listener emit phản chiếu ranh giới lượt ném exception* bị xóa, vì đường mã đó không còn tồn tại (không có emit nào để ném). Theo [AGENTS.md "Test mô tả hành vi, không phải sự thật vàng"](../../../../AGENTS.md), hành vi di chuyển (hoặc mất đi) cùng với test của nó.
- Vòng lặp chỉ đánh dấu bước đã mở (`stepOpen = true`) sau khi `append('step/start')` trả về. Xác thực phân phát nội bộ chạy trước khi đẩy vào log, có thể từ chối mà không mở bước. Thất bại của observer `session/event` post-commit được cách ly bên trong `Session.append`. Do đó cờ này biểu thị chính xác ranh giới đã commit, còn thiếu một `step/end` tiếp theo.
- Triển khai đầy đủ xem tại [Agent Note về đơn giản hóa "Ngừng phản chiếu ranh giới bền vững thành sự kiện agent"](../simplification/2026-06-20-remove-agent-boundary-mirror-events.md): toàn bộ bốn phản chiếu ranh giới bị loại bỏ, mọi consumer đọc ranh giới từ `session/event`. `agent/steering` (không phải phản chiếu ranh giới) không thuộc phạm vi Agent Note này, mà được loại bỏ riêng bởi Agent Note tiếp theo của nó [Loại bỏ emit phản chiếu `agent/steering`](../../archived/simplification/2026-07-04-remove-agent-steering-mirror.md)——nó phản chiếu `user/message` steering giữa chừng bền vững.
- Bề mặt sự kiện Cordis được sinh ra (các trang `docs/subsystems/`) không còn liệt kê sự kiện phản chiếu.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
</content>
