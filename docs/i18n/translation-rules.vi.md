# Quy tắc dịch

[English](translation-rules.md) | Tiếng Việt

Tài liệu này quy định: cách dịch giữa hai ngôn ngữ Trung-Anh trong cặp tài liệu ghép của repo này. Hai ngôn ngữ ngang quyền (xem [README.md](README.md)): mỗi lần thay đổi có thể được viết bằng bất kỳ ngôn ngữ nào, bên được chỉnh sửa chính là nguồn của lần cập nhật đó; các quy tắc trong tài liệu này ràng buộc cách tạo ra hoặc cập nhật tệp đối ứng. Các quy tắc này có hiệu lực như nhau với con người và agent (tác tử). Trong công việc thường ngày, agent sẽ dịch trực tiếp phần nội dung có thay đổi trong một lượt duy nhất dưới sự dẫn dắt của thuật ngữ; workflow mở rộng [.agents/skills/dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) chỉ chạy khi người dùng gọi tường minh. Cấp độ quy tắc theo cách dùng của RFC 2119: **phải (MUST)** / **không được (MUST NOT)** sẽ chặn cổng gác hoặc đánh giá; **nên (SHOULD)** khi lệch cần nêu lý do; **có thể (MAY)** tùy ý quyết định.

## Tính trung thực

- Tệp đối ứng *phải* truyền đạt cùng nội dung với bên được viết: không thêm hành vi, tiền điều kiện, cảnh báo, tuyên bố phiên bản hay ví dụ, cũng không bỏ sót bất kỳ mục nào. Nếu hai bên không nhất quán về nội dung thực chất, không ngôn ngữ nào mặc định thắng thế; hãy sửa bên sai, và cập nhật đồng bộ bên còn lại trong cùng một lần thay đổi.
- Tệp đối ứng *nên* đọc như văn bản kỹ thuật tự nhiên của ngôn ngữ đó, chứ không phải bản dịch đối chiếu từng từ. Hãy dịch theo ngữ nghĩa, tổ chức lại câu khi ngữ pháp của ngôn ngữ đích yêu cầu, và giữ nguyên văn phong (register) của tác giả gốc (ví dụ: súc tích thì vẫn giữ súc tích).
- Đừng dịch những thứ không thể dịch: nếu một câu phụ thuộc vào thành ngữ của ngôn ngữ nguồn và không thể chuyển đổi tự nhiên, hãy dịch ý nghĩa của nó, chứ không phải bản thân thành ngữ đó.

## Văn phong

- Văn phong lấy [style-samples.md](style-samples.md) làm mốc hiệu chuẩn. Các mẫu vàng đã được con người thẩm định cuối cùng, mỗi thể loại văn bản có một bộ; bản dịch phải tham chiếu mẫu có thể loại gần nhất, và dùng văn phong của bên ngôn ngữ đích trong mẫu đó; nếu mẫu xung đột với quy tắc hành văn trong tài liệu này, lấy mẫu làm chuẩn. Khi dịch sang tiếng Trung, dùng văn phong kỹ thuật-thể chế (institutional technical Chinese) chuẩn mực; khi dịch sang tiếng Anh, dùng văn phong nhà phát triển ngắn gọn, chuyên nghiệp.
- Hãy thuật lại nội dung với tư cách một tác giả kỹ thuật bản ngữ, chứ không phải với tư cách người dịch chuyển ngữ từng câu, đồng thời giữ lại mọi thành phần ngữ nghĩa của bản gốc: không thêm, không bớt — sự trôi chảy không bao giờ là lý do để mất đi một thành phần ngữ nghĩa.
- Nếu dịch trực tiếp khiến chủ thể thực hiện hành động trở nên mơ hồ, hãy viết rõ ai là bên thực hiện thực tế; khi dịch sang tiếng Trung, nên dùng bên thực hiện thực tế như «hệ thống, cổng gác, người đánh giá» làm chủ ngữ, tránh câu bị động mơ hồ hoặc chủ ngữ trừu tượng.
- Ưu tiên cách diễn đạt kỹ thuật thông dụng trong ngôn ngữ đích, tránh dịch cứng theo từng từ (false positive/negative → 误报／漏检 [báo sai/bỏ sót]; enforcement frontier → 执行红线 [ranh giới thực thi]); ẩn dụ nên được chuyển đổi tự nhiên, còn chuỗi danh từ nên được tách ra theo thói quen của ngôn ngữ đích.
- Chia đoạn dài theo đơn vị ngữ nghĩa, mỗi đoạn một ý. Ranh giới đoạn có thể khác với bản gốc; chữ ký cấu trúc không so sánh số lượng đoạn.
- Khi dịch sang tiếng Trung, danh từ chỉ loại (category noun) dùng tiếng Trung và chú thích tiếng Anh trong ngoặc ở lần xuất hiện đầu tiên (实操手册（cookbook）); khi dịch sang tiếng Anh, dùng tên loại tiếng Anh thông dụng. Khi chỉ đến chính thư mục hoặc tệp, giữ nguyên dạng code tiếng Anh.

