# dsh-client-ui-agent-preset

[English](README.md) | Tiếng Việt

Các bề mặt (surface) riêng biệt của agent preset: một dòng trong General settings để chọn [preset](../../preset/agent-presets/README.md) mà session mới sẽ được tổ hợp theo; một chip trên giao diện tạo session mới để chọn preset cho **session tiếp theo**; một nhãn chỉ đọc bên cạnh tiêu đề session; và một phần settings để quản lý danh sách — sao chép, xóa, đặt mặc định, và lối vào tệp preset của chính nó.

## Vì sao đây là tùy chọn "session mới"

Preset của một session được cố định tại thời điểm tạo — host từ chối tiếp quản một session đã tồn tại với preset khác, vì lịch sử của session đó được tạo ra dưới công cụ của preset ban đầu. Do đó dòng này không thể chuyển đổi theo thời gian thực, và nó nói rõ điều đó: thay đổi chỉ có hiệu lực cho các session mở sau này, còn session đang chạy giữ nguyên tổ hợp lúc bắt đầu.

## Chip session mới

Bề mặt thứ hai, nằm trên giao diện tạo session mới, cạnh bộ chọn workspace. Nó nằm ở đây thay vì composer, vì đây mới là nơi lựa chọn còn có giá trị: một control phần lớn thời gian bị vô hiệu hóa, thuộc về giao diện mà nó vẫn còn khả dụng.

Chip mở với giá trị mặc định của triển khai, và lựa chọn của nó là **tạm giữ (staged)** — giao diện này tồn tại trước cả session mà nó sẽ áp dụng lên. Giá trị tạm giữ sẽ đến session đó khi một session trở thành session hiện tại và vẫn còn trống; điều này bao trùm cả session mới do kết nối workspace tạo ra lẫn session trống mà nó tái sử dụng, còn nếu chỉ dựa vào `sessions.create` thì sẽ bỏ lỡ trường hợp sau. Giá trị tạm giữ bị xóa ngay sau khi dùng, nên session mới tiếp theo lại mở với giá trị mặc định — hoàn toàn giống bộ chọn workspace bên cạnh nó.

Session đã bắt đầu bị từ chối thẳng thay vì xếp hàng: host trả về `agent-preset-locked`, giá trị tạm giữ bị bỏ theo, thay vì chờ một session sẽ không bao giờ chấp nhận nó.

## Nhãn bên cạnh tiêu đề session

Bề mặt thứ ba, nằm cạnh tiêu đề session: preset mà **session này** đang chạy, hiển thị dưới dạng trang trí tĩnh. Đặt một control ở đó tương đương với việc hứa hẹn một thao tác chuyển đổi mà host chắc chắn sẽ từ chối. Nó đọc preset từ chính bản tóm tắt của session, và giải quyết tên hiển thị trên cùng danh sách mà dòng General đọc. Sự kiện owner được chuyển tiếp `agent-preset/selected` sẽ gộp việc chuyển đổi session trống đã commit vào bản tóm tắt dùng chung này trên mỗi tab; tab khởi xướng có thể đã dùng biên nhận RPC, và việc gộp là idempotent.

## Nó đọc và ghi những gì

Tùy chọn và giá trị mặc định hiện tại đều đến từ cùng một lần gọi `agentPreset.list`. Bản thân danh sách đã báo cáo "session không chọn tường minh sẽ nhận id nào", do đó dòng này không cần soi vào settings schema; đích ghi là trường `default` trong namespace settings `agent-presets`, chính là trường host giải quyết khi tạo.

Preset tự tạo cục bộ có quyền chính xác bằng plugin mà nó tham chiếu, do đó danh sách sẽ gắn nhãn dòng `user`, thay vì hiển thị mọi preset như thể nó đi kèm và đã được kiểm duyệt.

Tệp preset cung cấp một bộ `name` và `description` chưa quốc tế hóa, Web dùng chúng cho mọi dòng `user` và dòng `system` không xác định. Với bốn id đi kèm (`standard`, `code`, `minimal` và `cordis`), chỉ khi danh sách đánh dấu dòng đó là `system` thì Web mới giải quyết hai trường này từ locale hiện tại; preset `user` cùng tên vẫn dùng metadata tệp của nó.

