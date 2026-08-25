# @deepseek-ai/dsh-anonymous-user-id

[English](README.md) | Tiếng Việt

Danh tính ẩn danh dùng chung cho đo từ xa (telemetry) của session, xác nhận phản hồi trực tiếp và request nhà cung cấp DeepSeek. `getOrCreateAnonymousUserId()` trả về một UUID v4 ngẫu nhiên giới hạn trong một harness home duy nhất, và bền vững hóa nó dưới dạng dòng trần vào `$DSH_HOME/.anonymous-user-id` (thành `~/.dsh/.anonymous-user-id` khi chưa thiết lập `DSH_HOME`). Backend OpenTelemetry báo cáo nó dưới dạng `user.id` của Resource; `/feedback` bao gồm cùng giá trị này trong văn bản xác nhận; còn `dsh-llm-deepseek` gửi giá trị này qua `x-deepseek-harness-user-id`, giúp hệ thống nhận không cần tự sinh danh tính riêng để liên kết bản ghi.

Danh tính này không bao giờ được suy ra từ hostname, địa chỉ mạng, git remote hay bất kỳ nguồn nào khác có thể dùng để nhận dạng danh tính. Sau khi xóa `.anonymous-user-id`, danh tính sẽ được reset ở lần khởi động tiến trình tiếp theo. Các harness home khác nhau có danh tính khác nhau.

## Quy ước lưu trữ

Việc đọc/ghi sử dụng phương thức đồng bộ, vì việc khởi tạo telemetry và thực thi lệnh trực tiếp lúc khởi động đều cần dùng chung một API. Kết quả được cache trong suốt vòng đời tiến trình theo đường dẫn file đã phân giải. Bên ghi đầu tiên sử dụng tạo độc quyền; bên thua trong cuộc cạnh tranh đồng thời sẽ dùng giá trị đã bền vững hóa thắng cuộc. File bị hỏng sẽ được thay thế. Việc bền vững hóa dùng phương pháp best-effort, do đó ngay cả khi home không thể ghi, hệ thống vẫn trả về UUID cục bộ theo tiến trình, không chặn telemetry hay phản hồi.

## Lắp ráp

Package này là thư viện dùng chung, không phải plugin Cordis. Bên tiêu thụ import trực tiếp `getOrCreateAnonymousUserId()`. Plugin bất biến đi kèm của nó cố ý để trống, vì package này không sở hữu luồng sự kiện nào, cũng không sở hữu bất kỳ quan hệ công khai có thể thay đổi nào có thể kiểm tra được mà không kích hoạt tác dụng phụ tạo danh tính. `DSH_TELEMETRY_DISABLED` chỉ dừng việc xuất telemetry, không cấm xác nhận phản hồi trực tiếp hay header nhà cung cấp DeepSeek.

## Trải nghiệm model

Không có, vì định danh này chỉ được gửi đến DeepSeek dưới dạng metadata truyền tải HTTP không hiển thị với model, không bao giờ đi vào body request, prompt hay nội dung hiển thị với model.

#### Ảnh hưởng KV Cache

Không có; header truyền tải này không thay đổi token cũng không thay đổi tiền tố hiển thị với model.

## Hạn chế đã biết và công việc hoãn lại

- **Không thể khôi phục sau khi xóa**: sau khi mất danh tính, hệ thống sẽ sinh danh tính ẩn danh mới theo thiết kế; để khôi phục danh tính cần vật liệu suy diễn ổn định, điều này sẽ làm suy yếu tính ẩn danh.
- **Đồng thời theo kiểu best-effort**: nếu bên đọc rơi vào đúng cửa sổ thời gian hẹp khi một tiến trình đồng thời đã hoàn thành tạo độc quyền nhưng chưa ghi xong, lần chạy này có thể dùng UUID trong bộ nhớ khác; lần khởi động sau sẽ hội tụ về giá trị đã bền vững hóa.
- **Không có danh tính xuyên home**: không thể liên kết giữa các giá trị `$DSH_HOME` khác nhau.
- **DeepSeek gateway đã cấu hình sẽ nhận được id này**: `dsh-llm-deepseek` sẽ gửi header ổn định này đến `baseURL` đã phân giải (bao gồm cả override triển khai), không phụ thuộc vào chế độ chia sẻ telemetry.
