# Agent Note: Phục hồi có giới hạn cho lỗi request LLM tạm thời

Status: implemented

[English](2026-06-21-bounded-llm-request-recovery.md) | Tiếng Việt

[Chính sách retry request theo từng provider](../feature/2026-07-24-provider-retry-policies.md) bổ sung thêm cấu hình provider chính xác và mode không giới hạn tường minh dựa trên nền tảng này. Note này tiếp tục chịu trách nhiệm về fact lỗi có cấu trúc, ranh giới phục hồi cho step đã đóng, giá trị mặc định tạm thời của normal mode, lần thử hiển thị đơn lẻ và trạng thái retry bền vững. [Lỗi terminal của luồng LLM (Large Language Model)](2026-07-29-terminal-llm-stream-failures.md) thay thế phần cơ chế liên quan đến identity của lỗi ném ra và stream sidecar.

## Vấn đề

Adapter provider có thể ném exception khi phân phối hoặc lặp, hoặc kết thúc bằng `finish { kind: 'error' | 'aborted' }`. Ranh giới adapter cuối cùng sẽ chuẩn hóa giá trị ném ra thành protocol finish terminal đó trước khi `dsh-agent-loop` nhận; lỗi ở middleware và xử lý kết quả vẫn sẽ ném ra. Loop sẽ chuyển lỗi request mô hình terminal cho `agent/request-error`. Lỗi chưa được xử lý là trạng thái cuối; listener xử lý lỗi tự sở hữu trạng thái sửa chữa chính sách của mình, trả về `{ kind: 'retry' }`, và dừng việc ủy quyền waterfall (chuỗi sự kiện dạng thác). [Quyết định retry action](../simplification/2026-07-27-request-error-retry-action.md) quy định quy ước trả về này.

Ranh giới này đã có thể an toàn phát request lại lần nữa. Event `assistant/chunk` gốc mang theo `turn` và `step` bị lỗi; trừ khi có một `assistant/message` thành công tham chiếu tới các event này, việc phái sinh message sẽ bỏ qua chúng. Chỉ khi finish terminal thành công và việc lắp ráp hoàn tất, hệ thống mới phân phối tool call; còn retry sẽ mở một turn được đánh số mới từ log bền vững. Do đó harness không cần đưa vào một vòng đời phản hồi thứ hai hay một protocol output tạm thời nào để tách hai lần thử.

Ranh giới trước đây còn để lại ba khoảng trống hẹp.

- Lỗi provider chỉ giữ lại message, thường kèm một code. HTTP status, retry delay và provider request id bị loại bỏ, hoặc chỉ có thể khôi phục qua đối tượng lỗi riêng của provider, nên cơ chế phục hồi chung nếu không parse văn bản thì không thể ra quyết định hay giải thích quyết định.
- Việc quy trách nhiệm retry khác nhau tùy adapter. Adapter DeepSeek viết tay chỉ thử một lần, còn profile pi-ai có thể bật retry nội bộ không minh bạch của thư viện. Nếu kết hợp retry truyền tải ẩn với listener `agent/request-error`, số lần thử sẽ nhân lên gấp bội, còn lỗi trung gian sẽ không được ghi vào session log.
- Lỗi sau phục hồi không có fact trạng thái bền vững. Step và chunk lỗi vẫn có thể tái dựng, nhưng observer không thể biết agent (smart agent) có đang chủ động backoff hay không, sẽ chờ bao lâu, và lý do chờ. Việc chờ im lặng kéo dài trông không khác gì loop bị treo.

Mục tiêu của chính sách mặc định là phục hồi có giới hạn từ lỗi tạm thời của cùng một request provider/model tường minh. Chuyển đổi dự phòng (failover) giữa các provider hoặc model, ghép nối phản hồi, và sửa chữa output ngữ nghĩa đều là các vấn đề khác, hiện chưa có phía tiêu thụ.

## Quyết định

### Giữ fact lỗi, không nhúng chính sách

`@deepseek-ai/dsh-llm` export duy nhất một payload `LlmFailure` có thể JSON-serialize được:

```ts ignore-check
type ProviderRequestId = Branded<'ProviderRequestId'>

interface LlmFailure {
  message: string
  code: string
  status?: number
  providerRetryAfterMs?: number
  requestId?: ProviderRequestId
}
```

