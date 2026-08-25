# Agent Note: Cổng kiểm tra JSDoc cho export

Status: implemented

[English](2026-07-06-export-jsdoc-gate.md) | Tiếng Việt

## Vấn đề

[Cổng kiểm tra tính đầy đủ JSDoc của Cordis](../../archived/process/2026-07-04-cordis-jsdoc-completeness-gate.md) khiến tham số và giá trị trả về trên các interface Cordis không thể thiếu tài liệu — các thành viên `interface Events` và lớp service `ctx.<key>` — nhưng điều đó chỉ bao phủ một phần nhỏ trong số các interface mà tác giả plugin có thể import. Quy tắc trong AGENTS.md «mọi export (và mọi phương thức không hiển nhiên) đều phải có JSDoc giải thích ngữ nghĩa» ở những chỗ khác vẫn chỉ là một quy ước bằng chữ do người duyệt kiểm tra, và không có cơ chế nào bắt buộc hàm export thông thường phải có `@param`/`@returns`. Một cuộc khảo sát lúc áp dụng đã phát hiện 203 export ở cấp module thiếu tài liệu trong 34 gói: các hàm trợ giúp liên quan tới seam (`runBash`, `readForEdit`, `htmlToMarkdown`), bộ mã hóa/giải mã định dạng, các interface và bí danh kiểu hoàn toàn không có tài liệu — chính là những cái tên mà bên tiêu thụ trong IDE rê chuột lên xem.

## Quyết định

Thêm cổng kiểm tra `scripts/verify-export-jsdoc.ts` (`pnpm run verify-export-jsdoc`, gia nhập `doc-sync` (cổng đồng bộ tài liệu), đứng ngang hàng với `verify-cordis-catalog`), duyệt mọi tên export ở cấp module dưới từng cây thư mục `packages/<group>/<pkg>/src/`. Các hàm trợ giúp phân giải và kiểm tra được chuyển từ `gen-cordis-catalog.ts` sang `scripts/jsdoc.ts` dùng chung, khiến «đã có tài liệu» mang nghĩa nhất quán trên cả hai loại interface: văn bản mô tả kết thúc tại thẻ khối đầu tiên, mỗi tham số kiểm tra được đều cần một `@param` không rỗng, giá trị trả về không phải void và có chú thích tường minh thì cần một `@returns` không rỗng, `@param` lỗi thời sẽ báo lỗi, và các vi phạm được tổng hợp thành một báo cáo.

Quy ước phân theo loại khai báo:

- Mọi tên export đều cần JSDoc có văn bản mô tả không rỗng.
- Export dạng hàm (khai báo hàm; const có initializer là hàm hoặc có chú thích callable nội tuyến; export mặc định là hàm không phải định danh) tuân theo quy ước hàm đầy đủ, và các biểu thức bọc ngoài (dấu ngoặc, ép kiểu `as`/`satisfies`, khẳng định non-null) được bóc bỏ trước khi phân loại. Nếu bộ khai báo const chú thích một kiểu có tên (`export const f: Handler = …`), quy ước chữ ký được hoãn về chính nơi khai báo kiểu đó, `@returns` giữ nguyên tùy chọn; chú thích nội tuyến `(x: T) => U` hoặc literal chỉ có một chữ ký gọi thì tự nó là chữ ký export, áp dụng quy ước đầy đủ; còn literal trộn lẫn chữ ký gọi/khởi tạo với các thành viên khác thì bị từ chối thẳng (không có chữ ký duy nhất nào để đối chiếu thẻ — hãy trích xuất ra một kiểu có tên).
- Lớp export cần văn bản mô tả ở cấp lớp; phương thức công khai (kể cả phương thức tĩnh — truy cập được qua tên export) tuân theo quy ước hàm; thuộc tính và accessor công khai cần văn bản mô tả (cặp get/set do getter bao phủ). Thân của phương thức nạp chồng được miễn — chữ ký mới là nơi mang tài liệu.
- Interface, bí danh kiểu và enum được export cần văn bản mô tả ở cấp khai báo; việc cưỡng chế ở cấp thành viên được hoãn có chủ ý (các lớp service seam mang quy ước then chốt của thành viên vốn đã nằm dưới cổng Cordis).
- Namespace export được kiểm tra đệ quy (trong namespace `declare` ambient, mọi thành viên đều được export ngầm định); bản thân namespace chỉ cần văn bản mô tả khi nó không hợp nhất với một khai báo cùng tên đã có tài liệu (thành ngữ Config-namespace chỉ cần viết tài liệu cho plugin một lần).
- Thân của `declare module`/`declare global` và câu lệnh tái export `export … from` được bỏ qua: augmentation không phải export của gói, còn định nghĩa được tái export thì được kiểm tra tại nơi định nghĩa nó. Bí danh `export import X = N.member` cần tài liệu cho chính nó — đích của nó có thể là một thành viên namespace không export mà việc duyệt sẽ không ghé tới — và cổng chỉ hỗ trợ các kiểu đích thuần văn bản mô tả: đích callable, đích là lớp hoặc namespace mang theo quy ước chữ ký/thành viên mà văn bản mô tả của bí danh không gánh nổi, nên cổng sẽ từ chối và yêu cầu export trực tiếp khai báo đó.
- Mọi trường hợp còn lại mặc định bị từ chối: `export =` bị từ chối thẳng; kể cả khi tham số dùng binding pattern, chừng nào lớp cơ sở chưa đặt tên cho nó thì vẫn cần `@param`; loại câu lệnh export mà dispatch không nhận diện được tự nó đã là vi phạm — không hình thức export nào được miễn kiểm tra nhờ bị bỏ sót.

