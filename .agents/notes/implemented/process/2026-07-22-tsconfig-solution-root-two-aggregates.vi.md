# Agent Note: Thống lĩnh hai aggregate program bằng một file solution root

Status: implemented

[English](2026-07-22-tsconfig-solution-root-two-aggregates.md) | Tiếng Việt

## Vấn đề

Việc tách GUI đã đưa vào một aggregate program thứ hai (`tsconfig.client.json`, xem [RFC phân lớp](../architecture/2026-07-19-gui-layering-and-rpc-protocol.md)), `tsconfig.json` gốc thì tiếp tục kiêm nhiệm vai trò aggregate phía host, còn `tsconfig.build.json` vẫn là quyển sổ cái emit toàn phần thứ ba được duy trì thủ công. Ba nơi song song cùng tồn tại, tạo ra bốn điểm bất đối xứng cụ thể:

- Danh sách references cho type-check và cho build dần lệch nhau (`packages/goal/command-goal` nằm trong đồ thị type-check nhưng không nằm trong đồ thị build).
- Hook pre-push của lefthook chỉ chạy `tsc -b tsconfig.json`, nên lỗi kiểu phía client vượt qua điểm kiểm tra cục bộ, mãi tới CI mới lộ ra.
- tsserver chỉ phát hiện cấu hình có tên `tsconfig.json`, file test phía client không nằm trên bất kỳ chuỗi cấu hình nào có thể phát hiện được, nên rơi về inferred project, vừa không có paths, vừa sai cả lib/jsx.
- Mỗi cấu hình vitest trỏ tới ba nguồn resolve khác nhau (`tsconfig.vitest.json`, cấu hình gốc, cộng thêm một chỗ alias viết tay).

## Quyết định

Một file solution root, hai đơn vị kiểm tra, một cặp base dùng chung, không còn cấu hình build hoặc vitest riêng:

| File | Vai trò | Có tạo thành program không? |
|---|---|---|
| `tsconfig.json` | File solution root: `extends` base, `files: []`, hai references; đồng thời là đồ thị `tsc -b tsconfig.json` toàn repo, entry point của tsserver, và cấu hình được các consumer get-tsconfig (tsx chạy `examples/`, `scripts/`, code block hàng rào trong tài liệu) chọn gần nhất, các import workspace trần của nó được resolve qua `paths` kế thừa | Không |
| `tsconfig.base.json` | compilerOptions dùng chung và mapping `paths` source code; kiêm vai trò mặt tiền (facade) resolve cho vite-tsconfig-paths (không có `include`, nên có hiệu lực với mọi bên import) | Không |
| `tsconfig.base.client.json` | Hình thái compile phía trình duyệt (`jsx: react-jsx`, DOM lib, `types: []`), được aggregate client và mỗi package `packages/client/*` dùng chung | Không |
| `tsconfig.host.json` | Aggregate gốc cũ được chuyển nguyên trạng vào: các package phía host, examples, test, scripts, website; loại trừ `packages/client` | Có |
| `tsconfig.client.json` | Các package client và test của chúng; kế thừa `tsconfig.base.client.json` qua `extends` | Có |

Nguyên tắc nền tảng của toàn bộ phương án: **xung đột declaration merging của cordis `Context` chỉ tồn tại bên trong cùng một `ts.Program`, không bao giờ xảy ra trong quá trình resolve module.** File solution không tạo thành program, nên việc tham chiếu tới hai aggregate cùng lúc từ một file gốc không khiến declaration merging của hai bên va chạm; vite-tsconfig-paths chỉ đọc `paths` và `include`, bỏ qua toàn bộ thông tin kiểu, nên một mặt tiền có thể phủ cả hai bên. Cách duy nhất sẽ nổ là ép hai bên vào cùng một program, từ đó suy ra hai nguyên tắc dẫn xuất: `tsconfig.base.json` không bao giờ được thêm `include`/`files` (nếu không sẽ rò rỉ vào mọi package kế thừa nó, và thu hẹp phạm vi mặt tiền); mỗi consumer `ts.Program` cấp toàn repo (`scripts/ts-project.ts`, chế độ độc lập của doc-typecheck) đều phải khởi tạo tường minh từ `tsconfig.host.json` hoặc `tsconfig.client.json`, không bao giờ dùng solution gốc. Generator dựa trên program và gate ngữ nghĩa cố tình chỉ ở lại phía host; gate dựa trên program phía client chỉ được đưa vào khi nhu cầu thực sự xuất hiện.

