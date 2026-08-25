# Agent Note: `verify-md-links` kiểm tra anchor fragment, loại bỏ nhóm dead link cuối cùng

Status: implemented

[English](2026-08-09-md-fragment-anchor-gate.md) | 中文

## Vấn đề

`verify-md-links` chỉ chứng minh rằng file đích của liên kết tương đối tồn tại, không bao giờ kiểm tra `#fragment`, và chuẩn tài liệu bù đắp bằng một quy tắc thủ công: tự grep anchor trước khi đổi tên tiêu đề. Một lần quét corpus phát hiện 15 liên kết có fragment không tương ứng với anchor nào trong đích — ba kiểu mục nát: liên kết được viết ra rồi tiêu đề bị viết lại (`#security-and-authority-are-explicit-non-goals` so với tiêu đề hiện tại của note là `Security and authority are non-goals`), quy ước được chuyển sang tài liệu chủ quản khác (`tool-fs` trỏ đến seam README, trong khi quy tắc không timeout hiện nằm ở group README), liên kết phía zh trỏ đến slug tiếng Anh mà tiêu đề tiếng Trung của nó không bao giờ tạo ra (`#deferred-work` so với `## 推迟工作`). Không cái nào trong số này kích hoạt gate nào, và mỗi cái đều âm thầm bỏ rơi người đọc ở đầu trang đích.

## Quyết định

`verify-md-links` giờ cũng phân giải fragment (thay thế quyết định trong [quyết định cross-link](2026-06-18-markdown-cross-link-lint.md) trước đây tạm hoãn đưa kiểm tra này vào phạm vi). Với mỗi liên kết tương đối có đích là file Markdown — bao gồm cả liên kết `#anchor` cùng file mà checker cũ bỏ qua hoàn toàn — fragment phải đặt tên đúng một anchor thật trong đích: slug GitHub của tiêu đề, hoặc `<a id>` tường minh trong luồng HTML thật (ví dụ code và anchor bị comment out không đăng ký gì cả). Slug được `markdownHeadingLines` tự có của repo tính từ văn bản tiêu đề **sau khi render**, do đó liên kết, code inline và nhấn mạnh bên trong tiêu đề đều tham gia tính slug theo đúng kết quả render của GitHub; dấu gạch dưới được giữ nguyên (`#showcase-web_fetch`); slug trùng lặp nhận hậu tố `-1`, `-2`... theo tập chiếm dụng của GitHub; việc khớp phân biệt hoa thường vì element id vốn dĩ phân biệt hoa thường. Fragment trỏ đến đích không phải Markdown (`file.ts#L10`) thuộc ngữ nghĩa của renderer, không nằm trong phạm vi; URL bên ngoài và URL tuyệt đối theo root cũng không được kiểm tra. Tập anchor được thu thập lười (lazy) cho bất kỳ đích nào tồn tại (`anchorCache`), nên các liên kết trỏ vào note đã lưu trữ và tài liệu vendor vẫn được kiểm tra như thường, mà các file này không vì thế trở thành nguồn quét.

Hàm slug khác với slugger anchor khối của `gen-cordis-catalog` (cái sau bỏ dấu gạch dưới): tiêu đề của generator luôn có thể đến được thông qua `<a id>` tường minh của nó, hai bên không cần chia sẻ chung một quy tắc. Phía tiếng Trung theo đúng thông lệ corpus hiện có (`docs/glossary.zh.md`, `docs/cordis-primer.zh.md`): liên kết giữ fragment tiếng Anh, đặt `<a id>` tường minh trước tiêu đề tiếng Trung, để cả hai phía ngôn ngữ đều lộ ra cùng một anchor.

15 fragment lỗi được sửa trong cùng một thay đổi: slug cũ được chuyển hướng về tiêu đề hiện tại, quy ước không timeout đã chuyển được đổi liên kết sang group README chủ quản của nó, bốn tài liệu tiếng Trung được bổ sung anchor tường minh. `docs/AGENTS.md` và skill `dsh-doc-standards` không còn yêu cầu tự grep anchor thủ công cho liên kết Markdown; grep thủ công chỉ còn được giữ lại cho anchor trong chuỗi TypeScript mà đầu ra không bao giờ đi vào Markdown được kiểm tra (hiện tại cả ba trường hợp đều được render vào trang được kiểm tra, gate phủ chúng thông qua artifact đã commit).

## Xác minh

`scripts/verify-md-links.spec.ts` chứng minh từng đường nghiệm thu: slug hóa văn bản đã render (dấu backtick, dấu câu, tiêu đề chứa liên kết, giữ dấu gạch dưới), hậu tố trùng lặp theo tập chiếm dụng, `<a id>` trong code khối/inline/comment không đăng ký, tài liệu hỗn hợp mọi liên kết đều phân giải được, fragment chết cùng file và khác file, biến thể fragment khác hoa thường, và đích thiếu vẫn báo `target` chứ không phải `anchor`. Gate chạy toàn bộ corpus trong doc-sync (`verify-md-links`), và chỉ pass sau khi 15 lỗi được sửa xong — bản thân corpus chính là bằng chứng từ đỏ sang xanh cho từng kiểu mục nát.

## Phương án thay thế từng cân nhắc

- **Giữ quy tắc grep thủ công.** Đã chứng minh không giữ được: 15 fragment vẫn mục nát ngay cả trong văn hóa bảo trì do gate dẫn dắt, vì các PR viết lại tiêu đề không bao giờ xem lại liên kết trỏ vào. Bất biến có thể kiểm tra cơ học nên được đưa vào một gate được thực thi.
- **Cho liên kết tiếng Trung trỏ đến anchor slug tiếng Trung.** GitHub xử lý slug cho tiêu đề CJK không vấn đề gì, nhưng thông lệ corpus đã là `<a id>` tường minh + fragment tiếng Anh (glossary, primer), và nó cũng sống sót qua renderer loại bỏ ký tự non-ASCII; đưa vào một thông lệ thứ hai sẽ chia cắt corpus.
- **Chia sẻ `githubSlug` với generator typert.** Đưa vào coupling xây dựng package chỉ vì một hàm là không đáng, và hai quy tắc thực sự khác nhau (generator bỏ dấu gạch dưới; anchor của nó là `<a id>` tường minh mà gate đọc trực tiếp), sự khác biệt là do thiết kế chứ không phải trôi dạt.
- **Đồng thời kiểm tra slug VitePress.** Kiểm tra dead link của site đã publish chạy trong `website:build`; khối được sinh ra mang anchor tường minh chính là để nhất quán giữa hai renderer, tiêu đề viết tay nếu lệch sẽ fail ở đó.

## Hệ quả

Đổi tên tiêu đề giờ sẽ làm build fail tại bất kỳ liên kết Markdown nào tham chiếu anchor của nó, thay vì bỏ rơi người đọc ở đầu trang; tác giả phải sửa liên kết trỏ vào trong cùng một thay đổi, hoàn toàn nhất quán với nghĩa vụ có sẵn khi đổi tên file. Anchor cùng file không còn là điểm mù, và trang tiếng Trung dùng fragment tiếng Anh phải bổ sung anchor. Grep thủ công trước khi đổi tên chỉ còn được giữ cho anchor trong chuỗi TypeScript mà đầu ra không bao giờ đi vào Markdown được kiểm tra.
