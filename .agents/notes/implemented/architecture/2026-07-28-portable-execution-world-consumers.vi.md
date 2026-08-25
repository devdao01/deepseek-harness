# Agent Note: Các consumer có thể di chuyển được dựa trên thế giới thực thi filesystem và quản lý tiến trình

Status: implemented

[English](2026-07-28-portable-execution-world-consumers.md) | Tiếng Việt

## Vấn đề

Seam filesystem và quản lý tiến trình khiến việc truy cập file và truy cập tiến trình thường có thể thay thế được, nhưng PTY và LSP vẫn gọi trực tiếp API Node của host. Do đó, dù hành vi domain không thay đổi, provider thực thi từ xa vẫn có vẻ như cần các package PTY và LSP độc lập. Các package này sẽ chỉ trở thành các adapter nông cạn: mỗi package chỉ đơn thuần sao chép lại một consumer hiện có để thay thế thao tác file và tiến trình.

Thế giới coding từ xa chỉ hữu ích khi thao tác file, lệnh, terminal và language server chia sẻ chung một danh tính sandbox. Nếu chuyển toàn bộ harness vào sandbox đó, việc thử nghiệm provider sẽ bị vướng vào với việc nạp plugin, credential, transport model, tính bền vững của session, giám sát và triển khai.

Pipe thường không thể đáp ứng một trong các yêu cầu này. Terminal bền vững cần cấp phát PTY, kiểm tra nhóm tiến trình foreground và gửi signal, cùng với việc dọn dẹp toàn bộ phiên terminal. Nếu giả định có thể dựng lại các thao tác này trong `dsh-terminal-bash` dựa trên handle `spawn()` thường, kết quả cuối cùng hoặc là rò rỉ chi tiết nội bộ của provider, hoặc làm suy yếu contract vòng đời của nó.

## Quyết định

`ctx.fs` và `ctx.subprocess` cùng nhau định nghĩa một thế giới thực thi. Các provider được mount cùng nhau phải mô tả cùng một namespace đường dẫn, file thực thi, tiến trình và phiên terminal; năng lực ở tầng trên tiêu thụ hai interface này, chứ không tham chiếu tới provider cụ thể.

Interface filesystem chịu trách nhiệm về các sự thật đường dẫn mà các năng lực khác cần, đồng thời không phơi bày danh tính đích mờ (opaque) của nó: chuẩn hóa đường dẫn tiến trình, chuẩn hóa `file:` URI và quan hệ bao hàm (containment). Các thao tác văn bản đầy đủ và văn bản dạng stream hiện có vẫn thuộc về filesystem; consumer giao thức tự thực thi giới hạn giữ lại (retention cap) của riêng mình khi tiêu thụ stream.

Interface quản lý tiến trình chịu trách nhiệm về việc tìm kiếm file thực thi và các nguyên thủy tiến trình: spawn tiến trình thường ở mode thô hoặc thu thập, và `spawnTerminal()`. Thao tác terminal là một nguyên thủy sâu, handle của nó chịu trách nhiệm về I/O văn bản, nhóm tiến trình foreground, gửi signal, và một thao tác TERM→KILL phải được chờ đợi; thao tác này sẽ quyết toán mọi lời gọi handle đang trên đường tới, và khiến mọi thành viên phiên mà provider vẫn có thể quan sát được dừng hẳn hoàn toàn. Signal của nó chỉ hủy cấp phát; một khi handle đã được phát hành, nó chịu trách nhiệm cho vòng đời của chính mình. Việc phát hiện prompt, suy luận trạng thái rảnh, scrollback, chính sách sandbox và vòng đời chủ sở hữu vẫn thuộc về consumer PTY.

Các consumer dùng chung sử dụng thế giới thực thi này:

- `dsh-bash-local` tiếp tục ánh xạ ngữ nghĩa Bash sang `ctx.subprocess.spawn()` thường.
- `dsh-lsp-stdio` đọc mã nguồn qua `ctx.fs` và xác thực quan hệ bao hàm, resolve và khởi động language server qua `ctx.subprocess`, và để file URI do provider chịu trách nhiệm xuyên suốt qua việc khởi tạo và render kết quả. Một tín hiệu vòng đời của provider sẽ hủy các thao tác filesystem và giao thức trong lúc dispose (giải phóng tài nguyên), bao gồm cả việc tìm kiếm workspace trước khi nắm quyền sở hữu hàng đợi; JSON-RPC, pooling, đồng bộ hóa và chuẩn hóa của nó giữ nguyên không đổi.
- `dsh-terminal-bash` ánh xạ ngữ nghĩa shell bền vững sang `ctx.subprocess.spawnTerminal()`. Cách triển khai `node-pty` cục bộ và kiểm tra tiến trình di trú vào `dsh-subprocess-local`; các provider quản lý tiến trình khác cung cấp cùng nguyên thủy này. `danger-full-access` không cần `ctx.sandbox`; chế độ hạn chế đòi hỏi phải có provider sandbox trong cùng thế giới thực thi, khi chưa được mount sẽ thất bại trước khi spawn. Khi provider bắt đầu ghi, hệ thống sẽ bỏ đi bằng chứng về prompt và trạng thái im lặng đã thu thập được trong lúc kiểm tra trước khi ghi bất đồng bộ. Việc hủy sẽ giữ lại chỗ dành riêng cho việc gửi trong lúc lượt ghi đang trên đường tới được quyết toán, sau đó gửi signal tới nhóm tiến trình foreground, nên cả byte bị trễ lẫn signal đó đều không thể rơi vào lượt gửi kế tiếp; việc kiểm tra sẵn sàng đang trên đường tới không thể giải phóng chỗ dành riêng đó, và khi ghi bị từ chối thì cũng không gửi signal. Deadline tuyệt đối vẫn được giữ bật trong suốt quá trình hủy. Việc gửi signal thất bại sẽ trở thành một lỗi truyền tải mang tính chung cuộc. Sau khi kiểm tra cũ hoàn tất, việc polling sẽ được khôi phục cho lượt gửi hiện tại. Việc hủy lúc khởi động sẽ bắt đầu ngay việc rollback terminal, mà không chờ kiểm tra sẵn sàng hay lời gọi gửi signal bị đình trệ. Thao tác đóng sẽ từ chối signal công khai mới, và ủy quyền việc dừng hẳn hoàn toàn của các thành viên phiên mà provider có thể quan sát được cho thao tác chấm dứt phải chờ đợi trên handle.

## Ranh giới của E2B POC

Cách triển khai E2B có thể bật tùy chọn nằm dưới `packages/e2b/` chỉ có đúng ba package chuyên biệt cho provider: `dsh-e2b` tạo một sandbox, và xóa nó khi timeout hoặc dispose (giải phóng tài nguyên); `dsh-fs-e2b` triển khai `ctx.fs`; `dsh-subprocess-e2b` triển khai `ctx.subprocess` dựa trên E2B Commands, PTY và nhóm tiến trình Linux từ xa. Cả hai adapter đều lấy handle SDK duy nhất từ chủ sở hữu, tuyệt đối không tạo sandbox riêng.

E2B chịu trách nhiệm về filesystem mutable, lệnh được quản lý và tiến trình Bash, cấp phát terminal và nhóm phiên terminal, tiến trình language server và việc đọc mã nguồn, cùng các file riêng của adapter nằm dưới `.dsh-e2b`. Host chịu trách nhiệm về đối tượng Cordis và plugin, agent loop (vòng lặp tác nhân), trạng thái agent, trạng thái session và trạng thái goal, session log và tính bền vững, lời gọi LLM (mô hình ngôn ngữ lớn), prompt và tool, quyền, skill (kỹ năng), điều phối subagent, buffer PTY và trạng thái sẵn sàng, trạng thái giao thức LSP, và buffer SDK/mạng của E2B. Lớp phủ này không upload cũng không đồng bộ workspace của host.

Adapter chỉ giữ lại cơ chế của nền thực thi. Việc chuẩn hóa filesystem đi qua transport lệnh đã được SDK decode bằng cách phân khung base64 nghiêm ngặt cộng NUL; việc đọc dạng stream để lại giới hạn byte cho consumer tự thực thi. Output lệnh và snapshot môi trường của quản lý tiến trình dùng ASCII/base64, tránh việc SDK decode theo mảnh làm mất byte; shell điều khiển riêng cô lập profile, các lần khởi động sau đó sẽ đặt rỗng những biến môi trường được phát hiện mang đặc điểm tên credential. Việc dọn dẹp tiến trình và terminal dùng nhóm tiến trình từ xa, và chứng minh dừng hẳn hoàn toàn trước khi quyết toán.

