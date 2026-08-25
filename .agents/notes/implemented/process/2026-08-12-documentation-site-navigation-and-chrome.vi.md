# Agent Note: Điều hướng trang tài liệu và chrome của repo

Status: implemented

[English](2026-08-12-documentation-site-navigation-and-chrome.md) | 中文

## Vấn đề

Sidebar reference đặt 43 trang subsystem trước tất cả các nhóm khác: `sectionOrder` trong cấu hình VitePress không khai báo vị trí cho nhóm subsystem lẫn nhóm chứa trang Python SDK, `indexOf` trả về `-1`, nên chúng bị xếp trước mọi phân đoạn đã sắp xếp. Click vào mục điều hướng `参考` (Reference) sẽ đến trang architecture, mà mục sidebar của chính trang này lại là mục thứ 44 trong 62 mục, nằm ở vị trí 1549px trên sidebar cao 2478px — ngoài viewport. Bốn trang subsystem dùng giá trị `order` đã bị các trang khác trong cùng phân đoạn chiếm dụng, chỉ nhờ tính ổn định của `Array.prototype.sort` và thứ tự nối mảng manifest tình cờ đúng mà không bị xáo trộn.

Thanh top-bar trỏ `入门` (Getting started) đến `/guide/`, trong khi manifest đã publish trang chủ getting-started tại `guide/quickstart.md`, nên mục điều hướng đó trả về 404: đích điều hướng viết cứng sẽ lệch khỏi route thực sự được manifest publish.

Ngoài ra, mỗi trang canonical đều mang dòng viết cho người đọc trên GitHub — dòng chuyển đổi ngôn ngữ dưới tiêu đề, một số trang còn có badge repo — mà site chiếu nguyên các dòng đó lên, dù thanh điều hướng của nó đã cung cấp cả hai thứ này rồi.

## Quyết định

[website/docs.ts](../../../../website/docs.ts) sở hữu vị trí phân đoạn. `sections` khai báo từng nhóm theo locale, `sectionSpec(locale, label)` trả về vị trí và hành vi thu gọn của nhóm, và sẽ throw lỗi khi một locale chưa khai báo vị trí cho label đó. Nhóm không xuất hiện trong khai báo giờ sẽ làm build fail, thay vì âm thầm xếp lên đầu. Vị trí được khai báo theo locale, vì hai bên sidebar đặt tên nhóm khác nhau, và nhãn `SDK` dùng chung cho cả hai phía không thể vừa lấy cùng thứ tự tương đối so với `入门` vừa so với `Guide`.

Các trang subsystem được nhóm theo mối quan tâm — tổng quan, kernel và scope, session và persistence, model và context, execution và tool, policy và interaction, platform và tích hợp — trong đó sáu nhóm chủ đề giữ trạng thái thu gọn cho đến khi có một trang trong nhóm đó đang được đọc. Các nhóm này xếp cuối cùng trong sidebar reference: khi mở rộng, số lượng của chúng vượt qua tổng số mọi nhóm còn lại cộng lại, nên bất cứ nội dung nào xếp sau chúng chỉ có thể đến được bằng cách cuộn qua toàn bộ danh sách. `order` của trang được suy ra từ vị trí trong mảng, không còn viết tay số nữa.

`landingLink(locale, collection)` suy ra đích của mỗi mục điều hướng dựa trên `orderedPages` — chính là bộ sắp xếp mà sidebar dùng — nên mục điều hướng luôn mở trang đầu tiên đã publish của phân đoạn đó.

`projectedPageContent` trong [scripts/project-doc-site.ts](../../../../scripts/project-doc-site.ts) sẽ loại bỏ dòng chuyển đổi ngôn ngữ và badge repo. Việc khớp dòng chuyển đổi bị giới hạn trong tám dòng đầu, nên tutorial minh họa chính quy ước này vẫn render được ví dụ của nó.

