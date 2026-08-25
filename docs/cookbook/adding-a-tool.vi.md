# Tham khảo viết công cụ (tool)

[English](adding-a-tool.md) | Tiếng Việt

Tài liệu này là căn cứ cho các quy ước mà công cụ hướng tới mô hình phải tuân thủ. Nếu cần xây dựng công cụ đầu tiên theo từng bước, hãy đọc [xây dựng công cụ](../user/develop/basic/tool.md). `packages/shell/tool-bash` là ví dụ ba-package cấp production.

## Hình thái tối thiểu

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',          // what the model sees
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                     // optional by default
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // args is TYPED from the schema: { path: string; limit?: number }
      // exec carries immutable identity + token; signal is the operational field
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

Việc đăng ký dựa trên side-effect: dispose (giải phóng tài nguyên) plugin fiber tức là hủy đăng ký công cụ đó. Schema sẽ tự động chảy vào quá trình lắp ráp system prompt.

## Các quy tắc của quy ước `execute()`

- **Tham số đã được kiểm tra sẵn cho bạn.** `defineTool` sẽ kiểm tra `arguments` do mô hình sinh ra theo `ParameterSchemaSpec` thống nhất (kiểu, khóa bắt buộc, ràng buộc literal, union khớp đúng một nhánh, và giá trị lồng nhau — xem [kiểm tra tham số thời gian chạy](../../.agents/notes/implemented/architecture/2026-06-11-runtime-arg-validation.md)) trước khi `execute` chạy, do đó args bên trong `execute` sẽ khớp với `InferArgs`. Object node tường minh phải khai báo `additionalProperties: true | false`; object gốc tham số ngầm định vẫn giữ mở. Bạn vẫn cần tự kiểm tra các ràng buộc mà DSL của schema không thể biểu đạt, ví dụ chuỗi không rỗng, số dương, hoặc quy tắc xuyên trường. Công cụ đăng ký trực tiếp bằng JSON Schema thô tự chịu trách nhiệm về việc kiểm tra đầu vào của chính nó.
- **Đăng ký mượn định nghĩa chỉ-đọc của bạn.** Đóng góp có kiểu cùng tiến trình không phải là ranh giới tuần tự hóa (serialization); sau khi đăng ký, đừng sửa schema của nó hay thay callback. `schemas()` chỉ vật chất hóa phần projection hướng tới mô hình tường minh. Nếu cần thay nóng (hot-replace) một công cụ, hãy dispose side-effect thuộc về nó rồi đăng ký cái thay thế; trạng thái có thể thay đổi bên trong closure của callback vẫn là trạng thái plugin thông thường.
- **Danh tính thực thi được bảo vệ.** Registry vật chất hóa `arguments` thành JSON không mất mát, tách rời, trong một lượt duyệt đệ quy, đóng băng giá trị đó trước khi policy bắt đầu, và cấp một `exec.token` mờ (opaque); `callId`, `name`, `arguments`, `agent`, `token`, `signal` bắt buộc do bên gọi giữ, và `parent` token truyền tải bên ngoài tùy chọn đều bất biến trong suốt quá trình phân phối. `parent` chỉ dùng để nhận dạng, không phơi bày việc thực thi bên ngoài đang hoạt động. Hãy coi `args` là đầu vào chỉ-đọc. Chỉ wrapper around-dispatch mới nhận được view có thể thay đổi; nó có thể thay thế và khôi phục `exec.signal` bắt buộc để áp đặt deadline, nhưng không được xóa bỏ tín hiệu đó.
- **Khai báo và trả về một giá trị JSON theo quy chuẩn.** `output.schema` dùng `ValueSchemaSpec`, gốc có thể là object, array, scalar, hoặc null. `execute` chỉ trả về giá trị suy ra được; registry chụp lại (snapshot) giá trị đó thành JSON không mất mát, hoàn tất kiểm tra và đóng băng, rồi mới chuyển cho `output.render(args, value)`. Thân công cụ không nên trả về content block, cũng không nên bắt bên gọi phải phân tích id và trường từ ngôn ngữ tự nhiên.
- **Ném lỗi hoặc trả về giá trị không hợp lệ đồng nghĩa với `isError`.** Registry sẽ bắt exception, và hội tụ các lỗi schema, renderer, projector metadata, và JSON không mất mát trước khi observer chạy. Với lỗi hạ tầng, hãy ném exception. Kết quả domain thành công, dù thể hiện một trạng thái không lý tưởng, vẫn nên được ghi thành giá trị quy chuẩn; renderer Native của nó có thể diễn giải trạng thái đó, ví dụ tiến trình thoát với mã khác 0.
- **Tuân thủ `exec.signal`.** Khi tín hiệu được kích hoạt, phải hủy công việc đang thực hiện.
- **Dùng `presentationMeta` để chiếu (project) dữ liệu thẻ bền vững (tùy chọn).** `output.presentationMeta(args, value)` suy ra JSON có thể replay từ cùng một giá trị quy chuẩn. Core sẽ bền vững hóa nó trên `tool/result` và chuyển cho `presentResult`, do đó các thẻ cần sự thật tại thời điểm kết quả — ví dụ hunk đã áp dụng của `write`/`edit` — không cần bền vững hóa giá trị quy chuẩn vẫn có thể tái hiện được khi replay. Việc dispatch Code lồng nhau không có thẻ, nên sẽ bỏ qua projector này.
- **Dùng `exec.agent` để gửi thông báo bất đồng bộ.** `agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } })` thêm ngữ cảnh bền vững, request tiếp theo tới mô hình sẽ thấy nó — đây không phải là hành động đánh thức (wake) (agent (tác tử) nhàn rỗi vẫn giữ nguyên trạng thái nhàn rỗi). Hãy phòng ngừa trường hợp agent đã bị dispose (try/catch).

