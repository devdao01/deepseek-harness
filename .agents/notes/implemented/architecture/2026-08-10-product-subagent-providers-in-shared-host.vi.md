# Agent Note: Provider subagent sản phẩm nằm ở host profile dùng chung

Status: implemented

[English](2026-08-10-product-subagent-providers-in-shared-host.md) | 中文

## Vấn đề

[Quy ước provider Codex và Claude Code](../feature/2026-08-04-claude-code-and-codex-subagent-backends.md) ban đầu được cung cấp dưới dạng gói có thể cài đặt độc lập, do môi trường triển khai nạp bên cạnh tool subagent tổng quát. Agent Preset sau đó trở thành bên chịu trách nhiệm thường xuyên cho các tool khả kiến với model của từng agent (agent) riêng lẻ, nhưng preset không thể sở hữu các provider sản phẩm này một cách an toàn: `ctx.subagents` là registry cấp tiến trình, tên provider là duy nhất, trong khi bên tiêu thụ phía host lại phân giải cùng một registry đó xuyên các phiên. Yêu cầu người dùng chỉnh sửa đồng thời cả Profile và Preset cũng sẽ khiến bản thân dòng preset tổng quát trở nên không hoàn chỉnh.

Quyết định về quyền sở hữu phải giữ nguyên đồng thời hai sự thật độc lập với nhau: việc nạp provider không được khởi động sản phẩm, cũng không được thực hiện xác thực đối với sản phẩm; trong khi việc tool có bật hay không vẫn phải do preset quyết định, để hai phiên có thể lộ ra tổ hợp khác nhau. Công tắc bật sản phẩm toàn cục, tạo instance provider theo từng agent, hoặc liệt kê trước các preset tổ hợp, đều sẽ tạo thêm một bên chịu trách nhiệm thứ hai cho một trong hai sự thật đó.

## Quyết định

Provider sản phẩm vẫn được đăng ký ở mặt phẳng host (host plane) cấp tiến trình. [Quyết định loại trừ khỏi cài đặt sản xuất](../simplification/2026-08-12-production-dsh-excludes-product-subagent-providers.md) chỉ thay thế lựa chọn trước đây trong ghi chú này là base bundle cài đặt provider: `dsh-base` sản xuất hiện không phụ thuộc cũng không gắn chúng. Profile chọn tích hợp sản phẩm sẽ cài đặt gói provider mục tiêu, và gắn nó đúng một lần ở host plane. Nạp bất kỳ plugin nào chỉ đăng ký một backend ở trạng thái ngủ (dormant); tiến trình Codex hoặc Claude tương ứng chỉ khởi động khi có lệnh ủy quyền thực tế đầu tiên. Agent Preset đóng góp `subagent_codex` và `subagent_claude_code` riêng biệt qua các dòng `dsh-tool-subagent` thông thường, do đó một preset có thể không lộ ra tool nào, chỉ lộ ra một trong hai, hoặc lộ ra cả hai, mà không cần thay đổi registry provider.

Ghi chú này tiếp tục chịu trách nhiệm giải thích tại sao provider sản phẩm đã được gắn thuộc về host plane, còn tool hướng tới model thuộc về Agent Preset. Quyết định loại trừ khỏi cài đặt sản xuất chịu trách nhiệm về việc Profile nào cài đặt các gói tùy chọn này. Ghi chú quy ước provider tiếp tục chịu trách nhiệm về giao thức, ánh xạ kết quả, hủy bỏ, vòng đời cây tiến trình và cấp độ bằng chứng của từng sản phẩm. [Kiến trúc Agent Preset](2026-08-03-per-session-agent-presets.md) vẫn chịu trách nhiệm về phân định giữa host và agent, việc tạo preset, và quy tắc thay đổi chỉ ảnh hưởng tới các phiên lắp ráp mới.

Các provider này sử dụng sản phẩm mà môi trường host đã chọn sẵn. Codex khởi động `codex`, lệnh này được phân giải từ `PATH`. Claude Code phân giải `claude` qua thế giới thực thi subprocess dùng chung, và giao đúng đường dẫn cho SDK chính thức. Việc nạp Profile không cài đặt sản phẩm, không tạo trạng thái sản phẩm, không dò phiên bản, không kiểm tra xác thực, và cũng không thêm bất kỳ cài đặt riêng cho sản phẩm nào. Việc thiếu lệnh và lỗi sản phẩm vẫn chỉ giới hạn trong lần ủy quyền gặp sự cố đó.

