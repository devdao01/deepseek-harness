# Agent Note: Xác thực operator server-to-server cho /api

Status: implemented

[English](2026-08-29-operator-auth-secret.md) | Tiếng Việt

## Vấn đề

Cổng `/api` bản 0.1.2 (`packages/client/connection/src/rpc-host.ts` `requestRejection`) chỉ cho một request đi qua khi nó vượt hàng rào tin cậy Host/Origin VÀ hoặc đã xác thực trình duyệt (cookie dsh-auth) HOẶC mang một request principal đã giải (`dsh_ticket` → `{ userId }`). Odoo là operator — bên gọi server-to-server, không có phiên trình duyệt và không có ticket theo người dùng. Trước đây nó gửi `Authorization: Bearer <token>` (cơ chế rc.7 mà 0.1.2 bỏ qua), nên sau hàng rào nó nhận 401. Launch token xoay vòng mỗi lần khởi động lại, nên không thể làm credential ổn định cho Odoo.

Operator phải giữ trạng thái **không có principal**: các controller gated theo operator (`sessionAccess.set/get` trong `packages/session/session-access/src/controller.ts`) chặn dựa trên `requestPrincipal.current() === undefined`, nên nếu nhận Odoo như một principal sẽ phá vỡ việc quản lý quyền truy cập.

## Quyết định

Thêm một **operator secret** chia sẻ ổn định để nhận một bên gọi không có principal. Nó chỉ thay thế bước auth 401; hàng rào Host/Origin (403) vẫn áp dụng trước, và operator không bao giờ nhận principal.

Hai seam, phản chiếu resolver ticket sẵn có:

1. **Service Connection** (`packages/client/connection/src/operator-auth.ts`): thêm `OperatorAuth { verify(request): boolean }` tùy chọn, merge khai báo vào `Context` và đọc qua `ctx.get('operatorAuth')` — y hệt `requestPrincipalResolver`. Trong handler `/api` (`src/index.ts`) biểu thức nhận request trở thành:

   ```ts
   const principal = ctx.get('requestPrincipalResolver')?.resolve(req)
   const operator = principal === undefined && ctx.get('operatorAuth')?.verify(req) === true
   const rejection = connection.requestRejection(req, principal !== undefined || operator)
   ```

   Nhánh operator vẫn gọi `requestPrincipal.run(principal, …)` với principal **undefined**, nên operator không có principal. Bản thân `requestRejection` không đổi (nó vốn đã nhận cờ boolean `hasPrincipal`).

2. **Plugin provider operator** (`packages/identity/user-ticket/src/operator.ts`, export mới `@deepseek-ai/dsh-user-ticket/operator`): schemastery `Config { secret?: string; header?: string = 'x-dsh-operator' }`. Secret rỗng/vắng ⇒ KHÔNG cung cấp `operatorAuth` (tắt operator auth). Ngược lại cung cấp `operatorAuth` mà `verify` đọc header cấu hình và so với secret bằng `crypto.timingSafeEqual` trên các buffer bằng độ dài (kiểm độ dài trước, vì `timingSafeEqual` ném lỗi khi độ dài khác nhau).

Secret đi trong **header** request `x-dsh-operator`, không bao giờ là cookie: trình duyệt không thể đặt nó cross-origin, và hàng rào đã chặn request cross-origin.

Overlay MTIL (`apps/cli/config/examples/mtil/cordis.yml`) mount `@deepseek-ai/dsh-user-ticket/operator` với `config.secret: !!js process.env.DSH_OPERATOR_SECRET ?? ''`; nếu không đặt ⇒ không mount, giữ nguyên hành vi single-tenant.

## Phía Odoo

Module Odoo (`apps/npei_agent_harness`) gửi `X-DSH-Operator: <secret>` đọc từ một `ir.config_parameter` mới `npei_agent_harness.operator_secret` (hiện ở Settings dưới trường "Operator Secret"). `harness_client._auth_headers` thêm header qua helper mới `_operator_headers`; hai đường proxy trong `controllers/main.py` (`rpc_proxy`, `download_proxy`) cũng gửi nó. Header cũ `Authorization: Bearer` được giữ song song — vô hại với 0.1.2 (bị bỏ qua), vẫn được một harness rc.7 chấp nhận.

## Hệ quả

- Deployment không đặt `DSH_OPERATOR_SECRET` sẽ không mount `operatorAuth`, nên bề mặt giống hệt hành vi trước thay đổi; secret chỉ nên cấu hình ở nơi Odoo cần.
- Operator secret và ticket secret độc lập: ticket định danh bên gọi trình duyệt theo người dùng; operator secret nhận tầng quản lý không có principal. Cả hai dùng chung một hàng rào tin cậy.

## Kiểm chứng

- `npx tsc -b packages/client/connection/tsconfig.host.json packages/identity/user-ticket/tsconfig.json` — sạch.
- `npx vitest run packages/client/connection packages/identity/user-ticket` — 155 test pass, gồm 11 test mới: seam connection (operator secret nhận request không principal → status 200 không có principal; 401 khi header sai/vắng; 403 khi hàng rào Host thất bại bất kể header; 401 khi không mount `operatorAuth`) và plugin operator (secret rỗng ⇒ không mount; so sánh timing-safe khớp/lệch/sai độ dài/header tùy biến).
- `npx tsx scripts/cordis-config-files.ts` (verify-cordis-config) — pass.
- `python -m py_compile` trên ba file Odoo đã sửa — sạch.
- Hoãn tới harness đang chạy: rằng bản composition MTIL lắp ráp giải được `operatorAuth` trên host plane và một lời gọi Odoo→harness thật có header được nhận đầu-cuối.
