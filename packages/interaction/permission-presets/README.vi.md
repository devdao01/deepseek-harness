# @deepseek-ai/dsh-permission-presets

[English](README.md) | 中文

Cung cấp các preset quyền hướng tới người dùng thông qua `ctx.permissionPresets` ([`PermissionPresetService`](src/index.ts)). Mỗi tên cấu hình ghép `sandbox/mode` với `approval/policy` thành một cặp; các mục mặc định là `workspace-write` (`workspace-write` + `ask`) và `danger-full-access` (`danger-full-access` + `never`). Adapter UI có thể công bố bảng này như một bộ chọn đơn, trong khi việc thực thi sandbox và phê duyệt vẫn tiêu thụ riêng biệt từng tham số điều chỉnh của mình.

`set(session, name)` sẽ trước tiên ghi lựa chọn đã thay đổi vào sự kiện `permissionPresets/preset` chỉ-ghi-log, sau đó chỉ gọi setter cho các tham số điều chỉnh có giá trị thực sự thay đổi. Sự kiện lựa chọn diễn ra trước sự kiện tham số điều chỉnh, và bảo toàn ý định người dùng khi nhiều preset chia sẻ cùng một bộ giá trị; lựa chọn có thay đổi ròng bằng không sẽ không thêm bất kỳ nội dung nào. `current(events)` ưu tiên trả về lựa chọn đã ghi nhận vẫn khớp với các tham số điều chỉnh hiện tại, tiếp theo là mục khớp đầu tiên trong bảng, nếu không thì trả về `custom`. Client có thể hiển thị `custom` như giá trị hiện tại, nhưng không thể chọn nó.

Service này sở hữu namespace Settings `permissionPresets`. `defaultPreset` của nó là giá trị mặc định cho các session tương lai: mục tổ hợp dùng `Config.defaultPreset`; khi bỏ qua, hệ thống sẽ suy luận ra preset khớp với giá trị mặc định sandbox và phê duyệt đã tổ hợp. Thay đổi Settings đã gửi sẽ được đọc khi tạo session tiếp theo; quá trình tạo sẽ gắn cố định `permissionPresets/preset`, `sandbox/mode` và `approval/policy` vào session đó, do đó các thay đổi sau này sẽ không bao giờ làm thay đổi các session hiện có. Các seed được khôi phục, kể cả seed rỗng tường minh được đánh dấu bởi `session/end-seed`, đều giữ nguyên quyền hiệu lực của chúng, chỉ bổ sung các sự thật bền vững còn thiếu, chứ không áp dụng giá trị mặc định mới nhất của người dùng. Khi gắn service cũng sẽ duyệt qua mọi session còn sống, do đó HMR (Hot Module Replacement) sẽ gắn cố định mọi session được tạo trong lúc plugin vắng mặt.

Service này yêu cầu tồn tại một executor `ctx.shell` có khả năng ràng buộc và `ctx.approval`. Mục có tên `custom` trong bảng sẽ ném lỗi khi tải. Khi giá trị mặc định của tổ hợp không khớp với bất kỳ preset nào, plugin yêu cầu cấu hình tường minh `defaultPreset`; các session không sự kiện được xây dựng độc lập vẫn có thể suy luận ra `custom`. Chi tiết xem [thiết kế chuyển đổi sandbox](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

Hai chức năng con tùy chọn cung cấp giao diện sản phẩm trên cùng service này: đơn vị chiếu (projection) session `permissions` (khai báo key này ở `src/types.ts`; đơn vị này gấp gọn ba sự kiện thay đổi tham số toàn giá trị dựa trên giá trị mặc định của tổ hợp và tạo ra view bộ chọn, bao gồm các tùy chọn trong bảng và `custom` chỉ dùng làm giá trị hiện tại) và lệnh `/permissionPresets` (khi gọi không tham số sẽ báo cáo preset hiện tại và bảng; tham số preset chuyển đổi qua `set`). Mỗi chức năng con chỉ kích hoạt khi registry của nó (`ctx.sessionProjections` / `ctx.commands`) được tổ hợp.

## Trải nghiệm mô hình

Gián tiếp, thông qua `dsh-user-approval` và `dsh-tool-bash`: cả hai sẽ render prompt chính sách phê duyệt, thông báo chuyển đổi và kết quả công cụ sandbox được chọn bởi các sự kiện tham số điều chỉnh của service này; bản thân `permissionPresets/preset` chỉ ghi log.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực cache; bên tiêu thụ cụ thể chịu trách nhiệm về mọi thay đổi tiền tố request.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ tổ hợp hai tham số điều chỉnh cấp cơ chế**: preset chọn sandbox mode và chính sách phê duyệt; lựa chọn agent (tác tử)/profile chưa được đưa vào `PresetSpec`.
- **`custom` chỉ có thể được suy luận ra**: bên gọi có thể chuyển khỏi tổ hợp tham số điều chỉnh không khớp, nhưng không thể thông qua service này để chọn hoặc lưu giữ một preset tên là custom.
- **Bảng preset là cấu hình cấp tiến trình**: cấu hình cố định trong vòng đời plugin; thay đổi các preset khả dụng phải tải lại plugin.
- **Giá trị mặc định đã lưu trữ phải giữ nguyên trong bảng preset**: gỡ bỏ một preset đang được tham chiếu sẽ khiến việc đăng ký thiết lập quyền thất bại, cho đến khi cập nhật hoặc reset phân đoạn `permissionPresets` trong `settings.yaml`.