`code` vẫn là hệ phân loại định tuyến máy (machine-routable) độc lập với provider do `HarnessError` thiết lập; các trường mới là fact được quan sát tại ranh giới provider. `ProviderRequestId` do `dsh-llm` sở hữu và construct, sau khi serialize là chuỗi do provider cấp phát. Payload này cố ý không bao gồm các trường `retryable`, `failover`, `partialOutput`, provider, model, stage hay routing id. Việc có retry được hay không thuộc về chính sách, provider/model đã nằm trong header request bền vững, còn partial output được phái sinh từ event `assistant/chunk` của step bị lỗi.

`LlmError` mang `failure: LlmFailure`, và giữ `failure.code === error.code`. `FinishReasonMap.error` và `FinishReasonMap.aborted` mang cùng payload này, chứ không phải các hình dạng lỗi song song. Ranh giới adapter cuối cùng sẽ tách các fact này khỏi giá trị ném ra của adapter, và phát ra finish terminal tương ứng; exception SDK không xác định sẽ nhận payload `UNKNOWN`. Identity chính xác của đối tượng ném ra không vượt qua seam luồng LLM.

Agent loop (vòng lặp smart agent) sẽ chuyển `LlmFailure` của finish terminal cho `agent/request-error`, và dùng cùng payload này khi ghi `turn/end.reason` chưa được phục hồi.

Adapter sẽ trích xuất fact có cấu trúc trước, rồi mới fallback về kiểm tra message. Chúng xác thực HTTP status, parse số giây hoặc ngày trong `Retry-After` thành độ trễ mili giây dương hữu hạn, gắn brand cho request id khi provider công khai nó, và phân biệt timeout của chính mình với việc bị phía gọi hủy (abort). Code và message riêng của provider có thể tinh chỉnh mapping, nhưng listener phục hồi sẽ không parse chúng.

Tập code tạm thời dùng chung cố ý giữ nhỏ: mapping `RATE_LIMIT` và `SERVER` của adapter, code `TIMEOUT` và `TRANSPORT` tường minh dùng cho lỗi remote, cùng code `EMPTY_RESPONSE` dùng khi phản hồi provider đã hoàn tất nhưng không có content block nào. Cả hai adapter đều phân loại trường hợp cuối này thành finish lỗi; xem chi tiết tại [Phản hồi mô hình rỗng có thể retry](../bug-fix/2026-07-24-empty-model-response-is-retryable.md). Lỗi xác thực (auth), quota, request không hợp lệ, tràn context, protocol, abort và lỗi không xác định đều giữ code ổn định riêng biệt, và mặc định không thuộc lỗi tạm thời. Code mới cần có fixture (dữ liệu tiền đặt cho test) của adapter và quyết định chính sách đã được ghi lại; không cần mở rộng thêm một enum class lỗi thứ hai.

### Đặt chính sách retry lên extension point step lỗi hiện có

`@deepseek-ai/dsh-llm-retry` là plugin dạng hàm lắng nghe `agent/request-error`. Nó không đưa vào dịch vụ hay nhánh loop mới; package agent-loop chỉ thay đổi dữ liệu được mang qua control flow phục hồi step lỗi hiện có.

Waterfall `agent/request-error` mang theo `LlmFailure` hiện tại, danh sách bất biến các lỗi trước đó cho phép turn retry trong chuỗi phục hồi liên tiếp, và chính sách retry bất biến do registration của dịch vụ cung cấp mang theo. Loop chỉ truyền qua chứ không diễn giải chính sách này; nó sở hữu lịch sử lỗi liên tiếp, và xóa lịch sử này khi request mô hình thành công. Chính sách normal của `dsh-llm-retry` đếm bản ghi retry bền vững do đúng chính sách provider đó sắp xếp, còn `dsh-compaction-basic` duy trì ngân sách tràn context riêng của nó. Do đó, khi lỗi tạm thời và tràn context xen kẽ nhau, mỗi loại sẽ tiêu thụ ngân sách hữu hạn riêng một cách độc lập; số request tối đa bằng 1 cộng với tổng tất cả ngân sách hữu hạn đã tải.

