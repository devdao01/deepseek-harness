# Agent Note: Nguyên thủy timeout/deadline dùng chung, việc chấm dứt cứng để từng capability tự triển khai

Status: implemented

[English](2026-07-06-timeout-deadline-library.md) | Tiếng Việt

## Vấn đề

Việc xử lý timeout dần phân hóa giữa các capability chứa công cụ, và sự phân hóa đó không hề hời hợt: cùng một bộ logic được triển khai lại theo ba cách, mỗi cách mang một gánh nặng tinh vi về tính đúng đắn.

- **bash** (khi đó nằm trong `run.ts` của bản triển khai bash-local) có một cơ chế timeout đầy đủ và đúng đắn ngay trong pipeline tiến trình: một `timeoutMs` được kẹp theo cấu hình, hai trigger độc lập (`killTimer` cho timeout và listener `onAbort` cho việc hủy từ thượng nguồn), mỗi cái đều gọi cùng một closure `kill()` để thực hiện leo thang SIGTERM→thời gian ân hạn→SIGKILL trên nhóm tiến trình, cùng hai giá trị boolean kết quả trực giao (`timedOut`, `aborted`) được chốt độc lập. Sau đợt hợp nhất này, pipeline đó — nay nằm tại [packages/subprocess/subprocess-local/src/spawn.ts](../../../../packages/subprocess/subprocess-local/src/spawn.ts) — chỉ phản ứng với việc hủy; [packages/shell/bash-local/src/index.ts](../../../../packages/shell/bash-local/src/index.ts) sở hữu deadline đã hợp nhất cùng việc phân loại `timedOut`/`aborted`.
- **web_fetch** ([packages/web/web-fetch-http/src/provider.ts](../../../../packages/web/web-fetch-http/src/provider.ts)) có một cơ chế timeout đúng đắn nhưng *viết tay*: dựng một `AbortController`, nối `setTimeout(() => controller.abort(new WebError(…, 'WEB_FETCH_TIMEOUT')))`, thêm và gỡ listener của tín hiệu thượng nguồn bằng tay, xóa bộ định thời trong `finally`, và khôi phục nguyên nhân timeout từ `signal.reason` trong hàm trợ giúp `translateAbortOrNetwork` (vì reader chỉ ném ra `AbortError` trần).
- **web_search** ([packages/web/tool-web/src/search.ts](../../../../packages/web/tool-web/src/search.ts)) **hoàn toàn không có timeout**: `WebSearchRequest` ([packages/web/web/src/types.ts](../../../../packages/web/web/src/types.ts)) không mang trường `timeoutMs`, và `search()` của từng bên cung cấp chỉ chuyển tiếp `exec.signal`. (web_search vẫn không có timeout trong thiết kế lần này — xem mục «Hệ quả».)

Mỗi công cụ tiến trình ngoài hoặc công cụ mạng mới đều phải suy diễn lại đúng bốn việc: kẹp giá trị yêu cầu, khởi động bộ định thời, hợp nhất timeout với việc hủy từ thượng nguồn, và phân biệt «đã timeout» với «đã bị hủy» tại lối ra. Mà phần hợp nhất và khôi phục nguyên nhân lại chính là phần dễ sai một cách tinh vi nhất (cách xử lý `signal.reason` của web_fetch là bằng chứng). Trong khi đó, thao tác *chấm dứt* mà mỗi capability thực hiện lại khác nhau một cách không thể quy giản: bash giết một nhóm tiến trình OS (công việc chạy trong tiến trình con, nằm ngoài runtime này, chỉ chạm tới được qua tín hiệu), còn web thì hủy một `fetch` trong tiến trình (undici tháo dỡ socket). Không tồn tại một cơ chế đơn lẻ nào có thể dừng công việc của mọi capability.

## Quyết định

