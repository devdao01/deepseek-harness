# Agent Note: Tạo mỗi message thành một giá trị bất biến có định danh

Status: implemented

[English](2026-07-28-identified-immutable-message-values.md) | Tiếng Việt

## Vấn đề

Trước đây harness tồn tại nhiều biểu diễn giống-message khác nhau, mỗi loại theo một quy tắc định danh riêng. Input của agent (tác nhân) chỉ nhận được id liên kết inbox sau khi được agent loop chấp nhận, trong khi user message bền vững, assistant message, tool result và request message của model đều có thể không có định danh. Do đó, việc chấp nhận prompt nằm ở đâu đó giữa việc tạo message và việc thiết lập định danh; nội dung tương đương bị sao chép qua lại giữa sự kiện thời gian thực, sự kiện bền vững và request của model, mà không có một giá trị nào có thể định danh nó xuyên suốt cả vòng đời của message.

Điều này khiến định danh trở thành một side effect của việc định tuyến, chứ không phải một bất biến (invariant) của message. Bên sinh ra không thể tham chiếu một message trước khi gọi agent, hook prompt nhận nội dung và nguồn (source) một cách riêng biệt, phần chiếu (projection) về sau vừa phải dựng lại message, vừa phải quyết định xem id có tồn tại hay không. Tính bất biến cũng bắt đầu từ những ranh giới khác nhau: một phần input được agent loop đóng băng, một phần thì mãi tới lúc nối vào session mới được đóng băng, còn assistant output do bên cung cấp sinh ra lại dùng một hình dạng khác mang theo provider, model và trạng thái replay.

## Quyết định

`@deepseek-ai/dsh-llm` nắm giữ đúng một loại giá trị `Message` duy nhất, với `id`, `role`, `content` và `source` đều là trường bắt buộc. `MessageId` là định danh mờ (opaque), được chia sẻ giữa user message, assistant message và tool result message. Message có được id ngay lúc được tạo ra, sớm hơn cả việc định tuyến inbox, việc nhận (claim), việc sửa đổi ở pre-step, việc nối bền vững hay việc chiếu request. Cùng một id sẽ xuyên suốt qua mọi ranh giới biểu diễn.

`createMessage(input)` là ranh giới tạo chuẩn, dùng chung cho mọi role. Nó sinh ra `MessageId`, gỡ tham chiếu (dereference) role, content và source được truyền vào khỏi đối tượng của bên gọi, và đóng băng sâu (deep freeze) giá trị đó trước khi trả về giá trị đầy đủ. `createUserMessage({ content, source })` cố định role user cho prompt và bên sinh ra ngữ cảnh. `createAssistantMessage({ content, source })` cố định đồng thời role assistant và loại nguồn model, nên bên sinh ra output của model chỉ cần cung cấp content, cùng với provider, model và trạng thái replay tùy chọn. Input của mọi hàm trợ giúp tạo message đều không chứa id, nên bên gọi sẽ không vô tình ngụy trang việc tạo một message mới thành việc nhập (import) một message đã có sẵn. `freezeMessage(message)` là một ranh giới nhập hoặc chuyển đổi độc lập: nó gỡ tham chiếu và đóng băng sâu một message đã có định danh sẵn khỏi đối tượng của bên gọi, không sinh ra định danh thay thế nào.

Các hàm trợ giúp này nằm trong `dsh-llm`, cạnh từ vựng message cơ bản, vì contract đầy đủ của chúng chỉ phụ thuộc vào từ vựng đó. `createToolResultMessage()` cùng thuộc về đây với các hàm trợ giúp tạo khác: nó ghép tool call id với đúng khối tool result role-user và source, không phụ thuộc vào trạng thái hay sự kiện của session. `dsh-session` chỉ tiêu thụ message đầy đủ, không chịu trách nhiệm dựng chúng.

Interface `Agent` nhận `UserMessage` đầy đủ qua `followup`, `steer` và `inject`. Các thao tác này tuyệt đối không cấp phát hay trả về định danh; chúng đóng băng giá trị được nhập vào, trong khi bên gọi đã nắm giữ sẵn id của giá trị đó. Việc nhận (claim) inbox và `agent/pre-step` nhận trực tiếp message đó. Khi sửa nội dung sẽ tạo ra một giá trị thay thế đã đóng băng với cùng id, còn mỗi ngữ cảnh đính kèm đều là một `UserMessage` được tạo riêng, có id của chính nó.

Sự kiện sinh ra message bền vững sẽ lưu trữ message đầy đủ. `user/message` lưu trực tiếp `UserMessage` của nó; `assistant/message` và `tool/result` thì bọc message chuyên biệt theo role của mình cùng với các sự thật cục bộ của sự kiện như vị trí, mức sử dụng, lỗi hoặc dữ kiện hiển thị. Việc dẫn xuất của session sẽ trả về các giá trị đã đóng băng này, thay vì dựng lại message vô danh. Việc lắp ráp assistant sẽ tạo message có nguồn model khi response hoàn tất, việc thực thi tool sẽ tạo message có nguồn tool khi commit kết quả.

