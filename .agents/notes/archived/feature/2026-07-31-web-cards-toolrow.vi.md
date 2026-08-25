# Agent Note: Hàng tool của thẻ thu gọn qua cùng một ToolRow

Status: implemented
Archived: 2026-08-07

[English](2026-07-31-web-cards-toolrow.md) | 中文

## Vấn đề

Web client đã phát triển năm ý định render thẻ liên tiếp qua vài PR — terminal, diff, read, search, web — mỗi loại được đăng ký như một mục toolview có khóa (keyed) nằm dưới `packages/client/ui-conversation/src/client/toolviews/`. Chúng phân kỳ ở hai điểm mà mỗi PR trước đó đều thừa nhận nhưng trì hoãn xử lý:

- **Chrome trùng lặp.** `read-row`, `search-row`, `web-row`, `file-mutation-row` mỗi cái tự vẽ tay hàng tóm tắt (khe trạng thái đầu hàng, trạng thái ẩn thị giác, tiêu đề, dấu chấm ngăn cách, liên kết đường dẫn/tóm tắt) thành `<div className={css.root}>` riêng của mình, kèm một `.module.css` riêng, thay vì tổ hợp `ToolRow` dùng chung. `read-row` mang một đánh dấu `jscpd:ignore`, chỉ ra rõ phần trùng lặp này và trỏ đến "một thay đổi độc lập xử lý một lần cho mọi hàng" — chính là thay đổi lần này.
- **Thường trực vs thu gọn.** Bốn hàng đó giữ thẻ (`ReadBlock`/`SearchBlock`/`WebBlock`/`DiffBlock`) thường trực bên dưới tóm tắt — luôn mở rộng — trong khi thẻ terminal (qua `GenericToolCard`/`BashRow`) và mỗi hàng văn bản đều bắt đầu từ trạng thái thu gọn, ẩn sau việc mở rộng cả hàng của ToolRow. Một cuộc hội thoại có nhiều lệnh gọi read/search/web/edit trở thành một bức tường thẻ luôn mở, trái với mục đích của luồng message như một mặt phẳng tóm tắt.

## Quyết định

`ToolRow` sở hữu mọi loại thẻ, còn mỗi hàng thẻ có khóa đều tổ hợp nó. ToolRow vốn đã nhận vật liệu thẻ `terminal` và `diff`; giờ còn nhận `read`, `search`, `web`, render bằng primitive tương ứng trong body mở rộng mặc định thu gọn của nó cho loại nào đang tồn tại (cắt theo giới hạn `CHAT_*` của chat). Một lệnh gọi mang tối đa một loại thẻ, nên các prop này loại trừ lẫn nhau, body lấy cái đầu tiên tồn tại.

Bốn hàng có khóa — `ReadRow`, `SearchRow`, `WebRow`, `FileMutationRow` — bỏ chrome vẽ tay và CSS riêng, trở thành tổ hợp `ToolRow` mỏng, hệt như `AskQuestionRow`: suy diễn model thẻ, truyền vào làm prop ToolRow tương ứng, chuyển tiếp `filePath`/`onOpenFile` cho tool file, chuyển tiếp `output`/`errorSummary` cho đường thất bại không có thẻ. Mỗi hàng giờ là `ToolRowProps & PropsLocale<'conversation'>` và đăng ký với `locale: NS`, vì ToolRow cần `t` của conversation để render văn bản body terminal/code của nó. `GenericToolCard` (fallback tại điểm render) làm điều tương tự cho read/search/web, nên một tool khai báo thẻ nhưng không có hàng khóa riêng của mình cũng thu gọn theo cùng cách.

Vùng Output của `DetailsPanel` không đổi: panel là mặt phẳng đọc cho một lệnh gọi đơn, nên nó render thường trực từng thẻ ở chiều cao đầy đủ của primitive, và search bị cắt bớt cũng để lại footnote khôi phục ở đó.

## Hệ quả

- Mọi hàng tool chia sẻ chung một bộ tương tác mở rộng: khi thu gọn là tóm tắt một hàng, chuyển đổi cả hàng để hiện thẻ. Thẻ không nằm trong DOM trước khi mở rộng (`DisclosureRow` chỉ render `children` khi mở), nên test khẳng định "trước không có sau có" xoay quanh một lần click `[data-expandable]`.
- Đã xóa: `read-row.module.css`, `search-row.module.css`, `web-row.module.css`, `file-mutation-row.module.css`, `GenericToolCard.module.css`. Các hàng này không còn CSS riêng; module của ToolRow sở hữu thụt lề của chrome và thân thẻ.
- Đường thất bại không có thẻ (edit lỗi, search lỗi/lồng nhau/log cũ) không còn tự vẽ `<div>` `.failure`/khôi phục riêng; chúng chuyển sang dùng `output` (vùng Output) và `errorSummary` (dòng đầu tóm tắt khi thu gọn) của ToolRow, mục sau đã dùng `error.name: error.code` để fallback làm phẳng văn bản kết quả.
- `bash-sample` cố ý giữ chrome mở rộng cục bộ riêng (mẫu ở tư thế bên thứ ba, không bao giờ đưa vào domain chat); nó vốn đã thu gọn, nên hành vi không đổi.

## Các phương án thay thế đã cân nhắc

- **Giữ hàng thường trực, chỉ thống nhất chrome.** Bị từ chối: yêu cầu của người dùng là thu gọn mặc định, còn thẻ thường trực chính là nguyên nhân khiến luồng không thể quét đọc được.
- **Thêm một lớp wrapper `CardRow` dùng chung giữa hàng và ToolRow.** Bị từ chối: một khi ToolRow nhận mọi loại thẻ, bản thân nó chính là lớp wrapper đó; thêm một lớp nữa là trích xuất sớm mà quy tắc package đã cảnh báo.
