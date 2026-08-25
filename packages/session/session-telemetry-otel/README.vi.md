# @deepseek-ai/dsh-session-telemetry-otel

[English](README.md) | Tiếng Việt

Backend OpenTelemetry cho [telemetry seam](../session-telemetry/), cũng là mục duy nhất mà bên triển khai cần nạp. `mode` của nó quyết định seam theo dõi sự kiện session theo thời gian thực, chỉ replay log có thẩm quyền khi có phản hồi, hay giữ telemetry ở local. Chế độ upload cấu thành nguyên trạng OTel JS SDK (`LoggerProvider` → `BatchLogRecordProcessor` → OTLP/HTTP log exporter), ánh xạ mỗi bản ghi đã bàn giao thành `logger.emit()`, và dùng hai phạm vi instrumentation (instrumentation scope): bản ghi ledger gắn dưới `@deepseek-ai/dsh-session-sessionTelemetry-otel`, bản ghi vận hành gắn dưới `@deepseek-ai/dsh-session-sessionTelemetry-otel/ops`. Danh tính resource bao gồm `service.name`/`service.version` (từ `APP_IDENTITY` của `dsh-llm`), cùng `user.id` ẩn danh của riêng gói này (`$DSH_HOME/.anonymous-user-id`; UUID ngẫu nhiên tạo khi dùng lần đầu, xóa tệp này sẽ reset); các danh tính này được mang theo một lần cho mỗi batch export, không mang theo từng bản ghi riêng lẻ.

## Cấu hình

```yaml
- id: sessionTelemetry-otel
  name: '@deepseek-ai/dsh-session-sessionTelemetry-otel'
  config:
    mode: FULL                # explicit opt-in; default: DISABLED
    shutdownTimeoutMillis: 3000 # optional; defaults to 3000
    exporter:                # passed verbatim to the SDK's OTLP/HTTP log exporter
      url: https://collector.example.com/v1/logs
      headers:
        authorization: !!js `Bearer ${process.env.OTLP_TOKEN}`
    processor: {}            # optional; passed verbatim to BatchLogRecordProcessor
```

| `mode` | Hành vi |
|---|---|
| `FULL` | Mỗi bản ghi đã projection đều được giao ngay cho OTel SDK, kể cả bản ghi vận hành vòng đời. |
| `FEEDBACK_ONLY` | Mỗi `feedback/record` sẽ replay phần đuôi của log session có thẩm quyền tính đến sự kiện đó, và thực hiện projection cùng che dấu (redaction). Bản ghi sau đó chờ sự kiện phản hồi tiếp theo; nếu không có phản hồi tiếp theo, nó ở lại local. |
| `DISABLED` | Giá trị mặc định. Không dựng bộ điều phối, nhà cung cấp, processor hay exporter nào. Không có bản ghi telemetry nào rời khỏi tiến trình. `feedback/record` sẽ ghi log `session sessionTelemetry is DISABLED; nothing will be shared and this feedback remains local`; sự kiện đó ở lại trong log session local. |

Cấu hình TypeScript theo hướng lập trình dùng enum `SessionTelemetryMode` đã export (`SessionTelemetryMode.FULL`, `SessionTelemetryMode.FEEDBACK_ONLY` hoặc `SessionTelemetryMode.DISABLED`); chuỗi ký tự literal thô không thể gán. Cấu hình Cordis đã serialize vẫn dùng giá trị chuỗi trong bảng trên.

Việc cấp quyền upload dùng cơ chế cho phép tường minh, và fail-closed. Truyền một mode không xác định qua việc dựng trực tiếp sẽ thất bại trước khi đọc cấu hình transport. Chỉ `FULL` chấp nhận lệnh gọi trực tiếp tới `ctx.sessionTelemetry.emit()`. `FEEDBACK_ONLY` cung cấp năng lực backend riêng tư cho bộ điều phối theo yêu cầu của nó, và chỉ coi là đồng ý khi đối tượng `feedback/record` đã được lưu tại `session.events[event.seq]` và danh tính đối tượng hoàn toàn giống nhau; giá trị bus phát ra độc lập sẽ bị bỏ qua. Kể cả khi có tùy chọn exporter, `DISABLED` cũng không bao giờ dựng luồng SDK.

