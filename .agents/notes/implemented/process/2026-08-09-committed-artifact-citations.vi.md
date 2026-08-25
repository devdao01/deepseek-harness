# Agent Note: Chỉ trích dẫn artifact đã commit, không bao giờ trích dẫn số thứ tự phiên thiết kế

Status: implemented

[English](2026-08-09-committed-artifact-citations.md) | 中文

## Vấn đề

Các phiên thiết kế và review quy mô lớn để lại ghi chú công việc tốc ký: số thứ tự quyết định, mã số mục audit, số chương kế hoạch, số thứ tự task và stack, phán quyết của reviewer. Những ghi chú tốc ký này đọc có vẻ hợp lý khi transcript (bản ghi văn bản) của phiên vẫn còn mở, nhưng một khi đóng lại thì không thể giải quyết được gì nữa. Một lần audit toàn repo phát hiện mẫu hình này tập trung ở `packages/client`: trong số các trích dẫn viết trần `(decision 12/16/19/20/21)` chỉ có decision 21 có tài liệu quy thuộc đã commit; mã số `(audit C2/S1/S3/S7)` không có tài liệu audit tương ứng ở bất kỳ đâu; `design §4.7`／`web2 §0`／`plan §1.4` trỏ đến bản nháp chưa commit; nhãn giai đoạn kế hoạch (`T2/T5/T9`, `P-I`, `W5`); vị trí trong stack trong JSDoc bền vững ("a later PR in this stack"); và các từ như "ruling" (phán quyết), "design ledger" (sổ cái thiết kế). Cùng vài loại mẫu hình này cũng xuất hiện trong test, comment CSS, template generator, comment CI và Agent Note (góc nhìn "PR này／branch này／vòng review này", quy kết theo kiểu điều phối review, và cách nói cũ "hoãn đến PR sau" dù mục tiêu đó đã được giao xong). [Chuẩn tài liệu](../../../../docs/AGENTS.md) đã cấm một nửa của vấn đề này từ trước (previously/now, tham chiếu PR (Pull Request) và commit), nhưng chưa có quy tắc tương ứng cho việc trích dẫn, nên các số thứ tự không thể giải quyết được cứ tiếp tục lọt vào repo.

## Quyết định

Văn bản bền vững (comment, JSDoc, tài liệu, Agent Note, comment test và tiêu đề test) chỉ trích dẫn artifact đã commit, có thể giải quyết được trong repo mà không cần khảo cổ bằng grep:

- Agent Note được quy thuộc rõ ràng (đường dẫn của nó xuất hiện ít nhất một lần trong mỗi file, dùng tên có thể tìm kiếm được inline), đường dẫn trang tài liệu, hoặc số issue GitHub. PR, commit, branch và vị trí trong stack theo chuẩn tài liệu vẫn nằm trong danh sách cấm ở cả tài liệu lẫn code; issue là thứ bền vững và có thể trích dẫn được, Agent Note và bản mổ xẻ sự cố (postmortem) có thể trích dẫn PR và issue đã merge làm bằng chứng theo quy tắc sắp xếp câu chuyện thay đổi của [chuẩn tài liệu](../../../../docs/AGENTS.md).
- Số thứ tự phiên thiết kế có quyết định đã có tài liệu quy thuộc đã commit được thay bằng tên của quyết định đó — số thứ tự từng được ghi là "decision 21" nay là "trích dẫn quyết định bằng văn bản thuần túy", quy thuộc về [note máy trạng thái đầu vào web](../architecture/2026-07-25-web-input-machine-and-slash-pipeline.md); bản thân số thứ tự đó không thể giải quyết được trong repo, nên đã bị loại bỏ hoàn toàn. Số thứ tự không có tài liệu quy thuộc bị xóa, câu mang tính sự kiện của nó được viết lại thành phát biểu có thể đứng độc lập.
- Regression (hồi quy) đã được sửa được cố định bằng câu phản thực thì hiện tại ("nếu không có X thì sẽ xảy ra Y", "X ngây thơ sẽ..."), không bao giờ viết thành lịch sử repo ("trước đây từng Y").
- Agent Note đã triển khai phát biểu về thực tế đã giao: cách nói "hoãn đến PR sau" nếu mục tiêu của nó đã được giao xong thì đổi thành chỉ đích danh note đã giao đó.
- Fixture (dữ liệu tiền đề test) đã ghi, snapshot và Agent Note đã lưu trữ không chịu ràng buộc này: đầu ra model đã ghi và lịch sử đã đóng gói giữ nguyên văn phong ban đầu. Trong đoạn văn kể chuyện thay đổi của note, tên giai đoạn lịch sử ("bản đầu tiên đã giao X") đáp ứng yêu cầu chỉ mô tả trạng thái hiện tại; các dấu hiệu chỉ phiên bản hiện tại kiểu "this cut" vẫn bị cấm ở mọi nơi.

