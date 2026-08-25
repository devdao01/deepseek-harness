# Agent Note: Dùng execa thay cho code ống dẫn tiến trình con viết tay trong test

Status: implemented
Archived: 2026-08-07

[English](2026-07-26-execa-for-test-subprocess-plumbing.md) | Tiếng Việt

## Vấn đề

Khoảng mười file test e2e/smoke đều tự viết tay lại cùng một cách điều phối "spawn, thu output, hết giờ thì kill": tích lũy kiểu `let stdout = ''` bằng `setEncoding` cộng handler `data`, đặt hạn chót timeout bằng `setTimeout` → `kill('SIGKILL')`, rồi kết toán kết quả bằng `once('exit')`/`once('error')`, mỗi nơi chỉ khác nhau đôi chút. Các vị trí đó là: khối spawn bên trong của `runLoaderSmoke` (`packages/support/loader-smoke/src/index.ts`), `runBuiltBin` trong `apps/cli/tests/built-bin.e2e.ts` và `packages/examples/cli-demo/tests/built-bin.e2e.ts`, `runBinExpectingExit` trong `packages/examples/acp-demo/tests/built-bin.e2e.ts`, các hàm phụ trợ e2e dựa trên sản phẩm build trong `lsp-local` và `code-runtime-worker`, bộ thu thập bên ngoài của `examples/tui-agent/tests/pty-harness.ts`, `examples/jsonrpc-agent/tests/keyless-smoke.e2e.ts`, cùng một phần liên quan trong `apps/web/tests/smoke-real.e2e.ts` và `session-checkpoint-policy/tests/crash-recovery.e2e.ts`.

Còn hai chỗ hạ tầng test viết tay liên quan khác càng củng cố lý do thay thế:

- `packages/support/llm-mock-server/src/cli.ts` từng tự tay tách từng cái một 17 tùy chọn dạng `--flag value` kèm giá trị cộng thêm vài cờ boolean (khoảng 45–60 dòng vòng lặp và hàm phụ trợ lấy giá trị), trong khi `parseArgs` có sẵn trong `node:util` từ lâu đã là cách viết quen thuộc của repository này (`cli-demo`, `acp-demo`, `verify-runtime-closure.ts`, `packages/sdk/scripts`).
- `apps/web/tests/smoke-real.e2e.ts` và `apps/web/tests/scaffold.ts` từng mang hai bản sao giống hệt từng chữ của một trình phân tích `.env` bằng regex (khoảng 20 dòng), trong khi `process.loadEnvFile` có sẵn lại đúng ngữ nghĩa "không ghi đè giá trị đã có" mà ta cần; hơn nữa cấu hình e2e/snapshot/web của vitest đã dùng nó để nạp `.env` ở gốc trước khi những file này chạy, nên hai bản sao đó thực chất là code chết.
- Harness snapshot từng viết tay ba vòng lặp "poll cho đến hạn chót" (`waitForPersistedTurnStart`/`waitForPersistedTurnEnd`/`waitForWorkspaceFile` trong `packages/support/acp-snapshot/src/harness.ts`, khoảng 55 dòng), cộng thêm `waitForFile` trong `crash-recovery.e2e.ts`, trong khi `vi.waitFor`/`expect.poll` bao phủ đúng hình thái này; vitest vốn đã là dependency lúc chạy của `dsh-acp-snapshot`, nên việc này không thêm gì mới.

## Quyết định

- `execa` là devDependency ở gốc, đồng thời là dependency lúc chạy của `@deepseek-ai/dsh-loader-smoke` (bên tiêu thụ duy nhất trong `src/`). Các vị trí spawn, thu thập, timeout nói trên đều chạy thống nhất qua `await execa(cmd, args, { cwd, env, timeout, killSignal: 'SIGKILL', reject: false })`: kết quả của nó báo cáo `{ stdout, stderr, exitCode, signal, timedOut, failed }` thành các trường độc lập với nhau, phù hợp với quy tắc "kết quả tiến trình con trực giao thì báo cáo độc lập" trong tập defensive pattern của repository này. `runLoaderSmoke` truyền `input: ''` để giữ đúng cam kết đóng stdin của nó; những chỗ khẳng định byte luồng chính xác thì truyền `stripFinalNewline: false`.
- Phần thực sự tùy biến thì vẫn giữ tùy biến, chỉ là đặt lên trên tiến trình con do execa sở hữu: logic ngắt khi gặp dấu hiệu trong luồng của cli-demo, việc điều khiển giao thức dựa trên vị từ theo dòng của jsonrpc, và việc điều phối gửi SIGKILL tại điểm gây lỗi của crash-recovery. Ba server tương tác chạy dài trong `smoke-real.e2e.ts` vẫn giữ `spawn` nguyên bản — ở đó toàn bộ nội dung là lắng nghe dòng báo sẵn sàng trên hai luồng cộng với việc tháo dỡ theo bậc SIGTERM→chờ→SIGKILL, execa không xóa được gì; phần liên quan tới file này trong Agent Note chỉ là bản phân tích `.env` đã thành code chết.
- CLI (giao diện dòng lệnh) của `llm-mock-server` được tách qua `parseArgs` (strict, không cho phép tham số vị trí); việc chuyển đổi số, kiểm tra biên và ràng buộc chéo giữa các tùy chọn vẫn tự cài đặt, còn các test cố định thông điệp lỗi thì chuyển sang dùng chính văn bản của trình tách `parseArgs`.
- Hai bản sao `loadRootEnv` bị xóa hoàn toàn: cấu hình vitest sở hữu chúng (`vitest.web.config.ts` vô điều kiện, `vitest.snapshot.config.ts` trong chế độ record) đã nạp `.env` ở gốc repository trước khi những file này chạy.
- Bốn vòng lặp poll đó chuyển sang dùng `vi.waitFor`, truyền tường minh `{ interval, timeout }`, và ném lỗi kèm thông tin mô tả trong callback; `waitForPersistedTurnStart` bắt lỗi kiểm tra "định dạng bản ghi đã bền hóa không hợp lệ" ra ngoài vòng lặp retry, để nó lập tức làm lần chạy thất bại thay vì bị retry cho đến hạn chót.

