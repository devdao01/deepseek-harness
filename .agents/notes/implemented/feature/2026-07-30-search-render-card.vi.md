# Agent Note: Ý định render tìm kiếm — grep và glob tạo ra thẻ tìm kiếm có cấu trúc

Status: implemented

[English](2026-07-30-search-render-card.md) | 中文

## Vấn đề

`grep` và `glob` trả về giá trị canonical có cấu trúc — `grep` là `{ matches: [{ path, lineNumber, line }] }` dạng phẳng, `glob` là `{ paths: string[] }` — nhưng mỗi UI trước nay chỉ thấy văn bản render hướng-tới-model của chúng: `grep` gom các kết quả trùng khớp theo tiêu đề file, mỗi dòng dạng `Line N:`; `glob` in ra danh sách đường dẫn nối bằng dấu xuống dòng; cả hai khi vượt giới hạn nội tuyến (`grepMaxMatches`, mặc định 250; `globMaxResults`, mặc định 100) đưa các kết quả còn lại vào spill file đều kèm thêm một dòng chú thích spill ở cuối. Một Web frontend muốn render kết quả tìm kiếm thành các nhóm kết quả theo file có thể mở rộng, hoặc một danh sách đường dẫn có thể chọn, chỉ có cách là phân tích lại đoạn văn bản đó. Cả hai công cụ đã khai báo [ý định render](../architecture/2026-07-02-tool-render-intent-union.md) lúc gọi (`GenericCallView`, `kind: 'search'`), nhưng không có view cho giai đoạn kết quả, nên các lệnh gọi đã hoàn thành rơi về thẻ generic render văn bản thô.

Giá trị canonical có cấu trúc không được truyền qua giao thức: chỉ có văn bản render hướng-tới-model, và khi công cụ khai báo `output.presentationMeta` thì thêm một bản metadata JSON, mới đến được client qua sự kiện `tool/result` ([thỏa ước canonical-output](../architecture/2026-07-20-canonical-tool-output-contract.md)). Do đó, view cho giai đoạn kết quả mang dữ liệu có cấu trúc phải chiếu dữ liệu vào `presentationMeta`, rồi đọc lại trong `presentResult` — đi cùng đường với các thẻ diff của `write`/`edit`.

## Quyết định

`packages/core/tools/src/presentation.ts` thêm `card: 'search'` vào union `ToolResultView` dưới dạng `SearchResultView`, đây là một view được phân biệt bằng `shape` để biểu diễn hai hình dạng của hai công cụ: `SearchMatchesResultView` (`shape: 'matches'`) mang `files: { path, matches: { lineNumber, line }[] }[]` chứa các kết quả `grep` đã gom theo file, `SearchPathsResultView` (`shape: 'paths'`) mang `paths: string[]` phẳng của `glob`. Cả hai đều có `truncated: boolean` và `total: number`.

Discriminant là `shape` chứ không phải `kind`, đây là chủ ý: cùng module presentation đó đã cho `GenericCallView` một trường `kind: ToolCallKind`, mà giá trị của nó vốn đã bao gồm `'search'` (nhóm icon). Một tầng bridge giữ `ToolCallView | ToolResultView` sẽ thấy hai trường `kind` có ý nghĩa khác nhau; biến thể kết quả dùng `shape` để tách hai cái đó ra.

Dùng một view có hai hình dạng thay vì hai thẻ riêng, vì hai công cụ này là cùng một đối tượng thị giác — một kết quả tìm kiếm — bên tiêu thụ Web trước tiên rẽ nhánh trên giá trị `card`, sau đó rẽ nhánh trên `shape` để quyết định bố cục dòng. Discriminant `shape` giữ cho các trường của mỗi biến thể không optional (view matches luôn có `files`, view paths luôn có `paths`), thay vì một interface duy nhất mà mọi trường liên quan đến hình dạng đều optional.

View này **không** mang văn bản kết quả. Đính kèm `result.content` hướng-tới-model vào view sẽ không tạo hiệu ứng gì — đường fallback của bên tiêu thụ vốn đã đọc nội dung `tool/result` gốc — nhưng lại serialize toàn bộ văn bản tìm kiếm vào view đã persist thêm một lần nữa. View chỉ mang hình dạng có cấu trúc; UI không có thẻ search sẽ fallback về nội dung kết quả gốc.

Nhãn thẻ chỉ tồn tại ở giai đoạn kết quả. Lệnh gọi search vẫn giữ dạng `GenericCallView` (`kind: 'search'`): trạng thái pending không có kết quả hay đường dẫn nào để hiển thị, nên `SearchCallView` không thể mang thêm gì hơn tiêu đề generic. Đây là điểm bất đối xứng so với thẻ terminal — view lệnh gọi của terminal mang command, cwd, description đã tồn tại trước khi thực thi; còn nội dung có cấu trúc của search chỉ tồn tại sau `execute`.

