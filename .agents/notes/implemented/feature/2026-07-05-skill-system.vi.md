# Agent Note: Hệ thống Skill — công bố hướng dẫn dần dần cho agent

Status: implemented

[English](2026-07-05-skill-system.md) | Tiếng Việt

## Vấn đề

Các sản phẩm agent (tác tử) đã hội tụ về một mô hình skill (kỹ năng): giữ prompt yêu cầu gọn nhẹ, chỉ liệt kê các gói hướng dẫn khả dụng, và chỉ tải toàn văn khi model xác định một tác vụ khớp với nó. Codex, Claude Code, OpenCode và Kimi Code khác nhau ở chi tiết, nhưng đều tách metadata phát hiện khỏi hướng dẫn đầy đủ, cho phép workspace mang theo hành vi có thể tái sử dụng mà không phải trả chi phí prompt đầy đủ ở mỗi lượt.

DeepSeek Harness dùng chung nguyên thủy này, để các hướng dẫn review, viết plugin và sử dụng tool đặc thù cho từng dự án được đặt cạnh cấu hình agent của workspace hoặc người dùng, thay vì hard-code vào agent loop (vòng lặp agent).

## Quyết định

`@deepseek-ai/dsh-skill` là registry thuần túy phía provider (`ctx.skills`), `@deepseek-ai/dsh-skill-filesystem` là provider filesystem cục bộ đi kèm, và `@deepseek-ai/dsh-tool-skill` chịu trách nhiệm về thư mục phiên bản bền vững và tool loader hướng tới model. `dsh-agent-spine-demo` mặc định tải registry, provider cục bộ và consumer, để TUI, headless và ứng dụng ACP (Agent Client Protocol) có cùng hành vi, trong khi provider nhúng hoặc từ xa có thể đóng góp skill mà không cần sửa registry hay consumer. Cấu hình `skills` của nó chuyển tiếp các nhánh `registry`, `local` và `tool` tương ứng tới chủ sở hữu của từng phần.

Provider đóng gói riêng có thể đóng góp skill bất biến mà không cần phát hiện qua filesystem. CLI phát hành mặc định khai báo `@deepseek-ai/dsh-skill-badge` là disabled; bật dòng cấu hình tổ hợp của nó sẽ đóng góp hướng dẫn huy hiệu (badge) chính thức thông qua cùng registry và consumer đó (xem [quyết định](2026-08-06-bundled-dsh-badge-skill.md)).

Plugin provider đăng ký đồng bộ trong `apply()`. Tư cách thành viên provider là trạng thái do effect trực tiếp nắm giữ: đăng ký và dispose (giải phóng tài nguyên) làm mất hiệu lực thư mục đã hoàn tất một cách đồng bộ, còn thao tác phát hiện đọc bản đồ provider hiện tại theo yêu cầu thay vì lắng nghe sự kiện thay đổi registry. Thư mục provider trả về các ứng viên đã sắp xếp từ lệnh gọi `list()` đang chờ, provider từ xa thực hiện khởi tạo, xác thực và phát hiện trong quá trình này, đồng thời tuân thủ tín hiệu abort của lần tra cứu. Registry xác thực từng ứng viên, giải quyết xung đột tên skill trùng nhau theo nguyên tắc ai đến trước được phục vụ trước (first-come-first-served) dựa trên rank, thứ tự đăng ký provider và thứ tự nội bộ trong provider, sau đó sắp xếp bản tóm tắt theo tên skill để đảm bảo kết quả xác định cho consumer. Nó chỉ cache snapshot thư mục đã hoàn tất, và thử lại khi phiên bản provider/runtime thay đổi trong quá trình phát hiện, do đó thao tác gỡ (unload) sẽ không đóng băng một skill lỗi thời và không thể giải quyết vào thư mục phiên bản. `ctx.skills.register(...)` ở runtime vẫn được giữ lại như một cách tiện lợi cho skill nhúng chạy trong tiến trình, dùng thứ tự ưu tiên project trước user; `runtime` được giữ làm tên provider thuộc sở hữu của registry.

