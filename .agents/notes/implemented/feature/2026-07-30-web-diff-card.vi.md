# Agent Note: Thẻ diff của Web — ý định render (render intent) của write/edit đến được trình duyệt

Status: implemented

[English](2026-07-30-web-diff-card.md) | Tiếng Việt

## Problem

Công cụ `write` và `edit` khai báo `card: 'diff'` cho cả call lẫn result của chúng ([render-intent union](../architecture/2026-07-02-tool-render-intent-union.md)): view của call mang theo thay đổi dự kiến suy ra từ tham số, view của result mang theo các hunk ngữ cảnh đã áp dụng (`FileDiff[]`, được tính bởi `packages/fs/tool-fs/src/diff.ts` và lưu bền trong `meta` của result để phục vụ dựng lại khi phát lại). View này từ lâu đã đến được trình duyệt — host, connection, runtime đưa nó dưới dạng `callView`/`resultView` vào `ConversationSnapshot` — TUI cũng đã render nó thành các khối `+`/`-` gom theo tệp cộng với footer `+A -R · N file(s)`.

Web client bỏ qua nó. Lời gọi write/edit rơi vào `GenericToolCard`, dòng của nó được suy ra từ tham số thô của công cụ, còn panel chi tiết thì làm phẳng content block của result thành một `<pre>`. Payload `diffs` — toàn bộ ý nghĩa của result — bị vứt bỏ, khiến một lần thay đổi tệp chỉ đọc được như một dòng xác nhận, không thấy bất kỳ thay đổi nào.

Đây là việc làm lại nhánh `diff` của [thẻ terminal](2026-07-28-web-terminal-card.md): thay đổi đó biến Web client thành một consumer của render intent `terminal`; lần này biến nó thành consumer của render intent `diff`, tái sử dụng cùng cấu trúc bốn tầng.

## Decision

`DiffBlock` là một component của `ui-primitives`, render thay đổi tệp thành một bề mặt diff nội tuyến (inline); cả hai điểm render Web của lời gọi write/edit đều tiêu thụ render intent diff thông qua nó: phần thân dòng công cụ trong chat và khu vực Output của panel chi tiết. `ui-tool/src/client/tool/models/diff-card-model.ts` là nơi duy nhất chuyển cặp `callView`/`resultView` của snapshot thành props của component, nên hai điểm render không thể lệch nhau về cùng một thay đổi. Khi cả hai phía đều không khai báo `card: 'diff'`, nó trả về null — đi theo đường chung — bao gồm cả giá trị `card` mà phiên bản client này không nhận ra, và trường hợp result view của một lời gọi đã kết toán là generic (lỗi thực thi của write/edit đúng là được để lại trên đường chung theo cách đó). Sau khi lời gọi kết toán, phía result là quyền hạn tối thượng: hunk đã áp dụng thay thế diff của call vốn chỉ suy ra từ tham số. Cửa sổ phân trang có bỏ header của call thì vẫn render được, vì result view mang theo toàn bộ thay đổi.

Component này dùng chung khung một cột, quy tắc kết thúc dòng, và cách đếm đường dẫn khử trùng lặp với TUI. Cách phân loại dòng của hai bên khác nhau: Web render đầy đủ cả hai phía trước/sau của thay đổi, còn TUI thì suy ra ngữ cảnh trung tính và các dòng thay đổi chính xác khi so sánh có giới hạn hoàn tất, và đánh dấu toàn bộ một phía bị rollback là kết quả gần đúng.

