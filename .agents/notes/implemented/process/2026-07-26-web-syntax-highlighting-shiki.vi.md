# Agent Note: Syntax highlighting cho web client — shiki đồng bộ, fine-grained

Status: implemented

[English](2026-07-26-web-syntax-highlighting-shiki.md) | Tiếng Việt

> Phạm vi: hệ thống syntax highlighting duy nhất của web client — quyết định về dependency, hình thái singleton, quy ước bảng token và các bề mặt tiêu thụ. Đây là PR (Pull Request) thứ năm trong chuỗi stacked PR của Code Mode UI; [Agent Note về dòng subcall trong chat](../feature/2026-07-26-code-mode-chat-subcall-rows.md) đã giao nộp phần thân chương trình `run_code`, còn hệ thống này tồn tại chính là để làm cho phần thân đó đọc được. Quy tắc cơ bản về style do [quyết định về hệ thống style Web](2026-07-19-web-styling-system.md) quy định.

## Vấn đề

Trước đây client render mọi bề mặt code — code block markdown rào chắn trong phần thân assistant, phần thân chương trình `run_code`, tham số trong panel details — đều thành văn bản đơn cách đều không highlight. Payload chính của chuỗi stacked PR này là TypeScript do model viết ra; chương trình không được highlight rõ ràng khó đọc lướt hơn hẳn, trong khi repo đã sẵn giao nộp code được highlight bằng shiki trên chính site VitePress của mình, khiến web app trở thành bề mặt render code duy nhất không có syntax highlighting.

## Quyết định

**Áp dụng shiki ở hình thái đồng bộ, fine-grained, như một singleton trong `ui-primitives`, việc theme hóa hoàn toàn thực hiện qua CSS custom property.**

- **Dependency**: `shiki/core` + `@shikijs/langs`, được lắp ráp qua `createHighlighterCoreSync` kết hợp `createJavaScriptRegexEngine({ forgiving: true })` — không kèm oniguruma WASM, không khởi tạo bất đồng bộ, thân thiện với bundle. Whitelist grammar (ngữ pháp): `typescript` (kèm JS nhúng), `shellscript`, `json` — tức đúng những ngôn ngữ mà harness thực sự render; các trường hợp còn lại đều fallback về khối văn bản thuần với hình học hoàn toàn giống hệt, không bao giờ báo lỗi. Tiền lệ: site VitePress đã render toàn bộ code tài liệu qua shiki; và với TypeScript (chính là payload quan trọng ở đây), TextMate grammar vượt trội đáng kể so với bộ highlight dùng regex.
- **Singleton**: `ui-primitives/src/markdown/highlight.ts` tạo một `HighlighterCore` cho mỗi document, và expose `highlightToHtml(code, lang)` (undefined thì render thành văn bản thuần). Việc dựng engine cộng grammar là một long task khoảng 120-175ms, nên module làm ấm sẵn singleton bằng một task trì hoãn ngay khi plugin khởi động (đường lazy vẫn được giữ như phương án dự phòng đúng đắn), để dịch chuyển chi phí này ra khỏi đường render — nếu không thời điểm hoán đổi finalize khi streaming sẽ bị khựng. Bảng alias dùng `Map` thay vì object: chuỗi thông tin fence do assistant viết ra, các nhãn như `constructor` phải trả về rỗng, thay vì bị parse thành thuộc tính kế thừa khiến shiki sập. Component `CodeBlock` dùng chung có cả hai nhánh; nhánh shiki của nó bơm cây span được sinh ra qua `dangerouslySetInnerHTML` — cách dùng này được chấp thuận, vì output của shiki là một cây span tĩnh được tính toán từ văn bản code (không đi qua bất kỳ HTML nào của user, không có script hay event handler), đây chính là đường tiêu thụ mà tài liệu của shiki tự ghi nhận.
- **Theme hóa**: `createCssVariablesTheme` của shiki định tuyến mọi màu token qua custom property `--shiki-*`; giá trị thực nằm trong bảng token mới `ui-theme/styles/shiki.css` (light ở `:root`, dark ở `body[data-ds-dark-theme]` — cách phân tầng giống hệt mọi stylesheet khác), được import qua chuỗi `base.css` của shell. CSS của component chỉ dùng token; không có bất kỳ literal màu nào đi vào JS hay stylesheet của component. Nền/chữ dùng alias trỏ tới các token code block markdown sẵn có, giúp khối được highlight và khối văn bản thuần nhất quán với nhau.
- **Bề mặt**: code block markdown rào chắn (component `pre` của `MarkdownText` định tuyến fence chuỗi đơn tới `CodeBlock`), phần thân chương trình `run_code` khi mở rộng (biến thể code của ToolRow, `lang="typescript"`), và tham số Input trong panel details (`lang="json"`). Output của tool không bao giờ được highlight cú pháp — đó là văn bản tùy ý, việc đoán cứng một grammar sẽ gây highlight sai nhiều hơn là giúp ích; output của card bash chỉ mang màu do chính chuỗi ANSI của nó khai báo, được render qua [terminal card](../feature/2026-07-28-web-terminal-card.md).

## Phương án thay thế đã cân nhắc

**`rehype-highlight`/lowlight.** Xếp thứ nhì: vốn đồng bộ, kích thước bundle chỉ bằng khoảng một phần ba, nhưng grammar dựa trên regex có độ chính xác kém rõ rệt trên TypeScript, và repo sẽ phải chạy song song hai hệ thống highlight (site dùng shiki, app dùng highlight.js), duy trì hai bộ từ vựng theme hóa.

**Bundle `shiki` đầy đủ, hoặc engine oniguruma WASM.** Từ chối: bundle đầy đủ sẽ kéo theo mọi grammar và theme; WASM cần tải bất đồng bộ, mà đây chính là điều mà việc khởi động đồng bộ của client cố tình tránh. Core fine-grained cộng ba grammar giúp chi phí tỷ lệ thuận với mức dùng thực tế.

**Highlight trong worker/highlight bất đồng bộ.** Từ chối: các payload đều nhỏ (chương trình, code block rào chắn, tham số); engine JS đồng bộ token hóa chúng ở mức micro giây, còn bất đồng bộ sẽ tạo ra một khoảnh khắc nhấp nháy code chưa highlight, cộng thêm nhiễu loạn cơ chế render, mà không có nhu cầu nào được đo đạc thực tế đòi hỏi điều đó.

## Hệ quả

Mọi bên tiêu thụ dùng chung một bề mặt code — các bề mặt mới trong tương lai chỉ cần import `CodeBlock` là kế thừa được highlight, theme hóa và fallback văn bản thuần. Phần tăng thêm của bundle là shiki core cộng ba grammar (trả một lần trong `ui-primitives`). Màu token là bảng `--shiki-*` đầu tiên; theme package đăng ký override alias mở rộng chúng theo đúng cách mở rộng bất kỳ token nào khác. Spec jsdom khóa cấu trúc token span, việc phân giải alias, hai nhánh fallback và định tuyến fence; các snapshot bundle đã build sẵn có cùng browser e2e bao phủ đường đi đã lắp ráp.
