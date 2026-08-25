# Agent Note: Plugin MCP client — kết nối tới MCP server bên ngoài và bắc cầu công cụ của chúng

Status: implemented

[English](2026-07-07-mcp-client-plugin.md) | Tiếng Việt

## Vấn đề

Trước đây harness không thể tiêu thụ các công cụ trong hệ sinh thái MCP (Model Context Protocol). MCP là chuẩn đang nổi lên cho các tool server — GitHub, hệ thống tệp, cơ sở dữ liệu, tìm kiếm mã nguồn cùng hàng trăm server cộng đồng đều phơi bày công cụ qua MCP. Người dùng muốn trỏ harness tới một hoặc nhiều MCP server để công cụ của chúng xuất hiện dưới dạng công cụ model-visible nguyên bản, mà không phải viết mã kết dính cho từng server.

`ToolRuntime` vốn đã chấp nhận định nghĩa công cụ dạng JSON Schema thô (được ghi trong README của `dsh-tools`: «Raw JSON-Schema tool definitions (from MCP servers) are still accepted by `ToolRuntime.register()` directly»), và cookbook mở rộng cũng đã phác ra mô hình dự kiến («MCP | one plugin per server: discover tools → `ctx.tools.register()`»). Hạ tầng đã sẵn sàng, thứ còn thiếu là plugin bắc cầu.

## Quyết định

### Package

Một package duy nhất `@deepseek-ai/dsh-mcp-client`, đặt tại `packages/mcp/mcp-client/`. Không tách ba package theo capability seam — trong tầm nhìn thấy trước sẽ không có triển khai MCP client thứ hai, và quy ước là «không tách phòng ngừa» ([Agent Note về capability seam](../architecture/2026-06-13-capability-seams.md)).

### SDK

Dùng [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) chính thức (`Client`, `StdioClientTransport`, `StreamableHTTPClientTransport`). Harness không tự triển khai JSON-RPC, nhất quán với cách ACP ủy thác cho `@agentclientprotocol/sdk`.

### Phạm vi

Chỉ MCP Client (không có phía server — ACP đã đảm nhận vai trò «phơi bày harness như một agent»). Chỉ bắc cầu **Tools** — Resources và Prompts được hoãn lại (chúng cần cơ chế tiêu thụ chưa tồn tại phía harness, và không gian thiết kế còn rộng).

### Hình thái plugin

Plugin dạng namespace (export có tên `name`/`inject`/`Config`/`apply`, không có `export default`). `inject: ['tools']`. Mỗi MCP server tương ứng một instance plugin trong `cordis.yml` — cùng một package được nạp N lần với cấu hình khác nhau, giống `dsh-tool-subagent`.

### Cấu hình

Union phẳng phân biệt bằng trường `transport`:

```typescript
interface StdioConfig {
  transport: 'stdio'
  serverName: string          // required namespace, ^[A-Za-z0-9_-]{1,32}$
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  toolCallTimeoutMs?: number  // default 60_000
}

interface StreamableHttpConfig {
  transport: 'streamable-http'
  serverName: string          // required namespace, ^[A-Za-z0-9_-]{1,32}$
  url: string
  headers?: Record<string, string>
  toolCallTimeoutMs?: number  // default 60_000
}

type Config = StdioConfig | StreamableHttpConfig
```

`serverName` là định danh cục bộ ổn định, dùng để tạo namespace cho công cụ của server đó trong tên model-visible (xem bên dưới). Nó được thiết kế có chủ ý là do người dùng cấu hình, chứ không lấy `serverInfo.name` từ phía xa: tên phía xa là đầu vào không đáng tin, không duy nhất giữa các môi trường triển khai (instance production và staging của cùng một server báo cùng một tên), và có thể thay đổi khi server nâng cấp — những điều đó không được phép âm thầm đổi tên công cụ model-visible. Nhiều instance đang hoạt động dùng trùng `serverName` là lỗi cấu hình: instance nạp sau sẽ thất bại ngay lúc khởi động kèm thông báo lỗi hành động được, tuyệt đối không âm thầm ghi đè hoặc bỏ qua. `serverName` ngắn (ví dụ `gh`) cũng là cách cấu hình để rút ngắn tên công khai.

Ví dụ sử dụng trong `cordis.yml`:

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN

