# Agent Note: Đăng ký lệnh do plugin tự sở hữu

Status: implemented

[English](2026-07-19-plugin-command-registration.md) | Tiếng Việt

## Vấn đề

TUI sở hữu các lệnh slash. Nếu tên lệnh, văn bản trợ giúp, tự động hoàn thành, phân phát (dispatch) và hủy đều nằm bên trong adapter, mỗi lệnh mới đều đòi hỏi sửa TUI, và các plugin tùy chọn cũng không thể đóng góp lệnh. Coi đầu vào slash như một prompt mô hình thông thường cũng không an toàn: hành động trực tiếp mà người dùng nhìn thấy có thể vô tình tiêu tốn token, hoặc khiến mô hình diễn giải lại một lệnh không xác định.

Cơ chế dùng chung vẫn phải là mối quan tâm của UI, chứ không phải là công cụ mô hình hay một nhánh của agent loop (vòng lặp tác tử). Nó còn cần độ chính xác đến từng agent (tác tử) về khả năng hiển thị, an toàn khi gỡ bỏ qua HMR (Hot Module Replacement), render kết quả trực tiếp và hủy theo phạm vi của từng yêu cầu, đồng thời không tự động đưa văn bản lệnh hay kết quả vào lịch sử mô hình.

## Quyết định

`@deepseek-ai/dsh-commands` nằm ở `packages/interaction/commands/` là registry (sổ đăng ký) lệnh sản phẩm. Gói ứng dụng TUI gắn nó cạnh frontend tiêu thụ dịch vụ này; [ứng dụng ACP (Agent Client Protocol) chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) và agent spine không có executor, không có UI đều bỏ qua dịch vụ này. TUI inject dịch vụ này, còn các bên sản sinh lệnh chỉ phụ thuộc vào registry và lĩnh vực (domain) mà chúng thao tác.

### Quy ước của registry

`CommandDefinition` gồm tên viết thường không có `/`, mô tả không rỗng, gợi ý đầu vào phi cấu trúc tùy chọn, và một handler có thể hủy. Việc đăng ký sẽ xác thực metadata, sao chép một bản tách biệt khỏi phía gọi, đóng băng định nghĩa cuối cùng có hiệu lực, và trả về disposer (bộ giải phóng tài nguyên) chính xác của Cordis effect tương ứng. Tên trùng lặp trong cùng một lớp sẽ thất bại. Mỗi bên tiêu thụ đều thấy tất cả các định nghĩa hợp lệ; nếu một plugin lệnh không thể chạy trong một kiểu triển khai nào đó, nó đơn giản là không đăng ký trong triển khai đó, thay vì mã hóa cứng danh tính bên tiêu thụ vào lĩnh vực dùng chung.

`list(agent)` trả về danh sách mô tả bất biến, đã sắp xếp theo tên, sau khi áp dụng che khuất theo phạm vi (scope shadowing). `find(agent, name)` phân giải định nghĩa hợp lệ. `execute(agent, line, signal)` phân giải và chạy định nghĩa đã biết, trả về kết quả `success` hoặc `error` đã tách biệt; cú pháp không hợp lệ và tên không xác định trả về `undefined`, việc sinh văn bản lỗi hiển thị trực tiếp do adapter đảm nhiệm.

`parseCommand(line)` yêu cầu `/` ở byte thứ không, theo sau là tên ASCII viết thường gồm chữ cái, chữ số, `_` hoặc `-`, và kết thúc bằng khoảng trắng hoặc hết chuỗi đầu vào. Nó giữ nguyên toàn bộ phần hậu tố mà adapter chuyển giao dưới dạng `rawInput`, bao gồm cả khoảng trắng phân tách. Mỗi plugin lệnh tự chịu trách nhiệm cho mọi quyết định cú pháp sau đó.

### Phạm vi và vòng đời

