# e2e trình duyệt của apps/web

[English](README.md) | Tiếng Việt

Các test này khởi động tổ hợp web thực trong tiến trình (in-process), và dùng Chromium thực để điều khiển nó qua HTTP thực. Cơ chế của lane
này — mode, fixture, golden, và những khác biệt tổ hợp cố tình giữ lại so với `dsh web` — được ghi lại trong
[`scaffold.ts`](scaffold.ts) và
[Agent Note e2e trình duyệt](../../../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.md).

## Đây là các test phía Host

Chúng được kiểm tra kiểu trong `tsconfig.host.json` ở gốc repo, chứ không nằm trong Client aggregate, vì chúng đọc trực tiếp
các service của Host: `ctx.apiProxy`, `SessionStore` phía Host, `ctx.sessionProjectionCache`. Việc runtime điều khiển
trình duyệt không khiến một tệp trở thành một phần của chương trình Client — hai face gộp `Context` của cordis trên
cùng một tập khóa nhưng với các service khác nhau, do đó một chương trình đơn lẻ không thể thấy cả hai cùng lúc. Chuyển
các tệp này vào Client aggregate sẽ khiến mọi lượt truy cập service của Host không thể biên dịch được.

## Không import `@deepseek-ai/dsh-client-*` ở đây

Import một package Client — dù là value hay type — đều sẽ kéo toàn bộ TypeScript project của nó, cùng mọi project mà nó
tham chiếu, vào **build graph của Host**. Điều này đã từng làm lane này gặp sự cố một lần: bốn package tiêu thụ Client đã tham chiếu
face Client của `api/remotes`, mà face này phải đợi Host tsdown sinh ra `@deepseek-ai/dsh-goal/remote` thì mới biên dịch được,
khiến giai đoạn build Host trở thành việc chờ một sản phẩm do chính nó tạo ra.

Khi một kịch bản cần đến hằng số hay hàm thuần túy mà Client sở hữu, hãy mirror (nhân bản) chúng ở đây, kèm một
comment import bị comment out ngay bên cạnh, chỉ rõ module nguồn. Bằng cách này, độ trôi (drift) sẽ biểu hiện thành selector
không khớp hoặc giá trị mirror bị lỗi thời — tức là thất bại rõ ràng, không bao giờ là pass ngầm. `scaffold.ts` mirror theo
quy tắc này cho namespace của lời chào (welcome statement), các trường xác nhận, phiên bản, và nội dung tiếng Trung được assert.

Có hai loại import Client được xem là hợp lệ lâu dài. `assembled-boot.ts` điều khiển chính shell, nên nó import
`AppWebEntry` từ `@deepseek-ai/dsh-client-web`, và import kiểu boot manifest từ
`@deepseek-ai/dsh-client-modules/client`: khởi động shell thực chính là mục đích của
harness này, và cả hai package này vốn đã nằm trong build graph của Host. Ngoài ra, kịch bản chat import
`conversationContextKey` từ `@deepseek-ai/dsh-client-runtime/client`, vì
`client/runtime` có thể truy cập được thông qua package `directory-picker` chưa bị tách, và sẽ không kéo theo thứ gì khác. Khả năng
truy cập được này là ngẫu nhiên, không phải một cam kết — một khi nó rời khỏi graph đó, hãy mirror helper đó như các trường hợp còn lại.

Không có cơ chế nào cưỡng chế quy tắc này; nó chỉ được giữ vững nhờ review.