Service đã gắn sẽ tiết lộ mode đã giải quyết (`full` / `feedback-only` / `disabled`) qua thuộc tính `sharing` của [`SessionTelemetrySharingStatus`](../session-telemetry/README.md#the-sharing-disclosure) của seam, nhờ đó văn bản xác nhận của `/feedback` có thể báo cáo session có được chia sẻ hay không và chia sẻ như thế nào. Việc tiết lộ này được thiết lập trong constructor, độc lập với việc thu thập: kể cả `DISABLED` cũng tiết lộ `disabled`.

`exporter.url` là bắt buộc trong `FULL` và `FEEDBACK_ONLY`, không có giá trị mặc định, và phải giải quyết được thành `http(s)`; trong `DISABLED` có thể bỏ qua và không được dùng. Trong chế độ upload, `shutdownTimeoutMillis` là một deadline lớp ngoài dương hữu hạn do DSH quản lý, mặc định 3000 ms; `processor.maxExportBatchSize` không phải số nguyên dương cũng sẽ khiến plugin thất bại khi nạp, vì SDK sẽ chấp nhận giá trị đó rồi lại treo khi đóng. Cả hai khối cấu hình SDK đều được truyền qua nguyên trạng (passthrough): mỗi trường của `OTLPExporterNodeConfigBase` (`headers`, `timeoutMillis`, `compression`, `keepAlive`, v.v.) đều đến được exporter; việc batch, nhịp export (`scheduledDelayMillis`), thử lại, giới hạn hàng đợi, và chiến lược mất dữ liệu khi thất bại liên tục, đều là hành vi SDK được điều chỉnh qua `processor`. Backend này không triển khai `flush()`: flush thông thường do batch processor đảm nhiệm. Trong khi đóng, OTel sẽ chờ `exporter.forceFlush()` trước, sau đó chờ promise hoàn tất bị giới hạn bởi `exportTimeoutMillis` của processor; nếu promise transport đó không bao giờ settle, gói này sẽ bỏ chờ khi `shutdownTimeoutMillis` hết hạn, ghi lại lỗi đóng đã bị cô lập qua bộ điều phối, và để ứng dụng tiếp tục tháo dỡ. Deadline đó không thể hủy transport của SDK, do đó bản ghi vẫn đang chờ xử lý tại thời điểm đó có thể mất khi tiến trình thoát.

## Dữ liệu nào rời khỏi máy

Trong chế độ upload, bản ghi mang theo `event.data` đầy đủ, nội dung tuân theo kết quả trả về từ waterfall (sự kiện chuỗi thác) `sessionTelemetry/record` của seam: nội dung tin nhắn người dùng và assistant, tham số tool và kết quả tool (output lệnh, nội dung tệp), system prompt đầy đủ và tool schema (`request/header`), văn bản todo, tóm tắt nén (compaction), `stderrSummary` của hook, văn bản phản hồi, và `cwd` của session (một đường dẫn local). Seam không mang bất kỳ quy tắc che dấu nào: khi chưa gắn listener `sessionTelemetry/record`, thứ được export chính là bản sao y nguyên đã bắt được, do đó bên triển khai export ra ngoài ranh giới đáng tin cậy phải tự gắn quy tắc của mình (xem [README của seam](../session-telemetry/README.md#the-redact-waterfall)). `FULL` chạy che dấu khi nối thêm; `FEEDBACK_ONLY` không giữ bản sao telemetry, mà chạy quy tắc đang được gắn tại thời điểm phản hồi kích hoạt việc replay log có thẩm quyền. Dù thế nào, credential của nhà cung cấp cũng không bao giờ xuất hiện: API key của adapter là tham số constructor chứ không phải sự kiện session, nên về mặt cấu trúc chúng không tồn tại trong log, và do đó cũng không tồn tại trong telemetry. `DISABLED` không dựng luồng SDK, cũng không giao bất kỳ nội dung đã bắt được nào cho backend.

## Ánh xạ trường

Bản ghi seam → bản ghi log SDK: `time` → `timestamp`/`observedTimestamp`; `severity` → `severityNumber`/`severityText` (INFO 9 / WARN 13 / ERROR 17); `body` → body log có cấu trúc; `attributes` giữ nguyên. Đầu nhận khử trùng lặp dựa trên `(session.id, event.seq)`, và cảnh báo theo cấp độ nghiêm trọng. Trong `FULL`, đầu nhận còn có thể phát hiện sự cố qua việc thiếu bản ghi `shutdown`: marker này phát ra khi session tự dispose (giải phóng tài nguyên) hoặc khi ứng dụng đóng; xuất hiện thêm sự kiện sau marker đó cho thấy telemetry đã bị nạp lại. Trong `FEEDBACK_ONLY`, tiền tố đã giải phóng thường không chứa marker `shutdown` tiếp theo, do đó thiếu marker này không phải tín hiệu sự cố. Luồng xuyên phả hệ (lineage) không tự đủ: session được khôi phục tiếp tục trên luồng của chính id của nó, từ nơi tiến trình trước dừng lại; session được fork có luồng bắt đầu từ ranh giới kế thừa, tiền tố của nó nằm trong luồng của session cha, được đầu nhận ghép lại dựa trên `session.parent_id` + `session.seed_length`. Log local sau khôi phục có thể chứa sự kiện đóng tổng hợp chưa từng được export; luồng giao thức trung thực với bản ghi thực sự đã giao cho SDK.

## Trải nghiệm mô hình

Không có. Backend này chỉ chuyển tiếp bản ghi đã che dấu của seam vào luồng OTel SDK; nó không bao giờ đóng góp bất kỳ nội dung nào vào request mô hình.

#### Ảnh hưởng KV Cache

Không có; gói này không cấu thành cũng không gửi request cho nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Cây mã nguồn thượng nguồn còn thực nghiệm**: `@opentelemetry/sdk-logs` vẫn được phát hành từ cây mã nguồn thực nghiệm (experimental) thượng nguồn; thay đổi API của SDK chỉ rơi vào gói này, và chỉ vào gói này; quy ước seam không đổi.
- **Hành vi collector thực tế thuộc về exporter của SDK**: xác thực, TLS, giới hạn tốc độ và các hành vi triển khai OTLP thực tế khác tuân theo SDK thượng nguồn, không do lớp tương thích riêng của gói này xử lý.
- **Snapshot tại thời điểm phản hồi**: `FEEDBACK_ONLY` không giữ bản sao telemetry riêng trước khi có phản hồi. Khi ghi phản hồi, nó đọc và che dấu log có thẩm quyền hiện tại; nếu sự cố xảy ra trước phản hồi thì không có gì được upload, và thay đổi chính sách trước phản hồi sẽ ảnh hưởng đến nội dung export của lần replay đó.
