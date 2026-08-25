# Agent Note: Kiểm tra tính hợp lệ của liên kết chéo Markdown

Status: implemented

[English](2026-06-18-markdown-cross-link-lint.md) | 中文

## Vấn đề

Tài liệu trong repo này liên kết với nhau qua đường dẫn tương đối: `[topic](../implemented/2026-…-….md)`, `[the cookbook](adding-a-tool.md)`, `[architecture.md](../../architecture.md)`. Trước đây không có cơ chế nào xác minh các mục tiêu này có tồn tại hay không. Việc đổi tên hoặc di chuyển file sẽ âm thầm phá vỡ mọi liên kết trỏ tới nó, và không thể nhìn thấy được cho tới khi người đọc click vào. [Việc cưỡng chế doc-sync (gate đồng bộ tài liệu)](../../archived/process/2026-06-11-doc-sync-enforcement.md) đã tự động hóa việc kiểm tra hai loại trôi dạt tài liệu (code block không biên dịch được, bảng phân loại sự kiện lỗi thời), [verify-md-wrap](../../archived/process/2026-06-11-doc-sync-enforcement.md) bao phủ loại thứ ba (đoạn văn xuống dòng cứng), nhưng liên kết chết là loại thứ tư cũng có thể kiểm tra bằng máy móc, nhưng vẫn phải xác minh bằng mắt.

Động lực trực tiếp để đưa gate này vào là việc tái cấu trúc cây thư mục Agent Note: hợp nhất `docs/adr/` và `.agents/notes/` vào cùng một `.agents/notes/`, và thiết lập các thư mục con `proposed/`, `implemented/`, `rejected/`, cần đổi tên thủ công khoảng 40 liên kết giữa các tài liệu. Chỉ cần một chỗ gõ sai đường dẫn là sẽ giao một liên kết chết mà không có kiểm tra nào chặn lại.

## Quyết định

Thêm gate `doc-sync` thứ tư `verify-md-links` (`scripts/verify-md-links.ts`), phong cách nhất quán với `verify-md-wrap` (tsx ESM, dựa trên AST, chỉ xác thực không sinh ra):

- Dùng `mdast-util-from-markdown` + GFM để parse mỗi file Markdown trong phạm vi, duyệt qua toàn bộ node `link`, `image`, `definition`.
- Chỉ kiểm tra khi mục tiêu là **đường dẫn tương đối**. Bỏ qua URL có protocol (`https:`, `mailto:`, v.v.), đường dẫn tương đối theo protocol (`//host`), đường dẫn tuyệt đối gốc (`/path`, không có baseline ổn định trong thư mục checkout) và anchor thuần nội trang (`#section`). Loại bỏ `#fragment`/`?query`, giải quyết đường dẫn tương đối theo thư mục chứa file có liên kết, và khẳng định mục tiêu tồn tại trên đĩa.
- Chỉ báo cáo, không viết lại; phát hiện liên kết chết đầu tiên là thoát với mã khác 0.

Phạm vi kiểm tra nhất quán với các gate khác, và bổ sung thêm cặp file AGENTS.md cùng Markdown agent skill (kỹ năng agent) do repo tự sở hữu dưới `.agents/skills/` (các file skill này có liên kết chéo tới cây thư mục docs, nên lần tái cấu trúc này cũng viết lại các liên kết trong đó): `README.md`, `docs/**/*.md`, `packages/*/README.md`, `AGENTS.md`, `packages/AGENTS.md`, `.agents/skills/**/*.md`. Hệ thống loại bỏ trùng lặp theo đường dẫn thật (symlink `CLAUDE.md` sẽ được giải quyết về file AGENTS.md). Kiểm tra này được đấu nối vào `doc-sync`, do đó thay đổi tài liệu liên quan và CI dùng chung một bộ kiểm tra liên kết chết.

Gate này giờ cũng kiểm tra anchor `#fragment` trên mục tiêu Markdown — bao gồm cả anchor cùng file — đối chiếu với slug tiêu đề và `<a id>` tường minh; cơ chế này và quy tắc slug được quy định trong [Quyết định anchor fragment](2026-08-09-md-fragment-anchor-gate.md).

## Phương án khác đã cân nhắc

**Kiểm tra tính hợp lệ ở cấp anchor**: khi đó bị hoãn lại với lý do nặng hơn và giá trị thấp hơn (vấn đề thực tế đã xảy ra là liên kết chết ở cấp file), để việc xác thực `#fragment` cho tác giả tự làm thủ công. Quy tắc thủ công đó không giữ được; [Quyết định anchor fragment](2026-08-09-md-fragment-anchor-gate.md) sau này đã bổ sung kiểm tra này.

## Hệ quả

- Việc đổi tên và di chuyển file gây ra liên kết chéo bị hỏng sẽ khiến `doc-sync` và CI fail ngay lập tức, thay vì đợi người đọc click vào liên kết chết mới lộ ra. Nhờ đó, việc tái cấu trúc Agent Note đưa gate này vào có khả năng tự kiểm chứng: kiểm tra này chứng minh chính các liên kết mà nó viết lại đều không bị treo.
- Chuỗi `doc-sync` có thêm một script tsx nhanh; không thêm dependency mới (bộ công cụ mdast/GFM đã tồn tại sẵn như devDependencies của `verify-md-wrap`).
- Quy ước mà gate này cưỡng chế là: tham chiếu chéo tài liệu phải dùng liên kết tương đối có thể kiểm tra bằng máy móc, tuyệt đối không được chỉ viết văn bản thuần hay đánh số. [docs/AGENTS.md](../../../../docs/AGENTS.md) ghi lại quy ước này, để tác giả biết về gate này và lý do của nó.
