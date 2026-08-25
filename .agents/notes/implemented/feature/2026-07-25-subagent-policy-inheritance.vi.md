# Agent Note: Kế thừa chính sách subagent trong tiến trình — sub agent khởi động dưới các ghi đè sandbox của cha

Status: implemented

[English](2026-07-25-subagent-policy-inheritance.md) | 中文

## Vấn đề

Cả ghi đè sandbox và ghi đè phê duyệt đều được gấp theo log ở cấp session. Subagent trong tiến trình sẽ nhận một session mới, nên spawn sub agent (agent thông minh) trước đây sẽ quay về giá trị mặc định của deployment, còn fork sub agent thì chỉ thấy được các chuyển đổi nằm trong tiền tố lượt đã hoàn thành của nó. Do đó, việc ủy quyền có thể nới lỏng một cha đã chuyển sang `read-only`.

## Quyết định

Ranh giới ủy quyền nằm trước lần await đầu tiên, thông qua hàm hỗ trợ sub agent dùng chung (`captureDelegatedPolicyOverrides`／`appendDelegatedPolicyOverrides` trong `dsh-subagent`) để lấy snapshot từ `sandboxPolicy.overrideOf(parent.session)`; cả driver một lần lẫn [khởi động có thể tiếp tục](2026-08-10-continuable-subagent-policy-inheritance.md) đều gọi các hàm hỗ trợ này. Chuyển đổi sau đó của cha thuộc về tương lai của cha; sau khi hủy rồi ủy quyền lại sẽ lấy snapshot mới. Dịch vụ chính sách sandbox là tùy chọn, chỉ sao chép ghi đè session tường minh, không bao giờ sao chép giá trị mặc định của deployment hay ủy quyền một lần. Chính sách phê duyệt không kế thừa: cùng một lần chụp sẽ chốt mỗi sub agent thành `'never'` — [quyết định chốt phê duyệt](2026-08-10-subagent-approval-pinned-never.md) đã thay thế việc kế thừa ghi đè phê duyệt vốn có trong note này.

Mỗi giá trị được chụp sẽ trở thành một sự kiện `sandbox/mode` hoặc `approval/policy` có gắn nhãn nguồn gốc, được factory sub agent bổ sung vào giai đoạn cài đặt chưa công bố. Constructor của session đã cố định `Session.firstLiveSeq` bằng độ dài tiền tố fork, nên sự kiện kế thừa sẽ xếp sau lịch sử fork, đi vào telemetry khi sub agent được công bố, đồng thời giữ `SessionHeader.seedLength` bằng độ dài tiền tố này. Do đó, cơ chế gấp sự kiện cuối cùng thắng vốn có sẽ khiến snapshot ủy quyền đè lên lịch sử fork cũ, và các chuyển đổi tiếp theo của sub agent lại đè lên snapshot đó. Sub agent thế hệ cháu sẽ gấp trạng thái mà cha nó đã ghi lại, nên không cần thêm một cơ chế kế thừa khác để tổ hợp quy tắc này.

Việc append session thông thường sẽ kiểm tra sự kiện kế thừa trước khi công bố, còn tầng persistence sẽ chụp toàn bộ log chưa công bố khi session được công bố. Vì vậy, bất kỳ log sub agent nào đã được vật chất hóa đều sẽ lưu sự kiện kế thừa trong lô dữ liệu đầu tiên; không tồn tại một bộ lưu trữ chính sách, trường schema, hay chỉ mục truy vấn thứ hai. Nhãn `source: 'delegation'` giúp phần diễn giải phê duyệt phân biệt được giữa kế thừa và chuyển đổi do người dùng thực hiện ở phía sub agent.

### Chuyện gì xảy ra với sub agent bị chặn

Sub agent bị hạn chế sẽ nhận nhãn từ chối thông thường, còn yêu cầu nâng cấp bị chính sách `'never'` đã chốt của sub agent từ chối một cách xác định; khai báo ngữ cảnh runtime `subagent:delegation` báo cho sub agent biết cần báo cáo giới hạn thay vì thử lại, cha agent do controller nắm giữ có thể nới lỏng session của chính mình rồi ủy quyền lại ([quyết định chốt phê duyệt](2026-08-10-subagent-approval-pinned-never.md)).

