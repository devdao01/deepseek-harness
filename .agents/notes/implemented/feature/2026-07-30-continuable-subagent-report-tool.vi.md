# Agent Note: Công cụ báo cáo subagent có thể tiếp tục (continuable)

Status: implemented

[English](2026-07-30-continuable-subagent-report-tool.md) | 中文

## Vấn đề

Các subagent trong tiến trình có thể tiếp tục (continuable) có khả năng nhận tin nhắn tiếp theo từ parent, giữ lại thế hệ sau (descendant), quyết toán và khôi phục nguội (cold resume), nhưng vòng đời cơ bản không cho phép chúng gửi nội dung được chọn lọc tới parent trực tiếp. Toàn bộ output của child đã có thể được tái tạo từ session đã persist, vì vậy năng lực còn thiếu là gửi tường minh (explicit delivery), chứ không phải lưu trữ kết quả.

Nếu coi mỗi tin nhắn assistant cuối cùng là một kết quả ngầm định, việc đó sẽ làm lẫn lộn giữa hoàn thành lượt (turn completion) và báo cáo. Một child chạy lâu dài có thể không có gì để báo cáo trong một lượt, hoặc có thể báo cáo tiến độ nhiều lần trong một lượt khác, và sau khi báo cáo vẫn phải có thể tiếp tục làm việc. Do đó, quyền của bên nhận, việc gửi âm thầm (silent) so với gửi đánh thức (wakeup), xác nhận, tính bền vững (persistence) và hành vi retry đều cần một thỏa ước tường minh.

## Quyết định

Thêm package `@deepseek-ai/dsh-tool-subagent-report` có thể cài đặt độc lập. Nó đóng góp một công cụ `report` hướng-tới-model thông thường cho mỗi Activation của child trong tiến trình có thể tiếp tục. Bản thân cơ chế này chấp nhận được gọi không lần hay nhiều lần trong một lượt; child sẽ được yêu cầu riêng phải gọi đúng một lần trước khi kết thúc (xem [nghĩa vụ báo cáo](2026-08-06-continuable-child-report-obligation.md)). Gọi thành công không kết thúc lượt đó hay quyết toán Activation, cũng không ngăn parent tiếp tục follow-up sau đó; hoàn thành lượt cũng không bao giờ tự động báo cáo.

Tính năng này là kiểm soát hợp tác (collaboration control), không phải một lớp bọc thực thi mang kết quả. Nó không thêm Task, `SubagentRun`, promise kết quả, trạng thái Activation, hàng đợi gửi hay đường phát lại (replay path).

### Thỏa ước hướng-tới-model

`report` chỉ nhận `{ output: string }`, và chỉ trả về `{ messageId: string }`. Nó không nhận child id, receiver id hay delivery mode. `exec.agent` gắn lệnh gọi công cụ với child gửi báo cáo; service suy ra bên nhận duy nhất từ `parentSession` đã persist, còn lịch trình do cấu hình deployment quyết định.

`messageId` là `MessageId` ổn định ứng với tin nhắn vai user mà parent đã chấp nhận. Nó không phải là `InboxItemId`: gửi âm thầm không tạo inbox item instance, còn gửi đánh thức thì tạo một inbox item instance cho cùng tin nhắn ổn định đó. Nó cũng không phải biên nhận đã đọc, xác nhận log của parent, biên nhận hoàn thành lượt, hay flush persist.

Mô tả công cụ nói rõ thao tác báo cáo phải được thực hiện trước khi kết thúc, có thể lặp lại, chỉ dành cho parent trực tiếp và không kết thúc lượt. Nó cũng cảnh báo: sau khi gửi được chấp nhận, `tools/post-execute` thất bại sau đó có thể thay thế kết quả công cụ, vì vậy khi kết quả công cụ thất bại thì nội dung vẫn có thể đã được gửi đi. Khi không có idempotency key, một mô tả mạnh hơn sẽ khiến bên gọi retry lặp lại sau một lỗi có kết quả không rõ ràng.

Công cụ này dùng render chung không kèm location, xác nhận của nó chứa `messageId`. Đăng ký cục bộ theo phạm vi (scope) giữ cho việc hiển thị và thực thi nhất quán: root, one-shot child, remote provider, scope ngang hàng và các lệnh thực thi không có agent đều không thấy cũng không thực thi được `report`. Nó được cài đặt sau `toolFilter` toàn cục của child, nên allow-list ủy quyền sẽ không vô tình loại bỏ kênh trả về mang tính cấu trúc này; các deployment không cần kênh trả về này thì không cài package.

### Quyền của service

