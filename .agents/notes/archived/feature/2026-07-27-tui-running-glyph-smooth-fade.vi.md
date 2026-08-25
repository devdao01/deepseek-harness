# Agent Note: Dim-gray pulse for the running prompt glyph

Status: implemented

Archived: 2026-08-04

[English](2026-07-27-tui-running-glyph-smooth-fade.md) | 中文

## Problem

Khi lượt đang chạy, TUI sẽ thay dấu prompt `>` bằng glyph theo giai đoạn (`◍`/`✻`/`●`/`⚙`). Các phiên bản trước đó dùng màu xanh nhấn để làm hoạt ảnh độ sáng của nó (đầu tiên là sóng SGR rời rạc, sau đó là hiệu ứng thở truecolor) — một chỉ báo màu nhấp nháy liên tục. Hiệu ứng mong muốn là giữ lại nhịp đập liên tục để cho biết đang làm việc, nhưng đổi thành màu xám tối yên tĩnh thay vì màu sắc, và làm mượt việc fade in/fade out ở cả hai đầu.

## Decision

Glyph khi đang chạy là một màu xám tối, fade in khi lượt bắt đầu, tiếp tục đập nhịp trong khi chạy, fade out sau khi lượt kết thúc, rồi trở về con trỏ `>` bình thường. Nó không bao giờ dùng màu nhấn.

Độ sáng bằng envelope (đường bao) fade in/out nhân với xung nhịp chạy. Envelope kiểm soát việc xuất hiện/biến mất, thay đổi tuyến tính theo đồng hồ render trong `STATUS_FADE_MS = 300`: fade in là `(now − startedAt)/FADE` và được kẹp giới hạn, fade out là `1 − (now − endedAt)/FADE`. `pulseLevel` là một hàm cosine giữa `STATUS_PULSE_FLOOR` (0) và 1, chu kỳ `STATUS_PULSE_PERIOD_MS = 1400`, do đó mỗi nhịp thở đều tăng từ hoàn toàn vô hình lên độ sáng tối đa rồi giảm trở lại. Độ mờ truecolor truyền cho `fadeGlyph` là `envelope × pulse`.

`fadeGlyph` render theo độ mờ đó. Ở truecolor, khi thấp hơn `STATUS_FADE_MIN_OPACITY` (0.12) thì glyph bị ẩn hoàn toàn — để lại một cột trống — do đó đáy của xung nhịp biến mất, chứ không dừng lại ở mức xám gần với nền; trên ngưỡng đó, glyph nội suy màu xám 24-bit giữa `STATUS_FADE_GRAY.trough` và `.settled` (cùng màu xám tối như con trỏ khi rảnh), phát ra `\x1b[38;2;r;g;bm`, do đó cả fade in lẫn xung nhịp đều biểu hiện qua độ sáng. Khi không có truecolor thì không có mức xám theo từng khung hình, do đó dùng một cờ `visible` riêng — chỉ do envelope điều khiển, chứ không phải độ mờ đang nhấp nháy — để hiển thị glyph bằng vai trò muted của bảng màu hoặc để trống cột; xung nhịp không bao giờ làm phương án dự phòng nhấp nháy. Khi tắt màu hoàn toàn, glyph hiển thị bằng ký tự trần, giữ được cột con trỏ trên terminal đơn sắc.

Dấu prompt đang chạy được làm mới với `STATUS_ANIMATION_INTERVAL_MS = 50` (khoảng 20 fps), khiến nhịp đập di chuyển theo từng khung hình; cùng một tick đó cũng giữ cho văn bản thời lượng có độ chính xác 0.1 giây luôn cập nhật, do đó không cần bộ đếm giờ riêng.

Fade out kéo dài sau cả lượt: tại cạnh chuyển từ chạy → không chạy, `beginFadeOut` giao glyph render cuối cùng cho một `FadingStatus`, với bộ đếm giờ riêng liên tục vẽ lại cho đến khi cửa sổ chuyển tiếp kết thúc, sau đó gọi `clearStatus` và khôi phục `>`. Đường tháo dỡ (dispose, agent-disposed, khởi động thất bại) gọi trực tiếp `clearStatus`, dừng cả hai bộ đếm giờ chạy và fade out cùng lúc — không để lại chuyển tiếp còn sót lại. Glyph giao cho fade out là glyph giai đoạn thời gian thực cuối cùng (`runningStatus.lastGlyph`), chứ không phải glyph dự phòng ttft do việc suy ra giai đoạn sau khi bước kết thúc lượt trả về.

Ký tự glyph và ô của nó không bao giờ thay đổi — chỉ độ sáng xám thay đổi — nên cột con trỏ luôn cố định giữa các khung hình cũng như giữa lúc chuyển đổi con trỏ ↔ glyph.

## Alternatives considered

**Giữ lại màu nhấn.** Cần có nhịp đập, nhưng dùng màu xám yên tĩnh nhất quán với con trỏ khi rảnh, thay vì chỉ báo có màu; loại bỏ màu nhấn, giữ lại nhịp đập.

**Giữ ổn định khi chạy (không nhấp nháy).** Từng thử glyph tối màu ổn định và bị bác bỏ: nhịp đập liên tục thể hiện rõ hơn rằng agent đang tích cực làm việc. Nhịp đập quay trở lại bằng màu xám.

**Dùng giới hạn dưới khác 0 để đáy vẫn còn nhìn thấy mờ mờ.** Các giới hạn dưới lần lượt (0.45 → 0.15 → 0.02) đều khiến điểm tối nhất quá dễ thấy, không đọc được sự yên tĩnh thực sự; ngay cả 0.02 cũng dừng ở mức xám khoảng 45, chỉ cao hơn nền một bậc. Đổi sang giới hạn dưới 0 kèm ngưỡng khả kiến tường minh (`STATUS_FADE_MIN_OPACITY`), ẩn hoàn toàn glyph ở đáy mỗi nhịp thở, khiến đáy thực sự vắng mặt. Vì việc lên xuống là hàm cosine mượt, sự biến mất được đọc như một fade out mềm mại, chứ không phải kiểu bật/tắt cứng mà mức xám thấp nhưng khác 0 sẽ mang lại.

**Cho phương án dự phòng không phải truecolor cũng nhấp nháy.** SGR chỉ để lộ ba mức cường độ, làm nhịp đập mượt sẽ quá thô, còn bật/tắt glyph theo xung nhịp sẽ khiến nó nhấp nháy. Phương án dự phòng đổi thành glyph muted ổn định do envelope điều khiển; chỉ terminal truecolor mới có nhịp đập.

## Consequences

Cái giá là render tick nhanh hơn (50 ms) trong lúc chạy hoặc fade out, đổi lại glyph khi chạy đọc như một nhịp thở xám yên tĩnh xuyên suốt cả lượt, từ vô hình tăng lên mức tối rồi giảm trở lại, cùng tông với con trỏ khi rảnh; terminal chỉ gửi lại các ô đã thay đổi nên chi phí khung hình thêm vào là thấp. Fade out có nghĩa là chỉ báo còn sót lại khoảng 300 ms sau khi lượt kết thúc. Bản chụp nhanh chạy ở chế độ không truecolor, đồng hồ đóng băng, do đó chỉ cố định glyph muted ổn định do envelope điều khiển, chứ không phải nhịp đập; đáy vô hình của truecolor, đỉnh ổn định, khung hình giữa khi tăng, fade out, và việc xuất hiện/biến mất khi không truecolor đều được cố định bởi unit test trong `tui.spec.ts`.
