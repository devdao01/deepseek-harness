# Agent Note: Công cụ read_image tối thiểu dựa trên seam sẵn có

Status: implemented

[English](2026-08-10-minimal-read-image-tool.md) | 中文

## Vấn đề

Công việc đính kèm đa phương thức đã dựng sẵn một đường dẫn bền vững hoàn chỉnh cho việc người dùng tải lên: byte được commit vào kho lưu trữ đính kèm định địa chỉ theo nội dung trước khi `user/message` chứa nó; `ImageBlock` chỉ mang tham chiếu `sha256:`; route pi-ai đọc lại và xác thực byte trong mỗi request. Nhưng bản thân model không có cách nào xem ảnh trên đĩa. `read` theo quy ước từ chối nội dung nhị phân, do đó agent bị hỏi về ảnh chụp màn hình hoặc biểu đồ đã render thì hoặc thất bại, hoặc lùi về giải pháp vòng vo có mất mát. Nỗ lực độc lập đầu tiên (PR #598) giải quyết vấn đề này cùng với phạm vi route cấp loop: thêm điểm mở rộng `agent/request-ready` phát ra modal chính xác của model trước khi lắp ráp, kiểm soát khả kiến schema/hướng dẫn theo route, và một phép chiếu lịch sử `image-placeholder-v1` có thể đảo ngược để route văn bản có thể tiếp tục trên placeholder. Thiết kế đó khả thi, nhưng khiến một công cụ ghép với cơ chế agent-loop mới, ba khái niệm session log mới, và thay đổi đăng ký ở mỗi bước — vượt xa mức cần thiết cho chính năng lực này.

## Quyết định

Chỉ giao công cụ tối thiểu để nạp ảnh vào ngữ cảnh của request tiếp theo, xây dựng hoàn toàn trên các seam sẵn có; thiết kế PR #598 đã rút lại là phản ví dụ mà note này cố tình giữ lại.

- **`read_image` đặt trong `dsh-tool-fs`**, song song với `read`/`write`/`edit`. Phần mở rộng file chọn ra kiểu media PNG/JPEG/WebP/GIF đã khai báo; magic number và kiểm tra pixel của kho đính kèm vẫn là căn cứ chính thức. Byte đi theo `ctx.fs.stat` → `ctx.fs.readBytes` có giới hạn → `ctx.attachments.saveImage` → `fs/observed`, kết quả công cụ là một phong bì metadata cộng `ImageBlock` thật — `ToolResultBlock.content` vốn đã cho phép khối ảnh, adapter pi-ai vốn đã render chúng, cơ chế phòng ngừa chuyển đổi model của Web host vốn đã quét kết quả công cụ, phía dưới không cần thay đổi gì.
- **`FileSystem.readBytes(target, signal, maxBytes)`** là nguyên thủy provider bắt buộc mới: giới hạn byte đặt tại seam, không backend nào có thể buffer file vô hạn; kích thước stat đoản mạch trước, luồng sau đó đọc thêm tối đa một byte để phòng việc tăng kích thước sau stat (`FS_TOO_LARGE`).
- **Đăng ký lắp theo điều kiện tổ hợp, thực thi có gate theo route.** Công cụ chỉ đăng ký trong phạm vi `ctx.inject(['attachments'], …)` — không có kho lưu trữ thì không có công cụ. Khi thực thi, trước bất kỳ I/O nào, gate nghiêm ngặt phân giải route gọi qua `ctx.llm.resolveModelInfo` (cấu hình `request/header` mới nhất, lùi về tùy chọn agent khi thiếu), yêu cầu `inputModalities` chứa `image`; năng lực chưa rõ thì từ chối. Việc từ chối là một kết quả `isError` thông thường, do đó lịch sử bền vững của route văn bản không bao giờ chứa khối ảnh, session không tự phá hỏng route của chính nó.
- **Code Mode chuyển tiếp ảnh theo kiểu ngoài băng thông (out-of-band)**: việc phân phối lồng nhau trả về giá trị quy ước (chỉ trong lần thực thi này, không kèm khối ảnh) và trì hoãn việc commit một tin nhắn ngữ cảnh vai trò `user` mang theo phong bì và ảnh, ảnh vẫn sẽ đến được request tiếp theo.
- **Model llm-replay có thể khai báo `inputModalities`**, chính điều này giúp hai snapshot ACP không cần key chốt được cả hai phía của gate: kết quả thành công tham chiếu bằng sha256 trên route ảnh, và từ chối nguyên văn trên route văn bản thuần.

## Phương án thay thế đã cân nhắc

- **Thiết kế phạm vi route của PR #598** (điểm mở rộng request-ready, khả kiến schema/hướng dẫn theo route, phép chiếu lịch sử có thể đảo ngược) — bị rút lại sau khi hình thái của note này thay thế. Cái nó đổi lấy là: route văn bản vẫn chạy được sau khi ảnh vào lịch sử, công cụ biến mất khỏi prompt vốn định sẵn sẽ thất bại. Cái nó phải trả là: thay đổi agent-loop, ba khái niệm bền vững mới (`agent/request-ready`, `messageProjection`, thông báo khả dụng), và thay đổi đăng ký ở mỗi bước. Trong khi năng lực này tự thân — request tiếp theo thấy được ảnh — chưa bao giờ cần những thứ đó. Nếu phép chiếu theo route trở thành nhu cầu thực trong tương lai, lịch sử của PR đó chính là bản triển khai tham khảo.
- **Dùng `agent.inject()` thay cho kết quả công cụ mang ảnh** — cho ảnh đi vòng qua kết quả công cụ, dưới dạng tin nhắn người dùng được chèn riêng. Bác bỏ: ảnh chính là kết quả của công cụ; tách ra chỉ thêm một tin nhắn log không đem lại lợi ích, trong khi đường dẫn kết quả công cụ vốn đã hoạt động đầu-cuối.
- **Dùng dò magic number thay cho khai báo phần mở rộng** — việc dò sẽ lặp lại phát hiện mà kho đính kèm đã sở hữu (dựa trên sharp, có thẩm quyền). Phần mở rộng chỉ là khai báo; khi không khớp thì đóng lại kèm gợi ý đổi tên khắc phục, thay vì âm thầm chấp nhận — điều này cũng giữ cho model trung thực về sự tương ứng giữa tên file và nội dung.
- **Đăng ký vô điều kiện, báo lỗi khi thực thi nếu thiếu kho lưu trữ** — bác bỏ; triển khai không có kho đính kèm sẽ vĩnh viễn không thể thỏa mãn công cụ này, schema của nó sẽ là lời nói dối thường trực. Ngược lại, gate theo route là trạng thái theo từng lời gọi, vị trí đúng chính là ranh giới thực thi.

## Hệ quả

- Route văn bản thuần nhận được sự từ chối chứ không phải suy giảm: không có phép chiếu placeholder nghĩa là ở đây không có phương án ủy quyền xem — điều đó cố tình để dành cho PR tiếp theo (đọc lại ảnh subagent, dựng lại dựa trên seam subagent hiện tại).
- Gate theo route có điều kiện đua với việc chuyển đổi model đồng thời; cơ chế phòng ngừa chuyển đổi nhận biết ảnh của Web host bao phủ bề mặt này, các frontend khác có cơ chế phòng ngừa tương đương của riêng chúng. Đã ghi vào phần hạn chế đã biết của tool-fs.
- Kết quả ảnh trùng lặp tiếp tục tích lũy chi phí token của request trước khi nén; định địa chỉ theo nội dung chỉ khử trùng lặp byte.
- Thẻ kết quả công cụ render tham chiếu bền vững chứ không phải pixel; xem trước nhúng được để lại cho gói UI xử lý sau.