## Công việc chạy dài

Điều khiển `run_in_background` qua cấu hình của producer, sau đó đăng ký tác vụ bằng `ctx.jobs.start({ kind, label, owner: exec.agent, run })`. Registry sẽ đánh dấu thất bại cho lệnh gọi đã bị hủy trước đó (pre-aborted) trước khi vào thân producer; runtime sẽ kiểm tra owner và bộ điều khiển tác vụ có khả dụng hay không trước khi `run()` bắt đầu công việc, sau đó cung cấp id, hàng rào phiên, các công cụ điều khiển thông dụng, thông báo và cleanup owner. Nhánh nền thành công sẽ trả về handle quy chuẩn có kiểu, ví dụ `{ kind: 'background', jobId }`; renderer Native của nó có thể giữ lại ngôn ngữ tự nhiên dễ đọc kiểu `started background job bash-1`, nhưng Code Mode không bao giờ được lấy id bằng cách phân tích văn bản đó.

Producer cung cấp `cancel` đồng bộ, `done` sẽ settle sau khi dọn dẹp tài nguyên và không bao giờ reject, cùng `readOutput` tiêu thụ tùy chọn (chịu trách nhiệm định dạng đầu ra có giới hạn). Lệnh gọi bị hủy trước đó là thất bại, vì lúc đó không có tác vụ nào, id của nó không thể thỏa mãn schema đầu ra thành công. Sau khi `ctx.jobs.start()` phát hành id, nên dùng tín hiệu hủy của riêng tác vụ, thay vì `exec.signal`: việc hủy lệnh gọi bên ngoài sau đó chỉ dừng việc chờ lần gọi này, không kết thúc công việc đã được phát hành; vòng đời này thuộc về `job_kill`, dispose owner và teardown service. Công việc tiền cảnh (foreground) vẫn gắn kết với `exec.signal`. Ví dụ producer dạng stream và quy ước đầy đủ, xem [Agent Note về runtime tác vụ nền](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) và `dsh-tool-bash`.

<a id="execution-policy-and-observation"></a>

## Chính sách thực thi và quan sát

