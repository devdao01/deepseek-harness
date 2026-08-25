# Agent Note: Kênh báo cáo của continuable child là một nghĩa vụ

Status: implemented

[English](2026-08-06-continuable-child-report-obligation.md) | Tiếng Việt

## Vấn đề

Một continuable background child sở hữu Session riêng của nó, nên bất cứ điều gì nó viết vào đó sẽ không bao giờ đến được agent đã khởi động nó. [Công cụ report](2026-07-30-continuable-subagent-report-tool.md) trao cho child đó một kênh báo cáo, nhưng lại trình bày nó như một trong nhiều tùy chọn: schema ghi "có thể gọi không lần nào hoặc nhiều lần", không có chỗ nào trong prompt của child yêu cầu nó phải gọi công cụ này, và lịch điều phối mặc định đã được chấp nhận (`quiet`) chỉ thêm báo cáo vào yêu cầu kế tiếp của parent đang ở trạng thái nghỉ, mà không đánh thức nó.

Từng lựa chọn này, xét riêng lẻ, đều hợp lý. Nhưng gộp lại, chúng khiến kênh báo cáo này không thể dùng như một hợp đồng ủy thác. Một child hoàn thành công việc, viết câu trả lời vào transcript (bản ghi văn bản) của chính nó rồi dừng lại, sẽ khiến parent chẳng nhận được gì; còn một child thực sự đã báo cáo thì lại gặp một parent đang nghỉ, phải chờ một sự kiện khác đánh thức nó mới đọc được báo cáo. Việc parent bận rộn polling `list_agents`, gửi lại tin nhắn liên tục cho child đã settle, và việc từ bỏ `subagent` để chuyển sang `workflow` trong các phản hồi bên ngoài, đều có thể quy về cùng một sự thiếu vắng bảo đảm này.

## Quyết định

Kênh báo cáo là một chỉ thị mà child nhận được, chứ không phải một năng lực mà nó phải tự khám phá. Gói report sẽ cài đặt hai đăng ký cục bộ theo scope vào mỗi continuable in-process child, và cùng một disposer sẽ hủy cả hai:

- Công cụ `report`, mà phần mô tả giờ đây nói rõ child cần gọi một lần trước khi kết thúc và đưa ra kết quả cuối cùng tự đầy đủ, đồng thời gọi sớm hơn nếu có tiến độ một phần có thể thay đổi bước tiếp theo của parent;
- Một system prompt section `tool:report` với order là 117, truyền tải cùng nghĩa vụ đó bằng chính giọng điệu của child, để những child không bao giờ đọc kỹ mô tả công cụ vẫn nhận được nó.

Giá trị mặc định của `reportDelivery` giờ là `wakeup`. Một báo cáo được chấp nhận sẽ tạo ra đúng một lượt (turn) parent tiếp theo bình thường và đánh thức driver của parent đang nghỉ; nó vẫn tuyệt đối không steering (dẫn dắt giữa chừng) một lượt đã bắt đầu. Với những triển khai thà để báo cáo không ai đọc còn hơn để lượt bị khuếch đại, `quiet` vẫn còn khả dụng.

### Vì sao section và mô tả cùng tồn tại

Hai thứ này nhắm vào hai kiểu thất bại khác nhau. Mô tả công cụ được đọc khi model đã đang cân nhắc gọi `report`. Section trong prompt được đọc khi model đang phán đoán xem mình đã hoàn thành hay chưa. Nghĩa vụ này phải xuất hiện ở cả hai nơi, vì lỗi mà bản sửa này khắc phục — child dừng lại luôn — xảy ra ở nơi thứ hai.

Section này được đăng ký trên chính scope của child, dùng cùng cơ chế mà [tổ hợp child](../../../../packages/subagent/subagent/src/child-agent.ts) đã dùng cho persona kiểu che khuất, do đó parent và mọi sibling đều không thấy công cụ này lẫn chỉ dẫn này. Nếu việc đăng ký công cụ thất bại, `installReportTool` sẽ rollback section đó; disposer mà nó trả về sẽ thử hủy cả hai đăng ký trước khi ném lỗi dọn dẹp thất bại.

### Là chỉ thị, không phải bắt buộc

Không có gì từ chối một child không bao giờ báo cáo. Không có đường dẫn runtime nào kiểm tra xem báo cáo đã được gửi hay chưa, `report` vẫn chấp nhận việc được gọi không lần nào hoặc nhiều lần trong một lượt. Thay đổi lần này là một cách diễn đạt hướng tới model cộng với một giá trị mặc định điều phối; các quyền dịch vụ, xác nhận và hợp đồng khôi phục đều giữ nguyên.

