# Agent Note: Xóa dải kế hoạch todo khi lượt tiếp theo bắt đầu

Status: implemented

[English](2026-07-28-todo-plan-clears-on-next-turn.md) | 中文

## Vấn đề

`todo_write` lưu snapshot danh sách đầy đủ vào log session, host tương tác render danh sách mới nhất thành dải kế hoạch (web TodoPanel qua projection `todos`, TUI Plan panel). Sau khi một lượt kết thúc, dải đó vẫn còn trên màn hình ở lượt người dùng tiếp theo — danh sách của task trước đã hoàn thành hoặc đã bỏ dở. Người đọc hiểu dải kế hoạch là "lượt này đang làm gì", nên danh sách cũ tồn tại xuyên lượt là sai vòng đời sản phẩm. Agent Note [hiển thị todo trên web](2026-07-23-web-todo-display.md) và [tool `todo_write`](2026-06-29-todo-write-tool.md) vẫn sở hữu event sourcing và hai mặt render; chúng mô tả kế hoạch thường trú kéo dài suốt toàn bộ session cho đến lần ghi tiếp theo.

## Quyết định

Kế hoạch thường trú là lần `todo/write` gần nhất mà sau đó không có `turn/start` muộn hơn. `turn/end` giữ danh sách hiển thị, để người dùng vẫn thấy được danh sách vừa hoàn thành khi đọc câu trả lời; `turn/start` tiếp theo sẽ xóa nó, cho đến khi model ghi lại lần nữa.

### Projection host (web)

Đơn vị projection `todos` của `dsh-tool-todo` gấp quy tắc này: `apply` lấy danh sách đầy đủ từ mỗi `todo/write`, và trả về `null` ở mỗi `turn/start` (`stateVersion` 2). Vật mang (`dsh-host-apiproxy`) cung cấp giá trị đó trong khối `projections` ở cuối bản ghi lịch sử, và đẩy bằng khung `session/projection`; web dock đọc qua `useProjection('todos')`. Fixture (dữ liệu tiền đặt cho test) keyless phản chiếu cùng cơ chế gấp đó, phục vụ cho snapshot đã lắp ráp.

### Đường thời gian thực của TUI

Nhánh `renderEvent` của TUI gốc trước đây xóa panel kế hoạch cục bộ tại `turn/start`, thay thế nó tại `todo/write`, đường tái dựng của nó reset panel trước khi replay, khiến khôi phục nguội hội tụ về cùng quy tắc; package đó sau này đã bị xóa ([xóa package TUI](../simplification/2026-08-04-remove-tui-package.md)).

## Phương án thay thế đã cân nhắc

- **Xóa tại `turn/end`** — người dùng vẫn đang đọc câu trả lời vừa hoàn thành sẽ bị ẩn danh sách; lúc này trách nhiệm của dải kế hoạch là kế hoạch đã hoàn thành, chứ không phải dock trống.
- **Chỉ xóa khi mọi mục đều `completed`** — sẽ để kế hoạch bị bỏ dở hoặc hoàn thành một phần tồn dư xuyên lượt; dải kế hoạch vẫn hiển thị công việc của task khác.
- **Append một `todo/write` rỗng khi lượt bắt đầu** — viết lại log chỉ vì quy tắc vòng đời UI, và bịa ra một lần ghi mà model chưa từng viết.

## Hậu quả

Projection host và panel TUI dùng chung quy tắc vòng đời này; mở lại session chỉ khôi phục kế hoạch khi sau đó không có lượt bắt đầu muộn hơn. Thay thế một phần mô tả "kế hoạch thường trú cấp session" trong [hiển thị todo trên web](2026-07-23-web-todo-display.md) và [tool `todo_write`](2026-06-29-todo-write-tool.md): event sourcing, thay thế last-write-wins và hai mặt render vẫn thuộc các Agent Note đó; Agent Note này sở hữu việc xóa ở ranh giới lượt. Bao phủ: test đặc tả cho projection tool-todo về việc xóa tại turn/start và giữ tại turn/end, fixture cung cấp khung push cho web snapshot đã lắp ráp, và snapshot TUI khởi động lượt tiếp theo rồi chốt kết quả dải kế hoạch đã biến mất.
