# Agent Note: Mở file bằng ứng dụng hệ thống trong lời gọi tool

Status: implemented

[English](2026-07-28-tool-call-file-open-in-os.md) | 中文

## Vấn đề

Hàng tool trong chat coi toàn bộ dòng tóm tắt là mục tiêu click, click vào sẽ mở panel chi tiết bên phải, kèm nền hover cho toàn hàng. Với tool hệ thống file, hành động hữu ích là mở file liên quan bằng ứng dụng mặc định của hệ điều hành, chứ không phải xem payload tool gốc trong sidebar.

## Quyết định

Tóm tắt đường dẫn của tool file (`path` hoặc `file_path` trong tham số `read`／`write`／`edit`) được render thành link đã gạch chân sẵn ở trạng thái tĩnh, dùng con trỏ pointer. Click vào đường dẫn sẽ gọi `host.openPath` qua `WorkspaceRuntime.openPath`, đường dẫn tương đối được giải quyết dựa trên cwd của session. Hàng có link file thì tắt mở rộng tham số (icon bên trái không click được); hàng tool (bao gồm cả đăng ký bash và todo) bỏ click toàn hàng, bỏ nền hover toàn hàng, và bỏ cử chỉ click để mở details. Panel details cùng mặt inject của nó vẫn giữ lại cho việc chọn theo chương trình; hàng tool không còn điều khiển chúng nữa.

`host.openPath` là RPC một chiều đặc quyền, chỉ chấp nhận request trình duyệt cùng nguồn từ địa chỉ loopback (cùng cơ chế bảo vệ vật mang với `host.pickDirectory`). Adapter nền tảng không mở qua shell: macOS dùng `open`, Windows dùng PowerShell `Invoke-Item`, desktop Linux dùng `xdg-open`; tài liệu render được trên trình duyệt sẽ ưu tiên dùng trình duyệt mặc định chỉ định trên macOS và desktop Linux. Dù Node báo cáo WSL là `linux`, WSL vẫn là một hình thái host độc lập: adapter nhận diện nó dựa trên môi trường hoặc release kernel Microsoft, dùng `wslpath -w` để chuyển đổi đường dẫn Linux, và giao đường dẫn Windows/UNC thu được cho cùng cầu nối PowerShell. Thông tin nền tảng của bộ mở và bộ chạy lệnh có thể tiêm vào khi test. Tham số read chỉ chứa URL (`web_fetch`) không phải link file.

## Phương án thay thế đã cân nhắc

- Giữ click toàn hàng để mở details, thêm lối vào file riêng — bác bỏ; yêu cầu sản phẩm là thay thế cử chỉ toàn hàng bằng link file.
- Xem trước file trong ứng dụng — bác bỏ; yêu cầu là ứng dụng mặc định của hệ điều hành.
- Coi WSL như desktop Linux — bác bỏ; tiến trình WSL báo cáo `linux`, nhưng liên kết ứng dụng desktop Linux không nhất thiết tồn tại, còn desktop và trình duyệt thông thường của người dùng lại nằm trên Windows.
- Tái sử dụng miễn trừ timeout của `host.pickDirectory` — không cần thiết; việc giao đường dẫn mở có thể hoàn thành trong deadline một chiều thông thường.

## Hậu quả

Click vào đường dẫn file trong hàng tool sẽ mở đường dẫn đó trên host. Hàng tool không phải file chỉ là tóm tắt không tương tác (công tắc mở rộng vốn có trong hàng vẫn giữ nguyên). Client từ xa hoặc không phải loopback không thể gọi `host.openPath`.

## Rủi ro

- Host desktop Linux không có `xdg-open`, và host WSL mà tương tác Windows (`wslpath` cộng `powershell.exe`) không khả dụng, sẽ khiến RPC thất bại; hàng chat giữ im lặng, host trả về lỗi nội bộ.
- Khi không có cwd session, đường dẫn tương đối sẽ được chuyển tiếp nguyên trạng, có thể thất bại ở phía host.
