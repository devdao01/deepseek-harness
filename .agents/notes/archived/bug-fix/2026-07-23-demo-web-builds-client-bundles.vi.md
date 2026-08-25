# Agent Note: demo:web build ra bundle sản phẩm của plugin client

Status: implemented
Archived: 2026-07-26

[English](2026-07-23-demo-web-builds-client-bundles.md) | 中文

## Problem

`dsh web` phục vụ bundle sản phẩm của từng plugin web client qua `GET /plugins/<id>/client.js`, đường dẫn được giải quyết từ `exports["./client"]` (`lib/client.js`) của package. Các bundle sản phẩm này chỉ được sinh ra bởi `pnpm run build` ở thư mục gốc (trước tiên chạy `tsc -b`, sau đó thực thi cấu hình `tsdown.client.ts` của từng package); bước `build:web` của Vite chỉ build phần vỏ (shell) frontend. `demo:web` và phần hướng dẫn Web UI trong README chỉ chạy `build:web`, vì vậy trên một checkout chưa được build đầy đủ từ trước, bundle sản phẩm của mỗi plugin đều trả về 404, client loader đánh dấu tất cả plugin là thất bại, và màn hình khởi động hiển thị "Failed to load plugins". Phần vỏ frontend vẫn build được bình thường, che giấu việc thiếu bundle sản phẩm phía sau một lỗi runtime ở trình duyệt.

## Decision

`demo:web` chạy `npm run build` trước `npm run build:web`, để bundle sản phẩm `lib/client.js` của plugin đã tồn tại trước khi `dsh web` phục vụ chúng. Mục Web UI trong README chạy `pnpm run build && pnpm run build:web` cho một checkout đã cài đặt tại `~/.dsh/source`, vì trình cài đặt không bao giờ tự build phần này.

## Verification

Sau khi build đầy đủ, cả tám endpoint `/plugins/<id>/client.js` đều trả về 200, Chromium headless load `http://127.0.0.1:3080` render được phần vỏ, không còn xuất hiện trạng thái "Failed to load plugins".

## Alternatives considered

**Build bundle sản phẩm khi khởi động `dsh web`.** Ứng dụng này chạy từ mã nguồn qua tsx, tự thân không có bước build; nhét việc build sản phẩm vào quy trình khởi động server sẽ phá vỡ ranh giới phân tách giữa mã nguồn và sản phẩm build, đồng thời làm chậm mỗi lần khởi động.

**Mở rộng cấu hình tsdown gốc để `pnpm run build:web` cũng tạo ra bundle sản phẩm cho client.** `build:web` là bước build frontend của Vite; bundle sản phẩm cho client là một lượt xử lý tsdown độc lập khác dựa trên `lib/types`. Gộp hai việc này lại sẽ làm lẫn lộn giữa build phần vỏ và build package, trong khi `build` ở thư mục gốc vẫn là nơi duy nhất tạo ra sản phẩm này.

## Consequences

Giờ đây mỗi lần gọi `demo:web` phải trả giá bằng toàn bộ chi phí của `tsc -b && tsdown`, chứ không còn chỉ là chi phí build của Vite nữa. Đây là cái giá phải trả để chạy demo web từ một cây mã nguồn sạch; những bên gọi đã build sẵn có thể gọi thẳng `dsh web`.
