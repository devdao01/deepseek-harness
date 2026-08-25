# Sử dụng Web UI

[English](index.md) | Tiếng Việt

Trước tiên hãy khởi động Web UI theo hướng dẫn trong [README ở thư mục gốc](../../../README.md#run); lệnh này sẽ in ra địa chỉ truy cập. Hướng dẫn này bắt đầu từ trạng thái server đã chạy. Tiến trình `dsh` lấy thư mục nơi nó được khởi động làm vị trí hệ thống tệp mặc định; còn một Web UI hoàn toàn mới thì không chọn sẵn workspace nào, bạn cần thêm một workspace.

## Cấu hình mô hình

Mở **Cài đặt → Mô hình**, nhập [khóa API DeepSeek](https://platform.deepseek.com/) rồi lưu lại. Định tuyến mô hình sẽ khả dụng ngay lập tức, không cần khởi động lại server.

[Hướng dẫn cấu hình mô hình](./providers.md) giới thiệu các bên cung cấp khác và các endpoint tương thích OpenAI tùy chỉnh.

## Chọn workspace

Nhấn **Chọn workspace**, thêm thư mục dự án nơi bạn đã khởi động `dsh`, rồi chọn nó. Trước khi chọn workspace, ô nhập liệu của phiên sẽ không dùng được.

## Chạy tác vụ

Khởi động một phiên và gửi:

> Summarize this repository and identify its main packages.

Agent có thể đọc và chỉnh sửa tệp trong workspace, chạy lệnh, ủy thác công việc và duy trì kế hoạch. Nếu theo chính sách quyền hiện tại một thao tác nào đó cần được phê duyệt, Web UI sẽ hỏi bạn trước.

## Tiếp tục

- [Cấu hình mô hình](./providers.md)
- [Sử dụng Python SDK](./python-sdk.md)
- [Sử dụng các chế độ CLI khác](../../../apps/cli/README.md)
- [Phát triển plugin](../develop/basic/)
