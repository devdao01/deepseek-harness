# Agent Note: Hủy bắt buộc trong các capability seam mà công cụ tiếp cận được

Status: proposed

[English](2026-07-19-required-cancellation-through-tool-capability-seams.md) | Tiếng Việt

## Vấn đề

[Quy ước hủy của tool registry](../../implemented/architecture/2026-07-19-cooperative-tool-cancellation.md) đã hiện thực khiến `exec.signal` trong thân mỗi công cụ trở thành giá trị bắt buộc, nhưng nhiều interface năng lực bất đồng bộ mà thân công cụ đó tiếp cận được vẫn nhận signal ở dạng tùy chọn. Vì vậy, một công cụ có thể thỏa mãn kiểu của chính nó mà vẫn vô tình đánh mất khả năng hủy ở lời gọi tiếp theo trong cùng tiến trình.

Khoảng trống này lan truyền dọc theo chuỗi lời gọi. Công cụ hệ thống tệp có thể gọi phần phân giải đường dẫn và I/O, công cụ Web có thể gọi provider, công cụ Bash có thể gọi executor, còn công cụ tổ hợp có thể khởi động hoặc chờ tác vụ, subagent hay workflow. Chỉ cần một thao tác nào đó do công cụ nắm giữ và được công cụ chờ đợi mà lại cho phép bỏ qua signal, thì TypeScript không thể chứng minh rằng lệnh hủy vẫn đến được biên sở hữu tác dụng phụ.

Yêu cầu mọi hàm bất đồng bộ trong repo đều phải mang signal thì lại quá rộng. Có những thao tác công cụ không tiếp cận được, có những truy vấn đồng bộ không thể chờ hay nắm giữ công việc đang diễn ra, còn công việc đã được tách bạch rõ ràng thì sau khi bàn giao có chủ ý đã có chủ sở hữu mới.

## Đề xuất

Mọi thao tác năng lực bất đồng bộ trong cùng tiến trình mà thân công cụ tiếp cận được và được thực thi trong khi công cụ vẫn còn nắm giữ hoặc chờ thao tác đó, đều phải nhận `AbortSignal`. Tùy theo hình thái sẵn có của seam sở hữu nó, yêu cầu này có thể thể hiện dưới dạng tham số vị trí, hoặc dưới dạng trường request chỉ đọc bắt buộc, nhưng việc bỏ qua signal buộc phải khiến TypeScript biên dịch lỗi.

Mỗi bên gọi trực tiếp cung cấp signal do chính mình nắm giữ, hoặc truyền tiếp signal từ ngữ cảnh thao tác bắt buộc của chính nó. Phần hiện thực có thể dẫn xuất deadline con hoặc phạm vi hủy, nhưng signal dẫn xuất vẫn phải liên kết với signal thượng nguồn trong suốt thời gian ủy quyền. Phần hiện thực năng lực không được sinh ra signal không bao giờ abort, không được dùng cơ chế hủy async-local kiểu ambient, và cũng không được kiểm tra `AbortSignal` lúc runtime chỉ để lặp lại việc định kiểu cho một quy ước trong cùng tiến trình.

Quá trình di trú bắt đầu từ mỗi `ToolDefinition.execute()` first-party, kiểm kê dọc theo các lời gọi năng lực mà nó chờ đợi; sau đó sửa đổi theo từng seam Service Definition／Service Provider／Consumer gắn kết, kèm theo cả test và tài liệu API được sinh ra. Các họ năng lực như hệ thống tệp, Bash và tác vụ, Web và provider, workflow và subagent, code runtime có thể di trú qua các PR (Pull Request) độc lập để mỗi thay đổi vẫn review được; nhưng theo nguyên tắc tiền phát hành của repo, interface đã di trú không được giữ lại overload tương thích tùy chọn.

### Ranh giới phạm vi

Đề xuất này bao gồm các thao tác năng lực bất đồng bộ mà việc hoàn tất hoặc hủy vẫn thuộc vòng đời công cụ hiện tại, bao gồm thao tác khởi động trước khi chuyển giao quyền sở hữu, thực thi ở tiền cảnh, đọc ghi, request tới provider, các thao tác chờ, cùng những thao tác dọn dẹp hoặc giải phóng mà công cụ sẽ chờ.

Đề xuất này không bao gồm truy vấn registry đồng bộ, kiểm tra khả dụng, render schema, phân loại tham số, và các thao tác khác không thể duy trì công việc bất đồng bộ. Công việc tách rời sau khi đã bàn giao quyền sở hữu một cách tường minh cũng nằm ngoài phạm vi: khi tác vụ, workflow, worker hay subagent đã được phát hành thành công cho chủ sở hữu vòng đời mới, vòng đời tách rời của chúng do controller của chủ sở hữu mới quản lý. Thao tác phát động khởi động vẫn phải nhận signal của bên gọi cho tới khi việc bàn giao được commit; sau đó, nếu một lời gọi công cụ khác chờ công việc tách rời đó thì phải dùng signal của chính lời gọi ấy.

Nếu bản thân giao thức bên ngoài cho phép bỏ qua việc hủy, thì parser, config, JSON của mô hình và công cụ, định dạng lưu bền và tệp, worker, tiến trình hay đầu vào giao thức vẫn có thể giữ cơ chế hủy tùy chọn. Biên sở hữu phải phân tích đầu vào đó thành một signal bắt buộc trong cùng tiến trình trước, rồi mới gọi capability seam đã di trú.

## Các phương án đã cân nhắc

**Vì thân công cụ đã nhận được signal nên cứ để signal hạ nguồn ở dạng tùy chọn.** Không chấp nhận, vì việc có signal ở callback lớp ngoài không làm cho quá trình truyền tiếp trở nên an toàn kiểu; mỗi lời gọi năng lực tùy chọn vẫn có thể bỏ qua nó một cách hợp lệ.

