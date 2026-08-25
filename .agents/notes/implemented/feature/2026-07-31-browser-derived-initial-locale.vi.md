# Agent Note: Ngôn ngữ trong Settings khi mở bằng trình duyệt hoàn toàn mới do trình duyệt quyết định

Status: implemented

[English](2026-07-31-browser-derived-initial-locale.md) | Tiếng Việt

## Problem

Hàng ngôn ngữ trong Settings luôn khởi đầu bằng tiếng Trung ở mọi lần truy cập đầu tiên: `LocaleRuntime` đọc `dsh.locale` từ localStorage, đọc không được thì rơi thẳng về `zh`. Trình duyệt vốn đã khai báo người dùng của nó đọc những ngôn ngữ nào — `navigator.languages` chính là bản khai báo đó — mà ứng dụng lại làm ngơ, thành ra độc giả tiếng Anh đâm đầu vào một sản phẩm tiếng Trung, còn phải tìm cho ra một mục cài đặt có nhãn tiếng Trung mới thoát ra được. Khi đó giá trị rơi về đảm nhiệm hai vai trò cùng lúc: vừa là chốt cuối khi không phân giải được locale, vừa là câu trả lời cho mọi người dùng chưa từng chọn gì.

## Decision

**Locale tạm thời được phân giải qua trình duyệt trước, rồi mới tới `FALLBACK_LOCALE`; tùy chọn Host tường minh sẽ thay thế nó theo thời gian thực.** Hàm `resolveInitialLocale()` trong `packages/client/locale/src/client/index.ts` chạy lúc khởi tạo service và diễn đạt đúng thứ tự trình duyệt／rơi về. Sau đó, vòng đời settings không chặn sẽ áp dụng `locale.preference` tùy chọn trong `$DSH_HOME/settings.yaml`; nếu giá trị này vắng mặt thì tiếp tục dùng giá trị phái sinh từ trình duyệt.

**Việc khớp trình duyệt tiến hành theo thẻ con chính và duyệt hết danh sách có thứ tự.** `detectBrowserLocale()` duyệt `[...(navigator.languages ?? []), navigator.language]`, trả về mục đầu tiên có thẻ con chính khớp với một locale đang được cung cấp, do đó `zh-Hans-CN` và `zh-TW` cùng quy về `zh`, `en-GB` quy về `en`; còn trình duyệt chỉ yêu cầu những ngôn ngữ mà ứng dụng này không cung cấp (`fr`, `de`) thì không khớp được gì cả, và `FALLBACK_LOCALE` tiếp quản. `navigator.language` xếp sau danh sách và hứng những host không có `languages` trên Navigator — thư viện DOM chú thích nó là chắc chắn tồn tại, nên sự dung thứ này kèm một ngoại lệ lint khẩu độ hẹp, cùng nguồn gốc với sự không tin tưởng ranh giới môi trường mà lớp bảo vệ `localStorage` diễn đạt.

**Phán định trình duyệt dùng `window` chứ không dùng `navigator`.** Node ≥ 21 phơi ra `navigator` toàn cục và báo cáo ngôn ngữ của chính máy (trên CI runner là `en-US`), nên nếu gác cửa bằng `navigator` thì khi node khởi động cây client sẽ phân giải thành `en`, chứ không phải giá trị rơi về mà tài liệu quy ước. Gác cửa bằng `window` khiến mọi lần chạy ngoài trình duyệt đều dừng ở `FALLBACK_LOCALE`.

**Lựa chọn tường minh có tính bền vững.** `setLocale` ghi qua Host settings API, nhờ vậy người dùng đã chọn ngôn ngữ giữ được lựa chọn của mình qua các origin trình duyệt khác nhau và các ngôn ngữ hệ thống khác nhau cùng chia sẻ một DSH home. Không đoạn mã nào ghi ngược locale đã dò được: việc dò được suy ra lại mỗi lần khởi động, và luôn vô hình đối với câu hỏi «người dùng đã từng chọn hay chưa».

