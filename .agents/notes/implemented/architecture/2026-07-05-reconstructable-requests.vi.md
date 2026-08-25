# Agent Note: Mọi yêu cầu LLM đều có thể tái dựng từ nhật ký phiên

Status: implemented

[English](2026-07-05-reconstructable-requests.md) | Tiếng Việt

## Vấn đề

Pipeline yêu cầu không bảo đảm được tính ổn định của tiền tố để tận dụng bộ nhớ đệm của bên cung cấp, và nhật ký phiên cũng không tái dựng được nội dung mà mô hình thực sự nhìn thấy. Nhật ký bỏ sót mô hình, prompt hệ thống và schema công cụ, đồng thời cho phép viết lại yêu cầu ở từng lời gọi. Vì vậy hành vi bộ nhớ đệm và tính tương đương khi phát lại lại phụ thuộc vào việc tình cờ những plugin nào được nạp.

Hình mẫu tham chiếu của con đường hạnh phúc là `LLMClient` của MiniCode: một client hội thoại có trạng thái, chỉ nối thêm chứ không dựng lại khi hội thoại tiến triển, và chỉ đặt lại khi prompt hệ thống, bộ công cụ hoặc quá trình nén (compaction) thực sự thay đổi nội dung mà mô hình cần thấy. Câu hỏi thiết kế mà Agent Note này trả lời là: làm sao đạt được kỷ luật đó mà không từ bỏ event sourcing.

## Quyết định

### Nguyên tắc

**Mô hình nhìn thấy ⟺ đã được tham chiếu bền vững.** Mọi nội dung tới được yêu cầu của mô hình đều phải tái dựng được từ nhật ký phiên và các đối tượng bất biến định địa chỉ theo nội dung mà nó tham chiếu. Hệ quả kiểm chứng được: bất kỳ ai nắm nhật ký, các đối tượng đính kèm mà nhật ký tham chiếu và một phiên bản mã cố định đều có thể tái dựng từng byte mọi yêu cầu của vòng lặp. `GenerateOptions` dạng văn bản thuần vẫn là hàm thuần của nhật ký; yêu cầu có ảnh còn phân giải các byte `ImageAttachmentRef` qua `ctx.attachments` trong lúc adapter tuần tự hóa, trong đó việc đối chiếu tóm lược nội dung và siêu dữ liệu đã ghi khiến việc tra cứu đối tượng mang tính tất định, và báo lỗi rõ ràng khi dữ liệu thiếu hoặc hỏng. Lời gọi một lần trực tiếp (lời gọi summarize của quá trình nén) ghi lại các đại lượng vô hướng trong phong bì của nó (`compaction/summary.{provider, model, maxTokens}`), còn đầu vào của nó là một phép tính mã tất định trên vùng nhật ký và các đối tượng được tham chiếu đó — vì chỉ vòng lặp mới đánh dấu quyền sở hữu yêu cầu, nên chúng nằm ngoài bất biến này.

Tính ổn định của bộ nhớ đệm tiền tố là hệ quả #1, không phải tiêu đề: một nhật ký chỉ nối thêm, qua phép chiếu thuần theo từng nút, sẽ tự nhiên sinh ra phần mở rộng nối thêm của yêu cầu trước đó khi header không đổi — tính ổn định là thứ trồi lên, không phải thứ được quản lý. Việc kiểm toán/phát lại chính xác tới từng byte là hệ quả #2; khôi phục và fork với độ trôi lệch *quy được trách nhiệm* là hệ quả #3.

### Cơ chế

**Tin nhắn.** `Session.deriveMessages()` có bộ nhớ đệm: mỗi mục surface được chiếu chính xác một lần khi xuất hiện lần đầu, thông qua hàm công khai theo từng sự kiện `deriveEventMessage(event)`; việc ghi đè surface (`replace` của quá trình nén, tức `SurfaceManager.replaceGeneration`) kích hoạt dựng lại. Bên gọi mỗi lần nhận một mảng mới, bên dưới là các tin nhắn được đóng băng sâu và dùng chung: biến đổi lịch sử đã ghi thông qua phép chiếu là điều không thể biểu diễn (sẽ ném ngoại lệ), thay thế cho cơ chế cách ly bằng cách clone theo từng lời gọi trước đây. Bộ tái dựng bên ngoài gấp cùng một hàm công khai đó trên tiền tố nhật ký, nên không thể có hai con đường cho ra kết quả phân kỳ.

`EpochHeader` ghi lại trạng thái phi lịch sử của yêu cầu: cấu hình lời gọi, prompt hệ thống sau khi render và schema công cụ, với giá trị rỗng được chuẩn hóa thành thiếu vắng. `request/header` luôn ghi một snapshot đầy đủ: thể hiện vòng lặp đầu tiên dùng reason `initial`, các thể hiện sau dùng `resume`, còn thay đổi trong nội bộ một thể hiện dùng `change`. `foldRequestHeader` chọn snapshot mới nhất. Sự kiện `request/header-delta` cũ và reason `fallback` đã bị gỡ đều bị từ chối cả khi nối thêm lẫn khi tải.

