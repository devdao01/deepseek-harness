# Agent Note: Gộp subagent control vào dịch vụ subagent

Status: implemented

[English](2026-07-26-merge-subagent-control-service.md) | Tiếng Việt

Tập hợp thao tác công khai được tinh chỉnh thêm bởi [thao tác tiếp diễn subagent được đặt tên theo intent](2026-07-27-intent-named-subagent-continuation-operations.md), rồi lại được tinh chỉnh thêm lần nữa bởi [subagent có thể tiếp diễn](../feature/2026-07-28-continuable-subagent-conversations.md) — bản sau giữ lại đúng dịch vụ gộp này, đồng thời loại bỏ việc phân phối `resume` của provider và vòng đời tiếp diễn dựa trên Task.

## Vấn đề

Việc điều phối child có thể tiếp diễn (continuable) ban đầu nằm trong một dịch vụ `ctx.subagentControl` độc lập, đặt trên nền quy ước provider `ctx.subagents` gốc. Sự tách biệt này giúp việc phân phối cho provider không phụ thuộc vào Task và persistence, đồng thời cung cấp một quy ước điều phối thống nhất cho cả adapter dành cho model lẫn adapter hướng tới con người. Trên thực tế, hai dịch vụ này thuộc cùng một nhóm năng lực, mỗi bên gọi có thể tiếp diễn đều cần cả hai, còn công cụ ủy quyền (delegation tool) gắn với provider phải suy luận chính sách dựa trên `provider.resume`, đồng thời kiểm tra xem dịch vụ control và công cụ `send_message` có tình cờ được nạp hay không. Kết quả là, sự tồn tại của plugin đi kèm sẽ quyết định ngữ nghĩa thực thi, và ghép chặt việc khởi động công việc có thể tiếp diễn với một interface thao tác tiếp theo tùy chọn.

## Quyết định

`SubagentRuntime` là dịch vụ công khai duy nhất. Nó công khai `start(name, request)` thông thường, `startContinuable(spec)` dựa trên Task, và `followup(...)` được đặt tên theo intent; việc phân phối resume của provider vẫn được đóng gói bên trong continuation manager của nó. Package `@deepseek-ai/dsh-subagent-control` độc lập và khóa `ctx.subagentControl` không còn tồn tại; package tùy chọn `@deepseek-ai/dsh-tool-subagent-control` giờ tiêm trực tiếp vào `ctx.subagents`.

Dịch vụ gộp và provider của nó công khai một hệ phân loại `SubagentError` duy nhất. Mã lỗi ổn định tách biệt lỗi tra cứu provider và lỗi liên quan tới năng lực, khỏi lỗi định tuyến tiếp diễn, xác thực quyền, hủy bỏ, persistence và lỗi gửi; các dịch vụ đã bị loại bỏ không giữ lớp lỗi riêng của mình.

Việc triển khai tiếp diễn vẫn là một manager nội bộ, không mở rộng trạng thái lõi của registry provider. `SubagentRuntime` tạo manager này thông qua `ctx.inject(['tasks', 'agents'], ...)`, do đó Cordis child fiber được tiêm có listener hoàn tất Task và effect gỡ bỏ (teardown) riêng của mình. Việc nạp registry provider không yêu cầu Task hay persistence. Manager này chỉ tồn tại khi cả Task và Agent đều khả dụng; mỗi thao tác tiếp diễn sẽ resolve dịch vụ persistence session khi cần đến tính bền vững. Việc dispose (giải phóng tài nguyên) fiber này sẽ hủy và kết toán các tiếp diễn đang hoạt động trước, rồi mới giải phóng các liên kết của nó.

`startContinuable` vẫn tách biệt với `start` nền tảng, vì hai bên có quy ước sở hữu và thời điểm khác nhau: `startContinuable` cấp phát id child bền vững, tạo Task, và trả về đồng bộ cả hai id, trong khi quá trình khởi động tiếp tục chạy bên trong Task; còn `start` nền tảng chờ provider publish, rồi giao lại một run mà bên nắm giữ chịu trách nhiệm. Nếu gộp phương thức này vào `start` bằng một cờ hoặc kiểu union giá trị trả về, quy ước nền tảng sẽ bị mở rộng, và thay đổi sẽ nhiều hơn so với việc giữ nguyên điểm vào tường minh hiện tại.

