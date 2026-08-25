# Agent Note: Quy ước prompt dịch thuật v4 đã hiệu chỉnh

Status: implemented

[English](2026-07-23-translation-prompt-v4-contract.md) | Tiếng Việt

## Vấn đề

Việc tự động sinh file phía đối diện cần một prompt ổn định, có thể tái tạo được văn phong và cách chỉnh sửa đã được xác lập bởi bản dịch đã qua review thủ công. Chèn tài liệu hướng dẫn chung vào sẽ khiến input đã hiệu chỉnh cho model này thay đổi theo hướng dẫn cho con người hoặc cho agent, còn phản hồi không được đóng gói thì không thể mang riêng biệt bản nháp, nội dung tự kiểm tra và tài liệu đã sửa. Các thẻ phân đoạn kiểu XML thông thường còn xung đột với nội dung Markdown hợp lệ dùng để giải thích chính các thẻ đó.

## Quyết định

[Prompt dịch thuật](../../../../docs/i18n/translation-prompt.md) được commit vào repo là một tài nguyên pipeline đã được hiệu chỉnh. Renderer của nó chỉ chèn ngôn ngữ nguồn, ngôn ngữ đích và [bảng thuật ngữ](../../../../docs/i18n/terminology.md) hiện tại, và từ chối placeholder không xác định, thiếu hoặc sai cú pháp trước khi ghép request. Bộ ghép request giữ basename của file nguồn ngoài phạm vi model nhìn thấy trong prompt, và sắp xếp mỗi cặp tài liệu đầy đủ đã qua review thành một lượt user/assistant dạng plain text, đặt trước tài liệu nguồn thật. Template có thể chứa quy tắc hiệu chỉnh riêng cho từng model cụ thể, nhưng các quy tắc này phải phục tùng quy ước ghép cặp, thuật ngữ, cấu trúc và định dạng nhấn mạnh của repo.

Bản hiệu chỉnh v7 giữ nguyên giao thức v4 này, và làm rõ thứ tự ưu tiên chỉ thị: trước tiên giữ nguyên ý nghĩa nguồn và cấu trúc được bảo vệ, sau đó tuân theo bảng thuật ngữ, tiếp theo là văn phong hiệu chỉnh theo tài liệu vàng (gold) đầy đủ, cuối cùng mới áp dụng hướng dẫn chung và ví dụ inline. Model trước tiên soạn thảo theo cách của một kỹ thuật viên bản ngữ, sau đó đối chiếu từng câu với văn bản nguồn, giữ lại chủ thể thực hiện, điều kiện, phủ định, tình thái, điều kiện vòng đời, hướng, kênh kết quả, quyền sở hữu và số lượng. Hướng dẫn văn phong không được bịa ra chủ thể thực hiện, cũng không được đổi hình thái từ trong bảng thuật ngữ, khái niệm đã định nghĩa hoặc động từ theo quy ước chỉ để làm phong phú cách diễn đạt. Thuật ngữ không thể quyết định được vẫn giữ nguyên trong bản dịch, chỉ báo cáo là mục cần review trong đoạn review.

Phản hồi gồm ba đoạn cấp cao nhất theo thứ tự: `translation`, `review` và `final`. Bên tiêu thụ phản hồi suy ra basename của file đích dựa trên context file nguồn đã giữ lại, giữ nguyên YAML frontmatter tùy chọn ở đầu file, và chèn hoặc sửa dòng chuyển ngôn ngữ một cách máy móc ngay sau H1 đầu tiên trong `final`. Parser yêu cầu mỗi đoạn xuất hiện đúng một lần, từ chối nội dung nằm ngoài phong bì, và cho phép phản hồi có một lớp hàng rào Markdown `xml` ở ngoài cùng, vì model đôi khi chép lại nguyên hàng rào ví dụ trong prompt.

## Định dạng đóng gói phản hồi

Dòng phân định đoạn được giao thức wire format bảo lưu. Khi một dòng trong nội dung Markdown chỉ chứa thẻ phân định (có thể có backslash phía trước), serializer và model sẽ thêm một backslash nữa vào đầu dòng; parser thì chỉ bỏ đi một backslash. Cách escape giữ số lượng này cho phép cả thẻ phân định nguyên văn lẫn thẻ phân định đã escape đều roundtrip không mất dữ liệu, đồng thời không làm thay đổi các lần nhắc tới thẻ đó trong câu.

