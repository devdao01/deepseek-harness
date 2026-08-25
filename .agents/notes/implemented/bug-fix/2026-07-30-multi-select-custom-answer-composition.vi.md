# Agent Note: Tổ hợp câu trả lời tùy chỉnh cho câu hỏi multi-select

Status: implemented

[English](2026-07-30-multi-select-custom-answer-composition.md) | 中文

## Vấn đề

Vocabulary của kết quả tương tác người dùng mang nhãn lựa chọn đã chọn và text tùy chỉnh tùy chọn qua hai field riêng biệt, nhưng ngữ nghĩa ban đầu yêu cầu hai field này loại trừ lẫn nhau cho mỗi câu hỏi. Đối với câu hỏi multi-select, việc mở câu trả lời tùy chỉnh hoặc nhập text sẽ làm mất các nhãn mà user đã chọn. TUI chỉ trả về text tùy chỉnh, còn Web host thì từ chối các client response giữ đồng thời cả hai field.

## Quyết định

Đối với câu hỏi có `multiSelect: true`, một mục trả lời có thể vừa chứa mảng `selected` không rỗng vừa chứa text `custom` không rỗng. Bất kể user chọn tùy chọn trước hay nhập text tùy chỉnh trước, bản nháp Web đều giữ lại cả hai giá trị; TUI khi chuyển đổi giữa chế độ tùy chọn và chế độ tùy chỉnh sẽ giữ lại text tùy chỉnh đang chờ submit, và khi submit ở bất kỳ chế độ nào đều chiếu (project) nó cùng với các nhãn đã tick; Web host thì chấp nhận response tổ hợp sau khi áp dụng các bước kiểm tra id, nhãn, tính duy nhất, batch và text không rỗng hiện có.

Câu hỏi single-select và câu hỏi không có tùy chọn vẫn giữ ngữ nghĩa loại trừ lẫn nhau: text tùy chỉnh sẽ ghi đè bất kỳ tùy chọn nào đã chọn. Hình dạng kết quả vẫn là `{ id, selected, custom? }`, do đó không cần thay đổi protocol hay schema output của tool.

## Các phương án đã cân nhắc

**Mã hóa text tùy chỉnh thành một nhãn `selected` khác.** Không chọn, vì làm vậy sẽ xóa nhòa sự khác biệt giữa nhãn tùy chọn do caller cung cấp và text do user điền, làm suy yếu việc kiểm tra, và buộc bên tiêu thụ phải tự suy luận giá trị nào thuộc về nội dung tùy chỉnh.

**Cho phép mọi câu hỏi cùng dùng cả `selected` lẫn `custom`.** Không chọn, vì câu hỏi single-select chỉ biểu thị một câu trả lời; cho phép tùy chọn đã chọn và text tùy chỉnh cùng tồn tại sẽ làm mờ ý nghĩa số lượng (cardinality) của nó. Hình thức tổ hợp chỉ áp dụng cho câu hỏi đã bật tường minh nhiều câu trả lời.

## Hệ quả

UI multi-select có thể biểu đạt đầy đủ câu trả lời của user, không mất bất kỳ nguồn nào. Provider và consumer tiếp tục dùng DTO hiện có, còn validator nhận biết request sẽ quyết định có cho phép tổ hợp hay không dựa trên `multiSelect`. Test cho Web component và assembled browser, test cho TUI, test cho host response, và test cho tool projection cùng nhau cố định kết quả tổ hợp. Test Web, TUI và tool projection còn cố định hình thái câu trả lời chỉ có nhãn; test TUI assembled không cần key cố định luồng câu trả lời tổ hợp trong terminal, còn test host cho câu hỏi single-select cố định phần quy tắc loại trừ lẫn nhau còn lại.
