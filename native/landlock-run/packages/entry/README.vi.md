# @deepseek-ai/node-addon-landlock-run

[English](README.md) | 中文

Launcher Landlock kiểu "tự giới hạn rồi mới exec" dùng để giới hạn subprocess trên Linux: gói entry này định vị file nhị phân dựng sẵn cho nền tảng tương ứng, chạy probe thực thi giới hạn theo tính năng, và dựng argv cấp quyền của nó. Bên tiêu thụ không cần tự viết cờ launcher hay tự phân tích output của launcher.

```js
import { grantArgs, launcherPath, probe } from '@deepseek-ai/node-addon-landlock-run';

const launcher = launcherPath();
if (probe(launcher) !== 'unusable') {
  const argv = [launcher, ...grantArgs({ readOnly: ['/'], readWrite: ['/tmp/work'] }), '--', 'bash', '-c', command];
}
```

Launcher cài đặt ruleset Landlock lên chính mình, rồi `exec` lệnh được bọc; ruleset đó được kế thừa qua `execve`, nên toàn bộ cây tiến trình đều chạy dưới giới hạn. Bất cứ điều gì không được cấp đều bị từ chối; khi launcher thất bại, nó thoát với mã `125` và không chạy lệnh: dùng chiến lược fail-closed, không bao giờ cho phép chạy khi thất bại. Quy ước nhị phân được cố định tại `docs/cli-contract.md` của repo; mã nguồn C được phân phối kèm tarball này dưới dạng `src/main.c` để tiện kiểm toán.

Gói nền tảng (optional dependency được chọn theo `os`/`cpu`, bên trong không chứa JavaScript): `@deepseek-ai/node-addon-landlock-run-linux-x64`, `@deepseek-ai/node-addon-landlock-run-linux-arm64`. Trên host thiếu gói tương ứng, `launcherPath()` trả về một đường dẫn cố định nhưng không tồn tại, `probe()` báo `'unusable'`; hệ thống cố ý không cung cấp phương án dự phòng biên dịch lúc cài đặt.
