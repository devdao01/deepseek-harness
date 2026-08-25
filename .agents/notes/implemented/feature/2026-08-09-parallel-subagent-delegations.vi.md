# Agent Note: Ủy nhiệm subagent song song

Status: implemented

[English](2026-08-09-parallel-subagent-delegations.md) | Tiếng Việt

## Vấn đề

Model muốn tỏa nhánh sẽ gộp nhiều lời gọi `subagent` vào cùng một thông điệp assistant: bản thân lô đó chính là ý định song song. Công cụ ủy nhiệm trước đây không khai báo bộ phân loại `isConcurrencySafe`, nên bộ điều phối vốn thiết kế theo nguyên tắc nghiêng về an toàn ([Agent Note về gọi công cụ song song](2026-07-10-parallel-tool-call-execution.md)) coi mọi ủy nhiệm tiền cảnh là một hàng rào độc chiếm: GUI hiển thị chín tấm thẻ, nhưng chỉ một agent (trí tuệ nhân tạo) con đang chạy, tám cái còn lại phải xếp hàng phía sau suốt toàn bộ thời gian nó chạy.

Lập trường bảo thủ ban đầu (bộ phân loại một ngôi không thể chứng minh rằng hiệu ứng workspace của các ủy nhiệm ngang hàng không giao nhau) nay đã chẳng còn bảo vệ điều gì: `run_in_background: true` và ủy nhiệm có thể tiếp tục vốn dĩ đã chồng lấn với mọi lời gọi sau đó, kể cả các phép ghi; `dsh-workflow-worker-thread` cũng từ lâu đã chạy song song các agent con trên workspace dùng chung qua chính provider `ctx.subagents.start()` ấy, với số lượng lên tới giới hạn song song của nó. Chỉ riêng hình thái tiền cảnh là bị tuần tự hóa.

## Quyết định

`dsh-tool-subagent` khai báo `isConcurrencySafe: () => true` cho mọi hình thái lời gọi (tiền cảnh, nền một lần, có thể tiếp tục), nên các ủy nhiệm ngang hàng trong cùng một bước assistant sẽ chồng lấn dưới bể luân chuyển của vòng lặp, với giới hạn là `maxParallelToolCalls`, còn kết quả vẫn được gửi theo đúng thứ tự của model.

Khai báo này về mặt cấu trúc thỏa mãn giao ước an toàn của bộ điều phối: agent con làm việc trong phiên của riêng nó, việc chạy tuyệt đối không thay đổi phiên cha (các sự kiện `sandbox/mode`, `approval/policy`, `subagent/descriptor` được nối thêm lúc khởi động chỉ rơi vào log của chính agent con), và công cụ trả output về cho vòng lặp để vòng lặp gửi theo thứ tự. Phép ghi duy nhất mà hình thái nền một lần thực hiện lên trạng thái thuộc sở hữu của cấp cha là việc đăng ký một Task qua `tasks.start` — một phép chèn đồng bộ, giao hoán được, thỏa mãn điều khoản trạng thái dùng chung trong Agent Note về bộ điều phối chứ không phải tính chất "không thay đổi" mạnh hơn. Seam của provider yêu cầu cô lập riêng biệt trạng thái cục bộ của thao tác, việc hủy, việc kết toán và việc dọn dẹp đối với các lần khởi động song song và chuẩn bị tiếp tục cho những agent con khác nhau. Provider tích hợp sẵn thỏa mãn giao ước này: spawn và fork không giữ trạng thái khả biến giữa các lần khởi động, fork chỉ đọc phần tiền tố các lượt đã hoàn tất của cấp cha, provider ngoài tiến trình cấp phát trạng thái theo từng lần chạy, còn trình quản lý tiếp tục thì dành sẵn danh tính agent con và khóa duy nhất cho mỗi lần chuẩn bị.

Việc điều phối hiệu ứng workspace giữa các ủy nhiệm ngang hàng là trách nhiệm của model, và sản phẩm đã áp dụng đúng lập trường này cho agent con dạng nền, có thể tiếp tục và workflow. Các harness cùng loại cũng làm giống vậy: công cụ Task của Claude Code an toàn khi song song vô điều kiện (giới hạn 10); công cụ task của oh-my-pi mặc định thuộc lớp `shared` chồng lấn được của nó; công cụ task của opencode chạy không giới hạn dưới SDK của nó; còn Codex thì làm việc ủy nhiệm thành hộp thư spawn/wait bất đồng bộ, qua đó né hẳn vấn đề này.

Việc kiểm soát dung lượng vẫn nằm đúng chỗ mà Agent Note về bộ điều phối đã định: `maxParallelToolCalls` giới hạn số lời gọi công cụ chưa kết toán trong một bước — và do đó giới hạn cả số agent con tiền cảnh chạy song song — trong khi các lời gọi nền và có thể tiếp tục thì kết toán ngay lúc khởi động và giải phóng chỗ trong bể, nên những agent con mà chúng để lại chạy tiếp không bị ràng buộc bởi giới hạn đó. Provider LLM (mô hình ngôn ngữ lớn) tự chịu trách nhiệm kiểm soát dung lượng của mình.

## Kiểm thử

