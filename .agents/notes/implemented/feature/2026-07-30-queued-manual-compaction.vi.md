# Agent Note: Dùng một khóa bền vững duy nhất để hiện thực compaction thủ công có xếp hàng

Status: implemented

[English](2026-07-30-queued-manual-compaction.md) | Tiếng Việt

## Vấn đề

Compaction tự động có thể bảo vệ cửa sổ ngữ cảnh, nhưng người dùng tương tác còn cần một cách tất định để nén phần lịch sử đã tích lũy trước khi chính sách áp lực kích hoạt. Gửi `/compact` dưới dạng văn bản prompt sẽ tiêu tốn một lượt model, đồng thời buộc model của session phải diễn giải lại một thao tác điều khiển trực tiếp. Còn hiện thực tính năng này bên trong một UI cụ thể thì lại nhân bản phần khám phá lệnh, ghi log vòng đời, hủy và chính sách backend.

Lệnh hướng tới người dùng đến vào giữa các lượt, và phải sinh tóm tắt một cách bất đồng bộ. Prompt được tiếp nhận trong lúc chờ phải giữ nguyên danh tính thông thường, vị trí FIFO và hành vi đánh thức, nhưng không được dẫn xuất request từ phần lịch sử sắp bị compaction thay thế. Chỉ kiểm tra trạng thái thôi là chưa đủ, vì một bên gọi khác có thể đánh thức driver ngay giữa lần kiểm tra đó và thời điểm thao tác compaction nhận quyền sở hữu pha nhàn rỗi.

Các điểm vào thủ công, áp lực, tràn và phạm vi tường minh cũng cần dùng chung một sự thật loại trừ lẫn nhau. Chỉ dùng cờ cục bộ trong process thì không giải thích được một log sau khi khôi phục từ sự cố, còn giao dịch tóm tắt trước rồi mới ghi log thì không để lại bằng chứng bền vững nào trong quãng chờ tốn kém. Ngược lại, coi cặp mốc là vật chứa mang tính loại trừ lại cấm cả những lần inject hợp lệ lúc nhàn rỗi, dù theo định nghĩa inject không đánh thức và được thực thi ngay giữa các lượt.

Agent Note này mở rộng [capability seam của compaction](2026-06-18-compaction-capability-seam.md), [ranh giới end-seed của session](../architecture/2026-07-30-session-end-seed-log-boundary.md) và [việc loại bỏ lượt tổng hợp chỉ dùng để ghi log](../simplification/2026-07-28-remove-synthetic-log-only-turns.md). Cả ba vẫn đang hoạt động và giữ quyết định rộng hơn của riêng mình; phần chồng lấn chỉ là một phần.

## Quyết định

### `/compact` là một lệnh dựa trên seam không phụ thuộc backend

`@deepseek-ai/dsh-command-compact` đăng ký một lệnh hướng tới người dùng, không tham số, thông qua `ctx.commands`. Nó gọi thao tác trừu tượng thứ ba `compactNow(agent, signal)` của `CompactionEngine`, và ánh xạ hệ phân loại đóng `ManualCompactionError` (`busy | changed | summary | commit | persistence`) thành kết quả UI trực tiếp. `command/run` và `command/done` giữ lại vòng đời lệnh, đồng thời không đi vào lịch sử model và cũng không tiêu tốn một lượt vòng lặp model.

Plugin lệnh theo dõi độc lập promise của từng handler thực tế, không dựa vào việc chờ có nhận biết abort của bộ thực thi lệnh. Effect vòng đời phức hợp của nó gỡ đăng ký `/compact` trước, rồi bất đồng bộ chờ mọi handler đã khởi động kết thúc, nhờ vậy teardown ở cấp gốc chỉ dừng hẳn sau khi công việc đóng và flush của backend đã kết thúc.

`ManualCompactAgentContext` của seam này chỉ bổ sung `runMaintenance()` lên trên các sự thật về session và route mà compaction vốn đã cần. Việc giữ lại, cân bằng, tóm tắt, sắp xếp mốc, thay thế và tính bền vững vẫn do backend chịu trách nhiệm.

### Nhận quyền sở hữu pha bảo trì nhàn rỗi một cách đồng bộ

`Agent.runMaintenance(task)` chỉ có thể khởi động từ pha nhàn rỗi, và sẽ nhận quyền sở hữu pha đó trước khi gọi task. Việc gửi có đánh thức sẽ khởi động vòng lặp ngay khi đang nhàn rỗi, nên thao tác nào nhận pha trước sẽ sở hữu ranh giới đó.

