# Agent Note: Thực thi tool call song song theo an toàn từng lời gọi

Status: implemented

[English](2026-07-10-parallel-tool-call-execution.md) | 中文

## Vấn đề

Một message assistant có thể chứa nhiều khối `tool-call` song hành. Mặc dù model đã yêu cầu các lời gọi này đồng thời, việc thực thi tuần tự vẫn cộng dồn độ trễ của từng lần đọc và request Web độc lập.

Tính đồng thời thuộc phạm vi lập lịch của host, không phải metadata tool hướng tới model. Vòng lặp cần xác định lời gọi nào có thể chạy chồng lấp mà không hardcode tên tool, cũng không expose chiến lược lập lịch ra JSON Schema.

Log phiên vẫn là bản ghi có thẩm quyền: mỗi lời gọi đã khởi động đều có event audit, hoàn thành bình thường và hủy đều ghép cặp lời gọi với kết quả; bất kể thứ tự hoàn thành thế nào, lịch sử model luôn quan sát các kết quả đã commit theo đúng thứ tự lời gọi gốc.

## Quyết định

Mỗi tool có thể cung cấp một bộ phân loại `isConcurrencySafe(args)` tùy chọn. Bộ phân loại này phải là hàm thuần đồng bộ: nó chỉ kiểm tra tham số đã được giải quyết của lời gọi hiện tại, không thực hiện I/O hay bất kỳ thay đổi nào. Chỉ khi trả về `true` một cách tường minh mới có nghĩa là chọn chạy song song; bộ phân loại thiếu, tham số không hợp lệ, bộ phân loại ném lỗi hoặc trả về bất kỳ giá trị nào khác đều khiến lời gọi đó chạy theo kiểu độc quyền (exclusive). Quy ước kiểu chuẩn xem tại [cấu trúc dữ liệu tool](../../../../docs/subsystems/tools.md).

Bộ phân loại được thiết kế có chủ đích là hàm một ngôi (unary). Trả về `true` nghĩa là tool cam kết: lời gọi này có thể chạy chồng lấp với bất kỳ lời gọi song hành nào khác cũng trả về `true`. Bộ lập lịch không so sánh các lời gọi với nhau, cũng không chứng minh rằng việc truy cập tài nguyên của chúng tương thích.

Bộ phân loại một ngôi này vẫn có thể nhận biết input. Tool có thể phân loại thao tác chỉ đọc là song song, thao tác thay đổi là độc quyền. Giao diện này không thể biểu diễn các quy tắc quan hệ kiểu "các thao tác ghi này chỉ an toàn khi đường dẫn khác nhau", do đó những lời gọi mà tính an toàn phụ thuộc vào quan hệ giữa các lời gọi song hành vẫn chạy theo kiểu độc quyền.

`defineTool()` xác thực tham số trước, rồi mới gọi bộ phân loại đã định kiểu. Tham số không hợp lệ bị xếp vào độc quyền, và chỉ khi lời gọi đó thực sự thực thi mới phát sinh lỗi tham số thông thường. `ctx.tools.executionMode(exec)` giải quyết định nghĩa tool đang hiệu lực hiện tại, và trả về chế độ có gắn nhãn `parallel` hoặc `exclusive`; tool không xác định sẽ được xếp vào độc quyền theo nguyên tắc an toàn.

Việc dùng chế độ có gắn nhãn, thay vì công khai một API lập lịch dạng boolean, cho phép sau này biểu diễn các biến thể nhận biết tài nguyên mà không cần thay đổi quy ước phân loại.

## Lập lịch và thứ tự

Vòng lặp chờ đầy đủ message assistant, chỉ giải quyết mỗi lời gọi một lần, tạo `ToolExecution` độc lập cho mỗi lời gọi, rồi quét theo thứ tự model. Các lời gọi song song liên tiếp tạo thành một nhóm; mỗi lời gọi độc quyền tự tạo thành một nhóm riêng và đóng vai trò rào chắn thứ tự (sequential barrier). Các nhóm thực thi theo thứ tự. Việc phân loại áp dụng kiểu lười (lazy): mỗi khi qua một rào chắn, bộ lập lịch sẽ giải quyết lời gọi tiếp theo; trước khi bổ sung vào pool song song, nó còn phân loại lại mỗi lời gọi tiếp theo. Nếu thay đổi registry khiến lời gọi đó trở thành độc quyền, pool hiện tại sẽ được rút cạn hoàn toàn trước, sau đó lời gọi đó mới khởi động như rào chắn tiếp theo.

