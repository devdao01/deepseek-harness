# interaction/: mặt phẳng cộng tác người-máy

[English](README.md) | 中文

Các service và plugin để con người cộng tác với agent (tác tử) đang chạy—đặt câu hỏi, phê duyệt, các preset quyền, lệnh. Đây là các gói **sản phẩm**: giao diện thực do người dùng thao tác trực tiếp.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`commands/`](commands/README.md) | Đăng ký và điều phối lệnh người dùng cho các adapter tương tác. | `ctx.commands` |
| [`user-approval/`](user-approval/README.md) | Điều phối các quyết định phê duyệt một lần. | `ctx.approval` |
| [`permission/`](permission-presets/README.md) | Hiển thị và lưu giữ các preset quyền hướng tới người dùng. | `ctx.permissionPresets` |
| [`user-questions/`](user-questions/README.md) | Định nghĩa seam hỏi-đáp người dùng độc lập với nhà cung cấp. | `ctx.userQuestions` |
| [`tool-ask-user/`](tool-ask-user/README.md) | Cung cấp câu hỏi người dùng cho mô hình. | (đăng ký vào `ctx.tools`) |

Các gói này tích hợp thông qua các quy ước agent và session hiện có, mà không thay đổi vòng lặp. Ứng dụng tương tác cung cấp các adapter lệnh, phê duyệt và hỏi đáp cụ thể; tự động hóa dùng [`acp/`](../acp/README.md), các gói demo có thể chạy nằm ở [`examples/`](../examples/README.md). CLI [`dsh`](../../apps/cli/README.md) (command-line interface) của sản phẩm tổ hợp trực tiếp các gói này.

Tài liệu tham khảo phân hệ: [approval.md](../../docs/subsystems/approval.md), [permission-presets.md](../../docs/subsystems/permission-presets.md), [user-questions.md](../../docs/subsystems/user-questions.md) và [commands.md](../../docs/subsystems/commands.md). Transport ACP chỉ dành cho tự động hóa là [`acp/`](../acp/README.md), phía server JSON-RPC của SDK là [`sdk/server`](../sdk/README.md), lớp keo khởi động bin dùng chung là [`boot/`](../boot/README.md).
