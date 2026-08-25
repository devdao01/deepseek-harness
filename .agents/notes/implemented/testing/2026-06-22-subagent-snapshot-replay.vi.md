# Agent Note: Replay snapshot theo từng session cho agent lồng nhau

Status: implemented

[English](2026-06-22-subagent-snapshot-replay.md) | Tiếng Việt

## Vấn đề

Tầng snapshot (`pnpm run test:snapshot`) khởi động một subprocess `acp-agent` thật, replay các session đã ghi thông qua [`dsh-llm-replay`](../../../../packages/test-support/llm-replay), rồi diff đầu ra Agent Client Protocol đã chuẩn hóa cộng với session log được persist lại với đầu ra kỳ vọng đã commit. Hầu hết các kịch bản kiểm chứng hành vi backend đã bundle thông qua ranh giới tiến trình thật này.

Tầng này ban đầu được xây dựng với giả định mỗi tiến trình chỉ có một session, giả định này bị hard-code ở hai chỗ:

- **`dsh-llm-replay` không hề đánh khóa.** Nó dùng một con trỏ toàn cục, ánh xạ lần gọi `llm/stream` thứ N vào mục thứ N của một chuỗi ghi âm duy nhất. Khi agent cha và một subagent trong tiến trình cùng stream đồng thời trên cùng một ngữ cảnh, các lượt gọi xen kẽ nhau, con trỏ đơn lẻ này sẽ gửi script của agent con cho agent cha (và ngược lại).
- **harness chỉ thu thập một log duy nhất.** `findSessionLog` duyệt qua thư mục gốc sessions, trả về file `.jsonl` đầu tiên tìm thấy. subagent chạy như một `Session` thứ hai và có log riêng của nó, do đó transcript (bản ghi văn bản) của agent con bị âm thầm bỏ qua.

Đây chính là công việc bị hoãn lại bằng `TODO(subagent-snapshots)` trong [Agent Note về seam subagent](../feature/2026-06-21-subagent-capability-seam.md): khi backend trong tiến trình được đưa vào sản xuất đã có sẵn bao phủ unit + e2e, nhưng trước khi hạ tầng này ra đời, tầng snapshot transcript đầy đủ không thể biểu diễn hình dạng agent lồng nhau.

## Quyết định

Replay được đánh khóa theo **session gọi**, và harness thu thập **toàn bộ** các session log.

### 1. Id session gọi được gắn vào request model

`GenerateOptions` có thêm trường tùy chọn `sessionId`, được gán từ `agent.session.id` khi lắp ráp request. Adapter bỏ qua nó; listener `llm/stream` dùng nó để định tuyến theo session khởi phát. Kiểu của nó là `Branded<'SessionId'>` (từ `dsh-brand`) chứ không phải `SessionId` của `dsh-session`, vì package chứa loại sau import `Message` của `dsh-llm`, nếu import ngược lại sẽ tạo vòng lặp. Hai kiểu này tương đương, nên việc gán id session không cần chuyển đổi kiểu. Việc chuyển brand sang một package id chuyên biệt là công việc độc lập, vì nó sẽ ảnh hưởng tới mọi nơi import id.

### 2. Replay gắn session đang hoạt động vào script đã ghi theo thứ tự lượt gọi đầu tiên

Kịch bản lồng nhau ghi lại nhiều log: session cha (`session.jsonl`) cộng một log cho mỗi sub-session subagent (`session.1.jsonl`...). `dsh-llm-replay` nạp toàn bộ, suy diễn một script cho mỗi session đã ghi, và sắp xếp theo `createdAt` trong header (session cha được tạo trước sub-session).

Id của session đang hoạt động mỗi lần chạy đều là giá trị ngẫu nhiên hoàn toàn mới, không bao giờ bằng id lúc ghi âm, do đó session đang hoạt động không thể gắn vào script bằng cách so khớp id. Thay vào đó, việc gắn kết dựa trên **thứ tự lượt gọi đầu tiên**: session đang hoạt động đầu tiên khởi phát bất kỳ lượt gọi model nào sẽ nhận script đầu tiên theo thứ tự (tức session cha: `createdAt` sớm nhất, và chắc chắn stream trước tiên vì nó phải chạy một lượt trước khi ủy quyền), session đang hoạt động mới tiếp theo nhận script tiếp theo, cứ thế tiếp tục. Sau đó, mỗi session tự tiến con trỏ của riêng mình một cách độc lập.

Cách này đánh khóa theo ai đang gọi, chứ không phải theo thứ tự gọi toàn cục. Do đó, ngay cả khi trong tương lai subagent chạy đồng thời hoặc chạy nền (con trỏ toàn cục sẽ dẫn tới xen kẽ), cách này vẫn đúng. Các lượt gọi không mang `sessionId` (gọi trực tiếp `stream()` trong unit test) được coi là một session ẩn danh, gắn vào script chính, do đó đường dẫn một-session vẫn giống hệt hành vi cũ từng byte một. Khi số session đang hoạt động nhiều hơn số script đã ghi, hệ thống sẽ báo lỗi rõ ràng (xuất hiện subagent chưa được ghi âm), không bao giờ âm thầm định tuyến sai.

