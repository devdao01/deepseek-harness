# Agent Note: Đưa Cordis vào repo dưới dạng source code, không phải dependency NPM

Status: implemented

[English](2026-06-11-vendor-cordis-as-source.md) | 中文

## Vấn đề

DeepSeek Harness được xây dựng trên nền framework Cordis. Khi repo này bắt đầu, Cordis core đang ở 4.0.0-rc.6 (một bản release candidate); harness phụ thuộc vào phần hiện thực nội bộ của framework (vòng đời fiber, dispose (giải phóng tài nguyên), phân phối waterfall (sự kiện kiểu thác nước)), hành vi chính xác của chúng liên quan trực tiếp đến đảm bảo tính đúng đắn của agent loop (vòng lặp agent).

## Quyết định

Sao chép các package Cordis cần thiết (core, loader, include, group, timer, hmr, logger-console) cùng thư viện nền tảng cordiverse (cosmokit, schemastery) dưới dạng source code vào `vendor/`, đặt phẳng (flatten), giữ nguyên tên package npm gốc để việc giải quyết workspace trong suốt. `pnpm-workspace.yaml` đặt `linkWorkspacePackages: true`, do đó chỉ cần dải semver thượng nguồn khớp, bất kể chạy bằng source code hay bằng artifact đã build, dependency đều được giải quyết về các workspace đã ghim phiên bản này. Dependency bên thứ ba thực sự (js-yaml, chokidar, @standard-schema/spec, v.v.) vẫn được lấy từ npm.

`vendor/README.md` là manifest (danh sách metadata): ghi lại repo thượng nguồn và commit SHA của mỗi package, cùng một nhật ký sửa đổi cục bộ đầy đủ chi tiết. Guard pre-commit (`scripts/check-vendor-manifest.sh`) sẽ từ chối thay đổi source code vendor nếu manifest chưa được cập nhật trong cùng một commit.

## Phương án khác đã cân nhắc

- **Phụ thuộc vào package npm**: bị bác bỏ. Core đang ở giai đoạn release candidate, harness phụ thuộc vào phần hiện thực nội bộ của framework (vòng đời fiber, dispose, phân phối waterfall), đảm bảo tính đúng đắn của agent loop phụ thuộc vào hành vi chính xác của những phần đó; việc nâng cấp phiên bản RC thượng nguồn có thể phá vỡ chúng mà không có đường sửa cục bộ nào.
- **Đưa toàn bộ dependency bắc cầu (transitive) vào repo theo kiểu đệ quy**: bị bác bỏ. Dependency bên thứ ba thực sự (js-yaml, chokidar, @standard-schema/spec, v.v.) vẫn được lấy từ npm; chỉ tầng framework có phần hiện thực nội bộ ảnh hưởng đến chúng ta mới cần tự nắm giữ.

## Hệ quả

- Harness nắm giữ hoàn toàn tầng framework của nó: có thể audit, có thể vá lỗi, ghim phiên bản. RC thượng nguồn không thể khiến dự án này lỗi, bug framework có thể được sửa trực tiếp trong repo.
- Package đã build và việc chạy test bằng source code thực thi cùng một phiên bản Cordis đã đưa vào repo; sau khi gỡ liên kết workspace, package đã build sẽ âm thầm chuyển sang dùng bản sao npm mà không đổi tên package.
- Đồng bộ thượng nguồn là thao tác thủ công (quy trình được ghi trong manifest). Nhật ký sửa đổi giúp phạm vi diff luôn được biết rõ.
- Package đã đưa vào repo giữ nguyên phong cách code thượng nguồn; gate lint và mức nghiêm ngặt loại trừ chúng (tsconfig của chúng nới lỏng cục bộ các tùy chọn compiler mới hơn của chúng ta).
- Có một bản vá cục bộ ngay từ ngày đầu: đã gỡ bỏ import locale-YAML của hmr (hook import YAML lúc runtime không được đưa vào repo).
