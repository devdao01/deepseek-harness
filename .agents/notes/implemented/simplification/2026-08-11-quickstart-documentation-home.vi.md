# Agent Note: Trỏ tuyến gốc tài liệu về trang bắt đầu nhanh

Status: implemented

[English](2026-08-11-quickstart-documentation-home.md) | Tiếng Việt

## Vấn đề

Một trang chủ tài liệu riêng biệt sẽ lặp lại định vị sản phẩm và tóm tắt tính năng vốn đã được duy trì bởi trang chủ sản phẩm. Những tuyên bố trùng lặp này cần được đồng bộ và đánh giá, nhưng không giúp ích gì cho người đọc đang tra cứu hướng dẫn thao tác kỹ thuật.

## Quyết định

Mỗi tuyến gốc theo locale đều là một trang redirect. `/` đưa người đọc tới `./guide/quickstart`, còn `/en/` sẽ resolve cùng đích tương đối đó thành `/en/guide/quickstart`. Khi website được host dưới một subpath của origin, đích tương đối vẫn giữ nguyên `DOCS_BASE` đã cấu hình.

Redirect được duy trì bởi frontmatter VitePress trong `docs/user/index.md` và `docs/user/index.zh.md`. Đối với trang chủ theo locale, [bộ chiếu tài liệu website](../process/2026-07-13-documentation-site-projection.md) chỉ publish phần frontmatter này, do đó Markdown chính thức vẫn giữ dòng chuyển ngôn ngữ Anh-Trung, và không render trang chủ thứ hai. Test của bộ chiếu xác nhận cả hai tuyến gốc theo locale đều dùng cùng một đích bắt đầu nhanh tương ứng với locale của chính mình.

Website tài liệu không mang định vị sản phẩm hay tóm tắt tính năng. Trang bắt đầu nhanh vẫn cung cấp điều hướng tới guide, development, reference, search và locale.

## Các phương án thay thế đã cân nhắc

**Giữ hero của tài liệu và đồng bộ nội dung của nó.** Cách này giữ được một trang quảng bá, nhưng cũng tạo ra một tường thuật sản phẩm thứ hai, với các tuyên bố và thuật ngữ có thể dần lệch khỏi trang chủ sản phẩm.

**Render index tài liệu tại tuyến gốc.** Index sẽ lặp lại điều hướng mà website đã có sẵn, và chèn thêm một lựa chọn phụ trước khi người đọc bắt đầu bài hướng dẫn thao tác đầu tiên.

**Sao chép nội dung bắt đầu nhanh vào từng tuyến gốc theo locale.** Cách này khiến hai tuyến công khai cùng duy trì một bài hướng dẫn, và đòi hỏi thêm một cơ chế đồng bộ khác.

**Dùng đường dẫn tuyệt đối của origin làm đích redirect.** Các đường dẫn như `/guide/quickstart` sẽ bỏ qua `DOCS_BASE`, và sẽ thất bại khi website tài liệu được host dưới một subpath của origin.

## Kết quả

Người đọc vào bất kỳ tuyến gốc theo locale nào cũng sẽ ngay lập tức tới bài hướng dẫn bắt đầu nhanh của locale đó. Website tài liệu từ bỏ trang chủ mang tính quảng bá, còn trang chủ sản phẩm tiếp tục là nơi duy nhất chứa định vị sản phẩm và tóm tắt tính năng. Tuyến gốc ổn định vẫn là một điểm vào hợp lệ, còn nội dung bắt đầu nhanh vẫn được duy trì bởi một nguồn chính thức duy nhất.
