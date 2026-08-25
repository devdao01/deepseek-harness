# Agent Note: Sao chép giá trị chính khi kích hoạt thẻ hover

Status: implemented
Archived: 2026-08-07

[English](2026-07-31-hover-card-click-copy.md) | 中文

## Vấn đề

Hàng Workspace và Session cắt bớt hai giá trị mà thẻ hover tương ứng hiển thị đầy đủ: đường dẫn thư mục Workspace và tiêu đề Session. [Thẻ có thể tiếp cận](../bug-fix/2026-07-30-hover-popup-pointer-grace.md) này hỗ trợ chọn văn bản, nhưng sao chép một giá trị đã biết vẫn cần chọn chính xác, thao tác phiền phức không cần thiết; thẻ cũng không xác nhận clipboard đã chấp nhận ghi hay chưa.

## Quyết định

`HoverCard` nhận `copyText` tùy chọn, cùng `copyLabel` và `copiedLabel`. Khi truyền `copyText`, toàn bộ thẻ sẽ cung cấp ngữ nghĩa button cho kích hoạt bằng con trỏ và bàn phím; tên accessibility của nó gồm tiền tố thao tác đã bản địa hóa và giá trị gốc, thẻ ghi giá trị đó qua hàm hỗ trợ clipboard dùng chung, và chỉ khi host chấp nhận ghi mới thay nội dung bằng nhãn thành công tối đa một giây. Phản hồi giữ nguyên chiều cao thẻ trước khi sao chép, và sẽ bị xóa khi thẻ đóng. Khi không truyền `copyText`, component nguyên tử này vẫn giữ hành vi chỉ đọc và có thể chọn văn bản.

Workspace browser chọn payload để sao chép, không để component cơ sở suy diễn từ văn bản render: thẻ Workspace truyền đường dẫn thư mục đầy đủ, thẻ Session không rỗng truyền tiêu đề hiển thị đầy đủ. Thẻ "Session mới" trống rỗng tạm thời vẫn giữ chỉ đọc, vì nhãn đã bản địa hóa của nó là văn bản chỗ giữ (placeholder), không phải nội dung session. Ghế locale của browser cung cấp `Copy`/`复制`, trạng thái thành công dùng `Copied`/`已复制`.

Nhấn xuống (press) và kích hoạt vẫn là hai hợp đồng riêng biệt. Khi pointer press xảy ra bên trong thẻ, thẻ vẫn giữ mounted, để người dùng có thể bắt đầu chọn văn bản; sau khi chọn văn bản xong, nếu selection không rỗng và giao với thẻ, việc click pointer để kích hoạt sẽ bị chặn, còn click bình thường hoặc phím kích hoạt button sẽ kích hoạt sao chép. Khi pointer press xảy ra trong vùng anchor, thẻ vẫn biến mất ngay lập tức; khi clipboard từ chối ghi, thẻ tiếp tục hiển thị nội dung gốc, không tuyên bố sao chép thành công.

## Phương án thay thế

**Sao chép `textContent` của thẻ sau khi render.** Cách này sẽ nối giá trị chính với thời gian tạo hoặc trạng thái chạy, khiến payload clipboard phụ thuộc vào cách trình bày và kết quả bản địa hóa.

**Triển khai trạng thái clipboard riêng trong hai phần thân thẻ Workspace.** Hai consumer sẽ lặp lại triển khai fallback host, hành vi bàn phím, quyền sở hữu timer và render trạng thái thành công, dù lớp kích hoạt được giữ bởi thẻ.

**Đổi nhãn `copied` tiếng Trung chung từ `复制成功` thành `已复制`.** Cách này sẽ thay đổi mọi control sao chép hiện có chỉ để đáp ứng một tương tác thẻ. Văn bản riêng của thẻ nên do dictionary Workspace giữ.

## Hệ quả

Cả hai loại thẻ hover không phải placeholder đều có cùng khả năng thao tác click và bàn phím, đồng thời giữ ngữ nghĩa để consumer quyết định payload và phản hồi bản địa hóa. Component nguyên tử chung thêm một đường hành vi tùy chọn và một timer một giây; khi thẻ đóng thì trạng thái đã sao chép bị xóa, kết quả hoàn tất đến sau khi đóng hoặc unmount sẽ bị bỏ qua, khi ghi bị từ chối tuyệt đối không báo cáo thành công. Test component tập trung chốt độ ưu tiên chọn văn bản bằng pointer, kích hoạt, thất bại, kích thước phản hồi và dọn dẹp khi hết hạn cũng như hành vi cleanup; kịch bản Workspace trên trình duyệt thật xác minh nhãn tiếng Anh, chiều cao ổn định trong lúc phản hồi và clipboard trình duyệt.
