# Agent Note: Cổng vào TUI toàn màn hình độc lập

Status: implemented

Archived: 2026-08-04

[English](2026-07-17-dedicated-full-screen-tui-front-door.md) | 中文

## Vấn đề

Package TUI có thể tái sử dụng vẫn giữ nguyên phần triển khai, nhưng [`dsh` không còn giao package đó như một cổng vào ứng dụng nữa](../simplification/2026-08-03-explicit-config-dsh-entrypoint.md). Ghi chú này tiếp tục chịu trách nhiệm về ranh giới package và hành vi terminal; các ghi chú sau đó chịu trách nhiệm về việc lắp ráp sản phẩm.

Khi cổng vào này được giới thiệu, agent hướng theo dòng (line-oriented) chịu trách nhiệm cho pipe và terminal thông thường, nhưng giao diện coding toàn màn hình phải chịu trách nhiệm cho đầu vào thô, vẽ khác biệt (diff rendering), trạng thái con trỏ, lớp phủ (overlay) và khôi phục terminal. Gộp hai loại hợp đồng này vào một plugin UI duy nhất sẽ buộc các đường dẫn hướng theo stream phải phụ thuộc vào vòng đời chỉ áp dụng cho TTY. [Quyết định loại bỏ agent trùng lặp](../simplification/2026-07-20-remove-stdio-and-echo-agents.md) sau đó đã loại bỏ agent hướng theo dòng này; ghi chú này tiếp tục chịu trách nhiệm về thiết kế TUI.

Kênh tương tác phải tiếp tục là một plugin Cordis, sử dụng cùng agent, session, tool và service tương tác người dùng như các cổng vào khác. Nó cần khôi phục lịch sử bền vững, theo dõi việc thay thế do nén (compaction), hiển thị nội dung tự trình bày (self-presenting) của tool, và khôi phục terminal khi khởi động thất bại và khi giải phóng tài nguyên. Một ứng dụng chat độc lập hoặc một bộ agent thứ hai sẽ lặp lại các hành vi này bên ngoài đồ thị plugin.

## Quyết định

DeepSeek Harness giao [`@deepseek-ai/dsh-tui`](../../../../packages/ui/tui/README.md) như một plugin Cordis độc lập. Plugin này chỉ chịu trách nhiệm về đầu vào và trình bày terminal; vòng đời agent, việc lưu bền vững session, thực thi tool, và tool hỏi đáp model có thể nhìn thấy vẫn do các thành phần lắp ráp khác nhau chịu trách nhiệm. Plugin yêu cầu cả stdin và stdout đều là TTY; nếu điều kiện không thỏa mãn thì sẽ thất bại, không âm thầm chuyển sang xuất theo từng dòng.

Package này là cổng vào terminal, không phải một ứng dụng hoàn chỉnh. Host gắn `@deepseek-ai/dsh-tui` trước khi agent đã được cấu hình, và lắp ráp backend, tool và policy xung quanh nó. CLI sản phẩm hiện tại không giao việc lắp ráp terminal; task không tương tác dùng chế độ headless, Web là giao diện hướng đến con người trong các sản phẩm đã cài đặt, còn ACP vẫn là một giao thức tự động hóa độc lập.

Host cung cấp `SessionId` mới tạo hoặc được khôi phục giống hệt cái mà agent do nó tạo sẵn đang sử dụng. TUI chờ agent gốc tương ứng xuất hiện, rồi mới vào chế độ toàn màn hình. Do đó, sự kiện `agent-loop/config-start-failed` tương ứng sẽ được báo cáo trước khi chiếm quyền màn hình.

### Đầu tư transcript và tương tác

TUI tái tạo transcript từ các nguồn sự kiện session dạng ghi thêm (append), vì vậy lịch sử được khôi phục sẽ giữ lại mọi tin nhắn mà người đọc đã từng thấy; phạm vi đã bị nén sẽ không còn khớp với session mà model nhìn thấy nữa, nhưng vẫn có thể đọc được sau một dòng đánh dấu ([transcript nguồn gốc ghi thêm dành cho con người](../bug-fix/2026-07-29-human-transcript-append-origin.md)). TUI render văn bản Markdown và reasoning (trong đó khối code có hàng rào (fenced code block) ẩn đi ký hiệu Markdown, giữ lại một nhãn ngôn ngữ tùy chọn màu tối, và dùng phần thân với bảng màu code), lượng token đã dùng, kế hoạch `todo/write` mới nhất, và các thẻ tool được tạo ra thông qua phương thức `presentCall` và `presentResult` do mỗi định nghĩa tool cung cấp. Các thẻ tool dài hơn giữ lại phần xem trước đầu-cuối có thể cấu hình, và hiển thị số dòng bị ẩn; một điều khiển terminal có thể mở rộng hoặc thu gọn toàn bộ thẻ. Các đoạn văn bản (chunk) và lời gọi tool đang diễn ra sẽ cập nhật cùng một nhóm component, sau đó được các sự kiện hoàn thành thu gọn trạng thái lại.