Ranh giới này được vạch ra có chủ đích: văn bản prompt chỉ đến được với những child vẫn đang chạy vòng lặp của chính chúng. Những child bị chấm dứt bởi lỗi, giới hạn token, hủy bỏ hoặc tháo dỡ hoàn toàn không có cơ hội tuân thủ, do đó runtime sẽ tự ghi lại việc settle thay vì tin vào chỉ thị này (xem [Việc gửi settlement do manager sở hữu](2026-08-06-manager-owned-subagent-settlement-delivery.md)).

### Phạm vi bao phủ của snapshot

Kịch bản ACP `subagent-report` được lắp ráp tổng thể giờ đây diễn tập hành vi mặc định đi kèm: child báo cáo, parent đang nghỉ thực hiện một lượt bình thường cho báo cáo đó, và các prompt tiếp theo vẫn đọc lại được báo cáo từ log đã persist. Vì scope của child này giờ tổ hợp ra một prompt mà class pin không thể mô tả, harness snapshot đã thêm `pinsChildSystemPrompts`, đối xứng hoàn toàn với `pinsChildToolSchemas` sẵn có: nó chuyển prompt của một fixture child vào `system-prompt.<n>.expected.md`, các trường header request còn lại vẫn thuộc về class pin, yêu cầu sidecar phải tồn tại đúng khi được khai báo, và từ chối sidecar giống hệt class pin, để bản sao dư thừa không thể trôi dạt âm thầm.

## Phương án thay thế

**Giữ `quiet` làm mặc định, chỉ dựa vào prompt.** Đây từng là lập trường đi kèm, và tự nó không giải quyết được gì: một báo cáo mà parent không bao giờ đọc thì không khác gì một báo cáo chưa từng được gửi. Việc [Agent Note của công cụ report](2026-07-30-continuable-subagent-report-tool.md) bác bỏ phương án "luôn luôn đánh thức" dựa trên tiền đề parent còn có lý do khác để xem lại context của mình; một bộ điều phối nền đang nghỉ thì không có lý do đó.

**Để child tự chọn chế độ gửi theo từng lệnh gọi.** Bị bác bỏ giống lý do ban đầu: model sẽ nắm quyền quyết định áp lực điều phối, và hành vi sẽ thay đổi theo từng lệnh gọi thay vì theo từng lần triển khai.

**Chỉ ghi nghĩa vụ trong mô tả công cụ.** Mô tả được đọc khi đang chọn giữa nhiều công cụ. Child mà thay đổi này nhắm tới lại không phải đang chọn công cụ — nó nghĩ mình đã làm xong. Chỉ dẫn trong prompt mới là giao diện có thể chạm tới phán đoán đó.

**Từ chối child im lặng tại thời điểm settle để buộc thực hiện nghĩa vụ.** Không có gì để từ chối: khi việc settle có thể quan sát được thì vòng lặp của child đã kết thúc, khiến việc tháo dỡ nó thất bại chỉ phá hỏng công việc mà không gửi được kết quả. Việc runtime gửi vô điều kiện sự kiện kết thúc mới là câu trả lời cho tình huống này, và điều đó thuộc về continuation manager, không thuộc về gói này.

## Hệ quả

- Sau khi tải gói này, mỗi yêu cầu của mỗi continuable in-process child sẽ có thêm một prompt section và một mô tả `report` dài hơn; yêu cầu của bất kỳ Agent nào khác đều không đổi.
- Triển khai mặc định sẽ đánh thức parent một lần cho mỗi báo cáo được chấp nhận. Các cây nested báo cáo thường xuyên sẽ tiêu tốn thêm lượt của parent; `quiet` là lối thoát đã được ghi chép.
- `installReportTool` cần `ctx.systemPrompt` trong scope của child, do đó gói này khai báo `systemPrompt` trong `inject`, để thất bại xảy ra khi tải chứ không phải đợi tới lần vật thể hóa child kế tiếp.
- Test đơn vị cố định giá trị mặc định mới, cách diễn đạt của hai chỉ thị then chốt, việc section này chỉ giới hạn ở scope của child so với parent và mọi sibling, và việc dọn dẹp cả hai đăng ký khi rollback cài đặt hoặc khi hủy.
- Ba kịch bản ACP lắp ráp tổng thể có continuable child cố định từng chữ toàn bộ prompt của child bằng sidecar mới; từ nay bất kỳ thay đổi nào với section thuộc scope child sẽ khiến các kịch bản này thất bại thay vì trôi qua âm thầm.

### Rủi ro đã chấp nhận

Việc đánh thức mặc định sẽ khuếch đại khối lượng công việc của model trong các cây sâu. Triển khai kiểm soát sự đánh đổi này qua `reportDelivery`, và mức khuếch đại bị giới hạn ở một lượt cho mỗi báo cáo được chấp nhận.

Child vẫn có thể kết thúc mà không báo cáo, và thay đổi lần này không phát hiện được điều đó. Chỉ có [việc ghi sổ settlement](2026-08-06-manager-owned-subagent-settlement-delivery.md) riêng của runtime mới bù đắp được tình huống này.
