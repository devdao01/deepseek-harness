# Agent Note: Hệ thống styling Web — khung token và ràng buộc kỹ thuật

Status: implemented

> Cập nhật hệ thống token (2026-07-22): các quyết định khung của tài liệu này (CSS Modules + clsx, không dùng thư viện component, không dùng tailwind, màu chỉ dùng token) vẫn còn hiệu lực, nhưng bảng token hai lớp `--bg-*`/`--text-*` cùng host `web-ui/src/style/global.css` của nó đã được thay thế bởi bảng static+alias hai lớp `--dsw-*` tại `packages/client/ui-theme/src/styles/` (dark mode = ghi đè `body[data-ds-dark-theme]`) — bản thân stylesheet chính là nơi giữ quyền token.

[English](2026-07-19-web-styling-system.md) | 中文

> Phân công: RFC này định khung và ràng buộc (ít thay đổi); [docs/web-styling.md](../../../../docs/web-styling.md) là spec sống (giá trị quyền token, checklist đối chiếu coding convention, bảng ghi độ lệch, tiến hoá cùng triển khai). Sửa token/thêm rule thì vào đó; đụng đến bản thân khung mới quay lại đây (muốn đảo ngược cần RFC mới).

## Problem

GUI không có nguồn cung từ designer, style do agent viết và review; không có một hệ thống token có thể kiểm tra bằng máy và coding convention, màu/bo góc/hiệu ứng động sẽ trôi dạt theo literal giữa các component, dark theme sẽ mọc thành các nhánh điều kiện rải rác trong component.

## Decision (khung 5 điều)

| # | Quyết định | Nội dung |
|---|---|---|
| 1 | **Baseline hình ảnh = căn theo Chat** | Giá trị đều lấy từ khảo sát frontend Chat (xanh thương hiệu `--accent: #3964fe`, thang xám, hình học bubble/sidebar, phân cấp shadow...); cho phép lệch nhưng phải ghi vào bảng độ lệch trong web-styling.md |
| 2 | **Token hai lớp không phải ba lớp** | Repo baseline là ba lớp static→alias→specific; ở quy mô của chúng ta nén thành «lớp ngữ nghĩa giữ trực tiếp giá trị thực (comment ghi rõ nguồn bảng màu base) + số lượng rất ít slot riêng cho component (`--bg-sidebar`/`--bubble-bg`)» hai lớp, tất cả nằm trong `web-ui/src/style/global.css` |
| 3 | **Cỡ chữ/khoảng cách không token hoá** | Cùng quyết định như repo baseline: cỡ chữ viết px trong component và **luôn viết line-height theo cặp** (16/24, 14/22, 12/18), khoảng cách dùng bội số của 4; token hoá chỉ bao phủ màu/bo góc/hiệu ứng động/font stack/shadow |
| 4 | **Viền và trạng thái tương tác dùng cơ chế độ trong suốt** | Viền `rgba(0,0,0,.04/.1)`, hover/active `rgba(38,49,72,.06/.1)` — chồng lên màu nền ở bất kỳ layer nào cũng đúng, không tạo thêm màu xám thực |
| 5 | **Dark mode chỉ nằm trong bảng token** | `:root` giá trị thực light mode + `[data-theme='dark']` ghi đè cùng tên biến; **CSS component không có selector theme nào**; khi thực sự cần đổi giá trị không phải token theo theme thì dùng «cầu biến CSS» (component định nghĩa biến cục bộ, khối theme chỉ ghi đè biến) |

## Ràng buộc kỹ thuật

