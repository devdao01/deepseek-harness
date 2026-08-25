# Agent Note: Văn bản của hàng lệnh do hàng và handler chịu trách nhiệm riêng rẽ

Status: implemented

[English](2026-07-30-command-row-copy-contract.md) | Tiếng Việt

## Vấn đề

Hàng lệnh trên Web được render thành `tiêu đề · tóm tắt` từ một cặp [sự kiện vòng đời lệnh](../../proposed/architecture/2026-07-27-session-projection-and-command-log.md) đã lưu: tiêu đề là dòng lệnh phân phối được tái dựng từ `command/run` (`/permission workspace-write`), còn tóm tắt là `text` nguyên trạng của `command/done` (`Permission preset: workspace-write.`). Hai nửa được viết riêng và không biết gì về nhau, nên trên cùng một hàng, tên lệnh xuất hiện hai lần và tham số cũng xuất hiện hai lần — trường hợp tệ nhất chính là hàng mà người dùng nhận được mỗi lần đổi quyền bằng Access chip.

## Quyết định

Trách nhiệm của hai nửa trong hàng lệnh không chồng lấn nhau, mỗi bên chỉ viết đúng phần của mình.

Tiêu đề hàng chính là tên lệnh trần — không có `/`, cũng không có tham số. `/` thuộc về cú pháp nhập liệu của trình soạn thảo, không thuộc về một bản ghi đã chốt; tham số cũng không nên do hàng này báo cáo: phần tóm tắt đã nói rõ lệnh này làm gì. Với các node xuyên cửa sổ mà trang chứa `command/run` đã trượt khỏi cửa sổ của client, `GenericCommandCard` vẫn giữ tiêu đề dự phòng `lệnh`.

Vì vậy, `text` chốt của handler lệnh tuyệt đối không dùng chính tên lệnh để gắn nhãn cho giá trị của nó — giao diện render nó đã nói điều đó một lần rồi. `/permission` trả về `preset workspace-write`, khi gọi trần thì trả về `current preset workspace-write (available: …)`, còn khi tham số không hợp lệ thì trả về `unknown preset "bogus" (available: …)`. Đọc như một hàng thì là `permission · preset workspace-write`; đọc như một câu độc lập — TUI nối chính đoạn text đó vào như một thông báo — nó vẫn nói rõ preset nào đang có hiệu lực.

Quy tắc này cấm *nhãn*, chứ không cấm từ ngữ. `Permission preset: workspace-write.` bị loại là vì `Permission preset:` là một đề mục đặt trước một giá trị, mà chính đề mục đó lại là tiêu đề. Danh từ thuộc miền nghiệp vụ tình cờ chứa tên lệnh thì không phải đề mục, nên được giữ lại: `/plan` vẫn trả về `Plan mode off.` và `Plan mode on. Use /plan off to leave.` (`plan · Plan mode off.` đang nói về chế độ đó, phần cuối câu là một chỉ dẫn, không phải tiếng vọng), `/goal` vẫn trả về `Goal cleared.`. Thứ thực sự bị quy tắc này chặn lại là loại handler viết `<tên lệnh> <danh từ>:` ngay trước giá trị của chính mình.

Bản thân log không đổi: `command/run` vẫn giữ nguyên cách tách `name`/`args` có cấu trúc, nên những hàng lệnh đã đăng ký phong phú hơn vẫn có thể render tham số từ cùng một node mà không cần kênh dữ liệu thứ hai.

## Các phương án đã cân nhắc

**Giữ dòng lệnh phân phối làm tiêu đề, chỉ rút ngắn văn bản chốt.** Tham số vẫn xuất hiện ở cả hai phía dấu phân cách (`permission workspace-write · preset workspace-write`), mà đó đúng là phần trùng lặp đã bị chỉ ra.

**Bỏ văn bản chốt khỏi hàng thu gọn thay vì bỏ tham số.** Cách này đảo ngược giá trị của hàng: bản ghi bền vững tồn tại chính là vì kết quả, và khi đó văn bản lỗi sẽ không còn chỗ đứng.

**Để hàng này tự cắt bỏ tên lệnh ở đầu văn bản chốt.** Tầng trình bày sẽ âm thầm viết lại văn bản do handler soạn ra, và bất kỳ handler nào diễn đạt kết quả theo cách khác đều làm cho suy đoán này thất bại.

**Cấm tuyệt đối tên lệnh xuất hiện trong văn bản chốt của chính nó, đồng thời viết lại cả `/plan` và `/goal`.** Lệnh cấm rộng hơn này có cái giá lớn hơn lợi ích: dù nằm trên hàng hay đứng riêng như một thông báo TUI, `Plan mode off.` và `Goal cleared.` đều là câu diễn đạt rõ ràng nhất cho các kết quả đó, còn dạng rút gọn cần để thỏa mãn quy tắc "cấm tên" (`off.`, `cleared.`) thì đọc lên chỉ là câu cụt. Phần dư thừa đáng bỏ chính là đề mục.

## Hậu quả

Mỗi hàng lệnh đều ngắn lại, và quy tắc này có khả năng mở rộng: tác giả của lệnh mới viết kết quả mà không cần biết giao diện nào render nó, và không giao diện nào phải khử trùng lặp nữa. Cái giá là tham số phân phối rời khỏi hàng thu gọn — khi lệnh còn đang chạy, trên hàng chỉ có tên và `đang chạy…` — cùng với việc quy tắc "không gắn đề mục" là một thỏa thuận được thực thi bằng review chứ không phải bằng cổng kiểm tra. Văn bản của `/permission` được ghim bởi test lệnh của package permission, còn văn bản hàng sau khi lắp ráp được ghim bởi đầu ra kỳ vọng web [seeded-history](../../../../apps/web/tests/snapshots/seeded-history/command-row.expected.md): vì `/permission` chạy hoàn toàn trên host, đầu ra kỳ vọng này phủ được một hàng lệnh đã chốt thật mà không cần khóa API.
