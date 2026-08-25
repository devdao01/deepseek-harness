# Agent Note: Thanh mục tiêu Web dạng docked

Status: implemented

Archived: 2026-08-07

[English](2026-07-22-docked-web-goal-bar.md) | 中文

## 问题

Web UI trước đây không có bất kỳ giao diện liên quan đến mục tiêu nào: goal stack đã được bàn giao cùng với các công cụ mô hình, adapter TUI/ACP và lệnh `/goal`, nhưng client trình duyệt hoàn toàn không đụng đến nó — không có động từ runtime, cũng không có chỉ báo. Thay đổi này đồng thời đưa vào động từ mục tiêu phía client (các phương thức phiên runtime dựa trên RPC) và giao diện mục tiêu đầu tiên. Vị trí đặt tuân theo tiền đề của việc thiết kế lại: sự hiện diện của mục tiêu thuộc về ngữ cảnh của ô nhập — mục tiêu là thuộc tính của công việc mà người dùng sắp gửi, do đó chỉ báo của nó thuộc về ngăn xếp ngữ cảnh composer; [quyết định về ngăn xếp ngữ cảnh composer](../bug-fix/2026-07-30-composer-context-stack-order.md) quy định vị trí của nó giữa Goal, Todo, Queue và composer. Bản thiết kế chỉ giữ lại một biểu tượng lấp lánh, một từ chỉ giai đoạn ("Ongoing/Paused/Blocked Goal"), nội dung mục tiêu đã cắt ngắn, và các thao tác biểu tượng sửa/xóa, nút khôi phục chỉ xuất hiện khi mục tiêu đang tạm dừng.

## 决策

`GoalBar` (`packages/client/ui-goal/src/client/GoalBar.tsx`) là một thành phần tự chứa, điều khiển bằng props, được đăng ký làm mục thứ hai trong danh sách input-dock của composer, đứng sau Todo và trước Queue. Nó dùng một thẻ độc lập rộng 752px, tuân theo hình học ngang của composer; mọi trạng thái hiển thị đều dùng chiều cao cố định 36px, chuyển đổi giai đoạn không làm thay đổi kích thước. Khi đang tải (`goal === undefined`), không có mục tiêu (`goal === null`) và `phase === 'complete'` thì không render gì cả: mục tiêu đã hoàn thành là lịch sử, không phải một phần tử giao diện thường trực.

Trạng thái hiển thị quyết định nhãn và các thao tác: trạng thái active hiển thị "Ongoing Goal" và cung cấp tạm dừng/sửa/xóa; trạng thái paused hiển thị "Paused Goal", thay tạm dừng bằng một nút biểu tượng khôi phục; trạng thái blocked hiển thị "Blocked Goal", và đặt `blockedReason.message` làm tooltip `title` khi di chuột trên thanh. Điểm vào để tạo mục tiêu nằm ở lệnh `/goal`, không nằm trong thanh. Biểu tượng bút chì chuyển thanh sang một form chỉnh sửa nội tuyến, điền sẵn nội dung mục tiêu hiện tại: Enter hoặc nút tick sẽ lưu qua `GoalBarActions.onEdit(objective)`, Esc hủy, nút lưu vẫn bị vô hiệu hóa khi nội dung mục tiêu toàn khoảng trắng. Form chỉ đóng lại khi chỉnh sửa thành công; khi chỉnh sửa thất bại, bản nháp được giữ lại và hiển thị lỗi trong thanh. Việc khôi phục và xóa thất bại cũng hiển thị trong thanh. Ngoài ra, xóa gọi trực tiếp `onClear`, không cần xác nhận — việc xóa vẫn giữ lại bia mộ (tombstone) durable, không có mất mát không thể khôi phục. Mỗi lần thay đổi trước tiên sẽ giành một khóa single-flight đồng bộ bên trong thành phần, vì trạng thái pending của React không thể đóng cửa sổ nhấp chuột trong cùng một khung hình. Sau khi xóa thành công, id của goal đó lập tức bị ngăn chặn cho đến khi phép chiếu null có thẩm quyền bắt kịp, do đó bia mộ đã xác nhận sẽ không để lại điều khiển xóa cũ và gửi lại `GOAL_NOT_FOUND`; nếu thất bại thì khóa được giải phóng, và vẫn có thể thử lại. Một effect khóa theo id mục tiêu sẽ đặt lại trạng thái tạm thời và loại bỏ form chỉnh sửa khi danh tính mục tiêu thay đổi, do đó dù là cờ đã xóa hay bản nháp còn sót lại đều không ảnh hưởng đến mục tiêu thay thế.

`GoalBarActions` nằm trong hợp đồng slot của ui-goal (`packages/client/ui-goal/src/client/slots.ts`), chỉ mang theo các động từ thực sự được render: `onEdit`/`onPause`/`onResume`/`onClear`. Mỗi callback đều trả về bất đồng bộ một kết quả thành công/thất bại rõ ràng, do đó `GoalBar` tự chịu trách nhiệm chuyển đổi giao diện và hiển thị lỗi. `apply.ts` kết nối chúng vào các phương thức phiên runtime; phiên runtime tự phân giải nội bộ ref compare-and-set của mục tiêu hiện tại, do đó UI không truyền ref.

