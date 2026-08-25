# Agent Note: preset hỏng là một dòng trong danh sách, không phải một ô trống

Status: implemented

[English](2026-08-09-broken-preset-roster-rows.md) | Tiếng Việt

## Vấn đề

Sau khi file trở thành trình soạn thảo tổ hợp duy nhất, việc chỉnh sửa thủ công gây hư hỏng theo hai dạng, và cả hai đều đợi đến thời điểm tệ nhất mới lộ ra. preset mà `agent.cordis.yml` không parse được vẫn là một dòng hoàn toàn bình thường trên danh sách — chọn được, sao chép được, đặt làm mặc định được — cho tới khi phiên tiếp theo cố gắn kết thì thất bại; một khi đã bị đặt làm mặc định, mọi phiên mới đều không khởi động được. Còn thư mục có toàn bộ file tổ hợp bị xóa sạch thì biến mất khỏi danh sách nhưng vẫn chiếm id của nó trên đĩa: `copy` từ chối cái tên này với lý do "phải xóa preset hiện có trước", trong khi `remove` lại trả lời "không tìm thấy" — hai thông báo lỗi mâu thuẫn nhau, không còn cách nào khác ngoài xóa thư mục thủ công.

## Quyết định

Quá trình phát hiện chịu trách nhiệm về sức khỏe: thư mục hỏng là **một dòng trong danh sách mang lý do `broken`**, tuyệt đối không phải một ô trống. `scanRoot` coi mỗi thư mục có tên là một id preset hợp lệ là một vị trí preset: thiếu file tổ hợp → broken ("vẫn đang chiếm id này; hãy xóa thư mục hoặc khôi phục file"), tổ hợp không đọc được/parse lỗi/không phải danh sách dòng có tên → broken kèm dòng đầu tiên của lỗi từ parser. Kiểm tra hình dạng dùng chính `entryListSchema` của loader (kèm phương ngữ `!!js`) để parse, do đó health check sẽ không bao giờ gọi một tổ hợp mà loader chấp nhận là hỏng; thư mục có tên không khớp `PRESET_ID` bị bỏ qua trực tiếp, vì việc sao chép sẽ không bao giờ va chạm với nó. `broken` lần lượt xuất hiện trong `AgentPreset`, mục trực tuyến của `agentPreset.list` và các dòng UI. Đường gắn kết (`mount`/`recompose`/`standingKeyFor`) từ chối trước qua `resolveMountable`, dùng lý do ghi lại từ lúc phát hiện (`resolve` vẫn trả lời bình thường — vì xóa/đọc/báo cáo đều cần dòng này), còn kiểm tra danh sách của `copy` giờ nhìn thấy con ma, khiến việc từ chối "đã tồn tại" trở nên có thể hành động — thẻ hỏng cần xóa nằm ngay trên cùng một trang.

Giao diện tách theo trách nhiệm: khu vực quản lý render dòng hỏng thành thẻ được đánh dấu (viền đỏ, huy hiệu "Đã hỏng", hiển thị nguyên văn lý do, thân thẻ và nút sao chép bị vô hiệu hóa, dòng tùy chỉnh vẫn giữ vị trí và nút xóa — vì file chính là nơi cần sửa, xóa chính là lối thoát cho con ma; dòng tích hợp sẵn bị hỏng thì ngay cả trình xem cũng không được cấp), trong khi hai bộ chọn (dòng cài đặt chung, chip phiên mới) hoàn toàn không liệt kê preset hỏng qua `presetOptions` — vì chúng đang chọn tổ hợp cho phiên tiếp theo, đưa ra lựa chọn không thể tổ hợp được chỉ trì hoãn thất bại.

## Hệ quả

