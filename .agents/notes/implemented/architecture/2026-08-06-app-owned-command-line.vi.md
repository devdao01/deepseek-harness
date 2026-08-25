# Agent Note: Ứng dụng sở hữu command line của chính mình qua `ctx.cmdlineArgs`

Status: implemented

[English](2026-08-06-app-owned-command-line.md) | Tiếng Việt

## Vấn đề

Sau khi profile đã đi vào thực tế, tổ hợp thì cài được nhưng command line thì không. `apps/cli` vẫn khai báo họ flag của Web (`--host`, `--port`, `--dev`, `--workspace-root`, `--trusted-host`) và tham số vị trí cho task chạy một lần, rồi tự sinh patch cho những id dòng mà nó hardcode (`webserver`, `api-gateway`, `connection`, `web-runtime`). Một ứng dụng ngoài cây mã nguồn như [turtle-ui](https://github.com/deepseek-harness/turtle-ui) tuy đóng góp được dòng cấu hình nhưng lại không có chỗ nào để tiếp nhận một flag: `dsh --profile tui --resume <session>` không có nơi nào để parse, còn `dsh --profile web --help` thì in ra help của trình khởi động chứ không phải help của ứng dụng web.

## Quyết định

Trình khởi động chỉ parse phần thuộc về chính nó (`--profile`, `--patch`, dump cấu hình), và giao **mọi thứ nằm sau flag của nó** nguyên vẹn cho cây cấu hình đã được bootstrap. Việc cắt được thực hiện theo vị trí: token đầu tiên mà trình khởi động không nhận ra chính là điểm bắt đầu của tham số ứng dụng (dựa vào `passThroughOptions` + `allowUnknownOption` + `helpOption(false)` của commander). Lệnh `dsh -h` trần trụi không có ứng dụng nào để bàn giao nên vẫn in help của chính trình khởi động.

Package mới `@deepseek-ai/dsh-cmdline` nắm giữ phần bàn giao này. Trình khởi động gọi `provideCmdline(ctx, host)` trước khi bất kỳ entry nào được mount, cung cấp `ctx.cmdlineArgs` (toàn bộ interface của nó chỉ là `get(): readonly string[]`) và `ctx.appExit`. Bất kỳ plugin ứng dụng thông thường nào cũng có thể inject `cmdlineArgs`, gọi `parseCmdline(ctx, program)` với commander program của mình, rồi cung cấp các giá trị đã parse ra ngoài dưới dạng service của riêng ứng dụng trong action của chính program đó. Dòng Loader của nó không mang dấu hiệu đặc biệt của trình khởi động hay kiểu đặc biệt nào, và trình khởi động cũng không đi kiểm tra chủ sở hữu trong tổ hợp. Nhiều plugin có thể đọc cùng một snapshot bất biến; profile không có bên đọc nào thì sẽ bỏ qua tham số ứng dụng của mình. Dòng do phía cung cấp cấu hình sẽ inject service của nó và đọc thẳng service đó trong biểu thức cấu hình lười (`port: !!js ctx.webStartup.port ?? 3080`), nhờ vậy flag thắng giá trị viết ngay cạnh nó, và không có gì bị ghi ngược lại vào bất kỳ dòng nào.

boot chỉ mount trọn bộ tổ hợp một lần. Cordis khiến mỗi dòng chờ phần inject của nó được kích hoạt; ngay trước lúc kích hoạt, Loader mới nội suy `!!js` của dòng đó dựa trên context plugin đã inject xong. Include giữ nguyên các biểu thức của dòng lồng bên trong cho tới khi dòng đích đến thời điểm này. `--help` khiến service của phía cung cấp không bao giờ xuất hiện, nên dòng phụ thuộc sẽ không bao giờ kích hoạt; việc reload patch khi đang hoạt động sẽ nội suy lại dựa trên những service vẫn còn trực tuyến, nhờ vậy cổng đang phục vụ không bị âm thầm đặt lại.

Các ứng dụng đã phát hành đều chuyển flag của mình vào bundle: `dsh-web-app` sở hữu họ flag của Web, `dsh-headless` sở hữu tham số vị trí là task và từ chối theo lỗi cách dùng khi thiếu task. `apps/cli/src/web.ts` đã bị xóa; `runProfile` không còn biết bất kỳ id dòng đích nào của flag. Ngoài cây mã nguồn, turtle-ui cũng có được `--resume <session>` / `--session <id>` theo đúng cách này, và đó mới là phép kiểm chứng thực sự cho thiết kế này: một plugin đã cài thêm được một flag, còn trình khởi động thì không phải sửa gì.

Còn hai hệ quả nữa. Loader mount các dòng anh em một cách đồng thời, nên một dòng có thể đã kích hoạt trong khi dòng khác vẫn đang mount, hoặc cả lượt boot đang quay lui; vì thế bundle Web chỉ công bố URL sau khi cây cấu hình Loader của chính nó đã ổn định. Ngoài ra, plugin runtime của bundle Web cũng nắm giữ đoạn prompt về mã nguồn harness, nhờ vậy `dsh web` và `dsh --profile web` khởi động theo cùng một cách mà không cần thiết lập riêng ở trình khởi động cho Web.

## Vì sao Loader nắm giữ thứ tự

Ba dữ kiện về framework định hình cơ chế này:

- **Các dòng của profile nằm bên trong tùy chọn `patches` của include gốc.** Include khai báo dấu hiệu mang cây `EntryGroup.key` (giống Group), nên Loader giữ nguyên phần cấu hình của nó — danh sách entry và patch, kể cả `path` của chính Include — ở dạng giá trị nguyên văn, thay vì đệ quy đánh giá các node `!!js` lồng bên trong trong context của Include; mỗi biểu thức được phân giải trong fiber của dòng đích của nó.
- **Cordis chỉ kích hoạt fiber sau khi mọi phần inject đã khai báo đều đã kích hoạt.** Ngay trước mỗi lần kích hoạt, Cordis chạy waterfall `internal/config` dựa trên context của chính fiber đó; sau khi Cordis chụp snapshot các service được inject, listener của Loader mới nội suy cấu hình gốc.
- **Việc thay thế phía cung cấp và HMR phải giữ cùng một contract.** Khi fiber kích hoạt lại thì waterfall chạy lại, HMR mang cấu hình gốc sang cho fiber thay thế, còn dòng đang chờ xử lý thì có thể tiếp nhận thay đổi tùy chọn mà không đánh giá sớm biểu thức đối với service còn thiếu.

Nhờ vậy, thứ tự phụ thuộc vẫn do quy trình kích hoạt của Cordis và quy trình nội suy của Loader — vốn chịu trách nhiệm về nó — xử lý. Mỗi dòng giữ `inject` và cấu hình của riêng mình, Loader chỉ mount tổ hợp một lần, còn trình khởi động chỉ cung cấp argv và các service về vòng đời tiến trình.

## Các phương án từng cân nhắc

- **Ghi giá trị đã parse vào từng dòng** (một lần cập nhật cấu hình cho mỗi dòng, cộng thêm một lớp patch trả ngược lại cho trình khởi động, khiến việc reload không thể hoàn tác nó): cách này chạy được, nhưng nó có nghĩa là patch bị chuyền qua lại giữa ứng dụng và trình khởi động, có hai cơ chế cho cùng một việc, và một quy trình thu hồi rồi dựng lại mà tính đúng đắn của nó phụ thuộc vào chi tiết nội bộ của việc Loader khởi động lại. Người bảo trì đã bác bỏ vòng chuyền này; các service để từng dòng đọc đã thay thế toàn bộ.
- **Mở đường bằng cách xóa rỗng `inject` của dòng**: chạy được trong test biệt lập nhưng thất bại trên cây web thật, vì việc xóa rỗng `inject` chính là làm mất phần inject tĩnh của plugin. Trước khi plugin thực sự đi đọc service mà nó đã khai báo, thất bại này diễn ra âm thầm.
- **Để trình khởi động quản lý hai lượt mount**: cách này có thể khiến phía cung cấp kích hoạt trước dòng đọc, nhưng nó lặp lại tổ hợp, biến thứ tự thành trách nhiệm của trình khởi động, và còn che lấp khiếm khuyết của Loader — biểu thức lồng bị đánh giá trong context của include thay vì trong context inject của dòng đích.
- **Để trình khởi động chạy hàm command của từng bundle trước khi boot** (hoàn toàn không đi qua Cordis): nghiêm ngặt thì diễn ra sớm hơn kiểu «boot trước rồi mới help», nhưng nó biến việc khởi động ứng dụng thành một giao thức plugin thứ hai nằm ngoài cây cấu hình. Dùng phía cung cấp thông thường có inject `cmdlineArgs` thì chỉ giữ một giao thức duy nhất, và vẫn dump được, patch được.
- **Để trình khởi động chỉ định cưỡng bức chủ sở hữu command line**: việc từ chối khi có không hoặc nhiều bên đọc có thể phân xử các mục chồng lấn như `-h`, nhưng `get()` là một thao tác đọc bất biến, và tổ hợp thông thường cũng có thể cần nhiều service riêng của ứng dụng. Vì vậy các plugin dùng chung snapshot đó, và tương tác giữa các parser của chúng được xử lý qua tổ hợp thông thường.
- **`instanceof CommanderError`**: plugin ngoài cây mã nguồn sẽ mang theo bản sao commander của riêng nó, nên định danh lớp khác nhau, và phần `--help` vốn đã in ra sẽ bị ném lại thành lỗi nạp chí tử. Thay vào đó, nhận diện lỗi luồng điều khiển của commander theo cấu trúc.

## Hệ quả

- Flag, văn bản help và lỗi cách dùng của ứng dụng nằm cùng chỗ với dòng cấu hình mà chúng cấu hình; thêm một flag cho plugin đã cài không cần sửa trình khởi động.
- Trình khởi động hoàn toàn không nhận biết bất kỳ dòng ứng dụng nào: dòng telemetry vẫn là phép dò tổ hợp duy nhất của nó (dùng cho công tắc môi trường), SIGTERM thoát với mã 0 trên mọi surface, mỗi lần khởi động đều theo dõi layer patch của người dùng, và runner chạy một lần thoát qua `ctx.appExit` như mọi ứng dụng khác.
- `--help` khiến mọi dòng phụ thuộc vào service của phía cung cấp giữ trạng thái chờ xử lý và yêu cầu thoát có giới hạn; các dòng không liên quan có thể kích hoạt đồng thời trước khi bị tháo dỡ.
- Service riêng của ứng dụng không có phía cung cấp được khai báo tĩnh: bundle phát hành dòng tiêu thụ nhưng thiếu phía cung cấp tương ứng sẽ thất bại lúc ổn định, báo ra các entry đang chờ xử lý trỏ tới service đó, chứ không thất bại lúc nạp.
- Nếu patch của người dùng thay thế nguyên khối `config` của một dòng, các biểu thức bên trong sẽ mất theo, và độ ưu tiên của flag trên dòng đó cũng biến mất.
- Flag của trình khởi động phải được viết trước tham số ứng dụng; nếu tham số đầu tiên của ứng dụng tình cờ đúng bằng `web` hoặc `plugin` thì subcommand tương ứng sẽ được chọn; `-V` / `--version` vẫn thuộc trình khởi động trước ranh giới đó; và parser của trình khởi động sẽ nuốt mất một dấu `--`, nên muốn truyền một `--` nguyên văn cho ứng dụng thì phải viết `-- --`.
- `--dump-config` không bao giờ chạy phía cung cấp command line của ứng dụng, nên nó in tổ hợp trước khi bất kỳ tham số ứng dụng nào được parse, và từ chối các lời gọi có mang tham số ứng dụng.
