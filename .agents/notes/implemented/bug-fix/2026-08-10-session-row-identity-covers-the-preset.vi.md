# Agent Note: Phán đoán định danh của dòng phiên bao phủ cả preset

Status: implemented

[English](2026-08-10-session-row-identity-covers-the-preset.md) | 中文

## Vấn đề

`SessionManager.buildListSnapshot` memoize (ghi nhớ) các dòng danh sách theo giá trị: mỗi lần refresh wire sẽ đúc ra object summary hoàn toàn mới, nên dòng nào bằng với mục đã cache sẽ được thay bằng chính instance đã cache, để mỗi memo `SessionListItem` ở downstream có thể tiếp tục hit cache. Quy ước nó tuyên bố là "mọi trường giống nhau thì tái dùng object đã cache", nhưng phép so sánh đó được liệt kê trường thủ công, và trong đó thiếu `agentPreset`.

Một lần chuyển preset đã được xác nhận lại đúng chỉ dịch chuyển đúng một trường này. `noteAgentPreset` upsert nó vào, `applyMutation` gộp nó — việc gộp này cố ý không dùng `updatedAt` của mutation, nên dòng sau khi chuyển và bản sinh đôi đã cache của nó chỉ khác nhau ở preset, còn lại đều giống nhau. Vì vậy phán đoán định danh cho rằng dòng này không đổi, vĩnh viễn cung cấp instance đã lỗi thời: summary của chính manager là `minimal`, còn mọi bên đọc snapshot đã chiếu tiếp tục đọc thấy `standard`.

Chip trên hero chính là một trong các bên đọc đó, và nó so sánh lựa chọn này với dòng đó trước khi phát ra bất kỳ request nào. Chuyển ngược lại đúng preset lúc phiên được tạo, đối với nó trông như "đã ở preset này rồi", nên nó bỏ qua giai đoạn (stage), hoàn toàn không gửi RPC — nhãn của chip đã đổi, nhưng thành phần cấu tạo thì không. Một phiên có thể chuyển khỏi preset lúc tạo đúng một lần, rồi không bao giờ chuyển lại được nữa.

## Quyết định

Phán đoán định danh so sánh `agentPreset` cùng với các trường summary còn lại, đây vốn dĩ chính là điều "mọi trường giống nhau" đã tuyên bố. Mọi thứ khác giữ nguyên: memoization, việc gộp, kiểm tra no-op của chip — mỗi thứ đều đúng — miễn là dòng chúng đọc được là đúng.

## Các phương án thay thế đã cân nhắc

**Cho chip đọc trực tiếp từ host, thay vì đọc dòng danh sách.** Cách này né được dòng lỗi thời, nhưng nhãn ở header phiên cũng dựa theo đúng dòng đó, trạng thái lỗi thời sẽ còn tồn tại ở đúng chỗ dễ thấy nhất trên giao diện; và trong tương lai bất kỳ bên đọc `SessionSummary.agentPreset` nào cũng sẽ kế thừa đúng cái bẫy đó.

**Bỏ hẳn việc memoize định danh dòng, dựng lại dòng ở mỗi snapshot.** Cách này loại bỏ toàn bộ lớp lỗi "thiếu trường", nhưng cái giá phải trả chính là lý do memo này tồn tại: mỗi lần refresh wire sẽ đúc object mới cho mỗi dòng, nên mỗi lần refresh sẽ phải render lại toàn bộ danh sách phiên.

**Đổi sang so sánh có cấu trúc, thay vì liệt kê từng trường.** Không thể thêm bừa một phép so sánh sâu tổng quát: dòng này mang `projectionValues`, mà chính định danh tham chiếu của nó là tín hiệu cố ý cho biết "projection store vừa publish lại"; gộp nó vào so sánh theo giá trị thì hoặc mỗi tick projection đều render lại, hoặc che mất một thay đổi thực sự.

## Hệ quả

Mỗi trường mà dòng phiên mang theo giờ đây đều tham gia vào định danh dòng, nên giao diện đọc `SessionSummary.agentPreset` sẽ thấy việc chuyển ngay sau khi host xác nhận, bao gồm cả nhãn ở header phiên. Phán đoán này vẫn là liệt kê thủ công, nên khi thêm trường mới vào `SessionSummary` trong tương lai phải đồng bộ thêm vào đây; test projection của `sessions-service` đã chỉ rõ hình thái lỗi cho trường tiếp theo kiểu này, chứ không chỉ chốt riêng lần này.

## Kiểm thử

`sessions-service.spec.ts` truyền vào một dòng trống, ghi lại một lần chuyển, và khẳng định snapshot projection báo cáo preset mới — theo phán đoán cũ nó sẽ fail, vì dòng này không đổi ở bất kỳ đâu khác. `agent-preset-selection` web e2e chuyển xuống rồi chuyển lên, khẳng định host chấp nhận lần chuyển thứ hai, danh mục `/` quay lại theo; nếu không có bản sửa này, lần chuyển thứ hai sẽ không bao giờ đến được host.

## Liên quan

Cùng một e2e đó cũng bao phủ [bản sửa việc invalidation danh mục](2026-08-10-slash-catalog-follows-preset-switch.md) — chính nó khiến menu theo kịp bất kỳ chiều chuyển nào sau khi việc chuyển thực sự đã áp dụng.
