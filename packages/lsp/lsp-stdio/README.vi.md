# @deepseek-ai/dsh-lsp-stdio

[English](README.md) | 中文

**Backend máy chủ ngôn ngữ stdio tổng quát** cho `ctx.lsp`. Một instance plugin nhận một bảng máy chủ có tên, và đăng ký một nhà cung cấp cách ly cho từng mục cấu hình. Nó đọc thông qua `ctx.fs`, và khởi chạy thông qua `ctx.subprocess`, do đó máy chủ và tệp nguồn luôn nằm trong cùng một thế giới thực thi (execution world) đã được mount (gắn kết). Đây là host tổng quát, không phải danh mục hay bộ cài đặt máy chủ ngôn ngữ: việc triển khai cần cấu hình tường minh lệnh và ánh xạ, các cấu hình dựng sẵn nên đặt trong overlay `cordis.yml`.

Plugin dạng Namespace (`name`/`inject`/`Config`/`apply`, không có default export).

## Chức năng

- Giải quyết từng thiết lập cục bộ của máy chủ trước khi đăng ký; ánh xạ không hợp lệ hoặc xung đột đăng ký sẽ rollback (khôi phục) các mục cấu hình đã xử lý trước đó, do đó việc nạp thất bại sẽ không để lại route nhà cung cấp nào.
- Mỗi cặp `(server id, canonical workspace target)` (id máy chủ, đích workspace chuẩn hóa) chỉ khởi tạo lười một tiến trình máy chủ theo kiểu single-flight (một luồng thực thi duy nhất). Khi máy chủ vẫn còn sống, lỗi trả về sẽ không kích hoạt thử lại; nếu transport (kênh truyền) đã pooled (gộp) được chọn gặp sự cố trước hoặc trong khi truy vấn chỉ đọc, nhà cung cấp sẽ đợi dispose (giải phóng tài nguyên) của nó hoàn tất, rồi thử lại truy vấn đó một lần trên tiến trình mới.
- Mỗi truy vấn dùng chuỗi **mở tạm thời** ưu tiên tính tương thích: đọc dạng stream tệp nguồn qua `ctx.fs`, đồng thời giải quyết và giới hạn số byte của nó; sau đó thực hiện `textDocument/didOpen` (phiên bản 1, văn bản đầy đủ), thao tác được yêu cầu, rồi `textDocument/didClose` nằm trong `finally`. Nếu ghi `didOpen` thất bại hoặc bị hủy, instance đó sẽ bị chấm dứt trước khi pool tái sử dụng nó. Tài liệu được đóng sau mỗi lần gọi, do đó phiên bản đầu tiên không cần `didChange`, cache nội dung hay LRU tài liệu.
- Thực thi tuần tự vòng đời đọc nguồn/mở/truy vấn/đóng của mỗi workspace thông qua một hàng đợi có thể hủy theo từng workspace, do đó các lệnh gọi đang xếp hàng chỉ đọc nguồn hiện tại khi đến lượt mình; các workspace khác nhau chạy song song. Việc dispose nhà cung cấp sẽ hủy công việc hệ thống tệp và giao thức, đợi các workspace lookup chưa vào hàng đợi hoàn tất, sau đó rút cạn từng hàng đợi và từng máy chủ.
- Sau khi shutdown giao thức thất bại, sẽ chấm dứt cây tiến trình con của máy chủ thông qua seam tiến trình con (tín hiệu process group POSIX; `taskkill /T /F` trên Windows). Kết quả phân phối của việc chấm dứt cây được hấp thụ tại chỗ giống như mọi tín hiệu process group khác, không ném ra ngoài (có tồn tại race condition giữa việc phân phối và việc máy chủ thoát); việc máy chủ đã dừng hoàn toàn hay chưa được xác nhận bởi việc handle chờ cây tiến trình sống hay không, chứ không phải bởi kết quả của lần chấm dứt này.
- Giải quyết file thực thi, cwd, tiến trình và luồng giao thức của máy chủ thông qua `ctx.subprocess`; `initialize.processId` là `null`, vì một máy khác hoặc PID namespace khác không được phép giám sát tiến trình harness.
- Dùng quan hệ chứa (containment) đã chuẩn hóa, file URI, và xác thực văn bản dạng stream do `ctx.fs` cung cấp, nhưng không phát ra `fs/observed`: chỉ kết quả LSP hiển thị cho model, do đó truy vấn không thỏa mãn chính sách đọc trước ghi sau.

## Cấu hình

Key của record `servers` là provider id (id nhà cung cấp) ổn định được giữ chỗ trên `ctx.lsp`; mỗi giá trị có cấu trúc sau:

| Server key | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| `command` | (bắt buộc) | File thực thi cần spawn: đường dẫn tuyệt đối, hoặc được giải quyết từ PATH của tiến trình con tại thời điểm nạp. Không dùng shell để khởi chạy. |
| `args` | `[]` | Tham số truyền cho file thực thi. |
| `env` | `{}` | Biến môi trường bổ sung được gộp vào trên môi trường credential đã được dọn dẹp (biến khớp `KEY`/`PASSWORD`/`SECRET`/`TOKEN` sẽ không được chuyển tiếp); mục `DSH_*` tường minh được gộp sau giá trị cùng tên trong môi trường đã bị xóa của seam. |
| `extensionToLanguage` | (bắt buộc) | Phần mở rộng viết thường, bắt đầu bằng dấu chấm → LSP language id (ví dụ `{ '.ts': 'typescript' }`). |
| `initializationOptions` | `null` | Tùy chọn `initialize` tĩnh được chuyển tiếp cho máy chủ. |
| `configuration` | `null` | Câu trả lời tĩnh cho mỗi mục cấu hình `workspace/configuration`. |
| `maxMessageBytes` | `16000000` | Kích thước tối đa của một message đã đóng khung (framed) đơn lẻ chấp nhận từ máy chủ. |
| `maxStderrBytes` | `1000000` | Kích thước tối đa của đuôi stderr được giữ lại để chẩn đoán. |
| `maxDocumentBytes` | `4000000` | Giới hạn kích thước tệp nguồn tối đa mà host này có thể mở. |
| `shutdownTimeoutMs` | `5000` | Ngân sách thời gian cho `shutdown`/`exit` êm ái trước khi nâng cấp. |
| `killGraceMs` | `2000` | Thời gian ân hạn cho việc hủy request và nâng cấp SIGTERM→SIGKILL. |

