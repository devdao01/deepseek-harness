# Agent Note: Giao ước bất biến của gói phải có ý nghĩa

Status: implemented

[English](2026-07-19-package-invariant-runtime-contracts.md) | Tiếng Việt

## Vấn đề

Service bất biến do chính gói sở hữu đã giúp việc phát hành và đăng ký đạt độ phủ toàn bộ, nhưng đường cơ sở sinh mã ban đầu lại cho phép trình cài đặt rỗng. Phương án tiếp theo thay các phần hiện thực rỗng đó bằng những khẳng định chung chung nhắm vào tên plugin, inject, effect, phương thức service và các ví dụ cố định trong thư viện tiện ích thuần túy. Tuy những khẳng định này khiến mọi companion đều thực thi được, chúng không làm hệ thống an toàn hơn: TypeScript, quá trình khởi động Cordis, test của gói và test nạp mô-đun đã ràng buộc các hình thái đó rồi, trong khi service bất biến lẽ ra phải phát hiện những trạng thái lúc chạy không thể xảy ra.

Một bất biến lúc chạy hữu ích sẽ liên kết nhiều quan sát theo thời gian, hoặc liên kết nhiều phần trong một cấu trúc dữ liệu khả biến. Ví dụ: sự kiện kết thúc không có sự kiện bắt đầu tương ứng, delta của LLM (mô hình ngôn ngữ lớn) trỏ tới một khối chưa được mở, hoặc identity của kết quả được lưu bền khác với identity của yêu cầu. Việc chỉ xác nhận rằng phương thức đã khai báo có tồn tại, tên plugin đúng như mong đợi, hay ví dụ hằng số vẫn trả về giá trị đã biết thì không thuộc loại quan hệ này.

Có những gói thực sự không có quan hệ nào quan sát bền được. Gói tiện ích thuần túy, gói chỉ lo việc kết hợp, adapter mỏng, entry thực thi được và gói hỗ trợ test có thể vẫn có những giao ước quan trọng, nhưng kiểm tra kiểu, kiểm tra nạp, unit test tập trung hoặc integration test mới là nơi phù hợp để thực thi các giao ước đó. Ép những gói này thêm khẳng định lúc chạy được chế ra chỉ khiến phần hiện thực tối ưu cho việc qua cổng kiểm tra, chứ không phải để phát hiện hỏng hóc.

## Quyết định

### Đăng ký phải phủ toàn bộ; khẳng định phải có ý nghĩa

Mỗi gói workspace đều phát hành một companion `./invariant` được build riêng, và đăng ký bằng tên npm đầy đủ. Companion chỉ được nhận một trong hai hình thức sau:

- Cài đặt kiểm tra trên luồng sự kiện của chính gói hoặc trên cấu trúc dữ liệu khả biến liên quan, và báo cáo vi phạm qua reporter `fail(message)` đã được ràng buộc; hoặc
- Dùng trình cài đặt rỗng, kèm ngay trước phần khai báo một chú thích riêng của gói bắt đầu bằng `No runtime invariant:`, giải thích vì sao gói đó không có quan hệ lúc chạy hợp lý nào để quan sát.

Hình thức rỗng là một kết luận kiến trúc rõ ràng, không phải chỗ giữ chỗ do sinh mã. Nếu về sau thay đổi trong gói đưa vào trạng thái khả biến hoặc giao thức sự kiện, thì phải thay lời giải thích đó bằng kiểm tra tương ứng.

Service trung tâm `dsh-invariants` chỉ chịu trách nhiệm về cấu hình, tính duy nhất khi đăng ký, vòng đời fiber con, rollback, dispose (giải phóng tài nguyên) và quy thất bại về đúng gói. Nó không phơi ra helper khẳng định chung về hình thái plugin, hình thái service hay khởi động, và cũng không import gói sản phẩm.

### Các kiểm tra đã triển khai

Workspace hiện tại gồm 103 gói, trong đó có 21 companion thực thi được và 82 companion rỗng có lý do.

