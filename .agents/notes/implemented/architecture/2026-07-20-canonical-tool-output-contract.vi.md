# Agent Note: Quy ước output tool chuẩn

Status: implemented

[English](2026-07-20-canonical-tool-output-contract.md) | Tiếng Việt

## Vấn đề

Trước đây thân tool viết trực tiếp `ContentBlock[]` hướng tới mô hình, và có thể tùy chọn bọc nó cùng `meta` mờ (opaque). Do đó, dù Function Calling (gọi hàm) ở mode Native có projection dễ đọc cho con người, phía gọi theo chương trình lại không có giá trị lĩnh vực ổn định: Code Mode sẽ trải phẳng lại content block thành chuỗi, tool động sẽ định nghĩa lặp lại hình dạng nội dung, chính sách cũng có thể thay thế nội dung hiển thị, nhưng không thể phân biệt việc thay đổi đó là thay thế hiển thị hay thay thế kết quả thao tác. Nhiều seam năng lực đã trả về giá trị của provider phong phú hơn về thông tin, nhưng lại bỏ đi các giá trị đó tại ranh giới tool hướng tới mô hình.

Quy ước session bền vững coi nội dung hiển thị này là nguồn có thẩm quyền khi replay, nhưng nếu lưu bền vững mọi giá trị trung gian phong phú thông tin, sẽ mở rộng log, khiến dữ liệu implementation đi vào luồng compaction (nén) và migrate, còn biến API cục bộ thời gian thực thi thành một phần định dạng session một cách sai lầm. Do đó, hệ thống cần giữ một giá trị đã gõ kiểu (typed) trong thời gian thực thi, và chiếu (project) tường minh nó thành nội dung bền vững hiện có và nội dung hiển thị cho mô hình.

## Quyết định

Mỗi tool phải khai báo output chuẩn, và chỉ được trả về giá trị được mô tả bởi khai báo đó:

```ts ignore-check
output: {
  schema: OutputSchema
  render(args, value): ContentBlock[]
  presentationMeta?(args, value): JsonValue
}
```

`defineTool` suy luận kiểu giá trị trả về của thân tool và hai bộ chiếu (projector) từ `ValueSchemaSpec` thống nhất. Định nghĩa gốc và định nghĩa động thì cung cấp dạng `JsonSchemaNode` đã biên dịch. Khi đăng ký, hệ thống sẽ từ chối định nghĩa thiếu khai báo output hoặc dùng schema gốc không được hỗ trợ, không cung cấp đường tương thích với giá trị trả về dạng nội dung kiểu cũ.

Mỗi lần phân phối thành công, registry sẽ chụp snapshot giá trị trả về thành `JsonValue` không mất dữ liệu, xác thực theo `output.schema` và đóng băng sâu, sau đó gọi renderer thuần túy; với lời gọi trực tiếp lớp ngoài cùng, còn gọi thêm bộ chiếu metadata tùy chọn. Lỗi ở renderer, projector, schema hay xử lý JSON không mất dữ liệu đều được gộp về một kết quả `ToolOutputError` thông thường. Lớp bọc bao quanh `tools/execute` nhận và trả về union thành công/thất bại chuẩn; kết quả thành công do lớp bọc tự tạo ra cũng sẽ được chuẩn hóa lại một lần nữa qua khai báo output của tool đã resolve, chứ không tin tưởng nội dung tự viết độc lập của nó. Mỗi kết quả chuẩn được gắn với call token phân phối bất biến đã tạo ra nó; do đó, nếu lớp bọc trả về kết quả đã cache từ lời gọi hoặc tool khác, hệ thống sẽ chuẩn hóa lại theo khai báo output đang có hiệu lực hiện tại, không bỏ qua bước này.

```ts ignore-check
type ToolExecutionResult =
  | { isError: false; value: JsonValue; content: ContentBlock[]; meta?: JsonValue; additionalContexts?: HookContext[] }
  | { isError: true; error: { message: string; info?: { name: string; code: string } }; content: ContentBlock[]; meta?: JsonValue; additionalContexts?: HookContext[] }
```

