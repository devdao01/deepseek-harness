# Agent Note: Lưu trữ phiên (tập hợp toàn cục cấp registry)

Status: implemented

[English](2026-07-31-session-archive-global-set.md) | 中文

## Vấn đề

Trong menu hàng phiên ở khu vực duyệt workspace trên Sidebar, "Delete session" từ trước đến nay chỉ là chỗ giữ chỗ thuần thị giác (không có handler). Định hướng sản phẩm chốt là **lưu trữ (archive)** chứ không phải xóa: log của phiên và sổ sách kế toán workspace đều không đổi, chỉ ẩn phiên đó khỏi mọi view nhóm (nhóm theo workspace, Ungrouped, tìm kiếm, danh sách phẳng). Bản ghi lưu trữ cần một nơi để đặt: các phiên thuộc Ungrouped không thuộc về bất kỳ thực thể workspace nào, nên trường cấp-từng-workspace không chứa nổi nó.

## Quyết định

**Tập hợp lưu trữ là một trường mới trên singleton toàn cục cấp domain workspace (`workspaceDomainState.archivedSessionIds`), phủ lên trên sổ sách workspace; việc lọc hiển thị hoàn toàn hội tụ ở tầng dẫn xuất `tree.ts` phía client; mặt wire dùng tư thế snapshot toàn phần.**

- Lưu trữ: `archivedSessionIds: z.array(sessionId).default([])`, phiên bản domain giữ nguyên ở 2 — chỉ là thêm trường mới thuần túy, dữ liệu cũ được schema default parse thành tập rỗng, không cần code migrate. Phiên bị lưu trữ vẫn giữ nguyên slot `sessionIds` của nó (để tương lai bỏ lưu trữ khôi phục đúng vị trí cũ), do đó không vướng víu gì với bất biến "một phiên chỉ được một workspace ghi sổ".
- Registry: `ctx.workspaceRegistry.archiveSession(id)` chạy qua `enqueueOperation` tuần tự hóa cùng với create/delete; phiên không xác định (không tìm thấy cả ở thời gian thực lẫn dữ liệu bền vững) sẽ ném `WorkspaceUnknownSessionError`; id đã lưu trữ rồi thì không ghi đĩa, không phát sự kiện. Getter `archivedSessionIds` phơi ra tập hợp chỉ đọc.
- RPC: `workspace.archiveSession({sessionId}) → {archivedSessionIds}` (trả lời bằng toàn bộ tập hợp đã cập nhật); phản hồi `workspace.list` mang theo tập hợp này làm baseline khi kết nối lại; khung host mới `host/archived-sessions-changed` đẩy toàn bộ snapshot sau mỗi lần thay đổi bền vững (cùng tư thế với `host/workspace-changed`, đẩy khung dựa trên so sánh nhánh global put của `domain/changed`). Phiên không xác định dùng lại mã lỗi `session-not-found`.
- Runtime client: `WorkspaceListState.archivedSessionIds` (`readonly SessionId[]` theo thứ tự Host, tham chiếu không đổi khi thành viên không đổi — trạng thái snapshot công khai giữ đúng từ vựng dữ liệu thuần của store engine: immer draft không bật plugin MapSet thì không chấp nhận Set; truy vấn membership tự dựng Set tạm thời bên trong hàm dẫn xuất, cùng kiểu với expandedProjects); cả ba đường — baseline của list, tiếng vọng unary, khung changed — đều thay thế toàn bộ giá trị hiện có bằng tập hợp đầy đủ. Tầng chiếu (projection) thống nhất xóa selection hiện tại về view New Session khi selection đó rơi vào tập hợp lưu trữ (quyết định của người dùng: lưu trữ phiên đang mở sẽ đưa view chính về hero) — một quy tắc duy nhất bao trùm cả tiếng vọng unary cục bộ, khung changed từ tab khác, và trường hợp baseline khi kết nối lại phát hiện selection hiện tại đã bị lưu trữ trong lúc client này offline; khung/tiếng vọng rơi vào giữa lúc `workspace.list` đang in-flight cũng chặn baseline cũ rollback đè lên tập hợp mới.
- UI: mục menu `delete` (thuần thị giác) đổi thành `archive` (nhãn "Archive session", không dùng style nguy hiểm, không có hộp thoại xác nhận — vì đây là thao tác không phá hủy, nhấp nhầm chỉ khiến danh sách bị ẩn); việc lọc được hiện thực bằng cách thêm một tầng vào tiêu chí `sessionVisible` của `tree.ts`, `deriveGroups`/`deriveFlat` nhận thêm tham số tập hợp `archived`, cả bốn view (vòng lặp nhóm, fallback stray, tìm kiếm, phẳng) đều dùng chung nguồn này.

## Các phương án thay thế đã cân nhắc

**archivedSessionIds cấp-từng-workspace (cách diễn đạt ban đầu).** Bị từ chối: phiên Ungrouped không có nơi để đặt; người dùng đổi ý sang toàn cục.

**Đánh dấu archived trên SessionSummary (tầng session.list).** Bị từ chối: phải join sự kiện của domain workspace vào phép chiếu của domain sessions, summary không có khung tăng dần (incremental) nên phải phát thêm thông báo riêng, độ khớp nối liên domain lớn hơn lợi ích mang lại.

**Lọc ở phía host tại getter `workspaceView`/`sessionIds`.** Bị từ chối: lưu trữ ≠ thay đổi sổ sách, lọc ở tầng chiếu sẽ làm lẫn lộn hai khái niệm; entry khôi phục trong tương lai cũng cần client nhận được toàn bộ sổ sách.

**Khung tăng dần (một mục archived/removed riêng lẻ).** Bị từ chối: tập hợp rất nhỏ, tần suất thay đổi thấp, snapshot toàn phần tránh được logic hợp nhất và trạng thái khử trùng lặp phía client, nhất quán với tư thế hiện có của workspace-changed.

## Hệ quả

Sau khi lưu trữ, UI hiện chưa có lối vào để xem/bỏ lưu trữ (định hướng của giai đoạn này, đã ghi trong Known Limitation của README); dữ liệu và slot vẫn nguyên vẹn, việc bổ sung mặt khôi phục sau này chỉ cần thêm UI cộng một RPC ngược. Thay đổi hình dạng phản hồi `workspace.list` là sửa trực tiếp theo tinh thần pre-release (không có lớp tương thích). e2e (workspace-management) chốt toàn bộ chuỗi "lưu trữ → hàng biến mất → vẫn ẩn sau reload, log vẫn còn"; test tầng domain chốt tính idempotent, từ chối id không xác định, khôi phục qua reboot, và nâng cấp giá trị mặc định cho dữ liệu cũ.