`@deepseek-ai/dsh-timeout` nằm ở `packages/util/` (ngang hàng với `dsh-brand`), phụ trách nửa phần *đếm giờ và phân loại* của timeout; nửa còn lại — *chấm dứt* cứng — vẫn nằm trong bản triển khai của từng capability. Nó là một thư viện hàm thuần, **không phải** dịch vụ hay plugin Cordis: không nhận `ctx`, không đăng ký thứ gì, không giữ trạng thái xuyên lời gọi, không phát sự kiện. Ở đây cố ý không đặt một «dịch vụ timeout» trung tâm, vì một dịch vụ như vậy sẽ phải biết cách dừng công việc của mọi capability — mà đó chính là loại tri thức mà microkernel muốn loại khỏi tầng dùng chung, cũng là nguyên tắc mà Codex minh họa khi giới hạn `ExecExpiration` trong họ exec.

### Giao diện đối ngoại của thư viện

Bốn hàm, một interface watchdog cùng một kiểu reason:

```ts ignore-check
/** The internal reason attached to a timeout abort, so consumers can classify it after the fact. */
export class TimeoutReason extends Error {
  override name = 'TimeoutReason'

  constructor(readonly code: string, readonly timeoutMs: number) {
    super(`${code} after ${timeoutMs}ms`)
  }
}

/** Validate/fill a caller's optional positive hint from the backend's default, then cap at its max. */
export function clampTimeout(
  requested: number | undefined,
  def: number,
  max: number,
  name = 'timeoutMs',
): number

/**
 * Build a deadline signal that aborts on upstream cancellation OR on timeout,
 * with the timeout carrying a `TimeoutReason`. `timeoutMs <= 0` means "no
 * timeout" (background jobs): forward only the upstream signal, arm no timer.
 * The returned object's `[Symbol.dispose]` clears the timer — `using` for a
 * scope-lifetime consumer, a manual call for an event-lifetime one.
 */
export function deadline(
  upstream: AbortSignal | undefined,
  timeoutMs: number,
  code: string,
): { signal: AbortSignal; [Symbol.dispose](): void }

/** A stable signal plus one-at-a-time, timer-guarded async-iterator demand. */
export interface IdleWatchdog {
  readonly signal: AbortSignal
  next<T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>>
  pulse(): void
  [Symbol.dispose](): void
}

/** Arm only while one iterator `next()` is outstanding; rearm on later demand or out-of-band activity. */
export function idleWatchdog(
  upstream: AbortSignal | undefined,
  timeoutMs: number,
  code: string,
): IdleWatchdog

/** Recover the TimeoutReason from an aborted signal (or error); `code` scopes the match to this deadline's timer. */
export function timeoutOf(x: AbortSignal | { reason?: unknown }, code?: string): TimeoutReason | undefined
```

`deadline` hợp nhất tín hiệu thượng nguồn với một bộ định thời một-lần thông qua `AbortSignal.any`, gắn kèm một `TimeoutReason` đã định kiểu, và phơi bày phần dọn dẹp bộ định thời có thể dispose (giải phóng tài nguyên). Timeout không dương là cờ hiệu «không timeout» nội bộ, dùng cho tác vụ nền do backend sở hữu; gợi ý từ bên ngoài đi qua `clampTimeout` và bắt buộc phải là số dương hữu hạn. Khi không có cả bộ định thời lẫn tín hiệu thượng nguồn, hàm trả về một tín hiệu không bao giờ hủy, với cùng hình thái disposal. Còn `idleWatchdog` thì yêu cầu khoảng thời gian dương hữu hạn, giữ một tín hiệu hợp nhất ổn định trong suốt luồng, và chỉ khởi động bộ định thời khi có một `next()` của iterator chưa được quyết toán; việc quyết toán sẽ giải trừ bộ định thời, demand tiếp theo sẽ khởi động lại, và sau khi có hoạt động truyền tải ngoài luồng, `pulse()` sẽ khởi động lại bộ định thời cho chính demand chưa quyết toán đó. Nếu không có demand nào chưa quyết toán, hoặc đã dispose, thì pulse không làm gì cả; demand đồng thời sẽ thất bại, và dispose sẽ xóa lần kích hoạt hiện tại. Bên cung cấp chuyển dịch nguyên nhân timeout thành kết quả riêng của seam. `timeoutOf(signal, code)` giới hạn phạm vi phân loại, khiến deadline lồng ở ngoài được xem là hủy từ thượng nguồn chứ không phải timeout của chính capability bên trong.