`tools/post-execute` cung cấp hai cách chiếu loại trừ lẫn nhau cho kết quả thành công. Thay thế `content` chỉ thay đổi hiển thị Native/mô hình, và giữ nguyên giá trị chuẩn cùng metadata. Thay thế `value` sẽ xác thực lại giá trị thay thế, và tính lại cả hai projection hiển thị. Việc chặn (block) thao tác sẽ xóa giá trị và chuyển thành thất bại. Do đó, việc thay thế nội dung không phải cơ chế bảo mật: chính sách cần chặn truy cập theo chương trình phải chặn lời gọi hoặc thay thế giá trị.

Giá trị chuẩn chỉ tồn tại trong thời gian thực thi. `tool/result` bền vững do agent loop (vòng lặp smart agent) lưu chỉ chứa `content`, `error` và `meta` tùy chọn; `tool/code-dispatch` của Code Mode lưu bền vững `content` đã render và `isError` của lời gọi con. Cả hai event đều không lưu giá trị trung gian chuẩn, do đó replay có thể tái hiện hiển thị, nhưng không thể tái dựng kết quả theo chương trình. Khi tool khai báo `presentationMeta`, hệ thống chỉ tính nó cho lời gọi trực tiếp lớp ngoài cùng; việc phân phối Code lồng nhau không có metadata hay result card. Card `run_code` lớp ngoài thì đọc nội dung post-policy cuối cùng, và không khai báo metadata hiển thị. Projection spill thông dụng cũng như spill riêng của tool đều bỏ qua việc phân phối lồng nhau, vì giá trị chuẩn của chúng không bao giờ đi vào context mô hình.

Tool bên thứ nhất giữ nguyên văn bản Native hiện có, đồng thời trả về DTO lĩnh vực:

| Họ tool | Giá trị chuẩn |
|---|---|
| `read` | `{ path, offset, lines: [{ number, text }], totalLines }` |
| `write` | `{ path, operation: "create" | "update", before: string | null, after }` |
| `edit` | `{ path, before, after }` |
| `glob` | `{ paths: string[] }` |
| `grep` | `{ matches: [{ path, lineNumber, line }] }` |
| `web_search` / `web_fetch` | `WebSearchResult` / `WebFetchResult` đã chuẩn hóa |
| `lsp` | `{ kind: "locations", locations, resolvedWorkspaceUri }` hoặc `{ kind: "hover", hover }` |
| `bash` | `{ kind: "background", jobId }` hoặc `{ kind: "foreground" } & ShellRunResult` |
| `terminal_open` / `terminal_list` / `terminal_send` / `terminal_read` / `terminal_signal` / `terminal_close` | Snapshot session công khai, DTO đọc/gửi có giới hạn, kết quả thao tác signal/close, hoặc handle task nền |
| `job_output` / `job_list` / `job_kill` | Snapshot task công khai không chứa chủ sở hữu hay thông tin quản lý thông báo |
| `subagent` | Handle task nền hoặc `{ kind: "foreground", runId, output: JsonValue[] }` |
| `workflow` / `ralph` | `{ runId, agentsStarted, result: JsonValue }` |
| `skill` | `{ name, provider, resourceBase?, content }` |
| `todo_write` | `{ todos, counts }` |
| `ask_user_question` | `{ answers: [{ id, selected, custom? }] }` |
| `exit_plan_mode` | `{ approved: true }` |
| `cordis_inspect` / `cordis_mount` / `cordis_unmount` | Văn bản kiểm tra hoặc handle plugin tạm thời đã gõ kiểu |
| `structured_output` | `{ recorded: true }` |
| `run_code` | `{ logs: string[], result?: JsonValue }` |

