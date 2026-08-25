# Agent Note: Đưa bản sao bền vững của kết quả sub-dispatch Code Mode vào cơ chế spill

Status: implemented

[English](2026-07-26-code-dispatch-log-spill.md) | 中文

> Phạm vi: dùng cơ chế spill sẵn có để giới hạn nội dung sự kiện `tool/code-dispatch`. [Agent Note nền tảng phía host](2026-07-26-code-dispatch-ui-foundation.md) đã cố ý chấp nhận log không giới hạn, và để lại việc hỗ trợ spill cho lần thay đổi này; [Agent Note dispatch song song thời gian thực](2026-07-26-code-mode-live-parallel-dispatch.md) định nghĩa cặp sự kiện mà listener này xử lý.

## Vấn đề

Sau khi thêm log dispatch chứa nội dung đầy đủ, chương trình `run_code` đọc file lớn sẽ ghi toàn bộ văn bản đã render vào log session, không có giới hạn trên, cũng không qua chính sách spill; còn kết quả gốc thì đã bị giới hạn trong `maxInlineBytes` trước khi ghi. Hai loại kết quả bị xử lý khác nhau, trong khi sub-call thiết kế cho công việc xử lý dữ liệu hàng loạt lại là loại dễ sinh kết quả khổng lồ nhất; mỗi lượt bị ảnh hưởng đều khiến JSONL tăng thêm vài MB.

## Quyết định

**Thêm waterfall (sự kiện dạng thác nước) `tools/code-dispatch-log` vào registry, với chính sách spill là listener đầu tiên của nó.**

- **Điểm mở rộng**: `tools/code-dispatch-log` là một waterfall được lọc theo scope, tầng bridge sẽ chạy nó cho mỗi sub-dispatch đã settle trước khi append `tool/code-dispatch`. Tầng bridge nhận bộ gọi `shapeDispatchLog` riêng của registry dưới dạng closure năng lực thông qua `RunCodeBridgeOptions`; waterfall là giao ước công khai, bộ gọi đó không thêm service method nào. Khi listener ném lỗi, bộ gọi sẽ báo cáo an toàn bất kỳ giá trị ném nào, và dùng nội dung đã settle gốc. Payload `CodeDispatchLog` bao gồm lần thực thi ngoài cùng, khóa định tuyến `agent`, định danh sub-call và nội dung mặc định; nội dung mặc định là projection kết quả đã render mà `tool/result` gốc sẽ mang theo, còn chương trình nhận `value` có cấu trúc. Listener chỉ có thể thay thế bản sao bền vững, model sẽ không thấy bản sao này. Listener chạy như một task được theo dõi, nằm ngoài đường trả về của chương trình. Khi task log đang chờ vượt quá `maxParallelSubCalls`, vòng lặp commit có thứ tự sẽ chờ, do đó backend spill chậm sẽ giới hạn việc khởi động sub-call tiếp theo, chứ không tích lũy I/O đang chờ vô hạn. Việc settle run vẫn sẽ chờ toàn bộ task trong lượt đang mở hoàn tất.
- **Chính sách**: `dsh-spill-policy` đăng ký listener cho sự kiện này, và tái sử dụng code thay thế mà listener của kết quả hướng tới model dùng: cùng giới hạn `maxInlineBytes`, preview và định vị, bất biến không vượt giới hạn, và fallback nỗ lực tối đa. Sản phẩm spill được gắn nhãn `dispatch`, ghi dưới tên id sub-call. UI và replay đọc toàn văn qua cùng đường dẫn mà kết quả gốc đã bị spill sử dụng, nên hai loại kết quả sẽ render ra cùng lượng thông tin.
- **Một khác biệt có chủ đích**: listener kết quả hướng tới model bỏ qua `read`, để tránh vòng lặp `read → spill → read again`. Listener log dispatch cũng sẽ thay thế nội dung sub-call `read` quá lớn, vì bản sao log không phải context của model, vòng lặp đó sẽ không xảy ra, và `read` là loại dễ sinh mục log khổng lồ nhất.

## Phương án thay thế đã cân nhắc

**Dùng giới hạn số byte thông thường bên trong tầng bridge, không lưu vào spill.** Bác bỏ: cắt ngắn không có định vị sẽ mất dữ liệu mà replay hoặc UI có thể cần, còn khôi phục lại kiểu render "tóm tắt cắt ngắn" kém thông tin mà thay đổi trước đó đã loại bỏ.

**Spill trực tiếp bên trong tầng bridge, tức gọi `ctx.spillStore` từ `code-mode.ts`.** Bác bỏ: registry sẽ phải cung cấp năng lực spill. Waterfall đặt chính sách này cùng các quyết định spill khác, và cho phép tổ hợp mà không tải nó; khi bỏ qua `maxInlineBytes`, listener này vẫn không làm gì.

**Để lời gọi lồng tái sử dụng `tools/post-execute`, thay vì thêm sự kiện mới.** Bác bỏ: post-execute có thể sửa đổi kết quả hướng tới chương trình, nên lời gọi lồng cố ý bỏ qua nó, để chương trình nhận được dữ liệu đầy đủ. Bản sao bền vững cần một listener riêng, chạy sau khi chương trình đã nhận giá trị của nó.

## Hậu quả

Mục dispatch Code Mode trong log session hiện tuân theo giới hạn số byte đã cấu hình, mục "hạn chế đã biết" trong README về việc log dispatch không giới hạn nay đã trỏ đến bài này. Log cũ mang nội dung dispatch quá lớn vẫn có thể replay được, vì trường sự kiện không thay đổi; chỉ những lần append từ nay trở đi mới chứa ít văn bản hơn. Web UI đi qua cùng đường dẫn với kết quả gốc, render output sub-call đã bị spill thành preview và văn bản định vị, không cần xử lý đặc biệt.
