# Agent Note: bundle plugin theo profile thay cho các overlay bề mặt cố định

Status: implemented

[English](2026-08-05-profile-plugin-bundles.md) | Tiếng Việt

## Problem

Trình khởi động `dsh` hardcode cách tổ hợp của chính nó: `base.cordis.yml` + `web.cordis.yml` được phát hành kèm `apps/cli`, ba chế độ entry được tùy biến riêng (`--config`, `web`, `-p`) mỗi chế độ mang một chồng layer, cộng thêm một overlay cá nhân toàn cục (`$DSH_HOME/config.yaml`). Muốn nhét một plugin ngoài cây mã nguồn (một TUI, một gói mở rộng provider) vào bề mặt đã phát hành thì chỉ còn cách sửa repository; các package bên thứ ba cũng không có chỗ nào để đóng góp tổ hợp mặc định.

## Decision

Mọi thứ đều trở thành **profile**: tức thư mục `$DSH_HOME/profiles/<name>`, bên trong có một `package.json` (`dependencies` là các plugin ngoài cây do pnpm quản lý, cộng với profile manifest `dsh.profile` và danh sách layer `bundles` có thứ tự của nó) cùng một `cordis.patch.yml` của người dùng. **Bundle** là npm package khai báo `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; hai loại manifest nằm dưới hai key khác nhau `dsh.profile` / `dsh.bundle`, nên một package.json có thể tự nói rõ nó đóng vai trò nào. Cây cấu hình được tổ hợp trên một root rỗng: áp patch của từng bundle theo thứ tự `dsh.profile.bundles`, rồi đến layer người dùng và overlay `--patch` — quá trình khởi động và `--dump-config` dùng chung một đường `applyEntryPatches`. Sau đó, [quyết định ứng dụng sở hữu command line](2026-08-06-app-owned-command-line.md) lại chuyển các giá trị lấy tại thời điểm gọi từ patch do trình khởi động sinh ra sang service khởi động.

Các bundle đi kèm là `@deepseek-ai/dsh-base` (dòng cấu hình lõi dùng chung), `@deepseek-ai/dsh-web-app` (dòng cấu hình Host trình duyệt và lớp keo runtime Web) và `@deepseek-ai/dsh-headless` (runner một lần, xếp thẳng trên base và không kèm web-app). Lệnh tổng quát `dsh --profile <name>` giao phần tham số còn lại cho dòng khởi động command line của profile đó: Web sở hữu các flag của mình, còn headless sở hữu tham số vị trí là task. Overlay patch dùng `--patch` do trình khởi động sở hữu. `dsh plugin --profile <name> <args...>` là một lớp chuyển tiếp pnpm mỏng, chịu trách nhiệm khởi tạo profile và điều hòa `dsh.profile.bundles` dựa trên khai báo bundle của các package đã cài; package không có khai báo bundle vẫn là dependency thông thường. [Headless như một entry point core trực tiếp](2026-08-09-headless-direct-core-entry-point.md) chịu trách nhiệm về quy ước tổ hợp headless.

Việc phân giải mang tính hai điểm neo ngay từ thiết kế: tên trong `dsh.profile.bundles` được phân giải từ thư mục cài đặt dsh trước, rồi mới đến thư mục profile — nhờ vậy bundle dựng sẵn luôn đến từ cùng bản cài đặt với `dsh` đang chạy, và pnpm không bao giờ quản lý chúng — còn tên plugin trần trong dòng patch thì được tra ngược qua từng thư mục cha Node của thư mục profile, rơi về thư mục dự phòng phẳng được bảo trì `$DSH_HOME/profiles/node_modules` (một symlink cho ứng dụng ở thư mục cài đặt và một symlink cho mỗi package mà từng bundle phụ thuộc, được sửa lại ở mỗi lần khởi động).

Hai đợt refactor đi kèm: dịch vụ static dist tích hợp sẵn trong webserver được đổi thành **ghế dự phòng** có một chủ sở hữu duy nhất (`registerFallback` / `applyIndexTaps`), SPA server được tách ra thành `@deepseek-ai/dsh-host-frontend-static`, để bundle web sở hữu dist của chính nó theo cách tổ hợp thay vì dựa vào mã của trình khởi động; cơ chế overlay cá nhân của [quyết định cấu hình cá nhân cho dsh CLI](../feature/2026-07-20-dsh-cli-personal-config.md) (`loadPersonalPatches`, `$DSH_HOME/config.yaml`) được đổi thành các layer `cordis.patch.yml` theo từng profile và ở cấp home (`loadOptionalPatches`, `watchUserPatches` nhận tên file), thay thế các chế độ entry và vị trí file của note đó, đồng thời vẫn giữ thư mục gốc Harness home, ngữ nghĩa patch và cách phân giải thất bại một cách ồn ào.

## Alternatives considered

- **Quét dependency kèm `patchOrder` từng phần** (bản nháp ban đầu): quét `dependencies` để tìm bundle, những mục không được liệt kê thì xếp theo thứ tự bảng chữ cái, cách này tạo ra hai nguồn sự thật và một luật phân định ngầm; một danh sách `dsh.profile.bundles` tường minh, có thứ tự thì nhỏ hơn và hoàn toàn xác định. Chạy `pnpm add` thẳng trong profile chỉ cài một thư viện chứ không kích hoạt patch nào — hành vi tường minh, không có quét ngầm.
- **Bundle dựng sẵn dùng mục `link:`**: pnpm không thể quản lý phiên bản, cài đặt hay cập nhật một `link:` trỏ tới thư mục cài đặt, nó sẽ nhúng đường dẫn của máy vào file người dùng, và sẽ hỏng khi thư mục cài đặt bị di chuyển. Phân giải hai điểm neo cộng với symlink dự phòng được sửa lại ở mỗi lần khởi động cho cùng một bảo đảm («bundle đến từ thư mục cài đặt») mà không có những thủ tục rườm rà đó.
- **Đặt một module `context` chạy trước khởi động trong manifest của bundle** để mang các giá trị lấy tại thời điểm khởi động (đường dẫn dist, dữ kiện flag): bị bác bỏ, thay bằng plugin thuần túy — logic keo chính là dòng cấu hình thông thường và service khởi động do ứng dụng sở hữu, nhờ vậy tổ hợp luôn có thể dump đầy đủ còn manifest vẫn là dữ liệu thuần. Các slot host do trình khởi động cung cấp (`ctx.cmdlineArgs`, `ctx.appExit` và snapshot môi trường) được cung cấp trong hook `prepare` của `boot()`, trước khi bất kỳ entry nào của cây cấu hình được mount.
- **Tự động áp dụng bundle theo kiểu bắc cầu**: chỉ những mục được liệt kê trực tiếp trong `dsh.profile.bundles` mới đóng góp layer; một meta-bundle muốn tái xuất patch của một bundle khác thì phải làm điều đó một cách tường minh trong file patch của chính nó.

## Consequences

- Các bề mặt tổ hợp mới (TUI, gói mở rộng provider) được phát hành dưới dạng npm package thông thường và có thể cài theo từng profile; repository không còn phải dành riêng một dòng cho mỗi hình thái triển khai.
- `apps/cli` thu nhỏ lại thành phần parse argv, bên tiêu thụ cơ chế profile và lớp chuyển tiếp pnpm; `AppCLIEntry` cùng các đường khởi động riêng cho từng bề mặt đều đã bị xóa.
- Bộ khung e2e web không cần khóa khởi chạy đúng các layer bundle đó từ cùng một root rỗng như production, bao gồm cả phần dự phòng module profiles, nên mọi sai lệch tổ hợp giữa test và sản phẩm sẽ thất bại một cách ồn ào.
- Backend không từ chối bất kỳ định dạng cũ nào trên đĩa (lập trường tiền phát hành): `$DSH_HOME/config.yaml` chỉ đơn giản là không còn được đọc nữa.
