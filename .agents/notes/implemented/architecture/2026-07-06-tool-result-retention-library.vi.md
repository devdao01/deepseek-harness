# Agent Note: Thư viện giữ lại kết quả công cụ (tool result retention library)

Status: implemented

[English](2026-07-06-tool-result-retention-library.md) | Tiếng Việt

## Vấn đề

Nhiều công cụ hướng tới model đã giới hạn lượng ngữ cảnh chúng trả về, nhưng mỗi công cụ lại sở hữu cơ chế và từ vựng cục bộ riêng: bash giữ lại phần đuôi và cung cấp file spill; web search giới hạn danh sách nguồn; web fetch giới hạn nội dung phần thân; các công cụ khám phá `glob`/`grep` cần cung cấp trang đầu tiên trong dòng, đồng thời giữ metadata lược bỏ chính xác cho toàn bộ tập kết quả. Một hàm hỗ trợ `truncate(text)` đơn lẻ không thể bao phủ các trường hợp này: công cụ dạng mục cần đếm số mục và nhóm ngoài phạm vi nguyên thủy; công cụ dạng văn bản lại cần ngân sách byte và cắt đầu/đuôi an toàn UTF-8.

Trừu tượng dùng chung mà các công cụ này cần là **retention** (giữ lại), không phải một tập hợp chung chung. Bên gọi đưa từng mục hoặc phần văn bản vào một đối tượng có giới hạn, sau đó lấy nội dung được giữ lại cùng metadata lược bỏ chính xác. Mã riêng của từng công cụ vẫn chịu trách nhiệm về ngữ nghĩa nghiệp vụ: nhóm theo file, số dòng, mã thoát, trạng thái lỗi provider, file spill và lời giải thích hướng tới model. Thư viện chung chỉ chịu trách nhiệm cho một vấn đề cơ học duy nhất: "cái gì được giữ lại, cái gì bị lược bỏ?"

## Quyết định

`@deepseek-ai/dsh-output-retention` nằm dưới `packages/util/`, cùng cấp với `dsh-brand` và `dsh-timeout`, chịu trách nhiệm cho output hiển thị cho model có giới hạn. Đây là một thư viện gồm class và hàm thuần túy, **không phải** service hay plugin Cordis: không nhận `ctx`, không đăng ký gì, không giữ trạng thái xuyên lệnh gọi, cũng không phát sự kiện. Các gói công cụ cần giới hạn output import nó trực tiếp.

Thư viện này chứa hai retainer độc lập với nhau:

- `ItemRetainer<T>` xử lý các đơn vị logic có thứ tự, ví dụ đường dẫn, kết quả khớp grep hoặc nguồn tìm kiếm. v1 chỉ hỗ trợ giữ lại `head`, đồng thời giữ hình dạng retainer để tương lai thêm chiến lược giữ lại khác.
- `TextRetainer` xử lý luồng văn bản hướng byte, ví dụ stdout/stderr của bash hoặc phần thân response web. Nó hỗ trợ giữ lại `head`, `tail` và `headTail`, và giữ ranh giới UTF-8 khi `finish()`.

Cả hai retainer đều trả về một `PushDecision` nhỏ; sau mỗi lần gọi `push()`, bên gọi biết được đơn vị/phần đó có được giữ lại hoàn toàn hay không, và kết quả tích lũy tại thời điểm này đã bị cắt bớt hay chưa. Vì bên gọi tiếp tục đưa vào mọi mục/phần đã quan sát được, số lượng lược bỏ luôn chính xác.

```ts ignore-check
/**
 * How much content the retainer omitted.
 *
 * `unknown` is reserved for callers that omit without a count; the retainers
 * themselves return `none` or `exact`.
 */
type Omitted =
  | { kind: 'none' }
  | { kind: 'exact'; count: number }
  | { kind: 'unknown' }

interface PushDecision {
  kept: boolean
  truncated: boolean
}

/**
 * Final result for ordered logical units.
 */
interface RetainedItems<T> {
  items: T[]
  truncated: boolean
  seen: number
  kept: number
  omitted: Omitted
}

/**
 * Final result for text streams.
 *
 * The returned `text` is safe to send to a formatter; the retainer does not add
 * tool-specific headers, exit markers, XML tags, or recovery instructions.
 */
interface RetainedText {
  text: string
  truncated: boolean
  omittedBytes: Omitted
}
```