Trạng thái sandbox được cố ý giữ ngắn hạn: timeout và dispose sẽ xóa file từ xa và trạng thái không được quản lý. POC này không cung cấp việc kết nối lại, giữ pause/leave, backend persistence session, trình dựng template, volume, snapshot, tầng chính sách mạng, thư mục sandbox, đồng bộ workspace, handle từ xa bền vững, và cũng không chạy toàn bộ harness bên trong nó.

## Xác thực

Bộ test package có mục tiêu tập trung chốt cứng vòng đời sandbox, việc phân khung đường dẫn chuẩn hóa, metadata filesystem và version nguyên tử, việc phát hành/rollback của quản lý tiến trình, I/O văn bản terminal và dọn dẹp phiên, giới hạn output, hủy, dispose và đăng ký bất biến. Một lượt lắp ráp Loader được khóa bởi credential chạy cùng bộ tổ hợp ba package provider qua cả import mã nguồn lẫn export sau khi build, bao gồm khả năng hiển thị FS/Bash, profile đăng nhập độc hại, output UTF-8 bị tách qua ranh giới byte, việc dọn dẹp tiến trình và terminal, truy vấn LSP, việc cô lập workspace của host, và việc xóa sandbox cuối cùng.

## Các phương án thay thế đã cân nhắc

**Giữ riêng các package PTY và LSP cho từng provider từ xa.** Không chấp nhận, vì cách này sẽ triển khai lại cơ chế provider chồng lên seam hiện có. Việc kiểm tra bằng cách xóa đã bộc lộ vấn đề này: xóa các adapter đó không nên khiến hành vi domain bị rải rác vào provider từ xa; consumer dùng chung vốn đã chịu trách nhiệm về các hành vi đó.

**Tạo sandbox riêng cho mỗi năng lực hoặc tool.** Không chấp nhận, vì thao tác file và tiến trình sẽ không thể chia sẻ danh tính hay trạng thái, từ đó phá vỡ use case coding, và làm tăng số lượng chủ sở hữu vòng đời.

**Mô hình hóa terminal như một tiến trình con pipe thường.** Không chấp nhận, vì pipe không thể cấp phát terminal điều khiển, xác định nhóm tiến trình foreground hiện tại, hay chứng minh phiên terminal đầy đủ đã được dọn dẹp. Một nguyên thủy terminal nhỏ hơn việc phơi bày một lối thoát đặc thù cho nền thực thi, đồng thời cũng biểu đạt contract trung thực hơn.

**Chuyển việc phán đoán sẵn sàng của PTY và chính sách phiên vào service quản lý tiến trình.** Không chấp nhận, vì đây thuộc về ngữ nghĩa của consumer terminal bền vững, chứ không phải cơ chế tiến trình OS. Provider quản lý tiến trình chịu trách nhiệm về những thao tác mà chỉ nền thực thi của nó mới có thể hoàn thành; `dsh-terminal-bash` chịu trách nhiệm về ngữ nghĩa terminal của Harness.

**Phơi bày riêng thao tác chấm dứt terminal và dừng hẳn hoàn toàn, cùng với một bộ điều khiển vòng đời dùng chung.** Không chấp nhận, vì mọi consumer terminal đều cần cùng một kết quả dọn dẹp duy nhất. Việc tách thao tác sẽ phơi bày sổ sách của provider, observer có giới hạn và ngữ nghĩa retry, mà không có consumer production nào sử dụng; để provider cung cấp một thao tác phải chờ đợi thì interface sâu hơn.

**Thêm nguyên thủy đọc có giới hạn ổn định vào seam filesystem.** Không chấp nhận, vì chỉ LSP cần giới hạn byte cho toàn bộ document, và nó có thể tự thực thi giới hạn đó khi tiêu thụ stream văn bản hiện có. Nguyên thủy thứ hai sẽ buộc mỗi provider phải triển khai handle ổn định và cơ chế không theo symbolic link, provider từ xa thậm chí cần thêm giao thức phụ, mà không có lỗi thay thế đồng thời nào đã được quan sát thấy.

