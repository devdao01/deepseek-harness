# Agent Note: Markdown trợ lý an toàn trong hội thoại Web

Status: implemented

[English](2026-07-23-web-assistant-markdown.md) | 中文

## Vấn đề

Hội thoại Web giữ nguyên văn bản nguồn Markdown của trợ lý qua event phiên, replay lịch sử và tích lũy stream, nhưng nguyên hàm văn bản ở lớp trong cùng của nó render văn bản nguồn theo nghĩa đen (literal). Nếu sửa nguyên hàm dùng chung, message người dùng và steering (chỉ dẫn giữa chừng) cũng sẽ bị định dạng theo; nếu parse lúc runtime, sẽ trộn trạng thái hiển thị vào bản chiếu (projection) phiên không phụ thuộc React.

## Quyết định

`@deepseek-ai/dsh-client-ui-primitives` export `MarkdownText`, dùng làm renderer văn bản trợ lý không đáng tin cậy; `ui-conversation` chỉ chọn renderer này cho khối `text` của trợ lý. Message lịch sử đã hoàn thành, đuôi stream output và output một phần bị ngắt đã dùng chung `AssistantMarkdown`, do đó không cần thay đổi event hay snapshot, chúng sẽ tự động dùng cùng renderer. Message người dùng và steering tiếp tục dùng `MessageText`, giữ nguyên việc render theo nghĩa đen.

`MarkdownText` parse bằng `mdast-util-from-markdown` cộng extension GFM micromark, và render cây mdast qua renderer riêng trong package, parse gia tăng trong lúc lượt đang stream ([Note renderer AST gia tăng](../architecture/2026-08-06-web-markdown-incremental-ast-renderer.md) sở hữu cơ chế này cùng quy ước nhất quán DOM của nó). Nó bao phủ các khối CommonMark, cùng bảng GFM, danh sách task, gạch ngang và auto-link, và không parse HTML thô. Một extension micromark attention tái sử dụng resolver CommonMark, đồng thời cho phép chuỗi liên tiếp ít nhất hai dấu sao đóng sau dấu câu Unicode, với điều kiện ngay sau đó là văn bản CJK. Ngoại lệ này bao phủ văn bản in đậm kết thúc bằng dấu câu trong văn bản CJK không có khoảng trắng, cả trong lúc stream lẫn sau khi hoàn thành; nhấn mạnh một dấu sao, trường hợp liền kề văn bản không phải CJK, văn bản nguồn đã escape, code và công thức toán vẫn theo hành vi parse gốc từ thượng nguồn. Code block dạng fenced được định tuyến qua `CodeBlock` dùng chung; component này dùng singleton shiki phía client (`--shiki-*` token) để highlight cú pháp đã đăng ký, nếu không sẽ fallback về văn bản đơn cách đều (monospace) thuần. Trong lúc lượt đang stream, fenced code giữ ở nhánh văn bản thuần, để tránh việc tách token lại toàn bộ fence đang lớn dần mỗi khi nhận một phân đoạn mới.

Khoảng cách thị giác, bảng, link, blockquote, code inline và khung ngoài code block tuân theo `@deepseek/md` của deepsuite (`markdown.css` / `code-block.css`), và dùng chung bộ token `--dsw-alias-markdown-*`, `--dsw-font-markdown-*`, `--dsw-alias-border-l*` và `--dsw-alias-label-*`. Link dùng `--dsw-alias-state-business-primary` (stylesheet của deepsuite dùng `--dsw-alias-brand-text`, chỉ có màu xanh dưới newDesign; design-platform giữ brand-text ở màu gần đen, ở đây không đổi màu lại). Khi một token code inline hoàn toàn cấu thành từ một URL HTTP(S) tuyệt đối, khung ngoài code của nó sẽ chứa một anchor liên kết ngoài an toàn, có thể focus bằng bàn phím, giống hệt link thông thường; port, path và query text giữ nguyên, trong khi lệnh, URL không hoàn chỉnh, scheme khác và code dạng fenced vẫn không trở thành link. `CodeBlock` cung cấp banner ngôn ngữ và control sao chép (`Copy` / `Copied`). Văn bản đã hoàn thành render KaTeX qua extension toán học của cú pháp cuối cùng; `mathCompatibility` ánh xạ `\(...\)`, `\[...\]` và `$$...$$` cấp khối trên cùng một dòng thành cùng một bộ node AST toán học chuẩn. Đây là một lớp tương thích parser phạm vi nhỏ, không phải viết lại bằng regex, cũng không sửa output model sai định dạng. Stream giữ nguyên render theo nghĩa đen trước khi hoàn thành, tránh công thức chưa hoàn chỉnh lóe lên lỗi. Citation capsule, anchor tiêu đề, biến thể markdown thinking-small, và ký hiệu task tùy chỉnh □/☑ vẫn nằm ngoài phạm vi; danh sách task GFM tiếp tục dùng checkbox gốc.

Dependency này được khai báo tường minh trong `ui-primitives`; vì thư viện thuần này được Web shell nạp trước, parser và highlighter sẽ trở thành một phần của bundle trình duyệt khởi tạo.

## Chính sách output không đáng tin cậy

