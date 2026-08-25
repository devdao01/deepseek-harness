# @deepseek-ai/dsh-host-directory-picker-native

[English](README.md) | Tiếng Việt

**Backend bộ chọn OS native** của [directory-picker seam](../directory-picker/README.md): `NativeDirectoryPicker` đăng ký `ctx.directoryPicker` với năng lực `native`, `pick(signal)` của nó mỗi lần gọi sẽ mở một bộ chọn native và phân giải ra đường dẫn tuyệt đối đã chọn (là `null` khi hủy). Công cụ nền tảng không đi qua lệnh gọi shell: macOS dùng `osascript`, Linux dùng Zenity với KDialog làm phương án dự phòng; signal hủy của bên gọi sẽ chấm dứt tiến trình native. Windows mở `IFileOpenDialog` hiện đại trong một tiến trình con được spawn — một phiên COM do koffi điều khiển trên luồng chính của tiến trình con, sử dụng chế độ nhận biết DPI theo luồng tốt nhất mà host chấp nhận (ưu tiên per-monitor-v2), khi hủy sẽ gửi `WM_CLOSE` đến luồng của hộp thoại. Chỉ khả dụng khi operator đang ngồi trước màn hình host — triển khai từ xa nên lắp ráp [`-browse`](../directory-picker-browse/README.md). Ranh giới lệnh (`DirectoryPickerRunner`) và các sự thật nền tảng có thể được inject. Bộ chạy tiến trình con dùng chung, không qua shell, nằm ở [`dsh-native-command`](../../util/native-command/README.md).

**Package hai mặt**: phía trình duyệt (`./client`) đăng ký một chủ thể luồng không render vào hai slot luồng thư mục của [ui-workspace](../../client/ui-workspace/README.md) — mỗi request `open` điều khiển `host.pickDirectory`, và báo cáo kết quả duy nhất (đường dẫn đã chọn／hủy／thất bại) thông qua quy ước tương tác của chủ sở hữu slot. Cả hai khai báo luồng thư mục phải cùng ở trạng thái hiệu lực thì đóng góp mới được cài đặt. Do đó một dòng cordis.yml lắp ráp đồng thời cả hai phía của tương tác native; phía client không chứa bất kỳ nhánh nào theo capability type, việc gắn kết thêm dòng luồng thứ hai sẽ thất bại khi tải (kind của slot là `single`).

## Trải nghiệm model

Không có. Backend này phục vụ việc chọn thư mục cho GUI host. Không có nội dung nào ở đây đi vào request của model.

#### Ảnh hưởng KV Cache

Không có; package này không lắp ráp cũng không gửi request nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Linux phụ thuộc công cụ desktop** — khi cả Zenity và KDialog đều chưa cài đặt, `pick` sẽ từ chối với lỗi kèm gợi ý khắc phục; nó không quay về prompt nhập đường dẫn thủ công (phương án dự phòng ở cấp lắp ráp là backend browse).
- **Windows không có cơ chế dự phòng cấp thấp** — bộ chọn tiến trình con chạy qua koffi đã đóng gói sẵn là tầng native duy nhất, do đó việc COM từ chối hoặc hộp thoại sập sẽ báo cáo thất bại trực tiếp. Phương án dự phòng ở cấp lắp ráp vẫn là backend browse.
