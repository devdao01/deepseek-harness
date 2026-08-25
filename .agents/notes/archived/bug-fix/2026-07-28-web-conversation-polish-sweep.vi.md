# Agent Note: Tinh chỉnh hiển thị UI hội thoại Web

Status: implemented
Archived: 2026-08-07

[English](2026-07-28-web-conversation-polish-sweep.md) | 中文

## Vấn đề

Một lượt đánh giá thiết kế nhắm vào giao diện hội thoại của web GUI đã phát hiện một loạt lỗi hiển thị: menu portal vẽ một khung hình ở sai vị trí trước khi được định vị lại (gây giật hình khi mở); chỉ cần một tin nhắn bước (step message) nào đó chỉ mang phần header của lệnh gọi công cụ, cột chat sẽ tách một lần chạy công cụ thành nhiều nhóm; phần tóm tắt dòng công cụ in ra đường dẫn tuyệt đối gốc từ workspace, chiếm phần lớn không gian trên dòng; hiệu ứng quét sáng của dòng đang chạy được thực hiện bằng alpha mask, làm tối cả dòng; chip workspace ở khu vực hero khôi phục lại tên thư mục của workspace đã bị xóa từ cwd của phiên; thanh tiêu đề còn hiển thị một bộ đếm lượt (turn) cạnh tiêu đề 13px mà không ai cần.

## Quyết định

Đợt sửa lỗi này chỉ thay đổi tầng hiển thị; sẽ không có nội dung nào được ghi vào session log.

- **Menu portal render trước ở trạng thái ẩn, hoàn tất đo đạc trước khi vẽ.** Danh sách menu được mount với `visibility: hidden` tại (0,0), được đo trong `useLayoutEffect`, và khi hiển thị đã ở vị trí cuối cùng. Menu giữ khoảng cách 12px với viewport và hỗ trợ cuộn nội bộ; thao tác tạo workspace được cố định ở vùng footer không cuộn.
- **Luồng chat bỏ qua các node assistant không render nội dung nào.** Node assistant đã hoàn tất (finalized) nếu các block của nó chỉ chứa header lệnh gọi công cụ cùng nội dung text/reasoning (suy luận) rỗng, sẽ bị loại khỏi phần suy luận luồng, nhờ đó các kết quả công cụ liên tiếp được gộp thành một nhóm. Các node bị gián đoạn luôn được render (chúng mang nhãn "đã dừng").
- **Tóm tắt dòng công cụ chuyển đường dẫn gốc từ workspace thành đường dẫn tương đối.** cwd của phiên được truyền qua từng lớp bằng hợp đồng slot toolview (`ToolRowOwnerProps.cwd`), và `toolRowModel` cắt bỏ tiền tố này khỏi các tóm tắt bắt đầu bằng nó; các đường dẫn nằm ngoài workspace giữ nguyên. Điều này chỉ ảnh hưởng đến hiển thị: tham số công cụ và log đều không bị tác động.
- **Hiệu ứng quét sáng khi đang chạy đổi thành lớp phủ dải highlight.** Một dải gradient `::after` có độ rộng cố định quét ngang qua toàn dòng (tức mô hình ShimmerText của deepsuite), thay cho phương án `mask-image` trước đây, đã được thay thế ở cả ToolRow và Bash toolview.
- **Chip workspace ở khu vực hero là bộ chọn (selector), không phải bản echo.** Khi không có lựa chọn hợp lệ nào (khởi động nguội, hoặc workspace bị xóa sau khi danh sách đã ổn định), nó hiển thị văn bản placeholder "Choose workspace"; tên suy ra từ cwd chỉ dùng để nối tiếp lần tải đầu tiên của danh sách, và khi workspace tương ứng với lựa chọn đang chờ xác nhận biến mất khỏi danh sách đã sẵn sàng, lựa chọn cũ đó sẽ bị xóa bỏ.
- **Thống nhất về nhịp dọc 16px.** Khoảng cách giữa các dòng trong cột chat và giữa các dòng công cụ trong một nhóm được thống nhất thành 16px, thay cho cách làm trước đây là "khoảng cách 10px trong nhóm cộng với margin âm giữa các nhóm".
- **Chữ tiêu đề đổi thành 14/20, thanh tiêu đề bỏ bộ đếm lượt (turn)**; trạng thái đang chạy của StateDot và phần đuôi lượt sử dụng ngôn ngữ hình ảnh loading kiểu pixel-chase tiến từng ô một; `body` bật khử răng cưa thang xám (`-webkit-font-smoothing` và thiết lập tương đương của Firefox trên macOS).