## Bảo toàn cấu trúc

Cổng gác ghép cặp sẽ kiểm tra độ sâu tiêu đề, khối mã có rào, số hàng và cột của bảng, loại danh sách, số bắt đầu của danh sách có thứ tự, số mục danh sách và đích liên kết; phần cấu trúc mà cổng gác chưa bao phủ vẫn cần con người rà soát thủ công. Hai tệp ghép cặp phải tương ứng một-một ở các mặt sau:

- Cấp bậc tiêu đề (cùng cấp, cùng thứ tự; **văn bản** của tiêu đề phải được dịch);
- Hình thái và cách đánh số của danh sách;
- Bảng (cùng cột, cùng thứ tự hàng; ô tiêu đề dịch theo bảng thuật ngữ);
- Khối mã có rào: **giống hệt từng byte, bao gồm cả chú thích**. Chữ ký ghép cặp so sánh cả chuỗi thông tin lẫn nội dung, khối ` ```ts ` còn phải biên dịch qua `doc-typecheck`;
- Mã nội tuyến (lệnh, flag, khóa cấu hình, đường dẫn tệp, tên sự kiện, tên API, số phiên bản): giữ nguyên, không bao giờ dịch hay sắp xếp lại;
- Liên kết và anchor: mỗi liên kết tương đối trong hai tệp phải trỏ tới cùng một đích (theo quy ước là đường dẫn `.md`, chứ không phải tệp anh em `.zh.md`), để dù một cặp tài liệu nào đó được đưa vào trước các tệp lân cận, liên kết cũng không bị treo (dangling). Liên kết đặc thù duy nhất cho bên zh là dòng chuyển đổi ngôn ngữ. README được render ở nơi ngoài GitHub có thể dùng URL kho lưu trữ công khai chuẩn trỏ tới đúng tệp đối ứng, theo quy định tại [README.md](README.md). **Văn bản** của liên kết được dịch; đích của liên kết thì không.

Các quy ước Markdown của repo này áp dụng nguyên vẹn cho tệp `.zh.md`: mỗi đoạn một dòng vật lý (`verify-md-wrap`), liên kết tương đối phải phân giải được (`verify-md-links`), tệp kết thúc bằng đúng một dòng trống.

## Thuật ngữ

- [terminology.md](terminology.md) là nguồn chân lý về thuật ngữ theo cả hai chiều. Hãy nạp nó trước khi dịch; thuật ngữ đã liệt kê trong bảng phải tuân theo hàng tương ứng và các mục cấm trong «不要译作» (không được dịch thành). Khi dịch sang tiếng Trung, dùng cột «中文» và chú thích trong ngoặc theo cột «首次出现» (lần xuất hiện đầu tiên); khi dịch sang tiếng Anh, dùng cột «English», không thêm chú thích tiếng Trung trong ngoặc.
- Khi dịch sang tiếng Trung, một thuật ngữ kỹ thuật chưa có trong bảng thuật ngữ chỉ được dịch khi đã có cách dịch thông dụng trong tài liệu OSS tiếng Trung chủ đạo hoặc tài liệu nhà cung cấp (tài liệu tiếng Trung của K8s/Vue/MDN, hướng dẫn phong cách tiếng Trung giản thể của Microsoft, tài liệu dự án của các hãng công nghệ lớn), và phải ghi rõ nguồn trong PR (Pull Request); nếu không thì phải giữ nguyên tiếng Anh, và nêu cách dịch đề xuất trong mục «thuật ngữ chờ quyết định» (待定术语) của mô tả PR.
- Khi dịch sang tiếng Anh, dùng thuật ngữ kỹ thuật tiếng Anh thông dụng. Nếu thuật ngữ nguồn không có bản dịch tương đương rõ ràng, thông dụng thì giữ nguyên từ gốc, kèm giải thích ngắn, và liệt kê vào «thuật ngữ chờ quyết định». Cả hai chiều đều không được tự sáng tạo cách dịch tùy tiện; thuật ngữ đã chốt phải được thêm vào [terminology.md](terminology.md) trong cùng PR hoặc PR tiếp theo.

## Kiểu chữ (Typography)

Mục này quy định cho bên tiếng Trung; bên tiếng Anh tuân theo quy ước Markdown thông thường của repo (`AGENTS.md` gốc). Các quy tắc pha trộn Trung-Tây dưới đây tuân theo sự đồng thuận liên dự án của [Hướng dẫn dịch tiếng Trung giản thể của MDN](https://github.com/mdn/translated-content/blob/main/docs/zh-cn/translation-guide.md), [Hướng dẫn bản địa hóa tiếng Trung của Kubernetes](https://kubernetes.io/zh-cn/docs/contribute/localization_zh/), [Quy ước dịch tiếng Trung của Vue.js](https://github.com/vuejs-translations/docs-zh-cn/wiki/%E7%BF%BB%E8%AF%91%E9%A1%BB%E7%9F%A5) và [Chỉ nam trình bày văn bản tiếng Trung](https://github.com/sparanoid/chinese-copywriting-guidelines), vốn dựa trên [W3C clreq](https://www.w3.org/TR/clreq/) và GB/T 15834—2011:

- Phải đặt một dấu cách nửa độ rộng (half-width) giữa chữ Trung và từ Latin, giữa chữ Trung và chữ số: `每个 plugin 注册 3 个 tool`。Không đặt dấu cách giữa dấu câu toàn độ rộng (full-width) và bất kỳ ký tự nào.
- Văn bản tiếng Trung phải dùng dấu câu toàn độ rộng (Trung): `，。：；？！（）「」`。Dấu câu nửa độ rộng chỉ giữ lại trong đoạn mã, trong câu tiếng Anh hoàn chỉnh được trích dẫn nguyên văn, và trong số (`3.5`, `1,024`).
- Văn bản tiếng Trung *nên* ưu tiên dùng dấu hai chấm, dấu chấm, dấu phẩy hoặc dấu ngoặc, hạn chế dùng dấu gạch ngang (em dash); chỉ giữ dấu gạch ngang khi không dấu câu nào khác diễn đạt tự nhiên được.
- Dấu đốn hào (顿号): các mục liệt kê song song trong tiếng Trung dùng dấu đốn hào (、), không dùng dấu phẩy.
- Không được dùng chữ số toàn độ rộng hay chữ cái Latin toàn độ rộng: không bao giờ viết `１２３`, luôn viết `123`.
- Danh từ riêng giữ nguyên cách viết hoa chuẩn: GitHub, TypeScript, DeepSeek. Trừ khi trích dẫn mã, tuyệt đối không viết `github`/`Github`.
- Ngôi thứ hai dùng «你», không dùng «您» (nhất quán với quy ước tiếng Trung của Vue, Kubernetes và văn phong trực tiếp của repo này).
- Ký hiệu nhấn mạnh (`**in đậm**`, `*in nghiêng*`) đặt trên cùng đoạn văn bản như bên đối ứng. Tiếng Trung không có chữ nghiêng, hiệu ứng render có thể không thấy khác biệt, đừng thay bằng dấu ngoặc kép hay trang trí khác.

## Tiêu chuẩn chất lượng

- Tiêu chuẩn hoàn thành của một cặp tài liệu: một kỹ sư song ngữ chỉ đọc một trong hai tệp cũng nhận được đúng thông tin như người đọc tệp kia (cùng sự thật, cùng lời cảnh báo, cùng giọng điệu), và không có nội dung thừa nào.
- Hãy chạy `pnpm run verify-translation-pairing` cùng các cổng gác còn lại của `doc-sync`. Các cổng gác này sẽ kiểm tra bản ghi nhất quán, dòng chuyển đổi ngôn ngữ, độ sâu tiêu đề, khối mã, số hàng và cột của bảng, loại danh sách, số bắt đầu của danh sách có thứ tự, số mục danh sách, liên kết và quy tắc Markdown của repo; thứ tự danh sách và bảng, cách đánh số danh sách không theo chuẩn, mã nội tuyến, ký hiệu nhấn mạnh, ngữ nghĩa, thuật ngữ và văn phong do con người đánh giá đảm nhiệm.

## Tài liệu tham khảo

Các nguồn có thẩm quyền được các quy tắc trong tài liệu này trích dẫn, dành cho người và agent muốn tìm hiểu căn cứ sâu hơn:

- [Chỉ nam trình bày văn bản tiếng Trung](https://github.com/sparanoid/chinese-copywriting-guidelines): chuẩn thực tế cộng đồng về khoảng cách và dấu câu khi pha trộn Trung-Tây.
- [Hướng dẫn dịch tiếng Trung giản thể của MDN](https://github.com/mdn/translated-content/blob/main/docs/zh-cn/translation-guide.md): một tệp quy tắc dịch trong repo có hình thức giống tài liệu này; thực hành về khoảng cách, dấu câu và bảng thuật ngữ.
- [Hướng dẫn bản địa hóa tiếng Trung của Kubernetes](https://kubernetes.io/zh-cn/docs/contribute/localization_zh/): thực hành về lần xuất hiện đầu tiên của thuật ngữ và dấu câu từ đội bản địa hóa tiếng Trung lớn nhất.
- [Quy ước dịch docs-zh-cn của Vue.js](https://github.com/vuejs-translations/docs-zh-cn/wiki/%E7%BF%BB%E8%AF%91%E9%A1%BB%E7%9F%A5): quyết định dịch/giữ nguyên theo từng thuật ngữ và giọng điệu.
- [zh-style-guide](https://zh-style-guide.readthedocs.io): quy phạm viết tài liệu kỹ thuật tiếng Trung của cộng đồng, tài liệu này mượn hệ thống phân cấp quy tắc của nó (cùng cấp độ từ khóa RFC 2119); nó tổng hợp GB/T 15834/15835, clreq và các hướng dẫn của nhà cung cấp.
- [W3C clreq](https://www.w3.org/TR/clreq/) và [Hướng dẫn phong cách tiếng Trung giản thể của Microsoft](https://learn.microsoft.com/en-us/globalization/reference/microsoft-style-guides): nền tảng chính thức về kiểu chữ học và bản địa hóa của nhà cung cấp.
- GB/T 19682-2005 «Yêu cầu chất lượng bản dịch trong dịch vụ dịch thuật»: tiêu chuẩn quốc gia; các mục «Tính trung thực» và «Thuật ngữ» của tài liệu này hiện thực hóa ba yêu cầu cơ bản của nó (trung thực với nguyên văn, thống nhất thuật ngữ, hành văn trôi chảy) thành các quy tắc có thể thao tác được.
