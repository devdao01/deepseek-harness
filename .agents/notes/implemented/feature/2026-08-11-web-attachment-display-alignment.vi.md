# Agent Note: Hiển thị attachment của Web căn chỉnh theo DeepSeek Chat qua atomic component attachment

Status: implemented

[English](2026-08-11-web-attachment-display-alignment.md) | 中文

## Vấn đề

Giao diện ảnh trong ô nhập của Web thiếu tính khả dụng cơ bản (phản hồi người dùng, issue #2248). Nút xóa được treo ở `top/right: -6px` bên ngoài thumbnail 72px, bị hộp `overflow-x` của thanh attachment cắt mất, việc click thường trượt; xem trước chỉ mở được bằng double-click, không có gợi ý gì ngoài tooltip cho thao tác này; khi thanh attachment vượt quá chiều rộng ô nhập, thanh cuộn ngang gốc xuất hiện trực tiếp bên trong viên nang (capsule); việc ảnh bị từ chối nhận và gửi thất bại (ví dụ `attachment-error` khi model đã chọn không hỗ trợ ảnh đầu vào) hiển thị dưới dạng thanh đỏ nội tuyến (inline) thường trực phía trên thẻ. Các giao diện này đều có thiết kế quen thuộc, đã định hình sẵn trong DeepSeek Chat: click đơn để xem trước, nút xóa hiện khi hover bên trong thẻ, mũi tên lật trang ẩn thanh cuộn, toast ngắn hạn căn giữa phía trên.

Phiên bản đa phương thức đầu tiên đã ghi lại các giao diện này trong [Web Multimodal Note](2026-07-22-web-multimodal-image-input-and-durable-attachments.md); Note này thay thế các chi tiết trình bày và tương tác trong đó (hình học thumbnail, cách click, cách hiển thị lỗi), còn ranh giới attachment service, quyết định về admission và persistence vẫn tiếp tục có hiệu lực.

Các giao diện này trước đây đều nằm trong `dsh-client-ui-conversation` — thanh attachment nội tuyến trong `InputBar` dài 700 dòng, ảnh lịch sử và lightbox rải rác trong `chat/` và `skeleton/` — không có seam nào để giao diện khác tái sử dụng, và kỷ luật props thuần túy cũng không có gì ràng buộc.

## Quyết định

Việc hiển thị attachment được chuyển vào một package atomic component mới, không có cordis: `@deepseek-ai/dsh-client-ui-attachment` (`packages/client/ui-attachment`), theo mô hình của `dsh-client-ui-primitives`: `AttachmentRail` (thumbnail 64px, bo góc 16px, click đơn gọi `onOpen`, nút xóa bên trong thẻ hiện khi hover hoặc focus, hiện thường trực khi `pointer: coarse`, thanh cuộn ẩn kèm mũi tên tròn ở hai đầu và tính lại theo hình học cuộn, cuộn dọc bằng chuột chuyển thành dịch chuyển ngang với giới hạn 60px mỗi lần, mục mới thêm cuộn tới cuối thanh), `MessageImage`/`ImageGallery` (click đơn để xem trước), và `ImageLightbox`. Văn bản được truyền qua label props; `ui-conversation` bắc cầu tới từ điển `conversation` qua `src/client/image-labels.ts`, và giữ lại phần đấu nối máy trạng thái (id bản nháp, trạng thái xem trước, callback nhận). Việc import xuyên package được cho phép chính vì đây là thư viện atomic component chứ không phải plugin client: giữa các plugin vẫn cấm import component lẫn nhau, và thanh attachment là phần render riêng của ô nhập, không phải một slot.

Cả hai lớp phủ (overlay) đều được portal ra body: lightbox mở từ tin nhắn chat nằm dưới một tổ tiên có transform, `position: fixed` sẽ bị kẹt trong hộp của tổ tiên đó (lớp phủ chỉ che cột chat), do đó `ImageLightbox` và `Toast` được render qua `createPortal(document.body)`, phủ toàn bộ viewport bất kể mở từ đâu. Banner ngắn hạn là atomic `Toast` của `ui-primitives` (cách đỉnh viewport 120px, tâm ngang theo một anchor tùy chọn — thẻ composer, nên banner căn giữa trên cột chat — `role="alert"`, `pointer-events: none`, hiển thị ba giây rồi mờ dần trong một giây, `onDone` để unmount, dùng số thứ tự hiển thị làm key để cùng một nội dung có thể phát lại). `InputBar` chuyển cả việc từ chối nhận (lý do trả về từ `addImages`) và `promptError` sang dùng toast, thay cho thanh đỏ nội tuyến; việc model bị `ModelSelect` từ chối chọn cũng dùng chung atomic này, còn thanh lỗi kèm Retry trong menu của nó vẫn là bề mặt hiển thị cho việc tải catalog; thanh notice của máy trạng thái không bị ảnh hưởng. Mã nguồn DeepSeek Chat (bản tham chiếu local) cung cấp hành vi mục tiêu: `ImageThumbnailInInput` của nó (thẻ 64px, nút xóa có chuyển tiếp độ trong suốt), `ScrollArrows` (lật trang điều khiển bằng sentinel) và cách dùng `useToast`.

## Phương án khác đã cân nhắc

**Giữ component trong `ui-conversation`, chỉ đổi style.** Bị người dùng bác bỏ: khu vực attachment dự kiến sẽ còn phát triển (thẻ file, tiến trình upload), và kỷ luật plugin của repo cấm plugin khác import phần triển khai nội bộ của `ui-conversation`; phát triển bên trong plugin chỉ chất thêm một đống không thể tái sử dụng. Package atomic component cho cùng những component đó một đường import được cho phép.

**Làm thành plugin client `ui-attachment` với slot đăng ký.** Bị bác bỏ: thanh attachment render trong ô nhập do máy trạng thái nắm giữ, khung ảnh (gallery) render trong node chat, cả hai đều không phải là chỗ trống trong tổ hợp nên để plugin khác lấp đầy; hình thức plugin sẽ áp đặt một lớp gián tiếp qua slot cho các component thuần hiển thị.

**Đặt Toast trong `ui-conversation`.** Bị bác bỏ: banner ngắn hạn không có gì đặc thù cho conversation, `ui-primitives` là nơi định sẵn cho atomic component không cordis, và giao diện khác cũng có thể tái sử dụng.

**Giữ thanh đỏ nội tuyến, chỉ thêm toast cho việc nhận ảnh.** Bị bác bỏ: `promptError` (chính là `attachment-error` trong ảnh chụp màn hình của issue) đúng là giao diện mà người dùng thực sự phàn nàn; một ô nhập có hai kiểu hiển thị lỗi sẽ khiến thanh đỏ trở thành trường hợp đơn lẻ, lạc lõng.

## Kết quả

Mô hình tương tác của ô nhập và giao diện ảnh lịch sử giờ nhất quán với DeepSeek Chat, seam label props cho phép atomic component render ở bất kỳ locale nào mà không cần chạm vào locale. Cái giá là một ranh giới package thực sự: `ui-attachment` phải gánh bộ khung chuẩn (invariant đi kèm, README song ngữ, tsconfig face, coverage 100% theo từng file), và mỗi bên tiêu thụ trong tương lai phải tự parse văn bản của mục thay vì kế thừa. Banner lỗi giờ chỉ hiển thị ngắn hạn — người dùng nhìn đi chỗ khác bốn giây là sẽ bỏ lỡ thông báo, đây chính là đánh đổi mà DeepSeek Chat tự thực hiện. Attachment không phải ảnh vẫn chưa được hỗ trợ; mô hình thẻ của thanh attachment đã sẵn sàng, nhưng việc nhận của ô nhập vẫn chỉ nhận diện ảnh (được ghi trong mục hạn chế của README package).
