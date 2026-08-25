# Agent Note: Dùng tên file để đánh dấu compile face của test client

Status: implemented

[English](2026-08-12-face-named-client-test-files.md) | 中文

## Vấn đề

`packages/client/*/tests/` chứa đồng thời test của hai compile face. Phần lớn bao phủ nửa browser của một package Client, thuộc `tsconfig.client.json`; số ít bao phủ nửa Host của package bị tách — spec nửa node của carrier — chỉ có thể type-check trong `tsconfig.host.json`, vì spec phía Host chạm vào source Host cần chính project Host chứa các file đó.

Tên file không nói rõ một test bao phủ face nào, nên hai aggregate không thể chia tách thư mục này theo pattern. Aggregate host loại trừ toàn bộ `packages/client/**`, aggregate Client nhận tất cả, nên spec phía Host bị kẹt lại trong project Client. Điều đó buộc aggregate Client phải tham chiếu `packages/client/connection/tsconfig.host.json` — một cấu hình Client đi vào nửa Host của package bị tách — mà quy tắc project reference của `constraints` từ chối cạnh này.

Khi không có quy tắc đặt tên, còn hai lối thoát khác, và cả hai đều tệ hơn. Dùng `files` trong aggregate host để "đục lại" bốn file đó sẽ tự mâu thuẫn với phần loại trừ toàn bộ trong cùng một file, và mỗi khi thêm spec phía Host mới lại phải thêm một dòng. Mở cho phép tham chiếu xuyên face đó lại làm suy yếu quy tắc tách hai bộ `Context` riêng biệt.

## Quyết định

Các file test dưới `packages/client` dùng tên file để nói rõ mình bao phủ face nào:

| Hậu tố | Face | Số lượng |
|---|---|---|
| `*.client.spec.ts` / `*.client.spec.tsx` | Client | 232 |
| `*.client.ts` / `*.client.tsx` (helper dùng chung, fixture) | Client | 5 |
| `*.host.spec.ts` | Host | 4 |

Hai nhóm hậu tố loại trừ lẫn nhau — không nhóm nào là hậu tố của nhóm kia — nên mỗi aggregate chỉ cần giữ một glob test rộng và loại trừ phía đối diện:

- `tsconfig.client.json` include `packages/client/*/tests/**/*.{ts,tsx}`, exclude `packages/client/*/tests/**/*.host.spec.ts`.
- `tsconfig.host.json` qua glob cấp repo `packages/*/*/tests/**/*.ts` đến cùng thư mục đó, exclude `packages/client/*/src/**` cùng bốn pattern `*.client.*`.

Điều này dựa trên việc `exclude` lọc kết quả của `include`: khi cả hai cùng khớp một file, file đó bị loại khỏi program. Không file nào bị cả hai aggregate cùng nêu tên, cả hai aggregate đều không cần entry `files` hay project reference xuyên face. `verify-md-links` và quy tắc project reference của `constraints` pass nguyên vẹn, carrier không cần bất kỳ ngoại lệ nào.

Test mới thêm dưới `packages/client` phải mang hậu tố tên face. File không có hậu tố sẽ bị glob cấp package của aggregate host khớp trúng, và âm thầm kéo source Client vào program Host.

## Danh sách đổi tên lần này

- 232 spec phía Client, từ `*.spec.{ts,tsx}` đổi thành `*.client.spec.{ts,tsx}`.
- 5 helper phía Client, từ `*.{ts,tsx}` đổi thành `*.client.{ts,tsx}`: `connection/tests/fake-api`, `runtime/tests/fake-api`, `runtime/tests/event-script`, `ui-conversation/tests/chat-snapshot-fixture`, `ui-tool/tests/tool-details-render`.
- 4 spec phía Host dưới `packages/client/connection/tests/`, từ `*.spec.ts` đổi thành `*.host.spec.ts`: `api-request-trust`, `http-bridge`, `node-half`, `websocket-downlink`.
- 2 file snapshot, đổi tên theo spec tương ứng, nội dung không đổi.

Bảng chỉnh sửa chính xác của `scripts/rescope-vendor.ts` nêu tên ba spec trong số đó, các đường dẫn này cũng được di chuyển theo.

## Phương án thay thế từng cân nhắc

**Chỉ thêm hậu tố `*.host.spec.ts` cho file phía Host, giữ nguyên phía Client.** Lần thử đầu tiên chính là như vậy, và nó không hoạt động: `.host.spec.ts` cũng kết thúc bằng `.spec.ts`, nên phần loại trừ `*.spec.ts` của aggregate host nuốt luôn nó, `include` cũng không giành lại được. Việc khiến hai pattern không giao nhau chính là nhờ cả hai bên cùng được đặt tên.

**Đặt tên file phía Host là `*.host-spec.ts`, tách khỏi thông lệ `.spec.ts`.** Không đổi phía Client thì cũng không giao với `*.spec.ts`, nhưng vì một chi tiết cấu hình mà rời khỏi thông lệ đặt tên test của repo và pattern discovery của vitest.

**Chuyển spec phía Host vào thư mục con `tests/host/`, chia theo đường dẫn.** Dùng glob cũng khả thi tương tự, nhưng nó tách test của một package ra hai thư mục, người đọc duyệt `tests/` không còn thấy chúng nằm cùng nhau.

**Giữ loại trừ `packages/client/**`, dùng `files` để "đục lại" spec phía Host.** `files` không bị `exclude` lọc, nên thực sự lấy được chúng — cái giá là cùng một file vừa khẳng định thư mục đó thuộc aggregate khác, vừa liệt kê ngoại lệ cho khẳng định đó, và mỗi spec phía Host mới lại phải thêm một dòng.

## Hệ quả

Quy tắc này tốn thêm một hậu tố cho mỗi tên file test client, đổi lại là một cách chia tách cơ học: thành viên của một aggregate được suy ra từ tên file, chứ không phải từ một danh sách. Quy tắc cấm tham chiếu xuyên face trong `constraints` giữ nguyên toàn bộ hiệu lực — không package nào được miễn trừ.

Program Host giờ thấy 11 file dưới `packages/client` (4 spec phía Host, cộng khai báo phía Host của carrier được giải quyết qua project reference), trong khi ở trạng thái loại trừ theo pattern nhưng tên file không theo pattern thì có 60 file lọt vào.

vitest qua `**/*.spec.{ts,tsx}` vẫn phát hiện được mỗi file đã đổi tên, nên cấu hình test không thay đổi; toàn bộ test suite client chạy 235 file, 3181 case. Pattern entry `tests/**/*.spec.{ts,tsx}` của knip cho từng workspace cũng khớp tên mới tương tự.

Chế độ thất bại còn lại của quy tắc này là thêm một test mới không mang hậu tố: nó sẽ type-check pass trong program Host đối với source Client, thay vì báo lỗi rõ ràng.
