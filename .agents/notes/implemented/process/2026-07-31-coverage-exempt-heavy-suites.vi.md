# Agent Note: Miễn trừ coverage cho các suite nặng

Status: implemented

[English](2026-07-31-coverage-exempt-heavy-suites.md) | Tiếng Việt

## Problem

Thời gian thực tế (wall clock) của lane coverage CI (`check:ci:coverage`) bị ghim bởi một số ít file test nặng: trong một lần profile toàn bộ cục bộ với 6 worker, 555 file test cộng dồn mất 1595 giây, trong đó riêng file `packages/typert/generator/tests/type-model.spec.ts` chiếm 885 giây, top 10 file chiếm 84% tổng thời gian cộng dồn. Điểm chung của các suite này là mỗi test case đều thực hiện phân tích compiler toàn workspace hoặc fixture (dữ liệu tiền đề kiểm thử) subprocess thật, việc instrument bằng v8 khuếch đại thời gian chạy của loại mã này lên nhiều lần.

Điểm lãng phí then chốt là: khoản "thuế" instrument mà các suite này phải trả **không đóng góp gì** cho ngưỡng per-file 100% — mã được đo lường mà chúng thực thi trong tiến trình hoặc vốn không nằm trong phạm vi ngưỡng, hoặc đã được các suite khác bao phủ đầy đủ một cách độc lập. Tiếp tục chạy chúng dưới instrument thuần túy là đánh đổi thời lượng lane để lấy về con số không thông tin.

## Decision

Tổng hợp `ci-coverage` được tách thành hai gate song song, toàn bộ test vẫn được thực thi, chỉ có các suite nặng không còn phải trả thuế instrument:

- **Gate instrument** (`test:coverage`): đặt `DSH_COVERAGE_EXEMPT_HEAVY=1`, `vitest.config.ts` dựa vào đó loại các suite được miễn trừ khỏi exclude của cả hai project, mọi file còn lại vẫn được instrument như cũ và gánh toàn bộ chứng minh ngưỡng. Gate tự tiêm env riêng (cơ chế `Gate.env` sẵn có), không vào env toàn cục của workflow, nên gate không-instrument chạy song song và lệnh `vitest run` chạy trực tiếp cục bộ đều không thấy biến này, hành vi không đổi.
- **Gate không instrument** (`test:coverage-exempt-heavy`): dùng positional filter khớp cặp để chạy đúng các suite được miễn trừ, đảm bảo tín hiệu đúng đắn không bị giảm.

`scripts/coverage-exempt.ts` là điểm danh sách duy nhất, tập trung giữ quy ước tư cách thành viên và cặp filter/exclude, ngăn hai phía lệch nhau.

### Danh sách miễn trừ và đối chiếu từng mục

Một suite có đóng góp cho coverage khi và chỉ khi nó thực thi trong tiến trình các file được đo lường (`coverage.include` = cây src của package). Danh sách hiện hành được đối chiếu từng mục:

| Suite miễn trừ | Mã được đo lường thực thi trong tiến trình | Coverage được ai tiếp nhận |
| --- | --- | --- |
| Toàn bộ 6 spec của typert generator | src của chính generator | src của generator đã bị loại trừ toàn bộ khỏi ngưỡng (`vitest.config.ts`), vốn không nằm trong phạm vi ngưỡng |
| Riêng tools-catalog.spec import thêm | src của `typert-registry`, `tool-cordis` | Test của từng package đã bao phủ đầy đủ độc lập (đo coverage tập trung thực tế không có lỗi ngưỡng) |
| `scripts/install-lefthook.spec.ts`, `scripts/oxlint-contract.spec.ts`, `scripts/change-scope.spec.ts` | Không có — đối tượng được test là mã nguồn `scripts/` (không bao giờ nằm trong coverage.include), cách thực thi là spawn subprocess | Không cần ai tiếp nhận |

### Quy ước tư cách thành viên

Việc miễn trừ mới phải đồng thời thỏa: mọi file được đo lường mà suite thực thi trong tiến trình đều đã được suite khác bao phủ đầy đủ (hoặc nằm trong danh sách loại trừ ngưỡng); filter và exclude chọn đúng cùng một tập file. Văn bản quy ước được bảo trì cùng file với danh sách.