Test của gói cố định bộ phân loại cho cả hai hình thái lời gọi. Một test cổng lái trực tiếp registry, với hai agent con mỗi cái tự chặn cho tới khi cả hai đều đã khởi động, qua đó chứng minh đúng nửa phần mà khai báo này dựa vào: thân công cụ và đường khởi động của provider chịu được việc phân phát song song — bất kỳ chỗ tuần tự hóa ẩn nào trong ngăn xếp này đều sẽ gây deadlock chứ không lặng lẽ qua bài. Một test cổng cho hình thái có thể tiếp tục cho hai lần chuẩn bị của provider dừng lại ở cùng một await, hủy một trong hai bên gọi trước khi công bố, và chứng minh rằng agent con đã hủy không để lại agent hay phiên bền vững nào, còn cái ngang hàng với nó thì đến được trạng thái inbox chấp nhận và được lưu bền vững độc lập. Nửa còn lại (việc phân loại thực sự tạo ra chồng lấn khi chạy) do test ghim bộ phân loại và snapshot nói dưới đây đảm nhiệm.

Snapshot `subagent-parallel` viết tay cố định transcript (bản ghi văn bản) của ứng dụng sau khi lắp ráp: một thông điệp assistant mang hai lời gọi subagent, log của cấp cha ghi thành `tool/call, tool/call, tool/result, tool/result` (thực thi tuần tự sẽ khiến cặp gọi/kết quả xen kẽ nhau), và hai agent con mỗi cái hoàn tất như một phiên độc lập. Cặp ủy nhiệm sinh đôi trong đó được làm giống hệt nhau một cách có chủ ý: `dsh-llm-replay` gán kịch bản con theo thứ tự lời gọi đầu tiên, còn harvester sắp xếp agent con theo `createdAt`, và cả hai đều không tất định giữa các agent con chạy song song (tức dấu `XXX(concurrent-subagents)`), nên hiện tại chỉ những ủy nhiệm sinh đôi hoán đổi được mới phát lại được mà không có race.

## Phương án thay thế

**Giữ ủy nhiệm ở dạng độc chiếm.** Hiện trạng không bảo vệ điều gì: agent con dạng nền và workflow vốn đã có thể chồng lấn tự do kèm cả phép ghi, nên tuần tự hóa hình thái tiền cảnh chỉ làm tăng độ trễ, đồng thời đi ngược lại ý định gom lô mà model đã diễn đạt tường minh.

**Dùng bộ phân loại nhạy với đầu vào.** Tham số của lời gọi này chỉ gồm phần mô tả và prompt ở dạng văn bản tự do; không có gì trong đó phân biệt được ủy nhiệm an toàn với ủy nhiệm không an toàn, nên bộ phân loại có điều kiện sẽ chỉ mang tính hình thức.

**Thiết kế lại theo phong cách Codex thành spawn/wait bất đồng bộ.** Agent con có thể tiếp tục cộng với `send_message` đã cung cấp kênh bất đồng bộ; dựng lại giao ước tiền cảnh quanh hộp thư đồng nghĩa với việc vứt bỏ một đường kết quả đồng bộ đang dùng được, chỉ để giải quyết một vấn đề điều phối mà một dòng khai báo là sửa xong.

**Cung cấp công tắc cấu hình `concurrencySafe` theo từng thực thể.** Không có bên tiêu thụ nào cần triển khai tuần tự: `maxParallelToolCalls: 1` đã khôi phục được thực thi tuần tự toàn cục, và tiền lệ ở các harness cùng loại cũng mặc định coi ủy nhiệm là an toàn khi song song.

## Hệ quả

Các agent con ngang hàng có thể xảy ra race trên workspace dùng chung hoặc trên tài nguyên bên ngoài; việc điều phối này thuộc trách nhiệm của model, đúng như model đã đảm nhận với mọi agent con chồng lấn khác. Agent con chạy song song còn tranh nhau hạn mức của provider LLM; `maxParallelToolCalls` chỉ giới hạn các lời gọi chưa kết toán, chứ không giới hạn những agent con mà lời gọi nền hoặc có thể tiếp tục để lại chạy tiếp.

Hai ủy nhiệm nền một lần trong cùng một thông điệp sẽ nhận job id mà model thấy được (`subagent-<n>`) theo thứ tự race lúc phân phát. Các id này đã được ghi lại nên việc phát lại vẫn hợp lệ; nhưng những kịch bản snapshot cần phân biệt agent con nền sẽ thừa hưởng đúng ràng buộc tất định như với phiên con sinh đôi.

Việc gửi có thứ tự có thể khiến kết quả của agent con nhanh phải chờ sau một agent con chậm hơn nhưng bắt đầu sớm hơn; đây là đánh đổi mà [Agent Note về bộ điều phối](2026-07-10-parallel-tool-call-execution.md) đã chấp nhận; giao diện thời gian thực vẫn hiển thị tiến độ riêng của từng agent con.

Các kịch bản snapshot với agent con chạy song song dùng prompt khác nhau vẫn cần harness phát lại hỗ trợ thêm (gán kịch bản con tất định và sắp xếp khi thu thập); trước khi có điều đó, những kịch bản như vậy buộc phải dùng ủy nhiệm sinh đôi hoán đổi được.
