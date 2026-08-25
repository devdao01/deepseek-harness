# @deepseek-ai/dsh-terminal-bash

[English](README.md) | 中文

Đây là backend shell bền vững dựa trên `ctx.subprocess.spawnTerminal`, cung cấp cho `ctx.terminals`. Nó khởi động shell tương tác dưới `ctx.sandboxPolicy` dùng chung, giữ lại đầu ra theo từng dòng có giới hạn và phát hiện trạng thái sẵn sàng; provider quản lý tiến trình chịu trách nhiệm cấp phát PTY, xóa môi trường, nhóm tiến trình foreground, gửi tín hiệu và dọn dẹp toàn bộ terminal session. Nhờ vậy, cùng một backend PTY có thể kết hợp với provider của thế giới thực thi cục bộ hoặc từ xa.

## Plugin (`terminal-bash`)

Plugin này inject `pty`, `sandboxPolicy` và `subprocess`, sau đó đăng ký loại backend đã cấu hình (`shell`). `danger-full-access` khởi động shell trực tiếp mà không cần provider sandbox; chế độ hạn chế đòi hỏi phải có `ctx.sandbox` trong cùng thế giới thực thi, và bọc argv shell chính xác thông qua nó, chưa mount thì sẽ thất bại trước khi spawn. Khi spawn, một lần gọi `ctx.sandboxPolicy.resolve({ session })` sẽ đồng thời cho biết chế độ thực tế và thư mục gốc workspace của session; khi bên gọi bỏ qua cwd, cùng thư mục gốc đó cũng là cwd mặc định của shell. Khi một chủ sở hữu nào đó đang có PTY mở hoặc đang spawn, nếu thay đổi cấu hình dẫn tới chế độ thực tế khác, hệ thống sẽ từ chối thay đổi đó trước khi sự kiện `sandbox/mode` tương ứng được commit. Giới hạn này gắn với chủ sở hữu chính xác, nên ngay cả khi provider nạp lại và giữ nguyên session hiện có, nó vẫn có hiệu lực. Trước khi đổi chế độ, hãy chờ việc tạo hoàn tất và đóng session, để tránh terminal được mở với quyền rộng hơn tiếp tục tồn tại sau khi quyền đã bị hạ cấp.

Phát hiện sẵn sàng kết hợp các cơ chế sau: dấu prompt bash riêng được xác thực bởi trạng thái foreground, fact provider báo cáo đang chờ stdin ở foreground, fallback im lặng và timeout tuyệt đối. Chỉ khi phần đuôi có thể in được sau dấu riêng mới nhất khớp hoàn toàn với `PS1` được kiểm soát thì mới coi là sẵn sàng; điều này đúng ngay cả khi dấu OSC và prompt bị tách thành nhiều callback dữ liệu. Do đó, input hoặc output được echo lại sau prompt trước đó không thể khiến send hiện tại hoàn tất. `PROMPT_COMMAND` được kiểm soát sẽ đặt lại `PS1` này trước mỗi lần in prompt, nên việc ghi đè prompt bên trong shell sẽ không khiến các send tiếp theo suy biến về trạng thái sẵn sàng im lặng. Prompt và bằng chứng im lặng mà provider thu thập trước khi ghi, kể cả bằng chứng thu thập trong lúc kiểm tra foreground trước khi ghi vẫn đang chờ, đều sẽ bị loại bỏ tại ranh giới ghi. Nếu bash in ra dấu trước khi provider terminal công bố trạng thái đã giành lại nhóm tiến trình foreground, việc polling sẽ giữ lại trạng thái ứng viên đó thêm `handoffGraceMs` sau ngưỡng im lặng thông thường, để việc chuyển giao foreground xảy ra gần như đồng thời có cơ hội thắng. Do đó, tiến trình con tương tác kế thừa `PROMPT_COMMAND` không thể liên tục ngăn suy luận sẵn sàng do rảnh rỗi (idle) cho tới khi hết timeout tuyệt đối. Trạng thái foreground không xác định không bao giờ được coi là tín hiệu dương tính cho trạng thái rảnh rỗi chính xác. Tương tự, việc nhóm tiến trình foreground đang chờ stdin từ trước một lần send không có nghĩa là đã sẵn sàng sau khi ghi: phải quan sát được cùng nhóm tiến trình đó thoát khỏi trạng thái chờ, rồi lại vào trạng thái chờ lần nữa thì send đó mới được coi là hoàn tất; nhóm tiến trình foreground thay đổi thì tính là bằng chứng mới. Trong quá trình khởi động chưa được công bố, đường fallback đòi hỏi đã quan sát được đầu ra; im lặng với đầu ra bằng không không thể công bố một session rỗng, timeout thì từ chối spawn. Thao tác hủy sẽ đóng shell chưa được công bố, và từ chối với đúng nguyên nhân hủy do bên gọi cung cấp; `TerminalBackendCleanupError` sẽ giữ riêng các lỗi dọn dẹp. Signal của bên gọi được chuyển tiếp tới việc cấp phát terminal và khởi tạo sẵn sàng; sau khi công bố, handle chịu trách nhiệm về vòng đời của chính nó. Chuỗi điều khiển terminal chưa hoàn chỉnh bị giới hạn bởi `maxReadBytes`; vượt giới hạn thì hệ thống sẽ loại bỏ nội dung cho tới ký tự kết thúc của nó. Đầu ra terminal có UTF-8 sai định dạng sẽ dùng ký tự thay thế; ký tự xuống dòng cuối cùng được giữ lại qua các callback, để CRLF bị tách ra được gộp lại thành một dấu xuống dòng.

