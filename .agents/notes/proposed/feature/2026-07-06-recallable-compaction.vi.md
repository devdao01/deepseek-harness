# Agent Note: Nén có thể truy hồi: checkpoint chỉ mục, checkpoint trạng thái và truy hồi lịch sử trong phiên

Status: proposed

[English](2026-07-06-recallable-compaction.md) | Tiếng Việt

## Vấn đề

Nén (compaction) là không thể đảo ngược đối với ngữ cảnh hiện tại của model. Bản tóm tắt mà model thấy không có tham chiếu trỏ tới nội dung bị nó che khuất, vì `shadowedRange` chỉ tồn tại trên sự kiện `compaction/summary` vốn chỉ ghi vào log và model không thấy được, và cũng không có công cụ nào cho phép model đọc lại vùng bị che khuất. Ngay cả khi log chỉ-nối-thêm vẫn giữ từng byte, nội dung bị bộ tóm tắt loại bỏ vẫn không khả dụng với model. Nén lặp lại còn làm các hệ quả này nặng thêm: mỗi vòng đều viết lại checkpoint ở đầu, nên tiền tố yêu cầu mất hoàn toàn phần trúng prompt cache mỗi lần, còn các bản tóm tắt cũ hơn lại bị tóm tắt lại ở từng vòng kế tiếp.

Nguyên nhân gốc là một sản phẩm phải gánh hai vai trò xung đột nhau. **Chỉ mục** cần được đóng băng, sắp theo thời gian và rẻ; còn **bộ nhớ làm việc** của model thì cần góc nhìn toàn cục, cần xác định lại thứ tự ưu tiên và cần khả biến. Một bản tóm tắt duy nhất không thể đảm đương cả hai.

Các harness lập trình phổ biến đều không cho model truy hồi bên trong vòng lặp, và không có bản hiện thực nào được khảo sát khiến việc nén nhận biết được prefix cache. Phiên theo mô hình event sourcing có đặc điểm nguyên văn bền vững, định địa chỉ được theo seq và phát lại chính xác, nên là nền tảng tự nhiên để hỗ trợ cả hai tính năng này.

## Đề xuất

Tách checkpoint thành hai loại và làm cho lịch sử bị che khuất trở lại có thể tiếp cận.

### Checkpoint chỉ mục đã đóng băng

Phần lịch sử vừa trở nên cũ được chia thành các mảnh theo chiến lược tất định: tích lũy tới `chunkTokens`; dùng `toolPairingBalancedBefore`／`toolPairingBalancedAfter` để căn mép; ưu tiên chọn ranh giới giữa các lượt; trong phạm vi mà điều kiện cân bằng cho phép, đặt ranh giới cuối cùng càng gần ranh giới giữ lại càng tốt, để lát cắt đuôi thu nhỏ còn khoảng một lượt. Mỗi mảnh được nén thành một **stub chỉ mục** qua một lời gọi `compactRegion` (`stubTokens`, khoảng 100–200 token):

- dùng hai ba dòng để mô tả điều đã xảy ra;
- dùng một dòng từ khóa để ghi các mỏ neo nguyên văn có tần suất thấp, ví dụ chuỗi lỗi chính xác, giá trị và khóa cấu hình, và nhóm theo phân loại;
- phần chân trang do mã lắp ráp: `[checkpoint c<summarySeq>: shadows conversation span #<start>–#<end>; originals retrievable via history_read]`. Mã lắp ráp các con trỏ này dựa trên seq của `compaction/summary` và `shadowedRange`, model không bao giờ tự viết chúng.

