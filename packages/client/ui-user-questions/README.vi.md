# @deepseek-ai/dsh-client-ui-user-questions

[English](README.md) | Tiếng Việt

Plugin tính năng đặt câu hỏi trên Web: phía trình duyệt của nó đăng ký mục `question` vào keyed slot `conversation.composer` do phiên sở hữu. Phía host của nó cố ý để trống — gắn `dsh-tool-ask-user` ở đó sẽ đặt công cụ vào **tầng toàn cục** của registry, mà tầng toàn cục lại hợp nhất vào từng agent (tác tử) bất kể agent đó do preset nào lắp ráp, khiến một preset benchmark «hai công cụ» thực tế lại hiện ra ba. Render câu hỏi là năng lực UI của host, còn sở hữu công cụ đó là năng lực của agent, nên dòng `tool-ask-user` thuộc về từng preset cần đến nó (và cả phần lắp ráp TUI vốn không có preset).

Component render mỗi lần một câu hỏi, cung cấp điều hướng tiến độ, các lựa chọn đơn chọn và đa chọn, huy hiệu khuyến nghị dẫn xuất từ hậu tố nhãn, cùng câu trả lời tùy chỉnh. Khi người dùng mở hoặc sửa câu trả lời tùy chỉnh, bản nháp của câu hỏi đa chọn vẫn giữ các nhãn đã chọn, nhờ vậy mục gửi đi có thể mang đồng thời `selected` và `custom`; câu trả lời tùy chỉnh của câu hỏi đơn chọn vẫn loại trừ lẫn nhau. Chi tiết câu hỏi tái dùng nguyên thủy `MarkdownText` của đầu ra trợ lý, bao gồm cả phần render GFM và chính sách nội dung không đáng tin của nó. Thẻ giới hạn chiều cao giữ cố định tiêu đề, phần điều hướng và thao tác gửi, còn phần chi tiết và các lựa chọn quá dài dùng chung một vùng cuộn bên trong. Chọn một lựa chọn đơn chọn sẽ chuyển tiếp ngay lập tức; sau khi mọi câu hỏi đều đã trả lời hoặc bỏ qua, Enter sẽ gửi; trong lúc soạn thảo bằng IME, nhấn Enter chỉ xác nhận ứng viên nhập liệu chứ không chuyển tiếp. Component gửi một lô câu trả lời có cấu trúc cho cả yêu cầu: «bỏ qua câu hỏi này» giữ nguyên các bản nháp khác và phát ra dạng rỗng `{ selected: [] }` sẵn có cho mục đó; đóng lại sẽ từ chối toàn bộ phần đang chờ bằng `ASK_CANCELLED`.

Nếu câu hỏi duy nhất của một yêu cầu khai báo ý định hiển thị thì thay vào đó sẽ render giao diện riêng của ý định ấy. `plan-review` — do `dsh-plan-mode` đặt trên phần duyệt `exit_plan_mode` — mang hình dạng của thẻ chờ phê duyệt: một dải `Plan review`, kế hoạch làm phần thân markdown cuộn được, văn bản câu hỏi làm tên trợ năng của thẻ, cùng một hàng thao tác quyết định `Chat about it` / `Refuse` / `Approve`. Approve và Refuse trả lời bằng chính nhãn lựa chọn của bên hỏi (ý định chỉ đích danh nhãn nào nghĩa là phê duyệt, nên việc phân xử tuyệt đối không phụ thuộc thứ tự lựa chọn) và giữ phần mô tả của bên hỏi làm tooltip; `Chat about it` từ chối phần chờ đó bằng `ASK_CANCELLED`, đưa editor về vị trí cũ để người dùng nói thẳng điều họ muốn nói. Thẻ chỉ tiếp quản khi nó có thể phát ra được mọi câu trả lời mà yêu cầu đó cho phép: chỉ có một câu hỏi, có khai báo ý định, kế hoạch tồn tại dưới dạng `detail`, có cung cấp nhãn phê duyệt được chỉ đích danh, và là dạng nhị phân đơn chọn (ngoài phê duyệt thì tối đa một lựa chọn nữa, và không phải đa chọn). Mọi tình huống khác — không có ý định, một lô có nhiều câu hỏi, thiếu kế hoạch, nhãn phê duyệt không khớp lựa chọn nào, xuất hiện lựa chọn thứ ba, quyết định đa chọn — đều ở lại luồng chung vốn có thể diễn đạt được nó. Ý định chỉ thay đổi bố cục, không bao giờ thay đổi tập câu trả lời có thể đạt tới.

Trạng thái lựa chọn chỉ tồn tại cục bộ trong component với key là rpcId của yêu cầu. Khi phát lại bằng cùng id, bản nháp vẫn được giữ chừng nào component còn được gắn; còn `question/resolved` do host phát ra sẽ gỡ bỏ editor. Host vẫn có quyền quyết định cuối cùng: HTTP giao thành công không làm gỡ bỏ trạng thái đang chờ ở phía cục bộ.

Văn bản khung ngoài của editor (bộ chuyển trang, nút bấm, chữ gợi ý, thông báo kiểm tra) là song ngữ: plugin đăng ký từ điển zh/en dưới namespace `question` của `dsh-client-locale`, và thông qua inject face trao hàm dịch đã ràng buộc cùng nguồn snapshot locale cho mục đó, nên đổi ngôn ngữ sẽ render lại editor đang được gắn. Văn bản câu hỏi và lựa chọn đến từ mô hình và được render nguyên trạng; thông báo lỗi của lớp truyền tải cũng hiển thị trực tiếp mà không qua dịch.

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp qua `dsh-tool-ask-user`; gói đó sở hữu schema công cụ mà mô hình nhìn thấy và kết quả có cấu trúc.

#### Ảnh hưởng KV Cache

Không làm mất hiệu lực trực tiếp; lời gọi công cụ và kết quả mà mô hình nhìn thấy thuộc sở hữu của `dsh-tool-ask-user`.

## Hạn chế đã biết và phần tạm hoãn

- **Bản nháp chưa gửi không được lưu bền**: khi kết nối lại rồi đồng bộ hoặc tải lại toàn bộ trang, các yêu cầu đang chờ do host sở hữu với cùng rpcId sẽ được khôi phục, nhưng việc gỡ editor sẽ đặt lại bản nháp lựa chọn và văn bản tùy chỉnh ở phía cục bộ.
- **Mỗi lần chỉ có một yêu cầu sở hữu editor**: các yêu cầu đang chờ tiếp theo vẫn nằm trong snapshot phiên và sẽ hiển thị sau khi yêu cầu trước đó ngã ngũ.
