# @deepseek-ai/dsh-client-ui-attachment

[English](README.md) | Tiếng Việt

Các thành phần nguyên tử đính kèm React thuần (không có cordis): thanh hình ảnh bản nháp của ô nhập (`AttachmentRail`), gallery hình ảnh lịch sử trò chuyện (`MessageImage`/`ImageGallery`), lightbox ảnh gốc (`ImageLightbox`) và lớp phủ kéo-thả toàn trang (`DropOverlay`). Toàn bộ văn bản đều do plugin sở hữu giải quyết trong namespace ngôn ngữ riêng của nó rồi truyền qua label props, gói này không đọc bất kỳ trạng thái ứng dụng nào; bên tiêu thụ hiện tại là `@deepseek-ai/dsh-client-ui-conversation`, cầu nối từ điển `conversation` qua module `image-labels` của nó.

## Thanh đính kèm

`AttachmentRail` render các hình ảnh bản nháp sắp gửi thành dãy thumbnail cố định 64px (bo góc 16px), luôn ẩn thanh cuộn, phần tràn được gợi ý bởi mũi tên tròn ở hai đầu: mỗi lần lật trang cuộn một chiều rộng viewport (trừ đi một card để giữ ngữ cảnh, tối thiểu 200px) và cuộn mượt (dưới `prefers-reduced-motion: reduce` thì hoàn tất tức thì), việc hiển thị/ẩn mũi tên được tính lại theo hình học cuộn mỗi khi cuộn, số lượng mục thay đổi, và kích thước bản thân thanh thay đổi (ResizeObserver trên phần tử rail, do đó thay đổi độ rộng sidebar, panel cũng được tính, không chỉ thay đổi kích thước cửa sổ). Thanh đính kèm chỉ cho phép cuộn ngang: listener không passive tiêu thụ mọi sự kiện wheel có thành phần dọc — không cuộn lịch sử hội thoại phía sau ô nhập — wheel thuần dọc được chuyển thành bước ngang (đơn vị LINE/PAGE được chuẩn hóa về pixel trước, mỗi lần di chuyển giới hạn trong 60px), pan chéo giữ lại thành phần ngang của nó, pan thuần ngang giữ nguyên cuộn gốc. Mục mới thêm sẽ cuộn tới cuối thanh để hiển thị, xóa thì giữ nguyên vị trí, thanh được mount lại với bản nháp đã có sẵn thì giữ vị trí ban đầu. Mỗi thumbnail click qua `onOpen` để mở ảnh gốc, nút xóa nằm ở góc trên bên phải bên trong card, chỉ hiện khi hover card hoặc focus bàn phím; thiết bị con trỏ thô (cảm ứng) không có hover nên luôn hiện. Việc có mount hay không do bên sở hữu quyết định, chỉ render khi có mục.

## Hình ảnh tin nhắn và lightbox

`MessageImage` render một hình ảnh lịch sử đã lưu bền vững, tải qua `ImageLoader` của bên sở hữu để lấy URL được ủy quyền theo session; tải thất bại render nút thử lại rõ ràng, tải xong thì click để mở `ImageLightbox` (click khi đang tải bị bỏ qua). Quy tắc kích thước khớp với DeepSeek Chat: một tin nhắn chỉ có một ảnh (`variant="single"`) cạnh dài 240px, tỷ lệ khung hình hiển thị giới hạn trong [0.25, 4] — phần vượt quá bị cắt bởi `object-fit: cover` (ảnh đặc biệt cao neo trên, ảnh đặc biệt rộng neo trái) — và không bao giờ phóng to vượt quá kích thước gốc; một ảnh trong nhiều ảnh (`variant="tile"`) là ô vuông cố định 64px. `ImageGallery` bọc các hình ảnh của một tin nhắn thành một nhóm flex có thể xuống dòng, căn lề (tin nhắn người dùng `end`, tin nhắn assistant `start`), chọn variant theo số lượng ảnh, danh sách rỗng không render. `ImageLightbox` là modal xem trước cấp tài liệu, phủ lên lớp che dialog dùng chung (`--dsw-alias-bg-mask-1` cộng `--dsw-mask-blur`, vẽ trên lớp riêng, hiệu ứng mờ không ảnh hưởng đến ảnh xem trước), có thể đóng bằng Escape, click lớp che hoặc nút đóng, khi unmount trả focus về bên đã mở nó.

## Lớp phủ kéo-thả

`DropOverlay` là lớp mời gọi toàn viewport khi tệp được kéo lơ lửng trên trang: hình minh họa, tiêu đề, thêm một dòng thông báo giới hạn khi chấp nhận thả (`disabled` chuyển thành hình minh họa bị vô hiệu hóa và ẩn dòng giới hạn). Lớp này không nhận sự kiện con trỏ — listener kéo-thả cấp document của bên sở hữu chịu trách nhiệm đếm enter/leave và phán đoán chấp nhận hay không; lớp phủ chỉ hiển thị trạng thái. Cũng render qua body portal như lightbox.

## Trải nghiệm Model

Không có. Gói này render các thành phần nguyên tử React thuần trong trình duyệt; không có bất cứ nội dung nào ở đây đi vào yêu cầu model.

#### Tác động KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu provider.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ hỗ trợ hình ảnh** — tệp không phải hình ảnh chưa có card thanh đính kèm và render lịch sử; card tệp kiểu DeepSeek Chat và trạng thái tiến trình upload cho đính kèm không phải hình ảnh sẽ làm sau.
- **Lightbox không có zoom và tải xuống** — bản xem trước chỉ render ảnh gốc với kích thước khớp viewport.
- **Lightbox không khóa focus** — nó thiết lập `aria-modal` và trả lại focus khi đóng, nhưng Tab vẫn có thể di chuyển tới trang phía sau (kế thừa hành vi của component trước khi được đưa vào gói).
