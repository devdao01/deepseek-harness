# Agent Note: Chủ đề prompt TUI kết hợp các giá trị plugin có thể thay đổi

Status: implemented

Archived: 2026-08-04

[English](2026-07-24-configurable-tui-prompt-theme.md) | 中文

## 问题

Dòng prompt terminal và tiền tố editor trước đây được TUI ghép nội bộ từ một tập hợp trường cố định, bao gồm workspace, model, dung lượng dùng, cache, ngữ cảnh và thời gian. Đơn vị triển khai có thể đổi màu toàn cục, nhưng không thể điều chỉnh thứ tự trường, thay tiền tố nhập liệu, thêm trạng thái plugin, hay dựng một prompt kiểu Powerline.

## 决策

Chủ đề TUI gộp `color`, `truecolor`, `leftPrompt`, `rightPrompt`, `inputPrompt` cùng `inputPlaceholder` tĩnh ở trạng thái đang chạy thành một nhóm. Ba chuỗi prompt tham chiếu `${name}` qua nội suy; giá trị không xác định hoặc không khả dụng sẽ biến mất cùng khoảng trắng phân tách liền kề. Mẫu trái và phải dùng chung một hàng, khi chồng lấn thì giữ lại bên phải, việc tính chiều rộng dùng chiều rộng khả kiến có nhận biết ANSI. Mẫu nhập liệu kiểm soát tiền tố dòng đầu và thụt lề dòng tiếp theo của editor.

`ctx.tuiPrompt` là một registry toàn cục theo ngữ cảnh do `@deepseek-ai/dsh-tui/prompt` cung cấp. `register(name, initialValue)` trả về một handle có `set(value)` và `dispose()`. Giá trị lưu trữ là chuỗi, không phải callback: việc cập nhật phải được khởi phát tường minh, chuỗi không thay đổi sẽ bị bỏ qua, và một lần đăng ký, thay đổi hay dispose sẽ lên lịch một lần thông báo đã gộp. Bộ render dùng `get(name)` để đọc giá trị hiện tại, và dùng `subscribe(listener)` để đăng ký thời điểm cần vẽ lại. Việc đăng ký này là callback trực tiếp nội bộ của dịch vụ, chứ không phải sự kiện Cordis, do đó một giá trị tự thay đổi vẫn có thể kích hoạt vẽ lại, mà không cần một mục trên bus mà không bên tiêu thụ nào khác từng quan sát. `subscribe` và mỗi lần đăng ký đều do effect Cordis của bên gọi sở hữu, do đó sẽ bị gỡ bỏ khi fiber của bên đăng ký hoặc bên đóng góp bị dispose. Mỗi lần `subscribe` là một đăng ký độc lập được phân biệt theo danh tính bản ghi, do đó hai fiber có thể truyền cùng một callback, và dispose một trong hai không ảnh hưởng đến cái còn lại. Thông báo đã gộp sẽ dung sai lỗi cho mỗi observer — ném lỗi đồng bộ, trả về promise bị reject, thậm chí một lỗi mà việc render ra chuỗi cũng ném ngoại lệ (log qua `errorChain` không ném ngoại lệ) — do đó một observer bị hỏng sẽ không làm đói các observer còn lại; và trong lúc phát tán sẽ xác thực lại tính còn sống của mỗi đăng ký, do đó một listener trong cùng đợt đó mà đồng bộ hủy một đăng ký khác sẽ khiến nó im lặng ngay lập tức. Việc đăng ký tuân theo mô hình sở hữu effect của Cordis, từ chối trùng tên, và loại bỏ giá trị tương ứng khi plugin dispose (giải phóng tài nguyên).

Các đoạn đã đăng ký được coi là đầu ra hiển thị đáng tin cậy, được phép mang ANSI. Văn bản chữ nghĩa trong mẫu và nội dung bên ngoài thông thường vẫn được làm sạch, nhưng plugin cung cấp giá trị prompt có thể xuất ra chuỗi điều khiển terminal. Giá trị hợp thành tự chịu trách nhiệm phối hợp việc chuyển màu nền và dấu phân tách, do đó một giá trị `${powerline}` duy nhất có thể render trọn vẹn một đoạn Powerline, mà không cần ghép với các provider nguyên tử liền kề.

