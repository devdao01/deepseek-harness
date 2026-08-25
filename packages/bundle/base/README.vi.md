# `@deepseek-ai/dsh-base`

[English](README.md) | Tiếng Việt

Lõi dsh dùng chung, được giao dưới dạng gói tổ hợp profile: [`cordis.patch.yml`](cordis.patch.yml) chèn toàn bộ các dòng plugin nền tảng — bộ điều hợp model, lựa chọn [`agent-default-model`](../../core/agent-default-model/README.md) dùng chung, công cụ, lưu trữ bền vững, chính sách, settings/credentials, telemetry và provider subagent cấp host — vào bên trên gốc profile rỗng, làm lớp đầu tiên trong danh sách `dsh.profile.bundles` của mỗi profile. Bundle này không phụ thuộc vào cũng không gắn provider Codex và Claude Code tùy chọn; Profile nào chọn tích hợp sản phẩm sẽ cài đặt provider mục tiêu và gắn nó một lần ở host plane (mặt phẳng host), còn Agent Preset quyết định agent của riêng nó có nhận công cụ ủy quyền hướng model tương ứng hay không. Các lớp gói tổ hợp sau (ví dụ [`dsh-web-app`](../web-app/README.md)) và `cordis.patch.yml` của profile người dùng ghi đè các dòng này theo id; patch sẽ thay thế toàn bộ `config` của dòng mục tiêu, vì vậy các giá trị riêng cho từng chế độ nằm trong gói tổ hợp của chế độ đó, không nằm ở đây. Gói này không có API thời gian chạy; bộ tổ hợp profile giải quyết patch qua trường `dsh.bundle.patch` trong manifest (tệp khai báo metadata), không bao giờ qua code.

Patch tự cổng theo nền tảng (platform-gate) cho hai ngăn xếp shell: `bash-sandbox`/`tool-bash` mang `disabled: !!js process.platform === 'win32'` (bash không có runner Windows), dòng song sinh của chúng `pwsh-sandbox`/`tool-pwsh` với biểu thức phủ định chỉ gắn trên win32 — cùng một tệp patch, mỗi host gắn đúng một ngăn xếp shell. Mặt quyền hoàn toàn nhất quán với POSIX: `sandbox`/`sandbox-policy` thực thi chính sách hiệu ứng tệp qua runner token bị hạn chế bởi Windows ACL (chuỗi win32 của `dsh-sandbox-local` → `@deepseek-ai/dsh-sandbox-windows-acl`), bộ chuyển đổi quyền và service approval chạy nguyên vẹn, `fs-sandbox` tiếp tục rào chắn việc ghi `ctx.fs` — nếu gắn `dsh-fs-local` bên cạnh nó sẽ đăng ký `ctx.fs` trùng lặp và thất bại khi tải. Ai ưa thích trình thực thi pwsh cục bộ không bị ràng buộc sandbox, hoặc host Windows truy cập đầy đủ, có thể ghi đè các dòng này qua `cordis.patch.yml` của profile hoặc home riêng (công thức khôi phục bash phải đầy đủ: vô hiệu hóa `pwsh-sandbox`/`tool-pwsh` và bật lại `bash-sandbox`/`tool-bash` — hai họ trình thực thi đăng ký cùng một service `bash`, công thức không đầy đủ sẽ báo lỗi ngay khi tải). Host POSIX thấy dòng pwsh bị vô hiệu hóa.

Tập hợp các dòng và cơ sở thiết kế của chúng được viết dưới dạng chú thích nội tuyến trong tệp patch; [sơ đồ tổ hợp được tạo tự động](../../../apps/cli/composition.md) đảm nhiệm việc render nó.

## Trải nghiệm Model

Tạo ảnh hưởng gián tiếp thông qua các dòng được chèn vào: gói tổ hợp này chọn nền prompt không có persona, tập hợp công cụ và bộ điều hợp DeepSeek được giao kèm bản phát hành, để các gói tổ hợp theo chế độ đặc thù hóa thêm; bản thân nó không đóng góp bất kỳ văn bản nào model có thể nhìn thấy.

#### Tác động KV Cache

Không có tác động trực tiếp; tác động của mỗi dòng được chèn thuộc trách nhiệm của gói sở hữu nó.

## Hạn chế đã biết và công việc hoãn lại

- **Patch thay thế toàn bộ `config` của dòng**: ghi đè profile phải nhắc lại mọi trường của dòng đó cần giữ; không có lớp hợp nhất sâu (deep merge).
- **Ủy quyền thư mục tạm trên Windows là thư mục con riêng theo từng session** — `workspace-write` giới hạn việc ghi vào workspace và thư mục con temp riêng của session (`<temp>\dsh-<hash>`, TMP/TEMP của tiến trình con bị hạn chế sẽ được ghi đè); `read-only` không cấp bất kỳ quyền ghi thư mục tạm nào. Xem `@deepseek-ai/dsh-sandbox-windows-acl`.
