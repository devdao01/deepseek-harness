# Agent Note: bash bền vững giữ nguyên prompt được kiểm soát của backend

Status: implemented

[English](2026-08-15-persistent-bash-keeps-controlled-prompt.md) | Tiếng Việt

## Problem

`dsh-tool-bash-persistent` khởi tạo shell của nó bằng `stty -echo; PS1='__DSH_PERSISTENT_BASH_PROMPT__ '`, ghi đè lên `PS1` mà `dsh-terminal-bash` đã thiết lập trong môi trường spawn. Việc phát hiện prompt sẵn sàng của backend yêu cầu phần đuôi có thể in được sau nhãn OSC `133;D` phải khớp hoàn toàn với prompt được kiểm soát ([thiết kế](../feature/2026-07-16-persistent-pty-sessions.md)), nên sau khi khởi tạo, bất kỳ lệnh send nào cũng không thể quyết toán qua đường này. `PROMPT_COMMAND` không bị ghi đè, nhãn vẫn tiếp tục đến, nên mỗi lần send phải trả cả lớp im lặng cộng thêm grace period bàn giao — với giá trị mặc định production là 3.5 giây mỗi lần gọi tool; lần gọi đầu tiên là 7.2 giây vì send khởi tạo cũng bị suy giảm tương tự; sau mỗi lệnh dài còn phải đợi thêm 3.5 giây. macOS không có lớp chờ stdin chính xác, còn phép dò chính xác trên Linux không thể quan sát được lệnh thoát khỏi trạng thái chờ stdin của nó trong một chu kỳ polling, nên sự suy giảm này thực tế bao phủ gần như mọi lần gọi. Test trong package cấu hình `idleSilenceMs` là 100 mili giây, che khuất vấn đề này.

Việc ghi đè này tồn tại nhằm cho tool một prompt đã biết trước, phục vụ hai nơi tiêu thụ: dùng hậu tố viewport để phát hiện trường hợp dự phòng "shell đã quay về prompt nhưng không có nhãn kết thúc", và làm đẹp bằng cách cắt bỏ văn bản prompt khỏi output từng phần.

## Decision

Backend sở hữu giao thức prompt của riêng nó và tự sửa: `PROMPT_COMMAND` được kiểm soát sẽ đặt lại `PS1` sau khi in nhãn, nên bất kỳ việc ghi đè prompt nào bên trong shell — khởi tạo trước đây của tool này, lệnh của model, script được source — cũng không sống sót được đến prompt tiếp theo. Điều này đồng thời bảo vệ các provider không thể báo cáo trạng thái foreground: ở đó, văn bản prompt chính xác là bằng chứng sẵn sàng duy nhất.

Tool không còn ghi đè `PS1` nữa (khởi tạo chỉ còn `stty -echo`), và thay thế phương án dự phòng dùng hậu tố viewport bằng tín hiệu sẵn có của seam: một lần send quyết toán bằng `stdin_read` mà không có nhãn kết thúc trong scrollback sẽ trả về output từng phần đã bắt được. Hằng số prompt riêng và logic cắt bỏ của nó đã bị xóa; output từng phần giờ có thể kết thúc bằng văn bản prompt của chính backend, và tool không thể cũng không nên biết văn bản đó là gì.

## Alternatives considered

**Chỉ sửa tool, không động vào `PROMPT_COMMAND`.** Bị từ chối: seam vẫn mong manh trong im lặng — sau này bất kỳ bên tiêu thụ hoặc lệnh model nào đụng vào `PS1` cũng sẽ tái tạo lại sự suy giảm 3.5 giây mà không có tín hiệu thất bại, và các provider không có kiểm tra foreground sẽ mất đi yếu tố sẵn sàng duy nhất.

**Đưa prompt được kiểm soát vào tool.** Bị từ chối: prompt là hằng số giao thức của một provider cụ thể; nếu Consumer khớp nó thì sẽ ghép cứng tool với `dsh-terminal-bash`, đổi sang bất kỳ backend nào khác sẽ lại hỏng.

**Bỏ yếu tố văn bản prompt khỏi việc phát hiện sẵn sàng của backend.** Bị từ chối: đối với provider mà `inspectForeground` không thể báo cáo được bất kỳ thông tin nào, nhãn cộng văn bản là biện pháp phòng thủ chống lại "chuỗi nhãn OSC gốc bị nhúng trong output của lệnh"; làm yếu nó là đánh đổi rủi ro quyết toán sai lấy đường nhanh.

**Tăng `handoffGraceMs`/`idleSilenceMs` thay vào đó.** Bị từ chối: bất kỳ giá trị im lặng nào cũng không sửa được đường nhanh đã chết, chỉ là phân bổ lại xem mỗi lần gọi phải trả thêm bao nhiêu.

## Consequences

Thực đo trên darwin với giá trị mặc định production: khi prompt được kiểm soát còn nguyên vẹn, send trần quyết toán trong khoảng 86 mili giây, khi bị ghi đè là khoảng 3540 mili giây; các lần gọi tool giảm từ 7180/3560/3566 mili giây (spawn+init+echo, echo, pwd) xuống còn 355/88/91 mili giây.

Phương án dự phòng `stdin_read` là hành vi chứ không chỉ là làm đẹp: sau `exec`, ngắt, hoặc child process foreground tương tác mà provider có thể chứng minh trạng thái chờ stdin của nó (lớp chính xác trên Linux), lệnh gọi giờ trả về output từng phần đã bắt được thay vì chạy không tải đến hết hạn lệnh. Khi không có provider nào chứng minh được trạng thái chờ đó (macOS), child process tương tác vẫn chạy tới `timeoutMs` — đây là giới hạn đã biết, được ghi trong README của tool. Output từng phần có thể mang theo prompt đuôi của backend; output đầy đủ được nhãn giới hạn vẫn giống hệt từng byte như trước, được xác nhận bởi snapshot jsonrpc-agent không cần khóa API.

Bộ suite tổ hợp của loader giờ đặt `idleSilenceMs` cao hơn giới hạn send, im lặng không thể quyết toán bất kỳ send nào, một khi prompt sẵn sàng quay trở lại, mọi test case sẽ thất bại; một test case PTY thật ghi đè `PS1` bên trong shell, và yêu cầu lần send tiếp theo phải quyết toán bằng `stdin_read` với prompt đã được sửa lại. Cơ chế tự sửa không thể sống sót sau các lệnh mà bản thân `PROMPT_COMMAND` bị ghi đè; ở đó lớp im lặng vẫn là ranh giới, nhất quán với thiết kế trước đây.
