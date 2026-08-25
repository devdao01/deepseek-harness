# Agent Note: Ranh giới seed bền vững để đảm bảo replay sub-session fork định tuyến đúng

Status: implemented

[English](2026-06-22-fork-child-replay-seed-boundary.md) | Tiếng Việt

## Vấn đề

[Agent Note về replay snapshot theo từng session](2026-06-22-subagent-snapshot-replay.md) cho phép tầng snapshot biểu diễn hình dạng agent (tác tử) lồng nhau: một cha (parent) cộng với một log ghi chép riêng cho mỗi subagent trong tiến trình, mỗi log được đánh khóa theo session gọi và replay bằng một script độc lập. Note đó từng chỉ ra (mục § Phạm vi, dấu đầu dòng cuối) rằng snapshot fork "chỉ là một mục dễ dàng bổ sung trong tương lai, không phải một lỗ hổng về đánh khóa". Nhận định này là sai đối với sub-session fork — vấn đề không nằm ở việc đánh khóa, mà ở việc *suy diễn script*.

Script của subagent được [`deriveReplayScript`](../../../../packages/test-support/llm-replay) suy diễn từ session log đã ghi lại: nó nhóm các sự kiện `assistant/chunk` trong log theo cặp `(turn, step)`, mỗi lần gọi `stream()` tương ứng với một mục replay. Đối với sub-session dạng **spawn**, cách này đúng, vì log của nó chỉ chứa các lượt gọi model của chính nó.

sub-session dạng **fork** thì khác. Backend fork gieo mầm (seed) cho sub-session bằng *một đoạn tiền tố cân bằng gồm các lượt đã hoàn tất, trích từ log của cha* ([`dsh-subagent-in-process-driver`](../../../../packages/subagent/subagent-in-process-driver)), và seed đó trở thành `log` bền vững của sub-session (constructor của `Session` sao chép seed vào `this.log`). Do đó file `.jsonl` của sub-session fork bắt đầu bằng các sự kiện của **session cha** — bao gồm cả các sự kiện `assistant/chunk` của cha — rồi mới đến các lượt của chính sub-session.

Việc suy diễn script từ toàn bộ log của sub-session fork sẽ khiến các response đã ghi của **session cha** bị replay như thể chúng là lượt gọi model của **sub-session**: khi sub-session fork thực tế chạy gọi `stream()` lần đầu tiên, nó sẽ nhận về chuỗi chunk đầu tiên của session cha thay vì của chính nó. Các kịch bản đã ghi tại thời điểm đó đều là spawn, nên vấn đề này chưa từng bị kích hoạt — nhưng snapshot fork sẽ âm thầm bị định tuyến sai, đúng loại bug mà sự tồn tại của tầng snapshot vốn nhằm bắt được.

## Quyết định

Ghi lại điểm kết thúc của tiền tố mà session **kế thừa**, persist nó, và để harness replay chỉ suy diễn script từ các sự kiện **của chính** sub-session.

### 1. `seedLength` trong header của session

`SessionHeader` có thêm trường tùy chọn `seedLength: number` — biểu diễn có bao nhiêu sự kiện dẫn đầu là được kế thừa qua seed, chứ không phải do chính session này tạo ra. Backend fork thiết lập giá trị này khi tạo sub-session (bằng độ dài của tiền tố gieo mầm); sub-session spawn hoàn toàn mới không thiết lập giá trị này (coi như bằng 0). Nó được truyền qua `CreateSessionOptions.meta` (và `CreateAgentOptions.meta`), và được thiết lập trong `SessionStore.prepare`.

`seedLength` là **tường minh**, không bao giờ được suy luận từ `seed.length`. Khi khôi phục/load, toàn bộ log đã lưu trữ của session được dùng làm seed, lúc đó `seed.length` là độ dài toàn phần chứ không phải ranh giới ban đầu — đường dẫn khôi phục thay vào đó lấy lại `seedLength` đã persist từ header đã load. (Cách làm giống hệt `createdAt`: khi khôi phục, giữ nguyên giá trị tường minh, thay vì đặt lại mặc định về thời điểm hiện tại.)

