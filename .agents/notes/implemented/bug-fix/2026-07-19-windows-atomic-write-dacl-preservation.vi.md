# Agent Note: Giữ nguyên DACL trong quá trình thay thế file nguyên tử trên Windows

Status: implemented

[English](2026-07-19-windows-atomic-write-dacl-preservation.md) | 中文

## Vấn đề

Ghi nguyên tử trên POSIX bảo vệ thư mục tạm bằng `0o700` và file tạm bằng `0o600`, nhưng bit mode trên Windows chỉ là một khung nhìn chỉ-đọc tổng hợp của DACL thực tế. Việc tạo thư mục tạm và file tạm ngay dưới thư mục cha của file đích, rồi chỉ dựa vào DACL kế thừa, là đủ cho nhu cầu của file mới tạo, nhưng không thể thay thế an toàn một file hiện có có DACL tường minh hoặc được bảo vệ chặt hơn thư mục cha: nội dung sẽ được ghi dưới DACL rộng rãi hơn của thư mục cha, còn thao tác đổi tên lại mang chính security descriptor tạm đó sang file sau khi thay thế.

## Quyết định

`dsh-fs-local` đọc DACL của file đích hiện có qua `GetFileSecurityW`, áp dụng nó lên file tạm rỗng dưới dạng cấm kế thừa trước khi ghi nội dung, rồi công bố file tạm đã đóng qua `ReplaceFileW`. Security descriptor tạm được bảo vệ giúp ngăn các mục kế thừa trong thư mục tạm mở rộng quyền truy cập; `ReplaceFileW` giữ lại chính sách truy cập của file đích gốc cùng các metadata thay thế khác. Quá trình hợp nhất ACL của nó có thể tuần tự hóa lại trạng thái kế thừa tự động hoặc nhân bản các ACE tương đương, nên không thể coi việc bằng nhau từng byte của buffer security descriptor tự tương đối là một cam kết ổn định. File Windows mới không có descriptor sẵn có nào cần giữ lại, nên vẫn kế thừa DACL của thư mục đích; thư mục tạm của nó vì thế cũng nằm cạnh file đích. POSIX tiếp tục dùng mode tạm chỉ chủ sở hữu truy cập được, và giữ nguyên mode của file đích hiện có.

Kiểm thử độ phủ native trên Windows sẽ bảo vệ DACL của file đích, kiểm tra file tạm đã ghi xong, và đối chiếu chính sách ACE giữ đúng thứ tự và đã khử trùng lặp trong file cuối cùng sau khi thay thế. Kiểm thử binding không phụ thuộc nền tảng host bao phủ việc chuyển đổi lỗi Win32 cùng từng ranh giới gọi native. Các khẳng định về bit mode vẫn chỉ áp dụng cho POSIX; việc kế thừa DACL của file mới do quy ước hệ điều hành quy định, không nên khẳng định qua danh sách tài khoản được phép của một máy cụ thể.

## Phương án khác

**Dựa vào kế thừa thư mục khi thay thế file.** Không áp dụng, vì file đích có thể mang DACL tường minh hoặc được bảo vệ chặt hơn thư mục cha; kế thừa thư mục vừa không bảo vệ được nội dung tạm, vừa không giữ được chính sách truy cập của file đích.

**Dùng `ReplaceFileW` nhưng không bảo vệ file tạm.** Không áp dụng, vì cách này chỉ sửa được descriptor cuối cùng sau khi nội dung đã được ghi theo DACL kế thừa của file tạm.

**Đặt DACL chỉ chủ sở hữu truy cập được cho mỗi lần ghi.** Không áp dụng, vì làm vậy sẽ phá vỡ quyền chia sẻ mà dự án cố ý thiết lập. Sao chép DACL của file đích giữ được chính sách truy cập vốn có trong triển khai, không cần tự đặt ra chính sách mới.

**Dùng `Get-Acl` hoặc `icacls` để khẳng định tài khoản kế thừa.** Không áp dụng, vì loại kiểm thử này xác thực chính sách của máy chứ không phải hành vi của package; tên tài khoản dựng sẵn của hệ thống được bản địa hóa, khiến đầu ra không ổn định giữa các host khác nhau.

**Bỏ qua các lời gọi `chmod` hiện có trên Windows.** Không áp dụng, vì Node ánh xạ các mode ghi được này thành thao tác rỗng vô hại; điều kiện rẽ nhánh theo nền tảng chỉ làm tăng nhánh chứ không thay đổi hành vi DACL.

## Ảnh hưởng

Thay thế file trên Windows giờ đây yêu cầu bên gọi có quyền đọc DACL của file đích và đặt DACL cho file tạm; nếu quyền không đủ, hệ thống sẽ báo lỗi rõ ràng trước khi ghi nội dung. Package đưa vào Koffi để thực hiện một số ít lời gọi Win32, và chỉ nạp trên đường thay thế của Windows. File Windows mới sẽ kế thừa quyền truy cập rộng hơn khi thư mục được thiết kế mở rộng như vậy, còn nội dung tạm trên POSIX vẫn chỉ cho phép chủ sở hữu truy cập; file đích chỉ-đọc trên Windows vẫn thất bại lúc công bố, sớm hơn thời điểm mà việc phát lại mode tổng hợp có thể gây ảnh hưởng.
