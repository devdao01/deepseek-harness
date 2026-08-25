# Agent Note: Ủy thác có thể tiếp tục áp dụng ưu tiên chạy nền

Status: implemented

[English](2026-08-11-background-first-continuable-delegation.md) | Tiếng Việt

## Vấn đề

child có thể tiếp tục đã có sẵn id bền vững, lượt riêng, tin nhắn tiếp theo cũng như thông báo kết toán do manager phụ trách. Nếu coi `run_in_background` bị bỏ qua là tiền cảnh, mô hình sẽ phải lặp lại `true` trong mỗi lần gọi mới nhận được bộ vòng đời này. Cách đó cũng che mất phán đoán điều phối thực sự hữu ích: parent chỉ nên chờ khi bước hành động kế tiếp của parent cần kết quả của child.

Prompt `report` trong phạm vi child yêu cầu gửi một báo cáo cuối cùng tự chứa, còn [việc giao kết toán do manager phụ trách](2026-08-06-manager-owned-subagent-settlement-delivery.md) sẽ gửi độc lập kết quả kết thúc và tin nhắn thu dọn của lần chạy này. Vì vậy một child đã hoàn thành có thể đánh thức parent trước bằng báo cáo cuối cùng, rồi đánh thức thêm một lần nữa bằng thông báo kết toán. Điều phối ưu tiên chạy nền vẫn giữ lại cả hai lần giao: bàn giao do child viết vẫn là chỉ dẫn prompt bắt buộc, còn thông báo do manager sinh ra thì không phụ thuộc vào việc mô hình có tuân thủ chỉ dẫn hay không và phủ mọi đường kết thúc.

## Quyết định

`tool-subagent` phân giải `run_in_background` bị bỏ qua theo chiến lược vòng đời đã chọn. `backgroundMode: continuable` sẽ phân giải trường hợp bỏ qua thành chạy nền và trả về ngay id child bền vững; truyền tường minh `false` sẽ chọn tiền cảnh và chờ kết quả. `backgroundMode: one-shot` giữ nguyên hành vi mặc định tiền cảnh, vì đầu ra chạy nền của nó vẫn cần thu thập qua Task. `enableRunInBackground: false` vẫn bỏ qua tham số này, từ chối `true` bị ép truyền vào và chạy ở tiền cảnh. Hệ thống không thêm cấu hình lựa chọn mặc định thứ hai.

Văn bản hướng tới mô hình được phân chia trách nhiệm theo vị trí:

- mô tả công cụ nói rõ hành vi gọi, id bền vững, thông báo kết toán lúc chạy, việc tiếp tục hội thoại qua `send_message`, cùng cách ghi đè tiền cảnh tường minh;
- phần mô tả tham số `run_in_background` nói rõ giá trị mặc định của vòng đời cụ thể cũng như khi nào nên ghi đè;
- section prompt hệ thống `tool:<toolName>` sẽ báo cho mô hình biết có thể khởi động đồng thời các ủy thác độc lập với nhau, tiếp tục làm việc hữu ích trong lúc chúng chạy, và chỉ chọn tiền cảnh khi bước hành động kế tiếp phụ thuộc vào kết quả. Section này chỉ được render khi công cụ đó vẫn hiển thị trong phạm vi lắp ráp, nên việc giới hạn công cụ ở cấp con sẽ đồng thời loại bỏ cả schema lẫn chỉ dẫn tương ứng.

[Nghĩa vụ báo cáo của child có thể tiếp tục](2026-08-06-continuable-child-report-obligation.md) giữ nguyên: prompt của child yêu cầu gửi một báo cáo cuối cùng tự chứa, và báo cáo sớm khi phát hiện thông tin làm thay đổi bước hành động kế tiếp của parent. Việc kết toán do manager phụ trách vẫn thực thi vô điều kiện, không kiểm tra xem báo cáo đã đến hay chưa. Hai tin nhắn này có thể lặp lại nội dung cuối cùng, nhưng khác nhau về tác giả và mục đích: `report` là bàn giao tường minh của child, còn kết toán ghi nhận lần chạy này kết thúc ra sao và giữ lại đầu ra kết thúc khi child không phối hợp được. `reportDelivery` vẫn là chiến lược điều phối theo triển khai, giá trị mặc định vẫn là `wakeup`.

