# Agent Note: Mục mở rộng cho context injection trên Web

Status: implemented
Archived: 2026-08-07

[English](2026-07-30-web-context-injection-disclosure.md) | 中文

## Vấn đề

Web session trước đây render mỗi message không phải của người dùng đã được ghi log qua `JsonBlock` chung. Cách hiển thị này dùng ký hiệu tam giác dạng text, font nhãn kiểu compact, panel JSON có viền, và một bộ khoảng cách khác, nên context injection không nhất quán với mục mở rộng Tool calls trong thiết kế sản phẩm. Chỉnh style của primitive chung cũng sẽ ảnh hưởng đến cách hiển thị fallback của event và attachment không xác định.

## Quyết định

`MessageItem` định tuyến node ngữ cảnh đến `ContextInjectionRow`. Hàng này ban đầu thu gọn, tiêu đề là `上下文注入` (context injection), dùng icon browse hiện có, và biến toàn bộ title bar cao 24px thành mục tiêu mở rộng có thể thao tác bằng con trỏ và bàn phím. Phần thân mở rộng của nó bắt đầu từ 4px bên dưới title bar, canh hàng với thụt lề nội dung 22px dùng chung, và render vùng cuộn 141px theo quy định thiết kế; vùng cuộn dùng bo góc 8px, nền code block, chữ code 11/16 và không viền.

`ContextInjectionRow` serialize `content` và `source` đã ghi log thành một giá trị JSON inline, giữ lại thông tin nguồn bên cạnh nội dung model-visible. Nội dung hiển thị tiếp tục tuân theo chính sách cắt bớt 20.000 ký tự hiện có. Thay đổi này không sửa bất kỳ session event, logic thu gọn runtime, hay plugin sinh ngữ cảnh nào.

`DisclosureRow` trong nội bộ package chịu trách nhiệm cho hình học title bar, chuyển tiếp từ icon sang mũi tên thu gọn, trạng thái mở có kiểm soát, và thao tác Enter/Space dùng chung giữa hàng ngữ cảnh và `ToolRow`. `ToolRow` vẫn là owner ngữ nghĩa của trạng thái tool, tóm tắt, liên kết file và phần thân tool sau khi mở rộng. Mọi nguồn ngữ cảnh dùng chung một cách hiển thị; ngữ cảnh không đi vào toolview slot có khóa (keyed), cũng không có slot riêng cho ngữ cảnh.

## Xác minh

Test session component chốt trạng thái thu gọn ban đầu, icon browse, việc chuyển đổi bằng con trỏ và bàn phím cho toàn hàng, hình dạng JSON inline, cắt bớt, và cách hiển thị event không xác định chung giữ nguyên không đổi. Kịch bản Web history đã lắp ráp không cần key inject ngữ cảnh qua Agent API thật, ghi lại hàng thu gọn trong kết quả kỳ vọng ARIA, và đo icon, title bar, thụt lề, khoảng cách, vùng cuộn, padding, bo góc, typography, màu sắc và hành vi overflow theo quy định thiết kế trong Chromium.

## Các phương án thay thế đã cân nhắc

**Đặt lại style toàn cục cho `JsonBlock`.** Bị từ chối vì: event surface không xác định và các content block khác dùng primitive này làm cách hiển thị fallback chung độc lập, thay đổi thị giác toàn cục sẽ ghép nối các cách hiển thị không liên quan với nhau.

**Render ngữ cảnh như một tool read.** Bị từ chối vì: tái sử dụng trực tiếp `ToolRow` sẽ thêm ngữ nghĩa tool, trạng thái và phân phối có khóa sai cho message không phải của người dùng đã ghi log.

**Thêm slot context-view có khóa mới.** Bị từ chối vì: hiện tại mọi nguồn ngữ cảnh đều dùng chung phần thân tiêu đề và thông tin nguồn giống nhau, seam đăng ký hiện chưa có consumer. Nếu tương lai xuất hiện cách hiển thị do các nguồn khác nhau sở hữu, vẫn có thể thêm seam này mà không cần thay đổi hàng này.

## Hệ quả

Context injection và Tool calls dùng chung ngôn ngữ thị giác nhất quán, đồng thời không thay đổi ngữ nghĩa được lưu trữ bền vững của chúng. Title bar mục mở rộng dùng chung giúp ngăn hai hàng này dần dần trôi dạt khỏi nhau, còn phần thân ngữ cảnh chuyên biệt vẫn có thể tiến hóa độc lập với `JsonBlock` chung. Phần thân chiều cao cố định đánh đổi việc không thể tự tăng theo nội dung, để giữ nhịp điệu typography ổn định cho transcript (bản ghi văn bản); xem chỉ dẫn injection dài phải cuộn.
