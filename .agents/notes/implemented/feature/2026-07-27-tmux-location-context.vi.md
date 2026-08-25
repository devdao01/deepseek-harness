# Agent Note: Ngữ cảnh vị trí tmux

Status: implemented

[English](2026-07-27-tmux-location-context.md) | Tiếng Việt

## Vấn đề

Agent (tác tử) chạy bên trong tmux không thể cho mô hình biết mình đang ở đâu: tiến trình chiếm session, window, pane nào, và window được bố cục ra sao. Khi người dùng thao tác trên nhiều pane, họ mong mô hình định vị được vị trí của chính nó, để những chỉ dẫn kiểu «pane bên dưới» hay «window này» được phân giải. Vị trí phải đến với mô hình dưới dạng ngữ cảnh bền vững, dựng lại được, chứ không phải một giá trị trong system prompt bị ghi đè tại chỗ, và phải không tốn chi phí gì khi vị trí không thay đổi.

tmux phơi bày những thông tin này mà không cần tiến trình nền: `$TMUX_PANE` định danh pane chứa tiến trình, còn `tmux display-message -t "$TMUX_PANE" -p '<format>'` có thể in ra trường pane/window/session bất kỳ. Vấn đề còn để ngỏ là quan sát bằng cách nào — kéo (pull) ở mỗi lần chuẩn bị, hay để tmux hook đẩy (push) — và làm sao tránh được chi phí token theo từng bước cùng trạng thái ẩn trong tiến trình.

## Quyết định

`@deepseek-ai/dsh-tmux-context` là một plugin dạng hàm bật theo tùy chọn, nằm ở `packages/context/tmux-context/`, đứng cùng hàng với các phần bổ sung ngữ cảnh request có giới hạn khác vốn không định nghĩa công cụ lẫn dịch vụ. TUI đã bàn giao sẽ mount nó, vì ngữ cảnh trình ghép kênh terminal là đặc thù của giao diện này; `dsh-agent-spine-demo` cùng các giao diện Web/headless thì giữ im lặng.

**Kéo ở bước đầu tiên của mỗi lượt, chứ không để tmux đẩy.** Plugin đăng ký trước một listener `agent/pre-step` và chỉ hành động khi `step === 1`. Mô hình kéo không cần tiến trình nền, không cần cài hook vào tmux của người dùng, cũng không cần dọn dẹp; nó đọc lại trạng thái hiện hành ở mỗi lượt, nên pane bị di chuyển, đổi tên hay bố cục lại đều được nhận biết một cách tự nhiên. Việc lấy bước đầu tiên làm cửa ải khiến số đọc được sinh ra theo lượt: vị trí là ổn định trong một lượt, nên truy vấn lặp lại theo từng bước chỉ làm tăng chi phí mà không mang lại thông tin mới. Pane bị di chuyển giữa chừng một lượt sẽ được phản ánh ở lượt kế tiếp, đây là đánh đổi được chấp nhận để đổi lấy một thiết kế đơn giản hơn.

**Đọc qua seam `ctx.shell`, tuyệt đối không dùng `child_process` trần.** Listener chạy các lệnh chỉ đọc tmux/`ps` qua `ctx.shell`, nhờ đó áp dụng sandbox và chính sách của bên triển khai, và plugin không sở hữu bất kỳ đoạn mã tiến trình con nào. Việc thiếu `ctx.shell`, thiếu môi trường tmux, số trường không khớp, hay pane id rỗng đều khiến lần thử này trở thành thao tác rỗng, nhất quán với cách `agent-instructions` không làm gì khi không có provider `fs`.

**Xác định pane thật bằng tty, chứ không chỉ dựa vào `$TMUX_PANE`.** `$TMUX_PANE` được thừa kế: terminal khởi động từ một shell tmux (terminal tích hợp của VS Code, trình khởi chạy trên desktop) sẽ mang theo `$TMUX`/`$TMUX_PANE` từ tiến trình tổ tiên đó, ngay cả khi tiến trình không hề nằm trong pane ấy, và nếu không xử lý thì sẽ tiêm vào một vị trí cũ và sai. Lệnh này dùng `ps -o tty= -p <pid>` (truyền vào pid của chính agent ngay trong tiến trình) để phân giải terminal điều khiển của tiến trình hiện tại, rồi so sánh với `#{pane_tty}` của pane; chỉ khi khớp mới xuất ra các trường. Pane thật sự sở hữu tty của tiến trình hiện tại; môi trường thừa kế lại trỏ tới tty của một pane khác, nên được đọc là «không ở trong tmux». Chuyển sang kiểm tra `$TMUX` cũng chẳng ích gì — biến đó cũng bị thừa kế y hệt. Đây là căn cứ phân biệt mang tính quyết định, và không cần duy trì một danh sách các trình giả lập terminal.

