# Agent Note: Thay quy ước hành văn bằng gate chất lượng máy móc

Status: implemented

[English](2026-06-11-quality-gates.md) | 中文

Thiết kế đối xứng hook/CI trong Note này đã được thay thế bởi [Git hook cục bộ nhanh](2026-07-22-fast-local-git-hooks.md); CI vẫn là con đường thực thi kiểm tra đầy đủ.

## Vấn đề

Repo này chủ yếu được phát triển bởi coding agent. So với quy ước hành văn, độ tin cậy của agent trong việc tuân thủ gate bắt buộc cao hơn nhiều; và khi khối lượng công việc do agent đảm nhận, "khối lượng công việc lớn" không còn là lý lẽ về chi phí. Bằng chứng ban đầu: test không qua được kiểm tra kiểu (vitest không kiểm tra kiểu) đã được commit, và chỉ bị phát hiện lúc review.

## Quyết định

Mỗi cam kết trong AGENTS.md có thể kiểm tra bằng máy móc đều có một lệnh thoát với mã khác 0. CI thực thi toàn bộ tập hợp, còn Git hook chỉ dành ngân sách độ trễ cho các lỗi cục bộ có thể phát hiện với chi phí thấp:

- Cấu hình TypeScript nghiêm ngặt nhất (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, v.v.); example, test và script được kiểm tra kiểu trong CI qua `tsconfig.json` no-emit ở thư mục gốc, còn code package/vendor vẫn nằm sau ranh giới project-reference riêng của chúng.
- [Oxlint](2026-07-29-oxlint-linter.md) kết hợp quy tắc TypeScript nhận biết kiểu cùng plugin tương thích @stylistic và SonarJS, cưỡng chế phong cách code thống nhất và kiểm tra logic trùng lặp trong cùng file; code vendor được loại trừ.
- jscpd phát hiện bản sao xuyên file trong code TypeScript sản phẩm của package và script của repo; các đoạn source code phạm vi hẹp được miễn trừ dùng để ghi lại các cài đặt song song có chủ ý.
- Coverage 100% theo từng file (v8) dưới `packages/*/*/src`; các guard phòng thủ không thể chạm tới dùng `/* v8 ignore */` kèm lý do, thay vì bị xóa.
- knip (dead code/dependency), publint (tính đúng đắn của package), ràng buộc workspace (quy tắc workspace: private, cordis peer+dev, version thống nhất, ESM), và kiểm tra kiểu cho bên tiêu thụ NodeNext đối với file khai báo của package đã build.
- lefthook pre-commit thực thi xác minh Oxlint không load project và áp dụng bản sửa an toàn với [một lần retry có giới hạn](2026-08-09-oxlint-only-fix-workflow.md), từ chối vấn đề khoảng trắng đã staged và kiểm tra manifest vendor (danh sách metadata); pre-push chạy kiểm tra kiểu gia tăng. CI chạy toàn bộ ma trận trên Node 22.19/24/26, và thực hiện smoke test trên ứng dụng đã build cho các đường vào Headless, TUI, ACP (Agent Client Protocol), JSON-RPC, workflow và code runtime.

## Hệ quả

- Quy ước không bị mất hiệu lực khi agent thay đổi; lỗi commit/push có thể phát hiện với chi phí thấp sẽ kích hoạt fail cục bộ, các vi phạm còn lại sẽ kích hoạt fail trong kiểm tra đầy đủ của CI.
- Bản thân gate cũng là code cần bảo trì; thay đổi cấu hình cần được review giống mọi thay đổi khác.
- Áp lực coverage 100% có thể sinh ra test không có assertion — mutation testing là biện pháp đối phó đã lên kế hoạch (xem [đề xuất mutation testing](../../proposed/testing/2026-06-11-mutation-testing.md)).

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