- id: mcp-web
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: web
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: !!js `Bearer ${process.env.MCP_TOKEN}`
```

Model nhìn thấy `mcp__github__create_issue`, `mcp__github__search_code`, `mcp__web__search`.

### Vòng đời

Nạp từ `cordis.yml` lúc khởi động. HMR (hot module replacement) (`@cordisjs/plugin-hmr`) cung cấp thay thế nóng: sửa mục yml sẽ kích hoạt dispose (giải phóng tài nguyên) instance cũ (ngắt kết nối, hủy đăng ký công cụ) và tạo instance mới (kết nối, khám phá, đăng ký). Hiện chưa có API động lúc chạy. Tên công khai là hàm thuần của `(serverName, rawName)`, nên một lần thay thế HMR giữ nguyên `serverName` sẽ tái tạo đúng các tên model-visible cũ — lịch sử session và quy tắc quyền vẫn còn hiệu lực — còn việc thêm hay gỡ một server không liên quan sẽ không bao giờ đổi tên công cụ đã có.

### Khám phá và đăng ký công cụ

Mỗi công cụ MCP có hai tên:

- `rawName` — giá trị gốc của `Tool.name` trong MCP, chỉ dùng cho giao tiếp giao thức (`tools/call`).
- `publicName` — tên model-visible duy nhất toàn cục được đăng ký trong `ToolRuntime`:

      mcp__<serverName>__<rawName>

Dạng giới hạn theo server này là chuẩn thực tế của các agent client đa server — mọi sản phẩm người dùng cuối được khảo sát đều giới hạn tên công cụ MCP theo server ([Claude Code](https://code.claude.com/docs/en/agent-sdk/mcp#tool-naming-convention) `mcp__github__list_issues`, [Codex](https://openai.com/index/unrolling-the-codex-agent-loop/) `mcp__weather__get-forecast`, [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/#3-tool-naming-and-namespaces), [VS Code](https://github.com/microsoft/vscode/blob/ab9ec62c6a61e429a9abd612ff220c3f4834c9ea/src/vs/workbench/contrib/mcp/common/mcpServer.ts#L217-L260), [Cline](https://github.com/cline/cline/blob/52fdbb1d72f7324a28142a7ba7678d4b53c902f4/sdk/packages/core/src/extensions/mcp/name-transform.ts#L20-L35), [Roo Code](https://github.com/RooCodeInc/Roo-Code/blob/b867ec9145750d0ae1ff7f02d35406e9bf2a0b16/src/utils/mcp-name.ts#L117-L140), [Goose](https://github.com/block/goose/blob/b3a012cbdde854b0fe14f95b1c48543bf6517c0a/crates/goose/src/agents/extension_manager.rs#L1391-L1441), [OpenCode](https://github.com/anomalyco/opencode/blob/d199b1bff90282a4f9cd6251b5fc7b16875a52f6/packages/opencode/src/mcp/catalog.ts#L117-L120)); cách viết `mcp__<server>__<tool>` nhất quán với Claude Code và Codex. Tiền tố `mcp__` tách namespace của các đăng ký MCP khỏi công cụ nguyên bản, và cung cấp mẫu khớp ổn định cho quy tắc quyền/telemetry (`mcp__*`, `mcp__github__*`).

1. Khi kết nối: duyệt kết quả phân trang của `client.listTools()`, suy ra `publicName` cho từng công cụ, rồi đăng ký chúng như `ToolDefinition` thô qua `ctx.tools.register()`. JSON Schema và mô tả của MCP được truyền nguyên trạng (không chuyển đổi qua DSL `defineTool`); chỉ thay `name` model-visible.
2. Lắng nghe `notifications/tools/list_changed` → chạy lại đồng bộ (dispose thế hệ trước, đăng ký thế hệ mới). Đặt tên tất định nghĩa là những công cụ không thay đổi sẽ giữ nguyên tên sau khi đồng bộ lại.
3. Closure thực thi giữ `rawName`; tên công khai không bao giờ được gửi tới server, và cũng không bao giờ bị phân tích ngược để khôi phục tên gốc.
4. Không có `presentCall`/`presentResult` — bên tiêu thụ UI dùng thẻ generic độc lập với provider làm phương án dự phòng.
5. Công cụ là trong suốt trong system prompt — ngoài chính cái tên, không đính kèm chú thích «[via MCP]» nào.

### Chuẩn hóa tên công khai

MCP cho phép tên công cụ dài tối đa 128 ký tự và có thể chứa `.`; quy ước tên hàm của DeepSeek cho phép `[A-Za-z0-9_-]` và tối đa 64 ký tự. Tên công khai được chuẩn hóa theo quy tắc tất định: ký tự không hợp lệ được thay bằng `_`, và khi việc thay thế hoặc cắt bớt làm đổi tên, một hash SHA-256 12 chữ số hex định danh `(serverName, rawName)` sẽ được nối thêm, đảm bảo các định danh MCP khác nhau không bao giờ sụp về cùng một tên công khai:

```typescript
function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(/[^A-Za-z0-9_-]/g, '_')
  if (normalized === joined && normalized.length <= 64) return normalized
  const hash = sha256(`${serverName}\0${rawName}`).slice(0, 12)
  return `${normalized.slice(0, 64 - 13)}_${hash}`
}
```

### Xử lý xung đột tên

MCP chỉ đảm bảo tên công cụ duy nhất [trong phạm vi một server](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#tool-names); xung đột giữa các server là chuyện thường chứ không phải ngoại lệ (một [khảo sát của Microsoft Research](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/#namespacing-issues-and-naming-ambiguity) trên 1.470 server phát hiện 775 tên công cụ xung đột; riêng `search` xuất hiện ở 32 server, còn server GitHub chính thức công bố tên trần `create_issue`). Namespace luôn bật giúp triệt tiêu xung đột về mặt cấu trúc, thay vì đợi xung đột xảy ra rồi mới xử lý:

- Hai server đều công bố `search` → cùng tồn tại dưới dạng `mcp__github__search` và `mcp__web__search`.
- Công cụ nguyên bản của harness tên `search` không bị ảnh hưởng.
- Cấu hình `serverName` trùng lặp khiến instance nạp sau thất bại lúc khởi động (xem mục cấu hình).
- Server liệt kê tên công cụ trùng lặp là danh sách công cụ không hợp lệ: đồng bộ ném lỗi, các đăng ký của thế hệ trước giữ nguyên.
- Xung đột registry trong lúc thay thế chỉ có thể nghĩa là một công cụ bên ngoài đã chiếm namespace `mcp__<serverName>__` của server đó: các đăng ký của thế hệ đang dở dang bị rollback (server đó có 0 công cụ), và lỗi được ghi log nổi bật.

Công cụ không bao giờ bị âm thầm bỏ qua; việc công cụ nào khả dụng không bao giờ phụ thuộc vào thứ tự nạp plugin.

### Bất biến về đặt tên

1. Mỗi công cụ MCP có định danh ổn định `(serverName, rawName)`; mỗi định danh đang hoạt động tương ứng đúng một tên công khai.
2. Tên công khai là tất định, duy nhất toàn cục, và thỏa quy ước 64 ký tự `[A-Za-z0-9_-]` của DeepSeek.
3. `tools/call` của MCP luôn nhận raw name gốc.
4. Kết nối, ngắt kết nối hay đồng bộ lại một server không liên quan không bao giờ đổi tên công cụ đã có.
5. Thứ tự đăng ký không bao giờ quyết định công cụ nào khả dụng.

### Thực thi công cụ

Cung cấp một handler `execute` thống nhất cho mọi công cụ đến từ cùng một MCP server:

1. Phân giải `rawName` (closure thực thi giữ nó), gọi `client.callTool({ name: rawName, arguments }, { signal: exec.signal })` với thời gian chờ đã cấu hình — tên công khai không bao giờ được gửi tới server.
2. Giữ giá trị thành công chính tắc dưới dạng `{ content: JsonValue[], structuredContent? }`; khối JSON MCP đầy đủ vẫn là giá trị cho lời gọi lập trình／Code Mode. `isError: true` sẽ ném lỗi trước khi lưu bất kỳ hình ảnh nào, khiến đường thất bại thuộc quyền sở hữu của registry.
3. Chuẩn bị riêng một phép chiếu Native có thứ tự. Các khối văn bản liên tiếp được nối bằng `'\n'`; resource link giữ tên và URI dưới dạng văn bản; âm thanh, tài nguyên nhúng, khối sai định dạng và kiểu chưa biết trở thành chẩn đoán tường minh. Chỉ cần có hình ảnh, lớp bắc cầu sẽ giải mã nghiêm ngặt trọn lô, phân giải tuyến chính xác mới nhất của agent gọi, yêu cầu kho lưu trữ tệp đính kèm cùng việc model hỗ trợ rõ ràng đầu vào hình ảnh, rồi ủy thác việc lưu trữ có thứ tự và kiểm tra toàn bộ thành viên cho `AttachmentStore.saveImages()`. Bất kỳ sự từ chối nào ở khâu giải mã, năng lực hay lưu trữ đều khiến toàn bộ hình ảnh được kết xuất thành văn bản chẩn đoán, và không trả về tham chiếu bộ phận nào.
4. Giữ `output.render` đồng bộ và thuần khiết. Bộ thực thi đặt tạm phép chiếu phong phú hơn vào một `WeakMap` được tạo theo thế hệ đồng bộ và khóa theo lần thực thi chính xác; chỉ khi kết quả post-execute của registry vẫn giữ giá trị chính tắc gốc cùng nội dung dự phòng thì `finalizeContent` mới cài đặt phép chiếu đó. Việc chính sách chặn, thay giá trị hay thay nội dung vẫn có tính thẩm quyền, và đồng bộ lại cũng không thể khiến thế hệ cũ tiêu thụ trạng thái thực thi mới.
5. Code Mode nhận giá trị chính tắc nguyên vẹn. Lớp bắc cầu điều phối generic của nó sẽ hoãn chuỗi nội dung cuối thành công có chứa hình ảnh qua kết quả `run_code` ở lớp ngoài, nên MCP không cần trường hợp đặc biệt cho parent token riêng.
6. Hủy bỏ: `exec.signal` (hủy từ agent loop) được truyền tới `callTool` của MCP SDK, tới truy vấn model chính xác và tới cổng kiểm soát trước khi lưu trữ.

### Môi trường tiến trình con (transport stdio)

Môi trường tiến trình con được dựng trên nền `scrubbedParentEnv()` dùng chung ở ranh giới dịch vụ subprocess; môi trường nền đó loại bỏ các tên khớp `/KEY|PASSWORD|SECRET|TOKEN/i` cùng các tên `DSH_*`, rồi hợp nhất `config.env` lên trên. Các env được cấu hình tường minh vẫn được giữ lại sau khi làm sạch.

### Mất kết nối / sập

Bộ giám sát kết nối của mỗi instance tự động kết nối lại sau khi mất kết nối, dùng exponential backoff có giới hạn và ngân sách nỗ lực cho một lần sự cố, và chạy lại quy trình khám phá khi thành công; khi hết lượt thử thì hủy đăng ký công cụ của server đó và dừng cho tới khi được nạp lại. [Agent Note về tự động kết nối lại](2026-08-06-mcp-client-auto-reconnect.md) sở hữu quyết định này, bao gồm khối cấu hình `reconnect` và tùy chọn `reconnect.enabled: false` để quay về khôi phục thủ công bằng HMR/khởi động lại.

## Các phương án đã cân nhắc

### Phía MCP Server (phơi bày công cụ của harness cho MCP client bên ngoài)

Hoãn lại. Cầu ACP đã phơi bày harness như một agent server. Thêm một lớp MCP server nữa sẽ lặp lại chức năng đó bằng giao thức khác, trong khi nhu cầu hàng đầu của người dùng là tiêu thụ công cụ bên ngoài, không phải phơi bày công cụ của chính mình.

### Tách ba package theo capability seam (interface / implementation / consumer)

Bác bỏ. Trong tầm nhìn thấy trước sẽ không có triển khai MCP client thay thế — MCP chỉ có một giao thức, một SDK. Quy ước là «không tách phòng ngừa» cho tới khi xuất hiện triển khai thứ hai.

### Tự động kết nối lại theo exponential backoff

Bác bỏ ở v1: nó đưa vào trạng thái khả dụng bộ phận (công cụ đã đăng ký nhưng tạm thời không dùng được), và sập stdio thường cho thấy vấn đề cấu hình mà thử lại không sửa được; HMR từng là đường khôi phục. Phản hồi vận hành đã đảo ngược quyết định hoãn đó — [Agent Note về tự động kết nối lại](2026-08-06-mcp-client-auto-reconnect.md) đã triển khai tự động kết nối lại với ngân sách một lần sự cố có giới hạn và tùy chọn opt-out.

### Bắc cầu Resources và Prompts

Hoãn lại. Resources cần cơ chế phía harness để quyết định khi nào tiêm nội dung (system prompt? theo yêu cầu? do model kích hoạt?). Prompts cần khái niệm «mẫu prompt» mà harness chưa có. Cả hai đều cần thiết kế riêng; Tools là điểm khởi đầu giá trị cao, rủi ro thấp.

### Tên công cụ model-visible thô kèm `toolPrefix` tùy chọn

Bác bỏ. Đây là đề xuất ban đầu, dựa trên tiền đề «phần lớn MCP server đã dùng tiền tố ngữ nghĩa trong tên công cụ (như `github_create_issue`)». Tiền đề đó không đứng vững: server GitHub chính thức công bố `create_issue`, server hệ thống tệp tham chiếu công bố `read_file`, Sentry công bố `search_issues` — và khảo sát của Microsoft nêu trên cho thấy xung đột rất phổ biến ở quy mô hệ sinh thái. Thêm tiền tố khi xảy ra xung đột (hoặc warn-and-skip) còn khiến tập công cụ khả dụng phụ thuộc vào thứ tự nạp plugin, và khi thêm server không liên quan thì công cụ có thể bị âm thầm đổi tên — làm mất hiệu lực lịch sử session và quy tắc quyền ngay giữa cuộc hội thoại. Không sản phẩm agent đa server nào được khảo sát dùng tên trần.

### Chỉ namespace theo server (`github__create_issue`, không có tiền tố `mcp__`)

Bác bỏ ở v1. Nó ngăn được xung đột giữa các server, nhưng không tách được các đăng ký MCP khỏi công cụ nguyên bản của harness, và cũng đánh mất mẫu khớp chính sách toàn cục cho MCP (`mcp__*`). Tiền tố chỉ tốn thêm 5 ký tự; cách viết `mcp__<server>__<tool>` nhất quán với Claude Code và Codex, tối đa hóa mức độ quen thuộc của model. Nếu tương lai ToolRuntime đưa vào namespace nhận biết nguồn, khi đó có thể xem xét lại việc bỏ tiền tố chữ như một thay đổi chính sách đặt tên.

### Suy ra namespace từ `serverInfo.name` do server công bố

Bác bỏ. Tên phía xa không đáng tin, không duy nhất giữa các môi trường triển khai, và có thể đổi khi nâng cấp; định danh công cụ và quy tắc quyền không được âm thầm chạy theo nó. Namespace là cấu hình cục bộ.

### Giữ nhiều TextBlock trong kết quả công cụ

Bác bỏ. `flattenText()` trong bộ serialize của DeepSeek dùng `join('')` (không có dấu phân cách) khi làm phẳng `ContentBlock[]` sang định dạng giao thức (wire format). Nhiều khối text sẽ âm thầm mất ranh giới giữa các khối — đó là khiếm khuyết về tính đúng đắn. Mọi công cụ hiện có đều trả về một TextBlock duy nhất; cầu MCP tuân theo cùng cách làm.

### Thay giá trị kết quả MCP chính tắc bằng `ContentBlock[]` của core

Không áp dụng. Bên gọi lập trình cần khối MCP đầy đủ theo giao thức và `structuredContent`, còn bên tiêu thụ Native cần hình ảnh core bền vững thay vì base64. Một giá trị giao thức chính tắc cộng một phép chiếu độc lập giữ được đồng thời cả hai giao kèo.

### Thêm dịch vụ RichContent dùng chung, hoặc thực hiện I/O trong `output.render`

Không áp dụng. Core đã có sẵn từ vựng nội dung độc lập vai trò, một bộ dịch vụ thứ hai sẽ lặp lại giao kèo log và thứ tự của nó. `output.render` phải thuần khiết, đồng bộ và có thể phát lại, nên I/O tệp đính kèm thuộc về thực thi bất đồng bộ, rồi cài đặt kết quả qua bước bàn giao hoàn tất chính xác.

### Để mỗi công cụ trả về hình ảnh tự xử lý đặc biệt lời gọi cha trong Code Mode

Không áp dụng. Cách đó ghép nối công cụ lá với cơ chế nội bộ của công cụ tổ hợp, và bỏ sót các công cụ phong phú trong tương lai. Lớp bắc cầu Code Mode generic quan sát nội dung post-policy cuối cùng và chuyển tiếp thống nhất các kết quả có chứa hình ảnh.

## Kiểm thử

Phạm vi bao phủ được liệt kê theo tầng; mỗi hành vi được đặt ở tầng rẻ nhất có thể diễn đạt nó.

- **Unit test** (`tests/mcp-client.spec.ts`, `tests/apply.spec.ts`, mock MCP SDK): thuật toán `publicToolName` (tên sạch, chuẩn hóa, cắt bớt kèm hash, tính tất định, tách biệt các định danh khác nhau), kỷ luật giao thức giữa raw và public, cùng tồn tại giữa các server và với công cụ nguyên bản, thất bại khi nạp `serverName` trùng cùng việc giải phóng chỗ đặt trước, từ chối danh sách công cụ không hợp lệ, chuyển/rollback thế hệ đăng ký, giữ nguyên đăng ký thế hệ trước khi đồng bộ lại thất bại, kết quả chính tắc không mất mát, thứ tự trộn của nội dung phong phú, tính nguyên tử của lô sai định dạng, từ chối chính xác về năng lực／lưu trữ, chẩn đoán tường minh cho nội dung không phải hình ảnh, thứ tự ưu tiên của chính sách post-execute, hủy bỏ, và kiểm tra schema cấu hình. Cổng độ phủ 100% theo từng tệp áp dụng cho package này.
- **E2E** (`tests/mcp-client.e2e.ts`, không cần khóa): dùng giao thức MCP thật để kết nối tới server fixture (dữ liệu chuẩn bị cho kiểm thử) trong repo, `@modelcontextprotocol/server-everything` và `@modelcontextprotocol/server-filesystem` (transport stdio), cùng server `StreamableHTTPServerTransport` chạy trong tiến trình (transport Streamable HTTP) — khám phá dưới namespace, chuẩn hóa đầu-cuối cho tên có dấu chấm, vòng lặp thực thi, lưu／đọc hình ảnh bền vững với base64 chỉ giữ trong giá trị chính tắc, từ chối tường minh khi thiếu tuyến hình ảnh, từ chối `serverName` trùng, và dispose.
- **Snapshot**: ví dụ ACP đã lắp ráp chịu trách nhiệm cho transcript hình ảnh inline nhìn thấy được qua transport và transcript chuyển tiếp hình ảnh của Code Mode; E2E của package chịu trách nhiệm cho giao thức MCP thật, bởi snapshot chạy được phải giữ tính không cần khóa và tất định, chứ không spawn các package server bên thứ ba. Thẻ công cụ MCP vẫn dùng thẻ generic làm dự phòng, nên không cần snapshot UI riêng cho package.

## Hệ quả

- Mỗi MCP server chỉ cần một mục cấu hình trong `cordis.yml` là tích hợp xong: `serverName: filesystem` cộng một lệnh stdio (hoặc một URL Streamable HTTP) là đủ để đưa `mcp__filesystem__read_file` vào danh sách công cụ của model, gọi được, và ở tầng giao thức vẫn dùng `read_file` gốc.
- Tên công khai là một phần của lịch sử session và của API quyền/cấu hình; thuật toán đặt tên là quy ước v1 được cố định bằng kiểm thử, thay đổi sau khi phát hành là thay đổi phá vỡ tương thích.
- Tiền tố định danh `mcp__<serverName>__` tiêu tốn token trên mỗi tên. Đã chấp nhận: mô tả và JSON Schema mới là phần chiếm chủ đạo trong token của định nghĩa công cụ, còn tiền tố đổi lại được định danh ổn định, cách ly xung đột và mẫu khớp chính sách toàn cục cho MCP (`mcp__*`, `mcp__github__*`).
- **Tính ổn định của MCP SDK**: `@modelcontextprotocol/sdk` vẫn đang tiến hóa; thay đổi phá vỡ tương thích đòi hỏi cập nhật cầu nối. Phiên bản đã được ghim, và SDK này được áp dụng rộng rãi (Claude Desktop, Cursor, VS Code), nên thay đổi phá vỡ khó xảy ra một cách âm thầm.
- **Chất lượng schema công cụ**: MCP server có thể phơi bày công cụ có mô tả kém (mô tả mơ hồ, JSON Schema không đầy đủ). Harness truyền nguyên trạng — rác vào rác ra; đó là trách nhiệm của tác giả server, không phải của cầu nối.
- **Quản lý tiến trình stdio**: MCP server hành xử bất thường có thể làm kẹt dispose nếu nó bỏ qua tín hiệu. Dispose của Cordis fiber có quá trình dừng hẳn hoàn toàn với giới hạn; lớp transport bị kẹt cuối cùng sẽ hết thời gian chờ ở tầng framework.
- Khôi phục sau sự cố diễn ra tự động trong phạm vi [ngân sách kết nối lại](2026-08-06-mcp-client-auto-reconnect.md); sau khi cạn ngân sách hoặc khi cấu hình `reconnect.enabled: false` thì quay về nạp lại thủ công.
- Payload hình ảnh chỉ có thể vào ngữ cảnh model thông qua kho tệp đính kèm bền vững dùng chung và năng lực định tuyến xuôi chính xác. Payload âm thanh và tài nguyên nhúng vẫn chỉ tồn tại cục bộ trong lần thực thi, kèm chẩn đoán tường minh.
