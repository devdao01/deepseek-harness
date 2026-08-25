# Agent Note: Trình bày và điều hướng TUI hợp nhất

Status: implemented
Archived: 2026-08-04

[English](2026-07-28-consolidated-tui-presentation.md) | 中文

## Problem

UI terminal dần tích lũy nhiều bộ quy tắc trình bày gây nhiễu lẫn nhau: các vai trò bảng màu (palette) trở thành bí danh lẫn nhau, hoặc đảo ngược cấp bậc nhấn mạnh trên terminal nền sáng; khung, đầu ra và dấu thoát của thẻ công cụ trùng lặp hoặc tranh giành sự chú ý; ngữ cảnh được tiêm vào bị coi như XML để parse, không thể gấp lại đáng tin cậy; `/resume` loại trừ các phiên không thuộc workspace hiện tại ngay cả khi có thể truy cập workspace khác qua launcher. Mỗi triệu chứng nhìn có vẻ cục bộ, nhưng chỉ có một mô hình đọc terminal bền vững: bảng màu tinh gọn và có thể kiểm chứng, thẻ đặt trạng thái lên đầu và phần thân thụt vào, gấp bản ghi không phụ thuộc nội dung, và điều hướng nhận biết workspace.

## Decision

### Bảng màu

`paletteSpec(scheme)` là bảng duy nhất chứa mã bắt đầu SGR, mã kết thúc, và mục đích sử dụng. `createPalette` suy ra tất cả các wrapper từ bảng đó, `/palette` in cùng bảng này trong terminal đang chạy. Ngoại trừ gradient thương hiệu khởi động cố định, các component không tự phát ra chuỗi SGR. Mỗi mã kết thúc reset toàn bộ nhóm SGR mà mã bắt đầu tương ứng đã thiết lập.

Các vai trò trùng lặp được hợp nhất: `muted` nhập vào `dim`, `added` nhập vào `success`, `removed` nhập vào `error`, màu nhấn mạnh thứ hai không dùng đến bị loại bỏ. `dim` dùng `2;39` trong cả hai bảng màu, và kết thúc bằng `22;39`, khiến văn bản thụt vào tối hơn tương đối so với màu foreground của terminal, thay vì trở thành màu xám cố định trên nền sáng. TypeScript đánh dấu riêng màu và thuộc tính, cho phép kết hợp thuộc tính với màu, đồng thời từ chối các màu lồng nhau sẽ mất màu lớp ngoài do reset.

### Thẻ công cụ

Thẻ công cụ gồm một dòng tiêu đề trạng thái có màu `Tool / <name>` và một khối thân đồng nhất màu dim. Tiêu đề của renderer, lệnh terminal và dòng cwd, đầu ra, văn bản XML và dấu gấp đều dùng sắc độ thân. Màu diff vẫn được giữ, vì đỏ/xanh mang ý nghĩa; dấu hiệu (signal) cũng tiếp tục hiển thị như lỗi.

`renderUnknownXml` nhận tường minh style thân cho kết quả công cụ chưa biết. Renderer terminal parse và loại bỏ dấu thoát hoặc tín hiệu cuối cùng hướng tới mô hình trước khi trả về `TerminalResultView.output`; TUI chỉ trình bày trạng thái có cấu trúc một lần. Việc cắt bớt, timeout và thông tin sandbox vẫn nằm trong thân, vì dấu trạng thái không thể hiện các sự kiện này.

### Ngữ cảnh được tiêm vào và gấp

Ngữ cảnh được tiêm vào được `ContextCardComponent` trình bày như văn bản thuần, không đi qua renderer cây XML. Chỉ loại bỏ các dòng `<system-reminder>` lớp ngoài khớp chính xác theo cặp; văn bản không khớp, chỉ có một phía, hoặc thẻ tương tự nằm trong thân đều được giữ nguyên. Nội dung hướng tới mô hình không đổi. Việc gấp dùng hàm hỗ trợ `preview` dùng chung sau khi thân đã được lắp ráp xong, do đó chỉ phụ thuộc vào số dòng, không phụ thuộc việc parse có thành công hay payload chứa những ký tự nào.

`Ctrl+O` chuyển vòng giữa gấp, mở, và ẩn. Trạng thái ẩn loại bỏ thẻ công cụ cùng với khoảng cách đầu dòng riêng của thẻ. Thẻ ngữ cảnh tham gia trạng thái gấp và mở, nhưng khi công cụ bị ẩn thì quay về trạng thái gấp, vì chỉ dẫn được tiêm vào không phải là lưu lượng công cụ có thể bỏ đi. Giai đoạn ẩn còn gấp các bước assistant của mỗi lượt thành một thông điệp; quy tắc này do [Agent Note gấp bước assistant ở chế độ ẩn](../feature/2026-07-29-tui-hidden-mode-assistant-fold.md) phụ trách.

### Khôi phục xuyên workspace

Bộ chọn khôi phục tổng hợp tất cả bản ghi, và duy trì phạm vi workspace hiện tại/tất cả workspace có thể chuyển bằng Tab. Phạm vi mặc định là workspace hiện tại; chỉ phạm vi rộng hơn mới hiển thị nhãn workspace. Bản ghi không có cwd sẽ bị từ chối, vì không có thư mục nào để vào.

