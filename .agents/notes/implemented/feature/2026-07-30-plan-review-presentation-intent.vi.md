# Agent Note: Duyệt kế hoạch là một quyết định, không phải một câu hỏi thi

Status: implemented

[English](2026-07-30-plan-review-presentation-intent.md) | Tiếng Việt

## Vấn đề

`exit_plan_mode` giao bản kế hoạch đã viết cho người dùng duyệt thông qua `ctx.userQuestions.ask()`, mà đây đúng là cùng một seam mà `ask_user_question` sử dụng. Trên Web GUI, điều này khiến phần duyệt kế hoạch được render thành luồng câu hỏi tổng quát trong [phần trình bày ask-question trên Web](2026-07-29-ask-question-web-presentation.md): một bộ phân trang `1 / 1`, kế hoạch nằm ở phần chú thích bổ sung của câu hỏi, hai phán quyết hiện thành các dòng radio được đánh số kèm mô tả, một dòng "Khác, vui lòng điền câu trả lời tùy chỉnh", cùng `跳过本题` / `提交` ở dưới cùng.

Không một phần tử tương tác nào trong số đó là đúng cho giao diện này. Duyệt một kế hoạch là đưa ra một quyết định về một tài liệu, còn giao diện kiểu làm bài thi lại nói với người dùng rằng anh ta đang bị kiểm tra, chứ không phải đang được đề nghị phê duyệt một phần việc — phản hồi thực tế là "rất khó hiểu, cứ tưởng đang làm bài". Bộ điều khiển phân trang thì đang phân trang cho một tập chỉ có một phần tử. Bỏ qua không phải là kết quả mà tool này chấp nhận (nó sẽ suy sụp thành tiếp tục lập kế hoạch). Tệ nhất là giao diện này hoàn toàn không gợi ý rằng đây chính là cổng kế hoạch, trong khi phần tiếp quản chờ phê duyệt ngay bên cạnh từ lâu đã mang đúng hình hài của một quyết định: một dải màu nói rõ đang quyết định điều gì, phần thân là đối tượng của quyết định, và một hàng thao tác căn phải.

## Quyết định

Một câu hỏi có thể khai báo **ý định trình bày (presentation intent)**, và khu vực nhập liệu trên Web sẽ render ý định đã khai báo thành giao diện riêng của nó. `AskUserQuestionItem` được bổ sung `intent?: AskUserQuestionIntent`, một union có nhãn mà hiện tại chỉ có một thành viên duy nhất là `{ kind: 'plan-review', approve: string }`; `plan-mode` đặt giá trị này trên câu hỏi duyệt, và chỉ rõ `Approve` là nhãn biểu thị phê duyệt.

Ý định chỉ thay đổi cách trình bày. Giao thức trả lời không đổi: UI tuân theo ý định vẫn trả lời đúng những nhãn tùy chọn mà UI tổng quát sẽ gửi đi, nên dù được thu thập bởi giao diện nào thì `exit_plan_mode` cũng đọc được cùng một bộ trường trả lời; còn UI không nhận ra một nhãn nào đó sẽ render luồng tổng quát, và ngoài bố cục thì không mất gì cả.

`approve` chỉ đích danh tùy chọn khẳng định, thay vì dựa vào thứ tự tùy chọn, nên không UI nào suy ra phán quyết từ vị trí. Ý định đưa ra hai khẳng định vượt quá sức biểu đạt của kiểu dữ liệu, và `UserQuestionService.ask()` từ chối cả hai bằng `BAD_INTENT` ngay ở phía bên hỏi: `approve` không khớp với bất kỳ tùy chọn nào của chính câu hỏi đó — sớm hơn việc để một UI nào đó trả lời một lựa chọn chưa từng được cung cấp; và ý định rơi vào một câu hỏi không có `detail`, trong khi `detail` chính là thứ mà nó tự nhận là đang được duyệt, khiến người dùng phải phê duyệt một thứ không nhìn thấy. Ở tầng wire format, ý định là union phân biệt được, nên nhãn không nhận ra được là một frame bị từ chối, chứ không phải âm thầm quay về render tổng quát.

