# Agent Note: Phân tách chunk và bố cục thư mục của sản phẩm build Web shell

Status: implemented

[English](2026-08-06-web-shell-dist-chunk-layout.md) | 中文

## Problem

Trước đây, shell của apps/web được đóng gói thành một chunk index duy nhất khoảng 1.2 MB (đã minify), trong đó khoảng 80% là byte vendor — KaTeX, cú pháp boot và engine shiki, react-dom, pipeline markdown — trộn lẫn với toàn bộ mã shell của workspace (khoảng một phần năm). Chỉ cần một dòng mã shell thay đổi là toàn bộ chunk đổi hash, khiến các client quay lại phải tải lại toàn bộ; `dist/assets/` là một tầng phẳng với hơn 100 file (chunk chính, 23 chunk cú pháp lazy-load, 59 font face KaTeX, sourcemap lẫn lộn), không thể điều hướng.

## Decision

`apps/web/vite.config.ts` dùng `manualChunks` để chia shell thành hai chunk khởi tạo, và dùng hàm đặt tên output để phân loại thư mục; toàn bộ cấu hình không dùng regex nào — chỉ dùng Set tên package chính xác, danh sách tên file, danh sách phần mở rộng.

**Phân nhóm thành viên** (`VENDOR_PACKAGES`, theo tên package npm chính xác):

- `vendor` = ba họ render nặng: math (katex), highlight (shiki), markdown (pipeline phân tích micromark/mdast — bộ render React tăng dần phía trên nó là mã workspace, không nằm trong danh sách này). Thành viên lấy `VENDOR_PACKAGES` làm cơ sở sống: danh sách = các package mà mã workspace **import trực tiếp**; các dependency transitive riêng tư còn lại (họ oniguruma, @shikijs/core, bảng ký tự v.v., hàng chục package) chỉ được các thành viên trong danh sách tham chiếu, việc tô màu chunk của rollup sẽ tự động gộp chúng vào vendor; các dependency dùng chung với phía index sẽ rơi về index, chỉ pha loãng vài KB, không phải vấn đề đúng sai.
- **Toàn bộ vendor bắt buộc phải react-free (bất biến ranh giới)**: rollup sẽ gộp các module dùng chung giữa entry và manual chunk vào manual chunk — chỉ cần danh sách xuất hiện một package import react/jsx-runtime, bản sao react duy nhất sẽ bị kéo vào vendor, tách khỏi index. Phần render React của markdown/math là mã workspace, tự nhiên nằm ở index, nên toàn bộ họ react đều bị ghim ở index.
- `index` (chunk mặc định) = họ react (react, react-dom, scheduler, use-sync-external-store), vendored cordis, toàn bộ mã workspace và các package nhỏ chưa được liệt kê (anser, clsx).
- Trường hợp đặc biệt `@shikijs/langs`: cú pháp boot (`BOOT_GRAMMAR_FILES`: typescript, shellscript, json — ba thứ mà highlight.ts import tĩnh, đều là module dữ liệu tự chứa không có import nội bộ) đi vào vendor; 23 cú pháp lazy-load còn lại không được chỉ định, mỗi cái vẫn giữ chunk theo nhu cầu riêng.
- `index.html` được vite tự động đấu nối: index đi qua `<script>`, vendor đi qua `<link rel="modulepreload">`, hai chunk tải song song, không có thác tải tuần tự.

**Bố cục thư mục** (`chunkFileNames` + `assetFileNames`):

- Gốc `assets/` chỉ giữ js (kèm sourcemap đi cùng) và css của index và vendor.
- Chunk cú pháp thuộc về `assets/langs/`. Tiêu chí là `moduleIds` của chunk có chứa thành viên `@shikijs/langs`, chứ không phải facade: chunk cú pháp nhúng dùng chung (php/ruby/mdx nhúng html+javascript, bị rollup tách ra thành chunk dùng chung) **không có facade**, tiêu chí facade sẽ bỏ sót; index/vendor loại trừ theo tên, vì vendor hợp lệ mang theo ba cú pháp boot.
- Font thuộc về `assets/fonts/` (`FONT_EXTENSIONS`: woff2/woff/ttf; hiện tại toàn bộ là font face KaTeX được vendor.css tham chiếu — katex.min.css tuy được component phía index import, nhưng module css cũng được phân nhóm qua manualChunks, rơi vào vendor.css cùng `katex`; trình duyệt chỉ tải woff2 khi cần, và chỉ khi render công thức).
- sourcemap không cần sắp xếp: rollup ghi `.map` cạnh js tương ứng và tham chiếu bằng tên file tương đối trần; khi chunk đổi thư mục, map tự động đi theo.