**Ép truyền tiếp bằng quy tắc lint hoặc kiểm tra callback.** Không chấp nhận, vì kiểm tra cú pháp không thể nhận diện đáng tin cậy quyền sở hữu, signal dẫn xuất, tầng trừu tượng hay hành vi dừng hẳn đúng đắn. Tham số interface bắt buộc có thể diễn đạt quy ước ngay tại nơi mà TypeScript kiểm tra được mọi bên gọi.

**Truyền `ToolRunContext` vào mọi năng lực.** Không chấp nhận, vì cái mà năng lực cần là khả năng hủy, chứ không phải danh tính công cụ, trạng thái agent (tác tử) hay tính năng hoãn ngữ cảnh. Truyền một ngữ cảnh lớn hơn sẽ làm dịch vụ tái sử dụng được bị ghép cứng vào tool registry, đồng thời che khuất seam hẹp.

**Dùng signal async-local kiểu ambient.** Không chấp nhận, vì việc truyền ngầm khiến quyền sở hữu và việc bàn giao tách rời khó kiểm toán, làm phức tạp việc kiểm thử, và có thể khiến lời gọi âm thầm gắn vào vòng đời sai.

**Thêm signal mặc định hoặc không bao giờ abort trong phần hiện thực năng lực.** Không chấp nhận, vì giá trị mặc định sẽ xóa dấu vết của chủ sở hữu bị thiếu, thay vì phơi bày vấn đề ở thời điểm biên dịch.

**Di trú toàn bộ năng lực ngay trong thay đổi tool registry đã hiện thực.** Không chấp nhận, vì việc sửa interface mang tính bắc cầu trải rộng qua các họ năng lực độc lập. Giữ riêng đề xuất này vừa bảo toàn được quyết định về registry đã hiện thực, vừa cho phép mỗi seam sâu hoàn tất di trú bằng test tập trung.

## Tiêu chí chấp nhận

- Bản kiểm kê ánh xạ mỗi thân công cụ first-party tới toàn bộ thao tác năng lực bất đồng bộ có thể tiếp cận trước khi bàn giao quyền sở hữu.
- Mỗi interface năng lực trong phạm vi đều yêu cầu `AbortSignal`, và có test quy ước ở thời điểm biên dịch chứng minh rằng bỏ qua signal sẽ thất bại.
- Interface, phần hiện thực, bên tiêu thụ trực tiếp, hàm hỗ trợ test, ví dụ và tài liệu tham chiếu API được sinh ra phải di trú cùng nhau, không giữ lại overload tương thích hay sentinel không bao giờ abort trong môi trường production.
- Deadline dẫn xuất và phạm vi của tầng bọc vẫn liên kết với signal của bên gọi, và integration test chứng minh lệnh hủy đến được chủ sở hữu tác dụng phụ, đồng thời công việc đang chờ dừng hẳn hoàn toàn.
- Truy vấn đồng bộ và công việc tách rời sau khi đã bàn giao tường minh không bị ràng buộc bởi yêu cầu này; khi có sự mơ hồ thì cần ghi lại và kiểm thử phần chuyển giao quyền sở hữu.
- Chỉ thêm kiểm tra runtime tại những biên thực sự không có kiểu, không được lặp lại việc kiểm tra những trường hay tham số mà TypeScript đã yêu cầu.
- Sau mỗi lần di trú gắn kết, toàn bộ cổng kiểm tra kiểu ở cấp cao nhất, độ phủ, snapshot, tài liệu, đồ thị module, build, hygiene, demo và artifact build đều phải qua.

## Rủi ro

**Phạm vi ảnh hưởng bắc cầu khá lớn.** Một tham số bắt buộc có thể đồng thời phơi bày rất nhiều bên gọi trực tiếp. Nên di trú theo từng họ năng lực gắn kết, và coi các lỗi kiểm tra kiểu như một bản kiểm kê bên gọi hoàn chỉnh.

**Phân định sai công việc tách rời.** Loại trừ thao tác khởi động quá sớm có thể khiến công việc thoát khỏi tầm kiểm soát trước khi việc phát hành được commit; còn yêu cầu signal của bên cha một cách vĩnh viễn lại có thể khiến một công cụ đã hoàn tất hủy mất phần công việc tách rời hợp lệ. Mỗi lần bàn giao đều cần điểm commit rõ ràng, chủ sở hữu mới, hành vi rollback và đường thất bại dừng hẳn hoàn toàn.

**Nhầm lẫn quyền sở hữu signal.** Nếu năng lực lưu giữ signal đi mượn vượt ra ngoài vòng đời ủy quyền thì có thể khiến công việc bị gắn vào bên gọi đã cũ. Interface và test phải phân biệt giữa signal thao tác đi mượn và controller do dịch vụ vòng đời dài nắm giữ.

**Chỉ tuân thủ máy móc mà không có hành vi hợp tác.** Tham số bắt buộc chỉ chứng minh signal khả dụng, chứ không chứng minh phần hiện thực sẽ quan sát hay chuyển tiếp nó. Biên tiến trình, worker, socket, provider và tác vụ vẫn cần integration test chứng minh hành vi thực tế.

**Đưa các API đồng bộ hoặc không liên quan vào phạm vi.** Yêu cầu khả năng hủy ở nơi không tồn tại công việc bất đồng bộ chỉ tăng thêm nhiễu và làm giảm tính nhận diện của quy ước. Trước khi sửa, bản kiểm kê cần ghi lại lý do vì sao mỗi thao tác có thể được công cụ tiếp cận và mang vòng đời của nó.
