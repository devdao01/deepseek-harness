# Agent Note: Thẻ nguồn web search chuyển sang cuộn thay vì thu gọn

Status: implemented

[English](2026-08-03-web-search-source-scroll.md) | 中文

## Vấn đề

Thẻ kết quả `web_search` (`WebBlock`, `packages/client/ui-primitives/src/WebBlock.tsx`) trước đây render danh sách nguồn của nó bằng cách thu gọn đầu/cuối: khi vượt số lượng `maxSources` (panel chi tiết là 16, dòng chat qua `CHAT_WEB_MAX_SOURCES` là 8), nó vẽ `ceil(max/2)` nguồn đầu tiên, một nút mở rộng `… và N nguồn khác`, rồi vẽ `max - ceil(max/2)` nguồn cuối, mô phỏng theo cơ chế giới hạn output của `TerminalBlock`. Khi người dùng đọc thẻ này thấy `Danh sách nguồn đã bị cắt bớt`, họ sẽ nghĩ rằng frontend đã loại bỏ những nguồn mà nó đang thực sự giữ.

Thực tế không phải vậy. Seam (`capSources`, `packages/web/web/src/index.ts`) cắt nguồn của provider theo giới hạn `searchMaxResults` của công cụ (mặc định 8) và đặt `truncated`, và chính danh sách đã bị cắt một lần này vừa đưa vào văn bản render model-visible vừa đưa vào `presentationMeta` của thẻ. Thẻ không bao giờ giữ nhiều nguồn hơn sản phẩm của lần cắt duy nhất đó. Vì vậy, việc thu gọn này lại đang ẩn đi chính những nguồn mà người dùng vốn có quyền xem đầy đủ — và với giới hạn mặc định là 8, giới hạn panel là 16, nó gần như không bao giờ được kích hoạt, chỉ để lại gợi ý `truncated` mà không có gì để mở rộng.

## Quyết định

Nhánh search của `WebBlock` render mọi nguồn nó nhận được vào một `<ol className={css.sources}>` duy nhất, không cắt đầu/cuối, không có nút mở rộng, cũng không có prop `maxSources`. `.sources` (`WebBlock.module.css`) nhận một `max-height` cố định cùng `overflow-y: auto`, nên danh sách dài hơn chiều cao thẻ sẽ cuộn tại chỗ, thay vì kéo giãn thẻ hoặc ẩn dòng. Chiều cao này là một hằng số thiết kế thuộc hình học của thẻ, nên được đặt trong CSS, chứ không phải trong trường cấu hình plugin.

Phía model không đổi: seam vẫn giới hạn nguồn tại `searchMaxResults`, văn bản render model-visible không thay đổi, cờ `truncated` và chỉ báo `Danh sách nguồn đã bị cắt bớt` của nó vẫn được giữ. Thẻ vẽ đầy đủ và có thể cuộn danh sách mà seam tạo ra, thay vì thu gọn phần giữa của nó.

Miễn là downstream của công cụ không viết lại riêng content của kết quả, danh sách này chính là danh sách model đọc được. Các deployment gắn `dsh-spill-policy` sẽ phá vỡ sự tương ứng này với kết quả vượt giới hạn: `tools/post-execute` thay `content` model-visible bằng bản xem trước cộng định vị spill, còn `presentationMeta` vẫn giữ nguyên, nên thẻ vẫn vẽ toàn bộ nguồn trong khi model đọc được một đoạn trích có giới hạn. Vì vậy thỏa ước của thẻ là dựa trên view mà nó nhận được, không phải ngữ cảnh của model.

`CHAT_WEB_MAX_SOURCES` và `DEFAULT_WEB_MAX_SOURCES` của primitive bị loại bỏ: với cơ chế cuộn, dòng chat và panel chi tiết hiển thị cùng một danh sách đầy đủ, chỉ khác nhau ở chiều cao container riêng. `<li value={ordinal}>` vẫn cố định số thứ tự trích dẫn của mỗi nguồn tính từ 1; không còn khoảng gián đoạn do thu gọn gây ra, các số thứ tự này giờ liên tục.

Biến danh sách thành container cuộn cũng biến `padding-left` của nó từ khoảng cách trang trí thành một ràng buộc về tính đúng đắn. Container cuộn cắt bỏ phần tràn theo hướng inline-start và không thể cuộn ngược lại, còn `::marker` căn phải sát mép nội dung, nên số thứ tự rộng hơn padding sẽ âm thầm mất chữ số đầu — với padding 20px ban đầu của danh sách, số thứ tự hai chữ số bị vẽ thành `0.` và `1.`, trong khi lẽ ra phải là `10.` và `11.`. `searchMaxResults` là số nguyên dương không giới hạn trên, nên padding này được đo bằng `em` — tương đối với font của chính danh sách, chính là font mà số thứ tự kế thừa — đủ chỗ cho số thứ tự ba chữ số (`999. ` đo được 2.35em theo font stack của ứng dụng), đồng thời giữ nguyên khoảng cách cũ cho trường hợp một chữ số.

## Các phương án thay thế đã cân nhắc

**Tăng `searchMaxResults` (hoặc bỏ giới hạn trên), để nhiều nguồn hơn cùng đến với cả model và thẻ.** Bị người dùng bác bỏ: cách này thay đổi hành vi phía model (mỗi request đưa vào ngữ cảnh nhiều nguồn hơn, nhiều token hơn), và nới rộng khoảng cách giữa nội dung model đọc được và nội dung thẻ vẽ ra.

