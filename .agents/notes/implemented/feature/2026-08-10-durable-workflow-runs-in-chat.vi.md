# Agent Note: Chạy workflow bền vững trong Chat

Status: implemented

[English](2026-08-10-durable-workflow-runs-in-chat.md) | 中文

## Vấn đề

Dòng công cụ workflow thông thường sở hữu lời gọi model và kết quả công cụ cuối cùng, nhưng hai bản ghi này không nói lên được thành viên nào thực sự đã bắt đầu, cách nhóm ra sao, mỗi thành viên hoàn thành, thất bại hay bị hủy, cũng không nói được khi tiến trình dừng thì công việc nào chưa kết thúc. Sự kiện `workflow/*` thời gian thực chỉ tồn tại trong tiến trình hiện tại, do đó việc refresh hoặc mở lại Session sau đó sẽ mất lịch sử chạy.

Web Client đã có thể lắp ráp Conversation Node do nghiệp vụ sở hữu từ các sự kiện Session bền vững. Lịch sử workflow vì vậy cần: khả năng gắn một lần chạy đã chấp nhận với bên sản sinh Session gọi nó, một giao thức bền vững tối thiểu vẫn có ý nghĩa dù chỉ là tiền tố, và một renderer độc lập không cướp quyền sở hữu của thẻ công cụ hiện có.

## Quyết định

`dsh-tool-workflow` chiếu mỗi lần chạy cấp cao nhất đã chấp nhận vào Session của Agent gọi nó. `tool-workflow/run-start` ghi `runId` ổn định cùng tên đã được xác thực; sự kiện thành viên workflow khớp ghi số thứ tự thành viên, nhãn chính xác, giai đoạn chính xác tùy chọn, id Session con và kết quả; chỉ khi kết quả đã có và `run.dispose()` đã dừng hẳn hoàn toàn thì `tool-workflow/run-end` mới ghi lý do dừng. Việc thực thi truyền tải lồng nhau vẫn diễn ra bình thường, nhưng không ghi bản ghi workflow, vì nó không sở hữu dòng Chat độc lập.

Bản ghi chỉ để quan sát. Sau lần append Session đầu tiên thất bại, lần chạy này sẽ dừng mọi ghi tiếp theo, chỉ ghi một cảnh báo duy nhất, và không bao giờ thay đổi việc hủy, ánh xạ kết quả, hay dispose. Mỗi vị trí thất bại đều để lại bản ghi rỗng hoặc tiền tố hợp lệ liên tục: một lần chạy đã bắt đầu có thể thiếu thành viên tiếp theo hoặc điểm kết thúc chạy, một thành viên đã bắt đầu cũng có thể thiếu điểm kết thúc thành viên. Invariant của package sẽ từ chối, cả khi nạp nguội lẫn khi append thời gian thực: khởi động chạy trùng lặp, số thứ tự thành viên dương không hợp lệ hoặc dùng lại, điểm kết thúc thành viên không có cặp hoặc trùng lặp, kết thúc chạy khi vẫn còn thành viên mở, và bất kỳ cập nhật nào sau khi chạy đã kết thúc.

Package workflow cung cấp từ vựng chạy và quan sát an toàn cho trình duyệt qua `@deepseek-ai/dsh-workflow/types`; request và tay cầm điều khiển chứa `Agent` đang hoạt động vẫn chỉ thuộc về Host. `@deepseek-ai/dsh-tool-workflow/types` sở hữu bốn loại sự kiện Session. Client chỉ import các face kiểu này, do đó chương trình TypeScript của Host và Client chia sẻ hợp đồng bền vững mà không hợp nhất Host Cordis Context.

`ui-workflow-run` đăng ký một Conversation Definition `workflow-run` và một renderer Chat có khóa (keyed). Mỗi sự kiện đều có thể tự cho ra cùng `runId`; run-start khởi tạo State, các sự kiện sau đó cập nhật theo thứ tự log; chỉ trang cuối lịch sử chỉ-có-update mới giữ trạng thái pending, cho đến khi prepend bổ sung đúng một start. Node cuối cùng giữ khóa do engine sở hữu, và được neo bằng run-start ngay sau lời gọi công cụ gốc, luôn giữ cùng một cha React từ lúc đang chạy đến trạng thái cuối cùng.

Renderer phân bổ trách nhiệm hiển thị khác nhau cho từng tầng. Lần chạy dùng dòng nền module-platform 32 pixel, chevron trái/phải thường trực, và diễn đạt kết quả bằng chấm trạng thái nội tuyến cộng văn bản trạng thái, không dùng viên nang. Giai đoạn dùng dòng disclosure 32 pixel, hiển thị tiêu đề cùng số lượng thành viên ở vùng chính co giãn, và hiển thị chính xác trạng thái tổng hợp ở đuôi cố định mà không lặp lại chấm trạng thái. Thành viên dùng khe chấm trạng thái 16 pixel, vùng tên có thể lược bỏ, và cột trạng thái cố định 64 pixel. Giai đoạn chỉ xuất hiện khi thành viên thực sự bắt đầu, và được nhóm theo chuỗi giai đoạn chính xác; trường bị bỏ trống và chuỗi rỗng giữ danh tính khác nhau cùng tên đã bản địa hóa. Việc quyết toán thành viên chỉ thay đổi trạng thái, không xóa hay sắp xếp lại thành viên. Khi Turn hoặc Step chứa nó đóng lại, việc thiếu điểm kết thúc chạy hoặc thành viên sẽ hiển thị là đã bị ngắt quãng; khi có điểm kết thúc bền vững thì điểm đó vẫn là căn cứ chính thức. [Disclosure workflow theo trạng thái](2026-08-11-workflow-run-status-driven-disclosure.md) sở hữu tính khả kiến của nội dung chạy và giai đoạn khi các sự thật này thay đổi.

