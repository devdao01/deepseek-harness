# Agent Note: Dọn dẹp đồng bộ các subprocess được quản lý khi host thoát

Status: implemented

[English](2026-08-11-synchronous-subprocess-exit-cleanup.md) | Tiếng Việt

## Problem

Local subprocess provider sở hữu cây process detached thông thường và terminal session, nhưng trước đây chỉ có thể chạm tới chúng qua Cordis dispose bất đồng bộ. Launcher khi gặp lỗi chí mạng có thể gọi `process.exit()` trước khi dispose hoàn tất: [fail-loud release](2026-07-31-fail-loud-releases-the-terminal.md) chờ tối đa hai giây, trong khi process cục bộ có thể có grace period chấm dứt dài hơn. Sau khi Node bước vào giai đoạn thoát đồng bộ, các Promise đang chờ xử lý và timer nâng cấp sẽ không tiếp tục chạy nữa, nên child process bỏ qua TERM có thể sống lâu hơn cả host, tiếp tục chiếm CPU, bộ nhớ hoặc port. Một số entry point ACP, JSON-RPC và SDK cũng không có root release callback.

Cam kết của subprocess seam công khai là chờ dừng hoàn toàn trong quá trình dispose bình thường — cam kết này là đúng đắn. Lỗi nằm ở một đường thoát host cuối cùng khác, nằm dưới seam, không nên làm suy yếu vòng đời bình thường, cũng không nên buộc mỗi launcher phải tự lưu quyền sở hữu process một lần nữa.

## Decision

`LocalSubprocessRuntime` cài một listener `exit` đồng bộ của Node trong chính Cordis effect của nó. Chỉ sau khi dispose bình thường quyết toán xong, cùng effect đó mới gỡ listener. Trong khi dọn dẹp bất đồng bộ vẫn đang chờ, các handle process thường và terminal vẫn được giữ lại trong tập hợp sống sẵn có của dịch vụ, nên giới hạn thoát bên ngoài ngắn hơn vẫn có thể nhìn thấy và buộc chấm dứt chúng. Khi dispose đang chờ báo cáo dọn dẹp thất bại, dịch vụ sẽ gọi cùng nhóm thao tác cuối cùng đồng bộ trước khi xóa tập hợp và gỡ listener.

Listener này dùng các thao tác cuối cùng riêng của phần cài đặt cục bộ; interface công khai `SubprocessHandle` và `SubprocessTerminalHandle` không chứa các thao tác này:

- Handle thường gửi ngay SIGKILL tới process group POSIX detached, hoặc trên Windows chạy đồng bộ `taskkill /PID <pid> /T /F`.
- Terminal handle gửi đồng bộ SIGKILL tới toàn bộ hậu duệ đã bắt được và hiện đang quan sát được, chấm dứt PTY root, rồi quét lại một lần nữa để chấm dứt các thành viên trở nên quan sát được trong khoảng thời gian đó.
- Dịch vụ cô lập lỗi của từng target riêng biệt và tiếp tục xử lý các handle còn lại. Callback không tạo Promise hay timer, không ghi diagnostic, cũng không thay đổi exit code hay error gốc.

Dispose bình thường tiếp tục dùng đường chấm dứt-trước-rồi-chờ-thoát của [subprocess seam](../architecture/2026-07-26-subprocess-seam.md): cây process thường nhận TERM trước, sau grace period đã cấu hình mới nhận KILL, và chờ mỗi lần dọn dẹp process thường hoặc terminal đạt trạng thái dừng hoàn toàn. Đường đồng bộ chỉ yêu cầu chấm dứt cuối cùng, không phát hành kết quả hoàn tất, cũng không tuyên bố rằng khi callback trả về thì cây process OS đã biến mất. Remote provider vẫn tiếp tục do sandbox của nó sở hữu độc lập, không kế thừa local Node listener.

