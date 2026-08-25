# Agent Note: Mặt settings do plugin tự sở hữu

Status: implemented

[English](2026-08-12-plugin-owned-settings-surface.md) | Tiếng Việt

## Problem

Plugin đăng ký namespace settings không thể tới được trang cấu hình trên trình duyệt, và hai cánh cửa chặn điều đó đều nằm trong repo này.

`packages/host/apiproxy` giữ hai danh sách namespace được hardcode. `settings.describe` dùng chúng để lọc phản hồi, và mỗi lần ghi cũng đối chiếu trước với chúng, nên một namespace ngoài danh sách, dù chủ sở hữu của nó đã đăng ký, vẫn chỉ nhận được `settings-not-exposed`. Vậy nên thêm một plugin vào trang cấu hình nghĩa là phải sửa một package mà tác giả plugin không sở hữu.

Phân khu cấu hình plugin render danh sách thẻ đăng ký vào `settings.plugin.item`, không có thứ tự. Thẻ mang theo `id` mờ, không bao giờ là namespace mà nó chỉnh sửa, nên phân khu không thể biết những namespace nào đã được phục vụ đã có chủ. Bất kỳ câu hỏi nào kiểu "namespace này do ai render" đều không thể trả lời được từ sổ sách mà phân khu nhìn thấy.

Gộp cả hai lại, plugin do người dùng tự viết chỉ có thể được cấu hình bằng cách sửa tay `settings.yaml`. [Note cấu hình plugin trên web](../feature/2026-08-10-web-plugin-configuration.md) ghi lại whitelist là chủ ý, [note ranh giới mặt cấu hình](2026-07-30-config-plane-boundaries.md) thì gắn "có thể cấu hình trên Web" với tư cách thành viên của danh mục nhà cung cấp có thể cấu hình. Hai kết luận đó lại chính là thứ chặn đường những tác giả plugin mà seam chung này vốn phải phục vụ.

## Decision

**Đăng ký nghĩa là được phơi bày.** Mỗi namespace mà `ctx.settings.describe()` của api-proxy trả về đều không bị chặn khi ghi. `WEB_SETTINGS_NAMESPACES`, `PRODUCT_SETTINGS_NAMESPACES`, hợp của chúng với `ctx.llm.listConfigurableProviders()`, và mã lỗi `settings-not-exposed` — tất cả bị xóa. Bất kỳ tên nào mà việc đăng ký không trả lời — chưa xác định, hoặc sai định dạng nên không thể định vị tới đăng ký — đều gộp thành `settings-rejected` của chính seam, nên proxy không đóng góp ranh giới, cũng không đóng góp từ vựng riêng của nó.

**Settings seam không đổi.** Client nào được đọc namespace nào, trang nào render nó, đều là sự thật về Consumer; nếu Service Definition mang theo một trong hai điều đó thì tương đương với việc để một Consumer quyết định hợp đồng của nó. `SettingsRegisterOptions` không thêm trường nào.

**`settings.plugin.item` dùng namespace settings làm khóa.** Slot đó đổi từ `list` sang `keyed`, khóa chính là namespace mà thẻ đó chỉnh sửa, theo tiền lệ của `tool.call.toolview` — mỗi plugin công cụ đăng ký renderer của mình trên khóa là tên công cụ. Thẻ khai báo `key`, không còn khai báo `id`/`order`. Slot này do tab `configurable` của phân khu "Plugin" khai báo, danh sách thẻ thuộc về nó.

**Tab điều phối dựa trên các namespace được phục vụ.** Nó đọc `settings.describe` một lần, đăng ký nhận thông báo mất hiệu lực của tài liệu settings và reset kết nối, và điều phối một khóa cho mỗi namespace được phục vụ. Kết quả render là giao của hai sổ sách — các namespace mà đăng ký Host plugin còn tồn tại, và các thẻ đã đăng ký trên các khóa đó — do controller của tab tính từ sổ sách slot (`ctx.slots.entries`, `ctx.slots.subscribe`) và phản hồi giao thức.

Dùng namespace làm khóa khiến chính "sự vắng mặt" trở thành tín hiệu, và đây chính là lý do nó xóa được phần sổ sách mà hình thái cũ cần. Những namespace thuộc về giao diện khác (`ui-theme`, `permission`, `llm-*`, `agent-presets`) không có thẻ trên khóa của chúng, nên không render gì, và không cần khai báo gì ở bất kỳ đâu. Thẻ mà namespace không được triển khai hiện tại phục vụ sẽ hoàn toàn không được điều phối, điều này đồng thời sửa luôn lỗi trạng thái rỗng cũ: tab đếm số thẻ đã đăng ký, bao gồm cả những thẻ không render gì, nên một triển khai không phơi bày gì thấy một danh sách rỗng, chứ không phải dòng chữ trạng thái rỗng của nó.

