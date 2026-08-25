# dsh-sandbox-policy: Nơi thuộc về của chính sách sandbox (`ctx.sandboxPolicy`)

[English](README.md) | 中文

Nơi thuộc về duy nhất của việc phân giải chính sách sandbox: mặc định [`SandboxMode`](../sandbox/README.md) theo triển khai (deployment) và gốc dự phòng, cộng với các ghi đè mode bền vững theo từng session và gốc workspace bất biến. Mỗi năng lực chịu trách nhiệm enforcement sẽ nhận được một chính sách mode và gốc thư mục đã được phân giải hoàn chỉnh ở mỗi lời gọi; mô hình nhận được chính sách hiện hành trước mỗi request, chứ không nhận thêm một danh sách năng lực riêng.

## Vì sao cần một nơi thuộc về dùng chung

Công cụ hệ thống file, lệnh bash một lần và session terminal có thể enforce cùng một bộ từ vựng mode theo những tổ hợp khác nhau. Nếu mỗi bên tự phân giải `mode` + `workspaceRoot`, có thể trôi dạt thành một thế giới bị chia rẽ, đúng như điều [Agent Note về sandbox](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) đã cảnh báo. Mỗi backend enforcement đều tiêu thụ chính sách hoàn chỉnh đã được nơi thuộc về phân giải, còn context hiện tại chỉ nói rõ chính sách đó có ý nghĩa gì đối với bất kỳ thao tác khả dụng nào bị DSH file sandbox enforce. [Agent Note về cross-family fs sandbox](../../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.md) ghi lại quyết định chính sách dùng chung.

## Cấu hình

- `mode`: `SandboxMode` mặc định theo triển khai (`read-only`/`workspace-write`/`danger-full-access`), được xác thực lúc load. Mặc định là `read-only` (fail-safe).
- `workspaceRoot`: thư mục dự phòng có thể ghi trong `workspace-write` cho các lời gọi không có agent (tác nhân) hoặc các session không có cwd. Mặc định là `process.cwd()`; dù được cấu hình rõ ràng hay dùng giá trị mặc định, nó đều được phân giải thành định danh hệ thống file tuyệt đối của nó. Lời gọi agent thông thường dùng `cwd` bất biến trong header session của nó thay vào đó.

## Interface

- `ctx.sandboxPolicy.resolve({ session?, mode? })`: phân giải một chính sách hoàn chỉnh theo từng lời gọi. Mode được phê duyệt rõ ràng ưu tiên hơn sự kiện `sandbox/mode` cuối cùng của session, sự kiện này lại ưu tiên hơn `defaultMode`; `cwd` bất biến của session sẽ được chuẩn hóa theo ngữ nghĩa hệ thống file trước, sau đó mới trở thành `workspaceRoot`, nếu không thì dùng giá trị dự phòng đã cấu hình. Việc chuẩn hóa diễn ra trước khi chuẩn hóa từ vựng, do đó `symlink/..` khớp với cách phân giải thư mục làm việc của tiến trình.
- `ctx.sandboxPolicy.defaultMode`/`ctx.sandboxPolicy.workspaceRoot`: giá trị mặc định theo triển khai và gốc dự phòng mà `resolve()` sử dụng.
- `sandbox:policy`: đóng góp vào context an toàn được cache theo request, dẫn xuất trực tiếp từ `resolve({ session })`. Nó nói rõ quy ước thao tác file không phụ thuộc năng lực cụ thể trong mode đó, cùng workspace session đã chuẩn hóa trong `workspace-write`; công cụ vẫn chịu trách nhiệm về từ chối và hướng dẫn nâng quyền dành riêng cho từng thao tác.
- `effectiveSandboxMode(events)`: một fold thuần túy trên các sự kiện `sandbox/mode` của session (lần chuyển đổi cuối cùng thắng, không có thì là `undefined`), được dùng bên trong `resolve()`.
- `setSandboxMode(session, mode)`: đường ghi duy nhất cho việc ghi đè theo từng session: chỉ thêm đúng một sự kiện `sandbox/mode`. Bản thân việc chuyển đổi chính là sự kiện; mode không bị sửa đổi ngoài băng.
- `SANDBOX_MODES`: tất cả các mode, dùng cho việc hiển thị lựa chọn và xác thực runtime.

