# dsh-output-retention

[English](README.md) | Tiếng Việt

Một thư viện **retention (giữ lại)** với ít phụ thuộc: cung cấp output hướng tới model có giới hạn (bounded) cho các công cụ bắt buộc phải giới hạn lượng ngữ cảnh trả về. Bên gọi đưa các mục hoặc mảnh văn bản vào một đối tượng có giới hạn, rồi lấy lại nội dung được giữ lại cùng metadata mô tả chính xác phần đã bị bỏ qua.

Thư viện này **chỉ** chịu trách nhiệm về vấn đề cơ chế này: *"chúng ta đã giữ lại gì, và đã bỏ qua gì?"*. Mã dành riêng cho từng công cụ giữ nguyên ngữ nghĩa nghiệp vụ của nó: gom nhóm file, số dòng, mã thoát, trạng thái lỗi của bên cung cấp, cắt bớt bản xem trước theo từng dòng, file spill, và văn bản hướng tới model. Đây chính là ranh giới được vạch ra trong [Agent Note](../../../.agents/notes/implemented/architecture/2026-07-06-tool-result-retention-library.md).

Đây là **thư viện, không phải service hay plugin**: không có `ctx`, không đăng ký gì, không phát ra sự kiện nào. Trạng thái chỉ tồn tại trong mỗi retainer (một lần tích lũy), không bao giờ xuyên qua các lệnh gọi. Gói công cụ import nó trực tiếp.

## Giao diện công khai

```ts
import {
  ItemRetainer, TextRetainer,
  describeOmitted, formatRetentionNotice,
} from '@deepseek-ai/dsh-output-retention'
import type {
  Omitted, PushDecision, RetainedItems, RetainedText,
  ItemRetentionStrategy, TextRetentionStrategy, RetentionNotice,
} from '@deepseek-ai/dsh-output-retention'
```

| Export | Trách nhiệm |
|---|---|
| `ItemRetainer<T>` | Giới hạn các đơn vị logic có thứ tự (đường dẫn, kết quả khớp grep, nguồn). Chỉ hỗ trợ `head`. `push()` → `PushDecision`; `finish()` → `RetainedItems<T>`. |
| `TextRetainer` | Giới hạn luồng văn bản hướng byte. `head` / `tail` / `headTail`, và giữ đúng ranh giới UTF-8 khi `finish()`. `push()` → `PushDecision`; `finish()` → `RetainedText`. |
| `describeOmitted(omitted, unit)` | Mệnh đề mô tả phần bị bỏ qua được chuẩn hóa (`exact` xuất số lượng; `unknown` không xuất). |
| `formatRetentionNotice(notice, recovery)` | Nối mệnh đề bỏ qua đã chuẩn hóa với hướng dẫn khôi phục riêng của công cụ. |
| `Omitted` | `none` / `exact` / `unknown`: đã bỏ qua bao nhiêu nội dung. |
| `PushDecision` | `{ kept, truncated }`: kết quả giữ lại của mỗi lần push. |

## Mô hình tài nguyên

Hai retainer dùng tên riêng biệt, thay vì một collector chung, vì **mô hình tài nguyên** của chúng khác nhau.

- **`ItemRetainer` giới hạn các đơn vị logic có thứ tự**. Công cụ tìm kiếm có thể thu thập toàn bộ tập kết quả để phục vụ khôi phục từ file spill, đồng thời chỉ giữ lại `maxItems` mục đầu tiên cho bản xem trước hướng tới model. Vì bên gọi tiếp tục đưa vào mỗi mục đã quan sát được, nên số lượng bị bỏ qua là chính xác.
- **`TextRetainer` giới hạn văn bản hướng byte**. `head`, `tail` và `headTail` giữ đúng ranh giới UTF-8 khi `finish()`; `headTail` là dạng mà `dsh-spill-policy` dùng để xây dựng bản xem trước có giới hạn xung quanh thông báo file spill.

## `truncated` là sự thật về ngân sách (budget), tuyệt đối không có nghĩa là "không đầy đủ"

`truncated` biểu thị *retainer đã bỏ qua nội dung vốn có thể lấy được, vì giới hạn ngân sách*. Nó **không** biểu thị dữ liệu thượng nguồn không đầy đủ. Lỗi quyền truy cập, bỏ qua file nhị phân, thất bại một phần từ bên cung cấp, ứng viên không đọc được và UTF-8 không hợp lệ được giữ trong các trường thuộc lĩnh vực riêng của công cụ, không bao giờ hợp nhất vào `truncated`. Việc nhầm lẫn hai khái niệm này là lỗi dễ mắc nhất do cách đặt tên của thư viện gây ra; phải luôn giữ chúng tách biệt.

## Byte, không phải ký tự

