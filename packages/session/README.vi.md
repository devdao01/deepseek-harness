# session/: mặt phẳng dữ liệu phiên bền vững

[English](README.md) | Tiếng Việt

Đây là họ tính năng bền vững được xây dựng quanh dịch vụ chạy trong bộ nhớ của `core/session`: bao gồm seam lưu trữ cùng các backend lưu trữ và chính sách checkpoint của nó, seam chiếu cung cấp các giá trị toàn phần suy ra từ nhật ký, tiêu đề dựa trên nhật ký, và telemetry phiên gửi ra ngoài. Tất cả đều là gói (package) **sản phẩm**. `session-query/` vẫn là một nhóm độc lập ngang cấp: việc tiêu thụ interface đọc/tool không phụ thuộc vào phần hiện thực nội bộ của lưu trữ.

## Lưu trữ

Cơ chế lưu trữ dữ liệu phiên bền vững, chính sách checkpoint ngữ nghĩa, và các backend lưu trữ được giao kèm sản phẩm.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`session-persistence/`](session-persistence/README.md) | Định nghĩa dịch vụ lưu trữ và cơ chế điều phối ghi dùng chung | `ctx.sessionPersistence` |
| [`session-checkpoint-policy/`](session-checkpoint-policy/README.md) | Áp dụng các checkpoint bền vững theo ngữ nghĩa | Bọc `ctx.llm` và `ctx.tools` |
| [`session-persistence-jsonl/`](session-persistence-jsonl/README.md) | Lưu phiên vào tệp JSONL | Đăng ký vào `ctx.sessionPersistence` |
| [`session-persistence-sqlite/`](session-persistence-sqlite/README.md) | Lưu phiên vào SQLite | Đăng ký vào `ctx.sessionPersistence` |

[Quyết định về lưu trữ phiên](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md) ghi lại thiết kế lưu trữ.

## Chiếu

Cung cấp cho các bên chuyên chở phía client trạng thái hiện tại theo từng phiên, được suy ra từ nhật ký.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`session-projection/`](session-projection/README.md) | Định nghĩa và vận hành các đơn vị chiếu phiên | `ctx.sessionProjections` |
| [`session-projection-cache/`](session-projection-cache/README.md) | Lưu và khôi phục checkpoint của phép chiếu | `ctx.sessionProjectionCache` |
| [`session-stats/`](session-stats/README.md) | Cung cấp số đếm phiên trên toàn nhật ký và thời gian đồng hồ tường (đơn vị `sessionStats`) | Đăng ký vào `ctx.sessionProjections` |

## Tiêu đề

Suy ra tiêu đề phiên bền vững từ nhật ký phiên, và hỗ trợ các nhà cung cấp tùy chọn do mô hình điều khiển.

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`session-title/`](session-title/README.md) | Chịu trách nhiệm về trạng thái tiêu đề, hành vi dự phòng, đăng ký nhà cung cấp và làm mới | `ctx.sessionTitle` |
| [`session-title-llm/`](session-title-llm/README.md) | Cung cấp khả năng sinh tiêu đề bằng mô hình dùng chung | — |
| [`session-title-first-prompt-llm/`](session-title-first-prompt-llm/README.md) | Sinh tiêu đề phiên từ thông điệp con người hợp lệ đầu tiên | Đăng ký vào `ctx.sessionTitle` |
| [`session-title-all-prompts-llm/`](session-title-all-prompts-llm/README.md) | Sinh tiêu đề phiên từ mọi thông điệp con người hợp lệ | Đăng ký vào `ctx.sessionTitle` |

Một triển khai có thể đăng ký một nhà cung cấp do mô hình điều khiển; khi không đăng ký, dịch vụ vẫn giữ cơ chế dự phòng tất định.

## Telemetry

Chiếu hoạt động của phiên thành telemetry gửi ra ngoài, và ủy nhiệm việc phân phối cho backend báo cáo đã cấu hình. [Quyết định về telemetry](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md) ghi lại biên báo cáo; [quyết định về chế độ](../../.agents/notes/implemented/feature/2026-08-05-feedback-gated-session-telemetry.md) ghi lại các chế độ phân phối tức thời, có kiểm soát theo phản hồi và bị vô hiệu hóa.

| Gói | Trách nhiệm |
|---|---|
| [`session-telemetry/`](session-telemetry/README.md) | Định nghĩa việc bắt giữ, khử nhạy cảm, chiếu, và phân phối tới backend theo thời gian thực hoặc theo yêu cầu. |
| [`session-telemetry-otel/`](session-telemetry-otel/README.md) | Phân phối telemetry qua nhật ký OpenTelemetry ở chế độ `FULL`, `FEEDBACK_ONLY` hoặc `DISABLED`. |

Tham khảo hệ thống con: [persistence.md](../../docs/subsystems/persistence.md), [session-projection.md](../../docs/subsystems/session-projection.md), [session-title.md](../../docs/subsystems/session-title.md) và [session-telemetry.md](../../docs/subsystems/session-telemetry.md). Tại một thời điểm chỉ cho phép một nhà cung cấp tiêu đề được đăng ký; nhánh chính demo gắn dịch vụ dự phòng, còn cả hai nhà cung cấp dùng mô hình đều nằm ngoài tổ hợp mặc định.