Stub đã được ghi nhận thì không bao giờ bị viết lại, và cũng không bao giờ lọt vào vùng nén sau đó. Lời gọi tạo stub dùng đầu vào phân tầng: phần dẫn nhập cố định và checkpoint trạng thái đầu vòng giống hệt từng byte (tiền tố dùng chung cho mọi lời gọi trong giai đoạn này); tiếp theo là các dòng từ khóa của toàn bộ stub đã ghi nhận trước đó, để mục mới lập chỉ mục cho nội dung riêng biệt của mảnh mình thay vì lặp lại cả danh mục; cộng thêm một hai stub đã ghi nhận gần nhất để duy trì tính liên tục theo thời gian; và cuối cùng là bản thân lát cắt. Các stub ngang cấp trong cùng một vòng không được dùng làm đầu vào, vì giai đoạn chạy song song cấm kiểu phụ thuộc đó, còn ranh giới căn theo lượt vốn đã duy trì tính liên tục cục bộ. Checkpoint trạng thái chỉ đóng vai trò bối cảnh, tuyệt đối không được trở thành tài liệu mà stub phải tóm tắt. Lát cắt hoàn toàn cấu thành từ nội dung truy hồi chỉ sinh stub bằng mã, tức là chỉ ghi một dòng con trỏ, không gọi LLM (mô hình ngôn ngữ lớn). Khi lời gọi tạo stub thất bại, cách suy giảm cũng như vậy: lát cắt của nó nhận một stub con trỏ chỉ do mã sinh, vòng hiện tại vẫn tiếp tục chạy, khiến việc viết lại trạng thái trở thành phụ thuộc LLM bắt buộc duy nhất trong một vòng.

### Checkpoint trạng thái

Hệ thống duy trì một tài liệu bộ nhớ làm việc khả biến (nhiều nhất một; trước lần nén đầu tiên thì không có), nằm sau toàn bộ stub và trước phần đuôi được giữ lại. Mỗi vòng nó được viết lại dựa trên trạng thái trước đó và nội dung vừa trở nên cũ trong vòng này, chi phí là O(previous + new); quá trình tuân theo quy tắc «hợp nhất chứ không nhắc lại» vốn đã có trong prompt tóm tắt, và bao phủ quyết định, trạng thái hiện tại, ràng buộc và bước tiếp theo. Nó có chân trang riêng, và giới hạn kích thước cùng cỡ với bản tóm tắt hiện nay.

Cơ chế chống phình sẽ ràng buộc toàn bộ thao tác của vòng: nếu kích thước sau khi nén không nhỏ hơn hẳn kích thước trước khi nén thì không ghi nhận gì cả, và vòng hiện tại tiếp tục; lần thử này được hoãn tới khi tích lũy thêm lịch sử cũ. Logic bảo vệ so sánh cùng một chỉ số ở cả hai phía: ưu tiên dùng lượng dùng do nhà cung cấp báo cáo trên đường yêu cầu; nếu không có, cả hai phía đều lùi về bộ ước lượng theo ký tự.

### Quá trình thực thi của một vòng

- Lát cắt mảnh được biểu diễn bằng dải vị trí trên bề mặt. Một vòng chạy theo hai giai đoạn: mọi lời gọi tóm tắt chạy song song trước và được đệm bên ngoài bề mặt; sau đó ghi nhận các vùng nghiêm ngặt từ trái sang phải, ghi nhận từng mảnh trước rồi cuối cùng là lát cắt đuôi, để checkpoint trạng thái rơi vào sau toàn bộ stub qua một lần thay thế nút đơn liên tục. Thời gian đồng hồ treo tường được giữ ở mức xấp xỉ một lời gọi tóm tắt.
- Checkpoint trạng thái bị thay thế sẽ được gấp vào mảnh đầu tiên của vòng kế tiếp như lịch sử thông thường, không cần bia mộ hay nguyên thủy mới. Stub của nó bỏ qua trạng thái đó, `history_read` sẽ render nó thành `[prior state checkpoint]`, và để chân trang đi kèm văn bản được render, nhờ đó mọi lát cắt đuôi đều tiếp cận được qua chuỗi hai chặng.
- Việc chọn dải nhận biết ranh giới đóng băng: vùng có thể nén bắt đầu ngay sau checkpoint chỉ mục cuối cùng đã ghi nhận; chỉ khi không tồn tại checkpoint chỉ mục nào thì mới bắt đầu từ đầu bề mặt. Checkpoint đầu hiện có của phiên cũ sẽ được coi là checkpoint kiểu trạng thái: văn bản của nó làm cơ sở hợp nhất, còn nút của nó thì gấp vào lịch sử như mọi trạng thái bị thay thế khác.
- Sập trong giai đoạn tóm tắt thì không ghi nhận gì; sập giữa chừng khi đang ghi nhận sẽ để lại một tiền tố đã ghi nhận từ trái sang phải, và vòng sau khi khôi phục sẽ đọc cơ sở hợp nhất từ sự kiện `compaction/summary` kiểu trạng thái mới nhất trong log, rồi ghi nhận vô điều kiện các vùng còn lại. Việc khôi phục `[stubs…][state][tail]` được ưu tiên cao hơn việc giảm kích thước.

