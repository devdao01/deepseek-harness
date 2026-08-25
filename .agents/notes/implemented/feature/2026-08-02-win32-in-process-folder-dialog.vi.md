# Agent Note: Bộ chọn thư mục Win32 chuyển sang tiến trình con dùng koffi

Status: implemented

[English](2026-08-02-win32-in-process-folder-dialog.md) | Tiếng Việt

## Vấn đề

Tầng chính của bộ chọn thư mục trên Windows trước đây là một script PowerShell được spawn bao quanh `FolderBrowserDialog` của WinForms: chỉ những máy tình cờ có cài PowerShell 7 mới có hộp thoại hiện đại; một chỗ hồi quy — PowerShell 6 phân giải được nhưng không có WinForms (exit code 1 chứ không phải `ENOENT`, nên nhánh dự phòng 5.1 không bao giờ được kích hoạt); `SetProcessDPIAware` bị chặn trần ở mức DPI hệ thống; và hành vi của bộ chọn phụ thuộc vào máy đó cài những shell nào, chứ không phụ thuộc vào chính Windows.

## Quyết định

`packages/host/directory-picker-native` giờ mở `IFileOpenDialog` (`FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR`) ngay trong tiến trình thông qua koffi — vốn đã là workspace dependency của phần mã `win32.ts` khác trong repo — làm tầng chính cho win32. Phiên COM chạy trong một tiến trình con được spawn, nên lời gọi modal `Show` không bao giờ chặn vòng lặp sự kiện của host; tiến trình con báo cáo id luồng native của mình trước khi chặn, và tầng driver xử lý yêu cầu hủy bằng cách liên tục gửi `WM_CLOSE` tới các cửa sổ của luồng đó (`EnumThreadWindows`), rồi kết thúc cưỡng bức tiến trình con khi hết ngân sách chờ đóng. Hộp thoại là cửa sổ đầu tiên của tiến trình con, nên Windows tự kích hoạt nó, không cần lời gọi đưa ra tiền cảnh thủ công. Luồng của tiến trình con bật mức nhận biết DPI theo luồng tốt nhất mà máy chủ chấp nhận (`SetThreadDpiAwarenessContext`, xếp tầng theo per-monitor-v2 → per-monitor → system-aware và kiểm tra giá trị trả về), nghiêm ngặt tốt hơn mức trần DPI hệ thống của script; DPI vẫn là best-effort thuần về mặt hình thức — máy chủ không chấp nhận mức nào trong số đó vẫn nhận được hộp thoại hiện đại chứ không bị hạ cấp. Việc chia tách module giúp độ phủ trung thực trên mọi máy chủ: `win32-dialog-logic.ts` (thuần về trình tự) và `win32-dialog.ts` (driver) có thể test bằng fake trên mọi nền tảng; `win32-dialog-bindings.ts` được test đối chiếu với một thế giới COM `koffi` giả lập (kỹ thuật của `dsh-session-persistence-jsonl`); máy chủ POSIX chạy đường ống spawn thật và kiểm chứng rằng nó từ chối do koffi không nạp được; máy chủ win32 chạy smoke test mở hộp thoại thật rồi đóng nó bằng thao tác hủy. Chuỗi PowerShell tồn tại trước tầng này đã bị xóa (xem [xóa chuỗi](../simplification/2026-08-04-drop-windows-powershell-picker-fallback.md)): tầng này không có nhánh dự phòng.

## Các phương án thay thế đã cân nhắc

- **Chương trình trợ giúp native biên dịch sẵn (họ `native/`, ví dụ `@deepseek-ai/node-addon-landlock-run`).** Bác bỏ: thêm một họ package npm nữa, cấu hình môi trường MSVC và kênh build/phát hành cho Windows — chỉ để ship khoảng 150 dòng mã C mà repo hiện chưa kiểm chứng được qua CI (CI hiện tại không có kênh Windows thật); koffi cung cấp đúng giao diện COM đó mà không thêm chuỗi cung ứng nào.
- **Plugin N-API trong tiến trình.** Bác bỏ: cùng lý do CI/toolchain, lại còn phải tự bảo trì mã C++ xử lý luồng STA và message pump, trong khi tiến trình con + koffi diễn đạt được bằng TypeScript.
- **Giữ PowerShell làm tầng chính và dò phiên bản.** Bác bỏ: bộ chọn vẫn bị hình thái đóng gói của shell bắt làm con tin (6 với 7, alias Store, profile), và máy không có pwsh vẫn chỉ dùng được hộp thoại cũ của 5.1; chỉ mỗi thay đổi mở rộng điều kiện kích hoạt nhánh dự phòng là được đưa vào tầng dự phòng.
- **Gọi modal chặn trên luồng chính.** Bác bỏ thẳng: máy chủ web phải tiếp tục phục vụ RPC trong lúc hộp thoại đang mở.

## Hệ quả

- Mọi máy Windows đều có hộp thoại hiện đại với mức nhận biết DPI tốt nhất mà nó hỗ trợ (per-monitor-v2 từ 1703 trở lên), bất kể có cài PowerShell hay không.
- Việc render hộp thoại thật và luồng hoàn tất lựa chọn vẫn cần kiểm tra thủ công trên Windows (smoke test tự đóng chứng minh mở/hủy/dọn dẹp).
- Các slot vtable COM và GUID được dùng là ABI Windows đã đóng băng (từ Vista); sai chữ ký koffi có thể gây vi phạm truy cập native, nhưng bị giới hạn trong tiến trình con của hộp thoại — tiến trình Node của host vẫn sống, và lỗi được báo cáo nguyên trạng (không có tầng dự phòng; xem [xóa chuỗi](../simplification/2026-08-04-drop-windows-powershell-picker-fallback.md)). Test cố định ABI với koffi giả lập và smoke test win32 thật tồn tại chính là để bắt loại lỗi này trước khi ship.
- Đường dẫn nhị phân đã đóng gói — file thực thi sau khi đóng gói tự spawn chính nó dưới dạng entry hộp thoại — không được bất kỳ test tự động nào phủ: phía mã nguồn và `lib/worker.cjs` được build dưới node thường đã được phủ, còn phần spawn của bản đóng gói được hoãn lại cho lộ trình Windows CI.