- **Gom theo đường dẫn.** Một tệp mới mở ra một header đường dẫn in đậm; hunk thứ hai của cùng một tệp (chỉnh sửa rải rác, hoặc `replace_all`) mở đầu bằng một khoảng trống `⋯`, thay vì lặp lại đường dẫn. TUI giữ header đường dẫn ở mỗi hunk, nhưng footer `N file(s)` của cả hai frontend đều đếm theo đường dẫn đã khử trùng lặp, nên hai hunk của cùng một tệp đọc thành `1 file` ở cả hai đầu.
- **Tô màu toàn phía thay đổi.** Mỗi dòng ở phía cũ hiển thị với `- ` trên token error, mỗi dòng ở phía mới hiển thị với `+ ` trên token success, và được vẽ từng ký tự trong một hộp cuộn ngang với `white-space: pre`: dòng mã nguồn được đọc dựa vào thụt lề, nên cuộn thay vì xuống dòng. Tệp mới tạo (`oldText: null`) không có phía xóa.
- **Giới hạn chiều cao kèm nút mở rộng.** Diff dài hơn `DEFAULT_DIFF_MAX_LINES` (16) hiển thị `ceil(max/2)` dòng đầu cộng các dòng cuối còn lại, ở giữa là một nút báo số dòng đang ẩn. Phép chia toán học này khớp với `TerminalBlock` và thẻ gấp của TUI, nên lát cắt đầu/cuối của diff dài nhất quán ở cả hai frontend.
- **Ký tự kết thúc dòng.** Nội dung mỗi phía được cắt theo `\n` theo cùng quy tắc kết thúc dòng mà `TerminalBlock` và TUI dùng chung: văn bản rỗng là không dòng nào (`newText` của việc xóa toàn bộ tệp, phía `oldText` bị thiếu khi tạo mới), một dấu xuống dòng cuối duy nhất kết thúc dòng cuối cùng của nó thay vì thêm một dòng trống ảo, dòng trống bên trong được giữ nguyên.
- **Footer và sao chép.** Footer màu tối `└ +A -R · N file(s)` báo số dòng đầy đủ ở cả phía mới và phía cũ của thẻ Web. Footer của TUI thì báo số dòng thay đổi chính xác khi có thể, và đánh dấu việc rollback toàn phía có giới hạn là kết quả gần đúng; cả hai dùng chung cách đếm đường dẫn đã khử trùng lặp. Control sao chép sao chép văn bản diff của Web kèm tiền tố (header đường dẫn, dòng `- `/`+ `, khoảng trống `⋯`), giúp việc sao chép nhiều tệp vẫn phân biệt được nguồn gốc.

Hình học, bo góc, font chữ phản chiếu `CodeBlock`/`TerminalBlock`, để thẻ diff, thẻ terminal và code block đọc như cùng một họ; `white-space: pre` cộng cuộn ngang là điểm khác biệt có chủ đích. Control sao chép nổi ở góc trên bên phải của thẻ, thay vì chiếm riêng một dòng banner, vì một banner chỉ để chứa một nút sao chép sẽ vẽ ra một dải trống phía trên dòng diff đầu tiên — thẻ diff của TUI cũng không có banner, chỉ có footer.

