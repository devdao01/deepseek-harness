# @deepseek-ai/dsh-commands

[English](README.md) | 中文

Registry lệnh hướng tới người dùng do plugin chịu trách nhiệm, được các adapter UI tương tác sử dụng. [Agent Note về đăng ký lệnh plugin](../../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md) định nghĩa ranh giới và quy ước điều phối của nó.

## Quy ước service

`ctx.commands.register(definition)` đăng ký một tên lệnh viết thường, mô tả, gợi ý đầu vào phi cấu trúc tùy chọn, chính sách `recordInput` tùy chọn, và một handler có thể hủy. `recordInput` mặc định là true; nếu payload đã được giữ bởi một sự kiện lĩnh vực (domain event) có thẩm quyền của lệnh, lệnh đó sẽ đặt `recordInput` thành false, khiến `command/run` bỏ qua `args`, tránh ghi lặp đầu vào. Mỗi lệnh đã đăng ký đều khả dụng cho mọi adapter lệnh đã được tổ hợp; plugin không tương thích với một triển khai cụ thể sẽ không đăng ký ở đây. Đăng ký trong ngữ cảnh thông thường có hiệu lực toàn cục. Các plugin sinh ra lệnh được gắn dưới `agent.ctx` sẽ khai báo injection `commands` của riêng chúng và tạo các định nghĩa giới hạn chính xác vào agent (tác tử) đó; định nghĩa này sẽ che khuất định nghĩa toàn cục cùng tên. Hình thái injection con này bảo toàn phạm vi agent, đồng thời không khiến agent loop (vòng lặp tác tử) cốt lõi phụ thuộc vào các service UI. Tên trùng lặp trong cùng một lớp sẽ khiến việc đăng ký thất bại. Mỗi disposer đều là disposer chính xác do Cordis effect trả về; khi đăng ký hoặc gỡ bỏ lệnh, hệ thống sẽ thông báo cho mỗi observer `commands/change`, cho phép các adapter đang chạy làm mới kết quả khám phá. Lỗi của observer sẽ được ghi log, không thể phủ quyết thay đổi registry cũng không thể chặn các observer tiếp theo chạy.

`list(agent)` trả về các descriptor bất biến được sắp xếp theo tên sau khi che khuất theo phạm vi ứng dụng. `find(agent, name)` trả về định nghĩa tương ứng. `execute(agent, line, signal)` sử dụng `parseCommand()`, và chỉ chạy các lệnh đã biết, trả về `CommandExecution` đã hoàn tất (kết quả đã chuẩn hóa cộng với `commandId` ghép cặp vòng đời); trả về `undefined` khi cú pháp không hợp lệ hoặc tên không xác định. Vòng đời của lệnh đã phân tích được ghi lại dưới dạng một cặp sự kiện chỉ-ghi-log trong session log của agent nhận: `command/run` (ghi trước khi vào handler, mang theo `commandId` mới sinh, tên có cấu trúc của parser, `CommandSource` phát khởi, và `args` (bỏ qua khi `recordInput` là false)) và `command/done` (ghi khi kết thúc, mang theo loại kết quả và văn bản nguyên trạng; kết quả thành công còn có thể trỏ tới một sự kiện lĩnh vực có thẩm quyền không phải lệnh trước đó thông qua `sourceEventSeq`; khi handler ném lỗi hoặc bị hủy sẽ kết thúc với `kind: 'error'`). Đầu vào không qua được vòng kiểm duyệt sẽ không ghi bất kỳ sự kiện nào. Cả hai đều được nối thêm trực tiếp và độc lập vào session của agent nhận: không có lượt (turn) nào bao bọc chúng, cơ chế lưu trữ bền vững sẽ xả các sự kiện này trong các checkpoint thông thường và khi hủy.

`parseCommand()` nhận diện dấu gạch chéo ở byte thứ 0, tên gồm chữ thường, chữ số, `_` hoặc `-`, và dạng tên theo sau ngay bởi kết thúc đầu vào hoặc khoảng trắng. Nó trả về mỗi byte sau tên dưới dạng `rawInput`, bao gồm cả khoảng trắng phân cách; bên tiêu thụ chịu trách nhiệm về cú pháp riêng của từng lệnh, chỉ được thực hiện chuẩn hóa mà cú pháp đó cho phép.

Handler trả về `success` hoặc `error`, có thể kèm văn bản UI. Nếu phần trình bày phong phú hơn được giữ bởi một sự kiện lĩnh vực trước đó, handler thành công còn có thể trả về `sourceEventSeq`; bất biến vòng đời yêu cầu tham chiếu này phải trỏ tới một sự kiện không phải lệnh trước đó trong cùng session. Adapter render trực tiếp kết quả, kết quả không bao giờ đi vào lịch sử mô hình. Registry không bao giờ ngầm gửi `rawInput` cho agent; bên sinh lệnh có thể sắp xếp công việc hiển thị cho mô hình một cách tường minh thông qua `Agent` nhận lệnh, khi đó bên sinh này chịu trách nhiệm về quy ước tin nhắn phát sinh. Registry chờ đồng thời cả việc handler hoàn tất và tín hiệu hủy được cung cấp, tùy theo cái nào xảy ra trước, nhưng một handler không phản hồi hủy có thể tiếp tục tạo ra các tác dụng phụ bên ngoài của chính nó sau khi bên gọi đã ngừng chờ.

## Tổ hợp

Tổ hợp cơ bản `dsh` đi kèm sản phẩm sẽ gắn service này, Web client điều phối lệnh thông qua nó. Thân demo không UI và tự động hóa ACP (Agent Client Protocol) không cung cấp adapter lệnh. Các tổ hợp tương tác tùy chỉnh và bên sinh lệnh sẽ gắn tường minh `@deepseek-ai/dsh-commands`.

## Trải nghiệm mô hình

### Lệnh hướng trực tiếp tới người dùng

#### Những gì mô hình thấy

Bản thân registry không gửi bất cứ nội dung nào. Các lệnh gạch chéo đã biết được thực thi ở mặt phẳng lệnh UI, văn bản `CommandResult` của chúng không được gửi dưới dạng tin nhắn người dùng. Các adapter đã triển khai sẽ từ chối đầu vào lệnh gạch chéo không xác định, thay vì biến nó thành prompt cho mô hình. Bên sinh lệnh có thể sử dụng tường minh `Agent` nhận lệnh; ví dụ, [`dsh-plan-mode`](../../plan/plan-mode/README.md#model-and-human-interactions) sau khi chọn plan mode sẽ gửi phần tin nhắn tùy chọn trong `/plan [message]`.

#### Ảnh hưởng Token

Việc khám phá, thực thi lệnh và đầu ra UI không làm tăng token mô hình. Công việc agent do bên sinh lệnh sắp xếp tường minh có ảnh hưởng token tương đương với đầu vào agent tương ứng.

#### Ảnh hưởng KV Cache

Metadata registry, đầu vào lệnh và đầu ra trực tiếp không bao giờ đi vào request mô hình, cũng không ảnh hưởng đến cache của nó. Lĩnh vực nơi xảy ra thay đổi chịu trách nhiệm về mọi ảnh hưởng cache phát sinh sau đó.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ hỗ trợ đầu vào văn bản phi cấu trúc**: biểu mẫu, schema hoàn thiện và tham số có kiểu vẫn do từng lệnh tự phân tích.
- **Tác dụng phụ dùng hủy hợp tác**: sau khi hủy, việc điều phối sẽ ngừng chờ; handler phải tuân theo tín hiệu mới có thể dừng công việc đã đi vào hệ thống bên ngoài.