**Không render bất kỳ form nào chưa được giao cho nó.** Tab không cung cấp thẻ dự phòng. Nửa trình duyệt của plugin sở hữu trọn vẹn thẻ của riêng nó — giao diện, control và văn bản — và đây chính là thứ mà tùy chọn `fallback` của slot sẽ thay bằng một form được render ngược từ schema.

## Whitelist thực sự bảo vệ điều gì

Cánh cửa này thực sự chặn một thứ, và note này ghi lại trung thực, vì quyết định này phải đứng vững ngay cả ở phiên bản chính xác: các namespace đã đăng ký nhưng không nằm trong danh sách, giá trị resolved, `base` và `user` của chúng hoàn toàn không tới được trình duyệt. Trang danh mục plugin không thể thay thế nó — `PluginInventoryEntry` mang theo `entryId`, `moduleName`, `enabled` và `fiberPhase`, dòng "configuration" của nó render nhãn bật/tắt, không bao giờ là bất kỳ giá trị đã lưu nào.

Cánh cửa này không phải là loại ranh giới mà vị trí của nó gợi ý. Mỗi phương thức `settings.*` đều nằm trong `PRIVILEGED_METHODS` (`packages/client/connection`), request không phải loopback hoặc cross-origin bị từ chối với 403 trước khi tới được đoạn mã này; trường `role('secret')` bị bóc bỏ có cấu trúc ở mọi tầng của mọi phản hồi; và mặt này chỉnh sửa chính là `settings.yaml` của người dùng, cùng trang cấu hình đó còn cung cấp lối mở nó ra. Cái nó không chặn được khi ghi chính là những thứ có trọng lượng: `permission` (có thể nới lỏng preset phê duyệt) và `agent-presets` (quyết định một phiên mount gì) vốn đã được phục vụ.

Vì vậy, mặt phơi bày thực sự mới trong repo này do thay đổi này thêm vào là một namespace: `agent-default-model` — hai trường của nó chỉ định một nhà cung cấp và một mô hình, và không có nửa trình duyệt nào render nó. Trong tương lai, nếu giá trị của một namespace nào đó thực sự không nên vượt qua giao thức, hãy để `role('secret')` trả lời theo từng trường: chi tiết hơn nhiều so với việc bật/tắt cả namespace, và điều này đã đang hoạt động.

## Alternatives considered

**Thêm khai báo vào `settings.register()`** (`client: { surface: 'plugin-config' | 'custom', title, description }`), đây cũng là hướng đã định sẵn mà comment `WEB_SETTINGS_NAMESPACES` bị xóa từng chỉ đích danh. Nó khiến đăng ký mặc định không vượt qua ranh giới truyền tải, và cho phép tác giả plugin tự phục vụ chỉ với một dòng code. Bị bác bỏ vì `surface` là từ vựng của trang trình duyệt, còn `title`/`description` thuộc về trình bày: một khi Service Definition mang theo chúng, nó trở thành một seam bị định hình bởi một Consumer đơn lẻ. Giá trị của tính chất fail-closed của nó cũng không cao như đọc qua tưởng — xem phần "Whitelist thực sự bảo vệ điều gì" ở trên.

**Lập thêm một danh mục phơi bày riêng**, plugin đăng ký vào danh mục tự có này ngoài việc đăng ký settings, tức là tổng quát hóa `ctx.llm.registerConfigurableProviders()`. Bị bác bỏ vì nó tách một sự thật thành hai chỗ đăng ký có thể lệch nhau: đăng ký namespace nhưng quên mục danh mục sẽ tạo ra một phân khu mà không ai chỉnh sửa được, và không có cổng chặn nào nhìn thấy lỗi này.

**Thêm một trường `Config` kiểu deny-list cho api-proxy**, để triển khai có thể giữ lại một namespace. Bị bác bỏ vì không có consumer nào: mọi namespace hiện đã đăng ký đều là thứ người dùng có thể chỉnh sửa, còn các trường thực sự nhạy cảm được `role('secret')` trả lời theo từng trường, đó là công cụ chi tiết hơn. Một công tắc bật/tắt cả namespace được phát minh ra trước khi có use case đầu tiên chính là loại lựa chọn đầu cơ mà quy tắc package cấm.

