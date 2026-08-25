# @deepseek-ai/dsh-client-ui-plan

[English](README.md) | Tiếng Việt

Huy hiệu trạng thái Plan mode, plugin surface thuần trình duyệt. Phía trình duyệt chiếm seat đơn thực thể `conversation.input.plan` do phiên khai báo (nằm bên phải điều khiển chế độ access); phía node là một apply rỗng (dòng roster). Bản thân hành vi plan — lệnh `/plan`, trạng thái `plan/mode` được commit tức thì tại ranh giới hoặc lúc rảnh, đơn vị chiếu `plan` và đoạn policy — thuộc về [`@deepseek-ai/dsh-plan-mode`](../../plan/plan-mode/README.md), do host roster tổ hợp độc lập.

Plan mode được vào qua đường lệnh `/plan`: người dùng có thể chọn Plan từ menu Command `+` của composer, hoặc gõ `/plan`, còn gói này không render điều khiển plan ở trạng thái chưa kích hoạt. Khi phép chiếu `plan` do host tính toán có mục tiêu hiệu lực là plan mode (`pending ? !active : active` — giá trị host đã gấp lại chứ không phải trạng thái lạc quan phía client, frame tới là tự chỉnh lại), seat sẽ render nút trạng thái "Plan ×" màu warn, nút này thực thi `/plan off` qua `command.execute`; ngược lại thì seat để trống — host không tổ hợp plan-mode (hoặc Draft chưa có phiên) sẽ không hiển thị gì. Trong lúc plan mode là mục tiêu hiệu lực, placeholder của ô văn bản composer chuyển sang lời nhắc tác vụ plan — "describe your task to generate plan" (tiếng Việt «mô tả tác vụ của bạn để tạo kế hoạch»), được bản địa hóa qua namespace locale `conversation` của ui-conversation (các khóa `placeholder.plan` / `hint.plan`), và dùng chung từng chữ một cùng văn bản với gợi ý của lệnh `/plan` đã nhận (do composer render từ cùng một phép chiếu; placeholder do owner cung cấp được ưu tiên).

Chip mang mô tả trợ năng "Plan mode on, press to turn off". Lỗi tiếp nhận (`matched: false`, lỗi nghiệp vụ, sự cố truyền tải) hiện dưới dạng lỗi nội tuyến, chip vẫn hiển thị cho tới khi phép chiếu xác nhận đã thoát.

Mô hình thoát plan mode bằng công cụ ổn định `exit_plan_mode`; phần duyệt plan của nó đi qua kênh question Web đã tổ hợp.

## Trải nghiệm mô hình

Gián tiếp, qua dòng lệnh `/plan off` do chip phát đi: `@deepseek-ai/dsh-plan-mode` sở hữu đoạn policy mà mô hình nhìn thấy, schema công cụ thoát và trạng thái đã ghi mà dòng lệnh đó điều khiển, còn gói này chỉ render phép chiếu và gửi đúng thứ mà người dùng cũng có thể tự gõ tay.

#### Ảnh hưởng KV Cache

Vào hoặc rời plan mode sẽ thay đổi đoạn prompt hệ thống `plan:policy` đang hoạt động, do đó thay đổi tiền tố yêu cầu; bản thân chip không thêm nội dung prompt nào.

## Hạn chế đã biết và phần tạm hoãn

- **Plan mode là hướng dẫn chứ không phải sandbox thực thi**: bên triển khai cần ép buộc lập kế hoạch chỉ-đọc phải tổ hợp sandbox và chính sách phê duyệt riêng.
- **Chip thuộc về trình soạn thảo mặc định**: tương tác chiếm trọn trình soạn thảo đang chờ xử lý (như duyệt plan) sẽ tạm thời thay thế InputBar cùng chip của nó.
- **Không có điều khiển plan ở trạng thái chưa kích hoạt** — lối vào dùng Command source dùng chung; phiên có năng lực nhưng chưa kích hoạt mode sẽ không hiện lối vào plan ở hàng công cụ.