`tsconfig.json` gốc vẫn là entry point solution thực thi tường minh toàn bộ đồ thị Project Reference, hook pre-push của lefthook dùng `tsc -b tsconfig.json --pretty false` để bao phủ tăng dần cả hai bên. Lệnh `build` và `typecheck` của repo chạy theo thứ tự Host rồi Client, do Client phụ thuộc vào quy ước Remote do tsdown của Host sinh ra; việc điều phối cụ thể do [API Remotes Build Note](2026-08-08-api-remotes-generated-contract-build.md) chịu trách nhiệm. `tsconfig.build.json` và `tsconfig.vitest.json` đã bị xóa; mọi cấu hình vitest đều trỏ vite-tsconfig-paths tới `tsconfig.base.json`.

File solution root `extends` base một cách có chủ đích: `examples/` và `scripts/` không có tsconfig gần hơn, tsx (get-tsconfig) resolve các import workspace của chúng thông qua file gốc. `extends` mang mapping `paths` trở lại file gốc, `files: []` khiến nó không bao giờ tạo thành program. Điều này không ảnh hưởng tới việc *type-check* của cả hai: file của examples, scripts và website đều được aggregate host bao phủ.

## Các phương án thay thế đã cân nhắc

- **Đổi tên `tsconfig.build.json` thành `tsconfig.host.json`** — không chấp nhận: đồ thị build là đồ thị emit toàn phần bao gồm mọi package client, không phải đồ thị host; tên `tsconfig.host.json` tương ứng với aggregate gốc cũ, còn đồ thị build đã được solution hấp thụ.
- **Cho vitest trỏ tới solution gốc** — không chấp nhận: solution không có cả `paths` lẫn `include`, kết quả resolve sẽ phụ thuộc vào mức độ plugin đi theo references xa tới đâu; và include của aggregate client chỉ chứa test, không chứa src, các import src→src truyền qua sẽ mất mapping, rơi về `exports`, tải ra bản sao thứ hai của module singleton.
- **Giữ `tsconfig.vitest.json` làm mặt tiền chuyên dụng** — chỉ giữ như phương án dự phòng: sẽ kích hoạt nếu vite-tsconfig-paths không xử lý được cấu hình không có include; file base đã mang theo mapping paths, và cấu hình không có include có hiệu lực mọi nơi, rộng hơn hẳn danh sách include được duy trì thủ công của mặt tiền đó.

## Hệ quả

- `docs/development.md#typescript-project-layout` là mô tả chuẩn (authoritative); `AGENTS.md` gốc ghi lại hai nguyên tắc trên dưới dạng quy ước.
- [ts-build-config Agent Note](2026-06-17-ts-build-config.md) tiếp tục sở hữu pipeline build lấy tsc làm bước đầu (tsc chịu trách nhiệm output, tsdown chịu trách nhiệm bundle, đặc tả `.ts` kết hợp `rewriteRelativeImportExtensions`); hình thái "một project type-check gốc duy nhất" trước đây của nó được note này thay thế.
- Thêm một package thông thường mới chỉ đăng ký vào đúng một references của một aggregate (package Host vào `tsconfig.host.json`, package Client vào `tsconfig.client.json`). `api/remotes` là ngoại lệ tách rời tường minh duy nhất do quan hệ thứ tự giữa quy ước Host sinh ra và quy ước Client tiêu thụ; hai project cụ thể của nó đăng ký riêng, solution root của package không nằm trong bất kỳ aggregate nào.
- Giai đoạn build Host và Client phải chạy tuần tự: chỉ sau khi Host tsdown sinh xong quy ước, tsc của Client mới bắt đầu được. Mỗi giai đoạn tái sử dụng trạng thái tăng dần của project mình, không xử lý lặp lại cùng một đồ thị theo kiểu đồng thời.