Provider cục bộ quét theo thứ tự rank ai đến trước được phục vụ trước: thư mục gốc dự án nhạy cảm với cwd, thư mục gốc tùy chỉnh và thư mục gốc người dùng: `.dsh` của dự án, `.agents` của dự án, `customSkillDirs`, `.dsh` của người dùng, rồi đến `.agents` của người dùng. Việc quét `.dsh/skills` của người dùng bỏ qua `.system`, để thư mục do hệ thống sở hữu không bị xử lý như nội dung người dùng thông thường. Provider cục bộ không tổng hợp skill hệ thống tích hợp sẵn; thư mục gốc bundled đã cấu hình và provider chuyên dụng cung cấp thêm skill.

Mỗi skill là một `<name>/SKILL.md` hoặc `<name>.md` có YAML frontmatter. `name` và `description` là bắt buộc; `whenToUse`, `metadata`, `disable-model-invocation` và `user-invocable` là tùy chọn. Tên dùng kebab-case. Trường invocation được chiếu vào policy lồng nhau có kiểu, cụ thể được định nghĩa bởi [quyết định model và user invocation độc lập](2026-07-28-skill-invocation-policy.md); parser từ chối cách viết camelCase cũ. YAML frontmatter được parse bằng package `yaml`, không phải `js-yaml` hay parser tự viết: `yaml` là parser hiện đại đã được khai báo sẵn trong package này, đủ cho nhu cầu frontmatter hạn chế, còn parser hẹp thì hoặc từ chối YAML hợp lệ mà người dùng kỳ vọng dùng được, hoặc phình to thành một tập con YAML chưa qua review.

I/O filesystem của skill cục bộ đi qua `ctx.fs` khi có nạp dịch vụ filesystem: tra cứu thư mục gốc dự án dùng `resolve` và `stat` để dò `.git`, phát hiện thư mục gốc dùng `listDir`, và đọc skill dùng `readText`. Filesystem của Node là phương án dự phòng, dùng khi `dsh-skill-filesystem` được tải trong một context tối giản chưa gắn seam fs. Thư mục gốc bị thiếu, file skill không đọc được hoặc sai định dạng, và lỗi tạm thời của `list()` phía provider đều giảm cấp thành cảnh báo rồi bỏ qua, để một nguồn hỏng không làm mọi request agent thất bại; tuy nhiên ứng viên sai định dạng vẫn thất bại nhanh, vì chúng vi phạm quy ước provider.

`dsh-tool-skill` chèn một thư mục `<system-reminder>` bền vững với vai trò user vào `agent/pre-step` đầu tiên của phiên, dưới dạng `user/message` có nguồn gốc (attributed), và chỉ khi tool view của agent đó phân giải đúng vào đăng ký `skill` riêng của plugin này. Thư mục này chỉ chứa tên và mô tả skill đã sắp xếp; không chứa nội dung, đường dẫn, nguồn, provider hay gợi ý định tuyến. Mô tả được chuẩn hóa khoảng trắng, escape XML, và bị giới hạn bởi `catalogDescriptionMaxLength`, mặc định là `500`, tối thiểu là `3`. Toàn văn skill không bao giờ được đưa vào thư mục. (Thư mục ban đầu được truyền qua extension point [session prefix chỉ-theo-yêu-cầu](../../archived/feature/2026-07-07-session-prefix.md) (đã archive); [quyết định hợp nhất tin nhắn có nguồn gốc](../architecture/2026-07-22-unified-send-and-coalesced-user-messages.md) đã chuyển nó vào lịch sử bền vững.)

`list()` của registry trả về toàn bộ bản tóm tắt thắng cuộc, còn model và user consumer áp dụng phán quyết gọi (invocation) do [quyết định policy invocation độc lập](2026-07-28-skill-invocation-policy.md) định nghĩa. Tool `skill({ name })` tải một skill mà model có thể gọi cho cwd agent hiện tại, trả về kết quả tool chứa `<skill_content name="...">`, `<skill_resources>` và `<skill_instructions>`. `resourceBase` cung cấp một thư mục, URL hoặc base path do provider quản lý dạng opaque, dùng cho script, tài liệu tham khảo và asset được tham chiếu rõ ràng; resource chỉ tải theo yêu cầu, không liệt kê thư mục. Tên không giải quyết được sẽ báo rằng skill đó không xác định hoặc không còn khả dụng; tên không hợp lệ và skill có `invocation.modelInvocable` là `false` giữ các lỗi tool khác nhau. Kết quả tool là đường công bố hướng tới model.