### Công cụ truy hồi

Bổ sung package `@deepseek-ai/dsh-tool-recall`, nó chỉ là bên tiêu thụ nằm trên từ vựng của `dsh-session` và `dsh-compaction`, đăng ký hai công cụ hướng model:

- `history_read(checkpoint, offset?)`: render vùng bị che khuất bởi bất kỳ checkpoint nào trong log (kể cả checkpoint đã bị thay thế) thành transcript (bản ghi văn bản) dạng `User:`／`Assistant:`／`Tool result:`, phân trang theo ngân sách cấu hình và cung cấp con trỏ đọc tiếp.
- `history_search(query, checkpoint?, limit?)`: quét nguyên văn không phân biệt hoa thường trên từng vùng bị che khuất; trả về đoạn trích kèm id checkpoint và metadata độ phủ (`scanned`／`matched`／`truncated`). Gợi ý khi không có kết quả sẽ nêu rõ rằng việc quét thực hiện theo nguyên văn, và khuyến nghị dùng thẳng `history_read` với các checkpoint khả dĩ.

Cả hai công cụ đều đọc `exec.agent.session.events` (theo mẫu truy cập của tool-todo; từ chối bên gọi không phải agent (tác tử)), chỉ render các sự kiện thông điệp thuộc kiểu bề mặt, và trả về `tool/result` thông thường: các byte truy hồi sẽ đi vào phần đuôi ngữ cảnh và được ghi vào log, nên không cần xử lý đặc biệt nào để thỏa tính tái dựng được. Hệ thống không thêm kho lưu trữ hay chỉ mục đi kèm mới: log phiên lưu nội dung, còn `compaction/summary.shadowedRange` và `shadowedSeqs` cho biết mỗi checkpoint đã thay thế những gì, và hai công cụ này đọc cả hai. Schema công cụ và mục prompt hệ thống duy nhất của package đều là chuỗi tĩnh; id checkpoint chỉ đến được với model qua chân trang. Bộ render transcript được chuyển từ `compaction-basic` sang `dsh-session` để bộ tóm tắt và công cụ dùng chung.

### Cache và chi phí

Tiền tố yêu cầu sau một vòng là `[system][stubs…][state][tail]`. Stub đã đóng băng ổn định từng byte qua các vòng, nên cache chỉ bắt đầu trượt từ token thay thế checkpoint trạng thái trước đó, quy mô giữ ở O(new chunks + state + tail), trong khi bản hiện thực hiện tại thì trượt từ vị trí không. Đầu ra truy hồi rơi vào phần đuôi và không làm thay đổi tiền tố. Đầu vào tóm tắt mỗi vòng xấp xỉ gấp đôi bản hiện thực hiện tại, cộng thêm một số hạng bối cảnh m·S; chi phí này bị chặn bởi cận dưới của `chunkTokens` (một bội số nhỏ của giới hạn trên cho trạng thái) và bởi cận trên đã hiệu chỉnh của tỉ lệ `stubTokens`／`chunkTokens`. Bố cục đầu vào tiền tố dùng chung lần lượt là phần dẫn nhập, trạng thái đầu vòng giống hệt từng byte, rồi nội dung lát cắt ở phần đuôi, để các lời gọi ngang cấp có thể đọc lại theo mức phí cache.

### Cách đóng gói

Thiết kế này được bàn giao dưới dạng backend mới `dsh-compact-recallable`, gắn vào seam `ctx.compaction` hiện có, và bật mặc định trong cấu hình ví dụ đã bàn giao. `compaction-basic` được giữ lại làm bản hiện thực tham chiếu và đối chứng thiết kế cho seam này, nhất quán với mẫu của các adapter LLM theo cặp. Trong JSDoc của seam, điều khoản «nhiều nhất một checkpoint tự sinh, luôn nằm ở đầu» sẽ được nới lỏng, đổi thành mô tả hành vi riêng của từng backend.

### Quan hệ với các công việc đang tiến hành