Kịch bản headless không cần khóa `subagent-settlement` bỏ qua `run_in_background` và nhận về id child trả về ngay; dù fixture (dữ liệu chuẩn bị cho test) cố tình không gọi `report`, nó vẫn đến được câu trả lời cuối cùng của parent thông qua thông báo kết toán do manager sinh ra. Test ở mức package cố định riêng ngữ nghĩa tiền cảnh của `false` tường minh, văn bản điều phối của parent cũng như prompt báo cáo bắt buộc của child.

## Các phương án thay thế đã cân nhắc

**Thay trường này bằng `run_in_foreground`.** Đảo giá trị boolean sẽ khiến trường hợp phổ biến được diễn đạt ở dạng khẳng định, nhưng lại tạo ra bộ từ vựng thứ hai cho cùng một lựa chọn điều phối, đồng thời buộc mọi bên gọi hiện có phải thay đổi cùng với transcript (bản ghi văn bản) hướng tới nhà cung cấp. Giữ `run_in_background` cho phép duy trì một trường duy nhất và coi tiền cảnh là ngoại lệ tường minh.

**Thêm giá trị mặc định chạy nền có thể cấu hình.** Một giá trị mặc định độc lập có thể không nhất quán với `backgroundMode`, cách diễn đạt trong schema và prompt đã cài đặt. Chiến lược vòng đời vốn đã phân biệt Activation có thể tiếp tục với Task một lần, và chính sự phân biệt đó quyết định việc hoàn thành ở chế độ nền có được giao tự động hay không.

**Chỉ sửa prompt.** Nếu việc phân giải lúc chạy không đổi, ưu tiên trong prompt vẫn khiến các lời gọi bỏ qua tham số đi vào tiền cảnh. Mô hình phải có thể dựa vào giá trị mặc định đã công bố, chứ không phải nhắc lại hoàn hảo giá trị đó trong mỗi lần gọi công cụ.

**Chặn thông báo kết toán sau khi báo cáo cuối cùng đến.** Kết toán có điều kiện sẽ đưa trở lại việc ghi sổ cho từng Activation, và làm mất bảo đảm vô điều kiện lúc chạy khi child báo cáo tiến độ trước rồi sau đó thất bại. Ngay cả khi tin nhắn sinh ra trùng lặp với báo cáo cuối cùng, kết toán vẫn thực thi vô điều kiện.

**Chỉ dùng `report` để gửi tiến độ trước khi kết toán.** Cách này loại bỏ được phần nội dung cuối cùng bị lặp, nhưng cũng gỡ khỏi prompt của child phần bàn giao tường minh do chính child viết. Nghĩa vụ báo cáo cuối cùng giữ nguyên, còn kết toán lúc chạy tiếp tục đóng vai trò phương án dự phòng độc lập và bản ghi kết thúc của nó.

## Hệ quả

- Lời gọi có thể tiếp tục thông thường không cần viết `run_in_background: true` mà vẫn không chặn; ủy thác tuần tự cần chọn `false` một cách tường minh.
- Các lời gọi subagent độc lập trong cùng một tin nhắn assistant sẽ chạy chồng lấn dưới cơ chế điều phối an toàn với đồng thời của vòng lặp công cụ; các lời gọi tiền cảnh có phụ thuộc vẫn có thể phát ra lần lượt.
- Chỉ dẫn cho parent, schema công cụ, việc phân giải lúc chạy và việc giao kết toán đều phát biểu cùng một giá trị mặc định.
- Một child tuân thủ chỉ dẫn sẽ gửi một kết quả cuối cùng tự chứa, và cũng có thể báo cáo sớm hơn các phát hiện quan trọng. Mỗi Activation còn sinh ra một thông báo kết toán vô điều kiện, nên một lần chạy đã hoàn thành có thể giao hai lần phần nội dung cuối cùng chồng lấn nhau.
- Task chạy nền một lần và các thực thể công cụ đã tắt chế độ nền giữ nguyên hành vi hiện có.
