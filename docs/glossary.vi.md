# Bảng thuật ngữ

[English](glossary.md) | Tiếng Việt

Từ vựng lĩnh vực của DeepSeek Harness quy định một thuật ngữ chuẩn cho mỗi khái niệm. Các thuật ngữ liên kết tới mục tương ứng bằng anchor Markdown chuẩn; chi tiết triển khai được để lại trong README của từng package và trong Agent Note.

## capability-seam

- **seam**: một *năng lực có thể thay thế* bao gồm ba vai trò: **Service Definition** (một `Service` của Cordis sở hữu `ctx.<key>` riêng và các kiểu từ vựng của nó — có thể là một abstract class như `ShellExecutor`, cũng có thể là một registry cụ thể như `WebRuntime`, nhưng không bao giờ là một TypeScript `interface`), một hoặc nhiều **Service Provider**, và một hoặc nhiều **Consumer** inject service đó. `packages/shell` là ví dụ chuẩn mực: `dsh-shell` (Service Definition), `dsh-bash-local` / `dsh-bash-sandbox` (bên cung cấp), và `dsh-tool-bash` (Consumer). Khi các vai trò cần tiến hóa độc lập thì chúng thường nằm ở các package khác nhau, nhưng nếu cùng thuộc một mối quan tâm thì một package cũng có thể đảm nhận nhiều vai trò (`dsh-llm` vừa là Service Definition vừa là Consumer). seam là năng lực hoàn chỉnh, không bao giờ chỉ là một trong các vai trò; thuật ngữ này chỉ giữ nghĩa đó, còn các thành phần của năng lực nên được đặt tên theo vai trò, class, service, cam kết hoặc điểm mở rộng của chúng.

## agent-scope