### 2. Cả hai backend persistence đều round-trip đầy đủ

- **JSONL**: trường `seedLength` trên dòng header (`toHeaderLine`/`fromHeaderLine`).
- **SQLite**: cột `seed_length` trên bảng `sessions`.

Cấu trúc SQLite bao gồm `seed_length`, `source_event_seqs` và `surface_op` là schema version 4. Cấu trúc version 3 trước đó có sự mơ hồ, do đó theo lập trường tiền phát hành, mọi `user_version` không phải hiện hành đều bị từ chối trực tiếp, không migrate.

### 3. Replay suy diễn script sub-session từ sau ranh giới

`parseSessionHeader` của `dsh-llm-replay` giờ cũng đọc `seedLength` (mặc định 0 nếu thiếu), `loadSessionScripts` suy diễn các mục của sub-session từ `parseSessionLog(text).slice(seedLength)` — tức là các sự kiện từ ranh giới trở về sau, chính là các lượt gọi model của chính sub-session. Đối với sub-session spawn, `seedLength` bằng 0, thao tác này là no-op, kịch bản spawn giữ nguyên từng byte.

Điều này lấp đầy lỗ hổng về tính đúng đắn định tuyến, được hai kịch bản fork đã ghi lại kiểm chứng end-to-end — xem [Ghi lại các kịch bản snapshot fork và spawn+fork hỗn hợp](../../archived/testing/2026-06-22-fork-snapshot-scenarios.md).

## Các phương án thay thế đã cân nhắc

- **Suy diễn ranh giới theo phương pháp heuristic trong `llm-replay`** (tiền tố gieo mầm là các sự kiện liên tục của cha, kết thúc ở `turn/end` cuối cùng trước `user/message` đầu tiên của sub-session). Từ chối: dùng một heuristic mong manh trong test harness để suy diễn lại một sự thật mà bên tạo ra dữ liệu (backend fork) đã biết sẵn. Việc persist ranh giới ngay tại nguồn (backend fork) là ứng dụng của quy tắc "tường minh tốt hơn ngầm định ở ranh giới package" áp dụng qua ranh giới persistence — bên đọc fixture (dữ liệu chuẩn bị trước cho test) của sub-session không bao giờ cần phải tái dựng lại việc kế thừa kết thúc ở đâu.
- **Giữ nguyên format version mà không tăng** (thế đứng "không ổn định" của `SESSION_FORMAT_VERSION = 0` mà event log dùng). Bị từ chối đối với *cấu trúc bảng* SQLite: `SCHEMA_VERSION` là một nút tăng đơn điệu và từ chối phiên bản cũ (một tập nhỏ, có thể liệt kê và đáng phân biệt các bản sửa đổi), khác với `version` của từ vựng sự kiện. Việc thêm cột chính là loại thay đổi bảng có tính phá vỡ mà nó version hóa, nên cần tăng.

## Hệ quả

- core và cả hai backend có thêm một trường header bền vững; danh mục subsystem (`persistence.md`) được cập nhật trong cùng thay đổi (khối `type-equiv` của `SessionHeader` / `CreateSessionOptions`).
- Các database SQLite schema v2 hiện có sẽ bị từ chối khi mở (không có dữ liệu người dùng ở giai đoạn tiền phát hành).
- Replay spawn không đổi (`seedLength` bằng 0). Replay fork giờ định tuyến sub-session tới đúng script của chính nó; được bao phủ bởi một test case hồi quy trong `llm-replay` (một fixture sub-session có tiền tố gieo mầm chứa chunk của session cha — script sub-session được suy diễn phải loại trừ nó, nếu không slice thì test case sẽ thất bại) và một test round-trip persistence (cả hai backend, thông qua quy ước coordinator dùng chung).
