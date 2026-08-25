# Agent Note: Loại bỏ các giao diện tiện lợi lắp ráp (assembled) LLM không được tiêu thụ

Status: implemented

Archived: 2026-07-26

[English](2026-06-20-drop-unconsumed-llm-assembled-surfaces.md) | 中文

## Vấn đề

`LlmService` ([packages/llm/llm/src/index.ts](../../../../packages/llm/llm/src/index.ts)) phơi bày ba giao diện gọi trên model:

- `stream()`: `StreamChunk` thô, phân phối qua waterfall (event kiểu thác nước) `llm/stream`.
- `streamBlocks()`: một "view tiện lợi", đưa các mảnh (chunk) vào `BlockAssembler` và sinh ra `ContentBlock` đã lắp ráp theo đúng thứ tự stream ([index.ts:137-144](../../../../packages/llm/llm/src/index.ts)).
- `generate()`: một `GenerateResult` đã lắp ráp hoàn chỉnh, phân phối qua waterfall thứ hai `llm/generate` ([index.ts:151-157](../../../../packages/llm/llm/src/index.ts)).

Bên tiêu thụ sản xuất duy nhất của service LLM (mô hình ngôn ngữ lớn) là agent loop (vòng lặp tác nhân), và nó chỉ dùng `stream()`: đưa mảnh thô vào `BlockAssembler` của riêng nó, để ghi lại mảnh song song với việc lắp ráp, đảm bảo độ trung thực khi replay ([packages/core/agent-loop/src/loop.ts](../../../../packages/core/agent-loop/src/loop.ts), bước `ctx.llm.stream(req)`). Grep `streamBlocks` và `ctx.llm.generate` trong `packages/*/src` và `examples/*/src` không tìm thấy bất kỳ bên gọi sản xuất nào. Các tham chiếu duy nhất đến từ định nghĩa phương thức service, tài liệu và test; test adapter dùng `generate()` làm driver tiện lợi, nhưng chúng hoàn toàn có thể tiêu thụ `stream()` thủ công qua cùng hàm hỗ trợ assembler, không cần giữ một API sản xuất công khai chỉ vì việc đó.

Đây thuộc cùng mẫu hình với [xóa summary session có thể thay đổi](2026-06-19-drop-mutable-session-summary.md): API view lắp ráp có hợp đồng được test, nhưng được tiêu thụ bởi test chứ không phải mã sản xuất. Chúng được xây dựng mang tính suy đoán cho bên tiêu thụ không quan tâm tới delta cấp token, nhưng bên tiêu thụ thật duy nhất lại chính là bên quan tâm tới delta, để lưu trữ dữ liệu replay độ trung thực cao.

`streamBlocks()` kéo theo một mảng logic chuyên dụng của `BlockAssembler`: `flushReady()` và `flushRemaining()` ([packages/llm/llm/src/assembler.ts:138-168](../../../../packages/llm/llm/src/assembler.ts)) cùng trường con trỏ `flushed`, chỉ tồn tại để hỗ trợ việc sinh tăng dần theo thứ tự. `generate()` kéo theo `GenerateResult`, `BlockAssembler.result()`, và waterfall `llm/generate` — một bề mặt chặn thứ hai trên cùng luồng nền tảng. Việc agent loop dùng assembler chỉ giới hạn ở `push()` / `message()` / `usage` / `finish`, không liên quan tới flush theo stream hay lắp ráp service một lần.

## Quyết định

`stream()` là giao diện gọi LLM công khai duy nhất. Loại bỏ `streamBlocks`, `generate`, các kiểu event/result của chúng, và các phương thức hỗ trợ assembler chỉ được dùng bởi đường đó. Test adapter lắp ráp qua stream công khai bằng hàm hỗ trợ local; `BlockAssembler` chỉ giữ lại thao tác có bên tiêu thụ sản xuất.

## Các phương án thay thế đã cân nhắc

**Giữ `generate()` làm phương thức tiện lợi chỉ dùng cho test**: bị bác bỏ. Test adapter tiêu thụ `stream()` thủ công qua assembler dùng chung, đi đúng đường stream giống hệt sản xuất; một phương thức công khai chỉ có bên gọi duy nhất là test, chính là dạng giao diện chết mà [tiền lệ drop-mutable-summary](2026-06-19-drop-mutable-session-summary.md) đã loại bỏ. Nếu tương lai có bên tiêu thụ cần block đã lắp ráp không có delta, hãy đưa vào một hàm hỗ trợ tập trung cho bên tiêu thụ đó lúc bấy giờ.

## Kiểm chứng

`streamBlocks`, `generate`, `llm/generate` và các hàm hỗ trợ assembler chỉ dùng cho chúng đều đã bị loại bỏ, và không tạo ra export vô dụng mới; cả hai adapter thật đều pass test qua `stream()` và assembler dùng chung; hành vi loop giữ nguyên (output kỳ vọng của snapshot ACP (Agent Client Protocol) không đổi); README, tài liệu kiến trúc và tài liệu module cũng không còn nhắc tới bề mặt đã xóa.

## Hệ quả

- **Loại bỏ phương thức công khai khỏi một package từ vựng lõi.** Nếu tương lai có plugin cần block đã lắp ráp không có delta, nó sẽ cần gọi trực tiếp `stream()` và dùng `BlockAssembler`, hoặc đưa lại một hàm hỗ trợ tập trung khi có bên tiêu thụ thật. Với lập trường "nền tảng ưu tiên hơn dự đoán tương lai" ở giai đoạn tiền phát hành ([AGENTS.md](../../../../AGENTS.md)), đây đúng là thời điểm phù hợp để cắt tỉa giao diện công khai chỉ dùng cho test.
- **Test adapter trở nên tường minh hơn.** Chúng mất lớp bọc tiện lợi `generate()`, nhưng đây là áp lực có ích: test đi đúng đường stream giống hệt sản xuất.
- **Bên dùng waterfall mất `llm/generate`.** Không có listener sản xuất nào tồn tại. Plugin cache/retry/log trong tương lai nên bọc `llm/stream`, vẫn là đường gọi provider duy nhất.

Quy mô thay đổi không lớn, nhưng nó loại bỏ sạch diện tích giao diện được dự đoán trước khỏi package LLM, để lại một hợp đồng gọi model duy nhất cho cả sản xuất lẫn test.