Pha bảo trì không tạo ra hàng đợi thứ hai. Các mục gửi sau đó vẫn giữ `MessageId`, vị trí, thứ tự FIFO và thông tin đánh thức của mình. Đầu vào có đánh thức sẽ nằm xếp hàng cho tới khi task bảo trì kết thúc, rồi mới khởi động đường driver sẵn có; `inject()` vẫn không đánh thức driver.

`whenIdle()` coi task bảo trì cùng toàn bộ công việc đánh thức được giải phóng sau khi nó kết thúc là hoạt động chưa hoàn tất. Việc hủy sẽ abort tín hiệu bảo trì của chính agent, còn teardown vòng đời sẽ rút cạn cùng ranh giới hoạt động đó trước khi dispose hoàn tất.

### Một giao dịch tham số hóa sở hữu mọi cặp mốc

`dsh-compaction-basic` chỉ có một giao dịch vùng duy nhất, được tham số hóa bởi giá trị quy thuộc của mốc (`number | null`), quy tắc ổn định (toàn bộ bề mặt session hay đoạn được chọn) và tham số flush tùy chọn. Nó thực hiện theo đúng thứ tự sau:

1. kiểm tra hợp lệ dải vị trí được chọn, và kiểm tra phần đuôi của log bền vững;
2. từ chối các mốc compaction chưa khớp còn đang hoạt động;
3. nối `compaction/start` một cách đồng bộ;
4. chuẩn bị và chờ tóm tắt;
5. kiểm tra lại mức ổn định cần thiết;
6. nối `compaction/summary` cùng `user/message` dùng để thay thế;
7. thử `compaction/end` đúng một lần;
8. thực hiện flush khi bên gọi thủ công yêu cầu tính bền vững.

Công việc tự động và công việc vùng tường minh dùng giá trị quy thuộc dạng số khôi phục từ lượt chưa đóng, và yêu cầu toàn bộ bề mặt session giữ nguyên ổn định. Công việc thủ công sẽ đặt trước một suất tiếp nhận, rồi chọn dải hợp lệ trước khi bước vào giao dịch; khi kết quả chọn là `null` thì không ghi gì cả. Cặp mốc của nó dùng `turn: null`, chỉ yêu cầu đoạn được chọn giữ nguyên ổn định, và flush mọi lần đóng thành công trước khi giải phóng suất tiếp nhận đã đặt trước trong `finally`.

Vì vậy, `compaction/start` là khóa compaction duy nhất. Không có `WeakSet`, không có mutex ở lớp bọc, không tách phương thức thành dạng locked/unlocked, cũng không có kiểm tra trạng thái hoạt động lặp lại bên ngoài giao dịch.

### Ghi mốc trước là khác biệt có chủ ý so với các bản hiện thực đã khảo sát

Codex mô hình hóa compaction thủ công thành một `CompactionTask` chiếm suất lượt đang hoạt động của nó, còn compaction tự động thì chạy nội tuyến. Pi dùng sự tồn tại của abort controller compaction làm mutex, và chỉ nối phần compaction sau khi thành công. Đường tự động và thủ công của Claude Code dùng chung một thủ tục compaction, nhưng chỉ dựng ranh giới sau khi luồng tóm tắt kết thúc.

DSH cố ý ghi `compaction/start` trước khi gọi bộ tóm tắt. Nhờ đó những lần thử chậm hoặc gặp sự cố đều quan sát được, đường tự động và thủ công dùng chung một khóa bền vững, và các bên ghi về sau cũng không nhầm một bản tóm tắt đang được sinh ra thành session chưa khóa. Đây là sự lệch hướng chủ động khỏi hành vi tóm tắt-trước, chứ không phải khác biệt thứ tự sự kiện ngẫu nhiên.

### Mốc là thời điểm, không phải vật chứa sự kiện

`compaction/start` và `compaction/end` biểu thị việc lấy và nhả khóa. Chúng không tuyên bố sở hữu độc quyền mọi sự kiện nằm giữa hai seq của chúng. Trong lúc chờ tóm tắt thủ công, `inject()` lúc nhàn rỗi vẫn có thể nối thêm `user/message`, nên sự kiện không liên quan đó có thể nằm trong khoảng giữa hai mốc.

