# Agent Note: Ghi lại hoạt động cuối cùng trong index phiên

Status: proposed

[English](2026-07-29-durable-last-activity-index.md) | 中文

## Vấn đề

Một phiên nguội (đã bền vững hóa, chưa attach) không có câu trả lời đã lưu trữ có thẩm quyền cho câu hỏi "lần cuối người dùng phát prompt ở đây là khi nào". `dsh-host-apiproxy` cung cấp `updatedAt` từ `lastPromptAt` của projection cache tùy chọn, khi thiếu thì fallback về `createdAt`, client Web dùng giá trị đó để sắp xếp cây Session. Cache dùng fail-soft và ghi checkpoint bất đồng bộ, nên bản ghi thiếu hoặc bị trễ sẽ khiến một Session vừa nhận prompt gần đây bị sắp quá cũ.

Gateway trước đây từng lấy mtime của sản phẩm JSONL khi có sẵn. mtime trả lời một câu hỏi khác: sản phẩm này lần cuối được ghi vào là khi nào. Mỗi lần ghi bền vững đều làm mới nó, bao gồm cả việc sửa cắt cụt đuôi bị rách, closer tổng hợp cân bằng lượt bị ngắt quãng, và [ranh giới log `session/end-seed`](../../implemented/architecture/2026-07-30-session-end-seed-log-boundary.md) được append khi mở lại. Phép xấp xỉ này sẽ khiến một Session được thăng hạng sắp xếp chỉ vì bị mở ra. [Xác minh khoảng trống nguội có giới hạn](../../implemented/bug-fix/2026-08-13-bounded-cold-blank-verification.md) đã loại bỏ việc sắp xếp theo mtime, và đưa lỗi "quá cũ" thận trọng của cache về một hướng làm giải pháp tạm thời cho giai đoạn hiện tại.

Bản tóm tắt đã attach có thể fold luồng sự kiện thời gian thực và chọn ra `user/message` thật gần nhất của con người, nhưng đường nguội có chủ ý không đọc log lớn. Việc đọc từng file log để tính `updatedAt` sẽ khiến chi phí của `list()` tăng theo tổng số byte hội thoại thay vì theo số lượng Session. Việc đọc nguội 1 KiB dùng để xác thực metadata có thể cho thời gian gần nhất chính xác đối với các sản phẩm nhỏ đủ điều kiện, nhưng không thể khiến việc sắp xếp của log lớn trở nên chính xác.

Việc làm cho sắp xếp nguội trở nên chính xác vẫn là một quyết định về định dạng bền vững, nên phạm vi của nó nằm trong tài liệu này, chứ không phải trong workaround của gateway.

## Đề xuất

Lưu thời gian prompt thật gần nhất vào index Session mà việc liệt kê vốn đã đọc, để `summarizeCold()` không cần mở log hay phụ thuộc vào checkpoint cache mà vẫn cho ra câu trả lời. Giá trị này do coordinator tính toán, vì nó nhìn thấy mỗi lần append, và vốn đã có trạng thái theo từng id; backend chịu trách nhiệm bền vững hóa nó. Nhờ vậy nó trở thành một yếu tố mới trong convention `PersistenceBackend`, chứ không phải sổ sách cục bộ theo từng backend, và dùng chung một predicate sự kiện với chiếu đã attach: `user/message` có `source.kind` là `user`.

Hai backend đã triển khai chịu ràng buộc trái ngược nhau, và đề xuất này chủ ý xử lý bất đối xứng đối với chúng:

- **SQLite** nhận một cột mới trên bảng `sessions`, được ghi trong cùng transaction với `appendBatch`, cái giá là một lần tăng đơn điệu của `SCHEMA_VERSION`.
- **JSONL không thể mang một field header có thể thay đổi.** Header chính là dòng 1, được ghi một lần khi vật chất hóa (materialize), sau đó file log này vĩnh viễn được mở ở chế độ append; `jsonl.spec.ts` đã ghim chặt "byte đã commit không bao giờ bị ghi đè". Một field header phải thay đổi ở mỗi lần append vi phạm một bất biến bền vững đã được khẳng định, chứ không chỉ khiến bên ghi phức tạp hơn. Hình thái cần so sánh với việc "giữ mtime gần đúng" là một file đồng hành cho mỗi phiên.

Trước khi triển khai phải trả lời ba câu hỏi, tài liệu này chưa có kết luận cho bất kỳ câu nào:

**Predicate dùng chung do ai sở hữu?** Field đã lưu trữ mã hóa quy tắc lúc ghi, bên ghi chỉ thấy một batch, còn bản tóm tắt đã attach fold toàn bộ log. Cả hai phải dùng chung một predicate sự kiện hoặc reducer đã export, để tránh một biến thể nguồn tin nhắn mới khiến sắp xếp đã attach và sắp xếp nguội lệch nhau.

**Log trước khi có field này biểu hiện ra sao?** Các sản phẩm hiện có không có giá trị này. Fallback về mtime giữ được độ chính xác như hôm nay đối với chúng; fallback về `createdAt` là trung thực, nhưng sẽ sắp xếp lại mọi phiên hiện có trong selector và cây phiên.

**Với JSONL, file đồng hành có chấp nhận được không?** Nó tái đưa vào một file thứ hai cho mỗi phiên, có thể không nhất quán với log — đúng điều mà thiết kế một-sản-phẩm vốn né tránh.

## Các phương án thay thế đã cân nhắc