Điều hướng được suy ra từ hai nguồn hiện tại có thẩm quyền, không ghi vào bản ghi bền vững. Chỉ khi trạng thái thành viên bền vững vẫn đang chạy, và danh sách Session thông thường hiện tại chứa cùng id, `origin: 'subagent'`, `parentId` bằng Session cha hiện tại, `running: true`, thì dòng thành viên mới có thể tương tác. Văn bản thành viên gạch chân là gợi ý khả kiến duy nhất; khi lấy focus bằng bàn phím, vùng tên hiển thị vòng focus business-primary 2 pixel, cột trạng thái cố định tiếp tục chỉ diễn đạt vòng đời, không viết mô tả hành động. Renderer chỉ gọi callback `sessions.open(id)` thông thường đã được chèn vào. Thành viên chỉ có địa chỉ, ở xa, cha không khớp, hoặc đã ở trạng thái cuối vẫn khả kiến nhưng giữ nguyên tĩnh.

[Tham chiếu Figma bảy trạng thái](https://www.figma.com/design/tguwzZRmHCjbq58mfsqT0M?node-id=5-2) chốt việc mở/thu gọn lần chạy, lịch sử hoàn thành/mở rộng, thất bại và hủy, ngắt quãng sau khi hồi phục, và hệ thống phân cấp thông tin cột hẹp chế độ tối. `DisclosureRow`, `StateDot`, icon, token ngữ nghĩa, và hành vi keyed-node của repo vẫn là căn cứ chính thức để triển khai; bản tham chiếu không đưa vào trường thời gian chạy hay chủ sở hữu trạng thái mới.

## Kiểm chứng

Package test bao phủ việc chấp nhận cấp cao nhất và lồng nhau, lần chạy không thành viên và song song, thứ tự dispose trước rồi mới ghi điểm kết thúc, bốn tiền tố thất bại append, và việc từ chối invariant cả nguội lẫn thời gian thực. Conversation test so sánh replace hoàn chỉnh, prepend chỉ-có-update, và append thời gian thực, đồng thời bao phủ danh tính giai đoạn chính xác, trạng thái cuối và ngắt quãng, trạng thái disclosure, điều hướng theo sự thật danh sách, gỡ và đăng ký lại qua HMR. Web replay đã giao hàng dùng lại fixture mô hình workflow cha/con hiện có, chạy worker thực, provider spawn, việc bền vững hóa Session, bundle trình duyệt, điều hướng con đang chạy, giữ trạng thái cuối, dòng công cụ gốc cùng tồn tại, token cột hẹp chế độ tối, và tái dựng khi refresh.

## Phương án thay thế đã từng cân nhắc

**Gắn nội dung workflow vào thẻ công cụ hiện có.** Bác bỏ, vì `ui-tool` và định nghĩa công cụ sở hữu việc hiển thị và tương tác của dòng đó. Phụ lục riêng cho workflow sẽ ghép hai vòng đời nghiệp vụ keyed độc lập với nhau, và khôi phục lại mô hình phụ lục sau công cụ đã bị loại bỏ.

**Bền vững hóa projection phía server hoặc thêm kênh wire workflow mới.** Bác bỏ, vì sự kiện Session đã cung cấp sẵn tính bền vững, truyền tải thời gian thực, phân trang và sửa khoảng hở (gap repair). Một service, cache hay transport khác sẽ sao chép cùng sự thật đó và dựng lên chủ sở hữu vòng đời thứ hai.

**Hiển thị giai đoạn khai báo, hoặc suy ra sơ đồ workflow tĩnh từ văn bản script.** Bác bỏ, vì chỉ có sự kiện start của thành viên mới chứng minh công việc thực sự đã diễn ra. `meta.phases`, mô tả `phase()`, nhánh rẽ và cú pháp script đều không phải là topo có thẩm quyền của một lần chạy.

**Giữ điều hướng con ở trạng thái cuối.** Bác bỏ, vì bản ghi workflow chứng minh danh tính lịch sử, không chứng minh khả năng truy cập hiện tại. Việc mở Session nguội hoặc Session ở xa cần hợp đồng danh mục và cấp quyền độc lập; node này không đưa ra cam kết đó.

## Hệ quả

Tiến trình workflow và cuộc hội thoại cha được lưu trong cùng một log, có thể vượt qua refresh và hồi phục tiến trình; quyền sở hữu thực thi vẫn thuộc về workflow run holder, thẻ công cụ gốc giữ nguyên. Giao thức bền vững thêm bốn loại sự kiện nhỏ và một invariant do package sở hữu; lần ghi đầu tiên thất bại cố tình hy sinh việc quan sát tiếp theo, chứ không hy sinh tính đúng đắn của workflow. State trình duyệt được suy ra theo cửa sổ đã nạp, vòng đời disclosure theo trạng thái giữ lựa chọn xem lại ở cục bộ, điều hướng sẽ biến mất theo sự thật danh sách. Thiết kế chỉ hiển thị thành viên và trạng thái chạy thực, và từ bỏ sơ đồ tĩnh, output, log, thao tác điều khiển, và việc mở thành viên ở trạng thái cuối.
