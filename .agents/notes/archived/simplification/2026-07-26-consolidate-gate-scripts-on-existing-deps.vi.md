# Agent Note: Thống nhất các script cổng kiểm tra trên các dependency và module tích hợp sẵn hiện có

Status: implemented
Archived: 2026-07-27

[English](2026-07-26-consolidate-gate-scripts-on-existing-deps.md) | Tiếng Việt

## Vấn đề

Phần lớn các cổng kiểm tra trong `scripts/` vốn đã dùng đúng công cụ (hơn 15 cổng dùng `globSync` của `node:fs`, các cổng markdown dùng mdast/micromark), nhưng vài script tụt lại từng tự viết tay những việc mà các cổng cùng loại đã hoàn thành từ lâu bằng dependency sẵn có hoặc module tích hợp sẵn:

- **Bộ quét fence trùng lặp.** `scripts/md-fences.ts` (khoảng 55 dòng, được `doc-typecheck.ts` tiêu thụ) và `extractEquivBlocks` trong `scripts/verify-type-equiv.ts` (khoảng 39 dòng) từng là hai bản sao của cùng một bộ quét theo dòng bằng regex cho khối mã fence, trong khi `scripts/verify-mermaid.ts` từ lâu đã trích xuất fence mã bằng cách duyệt node `code` của mdast; bản thân `markdownProseLines` trong `scripts/markdown.ts` cũng từng phân tích thành mdast trước rồi mới dùng một regex thứ hai để theo dõi thủ công trạng thái fence. Hai bộ quét regex này chỉ nhận diện fence backtick ở cột 0, nên lặng lẽ lệch pha với các cổng dựa trên mdast ở fence dấu ngã và fence thụt lề.
- **Phân tích argv viết tay.** `parseOptions` trong `scripts/publint-all.ts` và bản sao gần như y hệt trong `scripts/verify-built-package-invariants.mjs` (khoảng 26 dòng) từng tự tay đẩy chỉ số argv, trong khi các script cùng loại (`verify-runtime-closure.ts`, `build-exe-for-python-sdk.ts`, `packages/sdk/scripts/src/args.ts`) đã dùng `parseArgs` tích hợp sẵn của `node:util` từ lâu.
- **Duyệt thư mục viết tay.** Năm chỗ mã từng tự viết lại kiểu duyệt `readdirSync` lồng nhau mà `globSync` đã bao phủ: phần quét packages và vendor manifest (bản kê metadata) trong `verify-runtime-closure.ts`, `discoverPluginDirs` của `dev-web.ts`, `realPackageNames` của `verify-package-paths.ts`, `listSources` của `verify-client-domain-graph.ts`, và `addPath` của `publint-all.ts` (tổng cộng khoảng 55–65 dòng). `scripts/package-invariants.ts` cho thấy mẫu `globSync` chỉ một dòng.

Không lần thay thế nào cần thêm dependency mới; mỗi chỗ thay thế đều dùng devDependency sẵn có hoặc module tích hợp sẵn của Node.

## Quyết định

- Hàm trợ giúp fence mdast dùng chung `markdownFences` trong `scripts/markdown.ts` duyệt node `code`, đọc ngôn ngữ, info string đầy đủ, thân khối và số dòng của fence mở tính từ 1; `doc-typecheck.ts` và `verify-type-equiv.ts` trích xuất fence mã thông qua nó. `md-fences.ts` và bộ quét `extractEquivBlocks` trùng lặp đã bị xóa, còn `markdownProseLines` cũng chuyển sang suy ra các dòng nằm trong fence từ vị trí node `code` đã phân tích, thay vì dùng một regex thứ hai.
- Cả hai CLI chuyển sang dùng `parseArgs` để phân tích argv; tùy chọn lạ và giá trị thiếu vẫn thất bại lớn tiếng, chỉ là văn bản lỗi đổi sang phần chữ đi kèm `parseArgs` thay vì chuỗi usage viết tay trước đây.
- Năm chỗ duyệt thư mục tụt lại chuyển sang `globSync`. Phần duyệt trong `check-workspace-constraints.ts` và `clean.ts` được giữ lại: chúng cần chi tiết ở mức dirent để chẩn đoán cây thư mục dị dạng, thứ mà glob khớp theo mẫu không báo cáo được.

## Các phương án đã cân nhắc

- **Thêm dependency glob/duyệt thư mục mới (`tinyglobby`, `fdir`).** Không chọn: module tích hợp sẵn đã thắng trên phạm vi toàn kho mã; vài chỗ này chỉ là kẻ tụt lại, không phải khoảng trống năng lực.
- **Thay pool worker có thứ tự khoảng 19 dòng trong `publint-all.ts` bằng `p-map`.** Cố ý không đưa vào: thêm một devDependency mới cho một lần xóa nhỏ đang nằm ngay ngưỡng của [chính sách dependency](../process/2026-07-26-dependencies-over-hand-rolling.md), hơn nữa các yêu cầu của pool đó (số worker có chặn, thứ tự tất định, ghi đè bằng biến môi trường) đã được ghi trong [ghi chép quyết định về cổng pre-push song song](../process/2026-07-06-parallel-pre-push-gates.md). Chỉ đưa vào kèm theo khi `p-map` giành được bên tiêu thụ thứ hai.
- **Giữ lại hai bộ quét fence.** Không chọn: đặt hai bản sao trình phân tích đang dần trôi lệch bên cạnh một hiện thực đúng thứ ba chính là kiểu trùng lặp mà hàm trợ giúp dùng chung `markdown.ts` muốn ngăn chặn; giới hạn "chỉ nhận backtick ở cột 0" cũng là một mầm mống thiếu nhất quán giữa các cổng cùng loại.

## Hệ quả

- Chỉ còn một trình phân tích fence: mọi cổng markdown giờ đều phân loại fence mã qua mdast, nên fence dấu ngã, fence thụt lề và fence container bốn backtick hành xử hoàn toàn như nhau ở mọi nơi. Trong cây tài liệu không tồn tại hình thái fence nào mà bộ quét regex xử lý sai, nên trên cây mã nơi thay thế này được đưa vào, kết quả cổng kiểm tra không đổi: `pnpm run doc-sync` cùng mỗi cổng bị viết lại đều chạy một lần trước và một lần sau thay đổi, đầu ra giống nhau đến từng byte (số khối/số opt-out của `doc-typecheck`, số lần khớp của `verify-type-equiv`, `publint`, `verify-built-package-invariants`, `verify-runtime-closure`, `verify-package-paths`, `verify-client-domain-graph`, cùng hai cổng văn xuôi README của gói).
- `verify-type-equiv` vẫn từ chối fence tương đương kiểu chưa đóng: mdast sẽ lặng lẽ đóng khối mã chưa đóng ở cuối file (và phép so sánh sau đó có thể lọt qua), nên hàm trợ giúp dùng chung sẽ báo cáo dấu phân định đóng có tồn tại hay không, và cổng sẽ báo lỗi khi khối chưa đóng, giữ lại đúng nhánh từ chối này của bộ quét đã bị xóa. Bộ quét của `doc-typecheck` vốn không có nhánh lỗi này.
- `parseArgs` giữ giá trị cuối cùng cho tùy chọn xuất hiện lặp lại mà không báo lỗi — một trường hợp biên của công cụ phát triển chưa được bài kiểm thử nào cố định, và được chấp nhận như cái giá đánh đổi để xóa hai trình phân tích viết tay. (Ở chế độ strict, chỗ cần giá trị mà gặp token bắt đầu bằng `--` vẫn bị từ chối, giống hành vi của trình phân tích bị thay thế.)
