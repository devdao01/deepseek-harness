# dsh-session-checkpoint-policy

[English](README.md) | Tiếng Việt

Chính sách bền vững theo ngữ nghĩa cho agent (tác tử) đã được lưu trữ. Nó tạo checkpoint cho phiên theo kiểu event sourcing trước khi adapter mô hình nhận yêu cầu, trước khi phần thân của tool ở tầng ngoài cùng có thể tạo tác dụng phụ ra bên ngoài, và tại mỗi biên `agent/pre-step`, sao cho phản hồi trước đó cùng các kết quả tool đã sắp thứ tự đều đã được lưu trữ trước yêu cầu kế tiếp.

## Plugin (namespace: `session-checkpoint-policy`)

Plugin dạng hàm, không cần cấu hình này tiêu thụ `ctx.sessions`, `ctx.llm`, `ctx.tools` và sự hiện diện của `ctx.sessionPersistence`. Hãy nạp nó cùng với một backend lưu trữ:

```yaml
- id: session-persistence
  name: '@deepseek-ai/dsh-session-persistence-jsonl'

- id: session-checkpoints
  name: '@deepseek-ai/dsh-session-checkpoint-policy'
```

Việc lưu trữ và việc lập lịch checkpoint được tách thành hai plugin Cordis riêng biệt một cách có chủ đích. Backend lưu trữ khởi động các lô nền có giới hạn cho `session/event` được ghi thêm, và biến mỗi `session/flush` được yêu cầu thành một rào chắn dừng hẳn tức thời; chính sách này chọn thời điểm yêu cầu, phân phối tool và rào chắn bước kế tiếp. Nạp backend mà không có chính sách này vẫn hợp lệ, nhưng sự cố có thể làm mất các sự kiện vẫn nằm trong cửa sổ xử lý lô đã cấu hình, hoặc các lần ghi chưa hoàn tất. Ứng dụng lưu trữ first-party và runtime gắn tường minh cả hai plugin; các triển khai chuyên biệt có thể cố ý bỏ qua hoặc thay thế chính sách.

Chính sách bọc `llm/stream` một cách trì hoãn, nên luồng phía dưới chỉ được dựng sau khi các sự kiện yêu cầu được đệm trong phiên đang hoạt động đã được lưu trữ. Nó bọc `tools/execute` sau các chính sách tiền thực thi và cơ chế bảo vệ; phần thân của tool ở tầng ngoài cùng chỉ chạy sau khi lời gọi đã ghi nhận được lưu trữ. Nếu việc hủy đến trong lúc đang chờ flush, lớp bọc trả về kết quả `ABORTED_BEFORE_DISPATCH` chuẩn tắc, không đi vào phần thân của tool. Việc phân phối tool lồng nhau tái sử dụng checkpoint của lời gọi mà mô hình nhìn thấy ở lớp ngoài. `agent/pre-step` lưu trữ lô phản hồi/kết quả trước đó trước khi phái sinh yêu cầu.

Tại biên mô hình và biên tool, khi checkpoint bị từ chối thì áp dụng nguyên tắc thất bại-thì-chặn: cả adapter lẫn phần thân tool ở tầng ngoài cùng đều không chạy. Checkpoint bị từ chối tại biên bước sẽ làm lượt (turn) thất bại trước khi một yêu cầu khác bắt đầu. Các checkpoint tool đồng thời dùng chung quy trình xả lưu trữ tuần tự của kho lưu trữ phiên, và không sinh ra số thứ tự trùng lặp.

## Trải nghiệm mô hình

### Lời gọi bị gián đoạn

#### Nội dung mô hình nhìn thấy

Plugin không thêm prompt hay schema của tool. Một sự cố nghiêm trọng xảy ra sau checkpoint của tool nhưng trước kết quả sẽ để lại một lời gọi không có cặp tương ứng ở dạng bền vững; việc khôi phục phiên sẽ cung cấp kết quả `TOOL_OUTCOME_UNKNOWN` mà mô hình nhìn thấy, do `dsh-session` chịu trách nhiệm. Thông điệp này cho phép thử lại các công việc chỉ đọc hoặc idempotent, và yêu cầu xác minh trạng thái hoặc xin xác nhận của người dùng đối với các lời gọi có thể gây tác dụng phụ.

#### Ảnh hưởng tới token

Checkpoint thành công không thêm token và không thay đổi yêu cầu. Việc khôi phục thêm một thông điệp kết quả tool ngắn để cân bằng transcript (bản ghi hội thoại) bị gián đoạn.

#### Ảnh hưởng tới KV Cache

Kết quả sửa chữa được ghi thêm sau tiền tố có thể tái dùng, nên không làm mất hiệu lực các mục cache trước đó.

## Giới hạn đã biết và phần tạm hoãn

- Chính sách này ghi lại ý định thực thi theo cách bền vững, chứ không cung cấp bảo đảm exactly-once cho tác dụng phụ nói chung. Khi nhà cung cấp hỗ trợ, các tool có tác dụng phụ nên chuyển tiếp `exec.callId` làm khóa idempotent.
- Các sự kiện `assistant/chunk` dạng stream không có checkpoint theo từng mảnh. Các lô nền có giới hạn thường lưu trữ chúng trước checkpoint ngữ nghĩa kế tiếp, nhưng sự cố nghiêm trọng vẫn có thể làm mất lô đang nằm trong bộ nhớ hoặc các lần ghi chưa hoàn tất.
- Khi một lời gọi đã lưu trữ không có kết quả, không thể chứng minh tác dụng phụ ra bên ngoài của nó đã hoàn tất hay chưa. Vì vậy, việc khôi phục ghi nhận kết quả không xác định thay vì tự động thử lại.