- **Cắt bớt kết quả công cụ** (service cắt bớt đang tiến hành): nút thay thế của nó mang `sourceEventSeqs`; cùng một phép gấp registry sẽ liệt kê kết quả đã bị cắt bớt là có thể truy hồi. Nó thuộc phạm vi tiếp theo, hai công việc không chặn lẫn nhau.
- **Hạch toán lượng token do nhà cung cấp báo cáo** (công việc đang chuyển áp lực nén sang lượng dùng do nhà cung cấp báo cáo): cung cấp cơ sở hạch toán cho logic bảo vệ; bản hiện thực này xếp chồng lên sau nó.
- **Mục backlog (danh sách việc tồn đọng) «truy vấn phiên»**: đó là phương án tổng quát hóa xuyên phiên; Agent Note này giới hạn phạm vi trong phiên thời gian thực, và chọn tên công cụ cùng cách render sao cho công việc đó có thể mở rộng thiết kế này mà không xung đột.
- **Huấn luyện**: khi nào nên truy hồi thuộc về hành vi học được. Chân trang tất định và mỏ neo từ khóa cung cấp mục tiêu ổn định cho việc huấn luyện, còn tình hình sử dụng truy hồi hiển thị đầy đủ trong log phiên và có thể xuất thành quỹ đạo; thiết kế benchmark và RL do phía hậu huấn luyện thúc đẩy.

### Việc tiếp theo

Các hạng mục sau được hoãn tới khi kết quả quan sát chứng minh là cần thiết:

- Thang suy giảm của logic bảo vệ (dùng mã tổng hợp tiền tố stub sớm nhất, giữ lại chân trang, id đã tổng hợp vẫn dùng làm mục tiêu truy hồi được; sau đó sinh một bản tóm tắt sau ranh giới đóng băng): điều kiện kích hoạt là quan sát thấy logic bảo vệ livelock hoặc áp lực ở vùng stub.
- Phát hiện tiếng vọng trong đầu ra stub (n-gram mức câu, miễn trừ nguyên văn ngắn; thử lại trước, rồi mới lược bỏ): điều kiện kích hoạt là quan sát thấy rò rỉ phân công trách nhiệm.
- Định kỳ làm mới trạng thái bằng nguyên văn của mảnh: điều kiện kích hoạt là đầu dò bàn giao quan sát thấy trôi dạt.
- `stateFallbackThreshold` (dùng prompt trạng thái với đầy đủ chi tiết khi số stub thấp hơn ngưỡng): điều kiện kích hoạt là hồi quy ở phiên ngắn.
- Đăng ký công cụ truy hồi trễ: điều kiện kích hoạt là đo được chi phí ngữ cảnh trong các phiên không bao giờ nén.
- Phân bổ công việc soạn thảo stub vào pre-step: một khi nội dung đã cũ nhưng chưa nén tích lũy vượt `chunkTokens`, thì soạn thảo stub cho mảnh đó ở pre-step kế tiếp (một sự kiện bản nháp chỉ ghi vào log, được viết khi ngữ cảnh quanh mảnh vẫn còn sống), để vòng nén ghi nhận bản nháp thay vì thực hiện tóm tắt tập trung. Đây là dạng tương đương tất định, phát lại chính xác của nén nền (bộ nhớ phiên của Claude Code dùng mẫu này; OpenClaw chứng minh ngữ nghĩa đồng bộ là hoàn toàn như nhau). Điều kiện kích hoạt là quan sát thấy độ trễ thực thi ở các vòng nén, hoặc lợi ích chất lượng stub từ việc soạn thảo gần thời gian thực được xác nhận.
- Tách model tóm tắt; để model chọn ranh giới mảnh; truy hồi xuyên phiên; dự phòng tìm kiếm ngữ nghĩa: mỗi hạng mục đều phải có bằng chứng riêng hậu thuẫn.
- Dạng truy vấn phong phú hơn cho `history_search`: biểu thức chính quy, và truy vấn có cấu trúc thực hiện trên kết quả công cụ dạng JSON trong log (kiểu sql／jq, hoặc để agent tự viết truy vấn trên kho đã lập chỉ mục). Điều kiện kích hoạt là quan sát thấy tìm kiếm bỏ sót; bản đầu tiên bàn giao khớp nguyên văn trước, để đường truy hồi vẫn là hàm thuần của log.

## Các phương án đã cân nhắc

