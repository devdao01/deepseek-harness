# @deepseek-ai/node-addon-landlock-run

[English](README.md) | 中文

Một launcher [Landlock](https://landlock.io/) kiểu "tự giới hạn rồi mới exec", dùng để giới hạn subprocess trên Linux. Nó được phát hành dưới dạng các gói npm dựng sẵn theo từng nền tảng cùng một gói entry JS nhẹ; gói entry chịu trách nhiệm định vị file nhị phân và tuân theo quy ước CLI (giao diện dòng lệnh) của nó. Launcher này hướng tới các agent harness (khung tác tử) và các host khác cần chạy lệnh không tin cậy dưới ràng buộc allowlist hệ thống tệp, trong khi bản thân vẫn không bị giới hạn.

Công cụ này là **`landlock-run`**: một launcher [Landlock](https://landlock.io/) kiểu "tự giới hạn rồi mới exec" (viết dựa trên UAPI kernel gốc, khoảng 300 dòng C11, liên kết tĩnh với musl). Nó cài đặt ruleset Landlock lên chính mình, rồi `exec` lệnh được bọc; ruleset đó được kế thừa qua `execve`, nên lệnh và mọi tiến trình mà nó sinh ra đều chạy dưới giới hạn, còn tiến trình gọi vẫn không bị giới hạn. Nó dùng chiến lược fail-closed: nếu kernel không thể thực thi giới hạn, nó sẽ không chạy lệnh mà thoát ngay.

## Cài đặt

```sh
npm install @deepseek-ai/node-addon-landlock-run
```

Gói đã phát hành gồm một gói entry và các gói nền tảng tùy chọn:

```text
@deepseek-ai/node-addon-landlock-run
@deepseek-ai/node-addon-landlock-run-linux-x64
@deepseek-ai/node-addon-landlock-run-linux-arm64
```

Trường `os`/`cpu` của npm khiến trình cài đặt chỉ tải về gói nền tảng khớp. Hệ thống cố ý không cung cấp phương án dự phòng biên dịch lúc cài đặt: trên host không có gói nền tảng tương ứng, đường dẫn đã giải quyết sẽ không bao giờ tồn tại, việc probe sẽ báo `unusable`, và bên tiêu thụ xử lý theo hướng fail-closed.

## Cách dùng

```js
import { grantArgs, launcherPath, probe } from '@deepseek-ai/node-addon-landlock-run';

const launcher = launcherPath();
if (probe(launcher) !== 'unusable') {
  const argv = [launcher, ...grantArgs({ readOnly: ['/'], readWrite: ['/tmp/work'] }), '--', 'bash', '-c', command];
  // spawn argv with your process runner of choice
}
```

API công khai cố ý giữ tối giản:

- `launcherPath()`: đường dẫn tuyệt đối tới launcher của host hiện tại (cố ý không kiểm tra sự tồn tại; kết quả probe mới là tín hiệu khả dụng).
- `probe(launcher?, { timeoutMs? })`: probe thực thi giới hạn theo tính năng, trả về `'full' | 'partial' | 'unusable'`.
- `grantArgs({ readOnly?, readWrite? })`: argv cấp quyền cho launcher; bất cứ điều gì không được cấp đều bị từ chối.
- `LAUNCHER_BIN` và `LAUNCHER_FAILURE_EXIT` (125): các hằng số quy ước. Subprocess exec thành công cũng có thể trả về 125, nên bên tiêu thụ phải thấy cả chẩn đoán nghiêm trọng lẫn trạng thái đó mới được quy kết kết quả là launcher thất bại.

Quy ước nhị phân đầy đủ (cú pháp argv, mã thoát, dòng báo cáo) được cố định tại [docs/cli-contract.md](docs/cli-contract.md).

## Phạm vi hỗ trợ

Hỗ trợ linux-x64 và linux-arm64, với kernel đã bật Landlock (5.13+; cấp độ ABI quyết định thực thi là `full` hay `partial`, xem chi tiết tại [docs/support-matrix.md](docs/support-matrix.md)). Các nền tảng khác cố ý không có gói tương ứng: bên tiêu thụ sẽ chạy backend giới hạn khác trên các nền tảng đó.

## Phát triển

```sh
corepack enable
pnpm install
pnpm build:ts        # entry packages → lib/
pnpm build:native    # this Linux architecture's binaries (apt-get install musl-tools)
pnpm test
```

File nhị phân bị git bỏ qua, và được build gốc theo từng kiến trúc: build cục bộ chỉ dựng phiên bản cho máy hiện tại, còn các build do runner CI theo từng kiến trúc tạo ra mới là căn cứ cho bản phát hành chính thức. Quy trình phát hành chi tiết tại [docs/release.md](docs/release.md).
