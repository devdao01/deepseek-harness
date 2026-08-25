# dsh-timeout

[English](README.md) | Tiếng Việt

Phần **thời điểm và phân loại (timing & classification)** của timeout: một thư viện hàm thuần túy không phụ thuộc (không phụ thuộc runtime harness), dùng chung cho mọi năng lực cần giới hạn gợi ý timeout của bên gọi, khởi động deadline, và sau đó phân biệt "đã timeout" với "đã bị hủy".

Nó **không chịu trách nhiệm chấm dứt**. Tín hiệu nó phát ra chỉ *thông báo*; việc thực sự dừng công việc vẫn do từng năng lực chịu trách nhiệm, vì cơ chế mỗi nơi mỗi khác: bash gửi SIGKILL tới nhóm tiến trình của hệ điều hành, web đóng socket `fetch`, không có tầng dùng chung nào có thể đảm nhận toàn bộ cơ chế chấm dứt. [Agent Note](../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md) vạch ranh giới là: dùng chung thời điểm/phân loại, giữ việc chấm dứt bắt buộc ở tầng cục bộ.

Đây là **thư viện, không phải service hay plugin**: không có `ctx`, không đăng ký gì, không giữ trạng thái, cũng không phát sự kiện. Một "service timeout" bắt buộc phải biết cách dừng công việc của từng năng lực, mà đây chính xác là kiến thức mà kiến trúc microkernel muốn loại khỏi tầng dùng chung.

## Giao diện công khai

```ts
import { clampTimeout, deadline, idleWatchdog, MAX_TIMER_DELAY_MS, timeoutOf, TimeoutReason } from '@deepseek-ai/dsh-timeout'
```

| Export | Trách nhiệm |
|---|---|
| `clampTimeout(requested, def, max, name?)` | Xác thực gợi ý tùy chọn của bên gọi là số dương và hữu hạn, điền giá trị từ `def`, và giới hạn không vượt quá `max`. Nếu gợi ý là số không dương hoặc không hữu hạn thì ném lỗi (kèm `name`). |
| `deadline(upstream, timeoutMs, code)` | Hợp nhất việc hủy `upstream` và timeout thành một `AbortSignal` (`AbortSignal.any`); timeout mang theo `TimeoutReason`. `[Symbol.dispose]` xóa timer. |
| `idleWatchdog(upstream, timeoutMs, code)` | Giữ một tín hiệu hợp nhất ổn định, và chỉ khởi động timer khi `next()` của async iterator được bảo vệ chưa hoàn thành. Sau khi hoàn thành thì dừng timer; nhu cầu tiếp theo hoặc hoạt động `pulse()` sẽ khởi động lại timer; dispose (giải phóng tài nguyên) sẽ xóa nó; nhu cầu đồng thời bị từ chối. |
| `MAX_TIMER_DELAY_MS` | Độ trễ tối đa mà Node có thể lên lịch mà không giới hạn xuống còn 1 mili giây (`2_147_483_647`). Cấu hình chịu trách nhiệm về timer không được vượt quá giá trị này. |
| `timeoutOf(signal \| { reason }, code?)` | Khôi phục `TimeoutReason` từ tín hiệu/lỗi đã bị abort, nếu không thì trả về `undefined`, tức là bộ phân loại timeout và hủy. Truyền `code` để chỉ khớp với timer của deadline này (xem phần lồng nhau bên dưới). |
| `TimeoutReason` | Đánh dấu nguyên nhân nội bộ trên lần abort do timeout (`code` + `timeoutMs`). Đây không phải lỗi công khai; bên cung cấp chuyển đổi nó thành lỗi/trường riêng của mình. |

## Giá trị đặc biệt (sentinel) `timeoutMs <= 0`

`0` là giá trị "không timeout" **nội bộ** dùng cho công việc nền do chính backend sở hữu (bash `start()`). `deadline()` không khởi động timer, chỉ chuyển tiếp `upstream`; nếu cũng không có upstream, nó sẽ trả về tín hiệu không bao giờ abort và disposer không thao tác gì, để mọi bên gọi có thể giữ cùng một hình dạng lệnh gọi. Gợi ý từ request bên ngoài được xác thực qua `clampTimeout` là **số dương hữu hạn**, trước khi đi vào `deadline`, do đó `0` tuyệt đối không phải giá trị "vô hiệu hóa timeout" hướng tới model/plugin.

## Dạng sử dụng

