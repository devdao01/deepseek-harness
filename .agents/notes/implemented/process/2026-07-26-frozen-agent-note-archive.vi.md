# Agent Note: Đóng băng các Agent Note có giá trị định hướng tương lai thấp ra khỏi tập hồ sơ đang hoạt động

Status: implemented

[English](2026-07-26-frozen-agent-note-archive.md) | Tiếng Việt

## Vấn đề

Agent Note implemented được duy trì liên tục như hồ sơ quyết định hiện hành, vì vậy mỗi path, symbol, giá trị mặc định, bản dịch, code block rào chắn, tham chiếu package và link ra ngoài trong tập hồ sơ đang hoạt động đều tạo thành một nghĩa vụ duy trì. Khi lý lẽ quyết định có thể định hướng công việc tương lai, chi phí này là hợp lý; nhưng với những chi tiết UI đã xong việc, các bản fix nhỏ, cơ chế implementation đã bị thay thế, hoặc lịch sử quy trình mà lý lẽ hiện hành đã chuyển sang nơi khác, chi phí này không đáng bỏ ra. Xóa toàn bộ hồ sơ implemented có giá trị thấp sẽ xóa mất bằng chứng lịch sử hữu ích, còn giữ lại mọi đề xuất bị từ chối lại để lại những ý tưởng vừa không thể được chấp nhận vừa không mang tính gợi mở. Tập hồ sơ này cần một ranh giới lưu giữ, phân biệt giữa định hướng đang hoạt động và lịch sử đã đóng băng, đồng thời không biến việc lưu trữ (archive) thành thêm một tầng duy trì nữa.

## Quyết định

Chỉ Agent Note implemented mới có thể được lưu trữ. Khi quyết định giao nộp của một hồ sơ đã implement đã hoàn thiện trọn vẹn, và lý lẽ quyết định, các phương án thay thế, hệ quả, đảm bảo phủ định và điều kiện tái đưa vào của nó khó có khả năng còn định hướng công việc tương lai, hồ sơ đó được chuyển vào lưu trữ. Các ranh giới nền tảng, ngữ nghĩa lâu bền và ngữ nghĩa giao thức, quy tắc bảo mật, các lựa chọn thiết kế lặp lại và có vẻ hấp dẫn, cùng các điều kiện tái đưa vào chưa được giải quyết, bất kể thời gian tồn tại hay số từ của hồ sơ, vẫn tiếp tục được giữ lại làm hồ sơ đang hoạt động. Agent Note proposed không bao giờ đi vào lưu trữ; các đề xuất đã lỗi thời nên được chuyển thành rejected. Agent Note rejected chỉ được giữ lại khi nó vẫn giúp tránh một sai lầm hấp dẫn và có tác động đáng kể, nếu không thì xóa hoàn toàn cả bộ ba file ghép cặp của nó.

Đường dẫn lưu trữ là `.agents/notes/archived/{kind}/yyyy-mm-dd-topic.md`, trong đó tầng `implemented` dư thừa được lược bỏ. Thay đổi lưu trữ sẽ di chuyển trọn vẹn ba file — tiếng Anh, tiếng Trung và hồ sơ đồng hành nhất quán — giữ nguyên `Status: implemented`, và chèn `Archived: YYYY-MM-DD` ngay sau dòng status đó trong cả hai ngôn ngữ. Khi lưu trữ, chỉ được phép di chuyển file, thêm dòng metadata đó, ghi lại hồ sơ đồng hành tương ứng, và sửa cơ học các link trỏ vào.

`.rgignore` ở gốc repo sẽ loại thư mục lưu trữ khỏi các tìm kiếm bắt đầu từ thư mục cấp trên. Khi cần tìm nội dung lịch sử, thư mục lưu trữ sẽ được chỉ định tường minh, nên vẫn có thể truy cập khi cần, mà không trộn lẫn các sự kiện đã đóng băng vào việc tra cứu các quyết định đang hoạt động.

