# Agent Note: Hot reload cấu hình không được giết hoặc làm suy giảm ứng dụng đang chạy

Status: implemented

[English](2026-07-20-config-hot-reload-resilience.md) | 中文

## Problem

Một chỉnh sửa `cordis.yml` không hợp lệ không được phép giết agent (trợ lý thông minh) đang chạy; nhưng nếu một bản cập nhật trông có vẻ hợp lệ trước tiên thay thế một phần cây Loader, rồi các mục cấu hình sau đó mới thất bại, thì chỉ giữ cho tiến trình sống sót là chưa đủ. Bên gọi còn cần quan sát được các bản cập nhật trực tiếp bị từ chối, đồng thời không được để cùng một lỗi đó bị coi là lỗi khởi động chưa được xử lý. Cấu hình cá nhân còn đặt ra yêu cầu thứ hai: HMR (thay thế module nóng) phải theo dõi một file chính xác nằm ngoài thư mục gốc module của nó, kể cả khi file đó hoặc thư mục cha của nó chỉ được tạo sau khi khởi động.

## Decision

Các plugin vòng đời Cordis và Loader trong vendor cung cấp giao dịch cấu hình có thể await và có bù trừ, và được ghi lại trong [vendor/README.md](../../../../vendor/README.md) như các sửa đổi cục bộ số 6, 8, 9.

`Fiber.update()` trả về kết quả của waterfall (sự kiện kiểu thác nước) `internal/update` của nó. Việc kiểm tra hợp lệ cấu hình vẫn đồng bộ, còn continuation mặc định trả về promise khởi động lại. Nhờ vậy, cập nhật mục cấu hình Loader có thể phân biệt được lỗi kiểm tra hợp lệ, import, áp dụng và rollback, cũng như việc vòng đời hoàn tất thành công. `EntryTree.await()` sẽ kiểm tra lại các fiber bị chặn bởi service sau khi các tác vụ Loader được rút cạn, và reject khi fiber đã kết thúc ở trạng thái thất bại; fiber đang chờ service còn thiếu vẫn là mục cấu hình pending hợp lệ, không làm treo việc kết thúc.

Loader sẽ import tên module đã thay đổi trước, rồi mới dispose (giải phóng tài nguyên) fiber đang hoạt động. Nó await việc áp dụng của ứng viên; nếu thất bại, nó dispose các effect của ứng viên và khôi phục plugin hoặc cấu hình trước đó. Việc đối soát theo nhóm sẽ khởi động các ứng viên song song, chờ từng kết quả, và sẽ khôi phục các mục cấu hình đã thay đổi, được thêm, bị xóa và bị di chuyển trước khi reject. Chỉ khi thay đổi theo chương trình thành công thì mới lưu bền vững. Đây là một giao dịch bù trừ: các effect vòng đời có thể thoáng nhìn thấy được; lỗi rollback được báo cáo dưới dạng `AggregateError`, chứ không bị gọi nhầm là cây đã được giữ nguyên.

Include đọc và kiểm tra hợp lệ nội dung ứng viên chưa được commit, áp patch lên bản sao của nó, đối soát cây Loader, rồi mới commit nội dung cache và dữ liệu đã phân tích. Sau lỗi phân tích, kiểm tra hợp lệ, áp dụng hoặc rollback, `refresh()` sẽ reject về phía bên gọi. Lần nạp đầu tiên vẫn báo lỗi rõ ràng; chỉ khi file không tồn tại mới được dùng `initial`. Kết quả YAML/JSON nếu không phải mảng thì là không hợp lệ; cả việc làm mới file lẫn cập nhật cấu hình Include đều áp lại patch, và không sửa đổi kết quả phân tích đã cache.

HMR bao chứa các rejection của lần làm mới trực tiếp. Phương thức `registerConfig(filename, refresh)` của nó lắng nghe một đường dẫn chính xác, bắt đầu từ thư mục tổ tiên gần nhất còn tồn tại, tuần tự hóa và gộp các lần làm mới, rồi trả về một disposer bất đồng bộ; disposer này sẽ đóng watcher và rút cạn công việc đang hoạt động. Cả việc làm mới theo đường dẫn chính xác lẫn theo file cấu hình thông thường đều dùng hàng đợi này. Lỗi được chuẩn hóa thành `Error`, ghi vào log, và phát đi qua sự kiện song song `hmr/config-update-failed(filename, error)`; các observer phát sinh rejection sẽ được ghi lại, nhưng không chặn các lần làm mới sau đó. Việc tạo, thay đổi và xóa đều được quan sát.

