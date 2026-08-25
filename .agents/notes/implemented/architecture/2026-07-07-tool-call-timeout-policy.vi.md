# Agent Note: Chính sách timeout gọi công cụ như một plugin

Status: implemented

[English](2026-07-07-tool-call-timeout-policy.md) | Tiếng Việt

## Vấn đề

[Agent Note về timeout/deadline](2026-07-06-timeout-deadline-library.md) đã trích xuất nguyên thủy đo thời gian và phân loại vào `@deepseek-ai/dsh-timeout`, nhưng chính sách timeout vẫn gắn vào từng capability và schema hướng tới model riêng lẻ. `bash` phơi bày `timeoutMs`; `web_fetch` phơi bày `timeout_ms`; `web_search` không có tham số timeout hướng tới model, dù provider đã tuân theo `exec.signal`; các công cụ grep/glob trong tương lai sẽ phải tự import thư viện timeout hoặc tự sáng chế chính sách timeout của riêng mình. Đây là khuôn mẫu viết sai đối với một SDK plugin: tác giả công cụ thường chỉ cần forward `exec.signal` cho implementation mà nó gọi, còn chính sách triển khai quyết định ngân sách.

Đồng thời, không phải mọi timeout trong repo đều là ngân sách gọi công cụ hướng tới model. Hook thực thi lệnh command hook trực tiếp qua `ctx.shell`, không qua `ctx.tools.execute()`; công cụ model `bash` tái sử dụng thực thi foreground, khởi động background, poll background và tái sử dụng hook qua cùng một backend. Chuyển mọi timeout vào plugin công cụ trong một bước sẽ làm lẫn lộn các đường này và có nguy cơ phá vỡ ngữ nghĩa timeout của hook.

## Quyết định

Timeout gọi công cụ là một chính sách chỉ áp dụng cho việc thực thi công cụ hướng tới model, gồm ba phần:

- `@deepseek-ai/dsh-timeout` vẫn là thư viện dùng chung sở hữu `deadline()` và `timeoutOf()`.
- `@deepseek-ai/dsh-tools` có một waterfall (sự kiện dạng thác nước) bao (wrap) việc phân phát `tools/execute`, nằm giữa `tools/pre-execute` và `tools/post-execute`.
- [Quy ước đặt tên repository](2026-08-11-repository-naming-contract-and-rename-ledger.md) dùng `@deepseek-ai/dsh-tool-call-timeout-policy`, mô tả chính xác thao tác mà chính sách này giới hạn. Plugin đọc `timeoutMs` do mỗi công cụ khai báo từ runtime, và bọc lệnh gọi có khai báo đó bằng cách dẫn xuất một `exec.signal` mới.

Pipeline thực thi như sau:

```text
ctx.tools.execute(exec)
  -> tools/pre-execute
  -> tools/execute
       -> registry dispatch (the base next())
            -> tool.execute(args, exec)
            -> thrown tool errors normalize to ToolExecutionResult
  -> tools/post-execute
```

Hành vi mặc định là thận trọng: công cụ không khai báo `timeoutMs` sẽ không nhận signal deadline `TOOL_TIMEOUT` từ plugin này.

### Điểm mở rộng bao phân phát `tools/execute`

`@deepseek-ai/dsh-tools` khai báo một waterfall `tools/execute` mà `next()` cơ sở của nó là thunk phân phát kèm chuẩn hóa——tức cùng một `try`/`catch` nội bộ, chuyển đổi lỗi công cụ bị ném ra (hoặc lỗi công cụ không xác định) thành `ToolExecutionResult` dạng `isError`. Listener nhận `(exec, next)`: gọi `next()` để ủy quyền cho việc phân phát (trả về kết quả của nó, tùy chọn bọc lại), hoặc trả về kết quả thay thế để ngắt mạch việc phân phát. Toàn bộ pipeline vẫn nằm trong try/catch bên ngoài của `execute`, nên listener ném exception sẽ trở thành kết quả `isError`, chứ không phải lượt thất bại.

Việc catch nằm trong `next` cơ sở (chứ không phải thứ gì đó ngoài waterfall) là điều then chốt: khi provider thấy signal timeout và ném lỗi hủy thượng nguồn của riêng nó, việc phân phát của registry trước tiên chuyển nó thành kết quả lỗi thông thường, sau đó `timeout-policy` mới có thể thay thế kết quả cuối cùng bằng `TOOL_TIMEOUT`.

