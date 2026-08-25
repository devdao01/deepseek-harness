# Agent Note: Dòng trạng thái TUI đánh dấu tin nhắn steering đang xếp hàng

Status: implemented

Archived: 2026-07-26

[English](2026-07-21-tui-steering-queue-badge.md) | 中文

## Problem

Trong lúc lượt chạy đang diễn ra, việc gửi trong editor sẽ gọi `agent.steer()`, thêm vào hàng đợi steering (dẫn dắt giữa chừng) phía sau lượt đang chạy ([Agent Note cửa trước](2026-07-17-dedicated-full-screen-tui-front-door.md)). Dòng trạng thái của runtime trước đây chỉ kết thúc bằng gợi ý `Enter sends steering, Esc cancels`, do đó khi nhấn Enter không có bất kỳ phản hồi nào cho biết tin nhắn đã được xếp hàng, cũng không thấy có bao nhiêu tin đang chờ gửi tới mô hình. Người dùng steering liên tiếp nhiều lần không thể phân biệt được giữa hàng đợi và các phím bị nuốt mất.

## Decision

Hộp thư đến (inbox) của agent (trí tuệ nhân tạo) mới là hàng đợi steering đáng tin cậy, nhưng TUI không thể quan sát nó, do đó huy hiệu là số đếm thời gian thực được dựng lại từ các sự kiện công khai `agent/queued` và `steering/message`, chứ không phải là một phép chiếu của chính hàng đợi đó.

- Dòng trạng thái của runtime được lắp ráp qua `formatTurnStatus`: khi `queued > 0` sẽ chèn huy hiệu `${queued} queued · ` trước gợi ý `Enter sends steering, Esc cancels`, bằng không thì chỉ là văn bản gợi ý thuần túy; nhãn giai đoạn và thời lượng đứng trước nó thuộc về [dòng trạng thái chi tiết](2026-07-21-tui-verbose-status-line.md).
- `createTuiChat` giữ một bộ đếm `pendingSteering`: mỗi lần nhận một `agent/queued` nhắm vào agent này và `info.steering` là true thì `+1`, mỗi khi agent loop (vòng lặp trí tuệ nhân tạo) giải phóng một tin nhắn thì `-1` cùng với sự kiện phiên `steering/message` tương ứng (giới hạn dưới là zero), và bộ đếm được đặt lại về zero ngay khi agent rời khỏi trạng thái `running`.
- Số đếm được làm mới vào `Loader` thời gian thực thông qua `setMessage`; khi rảnh thì việc làm mới là thao tác rỗng, vì loader chỉ tồn tại trong lúc lượt đang chạy.
- Việc đặt lại nằm trong lúc chuyển trạng thái `agent/status`, chứ không phải trong `setStatus`, vì `setStatus` cũng chạy khi lược đồ màu thay đổi giữa chừng một lượt, tuyệt đối không được xóa một số đếm thời gian thực.

## Alternatives considered

**Chỉ suy ra số đếm từ log phiên** (số lượt vào hàng đợi trừ số lượt giải phóng, tính lại khi replay). Bác bỏ: hủy sẽ làm rỗng inbox mà không ghi lại việc giải phóng, do đó log không thể phân biệt một tin nhắn bị giải phóng hay bị hủy bỏ; điểm neo "rời khỏi trạng thái running thì đặt lại" đơn giản hơn, và tự sửa lỗi sau mỗi lượt.

**Đặt lại bên trong `setStatus`.** Bác bỏ: `setStatus` sẽ chạy lại khi `applyColorScheme` giữa chừng một lượt, và sẽ xóa nhầm số đếm thời gian thực; việc chuyển trạng thái mới thực sự là thời điểm duy nhất một lượt kết thúc.

**Bỏ giới hạn dưới khi giảm dần.** Bác bỏ: agent loop tự sinh ra steering (như lý do continuation chạy tiếp) sẽ ghi `steering/message`, nhưng không có lần tăng vào hàng đợi tương ứng từ người dùng, điều này sẽ đẩy số đếm xuống âm; giới hạn dưới bằng zero khiến huy hiệu trở thành một cận dưới, chứ không phải một con số sai lệch.

**Biến câu chữ hoặc một ngưỡng nào đó thành cấu hình.** Bác bỏ: quy tắc "không hardcode tham số có thể điều chỉnh trong plugin" nhắm vào hành vi thay đổi theo triển khai, không phải văn bản thương hiệu; các chuỗi `welcome`/gợi ý vốn là văn bản hiển thị cố định.

## Consequences

- Huy hiệu là trạng thái UI thời gian thực nỗ lực tối đa, không ghi vào log: nó được dựng lại từ sự kiện, đặt lại mỗi lượt, không bao giờ được persist, do đó huy hiệu của một lượt đang chạy được khôi phục (resume) sẽ bắt đầu từ zero.
- Việc hủy giữa chừng hàng đợi sẽ được dọn sạch huy hiệu một cách gọn gàng qua cơ chế "rời khỏi trạng thái running thì đặt lại", còn giải phóng xuống dưới zero là thao tác rỗng — cả hai đều không để lại số đếm cũ.
- Nếu agent loop chạy tiếp mà vẫn giữ agent ở trạng thái `running`, đồng thời đưa lại vào hàng đợi các steering đến muộn chưa được giải phóng, thì có thể tạm thời đếm dư cho đến lần đặt lại khi rảnh tiếp theo; huy hiệu chỉ mang tính tham khảo, nên khoảng thời gian này chấp nhận được.
- `packages/ui/tui/src/index.ts` vẫn giữ độ phủ 100% ở một tệp duy nhất.

## Testing

`packages/ui/tui/tests/tui.spec.ts` điều khiển các khung trạng thái runtime qua `createTuiChat` thật: gợi ý thuần túy khi bằng zero, bỏ qua việc vào hàng đợi của agent khác, tăng lên `2 queued`, việc vào hàng đợi không phải steering giữ nguyên không đổi, giảm dần khi mỗi tin nhắn được giải phóng, giới hạn khi giải phóng xuống dưới zero, và đặt lại khi lượt kết thúc. Đã xác minh thực tế trong tmux — sau ba lần gọi `agent.steer()` huy hiệu hiển thị `3 queued`, sau đó khi hai tin được giải phóng hiển thị `1 queued`.