Đăng ký không có phạm vi (scope) là đăng ký toàn cục. Plugin gắn dưới ngữ cảnh (context) của một agent và inject `commands` sẽ kế thừa khóa phạm vi và vòng đời của agent đó, vì vậy định nghĩa của nó chỉ che khuất định nghĩa toàn cục cùng tên cho đúng agent tương ứng đó. Các plugin con tự khai báo việc inject `commands`, vì `agent.ctx` cố ý kế thừa giao diện phụ thuộc của agent loop cốt lõi; để vòng lặp phụ thuộc vào dịch vụ UI chỉ nhằm thực hiện đăng ký theo phạm vi sẽ đảo ngược đồ thị phụ thuộc.

Đăng ký và gỡ bỏ sẽ phát ra thông báo registry `commands/change` không lọc, không thể phủ quyết. Adapter tính lại view hiệu lực cho từng agent còn tồn tại, thay vì cố suy luận một thay đổi ảnh hưởng đến những phiên nào. Registry cô lập và ghi log riêng lỗi của từng observer, nên một lần làm mới UI bị hỏng không thể rollback thay đổi của plugin khác, cũng không thể chặn các observer tiếp theo. Quyền sở hữu của Cordis sẽ gỡ bỏ định nghĩa khi bên sản sinh, instance UI, hoặc phạm vi agent được unmount, nên HMR sẽ không để lại các mục phát hiện hay handler đã lỗi thời.

### Phân phát trực tiếp và hủy

Lệnh chạy trong một mặt phẳng lệnh chỉ dành cho con người. Registry không chuyển đầu vào thành `user/message`, đầu ra không trở thành sự kiện phiên, và cả hai đều không được gửi ngầm cho mô hình. Handler nhận đúng agent mục tiêu tương ứng, đầu vào gốc, và `AbortSignal` mà yêu cầu này đang giữ; bên sản sinh có thể qua agent đó lên lịch tường minh cho công việc riêng biệt mà mô hình có thể thấy, và bên sản sinh sẽ chịu trách nhiệm ghi log cùng cam kết vòng đời cho công việc đó. Khi tín hiệu bị hủy, registry không còn chờ handler bất hợp tác nữa; handler vẫn có trách nhiệm dừng các tác dụng phụ (side effect) bên ngoài đã khởi động.

Lỗi handler dự kiến trả về `CommandResult.error`. Ngoại lệ bị ném ra hoặc kết quả sai định dạng vẫn là lỗi lệnh mà adapter nhìn thấy, chứ không phải tin nhắn mô hình. Ranh giới này cố ý tách đầu ra UI khỏi thay đổi trạng thái bền vững: ví dụ lệnh mục tiêu có thể thay đổi `ctx.goals`, nhưng trạng thái bền vững do dịch vụ mục tiêu sở hữu.

### Ánh xạ TUI

TUI đăng ký các lệnh slash tích hợp sẵn dưới dạng định nghĩa lệnh theo phạm vi agent, không còn switch trên chuỗi ký tự. View tự động hoàn thành và trợ giúp đọc thư mục theo thời gian thực, nên lệnh của plugin sẽ xuất hiện và biến mất theo effect của nó. Bất kỳ dòng submit nào bắt đầu bằng `/` đều ở lại mặt phẳng lệnh; đầu vào không xác định tạo cảnh báo trên terminal, không rơi vào `Agent.steer()`.

Mỗi lần submit lệnh tạo một `AbortController` riêng. Khi TUI giải phóng, nó sẽ hủy các lần phân phát chưa hoàn tất, gỡ bỏ định nghĩa cục bộ, và chờ fiber của bên sản sinh lệnh kết thúc trước khi hoàn tất dọn dẹp.

## Kiểm thử

Bài test của registry bao phủ ranh giới cú pháp, chuẩn hóa bất biến, xác thực metadata thời gian chạy, sắp xếp xác định, che khuất toàn cục và theo phạm vi, từ chối trùng lặp, giải phóng chính xác, cô lập lỗi thông báo thay đổi, gọi trực tiếp, kết quả dự kiến và sai định dạng, lỗi đồng bộ và bất đồng bộ, cùng mọi thời điểm hủy biên; đạt 100% câu lệnh, nhánh, hàm và dòng theo từng file.

