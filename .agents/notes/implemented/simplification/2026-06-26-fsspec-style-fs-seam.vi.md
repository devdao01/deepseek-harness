# Agent Note: Tách seam hệ thống tệp — thao tác thay đổi văn bản ở phía provider và plugin `dsh-fs-observation-policy`

Status: implemented

[English](2026-06-26-fsspec-style-fs-seam.md) | Tiếng Việt

## Vấn đề

Năng lực hệ thống tệp trong [seam năng lực hệ thống tệp](../architecture/2026-06-17-filesystem-capability-seam.md) hiện đang để một dịch vụ trừu tượng `FileSystem` cùng lúc gánh hai công việc khác nhau:

1. **Thao tác của provider** — phân giải mục tiêu, metadata stat/phiên bản, đọc văn bản/đọc theo luồng, ghi nguyên tử, và chỉnh sửa theo văn bản nguyên văn có bảo vệ.
2. **Chính sách hướng agent (tác tử)** — cửa sổ dòng, ngữ nghĩa chỉnh sửa nguyên văn, và trạng thái quan sát cho ghi/chỉnh sửa sau khi đọc.

Hệ quả là mọi backend trong tương lai đều phải cài đặt lại ngữ nghĩa đọc hướng mô hình và chính sách quan sát. `readPage` trả về các dòng có đánh số cùng metadata khung nhìn; dịch vụ cơ sở lưu trạng thái tệp theo owner và phân biệt giữa đọc `full` và `partial`. Đó là những chính sách hữu ích, nhưng chúng không phải là nguyên thủy của một provider hệ thống tệp. Thay đổi văn bản nguyên văn thì khác: guard phiên bản, khớp nguyên văn, phát hiện nhập nhằng và ghi đè nguyên tử phải nằm trong vùng thay đổi của provider, nhưng tên gọi `applyEdit` hiện tại cùng seam quanh nó lại trói thao tác provider này vào hình dạng chính sách chỉnh-sửa-sau-khi-đọc cũ.

Điều này còn tạo ra một ngõ cụt trải nghiệm người dùng có thật: đọc theo cửa sổ ghi nhận `view: partial`, mà khung nhìn partial thì không thể ủy quyền cho `edit`. Một mô hình đọc các dòng 100-150 của một tệp lớn, nếu muốn sửa dòng 120 thì phải thực hiện một lần đọc `full` trước, điều có thể bất khả thi với những tệp vượt quá giới hạn đọc. Thực chất chỉnh sửa nguyên văn chỉ cần tính tươi mới: các byte được khớp vẫn phải đến từ đúng phiên bản mà mô hình đã đọc.

Một Agent Note cũ đã hoãn lại gói độc lập `@deepseek-ai/dsh-fs-observation-policy`. Quyết định này xây dựng lớp đó, giữ cho `ctx.fs` gần với các nguyên thủy lưu trữ theo phong cách fsspec (`info`/`cat`/`open`), nhưng không biến nó thành một fsspec đầy đủ.

## Quyết định

Tách ngăn xếp thành bốn lớp:

```text
tool          dsh-tool-fs       model-facing schemas + read windowing + text rendering; the EXECUTOR (reads/writes/edits via ctx.fs, dispatches the fs/* events)
policy        dsh-fs-observation-policy  observed-state + read-before-edit + write/edit freshness, contributed through the fs/* event gate (no service)
provider contract dsh-fs            ctx.fs: text IO + atomic mutation primitives (optional version guard)
provider      dsh-fs-local      local implementation of ctx.fs
```

`dsh-tool-fs` giữ nguyên các schema `read`/`write`/`edit` hướng mô hình. Nó là bộ thực thi: inject `fs` (không phải dịch vụ chính sách) và truy cập trực tiếp `ctx.fs`, sở hữu logic cửa sổ đọc, và phát các sự kiện `fs/*` để `dsh-fs-observation-policy` chặn cổng và ghi nhận.

Agent Note này quyết định việc tách bốn lớp, giao ước của provider và chính sách tươi mới. Sau đó, [Agent Note về cổng sự kiện](../architecture/2026-06-26-file-context-as-event-gate.md) tinh chỉnh sự gắn kết công cụ ↔ chính sách: `dsh-fs-observation-policy` là một plugin cổng tham gia qua sự kiện `fs/*`, chứ không phải dịch vụ phương thức `ctx.fileContext`, nên công cụ không gắn với nó ở tầng phương thức; cửa sổ đọc và I/O fs nằm trong `dsh-tool-fs`. Tài liệu này mô tả hình dạng cổng sự kiện đã triển khai; guard phiên bản của provider là tùy chọn (bỏ qua thì thành provider trần vô điều kiện).

