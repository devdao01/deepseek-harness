# Agent Note: Tách việc khởi chạy từ mã nguồn khỏi việc build repo

Status: implemented

[English](2026-08-12-separate-source-launch-from-build.md) | Tiếng Việt

## Vấn đề

Trình khởi chạy từ mã nguồn TypeScript không cần build toàn bộ repo trước mỗi lần gọi. Ngược lại, giao diện Web lại cần các sản phẩm build của frontend và Client plugin. Việc để cùng một script trong package đảm nhiệm cả hai thao tác khiến mọi lần khởi chạy lặp lại TUI, chế độ headless và Web đều phải gánh độ trễ build toàn repo, đồng thời che mờ thời điểm các sản phẩm build cho trình duyệt được làm mới.

Module mã nguồn nạp qua tsx và module trình duyệt nạp qua bundle đã build có đặc tính "độ mới" khác nhau. Sau khi tách thành hai lệnh riêng, cần xác định rõ trách nhiệm sinh sản phẩm build và mô tả chính xác các kiểu lỗi khi sản phẩm build bị thiếu hoặc đã cũ.

## Quyết định

Script `dsh` ở thư mục gốc chỉ chạy `node --import tsx/esm apps/cli/src/bin.ts`. `pnpm run build` vẫn là thao tác độc lập để sinh sản phẩm build của package và frontend. Người dùng chạy từ mã nguồn sẽ chạy build trước lần khởi chạy giống môi trường production đầu tiên, và chạy lại khi cần làm mới sản phẩm build của frontend hoặc Client plugin.

Khi thiếu sản phẩm build Typert Host, việc khởi chạy profile sẽ thất bại với lỗi phân giải module không kèm hướng dẫn build. Khi các sản phẩm build Host này đã tồn tại nhưng thiếu sản phẩm build của frontend hoặc Client plugin, việc khởi chạy sẽ thất bại và thông tin chẩn đoán sẽ hướng dẫn người dùng chạy `pnpm run build`. Trình khởi chạy không kiểm tra sản phẩm build có phải là mới nhất hay không: một bundle frontend hoặc Client plugin cũ sẵn có vẫn được chấp nhận và có thể tiếp tục chạy mã trình duyệt phiên bản cũ cho tới lần build kế tiếp. Sau khi nửa Node của từng package đã được build ít nhất một lần, `pnpm run dev:web` chỉ build lại những package có khai báo `dsh.client`; nó giữ cho bundle Client plugin luôn mới và bật đường dẫn hot reload của bundle đó, nhưng không build lại frontend shell.

Quyết định này chỉ quy định việc lập lịch build. [Quyết định khởi chạy mã nguồn bằng tsx ESM](../architecture/2026-07-29-dsh-source-launch-tsx-esm.md) quy định việc chuyển đổi TypeScript và phân giải workspace, [quyết định chạy từ mã nguồn](2026-08-10-source-run-without-managed-installer.md) quy định việc dùng script của repo làm lối vào được hỗ trợ cho bản checkout, còn [quyết định cấu hình cá nhân](../feature/2026-07-20-dsh-cli-personal-config.md) quy định lớp cấu hình ở cấp máy.

## Các phương án đã cân nhắc

**Build trước mỗi lần khởi chạy từ mã nguồn.** Cách này cho bảo đảm độ mới mặc định mạnh nhất, nhưng mỗi lần gọi vẫn phải gánh chi phí sinh sản phẩm build toàn repo ngay cả khi các sản phẩm build liên quan đã là mới nhất.

**Chỉ build khi thiếu sản phẩm build.** Cách này tránh được một phần chi phí khởi chạy, nhưng không phát hiện được sản phẩm build đã cũ, và còn biến hành vi build thành một chính sách ngầm phụ thuộc vào nội dung hệ thống tệp tại thời điểm đó.

**Để `pnpm dsh` khởi động watcher cho sản phẩm build Web.** Cách này giữ bundle Client plugin luôn mới, nhưng lại bắt một trình khởi chạy chạy-một-lần phải quản lý thêm một tiến trình chạy dài. Lệnh `pnpm run dev:web` tường minh vốn đã đảm nhiệm vòng đời phát triển này.

## Hệ quả

- Các lần khởi chạy lặp lại từ mã nguồn không phải chờ build toàn repo, và output của build cũng không lẫn vào output của CLI.
- Người dùng chạy từ mã nguồn chịu trách nhiệm về độ mới của sản phẩm build. Thiếu sản phẩm build sẽ chặn việc khởi chạy, nhưng chỉ lỗi thiếu sản phẩm build của frontend và Client plugin mới hướng dẫn người dùng chạy `pnpm run build`; các bundle frontend và Client plugin cũ sẵn có có thể âm thầm phục vụ mã trình duyệt phiên bản cũ.
- Việc chọn TUI, Web hay chế độ headless, cách chuyển tiếp tham số, kế thừa môi trường, cũng như cách khởi chạy tsx ESM đều giữ nguyên.
- Hướng dẫn bắt đầu ở thư mục gốc và tài liệu tham chiếu CLI liệt kê build và khởi chạy như hai lệnh riêng biệt, đồng thời mô tả hành vi khi sản phẩm build đã cũ.

## Kiểm chứng

`apps/cli/tests/source-launch.compat.spec.ts` cố định chính xác nội dung các lệnh trong package ở thư mục gốc và thực thi cách khởi chạy từ mã nguồn dùng cho production. `packages/bundle/web-app/tests/web-app.spec.ts` và `packages/client/modules/tests/node-half.client.spec.ts` cố định thông tin chẩn đoán khi thiếu sản phẩm build.