Giới hạn văn bản và `omittedBytes` được tính theo **byte**, để đảm bảo an toàn ở cấp tiến trình/nội dung (pipe tiến trình con và body HTTP đều là luồng byte). Các mảnh cắt ngang qua code point được xử lý đúng: `finish()` sẽ cắt bỏ code point không hoàn chỉnh tại mỗi vị trí cắt, để văn bản trả về không bao giờ chèn ký tự thay thế tại ranh giới; hai phía đầu và cuối được giải mã riêng biệt, nên không bao giờ tái tạo code point xuyên qua phần giữa đã bị bỏ qua. Ngân sách bản xem trước giới hạn theo ký tự hoặc dòng thuộc trách nhiệm riêng của công cụ.

## Ánh xạ công cụ

Các bên tiêu thụ cơ chế retention hiện tại dùng ánh xạ sau:

| Công cụ | Retainer và chiến lược | Ghi chú |
|---|---|---|
| `glob` | `ItemRetainer<FsGlobEntry>`, `head` | Thu thập toàn bộ danh sách đường dẫn đã sắp xếp cho file spill, đồng thời giữ trang đầu tiên tại chỗ. Ánh xạ đường dẫn, ứng viên bị bỏ qua và `incomplete` được giữ ở bên ngoài. |
| `grep` | `ItemRetainer<FlatGrepMatch>`, `head` | Thu thập kết quả khớp cho file spill, đồng thời giữ trang đầu tiên tại chỗ. Việc cắt bớt bản xem trước cho từng kết quả khớp, gom nhóm, sắp xếp và `incomplete` được giữ ở bên ngoài. |
| `bash` | `TextRetainer`, `tail` hoặc `headTail` | Bộ thực thi vẫn chịu trách nhiệm về file spill, trạng thái thoát, tín hiệu, timeout và tác vụ nền. |
| `web_fetch` | `TextRetainer`, `head` hoặc `headTail` | Giới hạn của bên cung cấp/tài nguyên vẫn là sự thật thuộc về bên cung cấp; retainer chỉ cung cấp văn bản được giữ lại và metadata bỏ qua. |
| `web_search` | `ItemRetainer<WebSearchSource>`, `head` | Chuẩn hóa thông báo "nguồn đã đạt giới hạn" khi bên cung cấp trả về số nguồn nhiều hơn số kết quả hướng tới model nên bao gồm. |

`read` vẫn không thuộc thư viện chung này. Công cụ hỗ trợ `read-render` của nó chịu trách nhiệm về ước định phân trang chuyên dụng cho file: `offset`/`limit`, số dòng, `totalLines`, lỗi offset vượt giới hạn, cắt bớt bản xem trước theo từng dòng, và giới hạn byte của cửa sổ được chọn. Công cụ hỗ trợ đó là một bộ render cửa sổ dòng. Một số lượng `Omitted` duy nhất không thể biểu diễn cả hai phía của cửa sổ đó.

## Dạng sử dụng

```ts ignore-check
// glob: keep the first page inline while still collecting the full list for spill.
const retainer = new ItemRetainer<FsGlobEntry>({ kind: 'head', maxItems: globMaxResults })
const allEntries: FsGlobEntry[] = []
for await (const entry of candidates) {
  allEntries.push(entry)
  retainer.push(entry)
}
const { items, truncated, omitted } = retainer.finish()

// bash: keep a head + tail, read to process exit.
const out = new TextRetainer({ kind: 'headTail', headBytes: headCap, tailBytes: tailCap })
child.stdout.on('data', (chunk: Buffer) => { out.push(chunk) })
const { text, omittedBytes } = out.finish()

// A footer: the library standardizes the omission clause; the tool owns recovery words.
const footer = formatRetentionNotice(
  { scope: 'grep', strategy: 'head', unit: 'items', limit: grepMaxMatches, kept: items.length, omitted },
  ({ kept }) => `Results capped at ${kept}. Narrow the pattern, path, or include to see more.`,
)
```

## Trải nghiệm model

Ảnh hưởng gián tiếp tới model, thông qua các công cụ tiêu thụ render nội dung được giữ lại và metadata bỏ qua.

#### Ảnh hưởng KV Cache

Không trực tiếp làm mất hiệu lực KV Cache; thay đổi tiền tố request do các bên tiêu thụ nêu trên chịu trách nhiệm.

## Giới hạn đã biết và việc còn hoãn lại

- **Retention cho mục chỉ hỗ trợ `head`**: tail, head/tail, phân trang, gom nhóm và ngữ nghĩa toàn vẹn của bên cung cấp vẫn do công cụ chịu trách nhiệm.
- **Retention văn bản hướng byte**: cửa sổ theo dòng và theo ký tự như phân trang `read` cần bộ render riêng; việc cắt có thể bỏ đi một phần byte thuộc ranh giới UTF-8, để giữ văn bản trả về hợp lệ.