Ví dụ:

```text
[parallel read(A), parallel read(B), exclusive write(A), parallel read(C)]

→ [read(A), read(B)]
→ [write(A)]
→ [read(C)]
```

`read(A)` và `read(B)` có thể chạy chồng lấp. `write(A)` phải đợi cả hai hoàn thành mới khởi động, `read(C)` phải đợi write hoàn thành mới khởi động.

Mỗi nhóm dùng một pool cuộn (rolling pool) bị giới hạn bởi `maxParallelToolCalls`: vòng lặp khởi động lời gọi theo thứ tự model cho đến khi đạt giới hạn; mỗi khi một lời gọi kết toán (settle), nó lại khởi động thêm một lời gọi khác. Nhóm độc quyền là pool có sức chứa 1. Đặt giới hạn thành `1` sẽ giữ nguyên thực thi tuần tự.

Chỉ việc dispatch và thân tool mới chạy chồng lấp. `tools/pre-execute` và `tools/post-execute` chạy theo thứ tự model, vì middleware có thể duy trì trạng thái nhạy cảm với thứ tự. Lớp bọc `tools/execute` bao quanh quá trình dispatch đồng thời, do đó phải có khả năng tái nhập (reentrant) giữa các lần thực thi khác nhau.

Mỗi lời gọi đã khởi động sẽ được nối thêm `tool/call` ngay trước khi vào cổng pre-execute. Các lần dispatch đã hoàn thành chiếm giữ vị trí theo thứ tự model; con trỏ commit chỉ nối thêm `tool/result` và thu thập `additionalContexts` khi vị trí tiếp theo đã sẵn sàng. Giao diện thời gian thực có thể hiển thị nhiều lời gọi đang chờ, nhưng kết quả và ngữ cảnh sau thực thi tool vẫn được sắp xếp theo thứ tự model.

Nếu bị hủy trước khi một nhóm khởi động, hệ thống sẽ không ghi lại bất kỳ lời gọi nào của nhóm đó. Nếu bị hủy trong khi một nhóm đang thực thi, hệ thống sẽ dừng bổ sung vào pool, chờ các lời gọi đã khởi động, commit kết quả của chúng theo thứ tự, rút cạn ngữ cảnh của các batch đã chấp nhận sau các kết quả đó, rồi kết thúc bước đó qua đường hủy hiện có. Các lời gọi chưa từng khởi động không có event audit. Khi bộ lập lịch gặp lỗi bất ngờ, hệ thống dừng dispatch mới, chờ mỗi lần dispatch đã khởi động kết toán, và ném lại lỗi đầu tiên. Vì lỗi đó là trạng thái kết thúc nội bộ, không phải kết quả tool, vòng lặp sẽ không bịa ra kết quả tool cho các lời gọi bị từ chối hoặc chưa commit.

Code Mode vẫn không dùng bộ lập lịch này, vì model chỉ phát ra một lời gọi `run_code` gốc duy nhất. `run_code` và hàng đợi dispatch nội bộ của nó vẫn thực thi tuần tự; các lời gọi song hành gốc trong `mode: 'both'` dùng bộ lập lịch thông thường.

## Quy ước an toàn

Tool trả về `true` chính là cam kết: thân của nó có thể chạy đồng thời với các lời gọi song song khác. Nó không được trực tiếp thay đổi phiên cha hoặc trạng thái khác thuộc sở hữu của cha; nó trả output về cho vòng lặp, để vòng lặp commit theo thứ tự model.

Bất kỳ trạng thái chia sẻ nào bị chạm vào trong lúc thực thi đều phải hỗ trợ đồng thời. Điều này cũng bao gồm lớp bọc tool và bên cung cấp: chúng có thể tự tuần tự hóa nội bộ, hoặc tự áp giới hạn sức chứa riêng, nhưng không được phá vỡ trạng thái khi bị dispatch đồng thời.

## Cấu hình và khai báo

