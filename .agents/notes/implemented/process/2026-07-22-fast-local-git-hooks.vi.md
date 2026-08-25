# Agent Note: Git hook cục bộ nhanh

Status: implemented

[English](2026-07-22-fast-local-git-hooks.md) | Tiếng Việt

## Vấn đề

Agent đã chạy sẵn các test và kiểm tra có thể bao phủ chính thay đổi của nó, còn commit, push và CI có thể mỗi bên lại lặp lại một tập con ngày càng rộng của các bước đó. Vì vậy, bộ suite pre-push đầy đủ sẽ làm chậm mỗi lần push, khuếch đại các lỗi cục bộ ngẫu nhiên không liên quan tới thay đổi hiện tại, và CI chạy lại toàn bộ ma trận ngay sau đó cũng không cung cấp thêm tín hiệu mới.

Hook nhanh vẫn cần chặn được các lỗi có chi phí kiểm tra thấp và độ tin cậy cao trước khi công việc rời khỏi máy cục bộ. Vấn đề định dạng file đã staged, lỗi khoảng trắng, thiếu metadata source vendor, và lỗi kiểu trên toàn repo phù hợp với ranh giới này; bộ suite unit test, snapshot, kiểm tra tài liệu, build và kiểm tra `hygiene` của package thì thay đổi tùy theo phạm vi ảnh hưởng, không phù hợp với ranh giới này.

## Quyết định

[lefthook.yml](../../../../lefthook.yml) giữ cả hai hook như hai điểm kiểm tra cục bộ có giới hạn. Pre-commit chạy tuần tự: xác thực các file JavaScript và TypeScript đã thay đổi bằng cấu hình [Oxlint](2026-07-29-oxlint-linter.md) không tải project, áp dụng auto-fix an toàn với [một lần retry có giới hạn](2026-08-09-oxlint-only-fix-workflow.md), rồi stage lại các file này; `git diff --cached --check` từ chối lỗi khoảng trắng trong diff đã staged, và guard manifest vendor kiểm tra metadata source vendor. Pre-push chạy `pnpm run typecheck`; lệnh này sẽ chuẩn bị trước các quy ước Host Typert được sinh ra, rồi mới chạy kiểm tra kiểu tăng dần (incremental) phía Client.

Pre-commit không chạy phân tích kiểu, test, snapshot, kiểm tra tài liệu, build, `hygiene` hay bộ điều phối gate. Pre-push chỉ thêm bước build quy ước Host cần thiết cho việc kiểm tra kiểu trên toàn repo. Package script `check:all` chạy tùy chọn độc lập với các hook này, chọn danh sách bộ điều phối `check-all` từ [scripts/run-gates.ts](../../../../scripts/run-gates.ts); đây là lệnh dành cho contributor, không phải chỉ thị cho agent.

Agent kiểm tra diff sắp push, và chỉ chạy một lần phạm vi test và kiểm tra tối thiểu có thể bao phủ hành vi của mình. CI chịu trách nhiệm cho gate coverage toàn diện, kiểm tra artifact build và ma trận nền tảng. Chỉ khi được yêu cầu rõ ràng, đang chẩn đoán CI, hoặc thay đổi bao trùm toàn repo không thể được xác thực đáng tin cậy bằng bằng chứng phạm vi hẹp hơn, mới chạy đầy đủ toàn bộ ma trận kiểm tra cục bộ.

## Quan hệ thay thế

Quyết định này thay thế phần liên quan tới hook cục bộ trong [gate pre-push song song](2026-07-06-parallel-pre-push-gates.md), và phần liên quan tới tính đối xứng giữa hook và CI trong [thay quy phạm văn bản bằng gate chất lượng máy móc](2026-06-11-quality-gates.md). Các quyết định về bộ điều phối CI, gate package và thực thi máy móc trong các note trên vẫn còn hiệu lực.

## Các phương án thay thế đã cân nhắc

- **Giữ nguyên bộ suite pre-push đầy đủ và tối ưu bộ điều phối của nó** — cung cấp tín hiệu toàn diện sớm nhất, nhưng vẫn lặp lại bằng chứng mà agent đã chọn và CI, và các lỗi không liên quan vẫn chặn push.
- **Loại bỏ hoàn toàn pre-push** — chi phí push thấp nhất, nhưng sẽ mất đảm bảo cross-file nhanh mà TypeScript cung cấp sau nhiều commit.
- **Giữ kiểm tra kiểu ở pre-commit** — bắt lỗi kiểu sớm hơn, nhưng mỗi commit trung gian đều phải chịu chi phí, thay vì chỉ chạy một lần khi push; lint file đã staged đã bao phủ ranh giới cú pháp và style của bản thân commit rồi.
- **Đặt lint file đã staged ở chế độ chỉ kiểm tra** — tránh việc hook thay đổi file, nhưng contributor cố tình muốn giữ workflow auto-fix; một lần retry có giới hạn của Oxlint cùng `stage_fixed` của Lefthook giữ được workflow này mà không cần formatter riêng, cũng không cần chạy lại `git add`.

## Kết quả

Đường dẫn quan trọng cho commit thông thường là lint và xác thực Oxlint file đã staged không tải project; đường dẫn quan trọng cho push khi cache đã được làm nóng sẵn là kiểm tra kiểu tăng dần đã được chuẩn bị trước. Contributor vẫn có thể chọn chạy toàn bộ bằng một lệnh, mà không mở rộng đường dẫn quan trọng của hook hoặc tập hợp xác thực mà agent phải chạy. Thời gian chạy hook chỉ được ghi lại làm dữ liệu quan sát phát triển và bằng chứng PR (Pull Request), không đặt test đo thời gian vốn sẽ bị ảnh hưởng bởi tải máy chủ và trạng thái cache.

Push cục bộ thành công không còn chứng minh được rằng toàn bộ ma trận repo đã pass. Agent phải chọn bằng chứng hành vi liên quan, người review phải phán đoán lựa chọn đó có khớp với diff hay không, còn CI cung cấp tín hiệu toàn diện cho mỗi phiên bản push.