Quy ước có thể thực thi được cài đặt bởi [renderer, bộ ghép request, parser và bên tiêu thụ phản hồi](../../../../scripts/translation-prompt.ts). Unit test bao phủ hai chiều dịch, thứ tự request, kiểm tra placeholder, kiểm tra đường dẫn đích, ràng buộc thứ tự và số lượng đoạn nghiêm ngặt, phản hồi có hàng rào, thẻ được nhắc tới inline, dòng phân định trong nội dung Markdown, và việc sửa dòng chuyển ngôn ngữ cho cặp ngôn ngữ mới trong khi giữ nguyên YAML frontmatter. Một snapshot subprocess không cần key khóa chặt prompt đã ghép, năm lượt ví dụ đã qua review, và kết quả tiêu thụ của phản hồi đã ghi lại có YAML frontmatter sau khi được sửa theo đường dẫn đích.

## Các phương án thay thế đã cân nhắc

**Chèn `translation-rules.md` vào mỗi request.** Tài liệu này vừa ràng buộc con người và agent, vừa ràng buộc pipeline dịch tự động. Chèn nó vào sẽ khiến mỗi lần làm rõ quy phạm biên tập bị gắn chặt với hành vi model, và lấn át các ràng buộc prompt đã được hiệu chỉnh thủ công; do đó pipeline chỉ chèn bảng thuật ngữ có tính ràng buộc, và tự xác thực trực tiếp tài nguyên của chính nó.

**Dùng tài liệu XML CDATA nghiêm ngặt.** CDATA cung cấp cách đóng gói XML tổng quát, nhưng sẽ đưa vào một lớp giao thức lồng nhau, quy tắc escape `]]>` bổ sung, và hành vi parser XML mà quy ước ba đoạn vốn không cần. Việc dành riêng và escape sáu dòng phân định vừa có thể giữ được phân đoạn phản hồi đã hiệu chỉnh, vừa giữ nguyên nội dung Markdown tùy ý không thay đổi.

**Chỉ trả về bản dịch cuối cùng.** Nội dung đơn dễ parse hơn, nhưng sẽ bỏ đi bước sửa tường minh; bước này dùng để phát hiện lỗi văn phong, cấu trúc, thuật ngữ và dấu câu trước khi publish.

**Thay thế toàn bộ tài nguyên v4 đã hiệu chỉnh bằng prompt thử nghiệm mới hơn.** Các thử nghiệm sau này đã làm rõ một số quy tắc chung có giá trị, nhưng không vượt qua được đánh giá tài liệu đầy đủ nghiêm ngặt khi dùng làm phương án thay thế hoàn toàn. Tài nguyên production chỉ hấp thụ những cải tiến giữ được ví dụ hiện có và giao thức có thể thực thi.

**Yêu cầu sổ ghi chép thay đổi từ nháp sang bản chính thức nghiêm ngặt.** Yêu cầu mỗi thay đổi trong bản chính thức phải xuất hiện trong sổ ghi chép review dạng free-text sẽ tăng gánh nặng output, nhưng không chứng minh được rằng review có thể phát hiện được sự trôi dạt ngữ nghĩa cục bộ. Đoạn review ghi lại các sửa đổi thực tế, bản chính thức vẫn phải chịu kiểm tra cấu trúc xác định và review thủ công.

## Ảnh hưởng

Cách diễn đạt của prompt thuộc về hành vi có thể thực thi, do đó cần được review code, được validator prompt dịch thuật kiểm tra, và được xác thực bằng snapshot request/phản hồi có thể chạy được. Test tập trung khóa chặt các ví dụ inline cố định và các quy tắc bảo vệ v7 được chọn. Thư mục snapshot `translation-prompt-v4` đặt tên theo dòng giao thức renderer/parser ổn định, không phải theo số revision hiệu chỉnh hiện tại. Tài nguyên đã hiệu chỉnh và quy tắc dịch chung có thể tiến hóa riêng theo từng nhóm đối tượng của mình, nhưng review phải từ chối bất kỳ thay đổi nào xung đột với quy ước của repo. Việc escape dòng chỉ xuất hiện khi thẻ đóng gói trong tài liệu nguồn chiếm trọn một dòng; test của parser khóa chặt hành vi không mất dữ liệu này.
