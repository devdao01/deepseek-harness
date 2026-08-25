# @deepseek-ai/dsh-jobs-local

[English](README.md) | 中文

Triển khai cục bộ theo tiến trình cho quy ước registry của [`@deepseek-ai/dsh-jobs`](../jobs/README.md): `LocalJobRegistry` lưu mỗi bản ghi trong bộ nhớ, cấp id `<kind>-N` theo kind, và chỉ trả ra các snapshot hoàn toàn mới, không bao giờ trả ra trạng thái thời gian thực. Sau khi tải như một plugin, nó sẽ đăng ký thành `ctx.jobs`.

## Điều kiện vào

`maxConcurrentJobsPerOwner` phải là số nguyên dương an toàn, mặc định là `10`. Trước khi gọi bên sinh, `start()` sẽ đếm số bản ghi `running` và `stopping` của đúng owner đó; tất cả tác vụ không owner chia sẻ một bucket cấp service riêng biệt khác. Lịch sử kết thúc không chiếm dung lượng, tác vụ ở trạng thái `stopping` chỉ giải phóng chỗ khi bên sinh hoàn tất `done`.

Khi đạt dung lượng tối đa, `start()` sẽ thất bại trước khi thực thi bên sinh và cấp id; lỗi sẽ nêu giới hạn, và báo mô hình dùng `job_kill`, chờ tác vụ dừng hẳn rồi thử lại. Registry không xếp hàng hay chiếm quyền tác vụ, cũng không duy trì bộ đếm khả biến thứ hai.

## Vòng đời

Tác vụ thuộc về chủ sở hữu và backend của nó, chứ không thuộc về fiber công cụ sinh ra nó, do đó việc tải lại bên sinh hoặc controller sẽ không dừng tác vụ. Tác vụ đầu tiên của một chủ sở hữu sẽ gắn một effect sẽ được chờ vào scope của đối tượng `Agent` tương ứng. Dispose (giải phóng tài nguyên) của chủ sở hữu sẽ hủy tác vụ của đối tượng đó, chờ bên sinh dừng hẳn, và gỡ bỏ snapshot của nó; id agent (tác tử) hay id session được tái sử dụng không thể chuyển hướng thao tác dọn dẹp cũ.

Dispose của service sẽ đóng listener, hủy mọi tác vụ còn sống, chờ các bản ghi hoàn tất, và tách effect khỏi các scope chủ sở hữu còn sống. Nếu thao tác hủy ném lỗi trong lúc hủy, service sẽ buộc đánh dấu bản ghi là thất bại, và cảnh báo rằng công việc có thể trở thành công việc mồ côi, chứ không bị deadlock. Khi thao tác hủy đã trả về nhưng `done` mãi không kết thúc, hệ thống không thể phân biệt điều này với việc dừng chậm, quá trình hủy có thể vì thế bị đình trệ.

Việc kết thúc tuân theo nguyên tắc kết thúc đầu tiên được ưu tiên: kết quả kết thúc xuất hiện sớm nhất (bên sinh kết thúc, `done` bị reject được xử lý như `failed` biệt lập, hoặc thất bại bị buộc khi hủy) chỉ được ghi một lần, sau đó mới giải phóng bên chờ, rồi mới thông báo listener đúng một lần; lỗi của từng listener được cách ly riêng. Bên chờ đang treo sẽ đánh dấu tác vụ là đã báo cáo trước khi listener chạy, do đó bên báo cáo hoàn tất sẽ không phát thông báo lặp; việc hủy khi hủy service cũng đánh dấu vì cùng lý do: thông báo hướng tới chủ sở hữu đang bị hủy sẽ không có ai đọc. Hoàn tất là điều được công bố sau cùng trong một lần kết thúc, xếp sau việc commit bản ghi và phát hành thay đổi tập hợp có thể nhìn thấy, vì bên báo cáo có thể đồng bộ mở một lượt mô hình, mà mọi observer khác của lần kết thúc đó đều phải đã thấy bản ghi đã kết thúc.

Controller và listener được phân lớp theo scope nơi bên đăng ký nằm, có hình thái nhất quán với registry tools: một lần đăng ký được lưu vào scope của ngữ cảnh đăng ký nó, một lần đọc thì hợp nhất lớp toàn cục với chuỗi scope của chủ sở hữu. Do đó một registry cấp tiến trình có thể trả lời từng câu hỏi theo từng chủ sở hữu — với chủ sở hữu mà tổ hợp của chính nó không gắn controller nào, bất kể các tổ hợp khác gắn bao nhiêu, `start()` sẽ từ chối và ném `background jobs unavailable: no job controller serves this agent (load @deepseek-ai/dsh-tool-jobs in its composition)`; một lần kết thúc cũng chỉ đến được các listener đăng ký trong tổ hợp mà chủ sở hữu của nó thuộc về.

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp thông qua các plugin sinh và [`dsh-tool-jobs`](../tool-jobs/README.md); chúng sẽ trình bày job id, đầu ra, trạng thái, hủy và thông báo hoàn tất.

#### Ảnh hưởng KV Cache

Không trực tiếp gây mất hiệu lực KV Cache; mọi thay đổi tiền tố request do bên tiêu thụ nêu trên chịu trách nhiệm.

## Hạn chế đã biết và công việc hoãn lại

- **Tác vụ chỉ tồn tại cục bộ theo tiến trình**: bản ghi sẽ biến mất khi tiến trình harness kết thúc; thực thi bền vững hoặc xuyên khởi động lại cần một backend riêng triển khai seam này.
- **Việc hủy vô hiệu âm thầm có thể khiến quá trình hủy đình trệ và tiếp tục chiếm dung lượng**: nếu `cancel` trả về nhưng mãi không kết thúc `done`, registry sẽ không thể phân biệt điều này với việc dừng chậm; tác vụ đó sẽ tiếp tục chiếm một chỗ trong bucket suốt phần đời còn lại của service, chỉ có việc ném lỗi tường minh mới có thể an toàn buộc đánh dấu nó là thất bại.
