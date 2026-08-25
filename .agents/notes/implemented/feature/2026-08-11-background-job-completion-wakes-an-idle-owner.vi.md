# Agent Note: Background job completion wakes an idle owner

Status: implemented

[English](2026-08-11-background-job-completion-wakes-an-idle-owner.md) | Tiếng Việt

## Vấn đề

`tool-jobs` hứa với mô hình rằng «khi tác vụ hoàn thành bạn sẽ nhận được thông báo ngay trong phiên — đừng bận rộn polling, cũng đừng sleep để chờ». Lời hứa này chỉ đúng khi mô hình vẫn đang làm việc. Việc hoàn thành được giao qua `agent.inject()`, hàm này chỉ nối thêm vào next-step inbox chứ không giữ chỗ driver, nên tác vụ kết toán sau khi lượt đã kết thúc sẽ để thông báo nằm đó cho tới khi một việc không liên quan nào đó đánh thức agent. Hình thái phổ biến nhất lại đúng là hình thái sẽ hỏng: mô hình khởi động một lệnh chạy dài, báo với người dùng là đã khởi động, kết thúc lượt, rồi lệnh hoàn thành và rơi vào một inbox không có ai nhận. Prompt bảo mô hình đừng polling, rồi chẳng có gì đến cả.

Lỗ hổng này được ghi lại như một hạn chế thay vì được cân nhắc kỹ, nên đường lùi trở thành `job_output(wait: true)` — chính kiểu chờ chặn mà cùng đoạn prompt đó không khuyến khích.

Quyết định này thay thế một sự kiện trong [quyết định runtime tác vụ chạy nền](../architecture/2026-06-20-generic-long-running-tool-runtime.md) — rằng việc hoàn thành không bao giờ đánh thức chủ sở hữu đang rảnh — và bổ sung teardown làm một bên đặt bit `reported`. Note đó vẫn sở hữu toàn bộ các quyết định còn lại về runtime tác vụ, nên nó được cập nhật tại chỗ thay vì bị thay thế.

Cơ chế giao chưa bao giờ là trở ngại. Kể từ [quyết định hợp nhất send](../architecture/2026-07-22-unified-send-and-coalesced-user-messages.md), `Agent.send(message, target, wakeup)` đã phủ ma trận `target` × `wakeup`, và `wakeDriver()` cũng đã xử lý ba pha idle, maintenance và đã hủy nhưng chưa hội tụ. Thứ còn thiếu là lựa chọn chiến lược «một lần hoàn thành đi theo kênh nào», cùng với cái cận mà lựa chọn đó đòi hỏi.

## Quyết định

Việc hoàn thành chưa được báo cáo sẽ chọn kênh theo việc chủ sở hữu lúc đó đang làm gì. Chủ sở hữu đang bận thì đi theo inject, giữ nguyên như cũ. Chủ sở hữu đang rảnh thì được đánh thức bằng `followup()`.

Điều này tiếp nhận quy tắc giao mà [manager kế thừa](2026-08-06-manager-owned-subagent-settlement-delivery.md) đã áp dụng cho việc kết toán subagent, nơi ghi rằng «dùng steer thay vì inject là có chủ đích… đây là một quy tắc đúng đắn, không phải một ưu tiên triển khai». Hai đường không chồng lấn: `tool-subagent` chỉ đăng ký Task cho sub agent chạy nền một lần, còn nhánh continuable đã trả về trước khi chạm tới đoạn mã đó, nên một sub agent được giao đúng bởi một trong hai cơ chế.

### Chủ sở hữu đang bận giữ nguyên inject

Đối với một driver thực sự đang chạy, `steer()` và `inject()` là cùng một lần giao: với pha đang chạy và chưa bị hủy bỏ, `wakeDriver()` sẽ trả về sớm và không đặt latch. Hai hàm chỉ khác nhau ở một loại chủ sở hữu — lượt đã bị hủy nhưng chưa hội tụ, khi đó steer sẽ chuyển hướng sang lượt kế tiếp và phát lại lần đánh thức khi hội tụ.

Ở đó thì inject mới là đúng. Lượt bị hủy nghĩa là người dùng đã bấm dừng, mở lại một lượt thay họ chẳng khác nào rửa một lần ngắt thành một yêu cầu mô hình mà họ không hề đòi hỏi. Trường hợp thông thường đã được vòng lặp lượt phủ: chỉ cần next-step inbox còn nội dung thì lượt không thể kết thúc, nên thông báo đến trước lần kiểm tra đó sẽ kéo dài lượt hiện tại, đồng thời nhiều tác vụ kết toán chỉ tốn một bước chứ không chiếm mỗi tác vụ một lượt.

### Việc đánh thức có cận, và cận đó không phải là thời gian

