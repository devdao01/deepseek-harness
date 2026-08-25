# Agent Note: Web composer stats detail and input-zone polish

Status: implemented
Archived: 2026-08-07

[English](2026-07-30-web-composer-stats-and-input-polish.md) | 中文

## Problem

Footer của Web editor trước đây hiển thị một chuỗi thống kê được nối lại (cache/tokens/turns/steps) trên một hàng stack độc lập, tách rời về mặt thị giác với thẻ input, và thiếu chi tiết phân tách thời lượng và token trong bản thiết kế. Bản thân vùng input cũng tích lũy các bản vá khoảng cách theo từng mục: các dải dock đều có margin riêng, dưới ghế sticky là phần fill màu đặc cắt cứng luồng message, control "quay lại cuối" dùng offset hardcode để né editor và mất tác dụng khi draft dài lên, màu nền và độ rộng cột của dải goal và todo cũng không nhất quán với nhau.

## Decision

**Hàng thống kê được render vào cột chiều rộng của InputBar qua prop `footer` mới do owner cấp, và mở rộng thành hàng chi tiết theo nhóm của bản thiết kế; composer stack có nhịp điệu 6px duy nhất; ghế mờ dần vào luồng message với gradient gắn 36px cố định; control "quay lại cuối" bám theo `--dsh-composer-height` thời gian thực; goal, todo và queue dùng chung một cột fill tip 752px.**

- Mục `'conversation.composer.dock'` đến qua ghế `ComposerBarOwnerProps.footer`, render bên dưới thẻ, bên trong `.root` của bar, nên hàng thống kê và thẻ chia sẻ cùng ràng buộc chiều rộng. `StatsLine` hoàn toàn được suy diễn phía client từ snapshot: turns/steps, thời gian thực (wall-clock) LLM được quy đổi từ `timing` của assistant (`completedTime - stepStartTime`), thời gian thực của tool được quy đổi từ ghép cặp `time - callTime` của tool-result, phân tách token prompt/output có gộp cache-read vào phía input, và tỷ lệ cache hit. Các nhóm được ngăn cách bằng dấu gạch đứng, cả nhóm biến mất khi không có dữ liệu; `formatTokens` (517 / 12.2K / 1.2M) và `formatDuration` (45.2s / 2m42s) được export cho test. Thời lượng chỉ bao phủ các node trong window — giới hạn này được README ghi lại.
- `.composerStack` áp dụng khoảng cách 6px từ ma trận tổ hợp Figma. Goal và Todo giữ nguyên là thẻ độc lập; mục Queue ở cuối trừ đi khoảng cách này và một lượng chồng lấp layout 5px có tên riêng, để thẻ composer render sau chỉ phủ lên cạnh Queue. [Quyết định thứ tự stack ngữ cảnh composer](../bug-fix/2026-07-30-composer-context-stack-order.md) quy định thứ tự và ràng buộc chồng lấp.
- Nền của ghế sticky là `linear-gradient` từ `color-mix(bg-base 0%, transparent)` tại vị trí 0px đến `bg-base` đặc tại 36px — đây là node theo pixel chứ không phải theo phần trăm từ export figma, draft dài lên chỉ mở rộng vùng màu đặc; `color-mix` giúp cả hai theme đều mờ dần từ màu nền riêng của mình.
- ref `useCallback` trên ghế gắn ResizeObserver, phát hành `--dsh-composer-height` lên scroll body; ghế "quay lại cuối" của ChatView tính `bottom` dựa vào đó (fallback frame đầu là 152px), thay cho 168px hardcode trước đây.
- giới hạn dưới 52px hai dòng của textarea chỉ giữ lại ở biến thể hero; editor ở trạng thái dock thu gọn theo chiều cao nội dung. Panel Goal, Todo và Queue thống nhất dùng cột với margin 44px/giới hạn trên 752px, và dùng fill `tip` với border l1; thẻ Goal độc lập và thẻ Todo sau khi thu gọn có chiều cao lần lượt là 36px và 44px.

## Alternatives considered

**Node gradient theo phần trăm (24% từ export figma).** Từ chối: node co giãn theo chiều cao ghế, draft dài sẽ kéo dài dải chuyển tiếp chiếm phần lớn luồng message; dải chuyển tiếp 36px cố định tương đương 24% của bản thiết kế ở editor tĩnh ~150px, và giữ nguyên khi editor dài lên.

**Ràng buộc "mục dưới cùng dính vào thẻ" mang tính chung.** Không áp dụng, vì Goal và Todo dù trở thành mục dock cuối cùng hiển thị, vẫn là thẻ độc lập. Queue có duy nhất một chỗ chồng lấp composer có chủ đích, còn stack có khoảng cách và lượng chồng lấp dùng chung.

**Để backend cung cấp trường thời lượng cho hàng thống kê.** Không cần thiết: `timing` của assistant và ghép cặp call/result của tool đã đến snapshot sẵn, thời gian thực có thể quy đổi phía client, không cần session event mới hay host projection.

**Giữ hàng thống kê là node anh em của composer stack.** Từ chối: là hàng stack thì nó mang ràng buộc chiều rộng độc lập, trôi dạt khỏi thẻ; là `footer` của bar, cả hai chia sẻ cùng một cột, hàng thống kê cũng tự nhiên rơi vào vùng sticky/gradient của ghế.

## Consequences

Hàng thống kê giờ đây cho phép đọc ngay turns/steps, thời lượng LLM và tool, cache hit và token input/output, với cái giá là thời lượng chỉ bao phủ window sự kiện đã tải (giới hạn đã biết trong README). Thứ tự cố định của stack tách các thẻ ngữ cảnh độc lập ra khỏi nhau, và khiến Queue là panel duy nhất tiếp giáp composer; khi thêm mục dock mới trong tương lai, phải chọn thứ tự của nó so với các vai trò này. Dải chuyển tiếp luôn là 36px, thay đổi thiết kế trong tương lai chỉ cần sửa một giá trị node. `chat-stats-bash-sample.spec.tsx` chốt phần suy diễn (timing/quy đổi tool, phân tách token), hai bộ định dạng, render theo nhóm, và tiêu chí không re-render nào trong lúc streaming.