Bài test TUI bao phủ toàn bộ lệnh tích hợp sẵn đã di chuyển, phát hiện plugin theo thời gian thực, làm mới trợ giúp và tự động hoàn thành, kết quả trực tiếp, từ chối lệnh không xác định, chuyển giao đầu vào gốc, gỡ bỏ định nghĩa, rollback khi khởi động, và hủy khi giải phóng. Snapshot terminal không cần khóa (keyless) cố định hình thái trợ giúp, lỗi và kết quả lệnh sau khi render.

## Các phương án thay thế đã cân nhắc

- **Giữ switch cục bộ trong adapter** — không chọn, vì plugin tùy chọn không thể đóng góp phát hiện và hành vi nếu không sửa TUI.
- **Biểu diễn lệnh của con người dưới dạng công cụ mô hình** — không chọn, vì phát hiện và gọi trực tiếp thuộc hành vi UI của con người; định tuyến qua mô hình sẽ tăng độ trễ, chi phí token và việc diễn giải lại.
- **Đặt registry vào core agent spine** — không chọn, vì các điểm chạy không có UI không tiêu thụ nó, còn TUI có thể tường minh compose nó.
- **Để `dsh-agent-loop` inject commands** — không chọn, vì vòng lặp không thực thi cũng không phát hiện lệnh của con người. Bên sản sinh theo phạm vi agent thay vào đó khai báo phụ thuộc UI trong plugin con.
- **Gắn mặt nạ adapter cho từng định nghĩa** — không chọn, vì khả năng hỗ trợ là một sự thật về compose, chứ không phải trạng thái thuộc lĩnh vực lệnh. Mỗi adapter đã compose đều hiển thị các lệnh đã đăng ký; plugin không tương thích sẽ không đăng ký trong triển khai đó.
- **Gửi đầu vào slash không xác định cho mô hình** — không chọn, vì đầu vào sai hoặc hành động trực tiếp không khả dụng phải thất bại một cách có thể dự đoán được, chứ không được thay đổi mặt phẳng thực thi.
- **Lưu bền vững đầu vào và đầu ra lệnh thông thường** — không chọn, vì gợi ý của adapter không phải là trạng thái mà mô hình nhìn thấy. Handler làm thay đổi hành vi bền vững sẽ gọi API của lĩnh vực sở hữu trạng thái đó, và lĩnh vực đó tự ghi log sự kiện của mình.

## Hệ quả

- Bên sản sinh lệnh là plugin có thể gỡ bỏ bình thường, TUI tiêu thụ thư mục đã được xác thực và cam kết phân phát của nó.
- Định nghĩa riêng cho từng agent giữ nguyên phạm vi phẳng và ngữ nghĩa che khuất hiện có, không đưa thêm phụ thuộc core-sang-UI.
- Đầu vào slash không xác định và đầu ra lệnh là hành vi UI xác định, chi phí token mô hình trực tiếp bằng không.
- Việc hủy lệnh trực tiếp và hủy lượt mô hình cô lập với nhau.

## Giới hạn đã biết và các việc hoãn lại

- Metadata đầu vào chỉ giới hạn ở gợi ý văn bản phi cấu trúc. Form có kiểu, schema tham số và bên cung cấp tự động hoàn thành vẫn do lệnh sở hữu, hoặc cần mở rộng registry/bên tiêu thụ sau này.
- Đầu ra lệnh thông thường chỉ tồn tại theo thời gian thực, không được dựng lại sau khi TUI khởi động lại.
- Việc hủy của registry dừng chờ ngay lập tức, nhưng công việc bên ngoài chỉ dừng nếu handler hợp tác với tín hiệu.
- Máy chủ tự động hóa ACP, CLI (giao diện dòng lệnh) không đầu, và điểm chạy JSON-RPC SDK không phơi bày mặt phẳng lệnh; chỉ TUI tiêu thụ nó.
