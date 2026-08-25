# @deepseek-ai/dsh-subprocess

[English](README.md) | 中文

Seam tiến trình con (`ctx.subprocess`) là phần tiến trình của một thế giới thực thi. `SubprocessRuntime` trừu tượng công khai việc tìm kiếm file thực thi, `spawn` được quản lý thông thường và một nguyên thủy (primitive) tiến trình terminal; từ vựng của nó bao gồm stdio thô/thu thập, handle tiến trình và terminal, fact khi thoát, dọn dẹp cây tiến trình/session, cùng namespace môi trường `DSH_*` được quản lý. Bản triển khai cục bộ nằm ở [`dsh-subprocess-local`](../subprocess-local/README.md).

## Quy ước

- `spawn(spec)` trả về ngay một handle đang hoạt động; `done` sẽ resolve với fact khi thoát ngay khi tiến trình đóng lại (`SubprocessOutcome` không mang theo đầu ra, cũng không mang theo phân loại nguyên nhân), chỉ reject khi thất bại ở tầng spawn.
- Thư mục làm việc spawn và đường dẫn file thực thi thuộc về thế giới thực thi của provider. `resolveExecutable(command, env?, signal?)` xác thực lệnh tuyệt đối, hoặc phân giải tên trần dựa theo PATH đã làm sạch của thế giới thực thi đó cộng với override tường minh.
- Spec hoàn toàn tường minh (argv, cwd, cách xử lý (disposition) stdio theo từng luồng, thời gian ân hạn), vì các giá trị mặc định thay đổi theo từng lần triển khai thuộc về cấu hình của bên gọi, chứ không thuộc về một giá trị mặc định ẩn nào đó của dịch vụ tiến trình con (việc tách request/spec của `dsh-shell` là template thuộc về quy tắc này). `argv` không bao giờ đi qua trình thông dịch shell; bên tiêu thụ cần shell tự truyền `['bash', '-c', command]`.
- stdio theo từng luồng áp dụng kiểu Node: `'pipe'` đưa luồng thô cho bên gọi tự phân khung giao thức (JSON-RPC của LSP, ndjson của ACP (Agent Client Protocol)), `'inherit'` truyền thẳng descriptor tiến trình cha để mang đầu ra chẩn đoán, chế độ thu thập (collect) `{ maxBytes, spill? }` sẽ buffer một đoạn đuôi có giới hạn, cộng thêm một file spill toàn luồng tùy chọn. Bộ đọc của chế độ thu thập chấp nhận offset byte của toàn luồng và không bao giờ tiêu thụ, nên các bộ đọc độc lập sẽ không tranh mất phần gia tăng của nhau; lần đọc có offset trượt ra khỏi cửa sổ đuôi trong bộ nhớ được đánh dấu là `lossy`, và trỏ tới file spill nếu nó tồn tại. Đầu ra đã thu thập vẫn đọc được sau khi kết toán.
- Việc chấm dứt trên mỗi nền tảng đều có phạm vi là cây tiến trình (POSIX dùng nhóm tiến trình detached với tiến trình con trực tiếp làm phương án dự phòng; Windows dùng `taskkill /T`): `terminate()` (động từ chấm dứt duy nhất) thực hiện leo thang SIGTERM→thời gian ân hạn→SIGKILL (idempotent, cũng được điều khiển bởi tín hiệu abort của spec, là no-op sau khi cây tiến trình đã chết); `waitForExit(signal?)` quan sát trạng thái sống của toàn bộ cây tiến trình, giúp nấc thang tháo dỡ (teardown) riêng của bên tiêu thụ chỉ bước sang tầng kế tiếp khi đã thực sự dừng hẳn hoàn toàn. Bộ quản lý chỉ phản hồi việc hủy bỏ, nhưng không bao giờ phán quyết nguyên nhân (deadline, nấc thang tháo dỡ và phân loại nguyên nhân thuộc về bên gọi).
- `spawnTerminal(spec)` là nguyên thủy phi-pipe duy nhất. Handle của nó chịu trách nhiệm về PTY thật, I/O văn bản UTF-8, kiểm tra/gửi tín hiệu nhóm tiến trình foreground, và một thao tác `terminate()` cần được chờ; thao tác đó khiến từng thành viên session mà provider vẫn quan sát được dừng hẳn hoàn toàn, và kết toán các lời gọi handle đang diễn ra; provider sẽ ghi lại các giới hạn khả năng quan sát đặc thù của nền thực thi. Tín hiệu trong spec chỉ hủy việc cấp phát; một khi handle đã được phát hành, nó chịu trách nhiệm về vòng đời của chính mình. Khi tiến trình cấp cao nhất thoát, luồng đầu ra kết thúc sau phần đầu ra đã xếp hàng; nếu tầng truyền tải vẫn đang hoạt động mà gặp sự cố, sẽ khiến `done` bị reject. Các thao tác này được giữ như một nguyên thủy của nền thực thi, vì pipe thông thường không thể cấp phát terminal điều khiển hay dọn dẹp thành viên terminal session; trạng thái sẵn sàng, scrollback và chính sách chủ sở hữu vẫn thuộc về bên tiêu thụ PTY.
- `scrubbedParentEnv()` / `SENSITIVE_ENV_PATTERN` là định nghĩa duy nhất, dùng chung cho việc xóa môi trường: tên có dạng giống credential trong môi trường và tên `DSH_*` đều sẽ bị loại bỏ, `env` tường minh được hợp nhất sau bước xóa này. Cả spawn thông thường cục bộ lẫn spawn terminal đều áp dụng định nghĩa này; các tầng truyền tải SDK tự quản lý spawn của riêng mình có thể import trực tiếp nó.
- Dispose (giải phóng tài nguyên) của chính dịch vụ sẽ chấm dứt mọi tiến trình được quản lý còn đang chạy và chờ chúng thoát ra.

Xem [trang subsystem tiến trình con](../../../docs/subsystems/subprocess.md) và [Agent Note về seam](../../../.agents/notes/implemented/architecture/2026-07-26-subprocess-seam.md).

## Trải nghiệm model

Ảnh hưởng gián tiếp qua Consumer (hiện tại là nhóm bộ thực thi bash phía sau `dsh-tool-bash`); toàn bộ việc render đầu ra và vòng đời tiến trình hướng tới model đều thuộc về Consumer.

#### Ảnh hưởng KV Cache

Không trực tiếp làm thất hiệu KV Cache; thay đổi tiền tố request thuộc trách nhiệm của bên tiêu thụ nêu trên.

## Hạn chế đã biết và công việc hoãn lại

- **Spawn do SDK quản lý vẫn nằm ngoài dịch vụ**: các tầng truyền tải SDK có spawn nội bộ riêng không thể định tuyến lời gọi đó qua dịch vụ này; nó vẫn có thể import `scrubbedParentEnv`, để chính sách môi trường giữ một nguồn duy nhất.
- **Nấc thang tháo dỡ thuộc về bên tiêu thụ**: seam này chỉ cung cấp động từ tín hiệu và việc chờ cây tiến trình sống, không cung cấp sẵn chuỗi dừng hẳn; mỗi bên tiêu thụ ngoài tiến trình tự mã hóa cách phối hợp với tiến trình con của mình (nấc thang của backend ACP mở đầu bằng stdin EOF là template trong repo).
