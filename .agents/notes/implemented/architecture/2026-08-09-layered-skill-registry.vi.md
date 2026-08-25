# Agent Note: registry skill do host sở hữu và phân lớp theo scope

Status: implemented

[English](2026-08-09-layered-skill-registry.md) | 中文

## Vấn đề

Stack agent-preset trước đây đã chuyển toàn bộ năng lực skill — registry, provider cục bộ và tool `skill` — vào realm `isolate` của mỗi preset, với lý do "agent có những skill nào" thuộc về lựa chọn ở mặt phẳng agent. Khung này đã nhầm lẫn hai vấn đề khác nhau: *triển khai* cung cấp những skill nào, so với *agent* có tiêu thụ chúng hay không. Wrapper prepared của plugin repository khai báo `inject: ['skills']` và gắn thư mục gốc skill của nó làm provider ở mặt phẳng host; sau khi profile web và headless không còn tổ hợp registry của host nữa, wrapper đó sẽ chờ mãi mãi, khiến e2e repository-plugin bị treo, khi đó được né tránh bằng cách xóa thư mục gốc skill của fixture. Registry theo realm của từng preset còn khiến danh sách skill của gateway phụ thuộc vào agent còn sống — popup `/` của phiên nguội hoàn toàn không có registry nào để đọc.

Registry công cụ chưa từng gặp vấn đề này: nó là một singleton của host, phân lớp theo `dsh-scope`, do đó công cụ cấp triển khai (MCP server, plugin entry) đăng ký vào lớp toàn cục, còn dòng của preset đăng ký vào lớp của preset đó.

## Quyết định

`SkillRegistry` áp dụng hình thái tương tự. Nó giữ `ScopedLayers<SkillLayer>`; `registerProvider()` và `register()` rơi vào lớp tương ứng với scope của context bên gọi — dòng của host và plugin repository rơi vào lớp toàn cục, `skill-filesystem` của preset (do tổ hợp thường trú gắn vào, context của nó mang theo scope key của preset đó) rơi vào lớp của preset đó. Tên provider là duy nhất trong mỗi lớp chứ không phải duy nhất toàn tiến trình, đây chính là tiền đề cho phép mỗi preset gắn provider `local` của riêng mình.

Việc đọc mang theo scope quan sát (agent đang gọi, bản thân agent chính là scope key của mình) qua `SkillViewOptions`. Registry gộp lớp toàn cục với chuỗi lớp của scope đó: **lớp gần nhất thắng tuyệt đối khi trùng tên, rank chỉ phân xử trùng tên trong một lớp duy nhất** — đây chính là quy tắc che khuất (shadowing) của registry công cụ. Việc gộp rank xuyên lớp vào một pool chung từng được cân nhắc và bị bác bỏ: thiết kế của rank giả định các nguồn đều biết về nhau; trong một pool toàn cục, một plugin repository cài sau có thể âm thầm đè lên skill cùng tên mà preset tự mang theo chỉ nhờ quy tắc hòa theo thứ tự đăng ký, làm thay đổi từ xa hành vi của preset. Ưu tiên lớp gần nhất để hành vi của tổ hợp do tác giả của nó quyết định.

Cache discovery dùng chuỗi scope đã phân giải cộng với một bộ đếm revision làm key, do đó việc tái tổ hợp phiên rỗng — chỉ đặt lại cha của scope key agent, không đụng vào registry — sẽ hiển thị ngay lập tức ở lần đọc tiếp theo.

Tổ hợp cũng được điều chỉnh theo: web-app bundle bật lại dòng registry `skill` của base (chỉ `skill-filesystem` và `tool-skill` vẫn thuộc về preset), tổ hợp preset dỡ bỏ realm `isolate: skills`, đổi thành các dòng phẳng rơi trực tiếp vào registry của host. Miền skills của gateway đọc registry của host theo scope presenter — agent còn sống, nếu không thì là standing key của preset đã ghi lại — nhờ đó phiên nguội liệt kê được đúng danh mục mà tổ hợp của nó thực sự cung cấp thay vì báo lỗi; nhánh `serviceFor` được giữ lại, tương thích với các tổ hợp vẫn tự gắn registry theo realm.

## Ảnh hưởng

**Skill cấp triển khai sẽ đến với mọi phiên preset có gắn `tool-skill`.** Thư mục gốc skill và assertion của e2e repository-plugin đã được khôi phục; e2e shipped-Web chứng minh dòng badge (cùng hình thái đăng ký host) hòa vào danh mục của agent preset standard, trong khi view của host vẫn chỉ giữ toàn cục.

**Khả năng nhìn thấy theo lớp và việc tiêu thụ vẫn là hai lựa chọn độc lập.** Agent `minimal` về nguyên tắc có thể đọc lớp toàn cục, nhưng không tổ hợp tool `skill` — việc agent có skill hay không vẫn do preset quyết định bằng cách gắn hoặc bỏ qua `tool-skill`.

**Tùy chọn provider vẫn là đối tượng mượn từ bên gọi.** `SkillViewOptions` mở rộng `SkillLookupOptions`; registry tiêu thụ `scope`, provider chỉ đọc hợp đồng của riêng mình từ cùng một đối tượng chỉ đọc, giữ nguyên cam kết đồng nhất mượn (borrowed identity) hiện có.

**Profile TUI không bị ảnh hưởng.** Mọi dòng khi ở host chỉ có một lớp (toàn cục), view đã gộp tương đương view registry đơn cũ, hành vi rank không đổi.

**Che khuất xuyên lớp là im lặng.** Kẻ thua trong cùng một lớp vẫn ghi log như cũ; việc lớp gần hơn đè tên của lớp xa hơn theo đúng thông lệ của registry công cụ, không ghi log. Registry vẫn không cung cấp API để kiểm tra các định nghĩa bị che khuất.

## Các phương án từng cân nhắc

**Gộp rank vào một pool chung xuyên toàn bộ lớp có thể nhìn thấy.** Trung thành với ưu tiên của registry đơn, nhưng khi trùng xuyên lớp lại phân xử theo thứ tự đăng ký (provider ở giai đoạn khởi động luôn thắng gắn thường trú), skill mà preset tự mang theo có thể bị đè bởi thay đổi triển khai mà nó không nhìn thấy được. Bị bác bỏ vì tính ổn định của tổ hợp; xem phần "决定".

**Giữ registry theo realm của từng preset, giao skill repository dưới dạng thư mục cho provider của preset quét.** Hợp đồng `inject: ['skills']` của wrapper vẫn bị hỏng (hoặc phải rẽ nhánh wrapper theo profile), cấu hình discovery lặp lại trong mỗi preset, phiên nguội vẫn không có nơi nào để đọc. Bị bác bỏ.
