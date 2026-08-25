# Agent Note: Giới hạn số lượng job chạy nền được nhận vào

Status: implemented

[English](2026-08-11-bounded-background-job-admission.md) | 中文

## Vấn đề

Model có thể khởi động Bash, PowerShell, thao tác PTY chạy nền và subagent one-shot qua nhiều tool call và lượt kế tiếp khác nhau. `maxParallelToolCalls` của agent loop chỉ giới hạn số lời gọi chưa trả về trong một bước; mỗi producer chạy nền trả về job id ngay lập tức, nên việc khởi động lặp lại có thể khiến số tiến trình hoặc sub-work còn sống tăng vô hạn.

Registry task trong tiến trình đã có sẵn owner chính xác của từng task và trạng thái lifecycle có thẩm quyền, nhưng lịch sử kết thúc và bản ghi thời gian thực được lưu chung, và không có admission policy (chính sách nhận vào). Việc giải phóng dung lượng ngay khi request hủy cũng không đúng: producer đang ở trạng thái `stopping` vẫn có thể còn giữ tiến trình, PTY hoặc sub-task cho đến khi `JobHooks.done` settle xong.

## Quyết định

`LocalJobRegistry` sở hữu trường cấu hình `maxConcurrentJobsPerOwner`. Nó chỉ chấp nhận số nguyên dương an toàn, mặc định là `10`, và được cung cấp qua schema Cordis của Service Provider, gói bundle `agent-spine-demo` đã định kiểu và cấu hình ứng dụng ACP. Bundle chỉ truyền tải giá trị này; ý nghĩa của nó thuộc về Service Provider trong tiến trình.

[Quyết định về runtime task chạy dài tổng quát](../architecture/2026-06-20-generic-long-running-tool-runtime.md) sở hữu lifecycle Task dùng chung và API điều khiển; note này chỉ sở hữu admission policy trong tiến trình.

`start()` thực hiện admission sau khi kiểm tra controller task hiện có, các trường task và owner còn sống, trước khi gọi `JobStart.run()`. Nó suy ra số lượng đang hoạt động từ chính bản ghi hiện tại của registry, không lưu thêm một bộ đếm khác:

| Bản ghi | Chiếm dung lượng | Sự kiện giải phóng |
|---|---:|---|
| `running` | Có | Producer settle `done` |
| `stopping` | Có | Producer settle `done` |
| `completed`, `killed` hoặc `failed` | Không | Đã kết thúc |

Task có owner được phân nhóm theo đúng identity object `Agent`, khớp với việc dọn dẹp theo owner. Agent thay thế dùng lại cùng session id sẽ nhận một nhóm riêng. Task không có owner dùng chung một nhóm cấp dịch vụ, nên việc bỏ owner không thể trở thành đường vòng không giới hạn.

Khi nhóm đã đầy, `start()` sẽ throw exception trước khi producer thực thi và trước khi id job được cấp phát. Thông tin chẩn đoán bao gồm giới hạn hiện tại, và hướng dẫn model dùng `job_kill`, hoặc chờ task dừng hẳn rồi thử lại. Việc từ chối không tạo ra resource thực thi, mục xếp hàng, chỗ dự trữ hay bản ghi task công khai; lần khởi động thành công tiếp theo vẫn nhận đúng id kế tiếp tăng bình thường theo từng kind.

Việc giải phóng theo owner và theo dịch vụ giữ nguyên thứ tự sẵn có: request hủy, tiếp tục giữ chỗ `stopping` trong lúc producer giải phóng tài nguyên, chờ settle, rồi mới gỡ bản ghi. Vì vậy admission policy tuân theo đúng sự thật lifecycle mà việc đọc, thông báo và dọn dẹp cùng dùng chung, chứ không nhầm request hủy với việc giải phóng tài nguyên.

Sub agent chạy nền có thể tiếp tục vẫn chưa nằm trong ngân sách này. Chúng có child session lưu bền vững và Activation thời gian thực, chứ không phải bản ghi Task; giới hạn chúng cần một quy ước kết quả người dùng và lifecycle riêng. Quyết định này cũng không thêm snapshot Task, log phiên, wire, lưu bền vững, ngân sách CPU hoặc bộ nhớ cấp tiến trình, hàng đợi, ưu tiên, preemption hay tự động kết thúc task cũ nhất.

