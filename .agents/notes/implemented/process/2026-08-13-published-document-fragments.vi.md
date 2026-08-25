# Agent Note: Xác minh fragment của tài liệu đã publish

Status: implemented

[English](2026-08-13-published-document-fragments.md) | 中文

## Problem

`verify-md-links` dùng heading id kiểu Markdown của GitHub để xác minh fragment, còn trang tài liệu dùng VitePress để render tiêu đề. Tiêu đề có nhiều dấu câu và tiêu đề đã dịch có thể pass qua xác minh source code, nhưng lại không có id tương ứng trong HTML đã publish. Build VitePress thành công chỉ xác minh trang đích tồn tại, không xác minh fragment id.

## Decision

`docs:build` và biến thể MPA của nó sẽ chạy `verify-doc-site-fragments` sau khi VitePress sinh ra `website/.dist`. Validator này parse từng trang HTML đã sinh, phân giải từng liên kết fragment nội bộ theo clean URL của VitePress, và fail khi artifact build không tồn tại, route mơ hồ, href sai định dạng, trang đích không tồn tại, hoặc id được yêu cầu bị thiếu. Unit test bao phủ các trường hợp fail này, cùng với clean URL, alias `.html`, liên kết cùng trang, encoding, id nguyên văn và loại trừ liên kết ngoài.

Bất kỳ tiêu đề đích fragment nào có id GitHub khác với id VitePress đều mang một alias tường minh tương thích GitHub. Trang viết tay tiếng Anh và trang dịch sẽ thêm alias trước tiêu đề; trang dịch dùng id tiếng Anh mà file đối chiếu song ngữ chia sẻ chung. Cấu hình, tool và danh mục bền vững được sinh tự động thì alias do generator sở hữu chúng xuất ra. Xác minh source Markdown giữ độc lập, vẫn từ chối liên kết không thể phân giải theo quy tắc render của repo.

## Alternatives considered

**Dùng fragment riêng cho từng ngôn ngữ.** File đối chiếu song ngữ chủ đích giữ cùng một đích liên kết. Fragment riêng theo ngôn ngữ sẽ làm hai bên source không nhất quán, và còn yêu cầu mỗi bên tạo liên kết phải biết tiêu đề đã dịch của ngôn ngữ đích.

**Dựa vào heading id của VitePress.** Các id này phụ thuộc vào dấu câu sau khi render và văn bản tiêu đề đã bản địa hóa, không thể giữ được id GitHub mà liên kết trong repo và tham chiếu được sinh tự động đã dùng.

**Chỉ kiểm tra source Markdown.** Cách này không xác minh sản phẩm đã publish, cũng không phát hiện được khác biệt giữa thuật toán slug của GitHub và VitePress.

## Consequences

Mỗi lần build tài liệu production sẽ đọc một lần HTML đã sinh, thêm một kiểm tra có giới hạn sau khi build website hiện có. Liên kết fragment xuyên trang phải trỏ đến id vẫn còn tồn tại sau khi publish. Alias tường minh trở thành một phần của tài liệu tham khảo đã publish, giúp tiêu đề vẫn giữ được fragment hiện có dù đổi ngôn ngữ hoặc dấu câu.