### Phân chia trách nhiệm

| Mối quan tâm | Bên phụ trách |
|---|---|
| Kiểm tra gợi ý yêu cầu và kẹp theo giá trị mặc định/tối đa | `dsh-timeout` (`clampTimeout`): số học thuần cộng cam kết dùng chung về yêu cầu dương hữu hạn |
| Khởi động bộ định thời một-lần, hủy khi hết hạn, mang theo reason, hợp nhất với việc hủy từ thượng nguồn | `dsh-timeout` (`deadline`) |
| Chỉ khởi động và khởi động lại quanh demand iterator chưa quyết toán, hoạt động ngoài luồng cũng kích hoạt khởi động lại | `dsh-timeout` (`idleWatchdog`) |
| Xóa bộ định thời | `dsh-timeout` (`[Symbol.dispose]` của một trong hai nguyên thủy) |
| Phân loại abort reason đầu tiên sau khi hủy | `dsh-timeout` (`timeoutOf`) |
| **Thực sự chấm dứt công việc** | Bản triển khai của từng capability |
| *Giá trị* mặc định/tối đa | Cấu hình của từng capability |
| Chuỗi `code` của timeout | Từng capability (`WEB_FETCH_TIMEOUT` ≠ `BASH_TIMEOUT`) |

Tín hiệu chỉ *thông báo*; việc chấm dứt luôn là trách nhiệm của bên lắng nghe, mà bên lắng nghe thì khác nhau theo từng capability. bash tự viết `addEventListener('abort', kill)`, vì tiến trình OS tồn tại ngoài runtime này và không có gì khác giết nó; web thì giao `d.signal` cho `fetch`, để undici tháo dỡ socket. Đây cũng là lý do đọc/ghi/sửa tệp **không nhận** `timeoutMs`: lời gọi hệ thống cục bộ nhiều nhất chỉ hủy được theo kiểu nỗ lực tối đa, timeout không thể buộc `fsync`/`rename` dừng lại, nên thêm timeout sẽ là một giá trị mặc định ngầm vi phạm nguyên tắc «tường minh hơn ngầm định». Hai agent (tác tử) tham chiếu cũng không đặt timeout cho I/O tệp vì cùng lý do đó.

### Từng capability tiêu thụ thư viện như thế nào

