# Agent Note: Tìm kiếm nội dung phiên được giao qua `openAt: never`, theo kiểu opt-in

Status: implemented

[English](2026-08-13-session-content-search-opt-in.md) | Tiếng Việt

## Vấn đề

Bundle được giao trước đây mount nhà cung cấp truy vấn phiên SQLite ở trạng thái bật full-text index (`openAt: first-search`), nên mỗi triển khai mặc định đều mang theo một index FTS phái sinh, thanh bên Web cung cấp tìm kiếm nội dung. Việc một triển khai có cần index đó hay không — import node:sqlite của nó, việc đối chiếu nguồn cho mỗi lần tìm kiếm, và bộ lưu trữ phái sinh — là lựa chọn của chính triển khai, sản phẩm mặc định không nên giao kèm nó; công cụ tìm kiếm hướng tới mô hình đã sẵn là opt-in và chưa được mount (xem [quyết định không giao mặc định](../feature/2026-08-02-session-search-not-shipped-default.md)).

Việc tắt năng lực này bằng cách gỡ dòng plugin là không khả thi. `ApiProxyService` khai báo `sessionQuery` là injection bắt buộc, không có nhà cung cấp này thì toàn bộ Host API gateway vẫn ở trạng thái chưa nạp, Web GUI không khởi động được. Việc export log phiên truy vết hậu duệ sub-agent qua `ctx.sessionQuery.traceSession`, và việc fork sub-agent cũng phân giải Workspace của nó qua cùng nguồn lineage đó — cả hai đều cần một guard dịch vụ tùy chọn cộng thêm một nguồn lineage thay thế, phạm vi thay đổi tăng gấp khoảng ba lần, đồng thời khiến việc đọc chính xác biến mất ở mọi nơi.

## Quyết định

Tìm kiếm nội dung bị tắt cưỡng bức ở tầng nhà cung cấp. `openAt: 'never'` là giai đoạn mở thứ ba của `@deepseek-ai/dsh-session-query-sqlite`: `searchSessions` và `searchEvents` thất bại với mã có kiểu `SESSION_QUERY_SEARCH_DISABLED` trước khi bất kỳ request nào được chuẩn hóa, node:sqlite không bao giờ được import hay mở, cũng không chạy bất kỳ quan sát hay đối chiếu nguồn nào. Toàn bộ việc đọc chính xác, lọc và truy vết kế thừa trên `ctx.sessionQuery` vẫn khả dụng, nên việc export phiên, kế thừa Workspace khi fork, và đọc tiêu đề không bị ảnh hưởng.

`SESSION_QUERY_SEARCH_DISABLED` được thêm vào phân loại đóng `SessionQueryErrorCode`, `tool-session-query` ánh xạ nó ở ranh giới dịch vụ thành thông điệp an toàn với mô hình `session search is disabled in this deployment`.

Base bundle đặt `openAt: never` ở dòng `session-query-sqlite`, bản lặp lại của web bundle giữ nguyên giá trị đó; bật tìm kiếm nội dung chỉ cần một dòng override `openAt` ở lớp patch phía sau (`first-search` hoặc `startup`), thường đi kèm một `path` bền vững. Endpoint `session.search` của Host báo cáo lỗi nhà cung cấp theo đường lỗi hiện có, còn thanh bên Web giữ nguyên hạ cấp đã có: khớp tiêu đề/tên workspace cục bộ cộng với thông báo tìm kiếm nội dung không khả dụng. Test tương thích CLI giữ cố định dòng `openAt: never` khi giao, còn khung e2e Web vẫn giữ tìm kiếm nội dung bật — kịch bản phiên seed của nó điều hướng qua tìm kiếm nội dung, những lần chạy đó cũng là override ở tầng lắp ráp của đường opt-in.

## Phương án đã cân nhắc

- **Gỡ dòng plugin** (`disabled: true` trong base patch) — bị bác bỏ: injection bắt buộc `sessionQuery` của api-gateway sẽ khiến toàn bộ Host API vẫn chưa nạp, còn việc đổi injection đó thành tùy chọn cần thêm guard cộng với đường lineage dự phòng đi qua header ở cả export phiên và phân giải fork.
- **Tắt ở tầng consumer** (endpoint `session.search` của Host hoặc thanh bên) — bị bác bỏ: việc tắt phải được thực hiện tại nơi quyết định; công cụ mô hình opt-in hoặc bất kỳ consumer nào khác vẫn sẽ chạm tới index.
- **Thêm một công tắc boolean độc lập bên cạnh `openAt`** — bị bác bỏ: giai đoạn mở đã sở hữu trục "SQLite khởi động khi nào"; `never` mở rộng cùng trục đó, chứ không thêm một núm vặn thứ hai có thể mâu thuẫn với nó.

## Kết quả

- Triển khai mặc định không chạy bất kỳ index phái sinh nào: không có import node:sqlite hay cảnh báo khởi động SQLite thử nghiệm, không có công việc đối chiếu, không có cơ sở dữ liệu phái sinh trên đĩa. Tìm kiếm ở thanh bên chỉ khớp tiêu đề phiên và tên workspace.
- Thất bại tìm kiếm ở trạng thái mặc định có kiểu và ổn định, phía gọi có thể phân biệt lựa chọn triển khai với lỗi index (`SESSION_QUERY_INDEX_FAILED`).
- Bật lại tìm kiếm nội dung là cấu hình theo từng triển khai chứ không phải thay đổi mã, và khôi phục nguyên trạng hành vi FTS đầy đủ.
- Tổ hợp mount công cụ tìm kiếm nhưng không override `openAt` sẽ nhận được thông điệp đã bị tắt an toàn với mô hình ở mỗi lần gọi tìm kiếm; bật công cụ nghĩa là phải bật index cùng lúc.
