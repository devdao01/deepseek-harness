# Agent Note: dsh khởi động từ mã nguồn qua hook ESM của tsx

Status: implemented

[English](2026-07-29-dsh-source-launch-tsx-esm.md) | Tiếng Việt

> Thay thế [khởi động từ mã nguồn TypeScript gốc](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md): Node đã gỡ bỏ năng lực mà quyết định đó phụ thuộc vào.

## Vấn đề

[Quyết định về khởi động từ mã nguồn gốc đã được lưu trữ (archived)](../../archived/architecture/2026-07-28-dsh-native-typescript-source-launch.md) khiến `apps/cli/src/bin.ts` chạy dưới `node --experimental-transform-types`, kết hợp với một paths loader chỉ làm nhiệm vụ resolve, việc chuyển đổi TypeScript do Node đảm nhiệm. Node 26.0.0 đã gỡ bỏ `--experimental-transform-types` (tiến trình từ chối flag này với lỗi `bad option`), chỉ còn giữ lại mode strip, mà mode strip không thể chấp nhận cú pháp mà đồ thị mã nguồn này bắt buộc phải có: thuộc tính tham số (parameter property) trong Cordis đã vendor (`constructor(private ctx: Context)`), decorator `@Inject` trong `vendor/hmr`, và enum/namespace runtime rải rác khắp `vendor/` cùng `packages/workflow`. Phạm vi engines của repo (`^22.19.0 || >=24.0.0`) bao gồm cả Node 26, nên chuỗi khởi động gốc hoàn toàn không thể khởi động được trên phiên bản đó — và không có bất kỳ tác vụ CI nào từng thực thi vector khởi động thực tế, khiến sự không tương thích này được phát hành một cách âm thầm.

Độ trễ khởi động cũng là một vấn đề: worker thread hook `module.register()` chạy off-thread sẽ tuần tự hóa (serialize) mỗi lần resolve xuyên qua các thread (khoảng 440ms chờ `makeSyncRequest` trong lúc khởi động TUI), trong khi hình thái mặc định đầy đủ của tsx (`--import tsx`) sẽ tốn thêm khoảng 0.4s vì hook CJS của nó khuếch đại chi phí resolve.

## Quyết định

Việc khởi động từ mã nguồn của TUI, Web và headless cho `dsh` chạy `node --import tsx/esm`: hook ESM-only của tsx đảm nhiệm đồng thời việc chuyển đổi TypeScript và việc chiếu (projection) `paths` của tsconfig. Script `dsh` ở thư mục gốc dùng trực tiếp cùng cách khởi động này ngay từ thư mục gốc repo; việc sinh sản phẩm build là một thao tác độc lập, được quy định bởi [quyết định tách khởi động từ mã nguồn khỏi build](../simplification/2026-08-12-separate-source-launch-from-build.md). Hook CJS vẫn giữ tắt, vì đồ thị mã nguồn CLI (giao diện dòng lệnh) là ESM thuần túy; đo thực tế cho thấy thời gian khởi động runtime tới khi hiện banner TUI mất khoảng 0.7s, so với khoảng 1.1s của hình thái mặc định đầy đủ của tsx, và khoảng 0.75s của chuỗi gốc đã bị gỡ bỏ.

`scripts/tspath-loader.ts` và `apps/cli/src/tsconfig-paths-loader.ts` đã bị xóa. Cùng biến mất theo đó là quy tắc runtime của loader này — "chỉ ánh xạ import workspace cho các dependency runtime đã khai báo" — vì tsx áp dụng ánh xạ `paths` một cách vô điều kiện. Tính đầy đủ của khai báo giờ chỉ được đảm bảo bởi cổng kiểm tra tĩnh: bare plugin trong cấu hình đi qua `verify-cordis-config`, manifest (danh sách metadata) đi qua workspace constraints. (Quy tắc runtime này thực sự đã từng phát hiện lỗi thật: `dsh-plan-mode` và `dsh-tool-jobs` import `@deepseek-ai/dsh-llm` nhưng chỉ khai báo trong devDependencies; sau đó đã được sửa.)

