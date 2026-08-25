# Agent Note: fail-loud giải phóng terminal trước khi thoát

Status: implemented

[English](2026-07-31-fail-loud-releases-the-terminal.md) | Tiếng Việt

## Vấn đề

Lần khởi động `dsh` mà cấu hình không qua được khâu kiểm tra sẽ in ra thông tin chẩn đoán, rồi ném người dùng về một shell hỏng: input không hiển thị, và lệnh tiếp theo còn bị đám text còn sót lại làm rối:

```
dsh: fatal load failure: ValidationError: invalid config:
  - $.providers expected object but got [object Object] (at providers)
$ 1;2;4cecho hello
zsh: command not found: 4cecho
```

Loader mount các entry một cách đồng thời, nên thứ tự entry bị lỗi không đồng nghĩa với thứ tự khởi động. `ui-tui` sẽ được kích hoạt trước và gọi `ProcessTerminal.start()` của pi-tui, hàm này đặt stdin sang chế độ raw, bật bracketed paste, và ghi ra chuỗi thăm dò của giao thức bàn phím Kitty — chuỗi này kết thúc bằng một truy vấn Device Attributes (`ESC [ c`). Ngay sau đó một entry cùng cấp (ở đây là `llm-pi-ai`) rejection vì cấu hình của chính nó.

Vào thời điểm đó, rejection này nổi lên dưới dạng unhandled rejection, còn `installFailLoud` chỉ ghi một dòng ra stderr rồi gọi ngay `process.exit(1)`. (Loader có tính giao dịch giờ đây để lỗi của cây cấu hình được kết toán qua `boot()`, và chính nó tự dispose (giải phóng tài nguyên) phần context đã dựng dở; hook release vẫn canh những rejection mà `boot()` không thấy — các công việc bất đồng bộ trôi nổi của plugin thất bại trong lúc mount hoặc sau khi mount.) Không khâu nào dispose cây này, nên `ProcessTerminal.stop()` không bao giờ chạy: chế độ raw, bracketed paste và giao thức bàn phím đều còn sót lại trên một shell sống lâu hơn tiến trình. Phản hồi của terminal cho truy vấn Device Attributes (`1;2;4c`) chỉ đến sau khi tiến trình đã thoát, và bị shell đọc như là input của người dùng — chính là đoạn text nguyên văn ở trên.

Đường đi `/exit` chưa bao giờ bị ảnh hưởng, vì nó dispose toàn bộ cây và do đó đi vào `shutdown()` của chính TUI: `drainInput()` trước (hấp thụ các phản hồi chưa quay về), rồi `ui.stop()`. Khiếm khuyết nằm ở chỗ **lỗi khởi động** không có đường nào dẫn tới cùng quy trình tháo dỡ đó.

## Quyết định

`installFailLoud` bổ sung callback tháo dỡ `release` tùy chọn, được await ở giữa thông tin chẩn đoán và lúc thoát:

- Thông tin chẩn đoán được ghi ra **trước** release, nên một disposer bị treo hoặc bị lỗi không thể nuốt mất nguyên nhân thất bại.
- Dùng chốt (latch) thay vì gỡ listener, để đảm bảo cái được báo cáo luôn là rejection đầu tiên. Nếu gỡ listener trong lúc tháo dỡ, rejection đồng thời thứ hai sẽ trở thành lỗi không bắt được, và Node sẽ giết tiến trình giữa chừng quá trình tháo dỡ — đúng lúc để lại trạng thái terminal mà lần này ta muốn khôi phục. Các rejection về sau (kể cả của chính release) đều rơi vào luồng thoát đang chờ.
- release bị giới hạn bởi `FAIL_LOUD_RELEASE_TIMEOUT_MS` (2 giây), và rejection của nó bị nuốt. Một disposer bị treo hoặc bị lỗi chỉ làm chậm lần thoát chí mạng, chứ không bao giờ hủy được nó. Bộ định thời này giữ trạng thái **referenced**: nếu `unref()`, Node sẽ thoát với mã 0 ngay sau khi event loop rỗng, đúng vào lúc đang báo cáo thất bại này, vì listener `unhandledRejection` đã ức chế lần thoát chí mạng mặc định.
- Khi không truyền `release`, hành vi hoàn toàn như trước, nên ACP (Agent Client Protocol), JSON-RPC và các bin demo đều không đổi.

Bộ khởi chạy TUI của `dsh` truyền vào một release để giải phóng root context, qua đó chạy `shutdown()` sẵn có của TUI và trả terminal lại.

