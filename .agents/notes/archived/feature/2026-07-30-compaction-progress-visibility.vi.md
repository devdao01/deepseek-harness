# Agent Note: Hiển thị tiến độ nén độc lập theo thời gian thực trong terminal

Status: implemented

Archived: 2026-08-04

[English](2026-07-30-compaction-progress-visibility.md) | 中文

## Vấn đề

Việc nén (compaction) thủ công độc lập chạy giữa các lượt, lúc này agent vẫn ở trạng thái rảnh rỗi. Do đó, trong lúc thao tác tóm tắt chạy chậm, chỉ báo giai đoạn lượt của TUI luôn hiển thị con trỏ `>` bình thường; khi thử thất bại, do không có checkpoint thay thế nào được ghi xuống, cũng không sinh ra dòng transcript nào. Hiển thị trạng thái đang chạy cần tái sử dụng chỉ báo trạng thái sẵn có, không được thiết lập thêm một nơi hiển thị trạng thái có animation thứ hai.

Sau khi tiến trình kết thúc, một `compact/start` không khớp cặp có thể còn sót lại trong log bền vững. Dấu hiệu không khớp này là bằng chứng khôi phục hữu ích, nhưng không thể chứng minh có công việc đang chạy trong tiến trình hiện tại; nếu phát lại nó như tiến độ, session sau khi khôi phục sẽ mãi hiển thị chỉ báo tiến độ giả.

## Quyết định

TUI dùng cặp đánh dấu `compact/start { turn: null }` độc lập theo thời gian thực khớp với `compact/end` tương ứng làm nguồn chân lý (source of truth) để hiển thị trạng thái nén đang diễn ra. Trạng thái `compacting` cục bộ trong module ghi lại thời điểm bắt đầu của đồng hồ render, và độc chiếm một timer animation. Dòng cố định phía trên prompt render `Context being compacted <elapsed>` dựa theo đồng hồ đó, chỉ báo trạng thái đang chạy dùng chung một ô hiện có render `⊙` theo cùng đường gradient sáng-tối và nhịp thở như ký tự giai đoạn lượt, cờ tiến độ terminal sẽ giữ hoạt động cho đến khi cặp đánh dấu đóng lại.

`runningPhaseGlyph` chịu trách nhiệm chọn giữa ký tự giai đoạn lượt, `⊙` và con trỏ rảnh rỗi. Ký tự giai đoạn lượt có ưu tiên cao hơn, vì cặp đánh dấu nén có đánh số nằm trong một lượt đang chạy, mà giai đoạn của lượt đó đã kích hoạt chỉ báo. Dòng cố định này nằm ngoài transcript, không có spinner, cũng không có thêm timer riêng; nội dung rỗng thì sẽ thu gọn. Trạng thái nén không thay đổi viền editor rảnh rỗi, gợi ý, hoặc huy hiệu steering, do đó trong thời gian dự phòng chấp nhận lượt cho việc nén độc lập, giao diện vẫn hiển thị rõ ràng rằng prompt đã được chấp nhận.

Trạng thái này chỉ phản ánh sự kiện thời gian thực. Việc mount và phát lại transcript không bao giờ quét lịch sử để tìm start không khớp; chỉ khi TUI đã mount quan sát được thông báo `session/event` mới bật nó lên. Việc chuyển trạng thái lượt sẽ giữ nguyên trạng thái này, còn việc dọn dẹp terminal sẽ xóa timer và cờ tiến độ của nó.

Khi nhận `compact/end`, TUI sẽ xóa trạng thái trước, rồi mới bắt đầu hiệu ứng mờ dần (fade out) cho ký tự bình thường. Sự kiện kết thúc mang `error` sẽ thêm cảnh báo `Compaction failed: <error>`. Việc hoàn thành thành công vẫn được thể hiện bằng dấu transcript của mục đã thay thế được ghi xuống; không cần thêm dòng đã kết thúc, cũng có thể suy ra thời lượng từ timestamp bắt đầu và kết thúc đã khớp cặp và được ghi bền vững.

Quyết định này chỉ thay thế một phần điều khoản trì hoãn liên quan đến tiến độ trong [quyết định về transcript terminal](../bug-fix/2026-07-29-human-transcript-append-origin.md) và [quyết định về transcript trình duyệt](../bug-fix/2026-07-30-web-transcript-log-ordered-projection.md): hiển thị tiến độ không yêu cầu đánh dấu mang thông tin quy mô, cũng không yêu cầu tái cấu trúc việc render mục thay thế. Cả hai ghi chú vẫn còn hiệu lực, và tiếp tục chịu trách nhiệm về việc chiếu (projection) transcript dựa trên nguồn gốc ghi thêm và đánh dấu checkpoint đã ghi xuống. [Quyết định về nén thủ công theo hàng đợi](2026-07-30-queued-manual-compaction.md) tiếp tục chịu trách nhiệm về thứ tự cặp đánh dấu, cơ chế khóa và việc phân loại đánh dấu không khớp đã lỗi thời.

