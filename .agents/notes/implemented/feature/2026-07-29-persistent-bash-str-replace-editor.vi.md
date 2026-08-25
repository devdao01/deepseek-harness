# Agent Note: Tool Bash bền vững và trình soạn thảo thay thế chuỗi

Status: implemented

[English](2026-07-29-persistent-bash-str-replace-editor.md) | 中文

## Vấn đề

Một số deployment cần schema Bash chỉ gọi một lần, đồng thời yêu cầu trạng thái shell được giữ lại xuyên các lượt model; số khác lại cần `str_replace_editor` kiểu Claude không phụ thuộc lựa chọn terminal. Buộc hai tool vào chung một chỗ hoặc đặt tên theo một baseline nào đó sẽ cản trở việc tái sử dụng và làm mờ quyền sở hữu cấu hình.

## Quyết định

`@deepseek-ai/dsh-tool-bash-persistent` tiêu thụ `ctx.terminals` và đăng ký một tool `bash(command)`. Nó tạo lười biếng một shell tương tác cho mỗi Agent chính xác, và tuần tự hóa các lời gọi của chủ sở hữu đó. Cwd, biến đã export, môi trường đã kích hoạt, hàm và tác vụ nền đều được giữ lại. Nhãn riêng ngẫu nhiên phân định output lệnh; scrollback được giữ lại sẽ phân trang về trước để khôi phục đúng tiền tố output thực của lệnh, nếu tiền tố đã bị vứt bỏ thì báo rõ ràng. Khi lệnh đã bọc kết thúc với trạng thái khác 0, sẽ append `[exit code: N]`; nếu shell kết thúc trước khi báo cáo trạng thái đó, thì đổi thành append `[shell exited: code N]`, `[shell killed by signal: SIG]`, hoặc khi backend không cung cấp cả exit code lẫn signal thì append `[shell exited]`. Giới hạn `maxOutputChars` giới hạn output lệnh được giữ lại, còn chẩn đoán cố định có thể khiến chuỗi trả về dài hơn. Timeout hoặc hủy sẽ đóng shell trước, tránh lần gọi tiếp theo tái sử dụng session có trạng thái không chắc chắn, kết quả timeout／exit mà model có thể thấy cũng sẽ nói rõ việc reset đó. Hủy luôn reset shell và bỏ kết quả, kể cả khi đã quan sát được nhãn trạng thái hoàn chỉnh, để không giữ lại thay đổi trạng thái mà model chưa từng thấy. Description có thể cấu hình mặc định chỉ khai báo sự thật bền vững, nên các khai báo như mirror mạng và package vẫn thuộc quyền sở hữu của deployment.

`@deepseek-ai/dsh-tool-str-replace-editor` tiêu thụ `ctx.fs` độc lập, đăng ký `str_replace_editor` bao gồm `view`, `create`, `str_replace` và `insert`. Nó cung cấp xem văn bản kèm số dòng, danh sách thư mục hai tầng đã lọc, thay thế literal duy nhất, ranh giới chèn chuẩn hóa và output có giới hạn. Đường dẫn phải tuyệt đối; xem file giữ nguyên ký tự tab trong nội dung, nên văn bản đã sao chép vẫn dùng được làm input thay thế literal hợp lệ; thay đổi giữ nguyên tab bên ngoài phạm vi chỉnh sửa được yêu cầu; schema công khai và lỗi chỉ dùng `old_str`. Nó có thể tổ hợp với Bash bền vững, Bash một lần, Bash sandbox hoặc không có shell.

`dsh-system-prompt` chấp nhận `includeHarnessIdentity: false`; `dsh-agent-spine-demo` sẽ chuyển tiếp cài đặt đó, và chấp nhận `toolBash: false`. Do đó deployment có thể có persona chính xác, và thay thế Bash gốc của spine, mà không đăng ký lặp prompt hoặc tool. Giá trị mặc định hiện có không đổi.

Cả hai plugin đều vào closure Python runtime. Closure của Bash bền vững còn bao gồm service PTY／backend cục bộ, cùng service sandbox mà backend đó yêu cầu. Vì `node-pty` trên macOS sẽ thực thi `spawn-helper` gốc, mỗi executable runtime macOS đã đóng gói đều mang theo một file đi kèm `-spawn-helper`; Linux dùng trực tiếp `forkpty`. Bản patch phiên bản cố định của `node-pty` sẽ kiểm tra `DSH_NODE_PTY_SPAWN_HELPER` trước, nên với bên tiêu thụ ngoài hiện đang cung cấp helper không đi kèm, biến đó vẫn là ghi đè thực sự. Khi không đặt ghi đè đó, patch sẽ giải quyết file đi kèm của executable đã đóng gói khi nó tồn tại, nếu không sẽ giữ cách tìm kiếm gốc trong lần chạy Node thông thường. Nếu helper thiếu hoặc không thực thi được, trình build macOS sẽ thất bại trước khi phát hành.

[Agent preset `minimal`](../../../../apps/cli/config/agent-presets/minimal/agent.cordis.yml) đi kèm sẽ tổ hợp hai plugin này, để thỏa mãn giao ước RL tương thích với Claude SWE. Local PTY realm của entry nó giữ registry, backend cục bộ và tool Bash bền vững; trình soạn thảo đăng ký cạnh realm đó, và dùng hệ thống file host. Preset sẽ cố định system prompt đầy đủ, theo chế độ trình bày tool của deployment, bỏ qua mọi bên tiêu thụ hướng tới model khác, và giữ service trình duyệt, Workspace, persistence, sandbox và quyền trên Web host dùng chung. Backend PTY cục bộ sẽ giải quyết chế độ sandbox hiệu lực của session khi tạo shell. Chỉ cần chủ sở hữu đó vẫn còn shell đang mở hoặc vẫn đang trong quá trình spawn, một chế độ quyền khác sẽ bị từ chối trước khi sự kiện session tương ứng được commit; trình soạn thảo tiếp tục chạy qua sandbox hệ thống file Web. Ranh giới tổ hợp này được [quyết định minimal-preset](../bug-fix/2026-08-10-minimal-preset-owns-rl-composition.md) giải thích.

## Phương án thay thế đã cân nhắc

**Một plugin tương thích tổ hợp duy nhất.** Bị bác bỏ, vì hai tool không phụ thuộc lẫn nhau, tên tổ hợp còn ràng buộc năng lực có thể tái sử dụng vào một baseline nào đó.

**Tái sử dụng Bash một lần.** Bị bác bỏ, vì `bash -c` không thể giữ cwd hay trạng thái môi trường xuyên các lần gọi.

**Lộ tool quản lý terminal.** Bị bác bỏ, vì open/send/read/close với một lời gọi `bash` bền vững duy nhất là hai không gian hành động model khác nhau.

**Sửa read/write/edit gốc.** Bị bác bỏ, vì điều đó sẽ bóp méo giao ước chung của chúng, thay vì thêm một trình soạn thảo có thể tổ hợp độc lập.

## Hậu quả

Profile có thể tái hiện Agent bên ngoài thông qua cấu hình persona và description, trong khi package nền vẫn giữ tính tổng quát. Bash bền vững cần một Agent sở hữu nó và một backend PTY thật; shell thoát, timeout hoặc hủy sẽ mất trạng thái. Trình soạn thảo giao chính sách an toàn và thay đổi cho stack hệ thống file đã mount. Web agent minimal giữ quyền Web, nhưng phải đóng shell bền vững trước mới đổi được chế độ quyền. Bên tiêu thụ wheel runtime vẫn không cần cài Node; wheel Linux chứa một executable, wheel macOS còn chứa helper gốc riêng của nó.