```ts
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'

declare function runWork(options: { signal: AbortSignal }): Promise<unknown>

// Scope-lifetime consumer (foreground bash, one fetch): `using` disposes the timer.
export async function runWithDeadline(upstream: AbortSignal | undefined, timeoutMs: number): Promise<unknown> {
  using d = deadline(upstream, timeoutMs, 'BASH_TIMEOUT')
  const outcome = await runWork({ signal: d.signal })               // work listens on d.signal and terminates itself
  const timedOut = timeoutOf(d.signal, 'BASH_TIMEOUT') !== undefined // classify the first abort, scoped to OUR code
  const aborted = d.signal.aborted && !timedOut                     // mutually exclusive: timeout won, or cancel did
  return { outcome, timedOut, aborted }
}
```

Tín hiệu này chỉ *thông báo*; bên gọi phải tự tích hợp cơ chế chấm dứt của riêng mình (`d.signal.addEventListener('abort', kill)`, hoặc truyền `d.signal` cho `fetch`). Nếu để promise và timer đua với nhau, lệnh gọi công cụ có thể hoàn thành trong khi tiến trình con hoặc socket vẫn còn đang rò rỉ; còn việc phát tín hiệu bắt buộc phải có một đường dẫn chấm dứt thực sự tồn tại.

Truyền `code` của riêng bạn cho `timeoutOf`, để việc phân loại có thể kết hợp đúng trong các tình huống lồng nhau. Khi bản thân `upstream` là một tín hiệu deadline, nếu timer đó kích hoạt trước, `AbortSignal.any` sẽ giữ lại `TimeoutReason` của nó. Giới hạn phạm vi khớp theo code của bạn sẽ coi timeout từ bên ngoài là một lần hủy upstream thông thường, thay vì tuyên bố rằng timer cục bộ đã đến hạn.

Đối với truyền tải dạng streaming, hãy tạo một `idleWatchdog`, truyền `signal` ổn định của nó cho tầng truyền tải, và gọi `watchdog.next(iterator)` cho mỗi lần đọc của bên cung cấp. Khi hoạt động truyền tải không sinh ra giá trị iterator nào, gọi `watchdog.pulse()`. Khoảng thời gian phải là số dương hữu hạn, và không được vượt quá `MAX_TIMER_DELAY_MS`; nếu không Node sẽ giới hạn nó xuống còn 1 mili giây. Nó chỉ tính giờ cho các yêu cầu đọc chưa hoàn thành, do đó khi mã ở downstream đang render hoặc chờ theo cách khác trước khi yêu cầu mảnh tiếp theo, timer sẽ không chạy. Nguyên thủy này vẫn chỉ thông báo, do đó tầng truyền tải phải quan sát tín hiệu ổn định; adapter DeepSeek và pi-ai chứng minh rằng timeout sẽ đóng body phản hồi thực hoặc request SDK thực của chúng.

## Những thao tác không có timeout

`read`/`write`/`edit` file cục bộ không chấp nhận `timeoutMs`: IO file chạy không giới hạn thời gian, vì deadline sẽ hủy công việc mà hệ điều hành vẫn hoàn thành được. Xem chi tiết tại [trang subsystem hệ thống file](../../../docs/subsystems/filesystem.md).

## Trải nghiệm model

Ảnh hưởng gián tiếp tới model thông qua các bên tiêu thụ như `dsh-tool-call-timeout-policy`; bên tiêu thụ có thể thay kết quả của bên cung cấp bằng lỗi timeout đã giữ lại, hoặc chặn kết quả đến muộn.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; thay đổi tiền tố request do các bên tiêu thụ nêu trên chịu trách nhiệm.

## Giới hạn đã biết và việc còn hoãn lại

- **Chỉ phát thông báo**: deadline không thể dừng công việc bỏ qua tín hiệu của nó; mỗi năng lực vẫn cần đường dẫn chấm dứt socket/tiến trình/tác vụ của riêng mình.
- **`timeoutMs <= 0` là từ vựng nội bộ**: nó chỉ vô hiệu hóa timer cục bộ sau khi backend sở hữu nó đã phân giải chính sách; tuyệt đối không phải công tắc công khai hướng tới model/plugin.
- **Nguyên nhân abort đầu tiên quyết định phân loại**: khi việc hủy upstream xảy ra trước timer cục bộ, tầng này sẽ không thể báo cáo lại được nữa, ngay cả khi timeout của chính nó cũng đến hạn sau đó.
- **Watchdog nhàn rỗi (idle) không phải deadline tổng**: nó khởi động lại cho mỗi nhu cầu iterator chưa hoàn thành, và cố ý loại trừ thời gian xử lý của bên tiêu thụ.
