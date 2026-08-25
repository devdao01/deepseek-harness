# Agent Note: bộ chọn resume chỉ gấp lại tiêu đề

Status: implemented

[English](2026-07-31-resume-selector-batch-projection.md) | Tiếng Việt

## Vấn đề

Khi mở bộ chọn `/resume` của TUI, hệ thống gọi `sessionQuery.readSession()` một lần cho từng session được liệt kê, trong một `Promise.all` không có giới hạn. Mỗi lời gọi lại liệt kê toàn bộ kho lưu trữ bền vững bên trong `SessionCorpus.load()` (O(N²) lần truy vấn liệt kê), đọc và giải nén toàn bộ log, phát lại kiểm tra từng sự kiện qua constructor `Session`, rồi deep clone header và sự kiện tới ba lần — tất cả chỉ để suy ra tiêu đề của một dòng trong bộ chọn, thời điểm hoạt động gần nhất, nhãn `turn/end` cuối cùng, tuyến provider/model và giai đoạn đích. Trên kho lưu trữ thật (185 session, 87 MB sau nén, khoảng 353 nghìn sự kiện), bộ chọn mất hàng chục giây mới mở được, và chi phí tăng theo tổng dung lượng log chứ không theo số lượng session.

## Quyết định

Dòng của bộ chọn không gấp lại thứ gì ngoài tiêu đề, mọi thông tin còn lại trên dòng đều lấy từ metadata:

- Tiêu đề đến từ hệ thống projection: `session-title` đã đăng ký đơn vị projection `title`, nên dòng thời gian thực đọc snapshot của registry, dòng bền vững đọc dòng checkpoint bền vững (`sessionProjectionCache.cachedSnapshot`, không I/O), chỉ những dòng không có checkpoint khả dụng mới phải trả giá một lần `coldSnapshot` — checkpoint cộng với việc gấp phần đuôi qua `readFrom`, rồi ghi ngược lại để lần quét sau không cần I/O. Việc đọc nguội bị ràng buộc bởi cấu hình `resumeScanConcurrency` của TUI. Các tổ hợp chưa mount cache thì lùi về một lần đọc theo lô có giới hạn `readTitleSnapshots` trên log; cả hai đường đều cô lập lỗi của một dòng thành phương án dự phòng «Unreadable session» bị vô hiệu hóa.
- Dấu thời gian hoạt động không bao giờ đọc log: session thời gian thực lấy thời gian của sự kiện cuối cùng trong bộ nhớ; session bền vững thì stat (mtime) sản phẩm được `sessionPersistence.locate()` tùy chọn chỉ ra, và lùi về thời điểm tạo trong header khi backend không định vị được sản phẩm theo từng session (SQLite) hoặc khi stat thất bại. Mọi lần ghi thêm đều làm mtime dịch chuyển, nên chỉ một lần chạm ranh giới pickup cũng đủ đẩy session đã duyệt qua lên đầu — đó là cái giá của dấu thời gian metadata, và ta chấp nhận.
- Trên dòng không còn cột nhãn lượt cuối, tuyến provider/model và giai đoạn đích. Tính khả dụng của tuyến giờ được ép bằng bước kiểm tra trước khi nhấn Enter: bước kiểm tra này đọc đầy đủ và phát lại kiểm tra đúng bản log được chọn qua `readSession` rồi mới bàn giao.

Overlay của bộ chọn mở đồng bộ ngay khi `/resume` được phân phối, sớm hơn lúc lần quét kết toán: tập ứng viên `undefined` sẽ render placeholder tải «Loading sessions…», bộ chọn nắm input của terminal ngay từ khung hình đầu tiên, Enter báo rằng session vẫn đang tải, Escape hủy. Đóng overlay sẽ hủy lần quét thông qua `AbortSignal` mà các phương thức truy vấn chấp nhận; kết quả về muộn từ những backend bỏ qua tín hiệu sẽ bị loại bởi bước kiểm tra tính cũ. Khi quét xong, dữ liệu dòng được thay vào qua `setCandidates` (đồng thời xóa lỗi vẫn-đang-tải đã cũ), chứ không thay overlay; lần kích hoạt xếp hàng sau một overlay tiền nhiệm đang đóng sẽ nhận thẳng tập đã quét ngay lúc dựng; truy vấn liệt kê, tiêu đề và mtime dùng chung một catch, nên bất kỳ thất bại quét nào cũng đóng overlay và báo cáo thông báo, chứ không để placeholder tải treo lơ lửng.

