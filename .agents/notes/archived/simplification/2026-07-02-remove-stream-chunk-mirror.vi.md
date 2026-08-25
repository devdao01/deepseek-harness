# Agent Note: Ngừng phản chiếu luồng token thành sự kiện agent

Status: implemented
Archived: 2026-07-27

[English](2026-07-02-remove-stream-chunk-mirror.md) | Tiếng Việt

## Vấn đề

Agent loop (vòng lặp tác tử) vừa ghi mỗi token delta của mô hình thành sự kiện phiên bền `assistant/chunk`, vừa phát ra một sự kiện Cordis thời gian thực song song `agent/stream-chunk` mang đúng dữ liệu đó. Trong `packages/core/agent-loop/src/agent.ts`, hai việc này chỉ cách nhau một dòng:

```ts ignore-check
const chunkEvent = session.append('assistant/chunk', { turn, step, chunk })
chunkSeqs.push(chunkEvent.seq)
ctx.emit('agent/stream-chunk', agent, turn, step, chunk)   // ← the mirror
```

- Sự kiện bền: `assistant/chunk: { turn, step, chunk }`.
- Phát thời gian thực: `agent/stream-chunk(agent, turn, step, chunk)` — cùng `StreamChunk`, cùng `turn`/`step`.

Thứ duy nhất mà bản phát thời gian thực có thêm so với sự kiện phiên là handle `Agent` thời gian thực, và consumer duy nhất lại vứt bỏ nó ngay (hàm xử lý của nó có chữ ký `(_agent, _turn, _step, chunk)`).

Đây chính là kiểu trùng lặp mà [việc gỡ bỏ mirror ranh giới](2026-06-20-remove-agent-boundary-mirror-events.md) đã loại trừ cho ranh giới lượt/bước: consumer đối diện với hai nguồn sự thật cho cùng một dữ kiện bền, và mỗi lần thay đổi đều phải chạm vào cả hai. Agent Note (bản ghi quyết định của agent) đó không gộp luồng phân mảnh vào cùng lúc mà hoãn lại ("việc lưu bền `assistant/chunk` vẫn mang ràng buộc then chốt, nên sau này có thể đánh giá luồng phân mảnh như một mirror, nhưng đó là một quyết định riêng"). Agent Note này chính là quyết định riêng ấy.

Tiền đề mà việc hoãn dựa vào nay đã rõ ràng: việc lưu bền phân mảnh là có thẩm quyền và sẽ được giữ lại. Đề xuất ngừng lưu bền phân mảnh, chỉ giữ sự kiện luồng thời gian thực nhất thời, đã bị [bác bỏ](../../rejected/simplification/2026-06-20-assembled-assistant-messages-only.md) — phát lại độ trung thực cao, các luồng thất bại một phần và phát lại snapshot đều phụ thuộc vào chuỗi `assistant/chunk` được lưu bền. Do đó `assistant/chunk` trên `session/event` là luồng token bền và chịu tải, còn `agent/stream-chunk` chỉ là bản sao thuần dư thừa của nó.

## Quyết định

Gỡ `agent/stream-chunk` khỏi hệ thống phân loại sự kiện agent. Luồng token được đọc qua `session/event` dưới dạng `assistant/chunk` — đúng chuỗi mà persistence và phát lại vốn đã dùng. `session/event` là luồng transcript (bản ghi văn bản) thời gian thực duy nhất (phân mảnh assistant, ranh giới lượt/bước, hoạt động công cụ, todo).

**Consumer.** Persistence, phát lại và các renderer tương tác tiêu thụ trực tiếp luồng phiên có thẩm quyền. [Lớp cầu nối ACP (Agent Client Protocol) chỉ hướng tự động hóa](2026-07-23-acp-automation-only-protocol.md) phát ra văn bản `assistant/message` đã commit thay vì phân mảnh thô, nên nó không cần loại sự kiện nào trong hai loại. Không consumer production nào cần một mirror token đặt `Agent` lên trước.

## Phạm vi

Gỡ bỏ: `agent/stream-chunk`.

Không đụng tới:
- `assistant/chunk` (sự kiện phiên bền) — luồng token có thẩm quyền, giữ nguyên. Agent Note này gỡ mirror thời gian thực, chứ không gỡ persistence (đề xuất gỡ persistence đã bị từ chối riêng — xem trên).
- `agent/steering` — quyết định này không đụng tới (nó là tín hiệu điều khiển, không phải luồng token). Sự kiện song sinh bền của nó là `steering/message`, còn lệnh phát mirror đã bị gỡ bởi Agent Note kế tiếp của chính nó: [Gỡ lệnh phát mirror `agent/steering`](../../archived/simplification/2026-07-04-remove-agent-steering-mirror.md).
- `agent/status`, `agent/error`, `agent/created`/`agent/disposed`, `agent/queued`, `agent/session-start` — sự kiện vòng đời/điều khiển, không phải dữ liệu transcript, và cũng không có bản sao bền.

## Các phương án từng cân nhắc

**Gỡ persistence, chỉ giữ luồng thời gian thực nhất thời** — hướng cắt tỉa ngược lại, đã bị [bác bỏ riêng](../../rejected/simplification/2026-06-20-assembled-assistant-messages-only.md): phát lại độ trung thực cao, các luồng thất bại một phần và phát lại snapshot đều phụ thuộc vào chuỗi `assistant/chunk` được lưu bền. Một khi tiền đề này đã chốt, chính bản phát thời gian thực mới là nửa dư thừa trong cặp đôi.

## Hệ quả

Plugin không còn có thể quan sát token tăng dần từ sự kiện đặt `Agent` lên trước. Nó cần đăng ký `session/event`, lọc `assistant/chunk`, và khi cần thì tra cứu trực tiếp handle thời gian thực tương ứng qua `ctx.agents.get(session.id)`. Không consumer production nào cần lấy `Agent` thời gian thực ngay tại thời điểm phân mảnh; đây cũng chính là đánh đổi mà việc gỡ mirror ranh giới đã chấp nhận, và nó chấp nhận được.