Khi hủy một lần send, hệ thống sẽ đánh dấu input đang xếp hàng là đã hủy trước, sau đó yêu cầu handle terminal gửi `SIGINT` thật tới nhóm tiến trình foreground hiện tại; việc kiểm tra trước khi ghi bất đồng bộ, kể cả khi kết toán sau đó, cũng không thể thực thi input này. Nếu việc ghi của provider đang diễn ra, việc gửi tín hiệu sẽ chờ nó kết toán; khi việc ghi bị từ chối thì sẽ không gửi tín hiệu. Send đã hủy sẽ giữ nguyên vị trí của nó cho đến khi cả việc ghi lẫn việc gửi tín hiệu foreground đều kết toán, nên các send kế tiếp sẽ không nhận được byte trễ hoặc tín hiệu đó. Do đó, việc ghi hoặc gửi tín hiệu của provider mà không bao giờ kết toán sẽ giữ vị trí đó vô thời hạn; cách khắc phục là đóng session (`terminal_close`). Trong thời gian chờ hủy, deadline tuyệt đối vẫn có hiệu lực. Việc gửi tín hiệu thất bại là lỗi tầng truyền tải terminal, sẽ từ chối send đang hoạt động. Việc hủy không bao giờ mô phỏng ngắt bằng cách ghi `\x03`, do đó, ngay cả khi chương trình chạy ở chế độ raw, vẫn có thể hủy được. Thao tác đóng sẽ từ chối các tín hiệu công khai mới, dừng việc polling sẵn sàng, và chờ việc chấm dứt toàn bộ session hoàn tất — việc này thuộc trách nhiệm của provider handle — rồi mới kết toán send đang hoạt động thành `session_exit`.

## Trải nghiệm model

### Chính sách file hiện tại và bên tiêu thụ gián tiếp

#### Model nhìn thấy gì

Bên sở hữu chính sách sẽ đóng góp context `sandbox:policy` không phụ thuộc vào năng lực cụ thể. Model, thông qua `@deepseek-ai/dsh-tool-terminal` hoặc các bên tiêu thụ PTY khác, còn có thể nhận được MOTD có giới hạn, phần gia tăng khi gửi, trang scrollback, nguyên nhân sẵn sàng và lỗi dọn dẹp.

#### Ảnh hưởng Token

Trong suốt thời gian backend này được nạp, mệnh đề chính sách hiện tại sẽ luôn tồn tại. Trước khi bên tiêu thụ trả về đầu ra có giới hạn, scrollback PTY được giữ lại sẽ không đi vào lịch sử của model.

#### Ảnh hưởng KV Cache

Khi chính sách thường trú thay đổi, một snapshot context runtime do bên sở hữu render, thay thế trạng thái trước đó, sẽ được nối thêm sau phần lịch sử đã giữ lại; kết quả của bên tiêu thụ vẫn chỉ nối thêm (append-only).

## Hạn chế đã biết và công việc hoãn lại

- Đầu ra được chuẩn hóa theo từng dòng; không hỗ trợ tương tác buffer thay thế toàn màn hình (full-screen alternate buffer).
- Việc phát hiện chính xác trạng thái chờ stdin phụ thuộc vào provider quản lý tiến trình đã được mount; provider không thể chứng minh trạng thái đó sẽ dùng dấu prompt và cơ chế sẵn sàng dựa trên im lặng/timeout.
- Đảm bảo dọn dẹp lấy theo đảm bảo của `SubprocessTerminalHandle`; những khoảng trống đặc thù của provider thuộc về quy ước của bản triển khai đó, không phải của bên tiêu thụ PTY này.
- Session không thể tiếp tục tồn tại sau khi tiến trình harness thoát.