## Các phương án thay thế đã cân nhắc

- **Định vị menu đồng bộ theo hình chữ nhật của anchor trước khi mount.** Không chấp nhận: kích thước tự thân của danh sách không thể biết được trước khi layout hoàn tất, việc thu gọn vào trong viewport vẫn cần đo đạc sau layout; đo đạc trên node ẩn đã mount chính là mô hình được ghi trong tài liệu React và Floating UI.
- **Lọc tin nhắn assistant rỗng ở phía host.** Không chấp nhận: node đó là output thực sự của model, cả Trajectory lẫn replay đều phải giữ lại nó; chỉ có phần hiển thị chat mới nên bỏ qua nó, và theo hợp đồng, tầng web chỉ chịu trách nhiệm hiển thị.
- **Tương đối hóa đường dẫn ở từng presenter riêng của mỗi công cụ.** Không chấp nhận: sự dư thừa này là chung cho mọi công cụ có output tóm tắt đường dẫn; xử lý một lần trong `toolRowModel`, chỉ ảnh hưởng hiển thị, là đủ để bao phủ tất cả công cụ, còn các bên tiêu thụ không phải chat vẫn nhận được đường dẫn tuyệt đối.
- **Giữ hiệu ứng quét sáng dựa trên mask.** Không chấp nhận: mask sẽ làm tối toàn bộ nội dung của dòng, bao gồm cả chấm trạng thái, và transition thoát của nó còn xung đột với hiệu ứng crossfade của icon khi hover; dải highlight phủ lên trên nội dung, hoàn toàn không đụng đến alpha của nội dung.
- **Để chip tiếp tục hiển thị tên của workspace đã bị xóa.** Không chấp nhận: chip là bộ chọn phục vụ cho phiên *tiếp theo*; người dùng vừa xóa một workspace mà vẫn echo lại cwd của nó là hiển thị sai lựa chọn hiện tại.

## Hệ quả

Số mục luồng mà chat render ra ít hơn số node trong snapshot: bất kỳ ai đối chiếu số block render với số node đều phải tính đến các node assistant "không render nội dung nào" bị bỏ qua (bài test spec chat-view đã cố định điều này). Việc tương đối hóa đường dẫn chỉ là kiểm tra tiền tố dựa trên cwd của phiên, do đó nếu workspace bị đổi tên giữa phiên, phần tóm tắt sẽ hiển thị đường dẫn tuyệt đối cho đến khi được suy luận lại — điều này được chấp nhận như một trạng thái cũ chỉ ảnh hưởng hiển thị. Nhịp thống nhất 16px thay thế giao diện chạy công cụ gọn hơn với 10px trước đây; nếu sau này cần layout gọn hơn, nên chủ động đưa vào một hằng số thứ hai. Việc render trước menu ở trạng thái ẩn khiến mỗi lần mở tốn thêm một lượt tính layout ẩn, nhưng chi phí này không đáng kể ở quy mô kích thước của menu.

## Kiểm thử

`chat-view.spec.tsx` cố định hành vi gộp nhóm của các node "không render nội dung nào" (kèm ngoại lệ node bị gián đoạn); `chat-tool-row.spec.tsx` cố định hành vi tương đối hóa cwd trong workspace, ngoài workspace và khi cwd rỗng; `atoms.spec.tsx` và `workspace-picker.spec.tsx` bao phủ các trạng thái khác nhau của menu và chip; toàn bộ test suite của ui-conversation, ui-primitives và ui-workspace đều pass.
