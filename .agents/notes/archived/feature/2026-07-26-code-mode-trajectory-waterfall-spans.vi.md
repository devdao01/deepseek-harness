# Agent Note: Sub-call của Code Mode trong view trajectory và waterfall

Status: implemented

Archived: 2026-07-28

[English](2026-07-26-code-mode-trajectory-waterfall-spans.md) | 中文

> Phạm vi: PR (Pull Request) cuối cùng trong chuỗi PR chồng (stack) của Code Mode UI, bao phủ việc render phân phối con trong hai view không phải chat. Việc lồng nhau trong chat thuộc về [Agent Note hàng sub-call](2026-07-26-code-mode-chat-subcall-rows.md); dữ liệu thời gian mà bài này tiêu thụ chính là cặp sự kiện start/settle của [Agent Note song song thời gian thực](2026-07-26-code-mode-live-parallel-dispatch.md).

## 问题

Trước đây trajectory vẫn render một lượt `run_code` thành một ô Tool duy nhất mờ đục, còn waterfall thì render thành một thanh đếm node. View chat đã có được hàng con lồng nhau trong vài PR trước đó, nhưng hai view phân tích này (mà toàn bộ ý nghĩa của chúng chính là cấu trúc và thời gian) trước đây không hiển thị bất kỳ cấu trúc sub-call nào, cũng không hiển thị thời gian đồng hồ tường theo từng sub-call của cặp sự kiện phân phối mà nay đã được ghi log. Span sub-call của waterfall từng bị cố ý trì hoãn cho đến khi cặp sự kiện đó tồn tại: một span không có thời gian thật thì chính là đang nói dối.

## 决策

**trajectory: ô `subtool` xen vào sau ô Tool cha của nó. waterfall: sub-lane (làn con) có thời gian thật, nằm dưới hàng lượt sở hữu nó.**

- **trajectory**: layout fold nhận chỉ mục `codeDispatches` của snapshot; hễ ô Tool nào có phân phối dưới tên `callId` của nó (lệnh gọi trong khối assistant, kết quả mồ côi và lệnh gọi đang chạy đều được đối xử như nhau), fold sẽ xen vào sau ô đó một ô `subtool` cho mỗi phân phối con theo thứ tự khởi động, chỉ mục được đánh số liên tục xuyên suốt chuỗi xen kẽ. Thời lượng của sub-call đã hoàn tất đến từ cặp sự kiện start/settle của nó (`durationSeconds(sub.time, sub.callTime)`); sub-call đang chạy hiển thị dấu gạch ngang, hoàn toàn nhất quán với quy ước đang tiến hành có sẵn. Loại ô mới có nhãn `Sub` (tông màu business) và thụt lề 28px, quan hệ lồng nhau nhìn là thấy rõ.
- **waterfall**: `deriveSubSpans` gấp chỉ mục phân phối thành các lane theo từng lượt có thời gian thật: cửa sổ phân phối của mỗi lệnh gọi cha là từ start đầu tiên → settle cuối cùng, offset/chiều rộng của mỗi lane chính là tỷ lệ của nó trong cửa sổ đó, do đó các sub-call song song (PR3) sẽ chồng lấn có thể quan sát bằng mắt thường. Mỗi lane mang một nhãn nguồn `timing`: `measured` (đã quan sát được cặp sự kiện), `running` (chưa có settle — kéo dài đến cuối cửa sổ với độ mờ thấp hơn), hoặc `unknown` (cửa sổ replay chỉ có settle, `callTime: null` — vẽ rỗng và dùng "duration unknown" làm tiêu đề khi hover, tuyệt đối không giả mạo thành 0 ms). Lane được vẽ dưới hàng thanh của lượt sở hữu nó, và co giãn vào trong ngân sách lane cố định.
- Cả hai view đều đọc `codeDispatches` qua hook snapshot tiêu chuẩn: không có dữ liệu wire mới, cũng không có store mới; việc render khi replay được cấu trúc đảm bảo hoàn toàn nhất quán với thời gian thực.

## 曾考虑的替代方案

**Gấp sub-call vào số đếm node của span lượt (thêm trọng số vào thanh có sẵn).** Bác bỏ: nó che giấu chính cái cấu trúc mà chuỗi PR chồng này tồn tại để hiển thị, hơn nữa việc thêm trọng số vào số đếm node vốn đã được đánh dấu là placeholder (sổ nợ chênh lệch #3).

**Dùng panel sub-call chuyên dụng thay cho việc lồng nhau trong view.** Bác bỏ: UX đã chốt của chuỗi PR chồng này là lồng nhau ở khắp mọi nơi bên dưới cấp cha; một panel độc lập sẽ lệch khỏi chat, và còn khiến việc nối dây chọn lựa tăng gấp đôi.

**Trì hoãn lane waterfall đến khi thiết kế lại lane thời lượng của P-III.** Bác bỏ: thời gian của sub-lane nay đã là thật (chính là cặp sự kiện đó), còn việc render theo tỷ lệ cửa sổ không liên quan đến hình thái tương lai của lane cấp lượt; trì hoãn chỉ khiến lợi ích về thời gian của chuỗi PR chồng này bị mắc kẹt.

## 后果

waterfall mang theo phần render thời gian đồng hồ tường thật đầu tiên trong client (thanh lượt vẫn là placeholder đếm node; sự tương phản này là cố ý và được đánh dấu bằng tiêu đề khi hover). Chỉ mục ô của trajectory nay đã tính cả sub-call, do đó tổng `#N` trên các lượt Code Mode sẽ tăng theo. Spec chốt thứ tự xen kẽ và thời lượng, nhánh gạch ngang khi đang chạy, tỷ lệ cửa sổ (offset/chiều rộng), việc kéo dài của lane đang chạy, lane thời gian unknown (chỉ có settle), cũng như các lane thực sự được render dưới hàng lượt; bản chụp nhanh fixture Code Mode cấp artifact xây dựng chốt riêng phần render đã lắp ráp của cả hai tab (ô con với thời lượng thật +0.8s, lane measured).