### Plugin `timeout-policy`

Plugin này là `@deepseek-ai/dsh-tool-call-timeout-policy`, một plugin function/namespace không cấu hình (`name` / `inject` / `apply`), nằm trong nhóm `packages/guard/`. Ngân sách của mỗi công cụ được khai báo trên chính công cụ đó, không phải trên plugin này: `ToolDefinition` mang một `timeoutMs` tùy chọn, do plugin sở hữu công cụ đó đặt từ cấu hình của chính nó. Ví dụ `dsh-tool-web` resolve `fetchTimeoutMs` / `searchTimeoutMs` (mặc định 30000) vào định nghĩa của `web_fetch` / `web_search`:

```yaml
- id: timeout-policy
  name: '@deepseek-ai/dsh-tool-call-timeout-policy'
- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetchTimeoutMs: 30000
    searchTimeoutMs: 30000
```

Đặt timeout trên định nghĩa công cụ thay vì trên ánh xạ tên tự do (free-text) giúp loại bỏ vấn đề gõ sai tên khiến chính sách không có hiệu lực. `defineTool` xác thực ngân sách là số dương hữu hạn. Trong lúc phân phát, executor dẫn xuất signal deadline và gán nó cho `exec.signal`; registry, theo [convention hủy công cụ hợp tác](2026-07-19-cooperative-tool-cancellation.md), hợp nhất signal deadline này với signal gốc của bên gọi trước khi thực thi thân công cụ. Sau đó executor khôi phục signal của bên gọi, và chuyển timeout của chính nó thành `TOOL_TIMEOUT`; công cụ không có ngân sách được truyền qua nguyên vẹn.

Việc thay thế signal dùng cách **sửa `exec.signal` tại chỗ**, thay vì truyền đối tượng mới cho `next()`. `next()` waterfall của Cordis bỏ qua bất kỳ tham số nào được truyền vào, và gọi lại listener downstream với mảng payload dùng chung (`vendor/cordis/src/events.ts`), nên việc sửa đối tượng dùng chung là cách wrapper cung cấp deadline signal cho registry. Registry sẽ hợp nhất lại signal của bên gọi đã ghi lại trước khi vào thân công cụ; plugin khôi phục `exec.signal` về giá trị gốc của bên gọi trong `finally`, để `tools/post-execute` không bao giờ thấy deadline signal của plugin này.

`timeout-policy` sở hữu mã `TOOL_TIMEOUT` cho hai mục đích: mã deadline nội bộ truyền cho `deadline()`/`timeoutOf()` (có phạm vi, để deadline lồng bên ngoài được nhận dạng là hủy thông thường) và mã lỗi kết quả công cụ có cấu trúc. Kết quả thay thế của nó:

```ts ignore-check
function toolTimeoutResult(timeoutMs: number): ToolExecutionResult {
  return {
    content: [{ type: 'text', text: `Error: tool call timed out after ${timeoutMs}ms` }],
    isError: true,
    error: {
      message: `tool call timed out after ${timeoutMs}ms`,
      info: { name: 'ToolTimeoutError', code: 'TOOL_TIMEOUT' },
    },
  }
}
```

Đây là một deadline hợp tác. Nó không giết một công việc bất kỳ bằng cách đua với promise của công cụ; công cụ hoặc capability mà nó gọi phải tuân theo `exec.signal` và đạt tới trạng thái dừng hoàn toàn. Do đó khai báo `timeoutMs` nghĩa là "công cụ này hợp tác với `exec.signal`", README của plugin nêu đây là convention của nó.

Không cần sự kiện session mới để đảm bảo khả năng tái dựng: `TOOL_TIMEOUT` là `tool/result` cuối cùng hướng tới model của lệnh gọi đó, nên log session hiện có đã ghi lại những gì lần request model tiếp theo nhìn thấy và lỗi `{ name, code }` có cấu trúc.

### Thích ứng công cụ hiện có