Seam của subagent phơi ra `ctx.subagents.reportFrom(child, content, { delivery, signal }): Promise<MessageId>`. Chính Agent online của child đó là thông tin xác thực của bên gửi. Trình quản lý tiếp tục thực thi (continuation manager) chỉ chấp nhận Activation có `handle.agent === child`, suy ra parent trực tiếp của nó từ header đã persist của child, và yêu cầu id đó phải giải quyết thành một Agent parent đang online tại thời điểm ủy quyền đồng bộ cuối cùng và khoảng thời gian gửi. API này không nhận trường receiver, ancestor hay sender do bên gọi tự chọn.

root, one-shot child, đối tượng giả mạo, Agent cũ (stale) và đối tượng thay thế cùng id đều thất bại với `UNAUTHORIZED`. Activation child đang đóng thất bại với `ACTIVATION_CLOSING`; drain của manager và việc hủy trước khi chấp nhận vẫn giữ nguyên các lỗi vòng đời hiện có. Khi parent trực tiếp không tồn tại hoặc từ chối chấp nhận, thất bại với `PARENT_UNAVAILABLE` và `direct parent is not live; report was not delivered`. Thất bại không trả về id, không khôi phục nguội parent, không ghi vào hộp thư offline, cũng không sửa đổi session của parent bị thiếu.

Báo cáo lồng nhau chỉ đi qua đúng một cạnh (edge). Một grandchild sẽ báo cáo tới child parent trực tiếp của nó, không bao giờ báo cáo trực tiếp lên coordinator cấp cao nhất. Child trung gian có thể sau đó tự báo cáo một bản cập nhật tổng hợp riêng.

### Chiến lược gửi

Package này kiểm tra `reportDelivery: 'quiet' | 'wakeup'`, giá trị mặc định là `wakeup` (xem [lý do đảo ngược mặc định](2026-08-06-continuable-child-report-obligation.md)).

Gửi âm thầm gọi `parent.inject()`. Nó thêm ngữ cảnh mà model có thể nhìn thấy nhưng không khởi động một request model của parent: nếu parent đang idle, tin nhắn được thêm vào trước khi lệnh gọi trả về; nếu parent đang admit hoặc đang chạy, báo cáo được lưu tạm, chờ tới vị trí log an toàn tiếp theo. Chế độ này không tạo inbox item instance, nên cũng không sinh ra bản ghi chấp nhận hư cấu nào từ continuation manager.

Gửi đánh thức gọi `parent.followup()`. Nó tạo một lượt parent FIFO thông thường, đánh thức driver của parent đang tạm dừng (parked), và không bao giờ steer (dẫn dắt giữa chừng) một lượt đã bắt đầu. Khi chính parent đó cũng là một Activation có thể tiếp tục, việc gửi sẽ dùng bộ đếm admit hiện có của manager, để ngăn parent quyết toán giữa lúc enqueue đồng bộ và microtask admit.

Cả hai chế độ đều gói một tin nhắn vai user bằng `Background subagent <child-id> reported:`, theo sau là `output` hoàn toàn nguyên văn. Nguồn tin nhắn đã persist là `{ kind: 'subagent-report', senderSessionId: child.id }`. Thứ tự của các lần gửi đồng thời do quy tắc thông thường của Agent quyết định; tầng subagent không tạo hàng đợi thứ hai.

### Xác nhận và khôi phục

Thành công có nghĩa là chính parent online đó đã đồng bộ chấp nhận tin nhắn. Parent đang idle khi chấp nhận inject âm thầm thì việc thêm vào đã hoàn tất; còn ngữ cảnh âm thầm được lưu tạm chỉ có thể tái tạo được sau khi đến ranh giới log bình thường. Gửi đánh thức bao gồm một inbox item instance, id của nó tách biệt với id tin nhắn ổn định được trả về.

Phiên bản đầu tiên không cung cấp hộp thư bền vững (persistent mailbox), idempotency key, biên nhận gửi, giao thức retry hay đảm bảo exactly-once. Sự cố tiến trình có thể khiến bên gọi không xác định được kết quả, và retry khi kết quả chưa rõ có thể dẫn tới báo cáo trùng lặp. Khi parent không khả dụng, transcript đã persist của child vẫn là nguồn để khôi phục.

### Kết hợp (composition) và vòng đời

Seam của subagent thêm `registerContinuableSetup(contribution): () => void`, được hỗ trợ bởi `SubagentActivationSetupRegistry`. Mỗi đóng góp đồng bộ nhận ngữ cảnh child chưa được publish, và trả về disposer mà nó cài đặt. Continuation manager trước tiên áp dụng phần kết hợp cơ bản của child, sau đó áp dụng các đóng góp hiện có theo thứ tự đăng ký, thông qua cùng một setup closure dùng cho cả tạo mới lẫn khôi phục nguội.

