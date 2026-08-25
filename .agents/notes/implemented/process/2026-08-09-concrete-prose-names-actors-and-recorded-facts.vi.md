# Agent Note: Hành văn cụ thể nêu rõ chủ thể thực hiện và sự kiện đã ghi nhận

Status: implemented

[English](2026-08-09-concrete-prose-names-actors-and-recorded-facts.md) | 中文

## Vấn đề

Văn bản trong repo dùng tên loại trừu tượng, nhưng sự kiện cụ thể mà người đọc cần biết lại khác nhau tùy trường hợp. Cùng một tên có thể chỉ đến seq sự kiện trước đó mà thao tác thay thế tham chiếu, provider và model tạo ra message, caller cung cấp context, file cung cấp một dòng cấu hình, hoặc CI job build ra một binary cụ thể. Người đọc buộc phải xem code mới biết câu văn đang cam kết sự kiện nào.

Thay tên trừu tượng này bằng một tên trừu tượng khác vẫn giữ nguyên sự mơ hồ đó. Việc đổi tên type, field và thành viên protocol trong lúc chỉnh sửa hành văn lại làm thay đổi các quy ước không liên quan đến vấn đề hành văn.

## Quyết định

Văn bản do repo bảo trì viết trực tiếp ra chủ thể thực hiện, hành động, nguồn, sự kiện, field, file hoặc process mà quy ước trong ngữ cảnh hiện tại cần đến. Câu văn nói rõ điều gì đã được ghi nhận, và do ai hoặc cái gì ghi nhận. Người viết cũng cần tự kiểm tra xem mình có dùng những từ này khi giải thích cùng vấn đề đó cho đồng nghiệp hay không; nếu không, thì thay thế chúng.

Quy tắc này áp dụng cho Markdown, README, Agent Note đang hoạt động, JSDoc và comment, prompt, thông báo chẩn đoán và chuỗi hiển thị cho người dùng. Việc rà soát đánh giá từng câu riêng lẻ, không thay thế đồng loạt một thuật ngữ bằng một từ đồng nghĩa ưa thích trên toàn repo. Câu đã chỉnh sửa giữ lại chủ thể thực hiện, hành động, điều kiện, thứ tự, tình thái, ngoại lệ, quy thuộc, hành vi khi thất bại và hệ quả.

Trừ khi có một nhu cầu độc lập khác yêu cầu phối hợp đổi tên quy ước, định danh code chính xác, API công khai, field bền vững, thành viên protocol, tên type, tiêu đề có tham chiếu bên ngoài và tên file đều giữ nguyên. Văn bản xung quanh chúng nói trực tiếp về field hoặc hành vi của chúng. Tài liệu và danh mục được tạo tự động sẽ cập nhật sau khi file nguồn bảo trì chúng được sửa đổi.

Trước khi dùng `contract`, `boundary` hoặc `shape`, người viết cần xác nhận câu văn có thực sự chỉ đến quy tắc, thao tác, cấu trúc dữ liệu, tập field, điểm kiểm tra, thời điểm, API hoặc điều kiện thất bại cụ thể hơn hay không. Precondition, postcondition, invariant, cam kết tương thích và các nghĩa vụ khác mà caller, callee, bên triển khai, provider, producer hoặc consumer phụ thuộc vào vẫn có thể gọi chính xác là `contract`. Ranh giới security, trust, wire, process, serialization, transaction hoặc lifecycle thực sự vẫn có thể gọi chính xác là `boundary`. Khi bản thân hình thức cấu trúc là chủ đề, và các từ hẹp hơn như field, schema, type, union variant, bố cục file hoặc hình thức export không thể diễn đạt sự kiện, vẫn có thể dùng `shape`. Trừ khi có một nhu cầu độc lập khác yêu cầu phối hợp đổi tên, tên code và tên API chứa các từ này giữ nguyên.

Quyết định này bổ sung cho quyết định [Phân cấp tài liệu và ngân sách số từ](2026-07-04-doc-tiers-and-budgets.md); quyết định sau vẫn tiếp tục quy định vị trí nội dung, hình thức tài liệu và ngân sách số từ.

## Phương án thay thế từng cân nhắc

**Cấm toàn bộ từ trong một danh sách cố định.** Không chấp nhận: một từ có thể là định danh chính xác, cũng có thể là từ rõ nghĩa nhất cho một quy ước khác. Ví dụ, invariant mà caller và callee phụ thuộc vào thuộc về một quy ước có thật, ranh giới process hoặc ranh giới protocol cũng biểu thị một ranh giới có thật. Rà soát từng câu có thể tìm ra sự mơ hồ mà không từ chối những tên hợp lệ.

**Thay mọi tên trừu tượng bằng "nguồn", "gốc" hoặc "metadata".** Không chấp nhận: một tên trừu tượng khác vẫn khiến người đọc phải tự đoán câu văn đang chỉ đến file, caller, seq sự kiện, tổ hợp provider／model, commit hay build job.

**Đổi tên mọi định danh khớp mẫu khi chỉnh sửa văn bản.** Không chấp nhận: làm văn bản rõ ràng hơn không thể là lý do để tiến hành di chuyển API, protocol, định dạng bền vững, type hoặc file không liên quan. Những thay đổi đó cần review và quyết định riêng của từng bên tiêu thụ.

## Hệ quả

Tài liệu và thông báo chẩn đoán có thể dùng thêm vài từ, nhưng mỗi câu mô tả sẽ cho người đọc biết giá trị nào hoặc quá trình thực thi nào liên quan, mà không cần xem source code. Việc rà soát văn bản toàn repo phải phân loại theo ý nghĩa cụ thể của từng câu, không được thay thế một cách mù quáng. File đối chiếu song ngữ giữ nguyên cùng sự kiện cụ thể; bản sao được tạo tự động chỉ làm mới sau khi file nguồn quy thuộc của nó thay đổi.