Hình dạng cấu hình hiện tại do [quyết định chính sách provider](../feature/2026-07-24-provider-retry-policies.md) quy định. Adapter provider sẽ đăng ký `retryPolicy` lồng nhau; khi bỏ qua sẽ dùng mặc định normal: hai lần retry tạm thời, độ trễ khởi đầu 500 mili giây, trần độ trễ 10 giây, jitter 10%, và năm code tạm thời nêu trên. Số lần đếm và ranh giới độ trễ tham khảo phía thận trọng hơn trong các implementation đã khảo sát: [OpenCode dùng hai lần retry request, ranh giới độ trễ 500 mili giây/10 giây](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/%70ackages/llm/src/route/executor.ts#L36-L39); [Pi tách ba lần retry cấp agent khỏi retry của provider, và retry của provider mặc định bằng không](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/%70ackages/coding-agent/docs/settings.md#L139-L147); [Codex dùng ngân sách request/stream hữu hạn cùng timeout idle năm phút](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/model-provider-info/src/lib.rs#L25-L33). Jitter 10% tham khảo [jitter có giới hạn của Codex](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/codex-client/src/retry.rs#L40-L47).

Với các lỗi hợp lệ mà ngân sách chưa cạn, số lần retry tạm thời bắt đầu từ 1 dùng backoff mũ có giới hạn. `providerRetryAfterMs` hợp lệ chỉ thay thế backoff mũ khi nó không vượt quá `maxDelayMs`; khi độ trễ provider dài hơn, hệ thống sẽ ủy quyền cho listener tiếp theo, thay vì retry sớm hơn và vi phạm chỉ thị của provider. Backoff cục bộ nhân với một hệ số ngẫu nhiên được bơm vào trong khoảng `[1 - jitterRatio, 1 + jitterRatio]`, rồi giới hạn giá trị cuối cùng về `maxDelayMs`; độ trễ của provider không thêm jitter.

Plugin sở hữu một `AbortController` bao trùm toàn bộ vòng đời của nó, và theo dõi từng callback phục hồi đang hoạt động, bao gồm cả công việc waterfall được ủy quyền và backoff. Dispose (giải phóng tài nguyên) của effect sẽ hủy đăng ký listener trước, rồi mới abort và chờ các callback đang hoạt động; abort sẽ thắng các quyết định retry được ủy quyền đến muộn hơn, các callback đã bị bắt (captured) sau khi plugin dispose sẽ không thể retry, cũng không thể tiếp tục phần còn lại của waterfall của chúng. Dù Cordis đã bắt (catch) listener này, thiết kế vẫn cho phép dispose HMR (Hot Module Replacement) đạt trạng thái dừng hoàn toàn.

Trước khi ngủ (sleep), `dsh-llm-retry` sẽ append một event session `llm/retry` không xuất hiện ở bề mặt, chứa turn, step lỗi, provider, mode chính sách, key chính sách đã resolve đầy đủ, số thứ tự retry theo chính sách provider, trần hữu hạn đặc thù theo mode (nếu có), độ trễ đã lên kế hoạch, và `LlmFailure`. Key này sắp xếp tập code, và tách lịch sử retry khi routing provider bị thay thế bởi một chính sách có hành vi khác nhưng cùng mode. Plugin này sở hữu khai báo merge của `SessionEventMap`, và export payload qua subpath `./types` an toàn cho trình duyệt; `dsh-session` tiếp tục chịu trách nhiệm lưu trữ bền vững chung, không hấp thụ từ vựng của chính sách tùy chọn. Event ghi lại điều đã được lên kế hoạch, chứ không phải request tiếp theo đã hoàn tất; việc hủy trong thời gian trễ sau đó sẽ hiển thị trong `turn/end`. Vì mục đích của event này là biểu thị trạng thái đang chạy, chứ không phải thu thập dữ liệu trace, nên nó được giao cùng với renderer production và cả overlay replay/snapshot.

Với code không tạm thời, ngân sách chính sách đã cạn, hoặc độ trễ provider vượt trần, listener sẽ gọi `next()`. Điều này giữ được khả năng tổ hợp với phục hồi tràn context và các plugin chính sách tiếp theo. Với lỗi tự nó xử lý, nó sẽ ghi log và chờ độ trễ, rồi trả về `{ kind: 'retry' }` mà không ủy quyền. Việc hủy turn và dispose plugin sẽ kết thúc việc chờ mà không trả về retry action, sau đó vẫn tuân theo việc kiểm tra hủy/dispose của loop.

Gói demo agent-spine tải plugin này, do đó bộ tổ hợp stdio/TUI dùng chung, CLI (Command-Line Interface) một lần, ACP (Agent Client Protocol), và ví dụ headless đều dùng cùng một bộ chính sách theo route của provider. Tổ hợp Web được giao cùng sản phẩm cũng tải plugin này, do đó request từ trình duyệt và request từ dòng lệnh dùng cùng giá trị mặc định của provider. Phía tiêu thụ dạng thư viện vẫn cần tổ hợp plugin tường minh: khi bỏ qua plugin này, lỗi request vẫn giữ trạng thái cuối.

### Một lớp duy nhất chịu trách nhiệm cho lần thử hiển thị

Mỗi adapter chỉ thực hiện một lần request provider mỗi lần gọi `stream()`. Adapter pi-ai loại bỏ trường profile công khai `maxRetries` và `maxRetryDelayMs`, và tắt retry nội bộ của thư viện; adapter viết tay giữ nguyên hành vi thử một lần hiện có. Điều này vừa tránh việc ngân sách SDK nhân lên gấp bội so với ngân sách agent, vừa bảo đảm mỗi lần retry tạm thời được biểu diễn bằng một step lỗi đã đóng cộng với `llm/retry`.

`ctx.llm.stream()` vẫn là waterfall thử một lần gốc. Các phía gọi trực tiếp như tóm tắt compaction (nén) sẽ nhận lỗi có cấu trúc, nhưng không tự động được retry, vì chúng không có ranh giới step agent, cũng không có vị trí bền vững chung để tách các lần thử. Các phía gọi trực tiếp trong tương lai có thể cần một hàm hỗ trợ có buffer, chỉ retry khi chưa phát ra chunk nào; quyết định này không thêm hàm hỗ trợ như vậy.

### Áp đặt ranh giới tại nơi có thể chấm dứt luồng bị treo

Mỗi adapter công khai một trường cấu hình `streamIdleTimeoutMs` đã được xác thực, mặc định dùng tiền lệ năm phút đã nêu ở trên. Khoảng thời gian này không vượt quá độ trễ timer tối đa của Node, nên sẽ không bị kẹp về 1 mili giây. Nó bao phủ mỗi `next()` iterator chưa hoàn tất: từ khi phía tiêu thụ yêu cầu item tiếp theo, đến khi adapter nhận diện được hoạt động của provider; thời gian phía tiêu thụ dùng để "suy nghĩ" giữa hai lần gọi `next()` không tính vào thời gian idle của provider. Comment SSE (Server-Sent Events) của DeepSeek được tính là hoạt động truyền tải, nhưng không bao giờ trở thành giá trị `StreamChunk` hay event session log.

`@deepseek-ai/dsh-timeout` công khai một nguyên thủy (primitive) watchdog idle có thể tái bố trí (re-arm). Một `AbortController` cục bộ ổn định sẽ được hợp nhất với signal của phía gọi, và được truyền cho lớp truyền tải trong suốt lần gọi adapter; mỗi `next()` chưa hoàn tất sẽ bố trí watchdog, khi lần gọi đó hoàn tất thì gỡ bố trí, và bố trí lại khi yêu cầu dữ liệu lần tiếp theo. Hoạt động truyền tải ngoài băng (out-of-band) sẽ gọi `pulse()`, để tái bố trí watchdog cho nhu cầu chưa hoàn tất mà không tạo ra giá trị. Timeout sẽ dùng `TimeoutReason` do năng lực (capability) tự sở hữu để abort controller ổn định này, còn `finally` sẽ dọn timer. Adapter phân loại watchdog của chính nó là `TIMEOUT`, và phân loại việc bị abort từ upstream xảy ra sớm hơn là `ABORTED`. `deadline()` một lần hiện có không được mô tả như một timer trượt.

Test ranh giới chứng minh cả hai lớp truyền tải thực tế đều có thể chấm dứt. Adapter viết tay sẽ abort fetch/reader của nó, adapter pi-ai sẽ map signal ổn định vào SDK, và chứng minh SDK sẽ đóng response. Nếu timer chỉ reject promise của phía tiêu thụ mà request vẫn tiếp tục chạy, thì không thỏa mãn quy ước này.

### Tách các lần thử trong log hiện có

Một lần thử lỗi có thể để lại event `assistant/chunk` trong step đã đóng, nhưng sẽ không bao giờ append `assistant/message`, cũng không phân phối tool. Retry sẽ đóng turn lỗi, mở turn được đánh số tiếp theo, tái dựng request từ lớp bề mặt bền vững, và tạo chunk của riêng nó. Trong khi step vẫn đang mở, UI có thể render chunk thời gian thực; khi `llm/retry` xác định step lỗi, hoặc `turn/end` ghi nhận lỗi, UI sau đó mới đánh dấu hoặc xóa view tạm thời này. Web sẽ xác thực toàn bộ quy ước payload retry, xóa partial output lỗi khi `llm/retry` đến, chiếu (project) event của các turn retry liên tiếp thành một dòng ổn định, và cập nhật dòng đó bằng lần thử mới nhất, rồi phái sinh trạng thái scheduled, started hoặc cancelled từ fact của turn tiếp theo. Đồng hồ đếm ngược lấy thời điểm trình duyệt nhận được event làm điểm bắt đầu của độ trễ đã lên kế hoạch, thay vì dùng đồng hồ event Host; nó hiển thị số giây làm tròn lên và không dưới 1 giây, chỉ hiển thị animation khi retry chưa kết thúc, và gấp gọn chi tiết chính xác của lần lỗi gần nhất vào sau dòng đó. Ngay cả khi lần thử lỗi không có node assistant nào, node retry vẫn neo vào turn quỹ đạo (trajectory) của chính nó. Việc phái sinh message vẫn bỏ qua chunk lỗi; Web cũng áp dụng cùng projection này khi tái dựng lịch sử, do đó việc refresh trang không làm partial output đã bị loại bỏ xuất hiện lại, cũng không tạo ra dòng retry trùng lặp.

Nếu ngân sách phục hồi cạn kiệt, lỗi cuối cùng sẽ được lưu một lần trong `turn/end.reason` cùng với fact có cấu trúc. Web sẽ phái sinh một node `turn-error` tại vị trí thứ tự đó, và render inline message phù hợp để hiển thị cùng error code tùy chọn; projection AUTH sẽ thay văn bản của provider có thể vô tình hiển thị một phần credential bằng `API key is invalid`, còn chẩn đoán gốc vẫn được giữ trong session log. Event thời gian thực và replay lịch sử dùng cùng một logic gấp gọn. Nếu việc phục hồi tạm thời vẫn tiếp tục, `llm/retry` chính là nơi lưu trữ bền vững cho lỗi và độ trễ của lần thử đó, nên turn lỗi đó sẽ không nhận thêm dòng lỗi trạng thái cuối nào nữa. Quyết định này không thêm event lỗi cuối cùng độc lập hay từ vựng response id nào.

## Ngoài phạm vi

- Chuyển đổi dự phòng (failover) tự động giữa provider hoặc model. Request đã chọn tường minh một provider và model, sổ đăng ký (registry) provider cũng cố ý quy định mỗi provider chỉ do một adapter chịu trách nhiệm.
- Retry hoặc tiếp tục sau khi finish terminal thành công, hoặc ghép chunk của hai lần thử thành một message assistant.
- Sửa tool argument sai định dạng, từ chối trả lời, content filter, hay các output ngữ nghĩa mô hình khác.
- Circuit breaker, trạng thái sức khỏe provider dùng chung, hoặc ngân sách retry xuyên agent.
- Cải tạo `llm/stream` thành vòng đời phản hồi hay thêm API sinh tiện lợi khi chưa có phía tiêu thụ production.

## Các phương án thay thế từng cân nhắc

- **Retry bên trong `llm/stream` hoặc SDK provider**: bị từ chối, vì luồng gốc một khi đã phát chunk sẽ không còn ranh giới lần thử bền vững, retry SDK ẩn sẽ nhân ngân sách lên gấp bội, và cả hai đường đều không thể ghi log nhất quán cho mỗi lần thử lỗi.
- **Thêm event bắt đầu, gián đoạn, loại bỏ, lỗi và commit response vào `dsh-llm`**: bị từ chối, vì agent log đã tách biệt chunk gốc, message thành công và lần thử được đánh số. Một máy trạng thái thứ hai sẽ lặp lại quan hệ sở hữu, mà vẫn không hỗ trợ được retry cùng route có giới hạn.
- **Thêm routing logic, ma trận năng lực, và lựa chọn failover**: bị từ chối, vì request hiện tại đã chỉ định tường minh provider và model, mỗi provider do một adapter chịu trách nhiệm, và không có phía tiêu thụ hiện tại yêu cầu fallback tự động hoặc có thể chứng minh tương thích ngữ nghĩa.
- **Đặt `retryable` hoặc `failover` lên `LlmFailure`**: bị từ chối, vì adapter báo cáo fact, còn chính sách deployment quyết định hành động. Cùng một lỗi 429 có thể được retry trong gói tổ hợp tương tác, hoặc bị từ chối trong batch bị giới hạn chi phí.
- **Retry vô hạn miễn là phía gọi vẫn còn hoạt động**: [chính sách được cấu hình theo provider](../feature/2026-07-24-provider-retry-policies.md) đã lật ngược sự từ chối này với cấu hình `always` tường minh, đồng thời vẫn giữ normal mode có giới hạn làm mặc định.
- **Chỉ ghi trạng thái retry qua logger tiến trình**: bị từ chối, vì log tiến trình không thể tái dựng hành vi session, cũng không thể điều khiển trạng thái UI sau replay.
- **Chỉ giữ code phẳng**: bị từ chối, vì độ trễ retry và provider request id là fact có cấu trúc của provider, và khi các lỗi protocol khác nhau dùng chung một code ổn định, việc chẩn đoán còn cần cả HTTP status.

## Xác minh

- `LlmFailure` là payload có thể serialize duy nhất được adapter throw, error finish, và abort finish sử dụng; khi có thể, việc chuẩn hóa giữ lại code ổn định, status, độ trễ retry, provider request id đã gắn brand, và phân loại giữa việc bị phía gọi hủy với timeout của adapter.
- Giá trị ném ra của adapter sẽ trở thành chunk lỗi terminal trước khi tới phía tiêu thụ; exception ở middleware và phía tiêu thụ vẫn ném ra ngoài phạm vi phục hồi request mô hình.
- Test adapter DeepSeek và pi-ai bao phủ các đường tiêu biểu: 400, 401/403, 429, 5xx, kết nối, luồng sai định dạng/bị cắt, timeout, abort, số giây/ngày trong Retry-After, request id và lỗi SDK không xác định, chính sách phục hồi không cần parse văn bản message.
- pi-ai cố định option SDK về không lần retry, và thực hiện một lần thử request trên đường dây (wire) có thể quan sát được cho phản hồi provider có thể retry; test độc lập bảo đảm việc gỡ bỏ bất kỳ ranh giới nào cũng sẽ khiến test fail.
- `agent/request-error` mang fact lỗi hiện tại, fact lỗi đã retry trước đó bất biến, và chính sách retry bất biến do registration của dịch vụ mang theo; khi thành công sẽ xóa lịch sử, test tích hợp về lỗi tạm thời/tràn context xen kẽ chứng minh hai chính sách chỉ tiêu thụ ngân sách hữu hạn riêng của chúng.
- Mỗi adapter provider xác thực chính sách retry lồng nhau của nó khi Loader khởi động, `ctx.llm` sẽ nắm bắt chính sách đó cùng với routing; normal mode sẽ ủy quyền đường không hợp lệ, và khi không có chính sách nào khác, tối đa sẽ phát `maxRetries + 1` lần request provider.
- Test thực hiện HMR trong lúc backoff chứng minh: quá trình dispose sẽ hủy đăng ký listener, abort và chờ các callback đã bị bắt, không phát ra quyết định retry sau khi dispose, cũng không để lại timer hay promise còn sống.
- Test đơn vị thuần túy bao phủ việc chọn code tạm thời, backoff mũ và ranh giới jitter, `Retry-After` hợp lệ và vượt trần, ngân sách cạn kiệt, hook timer/random số xác định, và việc abort trong lúc backoff.
- Test agent-loop thực tế bao phủ lỗi trước khi có chunk, lỗi sau khi có một phần chunk, lỗi ném ra và lỗi inband, retry ở turn mới cho tới khi thành công, ghi `turn/end.reason` có cấu trúc sau khi cạn kiệt, và tổ hợp với việc phục hồi tràn context của `dsh-compaction-basic`.
- Test tích hợp partial chunk chứng minh: chunk lỗi vẫn thuộc về step lỗi, step đó không commit message assistant hay side effect tool, retry thành công sẽ ghi lại seq chunk và routing provider/model của chính nó.
- Event `llm/retry` do plugin sở hữu, không xuất hiện ở bề mặt, vẫn giữ nguyên sau khi round-trip qua JSONL và SQLite, bị việc phái sinh message bỏ qua, và điều khiển việc thu hồi cùng render retry đã lên kế hoạch ở TUI và Web. Test client bao phủ toàn bộ việc xác thực trên đường dây, đồng hồ đếm ngược độc lập với clock, sự khác biệt giữa nhãn retry đã hủy và đã hoàn tất, cùng việc gán về đúng quỹ đạo (trajectory); snapshot UI không cần key bao phủ việc lên lịch và thành công của Web, test tổ hợp Web thực tế bao phủ lỗi truyền tải một phần cho tới khi phục hồi, snapshot tự động hóa ACP xác nhận các lần thử bị loại bỏ không được phát ra qua protocol, còn phản hồi sau khi phục hồi được phát ra bình thường.
- Test watchdog idle chứng minh: signal ổn định chỉ được tái bố trí khi `next()` chưa hoàn tất; nó được gỡ bố trí trong lúc phía tiêu thụ đang "suy nghĩ" và trong `finally`; nó được phân loại tách biệt với deadline tổng của lần gọi và việc bị phía gọi hủy xảy ra sớm hơn. Test adapter chứng minh signal này sẽ chấm dứt request cơ bản, chứ không chỉ tách rời khỏi nó.
- Phía gọi trực tiếp của `ctx.llm.stream()` vẫn chỉ thử một lần, và nhận cùng fact lỗi có cấu trúc.

## Hệ quả

- Mỗi lần thử retry đều hiển thị dưới dạng một turn lỗi đã đóng cộng với `llm/retry`, hành vi thử một lần cấp adapter sẽ ngăn retry SDK ẩn nhân lên gấp bội quyết định chính sách. Ngay cả khi không có chunk nào đến, retry vẫn có thể khiến provider tính phí trùng lặp; normal mode giới hạn rủi ro này, còn always mode tường minh chấp nhận rủi ro đó cho tới khi bị hủy hoặc thành công.
- SDK provider có thể ẩn status hoặc retry header. Adapter sẽ giữ lại fact ổn định mà SDK công khai, nếu không thì dùng code thô, và sẽ không để chính sách phục hồi parse văn bản dễ vỡ.
- Event retry bền vững mở rộng protocol session và máy trạng thái UI. Event được giao cùng phía tiêu thụ của nó, tránh tạo ra từ vựng đo lường (telemetry) không ai dùng; nhưng việc thay đổi schema sau này vẫn cần đồng bộ hoàn tất cả việc lưu trữ bền vững và replay.
- Việc xóa chunk thời gian thực của step lỗi có thể gây thu hồi output rõ rệt. So với việc hiển thị văn bản bị loại bỏ hoặc JSON tool chưa hoàn chỉnh như lịch sử đã commit, đây là lựa chọn tốt hơn; snapshot cố định sự chuyển đổi này.
- Cơ chế cưỡng bức idle cục bộ của adapter có thể chấm dứt truyền tải bị treo, mà không tính vào thời gian "suy nghĩ" của phía tiêu thụ. Test quy ước cho mỗi ranh giới truyền tải sẽ ngăn SDK bị trôi (drift).
- Nhiều plugin phục hồi normal sẽ cộng dồn ngân sách hữu hạn riêng của chúng. Always mode sẽ ủy quyền trước, rồi mới cung cấp fallback không giới hạn; các bộ phân loại chồng lấn vẫn sẽ tạo thành chính sách phụ thuộc thứ tự đăng ký, phải được plugin đưa chúng vào ghi lại và kiểm thử.

## Tài liệu liên quan

- [Hệ phân loại lỗi có cấu trúc](../../implemented/architecture/2026-06-11-structured-error-taxonomy.md) chịu trách nhiệm về code ổn định, có thể định tuyến máy và cause chaining.
- [Request có thể tái dựng](../../implemented/architecture/2026-07-05-reconstructable-requests.md) khiến provider/model và toàn bộ input request được lưu bền vững trước khi phân phối.
- [Thư viện timeout deadline](../../implemented/architecture/2026-07-06-timeout-deadline-library.md) tách phân loại deadline dùng chung khỏi thao tác chấm dứt do năng lực tự sở hữu.
- [Áp lực nén và phục hồi tràn context sau khi gọi](../../implemented/architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md) chịu trách nhiệm về extension point phục hồi request cho step đã đóng hiện tại và retry tràn có giới hạn.
- [Adapter LLM định tuyến theo provider](../../implemented/architecture/2026-07-14-provider-routed-llm-adapters.md) chịu trách nhiệm về routing provider/model tường minh và bất biến thức mỗi provider chỉ có một adapter.
