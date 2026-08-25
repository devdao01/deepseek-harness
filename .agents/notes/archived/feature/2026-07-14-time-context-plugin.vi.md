# Agent Note: Plugin ngữ cảnh thời gian tùy chọn

Status: implemented

Archived: 2026-07-26

[English](2026-07-14-time-context-plugin.md) | 中文

## Vấn đề

Quyết định lưu trữ và làm mới system prompt động trong ghi chú này đã được thay thế bởi [ngữ cảnh thời gian bền vững theo từng bước](2026-07-16-durable-per-step-time-context.md). Package cần được bật rõ ràng (explicit enable), định dạng thời gian theo múi giờ và việc kiểm tra vẫn được giữ lại; Agent Note kế tiếp chịu trách nhiệm về hợp đồng (contract) hiển thị với model và tính bền vững hiện tại.

Nếu bên triển khai (deployment) không cung cấp đồng hồ trong prompt lẫn công cụ truy vấn cho model, thì các request của agent (smartbot) sẽ không có được thời gian chính xác theo thời gian thực. Văn bản tĩnh sẽ trở nên lỗi thời, trong khi việc gọi công cụ (tool) để suy luận thông thường như ngày tháng, hạn chót hoặc thời gian rảnh rỗi sẽ tăng thêm chi phí. Khi thiếu khoảng thời gian đã trôi qua, model không thể phân biệt giữa một tin nhắn được gửi ngay sau tin trước đó và một tin nhắn được gửi vài giờ sau đó.

Luồng lắp ráp prompt có thể suy ra hai thông tin này ở mỗi bước dựa trên timestamp bền vững của session, còn log request header có thể ghi lại chính xác giá trị đã thực sự render. Việc tích lũy các số liệu lỗi thời trong lịch sử session hay đánh thức một agent đang rảnh rỗi (idle) đều vi phạm vòng đời request hiện có.

## Quyết định

`@deepseek-ai/dsh-time-context` là một plugin hàm (function plugin) cần được bật rõ ràng, nằm tại `packages/context/time-context/`. Nhóm sản phẩm `context/` dùng để chứa các phần mở rộng ngữ cảnh request có giới hạn, không định nghĩa tool cũng không định nghĩa service. `dsh-agent-spine-demo` và các ví dụ đi kèm repo đều không load package này; chỉ khi chi phí token và tiết lộ thông tin (information disclosure) có thể chấp nhận được thì bên triển khai mới gắn nó vào một cách rõ ràng.

Plugin đăng ký một phân đoạn system prompt toàn cục `context:time` với thứ tự đăng ký là 10, nằm sau phần thiết lập vai trò của bên triển khai và trước phần hướng dẫn công cụ. Với các lượt (turn) đang hoạt động, nó xuất ra một timestamp dạng gần giống ISO kèm offset UTC dạng số và múi giờ IANA, cùng với khoảng thời gian tính bằng giây nguyên gọn tính từ tin nhắn cuối cùng model có thể nhìn thấy trước khi lượt bắt đầu. Khi chưa gắn với agent nào hoặc agent đang ở trạng thái rảnh rỗi, phân đoạn này sẽ rỗng.

### Đường cơ sở (baseline) của tin nhắn trước đó

Khi lượt được lắp ráp lần đầu, nhà cung cấp (provider) sẽ tìm `user/message`, `assistant/message`, `tool/result`, `context/message` hoặc `steering/message` gần nhất trước `turn/start`. Nó loại trừ prompt hiện tại, để khoảng thời gian thể hiện độ dài giữa các lượt, thay vì gần bằng không. Mỗi lần làm mới trong cùng một lượt vẫn giữ nguyên đường cơ sở này; lượt đầu tiên báo cáo `unavailable (no earlier message in this session)`.

Đường cơ sở dùng thời gian ghi thêm (append time) của sự kiện session, chứ không phải timestamp phía client vốn không tồn tại trong log. Vì vậy, hành vi khôi phục (resume) và phân nhánh (fork) có thể được tái hiện một cách xác định từ log bền vững, và giá trị model có thể nhìn thấy cũng có thể được tái tạo mà không cần thêm sự kiện mới. Khi đồng hồ hệ thống bị chỉnh lùi lại, plugin sẽ giới hạn khoảng thời gian về 0.

### Chiến lược làm mới

`refreshIntervalMs` mặc định là 60,000 và phải là một số nguyên an toàn không âm. Request đầu tiên của mỗi lượt luôn được làm mới. Các lần lắp ráp tiếp theo trong cùng lượt sẽ tái sử dụng khối này cho đến khi nó tồn tại đủ lâu bằng khoảng thời gian đó; đặt là `0` thì mỗi bước đều được làm mới. Việc làm mới chỉ do request thúc đẩy, vì vậy trong lúc gọi model, chạy tool hoặc rảnh rỗi, bộ đếm thời gian sẽ không tạo ra task nào.

Khi bỏ qua `timeZone`, `Intl.DateTimeFormat` sẽ phân giải múi giờ hệ thống của tiến trình Node đúng một lần khi plugin được load. Node sẽ tuân theo `TZ`; nếu không có giá trị ghi đè này, múi giờ sẽ do host hoặc container cung cấp. Giá trị tường minh phải là định danh IANA và được kiểm tra ngay khi load. Múi giờ đã bắt được sẽ ổn định cho đến khi plugin được load lại; timestamp local dạng gần giống ISO chứa offset dạng số hiện tại của nó, giúp thay đổi giờ mùa hè (DST) luôn hiển thị rõ ràng. Giá trị mặc định này đại diện cho múi giờ của tiến trình triển khai, chứ không phải múi giờ của người dùng ở xa.

