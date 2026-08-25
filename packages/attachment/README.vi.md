# attachment/: nhóm năng lực đính kèm bền vững

[English](README.md) | Tiếng Việt

Seam đính kèm nhị phân bền vững cùng phần hiện thực trên hệ thống file cục bộ của nó. Cả hai đều là package sản phẩm.

| Package | Vai trò | ctx key |
|---|---|---|
| `attachment/` | Tham chiếu đính kèm bất biến, giới hạn ảnh và service lưu trữ | `ctx.attachments` |
| `attachment-local/` | Lưu trữ riêng tư định địa chỉ theo nội dung dưới `DSH_HOME` | (đăng ký vào `ctx.attachments`) |

Bản nháp chưa gửi trong trình duyệt cố ý nằm ngoài năng lực này. Chỉ khi người dùng gửi prompt, hoặc adapter nhà cung cấp gửi kết quả mô hình có cấu trúc, thì các byte mới đi vào lưu trữ bền vững.