**Chỉ vị trí của chính mình và bố cục.** Các trường được truy vấn gồm session name, window index/name, pane index/id, cờ hoạt động của window/pane và `window_layout`. Bỏ qua kích thước theo pixel của pane và window (cây bố cục đã truyền tải cấu trúc; kích thước thì nhiễu và thay đổi mỗi lần terminal co giãn). Không bao giờ thu thập nội dung của pane lân cận (`capture-pane`), giữ cho số đọc nhỏ gọn và tránh thu thập những đầu ra không liên quan, có thể nhạy cảm.

**Chỉ tiêm khi có thay đổi, kèm cận dưới khoảng thời gian tùy chọn.** Khi cần, plugin gọi `agent.inject()` để tiêm một `user/message` có nguồn gốc `{ kind: 'plugin', plugin: 'tmux-context' }`. Cơ chế chặn khi không đổi sẽ so sánh khối trạng thái đã render (toàn bộ phần sau dòng tiền tố lượt) với lần tiêm gần nhất từ cùng nguồn gốc đó, lần tiêm này được lấy bằng cách quét các sự kiện session bền vững thô — nhờ vậy việc lập lịch sống sót qua nén (compaction) và khôi phục tiến trình mà không cần cache trong tiến trình. Tùy chọn `refreshIntervalMs` (được kiểm tra thủ công là số nguyên an toàn không âm lúc nạp plugin) sẽ chặn thêm những lần tiêm cách lần tiêm gần nhất chưa đủ khoảng thời gian đó.

### Văn bản

```text
tmux location (turn <turn>):
session <session>, window <index> "<name>", pane <index> <pane-id>
window active=<0|1>, pane active=<0|1>, layout <window-layout>
```

Tiền tố lượt là dòng đầu tiên hay biến động; hai dòng khối trạng thái bên dưới nó mới là đơn vị được cơ chế chặn khi không đổi đem ra so sánh, nhờ đó việc tiêm lại được điều khiển bởi trạng thái tmux, chứ không phải bởi vị trí trong vòng lặp.

### Tính bền vững và việc dựng lại request

Mỗi số đọc là một node bề mặt thông thường cho tới khi bị nén che khuất; plugin không đóng góp gì cho việc lắp ráp system prompt, và `request/header` cũng không mang theo bất kỳ đoạn văn bản tmux-context nào. Số đọc ghi lại một lần thử chuẩn bị, chứ không phải một bước đã được commit: vì listener đăng ký trước chạy đầu tiên, nên khi các listener `agent/pre-step` sau đó hủy lần thử này hoặc làm nó thất bại thì phần được thêm vào vẫn có thể còn lại, và log chỉ-thêm-vào không quay lui.

Plugin đồng hành `./invariant` được phát hành không đăng ký bất kỳ kiểm tra runtime nào: số đọc là ảnh chụp theo lượt của trạng thái tmux bên ngoài, trong session không tồn tại quan hệ liên sự kiện nào cần kiểm chứng, còn việc lập lịch và định dạng thì đã được các bài kiểm thử pipeline của chính package này pin lại.

## Hệ quả

Agent khởi động bên trong tmux giờ đây nhận được vị trí session/window/pane của chính mình cùng bố cục window dưới dạng ngữ cảnh bền vững, có gắn nhãn nguồn gốc, và được cập nhật theo lượt khi vị trí thay đổi. TUI đã bàn giao chọn bật tính năng này; các bản triển khai tùy chỉnh có thể tổ hợp plugin này trực tiếp. Bên ngoài một pane tmux thật — kể cả những terminal chỉ thừa kế `$TMUX`/`$TMUX_PANE` — hoặc khi không có executor `ctx.shell`, plugin vẫn ở trạng thái trơ và không báo lỗi, nên tổ hợp nó ở bất cứ đâu cũng an toàn. Vì số đọc là một `user/message` bền vững, nó chịu quá trình nén như lịch sử thông thường, không đóng góp gì cho việc lắp ráp system prompt và request header, và mỗi lượt có thay đổi vị trí thì tăng thêm nhiều nhất một thông điệp hai dòng. Mô hình kéo làm phát sinh thêm một tiến trình con `tmux display-message` (qua seam bash đã được sandbox hóa) ở bước đầu tiên của mỗi lượt đến hạn. Cận dưới khoảng thời gian tùy chọn được kiểm tra trước khi truy vấn, nên nó chặn cả truy vấn lẫn việc tiêm; còn việc vị trí không thay đổi thì chỉ biết được bằng cách so sánh trạng thái mà truy vấn trả về, nên nó chỉ chặn việc tiêm, chi phí truy vấn thì vẫn phải trả.