## Các phương án từng được cân nhắc

**Theo phương án được khám phá trong PR (Pull Request) #669, thêm `progressLabel` cho `CommandDefinition` và một bộ điều khiển trạng thái TUI thứ hai.** Không được áp dụng: metadata lệnh không phải nguồn chân lý cho vòng đời nén, việc nén tự động không do lệnh thủ công khởi tạo, hai bộ điều khiển trạng thái cũng có thể đưa ra trạng thái không nhất quán cho cùng một chỉ báo.

**Theo phương án được khám phá trong PR #669, thêm `compacting` vào `TurnPhase`.** Không được áp dụng: việc nén độc lập theo thiết kế không có lượt, còn nén có đánh số đã có giai đoạn lượt đang chạy hiển thị được.

**Thêm một `TimingBucket` thứ năm.** Không được áp dụng: các nhóm tính giờ dùng để phân chia thời gian trong một bước model đang mở, và cung cấp dữ liệu cho footer transcript của bước đó. Việc nén độc lập không có chuyển đổi bước, nhóm mới sẽ thêm một cột nén vô nghĩa vào tổng của mỗi bước.

**Cho trạng thái chạy, mờ dần và nén dùng chung một timer.** Không được áp dụng: quá trình mờ dần độc chiếm một timer tự kết thúc, còn việc nén thời gian thực có vòng đời mở-đóng riêng. Timer dùng chung sẽ tái cấu trúc trạng thái máy animation đã được đánh giá, nhưng không loại bỏ được các timer đồng thời thực sự tồn tại.

**Quét log để tìm `compact/start` không khớp.** Không được áp dụng: đánh dấu không khớp lỗi thời từ vòng đời tiến trình trước là lịch sử bền vững được kỳ vọng. Chỉ thông báo thời gian thực mới có thể chứng minh tiến trình hiện tại đang thực hiện công việc.

**Dùng chỉ báo chạy lệnh chung.** Hành vi này không được áp dụng, vì cặp đánh dấu nén là nguồn chân lý chính xác hơn, và còn bao phủ cả đường không phải lệnh. Nếu tương lai triển khai chỉ báo lệnh chung, nó nên thuộc về vòng đời `command/run` và `command/done`.

**Thêm dòng nén có animation vào transcript.** Không được áp dụng: điều này sẽ thiết lập nơi hiển thị trạng thái animation thứ hai cho cùng một vòng đời. Chỉ báo một ô hiện có chịu trách nhiệm hiển thị trạng thái đang chạy, còn đánh dấu đã ghi xuống và cảnh báo thất bại chịu trách nhiệm cho trình bày transcript đã kết thúc.

**In thông báo thành công kèm thời lượng.** Không được áp dụng: mục đã thay thế được ghi xuống đã cung cấp đánh dấu hoàn thành rồi. Timestamp của cặp đánh dấu giữ lại thời lượng, có thể dùng cho cách trình bày tương lai nếu chứng minh được việc thêm dòng transcript mới là hợp lý.

## Hậu quả

Việc nén thủ công khi agent rảnh rỗi sẽ hiển thị thời gian đã dùng kèm tên phía trên prompt, thất bại sẽ trực tiếp sinh cảnh báo, và đánh dấu không khớp lỗi thời khi khôi phục session không bao giờ hiển thị như đang hoạt động. Chỉ báo con trỏ giữ độ rộng một ô ký tự terminal, còn dòng trạng thái và chỉ báo dùng chung animation trạng thái, bảng màu ngữ nghĩa và vòng đời tiến độ terminal sẵn có.

Trạng thái thời gian thực và timer của nó là trạng thái cục bộ theo tiến trình bổ sung, được dọn dẹp trong cả hai trường hợp cặp đánh dấu đóng lại và TUI dọn dẹp. Theo thiết kế, trạng thái hiển thị này không thể tái tạo: lịch sử bền vững cung cấp đánh dấu thành công và sự thật về thời gian, chỉ quan sát của tiến trình hiện tại mới có thể cung cấp trạng thái đang chạy.

Test TUI cấp package cố định các hành vi sau: sự kiện bắt đầu độc lập, làm mới thời gian đã dùng, hiển thị chỉ báo đơn, loại trừ sự kiện bắt đầu có đánh số, mờ dần, cảnh báo thất bại, giữ trạng thái rảnh rỗi, ưu tiên lượt đang chạy, khôi phục khi có đánh dấu không khớp, và giải phóng timer. Kịch bản TUI sản phẩm đã bị loại bỏ trước đây từng quan sát `Context being compacted 1.0s` và `dsh ⊙` trong lúc ranh giới tóm tắt thực tế còn mở; các triển khai terminal tương lai chịu trách nhiệm cho việc lắp ráp này.