Cấu trúc dữ liệu và quy ước thư mục/tool được ghi trong [skills.md](../../../../docs/subsystems/skills.md), chữ ký dịch vụ xem tại [service catalog](../../../../docs/subsystems/skills.md#cordis-surface) đã sinh ra.

## Phương án từng cân nhắc

**Chèn toàn văn skill vào mỗi system prompt.** Bị bác bỏ, vì nó phá vỡ việc công bố dần dần (progressive disclosure), khiến mỗi request phải trả chi phí cho hướng dẫn có thể không áp dụng.

**Chỉ công bố skill qua slash command.** Bị bác bỏ, vì việc model chủ động tải là năng lực cốt lõi; broadcast lệnh hướng tới người dùng không thay đổi cơ chế phát hiện.

**Đặt việc quét filesystem cục bộ trực tiếp vào `ctx.skills`.** Bị bác bỏ, vì coding agent, web agent và hệ sinh thái plugin tương lai cần các nguồn skill khác nhau. Registry provider phản chiếu subagent seam: registry sở hữu việc giải quyết xung đột và consumer, còn implementation chịu trách nhiệm tải.

**Dùng đoạn system prompt.** Bị bác bỏ, vì system prompt đã render là một chuỗi đơn, còn thư mục là một tin nhắn `<system-reminder>` vai trò user. [Extension point session prefix chỉ-theo-yêu-cầu](../../archived/feature/2026-07-07-session-prefix.md) (đã archive) là cơ chế ban đầu; sau khi quyết định hợp nhất tin nhắn có nguồn gốc loại bỏ extension point đó, thư mục chuyển thành một lần chèn bền vững có nguồn gốc với cùng hình dạng tin nhắn.

**Vật thể hóa skill viết bởi DSH tích hợp sẵn dưới `~/.dsh/skills/.system`.** Bị bác bỏ, vì skill đóng gói không ghi vào home directory người dùng khi khởi động; provider nhúng hoặc từ xa cung cấp skill sau khi được cấu hình.

**Phát hiện đệ quy `**/SKILL.md` lồng nhau.** Bị bác bỏ. File phẳng và bao gồm thư mục một cấp bao phủ các thư mục gốc đã cấu hình, đồng thời giúp việc xử lý trùng lặp và thứ tự thư mục dễ suy luận.

**Parser frontmatter tự viết tay.** Bị bác bỏ, vì schema đã chấp nhận bao gồm một object `metadata` mở. Parser hẹp thì hoặc từ chối YAML hợp lệ mà người dùng kỳ vọng dùng được, hoặc phình to thành một tập con YAML chưa qua review.

## Hệ quả

Trục chính agent-core bao gồm một thành phần đóng góp thư mục, một provider cục bộ và một tool hướng tới model. Việc phát hiện skill nhạy cảm với cwd, do đó bên gọi tạo agent với các giá trị cwd phiên khác nhau có thể quan sát các skill dự án phủ đè khác nhau theo đúng thiết kế.

Thư mục có tính xác định đối với một tập thư mục gốc cố định và phiên bản đăng ký runtime cố định. Provider cục bộ theo dõi các thư mục gốc đã cấu hình và làm mất hiệu lực thư mục đã hoàn tất sau khi có thay đổi đĩa liên quan; việc đăng ký runtime và giải phóng provider cũng làm mất hiệu lực nó.

## Hoãn lại

Skill context (`context: fork`), khai báo và gợi ý tham số (`arguments` và `argument-hint`), cũng như ràng buộc tool theo từng skill (`allowed-tools` và `disallowed-tools`) chưa nằm trong phạm vi quy ước đã phát hành. Registry, provider cục bộ và tool hướng tới model không parse, không broadcast, cũng không cưỡng chế các trường này. Việc gọi trực tiếp của user đã được phát hành như một tính năng TUI, dựa trên policy invocation dùng chung và nguyên thủy `get()` đáng tin cậy; xem [slash command skill TUI đã archive](../../archived/feature/2026-07-21-tui-skill-slash-command.md).