Bộ khởi chạy bắt root context trong hook `prepare` của `boot()`, thay vì lấy giá trị trả về của nó. Khi rejection xảy ra thì `boot()` chưa kết toán, nên `app.current` — vốn được gán sau `await` — vẫn còn là `undefined` đúng vào khoảnh khắc callback cần đến nó. `prepare` chạy sau khi Loader được cài đặt và trước khi bất kỳ entry nào của cây cấu hình được mount, bao trọn cửa sổ thời gian mà entry có thể rejection.

## Các phương án đã cân nhắc

**Reset terminal ngay trong hàm xử lý fail-loud** (ghi `ESC [ ? 2004 l`, pop giao thức bàn phím, xóa chế độ raw). Cách này lặp lại logic tháo dỡ của pi-tui trong một package vốn không sở hữu terminal, và sẽ trôi lệch theo mỗi lần chuỗi khởi động của pi-tui thay đổi. Nó cũng không hấp thụ được phản hồi Device Attributes chưa quay về — chính thứ làm rối dấu nhắc kế tiếp, và chỉ có thể xử lý bằng cách rút cạn nó khi stdin vẫn còn ở chế độ raw.

**Đăng ký reset terminal bằng `process.on('exit')` trong TUI.** Hàm xử lý exit là đồng bộ, không thể await `drainInput()`, nên phản hồi còn sót vẫn rơi xuống shell; hơn nữa cách này gắn việc tháo dỡ vào một hook toàn cục thay vì đường giải phóng vốn đã tồn tại.

**Để TUI chờ toàn bộ cây kết toán rồi mới khởi động.** Cách này biến Loader vốn cố ý chạy đồng thời thành tuần tự, và làm chậm lần vẽ đầu tiên của mọi lần khởi động bình thường chỉ để sửa một đường lỗi.

**Chỉnh thứ tự cấu hình để `llm-pi-ai` mount trước `ui-tui`.** Thứ tự không phải là bảo đảm mà Loader cung cấp, và trong tương lai bất kỳ entry nào cũng có thể lỗi sau khi TUI đã mount.

## Hệ quả

Lỗi khởi động giờ đây phải trả thêm chi phí một lần giải phóng cây trước khi thoát (giới hạn 2 giây), mã thoát vẫn là 1. Đổi lại, một `dsh` bị cấu hình sai sẽ trả về một shell dùng được, thay vì một terminal phải chạy `stty sane` hoặc `reset` mới khôi phục nổi.

Bảo đảm này thuộc về **bin nào sở hữu terminal**: bất kỳ giao diện nào chiếm trạng thái terminal mà không truyền `release` sẽ tái tạo lại khiếm khuyết này. Bản thân `installFailLoud` không thể nhận biết điều đó, vì nó không thấy được các plugin đã mount đã làm gì với tiến trình.

## Kiểm thử

`packages/boot/app-boot/tests/app-boot.spec.ts` bao phủ giao kèo của release: trước khi cam kết thoát sẽ await hook này; khi hook rejection thì vẫn thoát với mã 1; hook không bao giờ kết toán sẽ thoát sau `FAIL_LOUD_RELEASE_TIMEOUT_MS`; và một chuỗi rejection liên tiếp chỉ báo cáo cái đầu tiên, trong khi release vẫn chạy hết.

Các bài test dựa trên tiến trình giả này không quan sát được hai dạng thất bại quan trọng nhất — mã thoát của tiến trình dưới event loop thật, và trạng thái terminal sau khi thoát — nên ca regression được đặt tại `apps/cli/tests/tui-keyless-smoke.e2e.ts`. Nó khởi động cây cấu hình xuất xưởng trong một PTY thật với `fixtures/tui-invalid-provider.cordis.yml` (`providers` ở dạng list, đúng kiểu lỗi mà người dùng thật hay mắc), kỳ vọng mã thoát là 1, và khẳng định luồng byte bắt được chứa đồng thời rejection khởi động có nhãn (`dsh: plugin tree failed to load:`) và `ESC[?2004l`. Cùng ca test này ghim đường khởi động từ đầu tới cuối: chính nó đã phát hiện [deadlock khởi động do lần quét đầu tiên của HMR (thay thế module nóng)](2026-08-03-hmr-initial-scan-boot-deadlock.md), vốn thoát lặng lẽ với mã 13 và không khôi phục trạng thái terminal.

Đường `/exit` giữ nguyên các khẳng định vốn có, xác nhận rằng khi thoát bình thường thì chuỗi reset đó cũng xuất hiện.