### Chiến lược

Giữ lại mục hỗ trợ cửa sổ đầu (head). Giữ lại văn bản hỗ trợ cửa sổ đầu, đuôi và cửa sổ đầu-đuôi theo byte.

```ts ignore-check
type ItemRetentionStrategy =
  | {
      /** Keep the first `maxItems` units. Use for `glob`, `grep`, and web sources. */
      kind: 'head'
      maxItems: number
    }

type TextRetentionStrategy =
  | {
      /** Keep the first `maxBytes` bytes. */
      kind: 'head'
      maxBytes: number
    }
  | {
      /** Keep the final `maxBytes` bytes. Requires reading to the end. */
      kind: 'tail'
      maxBytes: number
    }
  | {
      /** Keep a stable prefix and suffix, omitting the middle. Requires reading to the end. */
      kind: 'headTail'
      headBytes: number
      tailBytes: number
    }
```

### Ánh xạ công cụ

`read` bị cố ý loại khỏi thư viện retention v1. Hàm hỗ trợ `read-render` của nó sở hữu convention phân trang riêng cho file: `offset`/`limit`, số dòng, `totalLines`, lỗi offset vượt giới hạn, cắt bớt xem trước theo từng dòng, và trần byte output đã chọn có thể dừng quét giữa cửa sổ. Đây là bộ render cửa sổ dòng, không phải nguyên thủy retention chung. Trong tương lai nó có thể dùng chung hàm hỗ trợ prompt trung tính, nhưng không nên truyền cửa sổ đã chọn sẵn vào `ItemRetainer`.

`FsGlobEntry` và `FlatGrepMatch` dưới đây là hình dạng mục dự kiến dùng cho công cụ khám phá, không phải export hiện có của thư viện retention. `FsGlobEntry` là một đường dẫn được backend dẫn xuất; `FlatGrepMatch` là một kết quả khớp grep chưa nhóm, trước khi backend nhóm các kết quả được giữ lại theo file.

`glob` thu thập toàn bộ danh sách đường dẫn đã sắp xếp, sau đó dùng `ItemRetainer<FsGlobEntry>`, cấu hình `{ kind: 'head', maxItems: globMaxResults }`. Công cụ giữ trang đầu tiên trong dòng, và có thể lưu danh sách đầy đủ qua spill seam. Ánh xạ đường dẫn, ứng viên bị bỏ qua và `incomplete` đều nằm ngoài retainer.

`grep` dùng `ItemRetainer<FlatGrepMatch>` trước khi nhóm, cấu hình `{ kind: 'head', maxItems: grepMaxMatches }`. Executor parse output ripgrep, ánh xạ đường dẫn, áp dụng cắt bớt xem trước theo từng dòng, và đưa vào các kết quả khớp chưa nhóm. Sau khi gọi `finish()`, công cụ nhóm các kết quả khớp được giữ lại theo file; nếu kết quả trong dòng chạm trần, có thể lưu danh sách khớp đầy đủ qua spill seam. Việc nhóm không thuộc retainer, vì trần áp dụng cho tổng số khớp, không phải số file; việc cắt bớt xem trước theo từng kết quả khớp và `incomplete` cũng độc lập với retention ở cấp kết quả.

`bash` có thể dùng `TextRetainer`, cấu hình `tail` hoặc `headTail`, và đọc tới khi tiến trình kết thúc. Executor bash vẫn chịu trách nhiệm cho file spill, trạng thái thoát, signal, timeout và hành vi tác vụ nền; hàm hỗ trợ retention chỉ thay thế phần hạch toán đầu/đuôi trong bộ nhớ tạm thời khi cần hành vi đó. Quyền sở hữu tác vụ chạy dài độc lập với [runtime công cụ chạy dài chung](2026-06-20-generic-long-running-tool-runtime.md).

