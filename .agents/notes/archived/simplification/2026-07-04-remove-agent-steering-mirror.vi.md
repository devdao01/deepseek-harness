# Agent Note: Gỡ lệnh emit mirror `agent/steering`

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-remove-agent-steering-mirror.md) | Tiếng Việt

## Vấn đề

`agent/steering` là mirror nhất thời cuối cùng còn tồn tại của một sự kiện phiên bền. Logic drain steering (điều hướng giữa chừng) của agent loop (vòng lặp tác tử) trước tiên nối thêm sự kiện bền `steering/message { turn, content, source }`, rồi ngay dòng kế tiếp phát `agent/steering(agent, turn, content, source)` — cùng một dữ kiện được phát lại dưới dạng sự kiện fire-and-forget (`packages/core/agent-loop/src/loop.ts`, `drainSteering`). Trong môi trường production nó không có bất kỳ bên lắng nghe nào: bên đăng ký duy nhất là một bài kiểm thử hồi quy của agent loop, khẳng định rằng lệnh emit có mang `source` — mà chính dữ kiện đó đã được sự kiện bền ở dòng trên ghi lại.

`agent/steering` lặp lại sự kiện bền `steering/message` ngay trước nó với cùng payload. `agent/queued` vẫn được giữ như một tín hiệu thuần nhất thời, vì nó kích hoạt trước khi lưu bền, bao phủ những công việc có thể bị hủy trước khi vào nhật ký.

Steering mang lưu lượng production thật — quyết định tiếp tục lượt của cầu nối hook tiêm lý do của nó qua `inbox.steer()`, rốt cuộc trở thành sự kiện bền `steering/message` được cố định bởi kỳ vọng đầu ra của ma trận hook — và không có ngoại lệ nào, tất cả những consumer này đều quan sát sự kiện bền. Không có gì quan sát mirror cả.

## Quyết định

`agent/steering` đã bị gỡ khỏi phân loại sự kiện agent: bao gồm khai báo trong `packages/core/agent/src/types.ts` (cùng phần nhắc tới nó trong danh sách JSDoc về sự kiện thời gian thực ở đó), lệnh emit trong `drainSteering` (tham số `ctx` khi đó đã trở nên vô dụng cũng bị gỡ theo), dòng bảng trong `packages/core/agent/README.md`, và dòng emit trong các khối mã giả của vòng lặp (tài liệu module `packages/core/agent-loop/src/loop.ts` và [architecture.md](../../../../docs/architecture.md)); danh mục Cordis sau khi sinh lại không còn chứa nó. Bài kiểm thử hồi quy duy nhất chuyển sang cố định hành vi bảo toàn nguồn trên sự kiện bền `steering/message` — dữ kiện được cố định tồn tại trên nhật ký.

Ba Agent Note (bản ghi quyết định của agent) đã triển khai từng giải thích lý do giữ sự kiện này; theo [implemented/AGENTS.md](../AGENTS.md), mỗi bản ghi đều đã được sửa và trỏ tới bài này như bản ghi gỡ bỏ: gồm mục trong danh sách giữ lại của [Agent Note về ranh giới](2026-06-20-remove-agent-boundary-mirror-events.md), điều khoản phạm vi của [Agent Note về phân mảnh luồng](2026-07-02-remove-stream-chunk-mirror.md), và phần liệt kê emit nhất thời của [Agent Note về ngữ nghĩa miền sự kiện](../architecture/2026-06-30-event-domain-semantics.md).

## Các phương án từng cân nhắc

### Vì sao không giữ lại?

"Nó là tín hiệu điều khiển, không phải ranh giới" — nhưng ranh giới phân loại thực tế là mirror/chỉ-thời-gian-thực, chứ không phải điều khiển/ranh giới, và sự kiện này đúng là mirror. Consumer muốn được thông báo lúc vào hàng đợi có thể dùng `agent/queued` (cùng cờ steering của nó); còn consumer muốn được thông báo lúc drain thì về bản chất đang yêu cầu biết thời điểm `steering/message` được nối thêm, mà `session/event` sẽ chuyển giao đúng payload đó kèm theo tính bền vững. [Agent Note bị bác bỏ về việc khai tử steering giữa lượt](../../rejected/simplification/2026-06-20-retire-mid-turn-steering.md) bảo vệ *tính năng* steering — `steer()`, sự kiện bền, việc cưỡng chế tiếp tục — và lần gỡ bỏ này không đụng tới bất kỳ điều nào trong số đó.

## Kiểm chứng

Cách viết `agent/steering` chỉ còn tồn tại trong nội dung Agent Note (Agent Note này, ba Agent Note đã sửa ở trên, và [Agent Note bị bác bỏ về tính năng steering](../../rejected/simplification/2026-06-20-retire-mid-turn-steering.md) đã đóng băng, nội dung của nó ghi lại đề xuất mà nó bác bỏ); danh mục đã được sinh lại; bài kiểm thử được chuyển hướng cố định hành vi bảo toàn nguồn trên `steering/message`.

## Hệ quả

Trong môi trường production không có bên lắng nghe nào cần di trú, và hai nhu cầu thông báo nhất thời đều có chỗ thuộc về: lúc vào hàng đợi thì do `agent/queued` (kèm cờ `steering`) đảm nhiệm, lúc drain thì do `session/event` đảm nhiệm khi sự kiện bền `steering/message` hạ cánh.