Ba loại miễn trừ giúp cổng không đòi hỏi mã bản mẫu, tinh thần nhất quán với các miễn trừ `this`/`next` của cổng Cordis (viết tài liệu cho tên đã được miễn trừ vẫn được phép; chỉ có việc thiếu là không bị kiểm tra):

- **Thành viên kế thừa.** Bản ghi đè kế thừa tài liệu từ khai báo ở lớp cơ sở. API công khai mới thêm vẫn cần tài liệu: tham số mới thêm, ghi đè để công khai hóa một thành viên protected, hoặc đổi kiểu trả về void của lớp cơ sở thành kiểu cụ thể. Tra cứu kế thừa và phân loại kiểu trả về suy diễn là phần việc duy nhất của cổng cần tới trình kiểm tra kiểu; các kiểm tra khác dùng AST.
- **Khe của giao thức plugin.** Các hằng `name`/`inject`/`reusable`/`Config` ở cấp cao nhất và điểm vào `apply`, cùng các thành viên tĩnh cùng tên trên lớp plugin, thuộc về giao thức framework: hình thức của chúng do Cordis cố định, còn chú thích tài liệu của module cộng `interface Config` mới mang ngữ nghĩa thực sự của plugin.
- **Hàm khởi tạo**, nhất quán với cổng Cordis: lớp plugin do framework khởi tạo, tài liệu của lớp mang toàn bộ phần diễn giải.

`collectExportJsdocViolations()` trả về danh sách vi phạm (CLI (giao diện dòng lệnh) thoát với mã 1 khi danh sách không rỗng), nên các bài kiểm thử đường-âm trong `packages/core/agent/tests/verify-export-jsdoc.spec.ts` khẳng định trực tiếp các phát hiện, dùng gói fixture (dữ liệu chuẩn bị cho kiểm thử) để dẫn động từng loại từ chối và từng loại miễn trừ.

## Các phương án từng cân nhắc

- **eslint-plugin-jsdoc** (`require-jsdoc`/`require-param`/`require-returns`): bao phủ phần lõi máy móc, nhưng không diễn đạt được quy ước của repo này. Miễn trừ thành viên kế thừa cần phân giải kiểu xuyên gói, khe giao thức và thành ngữ hợp nhất namespace là đặc thù của Cordis, còn ngữ nghĩa tính đầy đủ (văn bản mô tả trước thẻ, thẻ lỗi thời báo lỗi, báo cáo tổng hợp) vốn đã được chia sẻ với trình sinh catalog trong `scripts/jsdoc.ts`. Hai định nghĩa «đã có tài liệu» khác nhau tinh vi chính là chế độ hỏng mà quy tắc «một nơi sở hữu duy nhất» của repo này muốn ngăn chặn.
- **Mở rộng `gen-cordis-catalog.ts`**: trình sinh catalog render một API được tuyển chọn và canh gác độ tươi của nó; việc duyệt ở cấp repo thì không có catalog nào để render. Chia sẻ hàm trợ giúp và giữ việc duyệt độc lập khiến trách nhiệm của mỗi cổng rõ ràng, dễ đọc.
- **Bắt buộc tài liệu cho thành viên của interface/bí danh kiểu**: hoãn. Việc này sẽ nhân bội phạm vi kiểm tra, trong khi đối tượng kiểm tra phần lớn chỉ là các trường có nghĩa trực quan; các lớp service seam mang quy ước then chốt của thành viên thì đã có cổng. Sẽ cân nhắc lại nếu trong lúc duyệt xuất hiện trôi dạt tài liệu ở cấp thành viên.

## Hệ quả

- Export mới không thể hạ cánh khi thiếu tài liệu: `verify-export-jsdoc` sẽ làm `doc-sync` và CI thất bại. 203 khoảng trống phát hiện lúc áp dụng đã được lấp trong cùng một thay đổi, nên khi cổng hạ cánh thì mọi kiểm tra đều đã qua.
- Hàm export bắt buộc phải chú thích kiểu trả về (lúc áp dụng đã thỏa mãn toàn diện, giờ trở thành phụ thuộc của cổng), và dùng tham số dạng định danh khi `@param` cần tham số có tên.
- Tài liệu của seam là quyền uy: phần hiện thực kế thừa tài liệu từ chuỗi kế thừa của nó, còn các diễn giải hành vi đáng giữ lại ở phần hiện thực là bổ sung, không phải bắt buộc.
- Cổng dựng một `ts.Program` (khoảng 6 giây) — cổng tài liệu duy nhất cần phân giải kiểu; trong `doc-sync` vốn đã biên dịch các mảnh tài liệu thì chi phí này chấp nhận được.
- Tên các khe giao thức theo quy ước nằm ở cấp cao nhất của module; một export không thuộc giao thức mà tình cờ đặt tên là `apply` hay `Config` sẽ không bị kiểm tra — đã chấp nhận, và ghi lại ở đây.