- **CSS Modules + clsx, không dùng thư viện component, không dùng tailwind**: mỗi component có `.module.css` cùng tên cùng thư mục; tên class camelCase, class trạng thái là tính từ đơn được gắn qua clsx; component truyền `className` xuyên qua.
- **Cấm `composes`**; `:global` chỉ dùng để xuyên qua class của bên thứ ba/xuyên package, không định nghĩa class toàn cục mới; class tiện ích toàn cục chỉ nằm trong global.css và chỉ có vài class (hiện tại là `.scrollable`).
- **Hiện trạng zero plugin PostCSS** (vite không có cấu hình postcss, CSS phẳng là đủ dùng; muốn đưa vào nested/custom-media phải ghi vào web-styling.md trước); khai báo type cho CSS Modules dùng `css-modules.d.ts` declare theo wildcard (khi số component vượt quá 20 thì đánh giá lại việc sinh typed-css-modules theo từng file).
- **Style động đi qua cầu biến CSS**: JS chỉ viết biến (`style={{'--x': v}}`), rule để lại trong CSS; cấm ghép object style trong TSX để làm nhánh theme/trạng thái.
- Transition luôn dùng `var(--dur*) var(--ease)` và chỉ transition opacity/transform/màu nền/shadow; container cuộn thống nhất dùng `.scrollable` (cấm viết `::-webkit-scrollbar` trong component).

## Hình thái thực thi cho agent

Spec được duy trì dưới dạng **checklist đối chiếu khi review** (web-styling.md §3, 12 điều): mỗi điều là một tiêu chí có thể phán đoán được kiểu «thấy X là trả lại», không phải gợi ý về phong cách — viết style và review style dùng chung một bảng.

Điểm vào cho các việc thường gặp (checklist thao tác):

- **Viết style cho component mới**: `.module.css` cùng tên cùng thư mục, tự đối chiếu từng điều theo web-styling.md §3; màu/bo góc/hiệu ứng động chỉ dẫn từ token §1.
- **Thêm một token**: trước tiên vào bảng §1 của web-styling.md thêm một dòng (giá trị light mode + cột dark mode + comment nguồn bảng màu base) → đồng bộ cả hai khối `:root` và `[data-theme='dark']` trong global.css → rồi mới dẫn dùng trong component.
- **Lệch khỏi hằng số baseline hình ảnh** (giá trị hình học/shadow ở web-styling.md §2): trước tiên ghi một dòng vào bảng độ lệch §5 (ngày/mục/lý do) rồi mới xuống code.
- **Giá trị không phải token cần thay đổi theo theme** (điểm cuối gradient, v.v.): component định nghĩa biến CSS cục bộ, khối theme chỉ ghi đè biến (cầu biến), CSS component vẫn giữ zero selector `[data-theme]`.

## Phân công với web-styling.md

| Nội dung | Thuộc về |
|---|---|
| Khung 5 điều, ràng buộc kỹ thuật, vì sao hai lớp/vì sao không token hoá cỡ chữ | RFC này (muốn sửa khung phải có RFC mới thay thế tài liệu này) |
| Giá trị quyền token từng mục (gồm dark mode), hằng số baseline hình ảnh (hình học sidebar/bubble/dòng phiên/thẻ input), từ vựng hình ảnh ký hiệu hướng bốn góc phần tư RPC, 12 điều coding convention, bảng ghi độ lệch | web-styling.md (tài liệu sống, tiến hoá cùng triển khai) |
| Bằng chứng giá trị (deepseekchat file:line) | Kho lưu trữ khảo sát đã hoàn thành sứ mệnh, giữ trong lịch sử git |

## Consequences

Style hội tụ về mức có thể kiểm tra bằng máy: màu/bo góc/hiệu ứng động/shadow chỉ dẫn từ token §1 của web-styling.md, dark mode là một bảng ghi đè theo attribute selector duy nhất, review và tự kiểm dùng chung một checklist 12 điều. Cái giá chấp nhận: cỡ chữ/khoảng cách dựa vào kỷ luật viết line-height theo cặp và bội số của 4 thay vì token; muốn đụng đến bản thân khung phải có RFC mới thay thế tài liệu này.

## Alternatives considered

| Phương án từ bỏ | Lý do ngắn gọn |
|---|---|
| Token hoá cỡ chữ/khoảng cách | Repo baseline đã chứng minh không token hoá vẫn hội tụ được (kỷ luật viết line-height theo cặp thay thế); bảng token phình to làm giảm quyền của token màu |
| Dark mode dùng `prefers-color-scheme` hoặc nhánh trong component | Bảng ghi đè theo attribute selector khiến component không cảm nhận gì; sở thích hệ thống có thể thích ứng sau ở lớp toggle, không đụng đến cơ chế token |