## Các phương án từng cân nhắc

- **Dùng `tinyexec` thay cho execa.** Nó vốn đã có sẵn trong `node_modules` dưới dạng dependency bắc cầu của vitest, API cũng nhỏ hơn; nhưng nó không nâng bậc tín hiệu kết thúc, không nhúng output phong phú vào đối tượng lỗi, và dependency bắc cầu thì không tạo thành cam kết. Nếu cuối cùng vẫn thiên về package nhẹ hơn này, hình thái thay thế hoàn toàn giống nhau.
- **Hàm phụ trợ spawn dùng chung trong repository (không thêm dependency mới).** Khả thi, chi phí chuỗi cung ứng cũng thấp hơn, nhưng khi đã có một package dày dạn trận mạc phụ trách đúng việc này thì cách đó vẫn để phần bảo trì hạn chót, kết thúc và kết toán nằm lại trong repository; điều này đi ngược [chính sách về dependency](../process/2026-07-26-dependencies-over-hand-rolling.md), và ta còn phải giẫm lại các cái bẫy để đổi lấy đúng hành vi timeout, kết thúc và chuẩn hóa kết quả đa nền tảng mà execa đã có sẵn.
- **`get-port`, `wait-on`, `tempy`, `tree-kill`.** Không chọn từng cái một: chỗ dò cổng duy nhất trong repository thay xong thì huề vốn; tình huống chờ file đã được `vi.waitFor` bao phủ tốt hơn; việc xử lý thư mục tạm ở khắp nơi vốn đã dùng `mkdtemp` + `rm {recursive}` có sẵn; còn `close()` của acp-snapshot là logic xả theo thứ tự, không phải duyệt cây tiến trình.

## Hệ quả

- Toàn bộ các khối code thu thập/timeout viết tay đã bị gỡ bỏ, bao gồm hai nhánh lỗi OS trong `loader-smoke` được đánh dấu `/* v8 ignore */` mà không thể tạo ra một cách nhân tạo: sự cố spawn và sự cố luồng nay được kết toán qua các trường kết quả của execa, file `src/` này không còn mang bất kỳ ngoại lệ coverage nào, và cổng kiểm tra theo từng file phủ toàn bộ các nhánh còn lại.
- Output thu được nay chịu ràng buộc `maxBuffer` mặc định 100 MB của execa (tràn thì kết thúc tiến trình con), trước đây là vô hạn; mục hạn chế trong README của `loader-smoke` đã phản ánh điều này.
- Việc kết thúc khi timeout của tiến trình con trực tiếp cùng việc chuẩn hóa kết quả exit/signal đều do execa lo liệu đa nền tảng, không còn viết tay ở từng nơi; như README của `loader-smoke` đã nêu, các hàm phụ trợ này vẫn không chịu trách nhiệm kết thúc cây tiến trình. Mỗi bộ test đã viết lại đều được chạy lại trên POSIX trong lần thay đổi này, còn nền tảng còn lại do kênh Windows CI phụ trách.
- `execa` là devDependency mới thêm ở gốc (trước đó hoàn toàn không có trong lockfile); nó là một trong những package được phụ thuộc nhiều nhất trên npm và vẫn được bảo trì tích cực, phần bao đóng exe/runtime không bị ảnh hưởng (chỉ dùng trong test).
- Văn bản lỗi ở tầng trình tách của CLI mock-server không còn do repository này quyết định: tùy chọn lạ, thiếu giá trị và thừa tham số vị trí đều báo theo cách diễn đạt của `parseArgs`, và được cố định như vậy trong `tests/cli.spec.ts`.