Registry chịu trách nhiệm đăng ký, ghi nhận việc cài đặt cho từng child, rollback setup, dọn dẹp phạm vi child và thu hồi ngay lập tức. Áp dụng một batch trả về một đối tượng commit setup của Agent, dùng để tái xác thực trạng thái cấu hình sau khi mỗi await của setup quyết toán và ngay trước khi Agent được publish. Vì vậy, nếu một đóng góp ném lỗi hoặc bị thu hồi đồng thời, thao tác sẽ bị từ chối và batch đó rollback trước khi Agent và session được publish. Mục đăng ký mới chỉ có hiệu lực từ Activation kế tiếp của child thường trú; khi xóa một mục đăng ký, nó sẽ được đóng lại với setup mới trước, rồi thu hồi ngay lập tức mọi instance đã được cài đặt cho từng child đang được pre-config hoặc đang thường trú. Cả dispose của đăng ký lẫn dispose của ngữ cảnh child đều idempotent, cả hai đều thử từng phần release trước khi gộp các thất bại lại.

Seam này giúp continuation manager không cần biết tên công cụ. Package report chỉ cài đặt `report` và section hướng dẫn theo phạm vi child của nó; `@deepseek-ai/dsh-tool-subagent-control` thì cài đặt độc lập `send_message` và `list_agents` phía parent. Khi triển khai có thể cài một trong hai chiều, cả hai, hoặc không cài chiều nào. Provider vẫn chỉ chịu trách nhiệm về dữ liệu, descriptor đã persist không chụp nhanh (snapshot) khả dụng của report hay delivery mode, còn khôi phục nguội thì dùng các đóng góp và chính sách hiện tại của deployment.

### Bao phủ trong snapshot

Harness snapshot ACP (Agent Client Protocol) thêm `waitForSubagentTurnEnd`, chọn child thứ N đã được thu thập theo đúng thứ tự như `session.N.jsonl`. Nó chờ một lượt child đã đóng có chứa request header, để tránh việc lượt gieo descriptor sớm của một child có thể tiếp tục vô tình thỏa mãn ranh giới đó. Nhờ vậy, các kịch bản lắp ráp tổng thể có thể chờ báo cáo phía child mà không cần giả lập tín hiệu hiển thị parent.

Một snapshot viết tay khởi động một child có thể tiếp tục, thực thi công cụ `report` cục bộ theo phạm vi thật, quan sát đúng một lượt parent thông thường do gửi đánh thức mặc định tạo ra, rồi gửi tiếp một prompt parent theo sau để nó tiêu thụ báo cáo đã được gói. Nó khai báo child pin `1`, nên schema `report` không toàn cục cùng với prompt riêng của child đó sẽ được so sánh riêng với `tool-schemas.1.expected.json` và `system-prompt.1.expected.md`, còn root vẫn tiếp tục dùng category pin. Thư mục công cụ được sinh ra sẽ đúc thêm một scope child riêng để chứa schema cục bộ theo phạm vi đó.

## Các phương án thay thế từng cân nhắc

### Tự động gửi mỗi câu trả lời cuối cùng

Gửi tự động không thể biểu diễn trường hợp không có báo cáo nào, báo cáo tiến độ, hay nhiều bản cập nhật được chọn lọc. Nó cũng sẽ ghép chặt báo cáo với việc quyết toán, và có thể gửi lặp lại nội dung đã được báo cáo tường minh.

### Luôn luôn đánh thức parent

Đánh thức parent mỗi lần báo cáo sẽ tạo ra các lượt không được yêu cầu, và có thể lan tỏa theo cấp bậc qua các subagent lồng nhau. Việc chọn gửi âm thầm làm mặc định ban đầu dựa trên tiền đề rằng parent còn có lý do khác để đọc ngữ cảnh của chính nó. [Nghĩa vụ báo cáo](2026-08-06-continuable-child-report-obligation.md) đã thay thế lựa chọn đó: một coordinator nền đã tạm dừng thì không có lý do như vậy, nên đánh thức trở thành mặc định, còn mục này giờ ghi lại lý do vì sao `quiet` vẫn được giữ lại.

### Cho phép child chọn delivery mode

Cung cấp tham số mode cho model sẽ trao cho nó khả năng kiểm soát áp lực lên scheduler, và khiến hành vi phụ thuộc vào deployment. Child chỉ quyết định nội dung và thời điểm; còn việc nội dung đó có khởi động một lượt Agent khác hay không là do cấu hình deployment quyết định.

### Đăng ký công cụ toàn cục

`report` toàn cục sẽ công bố một năng lực không thể dùng được tới root, one-shot child, remote child và các lệnh gọi không có agent. Từ chối chỉ tại thời điểm thực thi sẽ khiến khả năng hiển thị schema và quyền không nhất quán với nhau.

### Gộp cả hai chiều vào package control

