# @deepseek-ai/dsh-jobs

[English](README.md) | 中文

Quy ước registry tác vụ nền (`ctx.jobs`). `JobRegistry` trừu tượng cùng các kiểu từ vựng của nó, dưới cùng một quy ước, cung cấp id dùng chung, cách ly owner, đọc, hủy, chờ, thông báo và dọn dẹp cho các bên sinh chạy lâu; registry cục bộ theo tiến trình nằm ở [`dsh-jobs-local`](../jobs-local/README.md). Các plugin sinh mở rộng `JobKindMap` bằng namespace id mờ (opaque) của riêng chúng.

## Quy ước service

- `start(spec): JobId` xác thực controller tác vụ đã gắn, spec, owner chính xác và còn sống, `outputLimitBytes` dương tùy chọn, và chính sách điều kiện vào do Service Provider sở hữu, sau đó chỉ gọi `run()` của bên sinh đúng một lần. Bị từ chối trước khi chạy hoặc bên khởi động ném lỗi thì đều không sinh ra job id hay đăng ký công việc; trả về thành công thì commit ngay, không thực hiện thêm bước nào khác có thể thất bại.
- `get(id, caller?)` và `list(caller?)` trả về snapshot không tiêu thụ. Danh sách chỉ chứa tác vụ do bên gọi sở hữu và tác vụ không owner.
- `read(id, caller?)` tiêu thụ con trỏ (cursor) duy nhất của tác vụ dạng stream; đối với tác vụ đầu ra cuối cùng, sẽ đọc idempotent đầu ra kết thúc.
- `kill(id, caller?, reason?)` gọi bên sinh hủy trước khi thay đổi trạng thái. Khi việc hủy ném lỗi, tác vụ vẫn tiếp tục chạy; thành công thì đổi trạng thái thành `stopping`, và đánh dấu việc giao kết thúc là đã báo cáo.
- `wait(id, timeoutMs, caller?, signal?)` trả về snapshot kết thúc, hoặc snapshot còn sống khi hết thời gian chờ. Hủy chỉ dừng việc chờ; một khi việc giao kết thúc đã gửi tới bên chờ đó, kết quả kết thúc được ưu tiên.
- `onJobDone(listener)` quan sát mỗi bản ghi kết thúc và chủ sở hữu chính xác của nó. Lỗi listener ném ra và các reject phát sinh đều được cách ly; hệ thống không chờ công việc của listener.
- `onJobsChanged(listener)` quan sát thay đổi của tập hợp có thể nhìn thấy — đăng ký, mỗi lần chuyển sang stopping (bao gồm cả lần teardown trước khi chờ bên sinh chậm), kết thúc, gỡ bỏ khi hủy owner, và việc dọn sạch do hủy service commit — chỉ mang theo owner mà tập hợp của nó có thay đổi, hoặc mang `undefined` khi thay đổi là của tác vụ không owner, do đó tập hợp của mọi bên gọi đều thay đổi theo. Nó phân độ mịn theo owner, vì việc gỡ bỏ là một thay đổi mà không bản ghi từng-tác-vụ nào có thể biểu đạt; nó cũng không phải là tập cha của `onJobDone`: nó không mang ý nghĩa giao nào, cũng không đánh dấu bất cứ gì là đã báo cáo. Đăng ký gắn với fiber của bên gọi, do đó các observer treo ngoài registry vẫn nhận được lần dọn sạch khi hủy.
- `attachController(name)` khai báo controller tác vụ trong vòng đời effect của nó. Khi không có controller đã gắn nào phục vụ owner của spec, `start()` sẽ thất bại trước khi bên sinh thực thi.

Cả ba loại đăng ký này đều tương đối theo chủ sở hữu, vì một registry phải phục vụ mọi bộ tổ hợp trong tiến trình. Controller hoặc listener đăng ký từ ngữ cảnh không có scope sẽ phục vụ mọi chủ sở hữu; loại đăng ký trong scope của một bộ tổ hợp agent thì chỉ phục vụ đúng agent được tổ hợp ra trong bộ đó. Do đó, tổ hợp không tải controller nào không thể mượn công cụ điều khiển của một tổ hợp khác để khởi động công việc nền, và một lần kết thúc cũng chỉ thông báo cho các listener đăng ký trong tổ hợp mà chủ sở hữu của nó thuộc về.

Truy cập có owner sẽ so sánh `SessionId` của tác vụ với bên gọi. Các id như `bash-1` có thể đoán được, do đó lớp cách ly này là ranh giới an toàn. Tác vụ không owner mở cho mọi bên gọi, và tồn tại cho đến khi service dispose (giải phóng tài nguyên).

`outputLimitBytes` là chính sách trình bày mô hình do bên sinh sở hữu, được mang nguyên trạng vào snapshot. Controller áp dụng nó sau khi thêm trạng thái hoặc metadata thông báo; registry không viết lại đầu ra của bên sinh, cũng không bịa ra giá trị mặc định cho bên sinh bỏ qua trường này.

Triển khai còn phải đảm bảo ngữ nghĩa vòng đời đã thỏa thuận: đăng ký tồn tại lâu hơn fiber bên sinh và fiber controller, việc giải phóng owner và giải phóng service sẽ hủy công việc còn đang chạy và chờ bên sinh tuân thủ, việc kết thúc tuân theo kết quả đầu tiên được ưu tiên (một bản ghi kết thúc, một vòng thông báo listener có lỗi được cách ly, rồi mới giải phóng bên chờ).

Xem [danh mục kiểu tác vụ](../../../docs/subsystems/jobs.md), [Agent Note về runtime](../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) và [Agent Note về seam](../../../.agents/notes/implemented/architecture/2026-07-26-job-registry-seam.md).

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp thông qua các plugin sinh và [`dsh-tool-jobs`](../tool-jobs/README.md); chúng sẽ render job id, đầu ra, trạng thái, hủy và thông báo hoàn tất.

#### Ảnh hưởng KV Cache

Không trực tiếp gây mất hiệu lực KV Cache; mọi thay đổi tiền tố request do bên tiêu thụ nêu trên chịu trách nhiệm.

## Hạn chế đã biết và công việc hoãn lại

- **Đầu ra dạng stream chỉ có một con trỏ tiêu thụ**: các observer độc lập cần một API con trỏ hoặc snapshot riêng.
- **Công việc tiền cảnh không thể chuyển thành nền**: bên sinh chọn tiền cảnh hoặc nền trước khi khởi động.
- **Quy ước chỉ nằm trong phạm vi một tiến trình**: `JobStart.run()` truyền callback và đối tượng `Agent` chính xác; backend bền vững hoặc xuyên tiến trình phải định hình lại danh tính, khởi động lại, quyền sở hữu và ngữ nghĩa quan sát trước khi có thể triển khai seam này.
