# Agent Note: `dsh meta` khởi động TUI với checkout của harness làm workspace

Status: implemented

Archived: 2026-08-03

[English](2026-07-28-dsh-meta-source-workspace.md) | 中文

## Problem

`dsh` coi thư mục gọi lệnh là workspace, đây chính là lý do nó có thể hoạt động trên bất kỳ dự án nào. Nhưng vì vậy, phát triển chính dsh lại phải `cd` vào thư mục checkout trước — mà thư mục đó không phải một đường dẫn dễ nhớ: cài đặt từ mã nguồn sẽ đặt nó dưới một thư mục container, dưới dạng cây làm việc staging có đóng dấu thời gian (`~/.dsh/source/staging-<timestamp>`), và được symlink `current` trỏ tới, do đó đích sẽ thay đổi sau mỗi lần nâng cấp. Đoạn prompt `harness:source` đã *cho* agent biết vị trí mã nguồn của nó, bộ công cụ `cordis` cũng có thể sửa đổi runtime đó, nhưng con người vẫn phải tự tay xác định thư mục đó để bắt đầu một phiên trong đó.

## Decision

`dsh meta` khởi động TUI thông thường ở bất kỳ thư mục nào, với checkout của harness làm workspace.

Đích là `SOURCE_ROOT` trong `apps/cli/src/tui.ts` — `fileURLToPath(new URL('../../..', import.meta.url))`, lên ba cấp từ `apps/cli/{src,lib}` — hoàn toàn giống hằng số mà đoạn prompt `harness:source` dùng, do đó workspace và đường dẫn được cho mô hình biết không thể bị lệch nhau. Nó theo đường dẫn thực của bộ khởi chạy, nên symlink PATH qua `current` sẽ giải quyết về đúng cây làm việc staging đang có hiệu lực.

Cơ chế là một lần `process.chdir(workspace)` bên trong `runTui`, được canh gác bởi một tham số thứ ba tùy chọn, chỉ có nhánh phân phối `meta` mới truyền vào. Trong cây cấu hình đã bàn giao, cwd *chính là* seam của workspace: `examples/tui-agent/cordis.yml` suy ra cwd của phiên từ đó (`!!js process.cwd()`), thư mục gốc persist `./.sessions`, cũng như thư mục gốc theo dõi HMR (`root: ['.']`), do đó một lần chdir sẽ di chuyển cả ba cùng lúc, phiên meta sẽ rơi vào `.sessions/` bị gitignore bên trong thư mục checkout. Nó chạy sau khi cả hai lớp `.env` đã được tải — việc tải theo thư mục gọi lệnh của bin và lớp cá nhân — do đó thứ tự ưu tiên "giá trị đã có trong môi trường > dự án > cá nhân" không bị ảnh hưởng. Cả `DEFAULT_CONFIG` lẫn `SOURCE_ROOT` đều là đường dẫn tuyệt đối, và chế độ TUI không truyền snapshot mode, nên việc phân giải cấu hình không liên quan đến chdir.

`meta` luôn khởi động phiên mới, và không chấp nhận bất kỳ tùy chọn giao diện mặc định nào; tùy chọn duy nhất của nó là `--experimental` của [ngưỡng thử nghiệm](2026-07-31-experimental-subcommand-gate.md). `--config` sẽ khởi động các cây cấu hình khác nhắm vào workspace harness, đó là kịch bản `--config` của giao diện mặc định, không phải kịch bản của lệnh này; `-p` không mang tính tương tác, còn khôi phục thì qua `dsh --resume <id>` để vào lại chính workspace của phiên đã persist đó. Bất kỳ tùy chọn giao diện mặc định nào bị rò rỉ đều báo lỗi rõ ràng.

## Testing

`apps/cli/tests/args.spec.ts` chốt việc định tuyến của `meta`, việc từ chối mỗi tùy chọn giao diện mặc định bị rò rỉ, cùng việc từ chối tên cũ `experimental-meta`. Bản thân việc phân phối này là mã tổ hợp bên trong khối `v8 ignore` sẵn có của `bin.ts`.

Mode này không có bản chụp nhanh smoke PTY không cần khóa. Khung smoke sẽ cấp cwd tạm cho mỗi lần chạy, nhưng `dsh meta` cố ý chdir vào thư mục checkout thật, do đó smoke test sẽ ghi `.sessions/` vào cây làm việc thực giữa chừng test. Muốn bao phủ đúng cách cần một thư mục đích có thể tiêm vào — một seam chỉ dành cho test được thêm vào chỉ vì một dòng chdir, note này không chấp nhận điều đó.

Thay vào đó là xác minh tương tác. Khởi động từ `$HOME`, lệnh gọi công cụ `pwd` báo cáo đúng thư mục checkout đó, git phân giải về đúng nhánh của nó, log phiên rơi vào `.sessions/` của checkout đó (`~/.sessions` không bị đụng tới, cây làm việc cũng không còn sót lại gì chưa bị ignore), và `dsh` thông thường chạy từ thư mục khác vẫn dùng thư mục gọi lệnh.

## Alternatives considered

**Truyền workspace tường minh qua `boot` và cây cấu hình.** Cách này có thể tránh sửa đổi trạng thái cấp tiến trình, nhưng cấu hình đã bàn giao đọc cwd ở ba nơi (`!!js process.cwd()`, `persistenceRoot`, HMR `root`), mỗi nơi đều cần đường dẫn và khóa cấu hình riêng mới có thể giữ nhất quán. Chdir trước khi khởi động chỉ diễn đạt "đây chính là workspace" một lần duy nhất, ngay tại seam vốn đã mang ý nghĩa đó.

**Thêm cờ `--experimental-meta` vào giao diện mặc định.** Từ chối: giao diện mặc định chỉ thuần tùy chọn, để tránh subcommand xung đột với tham số vị trí; còn một cờ âm thầm đổi workspace đọc lên giống như một bổ nghĩa cho thư mục hiện tại, chứ không phải một đích khác. `meta` sánh ngang với `web` phù hợp với hình thái sẵn có.

**Phân giải `~/.dsh/source/current` thay vì đường dẫn thực của chính bộ khởi chạy.** Từ chối: khi gọi trực tiếp một `bin/dsh` không thuộc checkout đã cài đặt, nó sẽ lệch khỏi đường dẫn prompt `harness:source` — cho mô hình biết một thư mục gốc mã nguồn, nhưng lại làm việc trong một thư mục khác.

## Consequences

Mở phiên trên chính mã nguồn dsh trở thành việc chạy `dsh meta --experimental` ở bất kỳ đâu (dưới `DSH_EXPERIMENTAL=1` có thể chạy thẳng `dsh meta`), và workspace đó chắc chắn chính là thư mục checkout được cho mô hình biết. Lệnh này luôn khởi động phiên mới; sau đó, `dsh --resume <id>` thông thường sẽ khôi phục phiên đó và vào workspace đã persist của nó.

`runTui` có thêm một tham số thứ ba tùy chọn, do đó việc ghi đè workspace hiển thị rõ ràng trên chính hàm duy nhất sở hữu logic tổ hợp TUI, chứ không ẩn trong một bản sao thứ hai của nó.