## Kiểm thử

Các bài kiểm thử đơn vị pin lại: việc tiêm ở bước đầu tiên cùng metadata nguồn gốc/bề mặt; lệnh lấy `$TMUX_PANE` làm khóa (kèm phần bảo vệ so sánh `#{pane_tty}` của nó với `ps -o tty=`); cửa ải theo bước; cơ chế chặn khi không đổi xuyên qua các lượt và việc tiêm lại khi pane di chuyển; cơ chế chặn theo khoảng dương và ngưỡng; từng đường đi thao tác rỗng (không có bash, thoát khác 0, số trường không khớp, pane id rỗng, signal đã hủy, và việc executor từ chối do `resolve()` hoặc `run()` ném lỗi thì được hứng lại và ghi cảnh báo thay vì làm hỏng lượt đó); thứ tự đăng ký trước đứng trước các listener `agent/pre-step` thông thường; khả năng chịu lỗi với số đọc lịch sử bị hỏng (khối không phải văn bản, văn bản một dòng); và việc cấu hình từ chối khoảng thời gian âm hoặc không nguyên. Độ phủ theo từng tệp đạt 100%.

## Các phương án đã cân nhắc

- **Để tmux hook/trình theo dõi nền đẩy dữ liệu** — bác bỏ: cần cài hook vào tmux của người dùng và đưa vào một tiến trình nền kèm việc dọn dẹp, chỉ để đổi lấy độ mới trong từng bước mà ngữ cảnh theo lượt vốn không cần.
- **Chạy ở mọi bước** — bác bỏ: vị trí ổn định trong một lượt; truy vấn lặp lại chỉ tăng chi phí token mà không có thông tin mới. Lấy `step === 1` làm cửa ải thì thu được số đọc theo lượt.
- **`child_process` trần** — bác bỏ: đi vòng qua đường đi chính sách sandbox, và tự viết tay đoạn mã tiến trình con mà executor `ctx.shell` vốn đã có.
- **Bao gồm kích thước pixel của pane/window** — bác bỏ: kích thước thay đổi mỗi lần co giãn, chỉ thêm nhiễu; cây bố cục đã truyền tải cấu trúc.
- **Dùng `capture-pane` để thu nội dung pane lân cận** — bác bỏ: cồng kềnh, nhiễu và liên quan tới quyền riêng tư; vượt quá phạm vi «vị trí của chính mình».
- **Khối động trong system prompt** — bác bỏ: thay thế một giá trị sẽ xóa mất các số đọc lịch sử vốn chống lưng cho suy luận trước đó và không dựng lại được; một thông điệp bền vững, có nguồn gốc sẽ ghi lại vị trí mỗi khi nó trở nên nhìn thấy được.
- **Tin rằng cứ có `$TMUX_PANE` (hoặc `$TMUX`) là đủ** — bác bỏ: cả hai đều bị thừa kế bởi terminal khởi động từ một shell tmux (terminal tích hợp của VS Code), khiến tiến trình không thuộc pane nào lại tiêm vào vị trí cũ. Phép so sánh giữa `#{pane_tty}` của pane với terminal điều khiển của tiến trình hiện tại mới là kiểm tra mang tính quyết định.
- **Lập danh sách đen cho các trình giả lập terminal đã biết (ví dụ `TERM_PROGRAM=vscode`)** — bác bỏ: danh sách không đầy đủ và sẽ phình mãi, vẫn bỏ sót các trình khởi chạy khác; phép so sánh tty thì chính xác và không phụ thuộc trình khởi chạy.
- **Dùng invariant runtime để kiểm chứng lượt, vị trí và định dạng của từng số đọc** — ban đầu có phát hành kèm package, sau đó bị gỡ bỏ: nó suy diễn lại từ log chính lịch trình của bên sản xuất, và khẳng định biểu thức chính quy trên đoạn văn bản mà chính package đó vừa render ra, nên chỉ là nhắc lại `apply()` chứ không kiểm tra một quan hệ độc lập nào. Mọi kiểu thất bại mà nó có thể báo đều buộc phải sửa package này trước, mà các bài kiểm thử pipeline của chính package đã bao phủ những trường hợp đó rồi. Chỉ đưa lại kiểm tra đồng hành khi xuất hiện một quan hệ mà bản thân plugin không tính ra — chẳng hạn khi số đọc về sau có thứ tự liên lượt hoặc nghĩa vụ bao gói mà package khác có thể phá vỡ.