`ui-user-questions` render ý định đó thành `PlanReviewPanel`, dùng lại ngôn ngữ của thẻ chờ phê duyệt: dải màu hổ phách ghi `Plan review`, kế hoạch là phần thân markdown cuộn được, và hàng quyết định đặt ba thao tác — `Chat about it`, `Refuse`, `Approve`. Văn bản câu hỏi trở thành tên trợ năng của thẻ chứ không phải tiêu đề, vì các nút đã nói rõ quyết định này là gì. Approve và Refuse trả lời bằng chính nhãn tùy chọn của bên hỏi, và giữ phần mô tả của bên hỏi làm tooltip; `Chat about it` hủy request đó, nhờ vậy khu vực nhập liệu trở về vị trí và người dùng chỉ việc nói thẳng điều mình muốn nói. Toàn bộ văn bản đều song ngữ dưới namespace `question` sẵn có.

Việc định tuyến nằm bên trong một mục duy nhất của khu vực nhập liệu (do `QuestionComposer` chọn cách trình bày), chứ không phải một đăng ký nối chuỗi thứ hai; `planReviewOf` chỉ tiếp quản khi thẻ có thể phát ra mọi câu trả lời mà request đó cho phép: chỉ có một câu hỏi và đã khai báo ý định, kế hoạch được mang bởi `detail`, nhãn phê duyệt được chỉ đích danh có mặt, và đây là câu hỏi nhị phân chọn một — ngoài phê duyệt ra nhiều nhất một tùy chọn nữa, và không phải chọn nhiều. Khi xuất hiện tùy chọn thứ ba hoặc một lô chọn nhiều, câu trả lời của chúng vượt quá khả năng biểu đạt của hai nút, nên luồng tổng quát giữ lại chúng, cũng như giữ lại mọi request khác mà thẻ không render được. Vì vậy "chỉ thay đổi cách trình bày" mang nghĩa đen: ý định tuyệt đối không làm người dùng mất đi một câu trả lời khả dĩ, và client nằm phía dưới ranh giới giao thức giữ cho mọi request đều trả lời được.

Việc từ bỏ phiên duyệt trở thành một kết quả riêng biệt hướng tới model. Trước đây `ASK_CANCELLED` truyền tới model thông điệp "the user cancelled ask_user_question", tức là nêu đích danh một tool mà nó chưa từng gọi; giờ đây `exit_plan_mode` báo rằng người dùng từ bỏ phiên duyệt để chuyển sang trò chuyện, và yêu cầu ở lại plan mode để chờ. Mọi kiểu thất bại ask còn lại — hủy lượt hoặc abort do provider teardown, những nơi không có người dùng nào sẽ tới — vẫn giữ thông điệp riêng của chúng.

## Phương án thay thế

**Cho phần duyệt kế hoạch thành một loại pending riêng (`plan-review/requested`).** Bác bỏ: kích cỡ không tương xứng với một vấn đề trình bày. Cái nó đổi được là một hình hài phản hồi trung thực (approve / decline / discuss thay vì một lô câu trả lời), nhưng cái giá là một `PendingKind` thứ ba, các frame requested/resolved và schema mới, một registry api-proxy cùng nhánh phản hồi, việc xử lý session và phát lại baseline ở phía client, cùng một capability seam ba gói mới cho một quyết định mà giao thức câu hỏi vốn đã biểu đạt được. Chỉ nên xem xét lại khi phần duyệt kế hoạch sinh ra kết quả mà hình hài câu trả lời không chứa nổi.

**Định tuyến thẻ theo `id` hoặc `header` của câu hỏi (`plan-review` / `Plan review`).** Bác bỏ: đây là việc đánh hơi chuỗi văn bản của một package khác xuyên qua ranh giới giao thức, và bất kỳ thay đổi câu chữ nào cũng sẽ âm thầm làm hỏng nó. Ý định mới là thứ khai báo giúp việc định tuyến đọc ra được.

**Quy ước thứ tự tùy chọn, để thẻ đọc vị trí thứ 0 là phê duyệt.** Bác bỏ: đây là quy ước vị trí ở ranh giới package, không nhìn thấy được trong kiểu dữ liệu lẫn frame giao thức, và cũng không cưỡng chế được — bên sản xuất chỉ cần sắp xếp lại tùy chọn là phán quyết của người dùng bị đảo ngược. Chỉ đích danh nhãn thì chỉ tốn đúng một chuỗi.

