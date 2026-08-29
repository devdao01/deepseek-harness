# Agent Note: Quản lý preset kèm workspace cấp phát cho từng preset

Status: implemented

[English](2026-08-29-preset-workspace-controller.md) | Tiếng Việt

## Vấn đề

Luồng authoring skill của MTIL phụ thuộc vào `preset.workspace_id`: mỗi agent preset sở hữu một workspace, và front-end Odoo/MTIL giữ id đó để gán và soạn skill qua `ctx.remote.skillAuthoring`. `agentPresets/copy` bản 0.1.2 gốc chỉ nhân bản thư mục preset và trả về void — không cấp phát workspace, không trả id nào. Bản cũ của fork (`apps/host/apiproxy/src/preset-workspace.ts`) cung cấp đúng chức năng này, nhưng viết dựa trên tầng RPC apiproxy đã bị xoá và một roster preset cũ có thể "đóng dấu" `workspacePath` lên từng preset. Roster `AgentPresets` bản 0.1.2 chỉ discovery: nó đọc preset từ thư mục ở mỗi lần gọi và không lưu tham chiếu workspace nào, nên cơ chế đóng dấu cũ không còn.

## Quyết định

Thêm một Typert Remote controller mới `@deepseek-ai/dsh-api-preset-workspace-controller` sở hữu namespace `presetWorkspace`, đắp vòng đời workspace lên trên bộ máy 0.1.2 sẵn có thay vì cài đặt lại.

Việc authoring preset uỷ thác cho `ctx.agentPresets` (các method Remote-export của nó đã ánh xạ lỗi preset lên wire) và việc đăng ký workspace uỷ thác cho `ctx.workspaceRegistry`. Controller chỉ điều phối trình tự và liên kết hai bên.

**Liên kết preset↔workspace là đường dẫn quy ước `<presetWorkspacesRoot>/<presetId>`**, port từ module đường dẫn thuần của fork. Vì roster 0.1.2 không lưu tham chiếu workspace, quy ước là liên kết bền duy nhất: workspace của một preset được tìm lại chỉ từ preset id bằng cách resolve đường dẫn đó trong registry. `presetWorkspacesRoot` là một trường `Config` được validate, resolve một lần lúc khởi tạo (vắng → `<home>/workspace`; tiền tố `~/` được mở rộng; đường dẫn tương đối bị từ chối lớn tiếng ngay lúc load).

`copy` nhân bản preset trước (validate nguồn, id, và root ghi được qua `ctx.agentPresets`), rồi `mkdir` thư mục quy ước và đăng ký nó thành workspace; nếu cấp phát thất bại thì roll back preset vừa nhân bản để không preset nào bị bỏ lại mà thiếu workspace. `remove` resolve workspace id từ quy ước, xoá preset (validate tồn tại và quyền ghi), rồi gỡ đăng ký workspace, vẫn giữ lại file. `list` và `read` chiếu từng preset kèm id workspace đã cấp phát, hoặc `''` khi chưa có.

Mỗi method nhận một object `request` duy nhất nên wire của gateway đồng nhất `{ args: { request: {...} } }`.

## Sai lệch return-shape so với fork

Bản cũ trả về projection workspace đầy đủ đóng dấu lên preset. Controller này chỉ trả các id mà consumer Odoo cần và suy ra liên kết bằng quy ước thay vì bằng trường lưu sẵn:

- `copy` trả `{ agentPreset: string; workspace: string }` (id preset mới và id workspace của nó).
- Các dòng `list` mang `workspaceId: string` (`''` khi chưa cấp phát), `broken` là boolean (lý do `broken` của roster được chiếu thành cờ), cùng `trust`/`isDefault`/`name`/`description` từ roster.
- `read` trả `{ agentPreset, workspaceId, content, name?, description? }`.
- `remove` trả `void`.

Module Odoo phải đọc `workspace_id` từ trường `workspace` của `copy` và từ `workspaceId` của `list`/`read`, và coi `''` là "chưa cấp phát workspace".

## Hệ quả

Namespace `presetWorkspace` chỉ được overlay MTIL mount; profile Web xuất xưởng không đổi. Một preset được copy bên ngoài controller này (qua `agentPresets/copy` thuần) không có workspace và đọc lại `workspaceId: ''` cho tới khi được cấp phát tại đường dẫn quy ước.

## Kiểm chứng

- `npx tsc -b packages/api/preset-workspace-controller/tsconfig.json` — sạch.
- `npx vitest run packages/api/preset-workspace-controller/tests` — 22 test: quy tắc đường dẫn thuần (resolve root, an toàn id, ánh xạ) và controller compose trên `WorkspaceRegistry` thật cùng một roster double (copy cấp phát, cấp phát lỗi thì roll back, remove xoá cả hai, list/read mang id workspace, và mỗi lỗi ánh xạ về code ổn định của nó).
- Hoãn lại cho harness đang chạy: xác nhận `ctx.agentPresets` và `ctx.workspaceRegistry` đều resolve được trên host plane của composition MTIL/web đã lắp, và client `ctx.remote.presetWorkspace` sinh ra gọi được đầu-cuối.
