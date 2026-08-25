# Agent Note: Danh mục sự kiện và dịch vụ Cordis được sinh tự động

Status: implemented
Archived: 2026-08-07

[English](2026-06-20-generated-cordis-catalog.md) | 中文

## Vấn đề

Tác giả plugin cần hai loại thông tin tham chiếu mà trước đây không có tài liệu đơn lẻ nào cung cấp đầy đủ: mọi **sự kiện** Cordis mà họ có thể lắng nghe (kèm chữ ký chính xác và mô hình phân phối), và mọi **dịch vụ** `ctx.<key>` mà họ có thể gọi (kèm interface chính xác). Thông tin liên quan tồn tại nhưng nằm rải rác: một *bảng* phân loại sự kiện được bảo trì thủ công trong `docs/architecture.md` (tên + mô tả hành văn Mode/Purpose, được `verify-event-taxonomy` kiểm tra tập hợp tên), một bảng ánh xạ dịch vụ (8 dòng mô tả vai trò), và bản thân khai báo `interface Events` / `interface Context`. Bảng phân loại còn có một điểm mù: nó không thể bắt được các sự kiện *chưa được ghi lại* hoàn toàn mới — bộ kiểm tra tập hợp tên chỉ kiểm tra các tên đã có ở cả hai phía.

Đây là phần bổ sung theo chiều kết nối cho [danh mục cấu trúc dữ liệu cốt lõi](../../../../docs/core-data-structures/core.md) ([Agent Note của nó](2026-06-20-core-data-structures-catalog.md)): danh mục trước đánh mục *cấu trúc dữ liệu* được truyền qua vòng lặp (dán thủ công đã xác thực), còn tài liệu này đánh mục *sự kiện và dịch vụ* truyền chúng.

## Quyết định

Sinh danh mục từ source, thay thế cách bảng bảo trì thủ công và kiểm tra tập con.

`scripts/gen-cordis-catalog.ts` dùng TypeScript compiler API, sinh tài liệu tham chiếu sự kiện và dịch vụ riêng dựa trên khai báo và JSDoc trong source. Sự kiện bao gồm mô hình phân phối và JSDoc thành viên gốc; dịch vụ bao gồm chữ ký công khai và JSDoc của từng method. Chế độ `--write` và `--check` mang tính xác định biến hai trang này thành sản phẩm sinh tự động, và được `doc-sync` cưỡng chế kiểm tra độ mới.

Xây dựng danh mục hoàn toàn bằng sinh tự động là đúng đắn ở đây, vì codebase đủ chuẩn mực, AST chứa toàn bộ sự thật: mỗi tên sự kiện/dịch vụ đều là chuỗi literal, có thể ánh xạ khứ hồi về khai báo tĩnh — không tồn tại sự kiện đặt tên động, cũng không tồn tại dịch vụ chỉ có tại runtime. Do đó tài liệu được sinh ra không thể sai, và về mặt cấu trúc loại bỏ khoảng trống sự kiện chưa được ghi lại (generator liệt kê source, không kiểm tra tập con viết tay).

Các lựa chọn cụ thể:

