# Agent Note: Thống nhất tương tác mở rộng hàng công cụ Web và Inspect trajectory

Status: implemented

[English](2026-07-30-web-tool-row-unified-expand-and-inspect.md) | Tiếng Việt

## Vấn đề

Tương tác của hàng công cụ trong khung nhìn chat đã phân mảnh thành nhiều phương ngữ khác nhau: ToolRow bật/tắt mở rộng qua biểu tượng dẫn đầu và chỉ áp dụng cho lời gọi có args body, ví dụ bash lại có cách mở rộng riêng, hàng todo / ask-question chỉ mở rộng được args thô, công cụ đơn tệp thì hoàn toàn không mở rộng được, còn OUTPUT của lời gọi chỉ xem được qua panel chi tiết. Lệnh bash thất bại (exit≠0 nhưng kết toán thành `isError:false`) không có bất kỳ tín hiệu thất bại nào trên hàng đã thu gọn. Ngoài ra hàng chat không có lối vào để nhảy tới bản ghi trajectory, và việc chuyển chat → trajectory → chat làm mất vị trí đang đọc (vòng tab sẽ unmount khung nhìn không hoạt động).

## Quyết định

**Mọi hàng công cụ mở rộng được đều dùng chung một tương tác — cả hàng chính là công tắc (click / Enter / dấu cách), biểu tượng chuyển dần thành chevron khi hover để xem trước — và cùng một thân mở rộng: thẻ có nhãn IN/OUT ở cột bên, mỗi phân khu có giới hạn cuộn độc lập; viên nang Inspect hiện khi hover sẽ nhảy tới bản ghi trajectory của lời gọi đó thông qua một lần bàn giao dùng-một-lần của store; khung nhìn chat dùng một Map theo phiên nằm trong bộ nhớ để giữ vị trí đọc theo ngữ nghĩa khi chuyển khung nhìn.**

- Ngoài args, `toolRowModel` đồng thời phái sinh vật liệu kết quả: `output` (logic làm phẳng `resultText` được chuyển từ DetailsPanel vào contract) và `errorSummary` (dòng đầu tiên của lỗi, dùng làm tóm tắt khi thu gọn và hiển thị bằng màu lỗi). Hàng nào có body, output hoặc vật liệu terminal đều mở rộng được; bản thân hàng là công tắc (`role="button"`, `aria-expanded`), phần tóm tắt đường dẫn tệp giữ nguyên là liên kết độc lập nhờ `stopPropagation`.
- Thẻ mở rộng (figma 1249:35657) là cột phân khu IN/OUT: mỗi phân khu là một vùng cuộn độc lập (max-height 150px), nhãn cột bên được ghim sticky, đường phân cách l2 kéo ngang toàn bộ chiều rộng thẻ. Văn bản suy luận của Think và CodeBlock của run_code vẫn giữ thân không phải thẻ; phần chèn ngữ cảnh tái sử dụng hàng này và mở rộng bằng thẻ `plainBody` không nhãn.
- `terminalFailed` đọc trạng thái thoát của thẻ terminal đã kết toán, cho phép BashRow và GenericToolCard hiển thị lệnh thất bại thành chấm trạng thái đỏ của hàng — đây là tín hiệu thất bại duy nhất trên hàng thu gọn, vì bản thân lời gọi kết toán thành `isError:false`.
- Dải banner của TerminalBlock được nhập vào cùng một mô hình đọc: dùng chung một bề mặt với thẻ (không còn dùng banner token), ngăn cách với phần thân bằng một đường mảnh l2, cột lệnh giới hạn 150px cuộn bên trong, các control sao chép/trạng thái được ghim sticky và canh đỉnh theo dấu nhắc dòng đầu tiên.
- Inspect: `ToolCallOwnerProps.inspect` (không cung cấp cho hàng không có danh tính lời gọi) render viên nang trong luồng bố cục bình thường ở góc dưới bên trái của thân mở rộng, hiện ra khi hover vào bất kỳ vị trí nào của lời gọi công cụ. Click sẽ ghi `{ callId }` vào trường `inspect` dùng-một-lần của chat store rồi chuyển sang khung nhìn trajectory; TrajectoryTable tìm được bản ghi, mở phần tóm tắt của nó, và xác nhận bằng cách xóa trắng trường đó.
- Giữ vị trí cuộn: mỗi lần cuộn không dính đáy, khung nhìn chat lưu `{ anchorKey, anchorTop, scrollTop }` vào Map theo phiên trong phạm vi apply, và phơi ra dưới tên `chatScroll`; khi mount lại thì trước hết dùng `scrollTop` để tới cửa sổ gần đúng, sau đó hiệu chỉnh theo chênh lệch hình chữ nhật của mỏ neo node／call ổn định, nhờ vậy sau khi bố cục dồn lại theo chiều rộng thì cùng một dòng đang đọc vẫn nằm nguyên chỗ cũ. Mọi lối dính đáy, kể cả «về cuối», đều xóa mục đó một cách đồng bộ trước khi chuyển tab hoặc chuyển phiên. Map vẫn cố ý không được lưu bền — lần tải trang mới giữ nguyên hành vi mặc định là mở ra thì dính đáy.