`maxParallelToolCalls` là giới hạn triển khai dạng số nguyên dương của AgentLoop, dùng chung cho mọi agent (tác tử) do factory tạo ra. Giá trị mặc định là `10`; `1` giữ nguyên thực thi tuần tự. Định nghĩa chính xác của trường và giá trị mặc định xem tại [danh mục cấu hình](../../../../docs/config-catalog.md) được sinh tự động.

Khai báo trong triển khai hiện tại giữ tính bảo thủ. Web search, Web fetch, đọc hệ thống file, các tool trace/read của session query, và delegation subagent chọn song song; delegation song song vì sub-agent làm việc trong phiên riêng của nó, việc chạy của nó không bao giờ thay đổi phiên cha, việc điều phối workspace giữa các delegation song hành do model đảm nhiệm ([Agent Note về subagent song song](2026-08-09-parallel-subagent-delegations.md)). Ghi và sửa hệ thống file, tool bash, tool search của session query, workflow, tương tác người dùng, thay đổi todo, Code Mode và các tool thay đổi Cordis vẫn thực thi độc quyền. Bash không có bộ phân loại nhạy cảm với input đã được chứng minh, do đó vẫn thực thi độc quyền.

Đọc hệ thống file dựa vào một ngoại lệ recorder có phạm vi rất hẹp: các cập nhật quan sát đồng bộ của nó có thể kết toán không theo thứ tự, nhưng ghi và sửa sẽ kiểm tra lại phiên bản đã quan sát trước khi thay đổi, do đó trạng thái lỗi thời chỉ dẫn đến `FS_STALE_VERSION`.

## Kiểm chứng

Unit test cố định việc phân loại theo nguyên tắc an toàn, xác thực tham số đã định kiểu, gom nhóm, rào chắn, phân loại lại lúc runtime sau khi thay thế registry, giới hạn cuộn, đối tượng thực thi độc lập, thứ tự middleware, kết quả và ngữ cảnh có thứ tự, rút cạn khi hủy, và dừng hẳn hoàn toàn sau lỗi bộ lập lịch. Test bên thứ nhất (first-party) cố định từng khai báo song song.

Snapshot test cố định transcript (bản ghi văn bản) nhiều lời gọi hiển thị được: các lời gọi đang chờ có thể chồng lấp, kết quả đã hoàn thành vẫn được sắp xếp theo thứ tự model. Test Code Mode cố định ranh giới tuần tự của nó. Việc lập lịch này thuộc hành vi vòng lặp có tính xác định, do đó không cần test e2e phụ thuộc bên cung cấp.

## Phương án thay thế

**Giữ nguyên thực thi tuần tự.** Điều này tránh được các tình huống thứ tự và hủy mới, nhưng vẫn giữ lại độ trễ không cần thiết do các lời gọi song hành độc lập gây ra.

**Dùng một boolean cấp tool.** Cờ cố định `supportsParallelToolCalls` gọn hơn, nhưng không thể phân biệt thao tác chỉ đọc và thao tác thay đổi của cùng một tool. Bộ phân loại nhận biết tham số giữ lại được sự phân biệt này.

**Dùng phân loại có trạng thái.** Cung cấp cho bộ phân loại quyền truy cập agent đang chạy, registry hoặc I/O sẽ khiến quyết định phụ thuộc vào thời điểm chạy của bộ phân loại, và để lại khoảng trống giữa phân loại và dispatch. Việc ủy quyền có thể thay đổi và kiểm tra trạng thái lỗi thời vẫn thuộc trách nhiệm của thời điểm thực thi.

**Dùng phân loại nhận biết lời gọi song hành hoặc nhận biết tài nguyên.** Bộ lập lịch có thể so sánh từng cặp lời gọi, hoặc để mỗi lời gọi khai báo yêu cầu đọc/ghi tài nguyên. Cách này có thể song song hóa các thao tác ghi không xung đột, nhưng đòi hỏi các tool không liên quan phải chia sẻ định danh tài nguyên và ngữ nghĩa xung đột. Quy ước một ngôi chọn từ bỏ phần đồng thời này, và xử lý theo nguyên tắc an toàn khi tính an toàn phụ thuộc vào quan hệ giữa các lời gọi.

