# Agent Note: Tự động tiêu đề mặc định bật, suy luận lại khi khôi phục

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-tui-auto-title-default-on.md) | 中文

> **Đã bị thay thế**: xem [Agent Note về chuẩn hóa tiêu đề](../simplification/2026-07-22-tui-titles-from-session-title-service.md). Việc sinh `autoTitle` cục bộ trong TUI đã được loại bỏ; tiêu đề giờ lấy từ service session-title được ghi trong log, và việc đổi tên terminal tiêu thụ sự kiện `session/title`.

## Problem

Khi [Agent Note về tự động tiêu đề](2026-07-21-tui-auto-pane-title.md) được giao, `autoTitle` mặc định tắt, và ở các session được khôi phục, do tin nhắn `user/message` đầu tiên đã có trong log nên tiêu đề tĩnh được giữ lại. Trong thực tế sử dụng, cả hai lựa chọn này đều đi ngược lại mục đích ban đầu của tính năng. Điều làm cho một pane tmux hoặc một tab terminal khác biệt với pane/tab kế tiếp chính là tiêu đề pane mô tả, khác nhau theo từng session; mặc định tắt nghĩa là sản phẩm giao một tính năng thụ động mà hầu như không ai bật, còn việc không suy luận lại khi khôi phục nghĩa là các session được khôi phục — vốn chính là những session sống lâu, đáng được đánh dấu nhất — lại quay về dùng chuỗi tĩnh dùng chung. Người dùng yêu cầu biến tên mô tả cho mỗi session thành trải nghiệm mặc định, thường trực.

## Decision

- `autoTitle` mặc định **bật** (`z.boolean().default(true)`, `resolveTuiConfig` khớp với nó bằng `?? true`). Các deployment có service `llm` cùng provider/model của agent sẽ có được tiêu đề pane do model tạo ra cho mỗi session mà không cần bật thủ công; các deployment không có những thứ đó vẫn giữ tiêu đề tĩnh, do đó ở nơi lệnh gọi không thể chạy, việc mặc định bật vẫn là thụ động.
- Session được **khôi phục** sẽ suy luận lại tiêu đề từ tin nhắn `user/message` đầu tiên đã có trong log ngay khi mount: `createTuiChat` quét trong `agent.session.events` để tìm sự kiện đầu tiên loại này, và đưa văn bản của nó vào cùng một `generateTitle` chỉ chạy một lần. Tiêu đề không bao giờ được lưu bền vững (session header không mang trường tiêu đề), do đó nó luôn được suy luận ra, chứ không phải được khôi phục.
- Chốt một lần giờ chỉ đơn giản là `titleSettled = !resolved.autoTitle`. Mệnh đề trước đây "khôi phục nghĩa là đã chốt sẵn" đã bị xóa: khi khôi phục, `generateTitle` chạy một lần từ tin nhắn đầu tiên đã lưu rồi sau đó chốt lại, do đó các tin nhắn đến *sau* khi khôi phục sẽ không làm thay đổi tiêu đề nữa. Session hoàn toàn mới không có `user/message` nào đã lưu khi mount, do đó việc quét khôi phục là no-op, và listener `session/event` theo thời gian thực sẽ đặt tên cho tin nhắn đầu tiên.
- Mọi thứ còn lại trong [Agent Note về tự động tiêu đề](2026-07-21-tui-auto-pane-title.md) giữ nguyên không đổi: đường dẫn OSC 0 `runtime.terminal.setTitle`, hình thức tóm tắt bằng model (hai đến năm từ viết thường, dòng đầu tiên không rỗng, giới hạn 40 ký tự), lệnh gọi `ctx.llm.stream` phát-rồi-không-đợi-kết-quả không bao giờ chạm vào session hay transcript (bản ghi văn bản), `AbortController` khi đóng, và từng phương án dự phòng khi thất bại (phản hồi rỗng, thiếu `llm`, thiếu provider/model, prompt chỉ chứa khoảng trắng).

## Alternatives considered

**Giữ tính năng này mặc định tắt.** Bị từ chối: đây là yêu cầu trực tiếp của người dùng, đảo ngược hoàn toàn quyết định "mặc định tắt" trong [Agent Note về tự động tiêu đề](2026-07-21-tui-auto-pane-title.md). Mặc định tắt tạo ra một tính năng thụ động; nó chỉ hữu ích khi tên mô tả trở thành trải nghiệm thường trực. Mối lo ngại về replay không cần key vốn dẫn đến quyết định mặc định tắt ban đầu, giờ được xử lý bằng cách ghim `autoTitle: false` trong các kịch bản snapshot dựa trên replay, thay vì đè tính năng này ở mọi deployment.

**Lưu bền vững tiêu đề đã suy luận vào session header.** Bị từ chối: session header không có trường tiêu đề, thêm một trường sẽ biến tab terminal thành metadata của session — chính là ranh giới mà [Agent Note về tự động tiêu đề](2026-07-21-tui-auto-pane-title.md) đã vạch ra với công việc tiêu đề session dựa trên log. Suy luận lại từ tin nhắn đầu tiên đã lưu tốn một lệnh gọi không dùng tool khi khôi phục, đổi lại giữ cho nhãn luôn là một hàm thuần túy của cuộc hội thoại.

**Suy luận lại khi khôi phục từ tin nhắn mới nhất thay vì tin nhắn đầu tiên.** Bị từ chối: tiêu đề tóm tắt *nội dung* của session, và điều đó được nắm bắt bởi request mở đầu của nó; một tin nhắn giữa chừng cuộc hội thoại sẽ khiến nhãn pane trôi dạt theo tiến trình công việc.

## Consequences

- Các session hoàn toàn mới có `llm` khả dụng giờ đây mặc định tốn thêm một lệnh gọi model không dùng tool (trước đây chỉ có khi bật thủ công); session được khôi phục tốn một lệnh gọi khi mount. Các deployment không có `llm` hoặc provider/model không bị ảnh hưởng.
- `examples/tui-agent/tests/tui.snapshot.ts` dựa trên replay bắt buộc phải **tắt**: nó ghim `autoTitle: false`, vì request tiêu đề mặc định bật không nằm trong danh sách các lượt đã ghi, và `installLlmReplay` sẽ báo lỗi tường minh với các request chưa được ghi. Unit test `packages/ui/tui/tests/tui.snapshot.ts` không cần tắt — nó không mount service `llm`, do đó `generateTitle` bị chặn sớm, và việc đảo giá trị mặc định ở đó là thụ động. `examples/tui-agent/cordis.yml` tương tác và fixture PTY viết kịch bản sẵn đã đặt `autoTitle: true`, do đó assertion OSC 0 của bài smoke test không cần key vẫn giữ nguyên không đổi.
- `packages/ui/tui/tests/tui.spec.ts` ghim giá trị mặc định mới: test giá trị mặc định của config kỳ vọng `autoTitle: true`; test đường dẫn tắt giờ đặt tường minh `autoTitle: false`; test "session khôi phục không bao giờ kích hoạt" trước đây được viết lại để khẳng định việc suy luận lại từ tin nhắn đầu tiên đã lưu, và khẳng định các tin nhắn thời gian thực đến sau đó không làm thay đổi tiêu đề nữa. `docs/config-catalog.md` được sinh lại thành "On by default".