`packages/fs/tool-fs-search/src/presentation.ts` sở hữu phần chiếu (projection) và thu hẹp (narrowing). `grepSearchMeta`/`globSearchMeta` chiếu giá trị canonical thành payload `SearchMeta` mà mỗi công cụ khai báo là `output.presentationMeta`; `presentGrepResult`/`presentGlobResult` đọc lại qua `searchViewFromMeta` từ `result.meta`. Chúng tiêu thụ cùng một tập kết quả đã được giữ lại (retained) như văn bản render hướng-tới-model — `retainGrepMatches`/`retainGlobPaths` trong `search-core.ts` chỉ chạy giới hạn nội tuyến và ngân sách preview mỗi dòng đúng một lần, cả render lẫn projection đều dùng chung kết quả đó — nên văn bản và thẻ không bao giờ bất đồng về việc kết quả nào còn sống sót, và cũng không có lần tính retain thứ hai. `total` là tổng số kết quả tìm được (trước khi cắt bớt); `truncated` được đặt khi giới hạn đã loại bỏ bớt kết quả. Đây là điểm trung thực về việc cắt bớt: model thấy các kết quả nội tuyến đã bị cắt cộng thêm chú thích spill, nên thẻ không được coi trang đã giữ lại là kết quả đầy đủ — UI đọc `truncated`/`total` để hiển thị chỉ báo cắt bớt, thay vì tuyên bố một sự đầy đủ mà model chưa từng có.

**meta có ngân sách byte riêng.** Giới hạn nội tuyến ràng buộc số lượng mục, nhưng các kết quả trùng khớp được giữ lại từ một lượt tìm kiếm rộng (hàng trăm dòng dài) vẫn có thể serialize thành hàng trăm KB, trong khi `meta` được persist cùng session log và gửi lại mỗi request. Ngân sách output cuối cùng của deployment (`maxInlineBytes` của `dsh-spill-policy`) chỉ thu nhỏ `content` của kết quả — `PostToolDecision` không có kênh `meta` — nên projection phải tự chịu trách nhiệm ràng buộc `meta`. `capMetaBytes` bỏ bớt các nhóm file/đường dẫn ở cuối cho đến khi meta đã serialize vừa với `searchMetaMaxBytes` (cấu hình, mặc định 64 KiB), và đánh dấu kết quả là `truncated`. Một mục đơn lẻ lớn đến mức tự nó không vừa cũng vẫn được giữ lại: bất biến là nơi có thể bỏ thì luôn có giới hạn, tuyệt đối không tạo ra một thẻ rỗng che giấu kết quả thật.

`searchViewFromMeta` thu hẹp `meta` không rõ kiểu (opaque) một cách phòng thủ, trả về `undefined` cho bất kỳ payload dị dạng hoặc thiếu nào, để presenter chạy trên log phát lại cũ hoặc đã chỉnh sửa thủ công sẽ fallback về thẻ generic thay vì ném lỗi. Nó chấp nhận payload không có kết quả nào (`files: []` / `paths: []`) là một thẻ rỗng hợp lệ — đây là một sự khác biệt có chủ ý so với `diffsFromMeta` (được dùng làm tham chiếu, hàm này từ chối `diffs` rỗng), vì một lệnh grep không có kết quả trùng khớp là một kết quả hợp lệ mà UI hiển thị là "no matches", chứ không phải một projection bị thiếu. `presentResult` trả về `undefined` cho kết quả thất bại, cho meta thiếu (dispatch `run_code` lồng nhau không tính `presentationMeta`), và cho meta có hình dạng của công cụ khác (mỗi presenter chỉ thu hẹp về đúng `shape` của mình).

Hình dạng các thành viên của `SearchMeta` là type alias dạng object literal, chứ không phải các interface `SearchFileMatches`/`SearchLineMatch` mà view phơi ra, vì chỉ type alias mới có thể gán vào chữ ký chỉ mục `JsonValue` mà `presentationMeta` trả về; hai bên có cấu trúc tương đương nên giá trị đã chiếu vẫn đọc lại được thành `SearchResultView`.

Bên tiêu thụ không có nhánh `search` chuyên biệt sẽ fallback về cùng một body generic, và đọc văn bản hướng-tới-model từ kết quả gốc. Vì view search không mang `content` riêng, còn grep/glob trước đây vốn trả về thẻ generic, nên đường fallback này giống hệt từng byte so với trước khi thẻ search được đưa vào. Frontend render các hình dạng `files`/`paths` có cấu trúc độc lập với thỏa ước backend này và cả hai công cụ tạo ra nó.

## Các phương án thay thế đã cân nhắc

**Một interface `SearchResultView` phẳng, với `files?` và `paths?` optional.** Bị loại bỏ: nó khiến hai trường liên quan đến hình dạng đều optional trên mỗi giá trị, và cho phép các view dị dạng mang cả hai hoặc không mang cái nào. Discriminant `shape` giữ các trường của mỗi biến thể là bắt buộc, và giúp bên tiêu thụ rẽ nhánh đầy đủ (exhaustive).