`servers` phải chứa ít nhất một mục cấu hình, mỗi id phải không rỗng. Ngân sách bộ định thời phải là số nguyên dương, và không vượt quá giới hạn định thời `2_147_483_647` ms của Node. Tất cả file thực thi đều được giải quyết tại thời điểm nạp sau khi dọn dẹp credential; mục cấu hình lỗi phía sau sẽ ngăn mọi nhà cung cấp đăng ký. Tiến trình được khởi động lười tại truy vấn khớp đầu tiên.

## Hành vi giao thức

Việc khởi tạo sẽ khai báo `general.positionEncodings: ['utf-16']`, `workspace: { workspaceFolders: true, configuration: true }`, `textDocument.hover.contentFormat: ['markdown', 'plaintext']`, cùng `linkSupport: true` dùng cho định nghĩa và triển khai, và không đăng ký động. Capability mà máy chủ trả về có quyền quyết định cuối cùng: thao tác không được hỗ trợ, hoặc thiếu cơ chế đồng bộ để mở/đóng tạm thời, sẽ khiến truy vấn thất bại. Khi máy chủ bỏ qua `positionEncoding` thì mặc định là `utf-16`; giá trị khác đều là lỗi giao thức. Client trả lời `workspace/configuration` thông qua cấu hình tĩnh, chấp nhận các request ghi sổ vòng đời, và từ chối `workspace/applyEdit`: nó không bao giờ được áp dụng chỉnh sửa hoặc chạy lệnh. Điều hướng ánh xạ trực tiếp `Location`, và ánh xạ từ `targetUri` + `targetSelectionRange` của `LocationLink`; việc chuẩn hóa hover sẽ lấy `MarkupContent.value` hợp lệ, giữ nguyên `MarkedString` dạng string, render giá trị có gắn language tag thành code block dạng fenced, và nối các phần tử mảng bằng một dòng trống. Kết quả thiếu, phạm vi hoặc vị trí sai định dạng, và mã hóa hover sai định dạng, đều thất bại dưới dạng lỗi `LSP_MALFORMED_RESPONSE` có cấu trúc.

## Ranh giới an toàn

Nhà cung cấp tin cậy máy chủ đã cấu hình của nó, không cung cấp bất kỳ cách ly sandbox nào. Nó ủy quyền việc chuẩn hóa danh tính, quan hệ chứa, đọc file thường dạng stream, xác thực UTF-8, và mã hóa file URI cho `ctx.fs`; và từ chối các nguồn truy vấn thiếu, không phải file thường, không phải UTF-8, quá lớn, hoặc nằm ngoài workspace sau khi chuẩn hóa trước khi khởi động máy chủ. Quan hệ chứa được đánh giá trước khi mở stream, không cam kết giữ danh tính handle ổn định trong quá trình thay thế đường dẫn song song. Vị trí kết quả có thể nằm bên ngoài, nhưng đường dẫn bên ngoài không thể trở thành nguồn truy vấn. Việc triển khai phải mount hệ thống tệp và nhà cung cấp quản lý tiến trình mô tả cùng một thế giới thực thi; tổ hợp thế giới bị chia tách là không hợp lệ.

## Trải nghiệm model

Ảnh hưởng gián tiếp thông qua `dsh-tool-lsp`; tool đó trình bày kết quả đã chuẩn hóa của nhà cung cấp này, bản thân host này không đóng góp prompt hay schema nào.

#### Ảnh hưởng KV Cache

Không làm mất hiệu lực trực tiếp; thay đổi prefix (tiền tố) request do `dsh-tool-lsp` chịu trách nhiệm.

## Hạn chế đã biết và công việc hoãn lại

- **Không cung cấp chính sách cách ly**: gói (package) này tin cậy máy chủ đã cấu hình, không áp đặt sandbox lên tiến trình của nó; việc triển khai bị giới hạn phải cung cấp nhà cung cấp tiến trình/hệ thống tệp phù hợp, hoặc dùng lớp bọc sandbox trong cùng thế giới thực thi.
- **Giới hạn dưới về tính tương thích khi mở tạm thời**: máy chủ bỏ qua mở/đóng trong capability đồng bộ (hoặc khai báo `None`) không được hỗ trợ, kể cả khi truy vấn tài liệu đóng vẫn hoạt động; e2e TypeScript cố định chỉ thiết lập một giới hạn dưới về tính tương thích, không đại diện cho cam kết đa ngôn ngữ.
- **Độ trễ tuần tự hóa theo từng máy chủ/workspace**: các agent (tác tử) song song dùng chung một máy chủ và workspace sẽ xếp hàng sau một tiến trình; các tiến trình workspace có vòng đời dài sẽ chiếm dụng bộ nhớ cho đến khi dispose.
- **Harness bị buộc kill sẽ để lại máy chủ ngôn ngữ**: `initialize.processId: null` đã hủy việc giám sát PID client phía máy chủ, do đó máy chủ chỉ có thể được dọn dẹp bởi dispose êm ái của dịch vụ; harness bị SIGKILL sẽ để chúng tiếp tục chạy cho đến khi tự thoát.