- **Bàn giao theo giai đoạn** (bàn giao riêng công cụ truy hồi trên backend hiện tại trước; sau khi quan sát thấy có dùng truy hồi rồi mới quyết định có tách checkpoint hay không): không chọn. Model chưa được huấn luyện sẽ ít dùng bất kỳ công cụ mới nào, nên điều kiện đó đo sự thiếu vắng huấn luyện chứ không đo giá trị thiết kế; phía huấn luyện cần cơ chế đầy đủ để dựng môi trường; ở giai đoạn tiền phát hành, chi phí sửa định dạng lưu trữ là thấp nhất; còn tính kinh tế của cache là kiến thức bên thứ nhất đã nắm, không phải giả thuyết cần chờ dữ liệu đo từ xa xác nhận. Việc hiện thực vẫn hạ cánh theo dạng PR (Pull Request) xếp chồng và bàn giao công cụ truy hồi trước, nhưng đó chỉ là thứ tự xây dựng, không phải ngưỡng quyết định.
- **Chỉ giữ bản tóm tắt đầy đủ đã đóng băng, không có checkpoint trạng thái**: không chọn, vì tiền tố vĩnh viễn sẽ tăng vô hạn, tự gia tốc và cuối cùng sinh thrashing, và cũng không có gì để xác định lại thứ tự ưu tiên.
- **Chỉ giữ stub thuần túy, không có checkpoint trạng thái**: không chọn, vì cách này giả định model biết mình đang thiếu gì, và sẽ thất bại trước những cái chưa biết mà mình cũng không biết là mình chưa biết.
- **Để LLM lão hóa／hợp nhất các mảnh đã đóng băng**: không dùng làm cơ chế thường quy, vì tóm tắt của tóm tắt sẽ mất thông tin và khiến tiền tố đóng băng thay đổi thường xuyên; dạng còn giữ lại là tổng hợp bằng mã, và được hoãn hiện thực.
- **Đưa toàn bộ tiền tố làm đầu vào cho bộ tóm tắt mảnh**: không chọn, vì chi phí là O(N²); tài liệu trạng thái cung cấp cùng bối cảnh đó với chi phí O(state).
- **Một lời gọi tóm tắt xuất toàn bộ kết quả**: không chọn, vì đường tóm tắt không có ràng buộc đầu ra có cấu trúc; việc phân tích một phản hồi văn bản tự do rồi tách nó ra chính là kiểu ranh giới mong manh mà thiết kế thất bại bảo thủ muốn tránh.
- **Để model chọn ranh giới mảnh**: hoãn hiện thực, vì chi phí phân tích và kiểm tra quá cao so với lợi ích chưa được chứng minh; chiến lược chia mảnh do cấu hình điều khiển.
- **Để model viết con trỏ**: không chọn, vì con trỏ phải chính xác và nên do mã tất định lắp ráp.
- **Kho đi kèm dạng chỉ mục FTS／vector**: trong phạm vi một phiên thì không chọn, vì log thời gian thực vốn đã ở trong bộ nhớ và có kích thước bị chặn, quét nguyên văn trong ngân sách là đã đủ; chỉ phạm vi xuyên phiên mới chứng minh được giá trị của chỉ mục.
- **Dự phòng tìm kiếm ngữ nghĩa／trích xuất bằng model phụ trong đường truy hồi**: không chọn, vì lời gọi LLM hay embedding trong đó sẽ phá vỡ tính tất định của phát lại không khóa; truy hồi phải giữ nguyên là hàm thuần của log.
- **Dùng sự kiện thô thay vì transcript đã render**: không chọn, vì cách này làm rò rỉ từ vựng chỉ nhìn thấy trong log và nhiễu do chia mảnh; model nên đọc đúng những gì model từng thấy.
- **Không làm gì cả (khắc phục bằng khôi phục／fork)**: không chọn, vì cách này biến việc khôi phục thành thao tác thủ công.

## Tiêu chí nghiệm thu

