# @deepseek-ai/dsh-llm-replay

[English](README.md) | 中文

Plugin replay LLM (mô hình ngôn ngữ lớn) dùng cho kiểm thử snapshot không cần key. Nó tái tạo lại stream model dựa trên fixture (dữ liệu tiền đề kiểm thử) **session JSONL** đã ghi lại, cho phép test khởi động agent (agent thông minh) thật nhắm vào transcript (bản ghi văn bản) model cố định mà không cần API key. Khi cấu hình `providers`, nó sẽ đăng ký adapter chỉ dùng cho replay, với model catalog khả dụng cho các scenario cần tính năng phát hiện model của test; khi không cấu hình `providers`, nó sẽ cài đặt waterfall (sự kiện dạng thác nước) `llm/stream` catch-all dùng cho test không cần tính năng phát hiện model.

Bên tiêu thụ của nó gồm bộ snapshot ACP (Agent Client Protocol) và headless `stream-json`, cũng như pipeline e2e trình duyệt Web. Bộ test do Loader điều khiển dùng plugin này để thay thế adapter LLM thật; pipeline Web cài đặt nó trực tiếp, để giữ lại handle kiểm tra tiêu thụ trong giai đoạn dọn dẹp.

## Cách hoạt động của fixture

Fixture chính là log session đã lưu bền vững (`<scenario>/session.jsonl`). Sự kiện `assistant/chunk` của nó chứa từng `StreamChunk`, nên chỉ cần nhóm theo `(turn, step)` là có thể tái tạo lại chuỗi phân mảnh của mỗi lời gọi `stream()` trong agent loop (vòng lặp agent). Khi bộ tóm tắt nén (compaction) thành công, cách ghi log có khác biệt: khi `compaction/summary` mang `llmStreamCall: true` và `rawOutput` đầy đủ, replay sẽ tái tạo một stream thành công chuẩn tại vị trí sự kiện đó, mỗi khối dùng một cặp `block-start`/`block-end`, kèm usage đã ghi (nếu có), và kết thúc bằng `stop`. Cách chia nhỏ chính xác của phần gia tăng từ provider không thuộc về kết quả nén bền vững. `rawOutput` không mang cờ đó không có nghĩa là đã xảy ra lời gọi LLM cục bộ, vì bộ tóm tắt template và bộ tóm tắt từ xa có thể giữ lại đầu ra đầy đủ ngay cả khi không dùng adapter của context này.

Do đó, việc ghi lại chính là "chạy một agent thật một lần và thu thập `.jsonl`", do harness snapshot thực hiện; bản thân plugin này không ghi lại. Nội dung `request/header` của fixture có thể được token hóa thành `{{system}}`/`{{tools}}` (harness sẽ pin nội dung đó trong một scenario, và xóa nội dung ở các scenario còn lại); replay không bị ảnh hưởng, vì quá trình dẫn xuất chỉ đọc sự kiện `assistant/chunk` và `compaction/summary` cùng header ở dòng 0 của session.

Có hai chế độ lỗi không thể tái tạo lại chỉ từ `assistant/chunk`: ném exception trực tiếp trước khi tạo ra bất kỳ phân mảnh nào (ví dụ HTTP 401, lúc đó log chỉ có `turn/end {error}` mà không có phân mảnh), và hủy hoặc treo (khác biệt nằm ở thời gian, không phải nội dung phân mảnh). Scenario cần các hành vi này có thể cung cấp file đồng hành (`<scenario>/replay.override.json`): nó có thể thay thế kịch bản dẫn xuất (`ReplayEntry[]` trần), cũng có thể bổ sung kịch bản dẫn xuất (`{ patches: [{ at, entry }] }`: giữ lại mọi lời gọi dẫn xuất từ JSONL, chỉ thay thế chỉ số lời gọi được chỉ định đếm từ 0; khi `at` bằng độ dài dẫn xuất, thì sẽ thêm một lời gọi tại vị trí retry sau khi tiêm exception thoáng qua). Chỉ số patch không được trùng lặp. File sẽ được xác thực khi nạp: tài liệu override, từng patch và entry, cùng nhãn phân biệt của từng phân mảnh. Entry `hang` có thể chỉ định `readyFile`; sau khi các phân mảnh tiền tố đến vòng lặp và trước khi bắt đầu chờ hủy, replay sẽ ghi dấu rỗng này, để trình điều khiển bên ngoài có thể hủy một cách xác định mà không cần quan sát cập nhật tầng hiển thị.

