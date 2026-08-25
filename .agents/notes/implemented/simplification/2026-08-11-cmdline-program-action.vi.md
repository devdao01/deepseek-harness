# Agent Note: parseCmdline chạy commander action của chính program

Status: implemented

[English](2026-08-11-cmdline-program-action.md) | Tiếng Việt

## Problem

`dsh-cmdline` ([command line do ứng dụng tự sở hữu](../architecture/2026-08-06-app-owned-command-line.md)) trước đây có `parseCmdline` mang theo một callback tự chế: `CmdlinePlan<T> = (program, ctx) => T`, được gọi sau khi parse thành công, bên trong khối catch của adapter đó, khiến `program.error(...)` của plan dùng chung một đường thoát (exit path) với lỗi help/parse; nó còn mang giá trị mặc định `(() => ({}) as T)` chỉ được test sử dụng và không an toàn về kiểu, cùng tham số `ctx` mà không plan nào đọc tới. Toàn bộ seam này lặp lại đúng vị trí mà commander vốn đã định nghĩa sẵn: action handler của lệnh chạy bên trong `parse`, và `program.error(...)` được ném ra từ đó tuân theo `exitOverride` giống hệt như khi cú pháp bị từ chối.

## Decision

`parseCmdline(ctx, program): void` chỉ thích ứng luồng điều khiển của commander với launcher: nó parse một snapshot `cmdlineArgs` bất biến, và chuyển đổi help, version, lỗi parse cũng như sự từ chối của action thành một yêu cầu `ctx.appExit` duy nhất. Code của ứng dụng — các kiểm chứng mà cú pháp commander không diễn đạt được, cùng `ctx.provide` của các dịch vụ mà ứng dụng tự sở hữu — được đặt trong `.action()` đồng bộ của chính program; commander chạy nó khi parse thành công, và không bao giờ chạy nó khi có help hoặc bị từ chối. Export `CmdlinePlan`, tham số `ctx` của nó, plan mặc định và giá trị trả về `T | undefined` đều bị xóa; cả hai provider bundle đều publish bên trong action của chính chúng. Vì kiểu `Command` không thể diễn đạt điều kiện tiên quyết của action, `parseCmdline` đọc handler theo cấu trúc (structurally) (giống như `isCommanderError` nhận diện lỗi luồng điều khiển của commander theo cấu trúc), từ chối ngay lúc nạp và nêu đích danh bất kỳ program nào trong toàn bộ cây lệnh mà không có lệnh nào khai báo action — nếu thiếu cơ chế bảo vệ này, một provider bỏ sót action (hoặc một bên gọi cũ vẫn còn truyền tham số thứ ba đã bị xóa) sẽ parse thành công, không publish gì cả, và chỉ lộ ra ở giai đoạn settlement dưới dạng một dòng dependency đang pending chờ dịch vụ vắng mặt. Adapter này cấu hình `exitOverride` và output trên toàn bộ cây lệnh, chứ không chỉ ở lệnh gốc: commander chỉ sao chép các thiết lập này vào lệnh con tại thời điểm đăng ký, nên nếu chỉ cấu hình ở lệnh gốc, sự từ chối của các lệnh con đã đăng ký sẽ bỏ qua `ctx.appExit` và gọi thẳng `process.exit`. Action bắt buộc phải từ chối trước rồi mới publish; các câu lệnh đứng trước `program.error(...)` đã được thực thi rồi.

Đã được xác minh trên commander 15 trước khi phát hành: action chạy bên trong `parse`, `program.error(...)` của nó ném ra `CommanderError` thông qua `exitOverride`; help và version rẽ nhánh ngắn (short-circuit) trước khi tới action; việc xử lý tham số dư thừa hoàn toàn giống nhau dù có hay không có action.

## Alternatives considered

- **Giữ lại callback `resolve`/plan tự chế**: lý do duy nhất nó tồn tại là để sự từ chối phía ứng dụng dùng chung khối catch của adapter, trong khi vị trí action của commander vốn đã cung cấp sẵn điều đó; việc dựng lại một seam callback thứ hai cho cùng một thời điểm trong vòng đời parse là sự trùng lặp.
- **Trả về `Command` đã parse để bên gọi tự đọc**: nếu bên gọi gọi `program.error(...)` sau khi parse, lỗi sẽ thoát ra khỏi khối catch của adapter dưới dạng `CommanderError` không được bắt, biến một lần từ chối do dùng sai thành lỗi nạp plugin; mỗi ứng dụng có kiểm chứng sẽ phải dựng lại đúng bộ try/catch mà adapter đang giữ.
- **Chuyển toàn bộ kiểm chứng vào bộ parser option/argument của commander**: `InvalidArgumentError` bao phủ việc kiểm tra từng giá trị, nhưng bundle headless từ chối các tham số biến thiên (variadic) đã được nối lại bằng thông báo cách dùng của riêng nó ("tác vụ không được để trống"), điều mà parser theo từng tham số không diễn đạt được.
- **Chấp nhận program không có action, dựa vào chẩn đoán settlement**: launcher đã được lắp ráp thực sự sẽ báo lỗi rõ ràng (`pending (waiting for service: …)`), nhưng lỗi đó nêu đích danh bên tiêu thụ chứ không phải provider cấu hình sai, và một host nhúng không có assertion settlement sẽ treo âm thầm; cơ chế bảo vệ lúc nạp báo thẳng ra program gây lỗi.
- **Thay thế accessor `CmdlineArgs` bằng dịch vụ `readonly string[]` đóng băng trần trụi**: người duy trì giữ lại accessor object này như một interface có tên cụ thể cho dịch vụ.

## Consequences

- `parseCmdline` mất đi generic, tham số callback và giá trị lính canh (sentinel) `undefined`; bên gọi không còn cần cơ chế bảo vệ publish kiểu `if (values !== undefined)`.
- Lệnh của ứng dụng trở nên tự chứa (self-contained) — flag, văn bản help, kiểm chứng và hiệu ứng publish đều gắn cùng nhau trên `Command`.
- Action bắt buộc phải đồng bộ: adapter gọi `parse` chứ không phải `parseAsync`, promise trả về sẽ thoát khỏi khối catch mà không ai quan sát.