## Alternatives considered

**Bao chứa lỗi ngay trong `Include.refresh()`.** Đã bác bỏ, vì làm vậy khiến host HMR không thể phát đi lỗi, mà vẫn cho phép việc đối soát của Loader che giấu tình trạng áp dụng một phần. Include chịu trách nhiệm phân tích và commit nội dung ứng viên; HMR chịu trách nhiệm bao chứa và quan sát.

**Khởi động lại tiến trình mỗi lần chỉnh sửa cấu hình.** Đã bác bỏ, vì effect của Cordis vốn đã cung cấp vòng đời plugin có thể đảo ngược, và lỗi cú pháp hay lỗi plugin tùy chọn không nên vứt bỏ các session đang diễn ra chỉ để khôi phục tổ hợp trước đó.

**Cam kết thay thế nguyên tử không thể quan sát được.** Đã bác bỏ, vì không thể chụp snapshot cho effect của plugin bất kỳ. Chờ việc áp dụng hoàn tất rồi bù trừ tường minh sẽ cho kết quả cuối cùng ổn định, đồng thời không tuyên bố rằng observer không nhìn thấy các chuyển trạng thái vòng đời trung gian.

## Consequences

- Lỗi làm mới trực tiếp sẽ reject ở bên trong; khi bù trừ thành công, cây nguyên vẹn trước đó được giữ hoặc khôi phục, và một lỗi có kiểu được phát đi, chứ không trở thành rejection chưa được xử lý.
- Lỗi rollback là quan sát được, và có thể khiến một mục cấu hình không dùng được; sự kiện và log sẽ không gọi nhầm rằng nó đã được khôi phục.
- Fiber đang chờ phụ thuộc đã khai báo vẫn là mục cấu hình pending hợp lệ: vòng đời hoàn tất chỉ có nghĩa là công việc hiện tại không có gì thất bại, chứ không có nghĩa mọi phụ thuộc đều tồn tại.
- Watcher cấu hình theo đường dẫn chính xác chỉ tăng tài nguyên hệ thống file cho các đường dẫn đã đăng ký, và được giải phóng cùng fiber HMR sở hữu nó.
- Loader, Include, HMR trong vendor và các định nghĩa kiểu sự kiện lõi càng lệch xa upstream hơn; toàn bộ các nhánh rẽ này được duy trì trong vendor manifest (bản kê metadata).

## Testing

`packages/boot/app-boot/tests/config-reload.spec.ts` khởi động cây Loader/Include tạm thời thật, và bao phủ việc từ chối lỗi phân tích và lỗi hình dạng dữ liệu, import trước rồi mới dispose, khôi phục plugin/cấu hình, rollback nhiều mục cấu hình, vô hiệu hóa tổ tiên, hội tụ overlay, đồng nhất đối tượng option, cập nhật trực tiếp thất bại thì không lưu bền vững, cùng thao tác di chuyển theo chương trình thất bại. `packages/boot/app-boot/tests/hmr-config.spec.ts` bao phủ đường dẫn chính xác đã tồn tại và còn thiếu, thêm/thay đổi/xóa, gộp tuần tự hóa, rút cạn khi dispose, chuẩn hóa các giá trị không phải `Error`, phát đi lỗi, cùng việc bao chứa các observer phát sinh rejection. `packages/host/webserver/tests/webserver.spec.ts` chứng minh lỗi khởi động do service chặn sẽ khiến tổ hợp Loader reject kèm chẩn đoán bind của nó; `packages/typert/loader/tests/loader.spec.ts` thì diễn tập việc xóa theo chương trình có thể await thông qua bên tiêu thụ Loader thật; còn snapshot `pty-tools` của ACP (Agent Client Protocol) ngăn việc tổ hợp song song làm thay đổi thứ tự các đoạn prompt cùng mức ưu tiên.