Dòng này đọc lại khi có `settings/changed` trong namespace của chính nó và khi có `connection/reset`: danh sách là một thư mục sống, giá trị mặc định là một setting, chỉnh sửa từ bên ngoài và kết nối lại đều có thể thay đổi nó.

## Phần quản lý

Bề mặt thứ tư, một trang settings độc lập (`settings.section`, id `agent-presets`, xếp sau "Model" — chọn model là thao tác hàng ngày, còn tổ hợp agent là việc định hình toàn bộ triển khai phía sau nó): danh sách hiển thị dưới dạng card, hộp thoại sao chép là lối vào duy nhất để tạo preset, tổ hợp đi kèm hiển thị trong trình xem chỉ đọc.

Trình duyệt không còn chỉnh sửa bất kỳ văn bản tổ hợp nào. Chỉnh YAML trong textarea trên web là tính năng yếu (không auto-complete, không highlight, không diff), do đó preset mới là một lần sao chép phía host của một preset đã tồn tại — hộp thoại chỉ thu thập một id (nó sẽ trở thành tên thư mục, nên phải chốt ngay lúc đó, không thể đổi sau) và một tên hiển thị tùy chọn, chỉ có `{ from, id, name? }` đi qua tầng vận chuyển. Mọi thứ còn lại — description, tổ hợp, skill — được chỉnh sửa trong tệp riêng của preset, và trách nhiệm khác của trang này chính là đưa người dùng đến các tệp đó: sao chép để mở thư mục mới như bước kết thúc, mỗi card tùy chỉnh cũng giữ một thao tác vị trí (location). Khi host không có bộ mở desktop (`hasDocument: false` trên danh sách; triển khai từ xa và trong container), cùng thao tác đó chuyển thành hiển thị thư mục dưới dạng văn bản trên card, thay vì cung cấp một nút bấm mà không có phản hồi.

Preset tự công bố description với độ dài không giới hạn, còn lưới thì làm mỗi hàng card cao bằng nhau — do đó description không giới hạn sẽ quyết định chiều cao của toàn bộ danh sách. Card cắt description ở bốn dòng, phần còn lại được mang bởi tooltip, và chỉ gắn khi văn bản thực sự bị cắt. Việc cắt do CSS thực hiện, do đó dù card hiển thị bao nhiêu, description đầy đủ vẫn luôn ở trong cây accessibility.

Preset đi kèm mở trong trình xem chỉ đọc. Đó là bản tổ hợp đã biết tốt mà bản sao xuất phát từ, nên đọc được nó chính là ý nghĩa; nó không cung cấp thao tác vị trí cũng không cung cấp xóa — thư mục cài đặt của nó bị ghi đè khi nâng cấp, không thuộc quyền quản lý của người dùng. Lời dẫn mở đầu đảm nhận thông tin mà trước đây nút tạo từng ngụ ý: sao chép một preset đã có để biến thành của riêng bạn, hoặc dùng "chế độ sáng tạo" để nhờ Agent tạo giúp.

Bên cạnh sao chép là lối vào kiểu hội thoại: khi danh sách mang preset tự tham chiếu `cordis`, một card thêm-mới viền đứt nét (cùng kiểu dáng với trang Model) sẽ tạm giữ nó và mở session mới — phần này đóng panel settings qua owner-prop `close` của vỏ ngoài, còn applier riêng của chip session mới sẽ đảm nhận việc tổ hợp session trống do luồng workspace tạo ra. Chỗ ngồi (seat) này ngăn việc tải danh sách đến muộn ghi đè hiển thị: lựa chọn tạm giữ được ưu tiên trước, sau đó là tổ hợp mà session hiện tại đã mang, cuối cùng mới là giá trị mặc định của triển khai.

Hộp thoại tái tạo quy tắc ràng buộc của chính host (`[a-z0-9][a-z0-9-]*`), và từ chối tên đã bị chiếm — sao chép không bao giờ ghi đè. Hai kiểm tra này chỉ là tiện ích: host sẽ xác thực lại, khi thất bại hộp thoại báo cáo chính xác phản hồi của host.

Xóa sẽ gỡ toàn bộ thư mục preset. Các session đã tổ hợp theo nó vẫn tiếp tục chạy — tổ hợp được gắn một lần khi tạo session, sau đó không có gì đọc lại tệp đó nữa.

