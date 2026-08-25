# Agent Note: Thẻ preset tự cắt bớt mô tả của mình, thay vì để mô tả quyết định chiều cao của cả danh sách

Status: implemented

[English](2026-08-11-preset-card-description-clamp.md) | Tiếng Việt

## Vấn đề

preset tự phát hành `description`, độ dài không giới hạn, trong khi phân khu settings render danh sách thành lưới thẻ. Mô tả chỉ có `min-height` mà không có giới hạn trên, còn lưới thì bố trí hàng bằng `grid-auto-rows: 1fr` — giá trị này khiến mỗi hàng ngầm định có chiều cao bằng nhau, chứ không chỉ riêng hàng chứa thẻ cao. Vì vậy một mô tả dài sẽ quyết định chiều cao của cả danh sách: khi nhóm tùy chỉnh chứa một mô tả dài 250 ký tự, cả bốn thẻ đều đo được 421px, thẻ có mô tả ngắn bị lấp đầy bởi một mảng khoảng trắng lớn.

Mô tả đồng thời cũng là trường phân biệt các preset, nên không thể ẩn đi; thẻ vừa phải đặt giới hạn trên cho nó, vừa phải giữ cho toàn bộ nội dung vẫn có thể truy cập được.

## Quyết định

Mô tả được cắt còn bốn dòng, phần còn lại hiển thị qua `Tooltip` dùng chung, và chỉ mount khi phần tử thực sự tràn (`scrollHeight > clientHeight`, đo lại qua ResizeObserver vì chiều rộng panel settings thay đổi theo cửa sổ). Cách này nhất quán với dòng thống kê chat: nó cũng cắt còn một dòng theo cùng quy tắc "đo trước rồi mới mount".

Chiều cao thẻ vẫn là giá trị suy ra chứ không cố định. Sau khi mô tả có giới hạn trên, bản thân `grid-auto-rows: 1fr` đã làm cho lưới có chiều cao bằng nhau, còn thẻ chứa lý do hỏng hoặc danh mục đã hiển thị vẫn có thể định chiều cao theo nội dung của chính nó — nếu ghi cứng chiều cao theo pixel thì sẽ cắt mất cả hai trường hợp này.

Kéo theo ba quyết định nhỏ hơn:

- `.cardId` dùng `margin-top: auto` để chiếm phần không gian dư của thẻ, mô tả không còn bị kéo giãn nữa. Một hộp bị flex kéo giãn sẽ khiến chiều cao cắt không khớp với chiều cao hộp; để hộp bị cắt chỉ định kích thước theo nội dung thì hành vi không còn phụ thuộc vào tương tác này.
- Mô tả mang `title=""`. `title` rỗng có nghĩa là phần tử đó không có thông tin gợi ý, việc tra cứu dừng lại ở đó, nên tooltip gốc của thân thẻ sẽ không tìm ngược lên mô tả nữa — mô tả bị cắt chỉ phản hồi một bong bóng chứ không phải hai.
- `Tooltip` thêm `maxWidth` tùy chọn. Giới hạn nửa viewport mặc định của nó sẽ khiến mô tả render thành một khối rộng hơn cả popup settings chứa nó, tràn ra giao diện ứng dụng phía sau.
- `Tooltip` đồng thời lật `top` hoặc `bottom` của bong bóng sang phía kia khi viewport không đủ chỗ chứa, trước đây nó chỉ thu hẹp theo chiều ngang. preset tùy chỉnh nằm ở cuối danh sách, lại thường chứa mô tả dài nhất, nên tình huống thường gặp chính là một bong bóng cao treo dưới một điểm neo nằm gần đáy trang. Việc lật chỉ dịch về phía thực sự đủ chỗ, khi cả hai phía đều không đủ chỗ thì giữ nguyên vị trí đã yêu cầu chứ không dao động qua lại; nếu đổi thành trượt theo chiều dọc thì sẽ che mất văn bản đang đọc.

Đối với hàng danh sách không qua được kiểm tra hình dạng, nhãn hiệu đổi từ `Broken` (`đã hỏng`) thành `Failed to load` (`tải thất bại`). discovery đặt `broken` khi file lắp ráp bị thiếu, không đọc được hoặc sai định dạng — trường hợp phổ biến nhất là người dùng vừa sửa hoặc xóa file — nên khẳng định "đã hỏng" là vượt quá sự thật quan sát được, trong khi lý do hiển thị nguyên văn bên dưới nhãn hiệu vốn đã nêu rõ file và cách sửa.

## Phương án thay thế

- **Ghi cứng chiều cao thẻ.** Diễn đạt trực tiếp ý định, nhưng sẽ cắt mất hai hàng vốn dĩ có chiều cao thay đổi: hàng lý do của preset hỏng và danh mục preset đã hiển thị.
- **Dùng thuộc tính `title` gốc để chứa mô tả đầy đủ.** Không cần đo đạc cũng không cần component, đổi lại là độ trễ khoảng một giây, style của hệ điều hành, và thay thế gợi ý "Set as default" ở phần lớn diện tích thẻ.
- **Mount tooltip vô điều kiện.** Bỏ được ResizeObserver, đổi lại là khi con trỏ dừng trên mô tả ngắn sẽ bật ra một bong bóng lặp lại nội dung thẻ đã có.
- **Mở rộng phần bị cắt khi hover.** Hiển thị văn bản tại chỗ, nhưng lại làm lưới dịch chuyển vị trí ngay dưới con trỏ.

## Hậu quả

Phân khu có thêm một component nhỏ kèm đo đạc, primitive dùng chung có thêm một prop tùy chọn. Đổi lại: chiều cao của mọi thẻ không còn phụ thuộc vào mô tả dài nhất trong danh sách; việc cắt bớt do CSS đảm nhiệm chứ không cắt ngắn văn bản, mô tả đầy đủ luôn còn trong accessibility tree.

Tác dụng ức chế của `title=""` được chốt bằng một assertion DOM, chứ không thông qua quan sát tooltip gốc: tooltip của trình duyệt vẽ ngoài trang, không thể bắt được. Nếu sau này một trình duyệt nào đó lại tra cứu tiếp lên trên bất chấp `title` rỗng, phương án dự phòng là bỏ `title` khỏi thân thẻ — nội dung của nó đã có trong `aria-label` của thân thẻ.

## Kiểm thử

Test trong package bao phủ ba kết quả đo (bị cắt, đủ chỗ, runtime không có `ResizeObserver`) cùng giới hạn chiều rộng của tooltip. Web e2e golden, ngoài `damaged.expected.md` được ghi lại theo văn bản nhãn hiệu mới, các trường hợp còn lại phát lại nguyên trạng và pass.
