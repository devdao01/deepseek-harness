# Agent Note: Hình thái context do bên sản xuất khai báo

Status: implemented

[English](2026-08-05-context-form-vocabulary.md) | Tiếng Việt

## Vấn đề

Mọi `user/message` phi người dùng đã được ghi lại đều render qua cùng một vùng nội dung: tuần tự hóa toàn bộ message thành JSON inline. Người đọc bung một dòng ra sẽ thấy `{ "content": [ { "type": "text", "text": "…\n\n…" } ], "source": { … } }` — việc escape đã nén thứ duy nhất đáng đọc (đoạn văn hướng tới model) thành một dòng, còn các trường của bên sản xuất thì nằm chung trong cùng object JSON đó.

Việc ghi bên sản xuất lên thanh tiêu đề ([quyết định về nguồn và dấu steer](2026-08-04-web-context-source-and-steer-marks.md)) đã giải quyết câu hỏi «ai thêm cái này vào». Nó không giải quyết được «cái được thêm vào là thứ gì», vì thông tin đó vốn không có trong log. Context được tiêm vào không phải một hình dạng duy nhất: `AGENTS.md` đã đối chiếu, thư mục các skill khả dụng, snapshot chính sách runtime, báo cáo của subagent khác nhau chẳng kém gì thẻ terminal khác thẻ diff, vậy mà cả bốn đều hiện ra dưới dạng cùng một bức tường JSON bị escape.

Tầng trình bày tool đã giải quyết đúng bài toán hình dạng này từ lâu. `ToolCallView` chỉ có ba loại thẻ chứ không phải mỗi tool một loại, và chính tool tự khai báo lần gọi này thuộc loại nào. Context không có thứ tương ứng: vừa không có bộ từ vựng hình thái, vừa không có cách nào để bên sản xuất khai báo mình phát ra loại nào.

## Quyết định

`MessageSource` bổ sung một trường tùy chọn do bên sản xuất khai báo là `form: ContextForm` — một bộ từ vựng nhỏ có nhãn về **hình dạng** của thông tin, độc lập với `kind`:

- `kind` trả lời **do ai tạo ra**, không mang theo lựa chọn trình bày.
- `form` trả lời **đây là thông tin thuộc hình thái nào**. Nhiều bên sản xuất có thể dùng chung một hình thái, và một bên sản xuất cũng có thể phát ra nhiều hình thái trong cùng một session.

Bộ từ vựng này thuộc về ngữ nghĩa, tuyệt đối không dính đến thị giác. Các giá trị chỉ phát biểu rằng «nội dung là chỉ dẫn của một tệp nào đó» hoặc «là thư mục các mục khả dụng»; màu sắc, biểu tượng, thứ tự sắp xếp, trạng thái thu gọn mặc định thuộc về bên tiêu thụ và không được lọt vào union này. Nó lớn dần từng bước theo việc mỗi bên sản xuất bổ sung các trường có cấu trúc mà hình thái của mình cần. Các hình thái đã khai báo:

**`instructions`** — chỉ dẫn đọc ra từ tệp trong workspace. `agent-instructions` khai báo hình thái này cho cả baseline lúc khởi động lẫn các phần tăng thêm về sau; trường `changes[]` sẵn có của nó vốn đã mang đường dẫn, hành động và digest cần cho việc trình bày, nên không thêm trường mới. Vùng nội dung liệt kê các tệp đã đối chiếu ở phía trên phần thân, và giữ nguyên trạng lớp bọc `<system-reminder>`: lớp bọc đó vốn là một phần những gì model đọc được, giấu nó đi sẽ làm sai lệch request này.

**`catalog`** — thư mục các mục khả dụng trong session này, được phát hành lại mỗi khi có thay đổi. `dsh-tool-skill` chuyển từ kind `plugin` dùng chung sang nguồn `skill-catalog` của riêng nó, mang theo `entries` (các cặp `name`／`description` của lần phát hành này) cùng `update` khi thay thế, và bên tiêu thụ render `update` thành thông báo thay thế. Vùng nội dung liệt kê thẳng các mục này, không còn phải phân tích ngược khối `<available_skills>` từ đoạn văn.

