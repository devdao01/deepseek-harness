# Agent Note: Kiểm thử dựa trên thuộc tính cho mã dạng giao thức

Status: implemented

[English](2026-06-11-property-based-testing.md) | Tiếng Việt

> Bộ kiểm thử thuộc tính ngay lần chạy đầu tiên đã phát hiện một bug thật trong BlockAssembler với `block-end` trùng lặp.

## Vấn đề

Kiểm thử dựa trên ví dụ chỉ cố định được những trường hợp mà ta nghĩ ra. Lõi của harness là mã dạng giao thức: luồng phân mảnh, nhật ký sự kiện, chuyển đổi schema, điều phối hộp thư. Không gian đầu vào của những tình huống này mang tính tổ hợp, còn các bug thú vị thì nằm ẩn trong những chuỗi đan xen mà chưa ai từng viết ví dụ cho chúng. Bằng chứng: một bug về thứ tự trong quá trình lắp ráp block từng sống sót dưới mức bao phủ dòng 100% trên happy path. Bao phủ 100% theo từng tệp chứng minh rằng mọi dòng đều đã chạy qua, nhưng không chứng minh được mọi cách đan xen đều đúng.

## Quyết định

Mỗi package dạng giao thức có một tệp `tests/properties.spec.ts` riêng, chạy bằng `fast-check` (devDependency ở thư mục gốc). Bộ sinh dữ liệu được tinh chỉnh để tạo đầu vào *sát thực tế nhưng có tính đối kháng* (chứ không phải nhiễu đồng đều), và `numRuns` được khống chế sao cho tổng thời gian chạy bộ kiểm thử cục bộ thấp hơn nhiều so với khoảng 10 giây. Khi thất bại, seed có thể tái lập sẽ được in ra. (Job CI hằng đêm chạy với số vòng lặp gấp 100 lần chưa được triển khai — bộ kiểm thử thuộc tính chỉ chạy trong CI thông thường theo `push`/`pull_request`; job định kỳ với số vòng lặp cao vẫn là một hướng có thể làm tiếp.)

- **dsh-llm / BlockAssembler:** luồng phân mảnh tùy ý (hợp lệ + dị dạng: chỉ số trùng lặp, phân mảnh đến trễ, thiếu block-start). Bất biến: số lượng `blocks()` ≤ số chỉ số khác nhau đã gặp; việc tái lắp ráp là idempotent (`blocks()` ổn định giữa các lần gọi lặp lại, và `message().content` nhất quán với nó); `blocks()` không bao giờ ném ngoại lệ và chỉ sinh ra các nhãn khối nội dung hợp lệ; `finish` phản ánh phân mảnh `finish` cuối cùng, mặc định là `{kind:'stop'}` khi không có phân mảnh loại đó.
- **dsh-session:** nhật ký sự kiện tùy ý. Bất biến: `deriveMessages` mang tính tất định; phát lại từ seed cho kết quả nhất quán; seq tăng đơn điệu nghiêm ngặt; các sự kiện không phải message không ảnh hưởng tới lịch sử được suy ra; nội dung được suy ra tách rời khỏi nhật ký.
- **dsh-tools:** `ParameterSchemaSpec` tùy ý. Bất biến: `required` của JSON Schema bằng đúng tập khóa có `required:true` ở từng cấp; phép chuyển đổi là hàm toàn phần đối với mọi khai báo hợp lệ; **và được kiểm chứng kết hợp với [xác thực tham số lúc chạy](../architecture/2026-06-11-runtime-arg-validation.md)** — tham số sinh ra thỏa mãn spec thì vượt qua `validateArgs`, còn các phá hoại có chủ đích (xóa khóa bắt buộc, giá trị gốc không phải object) thì bị từ chối. Các ca kiểm thử tập trung bao phủ mọi kiểu giá trị gốc, nhánh chồng lấn khi chỉ khớp đúng một mục và khi không khớp mục nào, tính mở tường minh, giá trị mặc định nguyên thủy, cùng JSON bị mất mát. Điều này bịt kín rủi ro trôi lệch giữa trình biên dịch, validator và `InferArgs`.
- **dsh-agent-loop:** lịch gửi tùy ý, đấu nối với một adapter không bao giờ cạn, được điều khiển bằng tín hiệu settle `agent/status` (không dùng sleep theo đồng hồ treo tường). Bất biến: không mất message; số thứ tự lượt tăng nghiêm ngặt; các chuyển trạng thái luôn nằm trong máy trạng thái hợp lệ.

## Hệ quả

- Chất lượng bộ sinh dữ liệu chính là đòn bẩy giá trị — bộ sinh thiên về nhóm chỉ số nhỏ và chuỗi ngắn, khiến va chạm và đan xen xảy ra thường xuyên.
- **Nó đã mang lại kết quả:** luồng BlockAssembler đã phát hiện một bug thật — `block-end` trùng lặp tại cùng một chỉ số sẽ ghi đè lên block đã hoàn tất. Nay đã được sửa (ưu tiên lần đóng đầu tiên, nhất quán với quy tắc xử lý mục đến trễ hiện có) và bổ sung kiểm thử hồi quy riêng.
- Kiểm thử thuộc tính bị flake do timeout là một phát hiện, không nên xóa đi bằng cách thử lại. Kiểm thử thuộc tính của agent loop (vòng lặp tác tử) được thiết kế mang tính tất định (settle qua `agent/status`), nên treo tức là có khiếm khuyết thật.
- Kiểm thử thuộc tính bổ sung cho kiểm thử theo ví dụ chứ không thay thế; kiểm thử theo ví dụ cố định các nhánh cụ thể và phục vụ cổng kiểm soát bao phủ 100%.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