**Thực thi song song toàn bộ pipeline tool.** Cách này giữ cho vòng lặp tiếp tục dùng API một-lời-gọi công khai, nhưng sẽ chạy đồng thời middleware pre-execute và post-execute. Guard và cầu nối hook hiện có có thể mang trạng thái có thứ tự, do đó chỉ cho phép việc dispatch chồng lấp.

**Công khai phương thức theo giai đoạn hoặc waterfall (dạng thác nước) lập lịch.** Các phương thức công khai `prepare`/`dispatch`/`finalize`, hoặc event `tools/execution-mode`, sẽ mở rộng giao diện mở rộng trước khi có bên tiêu thụ khác cần đến nó. Vòng lặp dùng view lập lịch nội bộ, còn `executionMode(exec)` giữ chỗ cắm cho các hook chính sách.

**Chuyển lỗi bộ lập lịch thành kết quả tool.** AgentLoop không thể xác định liệu một dispatch bị từ chối đã gọi thân tool hay chưa; ToolRuntime chịu trách nhiệm về trạng thái gọi thân tool và kết quả tool đã định kiểu. Do đó, lỗi bộ lập lịch nội bộ vẫn giữ là trạng thái kết thúc, không bị phân loại lại thành kết quả `ABORTED`.

**Khởi động lời gọi khi model đang stream output.** Điều này có thể giảm thêm độ trễ, nhưng sẽ thay đổi tính thẩm quyền của message assistant, việc replay, và việc ghép cặp lời gọi/kết quả. Bộ lập lịch chỉ khởi động sau khi message assistant hoàn tất.

**Dùng cửa sổ kích thước cố định.** Nếu chờ mỗi lời gọi của cửa sổ hiện tại trước khi khởi động cửa sổ tiếp theo, một lời gọi chậm sẽ khiến sức chứa bị bỏ không. Pool cuộn tránh được độ trễ này trong khi vẫn giữ giới hạn.

**Expose metadata đồng thời cho model.** Model đã có thể phát ra các lời gọi song hành. Metadata lập lịch của host sẽ làm request phình to mà không giúp ích cho việc chọn tool.

## Hệ quả

Thiết kế này tuân theo nguyên tắc an toàn, cũng đơn giản cho tác giả tool, nhưng không thể tận dụng tính đồng thời chỉ có thể xác nhận an toàn bằng cách so sánh các lời gọi song hành. Tool chọn song song quá rộng rãi có thể phơi bày race condition trạng thái chia sẻ tiềm ẩn.

Trong một số tình huống, lời gọi song song sẽ khởi động trước, trong khi thực thi tuần tự đáng lẽ sẽ hủy trước khi đến lượt các lời gọi đó. Do đó, bộ lập lịch chỉ ghi lại các lời gọi đã khởi động, rút cạn chúng khi hủy, và không bao giờ khởi động lời gọi thay thế sau khi hủy.

Việc commit có thứ tự có thể khiến kết quả nhanh phải chờ lời gọi song hành sớm hơn nhưng chậm hơn. Điều này giữ nguyên thứ tự replay và lịch sử model, trong khi giao diện thời gian thực vẫn có thể hiển thị tiến độ đang chờ.

Các lời gọi ngoài đồng thời có thể tranh chấp hạn ngạch hoặc sức chứa tiến trình. Bên cung cấp chịu trách nhiệm kiểm soát sức chứa của riêng mình; giới hạn của vòng lặp chỉ giới hạn số lời gọi trong một bước agent.

Việc đăng ký tool là ranh giới lập lịch. Bộ lập lịch phân loại lại sau mỗi rào chắn và trước mỗi lần bổ sung pool, do đó thay đổi registry sẽ ảnh hưởng đến các lời gọi chưa khởi động. Các lời gọi đã khởi động giữ nguyên quyết định lập lịch tại thời điểm chúng vào pool.

Lỗi bộ lập lịch ở trạng thái kết thúc có thể để lại các lời gọi đã ghi log nhưng không có kết quả trước khi bước lỗi đóng lại. Việc chờ các dispatch vẫn đang chạy đảm bảo dừng hẳn hoàn toàn, mà không báo sai các lỗi nội bộ này thành kết quả tool.