| Chủ sở hữu | Quan hệ lúc chạy |
|---|---|
| `dsh-session` | Số thứ tự tăng nghiêm ngặt, quan hệ bao quanh giữa lượt/bước, và sự ghép cặp tool call / tool result trong cùng một bước. |
| `dsh-agent` | Trạng thái agent (tác tử thông minh) không được lặp lại, và không được rời khỏi trạng thái kết thúc disposed. |
| `dsh-scope` | Sự kiện phạm vi phải mang carrier, và subject định tuyến phải nhất quán. |
| `dsh-agent-loop` | Dựng lại yêu cầu loop đã đóng băng kèm nhãn tường minh từ nhật ký sự kiện phiên. |
| `dsh-llm` | Văn phạm của các khối trong luồng, khớp kiểu/chỉ số delta, usage đúng một lần, đóng khối và finish kết thúc. |
| `dsh-llm-retry` | Bản ghi retry được lưu bền trỏ tới bước đóng gần nhất trong lượt đang mở hiện tại; bản ghi của mỗi bước là duy nhất, số lần retry tăng đơn điệu, và cả số lần retry lẫn độ trễ timer không âm đều nằm trong biên. |
| `dsh-tools` | Các pha pre/execute/post tiến đơn điệu, và snapshot execution/result cuối cùng là bất biến. |
| `dsh-system-prompt` | Ràng buộc dữ liệu của section, tool và variable trong assembly có thẩm quyền. |
| `dsh-compaction` | Ghép cặp start/summary/end của nén (compaction), các điểm đầu cuối của khoảng, số lượng token, và bắt buộc phải có summary khi thành công. |
| `dsh-hook-protocol` | Ràng buộc về liên kết, dialect, identity và duration giữa invocation/result của hook. |
| `dsh-sandbox-policy` | Sự kiện `sandbox/mode` được lưu bền phải dùng bộ từ vựng sandbox-mode đóng. |
| `dsh-fs` | Sự kiện quyết định/quan sát của hệ tệp phải mang identity target và version dùng được. |
| `dsh-goal` | Snapshot mục tiêu được lưu bền giữ quan hệ về quy thuộc nguồn, nội dung render, số hiệu bản sửa đổi, vòng đời và dấu thời gian, đồng thời bảo đảm các Round đã được nhận vào được đánh số liên tục. |
| `dsh-goal-round-driver` | Thông điệp tiếp tục thực thi bắt nguồn từ mục tiêu phải khớp với prompt được dựng lại từ trạng thái mục tiêu đã lưu bền trước đó. |
| `dsh-subagent` | Sự kiện add/remove của bên cung cấp và start/end của child phải giữ được identity và ghép cặp. |
| `dsh-permission-presets` | Quyết định permission được lưu bền phải tham chiếu tới preset trong bảng permission hiện tại. |
| `dsh-user-approval` | Bản ghi approval asked/decided được ghép cặp theo call, và dùng outcome cùng policy hợp lệ. |
| `dsh-workflow` | Sự kiện start/end của workflow và child-agent giữ quan hệ về run metadata, identity, outcome, số lượng và error. |
| `dsh-jobs` | Snapshot task hiện tại và ở trạng thái kết thúc giữ quan hệ id/kind, owner, status và timestamp. |
| `dsh-tool-todo` | Snapshot toàn phần được lưu bền dùng các mục duy nhất, đã trim, và status đóng. |
| `dsh-time-context` | Số đọc đồng hồ có ghi chú nguồn plugin phải khớp với lượt đang mở hiện tại của phiên, vị trí trước khi bước kế tiếp bắt đầu, và elapsed baseline; thời gian render phải phân tích được và không được muộn hơn sự kiện tương ứng. |

Các companion dựa trên phiên sẽ kiểm chứng các sự kiện đã lưu bền lúc nạp; khi quan hệ phụ thuộc vào thứ tự sự kiện, chúng dùng tiền tố các sự kiện đứng trước mỗi sự kiện ứng viên. Các kiểm tra khác quan sát ranh giới sự kiện thời gian thực có thẩm quyền hoặc kết quả service khả biến. Nếu việc chấp nhận một sự kiện không hợp lệ sẽ đưa hệ thống vào trạng thái sai, thì việc kiểm chứng được thực hiện trước khi phát hành.

### Cổng kiểm tra và test của kho mã

