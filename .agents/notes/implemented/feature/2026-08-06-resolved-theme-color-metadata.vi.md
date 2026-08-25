# Agent Note: Metadata màu dựa trên theme đã được phân giải

Status: implemented

[English](2026-08-06-resolved-theme-color-metadata.md) | Tiếng Việt

## Vấn đề

Web client có thể phân giải theme độc lập với tuỳ chọn của hệ điều hành, vì vậy một giá trị `theme_color` duy nhất trong manifest (bản kê khai metadata) hoặc metadata tĩnh kèm điều kiện media có thể không khớp với lựa chọn Light hay Dark được chỉ định tường minh. Khi đó, dù là trang đã cài đặt hay trang thông thường, giao diện trình duyệt bao quanh chưa chắc đã đồng nhất với giao diện ứng dụng, mặc dù bộ trình bày bố cục vốn đã nắm bảng màu document sau khi phân giải.

## Quyết định

`ThemePresenter` của ui-layout sở hữu một `<meta name="theme-color">`, song song với `color-scheme` trên phần tử gốc, thuộc tính bảng màu tối và việc ghi token nội tuyến. Sau khi áp dụng bảng màu và các giá trị ghi đè token của snapshot đã phân giải, bộ trình bày đọc `background-color` trong computed style của body, ghi vào phần tử metadata đó, rồi chèn node này vào document head. Các snapshot tiếp theo sẽ cập nhật chính node đó, còn khi giải phóng tài nguyên thì node bị gỡ bỏ.

Nền body sau khi render vẫn là nguồn sự thật về màu. PWA manifest không chứa `theme_color` hay `background_color` tĩnh, và `ThemeDefinition` cũng không thêm trường màu thứ hai có thể lệch khỏi bảng màu token. Nhờ vậy, token nền cơ sở của theme đã đăng ký cũng tác động lên giao diện trình duyệt qua đúng con đường ứng dụng mà giao diện trang đang dùng.

## Kiểm chứng

Unit test của bộ trình bày quy ước phủ màu tính toán ở chế độ sáng và tối, việc tái sử dụng node và việc giải phóng tài nguyên. Test tổ hợp ui-layout phủ lần chèn đầu tiên, việc tái sử dụng do sự kiện kích hoạt và quá trình dọn dẹp fiber. Kịch bản thiết lập trên trình duyệt Web lần lượt chạy qua Light, Dark, System, thay đổi tuỳ chọn hệ điều hành và tải lại thông qua tổ hợp thực tế được bàn giao, đồng thời khẳng định trang luôn chỉ có một phần tử metadata, nội dung của nó bằng nền body đã tính toán và console không có lỗi. Thay đổi metadata này không xuất hiện trong đầu ra cây trợ năng sau khi render, nên đầu ra kỳ vọng hiện có của kịch bản vẫn giữ nguyên.

## Các phương án từng cân nhắc

**Đặt `theme_color` trong manifest.** Manifest chỉ có thể cung cấp một giá trị áp dụng cho toàn bộ ứng dụng, nên bất kỳ bảng màu tích hợp nào cũng có thể không khớp với nó; manifest cố ý bỏ qua trường này.

**Khai báo metadata sáng và tối bằng media query `prefers-color-scheme`.** Media query đi theo hệ điều hành chứ không theo lựa chọn tường minh trong ứng dụng, nên không thể biểu diễn tuỳ chọn sau khi phân giải.

**Thêm trường `themeColor` cho mỗi `ThemeDefinition`.** Một giá trị riêng cho phép theme tuỳ biến chọn màu giao diện trình duyệt một cách độc lập, nhưng lại nhân bản màu nền cơ sở và cho phép trang lệch khỏi giao diện trình duyệt bao quanh. Nếu một theme được hỗ trợ cần đến sự khác biệt có chủ đích như vậy, có thể đưa vào trường riêng sau.

## Hệ quả

Trình duyệt hỗ trợ metadata này sẽ cập nhật giao diện bao quanh tại snapshot phân giải đầu tiên của client và ở mỗi lần theme thay đổi sau đó; trình duyệt không hỗ trợ `theme-color` sẽ bỏ qua metadata này. Vì giá trị đến từ kết quả trình bày đã tính toán, client phải bảo đảm body luôn có màu nền rõ ràng. Bộ trình bày tự tạo và gỡ node của mình, còn các metadata không liên quan trong head vẫn giữ nguyên.
