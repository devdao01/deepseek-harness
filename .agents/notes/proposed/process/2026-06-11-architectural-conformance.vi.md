# Agent Note: Tính nhất quán kiến trúc — quy tắc phụ thuộc và bộ adapter

Status: proposed

[English](2026-06-11-architectural-conformance.md) | 中文

## Vấn đề

Hiện có hai đảm bảo kiến trúc chỉ tồn tại dưới dạng văn bản: (1) không có component nào phụ thuộc trực tiếp vào gói agent loop (vòng lặp tác tử) cụ thể ([cam kết microkernel](../../implemented/architecture/2026-06-11-microkernel-event-taxonomy.md)); (2) mỗi LlmAdapter đều tuân thủ đúng protocol phân mảnh (shard). Cả hai đều nên được thực thi bằng cơ chế ([nguyên tắc cổng chất lượng](../../implemented/process/2026-06-11-quality-gates.md)).

## Đề xuất

**dependency-cruiser** kết hợp các quy tắc sau:

- `packages/*` (trừ test và examples/ của chính agent-loop) bị cấm import `@deepseek-ai/dsh-agent-loop`.
- Cấm import sâu xuyên gói (đường dẫn `@deepseek-ai/dsh-*/src/...`) — chỉ cho phép dùng điểm vào công khai.
- Cấm phụ thuộc vòng tròn trong packages/.
- `vendor/*` bị cấm import từ `packages/*`.
- Phân tầng: dsh-llm không import gói dsh nào khác; dsh-session chỉ import dsh-llm; cứ thế tiếp tục (bảng phụ thuộc trong packages/README.md, được thực thi bắt buộc).

**Bộ nhất quán adapter** đặt tại dsh-llm (`@deepseek-ai/dsh-llm/conformance`): một bộ vitest có thể tái sử dụng, nhận tham số là factory adapter, dùng để khẳng định các convention của protocol phân mảnh, bao gồm: chỉ số bên trong mỗi block tăng đơn điệu, sau khi một chỉ số xuất hiện `block-end` sẽ không còn nhận delta nào nữa, xuất hiện đúng một `finish`, usage xuất hiện tối đa một lần, mỗi `tool-call-delta` đều mang theo id lời gọi, và phản hồi kịp thời với abort. Hiện tại trước mắt chạy trên mock; adapter DeepSeek V4 kế thừa bộ này ngay từ ngày đầu tiên. Cũng có thể tùy chọn cung cấp một lớp bọc `strictAdapter()` ở chế độ development, thực thi cùng các quy tắc đó lúc runtime khi bật cờ debug (kết hợp với [bất biến chế độ development](../../implemented/architecture/2026-06-11-dev-invariants-over-deep-readonly.md)).

## Kế hoạch

Trước tiên triển khai cấu hình dependency-cruiser và bước CI (khoảng một giờ công sức, đổi lấy đảm bảo vĩnh viễn); bộ nhất quán được triển khai cùng với test của bên tiêu thụ đầu tiên (nhắm vào MockAdapter), và là điều kiện tiên quyết cho giai đoạn adapter V4.

## Tiêu chí nghiệm thu

- dependency-cruiser chạy nhóm quy tắc trên trong CI; import vi phạm khiến build thất bại.
- Bộ nhất quán chạy trên adapter mock và hai adapter chính thức, gói adapter mới chỉ cần gọi bộ này với factory của riêng mình để kế thừa test.

## Rủi ro

Khi số lượng gói tăng lên, quy tắc dep-cruiser cần được bảo trì — quy tắc nên dựa trên pattern (`dsh-*`) thay vì liệt kê từng cái một.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
