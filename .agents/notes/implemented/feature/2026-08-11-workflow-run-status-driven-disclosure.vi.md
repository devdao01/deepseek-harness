# Agent Note: Disclosure điều khiển bởi trạng thái cho workflow run

Status: implemented

[English](2026-08-11-workflow-run-status-driven-disclosure.md) | 中文

## Vấn đề

Node Chat của workflow bền vững sẽ cập nhật tại chỗ từ prefix đang chạy thành bản ghi trạng thái cuối. Lựa chọn disclosure chỉ khởi tạo lúc mount có thể che khuất giai đoạn vừa bắt đầu chạy, khiến công việc đã hoàn thành tiếp tục chiếm không gian hội thoại, hoặc chôn các thành viên failed, cancelled hay interrupted phía sau hai lớp nội dung gấp lại. Nếu chỉ để trạng thái mở/đóng là kết quả suy ra thuần túy từ trạng thái hoàn thành, dù tránh được các vấn đề trên, nhưng cũng sẽ ngăn người dùng mở lại lịch sử sạch để xem lại (review).

Renderer đã nhận được toàn bộ sự thật vòng đời cần thiết từ workflow Conversation Node. Do đó, khả năng hiển thị cần một vòng đời cục bộ trong component: ưu tiên phần đang thực thi và trạng thái cần chú ý, đồng thời không thêm một sự thật bền vững nào khác, cũng không nắm quyền sở hữu kết quả workflow.

## Quyết định

Mỗi giai đoạn suy ra một yêu cầu về khả năng hiển thị từ các thành viên hiện tại. Khi tồn tại thành viên đang chạy, failed, cancelled hoặc interrupted, giai đoạn đó bị buộc mở rộng; khi tất cả thành viên đã hoàn thành, giai đoạn đó ở trạng thái sạch. Workflow cũng bị buộc mở rộng khi trạng thái tự thân của nó cần chú ý hoặc bất kỳ giai đoạn nào bị buộc mở rộng, do đó ngay cả khi kết quả workflow được ghi là đã hoàn thành, thành viên bất thường vẫn giữ được khả năng hiển thị. Các giai đoạn anh em đã hoàn thành vẫn tiếp tục có thể gấp lại độc lập.

Tầng bị buộc mở rộng được render thành một hàng mở tĩnh. Nó không cung cấp button role, mục tiêu focus, phím tắt chuyển đổi, hay giá trị `aria-expanded`, vì thao tác gấp lại không thể thay đổi được kết quả. Cách này vừa giữ được phân cấp thị giác và tóm tắt trạng thái, vừa khiến cam kết tương tác khớp với hành động thực sự có thể thực hiện.

Tầng sạch sẽ mount một disclosure có kiểm soát thông thường ở trạng thái đóng. Lựa chọn cục bộ của nó được giữ nguyên qua các lần rerender trong cùng một đoạn trạng thái sạch liên tục. Dữ liệu đang chạy hoặc bất thường mới sẽ thay thế đoạn thủ công đó bằng trạng thái buộc mở rộng; lần quay lại trạng thái sạch tiếp theo sẽ mount một disclosure đóng mới, nhờ đó mỗi chu kỳ hoạt động chỉ tự động gấp lại đúng một lần. Đóng workflow sẽ tự nhiên unmount control của các giai đoạn của nó; remount Session sẽ tái tạo lại mỗi tầng từ trạng thái bền vững hiện tại, chứ không khôi phục lựa chọn trước đó.

Ví dụ, một workflow đang chạy hiển thị giai đoạn và thành viên đang hoạt động của nó mà không cần click. Khi giai đoạn đó hoàn thành, chỉ giai đoạn gấp lại, workflow tiếp tục mở rộng; khi cả bản thân workflow và toàn bộ giai đoạn đều hoàn thành, workflow cũng sẽ gấp lại. Sau đó người dùng có thể mở lại cả hai tầng để xem lại. Nếu một thành viên mới bắt đầu dưới cùng một key giai đoạn, cả hai tầng bị ảnh hưởng sẽ ngay lập tức khôi phục trạng thái buộc mở rộng, và chỉ gấp lại lần nữa sau khi hoạt động mới hoàn thành.