## Phương án thay thế đã cân nhắc

- **Trường chính sách `SessionHeader` dùng chung**: không được chấp nhận. Chúng sẽ sao chép một sự kiện thuộc event sourcing vào metadata và yêu cầu lan truyền xuyên suốt kiểu session lõi, backend persistence, chỉ mục truy vấn, định danh collision và mọi bên tiêu thụ chính sách. Sự kiện ở giai đoạn cài đặt chưa công bố đã có đúng thứ tự cần thiết và tái sử dụng persistence sẵn có.
- **Gộp sự kiện chính sách mới vào lịch sử construction**: không được chấp nhận. `Session.firstLiveSeq` sẽ xếp toàn bộ seed construction vào lịch sử replay, khiến telemetry bỏ qua các sự kiện chỉ thuộc về sub agent. Giai đoạn cài đặt chưa công bố để lịch sử và sự kiện mới nằm ở phía vốn có của ranh giới đó, không cần thêm option session nào nữa.
- **Listener prompt đầu tiên**: không được chấp nhận. Dù giao dịch tạo mới đã cho phép append log trước khi công bố, nó vẫn sẽ tạo thêm ranh giới thứ tự listener và thời điểm muộn hơn.
- **Sao chép giá trị mặc định của deployment**: không được chấp nhận. Giá trị mặc định vẫn thuộc quyền sở hữu của vận hành viên và có thể thay đổi; cha chưa chuyển đổi sẽ không ghi giá trị nào, nên sub agent của nó sẽ theo deployment hiện hành.
- **Giải quyết theo `parentSession` thời gian thực ở mỗi lần gọi**: không được chấp nhận. Điều này sẽ phá vỡ bất biến cách ly "hai session không bao giờ thấy trạng thái của nhau", yêu cầu session cha phải giữ trạng thái tải trong suốt vòng đời sub agent, còn khiến chuyển đổi mà cha thực hiện trong lúc sub agent đang chạy hồi tố thay đổi một sub agent đang chạy. Chụp snapshot tại thời điểm ủy quyền chính là ngữ nghĩa thiết kế: sub agent giữ nguyên chính sách tại thời điểm được giao; sau khi hủy rồi spawn lại mới nhận được chính sách đã siết chặt.
- **Buộc dùng `'never'`**: note này ban đầu không chấp nhận làm hành vi kế thừa, lý do là giá trị bắt buộc sẽ loại trừ bộ trả lời sub agent tương lai; kết luận đó đã bị [quyết định chốt phê duyệt](2026-08-10-subagent-approval-pinned-never.md) lật lại, lý do hiện hành thuộc về quyết định đó. Định tuyến ask tới controller gốc cần quyền sở hữu chuỗi cha và `callId` khởi tạo spawn, vẫn hoãn theo [Agent Note về seam phê duyệt](2026-07-06-approval-seam.md).

## Hậu quả

- Sub agent trong tiến trình dạng spawn, fork và lồng nhau sẽ giữ nguyên ghi đè sandbox tường minh của cha, và bị chốt phê duyệt thành `'never'`. Bộ test suite tập trung chứng minh việc từ chối filesystem thật, ưu tiên lịch sử fork cũ, chụp snapshot tại thời điểm ủy quyền, ranh giới sự kiện thời gian thực, bỏ qua giá trị mặc định và giải phóng context.
- Snapshot headless không cần khóa là bài test hồi quy ở tầng ứng dụng đã lắp ráp: chỉ cha là `read-only`, giá trị mặc định deployment là `workspace-write`; nếu bỏ việc chụp snapshot, cả hai kiểm tra — sự kiện persistence của sub agent và việc ghi đĩa bị từ chối — đều sẽ thất bại.
- Mỗi lần ủy quyền tăng thêm tối đa hai sự kiện chỉ dùng cho log. Kiểu peer tùy chọn của hai dịch vụ chính sách thuộc sở hữu `dsh-subagent` — hàm hỗ trợ dùng chung của nó nắm giữ tiêu thụ `ctx.get`; nếu không tổ hợp dịch vụ nào thì hành vi vốn có được giữ nguyên. Sub agent ngoài tiến trình vẫn dùng chính sách deployment của riêng mình, sub agent đang chạy không theo các chuyển đổi tiếp theo của cha.