`web_fetch` và `web_search` đã được di chuyển. `dsh-tool-web` giữ quyền sở hữu schema hướng tới model của nó, các schema này không phơi bày knob timeout: `web_fetch` loại bỏ tham số `timeout_ms` để khớp với hình dạng agent (tác nhân) tham chiếu, `web_search` chỉ giữ query. Thân công cụ không import `@deepseek-ai/dsh-timeout`; chúng forward `exec.signal` cho `ctx.web`.

`dsh-web-fetch-http` giữ một `timeoutMs` cấu hình ở tầng provider, như một trần tài nguyên lớn hơn, phục vụ bên gọi trực tiếp `ctx.web.fetch()` và các triển khai cấu hình sai; nó không sở hữu timeout hướng tới model. Khi signal `TOOL_TIMEOUT` đến provider fetch trước, việc phân loại có phạm vi provider coi nó là `WEB_ABORTED` thượng nguồn, còn wrapper `tools/execute` bên ngoài thay thế kết quả công cụ cuối cùng bằng `TOOL_TIMEOUT`. Một triển khai công cụ web đã phát hành nên cấu hình trần provider cao hơn ngân sách `timeout-policy`, để chính sách gọi công cụ thường thắng trong lệnh gọi của model.

`bash` giữ nguyên đường timeout backend hiện tại. `dsh-tool-bash` tiếp tục phơi bày `timeoutMs` và `run_in_background`; `dsh-bash-local` tiếp tục dùng `@deepseek-ai/dsh-timeout` để xử lý `BASH_TIMEOUT`; cầu nối hook tiếp tục gọi `runHook()` và truyền `timeoutMs` qua `ctx.shell`. Điều này giữ ổn định hành vi foreground/background/hook.

`read`, `write`, `edit`, `todo_write`, `job_list` và `job_kill` không tham gia timeout gọi công cụ. `job_output` tự sở hữu việc chờ có giới hạn, vì timeout chờ là kết quả trạng thái thời gian thực thành công, chứ không phải thất bại công cụ.

Các công cụ grep/glob hướng tới model tương lai có thể triển khai dựa trên `ctx.shell` mà không cần import `@deepseek-ai/dsh-timeout`: nó forward `exec.signal` cho `ctx.shell`, và khai báo `timeoutMs` của riêng nó (từ cấu hình plugin của nó) để executor áp dụng. Nếu timeout backend của bash-local gây vấn đề cho loại công cụ này, bash seam có thể sau này thêm chế độ deadline riêng của bên gọi; đó là một quyết định độc lập.

## Phương án thay thế đã cân nhắc

**Đặt tên plugin là `tool-timeout`.** Tên Agent Note theo nghĩa đen sẽ khớp với glob `packages/*/tool-*` của guard toàn vẹn `gen-tool-catalog`, glob này yêu cầu mỗi mục khớp phải đăng ký một công cụ hướng tới model. Plugin này không đăng ký công cụ nào——nó là một wrapper `tools/execute`——nên tên `tool-*` sẽ khiến `verify-tool-catalog` thất bại, hoặc buộc phải tạo ra một mục khởi động gây hiểu lầm. Package là `@deepseek-ai/dsh-tool-call-timeout-policy`, nằm trong nhóm mới `packages/guard/`; `id` trong cordis.yml vẫn có thể là `timeout-policy`.

**Chỉ giữ xử lý timeout theo từng công cụ.** Đây là hình thái hiện có của `bash` và `web_fetch`, cũng nhất quán với cách Claude Code và Codex xử lý lệnh shell. Nó bất lợi cho các công cụ dạng web, vì mỗi công cụ mới hỗ trợ timeout phải tự chọn cách xác thực, ngữ nghĩa trần, tài liệu, snapshot và phân loại. Plugin tập trung chính sách và phân loại, để schema mỗi công cụ tập trung vào input nghiệp vụ.

**Chuyển ngay toàn bộ chính sách timeout ra khỏi bash-local.** Về lâu dài sẽ sạch hơn——bash-local sẽ trở thành executor subprocess thuần túy, mọi bên gọi tự quản lý deadline. Nhưng không phù hợp làm bước đầu, vì hook gọi trực tiếp `ctx.shell`, và ngữ nghĩa foreground/background của công cụ model bash khác với vòng đời gọi công cụ. Giữ `BASH_TIMEOUT` duy trì ổn định các đường này, đồng thời để timeout gọi công cụ được xác minh trước trên các công cụ đơn giản hơn.