Đích link do trợ lý sinh ra chỉ giới hạn ở URL HTTP, HTTPS và mailto tuyệt đối. Link HTTP(S) mở trong tab mới, kèm `rel="noopener noreferrer"`; đích tương đối và giao thức khác sẽ render thành văn bản không thể điều hướng. Ảnh Markdown tuân theo [chính sách ảnh từ xa](2026-07-30-web-remote-markdown-images.md) độc lập. Vì pipeline không đưa vào parser HTML, HTML thô vẫn là văn bản nguồn không có hiệu lực. Output Shiki là cây span tĩnh sinh từ văn bản fenced (không chứa script hay HTML người dùng).

Code dạng fenced và bảng GFM đều tự xử lý tràn ngang, do đó nội dung dài không thể làm phình cột hội thoại.

## Các phương án thay thế đã cân nhắc

**Nâng cấp dependency phát triển mdast và micromark hiện có thành dependency chính thức, và tự duy trì một walker React tùy chỉnh.** Phương án này tránh đưa vào hệ parser mới, nhưng sản phẩm phải tự chịu trách nhiệm cho từng ánh xạ node, extension GFM và nhánh render nhạy cảm về bảo mật. Renderer React chuyên dụng giao việc duyệt cây này cho thượng nguồn duy trì, đồng thời giữ đường xử lý từ AST sang React. *Sau đó bị bác bỏ do bằng chứng mới — parse gia tăng lúc stream cần input cấp AST mà việc bọc chuỗi thuần không thể cung cấp; quyết định này thuộc sở hữu của [Note renderer AST gia tăng](../architecture/2026-08-06-web-markdown-incremental-ast-renderer.md).*

**Thay `MessageText` bằng render Markdown.** Điều này sẽ gây tác dụng phụ định dạng prompt người dùng và steering. Trước khi sản phẩm chọn hành vi này một cách rõ ràng, các input này vẫn render theo nghĩa đen.

**Parse Markdown vào snapshot phiên.** Điều này sẽ biến node React hoặc AST tầng hiển thị thành trạng thái runtime bền vững, và đưa lại ranh giới mô hình giữa output cuối cùng và output đang stream. Việc parse vẫn ở lại các node lá của tầng hiển thị.

**Bật HTML thô qua khử độc (sanitization).** HTML thô hiện không có nhu cầu sản phẩm, và sẽ mở rộng ranh giới nội dung có thể thực thi, do đó vẫn giữ tắt, không cần thêm dependency sanitizer. Ảnh từ xa bị ràng buộc bởi [chính sách ảnh](2026-07-30-web-remote-markdown-images.md) sau này.

**Chuyển pipeline Prism `highlight.css` và mdast của deepsuite sang.** Tính nhất quán về hình thức do CSS Modules và token `--dsw-*` dùng chung đảm nhiệm; highlight vẫn dùng danh sách cho phép shiki hiện có, để client không phải đưa vào bộ highlight thứ hai hay quy ước class Prism.

**Tiền xử lý văn bản nguồn Markdown để xử lý ranh giới dấu câu CJK, hoặc sửa node văn bản sau khi parse.** Việc viết lại văn bản nguồn phải tái tạo quy tắc escape, code, công thức toán và delimiter trước khi parser nắm được các phân biệt này; việc sửa node văn bản thì đã mất một phần ý định văn bản nguồn, cũng không thể kết hợp với các node inline đã parse. Mở rộng attention tại ranh giới tokenizer giữ nguyên resolver thượng nguồn, và giới hạn khác biệt vào điều kiện áp dụng của delimiter.

**Yêu cầu model xuất link chuẩn, và giữ code inline dạng URL không thể tương tác.** Hướng dẫn output không thể thống nhất giữa phản hồi đã lưu bền vững và phản hồi từ model bên thứ ba, còn code inline là cách phổ biến để đánh dấu endpoint dưới dạng nghĩa đen. Chỉ nhận diện giá trị HTTP(S) tuyệt đối hoàn chỉnh tại ranh giới render của code inline, giúp áp dụng chính sách link không đáng tin cậy hiện có trong khi vẫn giữ ngữ nghĩa code.

## Hệ quả

Phản hồi trợ lý được render nhất quán thành Markdown ngữ nghĩa cả trong lúc stream lẫn khi replay, trong khi thẻ tool, dòng reasoning, tương tác, bong bóng người dùng và giao thức host giữ nguyên. Sau mỗi lần cập nhật tích lũy, stream chỉ parse lại đuôi không ổn định; Markdown chưa hoàn chỉnh có thể tạm thời thay đổi cấu trúc đuôi, nhưng đuôi độc lập giới hạn phạm vi invalidate của React, và event cuối cùng cũng không chuyển đổi renderer. Code inline dạng URL sẽ trở nên có thể điều hướng mà không thay đổi văn bản nghĩa đen hiển thị, trong khi code dùng scheme không an toàn hoặc trộn lẫn nội dung khác vẫn không thể tương tác. Code fence dùng chung khung ngoài và đường sao chép với tool và bảng chi tiết. Web shell khởi tạo bao gồm parser Markdown, runtime GFM, KaTeX và danh sách cho phép shiki; các tầng citation, anchor và thinking-small vẫn được hoãn lại.