- **web_fetch**: tầng công cụ vẫn kiểm tra và chuyển tiếp; phần controller + `setTimeout` + listener thủ công + `finally` + khôi phục `signal.reason` viết tay của bên cung cấp được thay bằng `deadline`/`timeoutOf` do chính bên cung cấp sở hữu. Tín hiệu thượng nguồn đã bị hủy từ trước vẫn ném ra `WEB_ABORTED` ngay lập tức; nếu không, `fetch` chạy với `d.signal` đã hợp nhất, và `translateAbortOrNetwork` phân loại lỗi được ném ra dựa theo tín hiệu (`timeoutOf` → `WEB_FETCH_TIMEOUT`, nếu không thì đã hủy → `WEB_ABORTED`, nếu không thì lỗi mạng → `WEB_PROVIDER_ERROR`). Cam kết về mã lỗi công khai không đổi, và `TimeoutReason` không bao giờ vượt qua seam web dưới dạng lỗi công khai.
- **bash**: `resolve()` kẹp yêu cầu thành một spec tường minh. `run()` ở tiền cảnh tạo deadline và truyền tín hiệu của nó cho phần thực thi tiến trình, nơi listener abort sẵn có thực hiện kill nhóm tiến trình. Bộ thực thi phân loại abort đầu tiên thành timeout hoặc hủy. Việc khởi chạy ở nền vẫn không có timeout, chỉ chuyển tiếp việc hủy từ thượng nguồn.
- **Adapter LLM (mô hình ngôn ngữ lớn)**: `dsh-llm-deepseek` và `dsh-llm-pi-ai` bọc vòng lặp truyền tải thực tế bằng `idleWatchdog`. Khoảng năm phút được cấu hình chỉ phủ demand chưa quyết toán của bên cung cấp, không tính thời gian bên tiêu thụ hạ nguồn tiêu tốn giữa các phân mảnh. Adapter kết nối trực tiếp DeepSeek còn gọi `pulse()` cho demand chưa quyết toán của mục đó khi bộ phân tích SSE (Server-Sent Events) của nó quan sát thấy một comment; comment đó không được xuất ra dưới dạng `StreamChunk`, cũng không được ghi vào nhật ký phiên. SDK pi-ai không phơi bày hoạt động comment cho adapter của nó, nên nhánh đó chỉ có thể khởi động lại bộ định thời khi SDK xuất ra giá trị. Tín hiệu ổn định được truyền cho `fetch` hoặc SDK trong suốt lời gọi, nên timeout sẽ đóng yêu cầu bên dưới và ánh xạ thành `TIMEOUT`, còn việc bên gọi hủy sớm hơn thì ánh xạ thành `ABORTED`.

## Hệ quả

- Kết quả của `runBash` không còn chốt `timedOut` và `aborted` một cách độc lập; khi timeout và việc người dùng hủy cạnh tranh nhau trước lúc tiến trình đóng, hệ thống nay báo cáo một nguyên nhân abort đầu tiên duy nhất, thay vì cả hai cùng true. Đường dẫn chấm dứt thống nhất SIGTERM→thời gian ân hạn→SIGKILL không đổi, và kiểu Service Definition `ShellRunResult` vẫn giữ hai giá trị boolean (nay loại trừ lẫn nhau), nên phần render kết quả của `dsh-tool-bash` không bị ảnh hưởng.
- `SpawnSpec.timeoutMs` cùng `SpawnOutcome.timedOut`/`aborted` bị gỡ bỏ, thay vì giữ lại như phần dư luôn bằng không / luôn false: vì `runBash` không còn sở hữu bộ định thời và bộ thực thi mới là bên phân loại, nên những trường này chẳng còn nơi nào đọc tới. Một trường luôn bằng 0 và không nơi nào đọc thì thuộc mã chết dưới cổng kiểm soát độ phủ theo từng tệp.
- web_fetch đã loại bỏ phần controller/timer/listener/reason-recovery tùy biến của nó; bộ phân loại nay dựa trên tín hiệu deadline (`timeoutOf` + `aborted`) thay vì dựa trên hình thái của lỗi được ném ra, và cách này vững chắc cho cả hai tình huống: reject-with-reason ở giai đoạn yêu cầu và `AbortError` trần ở giai đoạn đọc.
- `AbortSignal.any` cùng `using`/`Symbol.dispose` lần đầu tiên xuất hiện trong kho mã này (đường cơ sở Node ≥ 24, đã thỏa mãn).
- Luồng mô hình nay dùng chung một cam kết về bộ định thời có thể khởi động lại, không biến khoảng nhàn rỗi trượt thành deadline tổng của lời gọi, cũng không tính thời gian suy nghĩ của bên tiêu thụ. Adapter quan sát được hoạt động truyền tải ngoài luồng có thể gọi `pulse()` cho demand chưa quyết toán; hoạt động bị che khuất thì watchdog vẫn không nhìn thấy. Nguyên thủy này vẫn chỉ làm nhiệm vụ thông báo; kiểm thử adapter chứng minh phần truyền tải của nó quan sát thấy tín hiệu ổn định và chấm dứt.

