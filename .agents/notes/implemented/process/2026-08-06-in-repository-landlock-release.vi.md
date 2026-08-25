# Agent Note: Phát hành Landlock trong repo

Status: implemented

[English](2026-08-06-in-repository-landlock-release.md) | Tiếng Việt

## Vấn đề

Mã nguồn `@deepseek-ai/node-addon-landlock-run` đã nằm cùng với bên tiêu thụ DeepSeek Harness của nó tại `native/landlock-run`, nhưng trước đây vẫn giữ một pnpm workspace và lockfile riêng, và phụ thuộc vào một repo độc lập để phát hành lên npm. Package harness dùng phiên bản cố định từ npm registry, nên cùng một PR (Pull Request) có thể sửa cả quy ước launcher lẫn bên tiêu thụ của nó, nhưng lại không thể test các thay đổi đó cùng nhau. Luồng công việc gốc của repo mã nguồn có thể diễn tập quy trình đóng gói, nhưng không phát hành đúng artifact mà nó đã thực sự test.

Việc phản chiếu phát hành còn tạo ra công việc điều phối phát hành trùng lặp: export mã nguồn, cập nhật một lockfile khác, chạy một luồng công việc phát hành khác, phát hành họ package gốc, rồi quay lại repo này để cập nhật dependency registry. Nhu cầu thực tế của người dùng npm không thay đổi, nhưng sự tách biệt này khiến mỗi bản nhị phân khó khớp với commit nguồn của nó hơn, và cũng khiến việc rollback phát hành và điều phối bản vá bảo mật khó khăn hơn.

Tên package npm không có scope hiện có thuộc về một tài khoản phát hành độc lập, không thuộc tổ chức `@deepseek-ai`. Do đó, chỉ di chuyển luồng công việc vẫn khiến việc phát hành phụ thuộc vào credential cá nhân nằm ngoài quyền sở hữu phát hành của repo.

Việc hợp nhất lần này phải giữ nguyên cơ chế chọn nền tảng. Việc phân phối công khai cố tình dùng một package điểm vào JavaScript, cùng các package nhị phân riêng cho Linux x64 và arm64; việc hợp nhất quyền sở hữu repo không có nghĩa là gộp mọi file nhị phân vào cùng một tarball, cũng không có nghĩa là phát hành mọi package DeepSeek Harness theo phiên bản của launcher.

## Quyết định

`native/landlock-run` và `native/landlock-run/packages/*` thuộc về pnpm workspace gốc của repo, và dùng chung `pnpm-lock.yaml` gốc. Bên tiêu thụ harness khai báo `@deepseek-ai/node-addon-landlock-run` là `workspace:*`, nên việc phát triển, typecheck, build và test PR đều resolve package điểm vào từ cùng một checkout. Đồ thị project TypeScript gốc sẽ build package điểm vào này trước, rồi mới build bên tiêu thụ; công cụ dọn dẹp repo đảm nhiệm việc dọn thư mục output `lib/` mà nó trực tiếp sinh ra.

Ranh giới phân phối npm công khai gồm 3 package thuộc tổ chức, dùng chung một phiên bản họ package launcher: `@deepseek-ai/node-addon-landlock-run`, `@deepseek-ai/node-addon-landlock-run-linux-x64` và `@deepseek-ai/node-addon-landlock-run-linux-arm64`. Package điểm vào tiếp tục khai báo hai package nền tảng qua `optionalDependencies`; các trường `os` và `cpu` trong manifest (tệp khai báo metadata) của chúng khiến npm chỉ cài đặt package tương thích. Ràng buộc của repo yêu cầu 3 tên package này đặt `publishConfig.access: public`, và yêu cầu phiên bản của chúng khớp với package gốc workspace launcher riêng tư. Tên package không có scope trước đây không thuộc mục tiêu phát hành của repo này. 3 package này không còn là package công khai duy nhất nữa: [quyết định phân biệt access theo sequence](2026-08-13-public-vendor-and-native-sequences.md) khiến chín package framework vendored cũng được phát hành công khai, trong khi họ dsh vẫn bị giới hạn.

Repo chính đảm nhiệm cả CI gốc lẫn phát hành. `Landlock Run` chạy cho các PR liên quan và push lên `master`, và build từng package nền tảng trên runner gốc tương ứng của nó. Luồng công việc `Landlock Run Release` được kích hoạt thủ công sẽ build file nhị phân của cả hai nền tảng, truyền chúng dưới dạng artifact luồng công việc, lắp ráp và xác thực toàn bộ họ package, đóng gói tarball npm bất biến về nội dung, cài đặt và thực sự chạy các tarball này, trước khi cho phép job phát hành được bảo vệ thực thi. Thứ tự phát hành là tarball nền tảng trước, cuối cùng mới phát hành tarball điểm vào liệt kê chúng là dependency tùy chọn. Việc phát hành dùng tag `landlock-run-vX.Y.Z`, tránh xung đột giữa phiên bản launcher và các họ phát hành khác trong monorepo; phiên bản pre-release dùng dist-tag `next` của npm.