Không giao diện nào của session-query và session-persistence bị thay đổi. Tổ hợp TUI đi kèm bổ sung các dòng registry projection, storage và cache projection (soi gương overlay web, dùng chung một gốc `storages`, nên checkpoint do bất kỳ giao diện nào ghi ra đều phục vụ cả hai); lần quét đầu tiên trên kho lưu trữ có sẵn vẫn đọc mỗi log một lần để gieo checkpoint, còn từ đó về sau mỗi lần quét chỉ đọc metadata.

## Phương án thay thế

**Giữ các cột tuyến/lượt/đích cho từng dòng thông qua projection theo lô dùng chung (`projectSessions`).** Đã hiện thực rồi bác bỏ: nó vẫn giải nén và phân tích toàn bộ log ở mỗi lần `/resume`, chi phí duyệt vẫn là O(tổng số byte log), đồng thời mở rộng API công khai của session-query chỉ vì một bên tiêu thụ duy nhất. Quy ước công khai đó đã được hoàn tác; `readTitleSnapshots` tiếp tục dùng `projectMany` nội bộ, giữ nguyên như cũ.

**Chỉ sửa truy vấn liệt kê O(N²) bên trong `SessionCorpus.load()`.** Bác bỏ với tư cách bản sửa chính: trên log lớn, chi phí chủ yếu là việc giải nén đầy đủ, phát lại kiểm tra và clone ba lần cho từng dòng ứng viên. Truy vấn liệt kê trước thừa thãi trong `load()` vẫn là một hạng mục dọn dẹp tiềm năng, nhưng nó dính tới ngữ nghĩa lỗi.

**Phơi bày thời điểm sửa đổi cuối qua `listSnapshots`/`SessionRecord`.** Sạch nhất xét từ góc độ seam, nhưng phải động vào quy ước bền vững, hai backend và hình dạng bản ghi truy vấn, trong khi TUI đã có thể lấy đúng thông tin đó bằng `locate()` cộng một lần stat. Sẽ đưa vào khi xuất hiện bên tiêu thụ thứ hai cần thời gian hoạt động từ metadata.

**Chỉ mục tiêu đề bền vững chuyên dụng hoặc cache tiêu đề cục bộ của TUI.** Bác bỏ: cache session-projection bản thân nó đã là một hệ thống checkpoint bền vững tự có, và đã kèm quy ước vô hiệu hóa (`stateVersion`, ràng buộc danh tính, neo theo việc log co lại); mount nó tốt hơn là dựng lại một cache song song nữa.

## Hệ quả

Mở `/resume` chỉ thực hiện một truy vấn liệt kê, một lần stat cho mỗi dòng bền vững, và việc đọc tiêu đề chỉ chạm vào dòng checkpoint cùng phần đuôi log khi checkpoint đã sẵn sàng — chi phí metadata O(số session), chứ không phải O(tổng số byte log); đường dự phòng không cache vẫn là một lần quét tiêu đề có giới hạn. Trên dòng chỉ hiển thị tiêu đề, dấu thời gian, trạng thái và id; vấn đề về tuyến xuất hiện dưới dạng lỗi ở bước kiểm tra khi nhấn Enter, chứ không còn là dòng bị vô hiệu hóa; những session mà việc phát lại sẽ thất bại bị chặn ở bước kiểm tra chứ không phải ở giai đoạn liệt kê. Session bị bỏ dở sau khi duyệt sẽ nổi lên do mtime của lần pickup. Service `sessionQuery` giả trong test của TUI cung cấp `readTitleSnapshots` ngoài `listSessions`/`readSession`, và harness test sẽ chuyển tiếp `locate` tùy chọn. Vì bộ chọn chiếm focus ngay lập tức, muốn khởi động lần quét thứ hai thì phải đóng overlay hiện tại trước — `/resume` thứ hai gõ vào trong lúc đang quét sẽ rơi vào ô tìm kiếm, và đó chính là hành vi bắt input như mong đợi.
