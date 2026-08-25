# Agent Note: Tạo session mới trong workspace lại tái dùng session trắng khớp cwd nhưng chưa được ghi sổ

Status: implemented

[English](2026-08-05-workspace-blank-session-reuse-membership.md) | Tiếng Việt

## Vấn đề

Khi tạo session bằng nút `+` của một nhóm workspace trên sidebar, đôi khi người dùng vào được một session mới, nhưng sidebar lại hiển thị nó ở mục «Chưa phân nhóm» thay vì nằm dưới workspace vừa bấm — «đã vào session mới, nhưng workspace không được chọn». Lỗi chỉ xuất hiện với workspace đăng ký trên thư mục chạy của CLI (giao diện dòng lệnh) (tức `defaults.cwd = process.cwd()`, trong thực tế chính là thư mục checkout của harness), và sẽ xuất hiện ngay khi thư mục đó có sẵn một session trắng do CLI tạo ra.

Nguyên nhân gốc: vòng quét tái dùng session trắng của `connectWorkspace` chỉ đối chiếu bản sao danh sách session theo tiêu chí `cwd` bằng nhau. Quy tắc thành viên của chính host đòi hỏi thỏa mãn **đồng thời**: id session nằm trong sổ của workspace (`sessionIds`), **và** cwd đã chuẩn hóa trong header của session bằng đường dẫn của workspace ([Workspace UI product flow](../feature/2026-07-25-workspace-ui-product-flow.md)); trường hợp chỉ khớp cwd mà không có suất trong sổ chính là tình huống «Chưa phân nhóm». Vòng quét tái dùng đã bỏ qua suất trong sổ, nên bất kỳ session **trắng đang trực tuyến** nào khớp cwd cũng đều được chọn — bao gồm cả các session `main-session-*` mà lối vào CLI/TUI/headless tạo ra tại cwd của host (`session.create({})` lui về `defaults.cwd` và không bao giờ gắn vào workspace nào). Khi một session như vậy đang trực tuyến và còn trắng (chưa có `turn/start`), lần bấm `+` tiếp theo trên workspace đăng ký ở đường dẫn đó sẽ tái dùng nó, và điều hướng sẽ mở ra một session mà không giao diện phân nhóm nào có thể hiển thị dưới workspace ấy. Workspace ở đường dẫn khác không bị ảnh hưởng, vì ở đó không tích tụ session trắng chưa ghi sổ; còn workspace tại cwd của host thì mỗi lần chạy CLI lại tích thêm một cái.

## Quyết định

Vòng quét tái dùng giờ đòi hỏi quan hệ thành viên với workspace: `blank` và `summary.cwd === workspace.path` và `workspace.sessionIds.includes(summary.id)` và chưa lưu trữ. Trường hợp chỉ khớp cwd sẽ rơi xuống `session.create({ workspaceId })`, tạo và gắn session mới để workspace sở hữu nó — hoàn toàn giống nhánh vốn có trong luồng khi «không tồn tại session trắng».

## Các phương án từng cân nhắc

**Nhận nuôi session vô chủ thay vì tạo mới.** Cho `session.create({ workspaceId })` gắn một session trắng khớp cwd nhưng chưa ghi sổ. Bác bỏ: âm thầm gắn session do CLI tạo vào workspace là vượt qua ranh giới sổ sách và gây bất ngờ; hơn nữa nếu client không có view về thành viên thì không thể phân biệt «session vô chủ» với «session trắng của chính workspace» — mà chính view thành viên đó mới là bản sửa lần này.

**Gắn tại chỗ ngay lúc tái dùng, thêm một thao tác trên wire.** Cách này cần thêm RPC `workspace.attachSession` trên đường điều hướng nóng, mà session vẫn sẽ hiển thị ở «Chưa phân nhóm» trong một khung hình; không có nhu cầu sản phẩm nào đáng để thêm giao diện này.

## Hệ quả

Session trắng vô chủ vẫn hiển thị ở «Chưa phân nhóm» (người dùng vẫn mở thủ công được), nhưng không còn bị luồng tạo session mới của một workspace chiếm dụng nữa. Việc kiểm tra thành viên là điều kiện mới của vòng quét tái dùng, và nó có một ranh giới trễ bản sao quan sát được: trong khoảng cửa sổ mà bản sao session đã mới nhất còn khung sổ workspace bị trễ, session trắng thuộc thành viên của chính workspace có thể trượt cơ hội tái dùng do kiểm tra thành viên thất bại, khiến tạo thừa một session trắng — biểu hiện là dưới workspace đó xuất hiện dòng «Session mới» thứ hai, khác với dạng lỗi cũ (mở ra một session mà không giao diện phân nhóm nào hiển thị được). Cả hai cửa sổ đều là nhất thời, và logic hợp nhất theo từng workspace vẫn ngăn được các lượt tạo đồng thời tranh chấp lẫn nhau. Không có thay đổi nào về host, wire hay định dạng lưu bền vững.

## Kiểm thử

`packages/client/runtime/tests/workspaces-service.client.spec.ts` phủ bốn kết quả: session trắng thuộc thành viên được tái dùng (không có RPC create); session trắng vô chủ khớp cwd nhưng không phải thành viên thì **không** được tái dùng mà chuyển sang tạo session mới có ghi sổ (ca regression); session trắng đã lưu trữ không được tái dùng; và session trắng thuộc thành viên vẫn tái dùng được sau khi prompt đầu tiên bị từ chối. Bộ test client đầy đủ (`pnpm run test:gui`) vẫn xanh.
