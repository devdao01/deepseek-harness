# Agent Note: Thay bộ chuyển HTML sang markdown bằng regex của tool-web bằng turndown

Status: implemented
Archived: 2026-08-07

[English](2026-07-26-turndown-for-tool-web-html-markdown.md) | Tiếng Việt

## Vấn đề

File `src/html.ts` của `dsh-tool-web` (khoảng 86 dòng, kèm khoảng 40 dòng kiểm thử riêng; đã bị xóa trong thay đổi này) từng dùng biểu thức chính quy để chuyển HTML lấy về thành markdown: bóc thẻ script, style, noscript cùng chú thích, chuyển đổi `<a>`/`<h1-6>`/`<li>`, giải mã thực thể dạng số cộng với một bảng 12 mục thực thể có tên, và gộp khoảng trắng. JSDoc của chính module đó đã ghi rõ "A richer converter can replace it without changing the seam or tool schema", và mục Known Limitations trong README cũng ghi nhận nó là "a minimal regex converter, not an HTML parser — tables, images, and nested formatting are lost". [Ghi chép quyết định về web capability seam](../architecture/2026-06-24-web-capability-seam.md) xếp việc chuyển HTML sang markdown vào trách nhiệm trình bày của gói này, nên điểm thay thế nằm đúng ở đây. Trên mỗi trang HTML lấy về, đầu ra của bộ chuyển này đều hiển thị với mô hình; trước đó không có snapshot không cần khóa nào chạy tới `web_fetch`, nên không có đầu ra kỳ vọng nào cố định hành vi của nó.

## Quyết định