Mỗi bước được đề xuất trước hết nhận lô công việc trong inbox của mình, rồi mới chạy `agent/pre-step`. reject không mở bước; enter mở `step/start` và ghi lô tin nhắn cuối cùng thành sự kiện `user/message`. Sau đó bước lắp ghép prompt hệ thống và công cụ, và `agent/request` chỉ có thể thay thế hạt giống cấu hình lời gọi đã đóng băng. Vòng lặp ghi lại snapshot header đầy đủ theo yêu cầu, dựng `GenerateOptions` từ các tin nhắn được dẫn xuất và header đó, đóng băng sâu nó nhưng vẫn giữ `AbortSignal` hoạt động. Cấu hình lời gọi đầu tiên xuất phát từ `AgentOptions` tường minh, giữ lại các ghi đè của fork và việc cấu hình lại khi khôi phục; các lời gọi sau xuất phát từ header đã gấp.

**Bước đã mở là ranh giới tái dựng.** Lô `user/message` đi vào bước và bất kỳ `request/header` nào mới được ghi đều nằm trước khi yêu cầu được điều phối. Việc tiêm xảy ra sau lần nhận nguyên tử sẽ được ghép vào các yêu cầu sau; còn listener bắt buộc phải ảnh hưởng tới yêu cầu lần này thì trả tin nhắn về qua `agent/pre-step`. Việc tái dựng header chọn `request/header` của bước đó, hoặc dùng lại snapshot trước đó nếu không có header mới nào được ghi.

**Cưỡng chế.** Plugin đồng hành `dsh-agent-loop/invariant` đăng ký vào `ctx.invariants`, và khi được chọn dùng, nó tái dựng độc lập từng yêu cầu của vòng lặp thông qua một `Session` hoàn toàn mới, khiến bộ nhớ đệm đang hoạt động không thể tự bảo chứng cho chính mình, rồi so sánh tin nhắn và các trường header đã gấp tại `llm/stream`. Vòng lặp ghi lại chính xác yêu cầu đã đóng băng qua `markAgentLoopRequest()` của `dsh-llm`; định danh trong tiến trình này giúp plugin đồng hành và các bên quan sát yêu cầu khác nhận diện công việc hội thoại, trong khi lời gọi một lần trực tiếp vẫn bị loại trừ bất kể hình thái đóng băng hay id phiên của nó. Tính đúng đắn dựa vào việc tái dựng có giới hạn theo chuỗi, chứ không dựa vào thứ tự listener. Bài kiểm thử e2e có khóa yêu cầu số token cache-read dương sau yêu cầu đầu tiên; mức sử dụng theo từng bước là tín hiệu sản xuất, và thay đổi header hoặc quá trình nén sẽ biểu hiện thành sụt giảm cache-read ở bước kế tiếp.

### Hình mẫu MiniCode: tiếp nhận, với nhật ký sự kiện làm nguồn sự thật

Giống MiniCode, hội thoại chỉ tiến triển bằng cách nối thêm, và chỉ đặt lại khi trạng thái mà mô hình nhìn thấy thay đổi. Khác MiniCode, nhật ký sự kiện vẫn là nguồn sự thật, vì nó đồng thời sở hữu việc lưu trữ bền vững, khôi phục, ranh giới, ghép cặp công cụ, và ghi lại mối liên hệ giữa sự kiện dẫn xuất với sự kiện đầu vào của nó. `Session` lưu đệm các tin nhắn suy ra từ nhật ký và kết quả gấp header, khiến từng yêu cầu đều kiểm tra được một cách độc lập.

## Các phương án đã cân nhắc

