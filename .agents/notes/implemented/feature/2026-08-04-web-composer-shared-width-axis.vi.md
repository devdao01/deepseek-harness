# Agent Note: Trục chiều rộng dùng chung của composer Web và việc hoàn thiện dòng control

Status: implemented

[English](2026-08-04-web-composer-shared-width-axis.md) | 中文

## Vấn đề

Các vùng trong cột session Web tự đặt kích thước độc lập với nhau: cột transcript (bản ghi văn bản), thẻ input, các thẻ dock todo/goal/queue, các thẻ tiếp quản ask-question/approval/plan-review đều hardcode max-width riêng (736/752/776/800px và các biến thể khác) cùng padding cạnh riêng. Các vùng này trôi lệch nhau vài pixel ở chiều rộng đầy đủ, và lệch nhiều hơn ở viewport hẹp — một số panel giữ khoảng cách tới mép màn hình, một số khác lại sát mép. Ngoài ra, dòng control của thẻ input không có hành vi thích ứng — nhãn văn bản của permission trigger sẽ ép cả dòng khi thẻ hẹp; menu nổi neo vào thẻ cũng có thể render rộng hơn thẻ, vượt qua mép phải của nó.

## Quyết định

Một biến chiều rộng nội dung điều khiển toàn bộ cột. `--dsh-chat-content-width` (748px) được khai báo trên `.root` của ConversationRoot — chỗ ngồi (seat) của transcript và composer là hai cây con anh em, việc khai báo phải đặt trên tổ tiên chung thì custom property CSS mới có thể đến được cả hai qua kế thừa. Mọi hình học khác đều được suy ra từ biến này: thẻ input có giới hạn trên là `content + 32px` (`--dsh-composer-card-max-width`), thẻ dock trừ bốn inset dock (4 × 8px) khỏi chiều rộng thẻ để quay đúng về chiều rộng nội dung, thẻ tiếp quản dùng trực tiếp chiều rộng nội dung. Bất biến ở viewport hẹp được diễn đạt bằng cấu trúc chứ không phải bằng con số: vùng có chiều rộng nội dung pad mỗi bên `calc(var(--dsh-composer-side-clearance) + 16px)`, còn thẻ input chỉ giữ clearance trần (16px), nên đẳng thức "thẻ input = nội dung + 32px" luôn đúng ở mọi chiều rộng viewport, chứ không chỉ đúng ở giới hạn trên.

Dòng control bên trong thẻ là một container `container-type: inline-size`, permission trigger sẽ thu gọn nhãn văn bản (chỉ giữ icon + mũi tên dropdown) dưới container query 460px. Query được cố ý giữ ẩn danh: CSS modules hash `container-name` theo module, nên tên khai báo trong stylesheet của InputBar sẽ không bao giờ khớp với query viết trong stylesheet của PermissionSelect — hai tên đã hash lệch nhau âm thầm, query không bao giờ được kích hoạt. Chỉ trigger mang icon chế độ mới thu gọn (`:has(.triggerIcon)`); trigger chế độ tùy chỉnh của host không có icon giữ nguyên văn bản làm định danh duy nhất của nó.

Menu nổi neo vào thẻ (menu slash, popupSelect của command) bị kẹp về chiều rộng của điểm neo (`max-width: min(<design cap>, 100%)`), dòng quá dài bị cắt bằng dấu ba chấm thay vì tràn ra khỏi thẻ. Bong bóng Tooltip vẫn giữ khoảng cách an toàn 12px với mép viewport trong lúc bị kẹp (ui-primitives Tooltip).

## Các phương án thay thế từng cân nhắc

**Giữ mỗi vùng có chiều rộng độc lập, căn chỉnh số liệu thủ công.** Bị loại bỏ: sự trôi lệch mà thay đổi này loại bỏ chính là tàn dư của các hằng số căn chỉnh thủ công; bất kỳ điều chỉnh chiều rộng nào trong tương lai đều cần sửa phối hợp ở năm chỗ, và không có cơ chế nào ép buộc mối quan hệ này.

**Khai báo biến trên `.composerStack`.** Đã thử và bị loại bỏ: panel tiếp quản là anh em của stack trong chỗ ngồi composer, còn transcript hoàn toàn là một cây con khác, biến sẽ không đến được với chúng; tổ tiên chung (`.root`) là nơi duy nhất đúng.

**Dùng container query có tên để thu gọn nhãn.** Đã kiểm chứng thực tế và bị loại bỏ: CSS modules scope hóa `container-name` theo module, tên giữa các module không bao giờ khớp, query trở nên chết. Query ẩn danh phân giải tới container tổ tiên gần nhất, ở đây không có sự mơ hồ nào (dòng đó là container duy nhất).

**Dùng ResizeObserver bằng JS để thu gọn nhãn.** Bị loại bỏ: container query là khai báo, không cần vòng đời listener, còn ngưỡng 460px dù dùng phương án nào cũng là một lựa chọn thiết kế.

## Hệ quả

Sửa chiều rộng cột giờ chỉ là một dòng chỉnh sửa, quan hệ tỷ lệ được đảm bảo bởi cấu trúc — việc điều chỉnh lại 736 → 748 đã kiểm chứng điều này. Cái giá là tính gián tiếp: chiều rộng của năm vùng không còn đọc được trực tiếp từ stylesheet riêng của chúng nữa, phải lần theo chuỗi biến tới ConversationRoot. Việc thu gọn bằng container query thêm một ràng buộc: dòng của InputBar phải giữ vai trò là container kích thước; xóa khai báo đó sẽ âm thầm vô hiệu hóa hành vi thích ứng của permission trigger. Query ẩn danh cũng có nghĩa là nếu trong tương lai xuất hiện một container thứ hai giữa dòng và trigger, nó sẽ chặn query này — lúc đó query phải được di chuyển, hoặc phải tránh container trung gian.
