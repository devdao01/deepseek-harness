# @deepseek-ai/dsh-client-ui-message-feedback

[English](README.md) | Tiếng Việt

Phía trình duyệt của plugin phản hồi từng tin nhắn: một cặp nút Like/Dislike cộng một ghi chú tùy chọn, đóng góp làm mục `feedback` (order 10) của dải `conversation.chat.assistant-actions`. Dải này do `ui-conversation` khai báo, được render trong hàng IconActions của tin nhắn trợ lý đã chốt, nằm giữa sao chép và phân nhánh, nên điều khiển kế thừa kiểu dáng và hành vi hover của hàng đó. Chỉ tin nhắn đã chốt mới tới được slot này — phần đầu ra bị đóng băng do bị ngắt không mang `messageId`, nên cũng không có điều khiển phản hồi. Thanh thao tác đó được render một lần mỗi Turn, trên tin nhắn trợ lý kết thúc giữ hàng IconActions của Turn ấy: trong một Turn nhiều bước, các bước sớm hơn tạo ra hàng công cụ chứ không phải phần thân có thể chấm điểm, nên dù Host chấp nhận chúng làm mục tiêu thì giao diện vẫn không hiện điều khiển.

Mỗi Session có một `MessageFeedbackController` chống lưng cho điều khiển của mọi tin nhắn trong Session đó, nên chỉ một lần đọc `messageFeedback.list` là đủ để lấp đầy toàn bộ cuộc hội thoại. Lần đọc đó được hoãn tới lần hover hoặc focus đầu tiên chứ không kích hoạt lúc mount, vì mỗi tin nhắn đã kết thúc trong lịch sử nhìn thấy được đều mount một điều khiển.

Thay đổi được gửi qua `ctx.remote.messageFeedback`, phần compare-and-set theo từng mục do Host đảm nhiệm. Mỗi `put` và `delete` đều mang `version` mà controller này quan sát được lần cuối; phản hồi `version-conflict` sẽ trả về mục có thẩm quyền, nên khi thua trong tranh chấp thì đối soát thẳng bằng phản hồi đó, không cần kéo lại toàn bộ Session. Các thay đổi được tuần tự hóa theo Session, thao tác đang xếp hàng luôn so với phiên bản đã commit. Bấm lại đúng mức đánh giá đã ghi sẽ rút lại phản hồi; chuyển sang phía còn lại thì vẫn giữ ghi chú sẵn có.

`/client` export chính plugin (`apply`/`inject`), component `MessageFeedbackActions`, lớp `MessageFeedbackController` và các kiểu của giao diện inject.

## Trải nghiệm mô hình

Không có. Phản hồi là sidecar, không đi vào nhật ký Session chỉ-thêm, ngữ cảnh mô hình hay telemetry; mọi đánh giá và ghi chú đều vô hình với mô hình.

#### Ảnh hưởng KV Cache

Không có; không thay đổi phản hồi nào chạm tới phần đuôi lịch sử.

## Hạn chế đã biết và phần tạm hoãn

- **Kích thước ghi chú là chính sách của Host** — bên triển khai cấu hình `maxNoteBytes` (8192 trong bundle Web), ghi chú quá dài bị Host từ chối với `note-too-large`. Trình soạn thảo không kiểm tra trước giới hạn đó, nên ghi chú quá dài chỉ thất bại lúc lưu chứ không phải trong lúc gõ.
- **Không có push xuyên tab** — đánh giá từ một tab khác chỉ nhìn thấy được sau khi kết nối lại hoặc ở phản hồi xung đột kế tiếp, chứ không xuất hiện ngay; sidecar này không phát frame thời gian thực.
- **Chỉ trong khung nhìn hội thoại** — khung nhìn trajectory và waterfall không render điều khiển phản hồi, dù node trợ lý của chúng giờ cũng mang cùng `messageId`.