Chỉ Profile chọn provider Claude Code mới mang theo tải trọng CLI (command line interface) nền tảng tùy chọn của Claude Agent SDK. Môi trường sản xuất vẫn phân giải `claude` do host cung cấp; tải trọng SDK này là chi phí cài đặt của gói provider, chứ không phải file thực thi sản xuất.

## Xác minh

Test base bundle chứng minh `dsh-base` sản xuất không chứa dependency provider sản phẩm, cũng không chứa dòng cấu hình provider. Lắp ráp Web gắn tường minh hai provider tùy chọn, và bao phủ bốn tổ hợp tool: không lộ ra tool nào, chỉ lộ Codex, chỉ lộ Claude, và lộ cả hai, đồng thời bao phủ việc cách ly thế hệ (generation) khi preset tự tạo có thay đổi. Lắp ráp Loader do gói chịu trách nhiệm chứng minh đường dẫn bật theo nhu cầu chỉ-Codex và cả hai provider sẽ đăng ký provider được chọn, mà không khởi động tiến trình sản phẩm. Snapshot ACP (Agent Client Protocol) keyless cố định schema tool khả kiến với model khi bật một sản phẩm và khi bật đồng thời hai sản phẩm, còn test provider chứng minh riêng việc phân giải file thực thi gốc, thất bại, hủy bỏ và cây tiến trình dừng hẳn hoàn toàn.

## Các phương án đã cân nhắc

**Giữ provider sản phẩm là mục bật theo nhu cầu ở tầng Profile.** Cách này có thể thu nhỏ closure dependency mặc định, nhưng yêu cầu người dùng chỉnh sửa đồng thời cả Profile và Preset. Quyết định loại trừ khỏi cài đặt sản xuất chấp nhận đánh đổi cài đặt này; yêu cầu mà ghi chú này giữ lại là bất kỳ provider nào được chọn đều được gắn đúng một lần ở host plane, chứ không đặt vào preset.

**Lưu công tắc bật sản phẩm toàn cục hoặc theo từng Profile.** Công tắc cấp tiến trình sẽ tranh giành quyền chịu trách nhiệm về tool khả kiến với model với Preset, và cũng không thể biểu diễn được việc hai phiên dùng tổ hợp khác nhau. Tính khả dụng và xác thực thuộc về sự thật triển khai, không phải một dạng trạng thái sản phẩm khác cần lưu bền thêm.

**Gắn một provider bên trong mỗi Agent Preset.** Tên provider thuộc về registry cấp tiến trình, do đó phiên thứ hai sẽ xung đột với phiên thứ nhất. Bên tiêu thụ phía host cũng cần dùng registry này độc lập với vòng đời của bất kỳ agent đơn lẻ nào.

**Cung cấp bốn preset tổ hợp sản phẩm.** Bốn danh tính sẽ sao chép toàn bộ lắp ráp, chỉ để biểu diễn hai dòng tool độc lập. Các dòng thông thường đã có thể biểu diễn toàn bộ ma trận, không cần thêm danh sách hay trạng thái bảo trì.

## Hệ quả

Người dùng cài đặt từng provider sản phẩm được chọn trong Profile, rồi lộ tool của nó qua chính con đường tạo Agent Preset giống như các plugin khác. Mỗi phiên mới chỉ nhận được các tool do preset đã chọn đóng góp. Profile không chọn provider sản phẩm nào sẽ không chịu chi phí nạp của gói hay module tương ứng; việc nạp provider đã chọn vẫn không khởi động tiến trình sản phẩm, không đăng nhập, không gọi model, cũng không tạo thư mục chính của sản phẩm.

Registry của host vẫn là thẩm quyền duy nhất về provider, mỗi Preset vẫn là thẩm quyền duy nhất về tool model. Cái giá phải trả là hai tầng bật theo nhu cầu: Profile chịu trách nhiệm về việc cài đặt và đăng ký ở host plane, Preset chịu trách nhiệm lộ ra theo từng agent. Chọn provider Claude còn phải chấp nhận chi phí cài đặt tải trọng SDK tùy chọn hiện tại.