fixture (dữ liệu chuẩn bị trước cho test) con được sắp xếp theo `createdAt`, khớp với thứ tự gọi khi các session anh em thực thi theo thứ tự nghiêm ngặt. Quy tắc phân giải bằng id chỉ dùng để tạo thứ tự xác định cho các trường hợp cực đoan khi timestamp trùng nhau. sub-session đồng thời hoặc chạy nền phải dùng số thứ tự lượt gọi đầu tiên tường minh, thay vì dựa vào timestamp.

## Các phương án thay thế đã cân nhắc

Phương án từng được cân nhắc nhưng bị từ chối: **gộp log cha và con theo thứ tự gọi** thành một script toàn cục duy nhất (chỉ đúng khi subagent trong tiến trình thực thi lồng nhau nghiêm ngặt — agent cha bị chặn chờ agent con). Cách này đơn giản hơn cho triển khai đồng bộ hiện tại, nhưng cố định luôn bất biến "cha bị chặn bởi con" vào hệ thống; nếu trong tương lai giới thiệu subagent chạy nền/đồng thời thì sẽ thất bại. Đánh khóa theo từng session thì không.

### 3. harness thu thập toàn bộ log, ưu tiên session chính

`harvestSessionLogs` đệ quy thu thập mọi transcript có tên cố định `session.jsonl` bên dưới thư mục gốc sessions (backend JSONL cung cấp thư mục project/session riêng cho mỗi session cha và session con), phân tích header của từng file, và sắp xếp theo thứ tự ưu tiên session chính: session cấp cao nhất (không có `parentSession`) đứng trước, các sub-session sắp xếp theo `createdAt` tăng dần. `RunResult.sessionLogs` chứa nhiều log; spec khi ghi âm sẽ ghi ngược từng log vào fixture tương ứng (`session.jsonl` + `session.<n>.jsonl`), khi replay sẽ diff từng log thu thập được với fixture của nó. Bộ chuẩn hóa (normalizer) đã hỗ trợ nhiều id session và sẽ gộp bất kỳ UUID rời rạc nào, nên không cần sửa bộ chuẩn hóa.

### 4. Kịch bản

Bổ sung hai kịch bản lồng nhau mới, cả hai đều ghi âm với API thật:

- **`subagent-spawn-in-process`**: agent cha thông qua công cụ `subagent` ủy quyền một tác vụ con cho một agent con spawn mới (2 session).
- **`subagent-multi`**: agent cha ủy quyền hai tác vụ con, mỗi tác vụ giao cho agent con spawn riêng của nó (3 session), dùng ba script riêng theo từng session và thứ tự `createdAt` của hai sub-session dưới cùng một agent cha để stress-test việc đánh khóa theo từng session.

Cả hai đều được replay không cần key trong cổng kiểm tra mặc định.

## Hệ quả

- Mục hoãn `TODO(subagent-snapshots)` đã được giải quyết: transcript của agent lồng nhau giờ là một hình thái hạng nhất của tầng snapshot.
- `GenerateOptions.sessionId` là một bổ sung nhỏ và trung thực cho core API, hữu ích cả ngoài phạm vi replay (telemetry, định tuyến request).
- Công cụ `subagent` gắn với một provider duy nhất, do đó cả hai agent con trong `subagent-multi` đều là spawn (tạo hoàn toàn mới). Việc đánh khóa định tuyến theo session chứ không theo backend, nên cũng đúng đối với fork. Nhưng logic *suy diễn* script trước đó lại không đúng: log của sub-session fork bắt đầu bằng tiền tố cha đã được gieo mầm (các sự kiện `assistant/chunk` của session cha), nếu suy diễn script từ toàn bộ log thì sẽ replay response của agent cha như thể là của agent con. Lỗ hổng về tính đúng đắn này được lấp đầy bằng cách persist ranh giới seed — xem [Ranh giới seed bền vững để đảm bảo replay sub-session fork định tuyến đúng](2026-06-22-fork-child-replay-seed-boundary.md) — các kịch bản fork và spawn+fork hỗn hợp đã ghi âm giờ kiểm chứng cả hai phương thức truyền tải thông qua một transcript duy nhất (xem [Ghi lại các kịch bản snapshot fork và spawn+fork hỗn hợp](../../archived/testing/2026-06-22-fork-snapshot-scenarios.md)).
- subagent ngoài tiến trình (ACP, Agent Client Protocol) là một hình thái replay hoàn toàn khác (mỗi agent con là tiến trình riêng của nó, có replay riêng), được ghi lại là `TODO(acp-subagent-replay)` trong `subagent-acp`.
