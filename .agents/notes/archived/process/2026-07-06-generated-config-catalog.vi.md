# Agent Note: Danh mục cấu hình plugin sinh tự động

Status: implemented

Archived: 2026-07-27

[English](2026-07-06-generated-config-catalog.md) | 中文

## Vấn đề

Trước đây repo không có tài liệu tham chiếu cấu hình plugin dựa trên mã nguồn làm nền tảng. README của từng package (gói) ghi lại các field theo cách không nhất quán, không liệt kê những package nào có thể được load, cũng không kiểm chứng schema runtime có khớp với kiểu cấu hình đã khai báo hay không.

## Quyết định

`scripts/gen-config-catalog.ts` sinh ra [docs/config-catalog.md](../../../../docs/config-catalog.md) dựa trên kiểu config và JSDoc mà từng plugin khai báo, bao gồm cả yêu cầu injection, liên kết tới các kiểu được tham chiếu và vị trí mã nguồn. Các kiểu nội bộ package sẽ được đưa vào theo kiểu bắc cầu; các kiểu workspace và kiểu bên ngoài sẽ được liên kết hoặc nêu tên. Chế độ xác định `--write` và `--check` biến trang đã commit thành sản phẩm sinh tự động.

Việc dùng phương pháp sinh thuần AST ở đây là đúng đắn, với lý do tương tự như danh mục event/service, và khác với danh mục tool: kiểu cấu hình là khai báo tĩnh, mọi schema schemastery trong repo đều là literal `z.object`/`z.intersect` tĩnh, do đó mã nguồn chính là toàn bộ sự thật — không phần nào của bề mặt cấu hình được tổ hợp lúc runtime.

Các lựa chọn cụ thể:

- **Kiểu cấu hình là kiểu của tham số thứ hai.** Danh mục ghi lại kiểu tham số đã khai báo của `apply(ctx, config)` / constructor service `(ctx, config)` — tức giá trị mà Cordis thực sự truyền vào — chứ không phải export `Config` được định vị theo quy ước đặt tên. Điều này khiến việc duyệt trở nên toàn diện: dù interface tên là `AcpConfig` hay `BasicCompactConfig`, dù kiểu được khai báo trong file anh em, hay plugin hoàn toàn không có schema kiểm chứng, đều hoạt động bình thường.
- **Phân loại là toàn diện.** Mỗi entry `packages/<group>/<pkg>` đều được phân giải (phản chiếu `unwrapExports` của Loader: `exports.default ?? exports`), xếp vào một trong các nhóm: plugin có thể cấu hình, plugin không có cấu hình, lớp seam trừu tượng, hoặc thư viện — mỗi nhóm được render trong một mục riêng — entry không thể phân loại sẽ báo lỗi trực tiếp. Package mới không thể bị bỏ sót âm thầm.
- **Bắt buộc JSDoc theo từng field.** Mỗi thuộc tính trong khai báo được dán vào (kể cả type literal lồng nhau) đều cần mô tả JSDoc không rỗng, nếu không việc sinh sẽ thất bại. Bản thân việc dán chính là tài liệu, nên đây là cùng một cơ chế ép buộc như events catalog áp dụng qua `@mode`: gate báo lỗi khi tài liệu mã nguồn quá sơ sài, thay vì tạo ra một catalog sơ sài.
- **Đối chiếu key của schema với kiểu đã khai báo.** Bộ sinh phân giải các đường dẫn object và array lồng nhau thông qua kiểu cục bộ và kiểu workspace. Đường dẫn bị thiếu xác định được sẽ báo lỗi; các hình dạng bên ngoài hoặc động không thể liệt kê sẽ được bỏ qua. Việc đối chiếu cố ý được thiết kế một chiều, vì kiểu đã khai báo có thể chứa các field chỉ dùng cho runtime bị loại khỏi cấu hình loader.
- **Rào chắn (fence) chuyên dụng.** Khai báo được dán vào dùng info string ` ```ts config-catalog `, mà `doc-typecheck` sẽ bỏ qua (các khai báo đơn lẻ tham chiếu kiểu import không thể tự biên dịch độc lập), và loại nó khỏi tỷ lệ opt-out — giống cách xử lý với rào chắn `cordis-catalog` và `persistence-catalog`.
- **Một file duy nhất `docs/config-catalog.md`**, thay vì một thư mục nhiều file: trang này hướng đến một nhóm đối tượng duy nhất (người viết `cordis.yml`), chỉ có một chiều, khác với `cordis-catalog/` (nơi có hai trang song song).

Mục `## Config` trong README của từng package vẫn được giữ lại. Sự trùng lặp này là chủ đích chấp nhận: README là hợp đồng theo từng package được biên soạn có chủ ý (mô tả ngữ nghĩa cấu hình trong ngữ cảnh triển khai, cùng các giới hạn và điểm mở rộng), còn catalog là liệt kê sinh tự động mang tính vét cạn. Vì catalog được sinh tự động, khi hai bên không khớp nghĩa là README sai, cách sửa là chỉnh README — catalog sẽ không bị trôi lệch.