Chuỗi kịch bản có thể nhúng `{{fromRequest:<regex>}}`, dùng để điền vào các giá trị mà file đồng hành tĩnh không thể dự đoán trước — ví dụ id goal ngẫu nhiên mà model phải điền nguyên trạng vào `update_goal`. Khi replay, mỗi placeholder được phân giải theo request thời gian thực: ngữ liệu là kết quả nối tất cả lá chuỗi của message request bằng dấu xuống dòng, lấy lần khớp cuối cùng của pattern đó trong ngữ liệu, dùng nhóm bắt (capture group) đầu tiên của nó (không có nhóm bắt thì dùng toàn bộ phần khớp) để thay thế tại chỗ. Không khớp được nội dung, pattern không hợp lệ, placeholder chưa đóng đều báo lỗi rõ ràng. Trong chuỗi dấu ngoặc nhọn đóng liên tiếp, chỉ hai dấu ngoặc cuối mới là ký tự kết thúc placeholder, nên pattern có thể kết thúc bằng bộ định lượng ngoặc nhọn (như `[0-9a-f]{4}`), nhưng không được có nội dung pattern tiếp theo sau `}}`. Việc phân giải áp dụng cho mọi mục kịch bản, kể cả mục dẫn xuất từ JSONL đã ghi — nếu văn bản ghi lại có chứa hợp lệ dấu chữ đó, cần dùng file đồng hành không chứa dấu để biểu diễn thay thế.

## Agent lồng nhau: đánh khóa theo từng session

Scenario mà agent cha ủy quyền cho subagent trong tiến trình sẽ ghi nhiều log: session cha dùng `session.jsonl`, mỗi session con dùng một log riêng (`session.1.jsonl`, v.v.). Mỗi agent chạy như một `Session` độc lập trong cùng context, nên replay phải cung cấp kịch bản riêng cho từng agent.

Replay đánh khóa cho mỗi lời gọi theo id session khởi tạo lời gọi (`GenerateOptions.sessionId` do agent loop ghi). Id session thời gian thực được tái sinh ngẫu nhiên mỗi lần chạy, không bao giờ bằng id trong bản ghi, nên session thời gian thực được gắn vào kịch bản đã ghi theo **thứ tự lời gọi đầu tiên**: kịch bản được sắp theo `createdAt` trong header (session cha đứng trước, vì nó phải bắt đầu stream trước khi có thể ủy quyền); session thời gian thực khởi tạo lời gọi đầu tiên nhận kịch bản đầu tiên, session mới tiếp theo nhận kịch bản tiếp theo, cứ thế. Sau đó mỗi session tự tiến con trỏ của riêng mình. Lời gọi không có `sessionId` được coi là một session ẩn danh gắn vào kịch bản chính. Khi số lượng session thời gian thực khác nhau vượt quá số kịch bản đã ghi sẽ báo lỗi rõ ràng.

## Cấu hình

| Khóa | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `file` | string | `$DSH_SNAPSHOT_FILE` | Đường dẫn fixture `session.jsonl` chính (cha). Bắt buộc (qua cấu hình hoặc env). |
| `overrideFile` | string | `$DSH_SNAPSHOT_OVERRIDE` | File đồng hành `ReplayOverrideDoc` tùy chọn cho session chính: `ReplayEntry[]` trần thay thế kịch bản dẫn xuất của nó, `{ patches }` thì bổ sung vào kịch bản đó theo chỉ số lời gọi. |
| `childFiles` | string[] | `$DSH_SNAPSHOT_CHILD_FILES` (phân tách bằng dấu phân tách đường dẫn) | Log session con subagent đã ghi trong scenario lồng nhau; rỗng với scenario một session. |
| `providers` | `ReplayProviderConfig[]` | không có | Provider chỉ replay tùy chọn và model catalog. Mỗi provider có thể đặt `retryPolicy`, mỗi model có thể công bố `contextWindow` và mảng `inputModalities` chỉ chứa `text`, `image`; cấu hình modality không hợp lệ sẽ khiến plugin nạp thất bại. Route đã cấu hình được điều phối qua adapter replay, không bao giờ thực hiện I/O provider. |
| `paceMs` | number | không có (dồn dập) | Độ trễ mỗi phân mảnh tùy chọn (đơn vị mili giây), giúp tầng truyền tải phía dưới (ví dụ bộ đa hợp SSE (Server-Sent Events) của Web mà trình duyệt thật quan sát) thấy được việc truyền tăng dần thực sự. Đây chỉ là tham số điều chỉnh để tăng tính thực tế, test không được phụ thuộc vào nó để đảm bảo tính đúng đắn. Giá trị phải là số nguyên không âm; hủy trong lúc chờ pace sẽ nhanh chóng hủy stream. |

