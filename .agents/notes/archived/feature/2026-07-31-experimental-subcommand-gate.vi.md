# Agent Note: Subcommand thực nghiệm được canh gác bằng `--experimental` hoặc `DSH_EXPERIMENTAL=1`

Status: implemented
Archived: 2026-08-03

[English](2026-07-31-experimental-subcommand-gate.md) | 中文

## Problem

Hai entry `meta` và `upgrade` ghi trạng thái thực nghiệm vào tên: `dsh experimental-meta` và `dsh experimental-upgrade`. Tiền tố khiến mỗi lần gọi trở nên dài dòng, còn khi ổn định thì việc đổi tên lệnh sẽ phá vỡ mọi tham chiếu đến nó — trí nhớ cơ bắp, script và tài liệu đều bị ảnh hưởng. Trạng thái này nên được mang bởi một ngưỡng chọn tham gia (opt-in) rõ ràng, chứ không phải bởi tên gọi.

## Decision

`dsh experimental-meta` đổi thành `dsh meta`, `dsh experimental-upgrade` đổi thành `dsh upgrade`. Cả hai chỉ chạy khi truyền cờ `--experimental` tương ứng lúc gọi, hoặc trong môi trường có `DSH_EXPERIMENTAL=1`; nếu không, lệnh sẽ báo lỗi rõ ràng trên stderr và kết thúc với exit code 1, đồng thời chỉ ra cả hai cách chọn tham gia. Theo lập trường trước phát hành, tên cũ đã bị xóa và không có alias, `args.spec.ts` chốt việc từ chối chúng.

Ngưỡng này chia làm hai nửa, mỗi nửa có chủ sở hữu riêng. Nửa theo lệnh gọi là tùy chọn Commander `--experimental` trên mỗi subcommand thực nghiệm, được kiểm tra trong action của nó, sau khi từ chối các option cha bị rò rỉ. Nửa theo môi trường là một tham số boolean của `parseDshArgs`: `bin.ts` đọc `process.env.DSH_EXPERIMENTAL === '1'` tại ranh giới tiến trình (sau `loadEnv`, nên `.env` của project cũng có thể set nó) và truyền kết quả xuống dưới, nên sự phụ thuộc của parser vào môi trường được thể hiện rõ ràng trong chữ ký, test cũng không cần sửa biến môi trường. `1` là giá trị bật duy nhất — biến này là một lựa chọn tham gia rõ ràng, không phải kiểm tra truthy.

Sau này muốn ổn định một lệnh, chỉ cần xóa tùy chọn `--experimental` và lệnh gọi `requireExperimental` của nó; tên không đổi nữa.

## Testing

`args.spec.ts` chốt hai đường truy cập, từ chối tên trần, từ chối tên cũ, và từ chối option bị rò rỉ dưới điều kiện chọn tham gia qua môi trường. `built-bin.e2e.ts` chứng minh end-to-end trên entry đã lắp ráp: chẩn đoán ngưỡng trên stderr và exit code 1, cùng với `--experimental`, `DSH_EXPERIMENTAL=1` (không phải `DSH_EXPERIMENTAL=0`) đến được từ chối stdio đường ống của TUI — tức chốt tiếp theo sau cửa này. Hai lệnh bị canh gác này còn được xác minh tương tác trong tmux: `dsh meta --experimental` và `DSH_EXPERIMENTAL=1 dsh meta` khởi động TUI với thư mục checkout làm workspace, `DSH_EXPERIMENTAL=1 dsh upgrade` gieo skill `dsh-upgrade`.

## Alternatives considered

**Giữ tiền tố tên `experimental-`.** Bị từ chối theo chỉ dẫn của người dùng: tiền tố khiến mỗi lần gọi phải trả giá, và khi ổn định lại biến thành một lần đổi tên gây phá vỡ, thay vì chỉ xóa một ngưỡng.

**Cờ `--experimental` ở cấp cha (`dsh --experimental meta`).** Bị từ chối: giao diện mặc định cố ý giữ dạng thuần option và bật `enablePositionalOptions`, mọi option cha rò rỉ qua ranh giới subcommand đều bị coi là lệnh gọi gõ sai. Một cờ cấp cha chỉ được hai subcommand tiêu thụ, chính là dạng option rò rỉ mà adapter từ chối ở mọi nơi khác.

**Đọc `process.env` bên trong `parseDshArgs`.** Bị từ chối: repo này thực hiện xác thực tại ranh giới tiến trình, và giữ sự thuần khiết của các seam đã được kiểu hóa; nếu không, test phải sửa và khôi phục `process.env` trước/sau mỗi case.

**Chấp nhận bất kỳ giá trị `DSH_EXPERIMENTAL` không rỗng nào.** Bị từ chối: công tắc telemetry với vai trò kiểm soát riêng tư có xu hướng thà tắt nhầm còn hơn bật nhầm, nhưng ngưỡng thực nghiệm là một sự xác nhận — `DSH_EXPERIMENTAL=0` tuyệt đối không được kích hoạt lệnh mà nó chỉ định.

## Consequences

Lệnh gọi thường ngày rút ngắn thành `dsh meta --experimental` và `dsh upgrade --experimental`; các developer đã set `DSH_EXPERIMENTAL=1` trong môi trường có thể dùng trực tiếp `dsh meta`/`dsh upgrade`. `dsh --help` đánh dấu hai lệnh này là `(experimental)`. Trước khi lệnh ổn định, ngưỡng có giá là một cờ hoặc biến môi trường thêm vào; khi ổn định thì chỉ cần xóa ngưỡng, tên đã ở dạng cuối cùng.