Mức ổn định thủ công chỉ kiểm tra đoạn được chọn: nó phải vẫn tồn tại, liền mạch, đúng thứ tự, tính giá như cũ và giữ được cân bằng. Ngữ cảnh chỉ-nối-thêm nằm ngoài đoạn đó không làm bản tóm tắt lỗi thời. Việc thay thế theo vị trí sẽ đặt checkpoint tại vị trí bề mặt của span cũ, và khiến ngữ cảnh được inject nằm sau nó trong lịch sử model dẫn xuất, ngay cả khi seq log của phần inject sớm hơn các sự kiện tóm tắt và thay thế về sau.

Một lần thử thất bại kiểu `changed` hoặc `summary` sẽ giữ nguyên bề mặt hội thoại, nhưng log thì không phải là không đổi: trong đó sẽ có `compaction/start` và `compaction/end { error }`. Văn bản hướng tới người dùng nêu rõ ràng khác biệt này.

### End-seed phân biệt mốc chưa khớp đang hoạt động với mốc đã lỗi thời

Việc quét phần đuôi sẽ tìm riêng lượt hiện tại, compaction start chưa khớp và `session/end-seed` mới nhất. Một start chưa khớp nằm sau end-seed mới nhất là khóa đang hoạt động, và sẽ chặn mọi điểm vào compaction. Một start chưa khớp nằm trước một end-seed mới hơn thuộc về một vòng đời session cũ hơn và đã lỗi thời, nên nó không làm kẹt session sau khi khôi phục hay fork.

Bất biến của compaction dùng cùng logic chuyển đổi đó trong lúc phát lại seed: `session/end-seed` sẽ xóa trạng thái theo dõi lịch sử chưa đóng. Kịch bản này không yêu cầu hàm khởi tạo phát ra ranh giới đó theo thời gian thực; chính phần phát lại mới là đường chịu tải.

Phép chiếu request phía client sẽ kết thúc các request compaction chưa khớp ở trạng thái gián đoạn tại thời điểm `session/end-seed`, và xóa chỉ mục hoạt động của chúng. Nhờ đó, `compaction/start` về sau tạo ra một request độc lập, thay vì để request chưa khớp còn sót lại đó vĩnh viễn ở trạng thái đang chạy hoặc bị ghi đè.

Sau khi giao dịch nối start, mỗi lần thất bại tiếp theo đều thực hiện một lần thử đóng. Việc đóng thất bại sẽ cố ý để lại một start chưa khớp nhìn thấy được và có tác dụng chặn, đồng thời không thử flush. Lần thử thủ công đã đóng vẫn flush ngay cả khi báo cáo một thất bại đã lường trước. Sau khi hoàn tất phần dọn dẹp đóng và flush bắt buộc, việc hủy vẫn giữ nguyên mức ưu tiên của nguyên nhân gốc.

### Ranh giới của bản hiện thực tham chiếu

Một bản hiện thực tham chiếu chưa merge đã cung cấp tham khảo cho lệnh, phần đặt trước, test và cấu trúc snapshot. Khóa `WeakSet` cục bộ trong process và cách tách phương thức locked/unlocked của nó đã được đánh giá nhưng không được áp dụng, vì cặp mốc bền vững mới là khóa duy nhất tiếp cận được.

Bản hiện thực tham chiếu đó còn chứa cơ chế neo thay thế phía client, dùng để giữ vị trí trong transcript. Phép chiếu transcript sắp xếp theo thứ tự log vốn đã tiêu thụ compaction theo thứ tự sự kiện và không truy vấn vị trí bề mặt khả biến, nên các neo này đã được đánh giá nhưng không được áp dụng.

## Các phương án đã cân nhắc

**Kiểm tra `agent.status` trước khi khởi động task bảo trì.** Không áp dụng, vì việc kiểm tra và việc nhận pha sẽ trở thành hai thao tác riêng biệt; một lần gửi có đánh thức có thể khởi động driver ngay giữa hai thao tác đó.

**Đưa chính lệnh vào hàng đợi.** Không áp dụng, vì `/compact` là điều khiển trực tiếp chứ không phải đầu vào cho model; prompt được tiếp nhận trước phải giữ quyền ưu tiên, không được sắp xếp lại quanh một hàng đợi lệnh thứ hai.

**Sinh tóm tắt trước khi nối `compaction/start`.** Không áp dụng, vì thao tác đang diễn ra tốn kém sẽ không nhìn thấy được, và cũng không tham gia vào khóa mà compaction tự động dùng chung.