Ma trận CI node-compat (Node 22.19 và 26) đã thêm `dsh-source-launch-smoke` (`apps/cli/tests/source-launch.compat.spec.ts`): thực hiện khởi động keyless bằng stdio dạng pipe đúng theo vector khởi động runtime production, khẳng định tiến trình sẽ thoát với trạng thái khác không do bị TTY từ chối. Bất kỳ thay đổi nào của Node trong tương lai đối với module hook hay việc xử lý TypeScript đều sẽ khiến cổng kiểm tra này báo đỏ, thay vì làm hỏng `pnpm dsh` của developer.

## Phương án thay thế

**Giữ chuỗi gốc trên Node ≤25 và phân nhánh theo phiên bản.** Bị từ chối: hai bộ ngữ nghĩa chuyển đổi (amaro và esbuild) sẽ phân kỳ ở những cú pháp biên, launcher phải thêm việc dò phiên bản, ma trận node-compat phải bao phủ hai đường — trả một cái giá bảo trì nặng nề cho một experimental flag vốn đã từng thay đổi. Hơn nữa amaro cũng không hỗ trợ decorator `@Inject` mà `vendor/hmr` sử dụng, nên đường gốc vốn dĩ đã không thể khởi động được cấu hình TUI mặc định đi kèm.

**Đổi đồ thị mã nguồn thành chỉ dùng cú pháp erasable-only để phù hợp với mode strip của Node 26.** Bị từ chối: thuộc tính tham số và value namespace rải rác khắp Cordis/cosmokit/loader/schemastery đã vendor; việc viết lại là một khối lượng thay đổi (churn) không giới hạn, và phải làm lại mỗi lần vendor sync.

**Loader cùng thread do repo tự sở hữu (`module.registerHooks()` + chuyển đổi bằng esbuild hoặc `@swc/core`).** Tạm thời từ chối: prototype đo thực tế khoảng 0.45s (đường esbuild chưa được xác thực đầu-cuối; SWC bị crash trên cả hai mode decorator khi gặp decorator + namespace merging trong `vendor/hmr`), nhưng điều này đồng nghĩa với việc phải tự chịu trách nhiệm về tính đúng đắn của việc chuyển đổi, cũng như tự triển khai hook resolve mà tsx đã cung cấp sẵn. Chỉ xem xét lại khi khoảng chênh lệch ~0.3s trở thành một chi phí thực sự; bằng chứng phân tích hiệu năng nằm trong thảo luận PR.

**Node 26 chạy sản phẩm build `lib/`, Node 24 giữ nguyên gốc.** Bị từ chối: sẽ mất vòng lặp phát triển không cần build (zero-build) trên dòng phiên bản Node mới nhất, và làm nhòe ranh giới giữa mặt mã nguồn và mặt sản phẩm build.

## Kết quả

- Toàn bộ phạm vi engines (kể cả dòng phiên bản Node trong tương lai thay đổi hỗ trợ TypeScript gốc) chỉ có một vector khởi động; cổng kiểm tra smoke được cưỡng chế thực thi theo từng hàng của ma trận.
- Việc chuyển đổi TypeScript được ủy quyền trở lại cho tsx/esbuild, đảo ngược mục tiêu "chứng minh việc chuyển đổi gốc của Node có thể dùng được" của Agent Note trước đó; mục tiêu đó không thể đạt được trong tình huống mã nguồn đã vendor dùng cú pháp không thể tẩy xóa (unerasable) và Node không còn cung cấp mode transform.
- Việc cưỡng chế khai báo dependency runtime trong lúc khởi động từ mã nguồn không còn tồn tại; import workspace chưa được khai báo giờ đây chỉ có thể bị lộ ra qua cổng kiểm tra tĩnh hoặc lỗi resolve ở mode build.
- Khởi động runtime nhanh hơn khoảng 0.4s so với hình thái mặc định đầy đủ của tsx; ACP (Agent Client Protocol) vẫn giữ `--import tsx`, vì đồ thị dependency của nó chưa được audit về sự phụ thuộc vào hook CJS, và độ trễ khởi động của nó không nằm trên đường tương tác.
