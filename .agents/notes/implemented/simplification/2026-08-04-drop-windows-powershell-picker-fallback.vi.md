# Agent Note: Xóa bỏ fallback picker Windows PowerShell

Status: implemented

[English](2026-08-04-drop-windows-powershell-picker-fallback.md) | Tiếng Việt

## Vấn đề

Nhánh win32 của native directory picker giữ lại một chuỗi fallback hai cấp bên dưới subprocess koffi `IFileOpenDialog`: trước tiên là `pwsh.exe`, rồi đến `powershell.exe` (Windows PowerShell 5.1), cả hai đều chạy cùng một script WinForms chủ động bật `SetProcessDPIAware`. Chuỗi này tồn tại nhằm vẫn cho ra một picker khả dụng khi tầng koffi "không dùng được", nhưng mỗi điều kiện kích hoạt mà nó có thể bảo vệ đều là lỗi đóng gói hoặc triển khai của chính chúng ta, không phải của hệ điều hành:

- Binary native của koffi được phân phối như một NPM dependency tùy chọn thông thường (`@koromix/koffi-win32-x64`, không có install script); host nào cài được package này chắc chắn có binary, host nào cài không được sẽ báo lỗi rõ ràng ngay lúc cài đặt — code fallback về cơ bản không bao giờ được nạp.
- "Windows cổ" không thể xảy ra: các phiên bản Node mà repo này hỗ trợ chạy trên các thế hệ Windows mới hơn nhiều so với thời đại ABI `IFileOpenDialog` của Vista.
- Lỗi koffi/COM chỉ làm crash subprocess của hộp thoại (crash isolation); phản ứng đúng đắn với bug của chính chúng ta là báo lỗi, chứ không phải âm thầm giáng cấp xuống hộp thoại phiên bản cũ.

Chuỗi này còn phải trả cái giá phức tạp thực sự: hai tầng spawn chạy cùng một script, mở rộng điều kiện kích hoạt fallback từ `ENOENT` sang bất kỳ lỗi nào của pwsh để vá lỗi hồi quy PowerShell 6 (không có WinForms), mang theo `AggregateError` gộp cả ba nguyên nhân thất bại liên tiếp, và kiểm tra lại abort ở từng tầng. Seam vốn đã có fallback duy nhất thực sự quan trọng — backend `browse` ở tầng bundle, được `directory-picker-auto` chọn một lần lúc khởi động.

## Quyết định

Tầng win32 giờ đây đúng bằng subprocess koffi `IFileOpenDialog`; mọi thất bại được báo nguyên trạng, không fallback. Chuỗi PowerShell — cascade `pwsh` → Windows PowerShell 5.1, script WinForms sửa DPI, gộp `AggregateError` — bị xóa, nhánh win32 của `pickNativeDirectory` trở thành một lệnh gọi đơn. `dsh-native-command` vẫn giữ lại dependency cho tầng POSIX.

Tiêu chí fallback mà phần còn lại của package này đã tuân theo giờ được áp dụng thống nhất: tầng fallback chỉ tồn tại cho các công cụ do hệ điều hành/desktop environment cung cấp và có thể thiếu (`zenity` → `kdialog` trên Linux, được lấy mẫu bởi cùng một startup probe); công cụ do chính chúng ta đóng gói (`koffi`) thất bại thì báo lỗi rõ ràng. `osascript` trên macOS vẫn giữ nguyên không fallback như trước.

Thay đổi này gộp và xóa Agent Note vá lỗi DPI picker ưu tiên pwsh trước đây: quyết định của note đó bị đảo ngược hoàn toàn ở đây, và lý do giữ lại nó không còn hướng dẫn công việc trong tương lai cho một tầng chỉ còn koffi. Phần vẫn còn đúng trong đó: PowerShell 7 hiển thị bộ chọn thư mục hiện đại dựa trên `IFileDialog`, còn `FolderBrowserDialog` của bản 5.1 được nối cứng vào cây `SHBrowseForFolder` cũ; `SetProcessDPIAware` của script sửa mức trần DPI hệ thống của tiến trình được spawn; bước nhảy pwsh→5.1 tồn tại vì PowerShell 6 (nếu resolve được) không có WinForms (mã thoát 1, không phải `ENOENT`). Các phương án bị từ chối của note đó (yêu cầu PowerShell 7, import `resolvePwshPath`, thiết lập nhận biết DPI ở tiến trình harness) mất ý nghĩa cùng với việc xóa chuỗi này.

## Các phương án thay thế đã cân nhắc

**Giữ chuỗi nhưng bỏ tầng chất lượng pwsh (`koffi` → Windows PowerShell 5.1).** Từ chối: tầng còn lại vẫn đang phòng ngừa lỗi của chính dependency mà chúng ta đóng gói, vẫn phải trả giá cho script, điều kiện kích hoạt mở rộng và việc gộp lỗi, và vẫn che giấu lỗi vtable/COM của chính chúng ta phía sau hộp thoại phiên bản cũ. Tiêu chí "chỉ fallback cho công cụ do bên ngoài cung cấp" không chấp nhận bất kỳ tầng Windows nào.

**Giữ nguyên chuỗi như hiện tại.** Từ chối: đây là fallback runtime hai cấp duy nhất trong picker, điều kiện kích hoạt của nó là lỗi phía triển khai vốn dĩ sẽ báo lỗi rõ ràng, và nó giáng cấp một thao tác chọn thất bại thành `AggregateError`, trong đó mục thông tin hữu ích nhất lại trỏ tới PowerShell host.

**Fallback runtime sang `browse` khi native pick thất bại.** Từ chối: lỗ hổng luồng của seam thuộc loại `single`, bundle `-auto` đã chọn một backend lúc khởi động; việc nhảy runtime giữa các loại sẽ mount đồng thời hai backend và làm mờ ranh giới năng lực.

## Hệ quả

- Diện lỗi của picker win32 giờ là một lỗi từ một tầng duy nhất; bên gọi thấy nguyên nhân thực sự (koffi nạp thất bại, COM từ chối, hộp thoại crash), thay vì lỗi gộp theo chuỗi.
- Package này không còn gọi `pwsh`/`powershell.exe`; script WinForms, phần sửa `SetProcessDPIAware` và flag `-STA` biến mất theo.
- Test được rút gọn tương ứng: các case cascade pwsh/5.1 và thất bại liên tiếp ba lần được thay bằng một case duy nhất "báo lỗi nguyên trạng, không fallback"; test adapter mặc định chuyển sang chạy tầng Linux.
- Điều kiện để tái áp dụng: chỉ khi trong tương lai xuất hiện một cơ chế win32 nằm ngoài chuỗi đóng gói của chúng ta (host hộp thoại do hệ thống cung cấp mà chúng ta không phân phối kèm package) thì mới đáng giữ lại một tầng fallback theo cùng tiêu chí này.