Phiên runtime lấy bề mặt goal cần thiết cho thanh (và giao diện tương lai) thông qua phép chiếu `goal` được host tính toán. Trang cuối lịch sử cung cấp giá trị hiện tại đầy đủ làm trạng thái khởi tạo; khi mục `agent/inbox/spliced` được persist chèn vào commit snapshot goal hoặc bia mộ clear, khung `session/projection` sẽ cập nhật giá trị đó, việc chuẩn nhận ngữ cảnh sau đó không liên quan đến độ mới của UI. 4 động từ thay đổi thực sự được render, giống mọi phương thức phiên cùng loại, gấp lỗi ở tầng vận chuyển thành kết quả `{ ok: false }`.

Màu nền của thanh dùng `--dsw-alias-interactive-bg-hover`, chứ không phải giá trị chữ nghĩa `#F5F6F7` trong bản thiết kế: màu xám bán trong suốt khi hover này giải ra đúng giá trị đó trên nền trắng của theme sáng, còn ở chế độ tối thì có thể tách thanh nổi bật khỏi thẻ ô nhập, trong khi một token màu sáng tĩnh sẽ chìm xuống ở chế độ tối. Mọi màu sắc đều là token `--dsw-*`.

## 测试

`packages/client/ui-goal/tests/goalbar.spec.tsx` chỉ cố định các hành vi sau qua props: không render gì khi đang tải/không có mục tiêu/đã hoàn thành; thanh active render nhãn và nội dung mục tiêu, kích hoạt xóa; nhiều lần nhấp liên tiếp nhanh vào nút xóa trong cùng một khung hình chỉ phát đi một lần, sau khi xóa thành công thanh sẽ ẩn đi trước khi phép chiếu hội tụ; form chỉnh sửa điền sẵn nội dung, từ chối giá trị rỗng, lưu bằng Enter, hủy bằng Esc, và đặt lại khi danh tính mục tiêu thay đổi; thanh active kích hoạt tạm dừng; thanh paused kích hoạt khôi phục; thanh blocked hiển thị tooltip lý do. Các case đường thất bại của thành phần chứng minh rằng bản nháp được giữ lại khi chỉnh sửa thất bại, và lỗi chỉnh sửa/khôi phục/xóa tiếp tục hiển thị trong thanh và có thể thử lại. Test đặc tả skeleton mount `ConversationRoot` lần lượt có và không có `goalActions`; trường hợp chưa xác định đã cài sẵn một mục tiêu active, do đó thứ ẩn thanh là cổng mount bị thiếu, chứ không phải mục tiêu bị thiếu. Test đặc tả phiên runtime cố định việc gấp lỗi kết quả và cập nhật phép chiếu. Một test smoke trình duyệt thật không cần khóa khởi động ứng dụng đã lắp ráp qua `boot → RPC → runtime → GoalBar`, và ghi lại bằng inline snapshot nhãn cùng nội dung mục tiêu, thao tác đã render.

## 考虑过的替代方案

- **Đặt thanh ở phần đầu phiên**: không được chấp nhận, vì tiền đề của việc thiết kế lại là sự hiện diện của mục tiêu thuộc về ngữ cảnh của ô nhập; một thanh ở phần đầu sẽ tách mục tiêu ra khỏi Todo, Queue và các gợi ý có giới hạn của chúng.
- **Render placeholder "Loading goal…" cho `undefined`**: không được chấp nhận, mỗi lần mở phiên thanh sẽ nhấp nháy rồi sụp xuống, đối với một trạng thái chưa đến một giây thì chỉ là nhiễu giao diện.
- **Cung cấp điểm vào tạo mục tiêu nội tuyến trong thanh khi chưa đặt mục tiêu**: không được chấp nhận sau khi rà soát triển khai, trách nhiệm tạo mục tiêu nằm ở lệnh `/goal`, nhất quán với mô hình mô hình tạo mục tiêu theo yêu cầu; thanh là chỉ báo trạng thái, không phải điểm vào tạo mới.
- **Mang toàn bộ tập động từ (bao gồm `onComplete`) trong `GoalBarActions`**: không được chấp nhận vì là khái quát hóa mang tính đầu cơ, giao diện chỉ mang theo các động từ thực sự được render (thanh active có thao tác tạm dừng thì `onPause` mới được thêm vào theo).

## 后果

- Sự tồn tại của mục tiêu trong Web UI thể hiện dưới dạng một thanh ngữ cảnh composer độc lập: biểu tượng lấp lánh, nhãn giai đoạn, nội dung mục tiêu đã cắt ngắn, và tạm dừng/sửa/xóa (khôi phục thay thế tạm dừng khi đang tạm dừng) — đây là giao diện mục tiêu đầu tiên của client trình duyệt.
- Thay đổi mục tiêu chạy single-flight bên trong thành phần; sau khi xóa thành công sẽ ngay lập tức ẩn mục tiêu có id khớp hoàn toàn trong lúc phép chiếu chờ hội tụ, vừa ngăn lỗi CAS trùng lặp, vừa không coi trạng thái UI tạm thời là có thẩm quyền.
- Phiên runtime công bố các động từ goal qua RPC và gấp lỗi tầng vận chuyển, tiêu thụ phép chiếu goal đầy đủ được persist bởi host khi mở và khi cập nhật trực tiếp.
- Lần đầu tiên nội dung mục tiêu có thể chỉnh sửa từ UI, thông qua `goal.edit`, ref do runtime nắm giữ; việc hoàn thành vẫn khả dụng như thường trên các giao diện khác (`/goal`, công cụ mô hình).
- `goal === null` thì không render gì cả; ô nhập không cung cấp điểm vào tạo mới thường trực, việc tạo là trách nhiệm của lệnh `/goal`.
