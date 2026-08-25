# Agent Note: Hỗ trợ stdin và env bổ sung trên bash seam

Status: implemented

[English](2026-06-30-bash-stdin-env-trusted-plugin-api.md) | Tiếng Việt

## Vấn đề

Hệ thống con hook chạy các lệnh hook bên ngoài theo cách của Claude Code và Codex: hook là một lệnh shell nhận payload sự kiện qua **JSON trên stdin**, và đọc ngữ cảnh từ một số **biến môi trường** (`CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `PLUGIN_ROOT`……). harness đã có sẵn một executor lệnh hoàn chỉnh phía sau capability seam `ctx.shell` ([dsh-shell](../../../../packages/shell/shell) → [dsh-bash-local](../../../../packages/shell/bash-local)), với khả năng kết thúc process group, cắt bớt/spill output và xóa credential. Tái sử dụng nó để chạy hook nghĩa là tầng cầu nối hook không cần triển khai lại cơ chế subprocess cấp thấp — nhưng seam này trước đây không thể ghi vào stdin hay đặt env bổ sung. Thay đổi này thêm hai input đó.

`stdin` và `env` không tạo ra capability mới cho model, vì cú pháp shell thông thường đã cung cấp cả hai. Credential môi trường được bảo vệ bởi cơ chế xóa sub-environment của `dsh-bash-local`, không phải bằng cách giấu các trường Service Definition này; tham số công cụ hướng tới model là JSON tĩnh, không mở rộng biến shell. Do đó các trường này phục vụ cho bên gọi trong tiến trình được tin cậy (như tầng cầu nối hook), những bên cần truyền input có cấu trúc và biến `CLAUDE_*` mà không phải nhúng chúng vào văn bản shell mà model nhìn thấy. Quy tắc biến môi trường xem tại [defensive-patterns.md](../../../../docs/defensive-patterns.md).

## Quyết định

Thêm **đồng thời** `stdin?: string` và `env?: Record<string, string>` vào `ShellExecRequest` (request phía model/plugin) và `ShellExecSpec` (spec đã resolve mà `run`/`start` tác động lên), và truyền chúng xuyên suốt trong `dsh-bash-local`: `resolve()` truyền nguyên vẹn, `run()`/`start()` truyền chúng cho `runBash`, hàm này ghi byte vào stdin của tiến trình con và gộp env bổ sung.

Ba lựa chọn có chủ đích:

1. **Công cụ phía model không phơi bày `stdin` và `env`.** Cú pháp shell đã bao phủ các nhu cầu này, tham số trùng lặp chỉ làm tăng bề mặt interface mà không mang lại cách ly quyền. Công cụ chỉ dựng request từ tham số model đã khai báo, signal và owner; bên gọi trong tiến trình được tin cậy có thể đặt trực tiếp trường request. Biến riêng của harness dùng kênh `dshEnv` tách biệt do [quyết định về môi trường được quản lý](../feature/2026-07-10-agent-session-identity-and-log-location.md) quy định, nên `env` thông thường không thể thay thế chúng.

2. **`env` được gộp sau bước xóa credential, nên các entry mà bên gọi đặt tường minh sẽ thắng ngay cả khi tên có hình dạng credential.** Quyết định về namespace quản lý tiếp theo xử lý `DSH_*`: các entry env dạng này bị loại bỏ, `dshEnv` được tin cậy được gộp cuối cùng, nên entry `env` thông thường không bao giờ có thể ghi đè giá trị quản lý. Thứ tự đầy đủ là `scrub(process.env, including DSH_*)` → `ENV_OVERRIDES` → `env` thông thường → `dshEnv`.

3. **`stdin`/`env` trên spec đã resolve là required-absent-OK (optional thông thường), chứ không phải required-but-nullable như `owner`.** `owner` là required-but-nullable vì owner thiếu *một cách âm thầm* sẽ tạo ra một tác vụ vô chủ, có thể đọc xuyên session — một rủi ro an toàn mà `undefined` tường minh có thể phòng ngừa. `stdin`/`env` không có rủi ro đó: thiếu nghĩa là "không stdin / không env bổ sung", đây là trường hợp thông thường an toàn (áp dụng cho mọi lệnh gọi do model điều khiển). Do đó chúng giữ nguyên optional thông thường, nhất quán với `signal`.

`dsh-bash-local` chỉ tạo pipe stdin khi có byte cần ghi; nếu không, fd 0 vẫn là `/dev/null`, giữ hành vi trước đây. Nó ghi byte rồi đóng pipe. `EPIPE` sinh ra khi tiến trình con thoát mà chưa đọc bị bỏ qua, vì mã thoát và output của lệnh mới quyết định kết quả.

## Phương án thay thế đã cân nhắc

**Xóa bí mật môi trường có thể cấu hình.** Bị bác bỏ, là nhu cầu suy đoán. Bên gọi được tin cậy có thể cung cấp tường minh giá trị cần thiết sau bước xóa, không cần làm yếu đi bảo vệ môi trường mặc định.

## Hậu quả

Tầng cầu nối hook truyền payload JSON và biến đặc thù của hook qua bash seam sẵn có, giữ nguyên hành vi kết thúc process group, cắt bớt và spill. Hành vi hướng tới model không đổi, công cụ bash vẫn là chủ sở hữu duy nhất của việc dựng request cho lệnh gọi do model điều khiển. Từ vựng liên quan xem tại [tham chiếu cấu trúc dữ liệu bash](../../../../docs/subsystems/shell.md).
</content>