Các tham chiếu chéo thư mục (dynamic import của index trỏ vào `langs/`, tham chiếu tương đối cùng thư mục giữa các chunk cú pháp, vendor.css tham chiếu tương đối tới `fonts/`) đều do builder sinh ra, runtime không cần thay đổi gì thêm; webserver phía host phục vụ nguyên trạng các đường dẫn lồng nhau theo tiền tố tĩnh.

## Alternatives considered

- **Đưa react và các vendor khác qua CDN**: dsh web hướng tới host cục bộ/mạng nội bộ (thường không có internet ra ngoài), CDN trực tiếp không khả dụng; react là platform seed external của toàn bộ plugin bundle (shell là nhà cung cấp duy nhất), chuyển sang dạng biến toàn cục CDN sẽ phải động vào ba chỗ: danh sách platform, seed, bảng module. Lợi ích cache đã đạt được nhờ tách vendor.
- **Quy tắc fallback ngược (node_modules trừ họ react đều vào vendor)**: thành viên không đọc được từ cấu hình, và sẽ xếp nhầm các package nhỏ như anser/clsx vào vendor; bị thay thế bởi danh sách tên package chính xác theo hướng thuận.
- **Khớp mẫu bằng họ regex**: khả năng đọc kém; tên package chính xác kết hợp với việc rollup tự động tô màu dependency transitive khiến khớp mẫu trở nên không cần thiết.
- **Nhận diện chunk cú pháp bằng facadeModuleId**: chunk cú pháp nhúng dùng chung không có facade sẽ bị bỏ sót và rơi về thư mục gốc; tiêu chí thành viên `moduleIds` bao phủ cả hai dạng.
- **Cho phép các facade render có cạnh react ở trong vendor** (react-markdown trước đây thuộc loại này): sẽ khiến việc gộp module dùng chung của rollup kéo bản sao react duy nhất vào vendor, phá vỡ ranh giới "react thuộc index"; ràng buộc này đã được văn bản hóa thành bất biến ranh giới của danh sách.
- **Lazy-load toàn bộ KaTeX, chuyển cú pháp TypeScript boot sang lazy**: sẽ thay đổi hành vi render khung hình đầu (fallback cho công thức/khối code đầu tiên), là một đánh đổi độc lập với bố cục sản phẩm build, để quyết định riêng.

## Verification

Công cụ audit đi kèm thư viện: `node scripts/attribute-chunk-bytes.mjs <chunk.js>` (quy byte về nguồn gốc không phụ thuộc gì, dựa trên VLQ sourcemap, tổng hợp theo package npm/thư mục workspace). Dùng nó để kiểm tra lại: vendor không chứa bất kỳ byte workspace nào, họ react (gồm react/jsx-runtime) nằm toàn bộ trong index, phía npm của index chỉ còn lại họ react và anser/clsx; số lượng chunk cú pháp lazy khớp một-một với bảng `LAZY_GRAMMARS`; các case keyless replay trên trình duyệt khớp từng chữ với baseline trước khi thay đổi (trừ các báo đỏ đặc thù môi trường máy cục bộ), việc tải và render shell hai chunk không hồi quy.

## Consequences

- Thay đổi mã shell chỉ đổi hash lại index (khoảng một phần ba sản phẩm build); vendor (khoảng hai phần ba) ổn định về cache qua các phiên bản shell, chỉ mất hiệu lực khi nâng cấp dependency.
- `dist/assets/` có thể điều hướng: gốc có một cặp js/css, `langs/` chứa cú pháp theo nhu cầu, `fonts/` chứa font.
- Chi phí bảo trì: khi mã workspace thêm import trực tiếp tới một package facade của họ render nào đó, cần đồng bộ `VENDOR_PACKAGES` (bỏ sót chỉ pha loãng index, không gây hỏng); khi mở rộng tập cú pháp boot trong highlight.ts mà không đồng bộ `BOOT_GRAMMAR_FILES`, cú pháp đó sẽ âm thầm rơi vào index, chỉ audit sản phẩm build mới phát hiện được.
- Mặt tĩnh của webserver chưa nén, lợi ích về dung lượng gzip vẫn chưa được hiện thực hóa; nén ở tầng truyền tải là một quyết định độc lập khác.
