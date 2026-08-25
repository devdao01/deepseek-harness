# Agent Note: Thứ tự stack context của Composer

Status: implemented

[English](2026-07-30-composer-context-stack-order.md) | 中文

## Vấn đề

Goal, Todo và Queue đăng ký độc lập vào cùng một danh sách `conversation.input.dock`, nhưng thứ tự đăng ký và quy tắc khoảng cách của từng cái không được mã hóa thành một ma trận tổ hợp. Do đó, renderer đặt Todo trước cả Queue và Goal, trong khi cả Queue lẫn Goal đều mang margin âm dùng cho ranh giới composer. Khi cả ba xuất hiện cùng lúc, Queue chạm vào Goal, Goal chạm vào composer, đảo ngược thứ bậc thiết kế.

## Quyết định

[Quyết định căn chỉnh Todo-first](2026-08-02-todo-first-composer-context-order.md) quy định thứ tự tăng dần hiện tại. Note này giữ lại quy ước stack xung quanh thứ tự đó: khoảng cách số cho phép các mục trong tương lai khai báo vị trí mong muốn mà không phụ thuộc vào thứ tự kích hoạt plugin; composer bar nằm sau danh sách.

`ConversationRoot` chịu trách nhiệm về khoảng cách 6px giữa các thẻ context độc lập. Goal là một thẻ độc lập 752×36px, Todo khi thu gọn là một thẻ độc lập 752×44px. Queue là mục dock ở cuối: wrapper 776px của nó chứa cùng cột panel 752px, trừ đi phần khoảng cách chung và một lượng chồng lấp layout 5px có tên riêng, do đó thẻ composer render sau đó chỉ phủ lên cạnh của Queue. Mục rỗng render thành null, không chiếm khoảng cách.

Thứ tự và độ chồng lấp là hai quy ước độc lập. Thứ tự đăng ký định nghĩa thứ bậc ngữ nghĩa, còn biến CSS trên stack định nghĩa hình học dùng chung. Hệ thống không được suy luận rằng Queue có thể chồng lên composer chỉ vì nó là mục hiển thị cuối cùng, bởi vì khi không có Queue, Goal hoặc Todo có thể trở thành thẻ context hiển thị cuối cùng, và chúng bắt buộc phải giữ khoảng cách với composer.

## Kiểm chứng

Test đăng ký cố định ba giá trị thứ tự. Kịch bản browser Queue không cần key render đồng thời Todo, Goal và Queue, cố định thứ tự accessibility của chúng, và kiểm tra cạnh các thẻ hiển thị; các kịch bản riêng cho Goal và Queue bao phủ trạng thái độc lập của từng cái.

## Các phương án đã cân nhắc

**Giữ margin âm độc lập riêng cho Goal và Queue.** Không chọn, vì mục liền kề bị ảnh hưởng sẽ thay đổi theo thứ tự slot; trừ khi thứ tự ngữ nghĩa cũng được cố định, margin cục bộ không thể biểu đạt quan hệ nào được phép.

**Render riêng từng dock id đã biết trong `ConversationRoot`.** Không chọn, vì cách này sẽ biến danh sách slot có thể mở rộng thành một danh sách component hard-code, buộc owner phải sửa mỗi khi có thêm một bên đăng ký mới.

**Cho mục dock cuối cùng chạm vào composer.** Không chọn, vì Goal và Todo là các thẻ độc lập; tổ hợp khi Goal hoặc Todo vắng mặt không được thay đổi ngữ nghĩa giao diện của các thẻ còn lại.

## Hệ quả

Thứ bậc hiển thị vẫn ổn định ở mọi tổ hợp tồn tại, Queue là giao diện context duy nhất chạm vào composer. Plugin input-dock mới phải chọn thứ tự tương đối so với Todo `0`, Goal `10` và Queue `20`; nếu mục đó nằm sau Queue, còn phải quyết định rõ ràng ai chịu trách nhiệm về ranh giới composer.
