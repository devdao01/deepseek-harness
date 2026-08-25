# Agent Note: Loại bỏ các phương thức vô dụng khỏi seam persistence

Status: implemented
Archived: 2026-07-26

[English](2026-06-20-prune-dead-seam-methods.md) | Tiếng Việt

> **Ghi chú triển khai:** Chỉ gỡ bỏ `SessionPersistence.has()` và `.delete()`. `BashExecutor.get()` và `.list()` vẫn được giữ lại, vì việc xóa bề mặt tra cứu một dòng của chúng sẽ buộc bên tiêu thụ phải bổ sung đáng kể cơ chế theo dõi hoàn tất. Việc branding id của chúng thuộc trách nhiệm của [Agent Note về branded id (bản ghi quyết định của agent)](../architecture/2026-06-20-branded-ids.md).

## Vấn đề

Capability seam ([interface / implementation / consumer](../architecture/2026-06-13-capability-seams.md)) mang theo những phương thức trừu tượng mà không bên tiêu thụ nào gọi tới. Seam tồn tại để implementation và consumer tiến hóa độc lập với nhau — nhưng một phương thức mà không consumer nào lập trình dựa trên nó thì không phải là seam, mà là một bề mặt suy đoán mà mọi implementation vẫn phải hiện thực và kiểm thử.

### `SessionPersistence.has()` và `.delete()`

Dịch vụ trừu tượng này khai báo thêm nhiều thao tác ngoài create/append: `load`, `list`, `has`, `delete`. Các consumer trong môi trường production dùng `load()` và `list()` để khôi phục và khám phá phiên, còn không lời gọi production nào sử dụng `has()` hay `delete()` của persistence. Các lời gọi trên tập hợp trong bộ nhớ có tên tương tự nằm trong mã protocol và UI không liên quan gì tới chuyện này. Bên gọi duy nhất của `has`/`delete` trên persistence là bộ kiểm thử contract và spec của từng backend.

`has()` không chỉ không được dùng: trong khi `loadStored(id)` đã đảm nhiệm việc kiểm tra sự tồn tại trên persistence, nó vẫn thêm vào bộ điều phối một phép dò đã-theo-dõi/chưa-theo-dõi cùng một nhánh contract. Còn `delete()` kéo theo hook backend `deleteStored` mà mọi backend đều buộc phải hiện thực. Đây thuộc cùng một mẫu với [việc bỏ summary phiên có thể thay đổi](2026-06-19-drop-mutable-session-summary.md): kiểm thử contract bao phủ cả hai, nhưng mã đã phát hành không bao giờ hỏi "phiên này đã được lưu bền chưa?" hay xóa một phiên nào đó.

## Quyết định

Những phương thức không consumer nào dùng đã bị gỡ — khỏi seam trừu tượng, khỏi implementation, và khỏi các bộ kiểm thử contract/spec chỉ tồn tại để bao phủ chúng:

- `SessionPersistence.has()` / `.delete()` đã bị gỡ: khai báo trừu tượng, `has`/`delete`/`deleteCore` của bộ điều phối, và hook `PersistenceBackend.deleteStored` đều biến mất (cả jsonl lẫn sqlite chỉ hiện thực `deleteStored` để thỏa mãn hook đó, nên các hiện thực này cũng bị gỡ theo). Backend thuộc thiết kế [hai backend](../architecture/2026-06-14-session-persistence.md), các khía cạnh khác nằm ngoài phạm vi; việc xóa phần hiện thực mà chúng viết cho một hook không có consumer là một phần của việc xóa hook, chứ không phải thiết kế lại backend.
- Toàn bộ tham chiếu trong tài liệu và chú thích mã nguồn đã được cập nhật theo contract bốn phương thức còn lại, chỉ có `list()` — không chỉ các cách viết chữ `has(`/`delete(`/`deleteStored`, mà còn cả liên kết JSDoc `{@link has}`/`{@link delete}` và con số đếm "sáu phương thức công khai" — trải trên README của seam và backend, [docs/architecture.md](../../../../docs/architecture.md), Agent Note về [session persistence](../architecture/2026-06-14-session-persistence.md) và [bộ điều phối ghi](../architecture/2026-06-18-shared-persistence-write-coordinator.md), cùng JSDoc của bộ điều phối/backend.

## Các phương án từng cân nhắc

### Vì sao không giữ lại với lý do «seam nên đầy đủ»?

Trực giác «seam persistence lẽ ra phải cung cấp delete» là có thật — nhưng nó chính là kiểu đầy đủ mang tính đầu cơ mà giai đoạn tiền phát hành cảnh giác ([AGENTS.md](../../../../AGENTS.md): tối ưu cho nền móng đúng đắn, chứ không phải cho những bên gọi giả định mà bạn không sở hữu). `delete()` chỉ là một phương thức, khi nào consumer thực sự cần thì thêm lại: một UI quản lý phiên cho phép xóa các phiên cũ sẽ cần tới nó — lúc đó hãy thêm, và thiết kế dựa trên nhu cầu thật của UI đó (xóa mềm? cascade? xác nhận?), thay vì đoán ngay bây giờ.

Thêm lại một phương thức seam khi đã có consumer đang dùng thì chi phí thấp và thiết kế tốt hơn, vì consumer neo giữ contract. Giữ nó lại khi không ai dùng nghĩa là mọi implementation (và mọi backend trong tương lai) đều phải hiện thực và kiểm thử một phương thức chẳng có tác dụng thực tế nào.

## Kiểm chứng

`has`/`delete`/`deleteStored` đã được gỡ khỏi seam persistence, các implementation và bộ kiểm thử contract, không phát sinh export vô dụng mới; các thao tác còn lại (`create`/`append`/`load`/`list`) không bị ảnh hưởng, hành vi truy vấn phiên dựa trên persistence và khôi phục sau sự cố hoàn toàn nhất quán; README của seam và `docs/architecture.md` chỉ liệt kê các phương thức còn lại.

## Hệ quả

- **`delete()` là thao tác mà sản phẩm rốt cuộc sẽ cần.** Đúng vậy, nhưng "rốt cuộc" mới là mấu chốt. Xóa bây giờ, rồi thêm lại trong tương lai dựa trên consumer thật, nghiêm ngặt vẫn tốt hơn phát hành một contract phỏng đoán. Hai backend mỗi bên bớt được một hiện thực `deleteStored`, đây là thay đổi giới hạn trong các package nằm ngoài phạm vi lần này.
- **Ghép nối thấp.** Việc gỡ bỏ chỉ giới hạn ở seam persistence + implementation + kiểm thử; không có tham chiếu xuyên package nào tới các phương thức bị gỡ, nên ngoài tài liệu ra không có hiệu ứng lan tỏa.

Quy mô không lớn, nhưng nó đưa seam từ chỗ «implementation phải cung cấp gì đó cho không ai cả» trở lại thành «đúng những gì consumer đang dùng».
