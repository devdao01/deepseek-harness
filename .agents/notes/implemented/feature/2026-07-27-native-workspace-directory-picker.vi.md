# Agent Note: Bộ chọn thư mục workspace gốc của hệ điều hành

Status: implemented

[English](2026-07-27-native-workspace-directory-picker.md) | Tiếng Việt

## Vấn đề

GUI trên desktop yêu cầu người dùng nhập đường dẫn tuyệt đối khi thêm một workspace sẵn có. So với việc chọn thư mục bằng bộ chọn gốc của hệ điều hành, thao tác này chậm hơn và dễ sai hơn. GUI được phục vụ bởi vật chứa Web cục bộ, nên việc mở hộp thoại gốc cũng tạo thành một ranh giới đặc quyền mà các request từ xa thông thường không được phép vượt qua.

## Quyết định

Bổ sung một RPC `host.pickDirectory` dùng để chọn một thư mục duy nhất, và phơi bày RPC đó qua `WorkspaceRuntime`. Menu workspace cung cấp thao tác dạng phẳng **Thêm workspace…** (tại thời điểm ra quyết định này là hai thao tác: **Mở thư mục cục bộ…** và một lối vào tạo theo tên, lối vào sau đã bị [Note về đường đi duy nhất](../simplification/2026-07-31-one-route-to-add-a-workspace.md) xóa bỏ). Sau khi chọn thư mục, hệ thống tái sử dụng luồng `workspace.create({ path })` sẵn có, chọn workspace được trả về, và khởi động một session trắng.

Trình quản lý workspace phải chèn hoặc cập nhật workspace được trả về trước khi callback chọn chạy. Nhờ vậy, thư mục vừa được thu nạp lập tức hiển thị basename của nó. Khi mở lại một đường dẫn đã đăng ký, tiêu đề hiện có của workspace đó được giữ nguyên.

## Quy ước tương tác

- Trên macOS, Windows và Linux, bộ chọn mỗi lần chỉ cho phép chọn một thư mục.
- Hủy hộp thoại hệ thống sẽ không hiện thông báo nào và trả về `null`.
- Khi đường dẫn trùng lặp, workspace sẵn có sẽ được chọn.
- Ngay cả khi tên hiển thị suy ra trùng với một Workspace khác, các canonical path khác nhau vẫn được thu nạp thành những Workspace độc lập (xem [quyết định về danh tính](../bug-fix/2026-07-31-same-basename-workspace-adoption.md)).
- Các lỗi khác của bộ chọn sẽ hiện thông báo lỗi ngắn gọn và có thể thử lại.
- Luồng tạo theo tên, vốn không bị quyết định này đụng tới vào thời điểm đó, nay đã bị xóa; chọn thư mục là toàn bộ cách thêm workspace (xem [Note về đường đi duy nhất](../simplification/2026-07-31-one-route-to-add-a-workspace.md)).

## Ranh giới host

Chỉ những request đến từ loopback socket và mang metadata trình duyệt cùng nguồn (same-origin) mới được gọi RPC hộp thoại gốc. RPC này không dùng timeout request mặc định 30 giây, vì hộp thoại hệ thống có thể mở vô thời hạn; việc phía gọi hủy hoặc kết nối đứt vẫn được truyền tới tiến trình nền tảng.

Bộ điều hợp nền tảng mở hộp thoại mà không qua shell — trên POSIX thì spawn công cụ gốc, trên Windows thì tương tác COM trong tiến trình:

- macOS: `osascript` và bộ chọn thư mục của hệ thống.
- Windows: tiến trình con koffi `IFileOpenDialog`, dùng mức nhận biết DPI theo luồng tốt nhất mà host chấp nhận (per-monitor-v2 khi khả dụng; các host không hỗ trợ PMv2 thì hạ dần xuống per-monitor hoặc system-aware) (xem [Note về hộp thoại trong tiến trình](2026-08-02-win32-in-process-folder-dialog.md)); tầng này không có phương án dự phòng — lỗi được báo cáo nguyên trạng (xem [phần xóa chuỗi PowerShell](../simplification/2026-08-04-drop-windows-powershell-picker-fallback.md)).
- Linux: dùng `zenity`; khi Zenity không khả dụng thì quay về `kdialog`.

## Các phương án đã cân nhắc

- Một trình duyệt thư mục tự viết sẽ lặp lại hành vi và logic quyền của hệ điều hành, hơn nữa nó thuộc về phần triển khai Web chứ không thuộc thay đổi chỉ hướng tới desktop lần này.
- Tiếp tục dùng ô nhập đường dẫn thủ công sẽ giữ nguyên cách tương tác dễ sai hiện tại.
- Bổ sung hạ tầng xác thực danh tính cho một hộp thoại gốc cục bộ sẽ khiến phạm vi thay đổi vượt quá mô hình mối đe dọa của nó; với vật chứa hiện tại, kiểm tra loopback và same-origin đã là đủ.

## Hệ quả

GUI hiện tại có thể mở một thư mục cục bộ qua bộ chọn gốc trên macOS, Windows và Linux. Thao tác hủy không làm thay đổi trạng thái nào, lỗi vẫn có thể thử lại; việc xử lý đường dẫn trùng lặp có tính idempotent, còn các đường dẫn khác nhau nhưng cùng basename thì có thể cùng tồn tại như những Workspace độc lập. Workspace được chọn và tên hiển thị của nó được làm mới xong trước khi khởi động session trắng mới. Bộ chọn này nay là đường đi duy nhất để có được workspace (xem [Note về đường đi duy nhất](../simplification/2026-07-31-one-route-to-add-a-workspace.md)): người vận hành hoặc chọn một thư mục sẵn có, hoặc tạo mới ngay trong bộ chọn.

Các bài kiểm thử host, runtime, component và GUI mới bổ sung bao phủ ranh giới gốc, việc kiểm tra độ tin cậy của request, xử lý hủy và lỗi, tái sử dụng đường dẫn sẵn có, thu nạp các đường dẫn cùng basename, và cập nhật tức thì tên hiển thị. RPC đặc quyền này vẫn chỉ hướng tới vật chứa desktop cục bộ; trình duyệt thư mục Web từ xa không thuộc phạm vi quyết định này.

## Rủi ro

- Môi trường desktop Linux có thể không cung cấp bất kỳ bộ chọn nào được hỗ trợ. GUI sẽ báo cáo hạn chế này thay vì quay về yêu cầu người dùng nhập đường dẫn.
- Bên ngoài các vật chứa cục bộ được hỗ trợ, metadata trình duyệt có thể khác đi. Với những request không chứng minh được rằng chúng thỏa mãn ngữ cảnh same-origin cục bộ được yêu cầu, endpoint sẽ từ chối theo đúng thiết kế.
