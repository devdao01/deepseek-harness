# Agent Note: TUI skill slash command

Status: implemented

Archived: 2026-08-04

[English](2026-07-21-tui-skill-slash-command.md) | 中文

## Problem

Khi [hệ thống skill](2026-07-05-skill-system.md) được bàn giao, chỉ có một con đường để mô hình khởi xướng việc tải: công cụ `skill({ name })` cho phép mô hình kéo nội dung một skill vào một lượt, nhưng người thao tác TUI lại không thể tải skill theo yêu cầu. Các agent lập trình khác chính vì lý do này đã cung cấp lệnh slash `/skill:<name>` — để người dùng, chứ không phải mô hình, đánh giá một tác vụ nào đó khớp với một skill nào đó và tiêm chỉ thị của skill đó vào. Bản ghi hệ thống skill đã liệt kê việc gọi trực tiếp do người dùng khởi xướng như công việc còn tồn đọng, và cửa trước tương tác chính là nơi nó nên được hiện thực hóa.

## Decision

Cửa trước [`@deepseek-ai/dsh-tui`](../../../../packages/ui/tui/README.md) sở hữu một lệnh `/skill:<name> [instructions]`. Khi gửi, nó sẽ tải skill được chỉ định, và gửi một khối văn bản như một lượt của người dùng — dùng `agent.send()` khi rảnh, dùng `agent.steer()` để dẫn dắt giữa chừng khi đang chạy, tuân theo cùng quy tắc như nhập liệu editor thông thường. Khối văn bản đó được sinh ra bởi `renderSkillInvocation(skill, instructions)`: một phần tử `<skill name="…">` bọc nội dung skill, thêm một dòng địa chỉ tài nguyên phía trước khi provider công bố địa chỉ gốc tài nguyên, và văn bản đuôi của người dùng được nối vào sau một dòng trống. Lệnh này là tính năng riêng của TUI; nó không thêm bất kỳ công cụ hướng mô hình nào mới. Khả năng hiển thị và chiến lược tải của nó đến từ [chính sách gọi skill độc lập giữa mô hình và người dùng](2026-07-28-skill-invocation-policy.md) dùng chung.

TUI đọc dịch vụ skill qua `ctx.get('skills')`, thay vì tiêm khai báo, vì skill được mount có điều kiện: các triển khai không có registry vẫn giữ được cửa trước khả dụng, lúc đó `/skill:` sẽ báo cáo skill không khả dụng, thay vì lỗi mount. `createTuiChat` là đồng bộ, còn `ctx.skills.list()` là bất đồng bộ, nên tự động hoàn thành trước tiên gieo ngay các lệnh slash tĩnh, chờ khi việc phân giải catalog hoàn tất mới dựng lại provider bằng các mục `skill:<name>`; kết quả phân giải đến sau khi dispose (giải phóng tài nguyên) sẽ bị loại bỏ, còn tra cứu bị từ chối thì vẫn giữ nguyên các lệnh cơ bản.

Tự động hoàn thành dùng `isUserInvocable` để lọc kết quả `list()` không phụ thuộc chính sách gọi; còn khi gửi thủ công thì áp dụng cùng phán định đó sau khi phân giải định nghĩa đáng tin cậy bằng `get()`. Do đó, ngay cả khi việc gọi bởi mô hình bị vô hiệu hóa, các skill chỉ dành cho người dùng gọi vẫn hiển thị và có thể tải; các skill bị người dùng vô hiệu hóa thì vừa không hiển thị, vừa không thể tải theo tên chính xác. Mỗi mục tự động hoàn thành được gắn nhãn theo phạm vi của nguồn thắng cuộc — nguồn `project-` được gắn nhãn `(project)`, mọi nguồn khác gắn nhãn `(user)` — nhãn đặt ở vị trí gợi ý tham số của lệnh slash, menu sẽ hiển thị nó, nhưng khi chọn thì tuyệt đối không được chèn vào, do đó chỉ thị đuôi vẫn theo sau tên đã hoàn thành. Tên không xác định, tên rỗng sau tiền tố, tên bị người dùng vô hiệu hóa và tra cứu thất bại, đều lần lượt hiển thị dưới dạng một thông báo trong transcript (bản ghi văn bản), và không gửi bất kỳ nội dung nào.

