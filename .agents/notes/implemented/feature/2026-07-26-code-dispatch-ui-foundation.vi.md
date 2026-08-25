# Agent Note: Nền tảng UI của Code Mode — tham số description của run_code, và log dispatch có độ trung thực ngang bằng tool gốc

Status: implemented

[English](2026-07-26-code-dispatch-ui-foundation.md) | 中文

> Phạm vi: các thay đổi trong giao ước phía host để UI có thể render lượt Code Mode với cùng độ trung thực như lời gọi tool gốc, tức nền tảng mà các Agent Note khác về UI Code Mode được xây dựng dựa trên. Thiết kế truyền tải thuộc về [Nền tảng Code Mode](2026-06-15-code-mode.md); tham số `description` model có thể thấy, payload `tool/code-dispatch` mang nội dung đầy đủ, và công tắc bật tạm thời `DSH_TOOLS_MODE` trên cây cấu hình `dsh` thuộc về bài này.

## Vấn đề

Trước đây các lượt `run_code` không minh bạch trên mọi giao diện sản phẩm. Tiêu đề thẻ lời gọi chính là văn bản chương trình gốc, không thể đọc trong bề rộng dòng; và khác với `bash` (trường `description` bắt buộc của nó được dùng làm nhãn thẻ, còn lệnh thực sự nằm ở phần input mở rộng), `run_code` hoàn toàn không có nhãn do model viết. Sự kiện `tool/code-dispatch` trước đây chỉ mang `resultSummary` cho mỗi sub-call (giới hạn 200 ký tự, đã chuẩn hóa theo cwd), nên bất kỳ UI nào cũng không thể hiển thị nội dung thực sự mà sub-call trả về: Web conversation view ([hàng sub-call trong chat](2026-07-26-code-mode-chat-subcall-rows.md)) sẽ dùng cùng bộ component render thẻ `tool/result` gốc để render sub-call, mà tóm tắt có giới hạn thì không đủ để hỗ trợ một thẻ có độ trung thực ngang bằng tool gốc. Đồng thời, tổ hợp `dsh web` trước đây hoàn toàn không thể bật Code Mode: hàng `tools` bị cố định vào giá trị mặc định của schema, cây cấu hình cũng hoàn toàn không có runtime đó.

## Quyết định

Ba thay đổi, mỗi thay đổi ứng với một trở ngại:

1. **`run_code` thêm tham số `description` bắt buộc** (hoàn toàn cùng giao ước với bash: giọng chủ động, 5-10 từ, hiển thị trong UI; giá trị chỉ toàn khoảng trắng bị từ chối khi thực thi). `presentCall` giờ dùng description này làm tiêu đề thẻ, và chuyển văn bản chương trình vào `rawInput`. Cái giá phía prompt là mỗi lần gọi thêm vài token; đổi lại là mọi giao diện — thẻ TUI, tiêu đề ACP (Agent Client Protocol), hàng Web — đều không cần parse TypeScript vẫn có được nhãn dễ đọc.
2. **`tool/code-dispatch` ghi lại kết quả đầy đủ hướng tới model của sub-call** (`content: ContentBlock[]` cộng `isError`, tức từ vựng của `tool/result`), thay thế `resultSummary`, và xóa hẳn cơ chế tóm tắt cùng chuẩn hóa cwd. Đường dẫn code render sub-call trong UI hoàn toàn giống với render kết quả gốc, bao gồm cả văn bản lỗi và block phi văn bản. Sự kiện này vẫn chỉ dùng cho log (`deriveMessages()` bỏ qua nó): context của model không có bất kỳ thay đổi nào.
3. **Biến môi trường `DSH_TOOLS_MODE` trên cây cấu hình `dsh`** (`native`|`code`|`both`; khi chưa đặt thì giữ giá trị mặc định của schema): hàng `tools` đọc nó qua `!!js`, còn worker code runtime thì mount vô điều kiện (tại thời điểm giao bài này, metadata loader vẫn tĩnh, nên chưa có hàng điều kiện; [quyết định nội suy `disabled`](../architecture/2026-08-11-loader-entry-disabled-interpolation.md) sau này mới cho phép hàng điều kiện, nhưng ở đây không đổi — khởi động native chỉ đăng ký service đó, worker phải đến mỗi lần chạy mới spawn). Đây là một hook cấu hình được đánh dấu rõ ràng là tạm thời: mục tiêu thiết kế là để Web UI có lựa chọn chế độ tool theo từng session, sau khi mục tiêu đó đạt được thì biến môi trường này sẽ nghỉ hưu ngay.

## Phương án thay thế đã cân nhắc

**Giữ tóm tắt có giới hạn (nâng giới hạn, hoặc thêm cờ `truncated` vào giới hạn).** Bác bỏ: yêu cầu đã chốt trong chuỗi PR (Pull Request) này là hàng và chi tiết của sub-call phải render *hoàn toàn giống* với lời gọi gốc; bất kỳ giới hạn nào cũng buộc phải đưa vào một đường render suy giảm thứ hai, kèm UI cắt ngắn. Cái giá chuyển sang chấp nhận là: chương trình đọc file lớn sẽ ghi nguyên nội dung đã render vào sự kiện dispatch, không giới hạn, nằm ngoài chính sách spill, và làm log session tăng cùng số byte đó. Việc tích hợp spill cho bản sao bền vững đã được giao trong [spill log code-dispatch](2026-07-26-code-dispatch-log-spill.md).

**Một cờ CLI (giao diện dòng lệnh) `--tools-mode` hoặc khóa cấu hình profile.** Hoãn lại, không phải bác bỏ: cú pháp cờ ngụ ý tính vĩnh viễn, còn profile JSON là cấu hình người dùng; cả hai đều sẽ cố định seam này, trong khi thiết kế lựa chọn theo session vốn dự định loại bỏ nó. Biến môi trường thì thể hiện đúng bản chất tạm bợ của nó.

**Ghi `value` chuẩn hóa, thay vì `content` đã render.** Bác bỏ: `tool/result` bền vững hóa nội dung chứ không phải giá trị (xem [giao ước output chuẩn hóa](../architecture/2026-07-20-canonical-tool-output-contract.md)), độ trung thực ngang bằng tool gốc có nghĩa là căn khớp chính xác với nó; giá trị luôn chỉ tồn tại cục bộ trong thời gian thực thi.

## Hậu quả

Định dạng session giữ `SESSION_FORMAT_VERSION` ở mức 0 (thay đổi trong giai đoạn tiền phát hành không tăng version; log cũ mang `resultSummary` chỉ đa ra một trường không được đọc và thiếu `content`; v0 không đưa ra bất kỳ cam kết tương thích nào). Các fixture (dữ liệu tiền đặt cho test) snapshot Code Mode sẵn có đã được ghi lại. Phạm vi model có thể thấy đã mở rộng: schema của `run_code` (thêm một tham số bắt buộc) và mọi snapshot system prompt／tool schema của Code Mode đều thay đổi. Công việc Web UI được xây dựng trực tiếp trên payload sự kiện mới; trạng thái chạy thời gian thực của mỗi sub-call đã tái định hình sự kiện này thành một cặp sự kiện dispatch start/end ([dispatch song song thời gian thực](2026-07-26-code-mode-live-parallel-dispatch.md)).
