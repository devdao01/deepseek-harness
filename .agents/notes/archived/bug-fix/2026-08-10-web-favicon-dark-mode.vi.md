# Agent Note: Favicon web đổi theo color scheme

Status: implemented
Archived: 2026-08-10

[English](2026-08-10-web-favicon-dark-mode.md) | 中文

## Vấn đề

`apps/web/public/favicon.svg` vẽ icon DeepSeek bằng màu đen thuần (`fill="#000"`), trong khi `index.html` chỉ khai báo duy nhất icon SVG này. Khi hệ điều hành hoặc trình duyệt ở color scheme tối, thanh tab cũng tối màu, khiến icon đen thực tế không nhìn thấy được. Safari trước phiên bản 26 không render favicon SVG, nên người dùng các phiên bản Safari này không thấy icon tab dù ở color scheme nào.

## Quyết định

Favicon vẫn giữ một file duy nhất, và tự thích ứng thông qua tín hiệu color scheme của chính trình duyệt: `favicon.svg` nhúng `@media (prefers-color-scheme: dark) { path { fill: #fff } }`, chuyển icon sang màu trắng ở color scheme tối, giữ màu đen ở color scheme sáng. `index.html` và `manifest.webmanifest` cùng khai báo PNG 32×32 làm phương án dự phòng (`favicon-32x32.png`, màu xanh thương hiệu DeepSeek `#4D6BFE`); Safari trước phiên bản 26 sẽ render PNG này, và nó rõ ràng trên cả thanh tab sáng lẫn tối; đây là phần mở rộng của [Quyết định manifest cài đặt Web](../feature/2026-08-06-web-install-manifest.md).

Tín hiệu theme lấy theo scheme của hệ điều hành/trình duyệt, chứ không phải công tắc `dsh.theme` bên trong ứng dụng GUI: favicon nằm trong chrome của trình duyệt, nền của nó theo scheme trình duyệt, nên `prefers-color-scheme` là ngữ nghĩa đúng, không cần bất kỳ JavaScript nào. Các đặc điểm riêng đã biết của trình duyệt — Chromium có thể phải đến khi tải lại trang mới vẽ lại icon tab sau khi đổi scheme, Safari trước phiên bản 26 bỏ qua biến thể SVG — đều được chấp nhận, kịch bản Safari phiên bản cũ đã được PNG dự phòng bao phủ.

## Phương án thay thế từng cân nhắc

- **Thêm một `<link rel="icon" media="(prefers-color-scheme: dark)">` thứ hai trỏ tới một SVG tối riêng.** Không áp dụng: cùng ngữ nghĩa nhưng phải bảo trì thêm một file, không mang lại lợi ích gì so với media query trong file.
- **Để theme presenter thay href của icon khi có `theme/change`.** Không áp dụng: nó sẽ theo công tắc trong ứng dụng, chứ không phải scheme của trình duyệt vốn thực sự quyết định màu thanh tab, và sẽ đưa client code cùng presenter vào cho một tài nguyên chrome.
- **Không cung cấp PNG dự phòng.** Không áp dụng: Safari trước phiên bản 26 không bao giờ render favicon SVG, phương án dự phòng là cách duy nhất để các phiên bản này có icon tab.

## Hệ quả

Color scheme sáng vẫn hiển thị icon đen, scheme tối hiển thị icon trắng, Safari trước phiên bản 26 hiển thị PNG xanh ở cả hai scheme. `apps/web/tests/pwa-manifest.e2e.ts` cố định khẳng định liên kết PNG và thứ tự của nó đứng trước SVG, hai icon trong manifest, định dạng và kích thước của PNG được phân phối, cũng như media query tối bên trong SVG được phân phối. Đặc điểm vẽ lại của Chromium vẫn là hành vi của trình duyệt, ứng dụng không thể sửa được.
