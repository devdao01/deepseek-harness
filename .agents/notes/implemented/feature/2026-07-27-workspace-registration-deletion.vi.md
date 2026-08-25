# Agent Note: Xóa bản ghi đăng ký Workspace

Status: implemented

[English](2026-07-27-workspace-registration-deletion.md) | 中文

## Vấn đề

Việc đăng ký Workspace đã có sẵn code để trỏ tới một thư mục, giúp GUI đặt tên cho thư mục đó và sắp xếp session của nó. Bản ghi đó không nói rằng Harness tạo ra hoặc sở hữu thư mục đó, và log session cũng là một đối tượng đã persist độc lập. Nếu coi thao tác Delete trong dòng danh sách là xóa đệ quy source code hoặc xóa session, sẽ phá hỏng dữ liệu nằm ngoài ranh giới sở hữu của bản ghi này.

Menu dòng hiện có chỉ mang tính trình diễn, chưa có chức năng thực sự, nên thứ tự đã persist, bảng Workspace, luồng Host, nhiều tab trình duyệt chạy song song, baseline khi kết nối lại, và ngữ nghĩa xóa khi yêu cầu danh sách và thay đổi diễn ra đồng thời cũng đều chưa được định nghĩa.

## Quyết định

`ctx.workspaceRegistry.delete(id)` chỉ xóa bản ghi đăng ký Workspace: id của nó bị loại khỏi `workspaceIds` đã persist, dòng trong bảng `workspaces` và mục cache thực thể biến mất, sổ `sessionIds` có thứ tự cũng biến mất cùng dòng đó. Nó tuyệt đối không gọi thao tác xóa filesystem hay `SessionPersistence`; thư mục, mọi file người dùng, mọi session thời gian thực và mọi log session đã persist đều được giữ lại. Nhóm sidebar là phần bù của mọi sổ Workspace còn tồn tại, do đó các session này (kể cả session hiện tại) sẽ lập tức xuất hiện dưới Ungrouped.

Id không xác định trả về `false` tại nơi quy định của domain. `workspace.delete({ workspaceId })` ánh xạ kết quả đó thành `workspace-not-found`; khi thành công trả về `{ deleted: true }`. `workspace.list` vẫn là baseline khi kết nối lại.

## Commit và publish việc persist

Thao tác của registry thực thi tuần tự việc tạo và xóa. Khi xóa, hệ thống ghi trước thứ tự Workspace sau khi loại id đó, rồi mới xóa thực thể khỏi cache, cuối cùng mới xóa dòng trong bảng. Việc xóa bảng là điểm commit thông báo: chỉ sau khi cache ngừng publish thực thể đó, bất biến (invariant) của package mới chấp nhận việc xóa; Host cũng chỉ phát `host/workspace-removed` dựa trên việc xóa đã commit này. Nếu ghi bảng thất bại, hệ thống khôi phục cache và thứ tự đã persist trước đó, và không phát frame xóa.

Luồng Host giữ tập id đã commit của nó trong lúc việc ghi thứ tự toàn cục trước đó vẫn đang diễn ra, chỉ loại id khi dòng trong bảng bị xóa. Do đó, việc rollback khi tạo sẽ không phát nhầm frame xóa, còn mỗi tab đã kết nối đều nhận đúng id cần thiết để xóa bản ghi đó khỏi chiếu (projection) riêng của mình.

Việc tạo và xóa đều ghi `pendingMutation` đã persist trước khi cặp bản ghi/thứ tự có thể phân kỳ (diverge). Khi khởi động, hệ thống chỉ hoàn tất thao tác được đánh dấu tường minh đó, rồi xóa marker; chỉ có một dòng bản ghi mồ côi thì không thể xác định thao tác nào đã bị gián đoạn. Vì vậy, trường hợp thứ tự/bảng phân kỳ mà không có marker vẫn giữ ngữ nghĩa fail trực tiếp khi hỏng vốn có của registry. Nếu việc ghi bảng cho xóa đã commit, nhưng việc dọn marker thất bại, thao tác vẫn báo thành công — vì trạng thái đã yêu cầu và frame xóa đều đã commit — lần khởi động kế tiếp sẽ dọn marker đó một cách idempotent.

## Hội tụ (convergence) phía client

`WorkspaceManager` coi cả `host/workspace-changed` lẫn `host/workspace-removed` là gia tăng có thứ tự, và phát lại chúng trên nền response `workspace.list` đang diễn ra. Một lần xóa một-phần-tử (unary) thành công sẽ lập tức loại bỏ dòng, không cần chờ frame vọng lại (echo) của chính thao tác đó. Thao tác xóa có tính idempotent; vì id Workspace không bao giờ được dùng lại, một bia mộ (tombstone) cục bộ theo tiến trình sẽ từ chối các frame changed đến muộn hoặc dòng baseline đã cũ. Kết nối lại vẫn làm mới từ `workspace.list`; gia tăng Workspace tuyệt đối không cắt bỏ trạng thái session.

Hộp thoại xác nhận xóa giữ trạng thái chờ cho tới khi chiếu (projection) Workspace React đã commit việc loại bỏ id mục tiêu, do đó thao tác Workspace tiếp theo sẽ không thấy frame danh sách đã cũ, cũng không lấy nó làm mục tiêu.