Thành phần đi kèm tùy chọn `./invariant` sẽ từ chối các sự kiện `sandbox/mode` bền vững giả mạo, miễn là giá trị của chúng không nằm trong từ vựng khép kín này; Session và thành phần đi kèm của nó chịu trách nhiệm về việc lưu trữ và quy tắc khép kín thực thi cốt lõi liên quan. Agent loop (vòng lặp tác nhân) sẽ ghi lại toàn bộ snapshot context runtime đã lắp ráp thành một `user/message` có nguồn gốc, do đó không cần một bản sao "lần thông báo trước" trong bộ nhớ vẫn có thể tái tạo chính xác đầu vào chính sách.

## Lưu trữ theo từng session

Việc chuyển đổi runtime là một sự kiện `sandbox/mode` được thêm vào log của session tương ứng. `effective = explicit grant ?? fold(events) ?? deployment default`, do đó việc ghi đè sẽ được giữ lại qua các lần restart nhờ replay, và hai session cũng không bao giờ thấy trạng thái của nhau. Định danh workspace không cần thêm một sự kiện khác: `SessionHeader.cwd` bất biến được ghi khi tạo là gốc mà mỗi lời gọi của session đó sử dụng. Sự kiện này vẫn chỉ đi vào log; trước mỗi request tiếp theo, nơi thuộc về sẽ đóng góp sự kiện hiện tại vào snapshot context runtime hoàn chỉnh.

## Trải nghiệm mô hình

### Chính sách file sandbox hiện tại

#### Mô hình thấy gì

Mỗi phiên agent có một đóng góp `sandbox:policy` trong snapshot context runtime hiện tại. Nó không liệt kê các năng lực đã được nạp. Plugin công cụ vẫn tiếp tục chịu trách nhiệm về thao tác và hướng dẫn nâng quyền, chính sách phê duyệt được đóng góp riêng vào cùng snapshot đó, còn hướng dẫn kế hoạch vẫn do đoạn hệ thống của `dsh-plan-mode` quản lý.

##### Chỉ đọc

```markdown
Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.
```

##### Ghi vào workspace

```markdown
Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: "<workspace root>". Some platform temporary areas may also be writable.
```

##### Truy cập đầy đủ

```markdown
Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.
```

#### Ảnh hưởng Token

Thêm một thông điệp context bền vững ngắn gọn ở request đầu tiên và mỗi lần chính sách hiệu lực thay đổi; các request không thay đổi thì không thêm nội dung. `workspace-write` chỉ mang theo đường dẫn workspace session đã chuẩn hóa; các đường dẫn tạm đặc thù nền tảng sẽ được diễn đạt tóm lược, không thêm byte phụ thuộc host.

#### Ảnh hưởng KV Cache

Khi chuyển đổi mode, system prompt ổn định vẫn giống hệt từng byte. Snapshot context hoàn chỉnh sau khi thay đổi sẽ được thêm vào sau lịch sử đã giữ lại, nhờ đó bảo toàn tiền tố đã được cache trước đó; các request không thay đổi tiếp theo sẽ tái sử dụng snapshot đã giữ lại đó.

## Hạn chế đã biết và việc còn hoãn lại

- **Mỗi session chỉ có một gốc workspace chính**: chính sách phân giải `SessionHeader.cwd`; các gốc có thể ghi bổ sung không thuộc `SandboxExecutionPolicy`.
- **Chỉ giới hạn ở mode thao tác file**: `SandboxMode` quản lý các thao tác file; chính sách mạng và tiến trình không nằm trong từ vựng của nó, do đó ở đây không có nút điều khiển để giới hạn chúng.
- **Cố ý khái quát vùng tạm**: backend enforcement cấp các vùng tạm nền tảng khác nhau, các vùng này chỉ được chọn sau khi chính sách được phân giải, do đó không thể liệt kê trung thực trong context hiện tại.
