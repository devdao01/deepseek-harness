# Agent Note: Giải quyết alias pwsh của Microsoft Store

Status: implemented

[English](2026-08-12-resolve-store-pwsh-aliases.md) | Tiếng Việt

## Vấn đề

`resolvePwshPath` tuyên bố rằng bản cài đặt từ Store được giải quyết qua PATH, nhưng phép dò tồn tại của nó dùng `existsSync`, thứ sẽ stat ứng viên và do đó theo dấu các reparse point. `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` của Store là một app execution alias, thư mục đích của nó có ACL từ chối stat (EACCES), nên `existsSync` không thấy nó, và việc giải quyết âm thầm rơi về Windows PowerShell 5.1 — trên những máy mà "PowerShell 7 duy nhất là bản cài từ Store" thì đây chính là dùng nhầm shell.

## Quyết định

`candidateExists` chấp nhận ứng viên khi "stat cho ra một file" hoặc "lstat cho ra một reparse point dạng link", và `resolvePwshPath` chuyển sang dùng nó. Đường dẫn alias vẫn spawn được vì CreateProcess sẽ giải quyết app execution alias. Ứng viên dạng link bị treo (dangling) cũng được chấp nhận như nhau, để một pwsh hỏng thất bại rõ ràng khi spawn, thay vì âm thầm hạ cấp xuống 5.1.

## Các phương án đã cân nhắc

**Dò trực tiếp thư mục package WindowsApps.** Đường dẫn package của Store mang theo số phiên bản và bị ACL che giấu; hardcode nó chỉ lặp lại đúng kiến thức đóng gói mà PATH cộng alias đã có sẵn.

**Khi stat thất bại thì tiếp tục rơi về 5.1.** Bị bác bỏ: cách đó âm thầm chạy một shell không phải shell đã cài, chính là khiếm khuyết mà note này sửa.

## Hệ quả

Trên Windows, PowerShell 7 cài từ Store giờ được giải quyết trước khi rơi về 5.1; ứng viên là file thường và hành vi trên các nền tảng không phải Windows không đổi. Unit test symlink treo chốt hành vi tách nhánh giữa stat/lstat trên mọi nền tảng.