**Dùng đồng thời mốc bền vững và mutex cục bộ trong process.** Không áp dụng, vì hai nguồn thẩm quyền có thể phân kỳ sau khi phát lại, đồng thời còn buộc phải dùng nhánh ở lớp bọc để xử lý trạng thái mà cặp mốc vốn đã biểu đạt được.

**Chặn inject cùng với prompt đánh thức.** Không áp dụng, vì theo quy ước, inject lúc nhàn rỗi là ngữ cảnh bền vững không đánh thức; trì hoãn inject sẽ khiến thứ tự plugin phụ thuộc vào một lệnh UI nào đó.

**Yêu cầu khoảng giữa hai mốc chỉ chứa sự kiện compaction.** Không áp dụng, vì mốc biểu thị thời điểm của khóa. `compaction/summary` đã chỉ rõ chính xác khoảng được chọn và các seq bị che; tính loại trừ không làm tăng tính đúng đắn, mà chỉ từ chối những lần inject hợp lệ.

**Coi mọi mốc chưa khớp là busy vĩnh viễn.** Không áp dụng, vì session sau khi khôi phục từ sự cố hoặc sau khi fork sẽ kẹt vĩnh viễn. `session/end-seed` là bằng chứng vòng đời tường minh để phân biệt lịch sử đã lỗi thời với lần thử đang hoạt động của process hiện tại.

## Kiểm chứng

Test agent loop bao phủ quyền ưu tiên trong cùng một tick, vòng đời giữ ID và FIFO, công việc xếp hàng có đánh thức và im lặng, việc giải phóng idempotent, `whenIdle()`, hủy và teardown. Test compaction bao phủ owner bất biến ở dạng độc lập và dạng số, phát lại end-seed, mốc chưa khớp đang hoạt động và đã lỗi thời, việc listener vào lại, sự trôi dạt của đoạn được chọn, thất bại khi commit và khi đóng, thứ tự flush, nguyên nhân hủy gốc, việc giữ lại raw output cùng usage, và tính loại trừ lẫn nhau giữa tự động/thủ công.

Package lệnh cố định hóa hành vi đăng ký, bản composition Loader, việc từ chối tham số, văn bản thành công/thất bại chính xác, việc hủy, đảm bảo không đi vào lịch sử model, cùng việc dispose vẫn chờ handler kết thúc xuyên qua các ranh giới đóng và flush độc lập với nhau, sau khi abort làm bộ thực thi ngừng chờ handler. Test phép chiếu runtime phía client cố định hóa việc gián đoạn tại end-seed, cùng việc hoàn tất của một lần thử độc lập ngay sau đó. Snapshot terminal `queued-manual-compact` điều khiển phím bấm thật qua TUI đã lắp ráp: `/help` cho thấy lệnh này khám phá được; bản tóm tắt bị tạm dừng tiếp nhận một prompt xếp hàng và một lần inject tức thời; mốc `turn: null` và flush đi trước lượt của prompt xếp hàng; vòng đời lệnh giữ nguyên tính chất chỉ-ghi-log; thứ tự dẫn xuất được cố định là checkpoint → inject → prompt xếp hàng.

## Hệ quả

Người dùng tương tác có thể nén phần lịch sử hữu hiệu mà không tiêu tốn một lượt model của session. Prompt được tiếp nhận trước lệnh sẽ thắng; prompt gửi trong lúc lệnh đang chạy sẽ chờ với đúng danh tính hàng đợi ban đầu. Compaction thủ công tiêu thụ seq của session, nhưng không tiêu thụ số hiệu lượt.

Log phơi bày các lần thử chậm, thất bại, gặp sự cố và thành công qua cùng một cặp mốc. Mốc chưa khớp đã lỗi thời nằm trước ranh giới sẽ không còn làm kẹt vòng đời mới, còn start chưa khớp của hiện tại vẫn là tín hiệu busy nghiêm ngặt. Khoảng giữa hai mốc có thể chứa sự kiện không liên quan, nên bên tiêu thụ hãy dùng seq và thứ tự tương đối do `compaction/summary` ghi lại, chứ đừng giả định tồn tại một lát cắt liền mạch chỉ chứa sự kiện compaction.

Giao dịch dùng chung giữ cho mọi điểm vào cùng một thứ tự và cùng một khóa. Báo cáo thất bại phân biệt chính xác ba trường hợp: chỉ log thay đổi, bề mặt session có thể đã thay đổi một phần, và phần commit trong bộ nhớ không thể lưu bền vững.
