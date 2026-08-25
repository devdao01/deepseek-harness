# @deepseek-ai/dsh-client-ui-jobs

[English](README.md) | Tiếng Việt

Nơi sở hữu tính năng tác vụ nền trên Web: đóng góp một mục vào `conversation.session.header.actions`, liệt kê các bản ghi `ctx.jobs` mà phiên hiện tại nhìn thấy được. Dữ liệu hoàn toàn đến từ bản sao danh sách `jobsBySession` mà [`dsh-client-runtime`](../runtime/README.md) gấp lại từ các frame `session/jobs`, nên gói này không phát bất kỳ RPC nào và không giữ trạng thái nào ngoài việc đóng/mở lớp popup.

Bộ kích hoạt chỉ được render khi phiên có ít nhất một tác vụ, để các cuộc hội thoại thông thường không mọc thêm điều khiển chỉ vì một năng lực chưa được dùng đến. Số trên huy hiệu là `running` cộng `stopping`, bỏ qua khi bằng không, nhờ vậy phiên chỉ còn tác vụ đã kết thúc vẫn giữ một lối vào lịch sử lặng lẽ thay vì tuyên bố một con số «không». Lớp popup là một danh sách phẳng: các dòng đang hoạt động đứng trước, sắp xếp tăng dần theo `startedAt`, tiếp đó là các dòng trạng thái cuối sắp giảm dần theo `finishedAt`; trường hợp trùng mili-giây được phá vỡ theo thứ tự khởi động, còn thứ tự lặp map của bên chủ quản không bao giờ tham gia quyết định. Mỗi dòng hiển thị kind của bên sản xuất, label, dấu trạng thái, đoạn văn bản `detail` do bên sản xuất cung cấp sẽ thay thế từ trạng thái chung ngay khi có, cùng thời lượng đã trôi. Thời lượng đó tiến từng giây khi tác vụ còn hoạt động và đóng băng tại `finishedAt`; đồng hồ chỉ chạy khi danh sách đang mở thực sự có thứ gì đó chuyển động. Dòng trạng thái cuối thiếu `finishedAt` được đọc là không thay vì số âm, còn thời lượng vượt quá một giờ vẫn giữ nguyên đơn vị giờ, không mọc thêm từ «ngày» mà hiện chưa bên sản xuất nào chạm tới.

Các dòng trạng thái cuối vẫn hiển thị và được làm mờ đi cho đến khi registry loại bỏ chúng lúc owner bị hủy. Chúng vốn đã nằm trong snapshot, `detail` của tác vụ thất bại là nơi duy nhất đọc được lý do thất bại, nên lọc bỏ chúng ở đây là việc mà hai giai đoạn xuất kết quả và ngắt sẽ phải lật lại. Vì vậy một subagent nền chạy một lần đang hoạt động sẽ xuất hiện đồng thời ở đây và trong [thư mục subagent](../ui-subagent/README.md): thư mục lo việc đi vào transcript của phiên con, còn danh sách này là điểm neo duy nhất mà năng lực ngắt trong tương lai có thể gắn vào.

Escape đóng danh sách và trả tiêu điểm về bộ kích hoạt, nhấn con trỏ bên ngoài cũng vậy. Khi tác vụ cuối cùng biến mất, danh sách được đóng trước rồi mới gỡ điều khiển, nhờ đó tiêu điểm không biến mất khỏi một node đã bị loại bỏ. Kiểu dáng chỉ dùng token; văn bản đi qua namespace locale `job` của chính gói này. Hành vi được quy định bởi [Agent Note về hiển thị tác vụ nền trên Web](../../../.agents/notes/implemented/feature/2026-08-08-web-background-job-display.md).

## Trải nghiệm mô hình

Không có, vì gói này render trạng thái registry do bên chủ quản tính toán cho con người, không chạm tới prompt, tin nhắn, schema, luồng hay kết quả công cụ. Góc nhìn của mô hình về cùng tập tác vụ đó vẫn thuộc về [`dsh-tool-jobs`](../../jobs/tool-jobs/README.md).

#### KV Cache effect

Không có; gói này không bao giờ lắp ráp hay gửi yêu cầu tới provider.

## Hạn chế đã biết và phần tạm hoãn

- **Các dòng chỉ đọc** — luồng xuất của tác vụ và việc con người chủ động ngắt là hai giai đoạn độc lập. Việc ngắt còn nợ thêm một quyết định hướng mô hình mà seam hiện chưa trả lời được: `kill()` đánh dấu việc chuyển giao trạng thái cuối là đã báo cáo, nên một hành vi ngắt viết theo hợp đồng hiện tại sẽ khiến mô hình cứ tưởng tác vụ của nó vẫn đang chạy.
- **Danh sách không đồng nghĩa với tập hợp của chính registry** — nó trình bày «một phiên nhìn thấy gì qua khung nhìn đường truyền», nên tác vụ do phiên khác sở hữu không bao giờ xuất hiện ở đây; còn khi tiến trình khởi động lại thì danh sách trống rỗng, trong khi thẻ `run_in_background` khởi động những tác vụ đó vẫn còn trong transcript. Tác vụ vô chủ (khởi động khi không có `Agent` sống nào) là trường hợp ngược lại: nó đi vào danh sách của mọi phiên, nhất quán với cách `list(caller)` báo cáo cho từng bên gọi.