**Dùng lại `kind` làm discriminant cho hình dạng.** Bị loại bỏ: trong cùng module, `kind` trên view lệnh gọi đã biểu diễn `ToolCallKind` (nhóm icon, giá trị bao gồm `'search'`). Có thêm một `kind` với ý nghĩa khác trên view kết quả sẽ xung đột với bất kỳ tầng bridge nào giữ cả hai.

**Đính kèm văn bản hướng-tới-model làm `content` của view.** Bị loại bỏ: đây là no-op đối với mọi bên tiêu thụ hiện tại, và serialize toàn bộ văn bản tìm kiếm vào view đã persist thêm một lần nữa. View là hình dạng có cấu trúc; fallback văn bản đọc nội dung kết quả gốc.

**Thêm kênh meta vào `PostToolDecision`, để `dsh-spill-policy` ràng buộc `meta` giống như nó ràng buộc `content`.** Bị loại bỏ ở đây: cách này thay đổi thỏa ước quyết định công cụ cốt lõi và plugin spill-policy chỉ vì payload của một công cụ. Việc projection tự ràng buộc `meta` của nó theo giới hạn byte cấu hình là tự chứa (self-contained) và giữ nguyên seam.

**Mô phỏng `SearchCallView` lúc gọi đối xứng hai phía như thẻ terminal.** Bị loại bỏ: lệnh gọi search trước `execute` không có kết quả hay đường dẫn nào, view sẽ chỉ mang đúng tiêu đề mà `GenericCallView` đã có sẵn.

## Hệ quả

`grep` và `glob` giờ tính toán `presentationMeta` trên mỗi lệnh gọi thành công không lồng nhau, đây là một phép chiếu có giới hạn trên các kết quả trùng khớp hoặc đường dẫn đã được giữ lại — dùng chung sản phẩm giữ lại với render, nên không có lần tính retain thứ hai, và cũng không có hai bản văn bản tìm kiếm khi truyền tải. Meta đã serialize bị ràng buộc bởi `searchMetaMaxBytes`, nên một lượt tìm kiếm rộng không còn persist một bản sao có cấu trúc không giới hạn vào session log nữa.

UI không có thẻ search sẽ render nội dung `tool/result` gốc, nên không gây hồi quy cho bất kỳ bên tiêu thụ nào. Bên tiêu thụ render hình dạng có cấu trúc đọc `truncated`/`total` và gom theo file; vì view chỉ mang trang đã giữ lại, có giới hạn byte, UI muốn kết quả đầy đủ sẽ theo dấu định vị spill trong văn bản hướng-tới-model, hoàn toàn giống cách model làm.

## Kiểm thử

`packages/fs/tool-fs-search/tests/presentation.spec.ts` chốt (pin) tầng thuần túy: thứ tự file xuất hiện lần đầu của `groupMatchesByFile`; phép chiếu của `grepSearchMeta`/`globSearchMeta` trên sản phẩm giữ lại chung, `total` báo cáo số đếm trước khi cắt, `truncated` được truyền qua; ngân sách preview mỗi dòng do quá trình giữ lại áp đặt; giới hạn byte của meta đã serialize bỏ bớt các nhóm/đường dẫn ở cuối trong khi vẫn giữ lại một mục đơn lẻ quá khổ; và việc `searchViewFromMeta` thu hẹp cho hai hình dạng hợp lệ, thẻ rỗng không kết quả, và từng trường hợp dị dạng (meta không phải object/array, `truncated`/`total` thiếu hoặc sai kiểu, `shape` không xác định, mục `files` dị dạng, `paths` không phải chuỗi). `packages/fs/tool-fs-search/tests/tools.spec.ts` chốt phần đấu nối qua registry công cụ thật: các lệnh `grep`/`glob` execute bị cắt bớt tạo ra `SearchMeta` trên `result.meta`, `presentResult` dựng view search (không có `content`), dispatch `run_code` lồng nhau không tính meta nên `presentResult` fallback, kết quả thất bại hoặc khác hình dạng hoặc dị dạng đều fallback về thẻ generic. Package search giữ mức bao phủ 100% theo từng file trên `src`.

## Liên quan

- [Union ý định render có gắn nhãn cho việc trình bày lệnh gọi công cụ](../architecture/2026-07-02-tool-render-intent-union.md) — thay đổi này mở rộng từ vựng nhãn `card` bằng nhãn kết quả `search`.
- [Thỏa ước output công cụ canonical](../architecture/2026-07-20-canonical-tool-output-contract.md) — sự phân chia value/render/`presentationMeta` mà phép chiếu này dựa vào; giá trị có cấu trúc ở lại cục bộ nơi thực thi, thẻ truyền qua `meta`.
- [Thẻ terminal Web](2026-07-28-web-terminal-card.md) — tiền lệ mà thay đổi này mô phỏng ở phía backend: công cụ chiếu kết quả vào `presentationMeta` và một view `presentResult`; bên tiêu thụ Web của thẻ search là phần tiếp theo tương tự.
