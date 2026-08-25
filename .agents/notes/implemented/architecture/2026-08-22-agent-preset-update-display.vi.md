# Agent Note: Settable preset display metadata after a copy

Status: implemented

[English](2026-08-22-agent-preset-update-display.md) | Tiếng Việt

## Problem

`agentPreset.copy` giữ nguyên description của preset NGUỒN trên bản sao mới, và suy ra tên của nó từ id (hoặc `name` do phía gọi cung cấp), với lý do "sau này tác giả tự sửa file lấy". Nhưng không có "sau này": muốn sửa văn bản hiển thị của một preset `user`, cách duy nhất là chỉnh tay `preset.yml` qua `openDocument`, hoặc xóa rồi copy lại. Một giao diện muốn cho người dùng đổi tên preset, hoặc sửa một dòng description, không có RPC nào để gọi.

## Decision

Thêm `agentPreset.update` — một RPC được ủy quyền đặc quyền, đặt `name` và/hoặc `description` dùng để hiển thị trong `preset.yml` của preset cục bộ, và giữ nguyên `order` cùng `workspacePath` đã được đóng dấu. Nó phản chiếu chính xác seam `writePresetWorkspacePath`/`setWorkspacePath` đã có, thay vì dựng một quy ước riêng.

- **Seam của package.** `writePresetDisplay(roots, preset, updates)` trong `dsh-agent-presets/authoring` áp cùng hai lớp bảo vệ như `writePresetWorkspacePath`: chỉ trust `user`, và thư mục được phân giải phải nằm dưới một gốc có thể ghi. Nó đọc metadata hiện tại, chỉ gộp những khóa CÓ MẶT trong `updates` (`'name' in updates`), rồi render qua `renderPresetMetadata`. Khi việc gộp làm mọi thứ trống rỗng, nó `rm` (force) `METADATA_FILE`, để preset đó không phát hành gì thay vì phát hành một tài liệu trống; ngược lại ghi nguyên tử với quyền 0o600. Phương thức dịch vụ là `AgentPresets.setDisplay(id, updates)`.
- **Set / clear / keep.** Trường xuất hiện dưới dạng chuỗi không rỗng thì được set; xuất hiện dưới dạng chuỗi rỗng hoặc toàn khoảng trắng thì bị xóa (dùng cùng chuẩn hóa `text()` mà file vốn đã dùng khi round-trip); trường vắng mặt giữ nguyên giá trị hiện tại. Đây chính là hành vi ba trạng thái mà phương thức wire này phơi bày.
- **Trả về giá trị hiệu lực.** Gateway dựng `updates` từ những khóa có mặt trong payload, gọi `setDisplay`, sau đó RE-RESOLVE preset đó và trả về `name`/`description` hiệu lực của nó (bỏ qua undefined giống như `read`), nên client vừa xóa một trường sẽ thấy nó đã biến mất.
- **Composition vẫn chỉ qua copy.** `update` chỉ mang văn bản hiển thị — không có dòng plugin, không có văn bản composition, không có đường dẫn. Nó không cấp bất kỳ năng lực nào mà `copy` chưa cấp; nó chỉ chỉnh sửa những gì picker hiển thị.

Điểm cưỡng chế vẫn nằm ở chỗ seam anh em của nó đặt. Guard trust và gốc có thể ghi nằm trong `writePresetDisplay`, chứ không phải ở gateway — đúng nơi mà `writePresetWorkspacePath` áp đặt chúng. Preset đi kèm triển khai bị từ chối với `PresetNotWritableError` ("it ships with the deployment"), được gateway ánh xạ thành `agent-preset-read-only`, nhất quán với `openDocument`. `agentPreset.update` được đăng ký song song với `read`/`copy`/`openDocument`/`remove` vào `PRIVILEGED_METHODS` (dsh-client-connection) và `DEFAULT_UNPINNED_METHODS` (api-auth): nó bị ghim ở loopback, và chỉ có thể tiếp cận với client đã authenticate khi token web bắt buộc.

## Alternatives considered

- **Gộp name/description vào một `setWorkspacePath` mở rộng.** Bị bác bỏ: hai loại chỉnh sửa khác nhau về tinh thần bảo vệ (workspace stamp là một phần của copy-then-provision; chỉnh sửa display là độc lập), ngữ nghĩa xóa cũng khác nhau, và một phương thức nuốt trọn mọi trường metadata sẽ dụ dỗ phía gọi ghi đè `order` hoặc `workspacePath` mà nó chưa từng định chạm tới. Phạm vi `'key' in updates` giới hạn mỗi lần ghi đúng vào những gì nó chỉ định.
- **Chỉ cho phép phía gọi chỉnh sửa `preset.yml` qua `openDocument`.** Bị bác bỏ: đó là một năng lực gốc trên desktop, một mặt YAML thô, không phải thứ mà hộp thoại đổi tên trên trình duyệt có thể điều khiển; nó cũng không có hợp đồng set/clear/keep.
- **Cho phép đổi tên bất kỳ preset nào, kể cả preset đi kèm triển khai.** Bị bác bỏ: bản cài đặt đi kèm triển khai thuộc về triển khai, không thuộc về người dùng — đúng ranh giới mà `copy`/`remove`/`openDocument`/`setWorkspacePath` đã vạch sẵn.

## Consequences

`preset.yml` không thêm trường nào — `name` và `description` vốn đã tồn tại, vốn đã round-trip qua `renderPresetMetadata`/`readPresetMetadata` — nên không có thay đổi `SESSION_FORMAT_VERSION`: metadata hiển thị không phải một session event, và `update` là quản lý phiên hoàn toàn qua token, không bao giờ đi vào agent loop, cũng không tạo ra bất kỳ đầu ra nào hiển thị với mô hình. Không cần snapshot không cần key, cùng lý do như `copy`/`remove` không cần. Một bản sao giờ có thể chỉnh sửa sau khi tạo, nên tiền đề mà `copy` từng dựa vào — "sau này tác giả tự sửa file lấy" — cuối cùng đã có đường đi trong sản phẩm. Composition vẫn chỉ qua copy: không có phương thức nào trên seam này chấp nhận dòng plugin.
