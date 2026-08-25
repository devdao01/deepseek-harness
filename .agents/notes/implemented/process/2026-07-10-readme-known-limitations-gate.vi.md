# Agent Note: Gate bảo vệ mục "Known Limitations" trong README của từng package

Status: implemented

[English](2026-07-10-readme-known-limitations-gate.md) | 中文

## Vấn đề

[Tiêu chuẩn tài liệu](../../../../docs/AGENTS.md) quy định mục hạn chế thuộc về README của package. Khi không có cấu trúc thống nhất, việc thiếu mục này không thể phân biệt được giữa "đã kiểm toán và xác nhận không có hạn chế" với "quên viết tài liệu", và tiêu đề khác nhau còn cản trở việc tìm kiếm toàn repo.

## Quyết định

Mỗi manifest (bản khai metadata) `packages/<group>/<pkg>/package.json` đều có một README cùng cấp, chứa mục H2 chuẩn `## Known Limitations and Deferred Work`. Các gạch đầu dòng trong đó ghi lại khoảng trống dài hạn cho bên tiêu thụ và ràng buộc bảo trì không hiển nhiên mà package đó chịu trách nhiệm; các việc dọn dẹp thông thường vẫn nằm trong TODO mã nguồn hoặc Agent Note tương ứng. [Gate `verify-package-readme-limitations`](../../../../scripts/verify-package-readme-limitations.ts) suy ra tập hợp package từ manifest, từ chối README bị thiếu, và yêu cầu đúng một tiêu đề H2 chuẩn kèm ít nhất một gạch đầu dòng cấp cao nhất. Các tiêu đề gần giống như "Limitations", "Deferred", "What is NOT here" hay "Non-goals" đều sẽ thất bại.

Nếu một package thực sự không có hạn chế nào cần khai báo, hãy đưa vào `NO_LIMITATIONS` và bỏ qua mục này. Khi thêm hạn chế mới phải gỡ mục này ra; khi package đổi tên hoặc bị gỡ bỏ, mục cũ sẽ khiến gate thất bại, vì mỗi mục phải tương ứng với một package đang được quét.

Gate chỉ kiểm tra sự tồn tại, hình thức và danh sách cho phép. Việc đánh giá độ bao phủ và tính chính xác dựa trên tiêu chuẩn tài liệu và [tiêu chuẩn văn phong](../../../skills/dsh-prose-standard/SKILL.md). Quy tắc thường trực nằm ở [packages/AGENTS.md](../../../../packages/AGENTS.md).

## Phương án thay thế đã từng cân nhắc

- **Tiêu đề tự do**: không thể tìm kiếm thống nhất, vẫn cần phát hiện tiêu đề gần giống.
- **Yêu cầu mục rỗng hoặc viết "None."**: văn bản khuôn mẫu có thể còn sót lại sau khi package đã có thêm hạn chế; danh sách cho phép khiến trạng thái "thực sự không có hạn chế" tường minh và có thể đánh giá được.
- **Đặt giới hạn số từ**: số lượng hạn chế hợp lý khác nhau tùy package, do đó việc kiểm soát cấp README không đặt ngân sách từ này thuộc về người đánh giá.

## Hệ quả

- Package mới phải khai báo các hạn chế phù hợp, hoặc đưa vào danh sách trắng tường minh; mục bị thiếu, trôi dạt hoặc rỗng sẽ thất bại trong `doc-sync` cả cục bộ lẫn CI.
- Gate thêm một script TypeScript không phụ thuộc bên ngoài vào `doc-sync`.
- Việc đổi tên tiêu đề bắt buộc cần sửa đồng thời script và mọi README package.