### Gate tự động bảo vệ tính đúng đắn của danh sách

Chính ngưỡng per-file 100% là người bảo vệ danh sách miễn trừ, mục sai trong danh sách không thể lọt qua âm thầm:

- Nếu về sau một suite miễn trừ nào đó thực sự là nơi duy nhất bao phủ một file được đo lường, gate instrument sẽ đỏ ngay lập tức (file đó tụt dưới 100%);
- Ngược lại cũng vậy: nếu xuất hiện mã mới "chỉ có suite miễn trừ mới bao phủ", cũng sẽ đỏ ngay lập tức.

Do đó tính bất biến của kết quả coverage không phụ thuộc vào việc bảo trì danh sách thủ công, phù hợp với quy ước "cấu hình sai phải fail ồn ào". Thứ duy nhất mất đi là việc thực thi của các suite miễn trừ không còn sinh ra dữ liệu coverage — theo bảng trên, dữ liệu này hoàn toàn dư thừa, báo cáo cuối cùng giống hệt nhau theo từng file xét về ý nghĩa ngưỡng.

## Alternatives considered

- **Dùng `--exclude` của CLI để loại suite miễn trừ khỏi gate instrument.** Thực nghiệm cho thấy không hiệu quả: `cliExclude` của vitest 4 không tham gia vào việc resolve include theo từng project, ở cấu hình nhiều project các suite miễn trừ vẫn bị chọn, nên phải chuyển sang dùng env + config.
- **Giảm số worker hoặc tăng độ song song của gate.** Thực nghiệm trong sự cố cho thấy không hiệu quả: thời lượng thực tế của lane bị ghim bởi file dài nhất ở đuôi (thời gian cộng dồn/thời gian thực tế ≈ 4x độ song song hiệu dụng), điều chỉnh độ song song theo cả hai hướng đều không tác động được đến phần đuôi.
- **Chia shard qua nhiều runner (`--shard` + gộp blob).** Có thể ép thời lượng thực tế xuống thêm nhưng đưa vào độ phức tạp của matrix, pipeline artifact và job gộp; sau khi tách xong lane đã còn khoảng 2 phút, không đáng để trả thêm chi phí này. Nếu quy mô suite tăng thêm trong tương lai có thể đánh giá lại.
- **Xóa hoặc bỏ qua trực tiếp các suite nặng.** Từ chối: chúng là bằng chứng đúng đắn duy nhất cho typert generator và công cụ scripts, chạy song song không instrument giữ được toàn bộ tín hiệu.

## Verification

Đo thực tế trên CI (runner 16 nhân): trước khi tách đoạn gate mất 424 giây, sau khi tách hai gate chạy song song `test:coverage` mất 95.9 giây + `test:coverage-exempt-heavy` mất 71.1 giây, lane hội tụ về khoảng 96 giây (theo bên chậm hơn); số lỗi ngưỡng ở gate instrument trước và sau khi tách đều bằng không. `vitest list` xác minh việc bật/tắt env đúng là thêm/bớt đúng tập miễn trừ; `run-gates.spec.ts` bao phủ việc xây dựng đồ thị tổng hợp coverage.

## Consequences

- Đoạn gate của lane coverage giảm từ khoảng 7 phút xuống khoảng 96 giây, kết quả ngưỡng và tập test được thực thi không thay đổi.
- `DSH_GATE_CONCURRENCY` lấy lại được hai đối tượng có thể lập lịch trong lane này, bộ lập lịch tổng hợp không còn là truyền thẳng (pass-through).
- Việc thêm suite nặng vào danh sách phải hoàn thành việc đối chiếu tư cách thành viên như trên; mục sai sẽ khiến gate instrument fail ồn ào, chứ không âm thầm bào mòn coverage.
- Các suite miễn trừ không còn xuất hiện trong danh sách file đóng góp của báo cáo coverage; tín hiệu đúng đắn của chúng hoàn toàn do trạng thái đỏ/xanh của gate không instrument đảm nhiệm.