`web_fetch` có thể dùng `TextRetainer`, cấu hình `head` hoặc `headTail`; nếu provider phải đọc và decode nội bộ, cũng có thể giữ trần phần thân do provider chịu trách nhiệm. Dù dùng cách nào, `truncated` trong kết quả fetch vẫn là sự thật của provider/công cụ, thư viện chỉ cung cấp văn bản được giữ lại và metadata lược bỏ.

`web_search` có thể dùng `ItemRetainer<WebSearchSource>`, cấu hình `head`. Provider hiện tại thường trả về mảng, nên đây là xử lý sau, nhưng vẫn có thể thống nhất thông điệp gợi ý.

### Gợi ý

Thư viện phơi bày một cấu trúc gợi ý trung tính và một hook định dạng nhỏ, nhưng lời lẽ hướng tới người dùng do công cụ cung cấp. Footer của grep gợi ý "thu hẹp pattern, path hoặc include"; footer của web fetch gợi ý "lấy URL hoặc phần cụ thể hơn"; bash có thể trỏ tới file spill. retainer không thể biết các thao tác phục hồi này.

```ts ignore-check
interface RetentionNotice {
  scope: string
  strategy: 'head' | 'tail' | 'headTail'
  unit: 'items' | 'bytes' | 'chars' | 'lines'
  limit: number | { head: number; tail: number }
  kept: number
  omitted: Omitted
}

const formatGrepNotice = (notice: RetentionNotice): string =>
  formatRetentionNotice(
    notice,
    ({ kept }) => `Results capped at ${kept}. Narrow the pattern, path, or include to see more.`,
  )
```

Hook định dạng cố ý giữ tinh gọn: công cụ chuyển `RetentionNotice` thành văn bản footer của riêng mình. Hàm hỗ trợ có thể thống nhất lời lẽ lược bỏ nhưng không chịu trách nhiệm cho hướng dẫn phục hồi.

`truncated` biểu thị retainer đã lược bỏ nội dung vốn khả dụng do ngân sách, không biểu thị kết quả thượng nguồn không hoàn chỉnh. Công cụ giữ trường riêng cho thất bại quyền, file nhị phân bị bỏ qua, thất bại cục bộ của provider, ứng viên không đọc được, UTF-8 không hợp lệ, và bất kỳ tình trạng "không thể kiểm tra" nào khác.

## Ảnh hưởng

**Nội dung đã giao.** `@deepseek-ai/dsh-output-retention` export `ItemRetainer`, `TextRetainer`, kiểu kết quả (`RetainedItems`, `RetainedText`), kiểu chiến lược (`ItemRetentionStrategy`, `TextRetentionStrategy`), `Omitted`, `PushDecision`, `RetentionNotice`, và hàm hỗ trợ gợi ý trung tính `describeOmitted`/`formatRetentionNotice`, không phụ thuộc Cordis hay bất kỳ gói công cụ nào. Unit test bao phủ việc giữ lại đầu mục với số đếm lược bỏ chính xác, giữ lại đầu văn bản, giữ lại đuôi văn bản, giữ lại byte đầu-đuôi, ngân sách bằng không, xử lý ranh giới UTF-8 (code point 2, 3, 4 byte, và byte bắt đầu không hợp lệ tại mỗi vị trí cắt) và lời lẽ cho lượng lược bỏ không xác định.

**Đã ghi lại nhưng chưa di chuyển.** Ánh xạ cho `glob`, `grep`, `bash`, `web_fetch` và `web_search` đã được ghi lại trong [README package](../../../../packages/util/output-retention/README.md), nhưng thay đổi lần này không di chuyển từng công cụ sang thư viện đó; công việc di chuyển được để lại có chủ đích như một tác vụ tiếp theo độc lập. `read` được ghi rõ là ngoài phạm vi: convention cửa sổ dòng `read-render` của nó (`offset`/`limit`, `totalLines`, lỗi phạm vi offset, cắt bớt xem trước theo từng dòng, và trần byte cho cửa sổ đã chọn) không thuộc retention chung, và một số đếm `Omitted` cũng không thể biểu đạt đồng thời hai phía của cửa sổ dòng.

