# Packages

[English](README.md) | 中文

npm scope là `@deepseek-ai/dsh-*`; các lớp con `Service` của Cordis và plugin dạng hàm đăng ký qua `ctx.effect()`, `ctx.on()` hoặc `ctx.waterfall()`. Quy tắc xem tại [packages](AGENTS.md) và [quy tắc gốc](../AGENTS.md#conventions).

## Cấu trúc phân lớp

Package được đặt theo nhóm tại `packages/<group>/<pkg>/`; tên package vẫn là `@deepseek-ai/dsh-<pkg>`. **README của nhóm chịu trách nhiệm ánh xạ package/ctx key.**

| Nhóm | Trách nhiệm | Kỳ vọng phát hành |
|---|---|---|
| [`core/`](core/README.md) | Trục xương sống API sản phẩm: session, prompt, tool, dịch vụ agent (tác tử) và vòng lặp cụ thể | Sản phẩm: API ổn định |
| [`api/`](api/README.md) | Lắp ráp Remote BFF và cổng RPC Typert | Sản phẩm: API ổn định |
| [`typert/`](typert/README.md) | Sinh type graph, nạp artifact và registry runtime | Sản phẩm: API ổn định |
| [`goal/`](goal/README.md) | Lưu bền vững và vòng đời goal cùng session | Sản phẩm: API ổn định |
| [`schedule/`](schedule/README.md) | Follow-up định thời chỉ trong phạm vi session | Sản phẩm: API ổn định |
| [`feedback/`](feedback/README.md) | Phản hồi từ con người | Sản phẩm: API ổn định |
| [`identity/`](identity/README.md) | Danh tính ẩn danh dùng chung | Sản phẩm: API ổn định |
| [`llm/`](llm/README.md) | Nhóm năng lực LLM (mô hình ngôn ngữ lớn): dịch vụ trừu tượng + adapter nhà cung cấp | Sản phẩm: API ổn định |
| [`e2b/`](e2b/README.md) | Nhà cung cấp E2B | POC |
| [`subprocess/`](subprocess/README.md) | Nhóm năng lực subprocess: Service Definition + nhà cung cấp cây tiến trình cục bộ | Sản phẩm: API ổn định |
| [`shell/`](shell/README.md) | Nhóm năng lực Bash: seam executor, triển khai cục bộ, công cụ hướng tới model | Sản phẩm: API ổn định |
| [`terminal/`](terminal/README.md) | Nhóm năng lực PTY bền vững: session giới hạn phạm vi chủ sở hữu, triển khai cục bộ và công cụ hướng tới model | Sản phẩm: API ổn định |
| [`code-runtime/`](code-runtime/README.md) | Nhóm năng lực thực thi code: Service Definition + nhà cung cấp worker thread + Consumer Code Mode | Sản phẩm: API ổn định |
| [`sandbox/`](sandbox/README.md) | Seam giới hạn tiến trình; backend bwrap/Landlock/Seatbelt | Sản phẩm: API ổn định |
| [`fs/`](fs/README.md) | Nhóm năng lực hệ thống tệp: seam, triển khai cục bộ, công cụ tệp hướng tới model, công cụ khám phá dựa trên bash | Sản phẩm: API ổn định |
| [`lsp/`](lsp/README.md) | Nhóm năng lực LSP: seam, nhà cung cấp stdio chung và công cụ `lsp` | Sản phẩm: API ổn định |
| [`skill/`](skill/README.md) | Nhóm năng lực skill (kỹ năng): registry nhà cung cấp, nhà cung cấp cục bộ và catalog/loader hướng tới model | Sản phẩm: API ổn định |
| [`compaction/`](compaction/README.md) | Nhóm năng lực nén (compaction): Service Definition + nhà cung cấp cơ sở + Consumer lệnh | Sản phẩm: API ổn định |
| [`context/`](context/README.md) | Ngữ cảnh yêu cầu hiển thị với model, gồm chỉ dẫn workspace và ngữ cảnh thời gian | Sản phẩm: API ổn định |
| [`subagent/`](subagent/README.md) | Nhóm năng lực subagent: quy ước registry nhà cung cấp và công cụ ủy quyền hướng tới model | Sản phẩm: API ổn định |
| [`jobs/`](jobs/README.md) | Runtime tác vụ nền chung và công cụ điều khiển `job_*` hướng tới model | Sản phẩm: API ổn định |
| [`workflow/`](workflow/README.md) | Seam workflow, engine worker thread và công cụ `workflow`/`ralph` hướng tới model | Sản phẩm: API ổn định |
| [`web/`](web/README.md) | Nhóm năng lực Web: seam, triển khai nhà cung cấp search/fetch và công cụ Web hướng tới model | Sản phẩm: API ổn định |
| [`attachment/`](attachment/README.md) | Định danh attachment bền vững, xác thực, kho lưu trữ theo địa chỉ nội dung cục bộ | Sản phẩm: API ổn định |
| [`spill/`](spill/README.md) | Nhóm năng lực spill: seam lưu trữ, triển khai cục bộ, chính sách spill kết quả công cụ | Sản phẩm: API ổn định |
| [`todo/`](todo/README.md) | Công cụ `todo_write` hướng tới model | Sản phẩm: API ổn định |
| [`plan/`](plan/README.md) | Trạng thái cộng tác Plan, cung cấp lệnh đi thẳng vào và lối thoát đã qua review | Sản phẩm: API ổn định |
| [`preset/`](preset/README.md) | Lắp ráp agent theo từng session từ preset `cordis.yml` | Sản phẩm: API ổn định |
| [`guard/`](guard/README.md) | Guard vệ sinh vòng lặp: nhắc nhở gợi ý gọi lặp lại + bộ thực thi hạn chót `tools/execute` | Sản phẩm: API ổn định |
| [`bundle/`](bundle/README.md) | Lớp patch `dsh --profile` có thể cài đặt | Sản phẩm: API ổn định |
| [`extensions/`](extensions/README.md) | Tự sửa đổi runtime agent: kiểm tra plugin/dịch vụ theo thời gian thực và gắn/gỡ plugin do model viết ([thiết kế](../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md)) | Sản phẩm: API ổn định |
| [`hooks/`](hooks/README.md) | Cầu nối hook + thư viện giao thức dây (wire protocol) chung Claude Code/Codex | Sản phẩm: API ổn định |
| [`session/`](session/README.md) | Mặt phẳng dữ liệu session bền vững: seam lưu bền vững + backend JSONL/SQLite, seam chiếu (projection), tiêu đề dựa trên log, báo cáo session | Sản phẩm: API ổn định |
| [`session-query/`](session-query/README.md) | Nhóm truy vấn session: corpus logic, đọc có giới hạn, gia phả (lineage), quan hệ sự kiện, lọc ngữ nghĩa và tìm kiếm toàn văn SQLite | Sản phẩm: API ổn định |
| [`settings/`](settings/README.md) | Seam settings người dùng + nhà cung cấp dựa trên file | Sản phẩm: API ổn định |
| [`credentials/`](credentials/README.md) | Seam tham chiếu credential + nhà cung cấp ưu tiên biến môi trường hơn `.env` | Sản phẩm: API ổn định |
| [`storage/`](storage/README.md) | Trung tâm lưu trữ ngoài session + backend + dạng thức theo domain | Sản phẩm: API ổn định |
| [`workspace/`](workspace/README.md) | Thực thể Workspace | Sản phẩm: API ổn định |
| [`sdk/`](sdk/README.md) | SDK runtime ngoài tiến trình: giao thức JSON-RPC, client TypeScript và plugin server | Sản phẩm: API ổn định |
| [`acp/`](acp/README.md) | Máy chủ ACP (Agent Client Protocol) chỉ dành cho tự động hóa | Sản phẩm: API ổn định |
| [`interaction/`](interaction/README.md) | Mặt phẳng cộng tác người-máy: seam phê duyệt/tương tác, preset quyền hạn, lệnh, công cụ hỏi người dùng | Sản phẩm: API ổn định |
| [`boot/`](boot/README.md) | Lớp keo khởi động app bin dùng chung | Sản phẩm: API ổn định |
| [`host/`](host/README.md) | Nửa host của web GUI: API gateway + máy chủ định tuyến HTTP | Sản phẩm: API ổn định |
| [`client/`](client/README.md) | Nửa trình duyệt của web GUI: shell, tầng giao thức, dịch vụ đối tượng, slot, plugin `ui-*` | Sản phẩm: API ổn định |
| [`examples/`](examples/README.md) | Gói demo tổ hợp (agent-spine + bin CLI (giao diện dòng lệnh)/ACP/JSON-RPC), được nạp bởi leaf | Hỗ trợ: hạ tầng ví dụ |
| [`test-support/`](test-support/README.md) | Hạ tầng hỗ trợ (testkit, bất biến thức, replay, kiểm thử khói Loader) | Hỗ trợ: kỳ vọng tương thích thấp |
| [`util/`](util/README.md) | Công cụ tầng thấp không phụ thuộc dùng chung giữa các nhóm (`Branded<B>`, hàm hỗ trợ Harness home/path, timeout, retention) | Hỗ trợ: nhỏ, ổn định, không phụ thuộc harness |

Package mới gia nhập nhóm hiện có; nhóm mới cập nhật README và bảng này.

## Phụ thuộc

Đồ thị phụ thuộc do công cụ sinh ra: [docs/module-graph.md](../docs/module-graph.md) (`pnpm run gen-module-graph`, có cổng kiểm tra độ mới trong CI).

**Plugin mở rộng phụ thuộc vào Service Definition, không bao giờ phụ thuộc vào nhà cung cấp cụ thể.** `dsh-agent-loop` có thể thay thế; plugin UI, hook và công cụ dùng `dsh-agent`. Các gói tổ hợp, bao gồm cả `dsh-agent-spine-demo`, có thể phụ thuộc vào plugin trục chính. Năng lực sẽ tách các vai trò Service Definition/Service Provider/Consumer cần tiến hóa độc lập; xem chi tiết tại [capability seam](../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md).

README của package bao quát mục đích, API, điểm mở rộng và [trải nghiệm model](../docs/cookbook/adding-a-package.md#4-write-the-package-readme); trừ các package nằm trong [allowlist miễn trừ](../scripts/verify-package-readme-model-experience.ts) không liên quan tới model. Chúng cũng phải có `## Known Limitations and Deferred Work`, hoặc nằm trong [allowlist](../scripts/verify-package-readme-limitations.ts) của mục đó.