`send_message` và `report` khác nhau về đối tượng sử dụng, phạm vi, cấu hình và vòng đời. Các package độc lập cho phép deployment cấp quyền cho một trong hai chiều mà không ngầm định cấp luôn chiều còn lại.

### Duy trì hộp thư parent offline bền vững

Sửa đổi hoặc khôi phục nguội một parent không online đòi hỏi một bộ giao thức mới về địa chỉ hóa bền vững, quyền, xung đột, xác nhận và phát lại. Yêu cầu parent trực tiếp phải online cho phép phiên bản đầu tiên tiếp tục dùng đường gửi Agent hiện có.

### Đưa lại Task hoặc result promise

Một lớp bọc mang kết quả sẽ khiến một báo cáo hoặc một lượt trông có vẻ mang tính kết thúc, và đưa trở lại sự không khớp về vòng đời mà Activation có thể tiếp tục đã loại bỏ. Việc gửi tường minh, có thể lặp lại không cần một đối tượng thực thi trung gian.

### Xác thực setup sau khi tạo Agent

Kiểm tra thu hồi sau khi đã tạo xong chỉ có thể từ chối Activation sau khi cả Agent và session đã được publish. Dispose handle được trả về sẽ loại bỏ đối tượng thời gian thực, nhưng seam hiện tại không thể xóa nội dung đã persist, nên sẽ để lại một child vẫn có thể khôi phục được trong khi continuation manager lại cho rằng nó chưa từng được thiết lập. Thay vào đó, trả về `AgentSetupCommit`, để Agent factory có thể thực hiện đồng bộ cùng một kiểm tra trạng thái khả biến đó tại chính ranh giới publish của nó.

## Tác động

- Chỉ khi package report được cài đặt đóng góp thì child trong tiến trình có thể tiếp tục mới phơi ra đúng một schema `report` cục bộ theo phạm vi; Agent không liên quan sẽ không bao giờ phơi ra schema đó.
- Công cụ trả về `MessageId` ổn định của tin nhắn parent. Gửi âm thầm không có `InboxItemId`; gửi đánh thức tạo ra một inbox item instance riêng.
- Chỉ chính child đang thường trú mới có thể báo cáo, và chỉ báo cáo tới chính parent trực tiếp đang online được suy ra từ phả hệ (lineage) đã persist. Service không nhận tham số receiver, cũng không cung cấp fallback offline.
- Gửi đánh thức là chế độ mặc định sau kiểm tra: nó tạo đúng một lượt FIFO tiếp theo, không bao giờ steer một lượt đã bắt đầu. Gửi âm thầm thì không bao giờ khởi động request của parent.
- Việc parent hủy hoặc dispose child sau khi đã chấp nhận không thu hồi lại báo cáo. Trước khi chấp nhận, dispose child, drain, mất parent hay bên gọi hủy đều làm thao tác bị từ chối.
- Cả Activation mới tạo và Activation được khôi phục đều kết hợp các đóng góp setup hiện có trước khi publish. Ủy quyền mới phải chờ tới Activation kế tiếp mới có hiệu lực, còn thu hồi ủy quyền cho child đang thường trú thì có hiệu lực ngay lập tức.
- Bao phủ unit test cố định khả năng hiển thị, hành vi allow-list, hai chế độ gửi, danh tính tin nhắn và bên gửi ổn định, định tuyến lồng nhau, bên gửi không hợp lệ, parent bị thiếu, hủy, drain, tranh chấp thu hồi, và việc không tồn tại Task hay báo cáo cuối cùng ngầm định.
- Snapshot lắp ráp tổng thể không cần key chứng minh công cụ child thật, đúng một lượt parent bị đánh thức đó, phần gói parent đã persist, và việc parent tiêu thụ sau đó.

### Rủi ro đã chấp nhận

Ranh giới chấp nhận này yếu hơn việc gửi đầu-cuối bền vững. Sự cố có thể khiến kết quả không rõ ràng, còn retry có thể dẫn tới báo cáo trùng lặp.

Gửi đánh thức có thể khuếch đại khối lượng công việc của model khi các child lồng nhau báo cáo thường xuyên. Giao cho chủ sở hữu deployment kiểm soát qua `reportDelivery` có thể giới hạn rủi ro này, nhưng không thể loại bỏ hoàn toàn.

Sự tồn tại trong registry chính là tín hiệu parent đang online. Một parent do host sở hữu, nếu đã bắt đầu `AgentHandle.dispose()` nhưng chưa hoàn tất dọn dẹp phạm vi của nó, vẫn có thể chấp nhận và thêm vào một báo cáo mà tiến trình này sẽ không còn xử lý nữa. Để lấp khoảng trống này, cần một tín hiệu bắt đầu dispose ở tầng Agent, không thể suy luận được từ tầng subagent.