Dòng chat render diff thường trực bên dưới dòng tóm tắt liên kết đường dẫn, với giới hạn `CHAT_DIFF_MAX_LINES` (8), tương ứng với 16 của panel — nhất quán với quyết định [output nội tuyến](2026-07-28-web-terminal-card.md#inline-output-in-the-chat-row-reverses-a-stated-convention) đã ghi lại của thẻ terminal, và cùng một cách phân chia giữa bề mặt trong luồng và bề mặt để đọc. Dòng write/edit là đơn tệp, nên tóm tắt của nó vừa là một liên kết đường dẫn có thể mở, vừa có thẻ diff mở rộng; cả hai cùng tồn tại vì thẻ không phải là tham số thân của đường dẫn.

## Alternatives considered

**Diff song song (hai cột).** Hiện owner từ chối: nó đặc hơn nhưng không phù hợp với dòng chat hẹp, mục tiêu là thống nhất hình thức một cột với TUI. Chế độ hai cột trong panel chi tiết là một thay đổi props sau này, không phải một thiết kế lại.

**Rãnh số dòng kiểu git.** Ước định (convention) `FileDiff` chỉ mang `{ path, oldText, newText }` — dòng bắt đầu hunk của `structuredPatch` bị bỏ trong `diff.ts`, nên không có số dòng nào đến được client. Render rãnh số dòng cần thay đổi ước định backend (mang theo `oldStart`/`newStart`) và nâng cấp đồng bộ TUI để giữ nhất quán; việc này được hoãn lại, giữ cho thay đổi này thuần túy là việc Web tiêu thụ ước định đã có sẵn.

**Tái sử dụng `CodeBlock`.** Bị từ chối vì cùng lý do với thẻ terminal: `CodeBlock` sẽ xuống dòng, và không có vai trò `+`/`-` cho từng dòng, không có header đường dẫn, không có footer. Hai bên dùng chung token hình học và font chữ, đó là phần duy nhất mà một implementation đúng cho cả hai.

## Consequences

`DiffBlock` chỉ đọc các trường của diff view, nên nó là hàm thuần của những gì render intent mang theo — an toàn khi phát lại giống như presenter tạo ra view đó. UI không có khả năng diff vẫn nhận được fallback chung của bridge; hình dạng result của công cụ không thay đổi gì. Không có dependency runtime mới: khác với `anser` của thẻ terminal, diff không cần bộ phân tích cú pháp (parser).

Nhánh nhiều tệp của `DiffBlock` (một thẻ, nhiều header đường dẫn) hiện chưa có producer nào: mỗi lần gọi `write`/`edit` chỉ thay đổi một tệp, nên thẻ thật hiển thị một tệp với một hoặc nhiều hunk. Nhánh này được xây dựng và kiểm thử cho các công cụ thay đổi nhiều tệp trong tương lai, không phải cho consumer hiện tại.

## Testing

`packages/client/ui-primitives/tests/diff-block.client.spec.tsx` chốt component: nhánh tạo mới (chỉ thêm, không có phía xóa), nhánh chỉnh sửa (xóa nằm trên thêm), khoảng trống `⋯` của cùng một tệp so với header của tệp mới, render null khi diffs rỗng, đếm footer và số ít/số nhiều của nó, giới hạn đầu/cuối và chuyển đổi `aria-expanded` của nó, và control sao chép khẳng định văn bản diff có tiền tố trên cả hai đường clipboard chấp nhận và từ chối. Per-file 100%.

`packages/client/ui-tool/tests/diff-card.client.spec.tsx` chốt việc đấu nối (wiring) của từng điểm render: phái sinh của `diffCardModel` và từng nhánh null của nó, hunk của result thay thế diff của call, call bị cắt bởi cửa sổ vẫn render từ result, phần thân diff của dòng chat, thẻ thường trực của `FileMutationRow` cùng liên kết đường dẫn của nó mở qua host với cwd được resolve, việc đăng ký nó dưới `write` và `edit`, và khu vực Output của panel.

fixture (`packages/client/connection/src/client/fixture.ts`) mang theo ba turn diff, để dịch vụ `?fixture` và bộ test đấu nối theo từng package diễn tập cả ba nhánh ở cả hai điểm render: chỉnh sửa một hunk (turn 62, `FileMutationRow` có key), tạo mới/ghi (turn 63), và chỉnh sửa nhiều hunk (turn 67, khoảng trống `⋯` giữa hai hunk rải rác trong cùng một tệp). Snapshot built-boot (`apps/web/tests/built-boot.snapshot.ts`) là smoke test cho việc lắp ráp khởi động, chỉ khẳng định đồ thị mount và nội dung chat được tới nơi (`data-sample="bash-global"`); theo đúng ước định của nó, nó không mang khẳng định hành vi diff nào, việc đó thuộc về bộ test đấu nối.

## Related

- [Thẻ terminal của Web](2026-07-28-web-terminal-card.md) — cùng cấu trúc bốn tầng cho nhánh `terminal`; note này tái sử dụng quyết định output nội tuyến và toán học giới hạn đầu/cuối của nó.
- [Render-intent union được gắn nhãn cho việc trình bày lời gọi công cụ](../architecture/2026-07-02-tool-render-intent-union.md) — từ vựng nhãn `card` mà thay đổi này tiêu thụ; Web client giờ cũng là consumer của nhánh `diff`.
- [Kiến trúc Web client](../architecture/2026-07-19-gui-web-client-architecture.md) — slot và phân tầng snapshot nơi hai điểm render nằm.