Những nội dung sau không nằm trong phạm vi lần này, liệt kê ra để làm rõ ranh giới: `web_search` có thể nhận thêm `timeout_ms` tùy chọn hướng tới mô hình sau khi hoàn tất schema công cụ và kế hoạch phủ snapshot của nó; công cụ khám phá hệ thống tệp dựa trên ripgrep ([tìm kiếm ripgrep được đóng gói](2026-08-01-packaged-ripgrep-search.md)) tiêu thụ cùng hình thái deadline do bên cung cấp sở hữu, thông qua `dsh-tool-call-timeout-policy` và `exec.signal`; middleware trong waterfall (sự kiện thác nước) `tools/execute` có thể đặt deadline mặc định cho mỗi lời gọi công cụ bằng cách điều khiển `exec.signal` — đó sẽ là một plugin *tiêu thụ* thư viện này, vẫn chỉ làm nhiệm vụ thông báo, còn việc chấm dứt cứng vẫn là chuyện riêng của từng capability.

## Các phương án đã cân nhắc

**Một *plugin* timeout thống nhất / dịch vụ `ctx.timeout`.** Bác bỏ dựa trên nguyên tắc microkernel. Một dịch vụ có thể dừng công việc của bất kỳ công cụ nào sẽ phải hiểu cơ chế chấm dứt của mọi capability (SIGKILL nhóm tiến trình, tháo dỡ socket, kiểm tra ranh giới lời gọi hệ thống), và đó chính là kiểu «nhân biết quá nhiều» mà kiến trúc cấm. `ExecExpiration` của Codex bị giới hạn trong họ exec chính vì thao tác kill mà nó điều khiển (`killpg`) là đặc thù của họ tiến trình; MCP và luồng mô hình mỗi bên tự giữ cơ chế riêng. Không tồn tại một tầng trung gian mạch lạc nào có thể sở hữu quyền chấm dứt cho mọi thứ, nên phần dùng chung chỉ có thể là nửa đếm giờ/phân loại thuần túy — một thư viện, không phải một dịch vụ.

**Mỗi công cụ tự triển khai timeout, không dùng chung mã (hiện trạng trước đây, cũng là lựa chọn của Claude Code).** Bác bỏ, vì nó đã và đang sinh ra sự phân hóa cùng gánh nặng tính đúng đắn bị lặp lại: web_fetch viết tay đúng cái logic controller/reason mà các công cụ mạng/tiến trình trong tương lai đều sẽ phải tự suy diễn lại, mà phần hợp nhất + khôi phục `signal.reason` mới chính là chỗ dễ sai. Claude Code chấp nhận trùng lặp hoàn toàn; kho mã này có một kênh abort dùng chung thống nhất (`exec.signal` trên mỗi lần `execute`), khiến việc dùng một nguyên thủy dùng chung nhỏ gọn trở nên rõ ràng là sạch hơn, nên cán cân chi phí/lợi ích cũng khác.

**Dùng bộ bọc `withTimeout(promise, ms)` thay cho nhà máy tín hiệu.** Bác bỏ, vì để promise chạy đua với bộ định thời chỉ khiến promise của *lời gọi công cụ* resolve khi deadline tới, chứ không dừng công việc bên dưới — tiến trình con hoặc socket fetch sẽ rò rỉ. Phân phát tín hiệu và buộc capability lắng nghe mới ép được một đường dẫn chấm dứt thật sự tồn tại. Điều này nhất quán với quy tắc phòng vệ «dispose phải đạt tới trạng thái dừng hẳn, chứ không chỉ yêu cầu dừng».

**Giữ nguyên hai trigger timeout và hủy tách biệt của bash.** Bác bỏ, vì một tín hiệu deadline duy nhất đã loại bỏ bộ định thời tùy biến và chuẩn hóa việc phân loại. Khi xảy ra tranh chấp, hệ thống báo cáo abort tới trước làm nguyên nhân, còn đường dẫn chấm dứt SIGTERM→SIGKILL sẵn có thì giữ nguyên.
