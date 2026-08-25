# Agent Note: Ngữ cảnh chính sách sandbox không phụ thuộc năng lực cụ thể

Status: implemented

[English](2026-07-31-capability-neutral-sandbox-policy-context.md) | Tiếng Việt

## Vấn đề

Ban đầu, ngữ cảnh chính sách hiện tại ánh xạ cách ghép ở runtime thông qua hai registry riêng biệt: họ được cưỡng chế và họ có thể nâng quyền. Sáu điểm gọi trong backend, tool và ví dụ sẽ đóng góp `filesystem`, `bash` hoặc `terminal`; dịch vụ chính sách giữ tập token để có thể giải phóng độc lập từng đăng ký, lấy giao của nội dung hai registry rồi sắp xếp, làm mất hiệu lực phần lắp ráp prompt ở mỗi lần vòng đời thay đổi, và cần bài test bao phủ mọi tổ hợp họ.

Danh sách này vừa không cần thiết cho việc mô tả chính sách tệp, vừa không thể làm căn cứ có thẩm quyền về năng lực mà model nhìn thấy. Phần đóng góp của backend có thể khai báo một họ nào đó trong khi tool hướng tới model của họ đó không tồn tại, hoặc bị phạm vi request che đi; schema của tool vốn đã mô tả chính xác cho model biết những thao tác nào khả dụng. Vì vậy, chỉ để duy trì một câu mô tả tiếng Anh mang tính xấp xỉ, registry đã làm phình to dịch vụ công khai và giao ước vòng đời.

## Quyết định

`dsh-sandbox-policy` đóng góp một ngữ cảnh `sandbox:policy` không phụ thuộc năng lực cụ thể cho mỗi phiên agent (tác tử). Văn bản ngữ cảnh chỉ được suy ra từ `resolve({ session })`; không tồn tại API đăng ký họ backend hay họ tool, không có bảng ánh xạ đóng góp, không có quy tắc sắp xếp, và cũng không làm mất hiệu lực prompt khi đăng ký thay đổi.

Văn bản đó giới hạn phần khai báo năng lực trong những thao tác khả dụng mà sandbox tệp của DSH cưỡng chế. Ở chế độ `read-only`, nó nêu rằng nhóm thao tác này không thể sửa tệp khi chạy ở chế độ thường trú, và hướng dẫn model cứ thử tool khả dụng như bình thường, sau đó tuân theo mọi chỉ dẫn từ chối và nâng quyền mà tool đó trả về. Ở chế độ `workspace-write`, nó nêu rõ vùng làm việc phiên đã chuẩn hóa, cùng quyền ghi vào vùng tạm kèm điều kiện áp dụng. Ở chế độ `danger-full-access`, nó nêu rằng sandbox tệp của DSH không hạn chế các thao tác khả dụng sửa tệp.

Thao tác nào khả dụng vẫn lấy schema của tool làm chuẩn. Việc từ chối một thao tác cụ thể cũng như lần thử lại ở chế độ nới lỏng hơn sau khi được phê duyệt vẫn lấy kết quả tool làm chuẩn. Phần hiện thực hệ thống tệp, bash một lần và terminal tiếp tục phân giải và cưỡng chế đúng chính sách theo từng lời gọi; thứ bị gỡ bỏ chỉ là danh sách năng lực thừa hướng tới model.

Quyết định này thay thế phần nội dung về đăng ký họ và cách diễn đạt có điều kiện theo tổ hợp trong [quyết định ngữ cảnh chính sách sandbox hiện tại](../feature/2026-07-30-current-sandbox-policy-context.md). Việc bàn giao ngữ cảnh an toàn với cache, vật chất hóa ảnh chụp bền vững, bằng chứng cho cách diễn đạt, cùng ranh giới giữa hướng dẫn và cưỡng chế vẫn thuộc quyền sở hữu của Agent Note đó.

## Các phương án đã cân nhắc

**Giữ registry nhưng giảm bớt bài test tương ứng.** Không áp dụng, vì các phương thức công khai, trạng thái vòng đời được lưu giữ, sáu điểm đóng góp và câu khai báo năng lực mang tính xấp xỉ vẫn còn đó. Bài test tổ hợp chỉ phản ánh chi phí của thiết kế này, chứ không phải nguyên nhân gây ra chi phí.

**Suy ra danh sách chính xác từ registry của tool.** Không áp dụng, vì chính sách hiện tại chỉ cần một câu khai báo có điều kiện đúng sự thật, còn tình trạng khả dụng chính xác thì đã thể hiện trong schema tool sau khi lắp ráp và có thể thay đổi theo phạm vi request. Nếu lại ánh xạ từng schema ngược về backend cưỡng chế của nó thì sẽ đưa vào thêm một quan hệ dẫn xuất nữa mà hiện không có bên tiêu thụ nào cần.

**Chỉ cung cấp ngữ cảnh chính sách khi backend khai báo sẽ cưỡng chế.** Không áp dụng, vì cách này tái hiện đúng vấn đề đăng ký, và khiến việc chính sách có hiển thị hay không phụ thuộc vào bên đóng góp tùy chọn. Ngay cả khi không có thao tác nào áp dụng được, đoạn diễn đạt có điều kiện này vẫn đúng sự thật.

## Hệ quả

Dịch vụ chính sách chỉ còn một đường ngữ cảnh được suy trực tiếp từ bên sở hữu, không phải duy trì hai registry công khai cùng vòng đời giải phóng của chúng. Việc thêm hay bớt năng lực không còn khiến ảnh chụp ngữ cảnh lúc chạy thay đổi liên tục, còn thay đổi về chế độ và vùng làm việc thì vẫn kích hoạt cập nhật ảnh chụp. Bài test tập trung vẫn bao phủ cách diễn đạt chính xác của từng chế độ, thư mục gốc đã chuẩn hóa, việc chuyển chế độ, khôi phục, giải phóng dịch vụ và lắp ráp khi không có agent; còn bài test về tổ hợp họ và vòng đời đóng góp thì bị xóa cùng với hành vi mà chúng bảo vệ.

Model không còn nhận danh sách các họ năng lực sandbox liệt kê bằng ngôn ngữ tự nhiên, mà nhận schema tool chính xác cùng một câu khai báo chính sách tệp thường trú. Sau này nếu sản phẩm cần một danh sách năng lực riêng, danh sách đó phải được suy ra từ kết quả lắp ráp theo từng request có thẩm quyền, chứ không được dựng lại qua cơ chế đường vòng như đăng ký từ backend.
