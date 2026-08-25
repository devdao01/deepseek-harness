# Agent Note: Các giai đoạn ngữ nghĩa cho việc bầu chọn chuỗi composer

Status: proposed

[English](2026-08-08-semantic-composer-chain-phases.md) | 中文

## Vấn đề

Chuỗi `conversation.composer` của trình duyệt trước tiên sắp xếp mọi ứng viên theo một `priority` số toàn cục duy nhất, rồi chọn selector đầu tiên trả về kết quả khớp. Question dùng priority mặc định `0`, approval dùng `1`, còn composer subagent chỉ-đọc dùng cho trường hợp one-shot hoặc khi cha không khả dụng dùng `-10`. Do đó, sau khi chọn lịch sử subagent one-shot, ngay cả khi bên dưới nó có question hoặc approval đang chờ trả lời, giao diện vẫn có thể hiển thị mô tả chỉ-đọc.

Lỗi này không phải do một con số nào sai. Chuỗi hiện tại dùng cùng một đại lượng vô hướng để đưa ra hai quyết định khác nhau: ứng viên đó rốt cuộc dùng để giải quyết tương tác hiện có, hay dùng để hạn chế việc bắt đầu công việc mới; và cách xác định thứ tự ưu tiên cục bộ giữa các ứng viên trong cùng một hạng mục ngữ nghĩa. Bất kỳ bản sửa số nào cũng sẽ giữ lại sự khớp nối ngầm này, khiến bên đăng ký sau này có thể lại đưa lỗi này vào một lần nữa.

## Đề xuất

Khai báo chuỗi có thể định nghĩa một bộ giai đoạn có thứ tự do lĩnh vực sở hữu tương ứng nắm giữ. `conversation.composer` khai báo `['interaction', 'restriction']`; mỗi đăng ký trên chuỗi có phân giai đoạn này đều phải chỉ định một giai đoạn, `priority` số của nó chỉ sắp xếp trong phạm vi giai đoạn đó. `SlotCore` sắp xếp lần lượt theo chỉ số giai đoạn đã khai báo, priority cục bộ, và thứ tự đăng ký ổn định. Nếu một entry đăng ký trên chuỗi có phân giai đoạn bỏ qua giai đoạn, hoặc chỉ định một giai đoạn ngoài khai báo, việc đăng ký sẽ thất bại ngay lập tức. Chuỗi không phân giai đoạn tiếp tục dùng hành vi sắp xếp theo số như hiện tại.

Question và approval đăng ký vào `interaction`, và giữ nguyên thứ tự hiện có trong giai đoạn — question trước approval. `SubagentReadOnlyComposer` đăng ký vào `restriction` với priority cục bộ thông thường. Quy tắc lĩnh vực được định nghĩa rõ ràng: interaction dùng để giải quyết những điều đang chờ hoàn tất đã tồn tại và vẫn còn hiệu lực trên Host; restriction thì ngăn người dùng bắt đầu công việc mới qua composer thông thường. Hoàn tất một điều đang chờ không phải là gửi tin nhắn tiếp theo mới cho một child one-shot, nên giai đoạn interaction xếp trước. Sau khi điều đang chờ được giải quyết, chuỗi sẽ bầu chọn lại, và giới hạn chỉ-đọc sẽ xuất hiện lại.

Bộ từ vựng giai đoạn thuộc về lĩnh vực đã khai báo slot đó, không thuộc về framework slot toàn cục. `SlotMap` mang theo bộ giai đoạn chính xác, dùng để đăng ký lúc biên dịch; `SlotSpec` lúc runtime lặp lại bộ giai đoạn đó làm căn cứ sắp xếp. Các chuỗi khác sẽ không nhận bất kỳ thuật ngữ composer nào, cũng không cần di trú, trừ khi chúng chủ động khai báo giai đoạn.

Đề xuất này mở rộng convention của [Hội thoại subagent trên Web](../../implemented/feature/2026-07-27-web-subagent-conversations.md), [Quyền và phê duyệt trên Web](../../implemented/feature/2026-07-23-web-permission-and-approval.md) và [Ý định hiển thị review plan](../../implemented/feature/2026-07-30-plan-review-presentation-intent.md), nhưng không thay thế bất kỳ đề xuất nào trong số đó. [Guard sở hữu child ở tầng runtime](../../implemented/bug-fix/2026-08-01-ask-user-delegated-caller-guard.md) vẫn là cơ chế có thẩm quyền ngăn child tự tạo điều đang chờ con người mà nó tự chịu trách nhiệm. Khi đề xuất này được triển khai, không nên archive bất kỳ Agent Note đang active nào.

## Các phương án thay thế đã cân nhắc