Việc diễn tập cài đặt đóng gói trong sandbox không còn cho phép npm registry cung cấp launcher. Nó sẽ đóng gói package điểm vào của checkout hiện tại, package gốc tương ứng, và closure dependency harness lại với nhau, cài đặt các tarball cục bộ này vào một bên tiêu thụ Node thuần bên ngoài repo, và chứng minh launcher đã cài đặt có thể thực thi, khớp byte-cho-byte với artifact build gốc, và có đúng kiến trúc ELF, trước khi test hiệu lực ràng buộc hay hành vi fail-closed.

## Các phương án đã cân nhắc

- **Giữ repo độc lập làm bản phản chiếu phát hành**: không chấp nhận, vì sau khi mã nguồn thẩm quyền đã chuyển vào repo này, cách này vẫn giữ lockfile tách biệt, export mã nguồn, khoảng thời gian test dùng phiên bản registry cũ, và trình tự phát hành xuyên repo.
- **Phát hành một package npm chứa file nhị phân của mọi nền tảng**: không chấp nhận, vì người dùng sẽ tải về file nhị phân không chạy được trên máy của họ, và npm không thể tận dụng bộ lọc `os`/`cpu` cấp package nữa. Quyền sở hữu repo và bố cục package npm là hai lựa chọn độc lập với nhau.
- **Để launcher dùng phiên bản gốc DeepSeek Harness, và phát hành đệ quy toàn bộ monorepo**: không chấp nhận, vì thay đổi lần này đảm nhiệm một họ package công khai gồm 3 package, chứ không phải baseline `@deepseek-ai/dsh-*` độc lập. [Đề xuất baseline npm ưu tiên artifact](../../proposed/process/2026-08-04-artifact-first-npm-baseline-publication.md) đã loại rõ workspace gốc ra khỏi tập mục tiêu của nó.
- **Cross-compile hai file nhị phân trong một job phát hành**: không chấp nhận, vì ma trận package đã commit trong repo đã phân bổ runner GitHub gốc riêng cho từng kiến trúc, không cần đưa toolchain cross-compile vào ranh giới tin cậy.

## Hệ quả

Cùng một PR có thể sửa cả giao thức launcher, mã điểm vào TypeScript, mã nguồn gốc, cách bên tiêu thụ harness dùng nó, và test đường dẫn phát hành, và resolve tất cả từ cùng một lockfile. Tag phát hành giờ định danh mã nguồn, việc tích hợp bên tiêu thụ, chỉ thị build, và tarball đã được repo chính test. Bản phản chiếu độc lập không còn thuộc đường dẫn phát hành, có thể được lưu trữ (archive) sau lần phát hành thành công đầu tiên từ repo này.

Bên tiêu thụ npm chuyển sang cài đặt `@deepseek-ai/node-addon-landlock-run`; tên package không có scope trước đây không được redirect âm thầm. Máy Linux được hỗ trợ sẽ tải package điểm vào có scope cùng package khớp kiến trúc của nó, và bỏ qua package của kiến trúc còn lại. Máy không được hỗ trợ sẽ không nhận file nhị phân nền tảng, và tiếp tục theo đường dẫn phát hiện fail-closed xác định sẵn có.

Việc triển khai liên quan đến nhiều file hơn là chỉ sửa một dòng dependency, vì repo còn phải đảm nhiệm ràng buộc workspace, thứ tự build TypeScript, dọn dẹp, điều kiện kích hoạt CI, tag phát hành, sinh lockfile, so sánh nhị phân đã cài đặt với build workspace, tài liệu phát hành và thông báo bên thứ ba được sinh tự động. Ranh giới hành vi vẫn hẹp: thay đổi lần này chỉ ảnh hưởng đến họ package Landlock và 3 bên tiêu thụ workspace trực tiếp của nó, không thay đổi phiên bản hay trạng thái phát hành của các package DeepSeek Harness khác.

Ở lần phát hành package có scope đầu tiên, phải dùng token tổ chức `@deepseek-ai` qua `NPM_TOKEN` của môi trường `npm-publish`, vì npm chỉ có thể cấu hình trusted publishing sau khi package đã tồn tại. Sau khi hoàn tất bootstrap, phải cấp quyền cho luồng công việc phát hành của repo này với cả 3 package thì mới gỡ được token dự phòng. npm vẫn phát hành từng package theo thứ tự, và không cung cấp giao dịch xuyên package, nên phát hành thất bại có thể để lại phiên bản chỉ hoàn tất một phần. Vì npm sẽ từ chối package cùng tên cùng phiên bản đã phát hành, người vận hành phải kiểm tra registry và chỉ phát hành tarball còn thiếu, chứ không được chạy lại nguyên trạng luồng công việc. Runner Linux x64 và arm64 vẫn cung cấp build nhị phân thẩm quyền và kiểm tra kernel thật; checkout macOS có thể xác thực package điểm vào và hành vi trên nền tảng không được hỗ trợ, nhưng không thể thay thế các job này.

Ghi chú này chỉ thay thế phần nói về bản phản chiếu phát hành và việc dựa vào phiên bản cố định trên registry khi phát triển mã nguồn trong [Agent Note sandbox](../feature/2026-07-06-sandbox.md); Agent Note đó vẫn đảm nhiệm hành vi sandbox, việc chọn runner và ngữ nghĩa thực thi.