Các giá trị built-in `cwd`, `git/worktree`, `token_meter/cache_hit_rate`, `model`, `context`, `queued`, nhãn `symbol` có style và giá trị con trỏ `indicator` có hoạt ảnh đều dùng chung registry này. Sự kiện phiên và agent (trí tuệ nhân tạo) cập nhật các handle tương ứng, bộ đếm giờ chạy cập nhật `queued` mỗi nhịp — huy hiệu hàng đợi steering, chỉ khả dụng khi một lượt đang chạy có tin nhắn xếp hàng — cùng `indicator` có hoạt ảnh. Mẫu nhập liệu đi kèm là `${symbol} ${indicator}`, giữ lại tiền tố `dsh > ` ban đầu.

## 曾考虑的替代方案

**Tính giá trị đồng bộ mỗi lần render qua callback provider.** Không được chấp nhận: thực thi mã plugin trong lúc render sẽ đưa vào một ranh giới lỗi vốn có thể tránh được; lưu chuỗi giúp quá trình render không dính đến việc tính giá trị plugin.

**Phát thông báo thay đổi dưới dạng sự kiện Cordis.** Đã bác bỏ: thông báo đó chỉ có một bên tiêu thụ (bộ render TUI của phiên hiện tại), do đó một sự kiện kiểu toàn cục sẽ thêm một mục trên bus, một mặt phẳng phân phối theo scope, và một sự phát tán xuyên plugin không ai quan sát. Callback `subscribe` trực tiếp được bọc nội bộ dịch vụ đạt được cùng việc vẽ lại đã gộp với diện tích nhỏ hơn.

**Công bố vai trò style ngữ nghĩa thay vì ANSI.** Không được chấp nhận: vai trò ngữ nghĩa không thể biểu đạt việc chuyển màu nền Powerline tùy ý, trừ khi mở rộng giao thức style dùng chung cho mỗi kỹ thuật hiển thị.

**Đặt trường prompt ở cấp cao nhất của cấu hình TUI.** Không được chấp nhận: mẫu và lựa chọn màu cùng định nghĩa việc hiển thị terminal, nên thuộc về cùng một đối tượng `theme`.

## 后果

Plugin đóng góp giá trị prompt phụ thuộc vào registry riêng của TUI, thứ tự tải nằm sau dịch vụ đó, trước bên tiêu thụ TUI. Namespace có hiệu lực toàn cục trên toàn bộ ngữ cảnh Cordis, nhất quán với việc TUI hiện chỉ sở hữu một transcript (bản ghi văn bản) phiên duy nhất. Cho phép ANSI tùy ý là một quyết định tin cậy có chủ đích: các chuỗi ảnh hưởng con trỏ không được hỗ trợ có thể phá vỡ bố cục, chỉ những chuỗi mà công cụ chiều rộng khả kiến của pi-tui hiểu được mới đảm bảo căn chỉnh đáng tin cậy.

Khi thay đổi `inputPrompt` qua giá trị đăng ký, văn bản, con trỏ, lịch sử, tự động hoàn thành và focus của editor đều được giữ nguyên, vì pi-tui hỗ trợ thay thế tại chỗ tiền tố dòng đầu và dòng tiếp theo có cùng độ rộng. `inputPlaceholder` tĩnh sẽ được làm sạch, và chỉ hiển thị khi agent đang chạy và editor rỗng.

## 测试

Test registry cố định việc xác thực, từ chối trùng tên, cập nhật, giá trị không khả dụng, dung sai lỗi của thông báo đã gộp, hủy đăng ký, dispose, nội suy, giữ lại phần chữ nghĩa cuối, làm sạch khoảng trắng và giữ lại ANSI. Test package TUI cố định tính khả dụng của dịch vụ, giá trị mặc định của chủ đề lồng nhau, việc chuyển tiếp cấu hình, mẫu tùy chỉnh, vẽ lại với giá trị ngoài luồng, vẽ lại có thể thay đổi, đoạn hỗ trợ Powerline, chiều rộng tiền tố nhập liệu động và văn bản placeholder tĩnh ở trạng thái đang chạy. Đơn vị triển khai TUI chịu trách nhiệm nghiệm thu thứ tự tải đã lắp ráp của mình.
