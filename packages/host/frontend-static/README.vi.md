# `@deepseek-ai/dsh-host-frontend-static`

[English](README.md) | Tiếng Việt

Máy chủ phục vụ dist SPA của Web shell: một plugin dạng hàm (cấu hình là `{distIndex}`), chiếm vị trí fallback duy nhất của [webserver](../webserver/README.md), và phục vụ thư mục frontend đã build theo ngữ nghĩa cố định của shell — việc truy cập vượt ra ngoài gốc dist sẽ trả về 403, mọi mục không khớp sẽ fallback về `index.html` với HTTP 200 (định tuyến SPA), phần mở rộng không xác định được phục vụ dưới dạng `application/octet-stream`, các phương thức ngoài GET／HEAD sẽ trả về 405 khi không có route có tên khớp. Mỗi response index đều đi qua bộ chuyển đổi index đã đăng ký của webserver (`applyIndexTaps`), manifest (bản kê khai metadata) khởi động chính là được gửi đến trang qua đường dẫn này. `distIndex` là sự thật lắp ráp của ứng dụng tổng hợp: [`dsh-web-app`](../../bundle/web-app/README.md) phân giải nó thông qua exports của package frontend và gắn plugin này; triển khai không bao giờ hardcode nó.

Vị trí fallback chỉ có một chủ sở hữu duy nhất (lần chiếm thứ hai sẽ ném lỗi), và bị ràng buộc bởi phạm vi effect: dispose (giải phóng tài nguyên) fiber của plugin sẽ giải phóng vị trí đó, sau đó webserver không có ai chiếm sẽ trả lời 404.

## Trải nghiệm model

Không có. Package này chỉ phục vụ tài nguyên trình duyệt; không có nội dung nào ở đây đi vào request của model.

#### Ảnh hưởng KV Cache

Không có; package này không lắp ráp cũng không gửi request nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Bảng MIME ban đầu còn tinh gọn**: nó bao phủ tập tài nguyên do Vite xuất ra và manifest PWA thực tế được cung cấp; các phần mở rộng khác sẽ fallback về `application/octet-stream` cho đến khi loại tài nguyên tương ứng thực sự được phát hành.