**Giữ thu gọn đầu/cuối, chỉ thêm cuộn cho vùng đã mở rộng.** Bị loại bỏ: hai cơ chế chồng lấp cho cùng một mối quan tâm. Một khi toàn bộ danh sách luôn được render, phần số học thu gọn, trạng thái mở/thu gọn và nút bấm đó đều trở nên thừa; chỉ riêng cuộn đã đủ để ràng buộc chiều cao.

**Biến chiều cao cuộn thành trường cấu hình plugin.** Bị loại bỏ: chiều cao này ràng buộc hình học của thẻ trên màn hình, không phải chính sách deployment, nên nó thuộc về `WebBlock.module.css`, cùng nhóm với bo góc, bề mặt và margin đã được cố định ở đó như hình học của thẻ này theo [note frontend thẻ result Web](2026-07-30-web-result-card-frontend.md).

## Hệ quả

Mỗi nguồn mà công cụ trả về luôn tồn tại trong DOM, nên không có nguồn nào trong view bị ẩn sau một tương tác. Bất kể số lượng nguồn, chiều cao thẻ luôn bị giới hạn; danh sách cao hơn container sẽ cuộn tại chỗ. Cái giá phải trả là gợi ý cuộn phụ thuộc vào cách nền tảng render thanh cuộn: hệ thống thanh cuộn overlay (mặc định trên macOS) không hiển thị thanh cuộn thường trú khi con trỏ rời đi, nên danh sách bị giới hạn chiều cao dựa vào gợi ý `Danh sách nguồn đã bị cắt bớt` cộng với dòng cuối bị cắt để cho thấy còn nhiều nội dung hơn. `WebSearchBlockProps`/`WebFetchBlockProps` mất prop `maxSources`, primitive mất `DEFAULT_WEB_MAX_SOURCES`, nên bất kỳ bên gọi nào trong tương lai đều render danh sách đầy đủ ngay từ cấu trúc, thay vì phải truyền một giá trị giới hạn lớn.

## Kiểm thử

`packages/client/ui-primitives/tests/web-block.client.spec.tsx` xóa các ca liên quan đến thu gọn (cắt đầu/cuối, click mở rộng, đánh số phần đuôi bị thu gọn, nút mở rộng không tính vào số thứ tự, chỉ có phần đầu, giới hạn mặc định), và thêm mới: một thẻ có 30 nguồn render đủ 30 `<li>`, không có `[aria-expanded]`, không có `<button>`, mỗi phần tử con của `<ol>` đều là một `<li>` nguồn, và `<li value>` đánh số liên tục từ 1 đến N. `packages/client/ui-tool/tests/web-card.client.spec.tsx` xóa assertion về giới hạn `CHAT_WEB_MAX_SOURCES`; test mở rộng WebRow vẫn assert thẻ hiển thị mọi trường của mỗi nguồn. Test của `packages/web/tool-web` không đổi — phía model không có thay đổi nào.

jsdom không phân giải layout CSS Modules, báo cáo `scrollHeight === clientHeight` cho mọi phần tử, nên nó hoàn toàn không thể chứng kiến việc cuộn này. Hình học được cố định bởi trình duyệt ở trạng thái đã lắp ráp, tại `apps/web/tests/web-search-round.e2e.ts`: double search tất định của nó trả về 12 kết quả từ provider, mỗi kết quả có tiêu đề, đoạn trích dẫn và ngày. Trước tiên, việc này cố định phần cắt bớt của seam theo kiểu đầu-cuối thật trong bản tổ hợp thật — `searchMaxResults` xuất xưởng giữ lại 8 mục, văn bản render model-visible chứa 8 tiêu đề này, không chứa 4 URL bị loại bỏ, và chứa `(Showing the first 8 sources. Refine the query for more.)`, `meta.truncated` là true. Sau đó, một ca nằm sau aria golden mở rộng dòng `web_search`, assert trên `<ol>` của thẻ: 8 `<li>`, không có `<button>` ở bất kỳ đâu trong thẻ, chỉ báo `Danh sách nguồn đã bị cắt bớt` hiển thị, và style tính toán `max-height: 320px` cùng `overflow-y: auto`, `scrollHeight` là 574, `clientHeight` là 320. Một ca nữa sau đó đo độ rộng số thứ tự `999. ` theo font mà chính danh sách kế thừa, yêu cầu `padding-left` đã tính toán không nhỏ hơn độ rộng đó, nhờ vậy cố định khoảng không gian số thứ tự mà container cuộn không thể cuộn ngược lại theo số thứ tự rộng nhất, chứ không phải theo số lượng nguồn của một fixture (dữ liệu chuẩn bị trước cho test) cụ thể nào. Luồng model đã ghi lại và aria golden đều không thay đổi: phát lại là một con trỏ vị trí trên các mục `assistant/chunk` trong fixture, còn double search là một endpoint cục bộ khác mà provider đến qua `fetch`; tại thời điểm capture, thẻ ở trạng thái thu gọn, `<ol>` của nó không nằm trong DOM, và dòng tóm tắt cũng không mang số lượng nguồn.

## Tài liệu liên quan

- [Web result card](2026-07-30-web-result-card.md) — nhánh ý định render `card: 'web'` và định tuyến `presentationMeta` mà thẻ này tiêu thụ; nguồn gốc của danh sách đã bị cắt một lần đó.
- [Frontend thẻ result Web](2026-07-30-web-result-card-frontend.md) — `WebBlock`, phần suy ra `web-card-model` duy nhất, và các điểm render vẽ ra thẻ này đều thuộc sở hữu của note đó; note này thay thế phần thu gọn danh sách nguồn mà nó quy định, các quyết định còn lại của nó (một component vẽ hai kind, allowlist liên kết http(s), một phần suy ra duy nhất, tư thế thường trú) vẫn còn hiệu lực.
