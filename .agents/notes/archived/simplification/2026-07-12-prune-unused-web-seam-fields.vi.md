# Agent Note: Cắt tỉa các field không dùng trong seam web

Status: implemented

Archived: 2026-07-26

[English](2026-07-12-prune-unused-web-seam-fields.md) | 中文

## Vấn đề

Capability web mang theo giá trị request/result/status mà mọi hiện thực đã phát hành đều điền vào, nhưng không có bên tiêu thụ sản xuất nào đọc chúng. `WebSearchResult.providerId`, `query` và `WebFetchResult.providerId` là các trường echo lại kết quả; `tool-web` chỉ định dạng content/sources/truncation hoặc URL/status/body/truncation cuối cùng, không có runtime nào khác đọc các field này. Provider search trả về `WebProviderStatus.reason`, nhưng kiểm tra khả dụng chỉ nhìn vào `available`, và cố ý xuất ra một thông điệp chẩn đoán không khả dụng chung chung.

`WebFetchRequest.timeoutMs` cũng chưa từng được bên gọi sản xuất nào đặt. `tool-web` chỉ cung cấp URL, dùng timeout do tool định nghĩa cộng `exec.signal` làm deadline của bên gọi, và dựa vào giá trị mặc định cấu hình của provider local làm phương án dự phòng. Việc override theo từng request không dùng tới này buộc `web-fetch-local` phải phơi bày `maxTimeoutMs`, clamp hai nguồn timeout, và viết tài liệu cùng test cho quy tắc ưu tiên mà không có đường sản phẩm nào chọn tới. `WebExecContext` là một lớp bọc một-field khác: mỗi bên gọi gán `{ signal }`, mỗi provider lập tức unwrap `exec?.signal`; không có field điều khiển thực thi thứ hai nào tồn tại.

## Quyết định

Seam web loại bỏ echo `providerId` trong kết quả search/fetch và echo `query` của search; bản thân bên gọi đã giữ thông tin request và lựa chọn provider. Provider phơi bày tính khả dụng bằng phương thức trả về boolean. Request fetch không còn timeout theo từng request hay clamp `maxTimeoutMs`; provider local giữ timeout mặc định có thể cấu hình của nó, tool giữ deadline riêng của nó. Phương thức provider nhận trực tiếp một `AbortSignal` tùy chọn, thay vì lớp bọc `WebExecContext` một field.

Mọi hiện thực web và tool hướng tới model dùng hợp đồng tinh gọn hơn. Việc tách package interface/implementation/consumer, lựa chọn provider, trích dẫn nguồn, dữ liệu URL/status cuối cùng, báo cáo truncation và giới hạn an toàn vẫn giữ nguyên không đổi.

## Các phương án thay thế đã cân nhắc

**Giữ kết quả tự mô tả, deadline theo từng request và đối tượng execution context có thể mở rộng.** Echo kết quả có thể hỗ trợ telemetry tổng quát, timeout cấp request có thể hỗ trợ bên gọi lập trình đáng tin cậy, còn lớp bọc để dành chỗ cho field điều khiển tương lai. Nhưng hiện không tồn tại bên tiêu thụ hay field thứ hai như vậy; việc mang theo định danh trùng lặp, một chính sách deadline thứ hai, và pipeline bọc/mở gói trong mỗi provider khiến hợp đồng hiện tại khó hiện thực và giải thích hơn. Nếu telemetry hoặc kiểm soát ngân sách theo từng lời gọi xuất hiện, lúc đó nên định nghĩa deadline nào được ưu tiên, quan sát định danh provider ở đâu, và liệu nhiều field điều khiển có đủ để chứng minh cần một đối tượng context hay không.

## Hệ quả

Mỗi field request/result web còn lại đều hoặc được mã sản xuất tiêu thụ, hoặc cần thiết để thực thi request của provider. Output search/fetch hiển thị cho tool, fallback provider, hành vi hủy, phương án dự phòng timeout có thể cấu hình, truncation và trích dẫn vẫn được bao phủ đầy đủ, không cần nhánh ưu tiên timeout cấp request hay lớp bọc execution context.

Bên gọi lập trình ở giai đoạn tiền phát hành mất echo nguồn kết quả và deadline fetch theo từng request. Provider vẫn có timeout có thể cấu hình cấp triển khai và tôn trọng tín hiệu hủy, nên lần tinh gọn này loại bỏ khả năng cấu hình, chứ không phải ranh giới an toàn.
