# Agent Note: Soạn preset chỉ bằng sao chép, và lối vào tới file preset

Status: implemented

[English](2026-08-08-copy-only-preset-authoring.md) | Tiếng Việt

## Vấn đề

Trang cài đặt agent-preset đi kèm một trình soạn thảo YAML trên web: `agentPreset.write` nhận văn bản tổ hợp tùy ý, trang chỉ là một textarea không có autocomplete, highlight hay diff, và việc kiểm tra hình thức phụ thuộc vào chính `entryListSchema` của Loader — phương ngữ này chứa `!!js`, nên "văn bản đã qua kiểm tra hình thức" vẫn là mã tùy ý ở lần mount kế tiếp. Nó yếu khi làm trình soạn thảo, rộng khi làm năng lực, và còn là nguồn gốc của tình trạng tranh chấp "trình soạn thảo vs danh sách" mà phân vùng này buộc phải phòng thủ.

## Quyết định

Việc soạn thảo chuyển sang sao chép ở phía host, và file chính là trình soạn thảo. `agentPreset.write` trở thành `agentPreset.copy { from, agentPreset, name? }`: hai id được host phân giải theo thư mục gốc của chính nó cộng thêm một tên hiển thị tùy chọn, `cp` toàn bộ thư mục (giải tham chiếu symlink, siết quyền về chỉ chủ sở hữu và giữ lại bit thực thi của chủ sở hữu), metadata được ghi lại để giữ mô tả nguồn nhưng tuyệt đối không giữ tên và `order` của nó. Trang trở thành: trình xem chỉ đọc cho các tổ hợp đi kèm, hộp thoại sao chép làm lối tạo duy nhất (không còn "preset mới" trống — viết tay YAML từ con số không không phải việc con người làm), thao tác xóa cho các dòng tùy chỉnh, và thao tác định vị dẫn tới file — `agentPreset.openDocument { agentPreset }` phân giải thư mục ở phía host rồi mở bằng ứng dụng gốc, còn khi triển khai không có desktop thì trả về `{ opened: false, path }` để dòng đó hiển thị dưới dạng văn bản (`hasDocument` trên `list`; ở những nền tảng mà dò tìm `canOpenNativePath` bị sai lệch thì cấu hình `nativeOpen` của gateway sẽ ghim cứng, ví dụ e2e và container).

## Hệ quả

- Cả hai chiều của việc soạn thảo đều không còn văn bản tổ hợp hay đường dẫn đi xuyên qua tầng truyền tải của trình duyệt; các mối lo về `entryListSchema`/`!!js` tan biến cùng với chính `assertComposition` (đã bị xóa). Tập đặc quyền hiện là `read`/`copy`/`openDocument`/`remove` — không cái nào nhận mục tiêu hệ thống file.
- Sau khi bỏ trình soạn thảo, sửa tay `agent.cordis.yml` trở thành cách duy nhất để chỉnh tổ hợp, nên tầng mount thường trú bổ sung thế hệ được khóa theo stamp: `ensureStanding` so sánh mtime+kích thước của file để mở thế hệ tiếp theo cho các session sau ([note về mount thường trú](../architecture/2026-08-08-per-preset-standing-mounts.md), đã cập nhật tại chỗ). Không có nó, file đã sửa phải chờ tiến trình khởi động lại mới có hiệu lực.
- Bản sao là ảnh chụp đầy đủ, nên sẽ trôi dạt khi nguồn đi kèm được nâng cấp — chấp nhận điều đó; tầng preset không có ngữ nghĩa patch (đó là năng lực của `cordis.patch.yml` ở tầng bundle), và chính tập đi kèm cũng trả cùng cái giá "đọc trọn bộ tổ hợp từ một file" (`cordis`/`code` chính là bản sao đầy đủ của `standard`).
- `read` đã bỏ `writable` (không còn trình soạn thảo để kiểm soát), và thư mục có sẵn tuyệt đối không bị mở (`openDocument` từ chối mức tin cậy khác `user`, giống như `remove`): thư mục cài đặt sẽ bị ghi đè khi nâng cấp, nên trỏ trình soạn thảo vào đó chẳng khác nào mời gọi những chỉnh sửa sẽ bị nâng cấp âm thầm vứt bỏ.

## Chi tiết hiện thực then chốt

- **Việc từ chối mục tiêu sao chép được tách thành hai lần kiểm tra một cách có chủ ý.** Kiểm tra roster từ chối id do bất kỳ thư mục gốc nào cung cấp — thư mục người dùng trùng tên với preset đi kèm sẽ bị che khuất, và "tạo" chỉ để lại một file không bao giờ được liệt kê; kiểm tra trên đĩa (`PresetExistsError` trước khi `cp`, với `errorOnExist` làm lưới an toàn cho tranh chấp) từ chối thư mục chiếm tên nhưng không phải preset, thứ mà discovery không nhìn thấy.
- **Đường dẫn được hiển thị là tiết lộ theo chiều phản hồi, và bị ghim vào loopback.** Bất biến "không payload trình duyệt nào có thể chọn một mục tiêu hệ thống file tùy ý" nói về chiều yêu cầu; hiển thị thư mục đã phân giải cho người dùng loopback chính là mức hạ cấp mà giải pháp yêu cầu. Nó tuyệt đối không đi kèm `list` phi đặc quyền.
- **Lane e2e ghim cứng `nativeOpen: false`** (`agent-preset-authoring.overlay.yml`) — vừa để golden render cùng một nhánh trên máy dev macOS lẫn CI Linux headless, vừa để lần chạy test không bao giờ bật lên trình quản lý file thật. Thư mục được tiết lộ sẽ do chính lane token hóa thành `{{presetRoot}}`, bởi `normalizeAria` chỉ biết cwd của workspace.

## Các phương án đã cân nhắc

Giữ write nhưng đổi sang trình soạn thảo tốt hơn (CodeMirror v.v.): trên tầng truyền tải vẫn là năng lực tùy ý, vẫn là nguồn tranh chấp, và vẫn không bằng trình soạn thảo của chính người dùng. Bản sao có ngữ nghĩa patch ("standard cộng thêm chút diff này"): dưới mặt bundle không tồn tại tầng như vậy, và preset đi kèm của chính kho mã cũng cố ý chọn bản sao đầy đủ. Phía trình duyệt lấy đường dẫn trả về rồi gọi `host.openPath`: một khi đường dẫn trở thành tham số yêu cầu thì bất biến "không thể chọn mục tiêu tùy ý" trong README sẽ bị phá vỡ.