## Xác nhận

Test Service Provider của task bao phủ giới hạn mặc định và tường minh, việc từ chối trước khi producer thực thi, bộ đếm id không đổi, việc giữ chỗ `stopping`, việc giải phóng ở mỗi trạng thái kết thúc, cô lập theo owner chính xác, đối tượng thay thế cùng phiên, nhóm không-owner dùng chung, cấu hình không hợp lệ, dọn dẹp theo owner và tháo dỡ dịch vụ. Test bundle spine và ACP chốt việc chuyển tiếp đã định kiểu. Một bản replay ACP không cần key khởi động bản lắp ráp Loader thật với giới hạn bằng 1, khởi động một tiến trình Bash chạy nền thật, quan sát lần khởi động thứ hai trả về lỗi có thể hành động, dừng task đầu tiên theo job id trả về, và xác minh file đánh dấu của producer bị từ chối chưa bao giờ được tạo ra.

## Các phương án thay thế đã từng cân nhắc

**Dựa vào `maxParallelToolCalls`.** Bị bác bỏ, vì tool call chạy nền sẽ giải phóng chỗ trong bước ngay khi trả về job id; setting này không thể giới hạn công việc vẫn tiếp tục sống qua các bước và lượt sau đó.

**Giải phóng dung lượng khi `job_kill` thành công.** Bị bác bỏ, vì việc hủy thành công chỉ chuyển task sang `stopping`. Producer vẫn có thể giữ tài nguyên cho đến khi settle `done`, việc nhận task thay thế ngay lập tức sẽ vượt quá giới hạn tài nguyên thời gian thực đã cấu hình.

**Dùng một nhóm cấp tiến trình toàn cục.** Bị bác bỏ, vì một agent bận rộn sẽ từ chối các phiên không liên quan, còn công việc host không có owner vẫn cần một nhóm giới hạn rõ ràng riêng. Danh tính owner chính xác đã định nghĩa sẵn lifecycle dọn dẹp, và cung cấp đúng cách phân vùng.

**Xếp hàng, preemption hoặc kết thúc task cũ nhất.** Bị bác bỏ, vì mỗi chính sách đều thêm thứ tự, quyền sở hữu và hành vi hủy vượt quá yêu cầu giới hạn fail-closed. Việc từ chối tường minh để model tự quyết định công việc nào không còn cần thiết thông qua `job_kill` sẵn có.

**Duy trì một bảng đếm hoạt động có thể thay đổi.** Bị bác bỏ, vì registry đã lưu bản ghi và trạng thái có thẩm quyền. Một bộ đếm thứ hai sẽ cần đồng bộ rollback và settle, mà vẫn không cung cấp được kết quả người dùng vốn còn thiếu từ việc suy ra trực tiếp.

## Hệ quả

Một owner chính xác duy nhất không còn có thể tạo vô hạn tài nguyên thời gian thực do Task nắm giữ, còn owner không liên quan vẫn giữ hạn mức riêng. Việc dừng chậm sẽ khiến nhóm giữ nguyên trạng thái đầy cho đến khi settle `done`, đây là hành vi cố ý: giá trị cấu hình giới hạn công việc vẫn có thể còn giữ tài nguyên, chứ không phải giới hạn request hủy. Nếu `cancel` của producer trả về nhưng không bao giờ settle `done`, nó sẽ tiếp tục chiếm một chỗ trong suốt phần đời còn lại của dịch vụ và chặn việc tháo dỡ, vì registry không thể suy đoán an toàn rằng tài nguyên đã được giải phóng.

Mỗi lần khởi động đều quét registry trong tiến trình. Chi phí tăng theo lịch sử Task được giữ lại; chấp nhận cái giá này để duy trì một nguồn trạng thái có thẩm quyền duy nhất, và tận dụng giá trị mặc định nhỏ đủ để giới hạn tập hợp thời gian thực thông thường. Lịch sử kết thúc vẫn có thể dùng cho việc đọc và liệt kê sẵn có, nhưng không tiêu tốn dung lượng.
