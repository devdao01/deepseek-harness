# Agent Note: Phép chiếu đầu vào lệnh Goal

Status: implemented

[English](2026-08-01-goal-command-input-projection.md) | 中文

## Vấn đề

Lệnh hướng người dùng thực thi ngoài lượt của model, và được lưu bền vững dưới dạng `command/run` và `command/done`. Transcript (bản ghi hội thoại) Web trước đây chỉ render dòng kết quả. Do đó, trong một phiên mới, `/goal` sẽ xóa trống editor và hoàn tất thành công, nhưng trang vẫn ở lại màn hình Hero trống; chỉ khi có nội dung hội thoại tiếp theo kích hoạt Chat thì kết quả mới hiển thị. Nếu bộ xử lý thêm một `user/message` thông thường, điều đó sẽ thay đổi lịch sử model nhìn thấy và ngữ nghĩa của lệnh.

## Quyết định

Registry lệnh và vòng đời lệnh bền vững giữ nguyên không đổi. Bản ghi `command/run` ghi lại tên do parser cung cấp, tham số nguyên văn tùy chọn, nguồn gốc và id lệnh gọi; `command/done` ghi lại việc kết toán. Cả hai sự kiện đều không mang ý định trình bày trên trình duyệt.

Plugin client `ui-goal` đăng ký một Conversation Definition thuộc sở hữu của Goal, bên cạnh Definition lệnh chung. Cả hai đều khớp với cùng một `command/run` của `/goal`: Definition chung giữ lại dòng kết quả bền vững, còn Definition Goal thì dựng một Chat Node `command-input` độc lập tại một điểm neo điểm số sớm hơn. Plugin Goal cũng đăng ký renderer React theo khóa cho Node này. Component nội bộ của nó chỉ tái sử dụng hình học căn phải và token ngữ nghĩa của bong bóng người dùng, dùng văn bản font đều 14px/22px, và không gắn timestamp, copy hay thao tác nhánh.

`Session.composerPhase` coi Chat Node không phải lệnh nhưng có thể nhìn thấy là nội dung hội thoại, do đó `command-input` sẽ kích hoạt hội thoại hiện tại, còn nếu chỉ có dòng lệnh chung thì không. Ô `summary.blank` của Host vẫn dựa trên lượt, do đó việc ẩn khỏi danh sách và tái sử dụng phiên trống vẫn không đổi.

Definition Goal suy ra `/<name><args.trimEnd()>` từ run có cấu trúc: dấu phân cách và đầu vào nhiều dòng bên trong giữ nguyên; ở dạng lệnh trần đã được nhận, khi tham số chỉ có một khoảng trắng sẽ hiển thị `/goal`. Cửa sổ lịch sử chỉ chứa `command/done` không có Goal Context khớp, do đó sẽ giữ lại dòng kết quả chung, không tạo ra bong bóng đầu vào giả tạo; khi tải trang chứa run sớm hơn, cả hai Node đều được khôi phục.

Ranh giới model không đổi. Phép chiếu Goal không tạo ra `user/message`, `turn/start`, `step/start` hay `request/header`. Thay đổi goal đã chấp nhận chỉ đến được model qua snapshot `<goal_state>` hiện có của domain goal, hoặc qua tombstone xóa, không liên quan gì đến Node `command-input`.

## Xác minh

Test client Goal cố định đầu ra của cả hai Definition, thứ tự, loại trừ các lệnh khác, lệnh trần và văn bản nhiều dòng, cửa sổ cắt chỉ có done, ngữ nghĩa renderer, giải phóng tài nguyên và việc chọn phase cho phiên mới. Kịch bản Web lắp ráp đầy đủ không cần key submit `/goal` trần trong một phiên mới không có bộ chuyển đổi model, xác minh cả hai dòng đều hiển thị và không có sự kiện nào hướng tới model, sau đó tải lại và xác minh transcript đã lưu bền vững.

## Phương án thay thế

**Thêm `user/message` trong bộ xử lý `/goal`.** Không áp dụng, vì lệnh này sẽ trở thành đầu vào của model, có thể kích hoạt hoặc thay đổi các yêu cầu sau đó.

**Thêm ý định trình bày vào registry lệnh và sự kiện bền vững.** Không áp dụng, vì một view Goal sẽ mở rộng giao diện lệnh chung, và yêu cầu Session, Chat và mọi fixture (dữ liệu tiền đặt cho test) lệnh đều phải mang theo trạng thái trình bày trình duyệt. Tên và tham số hiện có của `command/run` đã đủ để client Goal đã tổ hợp tự dựng lại view riêng.

**Để renderer lệnh chung nhận biết `/goal`.** Không áp dụng, vì việc dựng view riêng cho lệnh thuộc về plugin client Goal. Khi gỡ plugin này khỏi bộ tổ hợp, bong bóng phải biến mất theo, còn việc thực thi lệnh và dòng kết quả chung không được thay đổi.

**Render mỗi đầu vào lệnh thành bong bóng người dùng.** Không áp dụng, vì các lệnh điều khiển hiện có cố ý để phiên mới ở lại Hero; sửa như vậy sẽ mở rộng ngữ nghĩa tương tác mà không có Conversation Definition riêng cho tính năng.

## Hệ quả

Một run `/goal` bền vững sẽ cung cấp dữ liệu cho hai Context view sở hữu riêng biệt, mà không thay đổi năng lực lệnh. Khi gỡ `ui-goal` khỏi bộ tổ hợp, việc thực thi lệnh thông thường và dòng kết quả của nó vẫn không đổi. Tab thời gian thực và tải lại nguội (cold reload) sẽ cho kết quả nhất quán, vì cả hai view đều suy ra từ cùng một run. Khi trang bị cắt chỉ giữ lại `command/done`, tạm thời chỉ hiển thị dòng kết quả; nếu lệnh đó là nội dung duy nhất của phiên, Hero sẽ ẩn dòng đó cho đến khi tải trang sớm hơn khôi phục lại run. Vì ngữ nghĩa blank của Host vẫn dựa trên lượt, phiên vẫn bị ẩn khỏi danh sách trước khi lượt model bắt đầu, và vẫn có thể tái sử dụng.