Tiêu đề thanh điều hướng là wordmark DeepSeek được nhúng inline vào `siteTitle`, VitePress sẽ render nó dưới dạng HTML. Chính việc nhúng inline khiến fill `currentColor` của wordmark theo được theme hiện tại; `themeConfig.logo` render thành `<img>`, sẽ cố định wordmark theo màu khai báo trong file và cần chuẩn bị riêng một asset cho mỗi theme. Scrollbar sidebar bình thường không hiện, chỉ hiện khi cuộn, được đánh dấu bằng thuộc tính `data-` thay vì class, vì Vue sẽ ghi đè toàn bộ `class` khi patch element đó.

## Phương án thay thế từng cân nhắc

**Tùy chỉnh bộ tách từ tìm kiếm cho truy vấn tiếng Trung.** Đã triển khai rồi rút lại. Tiền đề của nó — rằng MiniSearch sẽ để nguyên văn xuôi tiếng Trung như một câu không thể tách được — được xác minh bằng một từ (`子代理`) hoàn toàn không tồn tại trong corpus; trang tiếng Trung viết `Subagent` và `子 agent`. Kiểm thử thực tế trên index chưa sửa đổi cho thấy `插件配置` trả về 120 kết quả, `会话持久化` 85, `工作流` 28, `沙箱` 12, và trang tương ứng của mỗi từ đều xếp đầu: `prefix: true` đã đủ để khớp từ tiếng Trung qua các token ngắn được tách bằng dấu câu. Bigram ký tự liền kề làm index tiếng Trung tăng từ 1.23MB lên 2.12MB mà không mang lại lợi ích gì. Lần thử này còn phơi bày một cạm bẫy đáng được ghi lại: VitePress dùng `Function.prototype.toString` để gửi hàm trong search option xuống browser, rồi dựng lại bằng `new Function`, nên bất kỳ hàm loại này tham chiếu hằng số cấp module trong closure sẽ throw lỗi trong scope rỗng, và âm thầm trả về không kết quả.

**Đặt nhóm subsystem ngay sau `概念` (Concepts).** Đã bác bỏ: cách này đưa trang architecture về đầu, nhưng generated reference, Cordis API và development handbook vẫn nằm dưới 43 dòng.

**Viết lại chữ liên kết tên file khi projection.** Bảng chỉ mục subsystem viết `[core.md](core.md)`, khi lên site đọc như một chỉ mục file của repo. `scripts/project-doc-site.spec.ts` khẳng định đúng định dạng chính xác của dòng này, nên các tên file này là quy ước có chủ đích chứ không phải sơ suất; muốn đổi nội dung hiển thị trên site thì phải đổi cả quy ước lẫn gate của nó, chứ không né tránh chúng trong projector.

## Ảnh hưởng

Khi mọi nhóm subsystem đang thu gọn, sidebar reference cao 1452px, trước đây là 2478px, và trang architecture là mục đầu tiên của nó. Vị trí phân đoạn và hành vi thu gọn được khai báo trong cùng một manifest, không còn tản mát giữa manifest và cấu hình; `scripts/project-doc-site.spec.ts` cố định ba bất biến: mỗi trang có sidebar đều phân giải được vị trí, phân đoạn chưa khai báo sẽ bị từ chối, và không có hai trang nào trong cùng phân đoạn dùng chung `order`.

Việc lược bỏ chrome không thay đổi Markdown canonical — dòng chuyển đổi và badge vẫn phục vụ người đọc trên GitHub. Cái giá phải trả là projector giờ biết về hai quy ước trình bày của corpus nguồn, và trang nào dùng cách diễn đạt dòng chuyển đổi khác đi sẽ không được khớp.

Wordmark là bản sao thứ hai của cùng một hình ảnh, hai bản còn lại nằm ở `apps/web/public/favicon.svg` và `packages/client/ui-primitives/src/FishLogo.tsx`, mỗi bản mang cách trình bày riêng. Thay đổi wordmark DeepSeek chỉ đến được trang tài liệu thông qua việc cập nhật bản sao này.
