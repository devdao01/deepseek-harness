# Agent Note: Sự kiện bền vững do Goal sở hữu

Status: implemented

[English](2026-07-31-goal-owned-durable-events.md) | Tiếng Việt

## Vấn đề

Trạng thái Goal và trạng thái inbox có vòng đời khác nhau. Bất kể ngữ cảnh mô hình liên quan có được nạp vào bước hay không, các thay đổi goal vẫn phải được giữ lại sau khi khởi động lại và sau fork; còn tin nhắn inbox thì có thể bị sửa, bị lấy đi, bị từ chối hoặc bị loại bỏ trong lúc điều phối bước. Mã hóa thay đổi goal vào một tin nhắn inbox có Round bằng 0 sẽ biến việc đặt vào hàng đợi thành điểm commit của lĩnh vực, đồng thời buộc quá trình phát lại phải đối soát cả việc chèn, nạp, định danh tin nhắn, siêu dữ liệu nguồn và nội dung hiển thị.

Lĩnh vực goal cần trạng thái bền vững, nhưng không cần sở hữu đầu vào mô hình đang chờ. Việc điều phối tiếp tục thực thi vẫn cần inbox; còn việc lưu bền goal thì không.

## Quyết định

`@deepseek-ai/dsh-goal` sở hữu sự kiện session bền vững `goal/change`. Mỗi sự kiện mang theo ảnh chụp goal đầy đủ sau khi thay đổi, hoặc một bia mộ xóa kèm số hiệu bản sửa đổi. `GoalService` nối thêm sự kiện đó một cách đồng bộ, rồi phát ra `goal/changed`; phát lại nghiêm ngặt và phép chiếu session `goal` chỉ gấp `goal/change` để có được trạng thái vòng đời.

`GoalMessageSource` chỉ đánh dấu các Round tiếp tục thực thi đã được nạp và mang giá trị dương. `user/message` khớp sẽ đẩy `roundsStarted` tiến lên; tin nhắn người dùng thông thường và sự kiện inbox splice không làm thay đổi trạng thái goal. Package goal không chèn, lấy, gỡ hay kiểm tra tin nhắn inbox. `@deepseek-ai/dsh-goal-round-driver` vẫn chịu trách nhiệm xếp hàng và theo dõi prompt tiếp tục thực thi của chính nó thông qua vòng đời inbox công khai.

Trạng thái kích hoạt vẫn chỉ tồn tại trong tiến trình. Khi đệm sự kiện quan sát được, service liên kết số thứ tự của sự kiện được nối thêm đồng bộ với trạng thái kích hoạt được yêu cầu; các thay đổi đến từ phát lại hoặc do bên ngoài nối thêm mặc định ở trạng thái disarmed. Session log vẫn là quyền uy bền vững duy nhất.

Lĩnh vực này không tự động chiếu mọi thay đổi thành đầu vào mô hình. Công cụ goal trả về trạng thái hiện tại; khi thực sự điều phối công việc, prompt tiếp tục thực thi sẽ bao gồm mô tả mục tiêu và trạng thái Round. Nếu sau này cần một ngữ cảnh goal luôn hiển thị, thì một plugin ngữ cảnh riêng nên sở hữu tin nhắn inbox của nó, thay vì coi đó là tác dụng phụ của việc lưu bền.

## Các phương án đã cân nhắc

- **Tiếp tục dùng tin nhắn goal với Round bằng 0 làm bản ghi bền vững.** Không chọn, vì điều này trói commit của lĩnh vực vào thay đổi hàng đợi, và đòi hỏi phép gấp goal phải hiểu việc lấy đi và đối soát nạp, dù kết quả hàng đợi không thể cuộn ngược trạng thái lĩnh vực.
- **Chỉ suy ra trạng thái goal từ các tin nhắn mà mô hình thấy được.** Không chọn, vì một thay đổi có thể hợp lệ và bền vững mà không cần mở một bước, và việc hủy hay bị chính sách từ chối cũng không xóa được nó.
- **Lưu goal vào một cơ sở dữ liệu riêng.** Không chọn, vì session log có thứ tự đã cung cấp sẵn tính bền vững, phát lại và kế thừa qua fork, nên không cần thêm một ranh giới nguyên tử thứ hai.

## Hệ quả

Trạng thái goal không phụ thuộc vào việc đặt vào inbox và việc nạp. Phát lại chỉ còn một đường thay đổi duy nhất, phép chiếu được đẩy tiến trực tiếp bởi `goal/change`, và tin nhắn tiếp tục thực thi chỉ mang thông tin quy thuộc Round. Mô hình không nhận tin nhắn `<goal_state>` chỉ dùng cho thay đổi; trạng thái mà mô hình thấy được đến từ công cụ goal và từ prompt tiếp tục thực thi đã được điều phối. Các bên ghi trực tiếp vào session vẫn được tin cậy, và vẫn có thể nối thêm những thay đổi dị dạng; phép gấp nghiêm ngặt và module invariant đi kèm sẽ từ chối các thay đổi đó.

Các test tập trung của goal, goal-round-driver, command, TUI và client fixture (dữ liệu chuẩn bị cho test) cố định hành vi phát lại bền vững, đếm Round dương, tính độc lập với inbox, cập nhật phép chiếu và hành vi khôi phục session. Test tiến trình không cần khóa kiểm tra sự kiện `goal/change` bền vững, và xác nhận rằng chỉ tạo goal thôi thì không khởi động Round tiếp tục thực thi.