Hãy cố gắng không xây policy triển khai (deployment policy) cứng vào bên trong công cụ. Dùng `tools/pre-execute` để triển khai policy cho phép/từ chối/hỏi có thể mở rộng (xem [ví dụ cổng quyền](extension-cookbook.md#a-hook-plugin-permission-gate-example)); dùng `ctx.tools.guard()` để thiết lập quyết định từ chối đơn điệu cuối cùng, listener sau đó không thể hủy bỏ nó; dùng `tools/execute` để thêm deadline, retry, hoặc thu thập metric cho việc dispatch; dùng `tools/post-execute` để thay nội dung hiển thị hoặc giá trị trả về, chặn kết quả, hoặc gắn thêm ngữ cảnh hướng tới mô hình; dùng `tools/result` để quan sát kết quả đã chuẩn hóa bất biến mà không thay đổi nó. Việc thay nội dung hiển thị không ngăn việc truy cập lập trình vào `value`; policy bảo mật sẽ che hoặc thay giá trị đó. Việc triển khai sandbox cũng có thể chạy trong chính triển khai bộ thực thi của công cụ; [README của `dsh-tools`](../../packages/core/tools/README.md#extension-points) định nghĩa đầu vào, thứ tự, giá trị trả về và hành vi thất bại của mỗi điểm mở rộng.

## Code Mode tự động chạm tới công cụ của bạn

Trong [Code Mode](../../packages/core/tools/README.md), mỗi công cụ đã đăng ký, hiển thị đều có thể gọi qua `await tools.<name>(args)` mà không cần tích hợp thêm. `ToolArgsMap` và `ToolOutputMap` được sinh ra sẽ suy ra kiểu tham số chính xác và kiểu trả về quy chuẩn tương ứng dựa trên cùng một bộ schema, còn lệnh gọi sẽ vào lại pipeline thực thi thông thường. Lệnh gọi thành công sẽ phân giải thành giá trị JSON quy chuẩn cuối cùng sau khi qua policy, chứ không phải nội dung Native đã render. Lệnh gọi thất bại sẽ reject bằng một `ToolCallError` thực sự; chương trình chỉ có thể kiểm tra `name`, `toolName` và `message` dễ đọc cho con người của nó, không lấy được mã lỗi nội bộ hay union thất bại.

Hãy thiết kế `output.schema` như một API lập trình thực dụng: trả về trực tiếp handle và trường; khi scalar, array, hoặc null đúng thực sự là kết quả, hãy cho phép dùng kiểu gốc tương ứng; đặt lời giải thích hướng tới con người vào `output.render`. Giá trị trung gian chỉ tồn tại trong quá trình thực thi, không bị bền vững hóa hay cắt theo giới hạn prompt, cũng không có giới hạn byte, do đó ranh giới thu thập trung thực do bên sản xuất khai báo và bộ nhớ trong tiến trình vẫn quan trọng. Chỉ log/kết quả `run_code` bên ngoài mới bị ràng buộc bởi giới hạn đầu ra có thể cấu hình và pipeline spill hướng tới mô hình.

## Cách công cụ được render trong UI

`output.render` của công cụ trả về nội dung hướng tới mô hình; **thẻ UI** của nó là một mối quan tâm độc lập khác, được khai báo qua projection hiển thị thuần túy cùng các phương thức `presentCall`/`presentResult` tùy chọn. Hãy thiết kế các nội dung này song song với giá trị quy chuẩn. Công cụ không có phương thức hiển thị UI sẽ rơi về (fall back) thẻ thông dụng (title = tên công cụ, args thô làm input).

Cả hai phương thức đều trả về một **ý định render gắn nhãn `card`** — hãy chọn loại thẻ khớp với hành vi công cụ của bạn:

- `presentCall(args)` → một `ToolCallView` (thẻ PENDING):
  - `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` — mặc định. Đặt `kind` để lấy icon (`read`/`search`/…); đặt `locations: [{ path, line? }]` để đánh dấu các tệp mà công cụ liên quan tới, giúp editor có khả năng theo dõi/nhảy tới.
  - `{ card: 'terminal', title, description?, cwd? }` — lệnh gọi của bạn chính là một shell command. `title` là lệnh, `description` render phía trên thẻ terminal. (tool-bash.)
  - `{ card: 'diff', title, diffs, locations? }` — lệnh gọi của bạn tạo hoặc sửa tệp. `diffs: [{ path, oldText, newText }]` (`oldText: null` khi là tệp mới) render thành thẻ diff nội tuyến. (tool-fs `write`/`edit`.)
- `presentResult(args, { content, isError, meta? })` trả về thẻ đã hoàn tất:
  - `generic` cung cấp title và content tùy chọn.
  - `terminal` cung cấp output thô và metadata thoát tùy chọn; mỗi UI render view tương ứng theo khả năng của mình hoặc view fallback.
  - `diff` cung cấp hunk đã áp dụng, thường được suy ra từ `output.presentationMeta` và mang theo qua `result.meta` bền vững, giúp replay có thể tái hiện chúng. Công cụ thay đổi giữ lại kết quả diff, vì view sau khi hoàn tất sẽ thay thế thẻ pending.
  - `search` cung cấp kết quả kiểu khám phá (discovery) được dựng lại từ `result.meta` bền vững: match được nhóm theo tệp (`shape: 'matches'`, grep) hoặc danh sách đường dẫn phẳng (`shape: 'paths'`, glob), cộng thêm `truncated`/`total` để UI không bao giờ coi kết quả bị cắt bớt là kết quả đầy đủ. View này không mang theo văn bản kết quả (UI không có khả năng search sẽ fallback về nội dung kết quả thô), và cũng không có view lệnh gọi `search` — trạng thái pending của lệnh gọi kiểu khám phá vẫn giữ ở thẻ generic, vì match chỉ tồn tại sau `execute`. (`grep`/`glob` của tool-fs-search.)
  - `web` cung cấp kết quả truy xuất web đã hoàn tất, phân biệt bằng `kind: 'search' | 'fetch'` (nguồn search có cấu trúc hoặc tóm tắt fetch), suy ra từ `result.meta`; nó không mang theo bản sao nội dung chính văn, do đó UI không có khả năng `web` sẽ fallback về nội dung kết quả thô. (`web_search`/`web_fetch` của tool-web.)

Quy tắc cứng (vi phạm sẽ gây lỗi):

- **Hàm thuần túy.** Các phương thức này chạy cả khi stream trực tiếp lẫn khi replay log phiên, do đó phải là hàm thuần túy của `args` (cộng result) — không I/O, không đọc trạng thái phiên, không dùng đồng hồ/số ngẫu nhiên. diff được suy ra từ args (`write` dùng `oldText: null`, vì bộ hiển thị tại thời điểm gọi không có nội dung tệp trước đó); ngữ cảnh phiên do adapter UI cung cấp, không phải do công cụ. Nếu bạn thấy mình muốn lấy nội dung cũ của tệp hoặc working directory bên trong `presentCall`, hãy dừng lại: đó thuộc về metadata kết quả bền vững hoặc adapter, không thuộc về bộ hiển thị.
- **Định dạng UI không đi vào kết quả mô hình.** Khối hàng rào ` ```console `, diff, đường dẫn tương đối hóa đều không được đi vào giá trị quy chuẩn hay nội dung Native chỉ vì phục vụ UI. `output.render` chịu trách nhiệm về ngôn ngữ tự nhiên hướng tới mô hình; `presentationMeta` và bộ hiển thị thẻ chịu trách nhiệm về trạng thái UI có thể replay. View kết quả `terminal` mang theo output thô, adapter thêm định dạng fallback khi cần.
- **`defineTool` kiểm tra mềm đường hiển thị.** Tham số bị định dạng sai hoặc trong log phiên bản cũ sẽ khiến wrapper trả về `undefined` (fallback thông dụng) thay vì ném exception — việc hiển thị không bao giờ được gây sập khi replay.

Từ vựng trung lập được định nghĩa trong `dsh-tools`; công cụ không bao giờ import kiểu UI hay truyền tải. Runtime host/client ánh xạ mỗi `card` tới view riêng của nó. Thiết kế và lý do xem [Agent Note về union ý định render](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md); `dsh-tool-fs` (generic/diff) và `dsh-tool-bash` (terminal) là triển khai tham khảo.

## Xác minh

Hãy tuân theo [chính sách kiểm thử của repo](../testing.md) và tài liệu kiểm thử của package tương ứng. Thay đổi đã bàn giao và hướng tới mô hình hoặc UI phải cung cấp độ phủ lắp ráp (assembly coverage) theo đúng quy định ở đó.
