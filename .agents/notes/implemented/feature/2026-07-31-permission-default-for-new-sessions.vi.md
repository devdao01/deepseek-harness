# Agent Note: Giá trị mặc định Settings quyền hạn cho phiên mới

Status: implemented

[English](2026-07-31-permission-default-for-new-sessions.md) | 中文

## Vấn đề

Trang Settings "Chung" của Web hiển thị "Quyền hạn" như một control khung xương (skeleton) bị vô hiệu hóa, mặc dù `dsh-permission-presets` đã có sẵn bảng preset và đường chuyển đổi cho phiên hiện tại. Seam Settings có thể lưu trữ lâu dài các giá trị do plugin sở hữu, nhưng Web Settings API chỉ phơi ra namespace của các nhà cung cấp LLM có thể cấu hình. Quan trọng hơn, nếu coi tùy chọn của người dùng như một quyền hạn toàn cục có hiệu lực ngay lập tức, chính sách thực thi của các phiên hiện có sẽ thay đổi mà không nằm trong log bền vững của chúng.

## Quyết định

`dsh-permission-presets` sở hữu một namespace Settings `permission` chỉ có một trường `defaultPreset`. Giá trị nền của nó là `Config.defaultPreset`; khi bỏ qua cấu hình này, hệ thống dùng preset khớp với giá trị mặc định của sandbox và phê duyệt đã được tổ hợp. Enum của schema được suy ra từ bảng preset đã cấu hình, do đó Settings vừa có thể kiểm tra giá trị đã lưu, vừa để client Web khám phá được các lựa chọn thực tế của bản triển khai mà không cần định nghĩa lặp lại.

Dịch vụ đọc đồng bộ giá trị Settings hiện tại tại thời điểm `session/created`. Một phiên thực sự mới sẽ nhận ba sự kiện rõ ràng: `permission/preset`, `sandbox/mode`, và `approval/policy`. Các sự kiện này ghim cố định quyền hạn được chọn tại thời điểm tạo, do đó các thay đổi Settings sau này chỉ ảnh hưởng đến các phiên sau đó. Một phiên có seed hoặc chỉ khởi tạo một phần sẽ giữ lại các thiết lập hiệu lực của nó, chỉ bổ sung những sự kiện còn thiếu; khi khôi phục (resume) sẽ không bao giờ áp dụng giá trị mặc định mới nhất của người dùng. `Session` thậm chí còn đánh dấu seed constructor rõ ràng là rỗng bằng `session/end-seed`, do đó không thể nhầm log bền vững rỗng là một phiên mới.

Lệnh `/permission` hiện có và phép chiếu `permissions` vẫn là đường thao tác cho phiên hiện tại. Plugin trình duyệt giờ đóng góp hàng "Quyền hạn" vào `settings.general.item`, đọc enum động từ descriptor Settings đã được khử nhạy cảm, và chỉ ghi `defaultPreset` thông qua `settings.mutate` đã được kiểm tra revision. Hàng này bơm observable qua ô `hooks` của slot, thay vì gắn vào hook riêng của renderer; dịch vụ quyền hạn khi mount sẽ duyệt qua và ghim mọi phiên còn sống, do đó HMR (hot module replacement) không để sót phiên nào chưa được ghim. Các gói Settings "Chung" không có chủ sở hữu sẽ không đóng góp hàng placeholder nào.

ApiProxy đưa `permission` vào allowlist Web Settings một cách rõ ràng, bên ngoài namespace của các nhà cung cấp có thể cấu hình. Đây là quyết định biên cục bộ, không phải một cờ đăng ký chung hay mô hình truy cập `local-client`: việc đăng ký các namespace Settings khác vẫn không tự động phơi bày chúng ra. Thay đổi quyền hạn đến client qua `settings/document-updated` được chuyển tiếp ([sự kiện Remote được chuyển tiếp](../architecture/2026-08-10-remote-event-delivery.md)), không công bố cấu trúc mô hình (topology).

## Hệ quả

Thay đổi "Quyền hạn" trong Settings sẽ cập nhật ngay `settings.yaml` và bộ chọn, nhưng không thay đổi các phiên đang mở. Mỗi phiên sau đó đều có thể được tái tạo từ ba sự kiện quyền hạn đã ghim, kể cả khi người dùng thay đổi giá trị mặc định lần nữa hoặc tiến trình khởi động lại. Nếu giá trị mặc định sandbox và phê duyệt đã tổ hợp của bản triển khai không khớp với bất kỳ preset nào, thì `defaultPreset` phải được cấu hình rõ ràng.

Snapshot Web đã lắp ráp bao gồm bộ chọn "Quyền hạn" hoạt động đầy đủ. Kịch bản trình duyệt không có key sẽ ghi `read-only`, xác minh phiên `workspace-write` hiện có giữ nguyên, và xác minh phiên được tạo sau đó khởi động với bộ ba sự kiện read-only.

## Các phương án thay thế đã cân nhắc

**Áp dụng giá trị Settings ngay lập tức cho mọi phiên.** Không áp dụng, vì chính sách thực thi sẽ thay đổi mà không có sự kiện phiên nào, và việc replay cũng không thể tái tạo lại lệnh gọi công cụ trước đó đã dùng quyền hạn nào.

**Chỉ ghi lại `permission/preset` tại thời điểm tạo.** Không áp dụng, vì sandbox và phê duyệt là các thiết lập toàn phần do các component khác nhau sở hữu độc lập; ghim cả ba sự kiện giúp bên tiêu thụ chúng không phụ thuộc vào thay đổi giá trị mặc định tổ hợp trong tương lai.

**Phơi bày toàn bộ các đăng ký Settings, hoặc thêm một khai báo `local-client` chung.** Thay đổi lần này không áp dụng, vì điều đó sẽ mở rộng biên an toàn và khiến quy ước Settings vượt quá phạm vi của tùy chọn đơn lẻ được yêu cầu. Việc thêm rõ ràng `permission` vào allowlist là đủ; các namespace tương lai có thể tự quyết định có phơi bày hay không.

**Áp dụng giá trị mặc định mới nhất khi khôi phục phiên có seed.** Không áp dụng, vì thao tác khôi phục phải giữ lại chính sách thực thi hiệu lực trước đó của phiên; các sự kiện phiên bản cũ còn thiếu nên được bổ sung dựa trên chính sách đó.