## Tương tác xác nhận

Menu dòng Workspace hiện có sẽ mở `Modal` dùng chung trước khi xóa. Văn bản nói rõ ba hệ quả: Workspace sẽ bị xóa khỏi danh sách, thư mục và log session sẽ được giữ lại, các session liên quan sẽ xuất hiện dưới Ungrouped. Trong lúc yêu cầu đang chờ, cả control xác nhận lẫn Cancel đều bị vô hiệu hóa, xác nhận lặp lại sẽ bị bỏ qua, Escape hoặc Close cũng không thể đóng thao tác này. Khi thất bại, `Modal` giữ nguyên trạng thái mở và hiển thị lỗi; dùng Cancel, Escape hoặc Close trước khi submit tuyệt đối không kích hoạt việc xóa.

Menu, `Modal` và nút vẫn giữ nguyên cấu trúc và design token hiện có. Việc xóa session vẫn chỉ mang tính trình diễn, chưa có chức năng thực sự, và không nằm trong phạm vi quyết định này.

## Các phương án thay thế đã cân nhắc

**Xóa theo tầng (cascade) cả session.** Không áp dụng, vì bản ghi đăng ký Workspace không sở hữu việc persist session, và yêu cầu sản phẩm là giữ lại lịch sử dưới Ungrouped. Việc xóa session cần vòng đời riêng, kiểm tra trạng thái đang chạy, ngữ nghĩa xử lý đối tượng hậu duệ, và UI rõ ràng của riêng nó.

**Chuyển thư mục vào thùng rác (trash).** Không áp dụng, vì bản ghi này không thể chứng minh quyền sở hữu thư mục. Các thao tác filesystem có tính phá hủy trong tương lai phải dùng tên riêng, xác nhận riêng, và thực thi ranh giới an toàn rõ ràng.

**Xóa dòng bảng trước, sửa thứ tự sau.** Không áp dụng, vì crash hoặc lỗi ghi sẽ khiến thứ tự và bảng của registry đã khởi tạo không nhất quán. Registry cập nhật cả hai trong cùng một thao tác tuần tự, và khôi phục thứ tự trước đó khi thao tác bảng thất bại.

**Xóa mọi dòng bảng không được tham chiếu khi khởi động.** Không áp dụng, vì hỏng thứ tự không rõ nguồn gốc cũng có cùng hình dạng; việc âm thầm loại bỏ có thể làm mất metadata Workspace và sổ Session. Việc khôi phục phải dựa vào marker đang-chờ rõ ràng do đúng thao tác sở hữu thay đổi đó ghi trước.

**Sau khi thành công thì fetch lại cả hai danh sách.** Không áp dụng, vì frame xóa đã commit cùng việc vọng lại một-phần-tử tức thời đã đủ, vừa giữ được đối tượng session hiện tại, vừa tránh biến một thay đổi cục bộ thành hai yêu cầu danh sách. Baseline khi kết nối lại vẫn là đường khôi phục.

## Kiểm thử

Test package Workspace cố định đường thành công chỉ xóa metadata, việc đăng ký lại cùng đường dẫn, hành vi idempotent với id không xác định, rollback khi thao tác bảng thất bại, khôi phục khi khởi động lại với marker rõ ràng, việc từ chối hỏng không rõ nguồn gốc, và hành vi bất biến giữa cache/bảng. Test apiproxy và carrier cố định schema, handler, `workspace-not-found`, việc giữ lại session/thư mục, đăng ký lại với id mới, và frame `host/workspace-removed` đã commit. Test client cố định việc vọng lại một-phần-tử trực tiếp, việc xóa lặp lại, frame changed đến muộn, và hành vi xóa đồng thời với baseline đang diễn ra. Test component cố định tương tác xác nhận, việc đóng sau khi chiếu ổn định, frame thành công đến trước response một-phần-tử, thất bại, Cancel, Escape và Close. Kịch bản trình duyệt sẽ quan sát mỗi lần alert tức thời, slot error, console error và page error khi dùng lại tên đã xóa cho các thư mục khác nhau.

Kịch bản Web lắp ráp không cần key sẽ đăng ký một thư mục dự án tạm đã có sẵn, tính session đã persist vào sổ, đặt session đó làm session hiện tại, xác nhận xóa trong Chromium, và xác minh nhóm Workspace biến mất, trong khi Ungrouped giữ lại session hiện tại. Kịch bản này kiểm tra file người dùng và log JSONL trước và sau khi xóa, và lặp lại việc xác minh UI, thư mục và log sau khi refresh.

## Hệ quả

Sau khi xóa Workspace vẫn có thể đăng ký lại cùng thư mục đó với id mới, do đó thao tác này được thiết kế có chủ đích để có thể đảo ngược; nhưng thứ tự session thủ công trước đó sẽ mất, và sau khi đăng ký lại, hệ thống cũng không tự động thu nạp lại các session hiện có sau khi bootstrap kết thúc. Thao tác này từ bỏ việc dọn dẹp một-cú-click cho lịch sử session hoặc thư mục source code, để đổi lấy ranh giới xóa nhất quán với quyền sở hữu thực tế của bản ghi.
