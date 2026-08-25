# Agent Note: Telemetry phải được bật tường minh

Status: implemented

[English](2026-08-10-telemetry-default-off.md) | Tiếng Việt

## Vấn đề

DeepSeek Harness có hai luồng dữ liệu telemetry đi ra ngoài. Trong giai đoạn thử nghiệm nội bộ, cấu hình nền tảng dùng chung đã gắn sẵn telemetry với endpoint sản xuất tích hợp sẵn, và cả hai luồng dữ liệu đều mặc định gửi báo cáo để giúp chẩn đoán các vấn đề khi báo cáo: backend OTel của session có thể xuất toàn bộ nội dung session, dữ liệu công cụ (tool), prompt và đường dẫn workspace khi bỏ qua `mode`, còn luồng dữ liệu của launcher dsh-sdk thì gửi ra ngoài vô điều kiện. Do đó, một bản cài đặt hoàn toàn mới cho phép gửi báo cáo ra ngoài mà bên triển khai không cần chủ động lựa chọn tham gia.

## Quyết định

Cả hai luồng dữ liệu đều dùng `DSH_TELEMETRY_MODE` làm cấu hình cấp phép tích cực (positive authorization). Cả trạng thái chưa thiết lập và giá trị rỗng đều được diễn giải là `DISABLED`. `@deepseek-ai/dsh-session-telemetry-otel` cũng diễn giải `mode` bị bỏ qua là `DISABLED`; ở chế độ này, provider, processor và exporter OTel sẽ không được khởi tạo, và phản hồi (feedback) được giữ lại trong session log cục bộ. Cấu hình nền tảng dùng chung của dsh vẫn tiếp tục gắn dòng cấu hình backend, để chế độ disabled vẫn có thể ghi chú rằng không có gì được chia sẻ khi ghi lại phản hồi. Bên triển khai bật chia sẻ Session Log một cách tường minh bằng `FULL` hoặc `FEEDBACK_ONLY`; chỉ `FULL` mới cho phép launcher dsh-sdk gửi báo cáo. Bất kỳ giá trị `DSH_TELEMETRY_DISABLED` nào khác rỗng vẫn là công tắt tắt cứng có mức ưu tiên cao nhất, hoạt động trước khi load. [Quyết định gắn mặc định](2026-07-31-web-telemetry-default-mount.md) tiếp tục chịu trách nhiệm về endpoint, nhịp độ xử lý theo lô (batch) và cấu hình xả (drain) khi thoát.

Launcher dsh-sdk đọc cùng một biến đó, không phân giải `cordis.yml`, và cũng không khởi động Cordis. `FULL` cho phép gửi báo cáo; `FEEDBACK_ONLY`, `DISABLED`, trạng thái chưa thiết lập và giá trị rỗng đều bị từ chối. Việc cấp phép được đóng băng từ môi trường khởi động trước khi lệnh thực thi: `dsh-sdk start` sẽ nạp `.env` của project, mà mã nguồn của project cũng có thể sửa `process.env`, nên nếu phân giải sau khi thực thi, project có thể tự cấp phép gửi báo cáo về chính cấu hình của mình, trong khi [quyết định về quyền sở hữu nguồn cấu hình](../architecture/2026-08-04-configuration-source-ownership.md) cấm hành vi này trên toàn bộ namespace `DSH_*`. Ở ranh giới này, các chế độ không được hỗ trợ sẽ được xử lý như bị từ chối thay vì ném lỗi (throw), vì telemetry không được phép làm thay đổi kết quả của lệnh. Quy tắc này chỉ thay thế quy tắc cũ trong đó launcher mặc định cho phép gửi báo cáo, cho đến khi bản thân launcher và đề xuất của nó bị xóa bỏ bởi [quyết định loại bỏ toolchain project của SDK](../simplification/2026-08-11-remove-sdk-project-toolchain.md).

[CLI reference README](../../../../apps/cli/reference/README.md) ghi lại quy ước triển khai này: việc tải lên session log mặc định là tắt, `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` và `DSH_TELEMETRY_MODE=FULL` là hai lựa chọn bật tường minh, và việc xuất dữ liệu sau khi bật tường minh có thể bao gồm toàn bộ nội dung session. [Tuyên bố giới thiệu (onboarding) ở giai đoạn thử nghiệm](2026-08-13-shared-modal-product-onboarding.md) sau khi được khôi phục không chứa văn bản về telemetry, do đó sản phẩm vẫn không đưa ra bất kỳ gợi ý nào về việc bật tải lên.

## Các phương án thay thế đã cân nhắc

**Giữ nguyên cơ chế tắt mặc định và cải thiện phần công bố (disclosure).** Không chọn: việc công bố không thể khiến sự thiếu vắng cấu hình trở thành sự cấp phép rõ ràng cho việc gửi dữ liệu, đặc biệt khi telemetry của session có thể chứa toàn bộ nội dung cục bộ.

**Đặt telemetry của session mặc định là `FEEDBACK_ONLY`.** Không chọn: ngay cả khi bên triển khai không chủ động bật gửi báo cáo ra ngoài, việc ghi lại phản hồi vẫn sẽ kích hoạt tải lên. Giá trị mặc định phải giữ cho cả session lẫn phản hồi của nó đều ở lại cục bộ.

**Thêm một cờ cấp phép ở cấp project.** Không chọn: `DSH_TELEMETRY_MODE` đã đủ khả năng biểu đạt cấp phép cho cả hai luồng dữ liệu; thêm một mục cấu hình khác sẽ tạo ra các thiết lập xung đột và cần logic phân giải riêng cho launcher.

**Xóa bỏ cả hai cách triển khai telemetry.** Không chọn: các bản triển khai nội bộ vẫn cần bật tường minh `FULL` và việc gửi báo cáo do phản hồi kích hoạt; ở chế độ `FULL`, luồng dữ liệu của launcher vẫn còn hữu ích.

## Hệ quả

Các profile và project hoàn toàn mới không phát ra bất kỳ request mạng telemetry nào. Các bản triển khai nội bộ chọn một chế độ cho cả hai luồng dữ liệu: `FEEDBACK_ONLY` chỉ cho phép chia sẻ Session Log do phản hồi kích hoạt, còn `FULL` còn bật thêm việc gửi báo cáo từ launcher. Công tắc tắt cứng hiện có vẫn tiếp tục có hiệu lực, và chế độ tải lên vẫn giữ nguyên việc xác thực endpoint, trách nhiệm ẩn danh hóa dữ liệu (redaction), xử lý theo lô và hành vi khi tắt.