`renderSkillInvocation` và dòng địa chỉ gốc tài nguyên là riêng của TUI, cố ý không tái sử dụng kết quả công cụ `skill` của `dsh-tool-skill`. Công cụ đó bọc nội dung trong `<skill_content>`/`<skill_resources>`/`<skill_instructions>` là để phục vụ một *kết quả công cụ*; còn việc gọi thủ công là một *lượt của người dùng*, ghép hai bộ render lại với nhau sẽ buộc một hình thái hướng mô hình phải phục vụ đồng thời hai giao diện. Cái giá là có hai bộ render cùng định dạng nội dung skill; cái lợi là văn bản hướng mô hình của mỗi giao diện có thể tiến hóa độc lập, và mỗi bên được cố định ngay tại nơi nó được sinh ra.

## Alternatives considered

**Chỉ thêm trường frontmatter `user-invocable` trong thay đổi TUI ban đầu.** Chưa được chấp nhận lúc đó, vì một trường riêng của TUI sẽ thay đổi registry, provider và hợp đồng công cụ mà không có một mô hình gọi dùng chung. [Quyết định chính sách gọi độc lập](2026-07-28-skill-invocation-policy.md) sau đó đã mở rộng nó tới mọi bên tiêu thụ liên quan, và giữ `get()` làm nguyên thủy đáng tin cậy.

**Khai báo `skills` như một tiêm phụ thuộc TUI.** Bác bỏ, vì skill được mount có điều kiện; tiêm khai báo sẽ khiến cửa trước phải phụ thuộc vào registry, thiếu nó thì từ chối mount, trái với lập trường dịch vụ tùy chọn của package này. `ctx.get('skills')` đọc kho lưu trữ toàn cục và chấp nhận việc nó vắng mặt.

**Tái sử dụng bộ render của `dsh-tool-skill`.** Bác bỏ, vì đầu ra của nó là hình thái kết quả công cụ được viết cho kênh công cụ hướng mô hình (`<skill_content>` và các phần tử tương tự), còn lệnh gọi bằng slash là một thông điệp của người dùng. Dùng chung nó thì hoặc sẽ làm rò rỉ từ vựng kết quả công cụ vào lượt của người dùng, hoặc phải tách bộ render dùng chung theo cờ `surface` — nặng hơn việc ghép hai bộ định dạng nhỏ.

**Gửi lệnh qua công cụ `skill` của mô hình.** Bác bỏ, vì người dùng đã đưa ra phán định rồi; một lần gọi công cụ sẽ tốn một lượt qua lại với mô hình để lấy một nội dung mà cửa trước có thể tải trực tiếp, và nó cũng không hoạt động được khi agent đang giữa chừng một lượt.

## Consequences

Lệnh gọi thủ công luôn tải lại toàn bộ nội dung skill: TUI không phát hiện xem một skill đã xuất hiện trong hội thoại hay chưa, do đó `/skill:` lặp lại sẽ nối thêm chỉ thị của nó một lần nữa — điều này chấp nhận được, vì việc tiêm lại đôi khi chính là ý định, và đã được ghi trong phần hạn chế đã biết của README package này. Việc trùng lặp hai bộ render đã chấp nhận ở trên là một chi phí bảo trì lâu dài. Lớp bọc `<skill name="…">` là văn bản ổn định, mô hình có thể nhìn thấy, và được cố định từng chữ trong test package với một `SkillService` thật; ma trận ngữ nghĩa cấp package cố định dòng này trong bảng trợ giúp. Việc điền tự động hoàn thành, phát hiện chỉ dành cho người dùng, gửi tới agent đang rảnh và đang chạy, cùng các nhánh tra cứu sau dispose và tra cứu thất bại, đều được bao phủ bởi test package mount registry thật hoặc dịch vụ có thể kiểm soát. Test smoke PTY không cần khóa của TUI sản phẩm đã bị loại bỏ trước đây từng bao phủ đường Loader đã lắp ráp; các triển khai terminal trong tương lai chịu trách nhiệm cho kịch bản cấp ứng dụng đó.