Khi agent đang rảnh rỗi, đầu vào từ editor sẽ gọi `agent.send()`; khi lượt đang chạy thì gọi `agent.steer()`. Việc hủy, ẩn/hiện reasoning, mở rộng thẻ tool, vẽ lại, xóa transcript và thoát đều chỉ là các điều khiển terminal. `/exit` và `/quit` dùng chung một đường thoát: hủy lượt đang diễn ra, chờ agent rảnh rỗi, rồi khôi phục và đóng terminal. Footer khi rảnh rỗi tính toán tỷ lệ chiếm dụng ngữ cảnh từ `tokenMeter`, và hiển thị model đã chọn cùng mức độ reasoning được chọn tường minh; khi agent đang chạy, phần tóm tắt này sẽ được thay bằng chỉ báo hoạt động kèm thời gian đã dùng và gợi ý ngắt bằng Escape. `/status` khả dụng ở cả hai trạng thái, và sẽ thêm vào một snapshot chi tiết chỉ hiển thị trên terminal, bao gồm định danh session và timestamp, model đã chọn, mức độ reasoning (hoặc trạng thái mặc định) và trạng thái ẩn/hiện reasoning, số đếm vòng đời được gộp từ event log, phần chi tiết mức sử dụng đã khử trùng lặp nhất quán với footer cùng tỷ lệ cache hit, và mức sử dụng ngữ cảnh do `tokenMeter` cung cấp cùng dung lượng do model đã chọn công bố. Plugin đăng ký nhà cung cấp `userInteraction` dùng chung, trình bày các câu hỏi đang chờ trong một bảng thao tác bàn phím rộng ở góc dưới bên trái, bảng này hiển thị tiến độ theo lô (batch), các lựa chọn được đánh số và phần mô tả căn chỉnh; gợi ý thao tác của bảng chỉ liệt kê các thao tác có ý nghĩa với số lượng lựa chọn hiện tại, không hiển thị mục điều hướng khi chỉ có một lựa chọn duy nhất; hành vi agent và log câu trả lời vẫn do các service hiện có chịu trách nhiệm.

Lệnh `/model` trình bày mục lục `ctx.llm` mang tính gợi ý dưới dạng bộ chọn bàn phím, và chỉ thay đổi mục tiêu của session TUI hiện tại; dạng có tham số vẫn có thể chọn trực tiếp mục tiêu. Bộ chọn có một ô lọc phía trên danh sách: nội dung nhập vào sẽ thu hẹp tập dòng bằng cách khớp chuỗi con không phân biệt hoa thường với nhãn `provider/model`, tên model và mô tả của mỗi dòng, và giữ nguyên dòng đang được highlight nếu nó vẫn còn khớp sau khi lọc; Escape sẽ xóa nội dung lọc không rỗng trước, nhấn Escape lần nữa mới hủy bộ chọn. Mỗi dòng model giữ thứ tự mức độ reasoning và giá trị mặc định do adapter công bố: nhấn Shift+Tab sẽ xoay vòng mức độ reasoning của dòng đó; nếu adapter không công bố giá trị mặc định, vòng xoay sẽ bao gồm cả hành vi mặc định của nhà cung cấp; các model không có metadata tùy chọn thì giữ nguyên. Hai waterfall trong phạm vi agent — lắp ráp prompt và request — sẽ chụp snapshot cùng một mục tiêu provider/model/mức reasoning một lần cho mỗi bước, do đó dù lệnh đến trong lúc đang lắp ráp thì phép nội suy `{{provider}}` / `{{model}}` và việc định tuyến request cũng không bị tách rời. Hệ thống khôi phục mục tiêu đã từng sử dụng bằng request header mới nhất trong log; lựa chọn chưa được request nào sử dụng chỉ tồn tại trong tiến trình hiện tại.