Sau khi lưu trữ, ba file đó bị đóng băng vĩnh viễn, chỉ còn là bối cảnh lịch sử, không còn là lý lẽ quyền hạn hiện hành. Không được cập nhật file đã lưu trữ vì lý do đổi tên package, thay đổi hành vi, chuẩn dịch thuật, quy tắc định dạng, link ra ngoài bị hỏng, hay các quy ước tài liệu về sau. Tài liệu đang hoạt động có thể chủ ý link tới một Agent Note đã lưu trữ, cũng có thể chuyển hướng link đó sang lý lẽ quyền hạn hiện hành, hoặc xóa hẳn. Do đó, cổng kiểm soát của repo sẽ xác thực các link trỏ vào file đã lưu trữ, nhưng không bao giờ dùng file đã lưu trữ làm nguồn link để xác thực.

[`verify-archived-agent-notes`](../../../../scripts/verify-archived-agent-notes.ts) chịu trách nhiệm duy trì ranh giới đóng băng. Nó chỉ chấp nhận Agent Note thuộc tập hợp category đóng kín, yêu cầu đủ ba file ghép cặp, trạng thái là implemented, ngày lưu trữ hợp lệ và khớp nhau; nó còn xác thực hồ sơ đồng hành bằng Git blob hash hiện hành của cả hai bên, và niêm phong từng sản phẩm theo path và hash nội dung SHA-256 trong một manifest (bảng kê metadata) chỉ-thêm-vào. Chế độ `--write` của nó sẽ chứng minh nội dung ứng với từng bản ghi niêm phong hiện có chưa hề thay đổi, trước khi chỉ thêm vào các sản phẩm mới được lưu trữ. CI của pull request sẽ cung cấp SHA cơ sở đáng tin cậy và checkout đầy đủ lịch sử trước khi chạy trình kiểm chứng, nên việc tái sử dụng shallow clone checkout trên runner không thể bỏ sót manifest cơ sở. Các cổng kiểm soát thông thường về định dạng Agent Note, ghép cặp bản dịch, xuống dòng, link Markdown, path package, Mermaid, TypeScript tài liệu và tương đương kiểu đều loại trừ file nguồn đã lưu trữ, nên các chuẩn đang tiếp tục tiến hóa của những cổng kiểm soát này sẽ không tạo áp lực sửa đổi hồ sơ lịch sử.

Workflow [`dsh-archive-agent-notes`](../../../skills/dsh-archive-agent-notes/SKILL.md) chịu trách nhiệm phán đoán phân loại. Nó yêu cầu kiểm toán ngữ nghĩa từng Agent Note một, dùng code và tài liệu hiện hành để nhận diện lý lẽ quyền hạn hiện hành, chỉ dùng số từ như một phép sàng lọc sơ bộ, thu thập các ví dụ giữ lại, lưu trữ và xóa đã được hiệu chỉnh, và báo cáo những kết quả thực sự nằm ở ranh giới để đưa ra review.

Khi viết một Agent Note mới, hãy kiểm tra quan hệ thay thế ngay lúc đó, chứ không lùi lại đến khi dọn dẹp tập hồ sơ sau này. Tác giả sẽ so sánh hồ sơ mới với các hồ sơ đang hoạt động bao phủ cùng một quyết định, cơ chế, hoặc phương án thay thế đã bị từ chối, và phán quyết từng trường hợp là thay thế hoàn toàn hay thay thế một phần. Cặp bộ ba file của Agent Note implemented đủ điều kiện sẽ được lưu trữ trong cùng một pull request; các hồ sơ chỉ bị thay thế một phần, cùng các lý lẽ quyết định vẫn còn giá trị độc lập, sẽ tiếp tục được giữ làm hồ sơ đang hoạt động và liên kết chéo với hồ sơ mới, còn Agent Note proposed và rejected khớp với trường hợp đó thì tuân theo quy tắc vòng đời riêng của chúng.

## Phương án thay thế đã cân nhắc

**Xóa mọi hồ sơ bị đưa ra khỏi tập hồ sơ đang hoạt động.** Không chấp nhận, vì hồ sơ implemented có thể có giá trị định hướng tương lai thấp nhưng vẫn cung cấp bằng chứng lịch sử hữu ích cho các quyết định đã hoàn tất. Việc lưu trữ được niêm phong theo hash nội dung vừa giữ được bằng chứng đó, vừa không giả vờ rằng chúng vẫn phản ánh trạng thái hiện hành.