Mỗi instance `@deepseek-ai/dsh-tool-subagent` chọn `backgroundMode: 'one-shot' | 'continuable'`, giá trị mặc định là `one-shot`. Cấu hình này biểu diễn chính sách; `provider.resume` chỉ dùng để kiểm tra xem chế độ continuable đã cấu hình có được provider hỗ trợ hay không. Do đó, một provider có khả năng resume vẫn có thể thực hiện công việc nền dạng one-shot. Công cụ `send_message` là một adapter độc lập: việc nạp hay bỏ qua công cụ này không bật cũng không tắt `startContinuable`.

## Các phương án thay thế đã cân nhắc

**Giữ hai dịch vụ độc lập.** Cách này giữ được sự tách biệt phụ thuộc chặt chẽ nhất, nhưng mỗi tuyến production có thể tiếp diễn đều phải kết hợp hai dịch vụ, còn khóa công khai bổ sung sẽ phơi bày sự khác biệt kiến trúc mà bên gọi không cần đến. Manager nội bộ không cần dịch vụ thứ hai vẫn có thể giữ Task và persistence là phụ thuộc tùy chọn.

**Suy luận chế độ continuable từ `provider.resume`.** Sự tồn tại của phương thức này có thể biểu diễn chính xác năng lực khôi phục từ storage bền vững, nhưng không biểu diễn chính sách triển khai. Điều này sẽ buộc mọi provider có khả năng resume phải dùng ngữ nghĩa nền tảng continuable, và biến việc thiếu plugin đi kèm thành lỗi runtime. Cấu hình công cụ tường minh tách biệt lựa chọn khỏi năng lực.

**Đăng ký điểm truy cập tiếp diễn, hoặc kiểm tra công cụ thao tác tiếp theo.** Registry có thể cho công cụ ủy quyền biết interface tiếp diễn có tồn tại hay không, nhưng việc khởi động công việc có tính bền vững không cần bất kỳ adapter thao tác tiếp theo nào. Registry như vậy sẽ mã hóa việc kết hợp UI vào chính sách thực thi, và tái lập phụ thuộc giữa các plugin dưới một cái tên khác.

**Gộp việc khởi động nền tảng và khởi động continuable thành một phương thức.** Một cờ trên `start` sẽ khiến phương thức này hoặc trả về một run one-shot đã được publish, hoặc trả về ngay lập tức Task và định danh child, làm suy yếu ranh giới sở hữu đơn giản. Giữ `startContinuable` là thay đổi nhỏ hơn, đồng thời giữ rõ ràng cả hai quy ước.

## Ảnh hưởng

- Topology dịch vụ giảm đi một khóa công khai và một package, trong khi việc phân phối provider nền tảng vẫn có thể dùng được khi không có Task hoặc persistence.
- Khi provider đã cấu hình thiếu `resume`, chế độ continuable sẽ thất bại ngay ở giai đoạn mount provider; khi thiếu Task, Agent, hoặc persistence, lỗi vẫn xảy ra ở thao tác sớm nhất cần đến chúng.
- Việc gửi thông điệp tiếp theo vẫn là tính năng tùy chọn. Triển khai có thể khởi động và thu thập công việc continuable thông qua công cụ Task mà không công khai `send_message`.
- Continuation manager bên trong package `dsh-subagent` vẫn cảm nhận được Task và persistence, do đó package này sẽ khai báo các dịch vụ đó là peer dependency tùy chọn, ngay cả khi bên gọi `start` thông thường không cần đến chúng.
- Các ngữ nghĩa hiện có về race điều kiện tiếp diễn, xác thực quyền, tính bền vững, hủy bỏ, và kết toán trước rồi mới dispose vẫn giữ nguyên, và tiếp tục được cố định bởi các test `subagent` đã di chuyển.