Các mục ghi lại sự kiện phát hành ở dạng **chưa escape**. Việc escape kiểu giả-XML thuộc về lớp khung `<available_skills>` vốn được dựng cho model, nên chỉ áp dụng khi render lớp khung ấy và không bao giờ được lưu trữ; nếu không, để hiển thị đúng một mô tả có chứa `<`, bên tiêu thụ sẽ phải biết cách mã hóa của lớp khung, và kiến thức về lớp khung mà quyết định này vừa gỡ bỏ sẽ rò rỉ trở lại dưới hình thức khác. `escapeText` là hàm tất định và đơn ánh, nên lấy digest trên các mục chưa escape hoàn toàn tương đương với trước đây, ngữ nghĩa phát hành lại không đổi, và văn bản hướng tới model không đổi một byte nào.

Lần chuyển đổi này đồng thời dời **danh tính** của thư mục: digest dùng cho việc phát hành lại nay phủ lên các mục bền vững chứ không phải văn bản đã render, nhờ đó lớp bọc hướng tới model không còn chi phối được việc có cần phát hành lại hay không, và đoạn logic cắt văn bản để tách mục ra khỏi message đã ghi cũng bị xóa theo. Nếu trong một session được khôi phục mà thư mục mới nhất có trước thay đổi này, nó sẽ được phát hành lại một lần — lập trường tiền phát hành cho phép làm vậy. Có một tình huống không tự lành: khi bản thư mục định dạng cũ đó là bản duy nhất và view hiện tại không có skill nào, plugin không nhìn thấy thư mục đã phát hành nên cũng không phát ra tombstone, và model sẽ giữ lại một bản thư mục cũ mà không ai thay thế. Lập trường tiền phát hành («backend từ chối định dạng cũ trên đĩa») cho phép điều này; ở đây ghi lại đúng sự thật thay vì chỉ viết đường đi lạc quan.

**`snapshot`** — trạng thái hiện tại sẽ bị các snapshot sau này của cùng bên sản xuất thay thế. Snapshot runtime, `time-context`, `tmux-context` khai báo hình thái này. `renderContextSections()` phơi ra các đóng góp có tên tại thời điểm lắp ráp — `renderContextSnapshot()` vốn dĩ chỉ ghép chúng lại cho model — nhờ đó vùng nội dung có thể quy từng đoạn về đúng hệ thống con đã tạo ra nó, mà không phải cắt đoạn văn đã ghép sẵn. Hai bên sản xuất đơn-đóng-góp mỗi bên ghi một đoạn. Dấu «đã xóa sạch» của snapshot runtime không có đóng góp nào để quy về, nên không khai báo hình thái.

**`notice`** — một lời giải thích dùng một lần về việc vừa xảy ra. `tool-jobs`, phần kết của `tool-goal`, việc chuyển `plan-mode` và nhắc nhở `repeat-tool-reminder` đều khai báo hình thái này kèm `summary`, và bản tóm tắt đó xuất hiện ngay trên dòng ở **trạng thái thu gọn**: toàn bộ ý nghĩa của notice là đọc hết được mà không cần bung ra. Bản tóm tắt tự giới hạn độ dài khi đầu vào của nó là văn bản do bên gọi cung cấp (label của task và detail trạng thái bản thân chúng không bị ràng buộc độ dài). Thay đổi trạng thái Goal vẫn là sự kiện `goal/change` do tầng domain nắm giữ, chứ không phải context của model, nên không khai báo form.

**`relay`** — message do một agent khác gửi cho agent này. Cả hai nguồn định hướng của subagent đều khai báo hình thái này; bên gửi được trình bày bằng id session mờ đục đã được nguồn ghi lại, vì client này không phân giải được nó thành tiêu đề.

**`recall`** — tư liệu mang sang từ log của một session khác. `session-reference` khai báo hình thái này và không cần thêm trường mới: các reference của nó đã ghi lại nhãn, số mục giữ lại và số mục lược bỏ, cùng dấu cắt bớt, và vùng nội dung đặt những thông tin đó lên trên cùng — context được gợi lại là có giới hạn ngay khi đi vào, và một tấm thẻ giấu đi số mục bị lược bỏ sẽ phóng đại những gì model thực sự nhận được.

