# @deepseek-ai/dsh-client-ui-subagent

[English](README.md) | Tiếng Việt

Owner tính năng subagent trên Web: đóng góp một cây thư mục mở rộng được theo kiểu lazy-load vào `conversation.session.header.actions`, đóng góp các cách hiển thị thay thế chỉ đọc phân biệt theo nguyên nhân vào chuỗi editor của phiên, đồng thời giữ nguyên source tham chiếu `@` sẵn có được đăng ký vào `ctx.inputTriggers`.

Thao tác ở phần đầu trang đọc `subagentsByParent` và tóm tắt phiên qua hook chuẩn `useSessions`. Khi thư mục trực tiếp khác rỗng đã về, trigger của nó thống kê toàn bộ phả hệ hậu duệ chỉ gồm subagent, dừng lại ở các fork thông thường, và hiển thị hoạt động vẫn đang diễn ra nếu bất kỳ hậu duệ nào được tính đang ở trạng thái `running`. Cây thu gọn vẫn lấy thư mục trực tiếp làm căn cứ có thẩm quyền: các dòng có thể tiếp tục và one-shot hiển thị mode, trạng thái hoạt động `running`/`inactive` và title tùy chọn được nhật ký hậu thuẫn, còn cột đuôi hiển thị tổng lượng token sử dụng đã được nhà cung cấp lưu bền ở dòng trên và thời lượng lượt đang hoạt động ở dòng dưới. Tổng lượng token sử dụng là tổng của bốn nhóm `tokenUsage` không chồng lấn nhau. Thời lượng hiển thị chính xác đến giây khi chưa đủ một ngày, còn từ một ngày trở lên thì dùng tối đa hai đơn vị liền kề — ngày/giờ, số tháng xấp xỉ/ngày, hoặc số năm xấp xỉ/tháng — trong khi thông tin khi rê chuột và tên dành cho trợ năng vẫn giữ giá trị chính xác theo ngày/giờ/phút/giây. Thời lượng cộng dồn các lượt `subagentTiming` đã hoàn tất, chỉ tăng mỗi giây một lần khi child đang chạy có lượt chưa kết thúc, và đóng băng sau khi child chuyển sang inactive; lượt chưa kết thúc bị gián đoạn lấy `active.through` cùng lát cắt của chính nó làm cận trên, tuyệt đối không dùng metadata phiên mới hơn. Dòng one-shot không có label sẽ lùi về id phiên của nó, còn các dòng hỏng, không được hỗ trợ hoặc không khả dụng vẫn đọc được nhưng bị vô hiệu hóa. Gợi ý `hasChildren` của mỗi dòng khỏe mạnh quyết định có hiển thị nút mở rộng hay không trước cả khi có tương tác, nên các nút lá đã biết không bao giờ hiện mũi tên; mỗi tầng thư mục chỉ chừa cột mở rộng khi có ít nhất một dòng khỏe mạnh trong đó là nhánh, nhờ vậy các tầng hoàn toàn không có nhánh có thể bắt đầu ngay từ dấu trạng thái ở phía trước nhất. Khi mở rộng một nhánh, mỗi hậu duệ trực tiếp đã biết lập tức được chừa một dòng đang tải bị vô hiệu hóa, sau đó các dòng giữ chỗ này được thay bằng kết quả lazy-load từ thư mục có thẩm quyền của child đó. Mỗi nhánh đang hiển thị đều được báo lên runtime, nhờ đó frame thành viên chỉ kích hoạt làm mới có debounce tại nơi cây đang được tiêu thụ. Chọn một mục ở bất kỳ độ sâu nào đều gọi `SessionRuntime.openSubagent()` với địa chỉ chính xác của dòng đó `{parentSessionId, childSessionId, mode}`. Trạng thái cục bộ của component phụ trách khả năng hiển thị của cây, các nhánh đã mở rộng, tiêu điểm bàn phím và đồng hồ thời lượng đang chạy. ArrowRight/ArrowLeft mở rộng và thu gọn nhánh; ArrowUp/ArrowDown, Home, End và Escape dùng để điều hướng hoặc đóng cây; sau khi đóng, tiêu điểm quay về trigger. Phần tạo kiểu chỉ dùng token.