- **scope**: đơn vị đăng ký được phân chia theo agent (tác tử). Một đóng góp (tool, đoạn prompt, biến, hạn chế, listener) hoặc là *toàn cục* (mọi agent đều thấy), hoặc là *có scope* (thuộc về đúng một [scope key](#scope-key)). Chỉ có hai tầng, theo cấu trúc phẳng: đăng ký có scope không kế thừa xuống subagent; hành vi của cây con được biểu đạt bằng dữ liệu [lineage](#lineage), không bao giờ bằng cấu trúc scope.
- **scope key**: định danh mờ đục của scope, so sánh theo đồng nhất thức đối tượng. Quy ước của harness: một agent đang hoạt động chính là key cho scope của chính nó. <a id="scope-key"></a>
- **ngữ cảnh agent (`agent.ctx`)**: ngữ cảnh có scope của agent; các đăng ký thực hiện qua nó vừa có tính hiển thị theo scope, vừa có vòng đời gắn với scope đó (cùng một sự kiện quyết định cả hai), và listener trên nó tham gia vào việc phát có lọc theo scope của agent đó. Sự kiện về bản thân registry có thể cố ý không bị lọc, tùy theo cam kết của từng sự kiện.
- **scope carrier**: `thisArg` được mang theo trong việc phát có lọc theo scope (dựng bởi `scopeTarget`); bộ lọc của nó cho qua các listener không nhãn cộng với listener của chính chủ thể. Carrier *không có chủ thể* (không có key) chỉ cho qua listener không nhãn.
- **scoped dispatch**: quy tắc là: sự kiện về hoạt động của một agent được phát bằng carrier của agent đó. Sự kiện về chính registry (như «một tool vừa được thêm») thuộc loại sự kiện *chủ thể là registry*, và giữ nguyên không bị lọc.
- **shadowing**: phân giải tên theo nguyên tắc cụ thể nhất thắng: một tool/đoạn/biến có scope chỉ thay thế bản toàn cục cùng tên bên trong scope đó. Đây là cơ chế để tùy biến persona theo từng agent và biến thể tool theo từng agent.
- **restriction / đăng ký scope-local**: restriction (`tools.restrict`) lọc tập tool toàn cục cho một scope đơn lẻ (nhiều restriction kết hợp bằng phép giao); đăng ký scope-local được hợp nhất sau khi lọc. Tool toàn cục bị lọc bỏ sẽ không xuất hiện trong prompt và cũng từ chối thực thi, không thể phân biệt với một tool không tồn tại.
- **setup window**: khe thời gian lúc tạo mà bên tạo dùng để lắp ráp môi trường có scope của agent (`CreateAgentOptions.setup`): lúc này scope và đối tượng agent đã tồn tại, nhưng agent hoặc phiên chưa được công bố, `agent/session-start` chưa kích hoạt, và prompt đầu tiên chưa được lắp ráp. setup chỉ thực hiện đăng ký, không bao giờ điều khiển agent.
- **lineage**: các sự kiện về quan hệ cha-con được mang theo dưới dạng dữ liệu (`parentSession`, `delegationDepth` bền vững, `subagentDepth` lúc chạy); không bao giờ ảnh hưởng tới tính hiển thị. <a id="lineage"></a>

## Mục tiêu

- **Mục tiêu**: một mục tiêu hoàn thành bền vững, đơn lẻ, gắn vào phiên hiện có, có các giai đoạn `active` / `paused` / `blocked` / `complete` tiến hóa theo số hiệu bản sửa và có giới hạn Goal Round; `blocked` lưu giữ mã chính sách và phần diễn giải. Mục tiêu là một trạng thái, không phải bộ lập lịch, cũng không phải một cuộc hội thoại riêng; nhật ký phiên vẫn là nguồn sự thật của nó.
- **Goal Round**: một chu kỳ tiếp diễn được chấp nhận cho mục tiêu hiện tại. Bộ điều khiển cùng phiên hiện thực hóa Goal Round thành một [lượt](#turn) do mục tiêu kích hoạt, trong đó có thể chứa không hoặc nhiều bước; các lượt do con người tạo ra và không liên quan trong cùng phiên không tiêu tốn giới hạn Goal Round. <a id="goal-round"></a>
- **Kích hoạt mục tiêu**: quyền cục bộ theo tiến trình để bên tiêu thụ tiếp diễn chấp nhận Goal Round kế tiếp. Trạng thái kích hoạt là `armed` hoặc `disarmed`; nó cố ý không tham gia phát lại bền vững, nên sau khi khôi phục hoặc fork, công việc tự động chỉ có thể bắt đầu khi sau đó có một lần thay đổi khôi phục được con người ủy quyền, thực hiện qua `/goal` hoặc qua tool của model.

## Lệnh con người

- **Lệnh con người**: chỉ thị bắt đầu bằng dấu gạch chéo, được các adapter hướng tới con người diễn giải và thực thi qua `ctx.commands`, và không trở thành thông điệp gửi model. Nó vừa khác với tool hướng tới model, vừa khác với việc chạy lệnh shell qua `ctx.shell`.
- **Mặt phẳng lệnh**: cơ chế khám phá, phân giải, phát, hủy và kết xuất kết quả do adapter UI và plugin lệnh chịu trách nhiệm. Trừ khi handler thay đổi lĩnh vực bền vững theo cách khác, đầu ra của lệnh thuộc về trạng thái UI.
- **Lệnh mục tiêu**: `/goal` là lệnh con người do `dsh-command-goal` cung cấp; nó quan sát hoặc thay đổi trực tiếp mục tiêu hiện tại, còn lĩnh vực mục tiêu sở hữu mọi bản ghi bền vững và model nhìn thấy được.

## Các tầng vòng lặp

- **Lượt**: một lần rút cạn đầu vào đã được chấp nhận trong phiên, kết thúc sau khi model và các tool của nó ngừng làm việc hoặc chính sách kết thúc can thiệp. <a id="turn"></a>
- **Bước**: một model request, cùng với các lần thực thi tool do phản hồi của model gây ra; một lượt chứa không hoặc nhiều bước. <a id="step"></a>
- **Round**: vòng lặp chính sách ở lớp ngoài mang theo một lượt, ví dụ một [Goal Round](#goal-round) hoặc một lần thử Ralph với agent hoàn toàn mới. Bộ đếm Round thuộc về chính sách đó và không đếm mọi lượt trong phiên. <a id="round"></a>

## Ralph

- **Vòng lặp Ralph**: một lần chạy quy trình agent hoàn toàn mới ở tiền cảnh, hướng tới một mục tiêu bất biến. Đó là một chiến lược tool hướng tới model, ghép từ các nguyên thủy workflow và subagent, chứ không phải mục tiêu cùng phiên, chế độ agent loop (vòng lặp tác tử), bộ lập lịch hay tính năng script workflow đa dụng. <a id="ralph-loop"></a>
- **Ralph Round**: một phiên con hoàn toàn mới trong [vòng lặp Ralph](#ralph-loop). Phiên con không nhận hạt giống hội thoại từ phiên cha hay từ các phiên con trước đó; một workspace dùng chung và một bản [bàn giao Ralph](#ralph-handoff) có giới hạn sẽ mang trạng thái xuyên các Round. <a id="ralph-round"></a>
- **Bàn giao Ralph**: báo cáo có cấu trúc, đã chuẩn hóa và có giới hạn, được truyền từ một Ralph Round vẫn cần tiếp tục sang Ralph Round kế tiếp, gồm trạng thái, tóm tắt, bằng chứng, bước tiếp theo và diễn giải về điểm nghẽn. Nó bổ sung cho workspace dùng chung chứ không thay thế vị thế thẩm quyền của workspace. <a id="ralph-handoff"></a>
