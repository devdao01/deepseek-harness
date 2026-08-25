# Tham chiếu style Web UI

[English](web-styling.md) | Tiếng Việt

Tài liệu này quy định việc phân chia trách nhiệm style và các quy tắc component cho các package client chạy trên trình duyệt. Giá trị token hiện tại nằm ở [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/); tài liệu này không lặp lại danh sách được sinh ra từ mã nguồn đó.

## Phân chia trách nhiệm

[`ui-theme`](../packages/client/ui-theme/README.md) chịu trách nhiệm về thang màu tĩnh `--dsw-*`, alias ngữ nghĩa, typography, hiệu ứng chuyển động, gradient, đổ bóng, style thanh cuộn, cũng như tuỳ chọn theme sáng/tối. [`ui-layout`](../packages/client/ui-layout/README.md) áp dụng bản snapshot theme đã phân giải vào document. Các package tính năng dùng alias ngữ nghĩa và không được tự định nghĩa theme toàn cục riêng.

Các stylesheet toàn cục thuộc sở hữu của `ui-theme/src/styles/`. Style của component nằm cạnh component dưới dạng CSS Modules. Khi một giá trị thuộc về quy ước bố cục hoặc cách hiển thị của chính component đó, component có thể định nghĩa custom property cục bộ; màu sắc, typography, thứ tự lớp và hiệu ứng chuyển động dùng chung thuộc về package theme.

## Quy tắc component

- Dùng CSS Modules và `clsx`; không được thêm thư viện component hay Tailwind.
- Component tính năng dùng token ngữ nghĩa `--dsw-alias-*`. Không được sao chép giá trị bảng màu tĩnh hay viết giá trị màu trực tiếp vào đó.
- CSS của component tính năng không được chứa selector theme. Phần ghi đè theme sáng/tối thuộc về bên sở hữu theme.
- Cỡ chữ phải đi kèm line-height; khi đã có vai trò phù hợp thì dùng biến typography của theme.
- Khi quy ước của component yêu cầu giữ nguyên cấu trúc cột, văn bản mã nguồn, output terminal và dòng diff không được xuống dòng; dùng style thanh cuộn dùng chung, không định nghĩa selector thanh cuộn riêng cho component.
- Quy tắc hiển thị được viết trong CSS. Inline style của React có thể truyền giá trị custom property cục bộ của component, nhưng không được mã hoá nhánh rẽ theo theme.
- Khi thêm hiệu ứng chuyển động hoặc control chỉ hiện khi hover, hãy giữ focus bàn phím rõ ràng và hành vi giảm chuyển động.

## Thay đổi hệ thống

Thêm hoặc sửa token dùng chung trong stylesheet `ui-theme` sở hữu nó, rồi dùng alias ngữ nghĩa của nó trong package tính năng. Khi quy ước style công khai thay đổi, hãy cập nhật tài liệu tham chiếu của package sở hữu. Hành vi thị giác tuân theo [chiến lược kiểm thử](testing.md); [Agent Note về hệ thống style](../.agents/notes/implemented/process/2026-07-19-web-styling-system.md) ghi lại cơ sở của khung này.
