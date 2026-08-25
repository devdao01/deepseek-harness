# Agent Note: Loại bỏ session summary có thể thay đổi

Status: implemented

[English](2026-06-19-drop-mutable-session-summary.md) | 中文

## Vấn đề

[Seam persistence của session](../architecture/2026-06-14-session-persistence.md) tách metadata ngoài log của session thành hai type do `dsh-session` sở hữu: một `SessionHeader` bất biến (`version`, `id`, `createdAt`, `cwd?`, `parentSession?`), được ghi một lần duy nhất lúc tạo; một `SessionSummary` có thể thay đổi (`updatedAt`, `title?`, `firstPrompt?`), "có thể cập nhật mà không cần đụng đến log chỉ append". Hai cái gộp thành `SessionMeta = SessionHeader & SessionSummary`, service trừu tượng `SessionPersistence` vì vậy có thêm phương thức thứ bảy `update(id, summary)`, dùng để ghi đè summary. Mỗi backend tự triển khai lưu trữ có thể thay đổi riêng: JSONL ghi file tạm cạnh log rồi rename, và publish nguyên tử theo kiểu best-effort một **file đi kèm** `.summary.json` riêng biệt; SQLite dùng **cột** `updated_at`/`title`/`first_prompt`, và cập nhật cột thời gian trong đó trong cùng transaction append.

Summary được thiết kế cho một session selector trong tương lai (sắp xếp session gần đây theo `updatedAt`, dùng `title`/`firstPrompt` để preview). Selector đó chưa bao giờ được triển khai. Audit toàn repo cho thấy toàn bộ interface liên quan đến `SessionSummary` chỉ đang duy trì **trạng thái vô dụng**:

- `SessionPersistence.update()` có **không lệnh gọi production nào** (mọi khớp `.update(` đều là `createHash().update()` hoặc code test).
- `firstPrompt` **không bao giờ được đọc** trong code production.
- Tiêu đề session đến từ sự kiện `session/title` bền vững, tiêu đề thẻ tool đến từ tool presenter; cả hai đều không đọc session metadata có thể thay đổi.
- Bên tiêu thụ danh sách persistence dùng identity, thời gian tạo, phả hệ và field cwd trong header bất biến. Sắp xếp gần đây và preview được suy ra từ log, không phải từ một summary `updatedAt` nào.
- Điểm mấu chốt: type `Session.header` đang hoạt động vốn dĩ đã là `SessionHeader` chứ không phải `SessionMeta` — summary chưa bao giờ tồn tại trên đối tượng session đang hoạt động; nó chỉ tồn tại ở lớp persistence, không ai ghi, không ai đọc ngoài chính test quy ước của nó.

## Quyết định

Xóa hoàn toàn session summary có thể thay đổi. Tên `SessionSummary` và `SessionMeta` bị loại bỏ cùng nhau; backend lưu trữ và trả về metadata chỉ còn `SessionHeader`. `SessionPersistence.update()` bị loại khỏi service trừu tượng và mọi backend. JSONL bỏ toàn bộ cơ chế file đi kèm (`writeSidecar`/`readSidecar`/`touchSummary`/`removeSidecars`/`sidecarPath` cùng logic ghi đè của load/list); SQLite bỏ cột `updated_at`/`title`/`first_prompt` cùng việc cập nhật `updated_at` mỗi lần append, `SCHEMA_VERSION` của nó tăng từ `1 → 2`.

Mọi thứ summary vốn dự định cung cấp, khi bên tiêu thụ thực sự cần, đều **có thể suy ra được từ log chỉ append** (`firstPrompt` = `user/message` đầu tiên; độ gần đây = `time` của sự kiện cuối cùng hoặc mtime file), hoặc đã có sẵn trong header bất biến (`createdAt`, `cwd`). Thứ duy nhất *không thể* suy ra là tiêu đề do người dùng *sửa tay*, nhưng nó chưa bao giờ được triển khai, thuần túy là YAGNI; nếu tương lai thực sự có tính năng cần đến, nó có thể quay lại dưới dạng một sự kiện log độc lập hoặc một field header.

Lần loại bỏ này đồng thời thu hẹp cả quy ước service công khai lẫn định dạng đĩa của hai backend; summary là kết quả của một thiết kế có chủ đích cho tương lai, không phải do vô tình; ngày nay chỗ nào Agent Note gốc mô tả `SessionMeta` thì nay đã là `SessionHeader`, đó chính là lý do summary biến mất. Nó còn dọn đường cho [coordinator ghi persistence dùng chung](../architecture/2026-06-18-shared-persistence-write-coordinator.md): không còn summary có thể thay đổi, interface hook của coordinator không cần hook `updateSummary`, sự phân kỳ về tính bền vững giữa file đi kèm JSONL và cột SQLite cũng biến mất theo, khiến đường ghi của hai backend trở nên nhất quán hơn.

## Không cần migration

Đây là phần mềm chưa phát hành (xem mục "Pre-release stance: foundation over blast radius" trong [AGENTS.md gốc](../../../../AGENTS.md)), nên không có database hay log trên đĩa nào cần giữ lại. SQLite không migrate database v1: guard `openDatabase` giờ từ chối bất kỳ `user_version` trên đĩa nào khác phiên bản hiện tại (`onDisk !== 0 && onDisk !== SCHEMA_VERSION`), bất kể cũ hơn *hay* mới hơn, nên database v1 cũ sẽ bị từ chối sạch sẽ, thay vì đọc không đầy đủ theo tập cột mới. Database mới ghi số phiên bản hiện tại; đây là đường duy nhất cần hoạt động đúng.

## Hệ quả

Session selector trong tương lai giờ phải suy ra thông tin preview/sắp xếp từ log (hoặc đưa trở lại một field có kiểu), thay vì đọc trực tiếp một dòng summary có sẵn. Đây là cái giá đúng đắn: duy trì một cache cho một tính năng chưa tồn tại là gánh nặng vô nghĩa mà mỗi backend phải gánh chi phí bảo trì, mỗi test quy ước phải gánh chi phí assertion. Nguyên tắc này — **test pass cố định hành vi hiện tại, không nhất thiết là hành vi đúng; hành vi có thể là sản phẩm của một thỏa hiệp trong quá khứ** — nay đã được ghi lại như một quy ước độc lập trong [AGENTS.md gốc](../../../../AGENTS.md), thay đổi này chính là một ví dụ minh họa cho nó.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