| Đường thoát host | Hành động của local provider | Bằng chứng hoàn tất |
| --- | --- | --- |
| Cordis dispose bình thường | Chấm dứt hợp tác, nâng cấp có giới hạn, và chờ dọn dẹp process thường/terminal | Mỗi handle tự sở hữu đạt trạng thái dừng hoàn toàn trước khi dispose quyết toán |
| `process.exit()`, uncaught exception mặc định, hoặc unhandled rejection mặc định | Gửi tín hiệu cuối cùng đồng bộ tới tập hợp sống hiện tại của dịch vụ | Quan sát bên ngoài sau khi host thoát |
| Chấm dứt mặc định bởi `SIGTERM`, `SIGINT` hoặc `SIGHUP` khi chưa cài handler; `SIGKILL`; fatal OOM; `process.abort()`; native crash; hoặc mất điện | Thao tác trong tiến trình không thể chạy | Phải do supervisor bên ngoài, container hoặc quyền sở hữu OS chịu trách nhiệm; trừ khi ứng dụng cài signal handler thực hiện dispose hoặc gọi `process.exit()` |

## Verification

Parent test khởi động host TypeScript cô lập qua source launcher của repo, chờ đến khi có thể quan sát chính xác danh tính root và hậu duệ process rồi mới cho host đi vào từng đường chí mạng. Thoát trực tiếp, uncaught exception mặc định và unhandled rejection mặc định bao phủ cây process thường bỏ qua TERM; thoát trực tiếp còn bao phủ cả terminal root và hậu duệ thật. Parent test khẳng định loại thoát gốc của host, và chờ mọi process đã ghi nhận biến mất; dọn dẹp thất bại chỉ nhắm vào danh tính đã ghi nhận hoặc cây process Windows đã ghi nhận.

Bằng chứng unit chốt việc gửi process group POSIX đồng bộ và taskkill Windows, việc quét terminal trước và sau khi chấm dứt PTY root, dọn dẹp cuối cùng lặp lại, cô lập lỗi theo từng target, dispose TERM-rồi-KILL bình thường, việc giữ tập hợp sống trong khi chờ dispose, và việc gỡ listener sau dispose.

## Alternatives considered

**Chỉ dựa vào launcher release callback.** Bị từ chối, vì không phải entry point nào cũng cung cấp callback này, và release có giới hạn vẫn có thể kết thúc trước khi grace period và timer của subprocess provider hoàn tất.

**Gọi `terminate()` bất đồng bộ hiện có bên trong `exit` listener.** Bị từ chối, vì Node không chờ exit listener; sau khi callback trả về, Promise, timer, xả output và polling trạng thái dừng đều không thể hoàn tất.

**Thêm thao tác `forceKill()` thô vào subprocess handle công khai.** Bị từ chối, vì bên tiêu dùng chỉ cần một cam kết chấm dứt hợp tác duy nhất. Chấm dứt cuối cùng tức thời thuộc trách nhiệm cài đặt, chỉ dùng bởi chủ sở hữu đường thoát host của dịch vụ cục bộ.

**Giao toàn bộ chế độ lỗi cho supervisor bên ngoài.** Không chấp nhận đây là phương án duy nhất, vì Node cung cấp callback đồng bộ đáng tin cậy cho vài đường chí mạng phổ biến, và provider đã sẵn có target chính xác. Khi JavaScript không thể chạy runtime thì vẫn phải dựa vào quyền sở hữu bên ngoài.

## Consequences

Mỗi local subprocess service hợp lệ sẽ đóng góp một exit listener toàn tiến trình, và bị gỡ cùng effect của dịch vụ. Thoát chí mạng từ bỏ grace period, xả output và bằng chứng dừng trong tiến trình, đổi lại phát ra thao tác chấm dứt mạnh nhất khả dụng cục bộ trước khi host biến mất. Đảm bảo và chi phí của dispose bình thường giữ nguyên không đổi.

Listener không thể bao phủ các chế độ lỗi không chạy JavaScript, cũng không thể phát hiện hậu duệ terminal đã thoát trước khi provider quan sát lần đầu; khoảng trống quyền sở hữu độc lập đó vẫn được theo dõi bởi Issue #1726.