Các thao tác chỉ thay đổi biểu diễn của một message ngữ nghĩa đã tồn tại sẽ giữ nguyên id của nó, và trả về một giá trị đã đóng băng khác. Các thao tác tạo ra một message ngữ nghĩa mới thì sinh ra id mới. Do đó, việc sửa nội dung trong compaction (nén) sẽ giữ lại định danh của tool result bị sửa, còn checkpoint tóm tắt là một message mới.

## Các phương án thay thế đã cân nhắc

**Giữ id của message cơ bản ở trạng thái tùy chọn.** Cách này giảm được việc di trú fixture (dữ liệu chuẩn bị trước cho test), và cho phép provider hoặc hình dạng persistence tiếp tục ở trạng thái vô danh, nhưng cũng giữ lại sự mơ hồ ban đầu: mỗi bên tiêu thụ đều phải rẽ nhánh dựa trên việc định danh có tồn tại hay không, và không có kiểu nào chứng minh được rằng việc chấp nhận, ghi lại hay chiếu đã giữ lại định danh.

**Để việc gửi (delivery) của agent cấp phát id.** Cách này giới hạn định danh trong phạm vi liên kết inbox, nhưng cũng khiến lời gọi agent trở thành thời điểm sớm nhất mà bên sinh ra có thể định danh message của chính mình. Như vậy, trước khi delivery trả về, việc dựng prompt, đính kèm UI và việc điều phối xếp hàng/loại bỏ đồng bộ đều cần khớp nội dung, hoặc dùng token ngoài băng (out-of-band).

**Để mỗi sự kiện bền vững cấp phát id mới.** Cách này cung cấp được định danh cho message bền vững, nhưng lại cố ý cắt đứt mối liên kết của nó với input thời gian thực, và khiến request replay trông như thể chứa các message khác nhau. Định danh thuộc về giá trị ngữ nghĩa, chứ không thuộc về từng lớp bọc mang nó.

**Chỉ đóng băng lúc agent hoặc session chấp nhận.** Cách này bỏ được bước tạo hàm trợ giúp, nhưng lại để lại một khoảng thời gian có định danh nhưng vẫn mutable, mà code của bên gọi có thể thay đổi ý nghĩa gắn với id đó trong khoảng thời gian này. Quyết định này khiến "có id" và "là một snapshot bất biến" cùng đúng một lúc.

## Hệ quả

Mỗi bên sinh message đều phải chọn tường minh giữa tạo (create) hoặc nhập (import), test cũng sẽ dựng giá trị đầy đủ, thay vì bản ghi content/source không đầy đủ. Việc sinh UUID được đẩy lên sớm hơn, về đúng điểm tạo ngữ nghĩa ban đầu, nên fixture xác định (deterministic) đã cung cấp sẵn id sẽ dùng `freezeMessage()`, thay vì `createMessage()`.

Sự kiện inbox thời gian thực, sự kiện bền vững, lịch sử dẫn xuất và request của model đều có thể liên kết cùng một message, mà không cần so sánh nội dung hay dùng id riêng cho từng lớp bọc. Chính sách input đang chờ xử lý và việc dọn dẹp đính kèm UI có thể so sánh `MessageId` trước khi turn tồn tại, sau khi nhận (claim) thì định danh đó được giữ lại trong turn đã mở. Việc đóng băng sâu ngăn không cho bên sinh ra, hook hay bên quan sát thay đổi giá trị message sau khi định danh đã được thiết lập.

Biểu diễn dùng chung đã loại bỏ sự phân chia `UserMessageData`/`AgentMessage` cũ, và đặt provider, model và trạng thái replay tùy chọn vào source message đã định kiểu. Lớp bọc sự kiện vẫn giữ những sự thật không thuộc về ngữ nghĩa của message, ví dụ vị trí turn và step, mức sử dụng token, định danh lỗi tool nội bộ và metadata hiển thị.

Unit test cho message và các hàm trợ giúp sẽ chốt cứng việc định danh tức thời, việc gỡ tham chiếu input, tính bất biến sâu, và việc giữ lại id khi nhập. Test của agent loop sẽ chốt cứng hành vi định danh xuyên suốt qua việc chấp nhận, vòng đời inbox, việc nối bền vững, sửa nội dung và hủy; test của session sẽ chốt cứng hành vi dẫn xuất đã đóng băng và việc thay thế giữ lại định danh.

## Liên quan

- [Hợp nhất định tuyến gửi cho agent, và gộp ngữ cảnh đã inject](2026-07-22-unified-send-and-coalesced-user-messages.md) — ghi chú này thay thế chi tiết về biểu diễn input và việc agent cấp phát id trong đó, đồng thời giữ lại quyết định định tuyến của nó.
- [Request có thể dựng lại được](2026-07-05-reconstructable-requests.md) — session log vẫn là nguồn thẩm quyền cho mỗi input model có thể thấy.