- **Client làm nguồn sự thật** (bê nguyên MiniCode): tạo thêm một sự thật lúc chạy nằm ngoài nhật ký — hai bên trôi lệch mà không ai hay biết; xem mục trên.
- **Client truyền tải có trạng thái phản chiếu nhật ký**: lặp lại trạng thái hội thoại, cần cơ chế rollback quanh listener, để lại con đường chỉnh sửa không được ghi lại, và vẫn không tái dựng được header của yêu cầu. Bộ nhớ đệm do Session sở hữu cộng với header đã ghi tránh được những sự thật bị chẻ đôi này.
- **Đại lượng vô hướng của yêu cầu theo từng lời gọi** (một cấu hình có thể biến đổi tự do, truyền cho mỗi lần phát `agent/request`): listener có thể đổi mô hình ở từng lời gọi mà không cần ghi sổ gì, âm thầm vứt bỏ đúng cái bộ nhớ đệm của bên cung cấp mà thiết kế này muốn bảo vệ. Cấu hình là trạng thái đã ghi theo từng hội thoại; waterfall (sự kiện thác nước) đề xuất, còn nhật ký ghi nhận.
- **Phát hiện và báo cáo** (so sánh các yêu cầu liên tiếp, cảnh báo khi phân kỳ): bắt vi phạm sau khi việc đã rồi; yêu cầu vi phạm vẫn có thể được dựng lên và phát đi. Bác bỏ vì vi phạm phải là điều không thể biểu diễn ngay ở tầng giao diện.
- **Lắp ghép theo sự kiện** (chỉ render lại khi có tín hiệu thay đổi): tồn tại một lớp bug bỏ sót tín hiệu — công cụ đăng ký giữa chừng phiên phát ra `tools/change` chứ không phải `system-prompt/change`, và bên cung cấp bên thứ ba có thể chẳng phát ra gì cả. Render theo từng bước cộng so sánh giá trị vẫn hoạt động vững chắc mà không cần kỷ luật tín hiệu nào.
- **Bộ mã hóa/giải mã header-delta tùy chỉnh** (sửa dòng hệ thống, sửa công cụ theo khóa là tên, thay thế toàn bộ cấu hình/tiền tố): giảm được số byte lặp lại, nhưng nhân đôi cách biểu diễn cùng với cơ chế diff/apply/fallback của nó. Snapshot đầy đủ chỉ giữ một cách biểu diễn khi phát lại.
- **Danh sách trường thay đổi mang tính tường thuật trên snapshot header**: có thể suy ra bằng cách so sánh các snapshot liên tiếp. `reason` vẫn được giữ lại, vì ranh giới thể hiện không thể suy ra từ giá trị snapshot.

## Hệ quả

- Một yêu cầu mà nhật ký không giải thích được thì không thể vô tình được dựng lên — dù bởi vòng lặp hay listener; biến đổi một yêu cầu đã dựng sẽ ném ngoại lệ; mọi thay đổi header đều là sự kiện nhật ký bền vững, diff được.
- Ngữ cảnh mà mô hình nhìn thấy dùng kênh tin nhắn đã ghi. `agent.inject()` và `additionalContexts` của công cụ đi vào inbox, chờ được nhận ở lượt sau. Ngữ cảnh buộc phải quyết toán cùng lô hiện đang được nhận thì do `agent/pre-step` trả về. Mỗi giá trị đi vào bước đều là một `user/message` bền vững có nguồn gốc, chỉ trả giá một lần và về sau trở thành tiền tố có thể lưu đệm, đổi lại là nó sẽ tích tụ trong lịch sử cho tới khi bị nén.
- Phần nội dung vẫn phải trả giá đầy đủ tại bên cung cấp là phần cố hữu và đã được ghi lại: quá trình nén (các sự kiện `compaction/*` và mục thay thế của nó), thay đổi thật sự về prompt, công cụ hoặc cấu hình (`request/header` với reason là `change`), hoặc ranh giới tiến trình có trôi lệch (snapshot `resume` khác nhau). Việc loại trừ reasoning-content của chính bên cung cấp do phía máy chủ quản lý.
- `agent/pre-step` là kênh tin nhắn cho yêu cầu hiện tại; còn sửa trực tiếp inbox là kênh cuối cùng đi vào các yêu cầu sau.
- Việc cắt gọn kết quả công cụ không cần cơ chế mới: một surface replace một-mục đã được ghi (`start === end`), mang theo `tool/result` đã cắt gọn dưới cùng một `callId` — thuộc họ nén, phát lại đúng, và việc vô hiệu hóa bộ nhớ đệm được cùng logic áp lực đó xử lý theo lô.
- Nhật ký phiên tăng thêm một snapshot `request/header` cho mỗi thể hiện vòng lặp, và tăng thêm snapshot khi có thay đổi thật sự. Nó lớn hơn bộ mã hóa/giải mã delta, nhưng so với nhật ký dày đặc phân mảnh thì vẫn rất nhỏ, và chỉ giữ một cách biểu diễn khi phát lại. `SESSION_FORMAT_VERSION` giữ nguyên `0`; sự kiện delta cũ bị từ chối chứ không di trú.
- Đầu ra kỳ vọng của snapshot thay đổi một lần (mỗi transcript (bản ghi văn bản) tăng thêm sự kiện header của nó); fixture (dữ liệu chuẩn bị cho kiểm thử) ghi vào hệ thống tệp được lưu ở dạng soạn thảo đã chuẩn hóa, còn tham số công cụ dùng đường dẫn tương đối theo cwd, vì việc phát lại chỉ khứ hồi các đường dẫn tham số độc lập với cwd.