**Đọc log trên đường nguội.** Về cấu trúc thì đúng đắn, cũng không cần đổi định dạng, nhưng sẽ khiến việc liệt kê chỉ-đọc-header mất ý nghĩa: chi phí `list()` sẽ tăng theo tổng khối lượng log, còn cây phiên web sẽ mở rộng ra tới mọi phiên trong lưu trữ. Phép xấp xỉ mtime tồn tại chính là để né phương án này.

**Giữ mtime, nhưng loại trừ việc ghi ranh giới khỏi nó.** Bị bác bỏ vì không khả thi, không phải vì không mong muốn: mtime thuộc về hệ thống file, không thuộc về backend. Ngoài việc khôi phục lại timestamp sau mỗi lần ghi ranh giới thì không có cách nào khác giữ được nó, mà làm vậy sẽ tạo race condition với bất kỳ bên đọc đồng thời nào, và cũng nói dối về sản phẩm đó.

**Chỉ ghi ranh giới khi thực sự có sửa chữa xảy ra.** Cách này giảm tần suất xuất hiện, và [Agent Note về ranh giới](../../implemented/architecture/2026-07-30-session-end-seed-log-boundary.md) đã bác bỏ nó: predicate phải đúng ngay cả với khởi động lại có trật tự. Đánh đổi một bất biến đúng đắn để lấy độ chính xác của timestamp là đi sai hướng.

**Suy ra thời gian hoạt động từ projection cache.** Đây là cách triển khai tạm thời hiện tại. `session-projection-cache` fold đuôi sau watermark, không cần thay đổi định dạng bền vững, nhưng nó là tùy chọn và fail-soft. Thiếu hoặc checkpoint bị trễ sẽ khiến việc sắp xếp phụ thuộc vào việc cache có tồn tại và có mới hay không, nên không thể cung cấp giá trị có thẩm quyền như tài liệu này đề xuất.

## Tiêu chí nghiệm thu

- `SessionSummary.updatedAt` của phiên nguội bằng đúng giá trị mà chiếu của phiên đã attach báo cáo cho cùng một phiên; xác minh bằng cách khôi phục, thoát mà không chạy lượt nào, và khẳng định thứ tự trên cả hai đường không thay đổi.
- Trong cây phiên web và selector khôi phục TUI, một phiên bị bỏ rơi ngay sau khi khôi phục sẽ không được sắp trước phiên đã có hoạt động về sau; được ghim bằng một snapshot đã lắp ráp hoàn chỉnh, chứ không chỉ dựa vào test đơn vị.
- Quy tắc thời gian prompt chỉ có một định nghĩa duy nhất: một test chứng minh rằng trên một log chứa prompt thật của con người, user message được tiêm, ranh giới và closer, field đã lưu trữ khớp với kết quả fold đã attach.
- Dưới phương án fallback đã chọn, sản phẩm trước khi có field này vẫn tải và liệt kê được không lỗi, và hệ quả sắp xếp của fallback đó có test bao phủ.
- Theo lập trường không di trú của repo này, việc tăng `SCHEMA_VERSION` của SQLite sẽ từ chối phiên bản đĩa cũ.

## Rủi ro

**Hai định nghĩa của thời gian prompt bị trôi lệch.** Field đã lưu trữ được tính theo batch, còn projection tính trên toàn bộ log. Một nguồn tin nhắn mới nếu lúc ghi được phân loại theo một cách, lúc đọc được phân loại theo cách khác, sẽ sinh ra Session có thứ tự nguội và thứ tự đã attach mâu thuẫn nhau; lỗi này chỉ lộ ra sau khi khởi động lại.

**File đồng hành của JSONL có thể không nhất quán với log của nó.** Sự cố xảy ra giữa lúc append log và lúc ghi file đồng hành sẽ để lại một giá trị lỗi thời, và không có dấu hiệu đuôi bị rách nào để sửa nó. Mỗi bên tiêu thụ đều phải coi file đồng hành như một gợi ý, điều này đã khá gần với vị thế hiện tại của mtime.

**Phương án fallback sẽ làm phiên hiện có bị sắp xếp lại.** Bất kể chọn fallback nào, người dùng đang giữ log hiện có sẽ thấy selector và cây phiên của mình bị sắp xếp lại một lần khi nâng cấp. Chọn `createdAt` sẽ khiến mức độ xáo trộn này rất lớn.

**Chi phí có thể vượt quá chính lỗi đang muốn sửa.** Lỗi còn sót lại là việc sắp xếp sai thận trọng khi thiếu hoặc trễ metadata projection. Nếu câu trả lời trung thực cho JSONL là "giữ lại fallback cache", thì kết cục của tài liệu này có thể là ghi lại quyết định đó, chứ không phải triển khai một field.

## Liên quan

- [Xác minh khoảng trống nguội có giới hạn](../../implemented/bug-fix/2026-08-13-bounded-cold-blank-verification.md) — loại bỏ sắp xếp theo mtime, định nghĩa fallback tạm thời của projection cache, và giới hạn việc đọc nguội trực tiếp chỉ cho xác thực metadata của sản phẩm nhỏ.
- [Ranh giới log seed kết thúc](../../implemented/architecture/2026-07-30-session-end-seed-log-boundary.md) — một trong những việc ghi không-phải-prompt khiến mtime không áp dụng được.
- [Bền vững hóa phiên](../../implemented/architecture/2026-06-14-session-persistence.md) — hai bất biến chỉ-append và không bao giờ ghi đè, chính là thứ loại trừ khả năng có field header JSONL thay đổi được.
- [Bộ điều phối ghi bền vững dùng chung](../../implemented/architecture/2026-06-18-shared-persistence-write-coordinator.md) — đường append mà một field đã lưu trữ sẽ móc vào.