**Đặt thẻ chung dựa trên schema làm `fallback` của slot này**, để plugin không có nửa trình duyệt cũng có thể lấy được một form từ `schema.toJSON()` (schemastery vốn mang theo `description`, `role`, `min`/`max`/`step` và tuần tự hóa chúng). Bị bác bỏ vì client plugin được nạp lúc chạy theo các entry Loader đã mount, tác giả plugin hoàn toàn có thể giao một thẻ thật; còn form render ngược đã bị phán quyết là kém hơn thẻ viết tay ở trang mô hình lần đó. Nếu phán quyết đó thay đổi trong tương lai, tùy chọn `fallback` có thể được bật mà không cần thay đổi hợp đồng.

**Client đăng ký một registry công nhận quyền sở hữu**, để mỗi giao diện sở hữu một namespace khai báo nó, để thẻ chung biết namespace nào đã có người quản lý. Bị bác bỏ cùng với thẻ chung: điều phối theo khóa vốn đã khiến khóa vô chủ không render gì, registry này chỉ nói lại điều mà sổ sách slot đã nói.

**Giữ slot dạng list, chỉ thêm trường namespace vào options của nó.** Bị bác bỏ vì phân khu vẫn liệt kê entry chứ không phải namespace, lỗi trạng thái rỗng vẫn còn, và thẻ của plugin chưa lắp ráp vẫn phải tự kìm lại.

## Consequences

Plugin phân phối ngoài repo này không cần sửa gì ở đây để có thể cấu hình được từ trang settings: nó đăng ký namespace của mình trên Host, đăng ký thẻ trên khóa đó trong trình duyệt, và phân khu ghép hai bên lại. Thẻ giờ xuất hiện theo thứ tự đăng ký thẻ, không còn phụ thuộc vào `order` chỉ định tay. Điều này ổn định đối với những thẻ do chính package này đăng ký — chúng cài từ cùng một generator; nhưng **không** ổn định đối với thẻ **liên plugin**: thứ tự apply giữa các package không bị ràng buộc (`packages/client/AGENTS.md`), nên nhiều thẻ ngoài vẫn có thể bị sắp lại thứ tự giữa các lần khởi động khác nhau. Để định thứ tự cho chúng cần một khóa tường minh, có thể sắp xếp ở cấp section, mà đăng ký keyed hôm nay chưa mang theo.

Những điều sau đây bị hoãn lại, và đều lớn hơn thay đổi lần này: bộ khử nhạy cảm trả nguyên `role('secret')` chỉ tới được qua union, intersection hoặc transform (`TODO(settings-wire-redaction)` của chính nó), còn `schema.toJSON()` sẽ mang theo giá trị mặc định của secret. Khoảng trống này có từ trước thay đổi lần này, nhưng việc phục vụ mọi namespace đã đăng ký mở rộng phạm vi ảnh hưởng của nó từ schema đã được kiểm toán trong repo này ra bất kỳ schema bên thứ ba nào, nên giao thức nên từ chối phục vụ những namespace mà nó không thể chứng minh là khử nhạy cảm an toàn. Cũng bị hoãn lại: kiểm thử ở tầng lắp ráp cho năng lực đầu bảng của lần này — dùng overlay mount một plugin fixture (nửa Host đăng ký namespace, nửa `dsh.client` đăng ký thẻ) và khẳng định đầu-cuối. Độ bao phủ hiện tại lần lượt chứng minh hai nửa; việc đầu ra thẻ đã phát hành không đổi thì không chứng minh được đường đi mới.

Việc phân khu thêm một lần đọc giao thức là một lượt `settings.describe`, song song với các lần đọc theo từng scope mà thẻ đã có sẵn. Thông báo mất hiệu lực của nó không chính xác theo một hướng: giao thức thông báo commit tài liệu và reset kết nối, chứ không phải hành vi đăng ký, nên namespace được đăng ký sau khi phân khu đã đọc sẽ phải chờ đến lần commit hoặc kết nối lại tiếp theo mới được thêm vào.

Vẫn còn hai điểm ma sát cho tác giả ngoài repo, cả hai đều được ghi trong README của phân khu. Nửa trình duyệt phải là package `dsh.client` được build theo định dạng lazy-CJS factory theo module system của client, và preset `clientBundle` sản sinh ra nó nằm ở `packages/client/tsdown.client.ts`, không phải một package đã phát hành. Cổng thuần khiết bundle cấm import theo giá trị giao diện thẻ và mô hình form nháp của package này, nên loại thẻ như vậy phải tự cài đặt lại việc lưu nháp và đặt rào revision. Muốn chia sẻ chúng, hoặc phải phát hành preset đó, hoặc khai báo một lớp sub-slot bên trong thẻ để phân khu cung cấp giao diện; cả hai đều chưa được xây dựng.
