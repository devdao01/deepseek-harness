# @deepseek-ai/dsh-agent-default-model

[English](README.md) | 中文

Giá trị mặc định khi triển khai này được điểm vào sử dụng khi tạo một Agent mà phiên chưa có lựa chọn model ở cấp phiên. `AgentDefaultModelConfig` cung cấp `ctx.agentDefaultModel`; các điểm vào trực tiếp như `dsh --profile headless` và các điểm vào do Host hỗ trợ như ApiProxy đọc cùng một service, thay vì mỗi bên giữ riêng một cặp mặc định provider/model song song.

Cấu hình plugin phải cung cấp `{ provider, model }`. Mục cấu hình tổ hợp này tạo thành lớp nền cho phân mục `agent-default-model` trong Settings; provider cấu hình settings được mount sẽ chồng lựa chọn của người dùng lên trên, thay đổi sẽ hiển thị ở lần gọi `currentSelection()` tiếp theo. `reasoningEffort` thuộc phân mục Settings này, nhưng cố tình không thuộc cấu hình plugin: lựa chọn được lưu đầy đủ phải có khả năng xóa giá trị cũ khi model được chọn tiếp theo không có cường độ reasoning (suy luận), trong khi giá trị cấu hình tổ hợp sẽ lại được kế thừa.

- `ctx.agentDefaultModel.currentSelection()` trả về một lựa chọn `{ provider, model, reasoningEffort? }` độc lập, dùng cho Agent vừa được tạo.
- `ctx.agentDefaultModel.saveSelection(selection)` lưu lựa chọn đầy đủ của người dùng. Khi chưa mount provider settings, lệnh gọi này không làm gì cả, mục cấu hình tổ hợp vẫn là giá trị hiện tại.

Service này không kiểm tra tư cách thành viên trong danh mục. Provider định tuyến có thể phục vụ các model chưa được công bố trong danh mục; bên tiêu thụ thực sự gửi yêu cầu model chịu trách nhiệm chẩn đoán tính khả dụng.

## Trải nghiệm model

Ảnh hưởng gián tiếp thông qua lựa chọn provider/model cung cấp cho điểm vào; yêu cầu hiển thị với model do việc lắp ráp yêu cầu và adapter chịu trách nhiệm.

#### Ảnh hưởng KV Cache

Thay đổi giá trị mặc định chỉ ảnh hưởng đến các Agent sau đó phân giải lựa chọn từ giá trị mặc định này. Các phiên hiện có mà log yêu cầu đã ghi nhận lựa chọn thì vẫn dùng theo lựa chọn đó, do đó service này không làm mất hiệu lực tiền tố đã thiết lập của chúng.

## Hạn chế đã biết và việc còn hoãn lại

- Service này chỉ sở hữu một giá trị mặc định ở cấp tiến trình; lựa chọn của từng phiên vẫn do điểm vào chịu trách nhiệm.
- Khi chưa mount provider settings, `saveSelection()` không thể giữ lại lựa chọn cho các Agent sau này sử dụng.
