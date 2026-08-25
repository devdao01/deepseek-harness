# Agent Note: Bộ tổ hợp dsh web mount mặc định session telemetry (báo cáo OTel)

Status: implemented

[English](2026-07-31-web-telemetry-default-mount.md) | 中文

## Vấn đề

Seam telemetry và backend OTel ([Note phục hồi](2026-07-23-session-telemetry-otel-revival.md)) từ khi hoàn thành chưa từng được kết nối vào bất kỳ bộ tổ hợp triển khai nào: không có dòng roster, không có công tắc, không có định hướng về nhịp độ, khả năng quan sát của phiên người dùng ở các bản triển khai nội bộ bằng không. Cần một quyết định triển khai: surface nào báo cáo, báo về đâu, nhịp độ nào, cách tắt ra sao, và CI cách ly như thế nào.

## Quyết định

Gói tổ hợp cơ sở dsh dùng chung (`packages/bundle/base/cordis.patch.yml`) mount dòng cấu hình `session-telemetry-otel` kèm endpoint sản xuất tích hợp sẵn, để mọi profile đều có cùng năng lực telemetry. [Quyết định mặc định tắt](2026-08-10-telemetry-default-off.md) giữ dòng cấu hình này ở chế độ `DISABLED`, trừ khi bên triển khai chọn rõ ràng `FULL` hoặc `FEEDBACK_ONLY`; chỉ cấu hình endpoint không đồng nghĩa với việc cho phép báo cáo. Web và headless dùng [bộ điều khiển tắt tiến trình có giới hạn, có thể leo thang](../bug-fix/2026-08-03-cli-signal-shutdown-escalation.md) khi nhận SIGINT/SIGTERM, cho backend đã bật 3 giây để hoàn tất drain trước khi hết hạn mức 5 giây của launcher.

| Quyết định | Giá trị | Lý do |
|---|---|---|
| Mặt mount | `packages/bundle/base/cordis.patch.yml` | Mỗi profile nạp gói tổ hợp cơ sở dùng chung đều dùng cùng một dòng cấu hình năng lực |
| Chế độ dùng chung | `DSH_TELEMETRY_MODE`, mặc định `DISABLED`; đặt rõ ràng `FULL` hoặc `FEEDBACK_ONLY` mới bật | Profile mới không phát yêu cầu mạng telemetry, bản triển khai nội bộ vẫn có thể dùng hai chiến lược upload |
| endpoint | `DSH_TELEMETRY_OTLP_URL`, mặc định `https://harness-telemetry.deepseeksvc.com/v1/logs` | Collector nội bộ; env ghi đè phục vụ cục bộ/liên kết thử nghiệm |
| Tắt cứng | `DSH_TELEMETRY_DISABLED` khác rỗng (kể cả `0`/`false`) sẽ tắt dòng cấu hình | Patch của launcher có hiệu lực trước khi kiểm tra truyền tải lúc nạp, ghi đè mọi chế độ đã cấu hình |
| Nhịp độ báo cáo | trong chế độ upload là `processor.scheduledDelayMillis: 10000` (10s/lô) | Báo cáo dạng stream trong khi phiên đang chạy, thay vì chỉ báo lúc thoát; crash tối đa mất dữ liệu của khoảng chưa xuất cuối cùng |
| Trần drain khi thoát | `exporter.timeoutMillis: 1000` + `maxExportBatchSize: 2048` (bằng maxQueueSize) + `exportTimeoutMillis: 1500` + `shutdownTimeoutMillis: 3000` | Lỗi thông thường khi không tới được collector sẽ được giải phóng trong khoảng 1s: timeoutMillis là deadline timeout socket và retry đơn lẻ, dùng một lô bằng kích thước hàng đợi tránh việc drain tuần tự làm nhân đôi thời gian. Trần ngoài 3s do DSH quản lý sẽ ghi đè việc SDK chờ `forceFlush()` không giới hạn trước đó, tức trường hợp Promise truyền tải không bao giờ lấy được socket. |
| Nén | `compression: gzip` | body sự kiện chứa toàn văn, băng thông liên trung tâm dữ liệu |
| Cách ly CI | `env: DSH_TELEMETRY_DISABLED: '1'` ở cấp cao nhất của workflow GitHub | Ngay cả khi tác vụ CI chọn rõ ràng chế độ upload, phòng thủ theo chiều sâu vẫn giữ phiên test ở cục bộ |

Test của gói tổ hợp cơ sở cố định biểu thức chế độ `DISABLED` đã bàn giao, bộ test backend cố định việc không tạo truyền tải khi bỏ qua chế độ, còn test tổ hợp Loader thật chọn rõ ràng từng chế độ upload khi xác minh việc gửi OTLP.

## Các phương án thay thế đã cân nhắc

**Mặc định không mount, để bên triển khai tự thêm dòng cấu hình.** Không áp dụng: chế độ `DISABLED` được mount vẫn giữ lại cảnh báo phản hồi cục bộ, và cung cấp cùng một mục tiêu patch cho mọi profile, đồng thời không cho phép bất kỳ upload nào.

**Làm công tắc thành trường config thay vì env patch.** Không khả thi: dòng cordis không có ngữ nghĩa disable ở tầng config, và kiểm tra `exporter.url` fail-loud ngay khi khởi tạo plugin, công tắc phải có hiệu lực trước Loader — tầng patch AppCLIEntry là nơi duy nhất khả thi.

**`Promise.race` với timeout dự phòng khi thoát.** Ban đầu tạm hoãn, vì tham số SDK có vẻ đã giới hạn thời gian drain backend ở khoảng 1.5-3s (thường <100ms), thực đo thời gian từ SIGINT đến thoát là 110ms-1.1s. Sau đó tái hiện được trong sandbox Linux và chứng minh `BatchLogRecordProcessor.shutdown()` có thể chờ vô hạn bên trong `exporter.forceFlush()`, không bao giờ vào được Promise hoàn tất bị giới hạn bởi `exportTimeoutMillis`. Do đó, [bản sửa tắt CLI](../bug-fix/2026-08-03-cli-signal-shutdown-escalation.md) vừa thêm trần backend 3 giây cho lỗ hổng cụ thể này, vừa thêm trần cấp tiến trình 5 giây và đường thoát khi nhận tín hiệu lặp lại cho toàn bộ cây plugin.

## Hệ quả

- Khi lập trình viên chạy `dsh web` mà không có cấu hình telemetry, sẽ không phát sinh yêu cầu mạng telemetry nào. Bản triển khai nội bộ cần đặt `DSH_TELEMETRY_MODE`, và có thể trỏ `DSH_TELEMETRY_OTLP_URL` sang collector khác.
- **Không mount bất kỳ quy tắc khử nhạy cảm nào**: khi bật rõ ràng, dữ liệu xuất ra là bản sao thô nguyên vẹn (toàn văn tin nhắn người dùng/trợ lý, tham số công cụ và kết quả công cụ, system prompt, đường dẫn cục bộ `session.cwd`). Phải mount quy tắc `session-telemetry/record` trước khi vượt qua ranh giới tin cậy; quy tắc khử nhạy cảm, các thuộc tính Resource danh tính còn lại, và các chỉ số sử dụng vẫn là công việc triển khai độc lập. Id người dùng ẩn danh do [Note id người dùng ẩn danh](2026-07-31-telemetry-anonymous-user-id.md) cung cấp.
- Phương tiện test mặc định giữ dữ liệu ở cục bộ; test bật rõ ràng chế độ upload tự cung cấp collector và chế độ của riêng nó.
