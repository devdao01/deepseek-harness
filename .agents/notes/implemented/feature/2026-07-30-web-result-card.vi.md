# Agent Note: Web result card — a structured render intent for web_search and web_fetch

Status: implemented

[English](2026-07-30-web-result-card.md) | 中文

## Problem

Các công cụ `web_search` và `web_fetch` mỗi công cụ đều đã khai báo một thẻ (card) đang chờ xử lý dạng generic (`presentCall`, `kind: 'search'`/`'fetch'`), nhưng không có `presentResult`, do đó khi một lệnh gọi web đã hoàn tất đến được UI thì chỉ còn lại phần văn bản render hướng tới model. Đối với các frontend web muốn render danh sách nguồn tham chiếu hoặc bản tóm tắt fetch, đoạn văn bản đó bị mất mát thông tin (lossy): phần render của `web_search` nén `title`, `snippet`, `publishedAt` của mỗi nguồn thành một dòng markdown tự do được gắn nhãn bằng title hoặc hostname (`formatSearchOutput` trong `packages/web/tool-web/src/search.ts`), do đó việc parse lại phần render không thể khôi phục các trường của từng nguồn; phần render của `web_fetch` cũng chỉ mang theo `url` và `statusCode` trong một dòng header duy nhất. Quy ước ý định render (render intent) ([kiểu union được gắn nhãn](../architecture/2026-07-02-tool-render-intent-union.md)) trước đây không có nhánh nào để các công cụ web khai báo nhằm mang theo kết quả có cấu trúc.

## Decision

Thêm một nhánh kết quả `card: 'web'` vào `ToolResultView` (`packages/core/tools/src/presentation.ts`), là một union `WebResultView = WebSearchResultView | WebFetchResultView` được phân biệt bằng trường `kind: 'search' | 'fetch'`, kèm theo một shape `WebSource` đại diện cho một nguồn có thể tham chiếu đơn lẻ. Cả hai công cụ giờ đều khai báo `presentResult`.

Chọn một nhãn (tag) kèm phân biệt bằng `kind`, thay vì hai nhãn. Cả hai lệnh gọi đều là truy vấn web, và frontend web sẽ render chúng bằng cùng một họ component (một thẻ tìm kiếm, phần nội dung khác nhau theo `kind`), do đó dùng chung một `card` khiến switch của mỗi bên tiêu thụ card chỉ cần thêm một nhánh, và để frontend tự phân nhánh nội bộ theo `kind`. Hai nhãn sẽ buộc mỗi bên tiêu thụ hiện tại và tương lai phải thêm hai nhánh cho thứ vốn thuộc cùng một họ hình ảnh. Hai giá trị `kind` này khớp với `kind` của view lệnh gọi generic sẵn có ở cả hai công cụ, do đó một lệnh gọi và kết quả của nó đọc lên như cùng một loại.

`presentationMeta` mang theo những thứ mà văn bản render không thể mang. Đối tượng kết quả có cấu trúc mà công cụ trả về từ `execute` sẽ **không** đến được client qua wire — chỉ có văn bản `render` hướng tới model, và (khi được khai báo) JSON `output.presentationMeta` được chiếu (project) lên `meta` của sự kiện `tool/result` mới đến. Đối với `web_search`, meta là con đường **duy nhất** trung thực để lấy được `{url, title?, snippet?, publishedAt?}`: render nén các trường này thành một dòng văn bản tự do bị mất mát thông tin, bên tiêu thụ không thể parse lại. Đối với `web_fetch`, meta mang lại lợi ích nhỏ hơn nhưng thực chất: `url`/`statusCode` có thể khôi phục từ dòng header có định dạng cố định `Fetched <url> (HTTP <n>)`, nhưng `truncated` là một sự cắt bớt có hiệu lực — giới hạn của nhà cung cấp, cắt bớt nguồn trước khi chuyển đổi, hoặc giới hạn đầu ra `fetchMaxOutputChars` của bản triển khai — mà client không thể tính lại vì nó không biết giới hạn đó. Cả thẻ fetch lẫn văn bản hướng tới model đều xuất phát từ cùng một helper `renderFetchOutput(result, maxOutputChars)` để suy ra `truncated`, do đó thẻ sẽ không bao giờ phân kỳ với phần thông tin đuôi mà model nhìn thấy. Cách này lặp lại khuôn mẫu diff của write/edit (`packages/fs/tool-fs/src/diff.ts`): một projector `*MetaFromValue` đưa vào `output.presentationMeta`, một narrower `*MetaFromResult` đọc lại từ `result.meta`, và có phòng thủ rơi về (fallback) thẻ generic khi thất bại. Phần nội dung của `web_fetch` đã là markdown nằm trong nội dung kết quả, do đó không ghi lặp lại vào meta.

Cả hai view kết quả đều không mang bản sao `content`. UI không render thẻ `web` có cấu trúc sẽ rơi về nội dung `tool/result` gốc, cũng chính là đầu vào mà thẻ generic tiêu thụ. Việc sao chép nội dung kết quả vào view sẽ lặp lại tối đa `fetchMaxOutputChars` ký tự trong cùng một khung gửi mà không mang lại lợi ích gì (tương tự lý do phủ quyết phần nội dung fetch trong mục meta ở trên), do đó view bỏ qua nó, và đường rơi về render đúng y hệt đoạn văn bản đó. Mỗi view thiết lập `title` ở giai đoạn kết quả từ tham số của lệnh gọi (`args.query`/`args.url`), do đó dù cửa sổ header lệnh gọi bị cắt bớt khi replay thì title vẫn còn, nhất quán với cách write/edit thiết lập lại title ở giai đoạn kết quả.