- Sau khi phiên dài tự động nén, mỗi vòng hoàn tất đều cho ra `[stubs…][state][tail]`; stub trước đó giữ nguyên từng byte qua các vòng; stub đã ghi nhận không bao giờ rơi vào vùng sau đó; checkpoint trạng thái bị thay thế gấp được vào lịch sử mà không cần bia mộ, khi render có nhãn kèm theo, và tiếp cận cũng như tìm kiếm được qua chuỗi hai chặng.
- Văn bản bề mặt của mỗi checkpoint đều kết thúc bằng chân trang tất định; chân trang khứ hồi nguyên vẹn từng byte qua phát lại; `shadowedRange` của checkpoint trạng thái ghi lại dải đầu vào rộng hơn của nó.
- Không ghi nhận gì trước khi mọi bản tóm tắt sẵn sàng và logic bảo vệ vượt qua với cùng cách hạch toán; bảo vệ thất bại thì không ghi nhận gì và cũng không làm vòng thất bại; sau khi bị chấm dứt giữa chừng lúc đang ghi nhận, pre-step kế tiếp sẽ khôi phục xử lý, đọc cơ sở hợp nhất từ log, và ghi nhận vô điều kiện vùng trạng thái để hoàn tất vòng này; checkpoint đầu kiểu cũ được coi là kiểu trạng thái.
- `history_read` render vùng của bất kỳ checkpoint đã ghi nào trong phạm vi ngân sách và cung cấp con trỏ khả dụng; `history_search` phủ mọi vùng bị che khuất, trả về đoạn trích kèm id checkpoint và metadata độ phủ, và test đặc biệt phải tìm được nội dung chỉ tồn tại trong vùng bị che khuất bởi checkpoint trạng thái đã bị thay thế — đây là ca hồi quy chốt tính tiếp cận được của lát cắt đuôi; cả hai công cụ đều từ chối bên gọi không phải agent, và trả lỗi có kiểu cho id chưa từng tồn tại hoặc `compaction/start` di sản; nội dung truy hồi xuất hiện dưới dạng `tool/result` thông thường; bất biến về tái dựng yêu cầu vượt qua trên phiên có cả nén lẫn truy hồi; một kịch bản snapshot không khóa phủ đầu-cuối trường hợp nén rồi truy hồi; schema công cụ và mục prompt giống hệt từng byte qua các vòng.
- Trong bộ bench trải dài thời gian: tỉ lệ hoàn thành nhiệm vụ không thấp hơn `compaction-basic` với cùng điều kiện ngân sách; điểm của đầu dò độ trung thực khi bàn giao (trình bày lại K quyết định và ràng buộc đã biết sau một vòng) không giảm; mỗi lần chạy đều báo cáo tần suất dùng truy hồi và hiệu quả trúng đích qua pipeline báo cáo dsh bench, đồng thời báo cáo chỉ số chú ý tới danh mục stub và dữ liệu đo từ xa về tỉ lệ trúng cache.
- JSDoc của seam, Agent Note về seam năng lực nén, `architecture.md`, cùng các danh mục công cụ, cấu hình, lưu trữ và sơ đồ module được sinh ra đều được cập nhật trong cùng một thay đổi; toàn bộ ngân sách nằm trong cấu hình; thư mục nguồn mới có độ phủ 100% theo từng tệp và test dispose (giải phóng tài nguyên) HMR (thay thế module nóng).

## Rủi ro

- **Truy hồi là hành vi học được**: model chưa được huấn luyện sẽ ít dùng nó, và báo cáo bench sẽ liên tục theo dõi khoảng cách này cho tới khi huấn luyện lấp đầy. Trước đó, checkpoint trạng thái giữ cận dưới chất lượng ở mức bản tóm tắt hiện nay.
- **Những cái chưa biết mà cũng không biết là chưa biết vẫn còn đó**: nếu một chi tiết vừa không xuất hiện trong bản tóm tắt vừa không xuất hiện trong từ khóa thì sẽ không kích hoạt truy hồi. Truy hồi biến «dù đã nghi ngờ cũng không tiếp cận được» thành «khi nghi ngờ thì tiếp cận được».
- **Danh mục stub sẽ chiếm sự chú ý**: mỗi yêu cầu chứa hàng chục thẻ chỉ mục ổn định có thể làm loãng trọng tâm của model; các chỉ số bench trong tiêu chí nghiệm thu sẽ đối chiếu điều này với `compaction-basic`.
- **Chi phí**: đầu vào tóm tắt mỗi vòng xấp xỉ gấp đôi bản hiện thực hiện tại; với phiên ngắn thì chi phí và chất lượng xấp xỉ mức hiện nay, còn lợi ích của thiết kế tăng theo độ dài phiên.
- **Trôi dạt trạng thái và rò rỉ phân công trách nhiệm** có thể quan sát qua đầu dò bàn giao và việc rà soát stub; biện pháp tương ứng đã liệt kê trong phần việc tiếp theo.
- **Hai backend** sẽ mở rộng phạm vi bảo trì; quy ước của seam và bên tiêu thụ truy hồi dùng chung sẽ giới hạn phạm vi này, còn đối chiếu bench thì dùng để dần quyết định bản hiện thực mặc định.