**Đăng ký một mục chuỗi thứ hai trong khu vực nhập liệu cho thẻ kế hoạch.** Bác bỏ: hai mục sẽ cùng chọn trên một vật mang câu hỏi đang chờ trả lời, khiến giao diện phụ thuộc vào độ ưu tiên trong chuỗi, cũng như vào việc nửa client của package kế hoạch có được đưa vào composition hay không. Một mục tự chọn hình hài của mình thì không tranh với chính nó, còn luồng tổng quát chính là phương án dự phòng có sẵn.

**Đặt panel trong `ui-plan`, ngay cạnh nhãn trạng thái kế hoạch.** Bác bỏ: toàn bộ hành vi của panel là mã hóa câu trả lời của vật mang câu hỏi (`PendingQuestion`), thứ do `ui-user-questions` sở hữu; ý định là một trường của giao thức câu hỏi, không phải kênh riêng của plan-mode. Việc render một ý định đã khai báo thuộc về package sở hữu việc render câu hỏi, cũng như ý định render của tool thuộc về bên render tool.

**Tách một thẻ tiếp quản dùng chung với `ApprovalPanel` của `ui-conversation`.** Không làm: hai phần tiếp quản nhất quán về token và hình học, nhưng nội dung thì không — bên này thân là markdown cuộn được, bên kia là một dòng tiêu đề cộng một dòng lệnh — nên vỏ dùng chung sẽ chỉ còn rộng đúng hai phần tử. Chúng nhất quán nhờ token, chứ không nhờ component.

**Cho `Chat about it` một kết quả giao thức riêng.** Bác bỏ: từ bỏ một request là động từ mà luồng tổng quát vốn đã có (dấu `×` hủy cả lô). Nâng nó lên thành một nút có nhãn là chuyện trình bày; phát minh ra kết quả giao thức thứ tư cho nó thì không.

## Kết quả

Từ nay giao thức câu hỏi có thêm một trục trình bày. Thêm ý định thứ hai = một nhãn trên union, một bên sản xuất đặt nó, một thành viên schema, một panel — không cần frame, dịch vụ hay hình hài câu trả lời mới. Cái giá là quy ước câu hỏi từ nay biết rằng "trình bày" là một chuyện có tồn tại, và `ui-user-questions` biết đến từ "plan"; cả hai đều là giá phải trả để một mục duy nhất sở hữu toàn bộ giao diện câu hỏi.

Cổng kế hoạch giờ đọc lên đúng như một cổng kế hoạch: kế hoạch là nội dung của thẻ, phán quyết là hai nút có nhãn, và lấy lại lượt là nút thứ ba. Luồng tổng quát không bị ảnh hưởng với mọi câu hỏi khác, và các bản golden đã commit của nó cũng không đổi.

Các bản triển khai có nửa client cũ hơn thay đổi này vẫn hiển thị bố cục kiểu làm bài thi — đúng đắn, trả lời được, chỉ là không có kiểu dáng chuyên biệt — vì ý định mang tính bổ sung, và phương án dự phòng chính là luồng tổng quát.

## Kiểm thử

Test `ui-user-questions` chốt phần thu hẹp (lô một câu hỏi, ý định có mặt, kế hoạch nằm ở detail, nhãn phê duyệt được chỉ đích danh thực sự được cung cấp, nhị phân chọn một, decline vắng mặt khi chỉ cung cấp phê duyệt) và chốt panel (dải màu, kế hoạch markdown, tên trợ năng, không hiển thị bộ phân trang, dòng radio, mục bỏ qua và mục tùy chỉnh, phê duyệt và từ chối trả lời bằng nhãn của bên hỏi, việc từ bỏ kích hoạt hủy, khóa một lần, cũng như việc nạp lại kèm thông điệp khi biên nhận bị từ chối, tooltip có và không có, cả hai ngôn ngữ). Test `user-questions` chốt hai kiểu từ chối `BAD_INTENT` và việc truyền ý định xuyên suốt; test `plan-mode` chốt sự nhất quán giữa ý định đã khai báo với danh sách tùy chọn của chính nó, cùng hai thông điệp thất bại; test schema apiproxy chốt việc giao thức chấp nhận và từ chối nhãn không xác định.

Kênh e2e Web `plan-review` ghi lại việc `/plan` thực sự vào plan mode, model gọi `exit_plan_mode`, thẻ quyết định tiếp quản khu vực nhập liệu (và khẳng định rằng luồng tổng quát **không** tiếp quản request đó), cùng việc chính nút Approve của thẻ hoàn tất lượt — hai bản golden không cần khóa: thẻ đang chờ và transcript sau khi phê duyệt.