**Đẩy priority của mục chỉ-đọc xuống sau question và approval.** Đây là bản sửa chiến thuật nhỏ nhất, nhưng nó vẫn mã hóa quan hệ chi phối ngữ nghĩa bằng khoảng cách số không được ghi lại, và buộc loại composer tiếp theo phải đoán vị trí của mình trên cùng một thang đo toàn cục.

**Để selector chỉ-đọc từ chối khớp khi `interactions` không rỗng.** Cách này có thể sửa cặp component hiện tại, nhưng sẽ buộc plugin restriction phải hiểu mọi lĩnh vực có thể thao tác, và lặp lại chiến lược bầu chọn trong từng selector. Mỗi khi thêm một loại interaction mới, đều phải sửa mục restriction không liên quan đến nó.

**Chỉ dựa vào guard child ở tầng runtime.** Guard này có thể sửa lời gọi model mới, nhưng không thể định nghĩa thứ tự của trình duyệt đối với các loại interaction khác như: điều đang chờ đã có sẵn, phiên bản chồng lấn trong quá trình rolling upgrade, hoặc approval. Quyền runtime và bầu chọn hiển thị là hai bất biến độc lập.

**Render tất cả giao diện tiếp quản khớp thành một ngăn xếp.** Composer chỉ có một chỗ ngồi thao tác. Xếp chồng đồng thời question, approval và giao diện chỉ-đọc sẽ khiến focus bàn phím và quyền sở hữu câu trả lời trở nên mập mờ, thay vì chọn ra một thao tác hiện tại.

## Tiêu chí nghiệm thu

- Test `SlotCore` chứng minh thứ tự giai đoạn ưu tiên hơn bất kỳ priority cục bộ nào; priority cục bộ và thứ tự đăng ký ổn định vẫn có hiệu lực trong phạm vi giai đoạn; giai đoạn không xác định hoặc bị thiếu sẽ thất bại rõ ràng; chuỗi không phân giai đoạn giữ nguyên không đổi.
- Test Composer bao phủ: question cộng mục chỉ-đọc, approval cộng mục chỉ-đọc, question cộng approval cộng mục chỉ-đọc, quay lại mục chỉ-đọc sau khi giải quyết xong, và fallback về InputBar khi mọi selector đều từ chối khớp. Question vẫn xếp trước approval trong `interaction`.
- Dispose (giải phóng tài nguyên), đăng ký lại theo HMR (thay thế module nóng) và replay khi kết nối lại đều không được để lại giai đoạn trúng cử lỗi thời; việc bầu chọn vẫn là hàm thuần túy của props chủ sở hữu hiện tại và các entry đăng ký hiện tại.
- Một snapshot Web lắp ráp không cần khóa ghim lại hội thoại one-shot đã được định địa chỉ cùng interaction đang chờ của nó: giao diện interaction thắng, sau khi giải quyết xong interaction đó, giao diện chỉ-đọc xuất hiện trở lại.
- Convention README/JSDoc của slot, conversation, question, permission và subagent cùng mô tả quyền sở hữu giai đoạn và quy tắc interaction đi trước restriction.
- Thay đổi này không sửa bất kỳ định nghĩa tool nào model nhìn thấy, phần nào của system prompt, định tuyến request hay sự kiện phiên. Do đó việc bầu chọn ở trình duyệt không phát sinh chi phí token, cũng không làm mất hiệu lực KV Cache; test sẽ so sánh header request model trước và sau khi chuyển trạng thái chỉ xảy ra ở phía client.

## Rủi ro

Tên giai đoạn có thể trở thành một thứ thay thế mập mờ cho thiết kế thực sự. Vì vậy, mỗi slot có phân giai đoạn phải có một quy tắc sắp xếp ngắn gọn, và từ chối các entry đăng ký không thể giải thích mình thuộc về phía nào. Nếu tương lai có giao diện an toàn bắt buộc phải ưu tiên hơn thao tác trả lời, không nên gán nhầm nó là `restriction`; nó cần một giai đoạn tường minh xếp trước hơn, hoặc nằm ở một ranh giới ngoài chuỗi composer này.

Kiểu slot tổng quát và hình thái entry đã lưu trữ sẽ thêm một field có điều kiện, nên khi di trú không hoàn chỉnh, code có thể biên dịch qua được ở một face nhưng lại thất bại lúc runtime. Việc lặp lại bộ giai đoạn chính xác trong khai báo runtime chính là để hệ thống có thể từ chối sự trôi lệch này một cách máy móc. Question và approval đồng thời vẫn dùng chiến lược một-giao-diện; đề xuất này giữ nguyên thứ tự hiện tại của chúng, không giải quyết vấn đề xếp hàng nhiều interaction.