- **Thẻ `@mode`, kiểm tra chéo.** JSDoc của mỗi sự kiện harness mang thẻ `@mode emit|waterfall|parallel|serial` rõ ràng; thiếu thẻ thì generator báo lỗi trực tiếp. Khi hình dạng chữ ký mang tính quyết định — tham số cuối `next: () => …` về mặt cấu trúc chính là waterfall (sự kiện dạng thác nước) — generator khẳng định thẻ khớp với nó, mâu thuẫn thì báo lỗi trực tiếp. Sự khác biệt giữa emit/parallel/serial không thể nhìn thấy về mặt cấu trúc (`session/flush` trả về `Promise<void> | void` và không có `next`, checkpoint có thứ tự `agent/pre-step` cũng vậy), nên tin tưởng thẻ. Quy tắc viết xem [AGENTS.md](../../../../AGENTS.md).
- **Phạm vi theo lớp.** Lớp harness (8 dịch vụ `@deepseek-ai/dsh-*` và sự kiện của chúng) được render đầy đủ từ source. Lớp kế thừa (`ctx.on/emit/effect/provide/…` của cordis-core + sự kiện `internal/*` + loader/hmr/timer) là source vendor phiên bản cố định mà plugin cũng nhìn thấy được; nó được render gọn từ một bảng bảo trì thủ công trong generator (tên + mô tả một dòng + vị trí source), thay vì duyệt AST vendor. Lý do là `Context` của cordis-core trộn lẫn thành viên ctx thực với các trường không phải dịch vụ (`root`, `baseUrl`, `logger`), và interface vendor chỉ thay đổi khi có đồng bộ vendor cố ý.
- **Liên kết chéo đến danh mục cấu trúc dữ liệu.** Mỗi tên kiểu do repo sở hữu trong chữ ký (`GenerateOptions`, `StreamChunk`, `ToolDefinition`……) đều được liên kết đến trang danh mục cấu trúc dữ liệu cốt lõi chính của nó qua một ánh xạ bảo trì thủ công. Duyệt AST áp dụng chiến lược mặc định từ chối cho phép: mỗi tham số, ràng buộc/giá trị mặc định generic và tham chiếu kiểu trả về đều phải đã được ánh xạ, là tham số kiểu của chính chữ ký, là kiểu cơ bản TypeScript/Cordis được chỉ định, hoặc có ngoại lệ được chỉ định cùng quyền sở hữu tài liệu không phải danh mục của nó. Vi phạm được tổng hợp báo cáo kèm vị trí source, và chỉ rõ danh sách quyền sở hữu tương ứng. Ánh xạ này không tái sử dụng `type-equiv.manifest.json`, vì tệp sau ghi ký hiệu `…Map`, còn chữ ký tham chiếu tên union dẫn xuất, và một số ký hiệu được liệt kê ở nhiều trang.
- **Hàng rào chuyên dụng.** Khối chữ ký dùng info string ` ```ts cordis-catalog `, và đặt JSDoc gốc của sự kiện hoặc method công khai ngay trước khai báo của nó. `doc-typecheck` nhận diện và bỏ qua các đoạn trần này, loại chúng khỏi tỷ lệ opt-out — giống cách xử lý khối `type-equiv`.

Quyết định này **thay thế** nửa phân loại sự kiện trong [cưỡng chế doc-sync](../../archived/process/2026-06-11-doc-sync-enforcement.md): `verify-event-taxonomy` và bảng `docs/architecture.md` của nó nghỉ hưu (tiêu đề của architecture.md giữ nguyên, phần thân đổi sang trỏ đến danh mục; bảng vai trò ánh xạ dịch vụ giữ lại như hành văn thủ công). doc-typecheck, verify-md-wrap, verify-md-links và verify-type-equiv không bị ảnh hưởng.

## Các phương án thay thế từng cân nhắc

- **Kiểm tra thay vì sinh (điều mà bộ kiểm tra phân loại đã nghỉ hưu từng làm)**: đảo ngược chiến lược *chỉ với mặt tham chiếu này*. Dữ liệu ở đây có thể lấy đầy đủ bằng máy móc, nên sinh tự động mạnh hơn hẳn kiểm tra tập hợp tên trên bảng thủ công (chữ ký đầy đủ, không trôi dạt, bắt được sự kiện chưa ghi lại).
- **Duyệt AST vendor để lấy lớp kế thừa**: bị từ chối, chuyển sang dùng bảng bảo trì thủ công. `Context` của cordis-core trộn lẫn thành viên ctx thực với trường không phải dịch vụ, và interface vendor cố định chỉ thay đổi khi đồng bộ có chủ đích.
- **Tái sử dụng `type-equiv.manifest.json` làm ánh xạ liên kết chéo chữ ký**: bị từ chối, chuyển sang dùng hằng số bảo trì thủ công đầy đủ và kiểm tra override mặc định từ chối cho phép. Manifest ghi ký hiệu `…Map`, còn chữ ký tham chiếu tên union dẫn xuất, và một số ký hiệu được liệt kê ở nhiều trang. Ánh xạ rõ ràng khiến mỗi đích render và mỗi ngoại lệ không phải danh mục trở thành một quyết định có thể review.

## Hệ quả

- Danh mục sẽ không trôi dạt: thay đổi source chưa được phản ánh trong file đã commit sẽ khiến `doc-sync` và `verify-cordis-catalog` trong CI fail. Sự kiện mới thiếu thẻ `@mode`, thẻ mâu thuẫn với chữ ký của nó, hoặc kiểu chữ ký chưa được phân loại, đều khiến generator fail trực tiếp.
- Sự kiện và hợp đồng method dịch vụ chỉ có một quyền sở hữu — JSDoc tại nơi khai báo. Danh mục sẽ lặp lại JSDoc gốc đó trong khối chữ ký được sinh, và dùng phần mô tả của nó làm nội dung mục, nên tài liệu source mỏng chỉ sinh ra mục danh mục mỏng.
- Lớp kế thừa là bản tóm tắt thủ công, nên nếu đồng bộ vendor thêm hoặc đổi tên sự kiện cordis-core hoặc thành viên `ctx`, cần sửa đồng thời bảng bảo trì thủ công trong `gen-cordis-catalog.ts`. Đây là cái giá có chủ đích của việc không duyệt source vendor phiên bản cố định; nó hiếm khi thay đổi, và được đánh dấu rõ ràng trong generator.
- `verify-event-taxonomy.ts` đã bị xóa, bảng sự kiện của `docs/architecture.md` cũng đã bị gỡ; người trước đây liên kết đến dòng bảng cụ thể giờ sẽ rơi vào danh mục sinh tự động.