Một lần dọn dẹp toàn repo đã áp dụng các quy tắc này lên nhiều bề mặt văn bản, bao gồm template do generator sở hữu (`scripts/gen-doc-graphs.ts`, `scripts/gen-tool-catalog.ts`, prompt trang của generator typert, đã sửa và tạo lại), JSDoc trong source type-equiv (đã sửa và đồng bộ lại vào trang tài liệu), và file đối chiếu song ngữ (đã sửa và ghi lại cặp). [Skill dsh-trim-cot-leakage](../../../skills/dsh-trim-cot-leakage/SKILL.md) đưa các quy tắc này thành workflow có thể thực thi: phân loại audit, tra cứu thu hồi theo lô các artifact đã commit, và ví dụ mẫu ít để phán đoán nên giữ hay xóa nội dung.

## Phương án thay thế từng cân nhắc

- **Commit sổ cái thiết kế và tài liệu audit vào repo, để số thứ tự có thể giải quyết được.** Không chấp nhận: transcript của phiên là sản phẩm công việc, không phải tài liệu tham khảo được bảo trì liên tục; commit chúng sẽ tạo ra một corpus quyết định song song ngoài Agent Note và không chịu cổng kiểm soát, mà số thứ tự nội bộ của nó vẫn sẽ trôi dạt.
- **Xây một cổng kiểm soát cơ học cho các từ ngữ bị cấm.** Tạm hoãn: loại từ ngữ này là ngôn ngữ tự nhiên vô hạn, việc tra cứu theo lô nhắm đến độ phủ toàn diện trong audit cần phán đoán của con người mới phân biệt được đâu là rò rỉ và đâu là văn bản hợp lệ (danh từ "wait", chuyển ý "actually", trạng thái mới cũ tại runtime). Nếu mẫu hình này lặp lại, phương án khả dĩ là một cổng hẹp nhưng độ chính xác cao (ví dụ `\(decision \d`, `\(audit [A-Z]\d`, `\bcut \d`, `this cut`, `\bT\d\b` trần, `P-I`, `used to `, `\bv1\b` trần và `§\d` — loại cuối cần loại trừ các trích dẫn số chương đã có quy thuộc đã commit, như §N của chính web-styling.md); việc review chính đợt dọn dẹp này lại phát hiện phần sót lại đúng ở những trường hợp mà các tra cứu này không phủ tới, nên chúng đứng đầu danh sách ứng viên.
- **Xóa lý do thiết kế trích dẫn artifact đã mất hiệu lực.** Không chấp nhận: mọi câu mang tính sự kiện đều được giữ lại hoặc viết lại; theo quy tắc mệnh đề hoàn chỉnh của chuẩn hành văn, chỉ có trích dẫn, quy kết kiểu điều phối review và ghi chép quá trình suy luận bị xóa.

## Xác minh

Tra cứu grep theo lô của audit (tiếng Anh và tiếng Trung, comment và văn xuôi, thêm `--hidden` cho `.agents/`) không phát hiện trích dẫn số thứ tự phiên thiết kế nào ngoài fixture đã ghi, Agent Note đã lưu trữ, file của chính skill dọn dẹp này và bằng chứng mà note này trích dẫn; `verify-type-equiv`, các kiểm tra độ mới của từng `gen-*` và `verify-translation-pairing` cố định các bề mặt đã tạo lại và ghi lại. Khoảng trống về độ phủ: không có cổng nào từ chối trích dẫn số thứ tự mới, quy tắc này do review kiểm soát.

## Hệ quả

- Trích dẫn trong comment có thể giải quyết được chỉ bằng đường dẫn hoặc tên; người đọc không bao giờ phải dựng lại một phiên đã đóng để truy vết một trích dẫn.
- Phiên thiết kế phải đưa quyết định vào Agent Note trước, thì văn bản bền vững mới có thể trích dẫn các quyết định đó; ghi chú tốc ký bằng số thứ tự chỉ ở lại trong nội bộ phiên.
- Trích dẫn dài hơn (dùng đường dẫn note thay cho "(decision 21)"), đổi lại là có thể giải quyết được mà không cần grep.
