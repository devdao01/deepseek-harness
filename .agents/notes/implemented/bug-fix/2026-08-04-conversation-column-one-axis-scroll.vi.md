# Agent Note: Cột session chỉ cuộn trên một trục

Status: implemented

[English](2026-08-04-conversation-column-one-axis-scroll.md) | 中文

## Vấn đề

Khi cột giữa bị thu hẹp — dù là kéo cửa sổ hay kéo sidebar — toàn bộ cột session ở trạng thái hero sẽ xuất hiện một thanh cuộn ngang bên dưới. Phần tử bị tràn là hình ellipse nền trang trí của hero: `.heroGlow` lấy chiều rộng theo tỷ lệ `1051/776` của box hero, để độ mờ (blur) của nó co giãn theo userSpace cùng với thẻ input; điều này cũng có nghĩa là chỉ cần cột hẹp hơn nó thì nó sẽ vươn ra ngoài cột.

Phần tràn ra này là chủ đích thiết kế, giữ nguyên không đổi. Thứ thực sự khiến nó lộ ra với user là container cuộn chứa nó. `[data-conversation-scroll]` chỉ khai báo `overflow-y: auto`, còn trục kia để nguyên giá trị khởi tạo `visible`; mà một box cuộn trên một trục sẽ tính `visible` của trục còn lại thành `auto`. Vì vậy mỗi cột hẹp hơn ellipse đó thực sự cho ra một khoảng cuộn ngang — kiểm chứng thực tế ở vài mức chiều rộng thường gặp trên laptop, đo được 24–95px.

## Quyết định

`.scrollBody` khai báo `overflow-x: hidden`. Cột này khai báo tường minh rằng bản thân nó là container cuộn một trục, thay vì giao trục thứ hai cho suy luận.

Hành vi cắt (clipping) không đổi. `overflow-y: auto` từ trước đã khiến box này là container cuộn cắt trên cả hai trục, nên khai báo này chỉ thu hồi thanh cuộn và cử chỉ của user; ellipse vẫn giữ phần tràn ra của nó, bán kính blur, và cùng phạm vi vẽ, cột vẫn giữ cuộn dọc. Không có gì di chuyển trên chuỗi liên kết tới khu vực input.

## Các phương án đã cân nhắc

**Thu ellipse vào bên trong cột.** Bác bỏ. Chiều rộng của ellipse chính là căn cứ để `stdDeviation="50"` của nó co giãn theo thẻ input (figma 313:14109); ràng buộc chiều rộng sẽ khiến cột càng hẹp thì blur càng gắt, tức là sửa một thanh cuộn nhưng tạo ra một hồi quy thị giác.

**Bọc ellipse trong một clipping box riêng.** Bác bỏ. Box này chỉ có nhiệm vụ duy nhất là triệt tiêu phần tràn mà cột vốn dĩ đã cắt sẵn, còn `overflow-x: auto` được suy luận vẫn còn nguyên đó, chờ phần tử tràn tiếp theo — trong transcript (bản ghi văn bản) không thiếu ứng viên loại này.

**Dựa vào `.centerCol { overflow: hidden }` của khung ngoài.** Không giúp được gì. Việc cắt đó nằm ngoài container cuộn, chỉ có thể che phần ellipse thò ra tại biên cột, còn container bên trong vẫn có thể cuộn tới chạm được nó. Thanh cuộn mà user báo cáo thuộc về container bên trong.

**Khẳng định `scrollWidth === clientWidth` trong test.** Bị bác bỏ làm tiêu chí, vì nó không phân biệt được hai trạng thái: `hidden` cắt phần tràn, chứ không sắp xếp lại nó, nên phạm vi cuộn đọc được trước và sau khi sửa là như nhau. Điều duy nhất khác biệt là việc từ chối cử chỉ của user, đây chính là điều kịch bản này đo lường.

## Kiểm thử

[apps/web/tests/conversation-column-overflow.e2e.ts](../../../../apps/web/tests/conversation-column-overflow.e2e.ts) quét qua một tập chiều rộng viewport kẹp chiều rộng ellipse ở giữa, ở mỗi mức kích hoạt event lăn chuột ngang trên cột và đọc `scrollLeft`. Golden đã commit ghi lại quan hệ này theo từng mức; mức rộng nhất là đối chứng cho trường hợp ellipse hoàn toàn không tràn.

Có hai lớp phòng vệ để đảm bảo kịch bản này không chỉ mang tính hình thức. Lớp phòng vệ chống rỗng khẳng định ở mức hẹp, ellipse thực sự vẫn còn vươn ra ngoài cột, khiến khẳng định này không thể pass chỉ vì triệu chứng biến mất do lý do không liên quan. Đối chứng biến thể thì cưỡng bức đổi ngược `overflow-x: auto` ngay trong trang, chứng minh cùng một cử chỉ ở cùng một thời điểm có thể đưa cột tới biên cuộn dương. Test đo trực tiếp biên đó, vì khe thanh cuộn ổn định có thể khiến một phần tràn nằm ở phía âm so với gốc cuộn. Nếu không có đối chứng này, việc `scrollLeft` đọc được 0 cũng có thể giải thích là event lăn chuột hoàn toàn không được gửi tới.

## Hệ quả

Cột session ở bất kỳ chiều rộng nào cũng không còn cho ra thanh cuộn ngang, phần tràn trang trí trên chuỗi liên kết tới khu vực input chuyển từ lộ ra như phạm vi cuộn sang bị cắt. Cái giá phải trả là nội dung thực sự quá rộng bên dưới cột này sẽ bị cắt thay vì cuộn tới được: các giao diện loại này đã tự có container cuộn riêng của mình, ví dụ code block markdown và bảng trajectory.
