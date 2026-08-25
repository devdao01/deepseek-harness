# Phân tích sự cố (postmortem) 0002: Công cụ chụp nhanh hệ thống tệp bị vô hiệu hóa vĩnh viễn

[English](0002-js-expression-disabled-filesystem-tools.md) | Tiếng Việt

Trạng thái: đã giải quyết

## Tóm tắt

Ví dụ ACP (Agent Client Protocol) cố gắng bật plugin hệ thống tệp có điều kiện bằng `disabled: !!js ...`, nhưng Cordis chỉ đánh giá biểu thức JavaScript bên trong `config` của plugin. Đối tượng biểu thức gốc là truthy, nên ngăn xếp hệ thống tệp luôn ở trạng thái vô hiệu hóa. Việc refresh snapshot sau đó đã chấp nhận kết quả `UNKNOWN_TOOL` như đầu ra mong đợi mới. Bản sửa chuyển sang dùng overlay hệ thống tệp tường minh, và bổ sung guard kiểm tra cấu hình tĩnh cùng guard kiểm tra kết quả snapshot.

## Tổng quan

Tổ hợp ACP mặc định cố ý chỉ bật bash, vì sandbox của nó không thể ràng buộc provider hệ thống tệp trong tiến trình. Kịch bản chụp nhanh hệ thống tệp vẫn cần `read`, `write` và `edit`, do đó các plugin này được đặt trong `cordis.yml` mặc định, kèm một biểu thức `disabled` với chủ đích chỉ bật chúng khi khởi động full-permission và ở chế độ snapshot.

Cordis Include phân giải mỗi scalar `!!js` thành một đối tượng biểu thức. Loader nội suy đệ quy vào `config` của plugin, nhưng đọc trực tiếp các metadata cấu hình khác như `disabled`. Do đó mỗi mục cấu hình hệ thống tệp nhận được một đối tượng truthy, và luôn ở trạng thái vô hiệu hóa trong mọi chế độ.

## Ảnh hưởng

Bảy kịch bản hệ thống tệp và một kịch bản chỉnh sửa workspace hỗn hợp đã gọi tới một công cụ không tồn tại trong registry. Log phiên có cấu trúc mang theo `ToolNotFoundError` (mã `UNKNOWN_TOOL`), stdout render ra thẻ công cụ thất bại thông dụng. Bộ snapshot vẫn pass, vì log phiên có cấu trúc và thẻ công cụ thất bại thông dụng render trên stdout đều khớp với fixture (dữ liệu tiền đặt cho test) đã được refresh; điều nó chứng minh là tính tất định của việc replay một lỗi hồi quy, chứ không phải tính đúng đắn của hành vi hệ thống tệp.

Chế độ mặc định bị giới hạn thực tế đang chạy không hề nhận được quyền truy cập hệ thống tệp ngoài ý muốn. Việc sửa vội vàng trực tiếp phần nội suy sẽ mang lại đúng rủi ro này: preset quyền cập nhật sandbox bash và trạng thái phê duyệt tại runtime, nhưng không thể mount, unmount, hay giới hạn ngăn xếp hệ thống tệp.

## Dòng thời gian

- PR (Pull Request) #261 hợp nhất tổ hợp ACP và refresh snapshot hệ thống tệp, đồng thời đưa vào mục cấu hình hệ thống tệp có điều kiện.
- Mọi unit test, độ phủ, snapshot, tài liệu, build và kiểm tra hygiene đều pass.
- Việc rà soát đầu ra hệ thống tệp kỳ vọng sau khi refresh phát hiện thẻ thất bại thông dụng và kết quả `UNKNOWN_TOOL` có cấu trúc.
- Một lần khởi động Loader thực đã xác nhận: mỗi giá trị `disabled` vẫn là đối tượng biểu thức, mỗi fiber hệ thống tệp đều không được tạo.

## Nguyên nhân gốc

Việc triển khai đã giả định rằng `!!js` áp dụng cho toàn bộ mục cấu hình của Loader. Thực tế chỉ có `entry.options.config` dùng nó: `Entry._resolveConfig()` nội suy trường này, còn `Entry.disabled` kiểm tra trực tiếp `entry.options.disabled`, không qua nội suy. Nhãn YAML hợp lệ về cú pháp, nên quá trình nạp không sinh ra bất kỳ chẩn đoán nào.

Khung snapshot coi bất kỳ transcript (bản ghi văn bản) tất định nào cũng là hành vi hợp lệ. Header pin đã xác minh schema công cụ đã tổ hợp, nhưng kịch bản hệ thống tệp dùng chung pin từ tổ hợp mặc định, nên không tự chứng minh độc lập rằng các công cụ nó cần đã được đăng ký. Việc refresh đã ghi đè stdout và log phiên kỳ vọng trước khi có bất kỳ khẳng định ngữ nghĩa nào từ chối công cụ bị thiếu.

## Các biện pháp bảo vệ đã bổ sung

- Kịch bản hệ thống tệp khởi động `fs.cordis.yml`: một overlay full-permission cố định, tường minh, kèm cấu hình replay tương ứng và một lớp request-header độc lập.
- [`AGENTS.md`](../../AGENTS.md) và [nhập môn Cordis](../cordis-primer.md#loader-configuration) nêu rõ `!!js` chỉ có hiệu lực bên trong `config` của plugin, tổ hợp có điều kiện nên dùng overlay.
- `verify-cordis-config` phân tích YAML Cordis trong repo, từ chối node biểu thức trong metadata mục cấu hình của Loader (bao gồm cả include patch và mục cấu hình được chèn vào).
- `dsh-acp-snapshot` từ chối kết quả `UNKNOWN_TOOL` có cấu trúc trong cả lần chạy hoàn toàn mới lẫn fixture phiên đã commit, ngăn nó được commit làm đầu ra kỳ vọng.

## Bài học

- Một giá trị cấu hình được chấp nhận về mặt cú pháp không nhất thiết được đánh giá tại vị trí đó; cần ghi lại và xác minh rõ trường nào thực sự được nội suy.
- Việc refresh snapshot là quá trình sản xuất fixture, không phải quá trình rà soát tính đúng đắn. Những kết quả về mặt ngữ nghĩa là không thể xảy ra, ví dụ thiếu công cụ đã đăng ký, cần có khẳng định độc lập với đầu ra kỳ vọng.
- Kiểm soát quyền chỉ nên mô tả đúng phạm vi năng lực mà nó thực sự quản lý. Quyền truy cập hệ thống tệp tại thời điểm tổ hợp không thể an toàn đi theo preset bash-only tại runtime.
