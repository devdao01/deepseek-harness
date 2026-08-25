# Agent Note: Xóa link fallback profile đã cũ bằng unlink thay vì rmSync

Status: implemented

[English](2026-08-12-unlink-stale-profile-fallback-links.md) | Tiếng Việt

## Vấn đề

`healProfilesModuleFallback` trỏ lại các mục trong `$DSH_HOME/profiles/node_modules` về đích mới mỗi khi vị trí cài đặt di trú, và trên máy Windows các mục đó là junction. `ensureSymlink` trước đây dùng `rmSync(link)` để xóa mục đã cũ, nhưng Node lại coi junction như một thư mục khi xóa: `rmSync` không có `recursive` sẽ ném `ERR_FS_EISDIR`, khiến mỗi lần khởi động từ một bản cài đã di trú hoặc từ worktree thứ hai đều crash trước khi ứng dụng kịp bootstrap. Unit test `replaces a wrong symlink` trên Windows tái hiện đúng crash này ngay tại lời gọi xóa đó.

## Quyết định

`ensureSymlink` chuyển sang dùng `unlinkSync(link)` để xóa link cũ. `unlink` trên mọi nền tảng đều chỉ xóa bản thân reparse point hoặc symlink, không bao giờ đi vào thư mục đích, nhờ đó giữ được cam kết "thư mục thật không bao giờ bị xóa, và thất bại phải thất bại rõ ràng" của hàm này. [Quyết định profile-plugin-bundles](../architecture/2026-08-05-profile-plugin-bundles.md) tiếp tục sở hữu việc giải quyết hai điểm neo của thư mục fallback; note này chỉ sở hữu quyết định "dùng nguyên hàm xóa nào".

## Các phương án đã cân nhắc

**`rmSync(link, { recursive: true })`.** Trên Node 24, cách này chỉ xóa junction mà không theo vào đích, nhưng `recursive` sẽ âm thầm xóa cả thư mục nếu link bị thay bằng một thư mục thật giữa lúc guard `lstat` và lúc xóa diễn ra, làm suy yếu cam kết thất bại rõ ràng mà guard đó dựa vào.

**`rmdirSync(link)`.** Trên Windows cũng xóa được junction, nhưng đọc lên giống "xóa thư mục", trong khi `unlinkSync` mới là quy ước dọn junction sẵn có của repo.

**Xóa và dựng lại vô điều kiện mọi mục.** Đúng, nhưng mỗi lần khởi động lại xáo trộn cả những link không thay đổi, và mở rộng cửa sổ tranh chấp (race) cho việc tự sửa đồng thời.

## Hệ quả

Khởi động trên Windows giờ có thể tự sửa một bản cài đã di trú hoặc một checkout thứ hai, thay vì crash với `ERR_FS_EISDIR`; hành vi trên POSIX không đổi vì `unlinkSync` cũng unlink được symlink thường. Test `replaces a wrong symlink` hiện có trên Windows chuyển từ tái hiện crash sang pass. Khi hai tiến trình tự sửa (healer) đồng thời cùng xóa một link cũ, lần xóa thứ hai vẫn nổi lên `ENOENT`, giống hệt với phần hiện thực `rmSync` trước đây.