**Ranh giới thư viện này duy trì.** `truncated` biểu thị retainer đã lược bỏ nội dung vốn khả dụng do ngân sách, không bao giờ biểu thị thượng nguồn không hoàn chỉnh. Trạng thái riêng của công cụ, bao gồm `incomplete`, thất bại quyền, thất bại cục bộ của provider, file nhị phân bị bỏ qua, phục hồi đường dẫn spill bash và UTF-8 không hợp lệ, đều nằm trong trường thuộc lĩnh vực của công cụ, ngoài retainer. Khi thay đổi trong tương lai di chuyển một công cụ, README và test của package đó phải chứng minh rằng, ngoài lời lẽ gợi ý được thay đổi có chủ đích, văn bản kết quả hiển thị cho model không thay đổi.

**Đánh đổi được chấp nhận.** Interface v1 cố ý chỉ hỗ trợ giữ lại `head` cho mục, và giữ lại `head`/`tail`/`headTail` cho văn bản; cửa sổ, ngân sách nhóm, trần nhận biết thứ tự và điều khiển dừng thượng nguồn sẽ chờ consumer thứ hai chứng minh nhu cầu rồi mới giới thiệu. Giữ lại văn bản đếm theo byte, để đảm bảo an toàn cho tiến trình/phần thân; ngân sách xem trước theo ký tự và theo dòng vẫn do công cụ cụ thể chịu trách nhiệm.

## Phương án thay thế đã cân nhắc

**Chỉ dùng `truncate(text)` xử lý sau.** Không chấp nhận: nó phù hợp với kịch bản cắt bớt lịch sử/output công cụ của Codex, nhưng sẽ mất số đếm mục, ranh giới nhóm, cửa sổ byte an toàn UTF-8 và metadata lược bỏ chính xác.

**Dùng một `Collector<T>` chung với callback có thể cắm.** Không chấp nhận cho v1, vì nó sẽ che giấu hai khuôn mẫu tài nguyên quan trọng. Giữ lại mục logic đếm theo mục; giữ lại văn bản đếm theo byte và giữ ranh giới UTF-8. Tên riêng biệt `ItemRetainer` và `TextRetainer` thể hiện rõ sự khác biệt này trong khi vẫn giữ API tinh gọn.

**Giao cửa sổ `read` cho `ItemRetainer`.** Không chấp nhận cho v1: `read` hiện là consumer cửa sổ duy nhất, ngữ nghĩa của nó thuộc phân trang file, không phải retention chung. Một số đếm `Omitted` không thể biểu diễn hai phía của cửa sổ dòng, và `read` còn mang `totalLines`, lỗi phạm vi offset, cắt bớt xem trước theo từng dòng và trần byte cho output đã chọn. Để `read-render` do công cụ sở hữu tránh việc thư viện dùng chung phình to vì một trường hợp đặc biệt.

**Để việc cắt bớt trở thành một phần của `ToolExecutionResult`.** Không chấp nhận: registry công cụ sẽ phải hiểu hướng dẫn phục hồi riêng của công cụ, việc nhóm, số dòng, trạng thái thoát và ngữ nghĩa provider. Retention là thư viện được Native renderer (bộ render gốc) của công cụ sử dụng; hình chiếu hiển thị cho model tiếp tục do công cụ sở hữu, còn [giá trị chuẩn](2026-07-20-canonical-tool-output-contract.md) có thể giữ toàn bộ kết quả đã thu thập.

**Phơi bày trần trong từng schema công cụ hướng tới model.** Không phải phương án mặc định: grep của Claude Code phơi bày `head_limit`/`offset`, nhưng harness này giữ ngân sách thông thường như cấu hình triển khai, trừ khi model thực sự cần kiểm soát phân trang. Trong tương lai có thể thêm trường tiếp tục kiểu read cho công cụ cụ thể; nó không thuộc nguyên thủy retention dùng chung.
</content>
