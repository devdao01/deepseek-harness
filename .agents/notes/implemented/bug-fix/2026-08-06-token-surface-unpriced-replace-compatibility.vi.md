# Agent Note: Thay thế bề mặt chưa định giá gấp lại một cách trung tính

Status: implemented

[English](2026-08-06-token-surface-unpriced-replace-compatibility.md) | Tiếng Việt

## Vấn đề

Hai hình chiếu `contextPressure` và `contextBreakdown` chỉ duy trì một tổng token bề mặt lũy kế cuộn, cộng thêm tối đa một khai báo giá bóng (shadow price) đang chờ quyết toán, nhờ đó checkpoint bền vững của chúng giữ O(1) trong suốt vòng đời phiên. Bên sản xuất thay thế hiện tại sẽ nối thêm một sự kiện đo lường `compaction/summary` hoặc `compaction/prune` ngay sát trước lần thay thế; `shadowedTokenCount` của nó định giá chính xác cho đoạn bị thay thế, và `foldSurfaceProjection` quy đổi giá trị đó thành một delta có dấu.

Các phiên được ghi trước khi giao thức giá bóng ra đời, có nhật ký chứa những lần thay thế không có sự kiện đo lường liền kề. Trạng thái O(1) không thể dựng lại giá của đoạn bị thay thế, và trước đây việc gấp lại coi mỗi lần thay thế chưa định giá như vậy là vi phạm quy ước rồi ném lỗi, khiến việc phát lại các phiên như vậy bị ngắt ngay tại lần thay thế đầu tiên (`token surface: replace at seq … has no adjacent shadow price`), phiên từ đó không bao giờ mở lại được.

## Quyết định

Lần thay thế đến mà không có khai báo nào đã sẵn sàng sẽ được gấp lại theo cách trung tính về giá: `foldSurfaceProjection` trả về `deltaTokens: 0`, tương đương với việc định giá đoạn bị thay thế đúng bằng chi phí của nội dung thay thế nó, rồi việc phát lại tiếp tục. Các khai báo bị lỗi thời do có sự kiện chen vào giữa cũng đi theo cùng đường trung tính này, vì việc gấp lại không thể phân biệt nó với một nhật ký chưa từng được đo lường.

Khai báo đã sẵn sàng nhưng trỏ vào **một đoạn khác** vẫn ném lỗi. Trong trường hợp này, sự kiện đo lường thực sự liền kề, cho thấy bên sản xuất đã ghi các sự kiện liền kề mâu thuẫn nhau: đây là vi phạm quy ước giá bóng hiện hành, không phải dữ liệu lịch sử, và phải thất bại rõ ràng, không được để tổng số âm thầm trôi lệch.

Cả hai hình chiếu dùng chung một phép gấp, do đó cả hai đều không thêm trường trạng thái mới, cũng không nâng `stateVersion`. `surface-fold.ts` và `ctx.tokenMeter.measure()` không bị ảnh hưởng: chúng giữ bề mặt đã được định giá theo từng node, vốn dĩ không cần đến giao thức khai báo.

## Phương án thay thế

**Giữ nguyên việc ném lỗi.** Bảo toàn quy ước sản xuất nghiêm ngặt, nhưng mọi phiên trước khi có giao thức sẽ vĩnh viễn không phát lại được, trong khi hình chiếu vốn dĩ tồn tại để phục vụ việc phát lại.

**Lưu bền vững toàn bộ bề mặt đã định giá trong trạng thái hình chiếu.** Có thể định giá chính xác cho bất kỳ đoạn bị thay thế nào, nhưng checkpoint sẽ tăng thêm một node cho mỗi tin nhắn model có thể nhìn thấy, tăng trưởng không giới hạn, phá vỡ đúng ràng buộc O(1) mà giao thức giá bóng cần giữ (xem [Agent Note về đồng hồ ngữ cảnh](2026-08-05-context-meter-blind-to-compaction.md)).

## Ảnh hưởng

Việc thay thế chưa định giá giữ nguyên tổng số thay vì thu nhỏ, nên các đoạn đã bị nén (compaction) vẫn được tính vào: `contextBreakdown.messageTokens` giữ lại phần bị tính thừa này; `contextPressure.projectedTokens` sẽ ước tính quá cao tỷ lệ sử dụng, nhưng chỉ kéo dài đến mẫu sử dụng tiếp theo được neo lại, vì con số này theo dõi mức tăng/giảm kể từ mẫu, chứ không phải mức tuyệt đối. Hướng sai lệch là an toàn: ước tính quá cao tỷ lệ sử dụng nhiều lắm chỉ dẫn đến một lần nén sớm hơn.

Việc thất bại rõ ràng vẫn được giữ ở nơi nó còn ý nghĩa: khai báo liền kề nhưng lệch đoạn là lỗi của bên sản xuất hiện hành, vẫn sẽ ném lỗi.

## Kiểm thử

`packages/llm/token-meter/tests/context-breakdown-projection.spec.ts` chốt việc gấp trung tính cho cả trường hợp không có khai báo lẫn khai báo đã lỗi thời, việc ném lỗi khi khai báo lệch đoạn, và việc định giá chính xác khi khai báo khớp. `packages/llm/token-meter/tests/token-usage-projection.spec.ts` chốt việc `contextPressure` giữ nguyên trước và sau một lần thay thế chưa định giá.
