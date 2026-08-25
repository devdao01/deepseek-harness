# Agent Note: Lược bỏ các invariant runtime khỏi cấu hình dsh khi phát hành

Status: implemented

[English](2026-08-03-omit-invariants-from-shipped-config.md) | Tiếng Việt

## Vấn đề

`@deepseek-ai/dsh-invariants` cùng các plugin đồng hành `./invariant` thuộc từng package là công cụ chẩn đoán phát triển (dev diagnostics) tùy chọn. Cấu hình TUI khi phát hành có mount dịch vụ này cùng bốn plugin đồng hành có trạng thái, trong khi cây cấu hình Web khi phát hành lại lược bỏ các mục này, khiến chi phí chẩn đoán và hành vi khi thất bại khác nhau giữa hai surface sản phẩm. Ngay cả khi ranh giới sản phẩm luôn bật vẫn chịu trách nhiệm cho việc kiểm chứng session và lịch sử bất biến, việc assertion về quan hệ thất bại vẫn có thể làm dừng một phiên chạy TUI thông thường.

## Quyết định

Cây cấu hình `dsh` được phát hành dưới `apps/cli/config/` không mount `@deepseek-ai/dsh-invariants`, cũng không mount bất kỳ plugin đồng hành `./invariant` nào thuộc các package. Do đó, package CLI không còn phụ thuộc trực tiếp vào dịch vụ invariant.

Hỗ trợ invariant vẫn khả dụng cho các test tập trung, package bundle mẫu (examples), bundle SDK được sinh ra, và các triển khai tùy chỉnh chọn tham gia chẩn đoán một cách tường minh. Việc kiểm chứng session, snapshot, đóng băng (freeze), và kiểm chứng tham chiếu sự kiện nguồn luôn được bật, không phụ thuộc vào dịch vụ tùy chọn nào, theo quy định của [quyết định về tính bất biến thuộc sở hữu phía nguồn](../architecture/2026-06-11-dev-invariants-over-deep-readonly.md).

Test dump cấu hình của CLI sau khi build sẽ kiểm tra cả hai surface được phát hành, và từ chối bất kỳ mục dịch vụ hay mục `@deepseek-ai/dsh-*/invariant` nào.

## Các phương án thay thế đã cân nhắc

- **Mount dịch vụ và đặt `enabled: false`.** Không được chấp nhận, vì cây cấu hình phát hành và phụ thuộc CLI vẫn sẽ mang theo công cụ chẩn đoán không lắp đặt bất kỳ kiểm tra nào.
- **Giữ nguyên phương án chỉ TUI mount.** Không được chấp nhận, vì hai surface được phát hành vẫn sẽ giữ chẩn đoán và hành vi thất bại khác nhau.
- **Loại bỏ hỗ trợ invariant khỏi repo.** Không được chấp nhận, vì các kiểm tra thuộc sở hữu package vẫn hữu ích trong test, ví dụ mẫu, SDK được sinh ra và các bundle phát triển tường minh; chỉ cấu hình sản phẩm mặc định là nằm ngoài phạm vi này.

## Hệ quả

- Các phiên chạy `dsh` TUI và Web thông thường không lắp đặt listener invariant hay trạng thái trace, và không thất bại vì `InvariantError`.
- Bundle phát triển và tùy chỉnh vẫn có thể dùng tường minh dịch vụ invariant và các plugin đồng hành.
- Đầu ra bundle của CLI sau khi build sẽ kiểm chứng rằng các mục này không tồn tại trong cấu hình phát hành của cả hai surface.
- Tính toàn vẹn session luôn bật vẫn được giữ nguyên không đổi.
