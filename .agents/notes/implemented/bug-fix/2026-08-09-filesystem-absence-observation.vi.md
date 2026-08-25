# Agent Note: Sự vắng mặt trong hệ thống file là một quan sát, tạo có bảo vệ không bao giờ thực hiện thay thế

Status: implemented

[English](2026-08-09-filesystem-absence-observation.md) | Tiếng Việt

## Vấn đề

Chính sách hệ thống file được chốt sự kiện ban đầu chỉ ghi lại đọc thành công và thay đổi thành phiên bản mục tiêu. Nếu một phiên đọc file, sau đó lệnh bên ngoài xóa nó, thì lần thay đổi có bảo vệ đầu tiên đúng đắn thất bại vì lỗi thời, nhưng việc đọc lại theo chỉ dẫn sẽ trả về `FS_NOT_FOUND` trước khi phát ra `fs/observed`. Do đó, phiên bản tồn tại cũ cứ được giữ nguyên: ghi vẫn liên tục chọn `replaceIfVersion`, bên cung cấp vẫn liên tục từ chối mục tiêu vắng mặt, và chỉ dẫn hướng đến model "hãy đọc lại file rồi thử lại" hình thành một vòng lặp không thể khôi phục.

Coi một lần đọc thất bại là ủy quyền tạo mới còn để lộ ra ranh giới thứ hai. Cả bên cung cấp local và E2B đều thăm dò trước rồi tạm giữ, sau đó phát hành qua rename; một tiến trình khác có thể tạo mục tiêu giữa hai bước, ngay cả khi bên gọi cung cấp `createIfAbsent`, mục tiêu đó vẫn bị ghi đè. Khóa mục tiêu trong tiến trình không thể phòng ngừa tranh chấp phát hành xuyên tiến trình này.

## Quyết định

`dsh-fs` sở hữu một kiểu union quan sát tường minh: `{ kind: 'present', version: FsVersion } | { kind: 'absent' }`. Sự kiện `fs/observed` mang theo union này. Đọc và thay đổi thành công phát ra quan sát tồn tại; lỗi metadata của `read`, hoặc lỗi metadata của các lệnh `view`, `str_replace`, `insert` trong `str_replace_editor`, đều đồng bộ phát ra quan sát vắng mặt trước khi trả về `FS_NOT_FOUND`. Các lỗi đọc khác không tạo ra quan sát vắng mặt.

`dsh-fs-observation-policy` lưu ba trạng thái logic theo owner và mục tiêu, không tiêm cũng không gọi `ctx.fs`: không có mục trong ánh xạ nghĩa là chưa từng thấy, `absent` nghĩa là xác nhận vắng mặt, `present(version)` là cơ sở cho thay thế/chỉnh sửa. Ghi ánh xạ chưa-thấy và vắng-mặt vào ý định `createIfAbsent` sẵn có, ánh xạ tồn tại vào `replaceIfVersion`. Chỉnh sửa ánh xạ chưa-thấy vào `FS_NOT_OBSERVED`, ánh xạ vắng-mặt vào `FS_NOT_FOUND`, ánh xạ tồn tại vào bảo vệ phiên bản của nó. Sau khi tạo mới hoặc thay đổi thành công, hệ thống thay thế trạng thái vắng mặt bằng phiên bản tồn tại vừa được tạo ra.

Mỗi bên cung cấp phải thực thi `createIfAbsent` tại điểm phát hành, không chỉ ở lần thăm dò ban đầu. `dsh-fs-local` tạm giữ trong một thư mục cùng cấp riêng tư và thực hiện fsync, sau đó phát hành file tạm tới vị trí mục tiêu bằng hard link; nếu link thất bại, nó kiểm tra mục tại vị trí đích: xung đột với file thường trả về `FS_NOT_OBSERVED`, mục không phải file thường trả về `FS_NOT_REGULAR_FILE`, mục tiêu vẫn vắng mặt trả về `FS_IO_ERROR`. `dsh-fs-e2b` dùng `ln -T` từ xa trả về kết quả rõ ràng đã-tạo/đã-tồn-tại, và suy ra phiên bản của mục tiêu đã commit dựa trên metadata thu được trước khi commit không thể hủy. Thao tác thay thế và ghi vô điều kiện trần vẫn theo đường phát hành hiện có.

