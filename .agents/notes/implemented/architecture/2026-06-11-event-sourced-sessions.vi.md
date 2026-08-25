# Agent Note: Session dựa trên event sourcing và lịch sử tin nhắn được suy dẫn

Status: implemented

[English](2026-06-11-event-sourced-sessions.md) | 中文

## Vấn đề

MVP yêu cầu việc theo dõi (tracing) nghiêm ngặt dựa trên event, và session có thể replay hoàn toàn (hệ thống trace, logging dựa trên event nghiêm ngặt, session có thể replay hoàn toàn).

## Quyết định

`Session` là một log `SessionEvent` chỉ-thêm (append-only), có kiểu, và là nguồn chân lý duy nhất. Lịch sử tin nhắn của LLM (mô hình ngôn ngữ lớn) được *suy dẫn* từ log (`deriveMessages()`); các mảnh stream thô được ghi lại để đảm bảo độ trung thực khi replay ở cấp độ token, còn sự kiện `assistant/message` sau khi lắp ráp mới là căn cứ có thẩm quyền để suy dẫn. Replay/fork = khởi tạo một session mới bằng log đã có.

Thao tác append là đồng bộ (hot path không bao giờ block vì I/O); `session/event` là thông báo đồng bộ; plugin persistence đệm việc ghi trễ, và chờ xả (drain) tại checkpoint `session/flush` được kích hoạt vào cuối mỗi turn.

Quy ước về thứ tự: agent loop (vòng lặp agent) nhận (claim) tin nhắn inbox trước, sau đó mới chạy `agent/pre-step`; chỉ mở `step/start` sau khi đã đưa ra quyết định enter, rồi mới append batch `user/message` được trả về trước khi tạo request. Đầu ra của provider được lắp ráp và append dưới dạng `assistant/message` xong mới phân phối tool, vì vậy persistent log ghi lại chính xác chuỗi tin nhắn mà tool thực sự tuân theo. Regression test đã cố định thứ tự này.

## Phương án thay thế từng cân nhắc

**Mảng tin nhắn có thể mutate + event chỉ phát ra như thông báo**: đơn giản hơn, nhưng state và log có thể phân kỳ; sau khi dùng event sourcing, log chính là state, phân kỳ trở nên bất khả thi về mặt cấu trúc.

## Hệ quả

- Replay, tracing và telemetry được đảm bảo về mặt cấu trúc, chứ không phải gắn thêm sau.
- Persistence vẫn là mối quan tâm của plugin; bộ nhớ tạm (in-memory storage) đi kèm cùng dsh-session.
- Từ vựng event có thể mở rộng qua hợp nhất (merge-extensible) (plugin có thể thêm event như compaction); [session persistence](2026-06-14-session-persistence.md) đã cố định cấu trúc của nó sau khi log có tính bền vững (persistence).
- Chi phí suy dẫn tăng theo độ dài log, compaction (dsh-compaction) là biện pháp giảm thiểu dự kiến, chứ không phải viết lại log.
