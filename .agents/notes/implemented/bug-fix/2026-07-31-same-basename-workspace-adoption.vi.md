# Agent Note: Tiếp nhận Workspace có basename trùng nhau

Status: implemented

[English](2026-07-31-same-basename-workspace-adoption.md) | Tiếng Việt

## Vấn đề

Danh tính của Workspace được xác định bởi id ổn định và đường dẫn thư mục đã chuẩn hóa, còn tiêu đề chỉ là metadata hiển thị có thể thay đổi. Vậy mà chỉ cần tiêu đề suy ra từ basename của đường dẫn chuẩn hóa mới trùng với một Workspace khác, registry sẽ từ chối đường dẫn đó. Vì thế, các bố cục thư mục phổ biến như `/a/xx` và `/b/xx` không thể cùng xuất hiện trong Web UI, dù [thiết kế miền](../../proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) từ lâu đã cho phép tiêu đề trùng nhau, và mọi thao tác phía client đều định vị Workspace qua id.

## Quyết định

`ctx.workspaceRegistry.create(path, title?)` chỉ dùng đường dẫn chuẩn hóa làm khóa duy nhất. Truyền lặp lại cùng một đường dẫn vẫn idempotent và giữ nguyên tiêu đề đã đăng ký. Các đường dẫn chuẩn hóa khác nhau sẽ tạo ra các bản ghi Workspace khác nhau và có thể dùng chung tiêu đề; khi không cung cấp tiêu đề, mỗi bản ghi vẫn suy ra tiêu đề từ `basename(path)`, không thêm hậu tố, cũng không viết đè tiêu đề.

Lối vào tiếp nhận `workspace.create({ path })` của Host áp dụng đúng quy tắc này. Trình quản lý Workspace, bộ chọn, cây nhóm, việc chọn, đổi tên, xóa và tạo Session vẫn dùng `WorkspaceId`, nên nhãn trùng nhau sẽ không gộp bản ghi, cũng không trỏ thao tác sang bản ghi khác. Khi cần phân biệt các nhãn trùng, thẻ chi tiết hiện ra khi rê chuột ở sidebar sẽ hiển thị đường dẫn chuẩn hóa của từng cái.

Việc đặt tên tường minh vẫn theo quy tắc nghiêm ngặt hơn. `workspace.rename` vẫn từ chối tiêu đề đã được đăng ký, chi tiết xem [đặt tên Workspace thủ công](../feature/2026-07-25-session-list-browsing-and-manual-order.md). Điều này vừa ngăn người dùng chủ động tạo ra thêm một nhãn khó phân biệt, vừa cho phép trùng tên do tên thư mục sẵn có gây ra. Quy tắc tiếp nhận theo đường dẫn chỉ thay thế điều khoản xung đột tiêu đề trong [luồng sản phẩm Workspace](../feature/2026-07-25-workspace-ui-product-flow.md) và [bộ chọn thư mục native](../feature/2026-07-27-native-workspace-directory-picker.md).

Schema lưu trữ bền vững không đổi: bản ghi Workspace vốn đã lưu riêng id, path và title, khởi tạo dẫn hướng có thể suy ra cùng một basename, và bước kiểm tra lúc khởi động soi trùng đường dẫn chứ không phải trùng tiêu đề.

## Kiểm chứng

Test của registry Workspace và Host API tạo hai thư mục thật có tên cấp cuối giống nhau dưới các thư mục cha khác nhau, rồi khẳng định id và đường dẫn của chúng khác nhau, và thứ tự lưu bền vững là đúng. Component bộ chọn render các nhãn trùng nhau thành những mục riêng biệt phân biệt theo id. Kịch bản trình duyệt Web không cần khóa sẽ tiếp nhận cả hai thư mục qua luồng thư mục được lắp ghép, và quan sát thấy cả hai Workspace đều đã đăng ký và render xong.

## Các phương án đã cân nhắc

**Giữ tiêu đề là duy nhất và từ chối thư mục thứ hai.** Nhãn hiển thị vẫn vô tình đóng vai khóa danh tính, và bố cục nhiều thư mục gốc thông thường vẫn không đăng ký được.

**Tự động thêm hậu tố cho tiêu đề xung đột.** Nhãn sinh ra như `xx (2)` sẽ không còn là tiêu đề suy ra từ thư mục nữa; hệ thống còn phải đặt ra quy tắc cấp phát ổn định qua các lần xóa và tải lại, và chỉ để che đi một phán đoán danh tính sai mà lại thêm trạng thái.

**Dùng đường dẫn đầy đủ làm tiêu đề cho mỗi Workspace.** Cách này triệt tiêu xung đột, nhưng khiến nhãn điều hướng chính dài một cách không cần thiết. Đường dẫn đầy đủ vẫn xem được ở phần chi tiết khi rê chuột, còn basename ngắn gọn vẫn có giá trị.

**Cho phép cả thao tác đổi tên tường minh cũng sinh ra trùng tên.** Registry hỗ trợ trạng thái này, nhưng thao tác đó vốn dĩ là yêu cầu người dùng chọn tên hiển thị một cách rõ ràng. Giữ phản hồi xung đột sẽ duy trì lớp bảo vệ đặt tên hiện có mà không chặn các đường dẫn chọn từ hệ thống tệp.

## Hệ quả

Hai dòng Workspace có thể hiển thị cùng một tiêu đề nhìn thấy được. id chịu trách nhiệm về danh tính, nên hai dòng vẫn có thể được chọn và thao tác độc lập; người dùng có thể xem đường dẫn hoặc đổi tên một trong hai để phân biệt. Đổi tên tường minh không được dùng tiêu đề mà một dòng khác đang dùng, ngay cả khi tiêu đề đó bắt nguồn từ việc tiếp nhận thư mục có basename trùng nhau. Không cần migration lưu trữ hay đường tương thích nào.