`presentResult` trả về `undefined` (tức là thẻ generic) khi kết quả lỗi, hoặc khi `meta` thiếu hay sai định dạng, vì presentation sẽ chạy khi replay bất kỳ kết quả đã ghi log nào (có thể đến từ schema cũ), và tuyệt đối không được ném lỗi. Narrower kiểm tra phòng thủ từng trường; danh sách nguồn rỗng là meta hợp lệ, không phải meta sai định dạng.

## Consequences

Bên tiêu thụ frontend thuộc phạm vi công việc của [Web result card frontend note](2026-07-30-web-result-card-frontend.md): thay đổi phía producer lần này chỉ thêm nhánh quy ước và phát ra nó từ hai công cụ, không bao gồm việc render ở client. Thay đổi duy nhất có thể quan sát được là sự kiện `tool/result` của `web_search`/`web_fetch` giờ lưu lại một payload `data.meta` (snapshot keyless của `web-fetch` khi đó cũng được làm mới theo); văn bản render hướng tới model và nội dung rơi về generic vẫn giữ nguyên. Snapshot bản ghi transcript của ứng dụng lắp ráp (assembled application transcript) khi render thẻ `web` thuộc về thay đổi của bên tiêu thụ render nó. Bất kỳ bên tiêu thụ `ToolResultView` nào làm switch cạn kiệt (exhaustive) đều phải thêm một nhánh `web`; bên tiêu thụ không cạn kiệt có thể dùng đường rơi về kết quả gốc. Schema phiên của `apiproxy` (`packages/host/apiproxy/src/api/sessions.schema.ts`) đã chấp nhận bất kỳ chuỗi `card` nào, do đó view mới có thể truyền qua wire mà không cần đổi schema.

Các công cụ web tương lai muốn dùng thẻ này chỉ cần khai báo một `presentResult` trả về view `card: 'web'` với `kind` riêng của chúng; thêm `kind` thứ ba là một lần sửa kiểu union và một nhánh rẽ ở frontend, không phải một nhãn card mới.

## Alternatives considered

**Hai nhãn card (`web-search`, `web-fetch`).** Bị phủ quyết: nó nhân đôi số nhánh cho một họ hình ảnh tại mỗi bên tiêu thụ card, trong khi hai shape đã có đủ điểm chung (một thẻ tìm kiếm có tiêu đề với nội dung rơi về), phân biệt bằng `kind` đủ để biểu đạt sự khác biệt mà không cần nhãn thứ hai.

**Parse lại văn bản render trong `presentResult`, thay vì chiếu meta.** Bị phủ quyết đối với `web_search`: danh sách nguồn trong render bị mất mát thông tin (nhãn bằng title hoặc hostname, snippet và ngày tháng bị ghép vào văn bản tự do), do đó parse lại không thể khôi phục trung thực các trường có cấu trúc. `presentationMeta` là con đường duy nhất giữ lại chúng.

**Đặt nội dung fetch vào meta, hoặc sao chép nội dung kết quả vào bất kỳ view nào.** Bị phủ quyết: nội dung đã là markdown hướng tới model trong nội dung kết quả, sao chép nó vào meta hoặc vào trường `content` của view sẽ nhân đôi payload lưu trữ hoặc gửi đi mà không mang lại lợi ích; UI không có năng lực `web` rơi về nội dung kết quả sẵn có, chính là cùng đoạn văn bản đó.

## Testing

`packages/web/tool-web/tests/tool-web.spec.ts` bao phủ các nội dung sau, đáp ứng ngưỡng 100% theo từng file: phép chiếu `searchMetaFromValue`/`fetchMetaFromValue`, bao gồm bỏ qua các trường tùy chọn không tồn tại, và phép chiếu `truncated` của fetch nhất quán với phần thông tin đuôi của render cả khi nội dung chỉ bị cắt bởi giới hạn đầu ra, lẫn khi hoàn toàn không bị cắt; thu hẹp `searchMetaFromResult`/`fetchMetaFromResult`, bao gồm một vòng round-trip và việc từ chối mỗi kiểu shape sai định dạng (không phải object, sai kiểu trường, mục nguồn sai định dạng) cũng như chấp nhận danh sách nguồn rỗng; các view đã định kiểu `presentSearchResult`/`presentFetchResult`, bao gồm title suy ra từ tham số, không có bản sao `content`, tín hiệu truncated, rơi về khi kết quả lỗi và rơi về khi meta sai định dạng; và hai lần thực thi registry thật, khẳng định công cụ chiếu meta lên `result.meta` với `presentResult` đã đăng ký của nó suy ra view `card: 'web'`.

## Related

- [Kiểu union được gắn nhãn cho ý định render lệnh gọi công cụ](../architecture/2026-07-02-tool-render-intent-union.md) — từ vựng nhãn `card` mà thẻ này mở rộng bằng nhánh `web`.
- [Web terminal card](2026-07-28-web-terminal-card.md) — tiền lệ đưa ý định render `terminal` của bash lên trình duyệt; [Web result card frontend](2026-07-30-web-result-card-frontend.md) là phương án tương ứng của nó cho nhánh này.