Cả hai bộ đọc đều theo nguyên tắc **được ăn cả ngã về không**: một mục không đọc được là đủ để coi cả bản ghi là không dùng được, thay vì vứt bỏ mục đó — vùng nội dung vốn thay thế văn bản hướng tới model thì không được đưa ra câu trả lời tự tin nhưng khuyết thiếu về «model đã đọc những gì». Dấu hình thái trên dòng báo cáo hình thái thực sự được render, chứ không phải hình thái được khai báo.

Phía bên sản xuất giữ đúng tư thế đó với cùng khối dữ liệu bền vững. `catalogHistory` đọc `source.entries` từ `agent.session.events`, còn khi khôi phục hoặc fork thì nó đến từ seed JSONL／SQLite, và việc kiểm tra seed chỉ bảo đảm nguồn là một object có `kind` khác rỗng, không kiểm tra bất kỳ trường đặc thù nào theo kind. Vì vậy thư mục không đọc được sẽ bị bỏ qua như «không phải bản ghi của plugin này» — đúng tư thế vốn có của phần digest nội dung bị thay thế; ném lỗi ở đó sẽ khiến mọi bước sau của session ấy hỏng tại điểm muộn nhất và khó định vị nhất.

Mọi thứ còn lại — kể cả các hình thái mà bản UI này không trình bày, nguồn không khai báo hình thái, và `catalog` có mục không dùng được — đều render bằng vùng nội dung **opaque**: hiển thị văn bản hướng tới model theo đúng các dấu xuống dòng thật, rồi liệt kê dữ liệu nguồn còn lại thành các trường. opaque là mặc định do tài liệu quy định; quy ước yêu cầu dùng nó cho những trường hợp không được hỗ trợ này. Log được khôi phục, log fork, log do bên ngoài ghi đều phải render được, bất kể bên sản xuất của chúng có được mount ở đây hay không — đây cũng chính là lý do thông tin phân loại phải nằm trong nguồn bền vững, chứ không nằm trong một bảng tra ở client lấy bên sản xuất làm khóa.

## Vì sao không làm registry presenter

Quy ước trình bày tool ghép bộ từ vựng của nó với `presentCall(args)`, tức một hàm thuần mà mỗi tool cài đặt ở phía host. Context cố ý không đặt ra thứ tương ứng, vì nguồn gốc của đầu vào khác nhau: `args` của tool do **model** sinh ra theo schema hướng tới model nên không thể né bước phiên dịch; còn `source` của context do chính **plugin bên sản xuất** dựng nên, không chịu ràng buộc bên ngoài nào, hoàn toàn có thể ghi thẳng những sự kiện cần cho việc trình bày. Thêm một tầng registry chỉ mua về một bước phiên dịch mà không ai cần, trong khi cái giá phải trả là một điểm tính toán ở host, một trường wire cho mỗi message context, và mỗi package bên sản xuất đều phải xuất bundle cho trình duyệt (cổng kiểm tra độ thuần của client cấm package host đóng góp component).

## Các phương án đã cân nhắc

**Ánh xạ kind của nguồn sang bộ render ở phía client.** Viết ra thì tiết kiệm nhất và cũng không phải đổi định dạng, nhưng nó đẩy kiến thức của bên sản xuất trở lại client: từ đó về sau, mỗi lần thêm một kind mới đều phải phát hành lại client mới render ra được thứ gì khác opaque, còn log từ bên ngoài thì không tài nào phân loại được. Nó cũng làm tái xuất hiện đúng kiểu ràng buộc mà [quyết định về nguồn và dấu steer](2026-08-04-web-context-source-and-steer-marks.md) vừa gỡ bỏ cho phần tên.