Quyết định này không tuyên bố `replaceIfVersion` có tính nhất quán tuyến tính xuyên tiến trình: việc kiểm tra và thay thế phiên bản của bên cung cấp chỉ có thể phòng ngừa những bên ghi được điều phối trong cùng khóa của chính nó, và những bên ghi có thể phát hiện qua metadata. Ranh giới đảm bảo hẹp hơn này là chính xác và đủ để hỗ trợ khôi phục vắng mặt: tạo có bảo vệ không bao giờ ghi đè mục tiêu xuất hiện trước khi phát hành. Tạo có bảo vệ ở local yêu cầu hỗ trợ hard link; một khi phát hành local nào đó thành công, việc dọn dẹp file tạm dùng ngữ nghĩa nỗ lực tốt nhất, vì phần dư sót riêng tư không thể phủ nhận thành công của lần ghi đã commit.

## Các phương án thay thế từng cân nhắc

- **Xóa phiên bản trong cache khi đọc trả về không tìm thấy.** Không dùng, vì điều này lẫn lộn giữa chưa-thấy và xác-nhận-vắng-mặt, không thể khiến edit trả về đúng kết quả `FS_NOT_FOUND`, và xóa mất trạng thái chuyển đổi mà sự kiện này lẽ ra phải truyền tải.
- **Cho `dsh-fs-observation-policy` gọi `stat` trước khi chọn ý định.** Không dùng, vì điều này khiến một chính sách chỉ dựa vào sự kiện quay sang phụ thuộc bên cung cấp, thêm I/O cho mỗi quyết định, và vẫn để lại khoảng hở TOCTOU trước khi phát hành.
- **Cho phép `replaceIfVersion` thực hiện tạo mới sau khi mục tiêu biến mất.** Không dùng, vì quan sát tồn tại là căn cứ để thực thi thay thế chứ không phải tạo mới; âm thầm đổi ý định của bên cung cấp sẽ vòng qua việc đọc lại vốn phải thực hiện với mục tiêu vắng mặt, và làm suy yếu bảo vệ chống lỗi thời.
- **Giữ nguyên ngõ cụt fail-closed sau khi mục tiêu bị xóa.** Không dùng, vì điều này khiến chỉ dẫn khôi phục hướng tới model trở thành sai sự thật, và thao tác dọn dẹp bên ngoài bình thường không thể khôi phục trong phạm vi phiên.

## Ảnh hưởng

Khi chưa quan sát được việc xóa từ bên ngoài, lần thay đổi đầu tiên vẫn thất bại với `FS_STALE_VERSION`; người dùng hoặc model phải tuân theo chỉ dẫn khôi phục đọc lại hiện có. Lần đọc lại đó nhắm vào mục tiêu vắng mặt sẽ trả về `FS_NOT_FOUND` đồng thời thay đổi trạng thái chính sách; sau đó edit vẫn bị cấm, còn write có thể tạo lại đường dẫn đó. Nếu một bên ghi khác thắng cuộc đua tạo mới, lần thử lại này sẽ trả về `FS_NOT_OBSERVED`, và giữ nguyên file do bên thắng ghi; nếu mục tiêu tranh chấp là thư mục, mục đặc biệt hoặc symlink treo, thì thay vào đó trả về `FS_NOT_REGULAR_FILE`, và không yêu cầu đọc lại lần nữa.

Tải trọng quan sát là một thay đổi hợp đồng sự kiện thuộc sở hữu của gói, do đó mọi bên sản xuất, listener, bất biến, danh mục Cordis được sinh ra, tài liệu subsystem và cả hai bộ công cụ hệ thống file đều phải cập nhật đồng bộ. Chính sách vẫn giữ nguyên: đọc dùng một lần `stat`, ngân sách zero-`stat` cho write/edit, cách ly theo owner, hành vi dispose và ranh giới triển khai tùy chọn — như đã xác lập trong [quyết định chốt sự kiện file context](../architecture/2026-06-26-file-context-as-event-gate.md).

Snapshot hệ thống file sau khi tổ hợp cố định chuỗi khôi phục hướng tới model; test bên cung cấp thì tiêm một bên tạo mới sau khi tạm giữ, để chứng minh việc phát hành không ghi đè mục tiêu đang tranh chấp. [Quyết định về chỉ dẫn khôi phục lỗi thay đổi có bảo vệ](../feature/2026-08-03-fs-tool-error-remedy.md) vẫn sở hữu cách diễn đạt khôi phục hướng tới model; Agent Note này khiến đường xóa trong đó phát huy tác dụng.
