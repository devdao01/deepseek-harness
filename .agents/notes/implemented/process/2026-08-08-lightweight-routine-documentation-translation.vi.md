# Agent Note: Dịch tài liệu thường ngày theo hướng gọn nhẹ

Status: implemented

[English](2026-08-08-lightweight-routine-documentation-translation.md) | Tiếng Việt

## Vấn đề

Việc chỉnh sửa song ngữ thường ngày sẽ tự động chọn dùng toàn bộ [skill (kỹ năng) dịch thuật](../../../skills/dsh-translate-docs/SKILL.md). Ngay cả sau khi đã được tối ưu bằng [cập nhật dịch tối thiểu dựa trên briefing](2026-07-26-briefed-minimal-translation-updates.md), một thay đổi tài liệu nhỏ vẫn có thể tải luồng công việc chuyên dụng, sinh briefing, ủy quyền việc dịch văn bản cho subagent, và thực hiện thêm một vòng kiểm chứng riêng. Việc điều phối này tốn thời gian, context và token mô hình nhiều hơn cả việc dịch trực tiếp phần văn bản thay đổi, và cơ chế tự phát hiện skill còn khiến luồng công việc này lộ diện ngay trong các lượt xử lý tài liệu thông thường.

## Quyết định

- **Dịch thường ngày hoàn tất trong một lượt, chỉ xử lý một lần.** Agent (tác nhân) hiện tại tải [terminology.md](../../../../docs/i18n/terminology.md), dịch trực tiếp phần nội dung có thay đổi; nếu vị trí xuất hiện thực tế của thuật ngữ vượt qua ranh giới chỉnh sửa, di chuyển chú thích trong ngoặc tương ứng, ngược lại giữ nguyên văn phong của file phía đối diện đã được review nằm ngoài phần thay đổi; cuối cùng ghi lại cặp đôi. Nó không gọi skill dịch thuật, không sinh briefing, không khởi động vòng review dịch thuật riêng, cũng không ủy quyền việc dịch cho subagent.
- **Luồng công việc mở rộng chỉ được gọi thủ công.** [dsh-translate-docs](../../../skills/dsh-translate-docs/SKILL.md) giữ lại briefing, ủy quyền dịch văn bản, đường dẫn kiểm chứng toàn tài liệu và theo phạm vi. [Hợp đồng skill của Claude Code](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill) đọc `disable-model-invocation: true` và `user-invocable: true` trong `SKILL.md`; Codex đọc `policy.allow_implicit_invocation: false` trong `agents/openai.yaml`. Symlink `.claude/skills` của repo ánh xạ cùng một thư mục skill cho Claude Code, nên hai sản phẩm dùng chung một luồng công việc đã commit vào repo, đồng thời mỗi bên thực thi riêng hợp đồng metadata gọi của mình. Gate metadata gọi skill trong `doc-sync` giữ hai chính sách độc lập này nhất quán với nhau.
- **Luồng công việc tự động sẽ không nối chuỗi gọi skill chỉ-gọi-thủ-công này.** Hành vi mặc định gọn nhẹ được định nghĩa bởi chỉ thị cấp gốc và chỉ thị tài liệu. Các skill tài liệu, đồng bộ website, văn phong và review mã sẽ liên kết đến các chỉ thị này hay hợp đồng i18n, thay vì tải `dsh-translate-docs` chỉ vì suy luận ra có thay đổi song ngữ.
- **Hợp đồng cặp đôi và hợp đồng review vẫn không đổi.** File của cả hai ngôn ngữ vẫn được cập nhật cùng nhau; văn phong của file phía đối diện chưa bị chạm vào vẫn giữ ổn định; ràng buộc thuật ngữ vẫn có hiệu lực; chỉ khi agent hiện tại xác nhận cặp đôi mới ghi lại bản ghi nhất quán; `doc-sync` (gate đồng bộ tài liệu) tiếp tục thực thi kiểm tra máy móc toàn ngữ liệu. Chất lượng dịch thuật ở tầng ngữ nghĩa vẫn do con người review.

## Các phương án đã cân nhắc

- **Xóa skill mở rộng và công cụ briefing**: không chấp nhận. Trong việc dịch toàn tài liệu hay phối hợp nội dung hai phía khó xử lý, và với bên gọi cố tình chọn luồng công việc có kiểm soát, việc gọi thủ công tường minh vẫn có giá trị.
- **Thay skill mở rộng bằng một skill gọn nhẹ được gọi tự động**: không chấp nhận. Một skill tự động khác vẫn sẽ thêm context phát hiện và ranh giới gọi cho nhiệm vụ này, trong khi agent hiện tại chỉ cần bảng thuật ngữ và chỉ thị thường trực là đủ hoàn thành trực tiếp.
- **Chỉ giữ gọi tự động cho cặp đôi mới hoặc thay đổi quy mô lớn**: không chấp nhận. Suy luận dựa trên quy mô cũng là một chính sách ẩn, có thể vô tình bật luồng công việc chi phí cao. Việc khi nào đáng để trả chi phí cho đường dẫn mở rộng nên do người dùng quyết định, không phải agent.
- **Đồng thời bỏ tải bảng thuật ngữ**: không chấp nhận. Bảng thuật ngữ là input nhỏ nhưng có tính ràng buộc, ngăn ngừa thuật ngữ trôi dạt trên toàn repo; gỡ bỏ nó tức là đánh đổi sự nhất quán ngôn ngữ sản phẩm lấy tiết kiệm token.

## Hệ quả

- Chi phí phát triển thường ngày đến từ văn bản nguồn có thay đổi, context cục bộ của file phía đối diện, và bảng thuật ngữ, không còn đến từ briefing và context subagent của luồng công việc mở rộng.
- Agent hiện tại chịu trách nhiệm về kết quả cuối cùng của bản dịch thường ngày trong cùng một lượt. Đường dẫn gọn nhẹ cố tình từ bỏ thông tin đối chiếu tự sinh mà luồng công việc mở rộng cung cấp, sự cô lập mà việc ủy quyền mang lại, và vòng kiểm chứng văn phong riêng.
- Người dùng vẫn có thể gọi luồng công việc đầy đủ tường minh qua `/dsh-translate-docs` trong Claude Code, hoặc `$dsh-translate-docs` trong Codex.
- Frontmatter của Claude Code và file chính sách của Codex là hai hợp đồng sản phẩm độc lập với nhau; nếu một skill chỉ trở thành gọi thủ công ở một sản phẩm, hoặc không khả dụng cho cả mô hình lẫn người dùng trong Claude Code, `doc-sync` sẽ từ chối trạng thái đó.