## Giao ước của provider

`@deepseek-ai/dsh-fs` thu hẹp lại còn IO văn bản của provider cộng với thay đổi văn bản có bảo vệ:

```ts ignore-check
abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>
abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>
abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>
abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>
abstract writeText(target: FsTarget, content: string, expected: FsWriteIntent, signal?: AbortSignal): Promise<FsWriteOutcome>
abstract editText(target: FsTarget, edit: FsEditRequest, expected: { version: FsVersion }, signal?: AbortSignal): Promise<FsEditOutcome>

interface FsInfo {
  version: FsVersion
  type: 'file' | 'directory' | 'other'
  size?: number
}

type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

`stat` trả về metadata chứ không phải nội dung. `version` là token tươi mới; `type` cho phép bộ thực thi từ chối thư mục/tệp đặc biệt trước khi đọc; `size` cho phép công cụ `read` chọn giữa `readText` và `streamText` mà không cần dò bằng cách để thất bại. `undefined` nghĩa là mục tiêu không tồn tại.

`readText` đọc toàn bộ một tệp văn bản thông thường. `streamText` đọc theo luồng các tệp lớn với cùng ngữ nghĩa văn bản. Hai nguyên thủy provider này đảm nhiệm kiểm tra tệp thường, giải mã UTF-8, từ chối nhị phân/NUL và `FS_NOT_TEXT`; lớp chính sách không bao giờ xử lý byte thô, cũng không cài đặt lại việc giải mã xuyên phân mảnh. `readText` là nguyên thủy cho tệp nhỏ / đọc trực tiếp cả tệp, còn việc đọc tệp lớn hướng mô hình thì dùng `streamText`.

`writeText` ghi nguyên tử bằng tệp tạm + rename, kèm kỳ vọng ghi tường minh. `createIfAbsent` tạo mục tiêu chưa tồn tại, và từ chối với `FS_NOT_OBSERVED` nếu mục tiêu đã tồn tại; đây là đường dẫn dùng khi owner chưa từng đọc trước đó. `replaceIfVersion` chỉ thay thế khi mục tiêu tồn tại với đúng phiên bản đã quan sát; nếu mục tiêu không tồn tại hoặc phiên bản không khớp thì ném `FS_STALE_VERSION`.

`editText` là thay đổi văn bản có bảo vệ ở cấp provider. Khi bật guard, nó trước hết xác minh mục tiêu vẫn tồn tại với `expected.version`, sau đó đọc văn bản hiện tại, áp dụng phép thay thế nguyên văn và ghi nguyên tử. Kiểm tra cũ phải diễn ra trước khi khớp nguyên văn, để một chỉnh sửa dựa trên lần đọc cũ báo `FS_STALE_VERSION` thay vì khớp trên nội dung mới rồi báo `FS_EDIT_NOT_FOUND` hay `FS_AMBIGUOUS_EDIT`. Giữ nguyên thủy này trên giao ước provider bảo toàn khả năng khóa cục bộ của backend, đồng thời cho phép các backend từ xa trong tương lai cài đặt compare-and-edit nguyên bản mà không cần lớp chính sách kéo về cả tệp.

Đây là một seam *lưu trữ văn bản*, được đặt cao hơn nửa bậc so với fsspec cấp byte (`cat`/`open` trả về byte thô) một cách có chủ ý. Giải mã UTF-8, từ chối nhị phân/NUL, ghi cả tệp có bảo vệ và chỉnh sửa văn bản nguyên văn có bảo vệ đều hoàn tất bên trong provider, nhờ đó lớp chính sách không bao giờ chạm byte thô, không cài đặt lại việc giải mã xuyên phân mảnh, và cũng không tách kiểm tra cũ ra khỏi vùng tới hạn của thay đổi. Các khái niệm hướng mô hình vẫn không chìm xuống provider: cửa sổ dòng, dòng có đánh số, phần chân trang được render, lưu trữ trạng thái quan sát đều không rò xuống dưới.

Xóa khỏi `dsh-fs`: `readPage`, `FsExpectation`, `FsView`, `FsStateSource`, `FsReadRequest`, `FsTextLine`, các hằng số dòng/cửa sổ, `formatReadBody` và `WeakMap` observed-state. `applyEdit` được thay bằng nguyên thủy hẹp hơn của provider là `editText`, với giao ước là thay đổi văn bản nguyên văn kèm guard phiên bản, chứ không phải ủy quyền đọc ở lớp chính sách. Mã lỗi `FS_PARTIAL_OBSERVATION` cũng bị gỡ khỏi hệ phân loại `FsErrorCode`: ủy quyền theo tính tươi mới không có phân biệt partial/full, nên không đường dẫn nào ném nó nữa. `FsTargetKey` và `FsVersion` trở thành id mờ đục có branding theo [Agent Note về id branding](../architecture/2026-06-20-branded-ids.md) hiện có.

## Giao ước của chính sách

`@deepseek-ai/dsh-fs-observation-policy` là plugin, không phải dịch vụ: nó không đăng ký khóa `ctx.*` nào, cũng không inject gì. Nó sở hữu chính sách tươi mới cho ghi/chỉnh sửa và observed state — những thứ không nên nằm trên lớp cơ sở provider `FileSystem` (nếu không, backend sandbox/từ xa sẽ thừa hưởng chính sách quan sát hướng mô hình mà lẽ ra chúng không phải gánh). Nó đóng góp chính sách đó thông qua cổng sự kiện `fs/*` do bộ thực thi phát ra.

Trạng thái quan sát nằm ở đây dưới dạng `WeakMap<owner, Map<targetKey, FsVersion>>`. Một mục chỉ tồn tại khi và chỉ khi owner đã đọc, ghi hoặc chỉnh sửa mục tiêu đó (mỗi lần thành công đều phát `fs/observed`), nên sự tồn tại của mục *chính là* bản ghi về lần quan sát trước đó — không có cờ `hasRead` riêng. Owner được dẫn xuất theo cấu trúc từ actor mờ đục của sự kiện (`{ agent?: { session? } }`), và hình dạng này được định nghĩa trong `dsh-fs-observation-policy` chứ không phải trong `dsh-fs`.

Plugin quyết định ba sự kiện `fs/*`:

- `fs/write-intent` — chưa có quan sát trước ⇒ `{ kind: 'createIfAbsent' }` (chỉ tệp mới mới được tạo mù); đã có quan sát trước ⇒ `{ kind: 'replaceIfVersion', version: vObserved }` (tệp đã tồn tại chỉ được thay thế nếu chưa đổi kể từ lần quan sát). Quyết định một khe duy nhất; không gọi `next()`.
- `fs/edit-intent` — yêu cầu owner đã có quan sát trước (nếu không thì `FS_NOT_OBSERVED`); trả về `{ version: vObserved }` làm cơ sở CAS. Nó không cài đặt phép thay thế nguyên văn — nó ủy quyền và cung cấp phiên bản, còn vùng tới hạn thay đổi của provider chịu trách nhiệm áp dụng guard, nhờ vậy các chỉnh sửa đồng thời dựa trên cùng một phiên bản quan sát vẫn có một cái thành công và cái kia thất bại vì phiên bản đã cũ.
- `fs/observed` — sau mỗi lần đọc/ghi/chỉnh sửa thành công, ghi lại `{ version }` cho cặp owner+target đó. Là một `WeakMap.set` đồng bộ, chỉ có tác dụng phụ.

Plugin không thực hiện bất kỳ I/O hệ thống tệp nào: «bạn đã quan sát tệp này chưa?» là một lần tra cứu `WeakMap`, còn «phiên bản bạn đã đọc có còn là phiên bản hiện tại không?» được quyết định bên trong `ctx.fs.editText`/`writeText`, trong cùng khóa nguyên tử thực hiện thay đổi — plugin chỉ cung cấp `vObserved` làm cơ sở.

## Giao ước của công cụ

`dsh-tool-fs` giữ nguyên schema và bề mặt prompt. `read` vẫn phơi bày `file_path`, `offset` và `limit`; `write` và `edit` không đổi. Nó là bộ thực thi: xác thực tham số của mô hình, đọc/ghi/chỉnh sửa trực tiếp qua `ctx.fs`, sở hữu việc chia cửa sổ dòng và render kết quả (`N: text`, chân trang, bao gói `<path>/<content>`), và phát các sự kiện `fs/*`.

Mỗi thao tác thay đổi trước hết phát waterfall intent của nó (sự kiện kiểu thác nước), với giá trị mặc định provider trần là `undefined`, rồi gọi `ctx.fs`, rồi phát `fs/observed`. Ví dụ `write` thực hiện `ctx.waterfall('fs/write-intent', target, exec, () => undefined)` → `ctx.fs.writeText(target, content, intent)` → `ctx.emit('fs/observed', …)`. `read` thì stat một lần, sau đó đọc/đọc theo luồng, dựng cửa sổ, và cuối cùng phát `fs/observed`. Việc truyền `exec` làm actor cho phép `dsh-fs-observation-policy` dẫn xuất owner mà không cần công cụ đi sâu vào chính sách.

Vì chính sách đóng góp qua sự kiện có giá trị mặc định `undefined`, `dsh-tool-fs` không gắn kết ở tầng phương thức với `dsh-fs-observation-policy`: khi vắng plugin, mọi waterfall intent đều rơi về `undefined` (ghi/chỉnh sửa bằng provider trần vô điều kiện) và `fs/observed` không có listener nào. Nạp plugin vào là chồng thêm được chính sách ghi/chỉnh-sửa-sau-khi-đọc.

## Ranh giới đồng thời

Cập nhật trong cùng tiến trình là an toàn: backend cục bộ giữ khóa thay đổi theo mục tiêu như trước, nên chuỗi kiểm tra phiên bản rồi rename được tuần tự hóa, và các cập nhật thất bại sẽ thấy `FS_STALE_VERSION`.

Việc tạo mới trong cùng tiến trình được bảo vệ bởi chính khóa thay đổi theo mục tiêu đó: khi hai bên gọi cùng tranh chấp bằng `createIfAbsent`, chúng được tuần tự hóa, một bên tạo thành công, bên kia thấy mục tiêu đã tồn tại và nhận `FS_NOT_OBSERVED`. Việc tạo mới xuyên tiến trình chỉ là nỗ lực tốt nhất có thể; guard stat-rồi-rename cục bộ không thể đảm bảo tạo độc quyền một cách khả chuyển trên mọi backend tương lai.

Ghi xuyên tiến trình là tính tươi mới nỗ lực tối đa cộng với thay thế nguyên tử: `mtime:size` thường bắt được các lần lưu của trình soạn thảo, nhưng có thể không phát hiện được lần ghi cùng tick với kích thước không đổi; temp+rename nguyên tử ngăn tệp bị rách nhưng không ngăn được mọi trường hợp mất cập nhật.

## Thay thế

Agent Note này lật lại hai quyết định trong [seam năng lực hệ thống tệp](../architecture/2026-06-17-filesystem-capability-seam.md) và thu hẹp một quyết định thứ ba:

- Chính sách ghi/chỉnh-sửa-sau-khi-đọc chuyển ra khỏi `ctx.fs`, sang plugin `dsh-fs-observation-policy` (chặn cổng qua sự kiện `fs/*`).
- Đọc văn bản không còn trả về bản ghi dòng có đánh số từ backend hay khung nhìn `full`/`partial`; việc ủy quyền dựa trên tính tươi mới của phiên bản, nên đọc theo cửa sổ vẫn có thể ủy quyền chỉnh sửa khi tệp chưa đổi.
- Chỉnh sửa nguyên văn không còn nằm sau API `applyEdit` cũ (API vốn trộn lẫn thay đổi ở backend với chính sách quan sát do seam sở hữu). Nó vẫn là nguyên thủy của provider dưới tên `editText`, vì guard phiên bản + khớp nguyên văn + ghi đè nguyên tử buộc phải nằm trong vùng tới hạn thay đổi của provider.

Những gì được giữ lại: kỷ luật Service Definition / Service Provider / Consumer, bên tiêu thụ không import quy tắc của backend, metadata target/version/display do backend định nghĩa, ghi cục bộ nguyên tử, và hệ phân loại `FsError` dùng chung.

## Kiểm chứng

`dsh-fs` phơi bày đúng `resolve`/`stat`/`readText`/`streamText`/`writeText`/`editText` (với `stat` trả về `FsInfo | undefined`, `writeText` nhận `FsWriteIntent`), và các kiểu/nguyên thủy đã xóa không còn tồn tại; `dsh-fs-local` không chứa logic dòng, khung nhìn hay `formatReadBody`; schema hướng mô hình giữ nguyên từng byte. Các bài kiểm thử cố định những hành vi sau: đọc theo cửa sổ ủy quyền cho các chỉnh sửa tiếp theo trên tệp chưa đổi; chỉnh sửa dựa trên lần đọc cũ báo `FS_STALE_VERSION` trước khi thử khớp nguyên văn; hành vi CAS theo phiên bản được bảo toàn; giao ước quan sát thành lập (lần đọc qua công cụ `read` ghi nhận trạng thái quan sát; đọc trực tiếp qua `ctx.fs` thì không); `dsh-fs-observation-policy` có kiểm thử bao phủ HMR (thay thế module nóng)/dispose (giải phóng tài nguyên).

## Mở rộng về sau

Về sau, [bổ sung liệt kê thư mục trực tiếp cho seam hệ thống tệp](../../archived/architecture/2026-07-03-filesystem-directory-listing-seam.md) tiếp tục mở rộng seam này. Công việc tiếp nối đó được ghi chép riêng, để tài liệu này tiếp tục mô tả đúng phần cải tổ theo phong cách fsspec đã triển khai ban đầu.

## Các phương án đã cân nhắc

- **fsspec cấp byte (`cat`/`open` trả về byte thô)**: bác bỏ. Seam này được định vị có chủ ý là lưu trữ văn bản, cao hơn nửa bậc so với cấp byte, nhờ vậy giải mã UTF-8, từ chối nhị phân/NUL và thay đổi văn bản có bảo vệ chỉ được cài đặt một lần ở provider, còn lớp chính sách không bao giờ chạm byte thô và cũng không tách kiểm tra cũ ra khỏi vùng tới hạn của thay đổi.
- **Dịch vụ phương thức cụ thể `ctx.fileContext`** — hình dạng chính sách ban đầu của Agent Note này; [Agent Note về cổng sự kiện](../architecture/2026-06-26-file-context-as-event-gate.md) đã làm lại nó thành plugin cổng, để công cụ không bao giờ gắn kết với chính sách ở tầng phương thức.
- **Giữ `readPage` và ủy quyền theo khung nhìn `full`/`partial` ở provider**: chính là hình thái trước tái cấu trúc mà mục «Thay thế» đã đảo ngược. Tính toàn vẹn của khung nhìn không phải điều kiện cần cho an toàn chỉnh sửa, tính tươi mới của phiên bản mới là; trong khi quy tắc khung nhìn khiến các tệp lớn vượt giới hạn đọc không thể chỉnh sửa được.

## Hệ quả

- Thêm một gói fs thứ tư và một lớp plugin mới. Đây là chủ ý: nó chính là lớp chính sách đã bị hoãn trước đây, chứ không phải một giao ước backend trừu tượng thứ hai.
- Dùng trực tiếp `ctx.fs` sẽ đi vòng qua chính sách: `ctx.fs.readText` trực tiếp không phát `fs/observed`, nên với chính sách mặc định, lần `edit` tiếp theo sẽ bị từ chối với `FS_NOT_OBSERVED` cho tới khi tệp được đọc qua công cụ `read`. Thất bại này là tường minh và có ghi tài liệu.
- Việc chia cửa sổ dòng cho tệp lớn chuyển từ backend sang công cụ `read` trong `dsh-tool-fs`; giải mã văn bản và từ chối nhị phân vẫn nằm trong `ctx.fs.streamText`, nên đây chỉ là việc di chuyển logic cửa sổ, không phải một bản cài đặt IO văn bản thứ hai.
- Giữ `editText` trên giao ước provider nghĩa là mọi backend đều phải cài đặt giao ước thay thế nguyên văn. Đây là chủ ý: thao tác này không thuần lưu trữ, nhưng guard cũ + khớp nguyên văn + ghi đè nguyên tử là một đơn vị buộc phải đi cùng nhau để đảm bảo quy thuộc lỗi đúng và hành vi đồng thời đúng. Giao ước này nên giữ hẹp và chỉ dành cho văn bản, để backend tương lai có thể cài đặt nguyên bản hoặc thông qua ghi đè cả tệp.
- Tính tươi mới cho phép `write` cả tệp sau một lần đọc theo cửa sổ. Điều này yếu hơn kiểm tra khung nhìn cũ, nhưng tránh được vấn đề tệp lớn không thể chỉnh sửa; phần hướng dẫn trong prompt vẫn không khuyến khích thay thế cả tệp một cách mù quáng.
