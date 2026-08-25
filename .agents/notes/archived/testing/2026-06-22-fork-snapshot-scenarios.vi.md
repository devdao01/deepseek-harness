# Agent Note: Ghi hình kịch bản snapshot fork và spawn+fork hỗn hợp

Status: implemented

Archived: 2026-07-26

[English](2026-06-22-fork-snapshot-scenarios.md) | 中文

## Vấn đề

[Agent Note về ranh giới seed](2026-06-22-fork-child-replay-seed-boundary.md) (bản ghi quyết định của agent) giúp việc replay con fork định tuyến đúng: `dsh-llm-replay` dẫn xuất script con dựa trên ranh giới `seedLength` lưu bền vững và các sự kiện tại đó cùng sau đó, nên tiền tố cha mà con fork kế thừa sẽ không bị replay như lời gọi model của chính con. Nhưng khi triển khai, **không có kịch bản fork được ghi hình** — slice chỉ được bao phủ bởi unit test `llm-replay` (fixture (dữ liệu chuẩn bị trước cho test) con tổng hợp) và test round-trip lưu bền vững. Tầng snapshot transcript (bản ghi văn bản) đầy đủ — mạng lưới khởi động `acp-agent` thật và replay transcript lồng nhau end-to-end — chỉ có con spawn (`subagent-spawn`, `subagent-multi`). Nếu hồi quy định tuyến fork không khiến unit test báo đỏ, nó vẫn sẽ lọt qua tầng được xây dựng riêng để bắt hồi quy transcript này.

Hạ tầng snapshot cần để biểu diễn kịch bản fork đã sẵn sàng: cả hai backend trong tiến trình đều được gắn qua hai tool hướng tới model trong `cordis.yml` / `cordis.snapshot.yml` (`subagent` → spawn, `subagent_fork` → fork), harness thu thập log của mỗi sub-session, replay chuyển tiếp fixture của từng sub-session theo key `seedLength`. Điều còn thiếu là một *kịch bản đã ghi hình* để đẩy sub-session fork đi qua đường này.

## Quyết định

Ghi hình hai kịch bản dựa trên API thật, cả hai đều replay không cần key trong gate mặc định:

- **`subagent-fork`**: session cha hoàn thành một lượt để thiết lập một sự thật, sau đó ủy quyền một sub-task qua `subagent_fork`. Sub-session fork kế thừa hội thoại (log của nó mang `seedLength` khác 0), nên có thể trả lời dựa trên context của session cha. Đây là bộ bảo vệ hồi quy tập trung: `seedLength` của fixture sub-session chính là ranh giới mà slice replay dựa vào, được ghi lại từ fork thật chứ không phải tổng hợp thủ công.
- **`subagent-mixed`** — session cha hoàn thành một lượt, sau đó trong cùng transcript ủy quyền một lần qua `subagent` (con spawn hoàn toàn mới, `seedLength` bằng 0), rồi ủy quyền một lần qua `subagent_fork` (con fork, `seedLength` khác 0). Đây là kịch bản hỗn hợp spawn+fork mà cả Agent Note về ranh giới seed lẫn Agent Note replay theo từng session đều nêu tên như một mục cần bổ sung trong tương lai: một transcript bao phủ cả hai phương thức truyền và cả hai nhánh của slice (`seedLength` bằng 0 = không thao tác, `seedLength > 0` = cắt tiền tố kế thừa), hai con được sắp xếp theo `createdAt` là spawn trước, fork sau.

### Vì sao cần một lượt đầu tiên đã hoàn thành

Backend fork dùng **tiền tố đầy đủ đã cân bằng các lượt** của cha để seed cho con. Nếu cha thực hiện fork ngay ở lượt đầu tiên, sẽ không có lượt đã hoàn thành nào để kế thừa, do đó seed rỗng (≡ spawn hoàn toàn mới, `seedLength` bằng 0) — điều này sẽ không bao phủ slice. Vì vậy, cả hai kịch bản đều dùng input hai prompt: prompt đầu hoàn thành một lượt (thiết lập codeword mà sau đó yêu cầu con nhớ lại), prompt thứ hai ủy quyền fork. Codeword được nhớ lại trong transcript của con chỉ là kết quả phụ của hành vi model. Sản phẩm mang ràng buộc then chốt là `seedLength` được ghi trong fixture của con, được slice replay tiêu thụ.

## Hệ quả

- Slice định tuyến fork giờ được bảo vệ bởi tầng transcript đầy đủ, chứ không chỉ unit test. Loại bỏ `slice(seedLength)` (replay toàn bộ log sub-session) sẽ khiến **cả hai** kịch bản mới báo đỏ — sub-session fork sẽ nhận mảnh được ghi của session cha thay vì của chính nó — chứng minh bộ bảo vệ thực sự có tác dụng (đã kiểm chứng đỏ→xanh khi triển khai kịch bản).
- `subagent-mixed` là kịch bản snapshot đầu tiên vận hành hai backend subagent *khác nhau* trong cùng một transcript, đồng thời bao phủ việc replay theo key từng session xuyên suốt cả sub-session spawn và fork.
- Hình thái replay subagent ngoài tiến trình (ACP (Agent Client Protocol)) khác biệt (mỗi sub-session là một tiến trình độc lập, có replay riêng), vẫn được theo dõi bằng `TODO(acp-subagent-replay)` — kịch bản trong tài liệu này chỉ giới hạn trong tiến trình.
- Ghi hình lại (`pnpm run test:snapshot:record`) sẽ sinh lại toàn bộ bốn fixture fork/spawn từ API thật; hai kịch bản mới tự động bị bỏ qua khi không có key, nhất quán với mọi kịch bản đã ghi hình khác.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
