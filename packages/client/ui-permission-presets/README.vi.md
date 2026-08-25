# @deepseek-ai/dsh-client-ui-permission-presets

[English](README.md) | Tiếng Việt

Giao diện quyền trên trình duyệt phục vụ hai vòng đời khác nhau. Dòng thiết lập «Chung» đọc mô tả Settings `permission` được phơi bày tường minh, suy ra các lựa chọn từ enum `defaultPreset` động của host, rồi ghi một thao tác đường dẫn `settings.mutate` kèm revision của mô tả. Observable của nó được truyền qua ô `hooks` của hệ thống slot, nên các React hook do bộ render ràng buộc; thông báo mất hiệu lực được đẩy tới sẽ lấy lại mô tả. Giá trị này chỉ có hiệu lực khi tạo phiên về sau; thay đổi nó không chuyển đổi phiên hiện tại. Khi chọn Full access thì phải xác nhận rủi ro một cách tường minh trước, sau đó dòng này mới ghi.

Giao diện cho phiên hiện tại vẫn là phần **trang trí** popupSelect gắn trên lệnh `/permission` của host (`ctx.commandUi.decorate`). Trang trí không phải là một lệnh thứ hai — lệnh của host vẫn giữ dòng trong menu gạch chéo, đường dẫn có tham số (`/permission <preset>` chuyển đổi trực tiếp) và việc ghi sổ vòng đời lâu dài; phần trang trí chỉ thay lời gọi trần bằng một hộp chọn: một danh sách preset phẳng, giá trị hiện tại được đánh dấu active, tên preset kiểu kebab-case được render thành nhãn Title Case (`workspace-write` → `Workspace Write`, sinh đôi với phép biến đổi hiển thị của chip trong composer), chọn xong là gửi dòng lệnh `/permission <preset>`. Các lựa chọn và dấu active đọc từ phép chiếu `permissions` của phiên (cùng một select do host tính toán mà chip composer đang render), nên hai giao diện cho phiên hiện tại dùng chung một nguồn đọc và một đường ghi, còn frame chiếu được đẩy tới là xác nhận duy nhất mà cả hai cùng bám theo. Phần trang trí khả dụng đúng khi khóa chiếu tồn tại; tổ hợp không có quyền thì không hiện hộp chọn, cũng không hiện dòng Settings.

Bề mặt export `/client` là chính plugin (`apply`／`inject`).

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp qua các sự thật về quyền được ghi bởi hai giao diện: dòng Settings làm cho các phiên tương lai khởi động kèm sự kiện núm xoay đủ bộ giá trị (`permission/preset`, `sandbox/mode`, `approval/policy`), còn hộp chọn `/permission` khi chuyển đổi phiên hiện tại sẽ nối thêm chính các sự thật đó; những sự kiện này quyết định chế độ sandbox và chính sách phê duyệt mà các lời gọi công cụ sau đó phân giải ra, còn bản thân thao tác trên hộp chọn không thêm nội dung prompt nào.

#### Ảnh hưởng KV Cache

Không làm mất hiệu lực trực tiếp; thay đổi ở tiền tố yêu cầu do bên tiêu thụ núm xoay tự gánh.

## Hạn chế đã biết và phần tạm hoãn

- **Dòng Settings chỉ có trong Web**: client không phải Web vẫn có thể chuyển đổi phiên hiện tại qua `/permission`, nhưng sẽ không nhận được phần đóng góp trên trình duyệt này.