**Tái sử dụng `kind` làm hình thái.** Một trường phân biệt duy nhất thì đơn giản hơn, và `agent-instructions` vốn cũng tương ứng một-một với hình thái của nó. Nhưng khi nhiều bên sản xuất dùng chung một hình thái, thiết kế này không giữ được đầy đủ thông tin: hiện có ba bên sản xuất phát ra snapshot runtime, gộp chúng vào một kind rồi thì không còn phân biệt được message nào do bên sản xuất nào cung cấp. Hai trường độc lập `kind` và `form` vừa ghi lại được bên sản xuất, vừa cho phép nhiều bên sản xuất dùng chung một cách trình bày.

**Để client phân tích đoạn văn hướng tới model.** Các mục và phần chia theo tệp quả thật có cấu trúc nhìn thấy được trong văn bản. Phân tích chúng sẽ ràng buộc phần trình bày vào cách diễn đạt của prompt, khiến mỗi lần sửa câu chữ lại âm thầm làm hỏng một tấm thẻ — đây cũng chính là lý do danh tính của thư mục được dời khỏi văn bản.

**Render instructions thành Markdown.** Phần thân vốn dĩ là tệp Markdown, render ra sẽ dễ đọc hơn. Nhưng văn bản đồng thời mang lớp bọc `<system-reminder>`, và bộ render Markdown sẽ coi đó là HTML thô rồi loại bỏ, khiến vùng nội dung Markdown âm thầm giấu đi một phần những gì model đọc được. Hoãn lại cho đến khi bên sản xuất ghi nội dung có cấu trúc theo tệp.

## Kiểm thử

- `packages/client/runtime` cố định phép chiếu hình thái, bao gồm cả các giá trị không xác định, giá trị rỗng, sai kiểu và thiếu, tất cả đều phải hạ cấp về opaque.
- `packages/client/ui-conversation` cố định từng vùng nội dung một: việc giữ dấu xuống dòng và các trường nguồn của opaque, danh sách tệp và lớp bọc nguyên trạng của instructions, danh sách mục của catalog, cùng việc catalog có mục không dùng được rơi về opaque.
- `packages/skill/tool-skill` cố định nguồn mới ở lần phát hành đầu và khi thay thế, hành vi phát hành lại do các mục bền vững điều khiển, và việc thư mục bền vững dị dạng không làm gián đoạn việc quan sát các bước.
- Kịch bản Web seeded-history đã lắp ráp, không cần khóa, bung một context `instructions` thật trong Chromium và khẳng định danh sách tệp, lớp bọc nguyên trạng cùng hình học của mục đã bung không đổi. `catalog` không có phần phủ ở trạng thái đã lắp ráp: bộ giàn giáo cô lập không phát hành skill nào, nên không có thư mục nào đi vào được kịch bản trình duyệt.

## Hệ quả

- Người đọc biết được cái gì đã được thêm vào mà không cần bung ra, và khi bung ra thì cũng không còn phải đọc JSON bị escape nữa.
- `MessageSource` bền vững nay ghi lại hình dạng nội dung, bên cạnh kind của bên sản xuất và các trường của nó. Ranh giới này là chịu lực: chỉ đặt vào đó sự kiện và hình dạng, tuyệt đối không đặt phần trình bày. Bên sản xuất muốn có tấm thẻ đẹp hơn thì nên ghi lại sự kiện tốt hơn.
- Danh tính của thư mục không còn phụ thuộc vào đoạn văn hướng tới model, xóa bỏ được đường đi cắt văn bản vốn có thể nhầm «đổi câu chữ» thành «đổi nội dung».
- Ngoài hai cầu nối hook, mọi bên sản xuất đã phát hành nay đều khai báo hình thái. Cầu nối giữ opaque theo đúng thiết kế: nội dung của chúng là văn bản tùy ý do chương trình bên ngoài in ra, không thể hứa hẹn bất kỳ hình dạng nào. Kind không xác định và bản ghi không đọc được cũng rơi vào đây.
- `ContextFormed` phân biệt theo `form`, nên bên sản xuất không thể khai báo một hình thái khi thiếu những sự kiện mà hình thái đó cần — `notice` không có summary, `snapshot` không có sections, đều sẽ lỗi biên dịch.
