# Agent Note: ranh giới log kết thúc seed

Status: implemented

[English](2026-07-30-session-end-seed-log-boundary.md) | 中文

## Vấn đề

Plugin nào có cặp dấu ngoặc mở/đóng độc lập trong log phiên đều không thể phân biệt một dấu đã chết với một dấu còn sống. `compaction/start` … `compaction/end` chính là ví dụ đã công bố: khi tiếp quản một log, mà sự kiện compaction (nén) cuối cùng của nó là một `compaction/start` chưa được ghép cặp, thì "bên ghi trước đó đã chết giữa chừng lúc nén" và "hiện đang có một lần nén đang chạy" là hai điều giống hệt nhau về mặt byte trong lịch sử lưu trữ. Bên sở hữu cặp ngoặc này chỉ có thể chọn một trong hai: từ chối nén một log thực ra đang rảnh (làm phiên bị kẹt), hoặc tiếp tục nén trên một log thực sự đang bận.

Không có gì trong log đánh dấu lịch sử kế thừa kết thúc ở đâu. `session/created`, `session/disposed` và `session/flush` là tín hiệu runtime của Cordis, không phải sự kiện log; `agent/session-start` chỉ phát ra chứ không ghi xuống đĩa. `Session.firstLiveSeq` vốn đã nắm chính xác câu trả lời này — seq của lần ghi tự thân đầu tiên trong vòng đời hiện tại — nhưng nó chỉ tồn tại trong bộ nhớ, nên bên tiêu thụ chỉ đọc byte lưu trữ sẽ không thấy được nó.

Việc sửa lỗi crash không lấp được khoảng trống này, và cũng không nên lấp: `interruptedTurnClosers` tổng hợp ranh giới turn, step và tool vì core sở hữu bộ từ vựng đó; còn `compaction/*` thuộc về seam của compaction. Một luồng sửa lỗi ở core mà lại đóng dấu ngoặc của plugin sẽ khiến ngữ nghĩa dấu ngoặc của từng plugin bị chuyển hết vào core.

## Quyết định

Constructor của `Session` ghi thêm sự kiện chỉ-vào-log `session/end-seed` ngay sau seed khởi tạo được truyền tường minh (kể cả seed rỗng), như lần ghi tự thân đầu tiên của một phiên có seed, tại đúng seq mà `firstLiveSeq` chỉ ra. Sự kiện này là bản chiếu bền vững của trường đó: `firstLiveSeq` trả lời cho bên tiêu thụ đang giữ object câu hỏi "lần ghi của vòng đời hiện tại bắt đầu từ đâu", còn `session/end-seed` trả lời cùng câu hỏi đó cho bên tiêu thụ chỉ giữ byte lưu trữ. Payload của nó rỗng — vị trí và `time` mang toàn bộ ý nghĩa — và nó không phải `SurfaceEventType`, nên không sinh ra message, cũng không làm nhiễu lịch sử dẫn xuất. Dấu mốc seq-0 này phân biệt một phiên được khôi phục từ log rỗng với một phiên hoàn toàn mới, nhờ đó ngăn việc áp dụng giá trị mặc định của phiên mới trong lúc khôi phục.

Bên sở hữu cặp ngoặc đọc nó theo vị trí: một dấu mở chưa ghép cặp đứng trước `session/end-seed` sẽ có seq nhỏ hơn, đến từ seed khởi tạo, và thuộc về một vòng đời đã kết thúc. Core ghi ranh giới này nhưng không đọc bất cứ gì từ nó; bộ từ vựng của mỗi cặp ngoặc vẫn thuộc plugin sở hữu nó, nên core sẽ không công bố hàm hỗ trợ vị từ (predicate helper) trước khi có bên tiêu thụ định hình nó.

