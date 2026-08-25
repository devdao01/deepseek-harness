# Schedule chỉ trong phạm vi Session

[English](README.md) | 中文

Overlay này cho một tiến trình `dsh web` bật rõ ràng tính năng nhắc lịch Schedule, đồng thời không thay đổi tổ hợp Web mặc định khi triển khai:

```sh
dsh web --patch examples/web-schedule/cordis.yml
```

Overlay hiện tại hỗ trợ tạo lời nhắc bằng số nguyên dương `after_seconds`, mốc thời gian tuyệt đối `at`, hoặc khoảng `every_seconds` với tốc độ cố định tối thiểu 300 giây. Model quản lý chúng qua `schedule_create`, `schedule_list` và `schedule_delete`; mỗi kết quả đều đánh dấu việc giao là `session-local`.

Trình duyệt sẽ đính kèm múi giờ IANA của nó vào mỗi prompt. Time-context sẽ báo cho model biết cách diễn giải ngày giờ không nêu rõ múi giờ theo múi giờ trình duyệt của yêu cầu đó. Giả định này chỉ dùng để diễn giải ngôn ngữ tự nhiên: `schedule_create.at` phải là datetime tuân thủ nghiêm ngặt RFC 3339 kèm `Z` hoặc độ lệch số, hoặc là `{ date, time, time_zone }` kèm `UTC` rõ ràng hoặc múi giờ IANA Area/Location. Schedule không lưu giữ hay suy luận múi giờ mặc định của Session. Khoảng trống do giờ mùa hè (DST) sẽ bị từ chối, khoảng thời gian trùng lặp sẽ chọn thời điểm đầu tiên; bản ghi được tạo thành công chỉ giữ lại mốc UTC kết quả.

Mỗi lời nhắc thuộc sở hữu của log Session gốc. Agent gốc ở chế độ live sẽ chờ đến khi hoàn toàn idle, rồi mới đưa vào một lượt follow-up bình thường trong cuộc hội thoại đó. Nó không bao giờ can thiệp giữa chừng vào công việc hiện tại, cũng không thêm biên nhận độc lập hay thẻ nhắc nhở. Đóng tiến trình hoặc để Session ở trạng thái cold sẽ dừng timer trong bộ nhớ, nhưng không xóa bản ghi; mở lại cùng Session đó sẽ khôi phục việc chờ đợi và giao các lời nhắc đã quá hạn. Xem lịch sử cold không kích hoạt lời nhắc, và fork cũng không kế thừa lời nhắc của Session cha.

Lời nhắc Every luôn được căn theo thời điểm nó được tạo. Nếu lời nhắc bị quá hạn, chỉ thời điểm đến hạn gần nhất mới được hiển thị, mốc tiếp theo vẫn giữ nguyên trên chuỗi tốc độ cố định ban đầu. Tất cả các bản ghi Every khác nhau bị quá hạn trong cùng một quyết định idle sẽ được gộp thành một follow-up, mỗi bản ghi có một thời điểm xảy ra riêng; các khoảng bị bỏ lỡ không dồn tích lại. Các lời nhắc một lần đã đến hạn sẽ chạy trước lô đó. Không hỗ trợ biểu thức lịch và biểu thức Cron.

Thao tác tạo và xóa thực tế chỉ được xác nhận thành công sau khi Session persistence xác nhận tiền tố sự kiện tương ứng. Schedule không cung cấp thông báo qua trình duyệt, hệ điều hành, email, SMS hay kênh bên ngoài khác. Dispatch bền vững chỉ ghi nhận rằng follow-up đã được đưa vào hàng đợi; nó không xác nhận model đã thành công hay người dùng đã nhận được lời nhắc.