**Làn e2e trình duyệt ghim cứng ngôn ngữ trình duyệt.** Những kịch bản khẳng định văn án tiếng Trung (`access-confirmation`, `models-settings`, `onboarding-deepseek-config`, `settings-chrome`) mở trang bằng `locale: ZH_BROWSER_LOCALE` của `apps/web/tests/support.ts`; `newEnglishPage` khai báo `en-US`. `settings-chrome.e2e.ts` dùng một Host home hoàn toàn mới không có locale tường minh, khẳng định rằng trình duyệt tiếng Anh của nó sẽ sinh ra giao diện settings tiếng Anh: đây là bằng chứng của tính năng này trong ứng dụng đã lắp ráp.

## Alternatives considered

- **`Intl.DateTimeFormat().resolvedOptions().locale` hoặc chỉ đọc `navigator.language`**: cả hai đều bóp danh sách ưu tiên có thứ tự của người dùng xuống một thẻ duy nhất, thành ra độc giả có `['de', 'en', 'zh']` nhận được zh chứ không phải en. Chính danh sách mới là phần đáng đọc nhất trong bản khai báo của trình duyệt.
- **Lưu bền kết quả dò ngay lần khởi động đầu tiên**: điều đó biến việc dò thành một sự kiện một-lần, để một lần truy cập đầu tiên đã cũ lấn át ngôn ngữ trình duyệt thay đổi về sau, đồng thời phá hủy chính sự phân biệt mà cả thứ tự phân giải dựa vào — giá trị đã lưu sẽ không còn mang nghĩa «người dùng đã chọn nó».
- **Thương lượng BCP 47 đầy đủ (tra cứu kiểu `Intl.LocaleMatcher`, trọng số vùng và chữ viết)**: khi chỉ cung cấp hai locale khác hẳn nhau, khớp theo thẻ con chính đã là toàn bộ câu trả lời đúng; tầng thương lượng chỉ mang lại diện tích bề mặt không có hành vi chống lưng và cũng không thể kiểm thử.
- **Thêm một khóa cấu hình Cordis cho locale mặc định**: ở đây các bản triển khai không khác nhau — giá trị rơi về là câu trả lời của sản phẩm cho tình huống «hoàn toàn không có tín hiệu», không phải một núm vặn. Chính sách kho mã dành trường `Config` cho những lựa chọn có bên tiêu thụ hiện tại và thay đổi theo bản triển khai.
- **Để các kịch bản tiếng Trung của làn e2e tiếp tục ghim mục lưu trữ (`dsh.locale=zh`)**: cách đó giữ bộ kiểm thử xanh, nhưng xóa mất chỗ duy nhất mà đường suy ra từ trình duyệt thực sự chạy trong ứng dụng đã lắp ráp; chuyển sang ghim ngôn ngữ trình duyệt mới diễn tập được quy trình phân giải mới theo kiểu đầu-cuối.

## Consequences

- Lần truy cập đầu tiên từ trình duyệt tiếng Anh rơi vào giao diện tiếng Anh, còn hàng ngôn ngữ vẫn trình bày đúng hai tùy chọn tự xưng bằng chính ngôn ngữ của chúng, lối thoát theo cả hai chiều đều không đổi.
- `FALLBACK_LOCALE` thu hẹp trở về đúng chức trách thật của nó — rơi về từ điển và câu trả lời khi không có tín hiệu — chứ không kiêm nhiệm nghĩa «người dùng chưa chọn».
- Các bài kiểm thử khởi tạo `LocaleRuntime` dưới jsdom nay phụ thuộc vào `navigator` của môi trường: những ca khẳng định văn án đã bản địa hóa khai báo trình duyệt của mình bằng một dòng `usePinnedBrowserLanguages('zh-CN')` ở cấp suite (dsh-client-test-runtime), và về sau mọi ca khẳng định giá trị mặc định cũng vậy. Các ca của chính gói này gá thẳng vào biến toàn cục, vì chúng cần những hình thái mà helper kia cố ý không diễn đạt (thiếu `languages`, danh sách tách rời khỏi `language`, hoàn toàn không có `window`).
- Cái giá của việc dò là duyệt một mảng mỗi lần khởi tạo service, và không ghi ngầm vào settings; sau khi plugin kích hoạt, tùy chọn Host tường minh có thể gây một lần hội tụ theo thời gian thực.
