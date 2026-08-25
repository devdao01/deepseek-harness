# Agent Note: Bong bóng user loại bỏ thao tác branch

Status: implemented

[English](2026-08-06-user-bubbles-drop-the-branch-action.md) | Tiếng Việt

## Vấn đề

Mỗi bong bóng user và bong bóng steering (dẫn hướng giữa chừng) đã được tiêu thụ đều render control branch, chịu sự kiểm soát của [quyết định về đuôi lượt đã hoàn tất](../bug-fix/2026-08-02-message-fork-actions-require-completed-turn-tail.md). Trên các bong bóng này, cổng kiểm soát đó trên thực tế là vĩnh viễn: thông điệp user mở lượt luôn theo sau bởi các node của chính lượt đó, thông điệp steering đã tiêu thụ theo cấu trúc luôn nằm giữa lượt, do đó control chỉ có thể bật khi lượt kết thúc mà không có node nào sau thông điệp đó — tức là bị hủy trước cả sự kiện model đầu tiên. Người đọc vì vậy thấy một control không bao giờ bật, mà tooltip lại hứa hẹn một trạng thái mà nút này không bao giờ đạt tới. Điểm vào thao tác này còn gây hiểu lầm: fork tại seq của thông điệp sẽ cắt tại `turn/end` của lượt chứa nó, do đó "phân nhánh tại thông điệp của tôi" thực chất sẽ mang theo cả câu trả lời phía dưới, trái ngược hẳn với kỳ vọng trực giác "phân nhánh để hỏi lại" khi thấy nút branch trên chính bong bóng của mình.

## Quyết định

Bong bóng user và steering không còn render thao tác branch. `MessageItem` loại bỏ các prop fork của nó, `PendingSteeringBubble` loại bỏ trường hợp đặc biệt `showBranch`, `messageBranchSeqs` được thu hẹp thành `assistantBranchSeqs`: chỉ đuôi transcript (bản ghi văn bản) của một lượt đã hoàn tất, và đuôi đó là node assistant có nội dung text thuộc chính lượt đó, mới có thể fork. Điểm vào branch chỉ tồn tại bên dưới các câu trả lời đã chốt (finalized).

Điểm fork của các lượt có steer vẫn giữ nguyên: fork là việc cắt tiền tố log tại `turn/end`, còn steer là lịch sử hiển thị cho model mà sub-session bắt buộc phải kế thừa, do đó câu trả lời đã chốt của một lượt từng được steer vẫn có thể fork giống như bất kỳ lượt nào khác. Cổng kiểm soát phía assistant cùng cách hiển thị "thấy được nhưng không dùng được" của nó cũng giữ nguyên — bên dưới câu trả lời, trạng thái không dùng được là một trạng thái ngắn ngủi nhưng có thể đạt tới (khi đuôi hiện tại đang bị chiếm bởi dòng công cụ hoặc dòng lỗi tiếp theo), và đây chính là nơi tooltip phát huy tác dụng.

## Các phương án thay thế đã cân nhắc

**Chỉ ẩn control trên bong bóng thông điệp khi nó không dùng được.** Từ chối: cách này giữ lại kịch bản bật gần như không thể đạt tới, đổi lại icon chỉ xuất hiện trên bong bóng của chính mình khi lượt bị hủy trước khi tạo ra bất cứ thứ gì — sự thiếu nhất quán này không xứng đáng để phục vụ cho kịch bản đó.

**Giữ control ở trạng thái thấy được nhưng không dùng được (như hiện trạng).** Từ chối: [quyết định về đuôi lượt đã hoàn tất](../bug-fix/2026-08-02-message-fork-actions-require-completed-turn-tail.md) chọn cách hiển thị để tooltip giải thích một ranh giới mà người đọc có thể chạm tới; trên bong bóng user và steering, ranh giới này trên thực tế không thể chạm tới, và văn bản giải thích chỉ đang vá cho một control lẽ ra không nên tồn tại ở đây.

**Áp dụng ngữ nghĩa branch cắt trước thông điệp trên bong bóng user.** Không nằm trong phạm vi lần này: việc hỏi lại từ chính prompt của mình đòi hỏi cắt trước thông điệp và điền sẵn ô nhập liệu, đó là một thao tác Host khác. Việc loại bỏ control hiện tại vừa vặn để lại chỗ cho tính năng như vậy, thay vì để một control có ngữ nghĩa trái ngược chiếm chỗ đó.

## Hệ quả

Điểm vào fork duy nhất là control branch được bật bên dưới câu trả lời đã chốt. Bất kỳ lượt nào bị hủy trước khi có node nào theo sau thông điệp của nó đều mất đi điểm vào duy nhất này, từ đó không còn điểm fork nào, giống như các lượt có đuôi là node interrupted không nội dung. Golden aria của `apps/web` loại bỏ toàn bộ dòng branch bị vô hiệu hóa trên bong bóng user cùng văn bản mô tả ẩn của nó. Test package cố định: bong bóng user và steering không render control branch, lượt có steering là đuôi giữ control của node tường thuật (narrative) ở trạng thái không dùng được.
