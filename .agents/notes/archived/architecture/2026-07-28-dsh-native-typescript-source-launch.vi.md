# Agent Note: Khởi động mã nguồn TypeScript gốc cho dsh

Status: implemented
Archived: 2026-08-07

[English](2026-07-28-dsh-native-typescript-source-launch.md) | 中文

> Phương án khởi động gốc của Node đã được thay thế bởi [dsh khởi động mã nguồn qua tsx ESM hook](2026-07-29-dsh-source-launch-tsx-esm.md): Node 26.0.0 đã loại bỏ `--experimental-transform-types`, paths loader mô tả trong tài liệu này đã bị xóa. Cổng kiểm tra khai báo cấu hình Cordis (`verify-cordis-config`), chẩn đoán plugin thất bại tường minh của app-boot, và các chú thích `import type` trong vendor vẫn còn hiệu lực.

## Vấn đề

Entry mã nguồn `dsh` trước đây dùng `tsx` để chạy `apps/cli/src/bin.ts`, việc chuyển đổi TypeScript và phân giải `paths` của tsconfig gốc đều được cùng một loader bên thứ ba xử lý ngầm. Khi chuyển sang xử lý TypeScript gốc bằng Node, Node sẽ không áp dụng ánh xạ đường dẫn tsconfig; nếu chuyển sang phân giải qua export của gói, việc khởi động mã nguồn sẽ trộn lẫn với sản phẩm `lib/` có thể đã lỗi thời hoặc không tồn tại.

Việc chuyển đổi của Node cũng không thực hiện phân tích kiểu. Kiểu được import qua import giá trị thông thường sẽ vẫn giữ nguyên là yêu cầu ESM tại thời điểm chạy, còn `export =` của TypeScript sẽ chuyển thành gán CommonJS, thay vì ESM default export. Do đó, đồ thị mã nguồn phải dùng tường minh import chỉ-kiểu (type-only) và export ESM gốc; resolve hook không thể sửa được cú pháp mã nguồn không tương thích.

Cấu hình Cordis còn đưa vào một ranh giới phân giải khác. Bare plugin trong `cordis.yml` không đi qua phân tích import TypeScript, manifest (danh sách metadata) của resolver có thể thiếu dependency cần thiết. Cordis Loader sẽ ghi lại lỗi import plugin, và để lại entry không có fiber, nhưng không khiến bản thân việc khởi động thất bại; lỗi chính tả trong cấu hình do đó có thể tạo ra một ứng dụng khiếm khuyết nhưng có mã thoát 0.

## Quyết định

Khởi động mã nguồn TUI, Web và headless của `dsh` dùng `node --experimental-transform-types`, để Node hoàn tất việc chuyển đổi TypeScript, không nạp `tsx` hay esbuild. `bin/dsh`, demo `dsh`/TUI/Web ở cấp gốc và TUI Code Mode đều đi vào cùng một chuỗi khởi động `apps/cli/src/bin.ts`. Bộ khởi động test và e2e giữ nguyên chiến lược hiện có của từng bên, `lib/bin.js` đã build tiếp tục chạy bằng Node thường.

`scripts/tspath-loader.ts` chỉ đăng ký một hook phân giải module. Khi `TSX_TSCONFIG_PATH` được đặt, nó sẽ dùng đường dẫn đó (đường dẫn tương đối được phân giải từ cwd của bên gọi), nếu không thì đọc `tsconfig.json` gốc; `TsconfigPathsResolver` dùng công cụ phát triển TypeScript sẵn có của repo để phân giải theo chuỗi `extends` của cấu hình đó, chọn mục `paths` chính xác hoặc wildcard theo quy tắc tsconfig, và ánh xạ bare specifier workspace khớp trúng thành file mã nguồn `.ts`/`.mts`/`.cts` hoặc file index thư mục. Việc chuyển đổi mã luôn chỉ do Node đảm nhiệm. Loader chuyên dụng cho mã nguồn này không thuộc CLI đã build, `apps/cli` cũng không khai báo `typescript` là dependency runtime.

Chỉ khi gói đích là tên của chính manifest gói gần nhất, hoặc là dependency runtime đã được manifest đó khai báo, import mã nguồn mới được chuyển hướng. Cordis Loader dùng URL thư mục cấu hình làm import parent; lúc này resolver sẽ tìm ngược lên workspace manifest đã khai báo plugin đó. Do đó, dependency cần thiết cho `apps/cli/config/base.cordis.yml` đã giao cùng các lớp phủ interface của nó được giữ bởi `apps/cli/package.json`. Các specifier không khớp tsconfig paths, tham chiếu dependency chưa khai báo, hoặc không phải bare specifier đều được trả về cho phân giải mặc định của Node.

