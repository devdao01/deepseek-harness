# lsp/ - họ năng lực LSP

[English](README.md) | 中文

Seam (đường nối) năng lực máy chủ ngôn ngữ: LSP Service Definition (định nghĩa dịch vụ), nhà cung cấp stdio tổng quát, và tool `lsp` hướng đến model. Đây toàn bộ đều là các gói **sản phẩm**.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| `lsp/` | Service Definition (registry nhà cung cấp được tổ chức theo id gắn brand + ánh xạ phần mở rộng, chọn lựa theo từng truy vấn, từ vựng, `LspError`) | `ctx.lsp` |
| `lsp-stdio/` | Backend (hậu phương) stdio đa máy chủ tổng quát dựa trên `ctx.fs` và `ctx.subprocess` (JSON-RPC, mở tài liệu tạm thời tại thời điểm truy vấn) | (đăng ký nhà cung cấp trên `ctx.lsp`) |
| `tool-lsp/` | Tool `lsp` hướng đến model (bốn loại thao tác, tọa độ con trỏ UTF-16 bắt đầu từ 1) | (đăng ký vào `ctx.tools`) |

Service Definition nằm ở `lsp/lsp/`. Seam này chỉ công khai đúng bốn thao tác ngữ nghĩa: `goToDefinition`, `findReferences`, `goToImplementation`, `hover`, và không cung cấp lối thoát JSON-RPC tổng quát; do đó, việc thay thế nhà cung cấp sẽ không thay đổi cách model điều hướng theo request, cũng không để payload giao thức hay các sửa đổi chưa qua review lọt vào quy ước model. Nhà cung cấp đăng ký **năng lực** chứ không phải tool; `tool-lsp` là owner (chủ sở hữu) duy nhất của tên, schema, hướng dẫn prompt và cách hiển thị hướng tới model.

Nguyên lý thiết kế xem [Agent Note về seam năng lực LSP](../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md), trong đó cũng giải thích lý do tài liệu được mở tạm thời tại mỗi truy vấn, lý do host stdio dùng chung môi trường thực thi hệ thống tệp/tiến trình con, và lý do quyền sở hữu phần mở rộng loại trừ lẫn nhau trong cùng một runtime.

Tài liệu tham khảo hệ thống con — thao tác, tọa độ, request/kết quả, `LspError` — xem [docs/subsystems/lsp.md](../../docs/subsystems/lsp.md); căn cứ thiết kế xem [Agent Note về seam năng lực LSP](../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md).