### Log và hình thái token

agent loop sẽ ghi khối thời gian này thông qua snapshot `request/header` đầy đủ trước khi gửi đi, từ đó thỏa mãn [hợp đồng request có thể tái tạo](../architecture/2026-07-05-reconstructable-requests.md). Mỗi request chỉ mang một khối hiện tại; các số liệu trước đó không được giữ lại trong lịch sử session. Plugin này sở hữu thông tin thời gian và đóng góp thông tin đó thông qua registry prompt theo [Agent Note về biến prompt](../architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md), không cần thêm nhánh đặc biệt vào loop.

## Kiểm thử

Unit test cố định định dạng, đường cơ sở, chiến lược làm mới, việc kiểm tra, trạng thái theo từng agent, hành vi giải phóng tài nguyên, và hành vi bắt múi giờ hệ thống khi load. Các test dùng agent loop thật cố định prompt thực tế được gửi đi và snapshot `request/header` đầy đủ. Test end-to-end subprocess không cần key khởi động `cordis.yml` dành riêng cho test thông qua Loader thật và ứng dụng stdio, bỏ qua `timeZone` dưới `TZ` được kiểm soát, chạy hai lượt, và kiểm tra request header bền vững từ bên ngoài. Tổ hợp snapshot mặc định không bao gồm plugin này, nên fixture transcript trong đó không chứa khối thời gian.

## Các phương án đã cân nhắc

- **Thêm một `context/message` vào mỗi lượt hoặc mỗi lần làm mới** — không được áp dụng, vì chi phí số liệu và token sẽ tích lũy trong lịch sử. Thay thế node bề mặt trước đó sẽ giữ lại vị trí cũ của nó, còn thay thế node cuối lại che khuất nội dung session ở giữa.
- **Sử dụng `agent/session-prefix`** — không được áp dụng, vì một prefix ổn định trong suốt session không thể biểu diễn đồng hồ thay đổi theo từng lượt hoặc từng bước.
- **Sửa đổi request trong `agent/request`** — không được áp dụng, vì ranh giới này định hình cấu hình lời gọi sau ranh giới tin nhắn; chèn nội dung model có thể nhìn thấy vào đó sẽ bỏ qua việc tính toán áp lực prompt và log request header.
- **Đăng ký hai biến độc lập `{{current_time}}` và `{{elapsed}}`** — không được áp dụng, vì các nhà cung cấp độc lập có thể lấy mẫu ở các thời điểm khác nhau, và cần bộ nhớ đệm dùng chung. Một phân đoạn duy nhất sẽ ghi lại cả hai thông tin một cách nguyên tử (atomic), và cũng không cần bên triển khai viết template thời gian.
- **Làm mới thông qua bộ đếm thời gian chạy nền (background timer)** — không được áp dụng, vì ngoài việc lắp ráp request ra không có đối tượng nào tiêu thụ giá trị mới. Để bộ đếm thời gian thúc đẩy `agent.inject()` sẽ tạo ra lượt mới, và chỉ để báo cáo thời gian trôi qua mà đánh thức một session đang rảnh rỗi.
- **Vẫn mặc định dùng UTC khi bỏ qua cấu hình** — không được áp dụng, vì một đồng hồ cần được bật rõ ràng thì nên theo môi trường triển khai, trừ khi bên vận hành chọn UTC. Các triển khai cần UTC vẫn có thể cấu hình `timeZone: UTC`.
- **Đưa vào một thư viện dò múi giờ (timezone detection)** — không được áp dụng, vì runtime `Intl` của Node đã có thể cung cấp múi giờ IANA của tiến trình, và thêm dependency cũng không thể suy ra múi giờ của người dùng ở xa.
- **Gắn plugin vào `dsh-agent-spine-demo`** — không được áp dụng, vì múi giờ, việc tiết lộ thông tin, ngân sách token và độ mới đều thuộc về chính sách triển khai. Việc chọn tham gia (opt-in) giúp giữ ngữ cảnh mặc định ổn định.
- **Đưa package vào `core/`** — không được áp dụng, vì `core/` chịu trách nhiệm cho phần lõi API sản phẩm, còn plugin này là một leaf tùy chọn không có service key.

## Hậu quả

- Model chọn tham gia không cần gọi tool mà vẫn có được đồng hồ theo múi giờ và khoảng thời gian giữa các lượt. Chi phí system prompt cho mỗi request là cố định, không tăng theo độ dài của session.
- Khi bỏ qua `timeZone`, plugin dùng `TZ` của tiến trình, host hoặc container được quan sát tại thời điểm load. Khi môi trường triển khai không đại diện cho người dùng mục tiêu, bên vận hành phải cấu hình múi giờ một cách tường minh.
- Việc làm mới sẽ thay đổi request header, và có thể thêm một snapshot `request/header` đầy đủ mới với reason là `change`. `refreshIntervalMs` đánh đổi độ mới lấy số lượng và kích thước của các snapshot đầy đủ bền vững; đặt là `0` thì mỗi bước có kết quả render giây nguyên thay đổi đều ghi lại giá trị mới.
- Hệ thống sẽ không tạo request chỉ để làm mới thời gian. Các tool chạy lâu sẽ giữ số liệu cũ cho đến khi bước tiếp theo bắt đầu lắp ráp.
- Khoảng thời gian phản ánh thời gian xử lý của harness tại ranh giới ghi thêm bền vững, không bao gồm độ trễ mạng phía client trước khi tin nhắn vào log. Muốn giữ timestamp nguồn gốc từ client thì cần một hợp đồng đầu vào bền vững riêng.