**Tiếp tục giữ mọi Agent Note implemented và rejected làm hồ sơ đang hoạt động.** Không chấp nhận, vì các hồ sơ không còn giúp ích cho quyết định tương lai sẽ liên tục làm tăng chi phí duy trì và nhiễu tìm kiếm. Đặc biệt Agent Note rejected chỉ đáng giữ khi nó có thể ngăn được một ngộ nhận có khả năng xảy ra.

**Để Agent Note đã lưu trữ tiếp tục xuất hiện trong kết quả tìm kiếm mặc định của repo.** Không chấp nhận, vì sự kiện lưu trữ theo thiết kế có thể đã lỗi thời, và có thể xếp trước kết quả hiện hành chỉ vì khớp câu chữ. Khi cần tìm nội dung lịch sử, có thể tìm kiếm tường minh trong thư mục lưu trữ.

**Để việc dọn dẹp quan hệ thay thế đến kỳ kiểm toán định kỳ tập hồ sơ mới làm.** Không chấp nhận, vì tác giả của hồ sơ thay thế nắm bằng chứng mới nhất về việc quy thuộc và chồng lấn. Trì hoãn sẽ để lại lý lẽ quyền hạn dư thừa đang hoạt động, và làm tăng chi phí phân loại về sau.

**Đồng thời lưu trữ cả Agent Note rejected hoặc proposed.** Không chấp nhận, vì trạng thái lưu trữ diễn đạt "quyết định lịch sử đã được thực hiện". Các đề xuất lỗi thời cần được chuyển rõ ràng thành rejected; Agent Note rejected không cung cấp giá trị phòng lỗi thì nên xóa, thay vì đặt vào một nơi lưu trữ giá trị thấp thứ hai.

**Tiếp tục áp dụng mọi cổng kiểm soát tài liệu cho Agent Note đã lưu trữ.** Không chấp nhận, vì các quy tắc định dạng, dịch thuật, code, package hoặc link được thêm sau này sẽ buộc người duy trì phải viết lại các snapshot lịch sử. Thay vào đó, giao cho một trình kiểm chứng chuyên dụng chịu trách nhiệm về tính toàn vẹn và bất biến.

**Cho phép cập nhật sự kiện, chỉ đóng băng lý lẽ quyết định.** Không chấp nhận, vì điều này sẽ tái đưa vào gánh nặng phán đoán và dịch thuật của tập hồ sơ đang hoạt động, đồng thời khiến người đọc không thể phân biệt điều khoản nào thuộc về lịch sử. Sự kiện hiện hành nên được viết trong tài liệu đang hoạt động hoặc một Agent Note đang hoạt động mới.

## Hệ quả

Tập hồ sơ đang hoạt động gồm các quyết định dự kiến vẫn còn ảnh hưởng đến công việc tương lai; lịch sử triển khai có giá trị định hướng tương lai thấp vẫn có thể tìm kiếm và liên kết tường minh, nhưng không còn tiêu tốn công sức duy trì, cũng không xuất hiện trong tìm kiếm bắt đầu từ thư mục cấp trên. Việc viết hồ sơ mới sẽ bao gồm một bước kiểm tra quan hệ thay thế có phạm vi rõ ràng, nên quyết định mới thay thế quyết định cũ không thể âm thầm để lại hồ sơ đang hoạt động dư thừa. Khi hồ sơ bị từ chối không còn bảo vệ một lựa chọn có ý nghĩa, có thể dọn dẹp loại tạp này; các đề xuất cũng không thể lách qua một kết luận rõ ràng bằng cách lưu trữ. Cơ chế lưu trữ bổ sung một manifest, một trình kiểm chứng chuyên dụng và một bước metadata tường minh, chỉ thực hiện một lần. Sự kiện và link ra ngoài trong lưu trữ theo thiết kế có thể dần lỗi thời, nên người đọc và agent phải coi code và tài liệu đang hoạt động là lý lẽ quyền hạn, và chỉ dùng Agent Note đã lưu trữ như tham chiếu lịch sử.