- Ngõ cụt do con ma được loại bỏ triệt để đầu-cuối: thư mục hiển thị thành dòng hỏng, xóa là dọn sạch, id được giải phóng lập tức khả dụng (được bao phủ riêng bởi unit test, component test và e2e).
- Giá trị mặc định bị hỏng sau này vẫn thất bại lớn tiếng tại nơi phiên khởi động — bộ chọn ẩn dòng hỏng, nhưng không có gì ghi đè giá trị mặc định đã lưu; việc từ chối trước của `resolveMountable` cho mọi dạng không thể nạp cùng một thông báo, thay vì phụ thuộc vào báo lỗi nội bộ của loader.
- Health check chạy cùng mỗi lần `list()`: mỗi lần đọc danh sách đọc và parse từng preset một lần, lý do chấp nhận việc không cache phát hiện cũng giống nhau — danh sách nhỏ, sự tươi mới là hợp đồng.
- Sao chép preset hỏng chỉ bị từ chối ở lớp UI (nút vô hiệu hóa kèm lý do); `copy` phía host giữ nguyên tính không quan tâm hình dạng. Nguồn hỏng tạo ra bản sao cũng hỏng, cũng hiển thị như vậy — không tăng thêm năng lực gì, trong khi từ chối phía host lại cần phát minh riêng từ vựng lỗi cho một đường đi vốn đã bị chặn bởi nút vô hiệu hóa.

## Chi tiết trọng yếu

- **`PRESET_ID` chuyển sang `types.ts`**, để phát hiện và sáng tác dùng chung một từ vựng ranh giới. authoring chuyển tiếp export nguyên trạng.
- **Lý do chỉ giữ một dòng.** js-yaml đính kèm trích đoạn mã nhiều dòng; thẻ danh sách không phải terminal, `compositionProblem` chỉ giữ dòng đầu.
- **Hai case tranh chấp trong mount.spec cố tình không đụng tới**: `ensureStanding` vẫn có thể lấy được preset đã parse ngay trước thời điểm xóa (test đường nội bộ), ngữ nghĩa stamp/unstampable của nó không đổi — health check xảy ra trước con đường công khai này.
- **Hướng dẫn cho creation mode được đưa cùng PR**: persona của preset `cordis` cấm chỉnh sửa bản cài kèm theo (`cordis` bị hỏng sẽ vô hiệu hóa chính mode này), và hướng việc sáng tác về `${DSH_HOME:-$HOME/.dsh}/.agent-presets/<id>/`; skill của nó dạy metadata `preset.yml`, quy trình sao chép trước rồi mới sửa, và thực tế sandbox của một lần nâng cấp (thư mục gốc của preset nằm ngoài workspace của phiên). Đã kiểm chứng thực tế: khi được yêu cầu sửa trực tiếp tổ hợp `cordis` kèm theo, agent tổ hợp ra sẽ viện dẫn hai quy tắc để từ chối và đưa ra đường sao chép; khi được yêu cầu tạo preset thực sự, nó đặt vào `$DSH_HOME` và gộp việc ghi thành một lần nâng cấp. Nửa phần hướng dẫn đó về xác thực — agent không thể tự khởi động phiên, nên cờ đỏ ở trang cài đặt là điểm kiểm tra của người dùng — đã được thay thế bởi [agent sáng tác preset tự gắn kết để xác thực tổ hợp của mình](2026-08-11-preset-authoring-agent-validates-its-own-composition.md): kiểm tra cấu trúc dưới đây không phải là xác thực, mà `standingKeyFor` mới cho agent phương tiện xác thực thực sự. Quyết định health check trong ghi chú này không đổi.

## Các phương án thay thế từng cân nhắc

Ẩn preset hỏng nhưng từ chối bằng thông báo lỗi tốt hơn khi sao chép id đó: con ma vẫn không thể bị dọn sạch từ bất kỳ giao diện nào. Xác thực sâu (parse module của từng dòng khi đọc danh sách): việc gắn kết đã có sẵn thất bại này kèm rollback, import từng dòng khi mỗi lần đọc danh sách vừa không rẻ vừa không khả thi hơn. Chặn `settings` ghi trỏ tới giá trị mặc định hỏng: lĩnh vực settings mang tính tổng quát, còn danh sách là thư mục sống — cái tên hiện đang thiếu hoặc hỏng lúc này có thể đã hợp lệ vào phiên tiếp theo, và thất bại lớn tiếng lúc gắn kết mới là điểm thực thi sở hữu đúng khoảnh khắc đó.