`maxConsecutiveWakes` (mặc định 3) giới hạn số lượt mà một chủ sở hữu mở ra theo cách này; vượt quá thì thông báo hạ cấp thành inject và chờ lượt kế tiếp. Việc nhận bất kỳ tin nhắn nào do người dùng viết sẽ khôi phục ngân sách — là nhận chứ không phải đến, vì đó mới là thời điểm đầu vào của con người thực sự đi vào một bước. Thông báo do chính plugin này xếp hàng thì không bao giờ nạp lại ngân sách.

Đặt cận là vì chuỗi này tự kích thích, còn kết toán subagent thì không. Kết toán bị giới hạn bởi việc mô hình sinh ra bao nhiêu sub agent; nhưng một lượt được đánh thức lại có thể khởi động một tác vụ chạy nền nào đó, và việc hoàn thành của nó lại đánh thức chính chủ sở hữu ấy, mà không có ai đứng bên cạnh. `dsh run` không cần chiến lược riêng: tin nhắn người dùng duy nhất của nó được nhận ngay ở lượt đầu và không lặp lại, nên ngân sách tiêu hao đơn điệu và tiến trình tất yếu dừng.

`completionDelivery: quiet` khôi phục kênh cũ cho chủ sở hữu đang rảnh. Nó tồn tại vì mục đích transcript tất định, và khớp với công tắc `reportDelivery` của `tool-subagent-report` cả về tên, giá trị lẫn mặc định.

### Việc hủy tự nhận phần báo cáo

`cancelForTeardown` giờ sẽ đánh dấu bản ghi là `reported`, giống hệt điều `kill()` làm sau khi hủy. Khi thông báo chỉ là một lần inject vô hại thì chỗ bất đối xứng này không lộ ra; nhưng một bên báo cáo có khả năng đánh thức sẽ biến nó thành một yêu cầu mô hình cho mỗi tầng teardown, tác động lên chính agent mà host đang chuẩn bị hủy.

`reported` vốn dĩ đã là bit đúng — «kill, read hoặc wait đã báo cáo hoặc đã cam kết báo cáo trạng thái kết thúc» — và teardown là một lần kill không có bên gọi. Dùng nó cho phép mọi quan sát viên của lần kết toán ấy giữ được trọn vẹn: `onJobDone` vẫn kích hoạt, nên các bất biến lúc chạy và đường thất bại cưỡng bức vẫn được phủ, chỉ có bên báo cáo thông báo là im lặng đi.

### Việc hoàn thành được công bố sau cùng

Thời điểm `settle()` giải phóng các bên đang chờ, đánh dấu bản ghi đã kết toán và phát ra thay đổi tập hiển thị trước đây đều xếp **sau** các listener hoàn thành lần chạy. Bên báo cáo mở lượt chạy đồng bộ, nên thứ tự đó khiến `turn/start` của lượt được đánh thức đáp xuống trước cả khi lần kết toán mà nó phản hồi được commit, và cũng trước khi bất kỳ quan sát viên `onJobsChanged` nào nhìn thấy nó. Đưa việc hoàn thành xuống công bố sau cùng khiến bên báo cáo trở thành quan sát viên cuối cùng của lần kết toán đó, còn các quan sát viên khác đều đã nhìn thấy nó trước.

## Các phương án thay thế bị bác bỏ

**Thêm một bit đánh thức do bên sản xuất khai báo trên `JobStart`**, tương ứng với `trigger_turn` của Codex và enum `admission` của Kimi. Xét về lâu dài đây là hình thái tốt hơn — luồng `tail -f` và một bản build hai tiếng muốn những câu trả lời khác nhau — nhưng hiện chưa có bên sản xuất nào cần phân biệt chúng, trong khi repo yêu cầu mặt công khai phải có chủ sở hữu và nhu cầu ở thời điểm hiện tại. Điểm kích hoạt tự nhiên để thêm nó là khi xuất hiện bên sản xuất đầu tiên «muốn một tác vụ đánh thức còn tác vụ khác thì không».

**Một hàng đợi đầu vào không được yêu cầu mang tính tổng quát** kèm kênh ưu tiên, đúng như cách Claude Code dùng để gộp tác vụ chạy nền, cron, MCP push và hook vào cùng một lần xả. Inbox của DSH tự nó chính là hàng đợi đó — splice `agent/inbox/spliced` bền vững nằm trên `next-turn`/`next-step` — nên làm vậy chẳng khác nào thêm một tầng nữa lên tầng sẵn có, chỉ để quyết định một bit.

**Từ chối mở lại một lượt đã sinh ra câu trả lời hiển thị**, tức latch `MailboxDeliveryPhase` của Codex. Latch đó chính là giá trị mặc định mà quyết định này cố ý đảo ngược: đánh thức mô hình sau khi nó đã nói xong chính là toàn bộ ý nghĩa của tính năng này, còn cận thì do ngân sách đánh thức gánh.