`packages/web/tool-web/src/fetch.ts` giữ một thực thể [`turndown`](https://github.com/mixmark-io/turndown) ở mức module (`headingStyle: 'atx'`, `codeBlockStyle: 'fenced'`, `bulletListMarker: '-'` — cách trình bày cố định hướng tới mô hình, không phải mục tinh chỉnh theo triển khai), kết hợp plugin `gfm` tổ hợp của `@joplin/turndown-plugin-gfm` để hỗ trợ bảng/gạch ngang, và dùng `remove(['script', 'style', 'noscript'])` thay cho việc bóc toàn cục của hiện thực cũ. `formatFetchOutput` dùng `fetchMaxOutputChars` (mặc định 200.000) để đồng thời giới hạn tiền tố nguồn được chuyển đổi đồng bộ lẫn toàn bộ đầu ra đã render, nên provider tùy chỉnh không thể gây ra khối lượng chuyển đổi vô hạn trước khi giới hạn đầu ra có hiệu lực. Sau đó, nhánh HTML bảo vệ kép cho việc chuyển đổi: một lượt quét từ vựng tuyến tính, thận trọng sẽ xử lý dè dặt nội dung chú thích, bỏ qua nội dung của phần tử raw text, xử lý đúng phần văn bản trong dấu nháy bên trong thẻ, và khi độ sâu ngăn xếp vượt 512 lớp thì truyền thẳng thân trang dưới dạng HTML thô; khi turndown từ chối phần đánh dấu mà bộ bảo vệ không mô hình hóa được thì try/catch cũng lùi về HTML thô. Quy tắc ô của GFM bị ghi đè để bỏ qua `colspan`; Markdown không biểu diễn được nó, và điều này cũng tránh việc thuộc tính số không đáng tin cậy dựng khống ra số lượng ô trống tùy ý. `html.ts` cùng các bài kiểm thử chuyển đổi của nó đã bị xóa; giới hạn nguồn/đầu ra, phương án lùi, cùng việc định dạng header trạng thái/footer cắt cụt đều được kiểm thử bao phủ trong `tests/tool-web.spec.ts`, và mục Known Limitations của README thay cảnh báo về bộ chuyển regex bằng các tình huống suy giảm có chặn. Plugin gfm không kèm khai báo kiểu; `src/turndown-plugin-gfm.d.ts` khai báo export duy nhất được import, dựa trên `@types/turndown` (devDependency).

Phán quyết về vấn đề kích thước dependency mà đề xuất nêu ra ủng hộ việc thay thế: `@deepseek-ai/dsh-tool-web` nằm trong closure của file thực thi đơn ([ghi chép quyết định single-exe](../architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.md)), và glob tài nguyên của file thực thi sẽ đóng gói ba gói này theo đúng bản phát hành, khoảng 7,9 MB — nhưng trong đó khoảng 6 MB là kho ngữ liệu kiểm thử của `@mixmark-io/domino` (`test/**`), phần `lib/` chạy thực tế chỉ khoảng 550 KB, và so với sản phẩm khoảng 174 MB thì cả hai cách tính đều dưới 0,5%.

## Độ phủ snapshot

Snapshot `web_fetch` không cần khóa vốn còn thiếu nay được đưa vào cùng thay đổi này dưới dạng kịch bản `web-fetch` của acp-agent: `examples/acp-agent/web.cordis.yml` tổ hợp web seam, provider thật `dsh-web-fetch-local`, `tool-web` với `search: false`, và `web-fetch-fixture-server.mjs` — một fixture HTTP loopback (dữ liệu chuẩn bị cho kiểm thử) chạy trên cổng cố định (URL được fetch là một phần của transcript được ghi lại), phục vụ HTML tất định có chứa thực thể có tên, bảng GFM và định dạng lồng nhau. Cả lúc ghi lẫn lúc phát lại không cần khóa đều điều khiển việc fetch HTTP và chuyển đổi thật; kết quả công cụ được cố định chính là đầu ra của turndown, và kịch bản này đồng thời cố định lớp header `web` (schema và hướng dẫn của `web_fetch`).

## Các phương án đã cân nhắc

- **`@mozilla/readability` cộng một DOM.** Nó giải một bài toán khác (trích xuất nội dung, không phải chuyển đổi định dạng), lại kéo theo dependency DOM nặng hơn; seam này chỉ yêu cầu render nội dung fetch về thành markdown.
- **Giữ bộ chuyển regex.** Theo chính JSDoc của nó, đây vốn là hiện thực tạm thời v1 đã nêu rõ; giữ nó đồng nghĩa với việc chất lượng hiển thị với mô hình (bảng, ảnh, định dạng lồng nhau) tiếp tục thiếu, mà cái giá vẫn là bảo trì một bảng thực thể tự chế.
- **Chỉ đưa vào biến thể tối thiểu dùng `entities`.** Đây là phương án lùi trong đề xuất: chỉ thay phần giải mã thực thể trong `html.ts` bằng gói `entities` không dependency, xóa được ít hơn nhưng né hoàn toàn vấn đề kích thước dependency. Không chọn: phép đo closure ở trên cho thấy kích thước không đáng kể, còn thay thế trọn vẹn thì xóa được cả bộ chuyển viết tay lẫn khoảng trống chất lượng đã ghi nhận của nó.
- **Dùng bản gốc `turndown-plugin-gfm` thay vì `@joplin/turndown-plugin-gfm`.** Bản gốc đã không còn ai bảo trì (phát hành lần cuối năm 2018); nhánh rẽ của Joplin bám sát turndown 7 và phát hành liên tục.

## Hệ quả

- **Lợi ích**: markdown hiển thị với mô hình dựa trên chuẩn — bảng thường, ảnh, gạch ngang, nhấn mạnh lồng nhau, khối mã fence và bộ thực thể có tên đầy đủ — đồng thời xóa bỏ bộ chuyển tự chế cùng bảng thực thể của nó.
- **Chi phí**: hai dependency runtime (`turndown` → `@mixmark-io/domino`) đi vào tool-web rồi vào closure của file thực thi (đo được khoảng 550 KB mã chạy như trên); đầu vào quá dài chỉ được chuyển đổi phần tiền tố có chặn, lồng nhau bệnh lý lùi về HTML thô, và ô bảng trải nhiều cột bị làm phẳng vì GFM không có cú pháp tương ứng.
- Đầu ra hiển thị với mô hình trên mỗi trang HTML lấy về đều đã thay đổi; đầu ra cũ vốn không được cố định ở đâu cả, còn snapshot mới cố định đầu ra mới.

## Kiểm thử

- `packages/web/tool-web/tests/tool-web.spec.ts` bao phủ mặt chuyển đổi của turndown (thực thể, liên kết, bảng, lồng nhau, loại bỏ script/style/noscript), ô bảng trải cột bị bỏ qua, giới hạn tiền tố nguồn và toàn bộ đầu ra, việc truyền thẳng nhanh HTML thô khi lồng sâu hoặc có thẻ đóng đánh lừa, xử lý tuyến tính với thẻ dị dạng, phương án lùi khi bộ chuyển còn ném lỗi, cùng các trường hợp ngân sách đầu ra vừa đúng giới hạn và cực nhỏ; độ phủ theo từng file của src trong gói này là 100%.
- Snapshot `web-fetch` của acp-agent cố định hành vi sau khi lắp ráp từ đầu tới cuối mà không cần khóa (tổ hợp Loader thật, fetch HTTP thật, chuyển đổi thật).