```yaml
- id: llm-replay
  name: '@deepseek-ai/dsh-llm-replay'
  config:
    providers:
      - id: deepseek-official
        name: DeepSeek
        retryPolicy:
          mode: normal
          backoff:
            initialDelayMs: 1
            maxDelayMs: 1
            jitterRatio: 0
        models:
          - id: deepseek-v4-flash
            contextWindow: 128000
          - id: deepseek-v4-pro
  # file/overrideFile/childFiles default to $DSH_SNAPSHOT_FILE /
  # $DSH_SNAPSHOT_OVERRIDE / $DSH_SNAPSHOT_CHILD_FILES, set by the snapshot
  # harness per scenario.
```

## Các mục export

- `installLlmReplay(ctx, config)`: cài đặt adapter replay đã cấu hình hoặc listener `llm/stream` catch-all; trả về `ReplayHandle` (gồm `dispose()` để đảm bảo an toàn HMR (hot module replacement), cùng kiểm tra `assertConsumed()` thực thi trong giai đoạn dọn dẹp; kiểm tra sau đảm bảo mỗi kịch bản đã ghi đều được gắn vào một session thời gian thực, và mỗi con trỏ đã gắn đều đã cạn, nhờ đó chuyển đổi tình huống scenario âm thầm gọi model ít hơn số lượng bản ghi thành một chẩn đoán rõ ràng). Dùng trong test để điều khiển replay mà không cần qua Loader hay biến môi trường.
- `loadSessionScripts(config)`: phân giải `SessionScript[]` có thứ tự trong scenario (session chính + session con), sẵn sàng gắn vào session thời gian thực theo thứ tự lời gọi đầu tiên.
- `loadReplayScript(config)`: chỉ phân giải `ReplayEntry[]` của session chính (nếu file đồng hành tồn tại thì dùng thay thế hoặc patch đã xác thực; nếu không thì dẫn xuất từ JSONL; fixture thiếu sẽ báo lỗi rõ ràng).
- `deriveReplayScript(events)` / `parseSessionLog(text)` / `parseSessionHeader(text)` / `resolveScriptedEntry(entry, messages)`: các hàm hỗ trợ thuần chuyển đổi các phân mảnh loop thông thường và đầu ra nén cục bộ được đánh dấu tường minh trong log session đã ghi thành kịch bản, đọc `id`/`createdAt` header của nó, và phân giải placeholder `{{fromRequest:...}}` cho một request thời gian thực cụ thể. Nhóm assistant dẫn xuất phải kết thúc bằng phân mảnh `finish`; nhóm không có phân mảnh này là dấu vân tay của việc `stream()` ném exception, phải biểu diễn bằng file đồng hành override.
- Các kiểu `ReplayEntry` / `ReplayOverrideDoc` / `ReplayOverridePatch` / `SessionScript` / `ReplayConfig` / `ReplayProviderConfig` / `ReplayModelConfig` / `ReplayHandle` / `Config`.

## Hình thức export của plugin

Export có tên `name` / `inject` / `Config` / `apply`, và **không có export mặc định**: `unwrapExports` của Cordis Loader thực hiện `exports.default ?? exports`, nên export mặc định ngoài ý muốn sẽ làm module bị gấp lại thành bản thân hàm, và bỏ mất namespace `inject` (xem [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Trải nghiệm model

Không có. Adapter kiểm thử không cần key này không gửi request tới model của provider, chỉ replay các phân mảnh assistant đã ghi vào loop kiểm thử.

#### Ảnh hưởng KV Cache

Không có; gói này không lắp ráp cũng không gửi request tới provider.

## Hạn chế đã biết và công việc hoãn lại

- **Việc gắn kịch bản theo thứ tự lời gọi đầu tiên giả định ủy quyền tuần tự**: một bản triển khai chạy song song các subagent cùng cấp sẽ gắn session thời gian thực vào kịch bản đã ghi một cách không xác định; chưa triển khai cơ chế đánh khóa mạnh hơn trước khi scenario như vậy xuất hiện (`XXX(concurrent-subagents)`).
- **Chỉ phân mảnh loop thông thường và đầu ra nén cục bộ có đánh dấu mới có thể dẫn xuất**: scenario ném exception trực tiếp trước khi tạo phân mảnh, hủy/treo, hoặc lời gọi bộ tóm tắt bên ngoài chưa đánh dấu cần file đồng hành `replay.override.json`. Cả hai hình thức thay thế và patch đều chỉ ảnh hưởng tới session chính; kịch bản session con vẫn dẫn xuất từ log riêng của chúng.