Child one-shot luôn dùng editor chỉ đọc và diễn giải transcript (bản ghi văn bản) như một biên bản thực thi đã hoàn tất. Child có thể tiếp tục chỉ dùng editor chỉ đọc khi parent chính xác của nó không khả dụng và child không đang chạy, kèm lời văn giải thích đường phục hồi; trong lúc child loại này vẫn đang chạy, selector nhường chỗ cho editor thông thường — vùng nhập liệu và thao tác Send bị vô hiệu hóa, nhưng nút Stop độc lập vẫn dùng được, và sau khi dừng thì bản thay thế chỉ đọc quay lại. Khi parent chính xác còn sống, child có thể tiếp tục giữ nguyên chrome nhập liệu thông thường, phiên của nó định tuyến prompt qua `subagent.prompt`: trong lúc child đang chạy, ô nhập và Send vẫn dùng được, vì mỗi tin nhắn tiếp theo đều đi vào inbox FIFO của child, còn nút Stop độc lập định tuyến qua `subagent.interrupt`. Gói này tuyệt đối không nhận ngữ cảnh của host, cũng không gọi các công cụ hướng tới mô hình. Hành vi của thư mục và editor được quy định bởi [Agent Note về hội thoại subagent trên Web](../../../.agents/notes/implemented/feature/2026-07-27-web-subagent-conversations.md) và [Agent Note về ngắt lượt hiện tại](../../../.agents/notes/implemented/feature/2026-08-06-continuable-subagent-interrupt.md).

Thanh bên thông thường lược bỏ các dòng phiên có origin là subagent, nên thư mục ở đầu trang của parent chính là lối vào điều hướng của chúng. Các fork thông thường vẫn nằm trong thanh bên.

Source `@` vẫn cố ý giữ độc lập và lười biếng. Ứng viên là các child đang chạy lấy từ `ctx.sessions.list` với không RPC nào; thao tác chọn chèn văn bản nguyên văn `@label `, và codec chiếu thành `@label`. Nó không tham gia phân xử lệnh, cũng không phân giải label thành địa chỉ tiếp tục thực thi.

## Trải nghiệm mô hình

### Văn bản label subagent trong prompt người dùng

#### Nội dung mô hình nhìn thấy

Chỉ source tham chiếu `@` cũ ảnh hưởng tới đầu vào của mô hình: ứng viên được chọn đi vào tin nhắn người dùng thông thường dưới dạng văn bản nguyên văn `@label`, không có khối nội dung chuyên biệt hay phân giải phía host. Duyệt thư mục, điều hướng tới child và xem transcript đã lưu bền đều không thêm section nào vào prompt; nội dung tương tác tiếp tục đã nhận sẽ trở thành tin nhắn người dùng FIFO thông thường thông qua adapter subagent của host.

#### Ảnh hưởng token

Có điều kiện và chỉ thêm vào: `@label` nguyên văn hoặc tin nhắn tiếp theo của người dùng chỉ làm tăng token cho đúng tin nhắn người dùng mới tương ứng. Các thao tác với thư mục và transcript thêm không token mô hình nào.

#### Ảnh hưởng KV Cache

Chỉ thêm vào. Gói này tuyệt đối không viết lại token của các yêu cầu trước đó.

## Hạn chế đã biết và phần tạm hoãn

- **Thư mục không có kết quả lưu bền**: trạng thái hoạt động và tính giờ không phân biệt được hoàn tất, thất bại hay hủy bỏ, và UI không phơi bày danh tính Activation; khả năng dừng chỉ giới hạn ở nút Stop cho lượt hiện tại trên editor đối với child có thể tiếp tục đang chạy.
- **Tham chiếu `@` vẫn là văn bản tiêu đề hiển thị**: label trùng lặp hoặc đã đổi tên sẽ gây nhập nhằng, nên chúng cố ý không nhận ngữ nghĩa tiếp tục thực thi.