Chọn constructor vì đó là điểm thu hẹp duy nhất mà mọi phiên có seed đều phải đi qua. Cả sáu điểm vào đều tới đó: `agents.resume()`, khởi động theo cấu hình trên id đã bền vững hóa (`restoreOrCreateConfigured`), `sessions.fork()`, phiên con fork của subagent, đường dẫn tiền tố thời gian thực của `coordinator.adopt()`, và `sessions.create(id, {seed})` trần. Ranh giới ghi tại thời điểm nạp bền vững sẽ bỏ sót hai đường fork — và một phiên con fork kế thừa `compaction/start` còn mở của phiên cha vẫn đang chạy chính là trường hợp phải xác định được. Ranh giới ghi tại thời điểm loop khởi động sẽ bỏ sót `fork()` và `adopt()`, và buộc phải kích hoạt trên `SessionStartSource: 'startup'` — đúng là giá trị mà phiên con fork công bố, khiến trường này mất khả năng phân biệt.

Hai lớp bảo vệ giữ cho dấu mốc này chính xác. Khi bỏ qua seed thì không ghi gì cả, vì đó là phiên hoàn toàn mới. Khi bản thân seed đã kết thúc bằng chính sự kiện này thì không đánh dấu lặp lại, giúp việc ghi có tính idempotent. Idempotency ở đây là yêu cầu chịu tải, không phải để cho gọn: mỗi lần tiếp quản phiên nguội gắn với Agent đều đi qua `agentFor()`; nếu không có lớp bảo vệ này, các thao tác điều khiển lặp lại dù không làm gì cũng sẽ khiến log phình to. Các đường dẫn nguồn chỉ-kiểm-tra như `session.history` và `session.fork` sẽ không tạo ranh giới này trong phiên nguồn.

## Không cần thay đổi gì ở tầng bền vững

Lệnh append trong constructor xảy ra trước `enter()`, nên phiên chưa gắn store: dấu mốc này không được công bố trên `session/event`, y hệt các sự kiện seed đứng trước nó. Nó thuộc về seed khởi tạo mà `initFor` bắt lại, và được ghi xuống đĩa qua đường seed thông thường — `createCore` + `appendCore` của `onCreated`, hoặc lần ghi hậu tố không có chủ nhận (unowned suffix write). Vì vậy bên tiêu thụ theo dõi firehose sẽ không bao giờ thấy ranh giới này, mà phải đọc nó từ log.

Tác động lên seam: `load()` vẫn là đọc thuần túy, không tăng revision, không đi qua `commitRepair` với log cân bằng, và một `append` bị từ chối cũng không để lại dấu bền vững. Nhưng **tiếp quản không phải là đọc thuần túy** — giờ đây một lần tiếp quản sẽ tạo ra ghi trên đường dẫn trước đây hoàn toàn không ghi gì, nên store chỉ đọc hoặc đĩa đầy sẽ báo lỗi tại `session/created`, thay vì tại turn thật đầu tiên. Đây là chi phí duy nhất mà cách đặt vị trí này thêm vào, và hẹp hơn so với phương án đặt tại đường tải (khiến chính việc tải thất bại).

Nếu crash xảy ra trước khi việc ghi seed đến được đĩa, ranh giới sẽ mất, và điều đó không tốn chi phí gì: các lô đang chờ (pending batch) được ghi theo thứ tự, nên mất một ranh giới nghĩa là mọi sự kiện sau nó cũng mất theo. Lần tiếp quản tiếp theo đọc cùng byte như lần trước, sẽ tự ghi ranh giới của chính nó, và đưa ra đúng cùng phán quyết cho các cặp ngoặc. Bên tiêu thụ trong tiến trình nên ưu tiên dùng `firstLiveSeq`, vốn đã chính xác trước bất kỳ lần ghi nào.

## Phạm vi áp dụng của bảo đảm

Vị từ này chỉ đúng với cặp ngoặc được kế thừa của *chính* phiên này, không phải tín hiệu sống của các bên ghi khác. Một phiên đang chạy đồng thời có thể giữ cặp ngoặc mở trên cùng đoạn lịch sử lưu trữ, còn ranh giới của riêng nó nằm ở chỗ khác. Bên tiêu thụ nào buộc phải chịu được các bên ghi đồng thời sẽ cần tín hiệu sống ngoài log, không thể chỉ dựa vào sự kiện này mà bỏ qua nó.

