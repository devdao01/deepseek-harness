# Agent Note: Lớp phủ chỉ dẫn cục bộ theo mặc định

Status: implemented

[English](2026-07-21-local-instruction-overlay.md) | Tiếng Việt

## Vấn đề

Các file hướng dẫn cá nhân bị git bỏ qua (`AGENTS.local.md` / `CLAUDE.local.md`) là một quy ước của Claude Code, dùng để chứa phần nội dung ghi đè riêng của từng lập trình viên và cố ý không commit. [Plugin agent-instructions](2026-06-24-workspace-context.md) chỉ nạp một ứng viên cho mỗi thư mục, nên chỉ khi thêm một tên `.local.` vào `instructionFileCandidates` thì mới đọc được nó; và vì mỗi thư mục chỉ có một ứng viên thắng, làm vậy chỉ khiến nó *che khuất* file cơ sở đã commit chứ không bổ sung cho file đó. Điều này ngược hẳn với mô hình xếp chồng «file cơ sở cộng lớp phủ cá nhân» mà chính những cái tên đó gợi ý, và nó lại còn tắt theo mặc định.

## Quyết định

Plugin nạp thêm một danh sách ứng viên thứ hai, độc lập, cho mỗi thư mục dự án. `localInstructionFileCandidates` mặc định là `['AGENTS.local.md', 'CLAUDE.local.md']`, và được phân giải bằng cùng cách kiểm tra cùng-thư-mục như `instructionFileCandidates`. Trong mỗi thư mục dự án tính từ gốc dự án tới cwd của session, plugin nạp ứng viên cơ sở trước, rồi nạp chồng ứng viên cục bộ lên; file cục bộ xếp sau file cơ sở, nên trong phạm vi ngân sách byte thì nội dung của nó có độ ưu tiên cao hơn. Cả hai danh sách đều được nạp đầy đủ, bên dưới cơ chế [khử trùng lặp nội dung theo thư mục](2026-07-21-instruction-load-all-dedup.md). Đặt `localInstructionFileCandidates` thành rỗng là tắt lớp phủ này.

Giá trị mặc định đó được định nghĩa trong schema `Config` của plugin chứ không nằm trong `cordis.yml` của một sản phẩm nào đó, nhờ vậy mọi bên nhúng (TUI, ACP, headless) đều đọc file `.local.` với hành vi nhất quán, và bên triển khai cũng có thể ghi đè hoặc tắt hành vi này ở một chỗ duy nhất. Điều này đối xứng với giá trị mặc định `instructionFileCandidates` mà chính plugin nắm giữ.

File toàn cục cố định của người dùng `$DSH_HOME/AGENTS.md` không có lớp phủ cục bộ, luôn luôn chỉ có file cơ sở.

## Mỗi ứng viên có scope độc lập riêng

Ứng viên cơ sở và ứng viên cục bộ trong cùng một thư mục phải độc lập với nhau khi đóng băng baseline, trong cửa sổ chờ, ở bộ nhớ đệm phiên bản và trong quá trình hoà giải, nên một thay đổi ở cái này tuyệt đối không được kìm hãm cái kia. Giờ đây mỗi cặp `(directory, candidateName)` là một khoá scope độc lập riêng — xem [khoá scope theo ứng viên](2026-07-21-instruction-load-all-dedup.md), thứ đã thay thế cột mốc phân tầng cơ sở/cục bộ trước đây. Quá trình tìm kiếm duyệt danh sách cơ sở trước rồi mới tới danh sách cục bộ trong mỗi thư mục dự án, `reconcileInstructionContext` liệt kê mọi ứng viên đã cấu hình cho từng thư mục, còn `probeScopeInstruction` giải mã tên ứng viên để đọc chính xác file đó. Prompt hướng tới mô hình suy ra nhãn thư mục cho người đọc từ đường dẫn hiển thị của file, nên khoá scope không bao giờ tới được mô hình.

## Phương án thay thế

**Ai đến trước thắng trước với độ ưu tiên cao hơn (nạp `.local.` thay cho file cơ sở).** Bác bỏ: một lớp phủ cá nhân thay thế file đã commit sẽ vứt bỏ phần hướng dẫn dự án dùng chung mỗi khi lớp phủ tồn tại, điều này ngược hẳn với mô hình xếp chồng của Claude Code.

**Giữ tính năng ở dạng bật theo nhu cầu qua `instructionFileCandidates`.** Bác bỏ: mỗi thư mục chỉ có một ứng viên thắng, nên tên `.local.` thêm vào danh sách đó sẽ che khuất file cơ sở chứ không bổ sung cho nó. Hướng dẫn trong packages yêu cầu loại các mục bật-theo-nhu-cầu ra khỏi mặc định xuất xưởng, nhưng ở đây thực tiễn hiện hành mạnh mẽ, cùng kỳ vọng của người dùng rằng file `.local.` luôn được đọc, đã lấn át cân nhắc đó.

**Đặt mặc định ở tầng `cordis.yml` của sản phẩm thay vì trong schema của plugin.** Bác bỏ: làm vậy chỉ bật `.local.` cho đúng cái điểm vào sản phẩm nào nhớ bật tính năng, qua đó chia rẽ hành vi giữa TUI/ACP/headless, và lặp lại một giá trị vốn nên nằm cùng chỗ với các mặc định ứng viên sẵn có.

**Hai tầng dùng chung thư mục gốc làm khoá scope.** Bác bỏ: file cơ sở và file cục bộ trong cùng thư mục sẽ va chạm nhau trong mọi ánh xạ lấy scope làm khoá, khiến thay đổi ở cái này kìm hãm hoặc ghi đè cái kia. Đặt khoá scope độc lập riêng cho từng ứng viên giữ cho hai bên độc lập, mà không cần mở rộng cấu trúc metadata được persist.

**Mở rộng lớp phủ sang scope toàn cục của người dùng.** Tạm hoãn: `$DSH_HOME` là một `AGENTS.md` cố định duy nhất, không có file cơ sở đã commit nào để bổ sung, nên trước khi xuất hiện nhu cầu cụ thể thì nó luôn chỉ có file cơ sở.

## Hệ quả

Hướng dẫn `.local.` được đọc theo mặc định trên mọi sản phẩm, không cần cấu hình riêng cho từng bản triển khai, nhất quán với các công cụ lân cận. Mỗi thư mục dự án có thể đóng góp một scope bền vững cho từng ứng viên tồn tại thay vì chỉ một, nên việc tìm kiếm động, chỉnh sửa và gỡ bỏ sẽ hoà giải file cơ sở và file cục bộ một cách độc lập với nhau. Khoá scope giờ [chia theo ứng viên](2026-07-21-instruction-load-all-dedup.md); `dsh-session` không cam kết tương thích với session cũ, nên đây là một thay đổi không tốn phí. Scope toàn cục của người dùng vẫn chỉ có file cơ sở, và điều này được ghi lại trong README của package như một hạn chế đã biết.