`TuiResumeHost.handoff` nhận `SessionId` đã chọn và cwd được đọc lại lúc kiểm tra trước. CLI chuyển thư mục trước khi giải phóng ứng dụng hiện tại, do đó thư mục không thể truy cập sẽ thất bại khi terminal vẫn còn có thể khôi phục; sau đó `execve` kế thừa workspace đã chọn. Thông báo thoát cũng do launcher cung cấp, thay vì để TUI tự suy ngược cú pháp lệnh của launcher.

## Alternatives considered

**Giữ một Agent Note và bản sửa cục bộ riêng cho từng triệu chứng thị giác.** Bác bỏ: các quyết định này chia sẻ cùng một tầng đọc, và nhiều lần thay thế lẫn nhau. Một bản ghi duy nhất sở hữu quy tắc cuối cùng về bảng màu, thẻ, ngữ cảnh và điều hướng, giúp người đọc không cần dựng lại thứ tự thay đổi.

**Giữ bí danh, và dựa vào quy ước để thực thi quy tắc trình bày.** Bác bỏ: bí danh ngụ ý sự khác biệt không tồn tại; reset màu lồng nhau hoặc kết thúc SGR không đầy đủ sẽ thất bại âm thầm. Một bảng duy nhất kèm ràng buộc kiểu khiến hợp đồng có thể kiểm chứng và xác minh cơ giới.

**Giữ phân lớp màu khung/đầu ra bên trong thẻ công cụ.** Bác bỏ: thẻ thực tế trộn lẫn foreground mặc định, lệnh màu cyan, cwd dim, XML không style và đầu ra dim. Tiêu đề trạng thái đã cung cấp điểm neo để quét mắt; thân thụt vào đồng nhất giúp loại bỏ nhiễu.

**Tiếp tục parse hoặc sửa ngữ cảnh được tiêm vào thành XML.** Bác bỏ: framework nhắc nhở chỉ là quy ước bọc văn bản thuần tùy ý, trong đó sẽ chứa `&`, biểu thức so sánh và placeholder dấu ngoặc nhọn nguyên bản. Việc sửa hoặc escape hoặc là đoán cấu trúc, hoặc thay đổi văn bản hiển thị với mô hình.

**Ẩn thẻ ngữ cảnh cùng với thẻ công cụ.** Bác bỏ: ngữ cảnh mang chỉ dẫn được tiêm vào, không phải chi tiết thực thi có thể khôi phục lại. Do đó giai đoạn ẩn chỉ loại bỏ lưu lượng công cụ.

**Giới hạn khôi phục trong một workspace, hoặc suy luận cwd sau khi khởi động.** Bác bỏ: cách trước buộc người dùng phải tự khởi động lại; cách sau khôi phục cwd tiêu đề phiên không kiểm soát việc phân giải đường dẫn của hệ thống file và shell. Thư mục đích phải vượt qua interface host trước khi thay thế tiến trình.

**Loại bỏ dấu trạng thái thoát của TUI, hoặc loại bỏ dấu thoát hướng tới mô hình.** Bác bỏ: cái trước là trạng thái UI tiện quét, cái sau là tín hiệu trạng thái của mô hình. Renderer tiêu thụ dấu văn bản khi dựng view có cấu trúc, khiến hai nhóm đối tượng mỗi bên thấy một dạng biểu diễn.

## Consequences

Bản ghi giờ hiển thị như tiêu đề trạng thái có màu và chi tiết thụt vào; ngữ cảnh trình bày ổn định với bất kỳ văn bản thuần nào; một phím tắt điều khiển mật độ bản ghi. Vai trò `TuiTheme.muted` công khai bị loại bỏ, extension chuyển sang dùng `dim`. Hợp đồng bảng màu và `renderUnknownXml` chặt chẽ hơn, đổi lấy một chút ma sát lúc biên dịch để phòng chống mất style âm thầm.

Khôi phục xuyên workspace sẽ chuyển mọi công cụ phụ thuộc phân giải đường dẫn sang một thư mục khác. Không thể bàn giao khi cwd thiếu hoặc không thể truy cập. Phạm vi lựa chọn rộng hơn cũng khiến việc truy cập đồng thời vào kho lưu trữ phiên dùng chung dễ xảy ra hơn; khóa phiên xuyên tiến trình vẫn là công việc tiếp theo độc lập.

Renderer terminal vẫn sẽ coi dòng đầu ra cuối cùng khớp chính xác cú pháp dấu thoát là trạng thái có cấu trúc, do đó nếu lệnh cố ý in ra một dòng như vậy, thân thẻ có thể mất dòng đó. `dsh-tool-bash` đã ghi nhận giới hạn còn tồn đọng này.

## Testing

Unit test TUI và snapshot terminal không cần key bao phủ liệt kê bảng màu, vai trò sáng/tối, tổ hợp style hợp lệ và không hợp lệ, thân thẻ dim đồng nhất, màu diff giữ nguyên ngữ nghĩa, chỉ một trạng thái thoát và thân không có dấu, khung ngữ cảnh văn bản thuần, gấp không phụ thuộc nội dung, vòng lặp ba trạng thái Ctrl+O, lọc mô hình và hai phạm vi khôi phục. Test bàn giao CLI bao phủ việc truyền cwd đã đọc lại, và từ chối khi chuyển thư mục thất bại trước khi giải phóng. Test tool-bash cố định việc sinh, parse và loại bỏ dấu kết quả thành cùng một hợp đồng khứ hồi trong một lượt.