## Các phương án đã cân nhắc

**Giữ công tắc ở biểu tượng dẫn đầu và để mỗi bên đăng ký có cách mở rộng riêng.** Bị bác: ba bề mặt đã phân hóa; tư thế của bên đăng ký (ví dụ bash sao chép CSS tại chỗ) có nghĩa là trừ khi bản thân quy ước tương tác được thống nhất và đủ nhỏ — cả hàng là công tắc cộng xem trước khi hover — thì độ trôi sẽ tồn tại vĩnh viễn.

**Truyền Inspect qua URL hoặc qua prop của khung nhìn trajectory.** Bị bác: vòng khung nhìn được render qua registry slot, hai khung nhìn không có cha chung để mang prop; chat store vốn đã vắt ngang ranh giới đó, và trường dùng-một-lần khiến việc bàn giao an toàn khi phát lại (ảnh chụp đã lưu bền từ trước khi có trường này sẽ được ngậm nước lại bằng `?? null`).

**Lưu bền độ lệch cuộn của chat.** Bị bác: khôi phục một độ lệch từ vài ngày trước vào một phiên đã lớn lên thì đọc như một bug; Map trong bộ nhớ giới hạn trí nhớ đúng vào tình huống chuyển khung nhìn — nơi vị trí thực sự bị mất.

**Lấy riêng OUTPUT mở rộng cho từng hàng từ vật liệu của panel chi tiết.** Không cần thiết: node kết quả đã kết toán vốn đã nằm trên lát cắt lời gọi đóng băng của ảnh chụp, và việc làm phẳng `resultText` ở tầng contract cho phép hàng và panel dùng chung một bản phái sinh.

## Hệ quả

Các khung nhìn dựng sẵn của ui-tool đều kiểm tra được đầu vào và đầu ra ngay tại chỗ, còn panel chi tiết và trajectory vẫn là giao diện tra sâu. Tương tác `ToolRow` dùng chung là chi tiết cài đặt nội bộ của ui-tool; khung nhìn nguyên tử bên ngoài nhận `ToolCallViewProps` và có thể phơi callback `inspect` trong đó qua chrome của riêng mình. Khung nhìn bash vẫn giữ CSS riêng, nên thay đổi tương tác trong tương lai vẫn cần đồng bộ tường minh. `--dsw-font-markdown-code-block-small` (12/18) là token bổ sung thủ công, sẽ thay thế khi nền tảng thiết kế xuất ra. Bản sửa `distIndex` của web-cordis (nối chuỗi thuần thay vì URL.pathname) đã gỡ bỏ vấn đề không khởi động được bản xem trước khi cwd chứa dấu cách.
