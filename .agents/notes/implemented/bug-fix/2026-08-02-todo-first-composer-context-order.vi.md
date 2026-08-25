# Agent Note: Thứ tự context của composer ưu tiên Todo

Status: implemented

[English](2026-08-02-todo-first-composer-context-order.md) | 中文

## Vấn đề

Stack context của composer render Goal trước Todo, nhưng bản thiết kế Harness lại xếp kế hoạch task hiện tại trước mục tiêu đang tiến hành và Queue đang chờ xử lý. Todo còn dùng chiều rộng 776px của wrapper Queue làm chiều rộng thẻ hiển thị của chính nó, trong khi panel Goal và Queue lại render trên cùng một cột thẻ dùng chung 752px. Kết quả vừa đảo ngược thứ bậc thông tin dự kiến, vừa khiến Todo rộng hơn hai panel liền kề.

## Quyết định

Danh sách `conversation.input.dock` áp dụng thứ tự sản phẩm thống nhất, tăng dần lần lượt Todo `0`, Goal `10`, Queue `20`, tiếp theo là composer bar nằm ngoài danh sách. Thứ tự đăng ký vẫn là nguồn sự thật ngữ nghĩa; renderer không hard-code id của component đã biết, cũng không dùng CSS để chỉnh lại thứ tự của chúng.

Todo, Goal và panel Queue hiển thị dùng chung cột thẻ 752px trong giới hạn chiều rộng composer 800px. Queue giữ wrapper 776px, mỗi bên chừa 12px inset trong suốt, vì wrapper này chịu trách nhiệm chồng lấp với composer. Todo là một thẻ độc lập, không phải wrapper, nên chiều rộng responsive và chiều rộng tối đa của nó đều trừ trực tiếp hai lớp inset đó. Goal dùng cùng cột thẻ responsive, và đặt giới hạn chiều rộng thanh ngang bên trong là 752px, nhờ đó vẫn giữ căn chỉnh mép khi dưới giới hạn chiều rộng desktop.

[Quy ước stack của composer](2026-07-30-composer-context-stack-order.md) tiếp tục quy định khoảng cách giữa các thẻ, và chỉ Queue được chồng lấp với composer. Quyết định này chỉ thay thế thứ tự ưu tiên Goal trong note đó.

## Kiểm chứng

Test đăng ký của Todo và Goal lần lượt cố định thứ tự `0` và `10`; Queue vẫn cố định `20`. Kịch bản browser Queue không cần key render đồng thời cả ba panel, ghi lại thứ tự accessibility Todo–Goal–Queue, và so sánh bounding box hiển thị của chúng ở baseline desktop 1680px cũng như viewport 640px dưới giới hạn chiều rộng, sau đó mới thực hiện thay đổi Queue.

## Các phương án đã cân nhắc

**Sắp xếp lại các panel đã biết bên trong `ConversationRoot`.** Không chọn, vì `conversation.input.dock` là danh sách có thứ tự có thể mở rộng; danh sách component hard-code sẽ khiến thứ tự kích hoạt plugin không khớp với thứ tự render.

**Dùng CSS `order` để di chuyển vị trí hiển thị của Todo.** Không chọn, vì thứ tự accessibility và thứ tự bàn phím phải khớp với thứ bậc hiển thị, trong khi sổ sách slot đã chịu trách nhiệm về thứ tự ngữ nghĩa rồi.

**Để Todo giữ chiều rộng của wrapper Queue.** Không chọn, vì inset trong suốt của wrapper Queue là hạ tầng layout cần thiết cho việc chồng lấp với composer, không thuộc về cột panel hiển thị.

## Hệ quả

Kế hoạch task hiện hành hiển thị trước mục tiêu đang tiến hành, công việc Queue đang chờ vẫn gần composer nhất, ba thẻ hiển thị dùng chung cùng một mép ngang. Plugin input-dock trong tương lai phải chọn vị trí rõ ràng tương đối so với Todo `0`, Goal `10` và Queue `20`; chỉ Queue chịu trách nhiệm về việc wrapper cuối cùng chồng lấp với composer.
