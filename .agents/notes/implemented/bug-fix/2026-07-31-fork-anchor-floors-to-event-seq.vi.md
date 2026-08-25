# Agent Note: neo fork được làm tròn xuống thành seq của sự kiện

Status: implemented

[English](2026-07-31-fork-anchor-floors-to-event-seq.md) | Tiếng Việt

## Vấn đề

Bấm fork trên một message của assistant đã bị dừng thì chẳng có phản ứng gì — không có session con, không báo lỗi, cũng không có thay đổi nào nhìn thấy được.

Node bị đóng băng nằm sau message này không phải là một sự kiện trong log. Cả projection thời gian thực lẫn phát lại lịch sử đều dùng tọa độ sắp xếp `turnEnd.seq - 0.9` để sinh ra nó, khiến nó nằm nghiêm ngặt sau mọi sự kiện của lượt bị ngắt và trước lượt kế tiếp, còn view chat thì đưa nguyên seq của node này cho lối vào fork. `session.fork` trên wire chỉ nhận số nguyên không âm, nên neo dạng phân số bị coi là invalid-params trước cả khi tới host, mà lời gọi fork ở lối vào chat lại nuốt mất thất bại. Thế là bị từ chối và nút hỏng trông y hệt nhau.

Quy tắc cắt của host chưa bao giờ là trở ngại. Lượt bị hủy vẫn ghi một `turn/end` với reason là `aborted`, nó là một tiền tố hoàn chỉnh có thể cắt được như mọi lượt khác — chỉ là cái neo không hề được gửi tới.

## Quyết định

`SessionRuntime.fork` làm tròn xuống `atSeq` trước khi phát RPC. Quy ước seq dạng phân số thuộc về `dsh-client-runtime`, cả projection thời gian thực lẫn projection phát lại đều do nó sinh ra, nên cũng chính package đó đổi ngược về seq sự kiện thật khi bước qua ranh giới wire, thay vì bắt từng bên gọi UI phải tự nhớ chuyển đổi. Neo dạng số nguyên không bị ảnh hưởng.

Việc làm tròn xuống rơi vào đúng lượt chứa cái neo, không lùi lại: mỗi lượt đều bắt đầu bằng `turn/start`, nên `turnEnd.seq - 1` không thể là `turn/end` của lượt trước. Host sau đó chốt theo quy tắc «`turn/end` đầu tiên nằm tại hoặc sau cái neo», trúng đúng lượt mà người đọc đã bấm, khớp với ngữ nghĩa trọn-lượt mà nút fork cấp message vẫn luôn hứa hẹn trên các lượt đã hoàn tất.

Ca kiểm thử fork của apiproxy cố định quy ước ở phía host: một neo đã làm tròn nằm trong lượt bị hủy sẽ cắt xuyên qua lượt đó và gieo nó vào session con.

## Phương án thay thế

**Cho wire chấp nhận `atSeq` dạng phân số.** Bác bỏ: quy ước của host cần seq của sự kiện, chứ không phải một vị trí nào đó trên tọa độ liên tục; dạng phân số chỉ là quy ước render của một client cụ thể, và một khi cho qua, `atSeq` sẽ thành trường duy nhất chịu đựng số không nguyên trong tất cả payload mang seq.

**Ẩn nút fork trên các message đã bị ngắt.** Bác bỏ: rẽ nhánh từ đúng lượt mà người đọc chủ động chặn lại chính là một trong những tình huống cần fork nhất, còn khả năng này ở phía host vốn vẫn luôn hoạt động tốt.

**Làm tròn trong adapter `forkAt` ở lối vào chat.** Bác bỏ: `ui-conversation` chỉ là bên tiêu thụ quy ước phân số chứ không sở hữu nó; bất kỳ lối vào fork thứ hai nào trong tương lai cũng sẽ phải tự khám phá lại đúng phép chuyển đổi ấy.

## Ảnh hưởng

Fork từ một lượt đã dừng sẽ cho ra một session con được gieo bằng phần cắt tới `turn/end` của lượt đó. Đoạn text dở dang bị đóng băng được dựng lại từ các sự kiện chunk và chưa bao giờ trở thành `assistant/message`, nên nó không vào ngữ cảnh model của session con — hệt như khi session nguồn được khôi phục thì nó cũng không vào, session con nhận đúng ngữ cảnh giống session nguồn.

Thất bại khi fork ở lối vào chat vẫn im lặng. Bug này sống sót đến giờ chính vì điểm gọi đó vứt bỏ rejection của mình; còn việc hiển thị lỗi fork lên UI là một chuyện khác.