**Thêm một cửa sổ đồng hồ tường lên trên phép đếm.** Với một agent tương tác, chính trường hợp chậm mới là điều mong muốn — một bản build kéo dài một tiếng kết thúc, agent làm tiếp, đó chính là bản thân tính năng — còn `dsh run` thì đã bị chặn trên bởi phép đếm mà nó không thể nạp lại. Chỉ khi xuất hiện triển khai vòng đời dài không có người trực thì mới đáng xem xét lại.

**Ức chế toàn bộ `onJobDone` trong lúc owner xả**, đối xứng với `listenersClosed` ở mức service. Cách này đọc thì gọn hơn, nhưng sẽ lấy đi một tín hiệu phục vụ nhiều thứ chứ không chỉ thông báo: bản ghi thất bại cưỡng bức và các bất biến lúc chạy đều quan sát kết toán teardown. Bit `reported` chỉ phủ quyết đúng bên báo cáo, không phủ quyết bất cứ thứ gì khác.

## Ảnh hưởng

- Hành vi mặc định thay đổi: chủ sở hữu đang rảnh giờ sẽ tốn một yêu cầu mô hình cho mỗi lần hoàn thành, bị chặn trên bởi `maxConsecutiveWakes` theo từng chủ sở hữu, giữa hai tin nhắn người dùng. Triển khai nào muốn hành vi cũ thì đặt `completionDelivery: quiet`.
- Đoạn prompt của `tool-jobs` không cần sửa; «khi tác vụ hoàn thành bạn sẽ nhận được thông báo ngay trong phiên» từ một viễn cảnh đã trở thành sự thật.
- `JobSnapshot.reported` có thêm teardown làm bên đặt bit thứ tư, được ghi trong Service Definition và [tài liệu tham chiếu hệ thống con](../../../../docs/subsystems/jobs.md).
- `settle()` chỉ công bố việc hoàn thành sau khi đã commit bản ghi và phát ra thay đổi tập hiển thị. Bất kỳ listener nào dựa vào việc «chạy trước khi giải phóng bên đang chờ hoặc trước `onJobsChanged`» giờ đều xếp sau cả hai.
- Test real-composition của `tool-bash` đã bỏ tin nhắn người dùng thứ hai: chỉ riêng kết toán đã đủ đưa thông báo vào một lượt thu thập đầu ra. Nó khẳng định kết quả bền vững chứ không phải ranh giới lượt, vì việc lệnh có sống lâu hơn lượt của nó hay không là một cuộc đua; lựa chọn kênh được chuyển sang cho unit test của `tool-jobs` cố định.
- Độ phủ unit cố định: đánh thức khi rảnh, inject khi bận, giao ở chế độ quiet, ngân sách cạn, đầu vào người dùng khôi phục ngân sách, thông báo của plugin không khôi phục ngân sách, và teardown im lặng.

### Rủi ro đã chấp nhận

Ngân sách đã tiêu chỉ được khôi phục bởi đầu vào của người dùng. Một agent không người trực đã cạn ngân sách sẽ phải chờ tới khi có nguyên nhân khác mở lượt mới thu được các thông báo còn lại, và trong thời gian đó không có cơ chế nào nạp lại năng lượng cho nó.

Ở chế độ `quiet`, thông báo đang chờ nhận ở một chủ sở hữu đang rảnh vẫn sẽ mất đi khi chủ sở hữu đó được giải phóng, giống như trước: việc hủy lúc giải phóng sẽ dọn sạch inbox chưa được nhận, còn log giữ lại cặp chèn/hủy làm bản ghi. [Note về việc giao kết toán](2026-08-06-manager-owned-subagent-settlement-delivery.md) chứa phần thảo luận về hộp thư ngoại tuyến cần thiết cho việc này.

Với tác vụ ngắn ngày, việc hoàn thành rốt cuộc kéo dài lượt đang chạy hay mở một lượt mới là một cuộc đua thực sự, nên không bản transcript viết sẵn nào chứa được cả hai thứ tự cùng lúc. Độ phủ ở trạng thái lắp ráp khẳng định kết quả; lựa chọn kênh do unit test cố định.

Vẫn còn sót lại một cửa sổ microtask: nếu kết toán rơi vào sau lần cuối vòng lặp lượt kiểm tra inbox nhưng trước khi driver commit pha idle, nó vẫn đọc được `status === 'running'`, nên đi theo inject và không có ai đánh thức. Chuyển sang steer cũng không bịt được — `wakeDriver()` chỉ đặt latch cho pha maintenance và pha sau khi hủy, chứ không đặt cho driver ở giai đoạn «giữa lần kiểm tra cuối và lúc tự nghỉ». Muốn bịt nó thì cần `agent-loop` công bố trạng thái nghỉ trước cả lần nhận cuối cùng, mà đó thuộc quyết định của agent lõi chứ không phải chiến lược giao.
