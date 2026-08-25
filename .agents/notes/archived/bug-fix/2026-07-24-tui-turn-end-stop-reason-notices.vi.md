# Agent Note: TUI hiển thị lý do cho mỗi kind kết thúc lượt (turn end)

Status: implemented
Archived: 2026-08-04

[English](2026-07-24-tui-turn-end-stop-reason-notices.md) | 中文

## Vấn đề

TUI render thông báo transcript (bản ghi văn bản) cho các trường hợp kết thúc lượt (turn end) thuộc các kind: `error`, `aborted`, `max-tokens`, `rejected`, `interrupted`, nhưng kind `disposed` cũng như bất kỳ kind nào do plugin bổ sung vào `TurnEndReasonMap` thì không render gì cả. Khi kết thúc lượt thuộc các kind này, dù xảy ra trong thời gian thực hay khi phát lại (replay) từ log đã lưu bền, agent (tác nhân) sẽ dừng làm việc mà không có bất kỳ lý do nào hiển thị cho người dùng, vi phạm kỳ vọng sản phẩm là "mỗi lần dừng đều phải giải thích cho người dùng".

## Quyết định

Nhánh `turn/end` trong `packages/ui/tui/src/index.ts` switch theo trường phân biệt (discriminant field) của reason để bao phủ mọi kind: `completed` giữ im lặng, vì tin nhắn assistant đã hoàn tất cùng phần header đếm giờ `Completed` của nó đã thể hiện kết quả này rồi; `disposed` bổ sung thêm `Turn stopped: the agent was disposed.`; nhánh default merge-mở rộng (merge-extended) bổ sung `Turn ended: <kind>.`, giúp các kết quả mới do plugin bổ sung mà TUI chưa biết vẫn nêu rõ được lý do agent dừng lại. Các kind còn lại giữ nguyên thông báo hiện có.

## Phương án thay thế

**Cũng thêm một thông báo cho lượt `completed`.** Bị bác bỏ, vì gây nhiễu: mỗi phản hồi thông thường sẽ có thêm một dòng dư thừa, trong khi tin nhắn assistant cộng với phần header đếm giờ đã đóng băng vốn đã đánh dấu sự hoàn tất.

**Vì `agent/disposed` cũng đã bổ sung thêm `Agent "<id>" was disposed.`, nên chặn thông báo kết thúc lượt `disposed` trong trường hợp thời gian thực.** Bị bác bỏ: hai thông báo nêu ra hai sự thật khác nhau (thông báo trước cho biết lượt này bị cắt ngang giữa chừng, thông báo sau cho biết agent không còn tồn tại nữa), hơn nữa chỉ có thông báo kết thúc lượt mới được giữ lại khi phát lại log đã lưu bền, còn `agent/disposed` phát ra trong thời gian thực sẽ không xuất hiện lại khi phát lại.

**Để nhánh default giữ im lặng (giữ nguyên hành vi trước đây).** Bị bác bỏ: chính những kind merge-mở rộng mà TUI không nhận biết được lại là trường hợp người dùng không còn cách nào khác để biết vì sao agent dừng lại.

## Hệ quả

- Trong TUI, kết thúc lượt sẽ không bao giờ thiếu lý do hiển thị cho người dùng: mọi kind `turn/end` không phải `completed` đều bổ sung thêm một thông báo transcript, kể cả các kind mới do plugin bổ sung mà TUI chưa biết cũng được liệt kê theo tên.
- Việc dispose (giải phóng tài nguyên) trong thời gian thực khi lượt đang chạy sẽ hiển thị hai thông báo (thông báo kết thúc lượt cộng với `agent/disposed`); khi phát lại log thì chỉ hiển thị thông báo kết thúc lượt.
- Snapshot `errors-and-help` đã cố định (pin) thông báo `disposed` và thông báo cho các kind chưa biết, cùng với các thông báo lỗi và gián đoạn hiện có.