## Phương án khác đã cân nhắc

**Để bộ điều phối bền vững ghi ranh giới trên đường nạp nguội.** Một phiên bản trước đó ghi ranh giới `session/resumed`; nó bị loại bỏ, một phần vì hoàn toàn không phủ được fork — mà fork chính là trường hợp bên sở hữu cặp ngoặc được kế thừa vẫn có thể còn sống — phần khác vì dấu mốc được đúc tại thời điểm tải phải ghi bền vững ngay trên đường đọc, khiến chi phí trải rộng ra toàn seam: mỗi lần tải nguội tăng revision, đi qua `commitRepair` ngay cả với log cân bằng không cần sửa, cần một mốc thời gian lưu trữ dưới để giữ tính đơn điệu của kẹp (clamp), và việc tải sẽ thất bại trên store chỉ đọc.

**Ghi thêm ranh giới khi loop khởi động.** loop gọi `resumeWith`, nên phủ được đường khôi phục, nhưng bỏ sót hoàn toàn `fork()` và `adopt()`, và sự kiện buộc phải kích hoạt trên `'startup'` — đúng là nguồn mà phiên con fork công bố — khiến `SessionStartSource` mất khả năng phân biệt. Nó còn công bố phiên trước khi ghi dấu mốc, nên bên theo dõi `session/created` có thể quan sát một log có seed mà chưa có ranh giới.

**Tái dùng `header.seedLength`.** Đây là ranh giới *huyết thống fork* bền vững, và có chủ đích giữ nguyên giá trị fork gốc khi khôi phục — trong khi khi khôi phục, seed khởi tạo chính là toàn bộ log lưu trữ. Hai sự thật này không giống nhau, gộp chúng lại sẽ đánh mất cả hai.

**Để việc sửa lỗi crash đóng luôn `compaction/*` cùng với ranh giới turn.** Bị bác bỏ: điều này sẽ chuyển ngữ nghĩa dấu ngoặc của từng plugin vào luồng sửa lỗi ở core, mà core không thể biết đóng dấu ngoặc của một gói khác cần ghi lại điều gì.

## Hệ quả

Cái đạt được: một ranh giới, ghi ở một chỗ, đúng cho cả sáu đường khởi động có seed — kể cả khoảng trống fork mà phương án tầng bền vững không chạm tới được. Các gói bền vững giữ nguyên đường đọc thuần túy. `firstLiveSeq` có được một bản song sinh bền vững, thay vì một khái niệm cạnh tranh thứ hai về cùng ranh giới.

Cái phải trả: log của phiên có seed dài thêm một sự kiện, kể cả khi khôi phục từ log rỗng. Kỳ vọng seq sẽ dịch chuyển theo ranh giới này. Có hai chỗ cập nhật mang tính chịu tải chứ không chỉ máy móc: test tiếp quản của telemetry khẳng định ranh giới này *sẽ* được xuất ra, vì nó là lần ghi tự thân của vòng đời hiện tại; còn bất biến phát lại của bộ test property thì là "seed tái hiện đúng từng byte, cộng thêm một ranh giới chỉ-vào-log", và coi idempotency là một thuộc tính riêng.

`session/end-seed` được thêm vào bộ từ vựng ghi xuống đĩa. Theo lập trường tiền phát hành (`SESSION_FORMAT_VERSION` cố định ở `0`, không cam kết tương thích), log cũ hơn đơn giản là không có nó, và một log không có ranh giới này sẽ đúng đắn kết luận rằng không có gì thuộc về lịch sử seed khởi tạo.

[Quyết định nén thủ công xếp hàng](../feature/2026-07-30-queued-manual-compaction.md) hiện là bên tiêu thụ đầu tiên. Việc quét đuôi của nó tìm riêng biệt `compaction/start` chưa khớp và end-seed mới nhất, chỉ coi các start đứng sau ranh giới này là còn sống, và xóa trạng thái theo dõi bất biến trong cùng một lần chuyển đổi phát lại. Vị từ này vẫn nằm trong gói chứa tính năng compaction, không trở thành hàm hỗ trợ chung của core.
