# Agent Note: Định dạng trong tệp thống nhất và chịu cổng kiểm tra cho Agent Note

Status: implemented

[English](2026-07-05-uniform-agent-note-format.md) | Tiếng Việt

## Vấn đề

Đường dẫn của Agent Note đã mã hóa vòng đời và hạng mục, nhưng nội dung tệp vẫn pha trộn đủ loại tiêu đề, định dạng trạng thái, khuôn mẫu ADR lẫn đề xuất, cùng những mục thuộc giai đoạn đề xuất còn sót lại trong các bản ghi đã hiện thực. Tác giả thường sao chép tệp lân cận vớ được, còn việc chuyển vòng đời có thể bỏ qua phần viết lại cần thiết, vì không có cổng kiểm tra nào cưỡng chế quy ước trong tệp.

## Quyết định

[README.md § định dạng tệp](../../README.md#the-file-format) là quy ước trong tệp — khối đầu tệp (`# Agent Note: <title>`, cộng một liệt kê `Status:` không kèm ngày và khớp với thư mục, trong đó chỉ lý do bác bỏ mới được coi là nội dung bổ sung), khung thân bài theo từng vòng đời (mọi tệp đều mở đầu bằng `Problem`; `proposed/` dùng `Proposal`/`Acceptance criteria`/`Risks`; `implemented/` dùng `Decision`/`Consequences` ở thì hiện tại, và cấm các tiêu đề thuộc giai đoạn đề xuất; `rejected/` đóng băng cấu trúc đề xuất), mục `Alternatives considered` bắt buộc, cùng từ vựng cho các mục chuẩn tắc; các mục kỹ thuật tùy biến có thể giữ dạng tự do giữa những mục chuẩn tắc đó. `pnpm run verify-agent-note-format` ([scripts/verify-agent-note-format.ts](../../../../scripts/verify-agent-note-format.ts)) cưỡng chế từng quy tắc máy móc như một phần của `doc-sync`, nên việc chuyển vòng đời mà bỏ qua phần viết lại giờ sẽ làm CI thất bại, thay vì phụ thuộc vào trí nhớ của người duyệt.

Cùng một thay đổi định nghĩa định dạng đó đã chuẩn hóa toàn bộ kho tài liệu — theo lập trường tiền phát hành: không có giai đoạn chuyển tiếp, không dung thứ hai định dạng song song. Miễn trừ dành cho nội dung có sẵn chỉ áp cho nội dung, không áp cho định dạng: các phương án thay thế chỉ được ghi lại chứ không được bịa ra, nên nếu một Agent Note có trước khi định dạng được lập mà không khôi phục được phương án thay thế từ hồ sơ, nó sẽ mang một chú thích có nội dung khớp chính xác `agent-note-format: alternatives-not-recorded`; cổng kiểm tra chỉ chấp nhận chú thích đó với các tệp có ngày sớm hơn tài liệu này.

## Các phương án từng cân nhắc

- **Khuôn mẫu cứng nhắc hoàn chỉnh** (mỗi vòng đời dùng một thứ tự mục cố định, tái cấu trúc mọi Agent Note cho khớp): bác bỏ. Các Agent Note thiết kế lớn chứa từ tám tới mười lăm mục kỹ thuật tùy biến (topology gói, quy ước giao thức, schema), chúng là nội dung mang thiết kế chứ không phải trôi dạt; thứ tự cứng nhắc sẽ buộc chúng ta phải viết lại phá hoại ngay lúc này và mãi mãi vật lộn với khuôn mẫu.
- **Chỉ chuẩn hóa phần đầu tệp** (H1 và Status, giữ nguyên thân bài): bác bỏ. Các dấu nợ kỹ thuật chỉ ra sự chia rẽ thể loại ở *thân bài*, để `Context`/`Decision` cùng tồn tại vô thời hạn với `Problem`/`Proposal` thì chẳng giải quyết được gì.
- **Không có dòng Status** (thư mục đã biểu thị trạng thái; ba Agent Note mới nhất trước khi lập định dạng và một tệp tiếng Trung đối ứng của một trong số đó đã lược bỏ dòng này): bác bỏ, giữ tính tự mô tả của tệp. Việc kiểm định qua cổng rằng dòng này khớp với thư mục đã loại bỏ đúng rủi ro trôi dạt vốn thôi thúc ta xóa nó đi.
- **Status kèm ngày** (`Status: implemented (accepted YYYY-MM-DD)`): bác bỏ. Ngày chấp nhận thuộc về lịch sử tường thuật, mà quy tắc viết lách loại nó ra khỏi tài liệu; tên tệp mang ngày đề xuất lần đầu, git mang phần còn lại; cổng có thể kiểm tra định dạng ngày, nhưng vĩnh viễn không kiểm tra được tính chân thực của nó.
- **H1 trần `# <title>`**: bác bỏ. Khi tệp được đọc tách khỏi cây thư mục, tiền tố `Agent Note: ` tự mô tả thể loại của nó, còn cổng định dạng ngăn nó trôi dạt.
- **Kết thúc bản ghi đã hiện thực bằng `## What we give up`** (cách diễn đạt cũ trong README về nội dung mà Agent Note ghi lại): bác bỏ. Nó chỉ nêu cái giá, trong khi một mục hệ quả trung thực cũng ghi lại đánh đổi đó mang về được gì.
- **Chỉ có thông lệ mà không có cổng** (viết ra quy ước, dựa vào duyệt để cưỡng chế): bác bỏ. Slop checklist vốn đã cấm giọng văn spec trong `implemented/` bằng thông lệ, và mười chín tệp cho thấy chỉ dựa vào thông lệ thì đạt được tới đâu ở đây.
- **Tệp quy ước `FORMAT.md` riêng**: bác bỏ. Để một cửa ngõ duy nhất mang cả bố cục, phân loại và định dạng thì dễ tìm thấy và dễ bảo trì hơn là duy trì hai tệp quy ước.

## Hệ quả

Giờ đây mỗi Agent Note cần nhiều cấu trúc hơn một chút, và mục `Alternatives considered` bắt buộc là lực cản được đặt ra có chủ ý: ghi lại quyết định mà không ghi lại nó đã thắng cái gì sẽ mời gọi đúng cuộc tranh luận lại mà Agent Note lẽ ra phải ngăn chặn. Những Agent Note có trước khi lập định dạng mà không khôi phục được phương án thay thế sẽ giữ vĩnh viễn chú thích miễn trừ nội dung có sẵn — đó là một khoảng trống trung thực trong hồ sơ, chứ không phải cái cớ để bịa. `doc-sync` có thêm một cổng; khi di chuyển Agent Note giữa các thư mục vòng đời, giờ phải hoàn tất ngay tại chỗ phần việc thực sự (viết lại thân bài mà việc di chuyển vốn dĩ đã phải bao gồm), thay vì hoãn lại thành một nhiệm vụ dọn dẹp không ai theo dõi. Ba mươi chín dấu nợ kỹ thuật đã biến mất, được giải quyết bởi chính khuôn mẫu mà chúng vẫn chờ đợi.
