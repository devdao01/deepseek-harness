# Agent Note: Tác vụ subagent chạy nền

Status: implemented

[English](2026-07-08-background-subagent-tasks.md) | Tiếng Việt

## Vấn đề

[subagent seam](2026-06-21-subagent-capability-seam.md) trả về `SubagentRun`, nhưng tool hướng tới model trước đây thu thập kết quả đồng bộ cho mỗi lần chạy. Do đó, các ủy thác chậm và độc lập với nhau hoặc phải chiếm giữ lời gọi cha liên tục, hoặc phải chạy tuần tự.

subagent cần cùng hành vi khởi động, thu thập, liệt kê, dừng, quy thuộc (attribution), thông báo và dọn dẹp như các tool chạy lâu khác, nhưng không nên dùng ngữ nghĩa stream tiến trình. Sub-session vẫn được ghi log chi tiết; cha chỉ cần câu trả lời cuối cùng và trạng thái tác vụ. Thời gian tồn tại của child chạy nền còn vượt quá lần gọi tool đã khởi động nó, do đó cần làm rõ quy ước hủy và giải phóng tài nguyên của chủ sở hữu (owner).

## Quyết định

Mỗi instance `dsh-tool-subagent` có thể công bố `run_in_background`, được kiểm soát bởi `enableRunInBackground`, và mặc định bật. Instance tắt tính năng này sẽ không có tham số đó, và sẽ từ chối khi bị ép truyền tham số chạy nền lúc thực thi. Việc chọn provider vẫn thuộc về cấu hình triển khai, do đó một instance vẫn chỉ đăng ký một tên tool có thể phân biệt cho một provider.

subagent chạy nền dùng [runtime tác vụ nền tổng quát](../architecture/2026-06-20-generic-long-running-tool-runtime.md). `job_output`, `job_list` và `job_kill` chịu trách nhiệm thu thập, liệt kê, hủy, thông báo hoàn thành và hướng dẫn trong prompt; hệ thống không cung cấp tool đi kèm chuyên dụng cho subagent.

Lời gọi ở foreground giữ nguyên quy ước đồng bộ: chờ provider khởi động và `run.result`; chỉ trả về văn bản cuối cùng khi trạng thái là `completed`; ánh xạ các lý do kết thúc khác thành kết quả tool lỗi; và luôn giải phóng run đó trước khi trả về.

Đối với lời gọi chạy nền, tool xác thực cha, và từ chối tín hiệu thực thi đã bị abort trước khi gọi `ctx.jobs.start()`. Task runtime kiểm tra trước control API và dọn dẹp chủ sở hữu trước khi gọi launcher của producer. Launcher này tạo một `AbortController` độc lập và khởi động `ctx.subagents.start()`; sau khi id được trả về, tín hiệu của lời gọi tool không còn sở hữu child đó nữa.

Việc đăng ký tác vụ ánh xạ subagent seam theo cách sau:

- `kind` là `subagent`, `label` là mô tả do model cung cấp, `owner` là agent cha.
- `cancel(reason?)` hủy controller riêng của tác vụ. Cùng một tín hiệu bao phủ cả phần khởi động provider chưa hoàn tất lẫn phần còn lại của run đã được publish.
- `done` chờ khởi động provider, kết quả child và `run.dispose()`. Run đã hoàn thành trả về văn bản cuối cùng, run đã bị hủy trở thành `killed`, các lý do dừng khác trở thành `failed`. Lỗi khởi động, lỗi kết quả và lỗi giải phóng tài nguyên đều chuyển thành kết quả thất bại, chứ không phải Promise tác vụ bị reject.
- `readOutput` không tồn tại. Trong khi tác vụ còn sống, `job_output` chỉ trả về trạng thái; sau khi settle, nó trả về output cuối cùng theo cách idempotent. Hoạt động trung gian của child vẫn được giữ lại trong sub-session.

## Vòng đời

