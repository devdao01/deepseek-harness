# Agent Note: Cưỡng chế Doc-sync

Status: implemented
Archived: 2026-07-26

[English](2026-06-11-doc-sync-enforcement.md) | 中文

## Vấn đề

AGENTS.md cam kết tài liệu đồng bộ chặt chẽ với code, nhưng cam kết này trước đây chỉ được kiểm tra bằng mắt người. Review từng hai lần phát hiện trôi dạt: một lần ví dụ trong sổ tay thực hành (cookbook) mâu thuẫn với chính sách kiểu dữ liệu, một lần README tham chiếu sai lệnh gọi `registerAdapter`. Tài liệu mất đồng bộ còn tệ hơn không có tài liệu; mà codebase này chủ yếu do agent (tác nhân) xây dựng, agent tuân thủ cổng gác (gate) đáng tin cậy hơn nhiều so với tuân thủ quy ước hành văn (cổng gác chất lượng máy móc). Có hai loại trôi dạt tài liệu có thể được kiểm tra bằng máy móc: khối code không còn biên dịch được, và bảng phân loại sự kiện trùng lặp với khai báo `interface Events`.

## Quyết định

Hai cổng gác, theo phong cách `scripts/` hiện có (tsx ESM, mỗi script một chức năng):

1. **`doc-typecheck`** trích xuất tất cả khối code có hàng rào (fenced) ` ```ts ` từ `README.md`, `docs/**` và `packages/*/README.md`, ghi vào một project tạm kế thừa `tsconfig.json` gốc, sau đó biên dịch bằng `tsc -b`. Project tạm tái sử dụng mapping `paths` của source và root project references, nên ví dụ tài liệu có thể thấy source, còn code vendor vẫn được kiểm tra dưới cấu hình tsconfig riêng của nó. Khối code cố ý là bản phác thảo có thể opt-out qua info string ` ```ts ignore-check ` rõ ràng; script sẽ báo cáo tỷ lệ opt-out, vượt quá một nửa thì fail, ngăn cơ chế miễn trừ này âm thầm trở thành thông lệ.
2. **`verify-event-taxonomy`** trích xuất tên sự kiện tương ứng từ khối `interface Events` trong `packages/*/src` và bảng phân loại trong `docs/architecture.md`, khẳng định hai tập hợp hoàn toàn khớp nhau. Chỉ kiểm tra, không sinh: bảng giữ cột Mode/Purpose viết tay, chỉ kiểm tra tập hợp tên. (Khi triển khai cổng gác này đã phát hiện ba sự kiện bị bảng bỏ sót: `tools/change`, `llm/adapter-change`, `system-prompt/change`.) **Đã bị thay thế**: bởi [danh mục Cordis sinh tự động](2026-06-20-generated-cordis-catalog.md). Cổng gác này và bảng `architecture.md` của nó đã nghỉ hưu, thay bằng `docs/cordis-catalog/events.md` + `docs/cordis-catalog/services.md` được sinh hoàn toàn cùng cổng gác độ mới `verify-cordis-catalog` của chúng. Các cổng gác khác trong Agent Note (bản ghi quyết định của agent) này (`doc-typecheck` và `verify-md-wrap` trong bản sửa đổi bên dưới) không bị ảnh hưởng.

Cả hai chạy qua script `doc-sync` dùng chung trong package.json; contributor gọi nó khi có thay đổi tài liệu liên quan, CI thì chạy kiểm tra đầy đủ. Quyết định [Git hook cục bộ nhanh](2026-07-22-fast-local-git-hooks.md) khiến loại công việc chọn theo bề mặt thay đổi này không vào hook commit và push.

**Sửa đổi (2026-06-17):** Cổng gác thứ ba **`verify-md-wrap`** sau đó được đưa vào `doc-sync`. Nó dùng `mdast-util-from-markdown` + phạm vi phân tích GFM cho mỗi file Markdown (`README.md`, `docs/**`, `packages/*/README.md`, cộng `AGENTS.md` / `packages/AGENTS.md`), fail nếu bất kỳ node `paragraph` nào trải dài nhiều dòng source, từ đó cưỡng chế quy tắc "một đoạn văn một dòng vật lý" trong docs/AGENTS.md. Cũng tuân theo nguyên tắc chỉ kiểm tra không sinh: nó báo cáo ngắt dòng cứng nhưng không bao giờ viết lại, nên không tạo nhiễu định dạng. `doc-sync` giờ gồm ba cổng gác.

## Các phương án thay thế từng cân nhắc

- **Báo cáo baseline API-extractor** ([đề xuất bị hoãn](../../proposed/process/2026-06-11-api-extractor-reports.md)): cố ý hoãn lại. Giá trị hạn chế với monorepo nội bộ mà reviewer đã có thể thấy trực tiếp diff source, lại phụ thuộc nặng và cấu hình phức tạp.
- **Sinh bảng phân loại từ source** thay vì chỉ kiểm tra tập con: bị từ chối, cơ chế nặng hơn bản thân vấn đề; bảng giữ cột Mode/Purpose viết tay cho đến khi [danh mục Cordis sinh tự động](2026-06-20-generated-cordis-catalog.md) hoàn toàn thay thế kiểm tra này.

## Hệ quả

- Trôi dạt tài liệu trong các danh mục có thể kiểm tra sẽ khiến `doc-sync` và CI fail trực tiếp, thay vì chờ người review phát hiện. Đây là ứng dụng cụ thể của nguyên tắc "cổng gác máy móc tốt hơn quy tắc hành văn".
- Để đoạn code tài liệu biên dịch được cần vài stub import/`declare`; tỷ lệ `ignore-check` phải giữ ở mức thấp, nếu không cổng gác trở nên hình thức (bộ bảo vệ tỷ lệ cưỡng chế ràng buộc này).
- Kiểm tra phân loại chỉ giới hạn ở tên — lỗi ở cột Mode hoặc Purpose vẫn cần review thủ công.
- Nếu package tương lai được phát hành ra ngoài, phương án báo cáo API vẫn có thể được cân nhắc lại.
