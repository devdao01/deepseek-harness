# Agent Note: Lấy danh mục package qua cơ chế phát hiện, thay vì duy trì danh sách tĩnh

Status: proposed

[English](2026-06-20-discover-package-inventory.md) | Tiếng Việt

## Vấn đề

Danh sách package và cổng gác (gate) lặp lại nhiều lần trong TypeScript project references, tài liệu package, mô tả CI và các mục ghi đè của Knip. Phần lớn chỉ nhắc lại bố cục package, dữ liệu manifest (tệp mô tả metadata), hoặc nội dung của các lệnh tổng hợp. Vì vậy, mỗi khi thêm một package mới đều phát sinh một điểm đồng bộ vốn có thể tránh được.

[Cấu trúc phân cấp package](../../archived/architecture/2026-06-20-package-hierarchy.md) đã thủ công loại bỏ được một số trường hợp: `scripts/publint-all.ts` giờ đây suy ra danh sách từ bố cục `packages/<group>/<pkg>`, và ánh xạ `paths` của hai tệp `tsconfig` cũng đã gộp thành một ký tự đại diện (wildcard) `@deepseek-ai/dsh-*` duy nhất. Phần còn lại là những danh sách không thể loại bỏ bằng glob, chủ yếu là các project references (`references`) trong cấu hình tổng hợp (`tsconfig.host.json`, `tsconfig.client.json`) — TypeScript yêu cầu chúng phải là mảng tường minh (không có dạng ký tự đại diện).

Danh sách tĩnh là hợp lý khi chúng mã hóa một chính sách; nhưng khi chúng chỉ lặp lại dữ liệu manifest hoặc sự thật về bố cục đã có sẵn trong `package.json`, glob của workspace, hay cấu trúc phân cấp package, thì đó chỉ là ma sát không cần thiết.

## Đề xuất

Làm cho các danh sách package và cổng gác còn lại trở nên có thể phát hiện được. Nguồn chân lý duy nhất — tức cấu trúc phân cấp `packages/<group>/<pkg>` cộng với manifest của package — nên điều khiển `references` của cấu hình tổng hợp, sơ đồ module, và bất kỳ danh sách package đầy đủ nào, đi kèm một bước sinh (generate) cộng kiểm tra (theo đúng mẫu hiện có của `gen-module-graph` / `gen-cordis-catalog`: bộ sinh ghi ra sản phẩm, chế độ `--check` sẽ báo lỗi trong `hygiene` / `doc-sync` (cổng gác đồng bộ tài liệu) khi phát hiện bản đã commit đã lỗi thời). Việc sinh sơ đồ module hiện đã đọc manifest của package. `doc-sync` nên trở thành lệnh duy nhất định nghĩa và in ra các cổng gác con của nó, còn tài liệu chỉ liên kết đến lệnh đó, thay vì lặp lại một danh sách thứ hai.

Cấu trúc phân cấp không cần mã hóa mọi sự thật về các package, nhưng nên mã hóa chính sách bảo trì tổng quát: các package core/product, package tích hợp, package capability seam, và package support/test/example không nên yêu cầu một danh sách ngoại lệ bảo trì thủ công trước khi script có thể phân biệt được chúng.

Có một hạng mục đã được liệt kê hoàn toàn không cần bộ sinh: gộp glob điểm vào (entry) e2e vào đoạn cấu hình mặc định của Knip là có thể xóa thẳng các khai báo lặp lại theo từng package.

## Tiêu chí nghiệm thu

- Project references (`references`) của cấu hình tổng hợp được sinh ra từ cấu trúc phân cấp (bộ sinh xuất ra chúng; cổng gác `--check` báo lỗi khi bản đã commit lỗi thời), thay vì được bảo trì thủ công.
- Khi thêm một package mới, không cần chỉnh sửa danh sách package tĩnh cho bất kỳ cổng gác nào.
- Tài liệu mô tả nguồn chân lý, chứ không lặp lại danh sách đã được sinh ra.
- CI gọi các lệnh tổng hợp, và các lệnh này tự quản lý danh sách cổng gác con của mình.
- `knip.json` chỉ mang mục ghi đè theo từng package khi mã hóa thông tin thật sự (tệp điểm vào bổ sung, phụ thuộc bị bỏ qua), không bao giờ lặp lại đoạn cấu hình mặc định.

## Rủi ro

Script phát hiện có thể trở nên quá cầu kỳ. Cách triển khai nên giữ sự đơn giản: đọc manifest, lọc theo trường tường minh, in ra danh sách đã phân giải, và báo lỗi rõ ràng khi có sự cố. Lợi ích nằm ở việc loại bỏ độ trôi (drift) của danh sách thủ công, chứ không phải phát minh ra một hệ thống build.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