### Quyền sở hữu terminal

Trước khi output của model, dữ liệu session, phần trình bày của tool, câu hỏi, cấu hình hoặc thông tin chẩn đoán đi vào pi-tui hoặc tiêu đề terminal, `displayText()` sẽ hiển thị các ký tự điều khiển C0 và C1 (ngoại trừ xuống dòng) dưới dạng văn bản escape thập lục phân. Chỉ có TUI và pi-tui được phép tạo ra chuỗi điều khiển ANSI.

Bảng màu tích hợp sẵn chỉ dùng 16 màu nền tiêu chuẩn ANSI và thuộc tính SGR, văn bản chính và nền theo giá trị mặc định của terminal, mục đang chọn dùng hiển thị đảo (reverse video). Vì vậy, terminal của host có thể ánh xạ lại giao diện theo chủ đề sáng hoặc tối một cách trực tiếp, không cần thiết lập theme riêng cho TUI; `color: false` sẽ loại bỏ toàn bộ style.

## Xác minh

[Agent Note về snapshot trạng thái terminal TUI](../testing/2026-07-18-tui-terminal-state-snapshots.md) đã được triển khai quy định hợp đồng kiểm chứng của package: test hành vi trực tiếp và snapshot terminal ngữ nghĩa. Bên triển khai giao cổng vào này chịu trách nhiệm nghiệm thu transcript sau khi lắp ráp và tiến trình／PTY của nó. README của package chịu trách nhiệm ghi lại cấu hình, lệnh, hiệu ứng model có thể nhìn thấy và giới hạn hiện tại.

## Các phương án từng được cân nhắc

- **Giữ cả readline và chế độ toàn màn hình trong `@deepseek-ai/dsh-stdio`**: không được áp dụng, vì xuất theo từng dòng và render TTY dạng khác biệt có dependency, quy tắc đầu vào, quyền sở hữu log và nghĩa vụ dọn dẹp tài nguyên khác nhau. Tách thành các package độc lập giúp hợp đồng an toàn của pipe giữ được sự gọn gàng, rõ ràng.
- **Cho plugin TUI âm thầm giảm cấp khi bất kỳ luồng tiến trình nào không phải TTY**: không được áp dụng, vì việc rơi trở lại (fallback) sẽ che giấu lỗi triển khai và thay đổi ngữ nghĩa tương tác. Host có thể chọn cổng vào khác; TUI được gắn tường minh sẽ thất bại nhanh.
- **Giữ việc kết nối và test TUI trong leaf `repl-agent` của readline**: tại thời điểm đó không được áp dụng, vì một leaf sẽ đại diện cho hai cổng vào khác nhau. Việc loại bỏ cổng vào sản phẩm sau đó đã xóa phần kết nối ứng dụng đó, nhưng vẫn giữ nguyên ranh giới package.
- **Sửa đổi `agent.options` khi `/model` đang chạy**: không được áp dụng, vì việc tạo option không thể cung cấp một ranh giới nguyên tử giữa lắp ráp prompt bất đồng bộ và định tuyến request. Waterfall trong phạm vi agent sẽ chụp snapshot tổ hợp trường đã chọn một lần cho mỗi step, đồng thời giữ đầu vào tạo lập bất biến.

## Hậu quả

- Bên triển khai gắn TUI sẽ có được giao diện Markdown, thẻ, kế hoạch và hỏi đáp có trạng thái, không cần đồng bộ thêm một giao thức terminal thứ hai.
- TUI sẽ đưa vào dependency pi-tui và yêu cầu nghiêm ngặt TTY; các triển khai không phải TTY dùng Headless app hoặc giao thức có cấu trúc.
- Việc đầu tư transcript giúp khôi phục nhất quán với session bền vững, nhưng chỉ một session đã cấu hình sở hữu transcript và editor.
- Bộ tool mở rộng thẻ terminal thông qua các phương thức trình bày hiện có, không cần thêm nhánh riêng cho từng tool trong TUI.
- Việc chọn model và mức reasoning dùng metadata do adapter công bố, nhưng không biến tư cách thành viên mục lục thành việc kiểm chứng request; lựa chọn chưa dùng không thuộc trạng thái bền vững.
