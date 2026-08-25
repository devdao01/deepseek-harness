# @deepseek-ai/dsh-host-directory-picker-auto

[English](README.md) | Tiếng Việt

**Bộ chọn thích ứng** của [directory-picker seam](../directory-picker/README.md): một plugin chỉ có nửa phía node, quyết định một lần duy nhất tình huống host tại thời điểm khởi động, và gắn backend hai mặt phù hợp — [`-native`](../directory-picker-native/README.md) hoặc [`-browse`](../directory-picker-browse/README.md) — như một mục Loader thật vào cây gốc trong bộ nhớ (không bao giờ bền vững hóa vào file cấu hình; `write()` của cây gốc là no-op). Vì backend đến dưới dạng mục thông thường, mặt browser half của nó được client module table phát hiện theo cùng cách như một dòng cấu hình, do đó bất biến "một dòng đổi cả hai mặt" của seam vẫn được giữ nguyên cho lựa chọn đã quyết định. Việc dỡ (unload) bộ chọn này sẽ loại bỏ lại mục đó, cùng với cả hai mặt.

Việc quyết định là một lần lấy mẫu thuần túy tại thời điểm khởi động (`resolveDirectoryPickerBackend`), đã được export để tái sử dụng. `native` yêu cầu đầy đủ các tín hiệu cho biết "operator nhìn thấy màn hình host, và backend native có thể phục vụ nó": chỉ binding loopback (đọc từ `webServer` đã được inject; binding trên mọi card mạng sẽ kết nối tới trình duyệt từ xa mà không có bộ chọn OS nào chạm tới được); khởi động không qua SSH (`SSH_CONNECTION`／`SSH_TTY` không được thiết lập hoặc rỗng — dưới SSH port forwarding, bộ chọn sẽ bật lên trên một máy chủ không có ai theo dõi); và một phiên hiển thị (display session) có thể phục vụ được — trên darwin／win32 coi như luôn tồn tại; trên linux yêu cầu `DISPLAY`／`WAYLAND_DISPLAY`, cộng thêm binary zenity hoặc kdialog trên `PATH` (việc dò tìm này cũng là một sự thật tại thời điểm khởi động); trên bất kỳ nền tảng nào khác đều không thành lập, vì các nền tảng do backend native điều khiển chỉ gồm darwin／win32／linux. Bất kỳ tình huống mập mờ nào cũng được quyết định là `browse` — khả dụng ở mọi nơi. Việc lấy mẫu chỉ diễn ra đúng một lần cho mỗi lần khởi động, do đó năng lực đã gắn kết giữ ổn định trong suốt vòng đời dịch vụ, phù hợp với yêu cầu của seam. Việc cố định một kiểu tương tác không phải là trường cấu hình ở đây — hãy trực tiếp lắp ráp dòng `-native` hoặc `-browse` để thay thế cho dòng này, đó mới là điểm chuyển đổi đã được tài liệu hóa của seam; việc gắn kết đồng thời cả bộ chọn **và** một dòng backend sẽ báo lỗi rõ ràng (dịch vụ `directoryPicker` trùng lặp, quy trình client trùng lặp trong slot kiểu `single`).

## Trải nghiệm model

Không có. Bộ chọn này chỉ lắp ráp việc chọn thư mục cho GUI host. Không có nội dung nào ở đây đi vào request của model.

#### Ảnh hưởng KV Cache

Không có; package này không lắp ráp cũng không gửi request nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Việc dò tìm suy luận vị trí của operator từ ngữ cảnh khởi động, mà không tín hiệu nào phía khởi động có thể chứng minh điều đó** — một phiên tmux tách khỏi khởi động SSH sẽ mất các cờ `SSH_*`; tiến trình Darwin ngoài phiên Aqua vẫn được tính là có màn hình hiển thị; khi khởi động cục bộ trên workstation, sau đó truy cập qua `ssh -L`, request sẽ đến từ `127.0.0.1`, hệ thống sẽ quyết định `native`, và bật bộ chọn lên trên một workstation không có ai theo dõi. Lựa chọn `native` sai sẽ suy biến thành hộp thoại lỗi có thể thử lại vốn có của backend, còn đối với loại triển khai này, việc trực tiếp lắp ráp `-browse` chính là chọn kiểu tương tác an toàn.
- **Việc dò tìm bộ chọn Linux chỉ đọc `PATH`** — zenity／kdialog khả dụng qua đường khác (shell alias, không cài trên PATH) vẫn bị quyết định là `browse`; cài một trong hai binary lên `PATH`, lần khởi động tiếp theo sẽ khôi phục tư cách `native`.
- **Chỉ quyết định tại thời điểm khởi động** — một lần quyết định phục vụ mọi client trong lần khởi động này. Việc thích ứng theo từng kết nối (cùng một server, trình duyệt cục bộ dùng native, trình duyệt từ xa dùng browse) cần đối tượng năng lực theo từng client cũng như việc công bố giao thức mà seam cố ý loại bỏ, chờ đến khi xuất hiện triển khai cần phục vụ đồng thời cả hai hình thức thì mới làm.