**Chạy toàn bộ harness trong môi trường từ xa.** Không chấp nhận, vì đây là một mô hình triển khai khác. Việc làm cho năng lực thực thi có thể di chuyển được không có nghĩa là phải di chuyển lời gọi model, trạng thái session, trạng thái plugin hay agent loop.

**Đặt mọi thao tác của provider vào một package chủ sở hữu dùng chung.** Không chấp nhận, vì danh tính và vòng đời sandbox là mối quan tâm duy nhất của chủ sở hữu. Filesystem và quản lý tiến trình giữ lại contract, test và consumer độc lập của riêng mình, đồng thời tránh biến chủ sở hữu thành một tập năng lực không có ranh giới.

**Chỉ triển khai thao tác filesystem từ xa qua lệnh shell.** Không chấp nhận, vì cách này sẽ vứt bỏ danh tính filesystem có cấu trúc, lỗi, output dạng stream, bảo vệ version và ngữ nghĩa thay đổi nguyên tử mà các file tool hiện có đang tiêu thụ.

**Thêm abstraction runtime phân tán chung, hoặc kết nối lại handle đang hoạt động.** Không chấp nhận, vì seam năng lực hiện có đã mang theo contract đã được chứng minh, mà chỉ dựa vào danh tính từ xa thì không thể dựng lại callback, promise đang chờ xử lý, quyền, trạng thái giao thức hay con trỏ output. Thêm một tầng chỉ để suy đoán về vấn đề persistence và đồng bộ nằm ngoài ranh giới của POC.

## Hệ quả

Provider thực thi từ xa chỉ cần triển khai chủ sở hữu sandbox dùng chung, cùng với adapter filesystem và quản lý tiến trình. Bash, PTY và LSP được lắp ráp trên các adapter này, nên việc sửa lỗi cho những năng lực này vẫn độc lập với provider.

Interface nền tảng rộng hơn, một cặp provider filesystem/quản lý tiến trình phải nhất quán trên cùng một thế giới thực thi. Thao tác mới thêm chỉ giới hạn ở những sự thật và cơ chế vòng đời mà consumer dùng chung hiện tại cần; schema model, việc phân khung giao thức, chính sách sẵn sàng và hiển thị sẽ không thấm vào provider.

Cách triển khai cục bộ tiếp nhận `node-pty` và việc kiểm tra tiến trình theo nền tảng, vì nó chịu trách nhiệm về cơ chế terminal cục bộ. Việc di trú code này không làm suy yếu việc tháo dỡ terminal: dispose (giải phóng tài nguyên) sẽ dọn dẹp tiến trình con cả trước lẫn sau khi chấm dứt shell cấp cao nhất, giữ lại tiến trình con được bảo vệ bởi hàng rào danh tính PID chính xác trong lúc chờ kiểm tra foreground, và tiếp tục theo dõi các thành viên phiên Linux vẫn còn sống sau khi tiến trình cấp cao nhất đã thoát. macOS không thể liệt kê phiên POSIX sau khi session leader của nó đã thoát, nên việc tiến trình con được đặt lại cha giữa hai lần chụp snapshot kiểm tra vẫn là một giới hạn rõ ràng của provider cục bộ, chứ không phải lý do để chuyển cơ chế tiến trình về lại consumer PTY.

Việc lắp ráp E2B chứng minh rằng chủ sở hữu sandbox dùng chung cộng với adapter filesystem và quản lý tiến trình là đủ để đưa thế giới coding mutable ra khỏi host, trong khi vẫn giữ năng lực tầng trên độc lập với provider. Các giới hạn POC của nó vẫn được ghi rõ: SDK sẽ giữ lại toàn bộ nội dung transport lệnh trong bộ nhớ host; việc khởi động từ xa không thể phát hành PID đồng bộ; không thể có được trạng thái chờ stdin terminal chính xác và sự thật signal độc lập; các thao tác dựa trên PID/PGID dạng số không có hàng rào danh tính; việc dò môi trường ban đầu không thể ẩn secret mặc định chưa biết của sandbox khỏi các tiến trình cùng UID đang chạy; sản phẩm của adapter sẽ được giữ lại cho tới khi sandbox bị xóa. Đây là các giới hạn của provider, không phải lý do để đưa vào shim tương thích hay thêm nhiều package E2B hơn.
