# Agent Note: Dùng node:timers/promises thay cho các hàm sleep có thể hủy tự viết tay

Status: rejected — phần triển khai (PR #679) đã bác bỏ tiền đề tương đương hành vi: đồng hồ giả của vitest không chặn được `node:timers/promises`, nên lần thay thế này đánh đổi test nhanh và tất định để lấy khoảng 10 dòng bị xóa, không đáng

[English](2026-07-26-builtin-timer-promises-for-hand-rolled-sleeps.md) | Tiếng Việt

## Vấn đề

Ba gói tự viết tay bộ đếm thời gian được bọc bằng promise, trong khi module có sẵn `node:timers/promises` từ lâu đã cung cấp đúng năng lực đó; các gói khác (`pause()` của `dsh-llm-mock-server`, `dsh-lsp-stdio`, `dsh-acp-snapshot`) đã dùng module có sẵn này, nên các bản tự viết đó đồng thời cũng là một khoảng hở về tính nhất quán:

- `cancellableDelay()` trong `packages/llm/llm-retry/src/index.ts` (khoảng 14 dòng): `new Promise` + `setTimeout` + thêm và gỡ listener hủy thủ công, resolve thành `true` khi bộ đếm kích hoạt và `false` khi bị hủy, chỉ được tiêu thụ một lần tại chỗ chờ backoff.
- `sleep()` trong `packages/workflow/workflow-worker-thread/src/host.ts` (khoảng 7 dòng): `setTimeout` đã unref được bọc bằng promise, dùng làm cận trên thời gian cho khoảng ân hạn dispose (giải phóng tài nguyên).
- `delay()` trong `packages/terminal/terminal-bash/src/session.ts` (khoảng 4 dòng): `setTimeout` bọc promise đơn thuần, dùng cho việc polling và chờ tháo dỡ.

## Đề xuất

Thay ba chỗ cài đặt này bằng `import { setTimeout } from 'node:timers/promises'`:

- llm-retry: `try { await setTimeout(delayMs, undefined, { signal }); /* retry */ } catch { /* abort → fail */ }`. Khi truyền signal, promise này chỉ bị reject bởi lỗi hủy, còn signal đã hủy từ trước thì reject ngay lập tức; hành vi hoàn toàn giống nhau, bao gồm cả việc xóa bộ đếm khi bị hủy. Theo quy tắc catch rỗng của repo, khối `catch` rỗng này ghi rõ nó đang nuốt lỗi reject do abort.
- workflow-worker-thread: `setTimeout(ms, undefined, { ref: false })`, ngữ nghĩa hoàn toàn tương đương, kể cả việc không giữ cho event loop tiếp tục sống.
- terminal-bash: `import { setTimeout as delay } from 'node:timers/promises'`, chữ ký hoàn toàn giống nhau, các điểm gọi không cần sửa.

Không có test chuyên biệt nào cố định chính các hàm trợ giúp này; các bộ test hành vi của từng gói vẫn tiếp tục vượt qua.

## Các phương án đã cân nhắc

- **Các gói kiểu `p-timeout`/`p-defer`.** Không chấp nhận: module có sẵn đã bao phủ chính xác các điểm gọi này; đưa thêm gói bên ngoài chỉ để phục vụ một dòng await là lỗ ròng.
- **Giữ nguyên hiện trạng.** Không chấp nhận, nhưng lý do yếu hơn: chi phí quả thật rất nhỏ, song những chỗ khác trong repo đã dùng cách viết có sẵn này, và khi cùng một năng lực có sẵn lại tồn tại hai biến thể tự viết tay thì sẽ kéo theo biến thể thứ ba.

## Tiêu chí nghiệm thu

- Cả ba gói đều không còn tự định nghĩa hàm trợ giúp `setTimeout` bọc promise, mà đều import từ `node:timers/promises`.
- Bộ test của `llm-retry`, `workflow-worker-thread` và `terminal-bash` vượt qua nguyên trạng (tương đương hành vi).

## Rủi ro

Về cơ bản là không có rủi ro: không liên quan tới đầu ra nhìn thấy được từ phía mô hình, không có lo ngại về nền tảng, cũng không thêm phụ thuộc mới. Việc viết lại llm-retry biến một hàm trợ giúp trả về boolean thành luồng điều khiển try/catch; đây là một phán đoán cục bộ về tính dễ đọc, do PR (Pull Request) triển khai tự quyết.