Renderer chỉ sở hữu vòng đời khả năng hiển thị này. Nó không thêm Session event, store, setting, trạng thái xác nhận, timer, di chuyển focus, tự cuộn, hay lưu bền vững qua các lần remount. Nó không thay đổi việc suy ra trạng thái workflow, việc gom nhóm giai đoạn, thứ tự thành viên, quyền truy cập điều hướng, văn bản hay API `DisclosureRow` dùng chung. Con trỏ chuột thuộc sở hữu của style `data-expandable` dùng chung, do đó hàng tĩnh bị buộc mở rộng không gợi ý một thao tác không thể thực hiện được. Prefix bị ngắt trong bản ghi bền vững vẫn thuộc trạng thái cần chú ý, do đó luôn hiển thị cho đến khi sự thật ở tầng dưới thay đổi.

## Xác minh

Test component lái cùng một workflow và giai đoạn có key lần lượt qua các trạng thái: đang chạy, hoàn thành sạch, xem lại thủ công, hoạt động mới, lại hoàn thành sạch, hoàn thành với zero thành viên, và từng trạng thái bất thường. Test còn xác minh thành viên bất thường mở rộng lan lên trên, giai đoạn anh em sạch độc lập, xem lại bằng chuột và bàn phím, lựa chọn được giữ nguyên qua các trạng thái sạch liên tiếp, và không tồn tại button giả hay ngữ nghĩa ARIA giả khi bị buộc mở rộng.

Bài replay Web đã ship quan sát workflow thực, worker, Session log, biểu đồ plugin trình duyệt và điều hướng cấp con. Nó yêu cầu workflow và giai đoạn đang hoạt động thực sự phải hiển thị mà không cần control disclosure, workflow và giai đoạn kết thúc bình thường phải gấp lại, xem lại thủ công vẫn thấy được thành viên ở trạng thái cuối không còn điều hướng được, và refresh sẽ tái tạo lại lịch sử gấp/mở từ sự thật bền vững.

## Phương án khác đã cân nhắc

**Giữ một trạng thái thủ công chỉ khởi tạo từ lần render đầu tiên.** Bị bác bỏ, vì các cập nhật vòng đời sau đó không thể mở lại nội dung hoạt động mới hoặc bất thường, cũng không thể gấp lại công việc kết thúc bình thường.

**Chỉ suy ra `open` dựa trên việc tầng đó có sạch hay không.** Bị bác bỏ, vì lịch sử đã hoàn thành sẽ mãi mãi giữ trạng thái đóng, không thể mở lại để xem lại.

**Lưu bền vững trạng thái mở rộng, xác nhận hoặc đã đọc.** Bị bác bỏ, vì sự thật vòng đời hiện tại đã quyết định khả năng hiển thị bắt buộc, còn lựa chọn xem lại chỉ thuộc về tầng hiển thị đã mount. Việc lưu bền vững sẽ thêm một bên sở hữu trạng thái thứ hai, và đòi hỏi phải định nghĩa lựa chọn lỗi thời, xác nhận bất thường, ngữ nghĩa replay và đồng bộ hóa — những cơ chế mà kết quả của người dùng không cần đến.

## Hệ quả

Bản ghi workflow hiển thị công việc hiện tại và kết quả bất thường mà không cần click chuẩn bị trước, và thu hồi lại không gian hội thoại sau khi hoàn thành bình thường, mà không hy sinh khả năng xem lại. Ngữ nghĩa tương tác trong lúc điều khiển tự động vẫn trung thực, cùng một bản ghi bền vững nhận được cùng trạng thái khởi tạo khi render thời gian thực, khi refresh, và khi tái tạo lịch sử.

Cái giá là hành vi reset cục bộ có chủ đích. Khi workflow cha đóng lại hoặc component unmount, lựa chọn của giai đoạn sẽ biến mất; vì sản phẩm không có trạng thái xác nhận, bản ghi bất thường không thể bị ẩn thủ công. Nếu sau này cần hỗ trợ một trong hai hành vi đó, cần quyết định riêng về quyền sở hữu và việc lưu bền vững, chứ không thể mở rộng ngầm vòng đời cục bộ này.