Dòng danh sách mang `broken` (kiểm tra hình dạng của host phát hiện tổ hợp bị thiếu hoặc không tải được) sẽ render dưới dạng card đánh dấu: viền đỏ, huy hiệu "tải thất bại" (sự thật do discovery quan sát được, không phải khẳng định tệp đã hỏng — nguyên nhân phổ biến là người dùng vừa chỉnh sửa hoặc xóa tệp tổ hợp), lý do hiển thị nguyên văn, phần thân card bị vô hiệu hóa — nó không thể trở thành mặc định — sao chép cũng bị vô hiệu hóa, vì bản sao của preset hỏng chỉ là một preset hỏng khác. Dòng tùy chỉnh bị hỏng vẫn giữ thao tác vị trí và xóa: tệp chính là nơi sửa nó, còn xóa chính là cách dọn thư mục ma (tệp tổ hợp bị xóa thủ công nhưng thư mục vẫn giữ id). Dòng tích hợp sẵn bị hỏng thậm chí không có trình xem — không có tổ hợp có thể đọc được để hiển thị. Hai bộ chọn (dòng settings chung và chip session mới) hoàn toàn không liệt kê preset bị hỏng: chúng chọn tổ hợp cho session tiếp theo, liệt kê một tùy chọn không thể tổ hợp chỉ đẩy lùi thất bại đến lúc khởi động session.

Giá trị mặc định của settings được ghi vào namespace settings `agent-presets`, host cần công khai nó cho client cấu hình ([`dsh-apiproxy`](../../host/apiproxy/README.md) duy trì một whitelist tường minh — namespace không nằm trong đó sẽ làm bộ chọn hoạt động rồi âm thầm quên).

`agentPreset.read`, `copy`, `openDocument` và `remove` bị chốt vào địa chỉ loopback (xem [`dsh-client-connection`](../connection/README.md)): tổ hợp chỉ định plugin nào một session chạy, do đó đọc nó là do thám, các phương thức còn lại thì quản lý danh sách và điều khiển desktop host. `agentPreset.list` không nằm trong đó — nó mang id, mức tin cậy và hai cờ năng lực không chứa đường dẫn, còn bộ chọn của client LAN cần nó.

## Khi nào các bề mặt này không hiển thị

Triển khai không tổ hợp preset nào trả về danh sách rỗng, dòng này, chip, nhãn và phần này đều không render gì cả — lúc này mỗi session dùng chung tổ hợp host, nên không có gì để chọn hoặc quản lý. Triển khai không cấu hình thư mục gốc có thể ghi trả về `authorable: false`, phần này thoái hóa thành duyệt chỉ đọc: tổ hợp đi kèm vẫn có thể mở trong trình xem, nhưng mỗi thao tác sao chép đều bị vô hiệu hóa kèm lý do làm gợi ý, thay vì đưa ra một hộp thoại chắc chắn tạo thất bại.

## Trải nghiệm Model

Gián tiếp, thông qua preset mà một session sau này được tổ hợp theo; [`dsh-agent-presets`](../../preset/agent-presets/README.md) sở hữu những gì tổ hợp đó đặt trước model.

#### Tác động KV Cache

Không có tác động mất hiệu lực trực tiếp. Thay đổi giá trị mặc định không bao giờ chạm vào tiền tố của session đang chạy; session được tạo sau đó xây tiền tố riêng theo tổ hợp riêng của nó.

## Hạn chế đã biết và công việc hoãn lại

- **Preset không có metadata được liệt kê theo id** — văn bản hiển thị là tùy chọn, bản sao chưa đặt tên chủ ý quay về tên thư mục, thay vì hiển thị giống hệt nguồn gốc của nó.
- **Đường dẫn hiển thị là văn bản, không phải liên kết** — khi host không có bộ mở desktop, card hiển thị thư mục để sao chép thủ công; bản thân trình duyệt không thể mở vị trí trên filesystem của host.
- **Chỉnh sửa tổ hợp không hiển thị cho trang** — tệp được chỉnh sửa bên ngoài trình duyệt, tầng vận chuyển không phát tán thay đổi tệp, do đó danh sách chỉ đọc lại khi có thao tác của chính nó, `settings/changed` và `connection/reset`, chứ không phải mỗi lần chỉnh sửa trên đĩa.
