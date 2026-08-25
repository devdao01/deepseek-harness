# @deepseek-ai/dsh-compaction-basic

[English](README.md) | Tiếng Việt

**Backend compaction (nén) cơ bản**: `BasicCompactionEngine` triển khai Service Definition `@deepseek-ai/dsh-compaction`, sử dụng áp lực `ctx.tokenMeter` có thể tái sử dụng, dự trữ ngân sách token và tóm tắt. Tóm tắt là một lệnh gọi `ctx.llm.stream()` một lần trực tiếp, phát lại tiền tố phiên (session prefix) để tái sử dụng KV Cache của nhà cung cấp (có thể chặn tại `llm/stream`).

Package này đảm nhận vai trò Service Provider của năng lực compaction; quy ước của nó xem tại [package Service Definition](../compaction/README.md), thiết kế xem tại [Agent Note về capability seam](../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md).

## Trách nhiệm sở hữu

Backend này sở hữu chính sách compaction:

- **Đo lường**: `ctx.tokenMeter` dạng singleton sẽ đo lường mức sử dụng token của envelope đã ghi nhận chuẩn hóa mới nhất và surface hiện tại, trên cùng một log revision đã tiêu thụ. Do đó, phép đo áp lực tại ranh giới step sẽ bao gồm system prompt thực tế, công cụ, routing, assistant completion, kết quả công cụ, ngữ cảnh đệm và steering (dẫn dắt giữa chừng).
- **Chính sách routing**: áp lực chủ động giải quyết dung lượng từ adapter đang giữ routing nhà cung cấp/mô hình bền vững mới nhất, sau đó co giãn chính sách mặc định cùng với mọi ghi đè mục tiêu chính xác tùy chọn thành ngân sách token cụ thể. Việc phát hiện mô hình vẫn chỉ mang tính tham khảo, không tham gia vào việc giải quyết chính sách ở đây.
- **Cắt tỉa không phụ thuộc mô hình**: sau khi áp lực hoặc tràn chuẩn hóa đạt điều kiện, dịch vụ tùy chọn [`ctx.toolResultPruner`](../compaction-tool-result-pruner/README.md) có thể viết lại các kết quả công cụ quá lớn trước khi chọn phạm vi. Compact-basic đo lại thông qua `ctx.tokenMeter`; nếu áp lực đã trở về mức an toàn thì bỏ qua tóm tắt, ngược lại sẽ tóm tắt trên surface đã được cắt tỉa. Việc kiểm tra step dưới ngưỡng áp lực sẽ không bao giờ cắt tỉa.
- **Giữ lại**: nén đơn vị surface hoàn chỉnh cũ nhất, đồng thời giữ lại phần đuôi gần đây, và điều chỉnh điểm cắt về vị trí cân bằng cặp tool call/kết quả thông qua [helper ranh giới của `dsh-compaction`](../compaction/README.md#tool-pairing-boundaries). Ranh giới lượt (turn) không bảo vệ các step cũ bên trong một lượt mất kiểm soát. Phần đuôi chưa đóng và không thể chia tách sẽ bị từ chối compaction trước khi đóng. Khi đơn vị công cụ quá lớn đã đóng có phần chính có thể loại bỏ là kết quả dạng văn bản, pruner tùy chọn có thể khắc phục; các đơn vị không thuộc công cụ không thể chia tách và phần còn lại của công cụ không thể cắt tỉa nằm ngoài phạm vi.
- **Hội tụ**: thử lại nén checkpoint đầu (head) tối đa `compactionRetries` lần; từ chối các bản tóm tắt không thể thu nhỏ nội dung nguồn, và nếu thử lại vẫn không đưa được về dưới ngưỡng thì ném ngoại lệ.
- **Tóm tắt**: lệnh gọi `llm/stream` trực tiếp sử dụng cặp nhà cung cấp/mô hình và giới hạn đã cấu hình, quay lại mục tiêu request đã ghi nhận gần nhất, rồi tiếp tục quay lại mục tiêu agent, mà không chạy điểm mở rộng `agent/request` chỉ dành cho agent loop. Lệnh gọi này phát lại nguyên văn system prompt, công cụ và các message trong vùng bị che khuất của chính phiên (bao gồm cả tham chiếu hình ảnh), rồi thêm chỉ thị compaction làm message user cuối cùng, nhờ đó tái sử dụng cache tiền tố nóng của nhà cung cấp, thay vì làm nó mất hiệu lực. Adapter được chọn phải giải quyết hoặc từ chối rõ ràng các hình ảnh này. Nó đặt `GenerateOptions.purpose` thành `compaction`, adapter có thể chuyển tiếp giá trị này như thông tin quy kết request (adapter DeepSeek gửi `x-deepseek-harness-compact: 1`), nhưng không chạm vào phần thân request hiển thị cho mô hình. Chỉ văn bản trả về mới đi vào checkpoint; reasoning (suy luận) và tool call đều bị loại trừ, để tránh rò rỉ suy luận riêng tư hoặc tạo ra lệnh gọi còn sót lại; đầu ra hình ảnh sẽ thất bại với `UNSUPPORTED_CONTENT` thay vì biến mất.
- **Đóng khung**: message user thay thế dùng thẻ `<compacted-summary>` để đánh dấu ngữ cảnh checkpoint đã thiết lập. Bản tóm tắt gốc được giữ lại trên sự kiện `compaction/summary`; các chu kỳ tự động sau đó sẽ gộp các checkpoint trước đó.
- **Vòng đời**: mọi entry point đều chia sẻ một giao dịch phạm vi ghi nhãn trước. Nó xác thực phạm vi và khóa đang hoạt động, đồng bộ thêm `compaction/start`, chuẩn bị và chờ tóm tắt, xác thực lại, rồi thêm `compaction/summary` và thay thế, cuối cùng thực hiện đúng một lần thử đóng. Lệnh gọi tự động và lệnh gọi phạm vi tường minh yêu cầu quyền sở hữu lượt mở được định danh bằng số, và yêu cầu toàn bộ surface phải ổn định; listener `agent/pre-step` tuần tự sẽ kiểm tra áp lực trước khi phát sinh request, còn tràn nhà cung cấp chuẩn hóa thì đi qua `agent/request-error`, và chỉ cho phép thử lại khi surface đã đạt tiến triển bền vững. `compactNow()` sẽ dự trữ chỗ tiếp nhận rảnh rỗi, dùng `turn: null`, cho phép thêm ngữ cảnh chỉ-thêm bên ngoài span đã chọn, flush mỗi lần thử đã đóng, và giải phóng chỗ dự trữ tiếp nhận trong `finally`.
- **Khôi phục tràn**: tràn đã được nhà cung cấp xác nhận không cần metadata dung lượng. Nó bỏ qua áp lực và giữ lại thông thường, thực hiện cắt tỉa, rồi thử một lần thu nhỏ head cân bằng tối đa, để lại đơn vị không thể chia tách mới nhất. Miễn là `surface.replaceGeneration` tiến lên, việc thử lại vẫn được phép, kể cả khi cắt tỉa đã hoàn tất trước khi công việc tóm tắt tiếp theo ném ngoại lệ. Nếu không có thay thế, giới hạn đặc thù mục tiêu đã cạn, đã bị hủy, hoặc gặp lỗi không xác định/không chuẩn hóa, thì giữ nguyên lỗi gốc của nhà cung cấp.
- **Xử lý lỗi**: `compaction/start` đang hoạt động chưa khớp cặp là khóa bền vững. Nhãn chưa khớp cặp nằm trước `session/end-seed` mới hơn là bằng chứng lỗi thời từ vòng đời tiến trình trước, không chặn; nhãn nằm sau ranh giới đó báo `busy`. Lỗi tóm tắt và thay đổi span sẽ đóng bằng lỗi, giữ nguyên surface phiên, nhưng log vẫn giữ lại lần thử đó. Lỗi đóng sẽ cố ý để lại nhãn chưa khớp cặp mang tính chặn. Lỗi vận hành trong kiểm tra áp lực sẽ phát cảnh báo và tiếp tục; chỉ khi trước đó chưa có thay thế nào đẩy surface tiến lên thì lỗi khôi phục tràn mới giữ nguyên lỗi gốc của nhà cung cấp. Sau khi hoàn tất dọn dẹp và bền vững hóa, việc hủy vẫn có quyền quyết định cuối cùng.

Phương thức `summarize()` được bảo vệ (protected) là hook duy nhất dành cho lớp con. Các lớp con dựa trên template hoặc bộ tóm tắt từ xa có thể ghi đè phương thức này, trong khi áp lực, giữ lại, sự kiện nguồn được tham chiếu, xác thực thu nhỏ và đo lường token vùng bị che khuất vẫn do `ctx.tokenMeter` đảm nhiệm. Hook trả về bản tóm tắt an toàn, cùng với đầu ra đầy đủ của nhà cung cấp, envelope lệnh gọi và usage khi có (`{ summary, rawOutput?, llmStreamCall?, provider, model, maxTokens?, usage? }`); `llmStreamCall: true` cho biết kết quả này được tạo ra qua đúng một lệnh gọi `ctx.llm.stream()` của context này, và bắt buộc phải cung cấp `rawOutput` đầy đủ; `rawOutput` không có đánh dấu thì không thể xác định đường đi của lệnh gọi. Giao dịch sẽ giữ lại các trường này trên `compaction/summary`.

## Cấu hình (`BasicCompactionConfig`)

Mọi thiết lập đều tùy chọn. Các trường chính sách cấp cao nhất là giá trị mặc định cho mỗi mô hình đã routing; `modelPolicies` áp dụng ghi đè một phần cho các cặp nhà cung cấp/mô hình chính xác. Khi xuất hiện áp lực, compaction-basic sẽ yêu cầu adapter LLM sở hữu tuyến routing đó cung cấp dung lượng ngữ cảnh, rồi giải quyết ra ngân sách tuyệt đối. Khóa cấu hình không nhận diện được, mục tiêu trùng lặp, các dạng giữ lại loại trừ lẫn nhau, và `retainRatio` sau gộp không thấp hơn `thresholdRatio`, đều khiến plugin nạp thất bại. Ngân sách `retainTokens` tuyệt đối không thấp hơn ngưỡng đã co giãn sẽ gây lỗi ngay khi mục tiêu được giải quyết lần đầu, vì phép so sánh này cần dung lượng mô hình.

| Key | Bắt buộc | Ý nghĩa |
|---|---|---|
| `thresholdRatio` | Không (mặc định `0.8`) | Nén tại `floor(routedContextWindow × ratio)`. |
| `retainRatio` | Không (mặc định `0.16`) | Biểu diễn ngân sách surface gần đây được giữ nguyên văn dưới dạng một phần của cửa sổ ngữ cảnh đã routing; loại trừ lẫn nhau với `retainTokens`. |
| `retainTokens` | Không | Ngân sách tuyệt đối của surface gần đây được giữ nguyên văn; loại trừ lẫn nhau với `retainRatio`, và phải thấp hơn ngưỡng đã giải quyết. |
| `summarizationProvider` | Không (mặc định `''`) | Đặt cùng với `summarizationModel`; cặp rỗng sẽ giải quyết về mục tiêu request đã ghi nhận gần nhất, rồi quay lại cặp `AgentOptions`. |
| `summarizationModel` | Không (mặc định `''`) | Đặt cùng với `summarizationProvider`; cặp rỗng sẽ giải quyết về mục tiêu request đã ghi nhận gần nhất, rồi quay lại cặp `AgentOptions`. |
| `maxTokens` | Không (mặc định `8192`) | Giới hạn sinh của nhà cung cấp cho lệnh gọi tóm tắt; có thể bao gồm token reasoning. |
| `compactionRetries` | Không (mặc định `1`) | Số lần thử thêm sau lần đầu khi áp lực vẫn cao hơn ngưỡng. |
| `maxOverflowRetries` | Không (mặc định `1`) | Số lần thử lại tối đa sau khi tràn cửa sổ ngữ cảnh chuẩn hóa; `0` chỉ vô hiệu hóa khôi phục. |
| `modelPolicies` | Không (mặc định `[]`) | Ghi đè chính xác `{ provider, model, ...partialPolicy }`; khớp dùng cả hai trường, không dựa vào `listModels()`. |
| `auto` | Không (mặc định `true`) | Đăng ký listener áp lực tại ranh giới step và khôi phục tràn. Đặt `false` thì chỉ thực thi thủ công. |

Mỗi mục cấu hình `modelPolicies` chấp nhận các trường chính sách nêu trên, nhưng không chấp nhận `auto` và chính `modelPolicies`. Nếu một mục cấu hình cung cấp bất kỳ trường giữ lại nào, nó sẽ thay thế lựa chọn giữ lại của chính sách mặc định; nếu không thì kế thừa thiết lập giữ lại. Nhà cung cấp/mô hình tóm tắt trong mỗi mục cấu hình vẫn phải đi thành cặp.

Adapter có thể không trả về dung lượng cho một tuyến routing động hợp lệ, và dung lượng đã giải quyết cũng có thể phơi bày ngân sách giữ lại tuyệt đối không hợp lệ. Lúc này việc kiểm tra áp lực thủ công sẽ ném lỗi cấu hình đặc thù mục tiêu; listener tự động sẽ cảnh báo một lần cho đúng mục tiêu đó, và tiếp tục với toàn bộ lịch sử. Các lỗi vận hành không liên quan vẫn hiển thị độc lập. Tràn nhà cung cấp chuẩn hóa vẫn sẽ thử khôi phục, vì nhà cung cấp đã xác lập nhu cầu compaction.

## Cách dùng

`BasicCompactionEngine` cần `ctx.llm`, `ctx.tokenMeter` và `ctx.sessions`. Ví dụ tổ hợp dưới đây nhận `ctx.llm` từ host của nó, và cài đặt thêm hai dịch vụ còn lại:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic'
import SessionStore from '@deepseek-ai/dsh-session'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

export const name = 'compaction-basic'
export const inject = ['llm']

export function apply(ctx: Context): void {
  ctx.plugin(SessionStore)
  ctx.plugin(TokenMeter)
  ctx.plugin(BasicCompactionEngine)
}
```

Nạp plugin sẽ đăng ký `ctx.compaction`. Thêm [`dsh-compaction-tool-result-pruner`](../compaction-tool-result-pruner/README.md) ngang hàng trước plugin này để bật giai đoạn xử lý không phụ thuộc mô hình tùy chọn. Khi `auto: true` (mặc định), nó sẽ tự động compaction khi có áp lực token. Plugin ngang hàng [`dsh-command-compact`](../command-compact/README.md) gọi `ctx.compaction.compactNow(...)`; các bên gọi lập trình cũng có thể dùng trực tiếp bất kỳ thao tác nào của seam.

Ví dụ, cùng một plugin compaction có thể phục vụ an toàn cho các mô hình có dung lượng khác nhau, và áp dụng một chính sách đặc thù mục tiêu:

```yaml
- name: '@deepseek-ai/dsh-compaction-basic'
  config:
    thresholdRatio: 0.8
    retainRatio: 0.16
    modelPolicies:
      - provider: local
        model: small-context
        thresholdRatio: 0.7
        retainTokens: 2048
```

## Trải nghiệm mô hình

### Lịch sử phiên

#### Nội dung mô hình nhìn thấy

Sau khi một step thành công vượt ngưỡng, nếu pruner tùy chọn đã được nạp, các kết quả công cụ quá lớn sẽ được viết lại trước. Nếu vẫn cần tóm tắt, request tiếp theo sẽ nhận được phần dẫn checkpoint bên dưới, một dòng trống, `<compacted-summary>`, bản tóm tắt được tạo dựa trên dữ liệu, và `</compacted-summary>`. Khôi phục tràn sẽ thử lại ngay lập tức dựa trên mọi thay thế giúp surface tiến lên. Checkpoint thay thế khoảng trước đó đã chọn, theo sau là các đơn vị gần đây đã được giữ lại.

##### Phần dẫn checkpoint phiên

```markdown
This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.
```

#### Ảnh hưởng Token

Cắt tỉa không phụ thuộc mô hình có thể tránh hoàn toàn lệnh gọi phụ trợ; nếu không, nó sẽ thu nhỏ transcript (bản ghi văn bản) của lệnh gọi đó trước khi tóm tắt thay thế khoảng trước đó. Việc thay thế sẽ thu nhỏ lịch sử đầu vào tương lai, thay vì thêm một bản sao thứ hai. Bản tóm tắt được giữ lại cho đến khi compaction sau đó thay thế nó, nhưng các đơn vị không thuộc công cụ không thể chia tách vẫn có thể vượt ngân sách.

#### Ảnh hưởng KV Cache

Đây là một thao tác thay thế, không chỉ thêm vào. Mỗi checkpoint sẽ làm mất hiệu lực tái sử dụng kể từ token lịch sử đã thay thế đầu tiên; tiền tố request chưa thay đổi trước phạm vi đó vẫn có thể tái sử dụng.

### Request phụ trợ của bộ tóm tắt

#### Nội dung mô hình nhìn thấy

Mô hình tóm tắt sẽ nhận được phiên phát lại nguyên văn: cùng system prompt, tool schema và message mà request đã routing gần nhất gửi cho vùng bị che khuất, theo sau là một message user cuối cùng, chính là chỉ thị compaction bên dưới. Mô hình phiên chính sẽ không bao giờ thấy request riêng tư này hay phần reasoning của nó; chỉ văn bản trả về mới được lưu trữ.

##### Chỉ thị compaction (message user cuối cùng)

```markdown
You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.

Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.

## Primary Request and Intent
- [the user's original and evolving goals; quote verbatim where the exact wording matters]

## Key Technical Concepts
- [technologies, frameworks, patterns, and conventions in play]

## Files and Code
- [exact path: why it matters, key changes or snippets]

## Errors and Fixes
- [error: how it was resolved, plus any related user feedback]

## Pending Jobs
- [explicitly requested work not yet completed]

## Current Work
- [precisely what was in progress at this checkpoint]

## Next Step
- [the single next action, directly in line with the most recent request, or "(none)"]

## Critical Context
- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]

Rules:
- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.
- Capture user feedback and explicit instructions faithfully, especially corrections.
- Do NOT mention this summarization request or that the context was compacted.
- Output only the checkpoint text: do not call any tool or take any other action.
- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.
```

#### Ảnh hưởng Token

Đây là một lệnh gọi mô hình độc lập: đầu vào là tiền tố phiên đã phát lại cộng với chỉ thị cố định, đầu ra bị giới hạn bởi `maxTokens`. Việc thử lại để hội tụ có thể phải trả chi phí này nhiều lần.

#### Ảnh hưởng KV Cache

System prompt, công cụ và message vùng bị che khuất đã phát lại khớp nguyên văn với request đã routing cuối cùng của phiên, do đó cache tiền tố nóng của nhà cung cấp có thể tái sử dụng cho đến trước chỉ thị đuôi; chỉ chỉ thị đó và đầu ra tóm tắt là không được cache. Việc routing bộ tóm tắt sang nhà cung cấp/mô hình khác, hoặc compaction một phạm vi không phải head, đều sẽ từ bỏ khả năng tái sử dụng này.

## Giới hạn đã biết & công việc hoãn lại

- **Độ chính xác đo lường phụ thuộc vào heuristic cố định**: khi thiếu usage nhà cung cấp có thể tái sử dụng, sẽ quay lại đếm ký tự cộng chi phí cấu trúc, thay vì token hóa chính xác.
- **Phân loại tràn do adapter duy trì**: cách diễn đạt của nhà cung cấp có thể thay đổi; hai adapter DeepSeek chuẩn hóa các lỗi giới hạn ngữ cảnh hiện có thể nhận diện thành `CONTEXT_WINDOW_EXCEEDED`.
- **Đơn vị không thể chia tách một phần và tràn chỉ-envelope vẫn nằm ngoài phạm vi compaction surface**: khôi phục không thể thu nhỏ system/công cụ/tiền tố, tách một node không thuộc công cụ không thể chia tách, hoặc khắc phục đơn vị công cụ có phần còn lại không thể cắt tỉa vẫn vượt cửa sổ. Pruner tùy chọn có thể thu nhỏ phần chính kết quả công cụ dạng văn bản bên trong một cặp công cụ vốn không thể chia tách.
- **`compactRegion` yêu cầu tồn tại một lượt chưa kết thúc**: gọi thủ công trên một phiên đã đóng hoàn toàn sẽ ném ngoại lệ ("no open turn"), thay vì thực hiện compaction.
- **Lỗi tóm tắt sẽ giữ nguyên surface bền vững mới nhất**: trước bất kỳ thay thế nào, đường dẫn tự động sẽ ghi cảnh báo, và tiếp tục với toàn bộ lịch sử vượt ngân sách. Nếu việc cắt tỉa đã hoàn tất, lỗi tóm tắt tiếp theo sẽ tiếp tục từ surface đã cắt tỉa bền vững đó. Việc tóm tắt bị cắt ngắn do đạt `maxTokens` (token reasoning ẩn có thể tiêu hết hạn ngạch này) cũng tuân theo cùng quy tắc.