`verify-cordis-config` thực hiện kiểm tra tính toàn vẹn một chiều đối với manifest của resolver này: mỗi bare plugin package trong cấu hình đều phải xuất hiện trong `dependencies` của manifest tương ứng, manifest có thể chứa thêm dependency mà cấu hình đó không tham chiếu tới. `AGENTS.md` gốc quy định việc đồng bộ cấu hình và dependency là quy tắc thường trực.

Sau khi Loader hoàn toàn dừng ổn định, `dsh-app-boot` dùng chung sẽ kiểm tra mỗi entry đã bật nhưng không có fiber, và từ chối khởi động, báo lỗi `plugin(s) failed to load: ...; Cordis startup failed because these plugin(s) could not be resolved`, đồng thời liệt kê toàn bộ plugin nạp thất bại. Chẩn đoán này nằm ở tầng ứng dụng, không thay đổi hành vi khởi động của Loader trong vendor.

TypeScript tương thích với Node là một phần của hợp đồng khởi động mã nguồn này. Cordis, Loader, Include, HMR (thay thế module nóng) và Schemastery trong vendor dùng đánh dấu `import type` cho các import sẽ bị loại bỏ. Schemastery dùng ESM default export gốc và khai báo `type: module`; sản phẩm build `.mjs` và `.cjs` của nó lần lượt giữ nguyên hành vi ESM default export hiện có, và hành vi `require()` trả về giá trị có thể gọi. Những khác biệt này được ghi trong `vendor/README.md`; không có hành vi runtime mới nào được thêm vào cho framework trong vendor.

## Phương án thay thế từng cân nhắc

**Tiếp tục dùng `tsx`.** Không áp dụng, vì `tsx`/esbuild sẽ tiếp tục đảm nhận việc chuyển đổi TypeScript, chuỗi khởi động này sẽ không thể chứng minh việc chuyển đổi gốc của Node là khả thi.

**Để entry mã nguồn nạp `lib/` đã build qua export của gói.** Không áp dụng, vì điều này sẽ trộn lẫn source plane và artifact plane; khởi động phát triển không cần build trước có thể đọc sản phẩm lỗi thời hoặc thất bại trực tiếp.

**Áp dụng vô điều kiện `paths` của tsconfig gốc.** Không áp dụng, vì điều này sẽ khiến import xuyên gói chưa khai báo và plugin Cordis tiếp tục phân giải thành công, từ đó che giấu sự không nhất quán giữa manifest và đồ thị vận hành thực tế.

**Chuyển đổi import bên trong loader tùy chỉnh.** Không áp dụng, vì việc viết lại import nhận biết kiểu sẽ tái du nhập kiểu chuyển đổi kiểu trình biên dịch, và khiến loader thay vì Node đảm nhiệm việc thực thi TypeScript. Giữ mã nguồn được checkout vào repo tương thích với Node giúp ranh giới khởi động luôn tường minh.

## Hệ quả

- TUI/interface headless giữ vòng lặp mã nguồn không cần build, Web vẫn build sản phẩm frontend trước khi khởi động entry mã nguồn CLI. Cú pháp TypeScript chỉ qua chuyển đổi gốc của Node; loader chỉ xử lý URL dùng dev dependency của thư mục gốc checkout, không thêm dependency runtime cho CLI.
- Import gói workspace và dependency cấu hình Cordis đều phải được khai báo tường minh trong manifest của resolver; cổng kiểm tra tĩnh ngăn cấu hình đi trước dependency, dependency thừa không cấu thành lỗi.
- Import plugin thất bại không còn để lại ứng dụng khiếm khuyết với mã thoát 0; lỗi cuối cùng vừa nói rõ việc khởi động Cordis thất bại, vừa nêu tên plugin cụ thể, lỗi gốc của Loader vẫn được giữ lại trong nhật ký sớm hơn.
- Mã nguồn vendor trong đồ thị mã nguồn CLI phải tương thích với ngữ nghĩa module transform-types của Node; bản ghi sửa đổi cục bộ nêu rõ nghĩa vụ đồng bộ với upstream.
- Chế độ `lib` của CI, bộ khởi động test/e2e và các bộ khởi động ví dụ khác giữ nguyên chiến lược hiện có của từng bên; loader mã nguồn gốc này chỉ bao phủ chuỗi ứng dụng CLI `dsh`.