## Các phương án thay thế đã cân nhắc

- **Render tổng hợp theo từng field**: sinh danh sách gạch đầu dòng, bảng, hoặc đoạn YAML có chú thích cho mỗi field, lắp ráp từ JSDoc đã parse cộng metadata schema. Bị bác bỏ, thay bằng dán nguyên văn: interface cùng JSDoc của nó vốn đã là hợp đồng được viết ở dạng nguyên bản; một bộ render tổng hợp sẽ định dạng lại phần văn bản mà nó không sở hữu, thêm một lớp render có thể làm sai lệch ý nghĩa gốc.
- **Khởi động runtime + introspection schema (như danh mục tool đã làm)**: bị bác bỏ. Ở đây không có gì được tổ hợp lúc runtime, và bản thân schema cũng không đủ tài liệu hóa bề mặt cấu hình (giá trị mặc định được ghi bằng văn xuôi, field chỉ dùng cho runtime, plugin hoàn toàn không có schema). Khởi động chỉ làm tăng độ giòn mà không tăng thêm sự thật.
- **Kiểm tra tương đương hai chiều schema/interface**: bị bác bỏ, thay bằng kiểm tra tập con. Kiểu đã khai báo hợp lý khi chứa các thành viên mà schema từ chối nhận từ cấu hình (seam chỉ dùng cho runtime).
- **Bãi bỏ mục `## Config` trong README trong cùng thay đổi này**: bị bác bỏ. Giữ lại sự trùng lặp chấp nhận được giúp hợp đồng theo từng package vẫn đọc được tại chỗ, trong khi việc dọn dẹp cần gấp các sự thật bổ sung của từng README vào JSDoc của field trước — đây là công việc có thể tách riêng, catalog không phụ thuộc vào nó.

## Hệ quả

- Danh mục sẽ không bị trôi lệch: thay đổi mã nguồn không được phản ánh trong file đã commit sẽ khiến `doc-sync` và `verify-config-catalog` trong CI thất bại. Field config chưa được ghi tài liệu, tên kiểu được tham chiếu không phân giải được, hoặc key schema không xuất hiện trong kiểu config, đều sẽ khiến bộ sinh thất bại trực tiếp.
- Văn xuôi cấu hình giờ có một cơ chế ép buộc tại nơi khai báo: viết field config mới nghĩa là viết JSDoc cho nó, và JSDoc đó sẽ trở thành entry catalog nguyên văn.
- Bộ sinh báo lỗi trực tiếp với các hình dạng không thể duyệt tĩnh — import cấu hình nội bộ package bị alias hóa, schema được xây dựng không từ tổ hợp `object`/`intersect`, tên kiểu toàn cục chưa được liệt kê. Khi đưa vào các hình dạng như vậy phải đồng thời dạy cho bộ sinh biết (nếu không hình dạng đó không thể vào repo), đây chính là chủ đích thiết kế: catalog luôn là toàn bộ sự thật.
- `gen-cordis-catalog.ts` export các hàm hỗ trợ JSDoc/con trỏ cùng `LINK_MAP` để tái sử dụng, nhờ đó hai catalog liên kết chéo các kiểu theo cùng một cách, thêm một entry link-map mới sẽ phục vụ cho cả hai.
