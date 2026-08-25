# @deepseek-ai/dsh-skill-badge

[English](README.md) | Tiếng Việt

Nhà cung cấp skill (kỹ năng) dựng sẵn tùy chọn, đóng góp `dsh-badge` vào `ctx.skills`. Skill này cung cấp đoạn Markdown chính thức «powered by dsh» và tệp PNG được phân phối kèm package, dành cho các hệ thống không thể nhập ảnh từ xa một cách đáng tin cậy.

Chỉ cần gắn plugin này là bật được nhà cung cấp. Nó không có cấu hình. Tổ hợp CLI (giao diện dòng lệnh) đi kèm bao gồm plugin này với `disabled: true`; người dùng phải bật tường minh dòng cấu hình `skill-badge` của nó thì skill mới vào được danh mục.

Nhà cung cấp này công khai thư mục `assets/` phân phối kèm package làm nền tài nguyên skill. `dsh-badge.png` là tài nguyên ảnh nguồn kích thước 726×120, bên tiêu thụ render ở kích thước 121×20.

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp tới mô hình thông qua `@deepseek-ai/dsh-tool-skill`; package đó sẽ render mục danh mục và phần thân của skill được chọn.

#### Ảnh hưởng KV Cache

Plugin này mặc định bị vô hiệu hóa, không thay đổi bất kỳ request nào. Sau khi bật, mục danh mục và mọi phần thân đã nạp của nó sẽ thay đổi tiền tố KV của nhà cung cấp tại điểm chèn tương ứng.

## Hạn chế đã biết và việc tạm hoãn

- Nhà cung cấp này chỉ đóng góp một skill cố định, không hỗ trợ tùy biến lúc chạy.
- Markdown từ xa dùng Shields.io; khi môi trường đích không thể lấy ảnh từ xa một cách đáng tin cậy, hãy dùng tệp PNG phân phối kèm package.
