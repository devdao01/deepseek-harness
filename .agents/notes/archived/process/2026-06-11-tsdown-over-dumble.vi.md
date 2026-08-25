# Agent Note: Dùng tsdown thay cho dumble để đóng gói JS

Status: implemented
Archived: 2026-07-27

[English](2026-06-11-tsdown-over-dumble.md) | 中文

## Vấn đề

Build ban đầu dùng **dumble**, lớp wrapper esbuild không cần cấu hình của cordiverse — upstream Cordis cũng dùng nó để build — có mức độ nhất quán cao nhất với quy ước package (gói) vendor (nó đọc từng package.json và suy diễn entry/format từ trường `exports`). Nhưng dumble tồn tại rủi ro tiềm ẩn khi làm công cụ chịu tải chính của repo này: v0.2.x, khoảng 530 lượt tải npm mỗi tuần, thực chất chỉ có một người bảo trì, và vì nó không có chế độ workspace, chúng ta buộc phải gọi nó qua một script điều phối tùy chỉnh (`scripts/build.ts`).

Hiện tại sản phẩm build chỉ có ý nghĩa trong `pnpm run build` + publint (chưa có package nào được phát hành; dev/test/demo chạy trực tiếp source chưa đóng gói qua tsx), nên chi phí chuyển đổi hiện đang thấp nhất, một khi package bắt đầu được phát hành thì chỉ có thể cao hơn.

## Quyết định

Thay thế dumble bằng **tsdown** (dựa trên rolldown, khoảng 2,5 triệu lượt tải mỗi tuần, được VoidZero hậu thuẫn, phát hành tích cực):

- `tsdown.config.ts` ở gốc, cấu hình `workspace: ['vendor/*', 'packages/*/*']` (glob rõ ràng giới hạn phạm vi đóng gói trong cây thư mục package Cordis vendor và TypeScript; `workspace: true` còn phát hiện cả manifest ví dụ và các thành viên workspace không cần đóng gói).
- Hình dạng dùng chung: entry là `lib/types/index.js`, `outDir: 'lib'`, ESM, `platform: node`, `target: es2024`, `fixedExtension: false` (giữ `.js` cho package `"type": "module"`), `dts: false` (khai báo thuộc về tsc -b), `clean: false` (lib/ còn giữ cây trung gian `lib/types` của TSC). Entry ban đầu là `src/index.ts`; [Agent Note (bản ghi quyết định của agent) TSC ưu tiên build](2026-06-17-ts-build-config.md) sau đó đổi tsdown để đóng gói JS đầu ra của TSC, khiến hành vi chuyển đổi TypeScript được cung cấp thống nhất bởi một compiler.
- Trong vendor/ có hai cấu hình override theo từng package (thuộc sửa đổi riêng của chúng ta, tương tự tsconfig tái sinh; được ghi trong vendor/README.md): schemastery (xuất hai định dạng `.mjs`/`.cjs` qua `outExtensions`), logger-console (hai pass entry đơn, để lớp base class dùng chung được inline vào từng entry thay vì sinh ra các mảnh có tên hash, khớp với hình dạng phát hành upstream).
- `scripts/build.ts` bị xóa; `pnpm run build` = `tsc -b && tsdown` (root solution sở hữu đồ thị emit).

## Các phương án thay thế từng cân nhắc

- **Viết trực tiếp script esbuild**: engine trưởng thành nhất, rủi ro lớp wrapper bằng không, nhưng cần bảo trì thủ công bảng đặc tả theo từng package mà chế độ workspace của tsdown tự cung cấp.
- **pkgroll**: về mặt ý tưởng là bản thay thế trực tiếp gần nhất, nhưng chỉ 78k lượt tải mỗi tuần và dựa trên Rollup, triển vọng bảo trì yếu hơn hẳn tsdown.
- **Giữ dumble**: khớp hoàn hảo với upstream, nhưng bus factor không thể chấp nhận được.

## Hệ quả

Hình dạng entry công khai của sản phẩm build runtime vẫn giữ nguyên như thời dumble (`lib/index.js`, cùng các biến thể riêng theo package, ví dụ `lib/index.mjs`/`lib/index.cjs` của `schemastery` và `lib/browser.js` của `logger-console`); theo [Agent Note TSC ưu tiên build](2026-06-17-ts-build-config.md), khai báo hiện nằm dưới `lib/types`. External vẫn đến từ dependencies/peerDependencies của từng package. Chúng ta từ bỏ khả năng suy diễn từ trường exports của dumble: các package mới có hình dạng không mặc định cần cung cấp `tsdown.config.ts` theo từng package, không thể chỉ dựa vào trường package.json. Trong tương lai nếu `tsc -b` trở thành nút thắt cổ chai, tsdown cũng có thể tiếp quản đóng gói khai báo (isolatedDeclarations); việc này cần một Agent Note khác.