subagent chạy nền thuộc về agent cha của nó, không tồn tại bền vững sau khi chủ sở hữu đóng lại. Task runtime gắn việc dọn dẹp vào đúng phạm vi của chủ sở hữu tương ứng. Việc giải phóng agent sẽ hủy tác vụ, và chờ rollback khởi động hoặc giải phóng child hoàn tất trước khi `AgentHandle.dispose()` kết thúc, tránh rò rỉ subagent và session.

Thông báo hoàn thành được gửi tới đúng chủ sở hữu đã được ghi nhận lúc khởi động. Nếu quá trình dọn dẹp của chủ sở hữu đã giải phóng đích tiêm (injection target), thông báo đó sẽ bị bỏ; đảm bảo vòng đời là dọn dẹp, không phải thông báo.

## Hướng dẫn cho model

Prompt tác vụ tổng quát dạy model một tập thực hành chung: giữ lại id; tiếp tục làm việc độc lập, thay vì bận chờ (busy-poll); thu thập các tác vụ liên quan trước khi trả lời; kết thúc công việc không liên quan. Schema subagent chỉ bổ sung thêm: chế độ chạy nền trả về job id, và `job_output` dùng để thu thập kết quả. Dù model có tuân theo prompt hay không, việc phân quyền và dọn dẹp theo chủ sở hữu vẫn cưỡng chế ranh giới runtime.

## Phương án thay thế

### Tool wait, output và stop chuyên dụng cho subagent

Tool chuyên biệt theo năng lực sẽ lặp lại giao thức tác vụ, dạy thêm một bộ thói quen thu thập và dừng, và tăng độ phức tạp cho nhiều instance provider. Runtime tổng quát cung cấp hành vi cần thiết mà không thay đổi hình thái tool "mỗi instance ứng với một provider".

### Tồn tại sau khi chủ sở hữu đóng lại

Phương án này cần trạng thái tác vụ bền vững, phục hồi sub-session, kênh giao kết quả trễ, và chính sách xử lý với chủ sở hữu bị bỏ rơi. Việc dọn dẹp có phạm vi là chủ sở hữu định nghĩa rõ vòng đời cho công việc trong tiến trình. Job bền vững cần thiết kế riêng.

### Client cách ly không kiểm tra chủ sở hữu

agent và log có thể có phạm vi là session, nhưng registry tác vụ và id dự đoán được thuộc phạm vi toàn cục runtime. Do đó, tuyến phòng thủ chung về chủ sở hữu áp dụng như nhau cho subagent và mọi producer khác.

### Output transcript child theo kiểu tăng dần (incremental)

Việc stream lịch sử child vào cha theo thời gian thực sẽ làm mờ ranh giới log, và khiến hành vi provider phân hóa. Tool này chỉ công bố output cuối cùng; việc quan sát phong phú hơn nên do session hoặc UI tool đảm nhận.

## Kiểm thử

Unit test bao phủ và khóa cứng: ánh xạ lý do dừng, giải phóng tài nguyên trước khi báo cáo, lỗi khởi động và lỗi kết quả, từ chối tín hiệu đã bị pre-abort, tách tín hiệu khỏi lệnh gọi khởi động, hủy trước và sau khi provider publish, thu thập qua tool tác vụ thực, tuyến phòng thủ kiểm tra trước khi thiếu controller, lỗi thiếu runtime, và công tắc schema theo từng instance. Snapshot bao phủ và khóa cứng schema hướng tới model.

## Ảnh hưởng

Cha có thể phân phát song song các tác vụ ủy thác chậm, và thu thập kết quả qua control tác vụ dùng chung với bash. Công việc của child không còn chiếm giữ lời gọi tool đã khởi động nó, nhưng có thể tiếp tục tiêu tốn tài nguyên cho đến khi được thu thập, kết thúc hoặc chủ sở hữu giải phóng. Hướng dẫn trong prompt khuyến khích việc thu thập; việc dọn dẹp của chủ sở hữu cung cấp ranh giới vòng đời cứng. Các triển khai cần ủy thác đồng bộ có thể tắt chế độ chạy nền theo từng instance tool.