**Dùng ngân sách mặc định toàn cục cho mọi công cụ.** Tiện lợi, nhưng gây bất ngờ cho tác giả công cụ: bất kỳ công cụ nào tình cờ chạy quá ngân sách toàn cục sẽ bắt đầu thất bại sau khi plugin được load. Khai báo ngân sách theo từng công cụ khiến việc áp dụng là hành động có chủ đích.

**Phơi bày tham số ghi đè `timeout_ms` hướng tới model.** `WebFetch`/`WebSearch` của Claude Code và công cụ web của Codex loại timeout khỏi hình dạng lệnh gọi model. Ghi đè từ model sẽ biến timeout thành một phần ngữ nghĩa prompt, và buộc `timeout-policy` phải giới thiệu quy tắc tước bỏ schema/tham số. Timeout web chỉ tồn tại như chính sách triển khai.

**Để `timeout-policy` tự khớp tham số công cụ.** Một engine quy tắc kiểu "tắt timeout khi `bash.run_in_background` là true" sẽ khiến plugin chính sách phải hiểu ngữ nghĩa tham số riêng của từng công cụ. Việc không di chuyển bash sang timeout gọi công cụ tránh được vấn đề này.

**Dùng `tools/pre-execute` cộng `tools/post-execute` thay vì điểm mở rộng bao phân phát mới.** Listener pre có thể khởi động deadline và sửa `exec.signal`; listener post có thể phân loại và thay thế. Vấn đề là vòng đời deadline sẽ trải dài qua hai waterfall độc lập: cần ánh xạ call-id, dọn dẹp trên mỗi đường pre-deny/tool-throw/post-throw/dispose (giải phóng tài nguyên), và quy tắc sắp xếp thứ tự với các listener khác. `tools/pre-execute` cũng là cổng cho phép/từ chối, không phải wrapper thực thi. `tools/execute` cho timeout một phạm vi từ vựng: khởi động, ủy quyền, phân loại, giải phóng.

**Dùng `Promise.race` để ép timeout với công cụ không hợp tác.** Bị bác bỏ với cùng lý do như Agent Note về thư viện timeout: nó trả quyền điều khiển về cho bên gọi trong khi tiến trình, fetch hoặc thao tác provider bên dưới có thể vẫn đang chạy. Plugin chỉ gửi signal; việc chấm dứt vẫn là trách nhiệm của bên triển khai.

## Hậu quả

- `@deepseek-ai/dsh-tools`, sau khi cố ý tách hook công cụ pre/post ở điểm chặn, có được một interface bao phân phát. Convention của nó có phạm vi hẹp——bao việc phân phát của registry, không thay thế cổng pre hay chính sách kết quả post——và `next()` cơ sở là việc phân phát kèm chuẩn hóa, nên wrapper không bao giờ thấy exception công cụ chưa xử lý.
- Nhiều listener `tools/execute` kết hợp theo thứ tự waterfall Cordis thông thường: listener gọi `next()` sẽ bọc listener downstream cộng việc phân phát; listener không gọi `next()` mà trả về trực tiếp sẽ ngắt mạch chúng. Một triển khai kết hợp đồng thời timeout với wrapper retry/sandbox/metric trong tương lai sẽ chọn ngữ nghĩa ("timeout bao trùm toàn bộ retry" so với "timeout bao trùm mỗi lần thử") qua thứ tự đăng ký.
- Việc chọn tham gia qua khai báo mang lại một rủi ro cấu hình sai được chấp nhận có chủ đích: công cụ có thể khai báo `timeoutMs` nhưng không tuân theo `exec.signal`, khi đó công cụ như vậy sẽ không dừng khi timeout. Registry sẽ chờ thân công cụ chưa hoàn toàn dừng đó kết thúc, thay vì đua với nó; đồng thời convention của plugin nêu rõ: khai báo ngân sách nghĩa là hợp tác; công cụ web đã xác minh mẫu này trên các công cụ đã forward signal.
- Trong giai đoạn chuyển tiếp, `bash` và các công cụ web đã di chuyển cố ý dùng đường timeout khác nhau: `TOOL_TIMEOUT` là ngân sách gọi công cụ hướng tới model, còn `BASH_TIMEOUT` vẫn là timeout backend bash mà bash và hook sử dụng.
</content>