Giới hạn thu thập của provider và executor vẫn thực sự giới hạn giá trị chuẩn. Giới hạn chỉ dùng để định dạng thuộc về `render`; ví dụ, `glob` và `grep` sẽ giữ lại toàn bộ mục đã thu thập trong `value`, còn projection Native của chúng sẽ giữ lại trang đầu do cấu hình chỉ định, và cố gắng hết sức ghi nó vào file spill. Spill thông dụng sẽ đăng ký trước listener `post-execute` của nó, và để listener đó ủy quyền ngược lại trước, do đó bất kể thứ tự load plugin thế nào, projection bất đồng bộ riêng của tool thông thường sẽ hoàn tất trước khi xử lý giới hạn byte thông dụng. Tool thay đổi filesystem phái sinh metadata diff có thể replay từ `args` và giá trị trước/sau chuẩn, không còn để thân tool trả về trạng thái UI.

Lớp cầu nối MCP giữ lại content block protocol qua `McpResult<{...}> = { content: JsonValue[]; structuredContent? }`. Khi `outputSchema` được công bố thuộc tập con gốc được hỗ trợ, hệ thống sẽ cưỡng chế xác thực; schema không được hỗ trợ thì fallback về `JsonValue`, không giả vờ đã hoàn tất xác thực. Render Native vẫn dùng projection MCP sang `ContentBlock` hiện có, `isError` của MCP sẽ trở thành kết quả tool thất bại.

## Phương án thay thế

- **Trả về văn bản đã render cho Code Mode:** không chấp nhận. Phía gọi vẫn cần trích xuất job id, mount id, path và kết quả provider có cấu trúc từ ngôn ngữ tự nhiên.
- **Lưu bền vững giá trị chuẩn trên `tool/result`:** không chấp nhận. Giá trị thực thi lồng nhau không thuộc về lịch sử mô hình, không cần tồn tại sau replay; việc lưu bền vững còn đưa vào định dạng session và cam kết lưu trữ không liên quan tới việc tái dựng Native.
- **Cho phép tool trả về đồng thời value và content:** không chấp nhận. Hai kết quả do tác giả tự duy trì riêng có thể mâu thuẫn nhau, chính sách cũng không thể nói rõ cái nào mới là kết quả có thẩm quyền. Renderer sẽ tạo ra hiển thị theo cách xác định dựa trên giá trị đã xác thực.
- **Coi việc thay thế nội dung là che giấu giá trị:** không chấp nhận. Nội dung hiển thị và truy cập theo chương trình hướng tới các phía tiêu thụ khác nhau; chỉ ẩn cái trước sẽ tạo ra ranh giới bảo mật giả.
- **Yêu cầu output tool phải có root là object:** không chấp nhận. Kết quả dạng scalar, array và null đều là API JSON hợp lý. Chỉ output có cấu trúc do phía gọi định nghĩa của subagent/workflow vẫn chịu quy tắc root object của phía tiêu thụ.

## Ảnh hưởng

Hành vi Native và replay vẫn ưu tiên nội dung trước, và giữ tương thích từng byte; phía gọi trong thời gian thực thi thì không cần parse nội dung vẫn có thể dùng giá trị lĩnh vực đã xác thực. Kết quả thất bại phải chứa message, và có thể tùy chọn đính kèm thông tin tên lớp/code nội bộ; kết quả thành công và thất bại được phân biệt bằng trường phân biệt (discriminant), kết quả thất bại không bao giờ cam kết có giá trị. Tác giả tool phải thiết kế đồng thời giá trị và projection Native của nó; việc thêm khai báo này là cố ý, vì nó tránh việc suy dẫn quy ước theo chương trình một cách ngoài ý muốn từ nội dung ngôn ngữ tự nhiên.

Giá trị trung gian chỉ bị giới hạn bởi năng lực tạo ra chúng và bộ nhớ tiến trình. Log không chứa các giá trị này, do đó replay không thể khôi phục; chính sách post chỉ xử lý nội dung cũng không thể ẩn các giá trị này. Đây đều là thuộc tính rõ ràng của quy ước cục bộ thời gian thực thi, không phải khoảng trống ngoài ý muốn.
