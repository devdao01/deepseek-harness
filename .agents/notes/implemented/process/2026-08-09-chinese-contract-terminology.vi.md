# Agent Note: Thống nhất thuật ngữ tiếng Trung cho `contract` thành「约定」

Status: implemented

[English](2026-08-09-chinese-contract-terminology.md) | 中文

## Vấn đề

Cách dịch tiếng Trung cho từ tiếng Anh `contract` không nhất quán giữa「契约」và「约定」, đôi khi còn xuất hiện cả hai trong cùng một file hoặc cùng một đoạn văn. Bảng thuật ngữ quy định dùng「契约」, nhưng phần hiệu đính gia tăng đã qua review lại chọn「约定」vì phù hợp hơn với văn phong kỹ thuật. Nếu bảng thuật ngữ và corpus tiếp tục phân tách, dù chọn cách dịch nào cũng sẽ vi phạm quy tắc thuật ngữ của repo, và các bản dịch sau này sẽ lại tạo ra sự khác biệt.

`convention` trong tiếng Anh cũng thường được dịch là「约定」. Sự trùng lặp này là có chủ đích: văn phong kỹ thuật tiếng Trung thông thường dùng「约定」để diễn đạt cả hai khái niệm, và thường có thể dựa vào ngữ cảnh để phân biệt đó là thông lệ quen dùng hay là quy tắc giao diện có tính ràng buộc. Nếu câu tiếng Anh đối lập rõ ràng giữa convention và contract, bản tiếng Trung phải giữ được sự phân biệt đó thông qua cách dùng từ như「惯例」và「约定」, chứ không được máy móc dịch mọi `convention` thành cùng một từ.

## Quyết định

Nguồn thuật ngữ gốc quy định `contract` dịch là「约定」, `adapter contract` khi xuất hiện lần đầu viết là「适配器约定（adapter contract）」. Mọi cặp tài liệu song ngữ tiếng Trung đang hoạt động đều tuân theo phán quyết này; các Agent Note đã lưu trữ giữ nguyên trạng thái đóng băng. Các tài sản hiệu chuẩn song ngữ chưa tham gia ghép cặp và phần văn bản mô tả prompt dịch thuật cũng dùng cùng thuật ngữ này, để tránh tiếp tục dạy theo cách dịch đã bị thay thế.

Lần di chuyển này chỉ bảo trì phần văn bản ngữ nghĩa, không đổi tên định danh. Mã inline, đường dẫn file, liên kết, tên API, và từ `contract` tiếng Anh xuất hiện trong tên file, cùng các giá trị máy đọc được đều giữ nguyên. `convention` không thêm dòng thuật ngữ toàn cục mới và cũng không viết lại toàn bộ corpus: khi dịch vẫn giữ tiếng Trung tự nhiên, chỉ khử nhập nhằng khi văn bản gốc đối lập rõ hai khái niệm. [Quyết định hành văn cụ thể](2026-08-09-concrete-prose-names-actors-and-recorded-facts.md) quy định riêng: nếu `contract` trong văn bản tiếng Anh mơ hồ, cần đổi nó thành quy tắc, API hoặc hành vi cụ thể trước khi dịch.

## Phương án thay thế đã cân nhắc

**Tiếp tục dịch `contract` là「契约」.** Bị bác bỏ, vì corpus đã qua review nhất quán nghiêng về dùng「约定」trong các giao diện kỹ thuật, cam kết vòng đời và ranh giới hành vi; giữ thuật ngữ cũ đồng nghĩa với việc lùi lại một khối lớn kết quả hiệu đính đã được chấp nhận.

**Quy định cách dịch toàn cục bắt buộc cho `convention`.** Bị bác bỏ, vì nó có thể biểu thị cả thông lệ đặt tên lẫn quy ước giao thức. Ép buộc một cách dịch sẽ dẫn đến một đợt di chuyển quy mô lớn khác mà không cải thiện được văn phong thông thường; chỉ khi văn bản gốc đối lập rõ ràng mới cần dùng cách diễn đạt khác.

**Cho phép `contract` dùng đồng thời cả「契约」và「约定」.** Bị bác bỏ, vì điều này sẽ giữ lại vấn đề gốc dẫn đến mâu thuẫn giữa các nhóm package thậm chí trong cùng một đoạn văn.

## Hệ quả

Tài liệu tiếng Trung đang hoạt động chỉ có một cách dịch có tính ràng buộc cho `contract`, các prompt dịch thuật sau này sẽ lấy trực tiếp quyết định đó từ bảng thuật ngữ. Bản ghi lưu trữ giữ nguyên văn bản lịch sử. Nếu văn bản gốc đối lập giữa convention và contract, vẫn cần dùng cách diễn đạt ngữ nghĩa hóa cục bộ, do đó cùng một cách dịch tiếng Trung thông dụng sẽ không xóa mất sự khác biệt mà văn bản gốc thực sự muốn thể hiện.

## Xác minh

Quá trình di chuyển quét từng nhóm cặp song ngữ đang hoạt động, cập nhật các tài liệu tiếng Trung bị ảnh hưởng và ghi lại bản ghi đi kèm tương ứng, để phần nội dung chính đang hoạt động không còn xuất hiện「契约」. Cổng ghép cặp, `doc-sync` đầy đủ, build website, kiểm thử và snapshot prompt dịch thuật, cùng `git diff --check` cùng nhau xác minh corpus cuối cùng và các tài sản pipeline.