`verify-package-invariants` phát hiện mọi gói workspace, và bắt buộc phải đầy đủ: tệp nguồn companion, đăng ký bằng tên đầy đủ, hình thái Loader chỉ chứa export có tên, export `./invariant`, tệp phát hành, phụ thuộc, TypeScript reference và bundle entry. Các quy tắc AST của nó từ chối dấu hiệu sinh mã, default export và trình cài đặt rỗng không có giải thích. Trình cài đặt không rỗng phải nhận và dùng reporter báo lỗi, và khi đăng ký còn phải truyền vào chính hàm `install` cục bộ đã được kiểm tra đó. Cổng kiểm tra không suy diễn chất lượng ngữ nghĩa từ tên phương thức hay lời gọi helper.

Vitest gắn `InvariantRegistry` với `{ enabled: true }` cho topo test của từng gói, và nạp companion của chủ sở hữu. Path mapping cho subpath bất biến sẽ phân giải tới companion nguồn, chứ không tới sản phẩm build đã cũ. Các suite tập trung phủ cả quan sát hợp lệ lẫn không hợp lệ của từng companion thực thi được; topo vét cạn chạy mọi companion nguồn qua việc chuẩn hóa namespace của Loader thật. Sau khi cổng kiểm tra cấu trúc kiểm chứng ánh xạ phát hành của từng gói, cổng kiểm tra sản phẩm sẽ stage các tệp `lib/` mà manifest (bản kê metadata) của gói khai báo, import `./invariant` đã biên dịch qua self-reference dưới Node thuần, và lặp lại kiểm tra hình thái Loader đó; nhờ vậy, nếu companion import một mảnh runtime chưa khai báo, cổng kiểm tra sẽ fail trước khi phát hành. Các test dựng luồng sự kiện tổng hợp phải tạo ra vòng đời bao quanh hợp lệ, trừ khi bản thân test đang khẳng định một vi phạm.

## Các phương án đã cân nhắc

- **Giữ nguyên companion rỗng do sinh mã.** Bị từ chối, vì sau khi một gói có được quan hệ lúc chạy có ý nghĩa, chỗ giữ chỗ không có giải thích vẫn có thể tiếp tục tồn tại.
- **Bắt mọi gói đều phải thực thi khẳng định.** Bị từ chối, vì khẳng định về sự tồn tại của phương thức, hình thái plugin và ví dụ cố định chỉ lặp lại các giao ước mạnh hơn của kiểu, nạp và unit test, mà không kiểm tra tính nhất quán lúc chạy.
- **Giữ helper hình thái chung trong service.** Bị từ chối, vì điều đó làm lẫn lộn việc kiểm chứng API lúc biên dịch với bất biến lúc chạy, và khuyến khích định nghĩa giả định sản phẩm ở trung tâm.
- **Chuyển kiểm tra sản phẩm vào service.** Bị từ chối, vì từ vựng sản phẩm, phụ thuộc, test và quyền sở hữu thay đổi phải thuộc về chính gói sinh ra dữ liệu đó.
- **Đăng ký companion một cách ngầm định từ entry gốc.** Bị từ chối, vì thứ tự kết hợp và sự tồn tại tùy chọn của service sẽ tạo ra effect ẩn.

## Hệ quả

- Mỗi gói đều có quyền sở hữu và wiring phát hành nhìn thấy được, nhưng chỉ những gói có quan hệ lúc chạy hợp lý mới thêm listener hoặc trạng thái trace.
- Companion rỗng là một quyết định có thể review được, kèm giải thích riêng của gói; xóa lời giải thích thì cổng kiểm tra sẽ fail.
- Khai báo kiểu, khả năng nạp bởi Cordis, metadata plugin, API phương thức service và đại số thuần túy vẫn tiếp tục được các cổng biên dịch, nạp, unit hoặc integration tương ứng phủ.
- Thất bại lúc chạy sẽ chỉ rõ gói npm sở hữu nó và nêu quan sát không nhất quán, chứ không thuật lại hình thái API bắt buộc.
- Các giao ước service sẵn có về selection, thứ tự ưu tiên blocklist, sở hữu trùng lặp, rollback, dispose và HMR (thay thế mô-đun nóng) giữ nguyên không đổi.
